import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage, CompactionSettings } from '@shared/types'
import type { CompactionRepository, CompactionState } from '@database/repositories'
import type { LLMProvider } from '@providers/LLMProvider'

import { ConversationCompactor } from './ConversationCompactor'

/** Minimal in-memory stand-in for CompactionRepository (better-sqlite3 can't load under vitest). */
class FakeRepo {
  readonly map = new Map<string, CompactionState>()
  get(sessionId: string): CompactionState | undefined {
    return this.map.get(sessionId)
  }
  upsert(sessionId: string, summary: string, throughMessageId: string, throughCreatedAt: number): void {
    this.map.set(sessionId, {
      summary,
      summarizedThroughMessageId: throughMessageId,
      summarizedThroughCreatedAt: throughCreatedAt,
      updatedAt: Date.now()
    })
  }
  clear(sessionId: string): void {
    this.map.delete(sessionId)
  }
}

function repo(): { fake: FakeRepo; typed: CompactionRepository } {
  const fake = new FakeRepo()
  return { fake, typed: fake as unknown as CompactionRepository }
}

function providerReturning(content: string): LLMProvider {
  return {
    complete: vi.fn(async () => ({ content, toolCalls: [], stopReason: 'stop' as const }))
  } as unknown as LLMProvider
}

function throwingProvider(error: unknown): LLMProvider {
  return { complete: vi.fn(async () => Promise.reject(error)) } as unknown as LLMProvider
}

const DEFAULT_SETTINGS: CompactionSettings = { enabled: true, thresholdChars: 100, keepRecentChars: 20 }

let seq = 0
function msg(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content'>): ChatMessage {
  seq += 1
  return { id: `m${seq}`, sessionId: 's1', createdAt: seq, ...overrides }
}

/** A history with several small turns, well over DEFAULT_SETTINGS.thresholdChars in total. */
function makeLongHistory(): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (let i = 0; i < 8; i++) {
    messages.push(msg({ role: 'user', content: `question number ${i} `.repeat(3) }))
    messages.push(msg({ role: 'assistant', content: `answer number ${i} `.repeat(3) }))
  }
  return messages
}

describe('ConversationCompactor.getEffectiveHistory', () => {
  it('is a no-op when disabled, returning the full history untouched', async () => {
    const { typed } = repo()
    const compactor = new ConversationCompactor(typed, () => ({ ...DEFAULT_SETTINGS, enabled: false }))
    const history = makeLongHistory()
    const provider = providerReturning('summary')

    const result = await compactor.getEffectiveHistory(provider, 'gpt-test', 's1', history)

    expect(result).toEqual({ promptSection: '', effectiveHistory: history })
    expect(provider.complete).not.toHaveBeenCalled()
  })

  it('is a no-op (no LLM call) when the history is under the threshold', async () => {
    const { typed } = repo()
    const settings: CompactionSettings = { enabled: true, thresholdChars: 1_000_000, keepRecentChars: 20 }
    const compactor = new ConversationCompactor(typed, () => settings)
    const history = makeLongHistory()
    const provider = providerReturning('summary')

    const result = await compactor.getEffectiveHistory(provider, 'gpt-test', 's1', history)

    expect(result.effectiveHistory).toBe(history)
    expect(provider.complete).not.toHaveBeenCalled()
  })

  it('summarizes over threshold and persists the cursor at the LAST summarized message (off-by-one guard)', async () => {
    const { fake, typed } = repo()
    const compactor = new ConversationCompactor(typed, () => DEFAULT_SETTINGS)
    const history = makeLongHistory()
    const provider = providerReturning('the rolling summary')

    const result = await compactor.getEffectiveHistory(provider, 'gpt-test', 's1', history)

    expect(provider.complete).toHaveBeenCalledTimes(1)
    expect(result.promptSection).toContain('the rolling summary')
    expect(result.effectiveHistory[0].role).toBe('user') // safe boundary preserved

    const stored = fake.get('s1')
    expect(stored).toBeDefined()
    // The stored cursor must point at the LAST message that was actually summarized (i.e. the
    // message immediately before effectiveHistory[0] in the full history), not the first kept
    // message -- using tail[cutoffIndex] instead of tail[cutoffIndex - 1] would silently and
    // permanently drop that message from every future tail.
    const cutoffIndexInFullHistory = history.findIndex((m) => m.id === result.effectiveHistory[0].id)
    expect(stored?.summarizedThroughMessageId).toBe(history[cutoffIndexInFullHistory - 1].id)
  })

  it('on a second call, only summarizes the newly-elapsed tail and merges with the previous summary', async () => {
    const { fake, typed } = repo()
    const compactor = new ConversationCompactor(typed, () => DEFAULT_SETTINGS)
    const history = makeLongHistory()

    const firstProvider = providerReturning('first summary')
    const first = await compactor.getEffectiveHistory(firstProvider, 'gpt-test', 's1', history)
    const storedAfterFirst = fake.get('s1')
    expect(storedAfterFirst).toBeDefined()

    // Simulate more turns appended after the first compaction.
    const grown = [...history, ...makeLongHistory()]
    const secondProvider = providerReturning('second summary')
    const second = await compactor.getEffectiveHistory(secondProvider, 'gpt-test', 's1', grown)

    // The user-prompt passed to the second call must reference the first summary.
    const secondCallArgs = (secondProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(secondCallArgs.messages[0].content).toContain('first summary')
    expect(second.promptSection).toContain('second summary')
    void first
  })

  it('degrades gracefully when the provider call throws: sends the full tail, keeps any existing summary', async () => {
    const { fake, typed } = repo()
    fake.upsert('s1', 'existing summary', 'm2', 2)
    const compactor = new ConversationCompactor(typed, () => DEFAULT_SETTINGS)
    const history = makeLongHistory()
    const provider = throwingProvider(new Error('rate limited'))

    const result = await compactor.getEffectiveHistory(provider, 'gpt-test', 's1', history)

    expect(result.promptSection).toContain('existing summary')
    // Cursor/summary must be unchanged after a failed attempt.
    expect(fake.get('s1')?.summary).toBe('existing summary')
  })

  it('does not call the LLM for a single oversized still-open turn (cutoffIndex === 0)', async () => {
    const { typed } = repo()
    const settings: CompactionSettings = { enabled: true, thresholdChars: 10, keepRecentChars: 5 }
    const compactor = new ConversationCompactor(typed, () => settings)
    // A single user message already exceeds the threshold with no safe boundary before it.
    const history: ChatMessage[] = [msg({ role: 'user', content: 'a single very long message here' })]
    const provider = providerReturning('should not be called')
    const activeCalls: boolean[] = []

    const result = await compactor.getEffectiveHistory(provider, 'gpt-test', 's1', history, (active) =>
      activeCalls.push(active)
    )

    expect(provider.complete).not.toHaveBeenCalled()
    expect(result.effectiveHistory).toEqual(history)
    expect(activeCalls).toEqual([]) // no "compacting..." flicker for a no-op
  })

  it('treats an unresolvable stored cursor defensively as "no stored state" rather than crashing', async () => {
    const { fake, typed } = repo()
    fake.upsert('s1', 'orphaned summary', 'does-not-exist-anymore', 999)
    const compactor = new ConversationCompactor(typed, () => DEFAULT_SETTINGS)
    const history = makeLongHistory()
    const provider = providerReturning('new summary')

    const result = await compactor.getEffectiveHistory(provider, 'gpt-test', 's1', history)

    expect(result).toBeDefined()
    expect(provider.complete).toHaveBeenCalledTimes(1)
  })
})

describe('ConversationCompactor.manualCompact', () => {
  it('bypasses the threshold gate and reports compacted:true on success', async () => {
    const { typed } = repo()
    const settings: CompactionSettings = { enabled: true, thresholdChars: 1_000_000, keepRecentChars: 20 }
    const compactor = new ConversationCompactor(typed, () => settings)
    const history = makeLongHistory()
    const provider = providerReturning('manual summary')

    const result = await compactor.manualCompact(provider, 'gpt-test', 's1', history)

    expect(provider.complete).toHaveBeenCalledTimes(1)
    expect(result.compacted).toBe(true)
    expect(result.promptSection).toContain('manual summary')
  })

  it('reports compacted:false when there is nothing safe to cut', async () => {
    const { typed } = repo()
    const compactor = new ConversationCompactor(typed, () => DEFAULT_SETTINGS)
    const history: ChatMessage[] = [msg({ role: 'user', content: 'only one message' })]
    const provider = providerReturning('unused')

    const result = await compactor.manualCompact(provider, 'gpt-test', 's1', history)

    expect(result.compacted).toBe(false)
    expect(provider.complete).not.toHaveBeenCalled()
  })
})

describe('ConversationCompactor.getStatus', () => {
  it('reports compacted:false when nothing is stored', () => {
    const { typed } = repo()
    const compactor = new ConversationCompactor(typed, () => DEFAULT_SETTINGS)
    expect(compactor.getStatus('s1', makeLongHistory())).toEqual({ compacted: false })
  })

  it('reports the summarized message count and timestamp when a summary exists', () => {
    const { fake, typed } = repo()
    const history = makeLongHistory()
    fake.upsert('s1', 'a summary', history[3].id, history[3].createdAt)
    const compactor = new ConversationCompactor(typed, () => DEFAULT_SETTINGS)

    const status = compactor.getStatus('s1', history)

    expect(status.compacted).toBe(true)
    expect(status.summarizedMessageCount).toBe(4) // messages[0..3] inclusive
    expect(status.updatedAt).toBeDefined()
  })
})
