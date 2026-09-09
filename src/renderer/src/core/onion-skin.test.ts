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

  it('uses the requested frame z order instead of the active frame z order', () => {
    const document = createDocument('frame z onion', 1, 1, 'rgba')
    const bottom = document.layers[0]
    const top = createLayer('top', 1, 1, 'rgba')
    document.layers.push(top)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    addBlankAnimationFrame(document)
    const bottomCel = animationCelAt(timeline, bottom.id, firstFrameId)!
    const topCel = animationCelAt(timeline, top.id, firstFrameId)!
    bottomCel.surface!.pixels.set([255, 0, 0, 255])
    topCel.surface!.pixels.set([0, 0, 255, 255])
    bottomCel.zIndex = 3

    expect([...compositeAnimationFrame(document, firstFrameId)]).toEqual([255, 0, 0, 255])
  })

  it('preserves relative luminance using only darker variants of the configured onion color', () => {
    const tint = { r: 80, g: 100, b: 220, a: 204 }
    const source = new Uint8ClampedArray([
      12, 24, 48, 255,
      tint.r, tint.g, tint.b, 200,
      220, 200, 160, 128,
      255, 255, 255, 64,
      0, 0, 0, 255,
      50, 100, 150, 0
    ])
    const output = tintOnionSkinPixels(source, tint, 50, 2)
    const luminance = (pixels: Uint8ClampedArray, offset: number): number => pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722

    expect(luminance(output, 16)).toBeLessThan(luminance(output, 0))
    expect(luminance(output, 0)).toBeLessThan(luminance(output, 4))
    expect(luminance(output, 4)).toBeLessThan(luminance(output, 8))
    expect(luminance(output, 8)).toBeLessThan(luminance(output, 12))
    expect(Array.from(output.subarray(12, 15))).toEqual([tint.r, tint.g, tint.b])
    expect(Array.from(output.subarray(16, 19))).toEqual([20, 25, 55])
    for (const offset of [0, 4, 8, 12, 16]) {
      expect(output[offset] || output[offset + 1] || output[offset + 2]).toBeTruthy()
      expect(Math.abs(output[offset] / tint.r - output[offset + 1] / tint.g)).toBeLessThan(0.015)
      expect(Math.abs(output[offset + 1] / tint.g - output[offset + 2] / tint.b)).toBeLessThan(0.015)
    }
    expect([output[3], output[7], output[11], output[15], output[19], output[23]]).toEqual([51, 40, 26, 13, 51, 0])
    expect(new Set([output[0], output[4], output[8], output[12], output[16]]).size).toBeGreaterThan(3)
  })
})
