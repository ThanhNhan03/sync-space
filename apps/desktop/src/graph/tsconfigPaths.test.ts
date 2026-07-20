import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadTsconfigPathAliases } from './tsconfigPaths'

function makeWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'syncspace-graph-tsconfig-'))
}

describe('loadTsconfigPathAliases', () => {
  it('returns null when there is no tsconfig.json', () => {
    const root = makeWorkspace()
    expect(loadTsconfigPathAliases(root)).toBeNull()
  })

  it('parses paths from a tsconfig with JSONC comments and a trailing comma', () => {
    const root = makeWorkspace()
    writeFileSync(
      join(root, 'tsconfig.json'),
      `{
        // this is a comment
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@app/*": ["src/app/*"],
          },
        },
      }`
    )
    expect(loadTsconfigPathAliases(root)).toEqual({ '@app/*': ['src/app/*'] })
  })

  it('follows an extends chain, inheriting paths from the base config', () => {
    const root = makeWorkspace()
    writeFileSync(
      join(root, 'tsconfig.base.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['src/shared/*'] } } })
    )
    // The derived config centralizes paths in the base and doesn't redefine its own -- the
    // common monorepo pattern. (Per real tsc semantics, a child-defined `paths` would fully
    // replace the base's rather than merge with it, confirmed against the installed compiler.)
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ extends: './tsconfig.base.json', compilerOptions: { strict: true } })
    )
    const result = loadTsconfigPathAliases(root)
    expect(result).toEqual({ '@shared/*': ['src/shared/*'] })
  })

  it('blocks an extends chain that tries to read a file outside the workspace', () => {
    const root = makeWorkspace()
    const outside = mkdtempSync(join(tmpdir(), 'syncspace-graph-tsconfig-outside-'))
    writeFileSync(
      join(outside, 'secret.json'),
      JSON.stringify({ compilerOptions: { paths: { '@leaked/*': ['leaked/*'] } } })
    )

    const escapePath = join(outside, 'secret.json').split(sep).join('/')
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        extends: escapePath,
        compilerOptions: { paths: { '@safe/*': ['src/safe/*'] } }
      })
    )

    const result = loadTsconfigPathAliases(root)
    expect(result).toMatchObject({ '@safe/*': ['src/safe/*'] })
    expect(result?.['@leaked/*']).toBeUndefined()
  })

  it('falls back to merging paths from referenced projects when the root config defines none', () => {
    // Mirrors this repo's own apps/desktop/tsconfig.json: a project-references shell with the
    // real `paths` split across tsconfig.node.json/tsconfig.web.json.
    const root = makeWorkspace()
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        files: [],
        references: [{ path: './tsconfig.node.json' }, { path: './tsconfig.web.json' }]
      })
    )
    writeFileSync(
      join(root, 'tsconfig.node.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@engine/*': ['src/engine/*'] } } })
    )
    writeFileSync(
      join(root, 'tsconfig.web.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@renderer/*': ['src/renderer/src/*'] } } })
    )

    const result = loadTsconfigPathAliases(root)
    expect(result).toEqual({ '@engine/*': ['src/engine/*'], '@renderer/*': ['src/renderer/src/*'] })
  })

  it('does not loop forever on a reference cycle', () => {
    const root = makeWorkspace()
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ references: [{ path: './tsconfig.a.json' }] }))
    writeFileSync(join(root, 'tsconfig.a.json'), JSON.stringify({ references: [{ path: './tsconfig.json' }] }))

    expect(loadTsconfigPathAliases(root)).toBeNull()
  })
})
