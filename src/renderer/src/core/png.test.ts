import { describe, expect, it } from 'vitest'
import { decodePng, encodePng, exportDocumentImage } from './png'
import { createDocument, getActiveLayer, readLayerColor } from './document'

describe('PNG format', () => {
  it('uses indexed output for no more than 256 colors', () => {
    const rgba = new Uint8ClampedArray([41, 121, 255, 255, 0, 0, 0, 0])
    const result = encodePng(rgba, 2, 1)
    expect(result.indexed).toBe(true)
    const decoded = decodePng(result.bytes)
    expect(decoded.width).toBe(2)
    expect(decoded.height).toBe(1)
    expect(readLayerColor(decoded, getActiveLayer(decoded), 0)).toEqual({ r: 41, g: 121, b: 255, a: 255 })
    expect(readLayerColor(decoded, getActiveLayer(decoded), 1).a).toBe(0)
    expect(decoded.palette.map((entry) => entry.color)).toEqual([
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 41, g: 121, b: 255, a: 255 }
    ])
  })

  it('falls back to RGBA when the flattened image exceeds 256 colors', () => {
    const rgba = new Uint8ClampedArray(257 * 4)
    for (let index = 0; index < 257; index += 1) {
      rgba[index * 4] = index & 0xff
      rgba[index * 4 + 1] = index >>> 8
      rgba[index * 4 + 2] = (index * 13) & 0xff
      rgba[index * 4 + 3] = 255
    }
    expect(encodePng(rgba, 257, 1).indexed).toBe(false)
  })

  it('uses percentage-based nearest-neighbor export dimensions', async () => {
    const document = createDocument('scale', 2, 2, 'rgba')
    const result = await exportDocumentImage(document, 150, 'png-rgba')
    expect(result.width).toBe(3)
    expect(result.height).toBe(3)
    const decoded = decodePng(result.bytes)
    expect(decoded.width).toBe(3)
    expect(decoded.height).toBe(3)
  })

  it('exports scaled BMP images through the shared image export path', async () => {
    const document = createDocument('bitmap', 2, 1, 'rgba')
    const result = await exportDocumentImage(document, 200, 'bmp')

    expect(result).toMatchObject({ extension: 'bmp', width: 4, height: 2 })
    expect(new TextDecoder().decode(result.bytes.subarray(0, 2))).toBe('BM')
  })


})
