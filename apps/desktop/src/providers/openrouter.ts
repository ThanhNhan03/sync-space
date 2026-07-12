import OpenAI from 'openai'

import type { ProviderId } from '@shared/types'

import { OpenAICompatibleProvider } from './openaiCompatible'

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * LLMProvider backed by OpenRouter, which is wire-compatible with OpenAI's chat
 * completions API -- only the base URL and API key differ.
 */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'openrouter'
  protected readonly client: OpenAI

  constructor(options: { apiKey: string; baseUrl?: string }) {
    super(options)
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL,
    })
  }
}
