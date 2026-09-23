import { expect, it } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from './document-model'
import { addBlankAnimationFrame, syncActiveAnimationFrame } from './animation'
import { compositeRegion } from './document-composite'
import { DEFAULT_SPRITE_SHEET_IMPORT as defaults, spriteSheetImportPlan, spriteSheetFrameSizeFromCount, buildImportedSpriteSheet } from './sprite-sheet-import'

it.each([
  ['horizontal', [[1, 2], [4, 2], [7, 2]]],
  ['vertical', [[1, 2], [1, 5]]],
  ['rows', [[1, 2], [4, 2], [7, 2], [1, 5], [4, 5], [7, 5]]],
  ['columns', [[1, 2], [1, 5], [4, 2], [4, 5], [7, 2], [7, 5]]]
] as const)('slices %s in Aseprite traversal order with independent origin and spacing', (layout, positions) => {
  const plan = spriteSheetImportPlan({ width: 9, height: 7 }, { ...defaults, layout, x: 1, y: 2, width: 2, height: 2, paddingX: 1, paddingY: 1 })
  expect(plan.tiles.map(tile => [tile.x, tile.y])).toEqual(positions)
})
it('includes partial edge tiles, never treats padding alone as another tile, and derives dimensions from counts', () => {
  const options = { ...defaults, width: 3, height: 3, paddingX: 2, paddingY: 1 }
  expect(spriteSheetImportPlan({ width: 7, height: 6 }, options).count).toBe(1)
  expect(spriteSheetImportPlan({ width: 7, height: 6 }, { ...options, partialTiles: true }).count).toBe(4)
  expect(spriteSheetImportPlan({ width: 5, height: 4 }, { ...options, partialTiles: true }).count).toBe(1)
  expect(spriteSheetFrameSizeFromCount(35, 1, 2, 4)).toBe(7)
})
it('rejects invalid geometry and excessive frame counts before allocation', () => {
  expect(() => spriteSheetImportPlan({ width: 64, height: 64 }, { ...defaults, width: 0 })).toThrow()
  expect(() => spriteSheetImportPlan({ width: 64, height: 64 }, { ...defaults, paddingY: -1 })).toThrow()
  expect(() => spriteSheetImportPlan({ width: 100000, height: 100000 }, { ...defaults, width: 1, height: 1 })).toThrow()
  expect(spriteSheetImportPlan({ width: 8, height: 8 }, defaults).count).toBe(0)
})
it.each(['rgba', 'indexed', 'grayscale'] as const)('flattens only the current visible %s frame and preserves its color mode', async mode => {
  const source = createDocument('sheet', 3, 1, mode, false)
  addBlankAnimationFrame(source)
  writeLayerColor(source, source.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  writeLayerColor(source, source.layers[0], 2, { r: 0, g: 0, b: 255, a: 255 })
  const hidden = createLayer('hidden', 3, 1, mode); hidden.visible = false; source.layers.push(hidden)
  writeLayerColor(source, hidden, 0, { r: 0, g: 255, b: 0, a: 255 })
  syncActiveAnimationFrame(source)
  const original = compositeRegion(source, 0, 0, 3, 1)
  const result = await buildImportedSpriteSheet(source, { ...defaults, width: 2, height: 1, partialTiles: true })
  expect(result.colorMode).toBe(mode)
  expect(result.layers).toHaveLength(1)
  expect(result.animation!.frames).toHaveLength(2)
  expect(compositeRegion(result, 0, 0, 2, 1)).toEqual(original.slice(0, 8))
  const last = result.animation!.cels[1].surface!
  if (mode !== 'indexed') { expect(Array.from(last.pixels).slice(0, 4)).toEqual(Array.from(original).slice(8, 12)); expect(Array.from(last.pixels).slice(4)).toEqual([0, 0, 0, 0]) }
  else expect(last.pixels[1]).toBe(0)
  expect(source.width).toBe(3); expect(source.layers).toHaveLength(2)
  expect(compositeRegion(source, 0, 0, 3, 1)).toEqual(original)
})
it('clips negative origins and strip overflow against the canvas instead of out-of-bounds layer content', async () => {
  const source = createDocument('sheet', 2, 1, 'rgba', false)
  const layer = createLayer('wide', 4, 2, 'rgba'); layer.offsetX = -1; source.layers = [layer]; source.activeLayerId = layer.id
  for (let i = 0; i < 8; i++) writeLayerColor(source, layer, i, { r: 255, g: 0, b: 0, a: 255 })
  const result = await buildImportedSpriteSheet(source, { ...defaults, layout: 'horizontal', x: -1, width: 3, height: 2 })
  const pixels = result.animation!.cels[0].surface!.pixels
  expect(Array.from(pixels).slice(0, 4)).toEqual([0, 0, 0, 0])
  expect(Array.from(pixels).slice(4, 12)).toEqual([255, 0, 0, 255, 255, 0, 0, 255])
  expect(Array.from(pixels).slice(12).every(value => value === 0)).toBe(true)
})
