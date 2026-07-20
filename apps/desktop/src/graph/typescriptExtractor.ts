import * as ts from 'typescript'
import type { GraphNodeKind } from './graphTypes'

export interface ExtractedSymbol {
  name: string
  kind: GraphNodeKind
  startLine: number
  endLine: number
}

export interface TypeScriptExtractionResult {
  symbols: ExtractedSymbol[]
  importSpecifiers: string[]
}

const EMPTY_RESULT: TypeScriptExtractionResult = { symbols: [], importSpecifiers: [] }

/**
 * .ts/.mts/.cts keep the non-JSX grammar so legacy angle-bracket casts (`<Foo>value`) parse
 * correctly. .js/.jsx/.mjs/.cjs use the JSX-tolerant grammar -- it parses plain JS identically
 * but also tolerates JSX syntax, which is common in older non-TS React code this feature will
 * encounter in arbitrary opened workspaces.
 */
function scriptKindForExtension(extension: string): ts.ScriptKind {
  switch (extension) {
    case '.ts':
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS
    case '.tsx':
      return ts.ScriptKind.TSX
    default:
      return ts.ScriptKind.JSX
  }
}

/**
 * Extracts top-level declarations and static import/export specifiers from a single
 * TypeScript/JavaScript file. Pure and self-contained: never throws (pathological input can
 * overflow the parser's recursive-descent call stack -- a real RangeError, not a syntax
 * diagnostic -- so one bad file never aborts a whole workspace build) and never touches the
 * filesystem.
 *
 * Deliberately out of scope: dynamic `import()` calls and `export default <expr>` for
 * non-declaration defaults -- both would require walking into arbitrary nested expression
 * positions rather than just top-level statements.
 */
export function extractTypeScriptFile(
  relativePath: string,
  sourceText: string,
  extension: string
): TypeScriptExtractionResult {
  try {
    return extract(relativePath, sourceText, extension)
  } catch {
    return EMPTY_RESULT
  }
}

function extract(relativePath: string, sourceText: string, extension: string): TypeScriptExtractionResult {
  const scriptKind = scriptKindForExtension(extension)
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, false, scriptKind)

  const symbols: ExtractedSymbol[] = []
  const importSpecifiers: string[] = []

  function lineOf(pos: number): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1
  }

  function addSymbol(name: string, kind: GraphNodeKind, node: ts.Node): void {
    symbols.push({
      name,
      kind,
      startLine: lineOf(node.getStart(sourceFile)),
      endLine: lineOf(node.getEnd())
    })
  }

  function collectImportSpecifier(moduleSpecifier: ts.Expression | undefined): void {
    // moduleSpecifier is typed Expression, not StringLiteral -- a malformed
    // `import x from 123` still parses (error recovery) and must not be blindly cast.
    if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
      importSpecifiers.push(moduleSpecifier.text)
    }
  }

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addSymbol(node.name.text, 'function', node)
    } else if (ts.isClassDeclaration(node)) {
      if (node.name) {
        addSymbol(node.name.text, 'class', node)
      }
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
          addSymbol(member.name.text, 'method', member)
        }
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      addSymbol(node.name.text, 'interface', node)
    } else if (ts.isTypeAliasDeclaration(node)) {
      addSymbol(node.name.text, 'type', node)
    } else if (ts.isEnumDeclaration(node)) {
      addSymbol(node.name.text, 'enum', node)
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          addSymbol(declaration.name.text, 'variable', declaration)
        }
      }
    } else if (ts.isImportDeclaration(node)) {
      collectImportSpecifier(node.moduleSpecifier)
    } else if (ts.isExportDeclaration(node)) {
      // Only `export {...} from '...'` / `export * from '...'` carry a moduleSpecifier;
      // a plain `export { x }` re-export has none and collectImportSpecifier no-ops on it.
      collectImportSpecifier(node.moduleSpecifier)
    }
  })

  return { symbols, importSpecifiers }
}
