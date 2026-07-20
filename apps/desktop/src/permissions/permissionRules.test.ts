import { describe, expect, it } from 'vitest'

import type { PermissionRule } from '@shared/types'
import { DEFAULT_PERMISSION_RULES } from '@shared/types'

import { decidePermission, matchesPattern, sanitizeRules } from './permissionRules'

describe('sanitizeRules', () => {
  it('returns defaults for non-array or empty input', () => {
    expect(sanitizeRules(undefined)).toEqual(DEFAULT_PERMISSION_RULES)
    expect(sanitizeRules('nope')).toEqual(DEFAULT_PERMISSION_RULES)
    expect(sanitizeRules([])).toEqual(DEFAULT_PERMISSION_RULES)
  })

  it('drops entries without a tool name and coerces invalid actions to "ask"', () => {
    const input = [
      { tool: '  ', action: 'allow' },
      { tool: 'write_file', action: 'nonsense' },
      { tool: 'execute_terminal', action: 'deny' }
    ]
    expect(sanitizeRules(input)).toEqual([
      { tool: 'write_file', pattern: undefined, action: 'ask' },
      { tool: 'execute_terminal', pattern: undefined, action: 'deny' }
    ])
  })
})

describe('decidePermission', () => {
  const rules: PermissionRule[] = [
    { tool: 'read_file', action: 'allow' },
    { tool: 'execute_terminal', action: 'ask' },
    { tool: 'delete_file', action: 'deny' },
    { tool: 'write_file', pattern: '*secret*', action: 'deny' },
    { tool: 'write_file', action: 'allow' }
  ]

  it('honors an allow/ask/deny rule (case-insensitive on the tool name)', () => {
    expect(decidePermission(rules, undefined, 'READ_FILE', {})).toBe('allow')
    expect(decidePermission(rules, undefined, 'execute_terminal', {})).toBe('ask')
    expect(decidePermission(rules, undefined, 'delete_file', {})).toBe('deny')
  })

  it('defaults unknown tools (incl. MCP) to "ask"', () => {
    expect(decidePermission(rules, undefined, 'mcp__notion__search', {})).toBe('ask')
  })

  it('applies the first matching rule, so a pattern rule can override a later catch-all', () => {
    expect(decidePermission(rules, undefined, 'write_file', { path: 'my-secret.txt' })).toBe('deny')
    expect(decidePermission(rules, undefined, 'write_file', { path: 'notes.txt' })).toBe('allow')
  })

  it('lets session "always allow" memory override the rules', () => {
    const always = new Set(['execute_terminal'])
    expect(decidePermission(rules, always, 'execute_terminal', {})).toBe('allow')
  })
})

describe('matchesPattern', () => {
  it('treats * as any-substring and other characters literally', () => {
    expect(matchesPattern('*rm -rf*', 'command: rm -rf /')).toBe(true)
    expect(matchesPattern('git *', 'git status')).toBe(true)
    expect(matchesPattern('a.b', 'axb')).toBe(false) // dot is literal, not wildcard
  })
})
