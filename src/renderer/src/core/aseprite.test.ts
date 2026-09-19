import { zlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { decodeProject, encodeProject } from './project-format'
import { decodeAseprite, encodeAseprite } from './aseprite'
import { compositeDocument, createDocument, getActiveLayer, readLayerColor, writeLayerColor } from './document'
import { activateAnimationFrame, duplicateAnimationFrame, ensureAnimationDocument, syncActiveAnimationFrame } from './animation'

const encoder = new TextEncoder()

const putString = (name: string): Uint8Array => {
  const value = encoder.encode(name)
  const output = new Uint8Array(value.length + 2)
  new DataView(output.buffer).setUint16(0, value.length, true)
  output.set(value, 2)
  return output
}

const chunk = (type: number, payload: Uint8Array): Uint8Array => {
  const output = new Uint8Array(payload.length + 6)
  const view = new DataView(output.buffer)
  view.setUint32(0, output.length, true)
  view.setUint16(4, type, true)
  output.set(payload, 6)
  return output
}

const layerChunk = (name = 'Ink', layerType = 0, childLevel = 0, opacity = 255): Uint8Array => {
  const encodedName = putString(name)
  const payload = new Uint8Array(16 + encodedName.length)
  const view = new DataView(payload.buffer)
  view.setUint16(0, 3, true)
  view.setUint16(2, layerType, true)
  view.setUint16(4, childLevel, true)
  view.setUint8(12, opacity)
  payload.set(encodedName, 16)
  return chunk(0x2004, payload)
}

const celChunk = (pixels: Uint8Array, compressed = false, layerIndex = 0, x = 0, y = 0, opacity = 255): Uint8Array => {
  const data = compressed ? zlibSync(pixels) : pixels
  const payload = new Uint8Array(20 + data.length)
  const view = new DataView(payload.buffer)
  view.setUint16(0, layerIndex, true)
  view.setInt16(2, x, true)
  view.setInt16(4, y, true)
  view.setUint8(6, opacity)
  view.setUint16(7, compressed ? 2 : 0, true)
  view.setUint16(16, 2, true)
  view.setUint16(18, 1, true)
  payload.set(data, 20)
  return chunk(0x2005, payload)
}

const linkedCelChunk = (linkedFrame: number, layerIndex = 0, x = 0, y = 0, opacity = 255): Uint8Array => {
  const payload = new Uint8Array(18)
  const view = new DataView(payload.buffer)
  view.setUint16(0, layerIndex, true)
  view.setInt16(2, x, true)
  view.setInt16(4, y, true)
  view.setUint8(6, opacity)
  view.setUint16(7, 1, true)
  view.setUint16(16, linkedFrame, true)
  return chunk(0x2005, payload)
}

const paletteChunk = (): Uint8Array => {
  const payload = new Uint8Array(32)
  const view = new DataView(payload.buffer)
  view.setUint32(0, 2, true)
  view.setUint32(8, 1, true)
  payload.set([0, 0, 0, 0], 22)
  payload.set([255, 64, 32, 255], 28)
  return chunk(0x2019, payload)
}

const asepriteFrames = (frames: Uint8Array[][], colorDepth = 32, headerFlags = 0, width = 2, height = 1): Uint8Array => {
  const frameSizes = frames.map((chunks) => 16 + chunks.reduce((size, entry) => size + entry.length, 0))
  const output = new Uint8Array(128 + frameSizes.reduce((total, size) => total + size, 0))
  const view = new DataView(output.buffer)
  view.setUint32(0, output.length, true)
  view.setUint16(4, 0xa5e0, true)
  view.setUint16(6, frames.length, true)
  view.setUint16(8, width, true)
  view.setUint16(10, height, true)
  view.setUint16(12, colorDepth, true)
  view.setUint32(14, headerFlags, true)
  view.setUint8(28, 0)
  let offset = 128
  for (const [frameIndex, chunks] of frames.entries()) {
    view.setUint32(offset, frameSizes[frameIndex], true)
    view.setUint16(offset + 4, 0xf1fa, true)
    view.setUint16(offset + 6, chunks.length, true)
    view.setUint16(offset + 8, 100, true)
    offset += 16
    for (const entry of chunks) { output.set(entry, offset); offset += entry.length }
  }
  return output
}

const aseprite = (chunks: Uint8Array[], colorDepth = 32, headerFlags = 0): Uint8Array => asepriteFrames([chunks], colorDepth, headerFlags)

const tilemapFixture = (tile: number, embedded = true): Uint8Array => {
  const name = putString('Tiles')
  const layer = new Uint8Array(16 + name.length + 4)
  const lv = new DataView(layer.buffer)
  lv.setUint16(0, 3, true); lv.setUint16(2, 2, true); layer[12] = 255
  layer.set(name, 16)
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
  const compressed = zlibSync(pixels)
  const tileset = new Uint8Array(34 + (embedded ? 4 + compressed.length : 0))
  const tv = new DataView(tileset.buffer)
  tv.setUint32(4, embedded ? 2 : 0, true); tv.setUint32(8, 1, true)
  tv.setUint16(12, 2, true); tv.setUint16(14, 2, true)
  if (embedded) { tv.setUint32(34, compressed.length, true); tileset.set(compressed, 38) }
  const ids = new Uint8Array(4)
  new DataView(ids.buffer).setUint32(0, tile, true)
  const compressedIds = zlibSync(ids)
  const cel = new Uint8Array(52 + compressedIds.length)
  const cv = new DataView(cel.buffer)
  cel[6] = 255; cv.setUint16(7, 3, true)
  cv.setUint16(16, 1, true); cv.setUint16(18, 1, true); cv.setUint16(20, 32, true)
  ;[0x1fffffff, 0x80000000, 0x40000000, 0x20000000].forEach((mask, index) => cv.setUint32(22 + index * 4, mask, true))
  cel.set(compressedIds, 52)
  return asepriteFrames([[chunk(0x2004, layer), chunk(0x2023, tileset), chunk(0x2005, cel)]], 32, 1, 2, 2)
}

describe('Aseprite import', () => {
  it.each([
    [0, [255, 0, 0, 255]],
    [0x80000000, [0, 255, 0, 255]],
    [0x40000000, [0, 0, 255, 255]],
    [0xe0000000, [255, 255, 255, 255]]
  ])('rasterizes embedded tilemaps and flip flags %s', (flags, firstPixel) => {
    const imported = decodeAseprite(tilemapFixture(flags))
    expect(imported.layers).toHaveLength(1)
    expect([...compositeDocument(imported).subarray(0, 4)]).toEqual(firstPixel)
    expect(compositeDocument(decodeAseprite(encodeAseprite(imported)))).toEqual(compositeDocument(imported))
  })
  it('keeps legacy empty tiles transparent and rejects unavailable external tilesets', () => {
    expect(compositeDocument(decodeAseprite(tilemapFixture(0xffffffff))).every((value) => value === 0)).toBe(true)
    expect(() => decodeAseprite(tilemapFixture(0, false))).toThrow('内嵌瓦片集')
    expect(() => decodeAseprite(tilemapFixture(7))).toThrow()
  })
  it.each(['ping-pong', 'ping-pong-reverse'] as const)('round-trips %s tag direction', (direction) => {
    const source = createDocument('tags', 2, 1, 'rgba')
    duplicateAnimationFrame(source)
    const timeline = ensureAnimationDocument(source)
    timeline.loopSections = [{ id: 'tag', name: '往返', startFrameId: timeline.frames[0].id, endFrameId: timeline.frames[1].id, direction, repeatCount: 2 }]
    const imported = decodeAseprite(encodeAseprite(source))
    expect(imported.animation!.loopSections![0].direction).toBe(direction)
    expect(decodeProject(encodeProject(imported)).animation!.loopSections![0].direction).toBe(direction)
  })

  it('round-trips named loop ranges, direction and repeat counts', () => {
    const source = createDocument('tags', 2, 1, 'rgba')
    duplicateAnimationFrame(source)
    const timeline = ensureAnimationDocument(source)
    timeline.loopSections = [{ id: 'tag', name: '挑衅', startFrameId: timeline.frames[0].id, endFrameId: timeline.frames[1].id, direction: 'reverse', repeatCount: 3 }]
    const restored = decodeAseprite(encodeAseprite(source))
    expect(restored.animation?.loopSections).toEqual([{ id: expect.any(String), name: '挑衅', startFrameId: restored.animation!.frames[0].id, endFrameId: restored.animation!.frames[1].id, direction: 'reverse', repeatCount: 3 }])
  })

  it('retains cel opacity as editable metadata and round-trips linked cels', () => {
    const source = decodeAseprite(asepriteFrames([
      [layerChunk(), celChunk(new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]), false, 0, 0, 0, 128)],
      [linkedCelChunk(0, 0, 0, 0, 128)]
    ]))
    expect(readLayerColor(source, getActiveLayer(source), 0).a).toBe(255)
    expect(source.animation!.cels[0].opacity).toBeCloseTo(128 / 255)
    const restored = decodeAseprite(encodeAseprite(source))
    expect(restored.animation!.cels[1].linkedCelId).toBe(restored.animation!.cels[0].id)
    expect([...compositeDocument(restored).subarray(0, 4)]).toEqual([255, 0, 0, 128])
  })

  it('preserves cel z-index', () => {
    const cel = celChunk(new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]))
    new DataView(cel.buffer).setInt16(6 + 9, -2, true)
    const source = decodeAseprite(aseprite([layerChunk(), cel]))
    expect(decodeAseprite(encodeAseprite(source)).animation!.cels[0].zIndex).toBe(-2)
  })

  it('bakes unsupported clipping into ordinary pixels without changing source layers', () => {
    const source = createDocument('clipped', 2, 1, 'rgba')
    const layer = getActiveLayer(source)
    writeLayerColor(source, layer, 0, { r: 255, g: 32, b: 16, a: 255 })
    layer.clippingMask = true
    const expected = compositeDocument(source)
    const restored = decodeAseprite(encodeAseprite(source))
    expect(compositeDocument(restored)).toEqual(expected)
    expect(layer.clippingMask).toBe(true)
  })

  it('exports a project that can be opened again as an Aseprite file', () => {
    const source = createDocument('exported', 3, 2, 'rgba')
    const layer = getActiveLayer(source)
    writeLayerColor(source, layer, 0, { r: 255, g: 64, b: 32, a: 255 })
    writeLayerColor(source, layer, 4, { r: 8, g: 16, b: 32, a: 128 })

    const encoded = encodeAseprite(source)
    const encodedView = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength)
    const decoded = decodeAseprite(encoded, 'round-trip')
    const decodedLayer = getActiveLayer(decoded)
    expect(encodedView.getUint32(14, true) & 3).toBe(3)
    expect(encodedView.getUint16(18, true)).toBe(100)
    expect(decoded.width).toBe(3)
    expect(decoded.height).toBe(2)
    expect(readLayerColor(decoded, decodedLayer, 0)).toEqual({ r: 255, g: 64, b: 32, a: 255 })
    expect(readLayerColor(decoded, decodedLayer, 4)).toEqual({ r: 8, g: 16, b: 32, a: 128 })
  })

  it('round-trips multiple frames and their durations', () => {
    const source = createDocument('animated', 2, 1, 'rgba')
    writeLayerColor(source, getActiveLayer(source), 0, { r: 255, g: 0, b: 0, a: 255 })
    const second = duplicateAnimationFrame(source)
    writeLayerColor(source, getActiveLayer(source), 0, { r: 0, g: 0, b: 255, a: 255 })
    ensureAnimationDocument(source).frames[1].duration = 240
    syncActiveAnimationFrame(source)

    const restored = decodeAseprite(encodeAseprite(source), 'animated')
    expect(restored.animation?.frames.map((frame) => frame.duration)).toEqual([100, 240])
    expect(restored.animation?.frames).toHaveLength(2)
    expect(readLayerColor(restored, getActiveLayer(restored), 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    activateAnimationFrame(restored, restored.animation!.frames[1].id)
    expect(readLayerColor(restored, getActiveLayer(restored), 0)).toEqual({ r: 0, g: 0, b: 255, a: 255 })
    expect(second).toBeTruthy()
  })

  it('imports raw RGBA cels', () => {
    const document = decodeAseprite(aseprite([layerChunk(), celChunk(new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]))]), 'raw')
    const layer = getActiveLayer(document)
    expect(document.name).toBe('raw')
    expect(layer.name).toBe('Ink')
    expect(readLayerColor(document, layer, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(readLayerColor(document, layer, 1)).toEqual({ r: 0, g: 0, b: 255, a: 128 })
    expect(document.palette.map((entry) => entry.color)).toEqual([
      { r: 0, g: 0, b: 255, a: 128 },
      { r: 255, g: 0, b: 0, a: 255 }
    ])
  })

  it('imports zlib-compressed RGBA cels', () => {
    const document = decodeAseprite(aseprite([layerChunk(), celChunk(new Uint8Array([8, 16, 32, 255, 255, 255, 0, 255]), true)]))
    const layer = getActiveLayer(document)
    expect(readLayerColor(document, layer, 0)).toEqual({ r: 8, g: 16, b: 32, a: 255 })
    expect(readLayerColor(document, layer, 1)).toEqual({ r: 255, g: 255, b: 0, a: 255 })
  })







  it('opens projects that include tilemap layers and imports their raster layers', () => {
    const document = decodeAseprite(aseprite([
      layerChunk('Tilemap', 2),
      layerChunk('Paint'),
      celChunk(new Uint8Array([255, 64, 32, 255, 0, 0, 0, 0]), false, 1)
    ]))
    expect(document.layers.map((layer) => layer.name)).toEqual(['Paint'])
    expect(readLayerColor(document, getActiveLayer(document), 0)).toEqual({ r: 255, g: 64, b: 32, a: 255 })
  })

  it('preserves nested group ownership', () => {
    const document = decodeAseprite(aseprite([
      layerChunk('Characters', 1, 0, 0),
      layerChunk('Hero', 1, 1, 0),
      layerChunk('Ink', 0, 2),
      celChunk(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]), false, 2)
    ]))
    const characters = document.groups.find((group) => group.name === 'Characters')
    const hero = document.groups.find((group) => group.name === 'Hero')
    expect(characters).toBeDefined()
    expect(hero?.parentGroupId).toBe(characters?.id)
    expect(document.layers[0].groupId).toBe(hero?.id)
    expect(characters?.opacity).toBe(1)
    expect(hero?.opacity).toBe(1)
    expect([...compositeDocument(document).subarray(0, 4)]).toEqual([255, 255, 255, 255])
  })





})
