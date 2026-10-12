import { expect, it } from 'vitest'
import { beginPixelEdit } from '@/core/history'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document-model'
import { brushStrokeInvalidationRects, paintLine } from '@/core/tools-brush'
import { mergeOverlappingRects } from './canvas-composite-cache-geometry'

it.each([1, 4, 32, 128])('keeps a fast diagonal %s px stroke local and covers every painted pixel', size => {
  const document = createDocument('diagonal dirty regions', 512, 512, 'rgba', false), layer = document.layers[0]
  const from = { x: 40, y: 30 }, to = { x: 450, y: 430 }
  const edit = beginPixelEdit(layer.id)
  paintLine(document, layer, edit, from.x, from.y, to.x, to.y, size, { r: 255, g: 0, b: 0, a: 255 })
  const sourceRects = brushStrokeInvalidationRects(from, to, size, null, 512, 512)
  const rects = mergeOverlappingRects([...sourceRects, ...sourceRects], 0, 1)
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    if (!readLayerColorAt(document, layer, x, y).a) continue
    expect(rects.some(rect => x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height)).toBe(true)
  }
  if (size <= 32) {
    expect(rects.length).toBeGreaterThan(1)
    expect(rects.reduce((area, rect) => area + rect.width * rect.height, 0)).toBeLessThan((410 + size) * (400 + size) / 3)
  }
})

it.each([0, 37, 90])('covers reflected and repeated eraser stamps with brush rotation %s', angle => {
  const document = createDocument('reflected eraser', 160, 128, 'rgba', false), layer = document.layers[0]
  for (let index = 0; index < 160 * 128; index++) writeLayerColor(document, layer, index, { r: 30, g: 60, b: 90, a: 255 })
  const from = { x: 20, y: 10 }, to = { x: 155, y: 120 }
  const axes = { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: false, rotational: false }
  const edit = beginPixelEdit(layer.id)
  paintLine(document, layer, edit, from.x, from.y, to.x, to.y, 4, { r: 0, g: 0, b: 0, a: 0 }, null, 'square', 'solid', 1, null, undefined, 0, 'paint', undefined, 'raster', axes, undefined, undefined,
    { fromAngle: angle, toAngle: angle }, 'both')
  const rects = brushStrokeInvalidationRects(from, to, 4, null, 160, 128, axes, undefined, 'both', angle)
  for (let y = 0; y < 128; y++) for (let x = 0; x < 160; x++) {
    if (readLayerColorAt(document, layer, x, y).a !== 0) continue
    expect(rects.some(rect => x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height)).toBe(true)
  }
})
