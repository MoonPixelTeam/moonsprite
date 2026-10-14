import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { allowsTauriIpc } from './csp-policy.mjs'

const executable = join(process.cwd(), 'src-tauri', 'target', 'release', 'moonsprite.exe')
const startupProject = join(process.cwd(), 'src-tauri', 'resources', '示例.moonsprite')
const debugPort = '9225'
const temporaryFile = join(tmpdir(), `moonsprite-smoke-${process.pid}.bin`)
const userDataDirectory = await mkdtemp(join(tmpdir(), 'moonsprite-tauri-smoke-'))
const appDataDirectory = join(userDataDirectory, 'app-data')
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const rendererPage = async (browser) => {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      if (!page.url().includes('tauri.localhost')) continue
      if (await page.evaluate(() => Boolean(document.getElementById('root'))).catch(() => false)) return page
    }
    await delay(250)
  }
  const urls = browser.contexts().flatMap((context) => context.pages()).map((page) => page.url()).join(', ')
  throw new Error(`MoonSprite renderer page was not found. Open pages: ${urls}`)
}

await access(executable)
const child = spawn(executable, [startupProject], {
  detached: false,
  stdio: 'ignore',
  env: {
    ...process.env,
    APPDATA: appDataDirectory,
    LOCALAPPDATA: appDataDirectory,
    WEBVIEW2_USER_DATA_FOLDER: userDataDirectory,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`
  }
})

let browser
try {
  const endpoint = `http://127.0.0.1:${debugPort}`
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      browser = await chromium.connectOverCDP(endpoint)
      break
    } catch {
      await delay(250)
    }
  }
  if (!browser) throw new Error('MoonSprite did not expose a WebView2 debugging endpoint.')

  const page = await rendererPage(browser)
  await page.waitForFunction(() => Boolean(window.moonSprite), undefined, { timeout: 60_000 })
  await page.waitForFunction(() => Boolean(document.querySelector('.document-tab')) && !document.querySelector('.aseprite-home'))
  const result = await page.evaluate(async (filePath) => {
    const bytes = new Uint8Array([77, 111, 111, 110])
    await window.moonSprite.writeBinaryAtomic(filePath, bytes)
    const restored = await window.moonSprite.readBinary(filePath)
    const memory = await window.moonSprite.getResourceInfo()
    const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? ''
    return {
      restored: [...restored],
      hasMemory: memory.totalBytes > 0 && memory.freeBytes > 0,
      allowsTauriIpc: allowsTauriIpc(policy)
    }
  }, temporaryFile)
  if (result.restored.join(',') !== '77,111,111,110' || !result.hasMemory || !result.allowsTauriIpc) throw new Error('Tauri IPC bridge or renderer policy is invalid.')
  await page.evaluate(() => window.moonSprite.approveClose())
  console.log('Tauri WebView2 smoke test passed.')
} finally {
  await browser?.close().catch(() => undefined)
  if (!child.killed) child.kill()
  await rm(temporaryFile, { force: true })
  await rm(userDataDirectory, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined)
}
