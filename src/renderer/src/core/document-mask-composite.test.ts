import { expect, it } from 'vitest'
import { ensureAnimationDocument } from './animation'
import { compositeRegion, createCompositePointReplacementSampler, createDocument, createLayerMask, writeLayerColor } from './document'

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
