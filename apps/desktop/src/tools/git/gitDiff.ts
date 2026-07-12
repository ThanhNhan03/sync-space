import { execFile } from 'node:child_process'
import { relative, sep } from 'node:path'
import type { Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'
import { resolveWorkspacePath, WorkspacePathViolationError } from '@tools/security/workspacePath'

const EXEC_TIMEOUT_MS = 15000
const MAX_BUFFER_BYTES = 10 * 1024 * 1024
const MAX_CONTENT_LENGTH = 20000

interface ExecFileResult {
  stdout: string
  stderr: string
}

interface ExecFileError extends Error {
  stdout?: string
  stderr?: string
  code?: number | string
}

function runGit(cwd: string, args: string[]): Promise<ExecFileResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      'git',
      args,
      { cwd, timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          const execError = error as ExecFileError
          execError.stdout = stdout
          execError.stderr = stderr
          rejectPromise(execError)
          return
        }
        resolvePromise({ stdout, stderr })
      }
    )
  })
}

function isNotAGitRepository(error: ExecFileError): boolean {
  const stderr = error.stderr ?? ''
  return stderr.toLowerCase().includes('not a git repository')
}

function truncate(content: string): string {
  if (content.length <= MAX_CONTENT_LENGTH) return content
  return `${content.slice(0, MAX_CONTENT_LENGTH)}\n\n[... output truncated at ${MAX_CONTENT_LENGTH} characters ...]`
}

export const gitDiffTool: Tool = {
  name: 'git_diff',
  description:
    'Runs `git diff` (optionally `--staged`) in the workspace root, optionally scoped to a ' +
    'given sub-path, and returns the raw diff output (capped at 20000 characters).',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional workspace-relative file or directory to scope the diff to.'
      },
      staged: {
        type: 'boolean',
        description: 'If true, shows staged (index) changes via `git diff --staged`. Defaults to false.'
      }
    }
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult> {
    try {
      let path: string | undefined
      if (args.path !== undefined) {
        if (typeof args.path !== 'string') {
          throw new Error('"path" must be a string when provided')
        }
        path = args.path
      }

      let staged = false
      if (args.staged !== undefined) {
        if (typeof args.staged !== 'boolean') {
          throw new Error('"staged" must be a boolean when provided')
        }
        staged = args.staged
      }

      const cwd = await resolveWorkspacePath(context.workspaceRoot, '.')

      const gitArgs = ['diff']
      if (staged) gitArgs.push('--staged')

      if (path !== undefined) {
        const absoluteTarget = await resolveWorkspacePath(context.workspaceRoot, path)
        const relativeTarget = relative(cwd, absoluteTarget).split(sep).join('/')
        gitArgs.push('--', relativeTarget)
      }

      try {
        const { stdout } = await runGit(cwd, gitArgs)
        return { ok: true, content: truncate(stdout) }
      } catch (error) {
        const execError = error as ExecFileError
        if (isNotAGitRepository(execError)) {
          return { ok: true, content: 'Not a git repository.' }
        }
        const message = execError.stderr?.trim() || execError.message
        return { ok: false, isError: true, content: `git diff failed: ${message}` }
      }
    } catch (error) {
      if (error instanceof WorkspacePathViolationError) {
        return { ok: false, isError: true, content: error.message }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, isError: true, content: `git_diff failed: ${message}` }
    }
  }
}
