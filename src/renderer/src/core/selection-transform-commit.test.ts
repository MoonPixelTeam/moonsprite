import { describe, expect, it } from 'vitest'
import type { SelectionMask, SelectionQuad, SelectionRect } from '@shared/types-selection'
import { createDocument, ensureLayerCoversCanvas, expandLayerToRect, getActiveLayer, layerIndexAt } from './document'
import { beginPixelEdit, commitPixelEdit, recordPixel, revertPixelEdit } from './history'
import { selectionContains, type SelectionShearTransform } from './selection'
import { applySelectionTransform } from './tools-selection-transform-apply'
import { applyPackedSelectionTransform } from './tools-selection-transform-commit'
import { selectionTransformCells, selectionTransformPreviewPacked, selectionTransformPreviewRasterPacked } from './tools-selection-transform-raster'
import { captureSelectionTransform } from './tools-selection-transform-source'
import { compositeSelectionPixelForEdit } from './tools-pixel-edit'

const cases: Array<{ name: string; target: SelectionRect; angle: number; shear?: SelectionShearTransform; quad?: SelectionQuad; optimized?: boolean }> = [
  { name: 'scale', target: { x: 20, y: 18, width: 40, height: 30 }, angle: 0 },
  { name: 'fractional scale', target: { x: 20.3, y: 18.7, width: 40.4, height: 30.8 }, angle: 0 },
  { name: 'rotate', target: { x: 19, y: 17, width: 24, height: 20 }, angle: 23 },
  { name: 'rotate at edge', target: { x: -4, y: 2, width: 24, height: 20 }, angle: -37 },
  { name: 'rotate and scale', target: { x: 20, y: 18, width: 40, height: 30 }, angle: 48 },
  { name: 'shear', target: { x: 20, y: 18, width: 24, height: 20 }, angle: 0, shear: { axis: 'x', amount: 12, edge: 's' } },
  { name: 'vertical shear', target: { x: 20, y: 18, width: 24, height: 20 }, angle: 18, shear: { axis: 'y', amount: -9, edge: 'e' } },
  { name: 'flip', target: { x: 20, y: 18, width: 40, height: 30, flipHorizontal: true, flipVertical: true, flipOriginX: 20, flipOriginY: 18 }, angle: 0 },
  { name: 'outside', target: { x: 90, y: 80, width: 40, height: 30 }, angle: 0 },
  { name: 'quad', target: { x: 20, y: 18, width: 40, height: 30 }, angle: 0, quad: { nw: { x: 2, y: 3 }, ne: { x: 50, y: 8 }, se: { x: 55, y: 50 }, sw: { x: 15, y: 40 } } },
  { name: 'rotsprite', target: { x: 19, y: 17, width: 24, height: 20 }, angle: 23, optimized: true }
]

function fixture() {
  const document = createDocument('Transform test', 80, 64, 'rgba')
  const layer = getActiveLayer(document)
  ensureLayerCoversCanvas(document, layer)
  const pixels = new Uint32Array(layer.pixels.buffer)
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = i % 7 === 0 ? 0 : ((i % 5 === 0 ? 0x80000000 : 0xff000000) | ((i * 123457) & 0xffffff)) >>> 0
  return { document, layer }
}

describe('packed selection transform commit', () => {
  for (const masked of [false, true]) for (const copy of [false, true]) {
    it.each(cases)(`matches legacy pixels and undo/redo ($name, mask=${masked}, copy=${copy})`, ({ target, angle, shear, quad, optimized }) => {
      const { document, layer } = fixture()
      const selection: SelectionMask = { x: 16, y: 14, width: 24, height: 20 }
      if (masked) selection.mask = Uint8Array.from({ length: 480 }, (_, i) => i % 3 === 0 ? 0 : 1)
      const source = captureSelectionTransform(document, selection, layer)!
      const original = layer.pixels.slice()
      const reference = beginPixelEdit(layer.id)
      if (!copy) for (let y = selection.y; y < selection.y + selection.height; y += 1) for (let x = selection.x; x < selection.x + selection.width; x += 1) {
        if (selectionContains(selection, x, y)) recordPixel(document, layer, reference, layerIndexAt(layer, x, y)!, 0)
      }
      for (const cell of selectionTransformCells(document, source, target, angle, shear, layer, quad, false, optimized)) {
        if ((cell.value >>> 24) === 0) continue
        const index = layerIndexAt(layer, cell.x, cell.y)!
        recordPixel(document, layer, reference, index, !copy && selectionContains(selection, cell.x, cell.y) ? cell.value : compositeSelectionPixelForEdit(document, layer, reference, index, cell.value))
      }
      const expected = layer.pixels.slice()
      revertPixelEdit(document, reference)
      selectionTransformPreviewRasterPacked(document, source, target, angle, shear, layer, quad, optimized)
      const edit = applySelectionTransform(document, source, target, angle, copy, shear, undefined, undefined, layer, undefined, quad, false, optimized)
      expect(layer.pixels).toEqual(expected)
      if (!edit) { expect(expected).toEqual(original); return }
      expect(edit.before.size).toBe(0)
      expect(edit.denseRegion).toBeDefined()
      const entry = commitPixelEdit(document, edit, 'Transform')!
      entry.undo()
      expect(layer.pixels).toEqual(original)
      entry.redo()
      expect(layer.pixels).toEqual(expected)
    })
  }

  it('restores storage coordinates after the layer expands beyond the canvas', () => {
    const { document, layer } = fixture()
    const original = layer.pixels.slice()
    const source = captureSelectionTransform(document, { x: 16, y: 14, width: 24, height: 20 }, layer)!
    const edit = applySelectionTransform(document, source, cases[0].target)!
    const transformed = layer.pixels.slice()
    const entry = commitPixelEdit(document, edit, 'Scale')!
    expandLayerToRect(layer, -10, -8, 90, 72)
    const canvasPixels = () => {
      const result = new Uint8ClampedArray(80 * 64 * 4)
      for (let row = 0; row < 64; row += 1) result.set(layer.pixels.subarray(((row + 8) * 100 + 10) * 4, ((row + 8) * 100 + 90) * 4), row * 80 * 4)
      return result
    }
    entry.undo(); expect(canvasPixels()).toEqual(original)
    entry.redo(); expect(canvasPixels()).toEqual(transformed)
  })

  it('retains full-neighbor rotation behavior for cropped preview requests', () => {
    const { document, layer } = fixture()
    const source = captureSelectionTransform(document, { x: 16, y: 14, width: 24, height: 20 }, layer)!
    const target = cases[2].target
    const expected = new Uint32Array(10 * 10)
    for (const cell of selectionTransformCells(document, source, target, 23, undefined, layer)) {
      if (cell.x >= 20 && cell.y >= 20 && cell.x < 30 && cell.y < 30) expected[(cell.y - 20) * 10 + cell.x - 20] = cell.value
    }
    expect(selectionTransformPreviewPacked(document, source, target, 20, 20, 10, 10, 23, undefined, layer)).toEqual(expected)
  })

  it('falls back for color formats requiring normalization', () => {
    const { document, layer } = fixture()
    const source = captureSelectionTransform(document, { x: 16, y: 14, width: 24, height: 20 }, layer)!
    document.colorMode = 'grayscale'
    expect(applyPackedSelectionTransform(document, layer, source, cases[0].target, 0, false)).toBeUndefined()
  })

  it('reuses only the matching immutable capture and transform geometry', () => {
    const { document, layer } = fixture()
    const selection = { x: 16, y: 14, width: 24, height: 20 }
    const source = captureSelectionTransform(document, selection, layer)!
    const target = cases[0].target
    const first = selectionTransformPreviewRasterPacked(document, source, target, 0, undefined, layer)
    expect(selectionTransformPreviewRasterPacked(document, source, { ...target }, 0, undefined, layer).pixels).toBe(first.pixels)
    expect(selectionTransformPreviewRasterPacked(document, source, target, 4, undefined, layer).pixels).not.toBe(first.pixels)
    expect(selectionTransformPreviewRasterPacked(document, source, { ...target, flipHorizontal: true }, 0, undefined, layer).pixels).not.toBe(first.pixels)
    expect(selectionTransformPreviewRasterPacked(document, captureSelectionTransform(document, selection, layer)!, target, 0, undefined, layer).pixels).not.toBe(first.pixels)
  })
})
