export type GraphNodeKind =
  | 'file'
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'method'
  | 'enum'
  | 'variable'

export interface GraphNode {
  /** File nodes: relativePath. Symbol nodes: `${relativePath}#${name}` (last-write-wins on
   *  legal same-name collisions like TS overload signatures -- disclosed, not fatal). */
  id: string
  kind: GraphNodeKind
  name: string
  relativePath: string
  startLine?: number
  endLine?: number
  language?: 'typescript' | 'python'
}

export type GraphEdgeKind = 'imports' | 'defines'

export interface GraphEdge {
  fromId: string
  toId: string
  kind: GraphEdgeKind
}

export interface GraphData {
  /** For graph_search's substring scan. */
  allNodes: GraphNode[]
  nodesById: Map<string, GraphNode>
  /** Built once at construction time, not scanned per query. */
  edgesByFromId: Map<string, GraphEdge[]>
  /** Reverse index, for "imported by" lookups. */
  edgesByToId: Map<string, GraphEdge[]>
  /** Import specifiers a file node references that couldn't be resolved to a workspace file
   *  (external packages, or genuinely unresolvable paths) -- surfaced as a disclosed "not
   *  shown" count rather than silently dropped. */
  unresolvedImportsByFileId: Map<string, string[]>
  fileCount: number
  truncated: boolean
  builtAt: number
}

export function createEmptyGraphData(builtAt: number): GraphData {
  return {
    allNodes: [],
    nodesById: new Map(),
    edgesByFromId: new Map(),
    edgesByToId: new Map(),
    unresolvedImportsByFileId: new Map(),
    fileCount: 0,
    truncated: false,
    builtAt
  }
}

function pushIndexed(index: Map<string, GraphEdge[]>, key: string, edge: GraphEdge): void {
  const existing = index.get(key)
  if (existing) {
    existing.push(edge)
  } else {
    index.set(key, [edge])
  }
}

/** Adds a node (last-write-wins on id collision) to the graph being built. */
export function addNode(graph: GraphData, node: GraphNode): void {
  graph.nodesById.set(node.id, node)
  graph.allNodes.push(node)
}

/** Adds an edge and updates both the forward and reverse adjacency indices. */
export function addEdge(graph: GraphData, edge: GraphEdge): void {
  pushIndexed(graph.edgesByFromId, edge.fromId, edge)
  pushIndexed(graph.edgesByToId, edge.toId, edge)
}
