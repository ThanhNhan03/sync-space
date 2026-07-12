import { isAbsolute, relative, resolve, sep, dirname } from 'node:path'
import { realpath } from 'node:fs/promises'

export class WorkspacePathViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspacePathViolationError'
  }
}

function escapesRoot(root: string, absoluteTarget: string): boolean {
  const rel = relative(root, absoluteTarget)
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

/**
 * Resolves the real (symlink-free) location of the nearest existing ancestor of
 * `lexicalPath` and confirms it sits inside the real location of the workspace root.
 * Lexical `path.resolve`/`path.relative` checks alone only catch `..` traversal in the
 * path *string* -- they say nothing about a symlink that lives inside the workspace
 * (created via execute_terminal, or simply present in a cloned repo) pointing outside
 * it. Node's fs calls follow symlinks, so without this check read_file/write_file could
 * silently operate on an arbitrary host file through such a link. Walking up to the
 * nearest existing ancestor (rather than requiring `lexicalPath` itself to exist) lets
 * this run before a file is created, e.g. for write_file/create_file.
 */
async function assertRealPathWithinWorkspace(root: string, lexicalPath: string): Promise<void> {
  const realRoot = await realpath(root)

  let current = lexicalPath
  for (;;) {
    try {
      const real = await realpath(current)
      if (real !== realRoot && escapesRoot(realRoot, real)) {
        throw new WorkspacePathViolationError(`Path escapes workspace via a symlink: ${lexicalPath}`)
      }
      return
    } catch (error) {
      if (error instanceof WorkspacePathViolationError) {
        throw error
      }
      const errno = error as NodeJS.ErrnoException
      if (errno.code !== 'ENOENT') {
        throw error
      }
      const parent = dirname(current)
      if (parent === current) {
        // Walked all the way up without resolving anything real -- treat as safe;
        // the lexical check already confirmed containment and nothing exists yet.
        return
      }
      current = parent
    }
  }
}

/**
 * Resolves a tool/AI-supplied relative path against the workspace root and guarantees
 * the result cannot escape it. Rejects absolute paths, drive-letter/UNC paths, and any
 * `..` traversal that would land outside the workspace, then re-verifies containment
 * after resolving symlinks (see assertRealPathWithinWorkspace). This is the single choke
 * point every file/search/terminal tool must go through -- never join paths manually
 * elsewhere.
 */
export async function resolveWorkspacePath(workspaceRoot: string, targetPath: string): Promise<string> {
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    throw new WorkspacePathViolationError('Path must be a non-empty string')
  }
  if (targetPath.includes('\0')) {
    throw new WorkspacePathViolationError('Null bytes are not allowed in a path')
  }
  if (isAbsolute(targetPath) || /^[a-zA-Z]:/.test(targetPath) || targetPath.startsWith('\\\\')) {
    throw new WorkspacePathViolationError(`Absolute paths are not allowed: ${targetPath}`)
  }

  const root = resolve(workspaceRoot)
  const resolved = resolve(root, targetPath)

  if (resolved !== root && escapesRoot(root, resolved)) {
    throw new WorkspacePathViolationError(`Path escapes workspace: ${targetPath}`)
  }

  await assertRealPathWithinWorkspace(root, resolved)

  return resolved
}

/**
 * Validates that an already-absolute path (e.g. a working directory for a terminal
 * command) sits inside the workspace root. Used where callers deal in absolute paths.
 */
export function assertWithinWorkspace(workspaceRoot: string, absolutePath: string): void {
  const root = resolve(workspaceRoot)
  const target = resolve(absolutePath)
  if (target !== root && escapesRoot(root, target)) {
    throw new WorkspacePathViolationError(`Path escapes workspace: ${absolutePath}`)
  }
}
