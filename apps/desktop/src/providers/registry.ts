import type { ProviderConfig } from '@shared/types'
import type { LLMProvider } from './LLMProvider'
import { OpenAIProvider } from './openai'
import { OpenRouterProvider } from './openrouter'
import { ClaudeProvider } from './claude'
import { GeminiProvider } from './gemini'

/**
 * Instantiates the right LLMProvider for a ProviderConfig. Adding a new provider means
 * writing a class that implements LLMProvider and adding one case here -- the Agent
 * Runner and everything above it stays provider-agnostic.
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  const options = { apiKey: config.apiKey, baseUrl: config.baseUrl }
  switch (config.providerId) {
    case 'openai':
      return new OpenAIProvider(options)
    case 'openrouter':
      return new OpenRouterProvider(options)
    case 'claude':
      return new ClaudeProvider(options)
    case 'gemini':
      return new GeminiProvider(options)
    default: {
      const exhaustiveCheck: never = config.providerId
      throw new Error(`Unknown provider id: ${String(exhaustiveCheck)}`)
    }
  }
}
