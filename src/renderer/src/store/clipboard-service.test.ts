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
})
