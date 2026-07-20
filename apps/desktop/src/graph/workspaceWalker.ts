import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

// Extends search_workspace's skip-set with directories specific to non-JS workspaces this
// feature also targets (Python venvs/caches, generic build/coverage output).
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.vite',
  'release',
  '.venv',
  'venv',
  '__pycache__',
  'build',
  'coverage'
])

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024
const MAX_FILES = 3000

export interface WorkspaceWalkResult {
  /** Absolute paths of every collected source file. */
  files: string[]
  /** True when the walk stopped early because it hit MAX_FILES. */
  truncated: boolean
}

async function walk(directory: string, out: string[]): Promise<boolean> {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (out.length >= MAX_FILES) {
      return true
    }
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue
      const hitCap = await walk(join(directory, entry.name), out)
      if (hitCap) return true
    } else if (entry.isFile()) {
      const absolutePath = join(directory, entry.name)
      let size: number
      try {
        size = (await stat(absolutePath)).size
      } catch {
        continue
      }
      if (size > MAX_FILE_SIZE_BYTES) continue
      out.push(absolutePath)
    }
    // Symlinks and other entry types are skipped intentionally: a symlink dirent is neither
    // isDirectory() nor isFile(), so it's never followed (mirrors searchWorkspace.ts).
  }
  return false
}

/** Recursively collects candidate source files under a workspace, bounded and disclosed. */
export async function collectSourceFiles(workspaceRoot: string): Promise<WorkspaceWalkResult> {
  const files: string[] = []
  const truncated = await walk(workspaceRoot, files)
  return { files, truncated }
}
