import type { PermissionAction, PermissionRule } from '@shared/types'
import { DEFAULT_PERMISSION_RULES, PERMISSION_MANAGED_TOOLS } from '@shared/types'

export interface PermissionsSectionProps {
  /** Effective rules (settings.permissionRules ?? defaults). */
  rules: PermissionRule[]
  onChange: (rules: PermissionRule[]) => void
}

const ACTIONS: { value: PermissionAction; label: string }[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'deny', label: 'Deny' }
]

const MANAGED_NAMES = new Set(PERMISSION_MANAGED_TOOLS.map((t) => t.name.toLowerCase()))

/** The action a built-in tool currently resolves to (its no-pattern rule, else Ask). */
function currentAction(rules: PermissionRule[], name: string): PermissionAction {
  const rule = rules.find((r) => !r.pattern && r.tool.toLowerCase() === name.toLowerCase())
  return rule?.action ?? 'ask'
}

const inputClass =
  'rounded-md bg-surface-muted px-2 py-1 text-sm text-white outline-none ring-1 ring-transparent focus:ring-accent'

export function PermissionsSection({ rules, onChange }: PermissionsSectionProps): JSX.Element {
  const setAction = (name: string, action: PermissionAction): void => {
    // Rebuild the managed rules, preserving any custom/pattern rules for other tools.
    const others = rules.filter((r) => r.pattern || !MANAGED_NAMES.has(r.tool.toLowerCase()))
    const managed: PermissionRule[] = PERMISSION_MANAGED_TOOLS.map((tool) => ({
      tool: tool.name,
      action: tool.name === name ? action : currentAction(rules, tool.name)
    }))
    onChange([...managed, ...others])
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Tool permissions</span>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_PERMISSION_RULES)}
          className="rounded-md bg-surface-muted px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
        >
          Reset to defaults
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Choose how the agent may use each tool. <span className="font-medium">Ask</span> pauses the
        run for your approval; <span className="font-medium">Deny</span> blocks it. Tools not listed
        here (including MCP tools) always Ask.
      </p>

      <ul className="space-y-1.5">
        {PERMISSION_MANAGED_TOOLS.map((tool) => (
          <li key={tool.name} className="flex items-center gap-2 rounded-md bg-surface-muted px-3 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="text-sm text-slate-200">{tool.label}</span>
              <span className="ml-2 font-mono text-[11px] text-slate-500">{tool.name}</span>
            </span>
            <select
              value={currentAction(rules, tool.name)}
              onChange={(e) => setAction(tool.name, e.target.value as PermissionAction)}
              className={inputClass}
            >
              {ACTIONS.map((action) => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}
