import type { ToolCallRequest, ToolCallResult } from '@shared/types'
import type { Tool, ToolContext, ToolDefinition } from './Tool'

/**
 * Registry the Agent Runner drives tool discovery/execution through. New tools are
 * added purely by registering them here (or in ./index.ts) -- the Agent Runner never
 * branches on tool name.
 */
export class ToolManager {
  private readonly tools = new Map<string, Tool>()
  /**
   * MCP-sourced tools, kept separate from the built-ins because they come and go at runtime
   * as servers connect/disconnect. Replaced wholesale via setMcpTools() on every MCP refresh;
   * built-in tools always take precedence on a name collision.
   */
  private mcpTools = new Map<string, Tool>()

  constructor(tools: Tool[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
  }

  /** Replace the current set of MCP-provided tools (called whenever MCP discovery changes). */
  setMcpTools(tools: Tool[]): void {
    const next = new Map<string, Tool>()
    for (const tool of tools) {
      next.set(tool.name, tool)
    }
    this.mcpTools = next
  }

  getToolDefinitions(): ToolDefinition[] {
    const merged = new Map<string, Tool>(this.mcpTools)
    for (const [name, tool] of this.tools) {
      merged.set(name, tool) // built-ins win on collision
    }
    return Array.from(merged.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema
    }))
  }

  async execute(request: ToolCallRequest, context: ToolContext): Promise<ToolCallResult> {
    const tool = this.tools.get(request.name) ?? this.mcpTools.get(request.name)
    if (!tool) {
      return {
        id: request.id,
        name: request.name,
        ok: false,
        isError: true,
        content: `Unknown tool: ${request.name}`
      }
    }

    try {
      const result = await tool.execute(request.arguments, context)
      return { id: request.id, name: request.name, ok: result.ok, isError: result.isError, content: result.content }
    } catch (error) {
      return {
        id: request.id,
        name: request.name,
        ok: false,
        isError: true,
        content: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
