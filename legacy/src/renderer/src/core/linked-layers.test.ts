import { describe, expect, it } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelAt, cloneAnimationCelsForLayer, detachLinkedLayerContent, ensureAnimationDocument, syncActiveAnimationLayer } from './animation'
import { createDocument, duplicateLayer, ensureLayerCoversCanvas, getActiveLayer, layerIndexAt, readLayerColorAt, writeLayerColor } from './document'
import { beginPixelEdit, commitPixelEdit, recordPixel } from './history'
import { normalizeLinkedLayerMetadata } from './linked-layers'
import { rasterStorageIdentity } from './runtime-raster'

const transparent = { r: 0, g: 0, b: 0, a: 0 }
const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 80, b: 255, a: 255 }

const createLinkedPair = () => {
  const document = createDocument('linked pair', 6, 1, 'rgba')
  const source = getActiveLayer(document)
  source.width = 1
  source.height = 1
  source.pixels = new Uint8ClampedArray(4)
  writeLayerColor(document, source, 0, red)
  source.linkedContentId = 'layer-link-test'
  const linked = duplicateLayer(document, source.id)
  cloneAnimationCelsForLayer(document, source.id, linked)
  return { document, source, linked }
}

describe('linked raster layer content', () => {
  it('normalizes every member of a linked group to the same display color', () => {
    const { document, source, linked } = createLinkedPair()
    source.displayColor = { ...red }
    linked.displayColor = { ...blue }

    normalizeLinkedLayerMetadata(document)

    expect(source.displayColor).toEqual(red)
    expect(linked.displayColor).toEqual(red)
    expect(linked.displayColor).not.toBe(source.displayColor)
  })

  it('shares edits and bitmap expansion while preserving each member position', () => {
    const { document, source, linked } = createLinkedPair()
    linked.offsetX = 3
    syncActiveAnimationLayer(document, linked.id)

    expect(rasterStorageIdentity(linked)).toBe(rasterStorageIdentity(source))
    expect(readLayerColorAt(document, source, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, linked, 3, 0)).toEqual(red)

    expect(ensureLayerCoversCanvas(document, linked)).toBe(true)
    const edit = beginPixelEdit(linked.id)
    const index = layerIndexAt(linked, 5, 0)
    expect(index).not.toBeNull()
    recordPixel(document, linked, edit, index!, 0xffff5000)
    const history = commitPixelEdit(document, edit, 'linked edit')!
    syncActiveAnimationLayer(document, linked.id)

    expect(history.invalidation).toEqual({ kind: 'full' })
    expect(history.affectedLayerIds).toEqual(expect.arrayContaining([source.id, linked.id]))
    expect(readLayerColorAt(document, linked, 5, 0)).toEqual(blue)
    expect(readLayerColorAt(document, source, 2, 0)).toEqual(blue)
    expect(readLayerColorAt(document, source, 0, 0)).toEqual(red)

    history.undo()
    syncActiveAnimationLayer(document, linked.id)
    expect(readLayerColorAt(document, linked, 5, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, source, 2, 0)).toEqual(transparent)
  })

  it('shares corresponding animation frames without merging different frames', () => {
    const document = createDocument('linked animation', 1, 1, 'rgba')
    const source = getActiveLayer(document)
    writeLayerColor(document, source, 0, red)
    syncActiveAnimationLayer(document, source.id)
    const secondFrameId = addBlankAnimationFrame(document)
    activateAnimationFrame(document, secondFrameId)
    writeLayerColor(document, source, 0, blue)
    syncActiveAnimationLayer(document, source.id)

    source.linkedContentId = 'layer-link-animation'
    const linked = duplicateLayer(document, source.id)
    cloneAnimationCelsForLayer(document, source.id, linked)
    const timeline = ensureAnimationDocument(document)

    for (const frame of timeline.frames) {
      const sourceCel = animationCelAt(timeline, source.id, frame.id)!
      const linkedCel = animationCelAt(timeline, linked.id, frame.id)!
      expect(rasterStorageIdentity(sourceCel.surface!)).toBe(rasterStorageIdentity(linkedCel.surface!))
    }
    const firstFrameId = timeline.frames[0].id
    expect(animationCelAt(timeline, source.id, firstFrameId)?.surface?.pixels).toEqual(new Uint8ClampedArray([255, 0, 0, 255]))
    expect(animationCelAt(timeline, source.id, secondFrameId)?.surface?.pixels).toEqual(new Uint8ClampedArray([0, 80, 255, 255]))
  })

  it('detaches one member into independent storage', () => {
    const { document, source, linked } = createLinkedPair()

    detachLinkedLayerContent(document, linked.id)

    expect(linked.linkedContentId).toBeUndefined()
    expect(rasterStorageIdentity(linked)).not.toBe(rasterStorageIdentity(source))
    writeLayerColor(document, linked, 0, blue)
    expect(readLayerColorAt(document, source, 0, 0)).toEqual(red)
  })
})
