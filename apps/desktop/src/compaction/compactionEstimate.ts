import type { ChatMessage } from '@shared/types'

/**
 * Cutoff selection for conversation compaction. Every persisted session history is a
 * concatenation of turns shaped `user, [assistant(toolCalls), tool, tool, ...]*,
 * assistant(final, no toolCalls)` -- sendMessage() always appends the user message first, and
 * AgentRunner's loop only returns once an assistant reply has no toolCalls. So a 'user'-role
 * message is never preceded by an unfinished tool round-trip, and Anthropic's Messages API
 * separately requires the first entry it's sent to have role 'user' (see providers/claude.ts).
 * Both facts collapse to one rule: index `i` is a safe cut point iff `messages[i].role ===
 * 'user'` or `i === 0`. No need to inspect `messages[i-1]` at all -- the discarded prefix is
 * never sent to a provider as ChatMessage[], only flattened into one summarization prompt.
 */

/**
 * Rough size of a message as sent to a provider. `content.length` alone undercounts messages
 * that carry a tool call with an empty `content` and the real payload in `toolCalls[].arguments`
 * (e.g. write_file, execute_terminal) -- exactly the exchanges most worth compacting.
 */
function messageChars(message: ChatMessage): number {
  const toolCallsChars = message.toolCalls ? JSON.stringify(message.toolCalls).length : 0
  return message.content.length + toolCallsChars
}

export function estimateChars(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + messageChars(message), 0)
}

function isSafeBoundary(messages: ChatMessage[], index: number): boolean {
  if (index <= 0 || index >= messages.length) {
    return true
  }
  return messages[index].role === 'user'
}

/**
 * Find the index that splits `messages` into `slice(0, i)` (safe to summarize) and `slice(i)`
 * (safe to keep and send verbatim, on its own). Walks backward accumulating size until at least
 * `keepRecentChars` worth of trailing content is captured, then snaps backward (never forward --
 * widening the kept tail is always safe, narrowing it risks splitting a tool-call/tool-result
 * group) to the nearest safe boundary. Returns 0 when there's nothing worth cutting (the whole
 * history is smaller than `keepRecentChars`) or when no safe boundary precedes the candidate --
 * a single still-open, oversized turn -- in which case the caller should treat this as a no-op
 * and retry once that turn closes with a following user message.
 */
export function findSafeCutoffIndex(messages: ChatMessage[], keepRecentChars: number): number {
  if (messages.length <= 1) {
    return 0
  }

  let accumulated = 0
  let candidate = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    accumulated += messageChars(messages[i])
    if (accumulated >= keepRecentChars) {
      candidate = i
      break
    }
  }
  if (candidate === -1) {
    return 0
  }

  for (let i = candidate; i >= 0; i--) {
    if (isSafeBoundary(messages, i)) {
      return i
    }
  }
  return 0
}
