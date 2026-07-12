import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'
import { resolveWorkspacePath } from '@tools/security/workspacePath'

interface DirectoryEntrySummary {
  name: string
  type: 'file' | 'directory'
  size?: number
}

export const listDirectoryTool: Tool = {
  name: 'list_directory',
  description:
    'Lists the immediate (non-recursive) contents of a directory within the workspace, ' +
    'returning a JSON array of { name, type, size } sorted directories-first then alphabetically.',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative path to the directory to list. Defaults to the workspace root.'
      }
    },
    required: []
  },
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult> {
    try {
      let path = '.'
      if (args.path !== undefined) {
        if (typeof args.path !== 'string') {
          return { ok: false, isError: true, content: 'Argument "path" must be a string.' }
        }
        path = args.path
      }

      const resolved = await resolveWorkspacePath(context.workspaceRoot, path)

      let stats
      try {
        stats = await stat(resolved)
      } catch {
        return { ok: false, isError: true, content: `Directory not found: ${path}` }
      }

      if (!stats.isDirectory()) {
        return { ok: false, isError: true, content: `Cannot list "${path}": it is not a directory.` }
      }

      const dirents = await readdir(resolved, { withFileTypes: true })

      const entries: DirectoryEntrySummary[] = []
      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          entries.push({ name: dirent.name, type: 'directory' })
        } else if (dirent.isFile()) {
          const entryStats = await stat(join(resolved, dirent.name))
          entries.push({ name: dirent.name, type: 'file', size: entryStats.size })
        }
      }

      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      return { ok: true, content: JSON.stringify(entries) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, isError: true, content: message }
    }
  }
}
