import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@shared/types'

interface MessageBubbleProps {
  message: ChatMessage
}

const MARKDOWN_CLASSES =
  '[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 ' +
  '[&_a]:text-accent [&_a]:underline [&_strong]:font-semibold ' +
  '[&_code]:rounded [&_code]:bg-black/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] ' +
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/30 [&_pre]:p-3 ' +
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 ' +
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 ' +
  '[&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 ' +
  '[&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1'

export function MessageBubble({ message }: MessageBubbleProps): JSX.Element | null {
  if (message.role === 'tool' || message.role === 'system') {
    return null
  }

  const isUser = message.role === 'user'

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? 'border border-accent/30 bg-accent/20 text-slate-50'
            : 'bg-surface-muted text-slate-200'
        }`}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full bg-black/20 px-2 py-1 text-xs text-slate-300"
              >
                📎 {attachment.name}
              </span>
            ))}
          </div>
        )}

        <div className={MARKDOWN_CLASSES}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
