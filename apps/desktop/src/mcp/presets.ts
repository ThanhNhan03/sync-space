import type { McpPreset } from '@shared/types'

/**
 * Common MCP servers offered as one-click templates in Settings. Kept intentionally small
 * and dependency-light -- each launches over `npx` (or connects to a URL) so no server code
 * ships inside the app. Users can still add arbitrary custom servers.
 */
export const MCP_PRESETS: McpPreset[] = [
  {
    key: 'filesystem',
    name: 'Filesystem',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '{WORKSPACE_ROOT}'],
    description: 'Read/write files under a directory (defaults to the current workspace).'
  },
  {
    key: 'notion',
    name: 'Notion',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    requiredEnv: ['NOTION_TOKEN'],
    envDescription: {
      NOTION_TOKEN: 'Notion internal integration token (notion.so/profile/integrations)'
    },
    description: 'Search and edit Notion pages and databases.'
  },
  {
    key: 'chrome',
    name: 'Chrome DevTools',
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest'],
    description: 'Drive a Chrome instance (navigate, inspect, automate pages).'
  },
  {
    key: 'github',
    name: 'GitHub',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiredEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    envDescription: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'GitHub PAT with the scopes you want the agent to use'
    },
    description: 'Query and manage GitHub repos, issues, and pull requests.'
  }
]

/** Placeholder token in preset args, resolved to the active workspace path at add time. */
export const WORKSPACE_ROOT_PLACEHOLDER = '{WORKSPACE_ROOT}'

export function getPreset(key: string): McpPreset | undefined {
  return MCP_PRESETS.find((preset) => preset.key === key)
}
