import { describe, expect, it } from 'vitest'
import { AnimationPreviewDocumentCache } from './animation-preview-document'
import { activateAnimationFrame, addBlankAnimationFrame, cloneDocumentForAnimationFrame } from './animation'
import { createDocument, createLayer, writeLayerColor } from './document'
import { compositeDocument } from './document-composite'
import { createDefaultLayerStyles } from './layer-styles'

describe('display-only animation document cache', () => {
  it.each(['rgba', 'indexed'] as const)('matches isolated snapshots, including linked cels and live active storage (%s)', mode => {
    const source = createDocument('preview', 8, 8, mode)
    const first = source.animation!.activeFrameId
    writeLayerColor(source, source.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
    const second = addBlankAnimationFrame(source)
    writeLayerColor(source, source.layers[0], 2, { r: 0, g: 0, b: 255, a: 255 })
    activateAnimationFrame(source, first)
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, size: 1, color: { r: 255, g: 255, b: 0, a: 180 } }
    source.layers[0].layerStyles = styles
    source.animation!.layerMasks = [first, second].map(frameId => ({ layerId: source.layers[0].id, frameId, mask: { ...createLayer('mask', 8, 8, 'rgba'), format: 'rgba' as const, ownerKind: 'cel' as const, ownerId: source.layers[0].id, pixels: new Uint8ClampedArray(8 * 8 * 4).fill(190) } }))
    const cache = new AnimationPreviewDocumentCache()
    const original = compositeDocument(source)
    expect(compositeDocument(cache.get(source, second, 1))).toEqual(compositeDocument(cloneDocumentForAnimationFrame(source, second)))
    const activeCel = source.animation!.cels.find(c => c.frameId === first)!
    const targetCel = source.animation!.cels.find(c => c.frameId === second)!
    targetCel.linkedCelId = activeCel.id
    source.layers[0].offsetX = 3
    expect(compositeDocument(cache.get(source, second, 2))).toEqual(compositeDocument(cloneDocumentForAnimationFrame(source, second)))
    expect(source.animation!.activeFrameId).toBe(first)
    source.layers[0].offsetX = 0
    expect(compositeDocument(source)).toEqual(original)
  })

  it('shares read-only assets only for display, invalidates on revision/source/frame, and releases on active frame or clear', () => {
    const source = createDocument('assets', 4, 4, 'rgba')
    source.tilesets = [{ id: 'ts', name: 'ts', tileWidth: 2, tileHeight: 2, columns: 1, rows: 1, tileIds: ['t'], pixels: new Uint8ClampedArray(16) }]
    source.customBrushes = [{ id: 'b', name: 'b', width: 2, height: 2, coverage: new Uint8Array(4), colors: new Uint32Array(4) }]
    const first = source.animation!.activeFrameId
    const second = addBlankAnimationFrame(source)
    activateAnimationFrame(source, first)
    const cache = new AnimationPreviewDocumentCache()
    const preview = cache.get(source, second, 1)
    expect(preview.tilesets).toBe(source.tilesets)
    expect(preview.customBrushes).toBe(source.customBrushes)
    expect(preview.animation!.cels).not.toBe(source.animation!.cels)
    expect(cache.get(source, second, 1)).toBe(preview)
    source.animation!.activeFrameId = 'different-active-frame'
    expect(cache.get(source, second, 1)).not.toBe(preview)
    source.animation!.activeFrameId = first
    const isolated = cloneDocumentForAnimationFrame(source, second)
    expect(isolated.tilesets![0].pixels).not.toBe(source.tilesets[0].pixels)
    expect(isolated.customBrushes![0].coverage).not.toBe(source.customBrushes[0].coverage)
    const updated = cache.get(source, second, 2)
    expect(updated).not.toBe(preview)
    expect(cache.get({ ...source }, second, 2)).not.toBe(updated)
    expect(cache.get(source, first, 3)).toBe(source)
    expect(cache.get(source, second, 2)).not.toBe(updated)
    const last = cache.get(source, second, 2)
    cache.clear()
    expect(cache.get(source, second, 2)).not.toBe(last)
  })

  it('preserves sparse and invalid-frame fallback without modifying source slots', () => {
    const source = createDocument('sparse', 4, 4, 'rgba')
    source.animation!.frames.push({ id: 'empty', duration: 100 })
    const cels = source.animation!.cels
    const cache = new AnimationPreviewDocumentCache()
    for (const frame of ['empty', 'missing']) expect(compositeDocument(cache.get(source, frame, 1))).toEqual(compositeDocument(cloneDocumentForAnimationFrame(source, frame)))
    expect(source.animation!.cels).toBe(cels)
    expect(cels).toHaveLength(1)
  })
})
