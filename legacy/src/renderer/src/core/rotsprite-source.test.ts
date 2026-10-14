import { describe, expect, it } from 'vitest'
import { RotSpriteSource, scale2xPacked } from './rotsprite-source'
import { createDocument, readLayerPacked, writeLayerColor } from './document'
import { applySelectionTransform, captureSelectionTransform, selectionTransformPreviewPacked } from './tools'
import { packColor } from './raster'
import { revertPixelEdit } from './history'

describe('bounded RotSprite source', () => {
  it('matches full three-pass Scale2x at tile seams and image edges', () => {
    const width = 71, height = 67
    const pixels = new Uint32Array(width * height)
    let random = 12345
    for (let i = 0; i < pixels.length; i++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0
      pixels[i] = (random >>> 24) % 4
    }
    let full = { pixels, width, height }
    for (let pass = 0; pass < 3; pass++) full = scale2xPacked(full.pixels, full.width, full.height)
    const tiled = new RotSpriteSource(width, height, (x, y) => pixels[y * width + x])
    let differences = 0
    for (let y = 0; y < full.height; y++) for (let x = 0; x < full.width; x++) {
      if (tiled.sample(x, y) !== full.pixels[y * full.width + x]) differences++
    }
    expect(differences).toBe(0)
  })

  it('bounds cached memory on 4K content and regenerates evicted tiles correctly', () => {
    const tiled = new RotSpriteSource(4000, 4000, (x, y) => ((x + y) % 7 ? 1 : 2))
    const first = tiled.sample(3, 5)
    for (let y = 0; y < 4000; y += 127) for (let x = 0; x < 4000; x += 127) tiled.sample(x * 8, y * 8)
    expect(tiled.cachedBytes).toBeLessThanOrEqual(32 * 36 * 36 * 64 * 4)
    expect(tiled.sample(3, 5)).toBe(first)
  })
})

describe('RotSprite transform integration', () => {
  for (const size of [65, 128]) for (const mode of ['rotate', 'resize', 'flip', 'shear', 'quad']) {
    it(`uses RotSprite for ${size}px content with ${mode}, matches commit and undoes exactly`, () => {
      const doc = createDocument('RotSprite', 256, 256, 'rgba', false)
      const layer = doc.layers[0]
      const rect = { x: 64, y: 64, width: size, height: size }
      for (let x = 0; x < size; x++) for (const y of [x, size - 1 - x]) {
        writeLayerColor(doc, layer, (64 + y) * doc.width + 64 + x, { r: 200, g: 90, b: 60, a: 255 })
      }
      const before = Uint32Array.from({ length: doc.width * doc.height }, (_, i) => readLayerPacked(doc, layer, i))
      const source = captureSelectionTransform(doc, rect, layer)!
      const target = mode === 'resize' ? { ...rect, width: size + 5 } : mode === 'flip' ? { ...rect, flipHorizontal: true } : rect
      const quad = mode === 'quad' ? { nw: { x: 64, y: 50 }, ne: { x: 64 + size, y: 64 }, se: { x: 54 + size, y: 64 + size }, sw: { x: 64, y: 54 + size } } : undefined
      const shear = mode === 'shear' ? { axis: 'x' as const, edge: 'n' as const, amount: 13 } : undefined
      const preview = selectionTransformPreviewPacked(doc, source, target, 0, 0, doc.width, doc.height, 31, shear, layer, undefined, quad, true)
      const ordinary = selectionTransformPreviewPacked(doc, source, target, 0, 0, doc.width, doc.height, 31, shear, layer, undefined, quad, false)
      expect(preview.some((value, i) => value !== ordinary[i])).toBe(true)
      const edit = applySelectionTransform(doc, source, target, 31, false, shear, undefined, undefined, layer, undefined, quad, false, true)
      expect(edit).not.toBeNull()
      const committed = Uint32Array.from(before, (_, i) => readLayerPacked(doc, layer, i))
      expect(committed).toEqual(preview)
      revertPixelEdit(doc, edit)
      expect(Uint32Array.from(before, (_, i) => readLayerPacked(doc, layer, i))).toEqual(before)
    })
  }
})

it.each(['rgba', 'indexed'] as const)('preserves orthogonal quad pixels and excludes masked colours (%s)', (format) => {
  const doc = createDocument('masked RotSprite', 96, 96, format, false)
  const layer = doc.layers[0]
  const rect = { x: 10, y: 10, width: 70, height: 70, mask: new Uint8Array(4900).fill(1) }
  const red = { r: 255, g: 0, b: 0, a: 255 }
  const blue = { r: 0, g: 0, b: 255, a: 255 }
  for (let x = 0; x < 70; x++) {
    writeLayerColor(doc, layer, (10 + x) * 96 + 10 + x, red)
    const offset = x * 70 + 69 - x
    rect.mask[offset] = 0
    writeLayerColor(doc, layer, (10 + x) * 96 + 79 - x, blue)
  }
  const source = captureSelectionTransform(doc, rect, layer)!
  const quads = [
    { nw: { x: 10, y: 10 }, ne: { x: 80, y: 10 }, se: { x: 80, y: 80 }, sw: { x: 10, y: 80 } },
    { nw: { x: 80, y: 10 }, ne: { x: 80, y: 80 }, se: { x: 10, y: 80 }, sw: { x: 10, y: 10 } }
  ]
  for (const quad of quads) {
    const actual = selectionTransformPreviewPacked(doc, source, rect, 0, 0, 96, 96, 0, undefined, layer, undefined, quad, true)
    const expected = selectionTransformPreviewPacked(doc, source, rect, 0, 0, 96, 96, 0, undefined, layer, undefined, quad, false)
    expect(actual).toEqual(expected)
  }
  const preview = selectionTransformPreviewPacked(doc, source, rect, 0, 0, 96, 96, 31, undefined, layer, undefined, undefined, true)
  const redValue = format === 'rgba' ? packColor(red) : readLayerPacked(doc, layer, 10 * 96 + 10)
  expect(preview.some(value => value === redValue)).toBe(true)
  expect(preview.every(value => value === 0 || value === redValue)).toBe(true)
  if (format === 'indexed') {
    const entry = doc.palette.find(entry => entry.id === redValue)!
    entry.color = { ...entry.color, a: 0 }
    expect(selectionTransformPreviewPacked(doc, source, rect, 0, 0, 96, 96, 31, undefined, layer, undefined, undefined, true).every(value => value === 0)).toBe(true)
    entry.color = { ...entry.color, a: 255 }
    expect(selectionTransformPreviewPacked(doc, source, rect, 0, 0, 96, 96, 31, undefined, layer, undefined, undefined, true)).toEqual(preview)
  }
})
