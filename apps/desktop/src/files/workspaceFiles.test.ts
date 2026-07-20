import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { WorkspacePathViolationError } from '@tools/security/workspacePath'

import { listWorkspaceDir, readWorkspaceFilePreview, resolveWorkspaceFilePath } from './workspaceFiles'

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'syncspace-files-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'index.ts'), 'export const x = 1\n')
  writeFileSync(join(root, 'README.md'), '# Hello\n')
  writeFileSync(join(root, 'notes.bin'), Buffer.from([0x00, 0x01, 0x02, 0xff]))
  // Minimal valid 1x1 PNG.
  writeFileSync(
    join(root, 'pixel.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    )
  )
  return root
}

describe('listWorkspaceDir', () => {
  it('lists directories before files, locale-alphabetically within each group', async () => {
    const root = makeWorkspace()
    const entries = await listWorkspaceDir(root)
    // localeCompare sorts case-insensitively, so README.md (matching list_directory's tool
    // behavior) lands after the lowercase names -- not a plain ASCII sort.
    expect(entries.map((e) => e.name)).toEqual(['src', 'notes.bin', 'pixel.png', 'README.md'])
    expect(entries[0]).toMatchObject({ type: 'directory', relativePath: 'src' })
    expect(entries[1]).toMatchObject({ type: 'file', relativePath: 'notes.bin' })
  })

  it('lists a nested directory using a relative path', async () => {
    const root = makeWorkspace()
    const entries = await listWorkspaceDir(root, 'src')
    expect(entries).toEqual([
      expect.objectContaining({ name: 'index.ts', relativePath: 'src/index.ts', type: 'file' })
    ])
  })

  it('rejects a path that escapes the workspace root', async () => {
    const root = makeWorkspace()
    await expect(listWorkspaceDir(root, '../outside')).rejects.toThrow(WorkspacePathViolationError)
  })

  it('rejects listing a file as if it were a directory', async () => {
    const root = makeWorkspace()
    await expect(listWorkspaceDir(root, 'README.md')).rejects.toThrow('Not a directory')
  })
})

describe('resolveWorkspaceFilePath', () => {
  it('resolves a file path inside the workspace', async () => {
    const root = makeWorkspace()
    expect(await resolveWorkspaceFilePath(root, 'README.md')).toBe(join(root, 'README.md'))
  })

  it('rejects a directory', async () => {
    const root = makeWorkspace()
    await expect(resolveWorkspaceFilePath(root, 'src')).rejects.toThrow('Not a file')
  })
})

describe('readWorkspaceFilePreview', () => {
  it('previews a text file with its content inline', async () => {
    const root = makeWorkspace()
    const preview = await readWorkspaceFilePreview(root, 'src/index.ts')
    expect(preview).toMatchObject({ kind: 'text', name: 'index.ts', content: 'export const x = 1\n' })
    expect(preview.truncated).toBeFalsy()
  })

  it('previews a PNG as an image with base64 content and the right mime type', async () => {
    const root = makeWorkspace()
    const preview = await readWorkspaceFilePreview(root, 'pixel.png')
    expect(preview.kind).toBe('image')
    expect(preview.mimeType).toBe('image/png')
    expect(preview.content).toBeTruthy()
  })

  it('treats a file containing NUL bytes as binary (no content)', async () => {
    const root = makeWorkspace()
    const preview = await readWorkspaceFilePreview(root, 'notes.bin')
    expect(preview).toMatchObject({ kind: 'binary', name: 'notes.bin' })
    expect(preview.content).toBeUndefined()
  })

  it('marks a text file as truncated when it exceeds the preview cap', async () => {
    const root = makeWorkspace()
    // Write a file just over a small threshold by writing >2MB of text.
    const big = 'a'.repeat(2 * 1024 * 1024 + 10)
    writeFileSync(join(root, 'big.txt'), big)
    const preview = await readWorkspaceFilePreview(root, 'big.txt')
    expect(preview.kind).toBe('text')
    expect(preview.truncated).toBe(true)
    expect(preview.content?.length).toBeLessThan(big.length)
  })

  it('rejects a path that escapes the workspace root', async () => {
    const root = makeWorkspace()
    await expect(readWorkspaceFilePreview(root, '../outside.txt')).rejects.toThrow(
      WorkspacePathViolationError
    )
  })
})
