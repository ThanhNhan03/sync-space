import { mkdir, open } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'
import { resolveWorkspacePath } from '@tools/security/workspacePath'

export const createFileTool: Tool = {
  name: 'create_file',
  description:
    'Creates a brand-new file with optional content, creating parent directories as needed. ' +
    'Fails if the file already exists -- use write_file to overwrite an existing file.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative path for the new file.'
      },
      content: {
        type: 'string',
        description: 'Optional initial text content for the new file.'
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

      let content = ''
      if (args.content !== undefined) {
        if (typeof args.content !== 'string') {
          return { ok: false, isError: true, content: 'Argument "content" must be a string.' }
        }
        content = args.content
      }

      const resolved = await resolveWorkspacePath(context.workspaceRoot, path)
      await mkdir(dirname(resolved), { recursive: true })

      let handle
      try {
        handle = await open(resolved, 'wx')
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EEXIST') {
          return {
            ok: false,
            isError: true,
            content: `File already exists: ${path}. Use write_file to overwrite it.`
          }
        }
        throw error
      }

      try {
        await handle.writeFile(content, 'utf-8')
      } finally {
        await handle.close()
      }

      return { ok: true, content: `Created ${path}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, isError: true, content: message }
    }
  }
}
