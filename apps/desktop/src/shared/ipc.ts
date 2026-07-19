import type {
  AppSettings,
  ChatMessage,
  McpPreset,
  McpServerStatus,
  MessageAttachment,
  ProviderId,
  SessionSummary,
  Workspace
} from './types'

/** Renderer -> Main, request/response (invoke/handle). */
export const IPC = {
  SESSIONS_LIST: 'sessions:list',
  SESSIONS_CREATE: 'sessions:create',
  SESSIONS_RENAME: 'sessions:rename',
  SESSIONS_DELETE: 'sessions:delete',
  SESSIONS_MESSAGES: 'sessions:messages',
  CHAT_SEND: 'chat:send',
  CHAT_CANCEL: 'chat:cancel',
  WORKSPACE_SELECT: 'workspace:select',
  WORKSPACE_LIST: 'workspace:list',
  ATTACHMENT_SELECT: 'attachment:select',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  MCP_STATUS: 'mcp:status',
  MCP_PRESETS: 'mcp:presets'
} as const

/** Main -> Renderer, fire-and-forget push channels. */
export const IPC_PUSH = {
  CHAT_STREAM_EVENT: 'chat:stream-event',
  MCP_STATUS_CHANGED: 'mcp:status-changed'
} as const

export interface IpcRequestMap {
  [IPC.SESSIONS_LIST]: { workspaceId: string }
  [IPC.SESSIONS_CREATE]: { workspaceId: string; providerId: ProviderId; model: string; title?: string }
  [IPC.SESSIONS_RENAME]: { sessionId: string; title: string }
  [IPC.SESSIONS_DELETE]: { sessionId: string }
  [IPC.SESSIONS_MESSAGES]: { sessionId: string }
  [IPC.CHAT_SEND]: { sessionId: string; content: string; attachmentPaths?: string[] }
  [IPC.CHAT_CANCEL]: { sessionId: string }
  [IPC.WORKSPACE_SELECT]: undefined
  [IPC.WORKSPACE_LIST]: undefined
  [IPC.ATTACHMENT_SELECT]: undefined
  [IPC.SETTINGS_GET]: undefined
  [IPC.SETTINGS_UPDATE]: { settings: AppSettings }
  [IPC.MCP_STATUS]: undefined
  [IPC.MCP_PRESETS]: undefined
}

export interface IpcResponseMap {
  [IPC.SESSIONS_LIST]: SessionSummary[]
  [IPC.SESSIONS_CREATE]: SessionSummary
  [IPC.SESSIONS_RENAME]: SessionSummary
  [IPC.SESSIONS_DELETE]: { id: string }
  [IPC.SESSIONS_MESSAGES]: ChatMessage[]
  [IPC.CHAT_SEND]: { accepted: true }
  [IPC.CHAT_CANCEL]: { cancelled: boolean }
  [IPC.WORKSPACE_SELECT]: Workspace | null
  [IPC.WORKSPACE_LIST]: Workspace[]
  [IPC.ATTACHMENT_SELECT]: MessageAttachment[]
  [IPC.SETTINGS_GET]: AppSettings
  [IPC.SETTINGS_UPDATE]: AppSettings
  [IPC.MCP_STATUS]: McpServerStatus[]
  [IPC.MCP_PRESETS]: McpPreset[]
}

export type IpcChannel = keyof IpcRequestMap
