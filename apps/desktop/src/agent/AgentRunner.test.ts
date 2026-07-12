import { describe, expect, it } from 'vitest'

import type { ChatMessage, ProviderId, ToolCallResult } from '@shared/types'
import type { CompletionRequest, CompletionResult, LLMProvider, StreamChunk } from '@providers/LLMProvider'
import { ToolManager } from '@tools/ToolManager'
import type { Tool } from '@tools/Tool'

import { AgentRunner } from './AgentRunner'

/** A provider whose stream() replays a scripted sequence of turns, one per call. */
class ScriptedProvider implements LLMProvider {
  readonly id: ProviderId = 'openai'
  private turn = 0
  public readonly requestsSeen: CompletionRequest[] = []

  constructor(private readonly turns: StreamChunk[][]) {}

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    this.requestsSeen.push(request)
    const chunks = this.turns[this.turn] ?? []
    this.turn += 1
    for (const chunk of chunks) {
      yield chunk
    }
  }

  async complete(): Promise<CompletionResult> {
    throw new Error('not used in these tests')
  }

  toolCall(results: ToolCallResult[], sessionId: string): ChatMessage[] {
    return results.map((result) => ({
      id: `tool-msg-${result.id}`,
      sessionId,
      role: 'tool',
      toolCallId: result.id,
      content: result.ok ? result.content : `Error: ${result.content}`,
      createdAt: 0
    }))
  }
}

function makeEchoTool(): Tool {
  return {
    name: 'read_file',
    description: 'reads a file',
    schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    execute: async (args) => ({ ok: true, content: `contents of ${String(args.path)}` })
  }
}

describe('AgentRunner', () => {
  it('runs a single turn straight to a final answer when no tool calls are requested', async () => {
    const provider = new ScriptedProvider([
      [{ type: 'token', delta: 'Hello ' }, { type: 'token', delta: 'world' }, { type: 'done', stopReason: 'stop' }]
    ])
    const runner = new AgentRunner(new ToolManager([]))
    const events: string[] = []
    const persisted: ChatMessage[] = []

    await runner.run({
      sessionId: 's1',
      provider,
      model: 'gpt-test',
      workspaceRoot: '/workspace',
      history: [{ id: 'u1', sessionId: 's1', role: 'user', content: 'hi', createdAt: 0 }],
      onEvent: (e) => events.push(e.type),
      persistMessage: (m) => persisted.push(m),
      isCancelled: () => false
    })

    expect(events).toEqual(['thinking', 'token', 'token', 'thinking', 'message_done', 'run_done'])
    expect(persisted).toHaveLength(1)
    expect(persisted[0].role).toBe('assistant')
    expect(persisted[0].content).toBe('Hello world')
    expect(provider.requestsSeen).toHaveLength(1)
  })

  it('executes tool calls and continues the loop until a final answer, appending tool results to context', async () => {
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', toolCall: { id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } } },
        { type: 'done', stopReason: 'tool_calls' }
      ],
      [{ type: 'token', delta: 'The file says X.' }, { type: 'done', stopReason: 'stop' }]
    ])
    const runner = new AgentRunner(new ToolManager([makeEchoTool()]))
    const events: string[] = []
    const persisted: ChatMessage[] = []

    await runner.run({
      sessionId: 's1',
      provider,
      model: 'gpt-test',
      workspaceRoot: '/workspace',
      history: [{ id: 'u1', sessionId: 's1', role: 'user', content: 'read a.txt', createdAt: 0 }],
      onEvent: (e) => events.push(e.type),
      persistMessage: (m) => persisted.push(m),
      isCancelled: () => false
    })

    expect(events).toEqual([
      'thinking',
      'thinking',
      'message_done',
      'tool_call_start',
      'tool_call_result',
      'thinking',
      'token',
      'thinking',
      'message_done',
      'run_done'
    ])

    // Turn 1: assistant message with the tool call, then the tool-result message.
    expect(persisted[0].role).toBe('assistant')
    expect(persisted[0].toolCalls).toEqual([{ id: 'call-1', name: 'read_file', arguments: { path: 'a.txt' } }])
    expect(persisted[1].role).toBe('tool')
    expect(persisted[1].content).toBe('contents of a.txt')
    // Turn 2: final assistant answer.
    expect(persisted[2].role).toBe('assistant')
    expect(persisted[2].content).toBe('The file says X.')

    // The second call to the provider must have seen the tool result in its history.
    expect(provider.requestsSeen).toHaveLength(2)
    const secondRequestMessages = provider.requestsSeen[1].messages
    expect(secondRequestMessages.some((m) => m.role === 'tool' && m.content === 'contents of a.txt')).toBe(true)
  })

  it('stops without calling the provider again once isCancelled() reports true', async () => {
    const provider = new ScriptedProvider([
      [{ type: 'token', delta: 'partial' }, { type: 'done', stopReason: 'stop' }]
    ])
    const runner = new AgentRunner(new ToolManager([]))
    let cancelled = false
    const events: string[] = []

    await runner.run({
      sessionId: 's1',
      provider,
      model: 'gpt-test',
      workspaceRoot: '/workspace',
      history: [],
      onEvent: (e) => {
        events.push(e.type)
        cancelled = true // cancel as soon as the first event is observed
      },
      persistMessage: () => {},
      isCancelled: () => cancelled
    })

    expect(events).toEqual(['thinking', 'thinking'])
  })

  it('surfaces a stream error as an error event and stops the loop', async () => {
    const provider = new ScriptedProvider([[{ type: 'error', message: 'upstream exploded' }]])
    const runner = new AgentRunner(new ToolManager([]))
    const events: Array<{ type: string; message?: string }> = []

    await runner.run({
      sessionId: 's1',
      provider,
      model: 'gpt-test',
      workspaceRoot: '/workspace',
      history: [],
      onEvent: (e) => events.push(e as { type: string; message?: string }),
      persistMessage: () => {},
      isCancelled: () => false
    })

    expect(events.some((e) => e.type === 'error' && e.message === 'upstream exploded')).toBe(true)
    expect(provider.requestsSeen).toHaveLength(1)
  })
})
