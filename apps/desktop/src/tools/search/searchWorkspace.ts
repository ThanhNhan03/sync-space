import { open, readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import type { Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'
import { resolveWorkspacePath, WorkspacePathViolationError } from '@tools/security/workspacePath'

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'out', '.vite', 'release'])

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024
const BINARY_SNIFF_BYTES = 8 * 1024
const DEFAULT_MAX_RESULTS = 200

interface ParsedSearchArgs {
  query: string
  path?: string
  caseSensitive: boolean
  maxResults: number
}

interface Match {
  relativePath: string
  lineNumber: number
  lineText: string
}

function parseArgs(args: Record<string, unknown>): ParsedSearchArgs {
  const query = args.query
  if (typeof query !== 'string' || query.length === 0) {
    throw new Error('"query" is required and must be a non-empty string')
  }

  let path: string | undefined
  if (args.path !== undefined) {
    if (typeof args.path !== 'string') {
      throw new Error('"path" must be a string when provided')
    }
    path = args.path
  }

  let caseSensitive = false
  if (args.caseSensitive !== undefined) {
    if (typeof args.caseSensitive !== 'boolean') {
      throw new Error('"caseSensitive" must be a boolean when provided')
    }
    caseSensitive = args.caseSensitive
  }

  let maxResults = DEFAULT_MAX_RESULTS
  if (args.maxResults !== undefined) {
    if (typeof args.maxResults !== 'number' || !Number.isFinite(args.maxResults) || args.maxResults <= 0) {
      throw new Error('"maxResults" must be a positive number when provided')
    }
    maxResults = Math.floor(args.maxResults)
  }

  return { query, path, caseSensitive, maxResults }
}

async function isLikelyBinary(absoluteFilePath: string): Promise<boolean> {
  const handle = await open(absoluteFilePath, 'r')
  try {
    const buffer = Buffer.alloc(BINARY_SNIFF_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, BINARY_SNIFF_BYTES, 0)
    return buffer.subarray(0, bytesRead).includes(0)
  } finally {
    await handle.close()
  }
}

async function collectFiles(
  directory: string,
  workspaceRoot: string,
  out: string[]
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue
      await collectFiles(join(directory, entry.name), workspaceRoot, out)
    } else if (entry.isFile()) {
      out.push(join(directory, entry.name))
    }
    // Symlinks and other entry types are skipped intentionally.
  }
}

function toWorkspaceRelative(workspaceRoot: string, absolutePath: string): string {
  return relative(resolve(workspaceRoot), absolutePath).split(sep).join('/')
}

async function searchFile(
  absoluteFilePath: string,
  workspaceRoot: string,
  query: string,
  caseSensitive: boolean
): Promise<Match[]> {
  const raw = await readFile(absoluteFilePath, 'utf8')
  const needle = caseSensitive ? query : query.toLowerCase()
  const lines = raw.split(/\r\n|\r|\n/)
  const matches: Match[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const haystack = caseSensitive ? line : line.toLowerCase()
    if (haystack.includes(needle)) {
      matches.push({
        relativePath: toWorkspaceRelative(workspaceRoot, absoluteFilePath),
        lineNumber: i + 1,
        lineText: line.trim()
      })
    }
  }

  return matches
}

export const searchWorkspaceTool: Tool = {
  name: 'search_workspace',
  description:
    'Recursively searches text files in the workspace (or a given sub-path) for a plain-text ' +
    'substring match, returning grep-style results with file path, line number, and line text. ' +
    'Skips node_modules, .git, dist, out, .vite, release directories, large files (>1MB), and ' +
    'binary files.',
  schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Plain substring to search for (not a regular expression).'
      },
      path: {
        type: 'string',
        description: 'Optional workspace-relative sub-path to restrict the search to.'
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Match case-sensitively. Defaults to false (case-insensitive).'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of matches to return. Defaults to 200.'
      }
    },
    required: ['query']
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult> {
    try {
      const { query, path, caseSensitive, maxResults } = parseArgs(args)
      const searchRoot = await resolveWorkspacePath(context.workspaceRoot, path ?? '.')

      // Non-null: resolveWorkspacePath above already threw if the root were null.
      const files: string[] = []
      await collectFiles(searchRoot, context.workspaceRoot!, files)

      const matches: Match[] = []
      let truncated = false

      for (const absoluteFilePath of files) {
        if (matches.length >= maxResults) {
          truncated = true
          break
        }

        let fileStat
        try {
          fileStat = await stat(absoluteFilePath)
        } catch {
          continue
        }
        if (!fileStat.isFile() || fileStat.size > MAX_FILE_SIZE_BYTES) continue

        let binary: boolean
        try {
          binary = await isLikelyBinary(absoluteFilePath)
        } catch {
          continue
        }
        if (binary) continue

        let fileMatches: Match[]
        try {
          fileMatches = await searchFile(absoluteFilePath, context.workspaceRoot!, query, caseSensitive)
        } catch {
          continue
        }

        for (const match of fileMatches) {
          if (matches.length >= maxResults) {
            truncated = true
            break
          }
          matches.push(match)
        }
      }

      if (matches.length === 0) {
        return {
          ok: true,
          content: `No matches found for "${query}".`
        }
      }

      const header = truncated
        ? `${matches.length} match(es) found (results truncated at ${maxResults}):`
        : `${matches.length} match(es) found:`

      const body = matches
        .map((match) => `${match.relativePath}:${match.lineNumber}: ${match.lineText}`)
        .join('\n')

      return {
        ok: true,
        content: `${header}\n${body}`
      }
    } catch (error) {
      if (error instanceof WorkspacePathViolationError) {
        return { ok: false, isError: true, content: error.message }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, isError: true, content: `search_workspace failed: ${message}` }
    }
  }
}
