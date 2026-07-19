import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { AgentDefinition, SkillInfo, SubagentSettings } from '@shared/types'
import { DEFAULT_AGENTS } from '@shared/types'

export interface AgentsSectionProps {
  agents: AgentDefinition[]
  onAgentsChange: (agents: AgentDefinition[]) => void
  subagentSettings: SubagentSettings
  onSubagentSettingsChange: (settings: SubagentSettings) => void
  /** Active workspace, used to list skills an agent can be assigned. */
  workspaceRoot?: string
}

interface DraftAgent {
  id: string | null
  name: string
  description: string
  systemPrompt: string
  skillIds: string[]
}

const EMPTY_DRAFT: DraftAgent = { id: null, name: '', description: '', systemPrompt: '', skillIds: [] }

const inputClass =
  'w-full rounded-md bg-surface-muted px-2 py-1.5 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent'

/** Collapse a display name into a safe, spaceless agent identifier the model passes as `agent`. */
function normalizeAgentName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
}

export function AgentsSection({
  agents,
  onAgentsChange,
  subagentSettings,
  onSubagentSettingsChange,
  workspaceRoot
}: AgentsSectionProps): JSX.Element {
  const [draft, setDraft] = useState<DraftAgent | null>(null)
  const [skills, setSkills] = useState<SkillInfo[]>([])

  useEffect(() => {
    void window.syncspace.listSkills(workspaceRoot).then(setSkills)
  }, [workspaceRoot])

  const patchSettings = (patch: Partial<SubagentSettings>): void => {
    onSubagentSettingsChange({ ...subagentSettings, ...patch })
  }

  const handleSaveDraft = (): void => {
    if (!draft) return
    const name = normalizeAgentName(draft.name)
    if (!name || !draft.systemPrompt.trim()) return
    const now = Date.now()
    // Empty selection means "all skills" (unrestricted), stored as undefined.
    const skillIds = draft.skillIds.length > 0 ? draft.skillIds : undefined

    if (draft.id) {
      onAgentsChange(
        agents.map((agent) =>
          agent.id === draft.id
            ? { ...agent, name, description: draft.description.trim(), systemPrompt: draft.systemPrompt.trim(), skillIds, updatedAt: now }
            : agent
        )
      )
    } else {
      onAgentsChange([
        ...agents,
        {
          id: `agent-${uuidv4()}`,
          name,
          description: draft.description.trim(),
          systemPrompt: draft.systemPrompt.trim(),
          skillIds,
          createdAt: now,
          updatedAt: now
        }
      ])
    }
    setDraft(null)
  }

  const handleDelete = (id: string): void => {
    onAgentsChange(agents.filter((agent) => agent.id !== id))
  }

  const handleRestoreDefaults = (): void => {
    const present = new Set(agents.map((a) => a.name))
    const missing = DEFAULT_AGENTS.filter((a) => !present.has(a.name)).map((a) => ({
      ...a,
      id: `agent-${uuidv4()}`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }))
    if (missing.length > 0) onAgentsChange([...agents, ...missing])
  }

  const toggleDraftSkill = (id: string, checked: boolean): void => {
    if (!draft) return
    const next = checked ? [...draft.skillIds, id] : draft.skillIds.filter((s) => s !== id)
    setDraft({ ...draft, skillIds: next })
  }

  return (
    <div className="space-y-5">
      {/* Subagent controls */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">Subagents</span>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={subagentSettings.enabled}
              onChange={(e) => patchSettings({ enabled: e.target.checked })}
              className="accent-accent"
            />
            Enabled
          </label>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          When enabled, the agent can delegate focused sub-tasks to child agents via the{' '}
          <span className="font-mono">spawn_subagent</span> tool.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs">
            <span className="mb-1 block text-slate-400">Max concurrent</span>
            <input
              type="number"
              min={1}
              max={8}
              value={subagentSettings.maxConcurrent}
              onChange={(e) => patchSettings({ maxConcurrent: Number(e.target.value) })}
              disabled={!subagentSettings.enabled}
              className={inputClass}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-400">Default timeout (s)</span>
            <input
              type="number"
              min={10}
              max={300}
              value={subagentSettings.defaultTimeoutSeconds}
              onChange={(e) => patchSettings({ defaultTimeoutSeconds: Number(e.target.value) })}
              disabled={!subagentSettings.enabled}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      {/* Named agents */}
      <div className="border-t border-white/10 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">Agents</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="rounded-md bg-surface-muted px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
            >
              Restore defaults
            </button>
            {!draft && (
              <button
                type="button"
                onClick={() => setDraft({ ...EMPTY_DRAFT })}
                className="rounded-md bg-surface-muted px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
              >
                + Add agent
              </button>
            )}
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Define specialized agent personas the orchestrator can delegate to by name. Each agent can
          be limited to specific skills, or inherit all skills when none are selected.
        </p>

        {agents.length === 0 && !draft && (
          <p className="mb-3 text-xs italic text-slate-500">
            No agents defined. Use “Restore defaults” or “Add agent”.
          </p>
        )}

        <ul className="mb-3 space-y-2">
          {agents.map((agent) => (
            <li key={agent.id} className="rounded-md bg-surface-muted px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-mono font-medium text-accent">{agent.name}</span>
                <span className="min-w-0 flex-1 truncate text-slate-400">{agent.description}</span>
                <span className="shrink-0 text-[11px] text-slate-500">
                  {agent.skillIds && agent.skillIds.length > 0
                    ? `${agent.skillIds.length} skill${agent.skillIds.length === 1 ? '' : 's'}`
                    : 'all skills'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      id: agent.id,
                      name: agent.name,
                      description: agent.description,
                      systemPrompt: agent.systemPrompt,
                      skillIds: agent.skillIds ?? []
                    })
                  }
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-400 hover:text-white"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(agent.id)}
                  aria-label={`Delete ${agent.name}`}
                  className="shrink-0 rounded p-0.5 text-slate-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>

        {draft && (
          <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
            <label className="block text-xs">
              <span className="mb-1 block text-slate-400">Name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="researcher"
                className={inputClass}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-slate-400">Description (when to use it)</span>
              <input
                type="text"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Researches a topic across the codebase and reports findings."
                className={inputClass}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-slate-400">System prompt (agent instructions)</span>
              <textarea
                value={draft.systemPrompt}
                onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                rows={4}
                placeholder="You are a meticulous researcher. Read widely, cite file paths, and…"
                className={inputClass}
              />
            </label>

            <div className="text-xs">
              <span className="mb-1 block text-slate-400">
                Skills (leave all unchecked to allow every skill)
              </span>
              {skills.length === 0 ? (
                <p className="italic text-slate-500">
                  No skills available{workspaceRoot ? '' : ' — select a workspace first'}.
                </p>
              ) : (
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md bg-surface-muted p-2">
                  {skills.map((skill) => (
                    <label key={skill.id} className="flex items-center gap-2 text-slate-300">
                      <input
                        type="checkbox"
                        checked={draft.skillIds.includes(skill.id)}
                        onChange={(e) => toggleDraftSkill(skill.id, e.target.checked)}
                        className="accent-accent"
                      />
                      <span className="font-mono">{skill.name}</span>
                      <span className="truncate text-slate-500">{skill.description}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

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
                onClick={handleSaveDraft}
                disabled={!draft.name.trim() || !draft.systemPrompt.trim()}
                className="rounded-md bg-accent/90 px-3 py-1 text-xs font-medium text-white hover:bg-accent disabled:opacity-40"
              >
                {draft.id ? 'Save' : 'Add agent'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
