import type {
  AppSettings,
  ChatMessage,
  CompactionStatus,
  KnowledgeGraphStatus,
  McpPreset,
  McpServerStatus,
  MemoryCategory,
  MemoryEntry,
  MessageAttachment,
  ProviderId,
  SessionSummary,
  SkillInfo,
  Workspace,
  WorkspaceFileEntry,
  WorkspaceFilePreview
} from './types'

/** Renderer -> Main, request/response (invoke/handle). */
export const IPC = {
  SESSIONS_LIST: 'sessions:list',
  SESSIONS_CREATE: 'sessions:create',
  SESSIONS_RENAME: 'sessions:rename',
  SESSIONS_DELETE: 'sessions:delete',
  SESSIONS_SET_WORKSPACE: 'sessions:set-workspace',
  SESSIONS_MESSAGES: 'sessions:messages',
  CHAT_SEND: 'chat:send',
  CHAT_CANCEL: 'chat:cancel',
  WORKSPACE_SELECT: 'workspace:select',
  WORKSPACE_LIST: 'workspace:list',
  ATTACHMENT_SELECT: 'attachment:select',
  ATTACHMENT_REGISTER_DROPPED: 'attachment:register-dropped',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  MCP_STATUS: 'mcp:status',
  MCP_PRESETS: 'mcp:presets',
  SKILLS_LIST: 'skills:list',
  SKILLS_SET_ENABLED: 'skills:set-enabled',
  SKILLS_OPEN_DIR: 'skills:open-dir',
  MEMORY_LIST: 'memory:list',
  MEMORY_ADD: 'memory:add',
  MEMORY_DELETE: 'memory:delete',
  MEMORY_CLEAR: 'memory:clear',
  PERMISSION_RESPOND: 'permission:respond',
  WORKSPACE_FILES_LIST: 'workspace-files:list',
  WORKSPACE_FILE_PREVIEW: 'workspace-files:preview',
  WORKSPACE_FILE_EXPORT: 'workspace-files:export',
  WORKSPACE_FILE_OPEN_EXTERNAL: 'workspace-files:open-external',
  WORKSPACE_FILE_SHOW_IN_FOLDER: 'workspace-files:show-in-folder',
  COMPACTION_STATUS: 'compaction:status',
  COMPACTION_RUN_NOW: 'compaction:run-now',
  KNOWLEDGE_GRAPH_STATUS: 'knowledge-graph:status',
  KNOWLEDGE_GRAPH_REBUILD: 'knowledge-graph:rebuild'
} as const

/** Main -> Renderer, fire-and-forget push channels. */
export const IPC_PUSH = {
  CHAT_STREAM_EVENT: 'chat:stream-event',
  MCP_STATUS_CHANGED: 'mcp:status-changed'
} as const

export interface IpcRequestMap {
  [IPC.SESSIONS_LIST]: undefined
  [IPC.SESSIONS_CREATE]: {
    workspaceId: string | null
    providerId: ProviderId
    model: string
    title?: string
  }
  [IPC.SESSIONS_RENAME]: { sessionId: string; title: string }
  [IPC.SESSIONS_DELETE]: { sessionId: string }
  [IPC.SESSIONS_SET_WORKSPACE]: { sessionId: string; workspaceId: string | null }
  [IPC.SESSIONS_MESSAGES]: { sessionId: string }
  [IPC.CHAT_SEND]: { sessionId: string; content: string; attachmentPaths?: string[] }
  [IPC.CHAT_CANCEL]: { sessionId: string }
  [IPC.WORKSPACE_SELECT]: undefined
  [IPC.WORKSPACE_LIST]: undefined
  [IPC.ATTACHMENT_SELECT]: undefined
  [IPC.ATTACHMENT_REGISTER_DROPPED]: { paths: string[] }
  [IPC.SETTINGS_GET]: undefined
  [IPC.SETTINGS_UPDATE]: { settings: AppSettings }
  [IPC.MCP_STATUS]: undefined
  [IPC.MCP_PRESETS]: undefined
  [IPC.SKILLS_LIST]: { workspaceRoot?: string }
  [IPC.SKILLS_SET_ENABLED]: { id: string; enabled: boolean; workspaceRoot?: string }
  [IPC.SKILLS_OPEN_DIR]: { scope: 'global' | 'project'; workspaceRoot?: string }
  [IPC.MEMORY_LIST]: { workspaceRoot?: string }
  [IPC.MEMORY_ADD]: { workspaceRoot: string; category: MemoryCategory; content: string }
  [IPC.MEMORY_DELETE]: { id: string }
  [IPC.MEMORY_CLEAR]: { workspaceRoot?: string }
  [IPC.PERMISSION_RESPOND]: { requestId: string; decision: 'allow' | 'deny' | 'allow_always' }
  [IPC.WORKSPACE_FILES_LIST]: { workspaceRoot: string; relativePath?: string }
  [IPC.WORKSPACE_FILE_PREVIEW]: { workspaceRoot: string; relativePath: string }
  [IPC.WORKSPACE_FILE_EXPORT]: { workspaceRoot: string; relativePath: string }
  [IPC.WORKSPACE_FILE_OPEN_EXTERNAL]: { workspaceRoot: string; relativePath: string }
  [IPC.WORKSPACE_FILE_SHOW_IN_FOLDER]: { workspaceRoot: string; relativePath: string }
  [IPC.COMPACTION_STATUS]: { sessionId: string }
  [IPC.COMPACTION_RUN_NOW]: { sessionId: string }
  [IPC.KNOWLEDGE_GRAPH_STATUS]: { workspaceRoot: string }
  [IPC.KNOWLEDGE_GRAPH_REBUILD]: { workspaceRoot: string }
}

export interface IpcResponseMap {
  [IPC.SESSIONS_LIST]: SessionSummary[]
  [IPC.SESSIONS_CREATE]: SessionSummary
  [IPC.SESSIONS_RENAME]: SessionSummary
  [IPC.SESSIONS_DELETE]: { id: string }
  [IPC.SESSIONS_SET_WORKSPACE]: SessionSummary
  [IPC.SESSIONS_MESSAGES]: ChatMessage[]
  [IPC.CHAT_SEND]: { accepted: true }
  [IPC.CHAT_CANCEL]: { cancelled: boolean }
  [IPC.WORKSPACE_SELECT]: Workspace | null
  [IPC.WORKSPACE_LIST]: Workspace[]
  [IPC.ATTACHMENT_SELECT]: MessageAttachment[]
  [IPC.ATTACHMENT_REGISTER_DROPPED]: {
    attachments: MessageAttachment[]
    skipped: { path: string; reason: string }[]
  }
  [IPC.SETTINGS_GET]: AppSettings
  [IPC.SETTINGS_UPDATE]: AppSettings
  [IPC.MCP_STATUS]: McpServerStatus[]
  [IPC.MCP_PRESETS]: McpPreset[]
  [IPC.SKILLS_LIST]: SkillInfo[]
  [IPC.SKILLS_SET_ENABLED]: SkillInfo[]
  [IPC.SKILLS_OPEN_DIR]: { opened: boolean }
  [IPC.MEMORY_LIST]: MemoryEntry[]
  [IPC.MEMORY_ADD]: MemoryEntry
  [IPC.MEMORY_DELETE]: { id: string }
  [IPC.MEMORY_CLEAR]: { cleared: number }
  [IPC.PERMISSION_RESPOND]: { ok: true }
  [IPC.WORKSPACE_FILES_LIST]: WorkspaceFileEntry[]
  [IPC.WORKSPACE_FILE_PREVIEW]: WorkspaceFilePreview
  [IPC.WORKSPACE_FILE_EXPORT]: { exported: boolean; path?: string }
  [IPC.WORKSPACE_FILE_OPEN_EXTERNAL]: { opened: boolean; error?: string }
  [IPC.WORKSPACE_FILE_SHOW_IN_FOLDER]: { opened: boolean }
  [IPC.COMPACTION_STATUS]: CompactionStatus
  [IPC.COMPACTION_RUN_NOW]: CompactionStatus
  [IPC.KNOWLEDGE_GRAPH_STATUS]: KnowledgeGraphStatus
  [IPC.KNOWLEDGE_GRAPH_REBUILD]: KnowledgeGraphStatus
}

export type IpcChannel = keyof IpcRequestMap
