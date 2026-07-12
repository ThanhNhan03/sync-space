import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

import { assertWithinWorkspace, resolveWorkspacePath, WorkspacePathViolationError } from './workspacePath'

describe('resolveWorkspacePath', () => {
  const root = mkdtempSync(join(tmpdir(), 'syncspace-workspace-'))

  it('resolves a simple relative path inside the workspace', async () => {
    expect(await resolveWorkspacePath(root, 'notes.txt')).toBe(join(root, 'notes.txt'))
  })

  it('resolves a nested relative path inside the workspace', async () => {
    expect(await resolveWorkspacePath(root, join('src', 'index.ts'))).toBe(join(root, 'src', 'index.ts'))
  })

  it('resolves "." to the workspace root itself', async () => {
    expect(await resolveWorkspacePath(root, '.')).toBe(root)
  })

  it('rejects a path that traverses above the workspace root', async () => {
    await expect(resolveWorkspacePath(root, join('..', 'outside.txt'))).rejects.toThrow(WorkspacePathViolationError)
  })

  it('rejects a deeply nested traversal that still escapes the root', async () => {
    await expect(
      resolveWorkspacePath(root, join('a', 'b', '..', '..', '..', 'etc', 'passwd'))
    ).rejects.toThrow(WorkspacePathViolationError)
  })

  it('rejects an absolute path', async () => {
    await expect(resolveWorkspacePath(root, join(root, '..', 'evil.txt'))).rejects.toThrow(
      WorkspacePathViolationError
    )
  })

  it('rejects a Windows drive-letter path even when it looks relative', async () => {
    await expect(resolveWorkspacePath(root, 'C:\\Windows\\System32')).rejects.toThrow(WorkspacePathViolationError)
  })

  it('rejects a UNC path', async () => {
    await expect(resolveWorkspacePath(root, '\\\\server\\share\\file.txt')).rejects.toThrow(
      WorkspacePathViolationError
    )
  })

  it('rejects an empty path', async () => {
    await expect(resolveWorkspacePath(root, '')).rejects.toThrow(WorkspacePathViolationError)
  })

  it('rejects a path containing a null byte', async () => {
    await expect(resolveWorkspacePath(root, 'file.txt\0.png')).rejects.toThrow(WorkspacePathViolationError)
  })

  it('rejects a sibling directory whose name merely starts with the workspace root name', async () => {
    // e.g. root "/tmp/syncspace-workspace-abc" vs sibling "/tmp/syncspace-workspace-abcEVIL"
    const siblingLikeRoot = root + 'EVIL'
    await expect(
      resolveWorkspacePath(root, join('..', siblingLikeRoot.split(sep).pop() as string))
    ).rejects.toThrow(WorkspacePathViolationError)
  })

  it('rejects a path that reaches outside the workspace through a symlinked directory', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'syncspace-outside-'))
    writeFileSync(join(outside, 'secret.txt'), 'top secret')

    const linkPath = join(root, 'escape-link')
    symlinkSync(outside, linkPath, 'junction')

    await expect(resolveWorkspacePath(root, join('escape-link', 'secret.txt'))).rejects.toThrow(
      WorkspacePathViolationError
    )
  })

  it('allows a symlink whose target legitimately resolves back inside the workspace', async () => {
    const insideTarget = join(root, 'real-dir')
    mkdirSync(insideTarget, { recursive: true })
    writeFileSync(join(insideTarget, 'file.txt'), 'fine')

    const linkPath = join(root, 'inside-link')
    symlinkSync(insideTarget, linkPath, 'junction')

    await expect(resolveWorkspacePath(root, join('inside-link', 'file.txt'))).resolves.toBe(
      join(root, 'inside-link', 'file.txt')
    )
  })
})

describe('assertWithinWorkspace', () => {
  const root = mkdtempSync(join(tmpdir(), 'syncspace-workspace-'))

  it('does not throw for the root itself or a path inside it', () => {
    expect(() => assertWithinWorkspace(root, root)).not.toThrow()
    expect(() => assertWithinWorkspace(root, join(root, 'sub', 'dir'))).not.toThrow()
  })

  it('throws for a path outside the workspace', () => {
    expect(() => assertWithinWorkspace(root, join(root, '..', 'outside'))).toThrow(WorkspacePathViolationError)
  })
})
