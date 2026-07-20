export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type ProviderId = 'openai' | 'claude' | 'gemini' | 'openrouter' | 'minimax' | 'mimo'

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

/** A single tool exposed by an MCP server, as shown in the Settings UI. */
export interface McpToolInfo {
  /** The server's own tool name (e.g. "search"), friendlier than the model-facing name. */
  name: string
  description: string
}

/** Live status of a configured MCP server, surfaced to the Settings UI. */
export interface McpServerStatus {
  id: string
  name: string
  connected: boolean
  status: McpConnectionState
  toolCount: number
  /** Tools discovered from this server (empty until connected). */
  tools: McpToolInfo[]
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

/** Where a skill was discovered. Project skills override global, which override built-in. */
export type SkillSource = 'project' | 'global' | 'builtin'

/**
 * A discovered Agent Skill -- a folder with a SKILL.md (front-matter name/description + a
 * markdown body of instructions, plus optional bundled scripts). Its name+description are
 * shown to the agent; the full body is loaded on demand via the `use_skill` tool.
 */
export interface SkillInfo {
  /** Stable identifier; equals the skill name (unique after cross-source dedup). */
  id: string
  name: string
  description: string
  source: SkillSource
  /** Absolute path to the skill folder (where its bundled scripts live). */
  dir: string
  enabled: boolean
}

/** How a memory came to exist: auto-extracted, added by the agent's remember tool, or by the user. */
export type MemorySource = 'auto' | 'agent' | 'manual'

/** Rough kind of durable fact, used to group memories in the UI and guide extraction. */
export type MemoryCategory = 'identity' | 'preference' | 'project' | 'fact'

/**
 * A durable fact the agent has learned and should recall across sessions. Scoped to a
 * workspace by its root path; an empty workspaceRoot means the memory is global (applies
 * everywhere). Adapted from OpenCowork's "core memory" tier.
 */
export interface MemoryEntry {
  id: string
  /** Absolute workspace path this memory belongs to, or '' for a global memory. */
  workspaceRoot: string
  category: MemoryCategory
  content: string
  source: MemorySource
  /** The session that produced this memory, when known. */
  sessionId?: string
  createdAt: number
  updatedAt: number
}

/**
 * A user-defined, reusable sub-agent "persona". The orchestrator can delegate a task to one
 * by name via spawn_subagent; the child then runs with this agent's systemPrompt. Its name +
 * description are shown to the orchestrator so it knows when to use it.
 */
export interface AgentDefinition {
  id: string
  /** Short identifier the orchestrator passes to spawn_subagent (e.g. "researcher"). */
  name: string
  /** When to use this agent — shown to the orchestrating model. */
  description: string
  /** Specialized instructions the child agent runs under. */
  systemPrompt: string
  /**
   * Skill ids (== skill names) this agent may use. When set, only these skills are offered to
   * the agent; when omitted/empty, the agent inherits all enabled skills (unrestricted).
   */
  skillIds?: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Built-in agent personas available out of the box. Surfaced to the orchestrator (and shown in
 * the Agents settings tab) until the user customizes their agent list, at which point the edited
 * list is persisted in AppSettings.agents. Their skillIds are unset, so they inherit all skills.
 */
export const DEFAULT_AGENTS: AgentDefinition[] = [
  {
    id: 'agent-default-general',
    name: 'general-purpose',
    description:
      'General-purpose agent for multi-step tasks, research, and code changes. Use when no more specialized agent fits.',
    systemPrompt:
      'You are a capable general-purpose engineering agent. Work through the task methodically using your tools, verify your results, and return a clear, complete answer.',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'agent-default-researcher',
    name: 'researcher',
    description:
      'Investigates a question across the workspace (files, code, git) and reports findings. Read-only — does not modify files.',
    systemPrompt:
      'You are a meticulous researcher. Explore the workspace with read/search tools to answer the question, citing concrete file paths and line references. Do NOT modify any files. Return a concise, well-organized findings report.',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'agent-default-reviewer',
    name: 'code-reviewer',
    description:
      'Reviews a diff or set of files for bugs, edge cases, and quality issues, and reports actionable findings.',
    systemPrompt:
      'You are a senior code reviewer. Examine the relevant changes/files for correctness bugs, edge cases, security issues, and clarity. Report specific, actionable findings with file:line references, most important first. Do not make changes yourself unless explicitly asked.',
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 'agent-default-test-writer',
    name: 'test-writer',
    description: 'Writes or extends automated tests for given code, following the project’s existing test style.',
    systemPrompt:
      'You are a testing specialist. Study the code under test and the project’s existing test conventions, then write focused, meaningful tests covering the important behaviors and edge cases. Run the tests if a runner is available and report the outcome.',
    createdAt: 0,
    updatedAt: 0
  }
]

/** Global controls for the subagent feature. */
export interface SubagentSettings {
  enabled: boolean
  /** Maximum subagents running at once across the app. */
  maxConcurrent: number
  /** Default per-subagent wall-clock limit when the caller doesn't specify one. */
  defaultTimeoutSeconds: number
}

export const DEFAULT_SUBAGENT_SETTINGS: SubagentSettings = {
  enabled: true,
  maxConcurrent: 3,
  defaultTimeoutSeconds: 120
}

/** What to do when the agent tries to run a tool: run it, ask the user, or block it. */
export type PermissionAction = 'allow' | 'ask' | 'deny'

/**
 * A tool-permission rule. The first rule whose `tool` matches (case-insensitive) and whose
 * optional `pattern` (glob-ish, `*` = any substring) matches the stringified arguments decides
 * the action. Unmatched tools default to 'ask'. Adapted from OpenCowork's PermissionRule.
 */
export interface PermissionRule {
  tool: string
  pattern?: string
  action: PermissionAction
}

/**
 * Default policy: read-only/benign tools run automatically; anything that writes files, runs
 * shell commands, or spawns autonomous work asks first. Unlisted tools (including MCP tools)
 * fall through to 'ask'.
 */
export const DEFAULT_PERMISSION_RULES: PermissionRule[] = [
  { tool: 'read_file', action: 'allow' },
  { tool: 'list_directory', action: 'allow' },
  { tool: 'search_workspace', action: 'allow' },
  { tool: 'git_status', action: 'allow' },
  { tool: 'git_diff', action: 'allow' },
  { tool: 'use_skill', action: 'allow' },
  { tool: 'recall', action: 'allow' },
  { tool: 'remember', action: 'allow' },
  { tool: 'graph_search', action: 'allow' },
  { tool: 'graph_expand', action: 'allow' },
  { tool: 'write_file', action: 'ask' },
  { tool: 'create_file', action: 'ask' },
  { tool: 'delete_file', action: 'ask' },
  { tool: 'execute_terminal', action: 'ask' },
  { tool: 'spawn_subagent', action: 'ask' },
  // Screen control (computer use) — all ask by default; read-only screen reads included for clarity.
  { tool: 'screen_capture', action: 'ask' },
  { tool: 'screen_info', action: 'allow' },
  { tool: 'get_cursor_position', action: 'allow' },
  { tool: 'mouse_move', action: 'ask' },
  { tool: 'mouse_click', action: 'ask' },
  { tool: 'mouse_drag', action: 'ask' },
  { tool: 'scroll', action: 'ask' },
  { tool: 'type_text', action: 'ask' },
  { tool: 'key_press', action: 'ask' },
  { tool: 'locate_on_screen', action: 'ask' }
]

/** One entry in a workspace directory listing, as shown in the file explorer. */
export interface WorkspaceFileEntry {
  name: string
  /** Path relative to the workspace root, using forward slashes. */
  relativePath: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: number
}

/**
 * How a previewed file's content is shown. 'text' includes source code and markdown (the
 * renderer decides code-highlighting vs. rendered markdown from the extension); 'image' is
 * inlined as a data URI; 'pdf' and 'binary' carry no content -- the UI offers Export /
 * Open externally / Reveal in folder instead.
 */
export type WorkspaceFilePreviewKind = 'text' | 'image' | 'pdf' | 'binary'

export interface WorkspaceFilePreview {
  kind: WorkspaceFilePreviewKind
  name: string
  relativePath: string
  size: number
  /** UTF-8 text (kind 'text') or base64 (kind 'image'). Absent for 'pdf'/'binary'. */
  content?: string
  /** MIME type, set for images. */
  mimeType?: string
  /** True when content was cut off because the file exceeds the preview size cap. */
  truncated?: boolean
}

/** Global controls for conversation compaction (rolling summarization of older turns). */
export interface CompactionSettings {
  enabled: boolean
  /** Once the uncompacted tail exceeds this many characters, an older prefix is summarized. */
  thresholdChars: number
  /** How much of the tail (in characters) stays verbatim after a compaction pass. */
  keepRecentChars: number
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  thresholdChars: 60_000,
  keepRecentChars: 20_000
}

/** Whether/how much of a session's history has been folded into a rolling summary. */
export interface CompactionStatus {
  compacted: boolean
  summarizedMessageCount?: number
  updatedAt?: number
}

/** Whether a workspace's codebase knowledge graph has been built, and its rough size. */
export interface KnowledgeGraphStatus {
  indexed: boolean
  fileCount?: number
  nodeCount?: number
  edgeCount?: number
  /** True when the walk stopped early because the workspace exceeds the file-count cap. */
  truncated?: boolean
  builtAt?: number
}

/** Built-in tools shown in the Permissions settings tab, with friendly labels. */
export const PERMISSION_MANAGED_TOOLS: { name: string; label: string }[] = [
  { name: 'read_file', label: 'Read file' },
  { name: 'list_directory', label: 'List directory' },
  { name: 'search_workspace', label: 'Search workspace' },
  { name: 'git_status', label: 'Git status' },
  { name: 'git_diff', label: 'Git diff' },
  { name: 'use_skill', label: 'Use skill' },
  { name: 'recall', label: 'Recall memory' },
  { name: 'remember', label: 'Remember memory' },
  { name: 'graph_search', label: 'Search knowledge graph' },
  { name: 'graph_expand', label: 'Expand knowledge graph node' },
  { name: 'write_file', label: 'Write file' },
  { name: 'create_file', label: 'Create file' },
  { name: 'delete_file', label: 'Delete file' },
  { name: 'execute_terminal', label: 'Run terminal command' },
  { name: 'spawn_subagent', label: 'Spawn subagent' },
  { name: 'screen_capture', label: 'Capture screen' },
  { name: 'screen_info', label: 'Read screen size' },
  { name: 'get_cursor_position', label: 'Read cursor position' },
  { name: 'mouse_move', label: 'Move mouse' },
  { name: 'mouse_click', label: 'Click mouse' },
  { name: 'mouse_drag', label: 'Drag mouse' },
  { name: 'scroll', label: 'Scroll' },
  { name: 'type_text', label: 'Type text' },
  { name: 'key_press', label: 'Press keys' },
  { name: 'locate_on_screen', label: 'Locate element (vision)' }
]

export interface AppSettings {
  activeProviderId: ProviderId
  providers: Partial<Record<ProviderId, ProviderConfig>>
  theme: 'light' | 'dark' | 'system'
  activeWorkspaceId?: string
  /** Per-tool run/ask/block rules. When undefined, DEFAULT_PERMISSION_RULES apply. */
  permissionRules?: PermissionRule[]
  /** User-configured MCP servers whose tools are exposed to the agent. */
  mcpServers?: McpServerConfig[]
  /** Skill ids (== names) the user has turned off; all discovered skills are enabled by default. */
  disabledSkillIds?: string[]
  /**
   * Whether long-term memory is active. When true, relevant memories are injected into the
   * agent's prompt and new facts are auto-extracted after each run. Defaults to true.
   */
  memoryEnabled?: boolean
  /** User-defined reusable sub-agent personas the orchestrator can delegate to. */
  agents?: AgentDefinition[]
  /** Global subagent controls (enable, concurrency, default timeout). */
  subagentSettings?: SubagentSettings
  /**
   * Whether the agent may control the screen (capture + mouse/keyboard). Off by default because
   * it is invasive; when on, the individual screen tools are still gated by permission rules.
   * Windows-only.
   */
  screenControlEnabled?: boolean
  /** Global conversation-compaction controls (enable, threshold, keep-recent size). */
  compactionSettings?: CompactionSettings
}

/**
 * Streaming events pushed from the Agent Runner (main process) to the renderer
 * over a single push channel. One session can have at most one in-flight run.
 */
export type SubagentPhase = 'started' | 'tool' | 'completed' | 'failed'

export type AgentStreamEvent =
  | { type: 'thinking'; sessionId: string; active: boolean }
  /** A rolling conversation summary is being (re)computed; the UI should show it's busy. */
  | { type: 'compaction'; sessionId: string; active: boolean }
  | { type: 'token'; sessionId: string; messageId: string; delta: string }
  | { type: 'tool_call_start'; sessionId: string; toolCall: ToolCallRequest }
  | { type: 'tool_call_result'; sessionId: string; result: ToolCallResult }
  | { type: 'message_done'; sessionId: string; message: ChatMessage }
  | { type: 'run_done'; sessionId: string }
  | { type: 'error'; sessionId: string; message: string }
  /** The agent wants to run a tool that requires user approval; the UI must respond. */
  | {
      type: 'permission_request'
      sessionId: string
      requestId: string
      toolName: string
      arguments: Record<string, unknown>
    }
  /** Progress from a child agent spawned via spawn_subagent, surfaced live in the UI. */
  | {
      type: 'subagent_progress'
      sessionId: string
      subagentId: string
      phase: SubagentPhase
      task?: string
      toolName?: string
      error?: string
    }
