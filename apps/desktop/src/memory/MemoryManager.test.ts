import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage, MemoryEntry } from '@shared/types'
import type { MemoriesRepository } from '@database/repositories'
import type { LLMProvider } from '@providers/LLMProvider'

import { MemoryManager } from './MemoryManager'

/** Minimal in-memory stand-in for MemoriesRepository (better-sqlite3 can't load under vitest). */
class FakeRepo {
  readonly map = new Map<string, MemoryEntry>()
  add(entry: MemoryEntry): MemoryEntry {
    this.map.set(entry.id, entry)
    return entry
  }
  updateContent(id: string, content: string, updatedAt: number): void {
    const existing = this.map.get(id)
    if (existing) this.map.set(id, { ...existing, content, updatedAt })
  }
  delete(id: string): void {
    this.map.delete(id)
  }
  getById(id: string): MemoryEntry | undefined {
    return this.map.get(id)
  }
  listForScope(workspaceRoot: string): MemoryEntry[] {
    return [...this.map.values()]
      .filter((e) => e.workspaceRoot === workspaceRoot || e.workspaceRoot === '')
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
  listAll(): MemoryEntry[] {
    return [...this.map.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }
  clearForScope(workspaceRoot: string): number {
    let n = 0
    for (const e of [...this.map.values()]) {
      if (e.workspaceRoot === workspaceRoot || e.workspaceRoot === '') {
        this.map.delete(e.id)
        n++
      }
    }
    return n
  }
  clearAll(): number {
    const n = this.map.size
    this.map.clear()
    return n
  }
}

function repo(): { fake: FakeRepo; typed: MemoriesRepository } {
  const fake = new FakeRepo()
  return { fake, typed: fake as unknown as MemoriesRepository }
}

function providerReturning(content: string): LLMProvider {
  return {
    complete: vi.fn(async () => ({ content, toolCalls: [], stopReason: 'stop' as const }))
  } as unknown as LLMProvider
}

const messages: ChatMessage[] = [
  { id: 'u', sessionId: 's', role: 'user', content: 'I prefer dark mode', createdAt: 0 }
]

describe('MemoryManager.getPromptSection', () => {
  it('returns "" when memory is disabled', () => {
    const { fake, typed } = repo()
    fake.add({ id: 'm1', workspaceRoot: '/ws', category: 'fact', content: 'x', source: 'auto', createdAt: 1, updatedAt: 1 })
    const manager = new MemoryManager(typed, () => false)
    expect(manager.getPromptSection('/ws', 'x')).toBe('')
  })

  it('injects stored memories for the scope when enabled', () => {
    const { fake, typed } = repo()
    fake.add({ id: 'm1', workspaceRoot: '/ws', category: 'preference', content: 'prefers dark mode', source: 'auto', createdAt: 1, updatedAt: 1 })
    const manager = new MemoryManager(typed, () => true)
    expect(manager.getPromptSection('/ws', 'theme')).toContain('prefers dark mode')
  })
})

describe('MemoryManager.extract', () => {
  it('applies add/update/delete actions from the model output', async () => {
    const { fake, typed } = repo()
    fake.add({ id: 'old', workspaceRoot: '/ws', category: 'fact', content: 'stale', source: 'auto', createdAt: 1, updatedAt: 1 })
    const manager = new MemoryManager(typed, () => true)
    const provider = providerReturning(
      JSON.stringify({
        actions: [
          { op: 'add', category: 'preference', content: 'prefers dark mode' },
          { op: 'update', id: 'old', content: 'fresh' },
          { op: 'delete', id: 'missing' }
        ]
      })
    )

    await manager.extract(provider, 'gpt-test', '/ws', 's', messages)

    const contents = fake.listForScope('/ws').map((e) => e.content).sort()
    expect(contents).toEqual(['fresh', 'prefers dark mode'])
  })

  it('does nothing when disabled and never calls the provider', async () => {
    const { fake, typed } = repo()
    const manager = new MemoryManager(typed, () => false)
    const provider = providerReturning('{"actions":[{"op":"add","content":"x"}]}')
    await manager.extract(provider, 'gpt-test', '/ws', 's', messages)
    expect((provider.complete as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    expect(fake.map.size).toBe(0)
  })

  it('does not touch memories belonging to a different workspace scope', async () => {
    const { fake, typed } = repo()
    fake.add({ id: 'other', workspaceRoot: '/other', category: 'fact', content: 'keep me', source: 'auto', createdAt: 1, updatedAt: 1 })
    const manager = new MemoryManager(typed, () => true)
    const provider = providerReturning(JSON.stringify({ actions: [{ op: 'delete', id: 'other' }] }))
    await manager.extract(provider, 'gpt-test', '/ws', 's', messages)
    expect(fake.getById('other')).toBeDefined()
  })
})
