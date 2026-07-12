import type { Tool } from './Tool'
import { fileTools } from './file'
import { searchTools } from './search'
import { gitTools } from './git'
import { executeTerminalTool } from './terminal/executeTerminal'

export const allTools: Tool[] = [...fileTools, ...searchTools, ...gitTools, executeTerminalTool]

export { ToolManager } from './ToolManager'
export type { Tool, ToolContext, ToolDefinition, ToolExecutionResult, JsonSchema } from './Tool'
