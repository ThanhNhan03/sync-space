import { randomUUID } from 'node:crypto'

import type { ChatMessage, MemoryCategory, MemoryEntry } from '@shared/types'
import type { MemoriesRepository } from '@database/repositories'
import type { LLMProvider } from '@providers/LLMProvider'

import { selectRelevant } from './memoryRanker'
import {
  MEMORY_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  buildMemoryPromptSection
} from './memoryPrompt'
import { parseMemoryActions, transcriptFromMessages, type MemoryAction } from './memoryExtractor'

/** Max memories injected into a single run's prompt (relevance-ranked when over this). */
const PROMPT_INJECTION_CAP = 30

export interface AddMemoryInput {
  workspaceRoot: string
  category: MemoryCategory
  content: string
  source: MemoryEntry['source']
  sessionId?: string
}

/**
 * Orchestrates long-term memory: injects relevant memories into a run, and after a run
 * extracts durable facts via the session's own LLM provider. Adapted from OpenCowork's
 * MemoryService, slimmed to the core tier (SQLite storage, lexical retrieval, single
 * extraction pass -- no embeddings, no experience-chunk navigator).
 */
export class MemoryManager {
  constructor(
    private readonly repo: MemoriesRepository,
    private readonly isEnabled: () => boolean
  ) {}

  /** Build the system-prompt section of memories relevant to `query`, or '' when disabled/empty. */
  getPromptSection(workspaceRoot: string, query: string): string {
    if (!this.isEnabled()) {
      return ''
    }
    const relevant = selectRelevant(this.repo.listForScope(workspaceRoot), query, PROMPT_INJECTION_CAP)
    return buildMemoryPromptSection(relevant)
  }

  /**
   * Extract durable facts from a finished conversation and reconcile them into storage.
   * Best-effort: any failure (provider error, malformed output) is swallowed so memory never
   * affects the chat. Intended to be called fire-and-forget after a run completes.
   */
  async extract(
    provider: LLMProvider,
    model: string,
    workspaceRoot: string,
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<void> {
    if (!this.isEnabled()) {
      return
    }
    const transcript = transcriptFromMessages(messages)
    if (!transcript.trim()) {
      return
    }

    const existing = this.repo.listForScope(workspaceRoot)
    const userPrompt = buildExtractionUserPrompt(existing, transcript)

    const result = await provider.complete({
      model,
      temperature: 0,
      systemPrompt: MEMORY_EXTRACTION_SYSTEM_PROMPT,
      messages: [
        { id: `mem-${randomUUID()}`, sessionId, role: 'user', content: userPrompt, createdAt: Date.now() }
      ],
      tools: []
    })

    const actions = parseMemoryActions(result.content)
    this.applyActions(workspaceRoot, sessionId, actions)
  }

  /** Apply reconciliation actions, guarding that update/delete only touch in-scope memories. */
  private applyActions(workspaceRoot: string, sessionId: string, actions: MemoryAction[]): void {
    const inScope = (entry: MemoryEntry | undefined): boolean =>
      entry !== undefined && (entry.workspaceRoot === workspaceRoot || entry.workspaceRoot === '')

    for (const action of actions) {
      if (action.op === 'add') {
        this.add({
          workspaceRoot,
          category: action.category,
          content: action.content,
          source: 'auto',
          sessionId
        })
      } else if (action.op === 'update') {
        if (inScope(this.repo.getById(action.id))) {
          this.repo.updateContent(action.id, action.content, Date.now())
        }
      } else if (action.op === 'delete') {
        if (inScope(this.repo.getById(action.id))) {
          this.repo.delete(action.id)
        }
      }
    }
  }

  add(input: AddMemoryInput): MemoryEntry {
    const now = Date.now()
    return this.repo.add({
      id: `mem-${randomUUID()}`,
      workspaceRoot: input.workspaceRoot,
      category: input.category,
      content: input.content,
      source: input.source,
      sessionId: input.sessionId,
      createdAt: now,
      updatedAt: now
    })
  }

  list(workspaceRoot?: string): MemoryEntry[] {
    return workspaceRoot ? this.repo.listForScope(workspaceRoot) : this.repo.listAll()
  }

  delete(id: string): void {
    this.repo.delete(id)
  }

  clear(workspaceRoot?: string): number {
    return workspaceRoot ? this.repo.clearForScope(workspaceRoot) : this.repo.clearAll()
  }
}
