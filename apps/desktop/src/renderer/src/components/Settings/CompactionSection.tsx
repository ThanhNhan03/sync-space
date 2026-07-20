import type { CompactionSettings } from '@shared/types'

export interface CompactionSectionProps {
  settings: CompactionSettings
  onChange: (settings: CompactionSettings) => void
}

const inputClass =
  'w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent'

/**
 * Settings for conversation compaction: once a session's uncompacted history grows past
 * `thresholdChars`, an older prefix is summarized into a rolling summary (via one extra model
 * call) while the most recent `keepRecentChars` worth of the conversation stays verbatim. Keeps
 * long sessions from eventually overflowing the model's context window.
 */
export function CompactionSection({ settings, onChange }: CompactionSectionProps): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Conversation compaction</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
            className="accent-accent"
          />
          Enabled
        </label>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        When a session's history grows too large to keep sending in full, an older portion is
        summarized (via one extra model call) while recent turns stay verbatim. Your full chat
        transcript is never affected — only what's sent to the model on the next turn changes.
      </p>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-300">Threshold (characters)</span>
        <input
          type="number"
          min={5_000}
          step={1_000}
          value={settings.thresholdChars}
          onChange={(e) => onChange({ ...settings, thresholdChars: Number(e.target.value) })}
          disabled={!settings.enabled}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-slate-500">
          Summarize once the uncompacted history exceeds this size (~4 characters per token).
        </span>
      </label>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block font-medium text-gray-300">Keep recent (characters)</span>
        <input
          type="number"
          min={500}
          step={1_000}
          value={settings.keepRecentChars}
          onChange={(e) => onChange({ ...settings, keepRecentChars: Number(e.target.value) })}
          disabled={!settings.enabled}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-slate-500">
          How much of the conversation stays verbatim (not summarized) after a compaction pass.
        </span>
      </label>
    </div>
  )
}
