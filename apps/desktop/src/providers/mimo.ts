import OpenAI from 'openai'

import type { ProviderId } from '@shared/types'

import { OpenAICompatibleProvider } from './openaiCompatible'

// Xiaomi MiMo's OpenAI-compatible endpoint. Verify this against your MiMo dashboard and, if it
// differs, override it in Settings → General → Base URL (the config's baseUrl wins over this).
const MIMO_DEFAULT_BASE_URL = 'https://api.xiaomi.com/mimo/v1'

/**
 * LLMProvider backed by Xiaomi MiMo, which exposes an OpenAI-compatible chat completions API --
 * only the base URL and API key differ, so it reuses the shared OpenAI-compatible logic.
 */
export class MiMoProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'mimo'
  protected readonly client: OpenAI

  constructor(options: { apiKey: string; baseUrl?: string }) {
    super(options)
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? MIMO_DEFAULT_BASE_URL,
    })
  }
}
