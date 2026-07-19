import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

import type {
  AgentStreamEvent,
  AppSettings,
  ChatMessage,
  McpPreset,
  McpServerStatus,
  MessageAttachment,
  SessionSummary,
  Workspace
} from '@shared/types'
import type { SettingsRepository } from '@database/repositories'
import { allTools } from '@tools/index'
import { ToolManager } from '@tools/ToolManager'
import { createProvider } from '@providers/registry'
import { AgentRunner } from '@agent/AgentRunner'
import { McpManager } from '@mcp/McpManager'
import { createMcpTools } from '@mcp/mcpTools'
import { MCP_PRESETS } from '@mcp/presets'

import { SessionManager, type CreateSessionInput } from './SessionManager'

const DEFAULT_SETTINGS: AppSettings = {
  activeProviderId: 'openai',
  providers: {},
  theme: 'system'
}

export interface SendMessageParams {
  sessionId: string
  content: string
  attachmentPaths?: string[]
}

/**
 * Top-level orchestrator the IPC layer talks to. Owns the tool registry, the Agent
 * Runner, and the session/settings persistence -- everything the app's UI needs is a
 * method call here, with no SQL, provider SDKs, or Electron APIs leaking upward.
 */
export class SyncSpaceEngine {
  private readonly toolManager = new ToolManager(allTools)
  private readonly agentRunner = new AgentRunner(this.toolManager)
  private readonly cancelledSessions = new Set<string>()
  private readonly activeRuns = new Set<string>()
  private readonly mcpManager: McpManager
  private mcpStatusListener: ((status: McpServerStatus[]) => void) | null = null

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly settingsRepo: SettingsRepository
  ) {
    // Whenever MCP connections or discovered tools change, republish the tool set into the
    // ToolManager (so the agent sees current tools) and notify the UI of new server status.
    this.mcpManager = new McpManager(() => {
      this.toolManager.setMcpTools(createMcpTools(this.mcpManager))
      this.mcpStatusListener?.(this.mcpManager.getServerStatus())
    })
    // Connect configured servers at startup. Fire-and-forget: a slow/broken server must never
    // block engine construction, and per-server failures are already logged by the manager.
    void this.mcpManager.initializeServers(this.getSettings().mcpServers ?? [])
  }

  getSettings(): AppSettings {
    return this.settingsRepo.get() ?? DEFAULT_SETTINGS
  }

  updateSettings(settings: AppSettings): AppSettings {
    this.settingsRepo.set(settings)
    // Reconcile MCP connections with the new config. initializeServers fingerprints the
    // config and no-ops when the MCP portion is unchanged, so provider-only edits are cheap.
    void this.mcpManager.initializeServers(settings.mcpServers ?? [])
    return settings
  }

  getMcpStatus(): McpServerStatus[] {
    return this.mcpManager.getServerStatus()
  }

  getMcpPresets(): McpPreset[] {
    return MCP_PRESETS
  }

  /** Registers the single listener the IPC layer uses to push MCP status to the renderer. */
  onMcpStatusChange(listener: (status: McpServerStatus[]) => void): void {
    this.mcpStatusListener = listener
  }

  async shutdownMcp(): Promise<void> {
    await this.mcpManager.shutdown()
  }

  listWorkspaces(): Workspace[] {
    return this.sessionManager.listWorkspaces()
  }

  registerWorkspace(rootPath: string): Workspace {
    return this.sessionManager.registerWorkspace(basename(rootPath), rootPath)
  }

  listSessions(workspaceId: string): SessionSummary[] {
    return this.sessionManager.listSessions(workspaceId)
  }

  createSession(input: CreateSessionInput): SessionSummary {
    return this.sessionManager.createSession(input)
  }

  renameSession(sessionId: string, title: string): SessionSummary {
    return this.sessionManager.renameSession(sessionId, title)
  }

  deleteSession(sessionId: string): void {
    this.sessionManager.deleteSession(sessionId)
  }

  getMessages(sessionId: string): ChatMessage[] {
    return this.sessionManager.getMessages(sessionId)
  }

  /**
   * Requests cancellation of the run currently in flight for a session. Cooperative --
   * the Agent Runner checks this between provider stream chunks and tool calls, it
   * cannot interrupt an in-flight provider HTTP call or a running tool immediately.
   */
  cancelRun(sessionId: string): boolean {
    if (!this.activeRuns.has(sessionId)) {
      return false
    }
    this.cancelledSessions.add(sessionId)
    return true
  }

  async sendMessage(params: SendMessageParams, onEvent: (event: AgentStreamEvent) => void): Promise<void> {
    const session = this.sessionManager.getSession(params.sessionId)
    if (!session) {
      throw new Error(`Session not found: ${params.sessionId}`)
    }

    const workspace = this.sessionManager.getWorkspace(session.workspaceId)
    if (!workspace) {
      throw new Error(`Workspace not found: ${session.workspaceId}`)
    }

    const settings = this.getSettings()
    const providerConfig = settings.providers[session.providerId]
    if (!providerConfig) {
      throw new Error(
        `No configuration found for provider "${session.providerId}". Add an API key for it in Settings first.`
      )
    }

    const provider = createProvider({ ...providerConfig, model: session.model })

    const attachments: MessageAttachment[] = (params.attachmentPaths ?? []).map((path) => ({
      id: randomUUID(),
      name: basename(path),
      path
    }))

    const userMessage: ChatMessage = {
      id: randomUUID(),
      sessionId: session.id,
      role: 'user',
      content: params.content,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: Date.now()
    }
    this.sessionManager.appendMessage(userMessage)

    const history = this.sessionManager.getMessages(session.id)

    this.cancelledSessions.delete(session.id)
    this.activeRuns.add(session.id)
    try {
      await this.agentRunner.run({
        sessionId: session.id,
        provider,
        model: session.model,
        temperature: providerConfig.temperature,
        workspaceRoot: workspace.rootPath,
        history,
        onEvent,
        persistMessage: (message) => this.sessionManager.appendMessage(message),
        isCancelled: () => this.cancelledSessions.has(session.id)
      })
    } finally {
      this.activeRuns.delete(session.id)
      this.cancelledSessions.delete(session.id)
    }
  }
}
