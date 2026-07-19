import type { ChatMessage, MemoryCategory } from '@shared/types'

import { MEMORY_CATEGORIES } from './memoryPrompt'

export type MemoryAction =
  | { op: 'add'; category: MemoryCategory; content: string }
  | { op: 'update'; id: string; content: string }
  | { op: 'delete'; id: string }

/**
 * Tolerantly extract the JSON object from an LLM response: strip ``` fences, then fall back
 * to the first {...} span. Mirrors OpenCowork's `extractJson` leniency so a model that wraps
 * its answer in prose or a code fence still parses.
 */
function extractJsonObject(text: string): unknown {
  const withoutFences = text.replace(/```(?:json)?/gi, '').trim()
  const candidates = [withoutFences]
  const braceMatch = withoutFences.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    candidates.push(braceMatch[0])
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try the next candidate
    }
  }
  return null
}

function isCategory(value: unknown): value is MemoryCategory {
  return typeof value === 'string' && (MEMORY_CATEGORIES as string[]).includes(value)
}

/** Parse and validate the extractor's `{ actions: [...] }` output into typed actions. */
export function parseMemoryActions(text: string): MemoryAction[] {
  const parsed = extractJsonObject(text)
  if (!parsed || typeof parsed !== 'object') {
    return []
  }
  const rawActions = (parsed as { actions?: unknown }).actions
  if (!Array.isArray(rawActions)) {
    return []
  }

  const actions: MemoryAction[] = []
  for (const raw of rawActions) {
    if (!raw || typeof raw !== 'object') continue
    const op = (raw as { op?: unknown }).op
    const id = (raw as { id?: unknown }).id
    const content = (raw as { content?: unknown }).content
    const category = (raw as { category?: unknown }).category

    if (op === 'add' && typeof content === 'string' && content.trim()) {
      actions.push({
        op: 'add',
        category: isCategory(category) ? category : 'fact',
        content: content.trim()
      })
    } else if (op === 'update' && typeof id === 'string' && id && typeof content === 'string' && content.trim()) {
      actions.push({ op: 'update', id, content: content.trim() })
    } else if (op === 'delete' && typeof id === 'string' && id) {
      actions.push({ op: 'delete', id })
    }
  }
  return actions
}

const MAX_TRANSCRIPT_MESSAGES = 16
const MAX_MESSAGE_CHARS = 2000

/**
 * Flatten recent chat messages into a compact transcript for the extractor. Only user and
 * assistant turns with text are included (tool traffic is noise for durable-fact extraction),
 * bounded to the most recent messages and truncated per message to keep the prompt small.
 */
export function transcriptFromMessages(messages: ChatMessage[]): string {
  const relevant = messages.filter(
    (message) => (message.role === 'user' || message.role === 'assistant') && message.content.trim()
  )
  const recent = relevant.slice(-MAX_TRANSCRIPT_MESSAGES)
  return recent
    .map((message) => {
      const content =
        message.content.length > MAX_MESSAGE_CHARS
          ? `${message.content.slice(0, MAX_MESSAGE_CHARS)}…`
          : message.content
      return `${message.role}: ${content}`
    })
    .join('\n')
}
