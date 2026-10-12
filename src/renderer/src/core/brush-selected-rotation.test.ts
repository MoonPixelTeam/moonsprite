import { describe, expect, it } from 'vitest'
import { createDocument, createLayerMask, getActiveLayer, isLayerMask } from './document-model'
import { beginPixelEdit, commitPixelEdit, revertPixelEdit } from './history'
import { brushMaskOffsets, paintBrush, paintLine, solidBrushPreviewRowSpans } from './tools-brush'
import { clearReferenceMaskCache, brushMaskOffsets as referenceMask, paintBrush as referenceBrush, paintLine as referenceLine } from './__fixtures__/p01-brush-reference'
import { beginBrushTailEdit } from './tools-pixel-edit-state'
import type { SelectionMask } from '@shared/types-selection'
import type { BrushShape } from '@shared/types-brush'
import type { SymmetryAxes } from './symmetry'

const same = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
const axes: SymmetryAxes[] = [
  { horizontal: false, vertical: false, diagonalUp: false, diagonalDown: false },
  { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: false },
  { horizontal: false, vertical: false, diagonalUp: true, diagonalDown: true, rotational: true }
]
const islandSelection = (): SelectionMask => ({ x: 14, y: 9, width: 100, height: 108,
  mask: Uint8Array.from({ length: 100 * 108 }, (_, i) => [0, 1, 1, 2, 255][(i * 37 + Math.floor(i / 100)) % 5]) })

describe('selected and rotated uniform brush spans', () => {
  it('matches exact frozen footprints including empty rows and near rounding boundaries', () => {
    let cases = 0
    for (const size of [1, 2, 31, 32, 63, 64, 65]) for (const angle of [0, -0.0001, 0.0001, 0.0001001, 12.3451, 12.3454, 30, 45, 89.999, 90, 180, 359]) {
      clearReferenceMaskCache()
      const expected = referenceMask(size, 'square', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, angle)
      const actual = solidBrushPreviewRowSpans(size, 'square', angle).flatMap(span => Array.from({ length: Math.max(0, span.right - span.left + 1) }, (_, i) => ({ x: span.left + i, y: span.y })))
      expect(actual.length, `${size}/${angle}`).toBe(expected.length)
      expect(actual.every((p, i) => p.x === expected[i].x && p.y === expected[i].y)).toBe(true)
      cases++
    }
    expect(cases).toBe(84)
    const a = brushMaskOffsets(64, 'square', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, 27)
    expect(brushMaskOffsets(64, 'square', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, 27) === a).toBe(true)
  })

  it.each(['rgba', 'indexed', 'grayscale'] as const)('preserves pixels, dirty rect and undo/redo in %s', mode => {
    for (const shape of ['square', 'round', 'line'] as BrushShape[]) for (const symmetry of axes) for (const selection of [null, { x: 10, y: 9, width: 105, height: 113 }, islandSelection()]) {
      const document = createDocument('P01', 128, 128, mode)
      const reference = createDocument('frozen', 128, 128, mode)
      const layer = getActiveLayer(document), refLayer = getActiveLayer(reference)
      if (layer.format === 'rgba') for (let i = 0; i < layer.pixels.length; i++) layer.pixels[i] = i * 13 % 256
      else layer.pixels.fill(1)
      if (mode === 'grayscale') for (let i = 0; i < layer.pixels.length; i += 4) {
        layer.pixels[i + 1] = layer.pixels[i]; layer.pixels[i + 2] = layer.pixels[i]
      }
      refLayer.pixels.set(layer.pixels)
      const before = layer.pixels.slice()
      const edit = beginPixelEdit(layer.id), refEdit = beginPixelEdit(refLayer.id)
      for (const [x, y, angle, alpha, opacity, size] of [[60, 60, 27, 255, 1, 64], [61, 62, 27, 255, 0.3, 64], [65, 63, 27, 255, 1, 64], [70, 65, -31, 128, 0.7, 63], [60, 60, 45, 0, 0.5, 64], [-2, 10, 90, 0, 1, 64]]) {
        const color = { r: alpha === 0 ? 0 : 230, g: 30, b: 40, a: alpha }
        const center = { x: 63.5, y: 64.5 }
        paintBrush(document, layer, edit, x, y, size, color, shape, selection, 'solid', 1, null, undefined, 0, 'paint', undefined, symmetry, center, undefined, opacity, undefined, false, undefined, 'off', undefined, angle)
        // Full selection forces the independent general path, including when
        // the old unselected compact recorder cannot handle changing pressure.
        referenceBrush(reference, refLayer, refEdit, x, y, size, color, shape, selection ?? { x: 0, y: 0, width: 128, height: 128 }, 'solid', 1, null, undefined, 0, 'paint', undefined, symmetry, center, undefined, opacity, undefined, false, undefined, 'off', undefined, angle)
        expect(same(layer.pixels, refLayer.pixels), `${shape}/${Boolean(selection)}/${x}/${opacity}/${angle}`).toBe(true)
        expect(edit.dirtyRect).toEqual(refEdit.dirtyRect)
      }
      const after = layer.pixels.slice()
      const entry = commitPixelEdit(document, edit, 'P01')
      if (!entry) { expect(same(after, before)).toBe(true); continue }
      entry.undo(); expect(same(layer.pixels, before)).toBe(true)
      entry.redo(); expect(same(layer.pixels, after)).toBe(true)
    }
  })

  it('keeps split-tail coverage, mask targets and compact layer expansion exact', () => {
    for (const maskTarget of [false, true]) {
      const doc = createDocument('split', 128, 128, 'rgba'), ref = createDocument('ref', 128, 128, 'rgba')
      const layer = maskTarget ? createLayerMask(doc.layers[0].id, 128, 128) : doc.layers[0]
      const refLayer = maskTarget ? createLayerMask(ref.layers[0].id, 128, 128) : ref.layers[0]
      if (isLayerMask(layer) && isLayerMask(refLayer)) { doc.animation!.layerMasks!.push({ layerId: doc.layers[0].id, frameId: 'frame-1', mask: layer }); ref.animation!.layerMasks!.push({ layerId: ref.layers[0].id, frameId: 'frame-1', mask: refLayer }) }
      const edit = beginPixelEdit(layer.id), refEdit = beginPixelEdit(refLayer.id)
      const selection = islandSelection(), color = { r: 220, g: 25, b: 30, a: 128 }
      const draw = (target: typeof doc, surface: typeof layer, entry: typeof edit, baseline: boolean, x: number) => (baseline ? referenceBrush : paintBrush)(target, surface, entry, x, 60, 64, color, 'square', selection, 'solid', 1, null, undefined, 0, 'paint', undefined, axes[1], undefined, undefined, 0.6, undefined, false, undefined, 'off', undefined, 27)
      draw(doc, layer, edit, false, 54); draw(ref, refLayer, refEdit, true, 54)
      let tail = beginBrushTailEdit(edit), refTail = beginBrushTailEdit(refEdit)
      draw(doc, layer, tail, false, 62); draw(ref, refLayer, refTail, true, 62)
      expect(same(layer.pixels, refLayer.pixels)).toBe(true)
      revertPixelEdit(doc, tail); revertPixelEdit(ref, refTail)
      tail = beginBrushTailEdit(edit); refTail = beginBrushTailEdit(refEdit)
      draw(doc, layer, tail, false, 58); draw(ref, refLayer, refTail, true, 58)
      expect(same(layer.pixels, refLayer.pixels)).toBe(true)
    }
    const doc = createDocument('compact', 128, 128, 'rgba'), ref = createDocument('ref compact', 128, 128, 'rgba')
    for (const layer of [doc.layers[0], ref.layers[0]]) { layer.width = 16; layer.height = 16; layer.offsetX = 20; layer.offsetY = 20; layer.pixels = new Uint8ClampedArray(16 * 16 * 4) }
    const edit = beginPixelEdit(doc.layers[0].id), refEdit = beginPixelEdit(ref.layers[0].id)
    paintLine(doc, doc.layers[0], edit, 24, 25, 65, 40, 64, { r: 230, g: 30, b: 40, a: 255 }, islandSelection(), 'square')
    referenceLine(ref, ref.layers[0], refEdit, 24, 25, 65, 40, 64, { r: 230, g: 30, b: 40, a: 255 }, islandSelection(), 'square')
    expect(same(doc.layers[0].pixels, ref.layers[0].pixels)).toBe(true)
    expect(edit.dirtyRect).toEqual(refEdit.dirtyRect)
  })

  it('keeps an opaque compact prefix when a lower-pressure split tail crosses it', () => {
    const doc = createDocument('opaque prefix', 128, 128, 'rgba'), ref = createDocument('reference', 128, 128, 'rgba')
    const selection = { x: 0, y: 0, width: 128, height: 128 }, color = { r: 230, g: 30, b: 40, a: 255 }
    const edit = beginPixelEdit(doc.layers[0].id), refEdit = beginPixelEdit(ref.layers[0].id)
    paintBrush(doc, doc.layers[0], edit, 50, 50, 64, color, 'round')
    referenceBrush(ref, ref.layers[0], refEdit, 50, 50, 64, color, 'round', selection)
    for (const x of [55, 58]) {
      const tail = beginBrushTailEdit(edit), refTail = beginBrushTailEdit(refEdit)
      paintBrush(doc, doc.layers[0], tail, x, 50, 64, color, 'round', null, 'solid', 1, null, undefined, 0, 'paint', undefined, undefined, undefined, undefined, 0.3)
      referenceBrush(ref, ref.layers[0], refTail, x, 50, 64, color, 'round', selection, 'solid', 1, null, undefined, 0, 'paint', undefined, undefined, undefined, undefined, 0.3)
      expect(same(doc.layers[0].pixels, ref.layers[0].pixels)).toBe(true)
      revertPixelEdit(doc, tail); revertPixelEdit(ref, refTail)
      expect(same(doc.layers[0].pixels, ref.layers[0].pixels)).toBe(true)
    }
  })

  it('keeps separate coverage keys when different RGB colors normalize to the same gray', () => {
    const doc = createDocument('gray coverage', 128, 128, 'grayscale'), ref = createDocument('reference', 128, 128, 'grayscale')
    const edit = beginPixelEdit(doc.layers[0].id), refEdit = beginPixelEdit(ref.layers[0].id)
    const first = { r: 1, g: 0, b: 0, a: 255 }, second = { r: 0, g: 0, b: 0, a: 255 }
    for (const [color, opacity] of [[first, 1], [second, 1], [first, 0.3]] as const) {
      paintBrush(doc, doc.layers[0], edit, 50, 50, 64, color, 'round', null, 'solid', 1, null, undefined, 0, 'paint', undefined, undefined, undefined, undefined, opacity)
      referenceBrush(ref, ref.layers[0], refEdit, 50, 50, 64, color, 'round', { x: 0, y: 0, width: 128, height: 128 }, 'solid', 1, null, undefined, 0, 'paint', undefined, undefined, undefined, undefined, opacity)
      expect(same(doc.layers[0].pixels, ref.layers[0].pixels)).toBe(true)
    }
    const after = doc.layers[0].pixels.slice(), entry = commitPixelEdit(doc, edit, 'gray coverage')!
    entry.undo(); expect(doc.layers[0].pixels.every(v => v === 0)).toBe(true)
    entry.redo(); expect(same(doc.layers[0].pixels, after)).toBe(true)
  })
})
