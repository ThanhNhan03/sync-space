import { describe, expect, it } from 'vitest'

import { ToolManager } from './ToolManager'
import type { Tool, ToolContext } from './Tool'

const context: ToolContext = { workspaceRoot: '/workspace' }

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'echo',
    description: 'Echoes its input.',
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    execute: async (args) => ({ ok: true, content: String(args.text ?? '') }),
    ...overrides
  }
}

describe('ToolManager', () => {
  it('exposes tool definitions for every registered tool', () => {
    const manager = new ToolManager([makeTool(), makeTool({ name: 'other', description: 'Other tool' })])
    const defs = manager.getToolDefinitions()
    expect(defs.map((d) => d.name).sort()).toEqual(['echo', 'other'])
    expect(defs.find((d) => d.name === 'echo')?.description).toBe('Echoes its input.')
  })

  it('executes a registered tool and wraps the result with id/name', async () => {
    const manager = new ToolManager([makeTool()])
    const result = await manager.execute({ id: 'call-1', name: 'echo', arguments: { text: 'hi' } }, context)
    expect(result).toEqual({ id: 'call-1', name: 'echo', ok: true, isError: undefined, content: 'hi' })
  })

  it('returns an isError result for an unknown tool name instead of throwing', async () => {
    const manager = new ToolManager([makeTool()])
    const result = await manager.execute({ id: 'call-2', name: 'does_not_exist', arguments: {} }, context)
    expect(result.ok).toBe(false)
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/does_not_exist/)
  })

  it('catches a tool that throws instead of letting the error propagate', async () => {
    const manager = new ToolManager([
      makeTool({
        name: 'boom',
        execute: async () => {
          throw new Error('kaboom')
        }
      })
    ])
    const result = await manager.execute({ id: 'call-3', name: 'boom', arguments: {} }, context)
    expect(result.ok).toBe(false)
    expect(result.isError).toBe(true)
    expect(result.content).toBe('kaboom')
  })

  it('passes the ToolContext through to execute()', async () => {
    let receivedContext: ToolContext | null = null
    const manager = new ToolManager([
      makeTool({
        name: 'context-check',
        execute: async (_args, ctx) => {
          receivedContext = ctx
          return { ok: true, content: 'ok' }
        }
      })
    ])
    await manager.execute({ id: 'call-4', name: 'context-check', arguments: {} }, context)
    expect(receivedContext).toEqual(context)
  })
})
