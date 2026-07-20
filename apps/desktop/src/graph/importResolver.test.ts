import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveImportSpecifier } from './importResolver'

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'syncspace-graph-resolver-'))
  mkdirSync(join(root, 'src', 'shared'), { recursive: true })
  mkdirSync(join(root, 'src', 'utils'), { recursive: true })
  writeFileSync(join(root, 'src', 'shared', 'types.ts'), 'export interface X {}\n')
  writeFileSync(join(root, 'src', 'utils', 'index.ts'), 'export const helper = 1\n')
  writeFileSync(join(root, 'src', 'main.ts'), 'export const main = 1\n')
  return root
}

describe('resolveImportSpecifier', () => {
  it('resolves a relative specifier by trying candidate extensions', async () => {
    const root = makeWorkspace()
    const resolved = await resolveImportSpecifier('./shared/types', 'src/main.ts', root, null)
    expect(resolved).toBe('src/shared/types.ts')
  })

  it('resolves a relative specifier to a directory index file, skipping the bare directory', async () => {
    const root = makeWorkspace()
    const resolved = await resolveImportSpecifier('./utils', 'src/main.ts', root, null)
    expect(resolved).toBe('src/utils/index.ts')
  })

  it('strips a Vite-style query suffix before resolving', async () => {
    const root = makeWorkspace()
    const resolved = await resolveImportSpecifier('./shared/types?raw', 'src/main.ts', root, null)
    expect(resolved).toBe('src/shared/types.ts')
  })

  it('resolves an alias specifier against tsconfig path aliases, trying every array entry', async () => {
    const root = makeWorkspace()
    const aliases = { '@shared/*': ['src/nonexistent/*', 'src/shared/*'] }
    const resolved = await resolveImportSpecifier('@shared/types', 'src/main.ts', root, aliases)
    expect(resolved).toBe('src/shared/types.ts')
  })

  it('returns null for an unresolved bare specifier (external package)', async () => {
    const root = makeWorkspace()
    const resolved = await resolveImportSpecifier('react', 'src/main.ts', root, null)
    expect(resolved).toBeNull()
  })

  it('returns null for an alias-shaped specifier with no matching configured key', async () => {
    const root = makeWorkspace()
    const resolved = await resolveImportSpecifier('@modelcontextprotocol/sdk', 'src/main.ts', root, {
      '@shared/*': ['src/shared/*']
    })
    expect(resolved).toBeNull()
  })
})
