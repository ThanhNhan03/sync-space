import { useCallback, useEffect, useState } from 'react'
import type { SkillInfo, SkillSource } from '@shared/types'

export interface SkillsSectionProps {
  /** Active workspace path, used to discover project-level skills under .claude/skills. */
  workspaceRoot?: string
}

const SOURCE_LABEL: Record<SkillSource, string> = {
  project: 'Project',
  global: 'Global',
  builtin: 'Built-in'
}

export function SkillsSection({ workspaceRoot }: SkillsSectionProps): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setSkills(await window.syncspace.listSkills(workspaceRoot))
  }, [workspaceRoot])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleToggle = async (id: string, enabled: boolean): Promise<void> => {
    setSkills(await window.syncspace.setSkillEnabled(id, enabled, workspaceRoot))
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Skills</span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-md bg-surface-muted px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
        >
          Refresh
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Skills are folders with a SKILL.md that teach the agent a task. Enabled skills are offered
        to the agent, which loads a skill's full instructions only when it's relevant.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void window.syncspace.openSkillsDir('global', workspaceRoot)}
          className="rounded-md bg-surface-muted px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
        >
          Open global skills folder
        </button>
        {workspaceRoot && (
          <button
            type="button"
            onClick={() => void window.syncspace.openSkillsDir('project', workspaceRoot)}
            className="rounded-md bg-surface-muted px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
          >
            Open project skills folder
          </button>
        )}
      </div>

      {skills.length === 0 ? (
        <p className="text-xs italic text-slate-500">
          No skills found. Add a folder containing a SKILL.md to a skills folder above, then Refresh.
        </p>
      ) : (
        <ul className="space-y-2">
          {skills.map((skill) => {
            const isExpanded = expandedId === skill.id
            return (
              <li key={skill.id} className="rounded-md bg-surface-muted text-sm">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span aria-hidden="true" className="shrink-0 text-slate-500">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                    <span className="truncate font-medium text-white">{skill.name}</span>
                    <span className="shrink-0 rounded bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                      {SOURCE_LABEL[skill.source]}
                    </span>
                  </button>
                  <label className="ml-auto flex shrink-0 items-center gap-1 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      onChange={(e) => void handleToggle(skill.id, e.target.checked)}
                      className="accent-accent"
                    />
                    Enabled
                  </label>
                </div>
                {isExpanded && (
                  <div className="border-t border-white/5 px-3 py-2">
                    <p className="text-[11px] leading-snug text-slate-400">{skill.description}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-slate-600" title={skill.dir}>
                      {skill.dir}
                    </p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
