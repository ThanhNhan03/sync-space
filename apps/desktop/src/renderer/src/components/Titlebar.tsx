export interface TitlebarProps {
  onOpenSettings: () => void
  onToggleSidebar: () => void
}

/** Branded top bar: app mark + name on the left, sidebar toggle + settings on the right. */
export function Titlebar({ onOpenSettings, onToggleSidebar }: TitlebarProps): JSX.Element {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border-subtle bg-background-secondary px-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path
              d="M3 4.5h14M3 10h14M3 15.5h14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-white shadow-soft">
            S
          </span>
          <span className="text-sm font-semibold tracking-tight text-text-primary">SyncSpace</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Open settings"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-[18px] w-[18px]">
          <path
            fillRule="evenodd"
            d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.24 1.192c.484.15.938.359 1.353.62l1.017-.63a1 1 0 0 1 1.276.149l.962.962a1 1 0 0 1 .15 1.276l-.632 1.017c.26.415.469.87.62 1.353l1.192.24a1 1 0 0 1 .804.98v1.36a1 1 0 0 1-.804.98l-1.192.24c-.15.484-.36.938-.62 1.353l.63 1.017a1 1 0 0 1-.148 1.276l-.962.962a1 1 0 0 1-1.276.15l-1.017-.632c-.415.26-.87.469-1.353.62l-.24 1.192a1 1 0 0 1-.98.804h-1.36a1 1 0 0 1-.98-.804l-.24-1.192a6.02 6.02 0 0 1-1.353-.62l-1.017.63a1 1 0 0 1-1.276-.148l-.962-.962a1 1 0 0 1-.15-1.276l.632-1.017a6.02 6.02 0 0 1-.62-1.353l-1.192-.24a1 1 0 0 1-.804-.98v-1.36a1 1 0 0 1 .804-.98l1.192-.24c.15-.484.36-.938.62-1.353l-.63-1.017a1 1 0 0 1 .148-1.276l.962-.962a1 1 0 0 1 1.276-.15l1.017.632c.415-.26.87-.469 1.353-.62l.24-1.192ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </header>
  )
}
