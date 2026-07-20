import { useState } from 'react'
import { FileTree } from './FileTree'
import { FilePreviewModal } from './FilePreviewModal'

export interface WorkspaceExplorerProps {
  workspaceRoot: string | null
}

/**
 * Sidebar "Files" tab: browse the active workspace's file tree and open a preview overlay on
 * click. Self-contained (owns its own selection state), mirroring how Settings sections call
 * window.syncspace directly rather than routing everything through useSyncSpace.
 */
export function WorkspaceExplorer({ workspaceRoot }: WorkspaceExplorerProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)

  if (!workspaceRoot) {
    return (
      <p className="px-2 py-4 text-center text-xs text-text-muted">
        Select a workspace to browse its files.
      </p>
    )
  }

  return (
    <>
      <FileTree workspaceRoot={workspaceRoot} onOpenFile={setSelected} />

      {selected && (
        <FilePreviewModal
          key={selected}
          workspaceRoot={workspaceRoot}
          relativePath={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
