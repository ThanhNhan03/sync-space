/**
 * SKILL.md front-matter parsing. A skill file starts with a YAML block delimited by `---`
 * lines carrying at least `name` and `description`, followed by a markdown body of
 * instructions. Ported from OpenCowork's skills-manager (regex-based, no YAML dependency).
 */

export interface SkillFrontmatter {
  name: string
  description: string
}

/**
 * Reject skill names that aren't safe as a directory name / identifier -- no path
 * separators or parent-directory references. Throws so callers can treat it as invalid.
 */
export function validateSkillName(name: string): void {
  if (!name || /[/\\]|\.\./.test(name)) {
    throw new Error(`Invalid skill name: ${name}`)
  }
}

/** Extract `name`/`description` from a SKILL.md's front-matter, or null if either is missing. */
export function parseSkillFrontmatter(content: string): SkillFrontmatter | null {
  // Limit matching to the YAML block between the leading `---` markers.
  const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const frontMatter = frontMatterMatch ? frontMatterMatch[1] : content

  const nameMatch = frontMatter.match(/name:\s*["']?([^"'\r\n]+)["']?/)
  const descMatch = frontMatter.match(/description:\s*["']?([^"'\r\n]+)["']?/)
  if (!nameMatch || !descMatch) {
    return null
  }

  const name = nameMatch[1].trim()
  try {
    validateSkillName(name)
  } catch {
    return null
  }

  return { name, description: descMatch[1].trim() }
}

/** Return the markdown body after the front-matter block (the skill's actual instructions). */
export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? content.slice(match[0].length) : content
}
