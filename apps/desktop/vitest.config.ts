import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@engine': resolve(__dirname, 'src/engine'),
      '@agent': resolve(__dirname, 'src/agent'),
      '@tools': resolve(__dirname, 'src/tools'),
      '@mcp': resolve(__dirname, 'src/mcp'),
      '@skills': resolve(__dirname, 'src/skills'),
      '@memory': resolve(__dirname, 'src/memory'),
      '@permissions': resolve(__dirname, 'src/permissions'),
      '@providers': resolve(__dirname, 'src/providers'),
      '@database': resolve(__dirname, 'src/database'),
      '@ipc': resolve(__dirname, 'src/ipc')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
