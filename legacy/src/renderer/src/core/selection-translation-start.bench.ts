import { bench, describe } from 'vitest'
import { transformedSelectionSourcePoint } from './selection'
import { rasterizeSelectionTransformPacked } from './tools-selection-transform-packed'
import type { SelectionTransformSource } from './tools-selection-transform-types'

describe('2048px selection first translation raster', () => {
  const selection = { x: 0, y: 0, width: 2048, height: 2048 }
  const source: SelectionTransformSource = { selection, values: new Uint32Array(2048 * 2048).fill(0x80603020),
    selectedOffsets: new Uint32Array(0), opaqueOffsets: new Uint32Array(0), opaqueIndices: new Uint32Array(0), opaqueValues: new Uint32Array(0), origin: 'selection' }
  const target = { ...selection, x: 1, y: 1 }
  for (const bulk of [false, true]) bench(bulk ? 'row copy' : 'per-pixel inverse mapping', () => {
    const output = new Uint32Array(source.values.length)
    if (bulk) rasterizeSelectionTransformPacked(source, target, target, output, 0)
    else for (let y = 1; y <= 2048; y++) for (let x = 1; x <= 2048; x++) {
      const point = transformedSelectionSourcePoint(selection, target, x, y)
      if (point) output[(y - 1) * 2048 + x - 1] = source.values[point.y * 2048 + point.x]
    }
  }, { iterations: 5, warmupIterations: 2, time: 0, warmupTime: 0 })
})
