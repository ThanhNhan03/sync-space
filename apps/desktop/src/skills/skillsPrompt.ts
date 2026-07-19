import type { DiscoveredSkill } from './SkillsManager'

/**
 * Build the "Available skills" system-prompt section — the metadata half of progressive
 * disclosure. Only names + descriptions are injected; the model loads a skill's full body
 * with the `use_skill` tool when it decides one is relevant. Returns '' when no skills exist
 * so the base prompt is unchanged.
 */
export function buildSkillsPromptSection(skills: DiscoveredSkill[]): string {
  if (skills.length === 0) {
    return ''
  }

  const lines = skills.map((skill) => `- ${skill.name}: ${skill.description}`)

  return `

## Available skills

You have access to the following skills — packaged expertise for specific tasks. When the
user's request matches a skill's description, call the \`use_skill\` tool with that skill's
name to load its full instructions BEFORE acting. Do not guess a skill's contents; load it
first, then follow it (its folder may contain scripts you run via execute_terminal).

${lines.join('\n')}`
}
