import fs from 'node:fs'
import path from 'node:path'

import type { SkillSource } from '@shared/types'

import { parseSkillFrontmatter, stripFrontmatter } from './frontmatter'

export interface DiscoveredSkill {
  id: string
  name: string
  description: string
  source: SkillSource
  /** Absolute path to the skill folder. */
  dir: string
  /** Absolute path to the folder's SKILL.md. */
  skillMdPath: string
}

export interface LoadedSkill {
  skill: DiscoveredSkill
  /** The SKILL.md body (instructions) with front-matter stripped. */
  body: string
  /** Names of the other files bundled alongside SKILL.md (scripts, references, assets). */
  files: string[]
}

export interface SkillsManagerOptions {
  /** User-writable skills directory (under userData), shared across workspaces. */
  globalSkillsDir: string
  /** Read-only skills shipped with the app, if present. */
  builtinSkillsDir?: string
}

/**
 * Discovers Agent Skills from the filesystem and reads their instructions on demand.
 * Adapted from OpenCowork's SkillsManager, but standalone: SyncSpace injects skill metadata
 * into its own system prompt and loads bodies via the `use_skill` tool rather than delegating
 * to the Claude Agent SDK. Discovery is stateless (re-scanned per call) -- cheap for the small
 * skill counts expected, and always reflects on-disk edits without a watcher.
 *
 * Precedence on a name collision: project > global > built-in.
 */
export class SkillsManager {
  constructor(private readonly options: SkillsManagerOptions) {}

  getGlobalSkillsDir(): string {
    return this.options.globalSkillsDir
  }

  /** Create the global skills directory if it does not exist, returning its path. */
  ensureGlobalSkillsDir(): string {
    const dir = this.options.globalSkillsDir
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  /** Discover all skills, deduped by name with project > global > built-in precedence. */
  discover(workspaceRoot?: string): DiscoveredSkill[] {
    const byName = new Map<string, DiscoveredSkill>()
    // Scan lowest-precedence first so higher-precedence sources overwrite by name.
    const sources: Array<{ source: SkillSource; dir?: string }> = [
      { source: 'builtin', dir: this.options.builtinSkillsDir },
      { source: 'global', dir: this.options.globalSkillsDir },
      {
        source: 'project',
        dir: workspaceRoot ? path.join(workspaceRoot, '.claude', 'skills') : undefined
      }
    ]

    for (const { source, dir } of sources) {
      if (!dir) continue
      for (const skill of this.scanDir(dir, source)) {
        byName.set(skill.name, skill)
      }
    }

    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  private scanDir(dir: string, source: SkillSource): DiscoveredSkill[] {
    let entries: fs.Dirent[]
    try {
      if (!fs.existsSync(dir)) return []
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }

    const skills: DiscoveredSkill[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillDir = path.join(dir, entry.name)
      const skillMdPath = path.join(skillDir, 'SKILL.md')

      let content: string
      try {
        if (!fs.existsSync(skillMdPath)) continue
        content = fs.readFileSync(skillMdPath, 'utf-8')
      } catch {
        continue
      }

      const meta = parseSkillFrontmatter(content)
      if (!meta) continue

      skills.push({
        id: meta.name,
        name: meta.name,
        description: meta.description,
        source,
        dir: skillDir,
        skillMdPath
      })
    }
    return skills
  }

  /** Load a skill's full instructions + bundled-file listing, or null if not found. */
  readSkill(name: string, workspaceRoot?: string): LoadedSkill | null {
    const skill = this.discover(workspaceRoot).find((candidate) => candidate.name === name)
    if (!skill) return null

    let content: string
    try {
      content = fs.readFileSync(skill.skillMdPath, 'utf-8')
    } catch {
      return null
    }

    let files: string[] = []
    try {
      files = fs.readdirSync(skill.dir).filter((file) => file !== 'SKILL.md')
    } catch {
      // A skill with no extra files is fine.
    }

    return { skill, body: stripFrontmatter(content).trim(), files }
  }
}
