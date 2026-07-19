import type { JsonSchema, Tool, ToolExecutionResult } from '@tools/Tool'

export const SPAWN_SUBAGENT_TOOL_NAME = 'spawn_subagent'

const schema: JsonSchema = {
  type: 'object',
  description: 'Spawn a focused child agent to complete a sub-task in its own isolated context.',
  properties: {
    task: {
      type: 'string',
      description:
        'A clear, self-contained description of what the child should accomplish. Include all needed context — the child cannot see this conversation.'
    },
    result_format: {
      type: 'string',
      description: 'Optional description of the desired output format. Omit for free-form text.'
    },
    timeout_seconds: {
      type: 'number',
      description: 'Maximum execution time in seconds. Default 120, max 300.'
    }
  },
  required: ['task']
}

/**
 * Exposes `spawn_subagent` to the model. The heavy lifting (running a child agent with the
 * session's provider/tools) lives behind `context.spawnSubagent`, which the engine provides
 * only on top-level runs -- so a subagent's own context lacks it and cannot recurse.
 */
export function createSpawnSubagentTool(): Tool {
  return {
    name: SPAWN_SUBAGENT_TOOL_NAME,
    description:
      'Delegate a focused sub-task to a child agent that works in its own isolated context (it inherits your tools but not your conversation) and returns only the result. Use it to parallelize independent work or keep a large sub-task out of your main context. The child cannot spawn further subagents.',
    schema,

    async execute(args, context): Promise<ToolExecutionResult> {
      if (!context.spawnSubagent) {
        return {
          ok: false,
          isError: true,
          content: 'Subagents are not available in this context (a subagent cannot spawn another).'
        }
      }
      const task = typeof args.task === 'string' ? args.task : ''
      const resultFormat = typeof args.result_format === 'string' ? args.result_format : undefined
      const timeoutSeconds =
        typeof args.timeout_seconds === 'number' && Number.isFinite(args.timeout_seconds)
          ? args.timeout_seconds
          : undefined

      const result = await context.spawnSubagent({ task, resultFormat, timeoutSeconds })
      return { ok: result.ok, isError: !result.ok, content: result.text }
    }
  }
}
