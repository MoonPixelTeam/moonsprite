import { describe, expect, it } from 'vitest'
import { encodeIco } from './ico'

describe('ICO encoding', () => {
  it('wraps a transparent RGBA PNG in a single-image ICO directory', () => {
    const result = encodeIco(new Uint8ClampedArray([41, 121, 255, 128]), 1, 1)
    const view = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength)

    expect([...result.bytes.subarray(0, 6)]).toEqual([0, 0, 1, 0, 1, 0])
    expect([...result.bytes.subarray(6, 10)]).toEqual([1, 1, 0, 0])
    expect(view.getUint16(10, true)).toBe(1)
    expect(view.getUint16(12, true)).toBe(32)
    expect(view.getUint32(18, true)).toBe(22)
    expect([...result.bytes.subarray(22, 30)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('scales large source images to the ICO 256px maximum while preserving proportions', () => {
    const result = encodeIco(new Uint8ClampedArray(512 * 128 * 4), 512, 128)

    expect(result).toMatchObject({ width: 256, height: 64 })
    expect([...result.bytes.subarray(6, 8)]).toEqual([0, 64])
  })
})
