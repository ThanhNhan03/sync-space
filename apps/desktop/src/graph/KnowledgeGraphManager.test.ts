import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { KnowledgeGraphManager } from './KnowledgeGraphManager'

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'syncspace-graph-manager-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(
    join(root, 'src', 'a.ts'),
    `import { b } from './b'\nexport function useB(): number { return b }\n`
  )
  writeFileSync(join(root, 'src', 'b.ts'), `export const b = 1\n`)
  writeFileSync(join(root, 'main.py'), `def entry():\n    pass\n`)
  return root
}

describe('KnowledgeGraphManager', () => {
  it('builds a graph with file/symbol nodes and defines/imports edges, including a reverse index', async () => {
    const root = makeWorkspace()
    const manager = new KnowledgeGraphManager()
    const graph = await manager.ensureBuilt(root)

    expect(graph.fileCount).toBe(3)
    expect(graph.nodesById.has('src/a.ts')).toBe(true)
    expect(graph.nodesById.has('src/a.ts#useB')).toBe(true)
    expect(graph.nodesById.has('main.py#entry')).toBe(true)

    const aEdges = graph.edgesByFromId.get('src/a.ts') ?? []
    expect(aEdges).toContainEqual({ fromId: 'src/a.ts', toId: 'src/a.ts#useB', kind: 'defines' })
    expect(aEdges).toContainEqual({ fromId: 'src/a.ts', toId: 'src/b.ts', kind: 'imports' })

    const bReverse = graph.edgesByToId.get('src/b.ts') ?? []
    expect(bReverse).toContainEqual({ fromId: 'src/a.ts', toId: 'src/b.ts', kind: 'imports' })
  })

  it('serves a cache hit without rebuilding (new files stay invisible until rebuild)', async () => {
    const root = makeWorkspace()
    const manager = new KnowledgeGraphManager()
    const first = await manager.ensureBuilt(root)
    expect(first.fileCount).toBe(3)

    writeFileSync(join(root, 'src', 'c.ts'), 'export const c = 1\n')

    const second = await manager.ensureBuilt(root)
    expect(second).toBe(first)
    expect(second.fileCount).toBe(3)
  })

  it('rebuild() always performs a fresh walk', async () => {
    const root = makeWorkspace()
    const manager = new KnowledgeGraphManager()
    await manager.ensureBuilt(root)

    writeFileSync(join(root, 'src', 'c.ts'), 'export const c = 1\n')

    const rebuilt = await manager.rebuild(root)
    expect(rebuilt.fileCount).toBe(4)
    expect(await manager.ensureBuilt(root)).toBe(rebuilt)
  })

  it('de-duplicates concurrent ensureBuilt calls into a single build', async () => {
    const root = makeWorkspace()
    const manager = new KnowledgeGraphManager()
    const [a, b] = await Promise.all([manager.ensureBuilt(root), manager.ensureBuilt(root)])
    expect(a).toBe(b)
  })

  it('reports status from the cache only, without triggering a build', async () => {
    const root = makeWorkspace()
    const manager = new KnowledgeGraphManager()
    expect(manager.getStatus(root)).toEqual({ indexed: false })

    await manager.ensureBuilt(root)
    const status = manager.getStatus(root)
    expect(status.indexed).toBe(true)
    expect(status.fileCount).toBe(3)
  })

  it('evicts the least-recently-used workspace past the cache bound', async () => {
    const manager = new KnowledgeGraphManager()
    const roots: string[] = []
    for (let i = 0; i < 9; i++) {
      const root = mkdtempSync(join(tmpdir(), `syncspace-graph-lru-${i}-`))
      writeFileSync(join(root, 'index.ts'), 'export const x = 1\n')
      roots.push(root)
      await manager.ensureBuilt(root)
    }

    expect(manager.getStatus(roots[0]).indexed).toBe(false)
    expect(manager.getStatus(roots[8]).indexed).toBe(true)
  })
})
