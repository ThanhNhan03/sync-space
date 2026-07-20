import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve as resolvePath, sep } from 'node:path'
import * as ts from 'typescript'

function escapesWorkspace(root: string, absoluteTarget: string): boolean {
  const rel = relative(root, absoluteTarget)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

function toPathsRecord(paths: ts.MapLike<string[]> | undefined): Record<string, string[]> | null {
  if (!paths) {
    return null
  }
  const result: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(paths)) {
    if (Array.isArray(values)) {
      const strings = values.filter((v): v is string => typeof v === 'string')
      if (strings.length > 0) {
        result[key] = strings
      }
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

/** A project-reference "path" may point directly at a config file or at a directory
 *  containing a tsconfig.json (TS's own convention for the `references` field). */
function resolveReferencedConfigPath(fromDir: string, referencePath: string): string {
  const resolved = resolvePath(fromDir, referencePath)
  return resolved.endsWith('.json') ? resolved : join(resolved, 'tsconfig.json')
}

/**
 * Parses a single tsconfig file's `paths` (following its own `extends` chain via the
 * TypeScript compiler API), falling back to merging `paths` from its `references` when the
 * file itself defines none -- this repo's own apps/desktop/tsconfig.json is exactly that
 * shape: a `{ "files": [], "references": [...] }` shell with the real `paths` living in the
 * referenced tsconfig.node.json/tsconfig.web.json, a common pattern for Electron/Vite
 * projects that split node- and web-side compiler options. `visited` guards against a
 * reference cycle recursing forever.
 */
function loadPathsFromConfig(
  root: string,
  configPath: string,
  visited: Set<string>
): Record<string, string[]> | null {
  if (visited.has(configPath) || !existsSync(configPath)) {
    return null
  }
  visited.add(configPath)

  const containedReadFile = (path: string): string | undefined => {
    const absolute = resolvePath(path)
    if (escapesWorkspace(root, absolute)) return undefined
    try {
      return readFileSync(absolute, 'utf8')
    } catch {
      return undefined
    }
  }

  const readResult = ts.readConfigFile(configPath, containedReadFile)
  if (readResult.error || !readResult.config) {
    return null
  }

  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: process.platform !== 'win32' && process.platform !== 'darwin',
    readDirectory: () => [],
    fileExists: (path) => {
      const absolute = resolvePath(path)
      if (escapesWorkspace(root, absolute)) return false
      return existsSync(absolute)
    },
    readFile: containedReadFile
  }

  const configDir = dirname(configPath)
  let parsed: ts.ParsedCommandLine
  try {
    parsed = ts.parseJsonConfigFileContent(readResult.config, host, configDir)
  } catch {
    return null
  }

  const ownPaths = toPathsRecord(parsed.options.paths)
  if (ownPaths) {
    return ownPaths
  }

  const references = (readResult.config as { references?: unknown }).references
  if (!Array.isArray(references)) {
    return null
  }

  let merged: Record<string, string[]> | null = null
  for (const reference of references) {
    const referencePath = (reference as { path?: unknown } | null)?.path
    if (typeof referencePath !== 'string') continue

    const resolvedRefPath = resolveReferencedConfigPath(configDir, referencePath)
    if (escapesWorkspace(root, resolvedRefPath)) continue

    const refPaths = loadPathsFromConfig(root, resolvedRefPath, visited)
    if (refPaths) {
      merged = { ...(merged ?? {}), ...refPaths }
    }
  }
  return merged
}

/**
 * Loads a workspace's tsconfig `paths` aliases (e.g. `@shared/*`), resolving `extends` chains
 * and `baseUrl` via the TypeScript compiler API rather than a hand-rolled JSON parse -- this
 * gets JSONC-comment tolerance and correct baseUrl-relative resolution for free instead of
 * three separate manual edge cases. Falls back to a config's `references` when it defines no
 * `paths` of its own (see loadPathsFromConfig). Only looks for a tsconfig.json directly at the
 * workspace root (no upward directory search) so resolution can never wander outside the
 * workspace by itself; every followed file -- extends targets and references alike -- is
 * checked against the workspace root via the ParseConfigHost's fileExists/readFile (applied
 * synchronously since ParseConfigHost's interface is sync) so a crafted "extends"/"references"
 * pointing outside the workspace can't be used to read arbitrary host files. Returns null on
 * any failure (no tsconfig, parse error); callers then fall back to relative-only resolution.
 */
export function loadTsconfigPathAliases(workspaceRoot: string): Record<string, string[]> | null {
  const root = resolvePath(workspaceRoot)
  const configPath = join(root, 'tsconfig.json')
  return loadPathsFromConfig(root, configPath, new Set())
}
