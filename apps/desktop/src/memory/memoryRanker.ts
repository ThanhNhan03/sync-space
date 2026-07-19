import type { MemoryEntry } from '@shared/types'

/**
 * Lexical relevance scoring for memory retrieval. OpenCowork's default deployment is also
 * lexical-only (embeddings are opt-in there); we keep just that path -- token-overlap
 * normalized by length, matching its `lexicalScore`. No embeddings, no LLM re-ranking.
 */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
}

/** Overlap of query and text tokens, normalized by sqrt(|query| * |text|); 0 when either is empty. */
export function lexicalScore(query: string, text: string): number {
  const queryTokens = new Set(tokenize(query))
  const textTokens = tokenize(text)
  if (queryTokens.size === 0 || textTokens.length === 0) {
    return 0
  }
  let overlap = 0
  for (const token of textTokens) {
    if (queryTokens.has(token)) {
      overlap += 1
    }
  }
  if (overlap === 0) {
    return 0
  }
  return overlap / Math.sqrt(queryTokens.size * textTokens.length)
}

/**
 * Pick the memories most relevant to `query`, capped at `limit`. When there are few enough
 * memories to fit under the cap, all are returned (newest first) so nothing is silently
 * dropped; otherwise they're ranked by lexical score with recency as the tie-breaker.
 */
export function selectRelevant(
  entries: MemoryEntry[],
  query: string,
  limit: number
): MemoryEntry[] {
  const byRecency = [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
  if (byRecency.length <= limit) {
    return byRecency
  }

  return byRecency
    .map((entry) => ({ entry, score: lexicalScore(query, entry.content) }))
    .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt)
    .slice(0, limit)
    .map((ranked) => ranked.entry)
}
