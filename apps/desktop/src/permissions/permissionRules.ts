import type { PermissionAction, PermissionRule } from '@shared/types'
import { DEFAULT_PERMISSION_RULES } from '@shared/types'

/**
 * Pure tool-permission decision logic, adapted from OpenCowork's permission-rules-store. Rules
 * originate in user settings (semi-trusted), so they are sanitized and every decision fails
 * conservatively to 'ask' — the worst case is a harmless extra prompt, never a silent auto-allow.
 */

const VALID_ACTIONS: ReadonlySet<PermissionAction> = new Set<PermissionAction>(['allow', 'ask', 'deny'])

/**
 * Coerce an untrusted rules value into a clean PermissionRule[]. Drops entries with no tool
 * name, forces invalid actions to 'ask', and returns the defaults for empty/non-array input.
 */
export function sanitizeRules(input: unknown): PermissionRule[] {
  if (!Array.isArray(input)) {
    return [...DEFAULT_PERMISSION_RULES]
  }
  const out: PermissionRule[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const rule = raw as Partial<PermissionRule>
    const tool = typeof rule.tool === 'string' ? rule.tool.trim() : ''
    if (!tool) continue
    const pattern = typeof rule.pattern === 'string' ? rule.pattern : undefined
    const action: PermissionAction = VALID_ACTIONS.has(rule.action as PermissionAction)
      ? (rule.action as PermissionAction)
      : 'ask'
    out.push({ tool, pattern, action })
  }
  return out.length > 0 ? out : [...DEFAULT_PERMISSION_RULES]
}

/**
 * Decide how a tool call should be handled:
 *   1. session "always allow" memory → 'allow'
 *   2. first matching rule (case-insensitive tool + optional glob pattern on the arguments)
 *   3. otherwise 'ask' (conservative default for unknown/MCP tools)
 */
export function decidePermission(
  rules: PermissionRule[],
  alwaysAllow: ReadonlySet<string> | undefined,
  toolName: string,
  input: Record<string, unknown>
): PermissionAction {
  const lowered = toolName.toLowerCase()
  if (alwaysAllow?.has(lowered)) {
    return 'allow'
  }
  const inputStr = safeStringify(input)
  for (const rule of rules) {
    if (rule.tool.toLowerCase() !== lowered) continue
    if (rule.pattern && !matchesPattern(rule.pattern, inputStr)) continue
    return VALID_ACTIONS.has(rule.action) ? rule.action : 'ask'
  }
  return 'ask'
}

function safeStringify(value: unknown): string {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value)
    return s ?? ''
  } catch {
    return ''
  }
}

/** Glob-ish match: `*` means any substring; all other regex metacharacters are literal. */
export function matchesPattern(pattern: string, haystack: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(escaped, 'i').test(haystack)
}
