import type { ChatMessage } from '@shared/types'

const MAX_MESSAGE_CHARS = 4_000
const TRUNCATION_MARKER = '…[truncated]'

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }
  return `${text.slice(0, maxChars)}${TRUNCATION_MARKER}`
}

function renderMessage(message: ChatMessage): string {
  if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
    const calls = message.toolCalls
      .map((call) => `${call.name} ${truncate(JSON.stringify(call.arguments), MAX_MESSAGE_CHARS)}`)
      .join('; ')
    const text = message.content.trim()
    return text
      ? `assistant: ${truncate(text, MAX_MESSAGE_CHARS)} (tool_call: ${calls})`
      : `assistant (tool_call: ${calls})`
  }
  return `${message.role}: ${truncate(message.content, MAX_MESSAGE_CHARS)}`
}

/**
 * Render a message prefix (the portion of history being summarized away) into plain text for
 * the compaction LLM call. Unlike memory's `transcriptFromMessages`, this includes every role
 * (tool calls and tool results are exactly what the compaction prompt asks to preserve-or-
 * compress) and isn't capped to a fixed recent-message count, since it's summarizing an
 * arbitrary-length prefix rather than "the last N messages."
 *
 * Per-message content is truncated first, then -- since the summarization call's own prompt is
 * not immune to the same context-window limit this feature exists to avoid -- the *rendered*
 * transcript is capped to `maxChars` overall by keeping only its most-recent portion. Persisted
 * SQLite storage is never touched either way; this only affects what's fed to the summarizer.
 */
export function buildCompactionTranscript(messages: ChatMessage[], maxChars: number): string {
  const rendered = messages.map(renderMessage).join('\n')
  if (rendered.length <= maxChars) {
    return rendered
  }
  return `${TRUNCATION_MARKER}\n${rendered.slice(rendered.length - maxChars)}`
}
