import { execFile } from 'node:child_process'
import type { Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'
import { resolveWorkspacePath, WorkspacePathViolationError } from '@tools/security/workspacePath'

const EXEC_TIMEOUT_MS = 15000
const MAX_BUFFER_BYTES = 10 * 1024 * 1024

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

export const gitStatusTool: Tool = {
  name: 'git_status',
  description:
    'Runs `git status --porcelain -b` in the workspace (or a given sub-directory) and returns ' +
    'the raw output, so the AI can see staged/unstaged/untracked changes and the current branch.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional workspace-relative sub-directory to run git status in. Defaults to the workspace root.'
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

      const cwd = await resolveWorkspacePath(context.workspaceRoot, path ?? '.')

      try {
        const { stdout } = await runGit(cwd, ['status', '--porcelain', '-b'])
        return { ok: true, content: stdout }
      } catch (error) {
        const execError = error as ExecFileError
        if (isNotAGitRepository(execError)) {
          return { ok: true, content: 'Not a git repository.' }
        }
        const message = execError.stderr?.trim() || execError.message
        return { ok: false, isError: true, content: `git status failed: ${message}` }
      }
    } catch (error) {
      if (error instanceof WorkspacePathViolationError) {
        return { ok: false, isError: true, content: error.message }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, isError: true, content: `git_status failed: ${message}` }
    }
  }
}
