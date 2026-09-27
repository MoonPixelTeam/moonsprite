import { describe, expect, it, vi } from 'vitest'
import { createDocument, createLayerMask, getActiveLayer, writeLayerColor } from './document'
import { ensureAnimationDocument } from './animation'
import { compositeRegion } from './document-composite'
import { createTimelapseCaptureCache, prepareTimelapseSnapshot } from './timelapse'
import * as layerStyles from './layer-styles'

describe('immutable timelapse capture', () => {
  it('recomputes only the local style pixels when recording a small stroke on a 256px canvas', () => {
    const document = createDocument('styled recording', 256, 256, 'rgba', true)
    const layer = getActiveLayer(document)
    layer.layerStyles = layerStyles.createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    for (const [x, y] of [[8, 8], [240, 240], [30, 30]]) {
      writeLayerColor(document, layer, y * 256 + x, { r: 200, g: 70, b: 20, a: 255 })
    }
    const cache = createTimelapseCaptureCache()
    const first = prepareTimelapseSnapshot(document, 1, { cache, contentRevision: 1 })!
    writeLayerColor(document, layer, 30 * 256 + 30, { r: 20, g: 70, b: 200, a: 128 })
    const sample = vi.spyOn(layerStyles, 'applyLayerStylesAt')
    let work: number
    let next: ReturnType<typeof prepareTimelapseSnapshot>
    try {
      next = prepareTimelapseSnapshot(document, 2, { cache, contentRevision: 2,
        contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, rect: { x: 29, y: 29, width: 3, height: 3 } } })
      work = sample.mock.calls.length
    } finally { sample.mockRestore() }
    expect(next!.pixels).toEqual(prepareTimelapseSnapshot(document)!.pixels)
    expect(first.pixels[(30 * 256 + 30) * 4]).toBe(200)
    expect(work).toBeGreaterThan(0)
    expect(work).toBeLessThanOrEqual(25)
  })

  it.each([256, 1301])('keeps styled groups correct across partial erases and revision gaps (width=%s)', (width) => {
    const document = createDocument('group recording', width, 16, 'rgba', true)
    document.timelapse!.quality = 'low'
    const layer = getActiveLayer(document)
    layer.groupId = 'styled'
    const styles = layerStyles.createDefaultLayerStyles()
    styles.stroke.enabled = true
    styles.stroke.size = 2
    styles.stroke.followOpacity = true
    document.groups.push({ id: 'styled', name: 'Styled', visible: true, locked: false, opacity: 0.7, blendMode: 'normal', layerStyles: styles })
    for (const x of [60, 64, 68, 190]) writeLayerColor(document, layer, 8 * width + x, { r: 200, g: 70, b: 20, a: 128 })
    const cache = createTimelapseCaptureCache()
    prepareTimelapseSnapshot(document, 1, { cache, contentRevision: 1 })
    for (const revision of [2, 4]) {
      const x = revision === 2 ? 64 : 190
      writeLayerColor(document, layer, 8 * width + x, { r: 0, g: 0, b: 0, a: 0 })
      const partial = prepareTimelapseSnapshot(document, revision, { cache, contentRevision: revision,
        contentInvalidation: { kind: 'region', fromRevision: revision - 1, revision, rect: { x: 62, y: 6, width: 5, height: 5 } } })!
      expect(partial.pixels).toEqual(prepareTimelapseSnapshot(document)!.pixels)
    }
  })

  it.each([false, true])('matches nearest-neighbor compositing when downscaled (masked group=%s)', (masked) => {
    const document = createDocument('scaled recording', 1301, 7, 'rgba', true)
    document.timelapse!.quality = 'low'
    const layer = getActiveLayer(document)
    for (let i = 0; i < layer.width * layer.height; i += 1) {
      writeLayerColor(document, layer, i, { r: i % 251, g: i % 137, b: 90, a: i % 256 })
    }
    if (masked) {
      document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 0.7, blendMode: 'normal' })
      layer.groupId = 'group'
      const timeline = ensureAnimationDocument(document)
      const mask = createLayerMask('group', document.width, document.height, 'group')
      timeline.groupMasks = [{ groupId: 'group', frameId: timeline.activeFrameId, mask }]
      writeLayerColor(document, mask, 0, { r: 80, g: 80, b: 80, a: 255 })
    }
    const source = compositeRegion(document, 0, 0, document.width, document.height)
    const frame = prepareTimelapseSnapshot(document, 1, { contentRevision: 1 })!
    const expected = new Uint8ClampedArray(frame.width * frame.height * 4)
    for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) {
      const offset = (Math.floor(y * document.height / frame.height) * document.width + Math.floor(x * document.width / frame.width)) * 4
      expected.set(source.subarray(offset, offset + 4), (y * frame.width + x) * 4)
    }
    // Fully transparent RGB is visually undefined; the point compositor
    // canonicalizes it while the one-layer row-copy path preserves it.
    for (let i = 0; i < expected.length; i += 4) if (expected[i + 3] === 0) expected.fill(0, i, i + 3)
    expect(frame.pixels).toEqual(expected)
  })

  it('freezes only changed tiles while preserving queued operations', () => {
    const document = createDocument('queued strokes', 1280, 1280, 'rgba', true)
    const layer = getActiveLayer(document)
    const cache = createTimelapseCaptureCache()
    writeLayerColor(document, layer, 0, { r: 40, g: 0, b: 0, a: 255 })
    const first = prepareTimelapseSnapshot(document, 1, { cache, contentRevision: 1 })!
    writeLayerColor(document, layer, 0, { r: 80, g: 0, b: 0, a: 255 })
    const second = prepareTimelapseSnapshot(document, 2, { cache, contentRevision: 2,
      contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, rect: { x: 0, y: 0, width: 1, height: 1 } } })!
    const changedTiles = second.tiledPixels!.tiles.filter((tile, i) => tile !== first.tiledPixels!.tiles[i])
    expect(changedTiles.reduce((bytes, tile) => bytes + tile.pixels.byteLength, 0)).toBe(64 * 64 * 4)
    writeLayerColor(document, layer, 0, { r: 120, g: 0, b: 0, a: 255 })
    expect(first.pixels[0]).toBe(40)
    expect(second.pixels[0]).toBe(80)
    const before = first.pixels
    expect(second.pixels.subarray(4).every((value, i) => value === before[i + 4])).toBe(true)
  })

  it('maps partial updates to scaled tile boundaries and catches revision gaps', () => {
    const document = createDocument('partial scaled', 1281, 3, 'rgba', true)
    document.timelapse!.quality = 'low'
    const cache = createTimelapseCaptureCache()
    prepareTimelapseSnapshot(document, 1, { cache, contentRevision: 1 })
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 128, { r: 77, g: 0, b: 0, a: 255 })
    const partial = prepareTimelapseSnapshot(document, 2, { cache, contentRevision: 2,
      contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, rect: { x: 128, y: 0, width: 1, height: 1 } } })!
    expect(partial.pixels).toEqual(prepareTimelapseSnapshot(document)!.pixels)
    writeLayerColor(document, layer, 0, { r: 99, g: 0, b: 0, a: 255 })
    const gap = prepareTimelapseSnapshot(document, 4, { cache, contentRevision: 4,
      contentInvalidation: { kind: 'region', fromRevision: 3, revision: 4, rect: { x: 100, y: 0, width: 1, height: 1 } } })!
    expect(gap.pixels[0]).toBe(99)
    expect(partial.pixels[0]).toBe(0)
  })

  it('rebuilds frozen tiles after quality and canvas geometry changes', () => {
    const document = createDocument('resized', 1280, 2, 'rgba', true)
    const cache = createTimelapseCaptureCache()
    const first = prepareTimelapseSnapshot(document, 1, { cache, contentRevision: 1 })!
    document.timelapse!.quality = 'low'
    const low = prepareTimelapseSnapshot(document, 2, { cache, contentRevision: 1 })!
    expect(low.width).toBe(640)
    expect(low.pixels.length).toBe(low.width * low.height * 4)
    document.width = 640
    const resized = prepareTimelapseSnapshot(document, 3, { cache, contentRevision: 2 })!
    expect(resized.height).toBe(2)
    expect(first.width).toBe(1280)
    expect(resized.pixels).toEqual(prepareTimelapseSnapshot(document)!.pixels)
  })
})
