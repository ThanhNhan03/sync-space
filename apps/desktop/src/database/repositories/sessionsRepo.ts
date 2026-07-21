import { randomUUID } from 'node:crypto'

import type Database from 'better-sqlite3'

import type { ProviderId, SessionSummary } from '@shared/types'

interface SessionRow {
  id: string
  title: string
  workspace_id: string | null
  provider_id: string
  model: string
  created_at: number
  updated_at: number
}

interface CreateSessionInput {
  workspaceId: string | null
  providerId: ProviderId
  model: string
  title: string
}

function toSessionSummary(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    workspaceId: row.workspace_id,
    providerId: row.provider_id as ProviderId,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class SessionsRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  create(input: CreateSessionInput): SessionSummary {
    const id = randomUUID()
    const now = Date.now()

    this.db
      .prepare(
        `INSERT INTO sessions (id, title, workspace_id, provider_id, model, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.title, input.workspaceId, input.providerId, input.model, now, now)

    return {
      id,
      title: input.title,
      workspaceId: input.workspaceId,
      providerId: input.providerId,
      model: input.model,
      createdAt: now,
      updatedAt: now
    }
  }

  listAll(): SessionSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, workspace_id, provider_id, model, created_at, updated_at
         FROM sessions ORDER BY updated_at DESC`
      )
      .all() as SessionRow[]

    return rows.map(toSessionSummary)
  }

  setWorkspace(id: string, workspaceId: string | null): SessionSummary {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`Session not found: ${id}`)
    }

    const updatedAt = Date.now()

    this.db
      .prepare('UPDATE sessions SET workspace_id = ?, updated_at = ? WHERE id = ?')
      .run(workspaceId, updatedAt, id)

    return { ...existing, workspaceId, updatedAt }
  }

  rename(id: string, title: string): SessionSummary {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`Session not found: ${id}`)
    }

    const updatedAt = Date.now()

    this.db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, updatedAt, id)

    return { ...existing, title, updatedAt }
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  touchUpdatedAt(id: string): void {
    this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id)
  }

  getById(id: string): SessionSummary | undefined {
    const row = this.db
      .prepare(
        `SELECT id, title, workspace_id, provider_id, model, created_at, updated_at
         FROM sessions WHERE id = ?`
      )
      .get(id) as SessionRow | undefined

    return row ? toSessionSummary(row) : undefined
  }
}
