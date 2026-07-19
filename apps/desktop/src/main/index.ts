import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, session, shell } from 'electron'

import { createDatabase } from '@database/db'
import {
  MessagesRepository,
  SessionsRepository,
  SettingsRepository,
  WorkspacesRepository
} from '@database/repositories'
import { SessionManager } from '@engine/SessionManager'
import { SyncSpaceEngine } from '@engine/SyncSpaceEngine'
import { registerIpcHandlers } from '@ipc/handlers'

let mainWindow: BrowserWindow | null = null

/**
 * Whether `url` is the app's own renderer (the dev server origin, or the built
 * index.html) rather than some other site. Electron re-runs the preload script (and so
 * re-exposes window.syncspace, including plaintext provider API keys via getSettings())
 * on every top-level navigation of a BrowserWindow -- an LLM-generated markdown link
 * clicked in the chat (prompt injection is a real risk here) must never be allowed to
 * navigate this window to an attacker page. External links are opened in the OS's
 * default browser instead, via the will-navigate/setWindowOpenHandler guards below.
 */
function isAppUrl(url: string): boolean {
  if (process.env.ELECTRON_RENDERER_URL) {
    return url.startsWith(process.env.ELECTRON_RENDERER_URL)
  }
  return url.startsWith(pathToFileURL(join(__dirname, '../renderer/index.html')).href)
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111217',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

/**
 * Applies a strict CSP to the packaged app only -- Vite's dev server needs inline/eval
 * script for HMR, so this is skipped whenever we're loading from ELECTRON_RENDERER_URL.
 */
function applyProductionCsp(): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    return
  }
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"
        ]
      }
    })
  })
}

app.whenReady().then(() => {
  applyProductionCsp()

  const dbPath = join(app.getPath('userData'), 'syncspace.db')
  const db = createDatabase(dbPath)

  const sessionManager = new SessionManager(
    new SessionsRepository(db),
    new MessagesRepository(db),
    new WorkspacesRepository(db)
  )
  const settingsRepo = new SettingsRepository(db)
  const engine = new SyncSpaceEngine(sessionManager, settingsRepo)

  registerIpcHandlers(engine, () => mainWindow)

  // Tear down MCP child processes / connections cleanly on quit.
  app.on('before-quit', () => {
    void engine.shutdownMcp()
  })

  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
