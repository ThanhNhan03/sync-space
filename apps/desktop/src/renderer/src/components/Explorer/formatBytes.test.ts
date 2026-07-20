import { describe, expect, it } from 'vitest'

import { formatBytes } from './formatBytes'

describe('formatBytes', () => {
  it('formats sub-1024 byte counts as plain bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats kilobytes with one decimal under 10 and none at/above it', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(15 * 1024)).toBe('15 KB')
  })

  it('formats megabytes and gigabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
  })
})
