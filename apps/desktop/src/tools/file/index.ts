import type { Tool } from '@tools/Tool'
import { readFileTool } from './readFile'
import { writeFileTool } from './writeFile'
import { createFileTool } from './createFile'
import { deleteFileTool } from './deleteFile'
import { listDirectoryTool } from './listDirectory'

export const fileTools: Tool[] = [
  readFileTool,
  writeFileTool,
  createFileTool,
  deleteFileTool,
  listDirectoryTool
]
