import { useState } from 'react'
import { ChatInput, MessageList } from './components/Chat'
import { SessionList, WorkspaceBadge } from './components/Sidebar'
import { SettingsPanel } from './components/Settings'
import { useSyncSpace } from './hooks/useSyncSpace'

export default function App(): JSX.Element {
  const s = useSyncSpace()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex h-full bg-surface text-slate-100">
      <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-white/5 bg-surface p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-white">SyncSpace</span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            className="rounded p-1 text-gray-400 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.24 1.192c.484.15.938.359 1.353.62l1.017-.63a1 1 0 0 1 1.276.149l.962.962a1 1 0 0 1 .15 1.276l-.632 1.017c.26.415.469.87.62 1.353l1.192.24a1 1 0 0 1 .804.98v1.36a1 1 0 0 1-.804.98l-1.192.24c-.15.484-.36.938-.62 1.353l.63 1.017a1 1 0 0 1-.148 1.276l-.962.962a1 1 0 0 1-1.276.15l-1.017-.632c-.415.26-.87.469-1.353.62l-.24 1.192a1 1 0 0 1-.98.804h-1.36a1 1 0 0 1-.98-.804l-.24-1.192a6.02 6.02 0 0 1-1.353-.62l-1.017.63a1 1 0 0 1-1.276-.148l-.962-.962a1 1 0 0 1-.15-1.276l.632-1.017a6.02 6.02 0 0 1-.62-1.353l-1.192-.24a1 1 0 0 1-.804-.98v-1.36a1 1 0 0 1 .804-.98l1.192-.24c.15-.484.36-.938.62-1.353l-.63-1.017a1 1 0 0 1 .148-1.276l.962-.962a1 1 0 0 1 1.276-.15l1.017.632c.415-.26.87-.469 1.353-.62l.24-1.192ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <WorkspaceBadge workspace={s.workspace} onChangeWorkspace={s.onSelectWorkspace} />

        <SessionList
          sessions={s.sessions}
          activeSessionId={s.activeSessionId}
          onSelect={s.onSelectSession}
          onCreate={s.onCreateSession}
          onRename={s.onRenameSession}
          onDelete={s.onDeleteSession}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {s.error && (
          <div className="flex items-center justify-between gap-3 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            <span>{s.error}</span>
            <button type="button" onClick={s.dismissError} className="text-red-200 hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {!s.workspace ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
            Select a workspace folder to start working with SyncSpace.
          </div>
        ) : !s.activeSessionId ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
            Create a session to start chatting.
          </div>
        ) : (
          <MessageList
            messages={s.messages}
            streamingMessageId={s.streamingMessageId}
            isThinking={s.isThinking}
          />
        )}

        {s.isSending && (
          <div className="flex justify-center border-t border-white/5 bg-surface py-1.5">
            <button
              type="button"
              onClick={s.onCancel}
              className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
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
          disabled={!s.activeSessionId || s.isSending}
        />
      </main>

      {settingsOpen && s.settings && (
        <SettingsPanel
          settings={s.settings}
          workspaceRoot={s.workspace?.rootPath}
          onChange={s.onUpdateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
