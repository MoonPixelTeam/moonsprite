import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { compositeRegion, createDocument, createLayer, createLayerMask, DocumentCompositeCache, getActiveLayer, writeLayerColor } from './document'
import { ensureAnimationDocument, cloneDocumentForAnimationFrame, syncActiveAnimationFrame } from './animation'
import { createDefaultLayerStyles, cloneLayerStyles, layerStylesSignature } from './layer-styles'
import { normalizeGradientMap } from './gradient-map'
import { applyColorAdjustmentDirect } from './adjustments'
import { decodeProject, encodeProject } from './project-format'

const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 0, b: 255, a: 255 }
const settings = normalizeGradientMap({ stops: [{ position: 0, color: blue }, { position: 1, color: blue }] })
const styles = (scope: 'below' | 'layer' = 'below') => ({ ...createDefaultLayerStyles(), gradientMap: { ...settings, enabled: true, scope } })
const create = () => {
  const document = createDocument('map', 2, 1, 'rgba')
  const source = getActiveLayer(document)
  writeLayerColor(document, source, 0, { ...red, a: 128 })
  const adjustment = createLayer('Adjustment', 1, 1, 'rgba')
  adjustment.kind = 'adjustment'
  adjustment.adjustment = { kind: 'gradient-map', enabled: true, gradientMap: settings }
  document.layers.push(adjustment)
  return { document, source, adjustment }
}
const pixels = (document: ReturnType<typeof createDocument>, cached = false) => Array.from(compositeRegion(document, 0, 0, 2, 1, cached ? new DocumentCompositeCache() : undefined))

describe('gradient-map rendering and persistence', () => {
  it('maps a lower stack without increasing alpha, in cached and uncached rendering', () => {
    const { document, source, adjustment } = create()
    expect(pixels(document)).toEqual([0, 0, 255, 128, 0, 0, 0, 0])
    expect(pixels(document, true)).toEqual(pixels(document))
    expect(Array.from(source.pixels).slice(0, 4)).toEqual([255, 0, 0, 128])
    adjustment.opacity = 0.5
    expect(pixels(document).slice(0, 4)).toEqual([128, 0, 128, 128])
    adjustment.visible = false
    expect(pixels(document).slice(0, 4)).toEqual([255, 0, 0, 128])
  })
  it('never reaches outside a pass-through group', () => {
    const { document, adjustment } = create()
    document.groups.push({ id: 'g', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    adjustment.groupId = 'g'
    expect(pixels(document).slice(0, 4)).toEqual([255, 0, 0, 128])
    const inside = createLayer('Inside', 2, 1, 'rgba')
    inside.groupId = 'g'
    writeLayerColor(document, inside, 1, red)
    document.layers.splice(1, 0, inside)
    expect(pixels(document)).toEqual([255, 0, 0, 128, 0, 0, 255, 255])
  })
  it('clips mapping to the immediate lower base and honors an adjustment mask', () => {
    const { document, adjustment } = create()
    const base = createLayer('Base', 2, 1, 'rgba')
    writeLayerColor(document, base, 1, red)
    document.layers.splice(1, 0, base)
    adjustment.clippingMask = true
    expect(pixels(document)).toEqual([255, 0, 0, 128, 0, 0, 255, 255])
    const timeline = ensureAnimationDocument(document)
    const mask = createLayerMask(adjustment.id, 2, 1)
    mask.pixels.set([0, 0, 0, 255, 0, 0, 0, 255])
    timeline.layerMasks = [{ layerId: adjustment.id, frameId: timeline.activeFrameId, mask }]
    expect(pixels(document)).toEqual([255, 0, 0, 128, 255, 0, 0, 255])
  })
  it('round-trips settings and applies them to every animation frame', () => {
    const { document, source } = create()
    const timeline = ensureAnimationDocument(document)
    syncActiveAnimationFrame(document)
    timeline.frames.push({ id: 'second', duration: 100 })
    timeline.cels.push({ id: 'second-cel', layerId: source.id, frameId: 'second', opacity: 1, surface: { format: 'rgba', width: 2, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 0, 0]) } })
    const restored = decodeProject(encodeProject(document))
    expect(restored.layers.at(-1)?.kind).toBe('adjustment')
    expect(restored.layers.at(-1)?.layerStyles).toBeUndefined()
    expect(restored.layers.at(-1)?.adjustment?.gradientMap).toEqual(settings)
    expect(pixels(restored)).toEqual(pixels(document))
    expect(pixels(cloneDocumentForAnimationFrame(restored, 'second'))).toEqual([0, 0, 255, 255, 0, 0, 0, 0])
  })
  it('renders translated dither identically through the cached style path', () => {
    const document = createDocument('style', 8, 2, 'rgba')
    const layer = createLayer('offset', 5, 1, 'rgba')
    layer.offsetX = 1
    layer.offsetY = 1
    for (let i = 0; i < 5; i++) writeLayerColor(document, layer, i, { r: 128, g: 128, b: 128, a: 92 })
    layer.layerStyles = { ...styles('layer'), gradientMap: { ...normalizeGradientMap(undefined), dither: 'bayer-4', enabled: true, scope: 'layer' } }
    document.layers = [layer]
    expect(compositeRegion(document, 0, 0, 8, 2, new DocumentCompositeCache())).toEqual(compositeRegion(document, 0, 0, 8, 2))
  })
  it('uses deep stop copies and keys cache invalidation on stop edits', () => {
    const original = styles('layer')
    const copied = cloneLayerStyles(original)!
    const before = layerStylesSignature(original)
    copied.gradientMap!.stops[0].color.r = 99
    expect(original.gradientMap.stops[0].color.r).toBe(0)
    expect(layerStylesSignature(copied)).not.toBe(before)
  })
  it('limits destructive mapping to the selection and keeps alpha', () => {
    const { document, source } = create()
    writeLayerColor(document, source, 1, red)
    applyColorAdjustmentDirect(document, source, { kind: 'gradient-map', gradientMap: settings }, { x: 0, y: 0, width: 1, height: 1, mask: new Uint8Array([1]) })
    expect(Array.from(source.pixels)).toEqual([0, 0, 255, 128, 255, 0, 0, 255])
  })
  it('keeps indexed documents indexed and maps each dither position', () => {
    const document = createDocument('indexed', 8, 1, 'indexed')
    const layer = getActiveLayer(document)
    const sourceId = document.nextColorId++
    document.palette.push({ id: sourceId, name: 'Translucent gray', color: { r: 128, g: 128, b: 128, a: 100 } })
    document.paletteOrder.push(sourceId)
    layer.pixels.fill(sourceId)
    applyColorAdjustmentDirect(document, layer, { kind: 'gradient-map', gradientMap: { ...normalizeGradientMap(undefined), dither: 'bayer-4' } })
    expect(document.colorMode).toBe('indexed')
    expect(layer.format).toBe('indexed')
    expect(new Set(layer.pixels).size).toBe(2)
    for (const id of layer.pixels) expect(document.palette.find(entry => entry.id === id)?.color.a).toBe(100)
  })
})


it('migrates legacy adjustment styles at decode and saves only independent adjustment data', () => {
  const { document } = create()
  const files = unzipSync(encodeProject(document))
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  const layer = manifest.document.layers.at(-1)
  delete layer.adjustment
  layer.layerStyles = styles('below')
  layer.layerStyles.enabled = false
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  const restored = decodeProject(zipSync(files))
  const adjustment = restored.layers.at(-1)!
  expect(adjustment.layerStyles).toBeUndefined()
  expect(adjustment.adjustment).toEqual({ kind: 'gradient-map', enabled: false, gradientMap: settings })
  expect(pixels(restored).slice(0, 4)).toEqual([255, 0, 0, 128])
  adjustment.adjustment!.enabled = true
  expect(pixels(restored).slice(0, 4)).toEqual([0, 0, 255, 128])
  const saved = JSON.parse(strFromU8(unzipSync(encodeProject(restored))['manifest.json'])).document.layers.at(-1)
  expect(saved.layerStyles).toBeUndefined()
  expect(saved.adjustment.gradientMap).toEqual(settings)
})
