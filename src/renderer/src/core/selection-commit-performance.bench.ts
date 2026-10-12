import { bench, describe } from 'vitest'
import { createDocument, getActiveLayer } from './document-model'
import { commitPixelEdit } from './history'
import { applySelectionTranslationCommit } from './tools-selection-transform-translation'
import { applySelectionTransform } from './tools-selection-transform-apply'
import { captureSelectionTransform } from './tools-selection-transform-source'
import type { SelectionTransformSource } from './tools-selection-transform-types'

describe('1550x1600 clipboard translation and undo construction', () => {
  for (const [name, value, background] of [
    ['opaque over color', 0xff3377cc, 0xff997711],
    ['translucent over transparent', 0x803377cc, 0],
    ['translucent over color', 0x803377cc, 0xff997711]
  ] as const) {
    const document = createDocument(name, 1550, 1600, 'rgba')
    const layer = getActiveLayer(document)
    const pixels = new Uint32Array(layer.pixels.buffer, layer.pixels.byteOffset, 1550 * 1600)
    const selection = { x: 0, y: 0, width: 1550, height: 1600 }
    const source: SelectionTransformSource = {
      selection, values: new Uint32Array(1550 * 1600).fill(value),
      selectedOffsets: new Uint32Array(0), opaqueOffsets: new Uint32Array(0),
      opaqueIndices: new Uint32Array(0), opaqueValues: new Uint32Array(0), origin: 'clipboard'
    }
    bench(name, () => {
      pixels.fill(background)
      const edit = applySelectionTranslationCommit(document, source, selection, true, layer)
      if (!edit || !commitPixelEdit(document, edit, 'paste')) throw new Error('missing paste history')
    }, { iterations: 10, warmupIterations: 3, time: 0, warmupTime: 0 })
  }
})

describe('1550x1600 selection scale commit', () => {
  const document = createDocument('selection scale commit', 1550, 1600, 'rgba')
  const layer = getActiveLayer(document)
  const pixels = new Uint32Array(layer.pixels.buffer, layer.pixels.byteOffset, 1550 * 1600)
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = i % 11 === 0 ? 0 : (0xff000000 | (i * 2654435761)) >>> 0
  const original = pixels.slice()
  const source = captureSelectionTransform(document, { x: 80, y: 120, width: 1024, height: 768 }, layer)!
  const target = { x: 120, y: 160, width: 1331, height: 922 }
  bench('scale', () => {
    pixels.set(original)
    applySelectionTransform(document, source, target, 0, false, undefined, undefined, undefined, layer)
  }, { iterations: 5, warmupIterations: 2, time: 0, warmupTime: 0 })
})
