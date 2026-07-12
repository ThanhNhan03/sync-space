import type {
  Content,
  FinishReason as FinishReasonType,
  GenerateContentConfig,
  GoogleGenAI as GoogleGenAIType,
  Part,
  Schema,
  Tool as GeminiTool,
  Type as GeminiTypeEnum
} from '@google/genai'
import type { ChatMessage, ProviderId, ToolCallRequest, ToolCallResult } from '@shared/types'
import type { JsonSchema, ToolDefinition } from '@tools/Tool'
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  StopReason,
  StreamChunk
} from './LLMProvider'

/**
 * @google/genai ships ESM-only (its package.json has no "require" export condition), but
 * this main-process bundle is built as CommonJS. A static top-level import compiles down
 * to a require() call and crashes the whole app at startup with ERR_REQUIRE_ESM. Dynamic
 * import() is Node's documented interop path for loading an ESM-only package from CJS, so
 * everything that touches the module's *values* (not just its types) goes through this
 * lazily-cached loader instead of a static import.
 */
type GenAIExports = {
  GoogleGenAI: typeof GoogleGenAIType
  Type: typeof import('@google/genai').Type
  FinishReason: typeof import('@google/genai').FinishReason
}

let genAIExportsPromise: Promise<GenAIExports> | null = null
function loadGenAI(): Promise<GenAIExports> {
  if (!genAIExportsPromise) {
    genAIExportsPromise = import('@google/genai') as unknown as Promise<GenAIExports>
  }
  return genAIExportsPromise
}

export class GeminiProvider implements LLMProvider {
  readonly id: ProviderId = 'gemini'

  private client: GoogleGenAIType | null = null
  private exports: GenAIExports | null = null

  constructor(private readonly config: { apiKey: string; baseUrl?: string }) {}

  private async ensureClient(): Promise<{ client: GoogleGenAIType; exports: GenAIExports }> {
    if (!this.client || !this.exports) {
      const exports = await loadGenAI()
      this.exports = exports
      this.client = new exports.GoogleGenAI({
        apiKey: this.config.apiKey,
        ...(this.config.baseUrl ? { httpOptions: { baseUrl: this.config.baseUrl } } : {})
      })
    }
    return { client: this.client, exports: this.exports }
  }

  // NOTE: confirmed via the @google/genai source (matching the ^0.15.x line pinned in
  // package.json) that FunctionDeclaration.parameters is a `Schema` object whose `type`
  // field is the `Type` enum (uppercase members like "OBJECT"/"STRING"), not a raw JSON
  // Schema string -- there is no `parametersJsonSchema` escape hatch on this SDK version,
  // so our JsonSchema tree must be converted recursively.
  private toGeminiType(exports: GenAIExports, type: string): GeminiTypeEnum {
    switch (type) {
      case 'string':
        return exports.Type.STRING
      case 'number':
        return exports.Type.NUMBER
      case 'integer':
        return exports.Type.INTEGER
      case 'boolean':
        return exports.Type.BOOLEAN
      case 'array':
        return exports.Type.ARRAY
      case 'object':
        return exports.Type.OBJECT
      default:
        return exports.Type.TYPE_UNSPECIFIED
    }
  }

  private convertSchema(exports: GenAIExports, schema: JsonSchema): Schema {
    const result: Schema = {}
    if (schema.type) {
      result.type = this.toGeminiType(exports, schema.type)
    }
    if (schema.description) {
      result.description = schema.description
    }
    if (schema.enum) {
      result.enum = schema.enum.map((value) => String(value))
    }
    if (schema.required) {
      result.required = schema.required
    }
    if (schema.properties) {
      const properties: Record<string, Schema> = {}
      for (const [key, value] of Object.entries(schema.properties)) {
        properties[key] = this.convertSchema(exports, value)
      }
      result.properties = properties
    }
    if (schema.items) {
      result.items = this.convertSchema(exports, schema.items)
    }
    return result
  }

  private buildTools(exports: GenAIExports, tools: ToolDefinition[]): GeminiTool[] {
    if (tools.length === 0) {
      return []
    }
    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: this.convertSchema(exports, tool.schema)
        }))
      }
    ]
  }

  /**
   * Translates our normalized ChatMessage[] history into Gemini's Content[] array.
   * Only 'user' and 'model' roles exist on the wire -- our normalized 'assistant' role
   * maps to 'model', and 'tool' rows become a 'user' role Content carrying
   * functionResponse parts. Confirmed via docs (parallel function calling) that Gemini,
   * like Claude, requires every functionResponse answering one turn's functionCalls to
   * be batched into a SINGLE Content -- so consecutive 'tool' rows are merged the same
   * way Claude's tool_result blocks are. A functionResponse must also carry the
   * function's `name`; since our stored 'tool' ChatMessage only keeps `toolCallId`
   * (referencing the originating ToolCallRequest.id), we track a toolCallId -> name map
   * as we walk assistant messages' toolCalls.
   */
  private buildContents(history: ChatMessage[]): Content[] {
    const contents: Content[] = []
    const toolNameById = new Map<string, string>()
    let i = 0
    while (i < history.length) {
      const msg = history[i]
      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] })
        i++
      } else if (msg.role === 'assistant') {
        const parts: Part[] = []
        if (msg.content) {
          parts.push({ text: msg.content })
        }
        for (const toolCall of msg.toolCalls ?? []) {
          toolNameById.set(toolCall.id, toolCall.name)
          parts.push({
            functionCall: { id: toolCall.id, name: toolCall.name, args: toolCall.arguments }
          })
        }
        contents.push({ role: 'model', parts })
        i++
      } else if (msg.role === 'tool') {
        const parts: Part[] = []
        while (i < history.length && history[i].role === 'tool') {
          const toolMsg = history[i]
          const name = (toolMsg.toolCallId && toolNameById.get(toolMsg.toolCallId)) || 'unknown'
          parts.push({
            functionResponse: {
              id: toolMsg.toolCallId,
              name,
              response: { result: toolMsg.content }
            }
          })
          i++
        }
        contents.push({ role: 'user', parts })
      } else {
        // role 'system' -- represented via config.systemInstruction, not here.
        i++
      }
    }
    return contents
  }

  private buildConfig(exports: GenAIExports, request: CompletionRequest): GenerateContentConfig {
    const config: GenerateContentConfig = {}
    if (request.systemPrompt) {
      config.systemInstruction = request.systemPrompt
    }
    if (request.temperature !== undefined) {
      config.temperature = request.temperature
    }
    const tools = this.buildTools(exports, request.tools)
    if (tools.length > 0) {
      config.tools = tools
    }
    return config
  }

  private mapStopReason(
    exports: GenAIExports,
    finishReason: FinishReasonType | undefined,
    sawToolCall: boolean
  ): StopReason {
    if (sawToolCall) {
      return 'tool_calls'
    }
    if (finishReason === exports.FinishReason.MAX_TOKENS) {
      return 'length'
    }
    return 'stop'
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    try {
      const { client, exports } = await this.ensureClient()

      const streamResult = await client.models.generateContentStream({
        model: request.model,
        contents: this.buildContents(request.messages),
        config: this.buildConfig(exports, request)
      })

      let finishReason: FinishReasonType | undefined
      let sawToolCall = false

      for await (const chunk of streamResult) {
        const text = chunk.text
        if (text) {
          yield { type: 'token', delta: text }
        }

        // Function calls arrive whole within a single chunk on this SDK line --
        // there is no incremental partial-args streaming to accumulate (that is a
        // newer, opt-in feature on later model/SDK generations), so each entry in
        // chunk.functionCalls can be yielded immediately as a complete tool call.
        const calls = chunk.functionCalls
        if (calls) {
          for (const call of calls) {
            sawToolCall = true
            const toolCall: ToolCallRequest = {
              id: call.id ?? crypto.randomUUID(),
              name: call.name ?? '',
              arguments: (call.args ?? {}) as Record<string, unknown>
            }
            yield { type: 'tool_call', toolCall }
          }
        }

        const candidateFinish = chunk.candidates?.[0]?.finishReason
        if (candidateFinish) {
          finishReason = candidateFinish
        }
      }

      yield { type: 'done', stopReason: this.mapStopReason(exports, finishReason, sawToolCall) }
    } catch (error) {
      yield { type: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const { client, exports } = await this.ensureClient()

    const response = await client.models.generateContent({
      model: request.model,
      contents: this.buildContents(request.messages),
      config: this.buildConfig(exports, request)
    })

    const toolCalls: ToolCallRequest[] = (response.functionCalls ?? []).map((call) => ({
      id: call.id ?? crypto.randomUUID(),
      name: call.name ?? '',
      arguments: (call.args ?? {}) as Record<string, unknown>
    }))

    const finishReason = response.candidates?.[0]?.finishReason
    return {
      content: response.text ?? '',
      toolCalls,
      stopReason: this.mapStopReason(exports, finishReason, toolCalls.length > 0)
    }
  }

  toolCall(results: ToolCallResult[], sessionId: string): ChatMessage[] {
    return results.map((result) => ({
      id: crypto.randomUUID(),
      sessionId,
      role: 'tool',
      toolCallId: result.id,
      content: result.content,
      createdAt: Date.now()
    }))
  }
}
