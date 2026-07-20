// Uses highlight.js's core build + selective language registration (rather than the full
// `highlight.js` index, which bundles 190+ languages) to keep the renderer bundle lean. Add a
// language here and to EXTENSION_TO_LANGUAGE in languageForPath.ts together.
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import less from 'highlight.js/lib/languages/less'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const LANGUAGES: Record<string, typeof typescript> = {
  typescript,
  javascript,
  json,
  python,
  ruby,
  go,
  rust,
  java,
  kotlin,
  csharp,
  cpp,
  c,
  php,
  bash,
  powershell,
  yaml,
  xml,
  css,
  scss,
  less,
  sql,
  markdown,
  ini,
  dockerfile,
  makefile
}

let registered = false

/** Register every supported language once, idempotently, and return the shared hljs instance. */
export function ensureHighlightLanguagesRegistered(): typeof hljs {
  if (!registered) {
    for (const [name, language] of Object.entries(LANGUAGES)) {
      hljs.registerLanguage(name, language)
    }
    registered = true
  }
  return hljs
}

/**
 * Sanitize highlight.js output before it's used with dangerouslySetInnerHTML: hljs already
 * HTML-escapes the source tokens it wraps, but a defensive allowlist (only its own <span
 * class="hljs-*"> wrappers survive) costs one regex and removes any doubt for content that
 * came from an arbitrary file in the workspace, not from our own code.
 */
function sanitizeHighlightHtml(html: string): string {
  return html.replace(/<(?!\/?span(?:\s+class="hljs-[^"]*")?\s*\/?>)[^>]*>/g, (match) =>
    match.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  )
}

/** Highlight `code` as `language`, or return null if the language isn't registered/valid. */
export function highlightCode(code: string, language: string): string | null {
  const instance = ensureHighlightLanguagesRegistered()
  if (!instance.getLanguage(language)) {
    return null
  }
  try {
    return sanitizeHighlightHtml(instance.highlight(code, { language }).value)
  } catch {
    return null
  }
}
