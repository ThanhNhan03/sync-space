import { useEffect, useState } from 'react'
import { ChatInput, MessageList } from './components/Chat'
import { PermissionPrompt } from './components/Chat/PermissionPrompt'
import { SessionList } from './components/Sidebar'
import { WorkspaceExplorer } from './components/Explorer'
import { SettingsPanel } from './components/Settings'
import { Titlebar } from './components/Titlebar'
import { WelcomeView } from './components/WelcomeView'
import { ContextPanel } from './components/ContextPanel'
import { useSyncSpace } from './hooks/useSyncSpace'

type SidebarTab = 'chats' | 'files'

export default function App(): JSX.Element {
  const s = useSyncSpace()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chats')
  const [contextPanelOpen, setContextPanelOpen] = useState(true)

  // Apply the light theme only when explicitly chosen; system/dark keep the polished dark UI.
  // (Light is opt-in until every legacy panel is fully token-migrated.)
  useEffect(() => {
    document.documentElement.classList.toggle('light', s.settings?.theme === 'light')
  }, [s.settings?.theme])

  // Swallow file drops that land outside a designated drop zone, so a stray drop can never make
  // the window navigate to / open the dropped file (the component drop zones preventDefault
  // their own drops first; this is the catch-all for everywhere else).
  useEffect(() => {
    const prevent = (event: globalThis.DragEvent): void => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const activeSession = s.sessions.find((session) => session.id === s.activeSessionId) ?? null
  const hasProviderKey = Boolean(
    s.settings && s.settings.providers[s.settings.activeProviderId]?.apiKey
  )

  return (
    <div className="flex h-full flex-col bg-background text-text-primary">
      <Titlebar
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`flex shrink-0 flex-col gap-3 overflow-hidden border-r border-border-subtle bg-background-secondary transition-all ${
            sidebarCollapsed ? 'w-0 border-r-0' : 'w-64 p-3'
          }`}
        >
          {!sidebarCollapsed && (
            <>
              <div className="flex shrink-0 gap-1 rounded-lg bg-surface-muted p-1">
                {(['chats', 'files'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSidebarTab(tab)}
                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                      sidebarTab === tab
                        ? 'bg-surface text-text-primary shadow-soft'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {sidebarTab === 'chats' ? (
                <SessionList
                  sessions={s.sessions}
                  workspaces={s.workspaces}
                  activeSessionId={s.activeSessionId}
                  onSelect={s.onSelectSession}
                  onCreate={s.onCreateSession}
                  onRename={s.onRenameSession}
                  onDelete={s.onDeleteSession}
                />
              ) : (
                <WorkspaceExplorer workspaceRoot={s.activeWorkspace?.rootPath ?? null} />
              )}
            </>
          )}
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {s.error && (
            <div className="flex items-center justify-between gap-3 bg-error/10 px-4 py-2 text-sm text-error">
              <span>{s.error}</span>
              <button type="button" onClick={s.dismissError} className="text-error/80 hover:text-error">
                Dismiss
              </button>
            </div>
          )}

          {!s.activeSessionId ? (
            <WelcomeView
              workspaces={s.workspaces}
              onOpenWorkspaceFolder={s.onOpenWorkspaceFolder}
              attachments={s.attachments}
              onAttach={s.onAttach}
              onRemoveAttachment={s.onRemoveAttachment}
              onFilesDropped={s.onFilesDropped}
              onStart={s.onStartSession}
              hasProviderKey={hasProviderKey}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-end border-b border-border-subtle bg-background px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setContextPanelOpen((open) => !open)}
                  aria-label={contextPanelOpen ? 'Hide context panel' : 'Show context panel'}
                  aria-pressed={contextPanelOpen}
                  title="Toggle context panel"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    contextPanelOpen
                      ? 'bg-surface-muted text-text-primary'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                    <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M13 4v12" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                </button>
              </div>

              <MessageList
                messages={s.messages}
                streamingMessageId={s.streamingMessageId}
                isThinking={s.isThinking}
              />

              {s.isCompacting && (
                <div className="flex items-center gap-2 border-t border-border-subtle bg-background px-4 py-2 text-xs text-text-secondary">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
                  <span>Compacting conversation…</span>
                </div>
              )}

              {s.activeSubagents.length > 0 && (
                <div className="space-y-1 border-t border-border-subtle bg-background px-4 py-2">
                  {s.activeSubagents.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
                      <span className="shrink-0 font-medium text-text-secondary">Subagent</span>
                      <span className="truncate">{sub.task}</span>
                      {sub.toolName && (
                        <span className="ml-auto shrink-0 font-mono text-text-muted">{sub.toolName}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {s.isSending && (
                <div className="flex justify-center border-t border-border-subtle bg-background py-1.5">
                  <button
                    type="button"
                    onClick={s.onCancel}
                    className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                  >
                    Stop generating
                  </button>
                </div>
              )}

              <ChatInput
                value={s.composerValue}
                onChange={s.setComposerValue}
                onSend={s.onSend}
                onAttach={s.onAttach}
                attachments={s.attachments}
                onRemoveAttachment={s.onRemoveAttachment}
                onFilesDropped={s.onFilesDropped}
                disabled={!s.activeSessionId || s.isSending}
              />
            </>
          )}
        </main>

        {/* Context panel (only in a session); user-toggleable via the button above the chat. */}
        {s.activeSessionId && (
          <ContextPanel
            workspace={s.activeWorkspace}
            workspaces={s.workspaces}
            session={activeSession}
            messageCount={s.messages.length}
            open={contextPanelOpen}
            onSetSessionWorkspace={s.onSetSessionWorkspace}
            onOpenWorkspaceFolder={s.onOpenWorkspaceFolder}
          />
        )}
      </div>

      {settingsOpen && s.settings && (
        <SettingsPanel
          settings={s.settings}
          workspaceRoot={s.activeWorkspace?.rootPath}
          onChange={s.onUpdateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {s.activePermission && (
        <PermissionPrompt
          key={s.activePermission.requestId}
          toolName={s.activePermission.toolName}
          args={s.activePermission.arguments}
          onDecision={(decision) => s.onRespondPermission(s.activePermission!.requestId, decision)}
        />
      )}
    </div>
  )
}
