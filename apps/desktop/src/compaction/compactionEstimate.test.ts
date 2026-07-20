import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@shared/types'

import { estimateChars, findSafeCutoffIndex } from './compactionEstimate'

let seq = 0
function msg(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content'>): ChatMessage {
  seq += 1
  return {
    id: `m${seq}`,
    sessionId: 's1',
    createdAt: seq,
    ...overrides
  }
}

let turnCounter = 0

/** One complete turn: a user message, then N tool round-trips, then a final assistant answer. */
function makeTurn(userText: string, toolRoundTrips: number, finalText: string): ChatMessage[] {
  turnCounter += 1
  const turn: ChatMessage[] = [msg({ role: 'user', content: userText })]
  for (let i = 0; i < toolRoundTrips; i++) {
    const callId = `call-t${turnCounter}-${i}`
    turn.push(
      msg({
        role: 'assistant',
        content: '',
        toolCalls: [{ id: callId, name: 'read_file', arguments: { path: `file${i}.txt` } }]
      })
    )
    turn.push(msg({ role: 'tool', content: 'x'.repeat(500), toolCallId: callId }))
  }
  turn.push(msg({ role: 'assistant', content: finalText }))
  return turn
}

describe('estimateChars', () => {
  it('sums plain message content length', () => {
    const messages = [msg({ role: 'user', content: 'hello' }), msg({ role: 'assistant', content: 'world' })]
    expect(estimateChars(messages)).toBe(10)
  })

  it('counts toolCalls JSON so tool-call-only messages are not undercounted', () => {
    const toolCalls = [{ id: 'c1', name: 'write_file', arguments: { path: 'a.txt', content: 'x'.repeat(100) } }]
    const withToolCall = msg({ role: 'assistant', content: '', toolCalls })
    expect(estimateChars([withToolCall])).toBe(JSON.stringify(toolCalls).length)
    expect(estimateChars([withToolCall])).toBeGreaterThan(100)
  })

  it('returns 0 for an empty array', () => {
    expect(estimateChars([])).toBe(0)
  })
})

describe('findSafeCutoffIndex', () => {
  it('returns 0 for an empty history', () => {
    expect(findSafeCutoffIndex([], 100)).toBe(0)
  })

  it('returns 0 for a single-message history', () => {
    expect(findSafeCutoffIndex([msg({ role: 'user', content: 'hi' })], 1)).toBe(0)
  })

  it('returns 0 when the whole history is smaller than keepRecentChars', () => {
    const messages = makeTurn('short question', 1, 'short answer')
    expect(findSafeCutoffIndex(messages, 1_000_000)).toBe(0)
  })

  it('cuts only at a user-message boundary, never mid tool-call/tool-result group', () => {
    // Three turns, each with a couple of tool round-trips producing plenty of bulk.
    const turn1 = makeTurn('turn one', 2, 'answer one')
    const turn2 = makeTurn('turn two', 2, 'answer two')
    const turn3 = makeTurn('turn three', 2, 'answer three')
    const messages = [...turn1, ...turn2, ...turn3]

    // keepRecentChars sized to land the raw backward-walk candidate somewhere inside turn3's
    // tool round-trips (not exactly on its boundary) -- the snap-back must still land on 'user'.
    const cutoff = findSafeCutoffIndex(messages, 600)

    expect(messages[cutoff].role).toBe('user')
    // Every message before the cutoff, summarized away, is fine to be "unsafe" on its own --
    // the important invariant is only about the KEPT tail's first message.
    expect(cutoff).toBeGreaterThan(0)
    expect(cutoff).toBeLessThan(messages.length)
  })

  it('returns 0 for a single oversized still-open turn (no earlier user boundary exists)', () => {
    // One user message followed by many tool round-trips that alone exceed keepRecentChars,
    // with NO final assistant message yet (turn still open) and no second user message.
    turnCounter += 1
    const turn: ChatMessage[] = [msg({ role: 'user', content: 'do a big multi-step task' })]
    for (let i = 0; i < 20; i++) {
      const callId = `call-oversized-${i}`
      turn.push(
        msg({ role: 'assistant', content: '', toolCalls: [{ id: callId, name: 'read_file', arguments: { path: `f${i}` } }] })
      )
      turn.push(msg({ role: 'tool', content: 'y'.repeat(2000), toolCallId: callId }))
    }

    expect(findSafeCutoffIndex(turn, 500)).toBe(0)
  })

  it('widens the kept tail rather than ever returning an unsafe index', () => {
    const turn1 = makeTurn('first', 5, 'done one')
    const turn2 = makeTurn('second', 1, 'done two')
    const messages = [...turn1, ...turn2]

    // Sweep a range of keepRecentChars values; whatever is returned must always be a safe
    // boundary (role 'user', or 0).
    for (const keep of [50, 200, 800, 1500, 3000, 10_000]) {
      const cutoff = findSafeCutoffIndex(messages, keep)
      expect(cutoff === 0 || messages[cutoff].role === 'user').toBe(true)
    }
  })
})
