import type { Tool } from '@tools/Tool'
import { gitDiffTool } from './gitDiff'
import { gitStatusTool } from './gitStatus'

export const gitTools: Tool[] = [gitStatusTool, gitDiffTool]
