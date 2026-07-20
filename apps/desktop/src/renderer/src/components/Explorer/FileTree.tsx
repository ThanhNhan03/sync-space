import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceFileEntry } from '@shared/types'

export interface FileTreeProps {
  workspaceRoot: string
  onOpenFile: (relativePath: string) => void
}

const ROOT = '.'
const INDENT_PX = 14

/**
 * Lazily-loaded, expandable tree of a workspace's files. Directory contents are fetched only
 * when first expanded and then cached, so opening a large workspace doesn't walk the whole
 * tree up front. Clicking a file calls `onOpenFile`; clicking a directory toggles it.
 */
export function FileTree({ workspaceRoot, onOpenFile }: FileTreeProps): JSX.Element {
  const [childrenByPath, setChildrenByPath] = useState<Record<string, WorkspaceFileEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const loadDir = useCallback(
    async (relativePath: string) => {
      setLoadingPaths((prev) => new Set(prev).add(relativePath))
      try {
        const entries = await window.syncspace.listWorkspaceFiles(workspaceRoot, relativePath)
        setChildrenByPath((prev) => ({ ...prev, [relativePath]: entries }))
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev)
          next.delete(relativePath)
          return next
        })
      }
    },
    [workspaceRoot]
  )

  useEffect(() => {
    setChildrenByPath({})
    setExpanded(new Set())
    setError(null)
    void loadDir(ROOT)
  }, [workspaceRoot, loadDir])

  const toggleDir = (relativePath: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(relativePath)) {
        next.delete(relativePath)
      } else {
        next.add(relativePath)
        if (!childrenByPath[relativePath]) {
          void loadDir(relativePath)
        }
      }
      return next
    })
  }

  const renderChildren = (relativePath: string, depth: number): JSX.Element | null => {
    const entries = childrenByPath[relativePath]
    const indent = depth * INDENT_PX + 8

    if (!entries) {
      return loadingPaths.has(relativePath) ? (
        <p className="py-1 text-xs text-text-muted" style={{ paddingLeft: indent }}>
          Loading…
        </p>
      ) : null
    }

    if (entries.length === 0) {
      return (
        <p className="py-1 text-xs italic text-text-muted" style={{ paddingLeft: indent }}>
          Empty
        </p>
      )
    }

    return (
      <>
        {entries.map((entry) => {
          const isDir = entry.type === 'directory'
          const isOpen = isDir && expanded.has(entry.relativePath)
          return (
            <div key={entry.relativePath}>
              <button
                type="button"
                onClick={() => (isDir ? toggleDir(entry.relativePath) : onOpenFile(entry.relativePath))}
                style={{ paddingLeft: indent }}
                className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <span className="w-3 shrink-0 text-[10px] text-text-muted" aria-hidden="true">
                  {isDir ? (isOpen ? '▾' : '▸') : ''}
                </span>
                <span className="truncate">{entry.name}</span>
              </button>
              {isDir && isOpen && renderChildren(entry.relativePath, depth + 1)}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
      {error && <p className="px-2 py-2 text-xs text-error">{error}</p>}
      {renderChildren(ROOT, 0)}
    </div>
  )
}
