import type { Tool, ToolContext, ToolExecutionResult } from '@tools/Tool'

import type { GraphData, GraphNode, GraphNodeKind } from './graphTypes'
import type { KnowledgeGraphManager } from './KnowledgeGraphManager'

const MAX_SEARCH_RESULTS = 30
const NODE_KINDS: GraphNodeKind[] = ['file', 'function', 'class', 'interface', 'type', 'method', 'enum', 'variable']

function formatNode(node: GraphNode): string {
  const location = node.startLine ? `${node.relativePath}:${node.startLine}` : node.relativePath
  return `${node.id} [${node.kind}] ${node.name} -- ${location}`
}

function parseSearchArgs(args: Record<string, unknown>): { query: string; kind?: GraphNodeKind } {
  const query = args.query
  if (typeof query !== 'string' || query.length === 0) {
    throw new Error('"query" is required and must be a non-empty string')
  }
  let kind: GraphNodeKind | undefined
  if (args.kind !== undefined) {
    if (typeof args.kind !== 'string' || !NODE_KINDS.includes(args.kind as GraphNodeKind)) {
      throw new Error(`"kind" must be one of: ${NODE_KINDS.join(', ')}`)
    }
    kind = args.kind as GraphNodeKind
  }
  return { query, kind }
}

function parseExpandArgs(args: Record<string, unknown>): { nodeId: string } {
  const nodeId = args.nodeId
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    throw new Error('"nodeId" is required and must be a non-empty string')
  }
  return { nodeId }
}

function describeFile(graph: GraphData, fileNode: GraphNode): string {
  const outgoing = graph.edgesByFromId.get(fileNode.id) ?? []
  const defines = outgoing.filter((e) => e.kind === 'defines').map((e) => graph.nodesById.get(e.toId))
  const imports = outgoing.filter((e) => e.kind === 'imports').map((e) => graph.nodesById.get(e.toId))
  const importedBy = (graph.edgesByToId.get(fileNode.id) ?? [])
    .filter((e) => e.kind === 'imports')
    .map((e) => graph.nodesById.get(e.fromId))

  const lines: string[] = [formatNode(fileNode)]

  lines.push(
    defines.length > 0
      ? `Defines:\n${defines.map((n) => (n ? `  ${formatNode(n)}` : '  (unknown)')).join('\n')}`
      : 'Defines: (none)'
  )
  lines.push(
    imports.length > 0
      ? `Imports:\n${imports.map((n) => (n ? `  ${n.relativePath}` : '  (unknown)')).join('\n')}`
      : 'Imports: (none)'
  )
  lines.push(
    importedBy.length > 0
      ? `Imported by:\n${importedBy.map((n) => (n ? `  ${n.relativePath}` : '  (unknown)')).join('\n')}`
      : 'Imported by: (none)'
  )

  // Disclosed rather than silently omitted -- mirrors WorkspaceFilePreview.truncated's
  // "don't silently imply completeness" pattern.
  const unresolved = graph.unresolvedImportsByFileId.get(fileNode.id)
  if (unresolved && unresolved.length > 0) {
    lines.push(`+${unresolved.length} external/unresolved import(s) not shown: ${unresolved.join(', ')}`)
  }

  return lines.join('\n\n')
}

/**
 * `graph_search` / `graph_expand`: navigate a lazily-built, per-workspace codebase knowledge
 * graph (files, functions, classes, ... and their defines/imports relationships) instead of
 * relying only on search_workspace's plain-text grep. No "references"/call-graph edges in v1
 * -- see KnowledgeGraphManager's build pass for what's extracted.
 */
export function createKnowledgeGraphTools(manager: KnowledgeGraphManager): Tool[] {
  const graphSearchTool: Tool = {
    name: 'graph_search',
    description:
      "Searches the workspace's codebase knowledge graph for files, functions, classes, and " +
      'other declarations by name (case-insensitive substring match). Returns node ids usable ' +
      'with graph_expand. Builds the graph lazily on first use for a workspace.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring to match against node names.' },
        kind: { type: 'string', description: 'Optional node kind filter.', enum: NODE_KINDS }
      },
      required: ['query']
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult> {
      try {
        const { query, kind } = parseSearchArgs(args)
        const graph = await manager.ensureBuilt(context.workspaceRoot)
        const needle = query.toLowerCase()

        const matches: GraphNode[] = []
        for (const node of graph.allNodes) {
          if (kind && node.kind !== kind) continue
          if (!node.name.toLowerCase().includes(needle)) continue
          matches.push(node)
          if (matches.length >= MAX_SEARCH_RESULTS) break
        }

        if (matches.length === 0) {
          return { ok: true, content: `No graph nodes found matching "${query}".` }
        }

        const header =
          matches.length >= MAX_SEARCH_RESULTS
            ? `${matches.length} match(es) (results capped at ${MAX_SEARCH_RESULTS}):`
            : `${matches.length} match(es):`
        return { ok: true, content: `${header}\n${matches.map(formatNode).join('\n')}` }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, isError: true, content: `graph_search failed: ${message}` }
      }
    }
  }

  const graphExpandTool: Tool = {
    name: 'graph_expand',
    description:
      'Expands a knowledge-graph node id (from graph_search) into its relationships. For a ' +
      'file node: the symbols it defines, the files it imports, and the files that import it ' +
      'back. For a symbol node: its defining file and line range.',
    schema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'A node id returned by graph_search or graph_expand.' }
      },
      required: ['nodeId']
    },
    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolExecutionResult> {
      try {
        const { nodeId } = parseExpandArgs(args)
        const graph = await manager.ensureBuilt(context.workspaceRoot)
        const node = graph.nodesById.get(nodeId)
        if (!node) {
          return { ok: false, isError: true, content: `No graph node found with id "${nodeId}".` }
        }

        if (node.kind !== 'file') {
          return {
            ok: true,
            content: `${formatNode(node)}\nDefined in ${node.relativePath}:${node.startLine ?? '?'}-${node.endLine ?? '?'}`
          }
        }

        return { ok: true, content: describeFile(graph, node) }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, isError: true, content: `graph_expand failed: ${message}` }
      }
    }
  }

  return [graphSearchTool, graphExpandTool]
}
