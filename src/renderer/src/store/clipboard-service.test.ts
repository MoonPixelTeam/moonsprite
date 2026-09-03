import { describe, expect, it } from 'vitest'
import { ClipboardService, selectionClipboardFromImage, selectionClipboardImage } from './clipboard-service'

const red = new Uint8Array([255, 0, 0, 255])

describe('ClipboardService', () => {
  it('reuses fully opaque RGBA bytes without allocating a packed pixel copy', () => {
    const data = new Uint8Array([...red, 0, 255, 0, 255])
    const clipboard = selectionClipboardFromImage({ width: 2, height: 1, data })

    expect(clipboard?.mask).toBeUndefined()
    expect(clipboard?.pixels.buffer).toBe(data.buffer)
    expect(clipboard && selectionClipboardImage(clipboard).data).toEqual(data)
  })



  it('uses a readable system image before the internal selection', async () => {
    const service = new ClipboardService()
    service.setSelection({ width: 1, height: 1, pixels: new Uint32Array([0xff0000ff]), mask: new Uint8Array([1]) })
    const systemData = new Uint8Array([0, 255, 0, 255])

    const clipboard = await service.readSelection(async () => ({ width: 1, height: 1, data: systemData }))

    expect(clipboard?.pixels.buffer).toBe(systemData.buffer)
    expect(clipboard && selectionClipboardImage(clipboard).data).toEqual(new Uint8Array([0, 255, 0, 255]))
  })

  it('falls back to the internal selection when the system clipboard cannot be read', async () => {
    const service = new ClipboardService()
    service.setSelection({ width: 1, height: 1, pixels: new Uint32Array([0xff0000ff]), mask: new Uint8Array([1]) })

    const clipboard = await service.readSelection(async () => { throw new Error('clipboard unavailable') })

    expect(clipboard && selectionClipboardImage(clipboard).data).toEqual(red)
  })

  it('prefers an animation copy while the system clipboard remains unchanged', async () => {
    const service = new ClipboardService()
    service.captureAnimationCopySystemBaseline(async () => ({ width: 1, height: 1, data: red }))
    const current = await service.readSystemSelection(async () => ({ width: 1, height: 1, data: red.slice() }))

    expect(await service.preferInternalAnimation(current)).toBe(true)
  })

  it('lets a newer external image replace an animation copy', async () => {
    const service = new ClipboardService()
    service.captureAnimationCopySystemBaseline(async () => ({ width: 1, height: 1, data: red }))
    const current = await service.readSystemSelection(async () => ({ width: 1, height: 1, data: new Uint8Array([0, 255, 0, 255]) }))

    expect(await service.preferInternalAnimation(current)).toBe(false)
  })





  it('copies a complete layer collection at service boundaries', () => {
    const service = new ClipboardService()
    const pixels = new Uint8ClampedArray([255, 0, 0, 255])
    service.setLayers({
      layers: [{ name: 'top', width: 1, height: 1, offsetX: 3, offsetY: -2, visible: true, locked: false, opacity: 0.5, blendMode: 'multiply', description: 'note', displayColor: { r: 1, g: 2, b: 3, a: 255 }, groupKey: 'group-a', pixels }],
      groups: [{ key: 'group-a', name: 'group', visible: true, locked: false, opacity: 1, blendMode: 'normal', parentKey: null, collapsed: true }]
    })
    pixels[0] = 0

    const copied = service.getLayers()
    expect(copied?.layers[0].pixels[0]).toBe(255)
    expect(copied?.groups[0].collapsed).toBe(true)
    copied!.layers[0].pixels[0] = 0
    expect(service.getLayers()?.layers[0].pixels[0]).toBe(255)
  })

  it('uses the internal layer bounds when the OS clipboard is the pre-copy image', async () => {
    const service = new ClipboardService()
    service.setLayers({
      layers: [{ name: 'layer', width: 30, height: 30, offsetX: 0, offsetY: 0, visible: true, locked: false, opacity: 1, blendMode: 'normal', pixels: new Uint8ClampedArray(30 * 30 * 4) }],
      groups: []
    })
    service.captureLayerCopySystemBaselineSize(async () => ({ width: 600, height: 600 }))
    expect(await service.readSize(async () => ({ width: 600, height: 600 }))).toEqual({ width: 30, height: 30 })
  })

  it('uses the newer external image size and computes multi-layer bounds', async () => {
    const service = new ClipboardService()
    service.setLayers({
      layers: [
        { name: 'a', width: 30, height: 30, offsetX: 4, offsetY: 6, visible: true, locked: false, opacity: 1, blendMode: 'normal', pixels: new Uint8ClampedArray(30 * 30 * 4) },
        { name: 'b', width: 20, height: 10, offsetX: 40, offsetY: -2, visible: true, locked: false, opacity: 1, blendMode: 'normal', pixels: new Uint8ClampedArray(20 * 10 * 4) }
      ],
      groups: [{ key: 'g', name: 'group', visible: true, locked: false, opacity: 1, blendMode: 'normal', parentKey: null }]
    })
    service.captureLayerCopySystemBaselineSize(async () => ({ width: 30, height: 30 }))
    expect(await service.readSize(async () => ({ width: 800, height: 500 }))).toEqual({ width: 800, height: 500 })
    expect(service.layerClipboardSize()).toEqual({ width: 56, height: 38 })
  })

  it('does not treat a same-sized but different external image as the copied layer', async () => {
    const service = new ClipboardService()
    service.setLayers({
      layers: [{ name: 'layer', width: 20, height: 20, offsetX: 0, offsetY: 0, visible: true, locked: false, opacity: 1, blendMode: 'normal', pixels: new Uint8ClampedArray(20 * 20 * 4) }],
      groups: []
    })
    service.captureLayerCopySystemBaseline(async () => ({ width: 30, height: 30, data: new Uint8Array(30 * 30 * 4) }))
    service.captureLayerCopySystemBaselineSize(async () => ({ width: 30, height: 30 }))
    const different = new Uint8Array(30 * 30 * 4)
    different[0] = 255
    different[3] = 255
    expect(await service.latestClipboardSize(async () => ({ width: 30, height: 30 }), async () => ({ width: 30, height: 30, data: different }))).toEqual({ width: 30, height: 30 })
  })
})
