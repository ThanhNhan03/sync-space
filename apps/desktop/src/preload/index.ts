import { contextBridge, ipcRenderer } from 'electron'

import { IPC, IPC_PUSH } from '../shared/ipc'
import type { IpcRequestMap, IpcResponseMap } from '../shared/ipc'
import type { AgentStreamEvent, McpServerStatus } from '../shared/types'

function invoke<K extends keyof IpcRequestMap>(
  channel: K,
  ...request: IpcRequestMap[K] extends undefined ? [] : [IpcRequestMap[K]]
): Promise<IpcResponseMap[K]> {
  return ipcRenderer.invoke(channel, request[0])
}

const api = {
  listSessions: (workspaceId: string) => invoke(IPC.SESSIONS_LIST, { workspaceId }),

  createSession: (input: IpcRequestMap[typeof IPC.SESSIONS_CREATE]) => invoke(IPC.SESSIONS_CREATE, input),

  renameSession: (sessionId: string, title: string) => invoke(IPC.SESSIONS_RENAME, { sessionId, title }),

  deleteSession: (sessionId: string) => invoke(IPC.SESSIONS_DELETE, { sessionId }),

  getSessionMessages: (sessionId: string) => invoke(IPC.SESSIONS_MESSAGES, { sessionId }),

  sendMessage: (sessionId: string, content: string, attachmentPaths?: string[]) =>
    invoke(IPC.CHAT_SEND, { sessionId, content, attachmentPaths }),

  cancelChat: (sessionId: string) => invoke(IPC.CHAT_CANCEL, { sessionId }),

  selectWorkspace: () => invoke(IPC.WORKSPACE_SELECT),

  listWorkspaces: () => invoke(IPC.WORKSPACE_LIST),

  selectAttachments: () => invoke(IPC.ATTACHMENT_SELECT),

  getSettings: () => invoke(IPC.SETTINGS_GET),

  updateSettings: (settings: IpcRequestMap[typeof IPC.SETTINGS_UPDATE]['settings']) =>
    invoke(IPC.SETTINGS_UPDATE, { settings }),

  getMcpStatus: () => invoke(IPC.MCP_STATUS),

  getMcpPresets: () => invoke(IPC.MCP_PRESETS),

  /** Subscribes to Agent Runner stream events; returns an unsubscribe function. */
  onStreamEvent(callback: (event: AgentStreamEvent) => void): () => void {
    const listener = (_event: unknown, streamEvent: AgentStreamEvent): void => callback(streamEvent)
    ipcRenderer.on(IPC_PUSH.CHAT_STREAM_EVENT, listener)
    return () => ipcRenderer.removeListener(IPC_PUSH.CHAT_STREAM_EVENT, listener)
  },

  /** Subscribes to live MCP server status updates; returns an unsubscribe function. */
  onMcpStatusChanged(callback: (status: McpServerStatus[]) => void): () => void {
    const listener = (_event: unknown, status: McpServerStatus[]): void => callback(status)
    ipcRenderer.on(IPC_PUSH.MCP_STATUS_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_PUSH.MCP_STATUS_CHANGED, listener)
  }
}

contextBridge.exposeInMainWorld('syncspace', api)

export type SyncSpaceApi = typeof api
