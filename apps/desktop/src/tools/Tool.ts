export interface JsonSchema {
  type: string
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  [key: string]: unknown
}

export interface ToolDefinition {
  name: string
  description: string
  schema: JsonSchema
}

export interface ToolContext {
  /** Absolute path to the workspace folder this session is bound to. */
  workspaceRoot: string
}

export interface ToolExecutionResult {
  ok: boolean
  content: string
  isError?: boolean
}

/**
 * A single agent capability. Tools are self-describing (name/description/schema)
 * so the Agent Runner and Tool Manager never need a hardcoded switch statement --
 * new tools are discovered by registration alone.
 */
export interface Tool {
  readonly name: string
  readonly description: string
  readonly schema: JsonSchema
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult>
}
