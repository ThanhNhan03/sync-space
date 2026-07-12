import { readFile as fsReadFile, stat } from 'node:fs/promises'

import type { Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'
import { resolveWorkspacePath } from '@tools/security/workspacePath'

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

export const readFileTool: Tool = {
  name: 'read_file',
  description:
    'Reads the full contents of a text file within the workspace as UTF-8. Fails for files ' +
    'larger than 2MB, missing paths, or directories.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative path to the file to read.'
      }
    },
    required: ['path']
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult> {
    try {
      const path = args.path
      if (typeof path !== 'string') {
        return { ok: false, isError: true, content: 'Argument "path" must be a string.' }
      }

      const resolved = await resolveWorkspacePath(context.workspaceRoot, path)

      let stats
      try {
        stats = await stat(resolved)
      } catch {
        return { ok: false, isError: true, content: `File not found: ${path}` }
      }

      if (stats.isDirectory()) {
        return { ok: false, isError: true, content: `Cannot read "${path}": it is a directory.` }
      }

      if (stats.size > MAX_FILE_SIZE_BYTES) {
        return {
          ok: false,
          isError: true,
          content: `File "${path}" is ${stats.size} bytes, which exceeds the 2MB limit for read_file.`
        }
      }

      const content = await fsReadFile(resolved, 'utf-8')
      return { ok: true, content }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, isError: true, content: message }
    }
  }
}
