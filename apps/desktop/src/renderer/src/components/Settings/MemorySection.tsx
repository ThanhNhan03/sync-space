import { useCallback, useEffect, useState } from 'react'
import type { MemoryCategory, MemoryEntry } from '@shared/types'

export interface MemorySectionProps {
  enabled: boolean
  onToggleEnabled: (enabled: boolean) => void
  /** Active workspace path; memories are scoped to it (manual adds are workspace-scoped). */
  workspaceRoot?: string
}

const CATEGORIES: MemoryCategory[] = ['identity', 'preference', 'project', 'fact']

const inputClass =
  'w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent'

export function MemorySection({
  enabled,
  onToggleEnabled,
  workspaceRoot
}: MemorySectionProps): JSX.Element {
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [draftContent, setDraftContent] = useState('')
  const [draftCategory, setDraftCategory] = useState<MemoryCategory>('fact')

  const refresh = useCallback(async () => {
    setMemories(await window.syncspace.listMemories(workspaceRoot))
  }, [workspaceRoot])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleAdd = async (): Promise<void> => {
    const content = draftContent.trim()
    if (!content || !workspaceRoot) return
    await window.syncspace.addMemory(workspaceRoot, draftCategory, content)
    setDraftContent('')
    await refresh()
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.syncspace.deleteMemory(id)
    await refresh()
  }

  const handleClear = async (): Promise<void> => {
    await window.syncspace.clearMemories(workspaceRoot)
    await refresh()
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Long-term memory</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            className="accent-accent"
          />
          Enabled
        </label>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        When enabled, the agent recalls relevant remembered facts each session and automatically
        saves durable facts after a run (this uses an extra call to the active model). It can also
        save/search memories with the <span className="font-mono">remember</span> and{' '}
        <span className="font-mono">recall</span> tools.
      </p>

      {/* Manual add */}
      <div className="mb-3 space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          rows={2}
          placeholder={
            workspaceRoot ? 'Add a fact to remember…' : 'Select a workspace to add memories.'
          }
          disabled={!workspaceRoot}
          className={inputClass}
        />
        <div className="flex items-center gap-2">
          <select
            value={draftCategory}
            onChange={(e) => setDraftCategory(e.target.value as MemoryCategory)}
            className={`${inputClass} flex-1`}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!workspaceRoot || draftContent.trim().length === 0}
            className="shrink-0 rounded-md bg-accent/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
        </span>
        {memories.length > 0 && (
          <button
            type="button"
            onClick={() => void handleClear()}
            className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-red-400"
          >
            Clear all
          </button>
        )}
      </div>

      {memories.length === 0 ? (
        <p className="text-xs italic text-slate-500">
          No memories yet. The agent will save durable facts as you work, or add one above.
        </p>
      ) : (
        <ul className="space-y-2">
          {memories.map((memory) => (
            <li key={memory.id} className="rounded-md bg-surface-muted px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                  {memory.category}
                </span>
                <span className="min-w-0 flex-1 text-slate-200">{memory.content}</span>
                <button
                  type="button"
                  onClick={() => void handleDelete(memory.id)}
                  aria-label="Delete memory"
                  className="shrink-0 rounded p-0.5 text-slate-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
              {memory.workspaceRoot === '' && (
                <span className="mt-1 block text-[10px] text-slate-600">global</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
