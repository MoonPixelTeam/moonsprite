import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRasterImagePreview, documentFromRgbaImage, rasterImageMimeType } from './raster-image'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('raster image import', () => {
  it('creates an RGBA document without changing imported pixels', () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 128, 255, 64])
    const document = documentFromRgbaImage('photo.webp', 2, 1, pixels)
    const layer = document.layers[0]
    expect(document.width).toBe(2)
    expect(document.height).toBe(1)
    expect(document.colorMode).toBe('rgba')
    expect(layer.format).toBe('rgba')
    if (layer.format === 'rgba') expect(layer.pixels).toEqual(pixels)
    expect(document.palette.map((entry) => entry.color)).toEqual([
      { r: 255, g: 0, b: 0, a: 255 },
      { r: 0, g: 128, b: 255, a: 64 }
    ])
  })

  it('rejects mismatched pixel data', () => {
    expect(() => documentFromRgbaImage('broken.jpg', 2, 2, new Uint8ClampedArray(4))).toThrow('图像尺寸或像素数据无效。')
  })




})
