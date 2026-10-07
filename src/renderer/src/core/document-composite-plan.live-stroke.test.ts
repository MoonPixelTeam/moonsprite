import { afterEach, expect, it, vi } from 'vitest'
import * as model from './document-model'
import { normalCompositeLayers, opacityGroupCompositeStack } from './document-composite-plan'
import { createPreviewProjectedRenderer } from './preview-projected-renderer'

afterEach(() => vi.restoreAllMocks())

it('does not rescan a 4K bitmap while rebuilding live stroke compositors, and includes newly painted pixels', () => {
  const document = model.createDocument('4K live input', 4096, 4096, 'rgba', false)
  const layer = document.layers[0]
  expect(normalCompositeLayers(document)).toEqual([])
  const scan = vi.spyOn(model, 'layerContentBounds')
  for (let i = 0; i < 64; i++) {
    const x = 100 + i, y = 200 + i
    model.writeLayerColor(document, layer, y * layer.width + x, { r: 20, g: 40, b: 220, a: 255 })
    expect(normalCompositeLayers(document)).toEqual([layer])
    expect(opacityGroupCompositeStack(document)).toHaveLength(1)
    const renderer = createPreviewProjectedRenderer(document)!
    const output = new Uint8ClampedArray(4)
    renderer(Int32Array.of(x), Int32Array.of(y), output)
    expect([...output]).toEqual([20, 40, 220, 255])
  }
  expect(scan).not.toHaveBeenCalled()
})

it('still skips cold and known-empty blended layers, while retaining unknown edited sources', () => {
  const document = model.createDocument('empty blend', 16, 16, 'rgba', false)
  const layer = document.layers[0]
  layer.blendMode = 'multiply'
  expect(normalCompositeLayers(document)).toEqual([])
  model.writeLayerColor(document, layer, 0, { r: 30, g: 20, b: 10, a: 255 })
  expect(normalCompositeLayers(document)).toBeNull()
  expect(opacityGroupCompositeStack(document)).toHaveLength(1)
  model.writeLayerColor(document, layer, 0, { r: 0, g: 0, b: 0, a: 0 })
  // Unknown bounds must take the conservative path, including after erasing.
  expect(normalCompositeLayers(document)).toBeNull()
  expect(model.layerContentBounds(document, layer)).toBeNull()
  expect(normalCompositeLayers(document)).toEqual([])
  expect(opacityGroupCompositeStack(document)).toEqual([])
})
