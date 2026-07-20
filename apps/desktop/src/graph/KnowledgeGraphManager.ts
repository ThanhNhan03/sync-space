import { readFile } from 'node:fs/promises'
import { basename, extname, relative, sep } from 'node:path'

import type { KnowledgeGraphStatus } from '@shared/types'

import { addEdge, addNode, createEmptyGraphData, type GraphData, type GraphNode, type GraphNodeKind } from './graphTypes'
import { resolveImportSpecifier } from './importResolver'
import { extractPythonFile, resolvePythonImport } from './pythonExtractor'
import { loadTsconfigPathAliases } from './tsconfigPaths'
import { extractTypeScriptFile } from './typescriptExtractor'
import { collectSourceFiles } from './workspaceWalker'

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'])
const MAX_CACHED_WORKSPACES = 8

interface ExtractedSymbol {
  name: string
  kind: GraphNodeKind
  startLine: number
  endLine: number
}

function toWorkspaceRelative(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join('/')
}

async function buildGraph(workspaceRoot: string): Promise<GraphData> {
  const graph = createEmptyGraphData(Date.now())
  const { files, truncated } = await collectSourceFiles(workspaceRoot)
  graph.truncated = truncated

  const pathAliases = loadTsconfigPathAliases(workspaceRoot)

  for (const absolutePath of files) {
    const relativePath = toWorkspaceRelative(workspaceRoot, absolutePath)
    const extension = extname(absolutePath).toLowerCase()
    const language: GraphNode['language'] = TS_EXTENSIONS.has(extension)
      ? 'typescript'
      : extension === '.py'
        ? 'python'
        : undefined

    addNode(graph, { id: relativePath, kind: 'file', name: basename(absolutePath), relativePath, language })
    graph.fileCount++

    if (!language) continue

    let content: string
    try {
      content = await readFile(absolutePath, 'utf8')
    } catch {
      continue
    }

    let symbols: ExtractedSymbol[]
    let importSpecifiers: string[]
    if (language === 'typescript') {
      const extracted = extractTypeScriptFile(relativePath, content, extension)
      symbols = extracted.symbols
      importSpecifiers = extracted.importSpecifiers
    } else {
      const extracted = extractPythonFile(content)
      symbols = extracted.symbols
      importSpecifiers = extracted.importSpecifiers
    }

    for (const symbol of symbols) {
      const symbolId = `${relativePath}#${symbol.name}`
      addNode(graph, {
        id: symbolId,
        kind: symbol.kind,
        name: symbol.name,
        relativePath,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        language
      })
      addEdge(graph, { fromId: relativePath, toId: symbolId, kind: 'defines' })
    }

    for (const specifier of importSpecifiers) {
      const resolved =
        language === 'typescript'
          ? await resolveImportSpecifier(specifier, relativePath, workspaceRoot, pathAliases)
          : await resolvePythonImport(specifier, relativePath, workspaceRoot)

      if (resolved) {
        addEdge(graph, { fromId: relativePath, toId: resolved, kind: 'imports' })
      } else {
        const existing = graph.unresolvedImportsByFileId.get(relativePath)
        if (existing) {
          existing.push(specifier)
        } else {
          graph.unresolvedImportsByFileId.set(relativePath, [specifier])
        }
      }
    }
  }

  return graph
}

/**
 * Builds and caches a codebase knowledge graph per workspace, lazily on first use. This is
 * the first workspace-keyed in-memory cache in the codebase (no "close workspace" lifecycle
 * hook exists to key eviction off), so the cache is bounded to the most-recently-used
 * MAX_CACHED_WORKSPACES workspaces rather than growing unbounded across a long-running session.
 * Concurrent builds for the same workspace are de-duplicated via `inFlight`; a `generation`
 * counter per workspace guards against a slow, now-superseded build (from before a `rebuild()`
 * call) overwriting the cache with stale data once it finally settles.
 */
export class KnowledgeGraphManager {
  private readonly cache = new Map<string, GraphData>()
  private readonly inFlight = new Map<string, Promise<GraphData>>()
  private readonly generation = new Map<string, number>()

  async ensureBuilt(workspaceRoot: string): Promise<GraphData> {
    const cached = this.cache.get(workspaceRoot)
    if (cached) {
      // Bump to most-recently-used (Map iteration order follows insertion order).
      this.cache.delete(workspaceRoot)
      this.cache.set(workspaceRoot, cached)
      return cached
    }
    const pending = this.inFlight.get(workspaceRoot)
    if (pending) {
      return pending
    }
    return this.startBuild(workspaceRoot)
  }

  /** Forces a fresh walk, ignoring any cached graph -- for the user-triggered "Rebuild" action. */
  async rebuild(workspaceRoot: string): Promise<GraphData> {
    this.cache.delete(workspaceRoot)
    return this.startBuild(workspaceRoot)
  }

  /** Reads the cache only -- never triggers a build, so status checks stay cheap. */
  getStatus(workspaceRoot: string): KnowledgeGraphStatus {
    const graph = this.cache.get(workspaceRoot)
    if (!graph) {
      return { indexed: false }
    }
    let edgeCount = 0
    for (const edges of graph.edgesByFromId.values()) {
      edgeCount += edges.length
    }
    return {
      indexed: true,
      fileCount: graph.fileCount,
      nodeCount: graph.nodesById.size,
      edgeCount,
      truncated: graph.truncated,
      builtAt: graph.builtAt
    }
  }

  private startBuild(workspaceRoot: string): Promise<GraphData> {
    const myGeneration = (this.generation.get(workspaceRoot) ?? 0) + 1
    this.generation.set(workspaceRoot, myGeneration)

    const buildPromise = buildGraph(workspaceRoot)
      .then((graph) => {
        if (this.generation.get(workspaceRoot) === myGeneration) {
          this.storeInCache(workspaceRoot, graph)
        }
        return graph
      })
      .finally(() => {
        if (this.inFlight.get(workspaceRoot) === buildPromise) {
          this.inFlight.delete(workspaceRoot)
        }
      })
    this.inFlight.set(workspaceRoot, buildPromise)
    return buildPromise
  }

  private storeInCache(workspaceRoot: string, graph: GraphData): void {
    this.cache.set(workspaceRoot, graph)
    if (this.cache.size > MAX_CACHED_WORKSPACES) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }
  }
}
