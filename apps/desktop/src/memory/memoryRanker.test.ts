import { describe, expect, it } from 'vitest'

import type { MemoryEntry } from '@shared/types'

import { lexicalScore, selectRelevant } from './memoryRanker'

function entry(id: string, content: string, updatedAt: number): MemoryEntry {
  return { id, workspaceRoot: '/ws', category: 'fact', content, source: 'auto', createdAt: updatedAt, updatedAt }
}

describe('lexicalScore', () => {
  it('is 0 with no token overlap and positive with overlap', () => {
    expect(lexicalScore('typescript react', 'python django backend')).toBe(0)
    expect(lexicalScore('prefers dark mode', 'the user prefers dark mode')).toBeGreaterThan(0)
  })

  it('ignores case and short/punctuation-only tokens', () => {
    expect(lexicalScore('Vitest', 'we use vitest for tests')).toBeGreaterThan(0)
  })
})

describe('selectRelevant', () => {
  it('returns everything (newest first) when under the cap', () => {
    const entries = [entry('a', 'one', 1), entry('b', 'two', 3), entry('c', 'three', 2)]
    expect(selectRelevant(entries, 'anything', 10).map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('ranks by lexical relevance to the query when over the cap', () => {
    const entries = [
      entry('react', 'the user prefers react and typescript', 1),
      entry('python', 'the project uses python', 2),
      entry('coffee', 'unrelated note about coffee', 3)
    ]
    const top = selectRelevant(entries, 'react typescript preferences', 1)
    expect(top).toHaveLength(1)
    expect(top[0].id).toBe('react')
  })
})
