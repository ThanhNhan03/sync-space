import { describe, expect, it } from 'vitest'

import { parseSkillFrontmatter, stripFrontmatter, validateSkillName } from './frontmatter'

const skillMd = `---
name: pdf
description: Work with PDF files.
license: Proprietary
---

# PDF Guide

Body content here.
`

describe('parseSkillFrontmatter', () => {
  it('extracts name and description from the front-matter block', () => {
    expect(parseSkillFrontmatter(skillMd)).toEqual({ name: 'pdf', description: 'Work with PDF files.' })
  })

  it('strips surrounding quotes from values', () => {
    const content = '---\nname: "my-skill"\ndescription: \'Does a thing.\'\n---\nbody'
    expect(parseSkillFrontmatter(content)).toEqual({ name: 'my-skill', description: 'Does a thing.' })
  })

  it('returns null when name or description is missing', () => {
    expect(parseSkillFrontmatter('---\nname: only-name\n---\nbody')).toBeNull()
    expect(parseSkillFrontmatter('no front matter at all')).toBeNull()
  })

  it('rejects unsafe skill names (path traversal)', () => {
    expect(parseSkillFrontmatter('---\nname: ../evil\ndescription: x\n---')).toBeNull()
    expect(parseSkillFrontmatter('---\nname: a/b\ndescription: x\n---')).toBeNull()
  })
})

describe('validateSkillName', () => {
  it('throws for empty or path-bearing names', () => {
    expect(() => validateSkillName('')).toThrow()
    expect(() => validateSkillName('a\\b')).toThrow()
    expect(() => validateSkillName('ok-name')).not.toThrow()
  })
})

describe('stripFrontmatter', () => {
  it('returns only the body after the front-matter block', () => {
    expect(stripFrontmatter(skillMd).trim()).toBe('# PDF Guide\n\nBody content here.')
  })

  it('returns the content unchanged when there is no front-matter', () => {
    expect(stripFrontmatter('# Just a body')).toBe('# Just a body')
  })
})
