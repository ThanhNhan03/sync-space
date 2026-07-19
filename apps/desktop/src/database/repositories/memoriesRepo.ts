import type Database from 'better-sqlite3'

import type { MemoryCategory, MemoryEntry, MemorySource } from '@shared/types'

interface MemoryRow {
  id: string
  workspace_root: string
  category: string
  content: string
  source: string
  session_id: string | null
  created_at: number
  updated_at: number
}

function toMemoryEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    workspaceRoot: row.workspace_root,
    category: row.category as MemoryCategory,
    content: row.content,
    source: row.source as MemorySource,
    sessionId: row.session_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const GLOBAL_SCOPE = ''

export class MemoriesRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  add(entry: MemoryEntry): MemoryEntry {
    this.db
      .prepare(
        `INSERT INTO memories (id, workspace_root, category, content, source, session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.workspaceRoot,
        entry.category,
        entry.content,
        entry.source,
        entry.sessionId ?? null,
        entry.createdAt,
        entry.updatedAt
      )
    return entry
  }

  updateContent(id: string, content: string, updatedAt: number): void {
    this.db
      .prepare('UPDATE memories SET content = ?, updated_at = ? WHERE id = ?')
      .run(content, updatedAt, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id)
  }

  getById(id: string): MemoryEntry | undefined {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined
    return row ? toMemoryEntry(row) : undefined
  }

  /** Memories visible to a workspace: its own plus global (workspace_root = ''), newest first. */
  listForScope(workspaceRoot: string): MemoryEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM memories WHERE workspace_root = ? OR workspace_root = ?
         ORDER BY updated_at DESC`
      )
      .all(workspaceRoot, GLOBAL_SCOPE) as MemoryRow[]
    return rows.map(toMemoryEntry)
  }

  /** Every memory (used by the UI when no workspace is active), newest first. */
  listAll(): MemoryEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM memories ORDER BY updated_at DESC')
      .all() as MemoryRow[]
    return rows.map(toMemoryEntry)
  }

  /** Delete all memories for a workspace scope (its own + global), returning the count removed. */
  clearForScope(workspaceRoot: string): number {
    const result = this.db
      .prepare('DELETE FROM memories WHERE workspace_root = ? OR workspace_root = ?')
      .run(workspaceRoot, GLOBAL_SCOPE)
    return result.changes
  }

  clearAll(): number {
    return this.db.prepare('DELETE FROM memories').run().changes
  }
}
