import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { WorkspaceFilePreview } from '@shared/types'

import { formatBytes } from './formatBytes'
import { highlightCode } from './highlightSetup'
import { isMarkdownPath, languageForPath } from './languageForPath'

export interface FilePreviewModalProps {
  workspaceRoot: string
  relativePath: string
  onClose: () => void
}

const MARKDOWN_CLASSES =
  '[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 ' +
  '[&_a]:text-accent [&_a]:underline [&_strong]:font-semibold ' +
  '[&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] ' +
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-background-secondary [&_pre]:p-3 ' +
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 ' +
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-muted ' +
  '[&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 ' +
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1'

const actionButtonClass =
  'rounded-md bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary'

/**
 * Full-screen overlay that previews one workspace file: rendered markdown or syntax-highlighted
 * code for text, an inline image, or -- for PDFs and anything binary/oversized -- just metadata
 * plus Export / Open externally / Reveal-in-folder actions.
 */
export function FilePreviewModal({
  workspaceRoot,
  relativePath,
  onClose
}: FilePreviewModalProps): JSX.Element {
  const [preview, setPreview] = useState<WorkspaceFilePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPreview(null)
    setError(null)
    setShowRaw(false)
    setActionMessage(null)
    void (async () => {
      try {
        const result = await window.syncspace.previewWorkspaceFile(workspaceRoot, relativePath)
        if (!cancelled) setPreview(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceRoot, relativePath])

  const handleExport = async (): Promise<void> => {
    const result = await window.syncspace.exportWorkspaceFile(workspaceRoot, relativePath)
    setActionMessage(result.exported ? `Exported to ${result.path}` : null)
  }

  const handleOpenExternal = async (): Promise<void> => {
    const result = await window.syncspace.openWorkspaceFileExternal(workspaceRoot, relativePath)
    setActionMessage(result.opened ? null : `Couldn't open file${result.error ? `: ${result.error}` : '.'}`)
  }

  const handleShowInFolder = (): void => {
    void window.syncspace.showWorkspaceFileInFolder(workspaceRoot, relativePath)
  }

  const markdown = isMarkdownPath(relativePath)
  const language = languageForPath(relativePath)
  const highlighted =
    preview?.kind === 'text' && !markdown && !showRaw && preview.content
      ? language && highlightCode(preview.content, language)
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-soft">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {preview?.name ?? relativePath.split('/').pop()}
            </p>
            <p className="truncate font-mono text-xs text-text-muted">{relativePath}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 rounded p-1 text-text-muted hover:text-text-primary"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {error && <p className="text-sm text-error">Failed to preview file: {error}</p>}

          {!error && !preview && <p className="text-sm text-text-muted">Loading…</p>}

          {preview?.kind === 'text' && (
            <>
              {preview.truncated && (
                <p className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                  This file is {formatBytes(preview.size)} — showing a truncated preview.
                </p>
              )}
              {markdown && !showRaw ? (
                <div className={`max-w-none text-sm text-text-primary ${MARKDOWN_CLASSES}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content ?? ''}</ReactMarkdown>
                </div>
              ) : highlighted ? (
                <pre className="overflow-x-auto rounded-lg bg-background-secondary p-3 text-xs leading-relaxed">
                  <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                </pre>
              ) : (
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-background-secondary p-3 font-mono text-xs leading-relaxed text-text-primary">
                  {preview.content}
                </pre>
              )}
            </>
          )}

          {preview?.kind === 'image' && (
            <div className="flex justify-center">
              <img
                src={`data:${preview.mimeType};base64,${preview.content}`}
                alt={preview.name}
                className="max-h-[60vh] max-w-full rounded-lg border border-border-subtle object-contain"
              />
            </div>
          )}

          {preview?.kind === 'pdf' && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-text-secondary">PDF preview isn&apos;t available in-app yet.</p>
              <p className="text-xs text-text-muted">{formatBytes(preview.size)} — open it in your system viewer.</p>
            </div>
          )}

          {preview?.kind === 'binary' && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-text-secondary">This file can&apos;t be previewed here.</p>
              <p className="text-xs text-text-muted">{formatBytes(preview.size)}</p>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
          <span className="min-w-0 truncate text-xs text-text-muted">{actionMessage}</span>
          <div className="flex shrink-0 items-center gap-2">
            {markdown && preview?.kind === 'text' && (
              <button type="button" onClick={() => setShowRaw((v) => !v)} className={actionButtonClass}>
                {showRaw ? 'Rendered' : 'Source'}
              </button>
            )}
            <button type="button" onClick={handleShowInFolder} className={actionButtonClass}>
              Reveal in folder
            </button>
            <button type="button" onClick={() => void handleOpenExternal()} className={actionButtonClass}>
              Open externally
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Export…
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
