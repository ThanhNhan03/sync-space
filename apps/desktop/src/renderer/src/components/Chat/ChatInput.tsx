import { useEffect, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import type { MessageAttachment } from '@shared/types'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAttach: () => void
  attachments: MessageAttachment[]
  onRemoveAttachment: (id: string) => void
  onFilesDropped: (files: FileList) => void
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
  onFilesDropped,
  disabled = false
}: ChatInputProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const handleDragOver = (event: DragEvent): void => {
    event.preventDefault()
    setDragActive(true)
  }
  const handleDragLeave = (event: DragEvent): void => {
    event.preventDefault()
    setDragActive(false)
  }
  const handleDrop = (event: DragEvent): void => {
    event.preventDefault()
    setDragActive(false)
    if (event.dataTransfer.files.length > 0) {
      onFilesDropped(event.dataTransfer.files)
    }
  }

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
    <div
      className="border-t border-border-subtle bg-background px-4 py-3"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1 text-xs text-text-secondary"
            >
              <span className="max-w-[10rem] truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(attachment.id)}
                className="text-text-muted transition hover:text-text-primary"
                aria-label={`Remove ${attachment.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-4xl border bg-surface p-1.5 shadow-soft transition-colors ${
          dragActive ? 'border-dashed border-accent bg-accent-muted' : 'border-border-muted'
        }`}
      >
        <button
          type="button"
          onClick={onAttach}
          disabled={disabled}
          aria-label="Attach file"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-text-muted transition hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
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
          className="max-h-[200px] min-h-[36px] flex-1 resize-none border-none bg-transparent px-2 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send message"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
