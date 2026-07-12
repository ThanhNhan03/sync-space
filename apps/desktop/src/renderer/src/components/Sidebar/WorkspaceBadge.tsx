import type { Workspace } from '@shared/types'

export interface WorkspaceBadgeProps {
  workspace: Workspace | null
  onChangeWorkspace: () => void
}

export function WorkspaceBadge({ workspace, onChangeWorkspace }: WorkspaceBadgeProps): JSX.Element {
  return (
    <div
      className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1.5"
      title={workspace?.rootPath ?? undefined}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`h-4 w-4 shrink-0 ${workspace ? 'text-accent' : 'text-gray-500'}`}
        aria-hidden="true"
      >
        <path d="M2 4.75A1.75 1.75 0 0 1 3.75 3h3.19a1.75 1.75 0 0 1 1.237.513l.81.81a.75.75 0 0 0 .53.22h6.733A1.75 1.75 0 0 1 18 6.28v8.97A1.75 1.75 0 0 1 16.25 17H3.75A1.75 1.75 0 0 1 2 15.25V4.75z" />
      </svg>

      <span
        className={`flex-1 truncate text-sm ${workspace ? 'text-gray-100' : 'italic text-gray-500'}`}
      >
        {workspace ? workspace.name : 'No workspace selected'}
      </span>

      <button
        type="button"
        onClick={onChangeWorkspace}
        className="shrink-0 text-xs font-medium text-accent hover:underline"
      >
        Change
      </button>
    </div>
  )
}
