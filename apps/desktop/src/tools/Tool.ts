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

/** A focused sub-task handed to a child agent by the spawn_subagent tool. */
export interface SubagentRequest {
  task: string
  /** Optional description of the desired output shape. */
  resultFormat?: string
  /** Wall-clock limit for the child run; clamped by the coordinator. */
  timeoutSeconds?: number
}

export interface SubagentResult {
  ok: boolean
  /** The child agent's final text, or an error/timeout message when ok is false. */
  text: string
}

export interface ToolContext {
  /** Absolute path to the workspace folder this session is bound to. */
  workspaceRoot: string
  /**
   * Runs a focused child agent to completion and returns its final answer. Present only on
   * top-level runs -- it is deliberately omitted from a child's context so subagents cannot
   * spawn further subagents (bounding fan-out).
   */
  spawnSubagent?: (request: SubagentRequest) => Promise<SubagentResult>
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
