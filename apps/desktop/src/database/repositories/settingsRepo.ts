import type Database from 'better-sqlite3'

import type { AppSettings } from '@shared/types'

interface SettingsRow {
  key: string
  value: string
}

const SETTINGS_KEY = 'app'

export class SettingsRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  get(): AppSettings | null {
    const row = this.db
      .prepare('SELECT key, value FROM settings WHERE key = ?')
      .get(SETTINGS_KEY) as SettingsRow | undefined

    return row ? (JSON.parse(row.value) as AppSettings) : null
  }

  set(settings: AppSettings): void {
    const value = JSON.stringify(settings)

    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(SETTINGS_KEY, value)
  }
}
