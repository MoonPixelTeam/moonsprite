import { describe, expect, it } from 'vitest'
import { createDocument, createLayer } from './document'
import { addBlankAnimationFrame, animationCelAt, ensureAnimationDocument } from './animation'
import { compositeAnimationFrame, onionSkinFrameRefs, tintOnionSkinPixels } from './onion-skin'

describe('onion skin helpers', () => {
  it('collects adjacent frames without wrapping at timeline edges', () => {
    const document = createDocument('onion', 1, 1, 'rgba')
    addBlankAnimationFrame(document)
    addBlankAnimationFrame(document)
    const timeline = ensureAnimationDocument(document)
    expect(onionSkinFrameRefs(timeline, 2, 2).map(({ frameId, side }) => [frameId, side])).toEqual([
      [timeline.frames[0].id, 'previous'],
      [timeline.frames[1].id, 'previous']
    ])
  })



  it('composites every visible layer from the requested animation frame', () => {
    const document = createDocument('multi-layer onion', 2, 1, 'rgba')
    const top = createLayer('top', 2, 1, 'rgba')
    document.layers.push(top)
    const timeline = ensureAnimationDocument(document)
    addBlankAnimationFrame(document)
    const firstFrame = timeline.frames[0]
    animationCelAt(timeline, document.layers[0].id, firstFrame.id)!.surface!.pixels.set([255, 0, 0, 255], 0)
    animationCelAt(timeline, top.id, firstFrame.id)!.surface!.pixels.set([0, 0, 255, 255], 4)

    expect([...compositeAnimationFrame(document, firstFrame.id)]).toEqual([
      255, 0, 0, 255,
      0, 0, 255, 255
    ])
  })
})
