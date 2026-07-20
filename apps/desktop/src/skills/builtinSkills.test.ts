import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { SkillsManager } from './SkillsManager'

// The skills shipped in the app bundle (resources/skills) — packaged via electron-builder
// extraResources and discovered as built-in skills at runtime.
const builtinSkillsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'resources',
  'skills'
)

const EXPECTED = ['conventional-commits', 'docx', 'pdf', 'pptx', 'skill-creator', 'xlsx']

describe('bundled built-in skills', () => {
  it('discovers every shipped skill with a description, tagged as built-in', () => {
    const manager = new SkillsManager({ globalSkillsDir: path.join(builtinSkillsDir, '__none__'), builtinSkillsDir })
    const skills = manager.discover()

    for (const name of EXPECTED) {
      const skill = skills.find((s) => s.name === name)
      expect(skill, `skill "${name}" should be discovered`).toBeDefined()
      expect(skill?.source).toBe('builtin')
      expect(skill?.description.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('can load each shipped skill body', () => {
    const manager = new SkillsManager({ globalSkillsDir: path.join(builtinSkillsDir, '__none__'), builtinSkillsDir })
    for (const name of EXPECTED) {
      const loaded = manager.readSkill(name)
      expect(loaded, `skill "${name}" should load`).not.toBeNull()
      expect(loaded?.body.trim().length ?? 0).toBeGreaterThan(0)
    }
  })
})
