import { describe, expect, it } from 'vitest'

import {
  MAX_MODEL_TOOL_NAME_LENGTH,
  createUniqueMcpToolName,
  formatMcpToolName,
  sanitizeMcpToolSegment
} from './toolName'

describe('sanitizeMcpToolSegment', () => {
  it('replaces punctuation and whitespace with single underscores', () => {
    expect(sanitizeMcpToolSegment('foo.bar:baz', 'x')).toBe('foo_bar_baz')
    expect(sanitizeMcpToolSegment('  hello   world  ', 'x')).toBe('hello_world')
  })

  it('trims leading/trailing underscores and falls back when nothing survives', () => {
    expect(sanitizeMcpToolSegment('...', 'fallback')).toBe('fallback')
    expect(sanitizeMcpToolSegment('', 'server')).toBe('server')
  })
})

describe('formatMcpToolName', () => {
  it('leaves short names untouched (aside from an optional suffix)', () => {
    expect(formatMcpToolName('mcp__notion__search', null)).toBe('mcp__notion__search')
    expect(formatMcpToolName('mcp__notion__search', '2')).toBe('mcp__notion__search_2')
  })

  it('never exceeds the provider-imposed 64-char limit, even for very long names', () => {
    const long = `mcp__server__${'a'.repeat(200)}`
    const formatted = formatMcpToolName(long, '3')
    expect(formatted.length).toBeLessThanOrEqual(MAX_MODEL_TOOL_NAME_LENGTH)
    expect(formatted.endsWith('_3')).toBe(true)
  })

  it('produces distinct hashes for distinct long inputs (no accidental collision)', () => {
    const a = formatMcpToolName(`mcp__s__${'x'.repeat(120)}A`, null)
    const b = formatMcpToolName(`mcp__s__${'x'.repeat(120)}B`, null)
    expect(a).not.toBe(b)
  })
})

describe('createUniqueMcpToolName', () => {
  it('disambiguates colliding names with an incrementing suffix', () => {
    const used = new Set<string>()
    expect(createUniqueMcpToolName('mcp__s__tool', used)).toBe('mcp__s__tool')
    expect(createUniqueMcpToolName('mcp__s__tool', used)).toBe('mcp__s__tool_2')
    expect(createUniqueMcpToolName('mcp__s__tool', used)).toBe('mcp__s__tool_3')
  })
})
