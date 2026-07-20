import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = {
  '@shared': resolve(__dirname, 'src/shared')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        ...sharedAlias,
        '@engine': resolve(__dirname, 'src/engine'),
        '@agent': resolve(__dirname, 'src/agent'),
        '@tools': resolve(__dirname, 'src/tools'),
        '@mcp': resolve(__dirname, 'src/mcp'),
        '@skills': resolve(__dirname, 'src/skills'),
        '@memory': resolve(__dirname, 'src/memory'),
        '@permissions': resolve(__dirname, 'src/permissions'),
        '@screen': resolve(__dirname, 'src/screen'),
        '@files': resolve(__dirname, 'src/files'),
        '@compaction': resolve(__dirname, 'src/compaction'),
        '@providers': resolve(__dirname, 'src/providers'),
        '@database': resolve(__dirname, 'src/database'),
        '@ipc': resolve(__dirname, 'src/ipc')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    },
    resolve: {
      alias: sharedAlias
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
