import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@shared/types'

import { parseMemoryActions, transcriptFromMessages } from './memoryExtractor'

describe('parseMemoryActions', () => {
  it('parses a plain JSON actions object', () => {
    const text = '{"actions":[{"op":"add","category":"preference","content":"prefers dark mode"}]}'
    expect(parseMemoryActions(text)).toEqual([
      { op: 'add', category: 'preference', content: 'prefers dark mode' }
    ])
  })

  it('tolerates markdown code fences and surrounding prose', () => {
    const text = 'Sure!\n```json\n{"actions":[{"op":"delete","id":"m1"}]}\n```'
    expect(parseMemoryActions(text)).toEqual([{ op: 'delete', id: 'm1' }])
  })

  it('defaults an unknown/missing add category to "fact"', () => {
    const text = '{"actions":[{"op":"add","content":"uses pnpm"}]}'
    expect(parseMemoryActions(text)).toEqual([{ op: 'add', category: 'fact', content: 'uses pnpm' }])
  })

  it('drops malformed actions (missing fields, empty content, bad op)', () => {
    const text = JSON.stringify({
      actions: [
        { op: 'add', content: '   ' },
        { op: 'update', content: 'no id' },
        { op: 'delete' },
        { op: 'frobnicate', id: 'x' },
        { op: 'update', id: 'm2', content: 'valid update' }
      ]
    })
    expect(parseMemoryActions(text)).toEqual([{ op: 'update', id: 'm2', content: 'valid update' }])
  })

  it('returns [] for non-JSON or missing actions array', () => {
    expect(parseMemoryActions('no json here')).toEqual([])
    expect(parseMemoryActions('{"foo":1}')).toEqual([])
  })
})

describe('transcriptFromMessages', () => {
  const msg = (role: ChatMessage['role'], content: string): ChatMessage => ({
    id: role + content,
    sessionId: 's',
    role,
    content,
    createdAt: 0
  })

  it('includes only user/assistant text turns and labels them by role', () => {
    const transcript = transcriptFromMessages([
      msg('user', 'hello'),
      msg('assistant', 'hi there'),
      msg('tool', 'tool output'),
      msg('assistant', '')
    ])
    expect(transcript).toBe('user: hello\nassistant: hi there')
  })

  it('keeps only the most recent messages', () => {
    const many: ChatMessage[] = Array.from({ length: 40 }, (_, i) => msg('user', `m${i}`))
    const transcript = transcriptFromMessages(many)
    expect(transcript).toContain('m39')
    expect(transcript).not.toContain('m0\n')
  })
})
