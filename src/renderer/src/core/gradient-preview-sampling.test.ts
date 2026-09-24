import { describe, expect, it, vi } from 'vitest'
import { createDocument, createLayer, createLayerMask, writeLayerColor } from './document'
import { ensureAnimationDocument } from './animation'
import { compileCompositePointSampler } from './document-composite-sampling'
import { createGradientReplacementSampler } from './gradient-preview-sampling'
import { createDefaultLayerStyles } from './layer-styles'
import * as stylesModule from './layer-styles'

const fixture = (grouped: boolean, clipped: boolean) => {
  const document = createDocument('styled gradient', 16, 12, 'rgba')
  document.layers.push(...Array.from({ length: 3 }, (_, i) => createLayer(`layer ${i}`, 16, 12, 'rgba')))
  for (const [index, layer] of document.layers.entries()) {
    layer.opacity = index === 1 ? 0.6 : 1
    layer.blendMode = index === 2 ? 'multiply' : 'normal'
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    layer.layerStyles.stroke.size = 3
    layer.layerStyles.stroke.position = 'both'
    layer.layerStyles.stroke.smartHue = true
    layer.layerStyles.stroke.followOpacity = true
    layer.layerStyles.shadow.enabled = true
    layer.layerStyles.shadow.blur = 2
    for (let y = 2; y < 10; y += 1) for (let x = 2; x < 14; x += 1) {
      writeLayerColor(document, layer, y * 16 + x, { r: (x * 47 + index * 11) % 256, g: y * 17, b: 91, a: [0, 80, 255][(x + y + index) % 3] })
    }
  }
  if (grouped) {
    const groupStyle = createDefaultLayerStyles()
    groupStyle.innerGlow.enabled = true
    groupStyle.gradientOverlay.enabled = true
    document.groups.push(
      { id: 'outer', name: 'Outer', visible: true, locked: false, opacity: 0.7, blendMode: 'normal', layerStyles: groupStyle },
      { id: 'inner', parentGroupId: 'outer', name: 'Inner', visible: true, locked: false, opacity: 0.8, blendMode: 'multiply', cumulativeBlend: true })
    document.layers[1].groupId = 'inner'
    document.layers[2].groupId = 'inner'
  }
  document.layers[2].clippingMask = clipped
  return document
}

describe('cached gradient replacement sampling', () => {
  it.each([[false, false], [false, true], [true, false], [true, true]])('preserves styled pixels and blend order (groups=%s, clipping=%s)', (grouped, clipped) => {
    const document = fixture(grouped, clipped)
    const timeline = ensureAnimationDocument(document)
    const active = document.layers[1]
    const mask = createLayerMask(active.id, 16, 12, 'cel')
    writeLayerColor(document, mask, 5 * 16 + 5, { r: 90, g: 90, b: 90, a: 255 })
    timeline.layerMasks = [{ layerId: active.id, frameId: timeline.activeFrameId, mask }]
    const groupMask = createLayerMask('outer', 16, 12, 'group')
    if (grouped) timeline.groupMasks = [{ groupId: 'outer', frameId: timeline.activeFrameId, mask: groupMask }]
    for (const target of [active.id, mask.id, ...(grouped ? [groupMask.id] : [])]) {
      const reference = compileCompositePointSampler(document, target)
      const cached = createGradientReplacementSampler(document, target, { x: 3, y: 2, width: 8, height: 7 })
      // Includes cache hits, transparent replacements, and samples outside the
      // cached crop where style neighborhoods still read the original source.
      for (const alpha of [255, 80, 0, 173]) {
        const replacement = { r: alpha, g: 200, b: 31, a: alpha }
        const actual: number[] = [], expected: number[] = []
        for (let y = 1; y < 11; y += 1) for (let x = 1; x < 15; x += 1) {
          const a = cached(x, y, replacement), b = reference(x, y, replacement)
          actual.push(a.r, a.g, a.b, a.a)
          expected.push(b.r, b.g, b.b, b.a)
        }
        expect(actual).toEqual(expected)
      }
    }
  })

  it('reuses unchanged styled layers while still updating the active gradient color', () => {
    const document = fixture(false, false)
    const active = document.layers[1]
    const cached = createGradientReplacementSampler(document, active.id, { x: 0, y: 0, width: 16, height: 12 })
    cached(5, 5, { r: 20, g: 30, b: 40, a: 255 })
    const spy = vi.spyOn(stylesModule, 'applyLayerStylesAt')
    const replacement = { r: 210, g: 50, b: 60, a: 128 }
    let result
    try {
      result = cached(5, 5, replacement)
      expect(spy).toHaveBeenCalledTimes(1)
    } finally { spy.mockRestore() }
    expect(result).toEqual(compileCompositePointSampler(document, active.id)(5, 5, replacement))
    // The live sampler remains uncached; a new gradient sampler must see edits.
    const live = compileCompositePointSampler(document, active.id)
    writeLayerColor(document, document.layers[3], 5 * 16 + 5, { r: 9, g: 240, b: 10, a: 255 })
    const rebuilt = createGradientReplacementSampler(document, active.id, { x: 0, y: 0, width: 16, height: 12 })
    expect(rebuilt(5, 5, replacement)).toEqual(live(5, 5, replacement))
  })
})
