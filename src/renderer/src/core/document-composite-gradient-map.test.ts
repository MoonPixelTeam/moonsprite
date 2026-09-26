import { expect, it } from 'vitest'
import { createDocument, createLayer, createLayerMask } from './document-model'
import { compositeRegion } from './document-composite-region'
import { compileCompositePointSampler } from './document-composite-sampling'
import { compositeGradientMapRegion } from './document-composite-gradient-map'
import { createDefaultLayerStyles } from './layer-styles'
import { normalizeGradientMap } from './gradient-map'
import { ensureAnimationDocument } from './animation'
import { DocumentCompositeCache } from './document-composite-cache'

function scene(width: number, height: number) {
  const document = createDocument('gradient performance', width, height, 'rgba')
  const source = document.layers[0]
  for (let i = 0; i < source.pixels.length; i += 4) source.pixels.set([i % 251, (i * 3) % 255, 80, i % 7 ? 255 : 128], i)
  const adjustment = createLayer('Map', 1, 1, 'rgba')
  adjustment.kind = 'adjustment'
  adjustment.adjustment = { kind: 'gradient-map', enabled: true, gradientMap: normalizeGradientMap({ reverse: true }) }
  document.layers.push(adjustment)
  return { document, source, adjustment }
}
const reference = (document: ReturnType<typeof createDocument>, x = 0, y = 0, width = document.width, height = document.height) => {
  const sample = compileCompositePointSampler(document)
  const result = new Uint8ClampedArray(width * height * 4)
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const color = sample(x + px, y + py, undefined)
    result.set([color.r, color.g, color.b, color.a], (py * width + px) * 4)
  }
  return result
}

it('matches the reference for scoped groups, opacity, dither, masks and layer styles', () => {
  const { document, source, adjustment } = scene(17, 9)
  document.groups.push({ id: 'g', name: 'Group', visible: true, locked: false, opacity: 0.6, blendMode: 'normal' })
  source.groupId = adjustment.groupId = 'g'
  adjustment.opacity = 0.4
  adjustment.adjustment!.gradientMap.dither = 'bayer-4'
  const timeline = ensureAnimationDocument(document)
  const mask = createLayerMask(adjustment.id, 17, 9)
  for (let i = 0; i < mask.pixels.length; i += 4) mask.pixels.set([i % 255, 0, 0, 255], i)
  timeline.layerMasks = [{ layerId: adjustment.id, frameId: timeline.activeFrameId, mask }]
  expect(compositeGradientMapRegion(document, -2, -1, 21, 12)).toEqual(reference(document, -2, -1, 21, 12))
  timeline.layerMasks = []
  source.layerStyles = { ...createDefaultLayerStyles(), gradientMap: { ...adjustment.adjustment!.gradientMap, enabled: true, scope: 'layer' } }
  document.layers.pop()
  expect(compositeGradientMapRegion(document, 0, 0, 17, 9)).toEqual(reference(document))
  source.clippingMask = true
  expect(compositeGradientMapRegion(document, 0, 0, 17, 9)).toBeNull()
})

it('benchmarks the real 1080p rendering entry and preserves its pixels', () => {
  const { document } = scene(1920, 1080)
  const start = performance.now()
  const expected = reference(document)
  const referenceMs = performance.now() - start
  const fastStart = performance.now()
  const actual = compositeRegion(document, 0, 0, 1920, 1080, new DocumentCompositeCache())
  const blockMs = performance.now() - fastStart
  expect(Buffer.compare(Buffer.from(actual), Buffer.from(expected))).toBe(0)
  process.stdout.write(`1080p gradient map: reference ${referenceMs.toFixed(1)} ms; block ${blockMs.toFixed(1)} ms\n`)
})
