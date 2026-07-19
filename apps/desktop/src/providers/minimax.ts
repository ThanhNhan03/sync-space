import OpenAI from 'openai'

import type { ProviderId } from '@shared/types'

import { OpenAICompatibleProvider } from './openaiCompatible'

// MiniMax's international OpenAI-compatible endpoint. For the China region, override the
// Base URL in Settings with https://api.minimaxi.com/v1.
const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/v1'

/**
 * LLMProvider backed by MiniMax, which exposes an OpenAI-compatible chat completions API --
 * only the base URL and API key differ, so it reuses the shared OpenAI-compatible logic.
 */
export class MiniMaxProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'minimax'
  protected readonly client: OpenAI

  constructor(options: { apiKey: string; baseUrl?: string }) {
    super(options)
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? MINIMAX_DEFAULT_BASE_URL,
    })
  }
}
