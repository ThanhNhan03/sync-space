import type { ChatMessage, ProviderId, SessionSummary, Workspace } from '@shared/types'
import type {
  MessagesRepository,
  SessionsRepository,
  WorkspacesRepository
} from '@database/repositories'

export interface CreateSessionInput {
  workspaceId: string | null
  providerId: ProviderId
  model: string
  title?: string
}

/**
 * Thin domain layer over the SQLite repositories -- owns session/message/workspace CRUD
 * so the Engine and IPC layer never touch SQL directly.
 */
export class SessionManager {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly messages: MessagesRepository,
    private readonly workspaces: WorkspacesRepository
  ) {}

  listSessions(): SessionSummary[] {
    return this.sessions.listAll()
  }

  getSession(id: string): SessionSummary | undefined {
    return this.sessions.getById(id)
  }

  setSessionWorkspace(id: string, workspaceId: string | null): SessionSummary {
    return this.sessions.setWorkspace(id, workspaceId)
  }

  createSession(input: CreateSessionInput): SessionSummary {
    return this.sessions.create({
      workspaceId: input.workspaceId,
      providerId: input.providerId,
      model: input.model,
      title: input.title?.trim() || 'New session'
    })
  }

  renameSession(id: string, title: string): SessionSummary {
    return this.sessions.rename(id, title)
  }

  deleteSession(id: string): void {
    this.sessions.delete(id)
  }

  getMessages(sessionId: string): ChatMessage[] {
    return this.messages.listBySession(sessionId)
  }

  appendMessage(message: ChatMessage): void {
    this.messages.append(message)
    this.sessions.touchUpdatedAt(message.sessionId)
  }

  listWorkspaces(): Workspace[] {
    return this.workspaces.list()
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.getById(id)
  }

  registerWorkspace(name: string, rootPath: string): Workspace {
    return this.workspaces.getByRootPath(rootPath) ?? this.workspaces.create(name, rootPath)
  }
}
