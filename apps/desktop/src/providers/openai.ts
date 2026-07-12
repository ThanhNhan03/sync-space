import OpenAI from 'openai'

import type { ProviderId } from '@shared/types'

import { OpenAICompatibleProvider } from './openaiCompatible'

/**
 * LLMProvider backed by OpenAI's own hosted API.
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  readonly id: ProviderId = 'openai'
  protected readonly client: OpenAI

  constructor(options: { apiKey: string; baseUrl?: string }) {
    super(options)
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    })
  }
}
