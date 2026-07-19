import type { Tool, ToolExecutionResult } from '@tools/Tool'

import type { McpManager } from './McpManager'
import type { McpTool } from './types'

/**
 * Adapts an MCP-discovered tool into SyncSpace's `Tool` contract so the Agent Runner and
 * ToolManager treat it exactly like a built-in tool -- the runner never learns that a tool
 * came from MCP. Execution is delegated to the manager, which owns the live client
 * connection and handles timeouts/reconnects. The workspace context is ignored: MCP tools
 * operate through their own arguments and server-side scoping, not the app's workspace root.
 */
export function createMcpTool(manager: McpManager, mcpTool: McpTool): Tool {
  return {
    name: mcpTool.name,
    description: mcpTool.serverName
      ? `[MCP: ${mcpTool.serverName}] ${mcpTool.description}`.trim()
      : mcpTool.description,
    schema: mcpTool.inputSchema,
    async execute(args): Promise<ToolExecutionResult> {
      try {
        const content = await manager.callTool(mcpTool.name, args)
        return { ok: true, content }
      } catch (error) {
        return {
          ok: false,
          isError: true,
          content: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }
}

export function createMcpTools(manager: McpManager): Tool[] {
  return manager.getTools().map((tool) => createMcpTool(manager, tool))
}
