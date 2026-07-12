import { stat, unlink } from 'node:fs/promises'

import type { Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'
import { resolveWorkspacePath } from '@tools/security/workspacePath'

export const deleteFileTool: Tool = {
  name: 'delete_file',
  description:
    'Deletes a single file within the workspace. Refuses to operate on directories -- it never ' +
    'deletes recursively -- and fails if the file does not exist.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative path to the file to delete.'
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
        return {
          ok: false,
          isError: true,
          content: `Cannot delete "${path}": it is a directory. delete_file only deletes files.`
        }
      }

      await unlink(resolved)
      return { ok: true, content: `Deleted ${path}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, isError: true, content: message }
    }
  }
}
