export interface PermissionPromptProps {
  toolName: string
  args: Record<string, unknown>
  onDecision: (decision: 'allow' | 'deny' | 'allow_always') => void
}

/**
 * Modal shown when the agent wants to run a tool whose permission rule is "ask". Blocks the
 * run until the user allows (once or always this session) or denies. Rendered above the chat.
 */
export function PermissionPrompt({ toolName, args, onDecision }: PermissionPromptProps): JSX.Element {
  const argsJson = JSON.stringify(args, null, 2)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white">Permission required</h2>
        </div>

        <p className="mb-2 text-sm text-slate-300">
          The agent wants to run{' '}
          <span className="font-mono font-semibold text-accent">{toolName}</span>.
        </p>

        <pre className="mb-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 font-mono text-xs text-slate-200">
          {argsJson}
        </pre>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => onDecision('deny')}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-red-300 hover:text-red-200"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={() => onDecision('allow_always')}
            className="rounded-md bg-surface-muted px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10"
          >
            Always allow
          </button>
          <button
            type="button"
            onClick={() => onDecision('allow')}
            className="rounded-md bg-accent/90 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent"
          >
            Allow once
          </button>
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          “Always allow” applies to this tool for the rest of this session. Change defaults in
          Settings → Permissions.
        </p>
      </div>
    </div>
  )
}
