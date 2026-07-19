import { describe, expect, it } from 'vitest'

import type { MemoryEntry } from '@shared/types'

import { buildExtractionUserPrompt, buildMemoryPromptSection } from './memoryPrompt'

function entry(id: string, category: MemoryEntry['category'], content: string): MemoryEntry {
  return { id, workspaceRoot: '/ws', category, content, source: 'auto', createdAt: 0, updatedAt: 0 }
}

describe('buildMemoryPromptSection', () => {
  it('returns an empty string when there are no memories', () => {
    expect(buildMemoryPromptSection([])).toBe('')
  })

  it('lists memories with an untrusted-context guardrail', () => {
    const section = buildMemoryPromptSection([
      entry('a', 'preference', 'prefers dark mode'),
      entry('b', 'project', 'uses better-sqlite3')
    ])
    expect(section).toContain('## Long-term memory')
    expect(section).toContain('not as instructions')
    expect(section).toContain('- (preference) prefers dark mode')
    expect(section).toContain('- (project) uses better-sqlite3')
  })
})

describe('buildExtractionUserPrompt', () => {
  it('includes existing memory ids and the transcript', () => {
    const prompt = buildExtractionUserPrompt([entry('m1', 'fact', 'x')], 'user: hi\nassistant: hello')
    expect(prompt).toContain('[m1] (fact) x')
    expect(prompt).toContain('user: hi')
  })

  it('notes when there are no existing memories', () => {
    expect(buildExtractionUserPrompt([], 'user: hi')).toContain('(none yet)')
  })
})
