import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { MessageAttachment } from '@shared/types'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAttach: () => void
  attachments: MessageAttachment[]
  onRemoveAttachment: (id: string) => void
  disabled?: boolean
}

const MAX_TEXTAREA_HEIGHT_PX = 200

export function ChatInput({
  value,
  onChange,
  onSend,
  onAttach,
  attachments,
  onRemoveAttachment,
  disabled = false
}: ChatInputProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`
  }, [value])

  const canSend = !disabled && value.trim().length > 0

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        onSend()
      }
    }
  }

  return (
    <div className="border-t border-white/5 bg-surface px-4 py-3">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1 text-xs text-slate-300"
            >
              <span className="max-w-[10rem] truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(attachment.id)}
                className="text-slate-500 transition hover:text-slate-100"
                aria-label={`Remove ${attachment.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={onAttach}
          disabled={disabled}
          aria-label="Attach file"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-slate-400 transition hover:bg-surface-muted hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          📎
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Message SyncSpace…"
          className="max-h-[200px] min-h-[40px] flex-1 resize-none rounded-2xl border border-white/5 bg-surface-muted px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-slate-500"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
