import Anthropic from '@anthropic-ai/sdk'

export interface LocateResult {
  found: boolean
  x?: number
  y?: number
  reason?: string
}

export interface VisionConfig {
  apiKey: string
  baseUrl?: string
  model: string
}

const SYSTEM_PROMPT = `You locate UI elements in screenshots for a computer-use agent. You are given a screenshot and a
description of a target element. Reply with ONLY a JSON object and nothing else:
- If found: {"found": true, "x": <int>, "y": <int>} where x,y are the PIXEL coordinates (origin
  top-left) of the CENTER of the element in the given image.
- If not found: {"found": false, "reason": "<short reason>"}.
Do not add prose, code fences, or explanation.`

/** Extract the first {...} JSON object from model text, tolerating fences/prose. */
function parseLocateJson(text: string): LocateResult {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) {
    return { found: false, reason: 'no JSON in model response' }
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      found?: unknown
      x?: unknown
      y?: unknown
      reason?: unknown
    }
    if (parsed.found === true && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return { found: true, x: Math.round(parsed.x), y: Math.round(parsed.y) }
    }
    return { found: false, reason: typeof parsed.reason === 'string' ? parsed.reason : 'element not found' }
  } catch {
    return { found: false, reason: 'malformed JSON in model response' }
  }
}

// exported for unit testing
export { parseLocateJson }

/**
 * Ask a vision model to locate an element in a screenshot and return its pixel coordinates.
 * Self-contained (its own Anthropic call), mirroring OpenCowork's gui_locate_element so the main
 * agent loop stays text-only — it just gets back coordinates to click.
 */
export async function locateElement(
  pngBase64: string,
  description: string,
  config: VisionConfig
): Promise<LocateResult> {
  const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl })
  const message = await client.messages.create({
    model: config.model,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: pngBase64 }
          },
          { type: 'text', text: `Find this element and give its pixel coordinates: ${description}` }
        ]
      }
    ]
  })

  const textBlock = message.content.find((block) => block.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
  return parseLocateJson(text)
}
