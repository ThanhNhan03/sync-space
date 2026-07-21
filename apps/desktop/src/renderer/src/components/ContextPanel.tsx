import { useCallback, useEffect, useState } from 'react'
import type { CompactionStatus, KnowledgeGraphStatus, SessionSummary, Workspace } from '@shared/types'

const OPEN_FOLDER_VALUE = '__open_folder__'
const NO_WORKSPACE_VALUE = ''

export interface ContextPanelProps {
  /** The active chat's workspace (or null for a workspace-less chat). */
  workspace: Workspace | null
  /** Known workspaces, for the per-chat workspace switcher. */
  workspaces: Workspace[]
  session: SessionSummary | null
  messageCount: number
  /** Whether the panel is expanded. Collapses to zero width (not unmounted) when false. */
  open: boolean
  onSetSessionWorkspace: (sessionId: string, workspaceId: string | null) => Promise<void> | void
  onOpenWorkspaceFolder: () => Promise<Workspace | null>
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  minimax: 'MiniMax',
  mimo: 'Xiaomi MiMo'
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`break-words text-sm text-text-secondary ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </div>
    </div>
  )
}

/**
 * Right-hand context column: workspace, model, and session details for the active chat.
 * User-toggleable (see the header button in App.tsx) rather than only appearing above the xl
 * breakpoint -- it collapses to zero width but stays mounted so the width transition animates,
 * matching how the left sidebar collapses.
 */
export function ContextPanel({
  workspace,
  workspaces,
  session,
  messageCount,
  open,
  onSetSessionWorkspace,
  onOpenWorkspaceFolder
}: ContextPanelProps): JSX.Element {
  const sessionId = session?.id
  const workspaceRoot = workspace?.rootPath
  const [compactionStatus, setCompactionStatus] = useState<CompactionStatus | null>(null)
  const [isCompactingNow, setIsCompactingNow] = useState(false)
  const [graphStatus, setGraphStatus] = useState<KnowledgeGraphStatus | null>(null)
  const [isRebuildingGraph, setIsRebuildingGraph] = useState(false)

  const handleWorkspaceChange = async (value: string): Promise<void> => {
    if (!sessionId) return
    if (value === OPEN_FOLDER_VALUE) {
      const opened = await onOpenWorkspaceFolder()
      if (opened) await onSetSessionWorkspace(sessionId, opened.id)
      return
    }
    await onSetSessionWorkspace(sessionId, value === NO_WORKSPACE_VALUE ? null : value)
  }

  const refreshCompactionStatus = useCallback(async () => {
    if (!sessionId) {
      setCompactionStatus(null)
      return
    }
    setCompactionStatus(await window.syncspace.getCompactionStatus(sessionId))
  }, [sessionId])

  // Refresh on session switch, and again whenever the message count changes -- a cheap free
  // signal that a run just completed and status may have moved.
  useEffect(() => {
    void refreshCompactionStatus()
  }, [refreshCompactionStatus, messageCount])

  const handleCompactNow = async (): Promise<void> => {
    if (!sessionId) return
    setIsCompactingNow(true)
    try {
      setCompactionStatus(await window.syncspace.runCompactionNow(sessionId))
    } finally {
      setIsCompactingNow(false)
    }
  }

  const refreshGraphStatus = useCallback(async () => {
    if (!workspaceRoot) {
      setGraphStatus(null)
      return
    }
    setGraphStatus(await window.syncspace.getKnowledgeGraphStatus(workspaceRoot))
  }, [workspaceRoot])

  // The knowledge graph is workspace-scoped (not session-scoped), so it only refreshes on
  // workspace switch -- unlike compaction, message count is not a meaningful signal here.
  useEffect(() => {
    void refreshGraphStatus()
  }, [refreshGraphStatus])

  const handleRebuildGraph = async (): Promise<void> => {
    if (!workspaceRoot) return
    setIsRebuildingGraph(true)
    try {
      setGraphStatus(await window.syncspace.rebuildKnowledgeGraph(workspaceRoot))
    } finally {
      setIsRebuildingGraph(false)
    }
  }

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-background-secondary transition-all ${
        open ? 'w-[300px] p-4' : 'w-0 border-l-0'
      }`}
    >
      {open && (
        <>
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Context</h2>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="rounded-2xl border border-border-subtle bg-surface p-3 shadow-soft">
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Workspace
                  </div>
                  <select
                    value={workspace?.id ?? NO_WORKSPACE_VALUE}
                    onChange={(e) => void handleWorkspaceChange(e.target.value)}
                    disabled={!sessionId}
                    className="w-full cursor-pointer rounded-md bg-surface-muted px-2 py-1.5 text-sm text-text-secondary outline-none ring-1 ring-transparent transition-colors hover:text-text-primary focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value={NO_WORKSPACE_VALUE}>No workspace</option>
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                    <option value={OPEN_FOLDER_VALUE}>Open folder…</option>
                  </select>
                </div>
                {workspace && <Row label="Path" value={workspace.rootPath} mono />}
              </div>
            </div>

            <div className="rounded-2xl border border-border-subtle bg-surface p-3 shadow-soft">
              <div className="space-y-3">
                <Row
                  label="Provider"
                  value={session ? (PROVIDER_LABELS[session.providerId] ?? session.providerId) : '—'}
                />
                <Row label="Model" value={session?.model || '—'} mono />
                <Row label="Messages" value={String(messageCount)} />
              </div>
            </div>

            <div className="rounded-2xl border border-border-subtle bg-surface p-3 shadow-soft">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Row
                    label="Compaction"
                    value={
                      compactionStatus?.compacted
                        ? `${compactionStatus.summarizedMessageCount ?? '?'} messages summarized`
                        : 'Not yet compacted'
                    }
                  />
                  <button
                    type="button"
                    onClick={() => void handleCompactNow()}
                    disabled={!sessionId || isCompactingNow}
                    className="shrink-0 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCompactingNow ? 'Compacting…' : 'Compact now'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border-subtle bg-surface p-3 shadow-soft">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Row
                    label="Knowledge graph"
                    value={
                      graphStatus?.indexed
                        ? `${graphStatus.fileCount ?? '?'} files, ${graphStatus.nodeCount ?? '?'} nodes${
                            graphStatus.truncated ? ' (truncated)' : ''
                          }`
                        : 'Not yet indexed'
                    }
                  />
                  <button
                    type="button"
                    onClick={() => void handleRebuildGraph()}
                    disabled={!workspaceRoot || isRebuildingGraph}
                    className="shrink-0 rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRebuildingGraph ? 'Indexing…' : 'Rebuild index'}
                  </button>
                </div>
              </div>
            </div>

            <p className="px-1 text-xs leading-relaxed text-text-muted">
              {workspace
                ? 'The agent can read and edit files, run terminal commands, search, and use git — scoped to this workspace. Manage tools, skills, agents, and permissions in Settings.'
                : 'This chat has no workspace, so file, search, git, terminal, and knowledge-graph tools are off. Attach a workspace above to enable them.'}
            </p>
          </div>
        </>
      )}
    </aside>
  )
}
