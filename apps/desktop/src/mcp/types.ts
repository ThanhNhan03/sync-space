import type { JsonSchema } from '@tools/Tool'

/**
 * A tool discovered from a connected MCP server. `name` is the sanitized, prefixed,
 * model-facing name (see toolName.ts); `originalName` is the server's own tool name used
 * for the actual wire call.
 */
export interface McpTool {
  name: string
  originalName: string
  description: string
  inputSchema: JsonSchema
  serverId: string
  serverName: string
}
