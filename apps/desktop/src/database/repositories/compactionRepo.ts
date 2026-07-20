import type Database from 'better-sqlite3'

export interface CompactionState {
  summary: string
  summarizedThroughMessageId: string
  summarizedThroughCreatedAt: number
  updatedAt: number
}

interface CompactionRow {
  session_id: string
  summary: string
  summarized_through_message_id: string
  summarized_through_created_at: number
  updated_at: number
}

function toCompactionState(row: CompactionRow): CompactionState {
  return {
    summary: row.summary,
    summarizedThroughMessageId: row.summarized_through_message_id,
    summarizedThroughCreatedAt: row.summarized_through_created_at,
    updatedAt: row.updated_at
  }
}

/** Persists each session's rolling compaction summary + the cursor marking how far it covers. */
export class CompactionRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  get(sessionId: string): CompactionState | undefined {
    const row = this.db
      .prepare('SELECT * FROM session_compaction WHERE session_id = ?')
      .get(sessionId) as CompactionRow | undefined
    return row ? toCompactionState(row) : undefined
  }

  upsert(sessionId: string, summary: string, throughMessageId: string, throughCreatedAt: number): void {
    this.db
      .prepare(
        `INSERT INTO session_compaction
           (session_id, summary, summarized_through_message_id, summarized_through_created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           summary = excluded.summary,
           summarized_through_message_id = excluded.summarized_through_message_id,
           summarized_through_created_at = excluded.summarized_through_created_at,
           updated_at = excluded.updated_at`
      )
      .run(sessionId, summary, throughMessageId, throughCreatedAt, Date.now())
  }

  clear(sessionId: string): void {
    this.db.prepare('DELETE FROM session_compaction WHERE session_id = ?').run(sessionId)
  }
}
