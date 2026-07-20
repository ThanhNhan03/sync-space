import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@shared/types'

import { buildCompactionTranscript } from './compactionTranscript'

function msg(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content'>): ChatMessage {
  return { id: 'm1', sessionId: 's1', createdAt: 0, ...overrides }
}

describe('buildCompactionTranscript', () => {
  it('renders plain user/assistant messages as "role: content"', () => {
    const transcript = buildCompactionTranscript(
      [msg({ role: 'user', content: 'read config.json' }), msg({ role: 'assistant', content: 'Sure thing.' })],
      100_000
    )
    expect(transcript).toBe('user: read config.json\nassistant: Sure thing.')
  })

  it('renders a tool-call assistant message including the tool name and arguments', () => {
    const message = msg({
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'c1', name: 'read_file', arguments: { path: 'config.json' } }]
    })
    const transcript = buildCompactionTranscript([message], 100_000)
    expect(transcript).toContain('assistant (tool_call: read_file')
    expect(transcript).toContain('"path":"config.json"')
  })

  it('renders tool-result messages with the tool role prefix', () => {
    const transcript = buildCompactionTranscript(
      [msg({ role: 'tool', content: 'file contents here', toolCallId: 'c1' })],
      100_000
    )
    expect(transcript).toBe('tool: file contents here')
  })

  it('truncates an individual message that exceeds the per-message cap', () => {
    const huge = 'x'.repeat(10_000)
    const transcript = buildCompactionTranscript([msg({ role: 'tool', content: huge })], 100_000)
    expect(transcript).toContain('…[truncated]')
    expect(transcript.length).toBeLessThan(huge.length)
  })

  it('caps the total rendered transcript by keeping only the most recent portion', () => {
    const messages = Array.from({ length: 50 }, (_, i) => msg({ role: 'user', content: `message number ${i}` }))
    const transcript = buildCompactionTranscript(messages, 200)
    expect(transcript.length).toBeLessThanOrEqual(200 + '…[truncated]\n'.length)
    // The most recent message should survive; an early one should not.
    expect(transcript).toContain('message number 49')
    expect(transcript).not.toContain('message number 0\n')
  })

  it('returns an empty string for an empty message list', () => {
    expect(buildCompactionTranscript([], 1000)).toBe('')
  })
})
