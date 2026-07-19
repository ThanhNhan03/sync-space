/**
 * Minimal stdio MCP server used only by McpManager.integration.test.ts. Exposes one tool
 * whose original name contains a dot ("echo.tool") so the test verifies that McpManager
 * sanitizes and prefixes it (dots are rejected by OpenAI-compatible providers) while still
 * calling the server with the original name.
 */
const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const {
  ListToolsRequestSchema,
  CallToolRequestSchema
} = require('@modelcontextprotocol/sdk/types.js')

const server = new Server(
  { name: 'Echo Server', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'echo.tool',
      description: 'Echoes the provided text.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => ({
  content: [{ type: 'text', text: `echo: ${request.params.arguments?.text ?? ''}` }]
}))

server.connect(new StdioServerTransport())
