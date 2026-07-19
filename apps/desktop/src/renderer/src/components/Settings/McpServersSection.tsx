import { useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { McpPreset, McpServerConfig, McpServerStatus, McpTransportType } from '@shared/types'

const WORKSPACE_ROOT_PLACEHOLDER = '{WORKSPACE_ROOT}'

export interface McpServersSectionProps {
  servers: McpServerConfig[]
  onChange: (servers: McpServerConfig[]) => void
  /** Active workspace path, substituted for {WORKSPACE_ROOT} in preset args. */
  workspaceRoot?: string
}

interface DraftServer {
  name: string
  type: McpTransportType
  command: string
  argsText: string
  url: string
  envText: string
  headersText: string
}

const EMPTY_DRAFT: DraftServer = {
  name: '',
  type: 'stdio',
  command: '',
  argsText: '',
  url: '',
  envText: '',
  headersText: ''
}

/** Parse "KEY=VALUE" lines into a record, ignoring blanks and comment lines. */
function parseKeyValueLines(text: string): Record<string, string> {
  const record: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    record[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return record
}

function toKeyValueLines(record?: Record<string, string>): string {
  if (!record) return ''
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function draftFromPreset(preset: McpPreset, workspaceRoot?: string): DraftServer {
  const args = (preset.args ?? []).map((arg) =>
    arg === WORKSPACE_ROOT_PLACEHOLDER ? workspaceRoot ?? arg : arg
  )
  const env = (preset.requiredEnv ?? []).reduce<Record<string, string>>((acc, key) => {
    acc[key] = ''
    return acc
  }, {})
  return {
    name: preset.name,
    type: preset.type,
    command: preset.command ?? '',
    argsText: args.join('\n'),
    url: preset.url ?? '',
    envText: toKeyValueLines(env),
    headersText: ''
  }
}

function draftToConfig(draft: DraftServer): McpServerConfig {
  const env = parseKeyValueLines(draft.envText)
  const headers = parseKeyValueLines(draft.headersText)
  return {
    id: `mcp-${uuidv4()}`,
    name: draft.name.trim() || 'Untitled server',
    type: draft.type,
    enabled: true,
    command: draft.type === 'stdio' ? draft.command.trim() || undefined : undefined,
    args:
      draft.type === 'stdio'
        ? draft.argsText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : undefined,
    url: draft.type !== 'stdio' ? draft.url.trim() || undefined : undefined,
    env: Object.keys(env).length > 0 ? env : undefined,
    headers: Object.keys(headers).length > 0 ? headers : undefined
  }
}

const STATUS_COLOR: Record<McpServerStatus['status'], string> = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-400 animate-pulse',
  failed: 'bg-red-500',
  disabled: 'bg-slate-600'
}

const inputClass =
  'w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent'

export function McpServersSection({
  servers,
  onChange,
  workspaceRoot
}: McpServersSectionProps): JSX.Element {
  const [presets, setPresets] = useState<McpPreset[]>([])
  const [statuses, setStatuses] = useState<McpServerStatus[]>([])
  const [draft, setDraft] = useState<DraftServer | null>(null)

  const statusById = useMemo(() => {
    const map = new Map<string, McpServerStatus>()
    for (const status of statuses) map.set(status.id, status)
    return map
  }, [statuses])

  useEffect(() => {
    void window.syncspace.getMcpPresets().then(setPresets)
    void window.syncspace.getMcpStatus().then(setStatuses)
    // Live status pushed by the main process as servers connect/disconnect.
    const unsubscribe = window.syncspace.onMcpStatusChanged(setStatuses)
    return unsubscribe
  }, [])

  const handleToggle = (id: string, enabled: boolean): void => {
    onChange(servers.map((server) => (server.id === id ? { ...server, enabled } : server)))
  }

  const handleDelete = (id: string): void => {
    onChange(servers.filter((server) => server.id !== id))
  }

  const handleAddDraft = (): void => {
    if (!draft) return
    onChange([...servers, draftToConfig(draft)])
    setDraft(null)
  }

  const handlePresetSelect = (key: string): void => {
    const preset = presets.find((p) => p.key === key)
    if (preset) setDraft(draftFromPreset(preset, workspaceRoot))
  }

  return (
    <div className="border-t border-white/10 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">MCP servers</span>
        {!draft && (
          <button
            type="button"
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
            className="rounded-md bg-surface-muted px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
          >
            + Add custom
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Connect Model Context Protocol servers to give the agent extra tools. Their tools appear
        automatically once a server connects.
      </p>

      {servers.length === 0 && !draft && (
        <p className="mb-3 text-xs italic text-slate-500">No servers configured yet.</p>
      )}

      <ul className="mb-3 space-y-2">
        {servers.map((server) => {
          const status = statusById.get(server.id)
          const dot = STATUS_COLOR[status?.status ?? (server.enabled ? 'connecting' : 'disabled')]
          return (
            <li key={server.id} className="rounded-md bg-surface-muted px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                <span className="truncate font-medium text-white">{server.name}</span>
                <span className="shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                  {server.type}
                </span>
                {status && status.status === 'connected' && (
                  <span className="shrink-0 text-[11px] text-slate-400">{status.toolCount} tools</span>
                )}
                <label className="ml-auto flex shrink-0 items-center gap-1 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    onChange={(e) => handleToggle(server.id, e.target.checked)}
                    className="accent-accent"
                  />
                  Enabled
                </label>
                <button
                  type="button"
                  onClick={() => handleDelete(server.id)}
                  aria-label={`Delete ${server.name}`}
                  className="shrink-0 rounded p-0.5 text-slate-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
              {status?.status === 'failed' && status.error && (
                <p className="mt-1 truncate text-[11px] text-red-400" title={status.error}>
                  {status.error}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {draft ? (
        <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          {presets.length > 0 && (
            <label className="block text-xs">
              <span className="mb-1 block text-slate-400">Start from a preset</span>
              <select
                value=""
                onChange={(e) => handlePresetSelect(e.target.value)}
                className={inputClass}
              >
                <option value="">Custom…</option>
                {presets.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs">
            <span className="mb-1 block text-slate-400">Name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="My server"
              className={inputClass}
            />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block text-slate-400">Transport</span>
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as McpTransportType })}
              className={inputClass}
            >
              <option value="stdio">stdio (local command)</option>
              <option value="sse">SSE (URL)</option>
              <option value="streamable-http">Streamable HTTP (URL)</option>
            </select>
          </label>

          {draft.type === 'stdio' ? (
            <>
              <label className="block text-xs">
                <span className="mb-1 block text-slate-400">Command</span>
                <input
                  type="text"
                  value={draft.command}
                  onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                  placeholder="npx"
                  className={inputClass}
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-slate-400">Arguments (one per line)</span>
                <textarea
                  value={draft.argsText}
                  onChange={(e) => setDraft({ ...draft, argsText: e.target.value })}
                  rows={3}
                  placeholder={'-y\n@modelcontextprotocol/server-filesystem'}
                  className={`${inputClass} font-mono`}
                />
              </label>
            </>
          ) : (
            <label className="block text-xs">
              <span className="mb-1 block text-slate-400">Server URL</span>
              <input
                type="text"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="https://example.com/mcp"
                className={inputClass}
              />
            </label>
          )}

          <label className="block text-xs">
            <span className="mb-1 block text-slate-400">
              {draft.type === 'stdio' ? 'Environment' : 'Headers'} (KEY=VALUE per line)
            </span>
            <textarea
              value={draft.type === 'stdio' ? draft.envText : draft.headersText}
              onChange={(e) =>
                setDraft(
                  draft.type === 'stdio'
                    ? { ...draft, envText: e.target.value }
                    : { ...draft, headersText: e.target.value }
                )
              }
              rows={2}
              placeholder={draft.type === 'stdio' ? 'API_TOKEN=…' : 'Authorization=Bearer …'}
              className={`${inputClass} font-mono`}
            />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-md px-3 py-1 text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddDraft}
              className="rounded-md bg-accent/90 px-3 py-1 text-xs font-medium text-white hover:bg-accent"
            >
              Add server
            </button>
          </div>
        </div>
      ) : (
        presets.length > 0 && (
          <label className="block text-xs">
            <span className="mb-1 block text-slate-400">Quick add</span>
            <select value="" onChange={(e) => handlePresetSelect(e.target.value)} className={inputClass}>
              <option value="">Choose a preset…</option>
              {presets.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
        )
      )}
    </div>
  )
}
