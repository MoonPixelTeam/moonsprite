import { beforeAll, describe, expect, it } from 'vitest'
import { initializeCanvas, readPsd } from 'ag-psd'
import type { AnimationCel, LayerGroup } from '@shared/types'
import { createLayer, createLayerMask, createDocument, getActiveLayer, writeLayerColor } from './document'
import { createDefaultLayerStyles } from './layer-styles'
import { encodePsd } from './psd'

beforeAll(() => {
  initializeCanvas(
    (width, height) => ({ width, height } as HTMLCanvasElement),
    (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height, colorSpace: 'srgb' } as ImageData)
  )
})

describe('PSD export', () => {
  it('writes editable layer hierarchy and Photoshop-compatible properties', () => {
    const document = createDocument('Layered PSD', 2, 2, 'rgba')
    const base = getActiveLayer(document)
    base.name = 'Base'
    writeLayerColor(document, base, 0, { r: 255, g: 0, b: 0, a: 255 })

    const group: LayerGroup = {
      id: 'group-effects',
      name: 'Effects',
      visible: true,
      locked: false,
      opacity: 0.75,
      blendMode: 'screen'
    }
    const inside = createLayer('Clipped paint', 2, 2, 'rgba')
    if (inside.format !== 'rgba') throw new Error('Expected RGBA test layer')
    inside.groupId = group.id
    inside.visible = false
    inside.locked = true
    inside.opacity = 0.5
    inside.blendMode = 'color-burn'
    inside.clippingMask = true
    writeLayerColor(document, inside, 3, { r: 0, g: 0, b: 255, a: 255 })
    const styles = createDefaultLayerStyles()
    styles.stroke.enabled = true
    styles.stroke.position = 'both'
    styles.stroke.size = 2
    styles.stroke.color = { r: 12, g: 34, b: 56, a: 128 }
    inside.layerStyles = styles
    document.layers.push(inside)
    document.groups.push(group)

    const frameId = document.animation!.activeFrameId
    const cel: AnimationCel = {
      id: 'cel-inside',
      layerId: inside.id,
      frameId,
      opacity: inside.opacity,
      surface: { format: 'rgba', width: 2, height: 2, offsetX: 0, offsetY: 0, pixels: inside.pixels }
    }
    const mask = createLayerMask(cel.id, 2, 2)
    mask.visible = false
    mask.pixels.set([0, 0, 0, 255], 0)
    cel.mask = mask
    document.animation!.cels.push(cel)

    const bytes = encodePsd(document)
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('8BPS')

    const parsed = readPsd(bytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true
    })
    expect(parsed.children?.map((layer) => layer.name)).toEqual(['Base', 'Effects'])
    const parsedGroup = parsed.children?.[1]
    expect(parsedGroup?.blendMode).toBe('screen')
    expect(parsedGroup?.opacity).toBeCloseTo(0.75, 2)
    expect(parsedGroup?.children?.map((layer) => layer.name)).toEqual(['Clipped paint'])

    const parsedLayer = parsedGroup?.children?.[0]
    expect(parsedLayer).toMatchObject({ hidden: true, clipping: true, blendMode: 'color burn', transparencyProtected: true })
    expect(parsedLayer?.opacity).toBeCloseTo(0.5, 2)
    expect(parsedLayer?.protected).toEqual({ transparency: true, composite: true, position: true })
    expect(parsedLayer?.mask).toMatchObject({ defaultColor: 255, disabled: true, fromVectorData: false })
    expect(parsedLayer?.effects?.stroke?.[0]).toMatchObject({ enabled: true, position: 'center', fillType: 'color', blendMode: 'normal' })
  })

  it('serializes every nested sibling list in Photoshop order', () => {
    const document = createDocument('Nested order', 1, 1, 'rgba')
    getActiveLayer(document).name = 'Root bottom'
    const outerBottom = createLayer('Outer bottom', 1, 1, 'rgba')
    outerBottom.groupId = 'outer'
    const nestedBottom = createLayer('Nested bottom', 1, 1, 'rgba')
    nestedBottom.groupId = 'nested'
    const nestedTop = createLayer('Nested top', 1, 1, 'rgba')
    nestedTop.groupId = 'nested'
    const outerTop = createLayer('Outer top', 1, 1, 'rgba')
    outerTop.groupId = 'outer'
    const rootTop = createLayer('Root top', 1, 1, 'rgba')
    document.layers.push(outerBottom, nestedBottom, nestedTop, outerTop, rootTop)
    document.groups.push(
      { id: 'outer', name: 'Outer', visible: true, locked: false, opacity: 1, blendMode: 'normal' },
      { id: 'nested', name: 'Nested', visible: true, locked: false, opacity: 1, blendMode: 'normal', parentGroupId: 'outer' }
    )

    const parsed = readPsd(encodePsd(document), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true })
    expect(parsed.children?.map((layer) => layer.name)).toEqual(['Root bottom', 'Outer', 'Root top'])
    const outer = parsed.children?.[1]
    expect(outer?.children?.map((layer) => layer.name)).toEqual(['Outer bottom', 'Nested', 'Outer top'])
    expect(outer?.children?.[1].children?.map((layer) => layer.name)).toEqual(['Nested bottom', 'Nested top'])
  })

  it('omits configured effects while layer styles are globally disabled', () => {
    const document = createDocument('Disabled PSD styles', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const styles = createDefaultLayerStyles()
    styles.enabled = false
    styles.stroke.enabled = true
    layer.layerStyles = styles

    const parsed = readPsd(encodePsd(document), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true })
    expect(parsed.children?.[0].effects).toBeUndefined()
  })





  it('rejects dimensions above the PSD canvas limit', () => {
    expect(() => encodePsd(createDocument('Too large', 500, 1, 'rgba'), 6400)).toThrow('PSD')
  })
})
