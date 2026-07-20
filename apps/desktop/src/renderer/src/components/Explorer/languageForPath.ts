/** Maps a file extension to the highlight.js language id we register in highlightSetup.ts. */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  xml: 'xml',
  html: 'xml',
  htm: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sql: 'sql',
  md: 'markdown',
  markdown: 'markdown'
}

/** Special-cased filenames (no extension) that still have a known language. */
const FILENAME_TO_LANGUAGE: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile'
}

/** Resolve a path's highlight.js language id, or null when unknown (rendered as plain text). */
export function languageForPath(path: string): string | null {
  const name = (path.split(/[\\/]/).pop() ?? path).toLowerCase()
  if (FILENAME_TO_LANGUAGE[name]) {
    return FILENAME_TO_LANGUAGE[name]
  }
  const dot = name.lastIndexOf('.')
  if (dot === -1) {
    return null
  }
  return EXTENSION_TO_LANGUAGE[name.slice(dot + 1)] ?? null
}

/** Whether a path should be rendered as markdown (rather than as a highlighted code block). */
export function isMarkdownPath(path: string): boolean {
  return languageForPath(path) === 'markdown'
}
