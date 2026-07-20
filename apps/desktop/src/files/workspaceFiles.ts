import { open, readFile as readFileFull, readdir, stat } from 'node:fs/promises'
import { basename, extname, join, relative, sep } from 'node:path'

import type { WorkspaceFileEntry, WorkspaceFilePreview } from '@shared/types'
import { resolveWorkspacePath } from '@tools/security/workspacePath'

/**
 * Read-only workspace file browsing for the UI's file explorer/preview panel. Every path goes
 * through the same `resolveWorkspacePath` symlink-safe containment check the agent's file tools
 * use (tools/security/workspacePath.ts) -- the renderer is trusted, but a previewed file should
 * never be able to reach outside the workspace root any more than an agent tool call could.
 */

const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024 // 2MB: plenty for source files, caps pathological ones
const MAX_IMAGE_PREVIEW_BYTES = 10 * 1024 * 1024 // 10MB: base64 inflates this ~33% over the wire
const BINARY_SNIFF_BYTES = 8192

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

/** Relative path for display/round-tripping, always forward-slashed regardless of OS. */
function toRelativeSlashPath(root: string, absolute: string): string {
  const rel = relative(root, absolute)
  return rel.split(sep).join('/') || '.'
}

/** Read only the first `length` bytes of a file, without loading the rest into memory. */
async function readFileHead(path: string, length: number): Promise<Buffer> {
  if (length <= 0) {
    return Buffer.alloc(0)
  }
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/** Heuristic binary detection: a NUL byte anywhere in the sample means "not text". */
function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)
}

/**
 * List the immediate contents of a workspace directory, directories first then alphabetical.
 * Symlinks are omitted (readdir's dirent.isDirectory()/isFile() are both false for them without
 * following the link, matching the existing list_directory agent tool's behavior).
 */
export async function listWorkspaceDir(
  workspaceRoot: string,
  relativePath = '.'
): Promise<WorkspaceFileEntry[]> {
  const resolved = await resolveWorkspacePath(workspaceRoot, relativePath)
  const stats = await stat(resolved)
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${relativePath}`)
  }

  const dirents = await readdir(resolved, { withFileTypes: true })
  const entries: WorkspaceFileEntry[] = []

  for (const dirent of dirents) {
    const entryAbsolute = join(resolved, dirent.name)
    const entryRelative = toRelativeSlashPath(workspaceRoot, entryAbsolute)

    if (dirent.isDirectory()) {
      entries.push({ name: dirent.name, relativePath: entryRelative, type: 'directory' })
    } else if (dirent.isFile()) {
      const entryStats = await stat(entryAbsolute).catch(() => null)
      entries.push({
        name: dirent.name,
        relativePath: entryRelative,
        type: 'file',
        size: entryStats?.size,
        modifiedAt: entryStats?.mtimeMs
      })
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return entries
}

/** Resolve a workspace-relative path to an absolute file path, rejecting directories. */
export async function resolveWorkspaceFilePath(
  workspaceRoot: string,
  relativePath: string
): Promise<string> {
  const resolved = await resolveWorkspacePath(workspaceRoot, relativePath)
  const stats = await stat(resolved)
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${relativePath}`)
  }
  return resolved
}

/**
 * Build a preview payload for a workspace file: inlined content for images and text (capped
 * and marked `truncated` past the size limit), metadata-only for PDFs and anything that looks
 * binary -- those are previewed via Export / Open externally / Reveal in folder instead.
 */
export async function readWorkspaceFilePreview(
  workspaceRoot: string,
  relativePath: string
): Promise<WorkspaceFilePreview> {
  const resolved = await resolveWorkspaceFilePath(workspaceRoot, relativePath)
  const stats = await stat(resolved)
  const name = basename(resolved)
  const ext = extname(resolved).toLowerCase()
  const imageMime = IMAGE_MIME_BY_EXT[ext]

  if (imageMime) {
    if (stats.size > MAX_IMAGE_PREVIEW_BYTES) {
      return { kind: 'binary', name, relativePath, size: stats.size }
    }
    const buffer = await readFileFull(resolved)
    return {
      kind: 'image',
      name,
      relativePath,
      size: stats.size,
      mimeType: imageMime,
      content: buffer.toString('base64')
    }
  }

  if (ext === '.pdf') {
    return { kind: 'pdf', name, relativePath, size: stats.size }
  }

  const readLength = Math.min(stats.size, MAX_TEXT_PREVIEW_BYTES)
  const head = await readFileHead(resolved, readLength)

  if (looksBinary(head)) {
    return { kind: 'binary', name, relativePath, size: stats.size }
  }

  return {
    kind: 'text',
    name,
    relativePath,
    size: stats.size,
    content: head.toString('utf-8'),
    truncated: stats.size > MAX_TEXT_PREVIEW_BYTES
  }
}
