import { describe, expect, it } from 'vitest'

import { parseLocateJson } from './visionLocate'

describe('parseLocateJson', () => {
  it('parses a found result with integer coordinates', () => {
    expect(parseLocateJson('{"found": true, "x": 100, "y": 200}')).toEqual({ found: true, x: 100, y: 200 })
  })

  it('rounds fractional coordinates', () => {
    expect(parseLocateJson('{"found": true, "x": 100.6, "y": 199.2}')).toEqual({ found: true, x: 101, y: 199 })
  })

  it('tolerates code fences and surrounding prose', () => {
    const text = 'Here you go:\n```json\n{"found": true, "x": 5, "y": 6}\n```'
    expect(parseLocateJson(text)).toEqual({ found: true, x: 5, y: 6 })
  })

  it('returns not-found with the reason', () => {
    expect(parseLocateJson('{"found": false, "reason": "no such button"}')).toEqual({
      found: false,
      reason: 'no such button'
    })
  })

  it('treats missing/invalid coordinates as not found', () => {
    expect(parseLocateJson('{"found": true, "x": "nope"}').found).toBe(false)
  })

  it('returns not-found for non-JSON output', () => {
    expect(parseLocateJson('I could not find it').found).toBe(false)
  })
})
