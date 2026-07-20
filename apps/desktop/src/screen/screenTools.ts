import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import type { JsonSchema, Tool, ToolExecutionResult } from '@tools/Tool'

import * as input from './windowsInput'
import { locateElement, type VisionConfig } from './visionLocate'

export interface ScreenToolsDeps {
  /** Directory where screenshots are written. */
  screenshotsDir: string
  /** Vision credentials for locate_on_screen, or null if no Claude key is configured. */
  getVisionConfig: () => VisionConfig | null
  /** Monotonic id source for screenshot filenames (injectable for tests). */
  now?: () => number
}

/** All screen-control tool names, so the engine can hide them when the feature is off. */
export const SCREEN_TOOL_NAMES = [
  'screen_capture',
  'screen_info',
  'get_cursor_position',
  'mouse_move',
  'mouse_click',
  'mouse_drag',
  'scroll',
  'type_text',
  'key_press',
  'locate_on_screen'
] as const

function obj(properties: Record<string, JsonSchema>, required: string[], description: string): JsonSchema {
  return { type: 'object', description, properties, required }
}

const ok = (content: string): ToolExecutionResult => ({ ok: true, content })
const fail = (content: string): ToolExecutionResult => ({ ok: false, isError: true, content })

function num(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * Build the screen-interaction ("computer use") tool suite: capture the screen and drive the
 * mouse/keyboard, plus a vision-based locate that returns pixel coordinates to click. Adapted
 * from OpenCowork's gui-operate server; Windows-only (the input layer uses PowerShell/.NET).
 */
export function createScreenTools(deps: ScreenToolsDeps): Tool[] {
  const now = deps.now ?? (() => Date.now())

  const guard = async (run: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult> => {
    try {
      return await run()
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  const captureToFile = async (): Promise<{ path: string; width: number; height: number }> => {
    await mkdir(deps.screenshotsDir, { recursive: true })
    const filePath = path.join(deps.screenshotsDir, `screen-${now()}.png`)
    const size = await input.captureScreen(filePath)
    return { path: filePath, ...size }
  }

  return [
    {
      name: 'screen_capture',
      description:
        'Capture a screenshot of the primary screen and save it to a PNG file. Returns the file path and pixel dimensions. Use before locating or clicking so you act on the current screen state.',
      schema: obj({}, [], 'Capture the primary screen.'),
      execute: () =>
        guard(async () => {
          const shot = await captureToFile()
          return ok(`Saved screenshot to ${shot.path} (${shot.width}x${shot.height} px).`)
        })
    },
    {
      name: 'screen_info',
      description: 'Get the primary screen size in physical pixels.',
      schema: obj({}, [], 'Get the primary screen size.'),
      execute: () =>
        guard(async () => {
          const size = await input.getScreenSize()
          return ok(`Primary screen: ${size.width}x${size.height} px.`)
        })
    },
    {
      name: 'get_cursor_position',
      description: 'Get the current mouse cursor position in pixels.',
      schema: obj({}, [], 'Get the cursor position.'),
      execute: () =>
        guard(async () => {
          const p = await input.getCursorPosition()
          return ok(`Cursor at (${p.x}, ${p.y}).`)
        })
    },
    {
      name: 'mouse_move',
      description: 'Move the mouse cursor to absolute pixel coordinates.',
      schema: obj(
        { x: { type: 'number', description: 'X pixel' }, y: { type: 'number', description: 'Y pixel' } },
        ['x', 'y'],
        'Move the mouse.'
      ),
      execute: (args) =>
        guard(async () => {
          const x = num(args, 'x')
          const y = num(args, 'y')
          if (x === undefined || y === undefined) return fail('mouse_move requires numeric x and y.')
          await input.moveMouse(x, y)
          return ok(`Moved mouse to (${Math.round(x)}, ${Math.round(y)}).`)
        })
    },
    {
      name: 'mouse_click',
      description:
        'Click the mouse. Optionally move to (x, y) first. button: left|right|middle (default left); set double=true for a double-click.',
      schema: obj(
        {
          x: { type: 'number', description: 'Optional X pixel to move to before clicking.' },
          y: { type: 'number', description: 'Optional Y pixel to move to before clicking.' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button.' },
          double: { type: 'boolean', description: 'Double-click when true.' }
        },
        [],
        'Click the mouse.'
      ),
      execute: (args) =>
        guard(async () => {
          const button = (['left', 'right', 'middle'] as const).includes(args.button as input.MouseButton)
            ? (args.button as input.MouseButton)
            : 'left'
          await input.click(num(args, 'x'), num(args, 'y'), button, args.double === true)
          return ok(`${args.double === true ? 'Double-' : ''}${button} click done.`)
        })
    },
    {
      name: 'mouse_drag',
      description: 'Press the left button at (fromX, fromY), drag to (toX, toY), and release.',
      schema: obj(
        {
          fromX: { type: 'number', description: 'Start X' },
          fromY: { type: 'number', description: 'Start Y' },
          toX: { type: 'number', description: 'End X' },
          toY: { type: 'number', description: 'End Y' }
        },
        ['fromX', 'fromY', 'toX', 'toY'],
        'Drag the mouse.'
      ),
      execute: (args) =>
        guard(async () => {
          const a = ['fromX', 'fromY', 'toX', 'toY'].map((k) => num(args, k))
          if (a.some((v) => v === undefined)) return fail('mouse_drag requires numeric fromX, fromY, toX, toY.')
          await input.drag(a[0]!, a[1]!, a[2]!, a[3]!)
          return ok('Drag done.')
        })
    },
    {
      name: 'scroll',
      description: 'Scroll the mouse wheel. direction: up|down (default down); amount is in notches.',
      schema: obj(
        {
          amount: { type: 'number', description: 'Number of wheel notches (default 3).' },
          direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction.' }
        },
        [],
        'Scroll the wheel.'
      ),
      execute: (args) =>
        guard(async () => {
          const magnitude = Math.abs(num(args, 'amount') ?? 3)
          const signed = args.direction === 'up' ? magnitude : -magnitude
          await input.scroll(signed)
          return ok(`Scrolled ${args.direction === 'up' ? 'up' : 'down'} ${magnitude} notch(es).`)
        })
    },
    {
      name: 'type_text',
      description: 'Type literal text into the focused window (click the target first to focus it).',
      schema: obj({ text: { type: 'string', description: 'Text to type.' } }, ['text'], 'Type text.'),
      execute: (args) =>
        guard(async () => {
          const text = typeof args.text === 'string' ? args.text : ''
          if (!text) return fail('type_text requires a non-empty "text" string.')
          await input.typeText(text)
          return ok(`Typed ${text.length} character(s).`)
        })
    },
    {
      name: 'key_press',
      description:
        'Press a key or key-combo using SendKeys syntax: "{ENTER}", "{TAB}", "{ESC}", "^c" (Ctrl+C), "%{F4}" (Alt+F4), "+{TAB}" (Shift+Tab).',
      schema: obj({ keys: { type: 'string', description: 'SendKeys key string.' } }, ['keys'], 'Press keys.'),
      execute: (args) =>
        guard(async () => {
          const keys = typeof args.keys === 'string' ? args.keys : ''
          if (!keys) return fail('key_press requires a non-empty "keys" string.')
          await input.keyPress(keys)
          return ok(`Pressed: ${keys}`)
        })
    },
    {
      name: 'locate_on_screen',
      description:
        'Find a UI element on screen by description and return its pixel coordinates (uses a vision model). Then use mouse_click with those coordinates. Requires a Claude API key in Settings.',
      schema: obj(
        { description: { type: 'string', description: 'What to find, e.g. "the blue Submit button".' } },
        ['description'],
        'Locate an on-screen element.'
      ),
      execute: (args) =>
        guard(async () => {
          const description = typeof args.description === 'string' ? args.description.trim() : ''
          if (!description) return fail('locate_on_screen requires a "description" string.')
          const vision = deps.getVisionConfig()
          if (!vision) {
            return fail('Screen vision needs a Claude API key — add one in Settings → General (Claude provider).')
          }
          const shot = await captureToFile()
          const base64 = await readFile(shot.path, { encoding: 'base64' })
          const result = await locateElement(base64, description, vision)
          if (!result.found) {
            return fail(`Element not found: ${result.reason ?? 'unknown'} (screenshot: ${shot.path})`)
          }
          return ok(
            `Found "${description}" at (${result.x}, ${result.y}) on a ${shot.width}x${shot.height} screen. Use mouse_click with x=${result.x}, y=${result.y}.`
          )
        })
    }
  ]
}
