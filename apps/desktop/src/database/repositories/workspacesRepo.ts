import { randomUUID } from 'node:crypto'

import type Database from 'better-sqlite3'

import type { Workspace } from '@shared/types'

interface WorkspaceRow {
  id: string
  name: string
  root_path: string
  created_at: number
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    createdAt: row.created_at
  }
}

export class WorkspacesRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  create(name: string, rootPath: string): Workspace {
    const id = randomUUID()
    const createdAt = Date.now()

    this.db
      .prepare('INSERT INTO workspaces (id, name, root_path, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, rootPath, createdAt)

    return { id, name, rootPath, createdAt }
  }

  list(): Workspace[] {
    const rows = this.db
      .prepare('SELECT id, name, root_path, created_at FROM workspaces ORDER BY created_at DESC')
      .all() as WorkspaceRow[]

    return rows.map(toWorkspace)
  }

  getById(id: string): Workspace | undefined {
    const row = this.db
      .prepare('SELECT id, name, root_path, created_at FROM workspaces WHERE id = ?')
      .get(id) as WorkspaceRow | undefined

    return row ? toWorkspace(row) : undefined
  }

  getByRootPath(rootPath: string): Workspace | undefined {
    const row = this.db
      .prepare('SELECT id, name, root_path, created_at FROM workspaces WHERE root_path = ?')
      .get(rootPath) as WorkspaceRow | undefined

    return row ? toWorkspace(row) : undefined
  }
}
