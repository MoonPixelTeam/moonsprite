import { createDefaultLayerStyles } from '@/core/layer-styles'
import { duplicateLayer } from '@/core/document'
import { beforeEach, expect, it } from 'vitest'
import { compositeRegion, createDocument, getActiveLayer, isLayerEffectivelyLocked, animationMaskAt } from '@/core/document'
import { normalizeGradientMap } from '@/core/gradient-map'
import { ensureAnimationDocument } from '@/core/animation'
import { useWorkspace } from './workspace'
import { processAdjustmentPreview } from '@/core/adjustment-preview-processing'
import { DEFAULT_APP_LOCALE } from '@/core/localization'

const blue = normalizeGradientMap({ stops: [{ position: 0, color: { r: 0, g: 0, b: 255 } }, { position: 1, color: { r: 0, g: 0, b: 255 } }] })
beforeEach(() => { localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null }) })

it('creates, previews, masks, undoes and deletes an adjustment layer', async () => {
  const document = createDocument('adjustment layer', 1, 1, 'rgba')
  const base = getActiveLayer(document)
  base.pixels.set([255, 0, 0, 128])
  const store = useWorkspace.getState()
  store.addSession(document)
  await store.addLayer(blue)
  const adjustment = getActiveLayer(document)
  expect(adjustment.kind).toBe('adjustment')
  expect(isLayerEffectivelyLocked(document, adjustment)).toBe(false)
  expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual([0, 0, 255, 128])
  store.undo()
  expect(document.layers).toHaveLength(1)
  store.redo()
  expect(document.layers).toHaveLength(2)
  store.createLayerMasksForLayer(adjustment.id)
  const timeline = ensureAnimationDocument(document)
  const mask = animationMaskAt(timeline, adjustment.id, timeline.activeFrameId)
  expect(mask).toBeTruthy()
  expect(isLayerEffectivelyLocked(document, mask!)).toBe(false)
  store.undo()
  store.clearLayerStyles([{ kind: 'layer', id: adjustment.id }])
  expect(adjustment.kind).toBe('adjustment')
  expect(adjustment.layerStyles).toBeUndefined()
  expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual([0, 0, 255, 128])
  store.setLayerAdjustment(adjustment.id, { ...adjustment.adjustment!, enabled: false })
  expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual([255, 0, 0, 128])
  store.undo()
  expect(Array.from(compositeRegion(document, 0, 0, 1, 1))).toEqual([0, 0, 255, 128])
  store.selectLayer(adjustment.id)
  store.deleteSelectedLayers()
  expect(document.layers).toHaveLength(1)
})

it('restores indexed pixels and palette after cancel, undo and redo', () => {
  const document = createDocument('indexed adjustment', 2, 1, 'indexed')
  const layer = getActiveLayer(document)
  const id = document.nextColorId++
  document.palette.push({ id, name: 'source', color: { r: 80, g: 80, b: 80, a: 90 } })
  document.paletteOrder.push(id)
  layer.pixels.fill(id)
  const store = useWorkspace.getState()
  store.addSession(document)
  const originalOrder = [...document.paletteOrder]
  const originalPaletteLength = document.palette.length
  const baseline = store.captureActiveLayerAdjustmentSnapshot()!
  const adjustment = { kind: 'gradient-map' as const, gradientMap: blue }
  store.previewActiveLayerAdjustment(adjustment, baseline)
  expect(document.paletteOrder.length).toBeGreaterThan(originalOrder.length)
  store.restoreActiveDocumentSnapshot(baseline)
  expect(document.paletteOrder).toEqual(originalOrder)
  expect(document.palette).toHaveLength(originalPaletteLength)
  store.applyActiveLayerAdjustment(adjustment)
  const finalPixels = Array.from(layer.pixels)
  expect(finalPixels).not.toEqual([id, id])
  const finalOrder = [...document.paletteOrder]
  store.undo()
  expect(Array.from(layer.pixels)).toEqual([id, id])
  expect(document.paletteOrder).toEqual(originalOrder)
  store.redo()
  expect(Array.from(layer.pixels)).toEqual(finalPixels)
  expect(document.paletteOrder).toEqual(finalOrder)
})

it('transfers indexed worker preview palette entries into an undoable apply', async () => {
  const document = createDocument('worker map', 2, 1, 'indexed')
  const layer = getActiveLayer(document)
  const id = document.nextColorId++
  document.palette.push({ id, name: 'gray', color: { r: 90, g: 90, b: 90, a: 80 } })
  document.paletteOrder.push(id)
  layer.pixels.fill(id)
  const store = useWorkspace.getState()
  store.addSession(document)
  const baseline = store.captureActiveLayerAdjustmentSnapshot()!
  const originalOrder = [...document.paletteOrder]
  const adjustment = { kind: 'gradient-map' as const, gradientMap: blue }
  const result = await processAdjustmentPreview({
    documentWidth: 2, documentHeight: 1, colorMode: 'indexed', palette: baseline.palette,
    paletteOrder: originalOrder, nextColorId: baseline.nextColorId, selection: null, locale: DEFAULT_APP_LOCALE,
    layers: [{ layerId: layer.id, width: 2, height: 1, offsetX: 0, offsetY: 0, format: 'indexed', isMask: false,
      localContentBounds: { x: 0, y: 0, width: 2, height: 1 }, pixels: baseline.layers[0].pixels }]
  }, 1, adjustment, { x: 0, y: 0, width: 2, height: 1 })
  expect(result).toBeTruthy()
  store.applyActiveLayerAdjustmentPreviewResult(baseline, result!)
  store.applyActiveLayerAdjustmentFromSnapshot(adjustment, baseline, result!)
  expect(document.paletteOrder).toEqual(result!.paletteOrder)
  expect(Array.from(compositeRegion(document, 0, 0, 2, 1))).toEqual([0, 0, 255, 80, 0, 0, 255, 80])
  store.undo()
  expect(document.paletteOrder).toEqual(originalOrder)
  expect(Array.from(layer.pixels)).toEqual([id, id])
})


it('rejects every style command for adjustment layers and keeps copied settings independent', async () => {
  const document = createDocument('independent adjustment', 2, 1, 'rgba')
  const store = useWorkspace.getState()
  store.addSession(document)
  await store.addLayer(blue)
  const layer = getActiveLayer(document)
  const target = { kind: 'layer' as const, id: layer.id }
  const styles = createDefaultLayerStyles()
  styles.stroke.enabled = true
  useWorkspace.setState({ layerStyleClipboard: styles })
  expect(store.copyLayerStyles('layer', layer.id)).toBe(false)
  expect(store.pasteLayerStyles([target])).toBe(false)
  expect(store.setLayerStylesForTargets([target], styles)).toBe(false)
  expect(store.clearLayerStyles([target])).toBe(false)
  expect(store.setLayerStylesEnabled([target], false)).toBe(false)
  store.previewLayerStyleEntries([{ target, styles }])
  store.splitLayerStyles(layer.id)
  expect(document.layers).toHaveLength(2)
  expect(layer.layerStyles).toBeUndefined()
  expect(layer.adjustment?.gradientMap).toEqual(blue)
  const copied = duplicateLayer(document, layer.id)
  expect(copied.adjustment?.gradientMap).toEqual(blue)
  copied.adjustment!.gradientMap.stops[0].color.r = 77
  expect(layer.adjustment?.gradientMap.stops[0].color.r).toBe(0)
})
