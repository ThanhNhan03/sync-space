import { describe, expect, it, vi } from 'vitest'

import type { SubagentRequest } from '@tools/Tool'

import {
  buildAgentsPromptSection,
  buildSubagentSystemPromptSuffix,
  filterSkillsForAgent,
  runSubagent,
  MAX_TASK_LENGTH,
  type RunSubagentDeps,
  type SubagentProgress
} from './subagent'

function makeDeps(overrides: Partial<RunSubagentDeps> = {}): {
  deps: RunSubagentDeps
  progress: SubagentProgress[]
} {
  const progress: SubagentProgress[] = []
  const deps: RunSubagentDeps = {
    runChild: async () => 'child result',
    concurrency: { active: 0 },
    maxConcurrent: 3,
    defaultTimeoutMs: 5000,
    maxTimeoutMs: 300_000,
    isParentCancelled: () => false,
    onProgress: (p) => progress.push(p),
    generateId: () => 'sub-1',
    ...overrides
  }
  return { deps, progress }
}

const task: SubagentRequest = { task: 'summarize the readme' }

describe('runSubagent', () => {
  it('runs the child and returns its trimmed text, emitting started+completed', async () => {
    const { deps, progress } = makeDeps({ runChild: async () => '  the summary  ' })
    const result = await runSubagent(task, deps)
    expect(result).toEqual({ ok: true, text: 'the summary' })
    expect(progress.map((p) => p.phase)).toEqual(['started', 'completed'])
    expect(deps.concurrency.active).toBe(0) // released
  })

  it('rejects an empty task without running the child', async () => {
    const runChild = vi.fn()
    const { deps } = makeDeps({ runChild })
    const result = await runSubagent({ task: '   ' }, deps)
    expect(result.ok).toBe(false)
    expect(runChild).not.toHaveBeenCalled()
  })

  it('rejects an over-length task', async () => {
    const { deps } = makeDeps()
    const result = await runSubagent({ task: 'x'.repeat(MAX_TASK_LENGTH + 1) }, deps)
    expect(result.ok).toBe(false)
    expect(result.text).toMatch(/maximum length/)
  })

  it('refuses to exceed the concurrency cap', async () => {
    const runChild = vi.fn()
    const { deps } = makeDeps({ runChild, concurrency: { active: 3 }, maxConcurrent: 3 })
    const result = await runSubagent(task, deps)
    expect(result.ok).toBe(false)
    expect(result.text).toMatch(/concurrent subagents/)
    expect(runChild).not.toHaveBeenCalled()
  })

  it('forwards child tool starts as progress events', async () => {
    const { deps, progress } = makeDeps({
      runChild: async (_input, control) => {
        control.onToolStart('read_file')
        return 'done'
      }
    })
    await runSubagent(task, deps)
    expect(progress.find((p) => p.phase === 'tool')?.toolName).toBe('read_file')
  })

  it('returns a timeout result when the child runs past the timeout', async () => {
    const { deps, progress } = makeDeps({
      defaultTimeoutMs: 20,
      runChild: (_input, control) =>
        new Promise<string>((resolve) => {
          const iv = setInterval(() => {
            if (control.isCancelled()) {
              clearInterval(iv)
              resolve('partial')
            }
          }, 5)
        })
    })
    const result = await runSubagent(task, deps)
    expect(result.ok).toBe(false)
    expect(result.text).toMatch(/timed out/)
    expect(progress.at(-1)).toMatchObject({ phase: 'failed', error: 'timeout' })
    expect(deps.concurrency.active).toBe(0)
  })

  it('returns a cancelled result when the parent is cancelled', async () => {
    let cancelled = true
    const { deps } = makeDeps({
      isParentCancelled: () => cancelled,
      runChild: (_input, control) =>
        new Promise<string>((resolve) => {
          const iv = setInterval(() => {
            if (control.isCancelled()) {
              clearInterval(iv)
              resolve('x')
            }
          }, 5)
        })
    })
    const result = await runSubagent(task, deps)
    expect(result.ok).toBe(false)
    expect(result.text).toMatch(/cancelled/)
    void cancelled
  })

  it('reports a child error as a failed result and releases the slot', async () => {
    const { deps, progress } = makeDeps({
      runChild: async () => {
        throw new Error('boom')
      }
    })
    const result = await runSubagent(task, deps)
    expect(result).toEqual({ ok: false, text: 'Subagent error: boom' })
    expect(progress.at(-1)).toMatchObject({ phase: 'failed' })
    expect(deps.concurrency.active).toBe(0)
  })
})

describe('buildSubagentSystemPromptSuffix', () => {
  it('embeds the task and an optional result format', () => {
    const suffix = buildSubagentSystemPromptSuffix('do the thing', 'JSON array')
    expect(suffix).toContain('## Sub-agent task')
    expect(suffix).toContain('do the thing')
    expect(suffix).toContain('### Expected output format')
    expect(suffix).toContain('JSON array')
  })

  it('omits the format section when none is given', () => {
    expect(buildSubagentSystemPromptSuffix('t')).not.toContain('Expected output format')
  })

  it('prepends the agent persona when provided', () => {
    const suffix = buildSubagentSystemPromptSuffix('t', undefined, 'You are a careful reviewer.')
    expect(suffix).toContain('## Your role')
    expect(suffix).toContain('You are a careful reviewer.')
  })
})

describe('filterSkillsForAgent', () => {
  const skills = [{ id: 'pdf' }, { id: 'xlsx' }, { id: 'commit' }]

  it('returns all skills when the agent has no explicit skill list', () => {
    expect(filterSkillsForAgent(skills, undefined)).toBe(skills)
    expect(filterSkillsForAgent(skills, [])).toBe(skills)
  })

  it('restricts to the listed skill ids when set', () => {
    expect(filterSkillsForAgent(skills, ['pdf', 'commit']).map((s) => s.id)).toEqual(['pdf', 'commit'])
  })

  it('ignores ids that do not match any skill', () => {
    expect(filterSkillsForAgent(skills, ['nope']).map((s) => s.id)).toEqual([])
  })
})

describe('buildAgentsPromptSection', () => {
  it('returns "" when there are no agents', () => {
    expect(buildAgentsPromptSection([])).toBe('')
  })

  it('lists agents and explains delegation via spawn_subagent', () => {
    const section = buildAgentsPromptSection([
      { name: 'researcher', description: 'Investigates topics.' },
      { name: 'reviewer', description: 'Reviews diffs.' }
    ])
    expect(section).toContain('## Available agents')
    expect(section).toContain('spawn_subagent')
    expect(section).toContain('- researcher: Investigates topics.')
    expect(section).toContain('- reviewer: Reviews diffs.')
  })
})
