import { bench, describe } from 'vitest'
import { createDocument, getActiveLayer } from './document-model'
import { commitPixelEdit } from './history'
import { applySelectionTranslationCommit } from './tools-selection-transform-translation'
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
