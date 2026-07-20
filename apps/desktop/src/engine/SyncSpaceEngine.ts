import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

import type {
  AgentDefinition,
  AgentStreamEvent,
  AppSettings,
  ChatMessage,
  McpPreset,
  McpServerStatus,
  MemoryEntry,
  MessageAttachment,
  PermissionRule,
  SessionSummary,
  SkillInfo,
  SubagentSettings,
  ToolCallRequest,
  Workspace,
  WorkspaceFileEntry,
  WorkspaceFilePreview
} from '@shared/types'
import { DEFAULT_AGENTS, DEFAULT_SUBAGENT_SETTINGS } from '@shared/types'
import { decidePermission, sanitizeRules } from '@permissions/permissionRules'
import type { SettingsRepository, MemoriesRepository } from '@database/repositories'
import { allTools } from '@tools/index'
import { ToolManager } from '@tools/ToolManager'
import { createProvider } from '@providers/registry'
import { AgentRunner } from '@agent/AgentRunner'
import { createSpawnSubagentTool, SPAWN_SUBAGENT_TOOL_NAME } from '@agent/subagentTool'
import {
  runSubagent,
  buildSubagentSystemPromptSuffix,
  buildAgentsPromptSection,
  filterSkillsForAgent,
  MAX_SUBAGENT_TIMEOUT_MS
} from '@agent/subagent'
import type { SubagentRequest, SubagentResult } from '@tools/Tool'
import { McpManager } from '@mcp/McpManager'
import { createMcpTools } from '@mcp/mcpTools'
import { MCP_PRESETS } from '@mcp/presets'
import { SkillsManager } from '@skills/SkillsManager'
import type { DiscoveredSkill } from '@skills/SkillsManager'
import { createUseSkillTool } from '@skills/useSkillTool'
import { buildSkillsPromptSection } from '@skills/skillsPrompt'
import { MemoryManager } from '@memory/MemoryManager'
import { createMemoryTools } from '@memory/memoryTools'
import { createScreenTools, SCREEN_TOOL_NAMES } from '@screen/screenTools'
import type { VisionConfig } from '@screen/visionLocate'
import {
  listWorkspaceDir as listWorkspaceDirFiles,
  readWorkspaceFilePreview,
  resolveWorkspaceFilePath as resolveWorkspaceFilePathFiles
} from '@files/workspaceFiles'

import { SessionManager, type CreateSessionInput } from './SessionManager'

export interface EngineOptions {
  /** User-writable global skills directory (under userData). */
  globalSkillsDir: string
  /** Read-only skills shipped with the app, if present. */
  builtinSkillsDir?: string
  /** Directory where screen-capture screenshots are written. */
  screenshotsDir: string
}

const DEFAULT_SETTINGS: AppSettings = {
  activeProviderId: 'openai',
  providers: {},
  theme: 'system',
  memoryEnabled: true
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
  private readonly toolManager: ToolManager
  private readonly agentRunner: AgentRunner
  private readonly cancelledSessions = new Set<string>()
  private readonly activeRuns = new Set<string>()
  private readonly mcpManager: McpManager
  private readonly skillsManager: SkillsManager
  private readonly memoryManager: MemoryManager
  /** Shared counter bounding concurrent subagents across all sessions. */
  private readonly subagentConcurrency = { active: 0 }
  /** Session-scoped "always allow" tool decisions (lowercased tool names). */
  private readonly permissionAlwaysAllow = new Map<string, Set<string>>()
  /** In-flight approval prompts awaiting a renderer response. */
  private readonly pendingPermissions = new Map<
    string,
    { sessionId: string; toolName: string; resolve: (decision: 'allow' | 'deny') => void }
  >()
  private mcpStatusListener: ((status: McpServerStatus[]) => void) | null = null

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly settingsRepo: SettingsRepository,
    memoriesRepo: MemoriesRepository,
    options: EngineOptions
  ) {
    this.skillsManager = new SkillsManager({
      globalSkillsDir: options.globalSkillsDir,
      builtinSkillsDir: options.builtinSkillsDir
    })
    this.memoryManager = new MemoryManager(memoriesRepo, () => this.isMemoryEnabled())
    // The use_skill and remember/recall tools read current settings/workspace on each call,
    // so they always reflect the enabled skill set / memory state without re-registration.
    const useSkillTool = createUseSkillTool(
      this.skillsManager,
      () => this.getSettings().disabledSkillIds ?? []
    )
    const memoryTools = createMemoryTools(this.memoryManager, () => this.isMemoryEnabled())
    const screenTools = createScreenTools({
      screenshotsDir: options.screenshotsDir,
      getVisionConfig: () => this.getVisionConfig()
    })
    this.toolManager = new ToolManager([
      ...allTools,
      useSkillTool,
      ...memoryTools,
      createSpawnSubagentTool(),
      ...screenTools
    ])
    this.agentRunner = new AgentRunner(this.toolManager)

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

  /** List every discovered skill for a workspace, tagged with its enabled state. */
  listSkills(workspaceRoot?: string): SkillInfo[] {
    const disabled = new Set(this.getSettings().disabledSkillIds ?? [])
    return this.skillsManager.discover(workspaceRoot).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      source: skill.source,
      dir: skill.dir,
      enabled: !disabled.has(skill.id)
    }))
  }

  /** Toggle a skill on/off (persisted as a disabled-id list) and return the refreshed list. */
  setSkillEnabled(id: string, enabled: boolean, workspaceRoot?: string): SkillInfo[] {
    const settings = this.getSettings()
    const disabled = new Set(settings.disabledSkillIds ?? [])
    if (enabled) {
      disabled.delete(id)
    } else {
      disabled.add(id)
    }
    this.updateSettings({ ...settings, disabledSkillIds: Array.from(disabled) })
    return this.listSkills(workspaceRoot)
  }

  /** The user-writable global skills directory (created if missing), for the "open folder" action. */
  ensureGlobalSkillsDir(): string {
    return this.skillsManager.ensureGlobalSkillsDir()
  }

  listWorkspaceDir(workspaceRoot: string, relativePath?: string): Promise<WorkspaceFileEntry[]> {
    return listWorkspaceDirFiles(workspaceRoot, relativePath)
  }

  previewWorkspaceFile(workspaceRoot: string, relativePath: string): Promise<WorkspaceFilePreview> {
    return readWorkspaceFilePreview(workspaceRoot, relativePath)
  }

  /** Resolve a workspace-relative path to an absolute one, for IPC handlers that then hand it to Electron's dialog/shell APIs. */
  resolveWorkspaceFilePath(workspaceRoot: string, relativePath: string): Promise<string> {
    return resolveWorkspaceFilePathFiles(workspaceRoot, relativePath)
  }

  /** Long-term memory defaults to on; only an explicit `false` disables it. */
  private isMemoryEnabled(): boolean {
    return this.getSettings().memoryEnabled !== false
  }

  /** Screen control is invasive, so it is opt-in (off unless explicitly enabled). */
  private isScreenControlEnabled(): boolean {
    return this.getSettings().screenControlEnabled === true
  }

  /** Vision credentials for locate_on_screen, from the configured Claude provider (or null). */
  private getVisionConfig(): VisionConfig | null {
    const claude = this.getSettings().providers.claude
    if (!claude?.apiKey) {
      return null
    }
    return {
      apiKey: claude.apiKey,
      baseUrl: claude.baseUrl || undefined,
      model: claude.model || 'claude-sonnet-5'
    }
  }

  /** Subagent controls, merged over defaults and clamped to safe bounds. */
  private getSubagentSettings(): SubagentSettings {
    const stored = this.getSettings().subagentSettings
    const merged = { ...DEFAULT_SUBAGENT_SETTINGS, ...stored }
    return {
      enabled: merged.enabled,
      maxConcurrent: Math.min(Math.max(1, Math.floor(merged.maxConcurrent)), 8),
      defaultTimeoutSeconds: Math.min(
        Math.max(10, Math.floor(merged.defaultTimeoutSeconds)),
        MAX_SUBAGENT_TIMEOUT_MS / 1000
      )
    }
  }

  /** Configured agents, or the built-in defaults until the user customizes their agent list. */
  private getAgents(): AgentDefinition[] {
    return this.getSettings().agents ?? DEFAULT_AGENTS
  }

  /** Skills discovered for a workspace with the user's disabled ones removed. */
  private getEnabledSkills(workspaceRoot: string): DiscoveredSkill[] {
    const disabled = new Set(this.getSettings().disabledSkillIds ?? [])
    return this.skillsManager.discover(workspaceRoot).filter((skill) => !disabled.has(skill.id))
  }

  listMemories(workspaceRoot?: string): MemoryEntry[] {
    return this.memoryManager.list(workspaceRoot)
  }

  addMemory(input: {
    workspaceRoot: string
    category: MemoryEntry['category']
    content: string
  }): MemoryEntry {
    return this.memoryManager.add({ ...input, source: 'manual' })
  }

  deleteMemory(id: string): void {
    this.memoryManager.delete(id)
  }

  clearMemories(workspaceRoot?: string): number {
    return this.memoryManager.clear(workspaceRoot)
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
    this.permissionAlwaysAllow.delete(sessionId)
    this.denyPendingPermissions(sessionId)
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
    // Unblock any approval prompt in flight so the run can stop instead of hanging.
    this.denyPendingPermissions(sessionId)
    return true
  }

  /** Current permission rules, sanitized (falls back to defaults). */
  getPermissionRules(): PermissionRule[] {
    return sanitizeRules(this.getSettings().permissionRules)
  }

  /**
   * Decide whether a tool may run, prompting the user over the stream channel when the rule is
   * 'ask'. Resolves to 'allow' or 'deny' (after any round-trip). Bound to the parent session's
   * onEvent so subagent prompts also reach the UI.
   */
  private checkToolPermission(
    sessionId: string,
    toolCall: ToolCallRequest,
    onEvent: (event: AgentStreamEvent) => void
  ): Promise<'allow' | 'deny'> {
    const decision = decidePermission(
      this.getPermissionRules(),
      this.permissionAlwaysAllow.get(sessionId),
      toolCall.name,
      toolCall.arguments
    )
    if (decision !== 'ask') {
      return Promise.resolve(decision)
    }
    return new Promise((resolve) => {
      const requestId = randomUUID()
      this.pendingPermissions.set(requestId, { sessionId, toolName: toolCall.name, resolve })
      onEvent({
        type: 'permission_request',
        sessionId,
        requestId,
        toolName: toolCall.name,
        arguments: toolCall.arguments
      })
    })
  }

  /** Renderer's answer to a permission prompt. 'allow_always' remembers the tool for the session. */
  respondPermission(requestId: string, decision: 'allow' | 'deny' | 'allow_always'): void {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending) {
      return
    }
    this.pendingPermissions.delete(requestId)
    if (decision === 'allow_always') {
      const set = this.permissionAlwaysAllow.get(pending.sessionId) ?? new Set<string>()
      set.add(pending.toolName.toLowerCase())
      this.permissionAlwaysAllow.set(pending.sessionId, set)
      pending.resolve('allow')
    } else {
      pending.resolve(decision)
    }
  }

  private denyPendingPermissions(sessionId: string): void {
    for (const [requestId, pending] of this.pendingPermissions.entries()) {
      if (pending.sessionId === sessionId) {
        this.pendingPermissions.delete(requestId)
        pending.resolve('deny')
      }
    }
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

    // Progressive disclosure: inject only enabled skills' name+description into the system
    // prompt; the model loads full bodies on demand via the use_skill tool.
    const enabledSkills = this.getEnabledSkills(workspace.rootPath)
    const skillsSection = buildSkillsPromptSection(enabledSkills)
    // Inject memories relevant to what the user just asked (no-op when memory is disabled).
    const memorySection = this.memoryManager.getPromptSection(workspace.rootPath, params.content)

    // Subagent config + user-defined agent personas the orchestrator can delegate to.
    const subagentSettings = this.getSubagentSettings()
    const agents = this.getAgents()
    const agentsSection =
      subagentSettings.enabled && agents.length > 0
        ? buildAgentsPromptSection(agents.map((a) => ({ name: a.name, description: a.description })))
        : ''
    const systemPromptSuffix = `${skillsSection}${memorySection}${agentsSection}`

    // Bound once and shared by the parent run and every child run so approval prompts always
    // reach the UI and "always allow" decisions apply everywhere within this session.
    const checkToolPermission = (toolCall: ToolCallRequest): Promise<'allow' | 'deny'> =>
      this.checkToolPermission(session.id, toolCall, onEvent)

    // Capability handed to the run's tools: run a focused child agent to completion. The child
    // reuses this session's provider/model/tools but starts from just its task (no parent
    // history), its messages are ephemeral (never persisted), and it is denied spawn_subagent
    // so it cannot recurse. Only lifecycle progress reaches the UI, not the child's tokens.
    const spawnSubagent = (request: SubagentRequest): Promise<SubagentResult> =>
      runSubagent(request, {
        concurrency: this.subagentConcurrency,
        maxConcurrent: subagentSettings.maxConcurrent,
        defaultTimeoutMs: subagentSettings.defaultTimeoutSeconds * 1000,
        maxTimeoutMs: MAX_SUBAGENT_TIMEOUT_MS,
        isParentCancelled: () => this.cancelledSessions.has(session.id),
        onProgress: (progress) => onEvent({ type: 'subagent_progress', sessionId: session.id, ...progress }),
        generateId: () => randomUUID(),
        runChild: async (input, control) => {
          // Resolve the requested agent persona (if any) and prepend it to the child's prompt,
          // then inject the skills that agent is allowed to use (all enabled skills if unrestricted).
          const agentDef = input.agent ? agents.find((a) => a.name === input.agent) : undefined
          const agentSkills = filterSkillsForAgent(enabledSkills, agentDef?.skillIds)
          const childSystemPrompt =
            buildSubagentSystemPromptSuffix(input.task, input.resultFormat, agentDef?.systemPrompt) +
            buildSkillsPromptSection(agentSkills)
          let finalText = ''
          await this.agentRunner.run({
            sessionId: session.id,
            provider,
            model: session.model,
            temperature: providerConfig.temperature,
            workspaceRoot: workspace.rootPath,
            systemPromptSuffix: childSystemPrompt,
            history: [
              { id: randomUUID(), sessionId: session.id, role: 'user', content: input.task, createdAt: Date.now() }
            ],
            excludeToolNames: [
              SPAWN_SUBAGENT_TOOL_NAME,
              ...(this.isScreenControlEnabled() ? [] : SCREEN_TOOL_NAMES)
            ],
            checkToolPermission,
            onEvent: (event) => {
              if (
                event.type === 'message_done' &&
                event.message.role === 'assistant' &&
                event.message.content.trim()
              ) {
                finalText = event.message.content
              } else if (event.type === 'tool_call_start') {
                control.onToolStart(event.toolCall.name)
              }
            },
            persistMessage: () => {},
            isCancelled: control.isCancelled
          })
          return finalText
        }
      })

    this.cancelledSessions.delete(session.id)
    this.activeRuns.add(session.id)
    try {
      await this.agentRunner.run({
        sessionId: session.id,
        provider,
        model: session.model,
        temperature: providerConfig.temperature,
        workspaceRoot: workspace.rootPath,
        systemPromptSuffix,
        // Only expose subagents when enabled; otherwise hide the tool from the orchestrator.
        spawnSubagent: subagentSettings.enabled ? spawnSubagent : undefined,
        excludeToolNames: [
          ...(subagentSettings.enabled ? [] : [SPAWN_SUBAGENT_TOOL_NAME]),
          ...(this.isScreenControlEnabled() ? [] : SCREEN_TOOL_NAMES)
        ],
        checkToolPermission,
        history,
        onEvent,
        persistMessage: (message) => this.sessionManager.appendMessage(message),
        isCancelled: () => this.cancelledSessions.has(session.id)
      })

      // After the run, extract durable facts from the updated transcript. Fire-and-forget and
      // best-effort: memory work must never block or fail the chat. Gated internally by the flag.
      const updatedHistory = this.sessionManager.getMessages(session.id)
      void this.memoryManager
        .extract(provider, session.model, workspace.rootPath, session.id, updatedHistory)
        .catch((error) => console.error('[Memory] extraction failed:', error))
    } finally {
      this.activeRuns.delete(session.id)
      this.cancelledSessions.delete(session.id)
    }
  }
}
