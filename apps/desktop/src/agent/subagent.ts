import type { SubagentRequest, SubagentResult } from '@tools/Tool'

export const MAX_CONCURRENT_SUBAGENTS = 3
export const DEFAULT_SUBAGENT_TIMEOUT_MS = 120_000
export const MAX_SUBAGENT_TIMEOUT_MS = 300_000
export const MAX_TASK_LENGTH = 10_000

/** A lifecycle update from a running subagent, forwarded to the UI. */
export interface SubagentProgress {
  subagentId: string
  phase: 'started' | 'tool' | 'completed' | 'failed'
  task?: string
  toolName?: string
  error?: string
}

export interface RunChildInput {
  task: string
  resultFormat?: string
  /** System-prompt suffix that frames the child as a focused sub-agent. */
  systemPromptSuffix: string
}

export interface RunChildControl {
  /** True once the child should stop (parent cancelled or the subagent timed out). */
  isCancelled: () => boolean
  onToolStart: (toolName: string) => void
}

export interface RunSubagentDeps {
  /** Drives an actual child agent run and resolves with its final text. */
  runChild: (input: RunChildInput, control: RunChildControl) => Promise<string>
  /** Shared mutable counter bounding concurrent subagents across the app. */
  concurrency: { active: number }
  maxConcurrent: number
  defaultTimeoutMs: number
  maxTimeoutMs: number
  isParentCancelled: () => boolean
  onProgress: (progress: SubagentProgress) => void
  generateId: () => string
}

/** Frame a child run as a focused sub-agent that returns only the result. */
export function buildSubagentSystemPromptSuffix(task: string, resultFormat?: string): string {
  const parts = [
    '',
    '',
    '## Sub-agent task',
    'You are running as a focused sub-agent with an isolated context — you cannot see the parent',
    "conversation, so rely only on the task below and your tools. Complete it, then return ONLY",
    'the result as your final message: no preamble, no questions, no commentary beyond the result.',
    '',
    task
  ]
  if (resultFormat) {
    parts.push('', '### Expected output format', resultFormat)
  }
  return parts.join('\n')
}

/**
 * Run one subagent: validate the task, enforce the concurrency cap, race the child run against
 * a timeout and parent cancellation, and report progress. All I/O is injected via `deps` so the
 * orchestration is unit-testable without a real agent. Never throws -- failures come back as a
 * SubagentResult with ok=false and a human-readable message the parent model can act on.
 */
export async function runSubagent(
  request: SubagentRequest,
  deps: RunSubagentDeps
): Promise<SubagentResult> {
  const task = typeof request.task === 'string' ? request.task.trim() : ''
  if (!task) {
    return { ok: false, text: 'Error: task parameter is required.' }
  }
  if (task.length > MAX_TASK_LENGTH) {
    return {
      ok: false,
      text: `Error: task exceeds the maximum length (${MAX_TASK_LENGTH} chars). Shorten it.`
    }
  }
  if (deps.concurrency.active >= deps.maxConcurrent) {
    return {
      ok: false,
      text: `Error: the maximum of ${deps.maxConcurrent} concurrent subagents is already running. Wait for one to finish.`
    }
  }

  const subagentId = deps.generateId()
  const timeoutMs = Math.min(
    request.timeoutSeconds ? request.timeoutSeconds * 1000 : deps.defaultTimeoutMs,
    deps.maxTimeoutMs
  )

  deps.concurrency.active += 1
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
  }, timeoutMs)
  deps.onProgress({ subagentId, phase: 'started', task: task.slice(0, 200) })

  try {
    const control: RunChildControl = {
      isCancelled: () => timedOut || deps.isParentCancelled(),
      onToolStart: (toolName) => deps.onProgress({ subagentId, phase: 'tool', toolName })
    }

    const text = await deps.runChild(
      { task, resultFormat: request.resultFormat, systemPromptSuffix: buildSubagentSystemPromptSuffix(task, request.resultFormat) },
      control
    )

    if (timedOut) {
      deps.onProgress({ subagentId, phase: 'failed', error: 'timeout' })
      return { ok: false, text: `Subagent timed out after ${Math.round(timeoutMs / 1000)}s.` }
    }
    if (deps.isParentCancelled()) {
      deps.onProgress({ subagentId, phase: 'failed', error: 'cancelled' })
      return { ok: false, text: 'Subagent cancelled: the parent run was stopped.' }
    }

    deps.onProgress({ subagentId, phase: 'completed' })
    return { ok: true, text: text.trim() || '(subagent produced no text output)' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    deps.onProgress({ subagentId, phase: 'failed', error: message.slice(0, 200) })
    return { ok: false, text: `Subagent error: ${message}` }
  } finally {
    clearTimeout(timer)
    deps.concurrency.active -= 1
  }
}
