import { randomUUID } from 'node:crypto'

import type { ChatMessage, CompactionSettings, CompactionStatus } from '@shared/types'
import type { CompactionRepository } from '@database/repositories'
import type { LLMProvider } from '@providers/LLMProvider'

import { estimateChars, findSafeCutoffIndex } from './compactionEstimate'
import { buildCompactionTranscript } from './compactionTranscript'
import {
  buildCompactionPromptSection,
  buildCompactionUserPrompt,
  COMPACTION_SYSTEM_PROMPT
} from './compactionPrompts'

/** Cap on the summarization call's own prompt -- see buildCompactionTranscript's doc comment. */
const MAX_TRANSCRIPT_CHARS = 40_000

export interface EffectiveHistory {
  /** System-prompt section carrying the rolling summary, or '' when there is none yet. */
  promptSection: string
  /** The messages to actually send to the provider this turn (a suffix of fullHistory). */
  effectiveHistory: ChatMessage[]
}

/**
 * Keeps a session's provider-facing history bounded by summarizing an older prefix into a
 * rolling summary once the uncompacted tail exceeds a threshold, while recent turns stay
 * verbatim. Never touches persisted SQLite messages -- only what's sent to the provider on the
 * next turn changes. Mirrors MemoryManager's shape: the repo + a settings getter are injected at
 * construction, the LLM provider is passed into each call rather than stored.
 */
export class ConversationCompactor {
  constructor(
    private readonly repo: CompactionRepository,
    private readonly getSettings: () => CompactionSettings
  ) {}

  /** Split fullHistory into "already summarized" (before the stored cursor) and the live tail. */
  private splitTail(sessionId: string, fullHistory: ChatMessage[]): { summary: string | null; tail: ChatMessage[] } {
    const stored = this.repo.get(sessionId)
    if (!stored) {
      return { summary: null, tail: fullHistory }
    }
    const cursorIndex = fullHistory.findIndex((m) => m.id === stored.summarizedThroughMessageId)
    if (cursorIndex === -1) {
      // Defensive: the stored cursor doesn't resolve against the current history (shouldn't
      // happen, messages are never deleted individually). Treat as "no stored state" rather
      // than risk indexing incorrectly.
      return { summary: stored.summary, tail: fullHistory }
    }
    return { summary: stored.summary, tail: fullHistory.slice(cursorIndex + 1) }
  }

  async getEffectiveHistory(
    provider: LLMProvider,
    model: string,
    sessionId: string,
    fullHistory: ChatMessage[],
    onCompactionActive?: (active: boolean) => void
  ): Promise<EffectiveHistory> {
    const settings = this.getSettings()
    if (!settings.enabled) {
      return { promptSection: '', effectiveHistory: fullHistory }
    }

    const { summary, tail } = this.splitTail(sessionId, fullHistory)
    if (estimateChars(tail) <= settings.thresholdChars) {
      return { promptSection: buildCompactionPromptSection(summary), effectiveHistory: tail }
    }

    return this.compact(provider, model, sessionId, tail, summary, settings, onCompactionActive)
  }

  /** Same as getEffectiveHistory but skips the threshold gate, for a user-triggered "Compact now". */
  async manualCompact(
    provider: LLMProvider,
    model: string,
    sessionId: string,
    fullHistory: ChatMessage[],
    onCompactionActive?: (active: boolean) => void
  ): Promise<EffectiveHistory & { compacted: boolean }> {
    const settings = this.getSettings()
    const { summary, tail } = this.splitTail(sessionId, fullHistory)
    const before = this.repo.get(sessionId)
    const result = await this.compact(provider, model, sessionId, tail, summary, settings, onCompactionActive)
    const after = this.repo.get(sessionId)
    const compacted = after !== undefined && after.updatedAt !== before?.updatedAt
    return { ...result, compacted }
  }

  getStatus(sessionId: string, fullHistory: ChatMessage[]): CompactionStatus {
    const stored = this.repo.get(sessionId)
    if (!stored) {
      return { compacted: false }
    }
    const cursorIndex = fullHistory.findIndex((m) => m.id === stored.summarizedThroughMessageId)
    return {
      compacted: true,
      summarizedMessageCount: cursorIndex === -1 ? undefined : cursorIndex + 1,
      updatedAt: stored.updatedAt
    }
  }

  private async compact(
    provider: LLMProvider,
    model: string,
    sessionId: string,
    tail: ChatMessage[],
    existingSummary: string | null,
    settings: CompactionSettings,
    onCompactionActive?: (active: boolean) => void
  ): Promise<EffectiveHistory> {
    const cutoffIndex = findSafeCutoffIndex(tail, settings.keepRecentChars)
    if (cutoffIndex === 0) {
      // Nothing safe to cut yet (a single oversized still-open turn, or the tail is already
      // minimal) -- must be checked before touching the LLM so this doesn't flicker a
      // "Compacting..." indicator or burn an API call every turn for a no-op.
      return { promptSection: buildCompactionPromptSection(existingSummary), effectiveHistory: tail }
    }

    onCompactionActive?.(true)
    try {
      const transcript = buildCompactionTranscript(tail.slice(0, cutoffIndex), MAX_TRANSCRIPT_CHARS)
      const result = await provider.complete({
        model,
        temperature: 0,
        systemPrompt: COMPACTION_SYSTEM_PROMPT,
        messages: [
          {
            id: `compact-${randomUUID()}`,
            sessionId,
            role: 'user',
            content: buildCompactionUserPrompt(existingSummary, transcript),
            createdAt: Date.now()
          }
        ],
        tools: []
      })

      const newSummary = result.content.trim()
      if (!newSummary) {
        throw new Error('summarization returned an empty result')
      }

      // The last SUMMARIZED message, not the first kept one -- persisting tail[cutoffIndex]
      // here would silently and permanently exclude that message from every future tail.
      const lastSummarized = tail[cutoffIndex - 1]
      this.repo.upsert(sessionId, newSummary, lastSummarized.id, lastSummarized.createdAt)

      return { promptSection: buildCompactionPromptSection(newSummary), effectiveHistory: tail.slice(cutoffIndex) }
    } catch (error) {
      // Synchronous and blocking (unlike memory's fire-and-forget extraction) -- a failure here
      // must never kill the user's current turn. Degrade to sending the full tail uncompacted,
      // keeping whatever summary already existed.
      console.error('[Compaction] summarization failed, sending full tail uncompacted:', error)
      return { promptSection: buildCompactionPromptSection(existingSummary), effectiveHistory: tail }
    } finally {
      onCompactionActive?.(false)
    }
  }
}
