import { describe, expect, it } from 'vitest'

import { extractTypeScriptFile } from './typescriptExtractor'

describe('extractTypeScriptFile', () => {
  it('extracts function, class, interface, type, enum, and const declarations', () => {
    const source = `
export function foo(): void {}
export class Bar {
  method(): void {}
}
export interface Baz {}
export type Qux = string
export enum Color { Red, Green }
export const value = 42
`
    const result = extractTypeScriptFile('example.ts', source, '.ts')

    const byName = new Map(result.symbols.map((s) => [s.name, s.kind]))
    expect(byName.get('foo')).toBe('function')
    expect(byName.get('Bar')).toBe('class')
    expect(byName.get('method')).toBe('method')
    expect(byName.get('Baz')).toBe('interface')
    expect(byName.get('Qux')).toBe('type')
    expect(byName.get('Color')).toBe('enum')
    expect(byName.get('value')).toBe('variable')
  })

  it('extracts import and re-export-from specifiers, ignoring re-exports with no source', () => {
    const source = `
import { a } from './a'
import b from './b'
export { c } from './c'
export * from './d'
export { e }
`
    const result = extractTypeScriptFile('example.ts', source, '.ts')
    expect(result.importSpecifiers.sort()).toEqual(['./a', './b', './c', './d'])
  })

  it('ignores a non-string moduleSpecifier instead of throwing', () => {
    // Not valid per the ES module grammar, but the parser still recovers and produces an
    // ImportDeclaration with a non-string moduleSpecifier expression -- must be guarded, not cast.
    const source = `import x from 123`
    const result = extractTypeScriptFile('example.ts', source, '.ts')
    expect(result.importSpecifiers).toEqual([])
  })

  it('does not throw on a garbage-syntax file', () => {
    const source = '{{{ unclosed ((( export class'
    expect(() => extractTypeScriptFile('garbage.ts', source, '.ts')).not.toThrow()
  })

  it('parses JSX in a .js file without misinterpreting the tags', () => {
    const source = `
export const App = () => {
  return <div className="x">Hello</div>
}
`
    const result = extractTypeScriptFile('App.js', source, '.js')
    const byName = new Map(result.symbols.map((s) => [s.name, s.kind]))
    expect(byName.get('App')).toBe('variable')
  })

  it('parses a .ts legacy angle-bracket cast without misparsing it as JSX', () => {
    const source = `
const value: unknown = 1
export const casted = <string>value
`
    const result = extractTypeScriptFile('cast.ts', source, '.ts')
    const byName = new Map(result.symbols.map((s) => [s.name, s.kind]))
    expect(byName.get('value')).toBe('variable')
    expect(byName.get('casted')).toBe('variable')
  })
})
