import { expect, it } from 'vitest'
import { compositeRegion, createDocument, createLayer, createLayerMask, writeLayerColor } from './document'
import { createDefaultLayerStyles } from './layer-styles'
import { ensureAnimationDocument } from './animation'
import { installRuntimeRaster, surfacePixelsMaterialized, runtimeRasterResidentBytes } from './runtime-raster'
import { createPreviewProjectedRenderer } from './preview-projected-renderer'

it.each(['stroke', 'shadow', 'innerGlow', 'colorOverlay', 'gradientOverlay', 'gradientMap'] as const)(
  'projects %s at source coordinates with groups, masks and clipping', effect => {
    const doc = createDocument('styled projection', 32, 24, 'rgba', false)
    const base = doc.layers[0]
    const layer = createLayer('styled', 32, 24, 'rgba')
    doc.layers.push(layer)
    layer.groupId = 'group'
    layer.clippingMask = true
    base.groupId = 'group'
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles[effect]!.enabled = true
    const groupStyles = createDefaultLayerStyles()
    groupStyles.shadow.enabled = true
    doc.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 0.7, blendMode: 'multiply', layerStyles: groupStyles })
    for (let y = 3; y < 21; y++) for (let x = 3; x < 29; x++) {
      writeLayerColor(doc, base, y * 32 + x, { r: 100, g: 170, b: 70, a: 200 })
      if (x > 7 && x < 24 && y > 5 && y < 18) writeLayerColor(doc, layer, y * 32 + x, { r: 200, g: 90, b: 40, a: 128 })
    }
    const timeline = ensureAnimationDocument(doc), mask = createLayerMask(layer.id, 32, 24, 'cel')
    writeLayerColor(doc, mask, 9 * 32 + 9, { r: 64, g: 64, b: 64, a: 255 })
    timeline.layerMasks = [{ layerId: layer.id, frameId: timeline.activeFrameId, mask }]
    const xs = new Int32Array([1, 5, 9, 13, 17, 21, 25, 29]), ys = new Int32Array([1, 5, 9, 13, 17, 21])
    const output = new Uint8ClampedArray(xs.length * ys.length * 4)
    createPreviewProjectedRenderer(doc)(xs, ys, output)
    const full = compositeRegion(doc, 0, 0, 32, 24)
    expect(output.some(value => value !== 0)).toBe(true)
    for (let y = 0; y < ys.length; y++) for (let x = 0; x < xs.length; x++) {
      const i = (ys[y] * 32 + xs[x]) * 4, j = (y * xs.length + x) * 4
      expect(output.slice(j, j + 4)).toEqual(full.slice(i, i + 4))
    }
  }
)

it('keeps visible and hidden sparse layers lazy while drawing a blended preview', () => {
  const doc = createDocument('sparse preview', 1024, 1024, 'rgba', false)
  const layer = doc.layers[0]
  layer.blendMode = 'multiply'
  layer.opacity = 0.5
  const hidden = createLayer('hidden', 1024, 1024, 'rgba')
  hidden.visible = false
  doc.layers.push(hidden)
  for (const surface of doc.layers) {
    const data = new Uint8Array(64 * 64 * 4)
    data.set([180, 80, 40, 200])
    const tileOffsets = new Int32Array(16 * 16)
    tileOffsets[0] = 1
    installRuntimeRaster(surface, { kind: 'sparse-tiles-v1', format: 'rgba', width: 1024, height: 1024, tileSize: 64, data, tileOffsets })
  }
  const before = runtimeRasterResidentBytes(doc)
  const render = createPreviewProjectedRenderer(doc)
  const output = new Uint8ClampedArray(8)
  render(new Int32Array([0, 900]), new Int32Array([0]), output)
  expect(Array.from(output)).toEqual([180, 80, 40, 100, 0, 0, 0, 0])
  expect(doc.layers.map(surfacePixelsMaterialized)).toEqual([false, false])
  expect(runtimeRasterResidentBytes(doc)).toBe(before)
  // Live edits must remain visible through the original storage identity.
  layer.runtimeRaster!.data[0] = 60
  render(new Int32Array([0, 900]), new Int32Array([0]), output)
  expect(output[0]).toBe(60)
})
