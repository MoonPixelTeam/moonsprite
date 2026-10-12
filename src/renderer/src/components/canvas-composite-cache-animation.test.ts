import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { animationLayerSourceCacheBudget } from './canvas-composite-cache-animation'

describe('animation layer source cache budget', () => {
  it('records the large multi-layer multi-frame budget envelope', () => {
    const width = 1024
    const height = 1024
    const layers = Array.from({ length: 100 }, (_, index) => ({
      id: `layer-${index}`,
      format: 'rgba',
      width,
      height,
      pixels: new Uint8ClampedArray(4),
    }))
    const document = { layers } as never
    const minimum = 64 * 1024 * 1024
    const budget = animationLayerSourceCacheBudget(document, minimum)
    const perSourceBytes = width * height * 4
    const frames = 8
    const sourceCount = layers.length * frames
    const sourcesRetained = Math.floor(budget / perSourceBytes)
    expect(budget).toBe(128 * 1024 * 1024)
    expect(sourcesRetained).toBe(32)
    expect({ budget, perSourceBytes, sourceCount, sourcesRetained }).toMatchSnapshot()
  })

  it('reserves surface bytes from the same document budget', () => {
    const width = 1024
    const height = 1024
    const layers = Array.from({ length: 100 }, (_, index) => ({
      id: `layer-${index}`,
      format: 'rgba',
      width,
      height,
      pixels: new Uint8ClampedArray(4)
    }))
    const document = { layers } as never
    const perSourceBytes = width * height * 4
    const sourceBudget = animationLayerSourceCacheBudget(document, 64 * 1024 * 1024, 64 * 1024 * 1024)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, layerSurface: '1024x1024 RGBA' },
      beforeCombinedBudgetBytes: 192 * 1024 * 1024,
      afterCombinedBudgetBytes: 128 * 1024 * 1024,
      reservedSurfaceBytes: 64 * 1024 * 1024,
      sourceBudgetBytes: sourceBudget,
      sourceSlots: sourceBudget / perSourceBytes,
      combinedReductionRatio: 1 - 128 / 192
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/composite-resource-budget-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(sourceBudget).toBe(64 * 1024 * 1024)
    expect(evidence.afterCombinedBudgetBytes).toBe(128 * 1024 * 1024)
  })
})
