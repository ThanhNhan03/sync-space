import { mkdir, writeFile as fsWriteFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'
import { resolveWorkspacePath } from '@tools/security/workspacePath'

export const writeFileTool: Tool = {
  name: 'write_file',
  description:
    'Overwrites a file with the given full content, creating it (and any parent directories) ' +
    'if it does not already exist. Use create_file instead if the file must not already exist.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative path to the file to write.'
      },
      content: {
        type: 'string',
        description: 'The full text content to write to the file.'
      }
    },
    required: ['path', 'content']
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult> {
    try {
      const path = args.path
      const content = args.content
      if (typeof path !== 'string') {
        return { ok: false, isError: true, content: 'Argument "path" must be a string.' }
      }
      if (typeof content !== 'string') {
        return { ok: false, isError: true, content: 'Argument "content" must be a string.' }
      }

      const resolved = await resolveWorkspacePath(context.workspaceRoot, path)
      await mkdir(dirname(resolved), { recursive: true })
      await fsWriteFile(resolved, content, 'utf-8')

      return { ok: true, content: `Wrote ${content.length} characters to ${path}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, isError: true, content: message }
    }
  }
}
