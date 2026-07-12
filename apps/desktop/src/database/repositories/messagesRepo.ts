import type Database from 'better-sqlite3'

import type { ChatMessage, MessageAttachment, MessageRole, ToolCallRequest } from '@shared/types'

interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  tool_calls: string | null
  tool_call_id: string | null
  attachments: string | null
  created_at: number
}

function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as MessageRole,
    content: row.content,
    toolCalls: row.tool_calls ? (JSON.parse(row.tool_calls) as ToolCallRequest[]) : undefined,
    toolCallId: row.tool_call_id ?? undefined,
    attachments: row.attachments ? (JSON.parse(row.attachments) as MessageAttachment[]) : undefined,
    createdAt: row.created_at
  }
}

export class MessagesRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  append(message: ChatMessage): void {
    const toolCalls = message.toolCalls ? JSON.stringify(message.toolCalls) : null
    const attachments = message.attachments ? JSON.stringify(message.attachments) : null
    const toolCallId = message.toolCallId ?? null

    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, tool_calls, tool_call_id, attachments, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        message.id,
        message.sessionId,
        message.role,
        message.content,
        toolCalls,
        toolCallId,
        attachments,
        message.createdAt
      )
  }

  listBySession(sessionId: string): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, role, content, tool_calls, tool_call_id, attachments, created_at
         FROM messages WHERE session_id = ? ORDER BY created_at ASC`
      )
      .all(sessionId) as MessageRow[]

    return rows.map(toChatMessage)
  }
}
