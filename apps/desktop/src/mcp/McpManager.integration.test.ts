import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { McpServerConfig } from '@shared/types'

import { McpManager } from './McpManager'

// End-to-end: spawn a real stdio MCP server (echo-server.cjs) as a child process, connect
// through McpManager, and verify the full connect -> discover -> call path plus tool-name
// sanitization. This is the closest we get to the real runtime without launching Electron.
const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'echo-server.cjs'
)

function echoServerConfig(): McpServerConfig {
  return {
    id: 'echo-1',
    name: 'Echo Server',
    type: 'stdio',
    command: process.execPath, // the node binary running vitest
    args: [fixturePath],
    enabled: true
  }
}

let manager: McpManager

afterEach(async () => {
  await manager?.shutdown()
})

describe('McpManager (stdio integration)', () => {
  it('connects to a real stdio server and reports connected status', async () => {
    manager = new McpManager()
    await manager.initializeServers([echoServerConfig()])

    const status = manager.getServerStatus()
    expect(status).toHaveLength(1)
    expect(status[0]).toMatchObject({ name: 'Echo Server', connected: true, status: 'connected' })
    expect(status[0].toolCount).toBe(1)
  })

  it('discovers tools with a sanitized, server-prefixed, model-facing name', async () => {
    manager = new McpManager()
    await manager.initializeServers([echoServerConfig()])

    const tools = manager.getTools()
    expect(tools).toHaveLength(1)
    // "echo.tool" from server "Echo Server" -> dots/spaces sanitized, prefixed with mcp__<server>__
    expect(tools[0].name).toBe('mcp__Echo_Server__echo_tool')
    expect(tools[0].originalName).toBe('echo.tool')
    expect(tools[0].inputSchema.properties).toHaveProperty('text')
  })

  it('calls the tool by its model-facing name and returns the server text result', async () => {
    manager = new McpManager()
    await manager.initializeServers([echoServerConfig()])

    const result = await manager.callTool('mcp__Echo_Server__echo_tool', { text: 'hello mcp' })
    expect(result).toBe('echo: hello mcp')
  })

  it('does not connect a disabled server', async () => {
    manager = new McpManager()
    await manager.initializeServers([{ ...echoServerConfig(), enabled: false }])

    const status = manager.getServerStatus()
    expect(status[0]).toMatchObject({ connected: false, status: 'disabled' })
    expect(manager.getTools()).toHaveLength(0)
  })
})
