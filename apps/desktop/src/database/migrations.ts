import type Database from 'better-sqlite3'

interface ColumnInfo {
  name: string
  notnull: number
}

/**
 * Drops the NOT NULL constraint on `sessions.workspace_id` so a chat can exist with no
 * workspace attached, preserving all existing rows. Idempotent and safe to run on every
 * launch: no-ops when the table doesn't exist yet (fresh install -- schema.ts's
 * CREATE TABLE IF NOT EXISTS already creates the nullable column) or when workspace_id is
 * already nullable (already migrated).
 *
 * SQLite can't drop a NOT NULL constraint via ALTER TABLE, so this follows the documented
 * table-rebuild procedure (https://www.sqlite.org/lang_altertable.html). A NULL foreign-key
 * value is exempt from FK enforcement, so the unchanged `REFERENCES ... ON DELETE CASCADE`
 * clause still cascades deletes for workspace-bound sessions while leaving workspace-less
 * ones untouched.
 */
export function migrateSessionsWorkspaceNullable(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(sessions)').all() as ColumnInfo[]
  if (columns.length === 0) return // fresh install; schema.ts creates the nullable column

  const workspaceIdCol = columns.find((c) => c.name === 'workspace_id')
  if (!workspaceIdCol || workspaceIdCol.notnull === 0) return // already migrated

  // foreign_keys can only be toggled outside a transaction.
  db.pragma('foreign_keys = OFF')
  try {
    const rebuild = db.transaction(() => {
      db.exec(`
        CREATE TABLE sessions_new (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
          provider_id TEXT NOT NULL,
          model TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO sessions_new (id, title, workspace_id, provider_id, model, created_at, updated_at)
          SELECT id, title, workspace_id, provider_id, model, created_at, updated_at FROM sessions;
        DROP TABLE sessions;
        ALTER TABLE sessions_new RENAME TO sessions;
        CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON sessions(workspace_id);
      `)
      const violations = db.pragma('foreign_key_check(sessions)') as unknown[]
      if (Array.isArray(violations) && violations.length > 0) {
        throw new Error(`sessions migration produced ${violations.length} foreign-key violation(s)`)
      }
    })
    rebuild()
  } finally {
    db.pragma('foreign_keys = ON')
  }
}
