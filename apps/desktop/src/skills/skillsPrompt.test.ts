import { describe, expect, it } from 'vitest'

import { buildSkillsPromptSection } from './skillsPrompt'
import type { DiscoveredSkill } from './SkillsManager'

function skill(name: string, description: string): DiscoveredSkill {
  return { id: name, name, description, source: 'builtin', dir: `/skills/${name}`, skillMdPath: `/skills/${name}/SKILL.md` }
}

describe('buildSkillsPromptSection', () => {
  it('returns an empty string when there are no skills (leaves the base prompt unchanged)', () => {
    expect(buildSkillsPromptSection([])).toBe('')
  })

  it('lists each skill by name and description and mentions the use_skill tool', () => {
    const section = buildSkillsPromptSection([
      skill('pdf', 'Work with PDFs.'),
      skill('xlsx', 'Work with spreadsheets.')
    ])
    expect(section).toContain('## Available skills')
    expect(section).toContain('use_skill')
    expect(section).toContain('- pdf: Work with PDFs.')
    expect(section).toContain('- xlsx: Work with spreadsheets.')
  })
})
