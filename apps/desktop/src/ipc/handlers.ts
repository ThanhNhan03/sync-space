import { basename, join } from 'node:path'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

import { dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

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

  handle(IPC.MCP_STATUS, () => engine.getMcpStatus())
  handle(IPC.MCP_PRESETS, () => engine.getMcpPresets())

  handle(IPC.MEMORY_LIST, (req) => engine.listMemories(req.workspaceRoot))
  handle(IPC.MEMORY_ADD, (req) =>
    engine.addMemory({ workspaceRoot: req.workspaceRoot, category: req.category, content: req.content })
  )
  handle(IPC.MEMORY_DELETE, (req) => {
    engine.deleteMemory(req.id)
    return { id: req.id }
  })
  handle(IPC.MEMORY_CLEAR, (req) => ({ cleared: engine.clearMemories(req.workspaceRoot) }))

  handle(IPC.PERMISSION_RESPOND, (req) => {
    engine.respondPermission(req.requestId, req.decision)
    return { ok: true as const }
  })

  handle(IPC.WORKSPACE_FILES_LIST, (req) => engine.listWorkspaceDir(req.workspaceRoot, req.relativePath))
  handle(IPC.WORKSPACE_FILE_PREVIEW, (req) => engine.previewWorkspaceFile(req.workspaceRoot, req.relativePath))

  handle(IPC.WORKSPACE_FILE_EXPORT, async (req) => {
    const window = getWindow()
    const absolutePath = await engine.resolveWorkspaceFilePath(req.workspaceRoot, req.relativePath)
    if (!window) {
      return { exported: false }
    }
    const result = await dialog.showSaveDialog(window, { defaultPath: basename(absolutePath) })
    if (result.canceled || !result.filePath) {
      return { exported: false }
    }
    await copyFile(absolutePath, result.filePath)
    return { exported: true, path: result.filePath }
  })

  handle(IPC.WORKSPACE_FILE_OPEN_EXTERNAL, async (req) => {
    const absolutePath = await engine.resolveWorkspaceFilePath(req.workspaceRoot, req.relativePath)
    const error = await shell.openPath(absolutePath)
    return { opened: error === '', error: error || undefined }
  })

  handle(IPC.WORKSPACE_FILE_SHOW_IN_FOLDER, async (req) => {
    const absolutePath = await engine.resolveWorkspaceFilePath(req.workspaceRoot, req.relativePath)
    shell.showItemInFolder(absolutePath)
    return { opened: true }
  })

  handle(IPC.COMPACTION_STATUS, (req) => engine.getCompactionStatus(req.sessionId))
  handle(IPC.COMPACTION_RUN_NOW, (req) => engine.runCompactionNow(req.sessionId))

  handle(IPC.SKILLS_LIST, (req) => engine.listSkills(req.workspaceRoot))
  handle(IPC.SKILLS_SET_ENABLED, (req) =>
    engine.setSkillEnabled(req.id, req.enabled, req.workspaceRoot)
  )
  handle(IPC.SKILLS_OPEN_DIR, async (req) => {
    // Resolve the target folder, creating it so the user always lands in a real directory to
    // drop skill folders into. Project skills live under the workspace's .claude/skills.
    let dir: string
    if (req.scope === 'project') {
      if (!req.workspaceRoot) {
        return { opened: false }
      }
      dir = join(req.workspaceRoot, '.claude', 'skills')
      await mkdir(dir, { recursive: true }).catch(() => {})
    } else {
      dir = engine.ensureGlobalSkillsDir()
    }
    const error = await shell.openPath(dir)
    return { opened: error === '' }
  })

  // Push live MCP server status (connect/fail/tool-count changes) to the renderer.
  engine.onMcpStatusChange((status) => {
    getWindow()?.webContents.send(IPC_PUSH.MCP_STATUS_CHANGED, status)
  })
}
