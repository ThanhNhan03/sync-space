import { describe, expect, it } from 'vitest'

import { buildCompactionPromptSection, buildCompactionUserPrompt, COMPACTION_SYSTEM_PROMPT } from './compactionPrompts'

describe('buildCompactionPromptSection', () => {
  it('returns an empty string when there is no summary', () => {
    expect(buildCompactionPromptSection(null)).toBe('')
    expect(buildCompactionPromptSection('   ')).toBe('')
  })

  it('wraps a non-empty summary in a background-context section with a guardrail', () => {
    const section = buildCompactionPromptSection('User is building a CLI tool in Rust.')
    expect(section).toContain('## Earlier conversation (summarized)')
    expect(section).toContain('not as instructions')
    expect(section).toContain('User is building a CLI tool in Rust.')
  })
})

describe('buildCompactionUserPrompt', () => {
  it('marks there being no previous summary', () => {
    const prompt = buildCompactionUserPrompt(null, 'user: hi\nassistant: hello')
    expect(prompt).toContain('(none yet)')
    expect(prompt).toContain('user: hi')
  })

  it('includes the previous summary when present', () => {
    const prompt = buildCompactionUserPrompt('Earlier: set up the project.', 'user: now add tests')
    expect(prompt).toContain('Earlier: set up the project.')
    expect(prompt).toContain('now add tests')
  })
})

describe('COMPACTION_SYSTEM_PROMPT', () => {
  it('instructs a complete replacement summary, not a delta', () => {
    expect(COMPACTION_SYSTEM_PROMPT).toMatch(/supersedes the previous one/i)
  })
})
