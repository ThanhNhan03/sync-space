import { stat } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']

async function firstExistingFile(candidateBase: string): Promise<string | null> {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = candidateBase + suffix
    try {
      const stats = await stat(candidate)
      if (stats.isFile()) {
        return candidate
      }
    } catch {
      continue
    }
  }
  return null
}

function toWorkspaceRelative(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join('/')
}

/** Returns the wildcard capture if `specifier` matches `aliasKey` (e.g. "@shared/*" against
 *  "@shared/types" -> "types"), an empty-string capture for an exact non-wildcard match, or
 *  null when the key doesn't apply -- matched against real configured `paths` keys only,
 *  never a generic "@"-prefix heuristic (this repo's own aliases share the same syntactic
 *  shape as real scoped npm packages it depends on, which must stay external/unresolved). */
function matchAliasKey(aliasKey: string, specifier: string): string | null {
  if (aliasKey.endsWith('/*')) {
    const prefix = aliasKey.slice(0, -1)
    return specifier.startsWith(prefix) ? specifier.slice(prefix.length) : null
  }
  if (aliasKey === '*') {
    return specifier
  }
  return aliasKey === specifier ? '' : null
}

/**
 * Resolves a TS/JS import specifier to a workspace-relative file path, or null when it can't
 * be resolved within the workspace (external package, unresolved alias, genuinely missing
 * file -- tracked separately by the caller as an "unresolved" import, not silently dropped).
 * Strips Vite-style `?raw`/`?url` query/hash suffixes first, then tries relative resolution
 * and finally tsconfig path-alias resolution, trying every array entry a `paths` key maps to.
 */
export async function resolveImportSpecifier(
  specifier: string,
  fromRelativePath: string,
  workspaceRoot: string,
  pathAliases: Record<string, string[]> | null
): Promise<string | null> {
  const stripped = specifier.split(/[?#]/)[0]
  if (!stripped) {
    return null
  }

  if (stripped.startsWith('.')) {
    const fromDir = dirname(join(workspaceRoot, fromRelativePath))
    const resolved = await firstExistingFile(join(fromDir, stripped))
    return resolved ? toWorkspaceRelative(workspaceRoot, resolved) : null
  }

  if (pathAliases) {
    for (const [aliasKey, targets] of Object.entries(pathAliases)) {
      const capture = matchAliasKey(aliasKey, stripped)
      if (capture === null) continue
      for (const target of targets) {
        const substituted = target.includes('*') ? target.replace('*', capture) : target
        const resolved = await firstExistingFile(join(workspaceRoot, substituted))
        if (resolved) {
          return toWorkspaceRelative(workspaceRoot, resolved)
        }
      }
    }
  }

  return null
}
