import type { JsonSchema, Tool, ToolExecutionResult } from '@tools/Tool'

import type { SkillsManager } from './SkillsManager'

const schema: JsonSchema = {
  type: 'object',
  description: 'Load the full instructions for a named skill from the Available skills list.',
  properties: {
    name: {
      type: 'string',
      description: 'The exact skill name to load (as shown in the Available skills list).'
    }
  },
  required: ['name']
}

/**
 * The `use_skill` tool -- the loading half of progressive disclosure. It returns a skill's
 * full SKILL.md body plus the absolute path to its folder (whose bundled scripts the model
 * can run via execute_terminal). Skills are re-discovered per call against the run's
 * workspace, and disabled skills are refused, so the tool always reflects current settings.
 */
export function createUseSkillTool(
  manager: SkillsManager,
  getDisabledIds: () => string[]
): Tool {
  return {
    name: 'use_skill',
    description:
      "Load a skill's full instructions by name before performing a task it covers. Returns the skill guide and the absolute path to its folder; run any bundled scripts from that folder via execute_terminal.",
    schema,

    async execute(args, context): Promise<ToolExecutionResult> {
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      if (!name) {
        return { ok: false, isError: true, content: 'use_skill requires a "name" string argument.' }
      }

      const disabled = new Set(getDisabledIds())
      const loaded = manager.readSkill(name, context.workspaceRoot)
      if (!loaded || disabled.has(loaded.skill.id)) {
        const available = manager
          .discover(context.workspaceRoot)
          .filter((skill) => !disabled.has(skill.id))
          .map((skill) => skill.name)
        return {
          ok: false,
          isError: true,
          content: `Skill "${name}" not found or disabled. Available skills: ${
            available.join(', ') || '(none)'
          }`
        }
      }

      const filesLine =
        loaded.files.length > 0 ? `Files in this skill folder: ${loaded.files.join(', ')}\n` : ''
      const content = `Skill: ${loaded.skill.name}\nFolder: ${loaded.skill.dir}\n${filesLine}\n${loaded.body}`
      return { ok: true, content }
    }
  }
}
