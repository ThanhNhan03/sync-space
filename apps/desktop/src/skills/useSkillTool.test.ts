import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ToolContext } from '@tools/Tool'

import { SkillsManager } from './SkillsManager'
import { createUseSkillTool } from './useSkillTool'

const context: ToolContext = { workspaceRoot: '' }
let root: string
let manager: SkillsManager

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'sync-useskill-'))
  const dir = path.join(root, 'pdf')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: pdf\ndescription: Work with PDFs\n---\n\n# PDF\n\nUse pypdf.\n')
  writeFileSync(path.join(dir, 'helper.py'), 'x')
  manager = new SkillsManager({ globalSkillsDir: root })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('createUseSkillTool', () => {
  it('loads a skill body plus its folder path and bundled files', async () => {
    const tool = createUseSkillTool(manager, () => [])
    const result = await tool.execute({ name: 'pdf' }, context)

    expect(result.ok).toBe(true)
    expect(result.content).toContain('Skill: pdf')
    expect(result.content).toContain('Use pypdf.')
    expect(result.content).toContain('helper.py')
    expect(result.content).toContain(path.join(root, 'pdf'))
  })

  it('refuses a disabled skill and lists what is available', async () => {
    const tool = createUseSkillTool(manager, () => ['pdf'])
    const result = await tool.execute({ name: 'pdf' }, context)

    expect(result.ok).toBe(false)
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/not found or disabled/)
  })

  it('errors clearly for an unknown skill name', async () => {
    const tool = createUseSkillTool(manager, () => [])
    const result = await tool.execute({ name: 'nope' }, context)

    expect(result.ok).toBe(false)
    expect(result.content).toContain('Available skills: pdf')
  })

  it('validates that a name argument was provided', async () => {
    const tool = createUseSkillTool(manager, () => [])
    const result = await tool.execute({}, context)

    expect(result.ok).toBe(false)
    expect(result.content).toMatch(/requires a "name"/)
  })
})
