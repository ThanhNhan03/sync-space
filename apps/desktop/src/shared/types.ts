export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type ProviderId = 'openai' | 'claude' | 'gemini' | 'openrouter'

export interface ToolCallRequest {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolCallResult {
  id: string
  name: string
  ok: boolean
  content: string
  isError?: boolean
}

export interface MessageAttachment {
  id: string
  name: string
  path: string
  mimeType?: string
  size?: number
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  /** Present on assistant messages that requested tool execution. */
  toolCalls?: ToolCallRequest[]
  /** Present on role: 'tool' messages, references the ToolCallRequest.id it answers. */
  toolCallId?: string
  attachments?: MessageAttachment[]
  createdAt: number
}

export interface Workspace {
  id: string
  name: string
  rootPath: string
  createdAt: number
}

export interface SessionSummary {
  id: string
  title: string
  workspaceId: string
  providerId: ProviderId
  model: string
  createdAt: number
  updatedAt: number
}

export interface ProviderConfig {
  providerId: ProviderId
  apiKey: string
  /** Override the provider's default API base URL (custom OpenAI-compatible endpoints, proxies). */
  baseUrl?: string
  model: string
  temperature?: number
}

export interface AppSettings {
  activeProviderId: ProviderId
  providers: Partial<Record<ProviderId, ProviderConfig>>
  theme: 'light' | 'dark' | 'system'
  activeWorkspaceId?: string
}

/**
 * Streaming events pushed from the Agent Runner (main process) to the renderer
 * over a single push channel. One session can have at most one in-flight run.
 */
export type AgentStreamEvent =
  | { type: 'thinking'; sessionId: string; active: boolean }
  | { type: 'token'; sessionId: string; messageId: string; delta: string }
  | { type: 'tool_call_start'; sessionId: string; toolCall: ToolCallRequest }
  | { type: 'tool_call_result'; sessionId: string; result: ToolCallResult }
  | { type: 'message_done'; sessionId: string; message: ChatMessage }
  | { type: 'run_done'; sessionId: string }
  | { type: 'error'; sessionId: string; message: string }
