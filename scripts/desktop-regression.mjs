import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const executable = join(process.cwd(), 'src-tauri', 'target', 'release', 'moonsprite.exe')
const startupProject = join(process.cwd(), 'src-tauri', 'resources', '示例.moonsprite')
const debugPort = process.env.MOONSPRITE_DESKTOP_DEBUG_PORT ?? '9226'
const userDataDirectory = await mkdtemp(join(tmpdir(), 'moonsprite-desktop-regression-'))
const appDataDirectory = join(userDataDirectory, 'app-data')

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

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

await Promise.all([access(executable), access(startupProject)])

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
let page
try {
  const endpoint = `http://127.0.0.1:${debugPort}`
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      browser = await chromium.connectOverCDP(endpoint)
      break
    } catch {
      await delay(250)
    }
  }
  if (!browser) throw new Error('MoonSprite did not expose a WebView2 debugging endpoint.')

  page = await rendererPage(browser)
  await page.bringToFront()

  await page.waitForFunction(() => Boolean(window.moonSprite), undefined, { timeout: 60_000 })
  await page.locator('.document-tab.active').waitFor({ state: 'visible' })
  const canvas = page.locator('canvas.stage-canvas[aria-label="像素画布"]')
  await canvas.waitFor({ state: 'visible' })
  assert(await page.locator('canvas.stage-selection-overlay').count() === 1, 'Selection overlay was not created.')

  const activeTab = page.locator('.document-tab.active')
  assert(await activeTab.locator('i').count() === 0, 'Startup project unexpectedly began in a dirty state.')
  const releaseDialog = page.locator('.latest-release-modal')
  await releaseDialog.waitFor({ state: 'visible' })
  await releaseDialog.locator('footer button').click()
  await releaseDialog.waitFor({ state: 'hidden' })
  await page.locator('.statusbar').click({ position: { x: 24, y: 8 } })

  const selectTool = async (key, label) => {
    await page.keyboard.press(key)
    await page.waitForFunction((toolLabel) => {
      const button = document.querySelector(`.tool-rail button[aria-label="${toolLabel}"]`)
      return button?.classList.contains('selected') === true
    }, label)
  }

  await selectTool('B', '铅笔工具')
  await selectTool('V', '移动工具')
  await selectTool('R', '旋转视图工具')

  const rotationInput = page.locator('input[aria-label="旋转度数"]')
  await rotationInput.waitFor({ state: 'visible' })
  const canvasAtZeroDegrees = await canvas.screenshot()
  await rotationInput.fill('45')
  await rotationInput.press('Enter')
  await page.waitForFunction(() => document.querySelector('input[aria-label="旋转度数"]')?.value === '45')
  await delay(150)
  const canvasAtFortyFiveDegrees = await canvas.screenshot()
  assert(!canvasAtZeroDegrees.equals(canvasAtFortyFiveDegrees), 'Changing the rotation angle did not redraw the canvas view.')

  await page.keyboard.press('Control+Z')
  assert(await rotationInput.inputValue() === '45', 'Undo incorrectly changed view rotation.')
  assert(await activeTab.locator('i').count() === 0, 'Undo without document history marked the project dirty.')

  await page.keyboard.press('Control+F')
  await page.locator('main.app-shell.advanced-tool-options').waitFor({ state: 'attached' })
  assert(await canvas.isVisible(), 'Canvas disappeared in tool-options advanced mode.')

  await page.keyboard.press('Control+F')
  await page.locator('main.app-shell.advanced-canvas-only').waitFor({ state: 'attached' })
  assert(await canvas.isVisible(), 'Canvas disappeared in canvas-only advanced mode.')

  await page.keyboard.press('Control+F')
  await page.waitForFunction(() => !document.querySelector('main.app-shell')?.classList.contains('advanced-mode'))
  assert(await canvas.isVisible(), 'Canvas did not remain visible after leaving advanced mode.')

  const previewPanel = page.locator('.preview-panel')
  await previewPanel.waitFor({ state: 'visible' })
  await previewPanel.click({ button: 'right', position: { x: 24, y: 12 } })
  const relativeLuminanceItem = page.locator('.workspace-panel-context-menu button').filter({ hasText: '查看相对明暗' })
  await relativeLuminanceItem.waitFor({ state: 'visible' })
  assert(await relativeLuminanceItem.isEnabled(), 'Relative luminance menu command is unexpectedly disabled.')
  await page.keyboard.press('Escape')

  const selectionToolButton = page.locator('.tool-rail button[aria-label="矩形框选工具"]')
  await selectionToolButton.click({ button: 'right' })
  const selectionFlyout = page.locator('.custom-tool-flyout[role="dialog"]')
  await selectionFlyout.waitFor({ state: 'visible' })
  assert(await selectionFlyout.locator('button').count() === 6, 'Selection tool menu is incomplete.')

  console.log('MoonSprite desktop regression test passed.')
} finally {
  if (page && !page.isClosed()) {
    await page.evaluate(() => window.moonSprite?.approveClose()).catch(() => undefined)
  }
  await browser?.close().catch(() => undefined)
  if (!child.killed) child.kill()
  await rm(userDataDirectory, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined)
}
