import { describe, expect, it } from 'vitest'

import { escapeSendKeys } from './windowsInput'

describe('escapeSendKeys', () => {
  it('wraps SendKeys control characters in braces so they are typed literally', () => {
    expect(escapeSendKeys('a+b')).toBe('a{+}b')
    expect(escapeSendKeys('50% (done)')).toBe('50{%} {(}done{)}')
    expect(escapeSendKeys('a^b~c')).toBe('a{^}b{~}c')
    expect(escapeSendKeys('arr[0]')).toBe('arr{[}0{]}')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeSendKeys('Hello world 123')).toBe('Hello world 123')
  })
})
