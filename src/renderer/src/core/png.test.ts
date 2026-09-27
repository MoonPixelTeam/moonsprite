import { describe, expect, it } from 'vitest'
import { decode, toRGBA8 } from 'upng-js'
import { decodeDocumentFile } from './document-files'
import { decodePng, encodePng, exportDocumentImage } from './png'
import { createDocument, getActiveLayer, readLayerColor } from './document'

describe('PNG format', () => {
  it.each([2, 4, 16, 17].flatMap(colors => [1, 3, 7, 8, 17, 31, 33, 257].map(width => ({ colors, width }))))(
    'preserves every row of a $width-pixel-wide PNG with $colors colors', ({ colors, width }) => {
      const height = 19
      const rgba = new Uint8ClampedArray(width * height * 4)
      for (let index = 0; index < width * height; index++) {
        const color = index % colors
        rgba.set(color === 0 ? [0, 0, 0, 0] : [color * 11, color * 7, color * 13, color % 2 ? 127 : 255], index * 4)
      }
      const encoded = encodePng(rgba, width, height)
      expect(encoded.indexed).toBe(true)
      // Confirm the file pixels as well as the imported document pixels.
      expect(new Uint8ClampedArray(toRGBA8(decode(new Uint8Array(encoded.bytes).buffer))[0])).toEqual(rgba)
      // Recent files and the native file dialog share this import boundary.
      const document = decodeDocumentFile(encoded.bytes, 'custom-size.png')
      expect([document.width, document.height]).toEqual([width, height])
      expect(document.colorMode).toBe('rgba')
      expect(getActiveLayer(document).format).toBe('rgba')
      for (let index = 0; index < width * height; index++) {
        const [r, g, b, a] = rgba.subarray(index * 4, index * 4 + 4)
        expect(readLayerColor(document, getActiveLayer(document), index), `pixel ${index}`).toEqual({ r, g, b, a })
      }
    }
  )

  it('imports compact indexed PNG output into an RGBA document', () => {
    const rgba = new Uint8ClampedArray([41, 121, 255, 255, 0, 0, 0, 0])
    const result = encodePng(rgba, 2, 1)
    expect(result.indexed).toBe(true)
    const decoded = decodePng(result.bytes)
    expect(decoded.colorMode).toBe('rgba')
    expect(getActiveLayer(decoded).format).toBe('rgba')
    expect(decoded.width).toBe(2)
    expect(decoded.height).toBe(1)
    expect(readLayerColor(decoded, getActiveLayer(decoded), 0)).toEqual({ r: 41, g: 121, b: 255, a: 255 })
    expect(readLayerColor(decoded, getActiveLayer(decoded), 1).a).toBe(0)
    expect(decoded.palette.map((entry) => entry.color)).toEqual([
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
    expect(decoded.colorMode).toBe('rgba')
    expect(getActiveLayer(decoded).format).toBe('rgba')
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
