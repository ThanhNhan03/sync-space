import path from 'node:path'

// The MCP SDK is dual-package (its exports map has a `require` condition -> dist/cjs), so a
// static import compiles to a require() that resolves cleanly in this CommonJS main bundle.
// This is unlike @google/genai (ESM-only, loaded via dynamic import in gemini.ts) -- here a
// plain import is correct and keeps the transport types available at compile time.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import type { McpServerConfig, McpServerStatus } from '@shared/types'
import type { JsonSchema } from '@tools/Tool'

import type { McpTool } from './types'
import { createUniqueMcpToolName, sanitizeMcpToolSegment } from './toolName'

type McpTransport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport

const CONNECT_TIMEOUT_MS = 30_000
const LIST_TOOLS_TIMEOUT_MS = 60_000
const TOOL_CALL_TIMEOUT_MS = 5 * 60 * 1000
const TOOL_CALL_MAX_RETRIES = 2

function log(...args: unknown[]): void {
  console.log('[McpManager]', ...args)
}
function logError(...args: unknown[]): void {
  console.error('[McpManager]', ...args)
}

/** Reject if `promise` does not settle within `timeoutMs`, clearing the timer either way. */
async function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

/**
 * Manages connections to MCP servers and exposes their tools to the agent. Adapted from
 * OpenCowork's MCPManager, trimmed to the transport + discovery + call core: the bundled-node
 * runtime resolution, Chrome auto-launch, GUI-vision hot-reload, and OAuth flows are dropped
 * for the MVP. Supports stdio, SSE, and Streamable HTTP transports, sanitizes tool names for
 * OpenAI-compatible providers, and reconnects on transient tool-call failures.
 */
export class McpManager {
  private readonly clients = new Map<string, Client>()
  private readonly transports = new Map<string, McpTransport>()
  private tools = new Map<string, McpTool>()
  private readonly serverConfigs = new Map<string, McpServerConfig>()
  private readonly connectionStatus = new Map<string, 'connecting' | 'connected' | 'failed'>()
  private readonly lastError = new Map<string, string>()

  private lastConfigFingerprint: string | null = null
  private initializing = false
  private pendingConfigs: McpServerConfig[] | null = null
  private readonly reconnecting = new Set<string>()

  /** Called after any change to connection status or the tool set (for UI refresh). */
  constructor(private readonly onChange: () => void = () => {}) {}

  /** (Re)connect the full set of servers, skipping work if the config is unchanged. */
  async initializeServers(configs: McpServerConfig[]): Promise<void> {
    if (this.initializing) {
      this.pendingConfigs = configs
      return
    }
    this.initializing = true
    try {
      const fingerprint = JSON.stringify(
        configs.map((c) => ({
          id: c.id,
          enabled: c.enabled,
          type: c.type,
          command: c.command,
          args: c.args,
          url: c.url,
          env: c.env,
          headers: c.headers,
          cwd: c.cwd
        }))
      )
      if (fingerprint === this.lastConfigFingerprint) {
        return
      }
      this.lastConfigFingerprint = fingerprint

      await this.disconnectAll()
      this.serverConfigs.clear()
      for (const config of configs) {
        this.serverConfigs.set(config.id, config)
      }

      await Promise.allSettled(
        configs
          .filter((c) => c.enabled)
          .map((config) =>
            this.connectServer(config).catch((error) =>
              logError(`Failed to connect ${config.name}:`, error)
            )
          )
      )
      await this.refreshTools()
    } finally {
      this.initializing = false
      if (this.pendingConfigs !== null) {
        const pending = this.pendingConfigs
        this.pendingConfigs = null
        await this.initializeServers(pending)
      }
    }
  }

  private async connectServer(config: McpServerConfig): Promise<void> {
    this.connectionStatus.set(config.id, 'connecting')
    this.lastError.delete(config.id)
    this.onChange()
    try {
      await this.connectServerInternal(config)
      this.connectionStatus.set(config.id, 'connected')
    } catch (error) {
      this.connectionStatus.set(config.id, 'failed')
      this.lastError.set(config.id, error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      this.onChange()
    }
  }

  private async connectServerInternal(config: McpServerConfig): Promise<void> {
    const client = new Client({ name: 'syncspace', version: '0.1.0' }, { capabilities: {} })
    const transport = this.createTransport(config)

    try {
      await this.connectClientWithTimeout(client, transport)
    } catch (error) {
      await transport.close().catch(() => {})
      throw error
    }

    this.clients.set(config.id, client)
    this.transports.set(config.id, transport)
    log(`Connected to ${config.name} (${config.type})`)
  }

  private createTransport(config: McpServerConfig): McpTransport {
    if (config.type === 'stdio') {
      if (!config.command) {
        throw new Error(`stdio server "${config.name}" requires a command`)
      }
      const command = this.resolveStdioCommand(config.command)
      return new StdioClientTransport({
        command,
        args: config.args ?? [],
        env: this.buildStdioEnv(config.env),
        cwd: config.cwd || undefined
      })
    }

    if (config.type === 'sse') {
      const url = this.parseUrl(config)
      return new SSEClientTransport(url, { requestInit: { headers: config.headers } })
    }

    if (config.type === 'streamable-http') {
      const url = this.parseUrl(config)
      const requestInit: RequestInit = {}
      if (config.headers && Object.keys(config.headers).length > 0) {
        requestInit.headers = config.headers
      }
      return new StreamableHTTPClientTransport(url, { requestInit })
    }

    throw new Error(`Unsupported transport type: ${(config as McpServerConfig).type}`)
  }

  private parseUrl(config: McpServerConfig): URL {
    if (!config.url) {
      throw new Error(`${config.type} server "${config.name}" requires a URL`)
    }
    try {
      return new URL(config.url)
    } catch {
      throw new Error(`Server "${config.name}" has a malformed URL: "${config.url}"`)
    }
  }

  /**
   * On Windows a bare command like `npx` cannot be spawned with shell:false -- the child
   * process launcher needs the explicit `.cmd`/`.exe` extension. This mirrors OpenCowork's
   * fix; on POSIX the command is returned unchanged.
   */
  private resolveStdioCommand(command: string): string {
    if (process.platform !== 'win32') {
      return command
    }
    const base = path.basename(command).toLowerCase()
    if (command !== base) {
      return command // already has a path or extension
    }
    const suffixByCommand: Record<string, string> = {
      npx: '.cmd',
      npm: '.cmd',
      yarn: '.cmd',
      pnpm: '.cmd',
      tsx: '.cmd',
      node: '.exe'
    }
    const suffix = suffixByCommand[base]
    return suffix ? command + suffix : command
  }

  private buildStdioEnv(configEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') {
        env[key] = value
      }
    }
    return { ...env, ...(configEnv ?? {}) }
  }

  private async connectClientWithTimeout(client: Client, transport: McpTransport): Promise<void> {
    const connectPromise = client.connect(transport)
    try {
      await raceWithTimeout(
        connectPromise,
        CONNECT_TIMEOUT_MS,
        `MCP connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`
      )
    } catch (error) {
      // Swallow the orphaned rejection if the timeout won the race.
      connectPromise.catch(() => {})
      throw error
    }
  }

  /** Re-list tools from every connected server and atomically swap the tool registry. */
  async refreshTools(): Promise<void> {
    const results = await Promise.all(
      Array.from(this.clients.entries()).map(async ([serverId, client]) => {
        const config = this.serverConfigs.get(serverId)
        if (!config) {
          return [] as McpTool[]
        }
        try {
          const listed = await raceWithTimeout(
            client.listTools(),
            LIST_TOOLS_TIMEOUT_MS,
            `listTools timed out for ${config.name}`
          )
          return this.mapDiscoveredTools(config, listed.tools)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logError(`Error listing tools from ${config.name}:`, message)
          this.lastError.set(serverId, message)
          return [] as McpTool[]
        }
      })
    )

    const next = new Map<string, McpTool>()
    for (const serverTools of results) {
      for (const tool of serverTools) {
        next.set(tool.name, tool)
      }
    }
    this.tools = next
    log(`Total MCP tools available: ${this.tools.size}`)
    this.onChange()
  }

  private mapDiscoveredTools(
    config: McpServerConfig,
    rawTools: Array<{ name?: string; description?: string; inputSchema?: unknown }>
  ): McpTool[] {
    // Sort by name so dedup-suffix assignment is deterministic across reconnects -- otherwise
    // a session's stored tool_call name could stop resolving if the server reorders tools.
    const sorted = [...rawTools].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    const serverKey = sanitizeMcpToolSegment(config.name, 'server')
    const usedNames = new Set<string>()

    return sorted.map((tool) => {
      const originalName = tool.name && tool.name.trim().length > 0 ? tool.name : 'tool'
      const sanitizedTool = sanitizeMcpToolSegment(originalName, 'tool')
      const name = createUniqueMcpToolName(`mcp__${serverKey}__${sanitizedTool}`, usedNames)
      const rawSchema = (tool.inputSchema ?? {}) as {
        properties?: Record<string, JsonSchema>
        required?: string[]
      }
      return {
        name,
        originalName,
        description: tool.description ?? '',
        inputSchema: {
          type: 'object',
          properties: rawSchema.properties ?? {},
          required: rawSchema.required
        },
        serverId: config.id,
        serverName: config.name
      }
    })
  }

  getTools(): McpTool[] {
    return Array.from(this.tools.values())
  }

  /** Invoke an MCP tool by its model-facing name, retrying once on a transient disconnect. */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      throw new Error(`MCP tool not found: ${toolName}`)
    }

    let lastError: unknown
    const deadline = Date.now() + TOOL_CALL_TIMEOUT_MS

    for (let attempt = 0; attempt <= TOOL_CALL_MAX_RETRIES; attempt++) {
      const current = this.tools.get(toolName) ?? tool
      try {
        const client = this.clients.get(current.serverId)
        if (!client) {
          throw new Error('MCP server not connected')
        }
        const remaining = deadline - Date.now()
        if (remaining <= 0) {
          throw new Error(`Tool call timed out after ${TOOL_CALL_TIMEOUT_MS}ms`)
        }

        const result = await raceWithTimeout(
          client.callTool({ name: current.originalName, arguments: args }),
          remaining,
          `Tool call timed out after ${TOOL_CALL_TIMEOUT_MS}ms`
        )
        return stringifyToolResult(result)
      } catch (error) {
        lastError = error
        const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
        const reconnectable =
          message.includes('not connected') || message.includes('connection closed')
        if (attempt < TOOL_CALL_MAX_RETRIES && reconnectable) {
          await this.reconnectServer(current.serverId)
          continue
        }
        break
      }
    }
    throw lastError
  }

  private async reconnectServer(serverId: string): Promise<boolean> {
    if (this.reconnecting.has(serverId)) {
      return false
    }
    const config = this.serverConfigs.get(serverId)
    if (!config || !config.enabled) {
      return false
    }
    this.reconnecting.add(serverId)
    try {
      await this.disconnectServer(serverId)
      await this.connectServer(config)
      await this.refreshTools()
      return true
    } catch (error) {
      logError(`Failed to reconnect ${config.name}:`, error)
      return false
    } finally {
      this.reconnecting.delete(serverId)
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      await client.close().catch((error) => logError(`Error closing client ${serverId}:`, error))
      this.clients.delete(serverId)
    }
    const transport = this.transports.get(serverId)
    if (transport) {
      await transport.close().catch((error) => logError(`Error closing transport ${serverId}:`, error))
      this.transports.delete(serverId)
    }
    for (const [name, tool] of this.tools.entries()) {
      if (tool.serverId === serverId) {
        this.tools.delete(name)
      }
    }
    this.connectionStatus.delete(serverId)
  }

  async disconnectAll(): Promise<void> {
    for (const serverId of Array.from(this.clients.keys())) {
      await this.disconnectServer(serverId)
    }
  }

  getServerStatus(): McpServerStatus[] {
    return Array.from(this.serverConfigs.values()).map((config) => {
      const connected = this.clients.has(config.id)
      const toolCount = Array.from(this.tools.values()).filter((t) => t.serverId === config.id).length
      const tracked = this.connectionStatus.get(config.id)
      const status: McpServerStatus['status'] = !config.enabled
        ? 'disabled'
        : (tracked ?? (connected ? 'connected' : 'connecting'))
      return {
        id: config.id,
        name: config.name,
        connected,
        status,
        toolCount,
        error: status === 'failed' ? this.lastError.get(config.id) : undefined
      }
    })
  }

  async shutdown(): Promise<void> {
    await this.disconnectAll()
  }
}

/**
 * Flatten an MCP CallToolResult into a plain string for the agent's tool-result message.
 * MCP returns a content-block array (text/image/resource); we join text blocks and note
 * any non-text blocks rather than dropping them silently.
 */
function stringifyToolResult(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return String(result ?? '')
  }
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) {
    return JSON.stringify(result)
  }
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue
    }
    const type = (block as { type?: string }).type
    if (type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
      parts.push((block as { text: string }).text)
    } else {
      parts.push(`[${type ?? 'unknown'} content]`)
    }
  }
  return parts.join('\n') || '(empty result)'
}
