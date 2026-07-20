import { access } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import type { GraphNodeKind } from './graphTypes'

export interface ExtractedPythonSymbol {
  name: string
  kind: GraphNodeKind
  startLine: number
  endLine: number
}

export interface PythonExtractionResult {
  symbols: ExtractedPythonSymbol[]
  /** Raw specifier text as written (dotted absolute, or dot-prefixed relative) -- resolved
   *  separately via resolvePythonImport, since Python's dot-counting resolution scheme is
   *  unrelated to the TS/JS relative-path + tsconfig-alias scheme in importResolver.ts. */
  importSpecifiers: string[]
}

// Top-level only (no leading whitespace) -- matches the same "provably sufficient, not a
// heuristic gap" scoping as the TS extractor's top-level-statement walk.
const DEF_RE = /^(?:async\s+)?def\s+(\w+)\s*\(/
const CLASS_RE = /^class\s+(\w+)/
const FROM_IMPORT_RE = /^from\s+(\S+)\s+import\b/
const IMPORT_RE = /^import\s+(\S+)/

/**
 * Regex-based, deliberately lightweight symbol/import extraction for Python. Disclosed v1
 * gaps: `import a, b` comma-lists only capture the first name; imports indented inside a
 * try/except guard (or any other block) are not top-level and are skipped entirely.
 */
export function extractPythonFile(sourceText: string): PythonExtractionResult {
  const symbols: ExtractedPythonSymbol[] = []
  const importSpecifiers: string[] = []
  const lines = sourceText.split(/\r\n|\r|\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const defMatch = DEF_RE.exec(line)
    if (defMatch) {
      symbols.push({ name: defMatch[1], kind: 'function', startLine: i + 1, endLine: i + 1 })
      continue
    }

    const classMatch = CLASS_RE.exec(line)
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', startLine: i + 1, endLine: i + 1 })
      continue
    }

    const fromMatch = FROM_IMPORT_RE.exec(line)
    if (fromMatch) {
      importSpecifiers.push(fromMatch[1])
      continue
    }

    const importMatch = IMPORT_RE.exec(line)
    if (importMatch) {
      importSpecifiers.push(importMatch[1].split(',')[0])
    }
  }

  return { symbols, importSpecifiers }
}

/**
 * Resolves a raw Python import specifier to a workspace-relative file path, or null if it
 * can't be resolved within the workspace (stdlib/third-party packages, genuinely unresolvable
 * paths). N leading dots means N-1 directory levels up from the importing file's own
 * directory (one dot = the current package itself, not a level up) -- an off-by-one here
 * would silently misresolve every multi-dot relative import.
 */
export async function resolvePythonImport(
  raw: string,
  fromRelativePath: string,
  workspaceRoot: string
): Promise<string | null> {
  let baseDir: string
  let modulePath: string

  if (raw.startsWith('.')) {
    const match = /^(\.+)(.*)$/.exec(raw)
    if (!match) return null
    const levelsUp = match[1].length - 1
    let dir = dirname(join(workspaceRoot, fromRelativePath))
    for (let i = 0; i < levelsUp; i++) {
      dir = dirname(dir)
    }
    baseDir = dir
    modulePath = match[2]
  } else {
    // Absolute dotted import (e.g. "os.path", "mypkg.mod"). Resolved relative to the
    // workspace root; stdlib/third-party modules correctly fall through to null below.
    baseDir = workspaceRoot
    modulePath = raw
  }

  const segments = modulePath.length > 0 ? modulePath.split('.') : []
  const candidates =
    segments.length > 0
      ? [`${join(baseDir, ...segments)}.py`, join(baseDir, ...segments, '__init__.py')]
      : [join(baseDir, '__init__.py')]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return relative(workspaceRoot, candidate).split(sep).join('/')
    } catch {
      continue
    }
  }
  return null
}
