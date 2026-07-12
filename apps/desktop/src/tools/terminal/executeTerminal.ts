import { exec, type ExecException } from 'node:child_process'
import { relative, resolve } from 'node:path'
import type { JsonSchema, Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'
import {
  assertWithinWorkspace,
  resolveWorkspacePath,
  WorkspacePathViolationError,
} from '@tools/security/workspacePath'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const MAX_BUFFER_BYTES = 10 * 1024 * 1024

interface RawExecResult {
  stdout: string
  stderr: string
  error: ExecException | null
}

/**
 * Runs `command` via node:child_process's callback-style `exec`, letting Node pick the
 * platform shell (cmd.exe on win32, /bin/sh elsewhere). Wrapped in a Promise so callers can
 * await it; the callback's error object (when present) still carries the stdout/stderr that
 * were captured before the process exited or was killed, which we need for failure reporting.
 */
function runCommand(command: string, cwd: string, timeoutMs: number): Promise<RawExecResult> {
  return new Promise((promiseResolve) => {
    exec(
      command,
      { cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER_BYTES, windowsHide: true },
      (error, stdout, stderr) => {
        promiseResolve({ stdout, stderr, error })
      }
    )
  })
}

/** Renders an absolute cwd as a path relative to the workspace root, or '.' for the root itself. */
function toRelativeCwd(workspaceRoot: string, absoluteCwd: string): string {
  const rel = relative(resolve(workspaceRoot), absoluteCwd)
  return rel.length === 0 ? '.' : rel
}

const schema: JsonSchema = {
  type: 'object',
  description: 'Execute a shell command with its working directory restricted to the workspace.',
  properties: {
    command: {
      type: 'string',
      description: 'The shell command to execute using the platform default shell.',
    },
    cwd: {
      type: 'string',
      description:
        "Working directory for the command, given as a path relative to the workspace root. Defaults to the workspace root ('.').",
    },
    timeoutMs: {
      type: 'number',
      description:
        'Maximum time in milliseconds to let the command run before it is killed. Defaults to 30000; hard-capped at 120000 regardless of the requested value.',
    },
  },
  required: ['command'],
}

export const executeTerminalTool: Tool = {
  name: 'execute_terminal',
  description:
    'Executes a shell command with the working directory confined to the workspace folder, a capped output buffer, and an enforced timeout. There is no content-based command filtering and no OS-level sandbox (no Docker/WSL/VM) for the MVP -- containment comes solely from the working-directory restriction, output cap, and timeout, so treat this as the highest trust-boundary tool in the app.',
  schema,

  async execute(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolExecutionResult> {
    const command = args.command
    if (typeof command !== 'string' || command.trim().length === 0) {
      return {
        ok: false,
        isError: true,
        content: 'execute_terminal requires a non-empty "command" string argument.',
      }
    }

    const cwdArg = typeof args.cwd === 'string' && args.cwd.length > 0 ? args.cwd : '.'

    let requestedTimeoutMs = DEFAULT_TIMEOUT_MS
    if (typeof args.timeoutMs === 'number' && Number.isFinite(args.timeoutMs) && args.timeoutMs > 0) {
      requestedTimeoutMs = args.timeoutMs
    }
    const timeoutMs = Math.min(requestedTimeoutMs, MAX_TIMEOUT_MS)

    let absoluteCwd: string
    try {
      absoluteCwd = await resolveWorkspacePath(context.workspaceRoot, cwdArg)
      assertWithinWorkspace(context.workspaceRoot, absoluteCwd)
    } catch (error) {
      if (error instanceof WorkspacePathViolationError) {
        return { ok: false, isError: true, content: error.message }
      }
      throw error
    }

    const relativeCwd = toRelativeCwd(context.workspaceRoot, absoluteCwd)
    const { stdout, stderr, error } = await runCommand(command, absoluteCwd, timeoutMs)

    if (!error) {
      const sections = [
        `command: ${command}`,
        `cwd: ${relativeCwd}`,
        `stdout:\n${stdout}`,
      ]
      if (stderr) {
        sections.push(`stderr:\n${stderr}`)
      }
      sections.push('exit code: 0')
      return { ok: true, isError: false, content: sections.join('\n\n') }
    }

    const sections = [
      `command: ${command}`,
      `cwd: ${relativeCwd}`,
      `stdout:\n${stdout.length > 0 ? stdout : '(empty)'}`,
      `stderr:\n${stderr.length > 0 ? stderr : '(empty)'}`,
    ]
    if (error.killed || error.signal) {
      sections.push(
        `killed: the command was killed after exceeding the ${timeoutMs}ms timeout (signal: ${error.signal ?? 'unknown'})`
      )
    } else {
      sections.push(`exit code: ${error.code ?? 'unknown'}`)
    }

    return { ok: false, isError: true, content: sections.join('\n\n') }
  },
}
