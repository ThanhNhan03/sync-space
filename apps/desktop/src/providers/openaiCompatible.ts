import OpenAI from 'openai'

import type { ChatMessage, ProviderId, ToolCallRequest, ToolCallResult } from '@shared/types'
import type { ToolDefinition } from '@tools/Tool'

import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  StopReason,
  StreamChunk,
} from './LLMProvider'

/**
 * Shared implementation for LLMProvider backends that speak OpenAI's chat completions
 * wire format (OpenAI itself, and any OpenAI-compatible gateway such as OpenRouter).
 * Subclasses only need to construct the `openai` client with the right baseURL/auth
 * and declare their provider id.
 */
export abstract class OpenAICompatibleProvider implements LLMProvider {
  protected constructor(protected readonly options: { apiKey: string; baseUrl?: string }) {}

  abstract readonly id: ProviderId
  protected abstract readonly client: OpenAI

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    try {
      const messages = this.translateMessages(request.systemPrompt, request.messages)
      const tools = this.translateTools(request.tools)

      const completion = await this.client.chat.completions.create({
        model: request.model,
        temperature: request.temperature,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: true,
      })

      const pending = new Map<number, PendingToolCall>()

      for await (const chunk of completion) {
        const choice = chunk.choices[0]
        if (!choice) continue

        const delta = choice.delta

        if (delta?.content) {
          yield { type: 'token', delta: delta.content }
        }

        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index
            const existing = pending.get(index)
            if (existing) {
              if (toolCallDelta.id) existing.id = toolCallDelta.id
              if (toolCallDelta.function?.name) existing.name = toolCallDelta.function.name
              if (toolCallDelta.function?.arguments) {
                existing.arguments += toolCallDelta.function.arguments
              }
            } else {
              pending.set(index, {
                id: toolCallDelta.id ?? '',
                name: toolCallDelta.function?.name ?? '',
                arguments: toolCallDelta.function?.arguments ?? '',
              })
            }
          }
        }

        if (choice.finish_reason) {
          const orderedIndexes = Array.from(pending.keys()).sort((a, b) => a - b)
          for (const index of orderedIndexes) {
            const accumulated = pending.get(index)
            if (!accumulated) continue
            yield {
              type: 'tool_call',
              toolCall: {
                id: accumulated.id,
                name: accumulated.name,
                arguments: parseToolCallArguments(accumulated.arguments),
              },
            }
          }
          pending.clear()
          yield { type: 'done', stopReason: mapFinishReason(choice.finish_reason) }
        }
      }
    } catch (error) {
      yield { type: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const messages = this.translateMessages(request.systemPrompt, request.messages)
    const tools = this.translateTools(request.tools)

    const response = await this.client.chat.completions.create({
      model: request.model,
      temperature: request.temperature,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: false,
    })

    const choice = response.choices[0]
    const message = choice?.message

    const toolCalls: ToolCallRequest[] = (message?.tool_calls ?? []).map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: parseToolCallArguments(toolCall.function.arguments),
    }))

    return {
      content: message?.content ?? '',
      toolCalls,
      stopReason: mapFinishReason(choice?.finish_reason ?? 'stop'),
    }
  }

  toolCall(results: ToolCallResult[], sessionId: string): ChatMessage[] {
    return results.map((result) => ({
      id: crypto.randomUUID(),
      sessionId,
      role: 'tool',
      toolCallId: result.id,
      content: result.ok ? result.content : `Error: ${result.content}`,
      createdAt: Date.now(),
    }))
  }

  protected translateMessages(
    systemPrompt: string | undefined,
    messages: ChatMessage[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const translated: OpenAI.Chat.ChatCompletionMessageParam[] = []

    if (systemPrompt) {
      translated.push({ role: 'system', content: systemPrompt })
    }

    for (const message of messages) {
      translated.push(this.translateMessage(message))
    }

    return translated
  }

  private translateMessage(message: ChatMessage): OpenAI.Chat.ChatCompletionMessageParam {
    switch (message.role) {
      case 'system':
        return { role: 'system', content: message.content }
      case 'user':
        return { role: 'user', content: message.content }
      case 'tool':
        return {
          role: 'tool',
          tool_call_id: message.toolCallId ?? '',
          content: message.content,
        }
      case 'assistant': {
        if (message.toolCalls && message.toolCalls.length > 0) {
          return {
            role: 'assistant',
            content: message.content ? message.content : null,
            tool_calls: message.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              type: 'function' as const,
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
              },
            })),
          }
        }
        return { role: 'assistant', content: message.content }
      }
    }
  }

  protected translateTools(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      },
    }))
  }
}

interface PendingToolCall {
  id: string
  name: string
  arguments: string
}

function parseToolCallArguments(raw: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function mapFinishReason(reason: string): StopReason {
  switch (reason) {
    case 'stop':
      return 'stop'
    case 'tool_calls':
      return 'tool_calls'
    case 'length':
      return 'length'
    default:
      return 'stop'
  }
}
