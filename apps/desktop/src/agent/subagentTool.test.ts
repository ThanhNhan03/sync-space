import { describe, expect, it, vi } from 'vitest'

import type { SubagentResult, ToolContext } from '@tools/Tool'

import { createSpawnSubagentTool } from './subagentTool'

describe('createSpawnSubagentTool', () => {
  it('errors when the context has no spawnSubagent capability (e.g. inside a child run)', async () => {
    const tool = createSpawnSubagentTool()
    const result = await tool.execute({ task: 'do it' }, { workspaceRoot: '/ws' })
    expect(result.ok).toBe(false)
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/not available/)
  })

  it('forwards task/result_format/timeout to spawnSubagent and returns its text', async () => {
    const spawnSubagent = vi.fn(async (): Promise<SubagentResult> => ({ ok: true, text: 'the answer' }))
    const context: ToolContext = { workspaceRoot: '/ws', spawnSubagent }
    const tool = createSpawnSubagentTool()

    const result = await tool.execute(
      { task: 'summarize', result_format: 'bullets', timeout_seconds: 60 },
      context
    )

    expect(spawnSubagent).toHaveBeenCalledWith({
      task: 'summarize',
      resultFormat: 'bullets',
      timeoutSeconds: 60
    })
    expect(result).toEqual({ ok: true, isError: false, content: 'the answer' })
  })

  it('forwards a named agent persona through to spawnSubagent', async () => {
    const spawnSubagent = vi.fn(async (): Promise<SubagentResult> => ({ ok: true, text: 'ok' }))
    const tool = createSpawnSubagentTool()
    await tool.execute({ task: 't', agent: 'researcher' }, { workspaceRoot: '/ws', spawnSubagent })
    expect(spawnSubagent).toHaveBeenCalledWith(expect.objectContaining({ agent: 'researcher' }))
  })

  it('maps a failed subagent result to an isError tool result', async () => {
    const spawnSubagent = vi.fn(async (): Promise<SubagentResult> => ({ ok: false, text: 'timed out' }))
    const tool = createSpawnSubagentTool()
    const result = await tool.execute({ task: 't' }, { workspaceRoot: '/ws', spawnSubagent })
    expect(result).toEqual({ ok: false, isError: true, content: 'timed out' })
  })
})
