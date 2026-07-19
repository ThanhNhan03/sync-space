import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SkillsManager } from './SkillsManager'

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'sync-skills-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Write a skill folder <baseDir>/<name>/SKILL.md and optional extra files. */
function writeSkill(
  baseDir: string,
  name: string,
  description: string,
  extraFiles: Record<string, string> = {}
): void {
  const dir = path.join(baseDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nInstructions for ${name}.\n`)
  for (const [file, content] of Object.entries(extraFiles)) {
    writeFileSync(path.join(dir, file), content)
  }
}

describe('SkillsManager.discover', () => {
  it('discovers skills from global and built-in directories, sorted by name', () => {
    const globalDir = path.join(root, 'global')
    const builtinDir = path.join(root, 'builtin')
    writeSkill(globalDir, 'zeta', 'Z skill')
    writeSkill(builtinDir, 'alpha', 'A skill')

    const manager = new SkillsManager({ globalSkillsDir: globalDir, builtinSkillsDir: builtinDir })
    const skills = manager.discover()

    expect(skills.map((s) => s.name)).toEqual(['alpha', 'zeta'])
    expect(skills.find((s) => s.name === 'alpha')?.source).toBe('builtin')
    expect(skills.find((s) => s.name === 'zeta')?.source).toBe('global')
  })

  it('lets a project skill override a global/built-in skill of the same name', () => {
    const globalDir = path.join(root, 'global')
    const builtinDir = path.join(root, 'builtin')
    const workspace = path.join(root, 'workspace')
    writeSkill(builtinDir, 'pdf', 'built-in pdf')
    writeSkill(globalDir, 'pdf', 'global pdf')
    writeSkill(path.join(workspace, '.claude', 'skills'), 'pdf', 'project pdf')

    const manager = new SkillsManager({ globalSkillsDir: globalDir, builtinSkillsDir: builtinDir })
    const skills = manager.discover(workspace)

    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({ name: 'pdf', description: 'project pdf', source: 'project' })
  })

  it('ignores directories without a SKILL.md and files with invalid front-matter', () => {
    const globalDir = path.join(root, 'global')
    mkdirSync(path.join(globalDir, 'not-a-skill'), { recursive: true }) // no SKILL.md
    writeFileSync(path.join(globalDir, 'loose.txt'), 'x')
    mkdirSync(path.join(globalDir, 'bad'), { recursive: true })
    writeFileSync(path.join(globalDir, 'bad', 'SKILL.md'), '---\nname: bad\n---\nno description')
    writeSkill(globalDir, 'good', 'a real skill')

    const manager = new SkillsManager({ globalSkillsDir: globalDir })
    expect(manager.discover().map((s) => s.name)).toEqual(['good'])
  })

  it('returns an empty list when directories do not exist', () => {
    const manager = new SkillsManager({ globalSkillsDir: path.join(root, 'missing') })
    expect(manager.discover()).toEqual([])
  })
})

describe('SkillsManager.readSkill', () => {
  it('returns the body (front-matter stripped) and the list of bundled files', () => {
    const globalDir = path.join(root, 'global')
    writeSkill(globalDir, 'pdf', 'Work with PDFs', { 'fill_form.py': 'print("hi")', 'REFERENCE.md': '# ref' })

    const manager = new SkillsManager({ globalSkillsDir: globalDir })
    const loaded = manager.readSkill('pdf')

    expect(loaded).not.toBeNull()
    expect(loaded?.body).toContain('# pdf')
    expect(loaded?.body).not.toContain('---')
    expect(loaded?.files.sort()).toEqual(['REFERENCE.md', 'fill_form.py'])
  })

  it('returns null for an unknown skill', () => {
    const manager = new SkillsManager({ globalSkillsDir: path.join(root, 'global') })
    expect(manager.readSkill('nope')).toBeNull()
  })
})
