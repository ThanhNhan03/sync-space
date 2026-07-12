import type { ToolCallRequest, ToolCallResult } from '@shared/types'
import type { Tool, ToolContext, ToolDefinition } from './Tool'

/**
 * Registry the Agent Runner drives tool discovery/execution through. New tools are
 * added purely by registering them here (or in ./index.ts) -- the Agent Runner never
 * branches on tool name.
 */
export class ToolManager {
  private readonly tools = new Map<string, Tool>()

  constructor(tools: Tool[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.schema
    }))
  }

  async execute(request: ToolCallRequest, context: ToolContext): Promise<ToolCallResult> {
    const tool = this.tools.get(request.name)
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
