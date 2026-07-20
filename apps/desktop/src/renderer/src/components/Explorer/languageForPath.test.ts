import { describe, expect, it } from 'vitest'

import { isMarkdownPath, languageForPath } from './languageForPath'

describe('languageForPath', () => {
  it('resolves common extensions to their highlight.js language', () => {
    expect(languageForPath('src/index.ts')).toBe('typescript')
    expect(languageForPath('App.tsx')).toBe('typescript')
    expect(languageForPath('script.py')).toBe('python')
    expect(languageForPath('data.json')).toBe('json')
    expect(languageForPath('README.md')).toBe('markdown')
  })

  it('is case-insensitive on both the extension and the filename', () => {
    expect(languageForPath('Main.PY')).toBe('python')
    expect(languageForPath('DOCKERFILE')).toBe('dockerfile')
  })

  it('resolves extension-less well-known filenames', () => {
    expect(languageForPath('Dockerfile')).toBe('dockerfile')
    expect(languageForPath('Makefile')).toBe('makefile')
  })

  it('handles nested paths using either slash style', () => {
    expect(languageForPath('src/utils/helpers.rs')).toBe('rust')
    expect(languageForPath('src\\utils\\helpers.rs')).toBe('rust')
  })

  it('returns null for unknown or missing extensions', () => {
    expect(languageForPath('notes')).toBeNull()
    expect(languageForPath('archive.tar.gz')).toBeNull()
  })
})

describe('isMarkdownPath', () => {
  it('is true only for markdown files', () => {
    expect(isMarkdownPath('README.md')).toBe(true)
    expect(isMarkdownPath('notes.markdown')).toBe(true)
    expect(isMarkdownPath('index.ts')).toBe(false)
  })
})
