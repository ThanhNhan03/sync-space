import { useState, type KeyboardEvent } from 'react'
import type { SessionSummary } from '@shared/types'

export interface SessionListItemProps {
  session: SessionSummary
  /** Name of the chat's workspace, or null for a workspace-less chat. */
  workspaceName: string | null
  active: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

export function SessionListItem({
  session,
  workspaceName,
  active,
  onSelect,
  onRename,
  onDelete
}: SessionListItemProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(session.title)

  const beginEditing = (): void => {
    setDraftTitle(session.title)
    setIsEditing(true)
  }

  const commitEditing = (): void => {
    const trimmed = draftTitle.trim()
    setIsEditing(false)
    if (trimmed.length > 0 && trimmed !== session.title) {
      onRename(trimmed)
    }
  }

  const cancelEditing = (): void => {
    setDraftTitle(session.title)
    setIsEditing(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }

  return (
    <div
      onClick={isEditing ? undefined : onSelect}
      onDoubleClick={isEditing ? undefined : beginEditing}
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
        active ? 'bg-accent/20 text-white' : 'text-gray-300 hover:bg-surface-muted'
      }`}
    >
      {isEditing ? (
        <input
          autoFocus
          type="text"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={commitEditing}
          onKeyDown={handleKeyDown}
          onClick={(event) => event.stopPropagation()}
          className="flex-1 min-w-0 rounded bg-surface px-1 py-0.5 text-sm text-white outline-none ring-1 ring-accent"
        />
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate" title={session.title}>
            {session.title}
          </span>
          <span
            className={`truncate text-[10px] ${workspaceName ? 'text-text-muted' : 'italic text-text-muted/70'}`}
            title={workspaceName ?? 'No workspace'}
          >
            {workspaceName ?? 'No workspace'}
          </span>
        </div>
      )}

      {!isEditing && (
        <div className="hidden items-center gap-1 group-hover:flex">
          <button
            type="button"
            aria-label="Rename session"
            title="Rename session"
            onClick={(event) => {
              event.stopPropagation()
              beginEditing()
            }}
            className="rounded p-0.5 text-gray-400 hover:text-accent"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-8.5 8.5a1 1 0 0 1-.464.263l-3 .75a.5.5 0 0 1-.606-.606l.75-3a1 1 0 0 1 .263-.464l8.5-8.5z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Delete session"
            title="Delete session"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            className="rounded p-0.5 text-gray-400 hover:text-red-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1a.75.75 0 0 0-.75.75V3H4a.75.75 0 0 0 0 1.5h.278l.7 10.49A2 2 0 0 0 6.976 17h6.048a2 2 0 0 0 1.998-1.91l.7-10.59H16A.75.75 0 0 0 16 3h-3.25V1.75a.75.75 0 0 0-.75-.75h-3.25zM8.5 3V2.5h3V3h-3zM6.03 4.5h7.94l-.687 10.313a.5.5 0 0 1-.5.437H7.216a.5.5 0 0 1-.5-.437L6.03 4.5z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
