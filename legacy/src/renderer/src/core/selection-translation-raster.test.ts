import { expect, it, vi } from 'vitest'
import { createDocument } from './document'
import { captureSelectionTransform, flipSelectionTransformSource } from './tools-selection-transform-source'
import { rasterizeSelectionTransformPacked, rasterizeSimpleSelectionTransformPacked } from './tools-selection-transform-packed'
import * as selectionGeometry from './selection'

it('does not build unused index arrays for a deferred 500px selection capture', () => {
  const document = createDocument('500px capture', 512, 512, 'rgba')
  new Uint32Array(document.layers[0].pixels.buffer).fill(0x80504030)
  const rect = { x: 5, y: 5, width: 500, height: 500 }
  const deferred = captureSelectionTransform(document, rect, undefined, { cacheOpaqueOffsets: false })!
  const reference = captureSelectionTransform(document, rect)!
  expect(deferred.values).toEqual(reference.values)
  expect(deferred.selectedOffsets.length + deferred.opaqueOffsets.length + deferred.opaqueIndices.length + deferred.opaqueValues.length).toBe(0)
})

it.each([false, true])('copies translated pixels without per-pixel geometry, including mirrored sources (mask=%s)', masked => {
  const document = createDocument('translation', 80, 70, 'rgba')
  const layer = document.layers[0]
  for (let i = 0; i < layer.pixels.length; i++) layer.pixels[i] = i % 7 === 0 ? 0 : i % 256
  const selection = { x: 5, y: 7, width: 40, height: 30, mask: masked ? Uint8Array.from({ length: 1200 }, (_, i) => i % 3 ? 1 : 0) : undefined }
  const captured = captureSelectionTransform(document, selection)!
  for (const source of [captured, flipSelectionTransformSource(captured, 'horizontal'), flipSelectionTransformSource(captured, 'vertical')]) {
    for (const target of [{ x: 12, y: 14, width: 40, height: 30 }, { x: -8, y: -3, width: 40, height: 30 }]) {
      const bounds = { x: Math.max(0, target.x), y: Math.max(0, target.y), width: Math.min(40, target.x + 40), height: Math.min(30, target.y + 30) }
      for (const simple of [false, true]) {
        const expected = new Uint32Array(bounds.width * bounds.height)
        for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
          const point = selectionGeometry.transformedSelectionSourcePoint(source.selection, target, bounds.x + x, bounds.y + y)
          if (!point) continue
          const value = source.values[(point.y - source.selection.y) * 40 + point.x - source.selection.x]
          expected[y * bounds.width + x] = simple || value >>> 24 ? value : 0
        }
        const geometry = vi.spyOn(selectionGeometry, 'transformedSelectionSourcePoint')
        const output = new Uint32Array(expected.length)
        if (simple) rasterizeSimpleSelectionTransformPacked(document, source, target, bounds.x, bounds.y, bounds.width, bounds.height, output)
        else rasterizeSelectionTransformPacked(source, target, bounds, output, 0)
        expect(geometry).not.toHaveBeenCalled()
        geometry.mockRestore()
        expect(output).toEqual(expected)
      }
    }
  }
})
