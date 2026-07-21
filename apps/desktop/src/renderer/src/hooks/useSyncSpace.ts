import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type {
  AppSettings,
  ChatMessage,
  MessageAttachment,
  SessionSummary,
  Workspace
} from '@shared/types'

const ERROR_PREFIX = 'Error:'

// Uses the `uuid` package rather than crypto.randomUUID(): the latter is gated behind a
// "secure context" in Chromium and can be unavailable when the renderer is loaded via
// file:// in the packaged app, even though it works fine under the file:// dev server.
function randomId(): string {
  return uuidv4()
}

export function useSyncSpace() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [isCompacting, setIsCompacting] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)

  const [composerValue, setComposerValue] = useState('')
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [error, setError] = useState<string | null>(null)

  // Live view of child agents spawned via spawn_subagent for the active session's run.
  const [subagents, setSubagents] = useState<
    Record<string, { id: string; task: string; toolName?: string }>
  >({})

  // Queue of tool-approval prompts awaiting the user's decision (usually 0 or 1).
  const [pendingPermissions, setPendingPermissions] = useState<
    { requestId: string; toolName: string; arguments: Record<string, unknown> }[]
  >([])

  const activeSessionIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  // Initial load: settings, known workspaces, and every chat (unified list, not workspace-filtered).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [loadedSettings, loadedWorkspaces, loadedSessions] = await Promise.all([
        window.syncspace.getSettings(),
        window.syncspace.listWorkspaces(),
        window.syncspace.listSessions()
      ])
      if (cancelled) return
      setSettings(loadedSettings)
      setWorkspaces(loadedWorkspaces)
      setSessions(loadedSessions)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Load message history whenever the active session changes.
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([])
      return
    }
    let cancelled = false
    setIsThinking(false)
    setIsCompacting(false)
    setStreamingMessageId(null)
    setSubagents({})
    setPendingPermissions([])
    void (async () => {
      const loaded = await window.syncspace.getSessionMessages(activeSessionId)
      if (cancelled) return
      setMessages(loaded)
    })()
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  // Subscribe once to the Agent Runner's stream events for the lifetime of the app.
  useEffect(() => {
    const unsubscribe = window.syncspace.onStreamEvent((event) => {
      if (event.sessionId !== activeSessionIdRef.current) {
        return
      }
      switch (event.type) {
        case 'thinking':
          setIsThinking(event.active)
          break
        case 'compaction':
          setIsCompacting(event.active)
          break
        case 'token':
          setStreamingMessageId(event.messageId)
          setMessages((prev) => {
            const existingIndex = prev.findIndex((m) => m.id === event.messageId)
            if (existingIndex === -1) {
              return [
                ...prev,
                {
                  id: event.messageId,
                  sessionId: event.sessionId,
                  role: 'assistant',
                  content: event.delta,
                  createdAt: Date.now()
                }
              ]
            }
            const next = [...prev]
            next[existingIndex] = { ...next[existingIndex], content: next[existingIndex].content + event.delta }
            return next
          })
          break
        case 'tool_call_result': {
          const { result } = event
          setMessages((prev) => [
            ...prev,
            {
              id: randomId(),
              sessionId: event.sessionId,
              role: 'tool',
              toolCallId: result.id,
              content: result.ok ? result.content : `${ERROR_PREFIX} ${result.content}`,
              createdAt: Date.now()
            }
          ])
          break
        }
        case 'message_done':
          setMessages((prev) => {
            const existingIndex = prev.findIndex((m) => m.id === event.message.id)
            if (existingIndex === -1) return [...prev, event.message]
            const next = [...prev]
            next[existingIndex] = event.message
            return next
          })
          setStreamingMessageId((current) => (current === event.message.id ? null : current))
          break
        case 'subagent_progress':
          setSubagents((prev) => {
            if (event.phase === 'completed' || event.phase === 'failed') {
              const next = { ...prev }
              delete next[event.subagentId]
              return next
            }
            return {
              ...prev,
              [event.subagentId]: {
                id: event.subagentId,
                task: event.task ?? prev[event.subagentId]?.task ?? '',
                toolName: event.phase === 'tool' ? event.toolName : prev[event.subagentId]?.toolName
              }
            }
          })
          break
        case 'permission_request':
          setPendingPermissions((prev) => [
            ...prev,
            { requestId: event.requestId, toolName: event.toolName, arguments: event.arguments }
          ])
          break
        case 'run_done':
          setIsSending(false)
          setIsThinking(false)
          setIsCompacting(false)
          setStreamingMessageId(null)
          setSubagents({})
          setPendingPermissions([])
          break
        case 'error':
          setIsSending(false)
          setIsThinking(false)
          setIsCompacting(false)
          setStreamingMessageId(null)
          setSubagents({})
          setPendingPermissions([])
          setError(event.message)
          break
      }
    })
    return unsubscribe
  }, [])

  const refreshSessions = useCallback(async () => {
    const loaded = await window.syncspace.listSessions()
    setSessions(loaded)
    return loaded
  }, [])

  // Open the native folder picker, register the chosen folder as a workspace, and return it so
  // the caller can attach it to a chat. Returns null if the user cancels.
  const onOpenWorkspaceFolder = useCallback(async (): Promise<Workspace | null> => {
    const selected = await window.syncspace.selectWorkspace()
    if (!selected) return null
    setWorkspaces((prev) => (prev.some((w) => w.id === selected.id) ? prev : [selected, ...prev]))
    return selected
  }, [])

  // Attach/detach/change a chat's workspace after creation; refresh so the list tag + the
  // derived active workspace update.
  const onSetSessionWorkspace = useCallback(
    async (sessionId: string, workspaceId: string | null) => {
      await window.syncspace.setSessionWorkspace(sessionId, workspaceId)
      await refreshSessions()
    },
    [refreshSessions]
  )

  const onUpdateSettings = useCallback(async (next: AppSettings) => {
    const persisted = await window.syncspace.updateSettings(next)
    setSettings(persisted)
  }, [])

  const onCreateSession = useCallback(async () => {
    if (!settings) return
    const providerId = settings.activeProviderId
    const model = settings.providers[providerId]?.model ?? ''
    // New chats start workspace-less; attach a workspace later from the context panel.
    const created = await window.syncspace.createSession({
      workspaceId: null,
      providerId,
      model,
      title: 'New session'
    })
    await refreshSessions()
    setActiveSessionId(created.id)
  }, [settings, refreshSessions])

  const onRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      await window.syncspace.renameSession(sessionId, title)
      await refreshSessions()
    },
    [refreshSessions]
  )

  const onDeleteSession = useCallback(
    async (sessionId: string) => {
      await window.syncspace.deleteSession(sessionId)
      await refreshSessions()
      setActiveSessionId((current) => (current === sessionId ? null : current))
    },
    [refreshSessions]
  )

  const onAttach = useCallback(async () => {
    const selected = await window.syncspace.selectAttachments()
    if (selected.length === 0) return
    setAttachments((prev) => [...prev, ...selected])
  }, [])

  const onRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // Attach files dropped onto the composer. Paths are resolved via the preload's webUtils
  // bridge, then registered (and existence/directory-checked) in the main process before the
  // send allowlist will honor them.
  const onFilesDropped = useCallback(async (files: FileList | File[]) => {
    const paths = Array.from(files)
      .map((file) => window.syncspace.getPathForFile(file))
      .filter((path) => path.length > 0)
    if (paths.length === 0) return
    const { attachments: added, skipped } = await window.syncspace.registerDroppedAttachments(paths)
    if (added.length > 0) setAttachments((prev) => [...prev, ...added])
    if (skipped.length > 0) {
      setError(`Skipped ${skipped.length} item(s): folders and unreadable paths can't be attached.`)
    }
  }, [])

  const onSend = useCallback(() => {
    if (!activeSessionId || isSending) return
    const content = composerValue.trim()
    if (content.length === 0 && attachments.length === 0) return

    const optimisticMessage: ChatMessage = {
      id: randomId(),
      sessionId: activeSessionId,
      role: 'user',
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: Date.now()
    }
    setMessages((prev) => [...prev, optimisticMessage])
    setIsSending(true)
    setError(null)

    const attachmentPaths = attachments.map((a) => a.path)
    setComposerValue('')
    setAttachments([])

    void window.syncspace.sendMessage(activeSessionId, content, attachmentPaths)
  }, [activeSessionId, isSending, composerValue, attachments])

  const onCancel = useCallback(() => {
    if (!activeSessionId) return
    void window.syncspace.cancelChat(activeSessionId)
  }, [activeSessionId])

  // Start a brand-new session from the welcome screen and immediately send the first message.
  // workspaceId is the (optional) workspace the user chose for this chat; null = no workspace.
  const onStartSession = useCallback(
    async (content: string, workspaceId: string | null) => {
      if (!settings) return
      const text = content.trim()
      const attached = attachments
      if (text.length === 0 && attached.length === 0) return

      const providerId = settings.activeProviderId
      const model = settings.providers[providerId]?.model ?? ''
      const created = await window.syncspace.createSession({
        workspaceId,
        providerId,
        model,
        title: text.slice(0, 48) || 'New session'
      })
      await refreshSessions()
      setActiveSessionId(created.id)

      const optimistic: ChatMessage = {
        id: randomId(),
        sessionId: created.id,
        role: 'user',
        content: text,
        attachments: attached.length > 0 ? attached : undefined,
        createdAt: Date.now()
      }
      setMessages([optimistic])
      setIsSending(true)
      setError(null)
      const attachmentPaths = attached.map((a) => a.path)
      setComposerValue('')
      setAttachments([])
      void window.syncspace.sendMessage(created.id, text, attachmentPaths)
    },
    [settings, attachments, refreshSessions]
  )

  const onRespondPermission = useCallback(
    (requestId: string, decision: 'allow' | 'deny' | 'allow_always') => {
      void window.syncspace.respondPermission(requestId, decision)
      setPendingPermissions((prev) => prev.filter((p) => p.requestId !== requestId))
    },
    []
  )

  // A chat's workspace is a per-session attribute now; the "active workspace" is whatever the
  // currently-open chat is bound to (or null for a workspace-less chat).
  const activeSession = sessions.find((sess) => sess.id === activeSessionId) ?? null
  const activeWorkspace = workspaces.find((w) => w.id === activeSession?.workspaceId) ?? null

  return {
    settings,
    onUpdateSettings,
    workspaces,
    activeWorkspace,
    onOpenWorkspaceFolder,
    onSetSessionWorkspace,
    sessions,
    activeSessionId,
    onSelectSession: setActiveSessionId,
    onCreateSession,
    onRenameSession,
    onDeleteSession,
    messages,
    isThinking,
    isCompacting,
    isSending,
    streamingMessageId,
    composerValue,
    setComposerValue,
    attachments,
    onAttach,
    onRemoveAttachment,
    onFilesDropped,
    onSend,
    onStartSession,
    onCancel,
    error,
    dismissError: () => setError(null),
    activeSubagents: Object.values(subagents),
    activePermission: pendingPermissions[0] ?? null,
    onRespondPermission
  }
}
