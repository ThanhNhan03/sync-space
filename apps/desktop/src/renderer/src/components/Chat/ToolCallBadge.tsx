import { useState } from 'react'
import type { ToolCallRequest, ToolCallResult } from '@shared/types'

interface ToolCallBadgeProps {
  toolCall: ToolCallRequest
  result?: ToolCallResult
}

const PREVIEW_MAX_LENGTH = 80

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value
  }
  return `${value.slice(0, max)}…`
}

export function ToolCallBadge({ toolCall, result }: ToolCallBadgeProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const argsPreview = truncate(JSON.stringify(toolCall.arguments), PREVIEW_MAX_LENGTH)
  const isPending = result === undefined
  const isError = result?.isError === true

  const borderClass = isError
    ? 'border-red-500/40 bg-red-500/10'
    : isPending
      ? 'border-white/10 bg-surface-muted'
      : 'border-emerald-500/30 bg-surface-muted'

  return (
    <div className={`w-full max-w-md rounded-lg border text-xs ${borderClass}`}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {isPending ? (
          <span
            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-slate-400"
            aria-hidden="true"
          />
        ) : isError ? (
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        )}

        <span className="shrink-0 font-mono font-semibold text-accent">{toolCall.name}</span>
        <span className="truncate font-mono text-slate-400">{argsPreview}</span>
        <span className="ml-auto shrink-0 text-slate-500">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-white/5 px-3 py-2">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Arguments
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 font-mono text-slate-200">
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>

          {result && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {isError ? 'Error' : 'Result'}
              </div>
              <pre
                className={`overflow-x-auto whitespace-pre-wrap break-words rounded p-2 font-mono ${
                  isError ? 'bg-red-950/30 text-red-300' : 'bg-black/20 text-slate-200'
                }`}
              >
                {result.content}
              </pre>
            </div>
          )}

          {isPending && (
            <div className="italic text-slate-500">Waiting for result…</div>
          )}
        </div>
      )}
    </div>
  )
}
