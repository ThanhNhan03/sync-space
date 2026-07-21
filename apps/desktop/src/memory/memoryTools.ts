import type { JsonSchema, Tool, ToolExecutionResult } from '@tools/Tool'
import type { MemoryCategory } from '@shared/types'

import type { MemoryManager } from './MemoryManager'
import { MEMORY_CATEGORIES } from './memoryPrompt'
import { selectRelevant } from './memoryRanker'

const DISABLED_MESSAGE = 'Long-term memory is currently disabled in Settings.'
const RECALL_LIMIT = 10

const rememberSchema: JsonSchema = {
  type: 'object',
  description: 'Save a durable fact about the user or project to long-term memory.',
  properties: {
    content: {
      type: 'string',
      description: 'The fact to remember, phrased so it is useful in a future session.'
    },
    category: {
      type: 'string',
      enum: MEMORY_CATEGORIES,
      description: "Kind of fact: 'identity', 'preference', 'project', or 'fact' (default)."
    }
  },
  required: ['content']
}

const recallSchema: JsonSchema = {
  type: 'object',
  description: 'Search long-term memory for facts relevant to a query.',
  properties: {
    query: { type: 'string', description: 'What you want to recall.' }
  },
  required: ['query']
}

/**
 * Explicit memory tools for the agent -- the deterministic counterpart to automatic
 * injection/extraction. Both are gated by the same enable flag so turning memory off in
 * Settings fully disables reads and writes. Memories are scoped to the run's workspace.
 */
export function createMemoryTools(manager: MemoryManager, isEnabled: () => boolean): Tool[] {
  const remember: Tool = {
    name: 'remember',
    description:
      'Save a durable fact about the user or project (e.g. a preference, environment detail, or project decision) so you can recall it in future sessions. Use for stable facts, not one-off task details.',
    schema: rememberSchema,
    async execute(args, context): Promise<ToolExecutionResult> {
      if (!isEnabled()) {
        return { ok: false, isError: true, content: DISABLED_MESSAGE }
      }
      const content = typeof args.content === 'string' ? args.content.trim() : ''
      if (!content) {
        return { ok: false, isError: true, content: 'remember requires a non-empty "content" string.' }
      }
      const category = (MEMORY_CATEGORIES as string[]).includes(args.category as string)
        ? (args.category as MemoryCategory)
        : 'fact'
      // Workspace-less chat -> '' (the global memory scope).
      manager.add({ workspaceRoot: context.workspaceRoot ?? '', category, content, source: 'agent' })
      return { ok: true, content: `Remembered (${category}): ${content}` }
    }
  }

  const recall: Tool = {
    name: 'recall',
    description:
      'Search your long-term memory for durable facts relevant to a query. Returns the most relevant remembered facts for the current workspace (and global memories).',
    schema: recallSchema,
    async execute(args, context): Promise<ToolExecutionResult> {
      if (!isEnabled()) {
        return { ok: false, isError: true, content: DISABLED_MESSAGE }
      }
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      if (!query) {
        return { ok: false, isError: true, content: 'recall requires a non-empty "query" string.' }
      }
      const matches = selectRelevant(manager.list(context.workspaceRoot ?? undefined), query, RECALL_LIMIT)
      if (matches.length === 0) {
        return { ok: true, content: 'No relevant memories found.' }
      }
      const lines = matches.map((entry) => `- (${entry.category}) ${entry.content}`)
      return { ok: true, content: `Relevant memories:\n${lines.join('\n')}` }
    }
  }

  return [remember, recall]
}
