import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { MessageAttachment, Workspace } from '@shared/types'

export interface WelcomeViewProps {
  workspace: Workspace | null
  onSelectWorkspace: () => void
  attachments: MessageAttachment[]
  onAttach: () => void
  onRemoveAttachment: (id: string) => void
  onStart: (content: string) => void
  hasProviderKey: boolean
  onOpenSettings: () => void
}

const QUICK_TAGS: { id: string; label: string; prompt: string; icon: JSX.Element }[] = [
  {
    id: 'explain',
    label: 'Explain this codebase',
    prompt: 'Give me a high-level overview of this codebase: its structure, main modules, and how they fit together.',
    icon: <path d="M4 4h12v12H4z M7 8h6 M7 11h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
  },
  {
    id: 'bug',
    label: 'Find & fix a bug',
    prompt: 'Help me find and fix a bug. Start by asking me what the symptom is, then investigate the relevant files.',
    icon: <path d="M10 4v12 M6 7l8 6 M14 7l-8 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
  },
  {
    id: 'tests',
    label: 'Write tests',
    prompt: 'Write focused tests for a file I choose, following the existing test conventions in this project.',
    icon: <path d="M5 5h10v10H5z M8 10l1.5 1.5L13 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  },
  {
    id: 'summary',
    label: 'Summarize recent changes',
    prompt: 'Summarize the recent git changes in this workspace and explain what they do.',
    icon: <path d="M4 6h12 M4 10h12 M4 14h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
  }
]

const MAX_TEXTAREA_HEIGHT_PX = 200

export function WelcomeView({
  workspace,
  onSelectWorkspace,
  attachments,
  onAttach,
  onRemoveAttachment,
  onStart,
  hasProviderKey,
  onOpenSettings
}: WelcomeViewProps): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`
  }, [prompt])

  const canSubmit = Boolean(workspace) && (prompt.trim().length > 0 || attachments.length > 0)

  const submit = (): void => {
    if (!canSubmit) return
    onStart(prompt)
    setPrompt('')
    setSelectedTag(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const pickTag = (tag: (typeof QUICK_TAGS)[number]): void => {
    if (selectedTag === tag.id) {
      setSelectedTag(null)
      setPrompt('')
    } else {
      setSelectedTag(tag.id)
      setPrompt(tag.prompt)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-10">
      <div className="w-full max-w-[760px] animate-fade-in space-y-7">
        <div className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-3">
            <span className="flex h-16 w-16 items-center justify-center rounded-4xl bg-accent text-3xl font-bold text-white shadow-soft">
              S
            </span>
            <h1 className="text-[2.6rem] font-semibold leading-none tracking-tight text-text-primary">
              SyncSpace
            </h1>
          </div>
          <p className="text-base text-text-secondary">
            Your AI workspace companion — chat, run tools, and get work done in one folder.
          </p>
        </div>

        {!hasProviderKey && (
          <p className="text-center text-sm text-text-muted">
            No API key configured yet.{' '}
            <button
              type="button"
              onClick={onOpenSettings}
              className="font-medium text-accent hover:text-accent-hover"
            >
              Open Settings →
            </button>
          </p>
        )}

        {/* Quick-action pills */}
        <div className="flex flex-wrap justify-center gap-2">
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => pickTag(tag)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                selectedTag === tag.id
                  ? 'border-accent/40 bg-accent-muted text-accent'
                  : 'border-border-subtle bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4">
                {tag.icon}
              </svg>
              <span>{tag.label}</span>
            </button>
          ))}
        </div>

        {/* Input card */}
        <div className="rounded-4xl border border-border-muted bg-surface p-4 shadow-soft">
          {attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1 text-xs text-text-secondary"
                >
                  <span className="max-w-[10rem] truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                    className="text-text-muted hover:text-text-primary"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={workspace ? 'What should we work on?' : 'Select a workspace folder to begin…'}
            style={{ minHeight: '64px', maxHeight: '200px' }}
            className="w-full resize-none border-none bg-transparent text-base leading-relaxed text-text-primary outline-none placeholder:text-text-muted"
          />

          <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onSelectWorkspace}
                title={workspace?.rootPath ?? 'Select a workspace folder'}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  workspace ? 'text-text-secondary hover:text-text-primary' : 'text-accent hover:text-accent-hover'
                }`}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M2 4.75A1.75 1.75 0 0 1 3.75 3h3.19a1.75 1.75 0 0 1 1.237.513l.81.81a.75.75 0 0 0 .53.22h6.733A1.75 1.75 0 0 1 18 6.28v8.97A1.75 1.75 0 0 1 16.25 17H3.75A1.75 1.75 0 0 1 2 15.25V4.75z" />
                </svg>
                <span className="max-w-[16rem] truncate">
                  {workspace ? workspace.name : 'Select workspace'}
                </span>
              </button>

              <button
                type="button"
                onClick={onAttach}
                className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path
                    d="M13.5 5.5 7 12a2 2 0 1 0 2.83 2.83l6-6a3.5 3.5 0 1 0-4.95-4.95l-6.5 6.5a5 5 0 0 0 7.07 7.07L15 14"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Attach</span>
              </button>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>Let&apos;s go</span>
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                <path d="M4 10h11 M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
