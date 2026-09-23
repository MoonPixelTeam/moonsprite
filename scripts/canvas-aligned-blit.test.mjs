import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { chromium } from 'playwright'

test('separable blits preserve beta5 device pixels, alpha and crop boundaries', async () => {
  const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  const source = path => stripTypeScriptTypes(readFileSync(path, 'utf8'))
  const geometry = dataUrl(source('src/renderer/src/core/canvas-render-plan.ts')
    .replace(/import\s*\{[^}]*\}\s*from\s*'\.\/view-geometry'\s*;?/, ''))
  const candidate = source('src/renderer/src/components/canvas-composite-cache-blitter.ts')
    .replace('@/core/canvas-render-plan', geometry)
  const reference = candidate.replace('columns.length * rows.length > 4096', 'false')
  const executablePath = [process.env.MOONSPRITE_CHROME_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    const page = await browser.newPage()
    const result = await page.evaluate(async ({ candidate, reference }) => {
      const { CanvasCompositeBlitter: Fast } = await import(candidate)
      const { CanvasCompositeBlitter: Exact } = await import(reference)
      const fast = new Fast(), exact = new Exact()
      const source = new OffscreenCanvas(420, 220), ctx = source.getContext('2d')
      const image = ctx.createImageData(420, 220)
      for (let i = 0; i < image.data.length; i += 4) {
        image.data.set([(i / 4) % 251, Math.floor(i / 1680) % 251, (i / 4) % 2 * 255, [0, 128, 255][(i / 4) % 3]], i)
      }
      ctx.putImageData(image, 0, 0)
      const failures = [], counts = []
      let cases = 0
      const originalDraw = OffscreenCanvasRenderingContext2D.prototype.drawImage
      let calls = 0
      OffscreenCanvasRenderingContext2D.prototype.drawImage = function (...args) { calls++; return originalDraw.apply(this, args) }
      for (const zoom of [1.25, 1.5, 3.13, 4.125, 4.5, 5.25]) for (const scale of [{ x: 1, y: 1 }, { x: 1.25, y: 1.501 }]) for (const pan of [0, -12.37, 0.2]) {
        const a = new OffscreenCanvas(1024, 768), b = new OffscreenCanvas(1024, 768)
        const ac = a.getContext('2d'), bc = b.getContext('2d')
        for (const c of [ac, bc]) { c.imageSmoothingEnabled = false; c.setTransform(scale.x, 0, 0, scale.y, 0, 0) }
        fast.currentDevicePixelRatio = exact.currentDevicePixelRatio = scale
        calls = 0
        fast.drawAlignedPixelRegion(ac, source, pan, pan, zoom, 3, 5, 7, 9, 400, 200)
        const fastCalls = calls
        calls = 0
        exact.drawAlignedPixelRegion(bc, source, pan, pan, zoom, 3, 5, 7, 9, 400, 200)
        const exactCalls = calls
        const aa = ac.getImageData(0, 0, 1024, 768).data, bb = bc.getImageData(0, 0, 1024, 768).data
        let differences = 0
        for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) differences++
        if (differences) failures.push({ zoom, scale, pan, differences })
        counts.push({ zoom, scale, pan, fastCalls, exactCalls })
        cases++
      }
      // Reuse the same scratch after the source is erased: no stale opaque pixels.
      ctx.clearRect(0, 0, source.width, source.height)
      const erased = new OffscreenCanvas(1024, 768), ec = erased.getContext('2d')
      ec.imageSmoothingEnabled = false
      fast.currentDevicePixelRatio = 1
      fast.drawAlignedPixelRegion(ec, source, 0, 0, 4.5, 0, 0, 0, 0, 400, 200)
      const stale = ec.getImageData(0, 0, 1024, 768).data.some(v => v !== 0)
      fast.dispose()
      return { cases, failures, counts, stale }
    }, { candidate: dataUrl(candidate), reference: dataUrl(reference) })
    console.log(JSON.stringify(result))
    assert.deepEqual(result.failures, [])
    assert.equal(result.stale, false)
    for (const sample of result.counts) if (sample.exactCalls > 4096) assert.ok(sample.fastCalls <= 600)
  } finally { await browser.close() }
})

test('aligned viewport reuse preserves exact pixels and makes warm pans one draw', async () => {
  const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  const read = path => stripTypeScriptTypes(readFileSync(path, 'utf8'))
  const geometry = url(read('src/renderer/src/core/canvas-render-plan.ts').replace(/import\s*\{[^}]*\}\s*from\s*'\.\/view-geometry'\s*;?/, ''))
  const blitter = read('src/renderer/src/components/canvas-composite-cache-blitter.ts').replace('@/core/canvas-render-plan', geometry)
  const cache = read('src/renderer/src/components/canvas-aligned-view-cache.ts').replace('@/core/canvas-render-plan', geometry)
  const executablePath = [process.env.MOONSPRITE_CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
  const browser = await chromium.launch({ headless: true, executablePath })
  try {
    const page = await browser.newPage()
    const result = await page.evaluate(async ({ blitter, cache }) => {
      const { CanvasCompositeBlitter } = await import(blitter)
      const { CanvasAlignedViewCache } = await import(cache)
      const source = new OffscreenCanvas(512, 320), sc = source.getContext('2d')
      const pixels = sc.createImageData(512, 320)
      for (let i = 0; i < pixels.data.length; i += 4) pixels.data.set([i % 251, Math.floor(i / 2048) % 251, i % 7 * 30, [0, 128, 255][i % 3]], i)
      sc.putImageData(pixels, 0, 0)
      let bitmap = await createImageBitmap(source)
      const fast = new CanvasAlignedViewCache(), exact = new CanvasCompositeBlitter()
      let draws = 0
      const draw = OffscreenCanvasRenderingContext2D.prototype.drawImage
      OffscreenCanvasRenderingContext2D.prototype.drawImage = function (...args) { draws++; return draw.apply(this, args) }
      const failures = [], warmCalls = [], times = { cached: [], separable: [], beta4: [] }
      for (const zoom of [4.125, 4.5, 5.25]) for (const scale of [{ x: 1, y: 1 }, { x: 1.25, y: 1.501 }]) {
        fast.clear(); exact.currentDevicePixelRatio = scale
        const a = new OffscreenCanvas(1200, 800), b = new OffscreenCanvas(1200, 800)
        const ac = a.getContext('2d'), bc = b.getContext('2d')
        for (const c of [ac, bc]) { c.imageSmoothingEnabled = false; c.setTransform(scale.x, 0, 0, scale.y, 0, 0) }
        for (let step = 0; step < 16; step++) {
          const x = 40 + step, y = 30 + step
          const ox = -(150 + step * 4) / scale.x, oy = -(120 + step * 3) / scale.y
          ac.clearRect(-5000, -5000, 10000, 10000); bc.clearRect(-5000, -5000, 10000, 10000)
          draws = 0
          fast.draw(ac, bitmap, exact, ox, oy, zoom, x, y, 400, 200)
          if (step > 0) warmCalls.push(draws)
          exact.drawAlignedPixelRegion(bc, bitmap, ox, oy, zoom, x, y, x, y, 400, 200)
          const aa = ac.getImageData(0, 0, 1200, 800).data, bb = bc.getImageData(0, 0, 1200, 800).data
          if (aa.some((v, i) => v !== bb[i])) failures.push({ zoom, scale, step })
        }
        // Force raster completion equally for each candidate; timings include readback.
        for (let round = 0; round < 5; round++) for (const mode of ['beta4', 'separable', 'cached']) {
          const start = performance.now()
          for (let i = 0; i < 10; i++) {
            ac.clearRect(-5000, -5000, 10000, 10000)
            const ox = -(150 + i) / scale.x, oy = -120 / scale.y
            if (mode === 'cached') fast.draw(ac, bitmap, exact, ox, oy, zoom, 48, 38, 400, 200)
            else if (mode === 'separable') exact.drawAlignedPixelRegion(ac, bitmap, ox, oy, zoom, 48, 38, 48, 38, 400, 200)
            else ac.drawImage(bitmap, 48, 38, 400, 200, ox + 48 * zoom, oy + 38 * zoom, 400 * zoom, 200 * zoom)
            ac.getImageData(0, 0, 1200, 800)
          }
          times[mode].push((performance.now() - start) / 10)
        }
      }
      sc.clearRect(0, 0, 512, 320)
      const old = bitmap; bitmap = await createImageBitmap(source); old.close()
      const cleared = new OffscreenCanvas(1200, 800), cc = cleared.getContext('2d')
      cc.imageSmoothingEnabled = false; exact.currentDevicePixelRatio = 1
      fast.draw(cc, bitmap, exact, 0, 0, 4.5, 40, 30, 400, 200)
      const stale = cc.getImageData(0, 0, 1200, 800).data.some(v => v !== 0)
      const fractionalAccepted = fast.draw(cc, bitmap, exact, 0.2, 0, 4.5, 40, 30, 400, 200)
      const missingAccepted = fast.draw(cc, undefined, exact, 0, 0, 4.5, 40, 30, 400, 200)
      fast.clear(); exact.dispose(); bitmap.close()
      const median = v => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]
      return { failures, stale, fractionalAccepted, missingAccepted, warmCount: warmCalls.length, maxWarmCalls: Math.max(...warmCalls), medianMs: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, median(v)])) }
    }, { blitter: url(blitter), cache: url(cache) })
    console.log(JSON.stringify(result))
    assert.deepEqual(result.failures, [])
    assert.equal(result.maxWarmCalls, 1)
    assert.equal(result.stale, false)
    assert.equal(result.fractionalAccepted, false)
    assert.equal(result.missingAccepted, false)
  } finally { await browser.close() }
})


test('repeated bitmap pixels, brush rectangles and pointer hits agree without seams', async () => {
  const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  const read = path => stripTypeScriptTypes(readFileSync(path, 'utf8'))
  const geometry = url(read('src/renderer/src/core/canvas-render-plan.ts').replace(/import\s*\{[^}]*\}\s*from\s*'\.\/view-geometry'\s*;?/, ''))
  const blitter = url(read('src/renderer/src/components/canvas-composite-cache-blitter.ts').replace('@/core/canvas-render-plan', geometry))
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
  try {
    const page = await browser.newPage()
    const results = await page.evaluate(async ({ geometry, blitter }) => {
      const g = await import(geometry), { CanvasCompositeBlitter } = await import(blitter)
      const source = new OffscreenCanvas(7, 5), sc = source.getContext('2d')
      for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) { sc.fillStyle = `rgb(${(x + 1) * 25}, ${(y + 1) * 25}, 90)`; sc.fillRect(x, y, 1, 1) }
      const failures = []
      let pixelsChecked = 0
      for (const zoom of [1.25, 1.5, 3.13, 4.5, 8.125]) for (const scale of [{ x: 1, y: 1 }, { x: 1.25, y: 1.501 }]) for (const pan of [-0.37, 0.25]) {
        const base = g.deviceAlignedCanvasPlacement(60 + pan, 60 + pan, 7 * zoom, 5 * zoom, scale)
        const canvas = new OffscreenCanvas(320, 280), c = canvas.getContext('2d'), b = new CanvasCompositeBlitter()
        c.setTransform(scale.x, 0, 0, scale.y, 0, 0); c.imageSmoothingEnabled = false; b.currentDevicePixelRatio = scale
        for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) {
          const copy = g.repeatedDeviceAlignedCanvasRect(base, cx, cy)
          b.drawAlignedPixelRegion(c, source, copy.left, copy.top, zoom, 0, 0, 0, 0, 7, 5)
        }
        const data = c.getImageData(0, 0, canvas.width, canvas.height).data
        const left = Math.round((base.left - base.width) * scale.x), right = Math.round((base.left + 2 * base.width) * scale.x)
        const top = Math.round((base.top - base.height) * scale.y), bottom = Math.round((base.top + 2 * base.height) * scale.y)
        for (let y = Math.max(0, top); y < Math.min(canvas.height, bottom); y++) for (let x = Math.max(0, left); x < Math.min(canvas.width, right); x++) {
          const hit = g.deviceAlignedRepeatedPointAtViewport({ x: (x + 0.5) / scale.x, y: (y + 0.5) / scale.y }, base, 7, 5, zoom, scale, 'both')
          const lx = (hit.x % 7 + 7) % 7, ly = (hit.y % 5 + 5) % 5, index = (y * canvas.width + x) * 4
          if (data[index] !== (lx + 1) * 25 || data[index + 1] !== (ly + 1) * 25 || data[index + 3] !== 255) {
            failures.push({ zoom, scale, pan, x, y, hit, color: Array.from(data.slice(index, index + 4)) }); break
          }
          pixelsChecked++
        }
        b.dispose()
      }
      return { pixelsChecked, failures }
    }, { geometry, blitter })
    console.log(JSON.stringify(results))
    assert.deepEqual(results.failures, [])
    assert.ok(results.pixelsChecked > 10000)
  } finally { await browser.close() }
})
