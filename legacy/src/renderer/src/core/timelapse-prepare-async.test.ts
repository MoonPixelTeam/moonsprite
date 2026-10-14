import { describe, expect, it } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from './document'
import { createDefaultLayerStyles } from './layer-styles'
import { createTimelapseCaptureCache, prepareTimelapseSnapshot, prepareTimelapseSnapshotAsync } from './timelapse'
import { freezeTimelapsePixels, freezeTimelapsePixelsAsync, materializeTimelapsePixels } from './timelapse-pixels'
import { Buffer } from 'node:buffer'
import { ensureAnimationDocument } from './animation'

describe('cooperative recording preparation', () => {
  it.each(['low', 'medium', 'high'] as const)('matches every downscaled byte on a 4K styled source (%s)', async quality => {
    const doc = createDocument('4K styles', 1, 1, 'rgba', true)
    doc.width = doc.height = 4096
    doc.layers = Array.from({ length: 4 }, (_, i) => {
      const layer = createLayer(`layer${i}`, 64, 64, 'rgba')
      layer.offsetX = i * 100; layer.offsetY = i * 200
      for (let p = 0; p < layer.pixels.length; p += 4) { layer.pixels[p] = p % 251; layer.pixels[p + 1] = i * 60; layer.pixels[p + 3] = 150 }
      return layer
    })
    doc.activeLayerId = doc.layers[0].id;ensureAnimationDocument(doc)
    const styles = createDefaultLayerStyles();styles.stroke = { ...styles.stroke, enabled: true, size: 2 };styles.shadow = { ...styles.shadow, enabled: true, blur: 2 }
    doc.layers[0].layerStyles = styles;doc.timelapse!.quality = quality
    const sync = prepareTimelapseSnapshot(doc, 1, { contentRevision: 1 })!
    const asyncSnapshot = (await prepareTimelapseSnapshotAsync(doc, 1, { contentRevision: 1 }))!
    expect(Buffer.from(asyncSnapshot.pixels).equals(Buffer.from(sync.pixels))).toBe(true)
  }, 30000)

  it.each(['rgba', 'indexed'] as const)('matches sync pixels and immutable tiles through edits, gaps, geometry and quality changes (%s)', async mode => {
    const doc = createDocument('styled recording', 96, 96, mode, true)
    doc.timelapse!.mode = 'full'
    doc.groups = [{ id: 'g', name: 'g', visible: true, locked: false, opacity: .8, blendMode: 'normal' }]
    doc.layers[0].groupId = 'g'
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, size: 2, color: { r: 10, g: 200, b: 90, a: 200 } }
    doc.layers[0].layerStyles = styles
    const sync = createTimelapseCaptureCache(), asyncCache = createTimelapseCaptureCache()
    for (let revision = 1; revision <= 6; revision++) {
      writeLayerColor(doc, doc.layers[0], 40 * 96 + 40 + revision, { r: revision * 30, g: 20, b: 80, a: 240 })
      if (revision === 4) doc.width = 90
      if (revision === 5) doc.timelapse!.quality = 'high'
      const options = { contentRevision: revision, contentInvalidation: { kind: 'region' as const, fromRevision: revision === 3 ? 0 : revision - 1, revision, rect: { x: 32, y: 32, width: 28, height: 28 } } }
      const before = prepareTimelapseSnapshot(doc, revision, { ...options, cache: sync })!
      const after = (await prepareTimelapseSnapshotAsync(doc, revision, { ...options, cache: asyncCache }))!
      expect(after.pixels).toEqual(before.pixels)
      expect(after).toMatchObject({ width: before.width, height: before.height, capturedAt: revision, changeScore: before.changeScore })
      const saved = after.pixels.slice()
      writeLayerColor(doc, doc.layers[0], 0, { r: 200, g: 100, b: 30, a: 255 })
      expect(materializeTimelapsePixels(after.tiledPixels!)).toEqual(saved)
    }
  })

  it('invalidates a partially updated cache on cancellation and rebuilds exact next pixels', async () => {
    const doc = createDocument('cancel patch', 256, 256, 'rgba', true)
    const cache = createTimelapseCaptureCache()
    await prepareTimelapseSnapshotAsync(doc, 1, { cache, contentRevision: 1 })
    doc.layers[0].pixels.fill(180)
    let checks = 0
    const cancelled = await prepareTimelapseSnapshotAsync(doc, 2, { cache, contentRevision: 2,
      contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, rect: { x: 0, y: 0, width: 256, height: 256 } }, shouldCommit: () => ++checks < 3 })
    expect(cancelled).toBeNull()
    expect(cache.pixels).toBeNull()
    const next = await prepareTimelapseSnapshotAsync(doc, 3, { cache, contentRevision: 3 })
    expect(next!.pixels).toEqual(prepareTimelapseSnapshot(doc, 3, { contentRevision: 3 })!.pixels)
  })

  it('reuses unchanged immutable tiles and cancels freezing without publishing partial tiles', async () => {
    const pixels = new Uint8ClampedArray(128 * 128 * 4).fill(100)
    const previous = freezeTimelapsePixels(pixels, 128, 128)
    pixels[0] = 240
    const frame = await freezeTimelapsePixelsAsync(pixels, 128, 128, previous, { x: 0, y: 0, width: 1, height: 1 })
    expect(frame!.tiles[1]).toBe(previous.tiles[1])
    expect(frame!.tiles[0]).not.toBe(previous.tiles[0])
    expect(materializeTimelapsePixels(frame!)).toEqual(pixels)
    let checks = 0
    expect(await freezeTimelapsePixelsAsync(pixels, 128, 128, undefined, undefined, () => ++checks < 3)).toBeNull()
  })
})
