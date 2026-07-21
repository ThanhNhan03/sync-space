import Database from 'better-sqlite3'

import { migrateSessionsWorkspaceNullable } from './migrations'
import { SCHEMA_SQL } from './schema'

export function createDatabase(filePath: string): Database.Database {
  const db = new Database(filePath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Run schema migrations before the CREATE TABLE IF NOT EXISTS statements (which are no-ops
  // for existing tables and so can't alter a column's constraints on an existing database).
  migrateSessionsWorkspaceNullable(db)

  db.exec(SCHEMA_SQL)

  return db
}
