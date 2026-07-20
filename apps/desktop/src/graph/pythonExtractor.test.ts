import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { extractPythonFile, resolvePythonImport } from './pythonExtractor'

describe('extractPythonFile', () => {
  it('extracts def, async def, and class declarations', () => {
    const source = `
def foo():
    pass

async def bar():
    pass

class Baz:
    def method(self):
        pass
`
    const result = extractPythonFile(source)
    const byName = new Map(result.symbols.map((s) => [s.name, s.kind]))
    expect(byName.get('foo')).toBe('function')
    expect(byName.get('bar')).toBe('function')
    expect(byName.get('Baz')).toBe('class')
    // Method extraction is TS-only in v1 -- Python's indented `def method` is not top-level.
    expect(byName.has('method')).toBe(false)
  })

  it('extracts import and from-import specifiers', () => {
    const source = `
import os
import os.path
from . import sibling
from ..pkg import mod
from ..pkg.mod import name
`
    const result = extractPythonFile(source)
    expect(result.importSpecifiers).toEqual(['os', 'os.path', '.', '..pkg', '..pkg.mod'])
  })
})

describe('resolvePythonImport', () => {
  function makeWorkspace(): string {
    const root = mkdtempSync(join(tmpdir(), 'syncspace-graph-py-'))
    mkdirSync(join(root, 'pkg', 'sub'), { recursive: true })
    writeFileSync(join(root, 'pkg', '__init__.py'), '')
    writeFileSync(join(root, 'pkg', 'sibling.py'), '')
    writeFileSync(join(root, 'pkg', 'sub', '__init__.py'), '')
    writeFileSync(join(root, 'pkg', 'sub', 'mod.py'), '')
    return root
  }

  it('resolves a single-dot relative import to a sibling module', async () => {
    const root = makeWorkspace()
    const resolved = await resolvePythonImport('.sibling', 'pkg/main.py', root)
    expect(resolved).toBe('pkg/sibling.py')
  })

  it('resolves "from . import x" (module-less relative) to the current package', async () => {
    const root = makeWorkspace()
    const resolved = await resolvePythonImport('.', 'pkg/sub/main.py', root)
    expect(resolved).toBe('pkg/sub/__init__.py')
  })

  it('resolves a two-dot relative import one level up (N dots -> N-1 levels up)', async () => {
    const root = makeWorkspace()
    // From pkg/sub/deep.py, two dots = 1 level up = pkg/, then "sub.mod" -> pkg/sub/mod.py
    const resolved = await resolvePythonImport('..sub.mod', 'pkg/sub/deep.py', root)
    expect(resolved).toBe('pkg/sub/mod.py')
  })

  it('resolves an absolute dotted import against the workspace root', async () => {
    const root = makeWorkspace()
    const resolved = await resolvePythonImport('pkg.sub.mod', 'main.py', root)
    expect(resolved).toBe('pkg/sub/mod.py')
  })

  it('returns null for an unresolvable (e.g. stdlib) import', async () => {
    const root = makeWorkspace()
    const resolved = await resolvePythonImport('os.path', 'main.py', root)
    expect(resolved).toBeNull()
  })
})
