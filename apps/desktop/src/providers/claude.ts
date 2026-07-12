import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ProviderId, ToolCallRequest, ToolCallResult } from '@shared/types'
import type { ToolDefinition } from '@tools/Tool'
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  StopReason,
  StreamChunk
} from './LLMProvider'

/**
 * Anthropic's Messages API requires max_tokens on every request, but it isn't part of
 * our shared CompletionRequest contract -- hardcode a sensible default here instead of
 * touching the shared interface.
 */
const DEFAULT_MAX_TOKENS = 8192

/** Accumulator for a tool_use content block while its input JSON streams in. */
interface PendingToolUse {
  id: string
  name: string
  jsonBuf: string
}

export class ClaudeProvider implements LLMProvider {
  readonly id: ProviderId = 'claude'

  private readonly client: Anthropic

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl })
  }

  private buildTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.schema as unknown as Anthropic.Tool.InputSchema
    }))
  }

  /**
   * Translates our normalized ChatMessage[] history into Anthropic's messages array.
   * Only 'user' and 'assistant' roles are valid on the wire -- 'system' rows (if any
   * slip into history) are skipped since request.systemPrompt already carries that
   * content via the top-level `system` param. Consecutive 'tool' rows are merged into
   * a single user message with one tool_result block per row, since Anthropic requires
   * every tool_result answering one assistant turn's tool_use calls to arrive in a
   * single user message.
   */
  private buildMessages(history: ChatMessage[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = []
    let i = 0
    while (i < history.length) {
      const msg = history[i]
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content })
        i++
      } else if (msg.role === 'assistant') {
        // Note: `Anthropic.ContentBlockParam` is not re-exported on the top-level
        // Anthropic namespace in this SDK version -- use the explicit union of the
        // block-param types we actually construct instead.
        const content: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = []
        if (msg.content) {
          content.push({ type: 'text', text: msg.content })
        }
        for (const toolCall of msg.toolCalls ?? []) {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments
          })
        }
        result.push({ role: 'assistant', content })
        i++
      } else if (msg.role === 'tool') {
        const content: Anthropic.ToolResultBlockParam[] = []
        while (i < history.length && history[i].role === 'tool') {
          const toolMsg = history[i]
          content.push({
            type: 'tool_result',
            tool_use_id: toolMsg.toolCallId ?? '',
            content: toolMsg.content,
            // ChatMessage does not carry an isError flag for stored tool results, so
            // this is always false -- storage stays provider-agnostic per the shared
            // ChatMessage contract.
            is_error: false
          })
          i++
        }
        result.push({ role: 'user', content })
      } else {
        // role 'system' -- represented via the top-level `system` param, not here.
        i++
      }
    }
    return result
  }

  private mapStopReason(stopReason: string | null): StopReason {
    switch (stopReason) {
      case 'tool_use':
        return 'tool_calls'
      case 'max_tokens':
        return 'length'
      default:
        return 'stop'
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    try {
      const pendingToolUse = new Map<number, PendingToolUse>()

      const stream = this.client.messages.stream({
        model: request.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: request.systemPrompt,
        messages: this.buildMessages(request.messages),
        tools: this.buildTools(request.tools),
        temperature: request.temperature
      })

      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start': {
            if (event.content_block.type === 'tool_use') {
              pendingToolUse.set(event.index, {
                id: event.content_block.id,
                name: event.content_block.name,
                jsonBuf: ''
              })
            }
            break
          }
          case 'content_block_delta': {
            if (event.delta.type === 'text_delta') {
              yield { type: 'token', delta: event.delta.text }
            } else if (event.delta.type === 'input_json_delta') {
              const pending = pendingToolUse.get(event.index)
              if (pending) {
                pending.jsonBuf += event.delta.partial_json
              }
            }
            break
          }
          case 'content_block_stop': {
            const pending = pendingToolUse.get(event.index)
            if (pending) {
              let args: Record<string, unknown> = {}
              try {
                args = pending.jsonBuf
                  ? (JSON.parse(pending.jsonBuf) as Record<string, unknown>)
                  : {}
              } catch {
                args = {}
              }
              const toolCall: ToolCallRequest = { id: pending.id, name: pending.name, arguments: args }
              yield { type: 'tool_call', toolCall }
              pendingToolUse.delete(event.index)
            }
            break
          }
          case 'message_delta': {
            yield { type: 'done', stopReason: this.mapStopReason(event.delta.stop_reason) }
            break
          }
          default:
            break
        }
      }
    } catch (error) {
      yield { type: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const message = await this.client.messages.create({
      model: request.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: request.systemPrompt,
      messages: this.buildMessages(request.messages),
      tools: this.buildTools(request.tools),
      temperature: request.temperature
    })

    let content = ''
    const toolCalls: ToolCallRequest[] = []
    for (const block of message.content) {
      if (block.type === 'text') {
        content += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input ?? {}) as Record<string, unknown>
        })
      }
    }

    return {
      content,
      toolCalls,
      stopReason: this.mapStopReason(message.stop_reason)
    }
  }

  toolCall(results: ToolCallResult[], sessionId: string): ChatMessage[] {
    return results.map((result) => ({
      id: crypto.randomUUID(),
      sessionId,
      role: 'tool',
      toolCallId: result.id,
      content: result.content,
      createdAt: Date.now()
    }))
  }
}
