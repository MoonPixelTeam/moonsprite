import { expect, it } from 'vitest'
import { ensureAnimationDocument } from './animation'
import { compositeRegion, createCompositePointReplacementSampler, createCompositePointSampler, createDocument, createLayer, createLayerMask, writeLayerColor } from './document'
import { simpleLayerMaskLayers } from './document-composite-mask'

it.each([false, true])('previews the first stroke on a neutral mask (group=%s)', (group) => {
  const document = createDocument('mask composite', 2, 1, 'rgba')
  const layer = document.layers[0]
  if (group) {
    document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    layer.groupId = 'group'
  }
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  const timeline = ensureAnimationDocument(document)
  const mask = createLayerMask(group ? 'group' : layer.id, 2, 1, group ? 'group' : 'cel')
  if (group) timeline.groupMasks = [{ groupId: 'group', frameId: timeline.activeFrameId, mask }]
  else timeline.layerMasks = [{ layerId: layer.id, frameId: timeline.activeFrameId, mask }]
  expect(compositeRegion(document, 0, 0, 1, 1)[3]).toBe(255)
  expect(createCompositePointReplacementSampler(document, mask.id)(0, 0, { r: 0, g: 0, b: 0, a: 255 }).a).toBe(0)
  expect(createCompositePointReplacementSampler(document, mask.id)(0, 0, { r: 128, g: 128, b: 128, a: 255 }).a).toBe(128)
  mask.visible = false
  expect(createCompositePointReplacementSampler(document, mask.id)(0, 0, { r: 0, g: 0, b: 0, a: 255 }).a).toBe(255)
  mask.visible = true
  writeLayerColor(document, mask, 0, { r: 0, g: 0, b: 0, a: 255 })
  expect(compositeRegion(document, 0, 0, 1, 1)[3]).toBe(0)
})

it('uses the block compositor for ordinary layer masks', () => {
  const document = createDocument('layer mask raster path', 8, 2, 'rgba')
  const base = document.layers[0]
  const masked = createLayer('masked', 8, 2, 'rgba')
  document.layers.push(masked)
  writeLayerColor(document, base, 1, { r: 30, g: 80, b: 180, a: 255 })
  writeLayerColor(document, masked, 1, { r: 240, g: 40, b: 20, a: 255 })
  writeLayerColor(document, masked, 2, { r: 240, g: 40, b: 20, a: 255 })
  const timeline = ensureAnimationDocument(document)
  const mask = createLayerMask(masked.id, 8, 2, 'cel')
  timeline.layerMasks = [{ layerId: masked.id, frameId: timeline.activeFrameId, mask }]
  writeLayerColor(document, mask, 1, { r: 128, g: 128, b: 128, a: 255 })
  writeLayerColor(document, mask, 2, { r: 0, g: 0, b: 0, a: 255 })

  expect(simpleLayerMaskLayers(document)?.masks.get(masked.id)).toBe(mask)
  const expected = new Uint8ClampedArray(document.width * document.height * 4)
  const sample = createCompositePointSampler(document)
  for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
    const color = sample(x, y)
    const offset = (y * document.width + x) * 4
    expected[offset] = color.r
    expected[offset + 1] = color.g
    expected[offset + 2] = color.b
    expected[offset + 3] = color.a
  }
  expect(compositeRegion(document, 0, 0, document.width, document.height)).toEqual(expected)
})
