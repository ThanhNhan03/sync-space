import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const MAX_BUFFER = 32 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000

export interface Point {
  x: number
  y: number
}
export interface Size {
  width: number
  height: number
}
export type MouseButton = 'left' | 'right' | 'middle'

function assertWindows(): void {
  if (process.platform !== 'win32') {
    throw new Error('Screen control is currently supported on Windows only.')
  }
}

/**
 * Run a PowerShell script via a base64 (UTF-16LE) -EncodedCommand, hidden so it never steals
 * focus from the window being automated. Mirrors OpenCowork's gui-operate Windows path.
 */
async function runPowerShell(script: string, timeout = DEFAULT_TIMEOUT_MS): Promise<string> {
  assertWindows()
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const { stdout } = await execFileAsync(
    'powershell',
    ['-WindowStyle', 'Hidden', '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { timeout, maxBuffer: MAX_BUFFER, windowsHide: true }
  )
  return stdout
}

// Shared C# P/Invoke surface: DPI awareness + cursor + synthetic mouse input. Making the process
// DPI-aware keeps SetCursorPos / screenshot coordinates in the same physical-pixel space.
const USER32 = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, IntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@
[Win32]::SetProcessDPIAware() | Out-Null
`

const MOUSE_FLAGS: Record<MouseButton, { down: string; up: string }> = {
  left: { down: '0x0002', up: '0x0004' },
  right: { down: '0x0008', up: '0x0010' },
  middle: { down: '0x0020', up: '0x0040' }
}

function escapePsPath(p: string): string {
  return p.replace(/'/g, "''")
}

/** Capture the primary screen to a PNG file; returns its physical-pixel dimensions. */
export async function captureScreen(outputPath: string): Promise<Size> {
  const script = `${USER32}
$w = [Win32]::GetSystemMetrics(0)
$h = [Win32]::GetSystemMetrics(1)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(0, 0, 0, 0, [System.Drawing.Size]::new($w, $h))
$bmp.Save('${escapePsPath(outputPath)}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("OK " + $w + " " + $h)
`
  const out = await runPowerShell(script)
  const match = out.match(/OK\s+(\d+)\s+(\d+)/)
  if (!match) {
    throw new Error(`Screenshot failed: ${out.trim() || 'no output'}`)
  }
  return { width: Number(match[1]), height: Number(match[2]) }
}

export async function getScreenSize(): Promise<Size> {
  const out = await runPowerShell(`${USER32}
Write-Output ([Win32]::GetSystemMetrics(0).ToString() + " " + [Win32]::GetSystemMetrics(1).ToString())
`)
  const [w, h] = out.trim().split(/\s+/).map(Number)
  return { width: w, height: h }
}

export async function getCursorPosition(): Promise<Point> {
  const out = await runPowerShell(`${USER32}
$p = New-Object Win32+POINT
[Win32]::GetCursorPos([ref]$p) | Out-Null
Write-Output ($p.X.ToString() + " " + $p.Y.ToString())
`)
  const [x, y] = out.trim().split(/\s+/).map(Number)
  return { x, y }
}

export async function moveMouse(x: number, y: number): Promise<void> {
  await runPowerShell(`${USER32}
[Win32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null
`)
}

export async function click(
  x: number | undefined,
  y: number | undefined,
  button: MouseButton = 'left',
  double = false
): Promise<void> {
  const flags = MOUSE_FLAGS[button]
  const move =
    x !== undefined && y !== undefined
      ? `[Win32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null; Start-Sleep -Milliseconds 40`
      : ''
  const one = `[Win32]::mouse_event(${flags.down}, 0, 0, 0, [IntPtr]::Zero); [Win32]::mouse_event(${flags.up}, 0, 0, 0, [IntPtr]::Zero)`
  const clicks = double ? `${one}; Start-Sleep -Milliseconds 60; ${one}` : one
  await runPowerShell(`${USER32}
${move}
${clicks}
`)
}

export async function drag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  await runPowerShell(`${USER32}
[Win32]::SetCursorPos(${Math.round(fromX)}, ${Math.round(fromY)}) | Out-Null
Start-Sleep -Milliseconds 60
[Win32]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 60
[Win32]::SetCursorPos(${Math.round(toX)}, ${Math.round(toY)}) | Out-Null
Start-Sleep -Milliseconds 60
[Win32]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
`)
}

/** Scroll the mouse wheel. Positive `amount` scrolls up, negative scrolls down (in notches). */
export async function scroll(amount: number): Promise<void> {
  const delta = Math.round(amount) * 120 // WHEEL_DELTA per notch
  await runPowerShell(`${USER32}
[Win32]::mouse_event(0x0800, 0, 0, [uint32]${delta >>> 0}, [IntPtr]::Zero)
`)
}

/** SendKeys treats these as control characters; typing them literally requires wrapping in {}. */
function escapeSendKeys(text: string): string {
  return text.replace(/[+^%~(){}[\]]/g, '{$&}')
}

/** Type literal text into the focused window (click to focus first). */
export async function typeText(text: string): Promise<void> {
  const b64 = Buffer.from(text, 'utf16le').toString('base64')
  // Decode inside PowerShell to avoid quoting/escaping pitfalls, then SendKeys the escaped form.
  await runPowerShell(`${USER32}
$raw = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${b64}'))
$escaped = [System.Text.RegularExpressions.Regex]::Replace($raw, '[+^%~(){}\\[\\]]', '{$0}')
[System.Windows.Forms.SendKeys]::SendWait($escaped)
`)
}

/**
 * Press a key or key-combo using SendKeys syntax, e.g. "{ENTER}", "{TAB}", "^c" (Ctrl+C),
 * "%{F4}" (Alt+F4), "+{TAB}" (Shift+Tab).
 */
export async function keyPress(keys: string): Promise<void> {
  const b64 = Buffer.from(keys, 'utf16le').toString('base64')
  await runPowerShell(`${USER32}
$k = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${b64}'))
[System.Windows.Forms.SendKeys]::SendWait($k)
`)
}

export { escapeSendKeys }
