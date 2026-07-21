export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON sessions(workspace_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  tool_call_id TEXT,
  attachments TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  workspace_root TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_workspace_root ON memories(workspace_root);

CREATE TABLE IF NOT EXISTS session_compaction (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  summarized_through_message_id TEXT NOT NULL,
  summarized_through_created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`
