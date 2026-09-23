import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'
import { chromium } from 'playwright'

test('fractional checkerboard navigation has bounded fills and stable tile phase', async () => {
  const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  const src = path => stripTypeScriptTypes(readFileSync(path, 'utf8'))
  const geometry = url(src('src/renderer/src/core/canvas-render-plan.ts').replace(/import\s*\{[^}]*\}\s*from\s*'\.\/view-geometry'\s*;?/, ''))
  const dependencies = { '@/core/grid': url(src('src/renderer/src/core/grid.ts')), '@/core/isometric': url(src('src/renderer/src/core/isometric.ts')), '@/core/canvas-render-plan': geometry }
  const moduleUrl = code => url(Object.entries(dependencies).reduce((s, [key, value]) => s.replace(key, value), stripTypeScriptTypes(code).replace(/import\s*\{\s*\}\s*from\s*['"][^'"]+['"]\s*;?/g, '')))
  const path = 'src/renderer/src/components/canvas-render-background.ts'
  const before = moduleUrl(execFileSync('git', ['show', `35c429b:${path}`], { encoding: 'utf8' }))
  const after = moduleUrl(readFileSync(path, 'utf8'))
  const executablePath = [process.env.MOONSPRITE_CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    const page = await browser.newPage()
    const result = await page.evaluate(async ({ before, after }) => {
      const old = (await import(before)).createCanvasBackground, next = (await import(after)).createCanvasBackground
      const results = []
      for (const zoom of [0.13257905425007252, 0.17, 1, 4.125]) {
        const measurements = {}
        for (const [name, render] of [['before', old], ['after', next]]) {
          const canvas = new OffscreenCanvas(1024, 768), context = canvas.getContext('2d'), tile = { current: null }
          let fills = 0
          const original = context.fillRect.bind(context)
          context.fillRect = (...args) => { fills++; return original(...args) }
          const samples = []
          for (let step = 0; step < 20; step++) {
            const originX = 10 + step, originY = 12 + step
            const boundary = { left: originX, top: originY, width: 4596 * zoom, height: 1767 * zoom }
            const args = { checkerboard: { size: 16, lightColor: { r: 200, g: 200, b: 200 }, darkColor: { r: 150, g: 150, b: 150 } },
              view: { zoom }, repeatCopies: [{ x: 0, y: 0, originX, originY }], canvasBoundaryFor: () => boundary,
              context, clipCanvasCopy: c => { c.beginPath(); c.rect(boundary.left, boundary.top, boundary.width, boundary.height); c.clip() },
              checkerboardTileRef: tile, renderCanvasWidth: boundary.width, renderCanvasHeight: boundary.height,
              viewport: { left: 0, top: 0, right: 1024, bottom: 768 }, document: { width: 4596, height: 1767 },
              deviceScale: { x: 1, y: 1 }, isoViewPreferences: {}, isoGuideTileRef: { current: null } }
            context.clearRect(0, 0, 1024, 768)
            const start = performance.now()
            render(args)
            const pixels = context.getImageData(0, 0, 1024, 768).data
            samples.push(performance.now() - start)
            if (name === 'after') {
              if (!context.imageSmoothingEnabled) throw new Error('Background leaked smoothing state')
              for (const row of [2, 3]) for (const column of [2, 3]) {
                const x = Math.floor(originX + (column + 0.5) * 16 * zoom), y = Math.floor(originY + (row + 0.5) * 16 * zoom)
                const offset = (y * 1024 + x) * 4, expected = (row + column) % 2 ? 150 : 200
                if (pixels[offset] !== expected || pixels[offset + 1] !== expected || pixels[offset + 2] !== expected || pixels[offset + 3] !== 255) {
                  throw new Error(`Checker phase mismatch at zoom ${zoom}, step ${step}, cell ${column},${row}`)
                }
              }
            }
          }
          samples.sort((a, b) => a - b)
          measurements[name] = { fillsPerFrame: fills / 20, medianMs: samples[10], p95Ms: samples[19], tile: tile.current ? [tile.current.canvas.width, tile.current.canvas.height] : null }
        }
        results.push({ zoom, ...measurements })
      }
      return results
    }, { before, after })
    console.log(JSON.stringify(result))
    for (const row of result) { assert.equal(row.after.fillsPerFrame, 2); assert.deepEqual(row.after.tile, [2, 2]) }
  } finally { await browser.close() }
})
