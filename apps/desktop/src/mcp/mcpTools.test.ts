import { describe, expect, it, vi } from 'vitest'

import type { ToolContext } from '@tools/Tool'

import { createMcpTool } from './mcpTools'
import type { McpManager } from './McpManager'
import type { McpTool } from './types'

const context: ToolContext = { workspaceRoot: '/workspace' }

const mcpTool: McpTool = {
  name: 'mcp__notion__search',
  originalName: 'search',
  description: 'Search Notion.',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  serverId: 'srv-1',
  serverName: 'Notion'
}

function fakeManager(callTool: McpManager['callTool']): McpManager {
  return { callTool } as unknown as McpManager
}

describe('createMcpTool', () => {
  it('bridges the MCP tool metadata into the Tool contract, prefixing the server name', () => {
    const tool = createMcpTool(fakeManager(vi.fn()), mcpTool)
    expect(tool.name).toBe('mcp__notion__search')
    expect(tool.description).toBe('[MCP: Notion] Search Notion.')
    expect(tool.schema).toBe(mcpTool.inputSchema)
  })

  it('delegates execute() to manager.callTool by model-facing name and returns ok', async () => {
    const callTool = vi.fn().mockResolvedValue('results here')
    const tool = createMcpTool(fakeManager(callTool), mcpTool)

    const result = await tool.execute({ query: 'roadmap' }, context)

    expect(callTool).toHaveBeenCalledWith('mcp__notion__search', { query: 'roadmap' })
    expect(result).toEqual({ ok: true, content: 'results here' })
  })

  it('converts a thrown call into an isError result instead of propagating', async () => {
    const callTool = vi.fn().mockRejectedValue(new Error('server not connected'))
    const tool = createMcpTool(fakeManager(callTool), mcpTool)

    const result = await tool.execute({ query: 'x' }, context)

    expect(result.ok).toBe(false)
    expect(result.isError).toBe(true)
    expect(result.content).toBe('server not connected')
  })
})
