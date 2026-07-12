import { basename } from 'node:path'
import { stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import { IPC, IPC_PUSH } from '@shared/ipc'
import type { IpcRequestMap, IpcResponseMap } from '@shared/ipc'
import type { MessageAttachment } from '@shared/types'
import type { SyncSpaceEngine } from '@engine/SyncSpaceEngine'

type Handler<K extends keyof IpcRequestMap> = (
  request: IpcRequestMap[K],
  event: IpcMainInvokeEvent
) => Promise<IpcResponseMap[K]> | IpcResponseMap[K]

function handle<K extends keyof IpcRequestMap>(channel: K, handler: Handler<K>): void {
  ipcMain.handle(channel, (event, request: IpcRequestMap[K]) => handler(request, event))
}

/**
 * Paths the user has actually approved via the native ATTACHMENT_SELECT dialog. CHAT_SEND
 * only accepts attachmentPaths that appear here -- otherwise a compromised/buggy renderer
 * could hand the main process an arbitrary host path and have its contents read into an
 * LLM prompt (an exfiltration primitive) without ever going through a file picker the user
 * consciously interacted with.
 */
const approvedAttachmentPaths = new Set<string>()

/**
 * Wires every request/response IPC channel to the Engine, and forwards Agent Runner
 * stream events for an in-flight chat send back to the renderer on the push channel.
 * getWindow is a function (not a captured window) because the window can be recreated
 * (e.g. on macOS activate) after this is registered once at startup.
 */
export function registerIpcHandlers(engine: SyncSpaceEngine, getWindow: () => BrowserWindow | null): void {
  handle(IPC.SESSIONS_LIST, (req) => engine.listSessions(req.workspaceId))

  handle(IPC.SESSIONS_CREATE, (req) =>
    engine.createSession({
      workspaceId: req.workspaceId,
      providerId: req.providerId,
      model: req.model,
      title: req.title
    })
  )

  handle(IPC.SESSIONS_RENAME, (req) => engine.renameSession(req.sessionId, req.title))

  handle(IPC.SESSIONS_DELETE, (req) => {
    engine.deleteSession(req.sessionId)
    return { id: req.sessionId }
  })

  handle(IPC.SESSIONS_MESSAGES, (req) => engine.getMessages(req.sessionId))

  handle(IPC.CHAT_SEND, (req) => {
    const approvedPaths = (req.attachmentPaths ?? []).filter((path) => approvedAttachmentPaths.has(path))
    engine
      .sendMessage({ ...req, attachmentPaths: approvedPaths }, (streamEvent) => {
        getWindow()?.webContents.send(IPC_PUSH.CHAT_STREAM_EVENT, streamEvent)
      })
      .catch((error) => {
        getWindow()?.webContents.send(IPC_PUSH.CHAT_STREAM_EVENT, {
          type: 'error',
          sessionId: req.sessionId,
          message: error instanceof Error ? error.message : String(error)
        })
      })
    return { accepted: true as const }
  })

  handle(IPC.CHAT_CANCEL, (req) => ({ cancelled: engine.cancelRun(req.sessionId) }))

  handle(IPC.WORKSPACE_SELECT, async () => {
    const window = getWindow()
    if (!window) {
      return null
    }
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return engine.registerWorkspace(result.filePaths[0])
  })

  handle(IPC.WORKSPACE_LIST, () => engine.listWorkspaces())

  handle(IPC.ATTACHMENT_SELECT, async () => {
    const window = getWindow()
    if (!window) {
      return []
    }
    const result = await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'] })
    if (result.canceled) {
      return []
    }
    const attachments: MessageAttachment[] = []
    for (const filePath of result.filePaths) {
      approvedAttachmentPaths.add(filePath)
      const stats = await stat(filePath).catch(() => null)
      attachments.push({
        id: randomUUID(),
        name: basename(filePath),
        path: filePath,
        size: stats?.size
      })
    }
    return attachments
  })

  handle(IPC.SETTINGS_GET, () => engine.getSettings())
  handle(IPC.SETTINGS_UPDATE, (req) => engine.updateSettings(req.settings))
}
