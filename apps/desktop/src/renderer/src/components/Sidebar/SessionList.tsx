import type { SessionSummary, Workspace } from '@shared/types'
import { SessionListItem } from './SessionListItem'

export interface SessionListProps {
  sessions: SessionSummary[]
  /** Known workspaces, used to render each chat's workspace tag. */
  workspaces: Workspace[]
  activeSessionId?: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export function SessionList({
  sessions,
  workspaces,
  activeSessionId,
  onSelect,
  onCreate,
  onRename,
  onDelete
}: SessionListProps): JSX.Element {
  const workspaceNameById = new Map(workspaces.map((w) => [w.id, w.name]))
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center justify-center gap-1.5 rounded-md bg-accent/90 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent"
      >
        <span aria-hidden="true">+</span>
        <span>New session</span>
      </button>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
        {sessions.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-gray-500">No sessions yet.</p>
        ) : (
          sessions.map((session) => (
            <SessionListItem
              key={session.id}
              session={session}
              workspaceName={session.workspaceId ? workspaceNameById.get(session.workspaceId) ?? null : null}
              active={session.id === activeSessionId}
              onSelect={() => onSelect(session.id)}
              onRename={(title) => onRename(session.id, title)}
              onDelete={() => onDelete(session.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
