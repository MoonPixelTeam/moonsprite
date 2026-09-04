import { describe, expect, it } from 'vitest'
import { compositeDocument, createDocument, createLayer, getActiveLayer, writeLayerColor } from './document'
import { mergeLayerGroup, mergeRasterLayers, mergeVisibleLayers } from './layer-merge'

const red = { r: 255, g: 0, b: 0, a: 180 }
const blue = { r: 0, g: 80, b: 255, a: 255 }
const green = { r: 0, g: 220, b: 80, a: 160 }

describe('layer merging', () => {
  it('merges contiguous raster layers without changing their normal-mode result', () => {
    const document = createDocument('layers', 1, 1, 'rgba')
    const bottom = getActiveLayer(document)
    bottom.name = 'Bottom'
    writeLayerColor(document, bottom, 0, blue)
    const top = createLayer('Top', 1, 1, 'rgba')
    writeLayerColor(document, top, 0, red)
    document.layers.push(top)
    const before = compositeDocument(document)

    const result = mergeRasterLayers(document, [bottom.id, top.id])

    expect(result.ok).toBe(true)
    expect(document.layers).toHaveLength(1)
    expect(document.layers[0].name).toBe('Top 合并')
    expect(Array.from(compositeDocument(document))).toEqual(Array.from(before))
  })

  it('flattens a nested group while preserving the outer group properties and visual result', () => {
    const document = createDocument('group', 1, 1, 'rgba')
    const background = getActiveLayer(document)
    writeLayerColor(document, background, 0, blue)
    const first = createLayer('First', 1, 1, 'rgba')
    first.groupId = 'parent'
    writeLayerColor(document, first, 0, red)
    const second = createLayer('Second', 1, 1, 'rgba')
    second.groupId = 'child'
    writeLayerColor(document, second, 0, green)
    document.layers.push(first, second)
    document.groups.push(
      { id: 'parent', name: 'Effects', parentGroupId: null, visible: true, locked: false, opacity: 0.65, blendMode: 'screen' },
      { id: 'child', name: 'Child', parentGroupId: 'parent', visible: true, locked: false, opacity: 0.7, blendMode: 'normal' }
    )
    const before = compositeDocument(document)

    const result = mergeLayerGroup(document, 'parent')

    expect(result.ok).toBe(true)
    expect(document.groups).toHaveLength(0)
    expect(document.layers).toHaveLength(2)
    const merged = document.layers[1]
    expect(merged).toMatchObject({ name: 'Effects', opacity: 0.65, blendMode: 'screen', visible: true })
    expect(Array.from(compositeDocument(document))).toEqual(Array.from(before))
  })





  it('bakes selected blend modes into the merged layer', () => {
    const document = createDocument('blend mode', 1, 1, 'rgba')
    const bottom = getActiveLayer(document)
    writeLayerColor(document, bottom, 0, blue)
    const top = createLayer('Multiply', 1, 1, 'rgba')
    writeLayerColor(document, top, 0, red)
    top.blendMode = 'multiply'
    document.layers.push(top)
    const before = compositeDocument(document)

    const result = mergeRasterLayers(document, [bottom.id, top.id])

    expect(result.ok).toBe(true)
    expect(document.layers).toHaveLength(1)
    expect(Array.from(compositeDocument(document))).toEqual(Array.from(before))
  })
})
