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

/** Transport used to reach an MCP server. */
export type McpTransportType = 'stdio' | 'sse' | 'streamable-http'

/**
 * A user-configured MCP server. Crosses the IPC boundary (the Settings UI edits these),
 * so it lives in shared types. `env`/`headers` can carry secrets (API tokens) exactly as
 * provider API keys already do in ProviderConfig -- both are persisted in the same SQLite
 * settings row, never exposed beyond the preload bridge.
 */
export interface McpServerConfig {
  id: string
  name: string
  type: McpTransportType
  /** stdio: executable to spawn (e.g. "npx"). */
  command?: string
  /** stdio: arguments passed to the command. */
  args?: string[]
  /** stdio: extra environment variables for the spawned process. */
  env?: Record<string, string>
  /** stdio: working directory for the spawned process. */
  cwd?: string
  /** sse / streamable-http: server URL. */
  url?: string
  /** sse / streamable-http: HTTP headers (auth tokens etc.). */
  headers?: Record<string, string>
  enabled: boolean
}

export type McpConnectionState = 'connecting' | 'connected' | 'failed' | 'disabled'

/** Live status of a configured MCP server, surfaced to the Settings UI. */
export interface McpServerStatus {
  id: string
  name: string
  connected: boolean
  status: McpConnectionState
  toolCount: number
  /** Last connection/refresh error, if the server is in a failed state. */
  error?: string
}

/** A ready-to-use MCP server template the UI offers as a one-click "Add". */
export interface McpPreset {
  key: string
  name: string
  type: McpTransportType
  command?: string
  args?: string[]
  url?: string
  /** Env vars the user must fill in before the server will work (e.g. an API token). */
  requiredEnv?: string[]
  envDescription?: Record<string, string>
  description?: string
}

export interface AppSettings {
  activeProviderId: ProviderId
  providers: Partial<Record<ProviderId, ProviderConfig>>
  theme: 'light' | 'dark' | 'system'
  activeWorkspaceId?: string
  /** User-configured MCP servers whose tools are exposed to the agent. */
  mcpServers?: McpServerConfig[]
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
