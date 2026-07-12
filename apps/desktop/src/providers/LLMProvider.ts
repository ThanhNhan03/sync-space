import type { ChatMessage, ProviderId, ToolCallRequest, ToolCallResult } from '@shared/types'
import type { ToolDefinition } from '@tools/Tool'

export interface CompletionRequest {
  model: string
  temperature?: number
  systemPrompt?: string
  messages: ChatMessage[]
  tools: ToolDefinition[]
}

export type StopReason = 'stop' | 'tool_calls' | 'length'

export type StreamChunk =
  | { type: 'token'; delta: string }
  | { type: 'tool_call'; toolCall: ToolCallRequest }
  | { type: 'done'; stopReason: StopReason }
  | { type: 'error'; message: string }

export interface CompletionResult {
  content: string
  toolCalls: ToolCallRequest[]
  stopReason: StopReason
}

/**
 * Provider-agnostic contract the Agent Runner drives the conversation loop through.
 * Concrete providers translate the shared ChatMessage[]/ToolDefinition[] shapes into
 * their own wire format internally -- the Agent Runner never branches on provider id.
 */
export interface LLMProvider {
  readonly id: ProviderId

  stream(request: CompletionRequest): AsyncGenerator<StreamChunk>

  complete(request: CompletionRequest): Promise<CompletionResult>

  /**
   * Formats one turn's worth of tool results into the ChatMessage(s) that should be
   * appended to history before continuing the loop. This is intentionally a provider
   * method rather than generic Agent Runner logic: Anthropic requires every tool_result
   * from a single assistant turn to be merged into one user message, while OpenAI/Gemini
   * expect one message per tool call. Providers that don't need batching just map 1:1.
   */
  toolCall(results: ToolCallResult[], sessionId: string): ChatMessage[]
}
