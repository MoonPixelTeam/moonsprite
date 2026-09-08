import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'
import { parseCanvasPerformanceOptions } from './canvas-performance-options.mjs'

const options = parseCanvasPerformanceOptions(process.argv.slice(2))

const host = '127.0.0.1'
const port = Number(process.env.MOONSPRITE_PERF_PORT ?? 4175)
const externalUrl = process.env.MOONSPRITE_PERF_URL
const baseUrl = externalUrl ?? `http://${host}:${port}`
const performanceUrl = new URL(baseUrl)
performanceUrl.searchParams.set('moonsprite-perf', '1')
const chromeCandidates = [
  process.env.MOONSPRITE_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean)
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate))

if (!executablePath) throw new Error('未找到可用于画布性能基准的 Chrome 或 Edge。')

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Preview server is still starting.
    }
    await delay(100)
  }
  throw new Error(`画布性能基准无法连接到 ${url}`)
}

function percentile(values, fraction) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]
}

function summarize(label, canvasSize, samples) {
  const frames = samples.frames.filter((duration) => Number.isFinite(duration) && duration > 0)
  const longTasks = samples.longTasks.filter((duration) => Number.isFinite(duration) && duration > 0)
  const draws = samples.draws.filter((duration) => Number.isFinite(duration) && duration >= 0)
  const inputs = samples.inputs.map((sample) => sample.duration).filter((duration) => Number.isFinite(duration) && duration >= 0)
  const rootReactCommits = samples.reactCommits.filter((sample) => sample.region === 'MoonSprite').map((sample) => sample.duration).filter((duration) => Number.isFinite(duration) && duration >= 0)
  const reactByRegion = Object.fromEntries([...new Set(samples.reactCommits.map((sample) => sample.region))].map((region) => {
    const durations = samples.reactCommits.filter((sample) => sample.region === region).map((sample) => sample.duration)
    return [region, { count: durations.length, p95: percentile(durations, 0.95), longest: Math.max(0, ...durations) }]
  }))
  const operationByStage = Object.fromEntries([...new Set(samples.operationStages.map((sample) => sample.stage))].map((stage) => {
    const stageSamples = samples.operationStages.filter((sample) => sample.stage === stage)
    const durations = stageSamples.map((sample) => sample.duration)
    return [stage, {
      count: durations.length,
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      longest: Math.max(0, ...durations),
      detail: stageSamples.at(-1)?.detail ?? {}
    }]
  }))
  return {
    canvasSize,
    scenario: label,
    sampleCount: frames.length,
    p50: percentile(frames, 0.5),
    p95: percentile(frames, 0.95),
    p99: percentile(frames, 0.99),
    over25Percent: frames.length === 0 ? 0 : frames.filter((duration) => duration > 25).length / frames.length * 100,
    longestFrame: Math.max(0, ...frames),
    longestTask: Math.max(0, ...longTasks),
    drawCount: draws.length,
    drawP50: percentile(draws, 0.5),
    drawP95: percentile(draws, 0.95),
    drawP99: percentile(draws, 0.99),
    longestDraw: Math.max(0, ...draws),
    inputCount: inputs.length,
    inputP95: percentile(inputs, 0.95),
    inputP99: percentile(inputs, 0.99),
    longestInput: Math.max(0, ...inputs),
    reactCommitCount: rootReactCommits.length,
    reactCommitP95: percentile(rootReactCommits, 0.95),
    longestReactCommit: Math.max(0, ...rootReactCommits),
    reactByRegion,
    operationByStage
  }
}

async function startFrameProbe(page) {
  await page.evaluate(() => {
    const samples = { frames: [], longTasks: [], draws: [], inputs: [], reactCommits: [], operationStages: [] }
    let lastFrame = 0
    let running = true
    let observer = null
    const tick = (timestamp) => {
      if (!running) return
      if (lastFrame > 0) samples.frames.push(timestamp - lastFrame)
      lastFrame = timestamp
      requestAnimationFrame(tick)
    }
    if ('PerformanceObserver' in window) {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) samples.longTasks.push(entry.duration)
        })
        observer.observe({ entryTypes: ['longtask'] })
      } catch {
        observer = null
      }
    }
    requestAnimationFrame(tick)
    window.__moonSpriteCanvasProbe = {
      recordDraw(duration) {
        samples.draws.push(duration)
      },
      recordInput(kind, duration) {
        samples.inputs.push({ kind, duration })
      },
      recordReactCommit(region, duration, phase) {
        samples.reactCommits.push({ region, duration, phase })
      },
      recordOperationStage(stage, duration, detail = {}) {
        samples.operationStages.push({ stage, duration, detail })
      },
      stop() {
        running = false
        observer?.disconnect()
        return samples
      }
    }
  })
  await page.waitForTimeout(100)
}

async function stopFrameProbe(page) {
  await page.waitForTimeout(180)
  return page.evaluate(() => window.__moonSpriteCanvasProbe.stop())
}

async function createDocument(page, size) {
  await page.goto(performanceUrl.href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('button.start-action.primary-button', { timeout: 30_000 })
  const project = await page.evaluate(async (canvasSize) => {
    const harness = window.__moonSpritePerformanceHarness
    if (!harness) throw new Error('Performance harness is unavailable.')
    return harness.createSimpleDocument(canvasSize)
  }, size)
  await page.waitForSelector('canvas.stage-canvas', { timeout: 30_000 })
  await page.waitForTimeout(300)
  return project
}

async function createComplexDocument(page, size) {
  await page.goto(performanceUrl.href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('button.start-action.primary-button', { timeout: 30_000 })
  const project = await page.evaluate(async (canvasSize) => {
    const harness = window.__moonSpritePerformanceHarness
    if (!harness) throw new Error('Performance harness is unavailable.')
    return harness.createComplexDocument(canvasSize)
  }, size)
  await page.waitForSelector('canvas.stage-canvas', { timeout: 30_000 })
  await page.waitForTimeout(500)
  return project
}

async function createLargeDocument(page, size) {
  await page.goto(performanceUrl.href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('button.start-action.primary-button', { timeout: 30_000 })
  const project = await page.evaluate(async (canvasSize) => {
    const harness = window.__moonSpritePerformanceHarness
    if (!harness) throw new Error('Performance harness is unavailable.')
    return harness.createLargeDocument(canvasSize)
  }, size)
  await page.waitForSelector('canvas.stage-canvas', { timeout: 30_000 })
  await page.waitForTimeout(600)
  return project
}

async function runScenario(page, size, label, action) {
  await startFrameProbe(page)
  await action()
  return summarize(label, size, await stopFrameProbe(page))
}

async function resetSimpleScenario(page, initialView) {
  await page.evaluate((view) => {
    const harness = window.__moonSpritePerformanceHarness
    if (!harness) throw new Error('Performance harness is unavailable.')
    harness.resetScenario(view)
  }, initialView)
  await page.waitForTimeout(50)
}

async function prepareToolScenario(page, initialView, tool, fillKind = null, shapeKind = null) {
  await resetSimpleScenario(page, initialView)
  await page.evaluate(({ activeTool, activeFillKind, activeShapeKind }) => {
    const harness = window.__moonSpritePerformanceHarness
    if (!harness) throw new Error('Performance harness is unavailable.')
    harness.prepareTool(activeTool, activeFillKind, activeShapeKind)
  }, { activeTool: tool, activeFillKind: fillKind, activeShapeKind: shapeKind })
  await page.waitForTimeout(50)
}

async function seedUndoHistory(page, center) {
  await page.keyboard.press('B')
  for (let stroke = 0; stroke < 6; stroke += 1) {
    const y = center.y - 75 + stroke * 24
    await page.mouse.move(center.x - 90, y)
    await page.mouse.down({ button: 'left' })
    await page.mouse.move(center.x + 90, y + 8, { steps: 12 })
    await page.mouse.up({ button: 'left' })
    await page.waitForTimeout(30)
  }
}

async function benchmarkScenarioPage(page, size, scenario) {
  const projectKind = scenario.startsWith('complex-') ? 'complex' : scenario.startsWith('large-') ? 'large' : 'simple'
  const detailView = scenario.startsWith('large-detail-')
  const actionKind = scenario.replace(/^complex-/, '').replace(/^large-(?:detail-)?/, '').replace(/-timelapse$/, '')
  const timelapseEnabled = scenario.endsWith('-timelapse')
  let project = { uniquePixelBytes: size * size * 4, layerCount: 1, frameCount: 1 }
  if (projectKind === 'complex') project = await createComplexDocument(page, size)
  else if (projectKind === 'large') project = await createLargeDocument(page, size)
  else project = await createDocument(page, size)
  const canvas = page.locator('canvas.stage-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error(`无法读取 ${size} x ${size} 画布区域。`)
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const results = []
  const initialView = await page.evaluate(() => {
    const harness = window.__moonSpritePerformanceHarness
    if (!harness) throw new Error('Performance harness is unavailable.')
    return harness.activeView()
  })
  if (projectKind === 'large' && initialView) {
    const overviewZoom = Math.max(0.05, Math.min((box.width - 80) / size, (box.height - 80) / size))
    Object.assign(initialView, { zoom: detailView ? 1 : overviewZoom, panX: 0, panY: 0 })
  }

  if (actionKind === 'pan') {
    if (initialView) await resetSimpleScenario(page, initialView)
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.move(center.x - 90, center.y - 45)
      await page.mouse.down({ button: 'middle' })
      for (let index = 0; index < 72; index += 1) {
        const progress = index / 71
        await page.mouse.move(center.x - 90 + progress * 180, center.y - 45 + Math.sin(progress * Math.PI * 2) * 70)
        await page.waitForTimeout(12)
      }
      await page.mouse.up({ button: 'middle' })
    }))
  }

  if (actionKind === 'zoom') {
    if (initialView) await resetSimpleScenario(page, initialView)
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.move(center.x, center.y)
      for (let index = 0; index < 54; index += 1) {
        await page.mouse.wheel(0, index % 18 < 9 ? -80 : 80)
        await page.waitForTimeout(12)
      }
    }))
  }

  if (actionKind === 'rotated-zoom') {
    if (initialView) await resetSimpleScenario(page, initialView)
    await page.keyboard.press('R')
    const rotationInput = page.locator('.rotate-view-options input')
    await rotationInput.fill('37')
    await rotationInput.press('Enter')
    await page.keyboard.press('Z')
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.move(center.x, center.y)
      for (let index = 0; index < 54; index += 1) {
        await page.mouse.wheel(0, index % 18 < 9 ? -80 : 80)
        await page.waitForTimeout(12)
      }
    }))
  }

  if (actionKind === 'draw') {
    if (initialView) await prepareToolScenario(page, initialView, 'pencil')
    if (timelapseEnabled) await page.evaluate(() => {
      const harness = window.__moonSpritePerformanceHarness
      if (!harness) throw new Error('Performance harness is unavailable.')
      harness.setTimelapseRecording(true)
    })
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.move(center.x - 120, center.y - 70)
      await page.mouse.down({ button: 'left' })
      for (let index = 0; index < 72; index += 1) {
        const progress = index / 71
        await page.mouse.move(center.x - 120 + progress * 240, center.y - 70 + Math.sin(progress * Math.PI * 4) * 95)
        await page.waitForTimeout(12)
      }
      await page.mouse.up({ button: 'left' })
      if (timelapseEnabled) {
        try {
          await page.waitForFunction(() => (window.__moonSpritePerformanceHarness?.timelapseSnapshotCount() ?? 0) > 0, undefined, { timeout: 10_000 })
        } catch (error) {
          throw new Error('Timelapse capture did not finish within 10 seconds.', { cause: error })
        }
      }
    }))
  }

  if (actionKind === 'brush-128-zoom2') {
    if (initialView) {
      Object.assign(initialView, { zoom: 2, panX: 0, panY: 0 })
      await prepareToolScenario(page, initialView, 'pencil')
      await page.evaluate(() => {
        const harness = window.__moonSpritePerformanceHarness
        if (!harness) throw new Error('Performance harness is unavailable.')
        harness.setBrushSize(128)
      })
      await page.waitForTimeout(50)
    }
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.move(center.x - 180, center.y - 80)
      await page.mouse.down({ button: 'left' })
      for (let index = 0; index < 72; index += 1) {
        const progress = index / 71
        await page.mouse.move(center.x - 180 + progress * 360, center.y - 80 + Math.sin(progress * Math.PI * 4) * 95)
        await page.waitForTimeout(12)
      }
      await page.mouse.up({ button: 'left' })
    }))
  }

  if (actionKind === 'shape') {
    if (initialView) await prepareToolScenario(page, initialView, 'shape', null, 'ellipse')
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.move(center.x - 120, center.y - 80)
      await page.mouse.down({ button: 'left' })
      for (let index = 0; index < 48; index += 1) {
        const progress = index / 47
        await page.mouse.move(center.x - 120 + progress * 240, center.y - 80 + progress * 160)
        await page.waitForTimeout(12)
      }
      await page.mouse.up({ button: 'left' })
    }))
  }

  if (actionKind === 'marquee') {
    if (initialView) await prepareToolScenario(page, initialView, 'selection')
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.move(center.x - 120, center.y - 80)
      await page.mouse.down({ button: 'left' })
      for (let index = 0; index < 48; index += 1) {
        const progress = index / 47
        await page.mouse.move(center.x - 120 + progress * 240, center.y - 80 + progress * 160)
        await page.waitForTimeout(12)
      }
      await page.mouse.up({ button: 'left' })
    }))
  }

  if (actionKind === 'bucket-fill') {
    if (initialView) await prepareToolScenario(page, initialView, 'fill', 'bucket')
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.click(center.x, center.y, { button: 'left' })
    }))
  }

  if (actionKind === 'selection-fill') {
    if (initialView) await resetSimpleScenario(page, initialView)
    await page.evaluate(() => {
      const harness = window.__moonSpritePerformanceHarness
      if (!harness) throw new Error('Performance harness is unavailable.')
      harness.prepareCenteredSelection(1024)
    })
    results.push(await runScenario(page, size, scenario, async () => {
      await page.keyboard.press('F')
    }))
  }

  if (actionKind === 'selection-delete') {
    if (initialView) await resetSimpleScenario(page, initialView)
    await page.evaluate((selectionSize) => {
      const harness = window.__moonSpritePerformanceHarness
      if (!harness) throw new Error('Performance harness is unavailable.')
      harness.prepareCenteredSelection(selectionSize)
    }, size)
    results.push(await runScenario(page, size, scenario, async () => {
      await page.keyboard.press('Delete')
    }))
  }

  if (actionKind === 'layer-visibility' || actionKind === 'group-visibility' || actionKind === 'layer-opacity' || actionKind === 'layer-reorder') {
    if (initialView) await resetSimpleScenario(page, initialView)
    await page.waitForTimeout(500)
    results.push(await runScenario(page, size, scenario, async () => {
      await page.evaluate((operation) => {
        const harness = window.__moonSpritePerformanceHarness
        if (!harness) throw new Error('Performance harness is unavailable.')
        if (operation === 'layer-visibility') harness.toggleActiveLayerVisibility()
        else if (operation === 'group-visibility') harness.toggleActiveLayerGroupVisibility()
        else if (operation === 'layer-opacity') harness.previewActiveLayerOpacity(0.5)
        else harness.reorderActiveLayer()
      }, actionKind)
    }))
  }

  if (actionKind === 'layer-style-move') {
    if (initialView) await resetSimpleScenario(page, initialView)
    await page.evaluate(() => {
      const harness = window.__moonSpritePerformanceHarness
      if (!harness) throw new Error('Performance harness is unavailable.')
      harness.prepareActiveLayerStyle(0, 2)
      harness.prepareTool('move')
      harness.setMoveAutoSelect(false)
    })
    await page.waitForTimeout(1_000)
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.move(center.x, center.y)
      await page.mouse.down({ button: 'left' })
      for (let index = 0; index < 8; index += 1) {
        const progress = index / 7
        await page.mouse.move(center.x - 100 + progress * 200, center.y - 60 + progress * 120)
        await page.waitForTimeout(12)
      }
      await page.mouse.up({ button: 'left' })
    }))
  }

  if (actionKind === 'layer-style-shadow-size' || actionKind === 'layer-style-inner-glow-size') {
    if (initialView) await resetSimpleScenario(page, initialView)
    const effect = actionKind === 'layer-style-shadow-size' ? 'shadow' : 'innerGlow'
    await page.evaluate((targetEffect) => {
      const harness = window.__moonSpritePerformanceHarness
      if (!harness) throw new Error('Performance harness is unavailable.')
      harness.prepareActiveLayerStyle(targetEffect === 'shadow' ? 2 : 0, targetEffect === 'innerGlow' ? 2 : 0)
    }, effect)
    await page.waitForTimeout(1_000)
    results.push(await runScenario(page, size, scenario, async () => {
      for (let index = 0; index < 4; index += 1) {
        const value = 2 + index
        await page.evaluate(({ targetEffect, nextValue }) => {
          const harness = window.__moonSpritePerformanceHarness
          if (!harness) throw new Error('Performance harness is unavailable.')
          harness.previewActiveLayerStyleSize(targetEffect, nextValue)
        }, { targetEffect: effect, nextValue: value })
        await page.waitForTimeout(12)
      }
    }))
  }

  if (actionKind === 'gradient') {
    if (initialView) await prepareToolScenario(page, initialView, 'fill', 'gradient')
    results.push(await runScenario(page, size, scenario, async () => {
      await page.mouse.move(center.x - 140, center.y - 90)
      await page.mouse.down({ button: 'left' })
      for (let index = 0; index < 48; index += 1) {
        const progress = index / 47
        await page.mouse.move(center.x - 140 + progress * 280, center.y - 90 + progress * 180)
        await page.waitForTimeout(12)
      }
      await page.mouse.up({ button: 'left' })
    }))
  }

  if (actionKind === 'undo') {
    await seedUndoHistory(page, center)
    results.push(await runScenario(page, size, 'complex-undo', async () => {
      await page.evaluate(async () => {
        const harness = window.__moonSpritePerformanceHarness
        if (!harness) throw new Error('Performance harness is unavailable.')
        const completed = await harness.undoRedo(6)
        if (completed !== 6) throw new Error(`Expected 6 undo/redo operations, completed ${completed}.`)
      })
    }))
  }

  if (actionKind === 'playback') {
    results.push(await runScenario(page, size, 'complex-playback', async () => {
      await page.evaluate(async () => {
        const harness = window.__moonSpritePerformanceHarness
        if (!harness) throw new Error('Performance harness is unavailable.')
        const frames = await harness.playAnimation()
        if (frames < 2) throw new Error(`Expected an animated project, received ${frames} frame.`)
      })
    }))
  }

  if (actionKind === 'playback-pan') {
    if (initialView) await resetSimpleScenario(page, initialView)
    results.push(await runScenario(page, size, 'complex-playback-pan', async () => {
      await page.evaluate(() => {
        const harness = window.__moonSpritePerformanceHarness
        if (!harness) throw new Error('Performance harness is unavailable.')
        harness.setAnimationPlaying(true)
      })
      try {
        await page.waitForTimeout(50)
        await page.mouse.move(center.x - 90, center.y - 45)
        await page.mouse.down({ button: 'middle' })
        for (let index = 0; index < 72; index += 1) {
          const progress = index / 71
          await page.mouse.move(center.x - 90 + progress * 180, center.y - 45 + Math.sin(progress * Math.PI * 2) * 70)
          await page.waitForTimeout(12)
        }
        await page.mouse.up({ button: 'middle' })
      } finally {
        await page.evaluate(() => window.__moonSpritePerformanceHarness?.setAnimationPlaying(false))
      }
    }))
  }

  return results.map((result) => ({ ...result, project: { kind: projectKind, ...project } }))
}

async function benchmarkDocument(browser, size, scenario) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    return await benchmarkScenarioPage(page, size, scenario)
  } finally {
    await context.close().catch(() => undefined)
  }
}

let previewProcess = null
let browser = null
try {
  if (!externalUrl) {
    const buildMode = options.runtime === 'profile' ? 'performance-profile' : 'performance-production'
    previewProcess = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'preview', '--config', 'vite.config.ts', '--mode', buildMode, '--host', host, '--port', String(port), '--strictPort'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      windowsHide: true
    })
  }
  await waitForServer(baseUrl)
  browser = await chromium.launch({ headless: true, executablePath })
  const results = []
  const scenarios = new Set(options.scenarios)
  console.log(`画布性能范围：尺寸 ${options.sizes.join(', ')}；场景 ${options.scenarios.join(', ')}`)
  for (let iteration = 1; iteration <= options.repetitions; iteration += 1) {
    for (const size of options.sizes) {
      for (const scenario of scenarios) {
        const iterationResults = await benchmarkDocument(browser, size, scenario)
        results.push(...iterationResults.map((result) => ({ ...result, iteration })))
      }
    }
  }
  console.table(results.map((result) => ({
    canvas: `${result.canvasSize}x${result.canvasSize}`,
    scenario: result.scenario,
    layers: result.project.layerCount,
    frames: result.project.frameCount,
    pixelMiB: (result.project.uniquePixelBytes / 1024 / 1024).toFixed(1),
    samples: result.sampleCount,
    p50: result.p50.toFixed(2),
    p95: result.p95.toFixed(2),
    p99: result.p99.toFixed(2),
    over25: `${result.over25Percent.toFixed(1)}%`,
    longestFrame: result.longestFrame.toFixed(2),
    longestTask: result.longestTask.toFixed(2),
    drawP95: result.drawP95.toFixed(2),
    longestDraw: result.longestDraw.toFixed(2),
    inputP95: result.inputP95.toFixed(2),
    longestInput: result.longestInput.toFixed(2),
    reactCommits: result.reactCommitCount,
    reactP95: result.reactCommitP95.toFixed(2),
    longestReact: result.longestReactCommit.toFixed(2)
  })))
  const report = { schemaVersion: 1, suite: 'canvas', runtime: options.runtime, createdAt: new Date().toISOString(), results }
  if (options.outputJson) {
    const outputPath = resolve(options.outputJson)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(`画布性能报告已写入 ${outputPath}`)
  }
  console.log(`MOONSPRITE_CANVAS_PERF=${JSON.stringify(report)}`)
} finally {
  await browser?.close().catch(() => undefined)
  if (previewProcess && !previewProcess.killed) previewProcess.kill()
}
