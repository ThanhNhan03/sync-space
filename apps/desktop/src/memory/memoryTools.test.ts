import { describe, expect, it } from 'vitest'

import type { MemoryEntry } from '@shared/types'
import type { MemoriesRepository } from '@database/repositories'
import type { ToolContext } from '@tools/Tool'

import { MemoryManager } from './MemoryManager'
import { createMemoryTools } from './memoryTools'

class FakeRepo {
  readonly map = new Map<string, MemoryEntry>()
  add(entry: MemoryEntry): MemoryEntry {
    this.map.set(entry.id, entry)
    return entry
  }
  updateContent(): void {}
  delete(id: string): void {
    this.map.delete(id)
  }
  getById(id: string): MemoryEntry | undefined {
    return this.map.get(id)
  }
  listForScope(workspaceRoot: string): MemoryEntry[] {
    return [...this.map.values()].filter((e) => e.workspaceRoot === workspaceRoot || e.workspaceRoot === '')
  }
  listAll(): MemoryEntry[] {
    return [...this.map.values()]
  }
  clearForScope(): number {
    return 0
  }
  clearAll(): number {
    return 0
  }
}

const context: ToolContext = { workspaceRoot: '/ws' }

function setup(enabled: boolean): { fake: FakeRepo; tools: ReturnType<typeof createMemoryTools> } {
  const fake = new FakeRepo()
  const manager = new MemoryManager(fake as unknown as MemoriesRepository, () => enabled)
  return { fake, tools: createMemoryTools(manager, () => enabled) }
}

function tool(tools: ReturnType<typeof createMemoryTools>, name: string) {
  const found = tools.find((t) => t.name === name)
  if (!found) throw new Error(`tool ${name} not found`)
  return found
}

describe('remember tool', () => {
  it('saves a memory scoped to the current workspace', async () => {
    const { fake, tools } = setup(true)
    const result = await tool(tools, 'remember').execute(
      { content: 'prefers pnpm', category: 'preference' },
      context
    )
    expect(result.ok).toBe(true)
    const saved = [...fake.map.values()]
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ content: 'prefers pnpm', category: 'preference', workspaceRoot: '/ws', source: 'agent' })
  })

  it('is refused when memory is disabled', async () => {
    const { fake, tools } = setup(false)
    const result = await tool(tools, 'remember').execute({ content: 'x' }, context)
    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/disabled/i)
    expect(fake.map.size).toBe(0)
  })
})

describe('recall tool', () => {
  it('returns memories relevant to the query', async () => {
    const { fake, tools } = setup(true)
    fake.add({ id: 'm1', workspaceRoot: '/ws', category: 'preference', content: 'prefers dark mode', source: 'agent', createdAt: 0, updatedAt: 0 })
    const result = await tool(tools, 'recall').execute({ query: 'what theme does the user like' }, context)
    expect(result.ok).toBe(true)
    expect(result.content).toContain('prefers dark mode')
  })

  it('reports when nothing relevant is stored', async () => {
    const { tools } = setup(true)
    const result = await tool(tools, 'recall').execute({ query: 'anything' }, context)
    expect(result.ok).toBe(true)
    expect(result.content).toMatch(/no relevant memories/i)
  })
})
