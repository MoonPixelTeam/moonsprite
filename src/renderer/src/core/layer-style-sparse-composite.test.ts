import { expect, it, vi } from 'vitest'
import { compositeRegion, createDocument, createLayer, DocumentCompositeCache, writeLayerColor } from './document'
import { compileCompositePointSampler } from './document-composite-sampling'
import { createDefaultLayerStyles } from './layer-styles'

it.each(['stroke', 'shadow', 'innerGlow', 'colorOverlay'] as const)(
  'does not evaluate %s in transparent regions of a complex 4K / 100-layer document', effect => {
    const document = createDocument('sparse complex styles', 4096, 4096, 'rgba', false)
    const target = document.layers[0]
    document.layers.unshift(...Array.from({ length: 99 }, (_, index) => createLayer(`empty ${index}`, 1, 1, 'rgba')))
    target.groupId = 'complex'
    document.groups.push({ id: 'complex', name: 'Complex', visible: true, locked: false, opacity: 0.8, blendMode: 'multiply', cumulativeBlend: true })
    for (let y = 2048; y < 2064; y++) for (let x = 2048; x < 2064; x++) {
      writeLayerColor(document, target, y * target.width + x, { r: 180, g: 80, b: 40, a: 128 })
    }
    target.layerStyles = createDefaultLayerStyles()
    target.layerStyles[effect].enabled = true
    const cache = new DocumentCompositeCache()
    const prepare = vi.spyOn(cache, 'isolatedStyleReader')
    const sample = compileCompositePointSampler(document, undefined, cache, 1)
    // Probe every 64px tile in the canvas outside the small affected area.
    // No style tiles may be prepared, even on this cold render.
    for (let y = 0; y < 4096; y += 64) for (let x = 0; x < 4096; x += 64) {
      if (x === 2048 && y === 2048) continue
      expect(sample(x, y, undefined).a).toBe(0)
    }
    expect(prepare).not.toHaveBeenCalled()
    const outside = cache.propertyRegion(document, { x: 0, y: 0, width: 128, height: 128 }, 1,
      { compositeOnly: true, propertyOwnerIds: [target.id], fromRevision: 0, revision: 1 })
      ?? compositeRegion(document, 0, 0, 128, 128, cache, 1)
    expect(outside.every(value => value === 0)).toBe(true)
    expect(prepare).not.toHaveBeenCalled()
    // The content and its expanded effects still match the uncached renderer.
    const expected = compositeRegion(document, 2040, 2040, 40, 40)
    expect(expected.some(value => value !== 0)).toBe(true)
    expect(compositeRegion(document, 2040, 2040, 40, 40, cache, 1)).toEqual(expected)
    expect(prepare).toHaveBeenCalled()
  }
)

it('keeps replacement previews outside the existing content bounds', () => {
  const document = createDocument('replacement outside bounds', 16, 16, 'rgba', false)
  const layer = document.layers[0]
  layer.groupId = 'group'
  document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
  const sample = compileCompositePointSampler(document, layer.id)
  const color = { r: 200, g: 80, b: 40, a: 255 }
  expect(sample(12, 12, color)).toEqual(color)
  expect(sample(12, 12, undefined).a).toBe(0)
})
