import Database from 'better-sqlite3'

import { SCHEMA_SQL } from './schema'

export function createDatabase(filePath: string): Database.Database {
  const db = new Database(filePath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(SCHEMA_SQL)

  return db
}
