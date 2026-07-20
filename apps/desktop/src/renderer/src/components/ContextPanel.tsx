import type { SessionSummary, Workspace } from '@shared/types'

export interface ContextPanelProps {
  workspace: Workspace | null
  session: SessionSummary | null
  messageCount: number
  /** Whether the panel is expanded. Collapses to zero width (not unmounted) when false. */
  open: boolean
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
export function ContextPanel({ workspace, session, messageCount, open }: ContextPanelProps): JSX.Element {
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
                <Row label="Workspace" value={workspace?.name ?? '—'} />
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

            <p className="px-1 text-xs leading-relaxed text-text-muted">
              The agent can read and edit files, run terminal commands, search, use git, and more —
              scoped to this workspace. Manage tools, skills, agents, and permissions in Settings.
            </p>
          </div>
        </>
      )}
    </aside>
  )
}
