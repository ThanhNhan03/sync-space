import { createHash } from 'node:crypto'

/**
 * Model-facing MCP tool names must survive two constraints at once:
 *  - OpenAI-compatible providers reject names with punctuation (dots, colons, slashes)
 *    and cap them at 64 characters.
 *  - Names must stay stable and collision-free across reconnects so a session's stored
 *    tool_call history keeps resolving to the same server tool.
 *
 * We therefore expose a sanitized, prefixed, length-bounded name to the model
 * (`mcp__<server>__<tool>`) while the manager keeps the server's original tool name for
 * the actual wire call. These helpers are pure so they can be unit-tested in isolation.
 */

export const MAX_MODEL_TOOL_NAME_LENGTH = 64
const MCP_TOOL_NAME_HASH_LENGTH = 8

/** Collapse whitespace/punctuation into single underscores; fall back if nothing survives. */
export function sanitizeMcpToolSegment(segment: string, fallback: string): string {
  const sanitized = segment
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return sanitized || fallback
}

/** Shorten a name past `maxLength` by keeping a prefix and appending a content hash. */
function truncateMcpToolName(baseName: string, maxLength: number): string {
  if (baseName.length <= maxLength) {
    return baseName
  }
  if (maxLength <= 0) {
    return ''
  }
  if (maxLength <= MCP_TOOL_NAME_HASH_LENGTH) {
    return createHash('sha256').update(baseName).digest('hex').slice(0, maxLength)
  }

  const hashLength = Math.min(MCP_TOOL_NAME_HASH_LENGTH, maxLength - 2)
  const hash = createHash('sha256').update(baseName).digest('hex').slice(0, hashLength)
  const prefixLength = Math.max(1, maxLength - hash.length - 1)

  return `${baseName.slice(0, prefixLength)}_${hash}`
}

/** Build a length-bounded name, reserving room for an optional dedup suffix (`_2`, `_3`, …). */
export function formatMcpToolName(baseName: string, suffix: string | null): string {
  const suffixPart = suffix === null ? '' : `_${suffix}`
  const availableBaseLength = MAX_MODEL_TOOL_NAME_LENGTH - suffixPart.length

  if (availableBaseLength <= 0) {
    return truncateMcpToolName(
      `tool_${createHash('sha256').update(`${baseName}${suffixPart}`).digest('hex')}`,
      MAX_MODEL_TOOL_NAME_LENGTH
    )
  }

  const truncatedBase = truncateMcpToolName(baseName, availableBaseLength)
  return `${truncatedBase}${suffixPart}`
}

/**
 * Produce a unique model-facing name for `baseName`, disambiguating collisions with an
 * incrementing numeric suffix. Mutates `usedNames` so a batch of tools stays collision-free.
 */
export function createUniqueMcpToolName(baseName: string, usedNames: Set<string>): string {
  const firstCandidate = formatMcpToolName(baseName, null)
  if (!usedNames.has(firstCandidate)) {
    usedNames.add(firstCandidate)
    return firstCandidate
  }

  let suffix = 2
  let candidate = formatMcpToolName(baseName, String(suffix))
  while (usedNames.has(candidate)) {
    suffix += 1
    candidate = formatMcpToolName(baseName, String(suffix))
  }

  usedNames.add(candidate)
  return candidate
}

/** The `mcp__` prefix marks a tool name as MCP-sourced so the manager can route its call. */
export const MCP_TOOL_NAME_PREFIX = 'mcp__'
