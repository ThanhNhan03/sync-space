export interface ScreenSectionProps {
  enabled: boolean
  onToggleEnabled: (enabled: boolean) => void
}

/**
 * Settings for the screen-interaction ("computer use") tools. Off by default because capturing
 * the screen and driving the mouse/keyboard is invasive; individual actions are still gated by
 * the Permissions rules even when this is on.
 */
export function ScreenSection({ enabled, onToggleEnabled }: ScreenSectionProps): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Screen control (computer use)</span>
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
        When enabled, the agent gets tools to capture the screen and control the mouse and keyboard —
        it can look at your screen, find elements, click, type, scroll, and drag. Every action is
        still subject to your Permissions rules (most default to “Ask”).
      </p>

      <ul className="space-y-2 text-xs text-slate-400">
        <li className="rounded-md bg-surface-muted px-3 py-2">
          <span className="font-medium text-slate-300">Windows only.</span> The input layer uses
          PowerShell/.NET; this feature is not available on macOS or Linux yet.
        </li>
        <li className="rounded-md bg-surface-muted px-3 py-2">
          <span className="font-medium text-slate-300">Vision needs a Claude API key.</span>{' '}
          <span className="font-mono">locate_on_screen</span> finds an element from a description
          using a Claude vision model — add a Claude key under the General tab.
        </li>
        <li className="rounded-md bg-surface-muted px-3 py-2">
          <span className="font-medium text-slate-300">Safety.</span> These tools act on your whole
          desktop, not just this app. Keep sensitive windows closed while the agent is driving, and
          use “Deny” in Permissions for anything you don’t want it to do.
        </li>
      </ul>
    </div>
  )
}
