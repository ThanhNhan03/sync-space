interface ThinkingIndicatorProps {
  active: boolean
}

export function ThinkingIndicator({ active }: ThinkingIndicatorProps): JSX.Element | null {
  if (!active) {
    return null
  }

  return (
    <div className="flex items-center gap-2 px-1 py-2 text-xs text-slate-400">
      <span className="font-medium">SyncSpace is thinking</span>
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
      </span>
    </div>
  )
}
