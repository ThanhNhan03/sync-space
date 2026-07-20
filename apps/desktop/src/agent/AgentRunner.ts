import { randomUUID } from 'node:crypto'

import type { AgentStreamEvent, ChatMessage, ToolCallRequest, ToolCallResult } from '@shared/types'
import type { LLMProvider } from '@providers/LLMProvider'
import type { ToolManager } from '@tools/ToolManager'
import type { SubagentRequest, SubagentResult, ToolContext } from '@tools/Tool'

import { SYSTEM_PROMPT } from './systemPrompt'

export interface AgentRunParams {
  sessionId: string
  provider: LLMProvider
  model: string
  temperature?: number
  workspaceRoot: string
  /**
   * Extra system-prompt text appended after the base prompt for this run -- currently the
   * "Available skills" section, which depends on the workspace and the user's enabled skills.
   */
  systemPromptSuffix?: string
  /** Full conversation history so far, including the user message that triggered this run. */
  history: ChatMessage[]
  /**
   * When present, tools may delegate to a focused child agent via context.spawnSubagent.
   * Omitted for child runs so subagents cannot spawn further subagents.
   */
  spawnSubagent?: (request: SubagentRequest) => Promise<SubagentResult>
  /** Tool names to hide from the model this run (e.g. spawn_subagent inside a child run). */
  excludeToolNames?: string[]
  /**
   * Consulted before each tool runs. Resolves 'allow' or 'deny' after any user-approval
   * round-trip. When omitted, all tools run (no gating).
   */
  checkToolPermission?: (toolCall: ToolCallRequest) => Promise<'allow' | 'deny'>
  onEvent: (event: AgentStreamEvent) => void
  persistMessage: (message: ChatMessage) => void
  isCancelled: () => boolean
}

const MAX_TURNS = 25

/**
 * Drives the core cowork loop: build context -> call LLM -> receive tool calls -> execute
 * tool -> append tool result -> continue LLM -> final answer. Generic over any LLMProvider
 * and any set of tools registered in the ToolManager -- adding a provider or a tool never
 * requires a change here.
 */
export class AgentRunner {
  constructor(private readonly toolManager: ToolManager) {}

  async run(params: AgentRunParams): Promise<void> {
    const { sessionId, provider, onEvent } = params
    const history = [...params.history]
    const systemPrompt = `${SYSTEM_PROMPT}${params.systemPromptSuffix ?? ''}`
    const toolContext: ToolContext = {
      workspaceRoot: params.workspaceRoot,
      spawnSubagent: params.spawnSubagent
    }
    const excludedTools = new Set(params.excludeToolNames ?? [])
    const toolDefinitions = this.toolManager
      .getToolDefinitions()
      .filter((definition) => !excludedTools.has(definition.name))

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (params.isCancelled()) {
        return
      }

      const assistantMessageId = randomUUID()
      let contentBuffer = ''
      const toolCalls: ToolCallRequest[] = []
      let sawError = false

      onEvent({ type: 'thinking', sessionId, active: true })

      try {
        for await (const chunk of provider.stream({
          model: params.model,
          temperature: params.temperature,
          systemPrompt,
          messages: history,
          tools: toolDefinitions
        })) {
          if (params.isCancelled()) {
            return
          }

          switch (chunk.type) {
            case 'token':
              contentBuffer += chunk.delta
              onEvent({ type: 'token', sessionId, messageId: assistantMessageId, delta: chunk.delta })
              break
            case 'tool_call':
              toolCalls.push(chunk.toolCall)
              break
            case 'error':
              sawError = true
              onEvent({ type: 'error', sessionId, message: chunk.message })
              break
            case 'done':
              break
          }
        }
      } finally {
        onEvent({ type: 'thinking', sessionId, active: false })
      }

      if (sawError) {
        return
      }

      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        sessionId,
        role: 'assistant',
        content: contentBuffer,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        createdAt: Date.now()
      }
      history.push(assistantMessage)
      params.persistMessage(assistantMessage)
      onEvent({ type: 'message_done', sessionId, message: assistantMessage })

      if (toolCalls.length === 0) {
        onEvent({ type: 'run_done', sessionId })
        return
      }

      const results: ToolCallResult[] = []
      for (const toolCall of toolCalls) {
        if (params.isCancelled()) {
          onEvent({ type: 'run_done', sessionId })
          return
        }
        onEvent({ type: 'tool_call_start', sessionId, toolCall })

        // Permission gate: may block on a user-approval round-trip before the tool runs.
        const decision = params.checkToolPermission
          ? await params.checkToolPermission(toolCall)
          : 'allow'
        if (params.isCancelled()) {
          onEvent({ type: 'run_done', sessionId })
          return
        }

        const result: ToolCallResult =
          decision === 'deny'
            ? {
                id: toolCall.id,
                name: toolCall.name,
                ok: false,
                isError: true,
                content: `Tool "${toolCall.name}" was not run: blocked by your permission settings.`
              }
            : await this.toolManager.execute(toolCall, toolContext)
        results.push(result)
        onEvent({ type: 'tool_call_result', sessionId, result })
      }

      const toolMessages = provider.toolCall(results, sessionId)
      for (const message of toolMessages) {
        history.push(message)
        params.persistMessage(message)
      }
      // Loop continues: the tool results just appended become part of the context on
      // the next iteration's provider.stream() call.
    }

    onEvent({
      type: 'error',
      sessionId,
      message: `Stopped after reaching the ${MAX_TURNS}-turn safety limit for a single message.`
    })
  }
}
