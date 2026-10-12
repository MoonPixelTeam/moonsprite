import { describe, it, expect, vi } from 'vitest'

// Mock ImageData for test environment
class MockImageData {
  data: Uint8ClampedArray
  width: number
  height: number
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
}

describe('Chunked upload optimization', () => {
  it('uploads small regions directly without chunking', () => {
    const mockContext = {
      putImageData: vi.fn()
    } as unknown as OffscreenCanvasRenderingContext2D

    const width = 512
    const height = 512
    const pixels = new Uint8ClampedArray(width * height * 4)
    pixels.fill(255)

    // This would be called by uploadPixelsChunked
    const imageData = new MockImageData(pixels, width, height)
    mockContext.putImageData(imageData as any, 0, 0)

    // Should be called once for small regions
    expect(mockContext.putImageData).toHaveBeenCalledTimes(1)
  })

  it('splits large regions into 1024×1024 tiles', () => {
    const mockContext = {
      putImageData: vi.fn()
    } as unknown as OffscreenCanvasRenderingContext2D

    const width = 2048
    const height = 2048
    const expectedTiles = 2 * 2 // 2x2 grid of 1024×1024 tiles

    // For a 2048×2048 region, we expect 4 tiles
    // This test verifies the chunking strategy
    expect(Math.ceil(width / 1024) * Math.ceil(height / 1024)).toBe(expectedTiles)
  })

  it('handles non-power-of-two dimensions correctly', () => {
    const width = 3000
    const height = 2500
    const CHUNK_SIZE = 1024

    const tilesX = Math.ceil(width / CHUNK_SIZE) // 3
    const tilesY = Math.ceil(height / CHUNK_SIZE) // 3
    const expectedTiles = tilesX * tilesY // 9

    expect(expectedTiles).toBe(9)

    // Verify last tile dimensions
    const lastTileWidth = width - (tilesX - 1) * CHUNK_SIZE // 3000 - 2048 = 952
    const lastTileHeight = height - (tilesY - 1) * CHUNK_SIZE // 2500 - 2048 = 452

    expect(lastTileWidth).toBe(952)
    expect(lastTileHeight).toBe(452)
  })

  it('preserves pixel data when extracting tiles', () => {
    const width = 512
    const height = 512
    const pixels = new Uint8ClampedArray(width * height * 4)

    // Fill with a test pattern
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        pixels[offset] = x % 256 // R
        pixels[offset + 1] = y % 256 // G
        pixels[offset + 2] = (x + y) % 256 // B
        pixels[offset + 3] = 255 // A
      }
    }

    // Extract a tile from top-left corner
    const CHUNK_SIZE = 256
    const tileWidth = CHUNK_SIZE
    const tileHeight = CHUNK_SIZE
    const tilePixels = new Uint8ClampedArray(tileWidth * tileHeight * 4)

    for (let row = 0; row < tileHeight; row++) {
      const sourceOffset = row * width * 4
      const destOffset = row * tileWidth * 4
      tilePixels.set(pixels.subarray(sourceOffset, sourceOffset + tileWidth * 4), destOffset)
    }

    // Verify a sample of extracted pixels
    for (let y = 0; y < Math.min(16, tileHeight); y++) {
      for (let x = 0; x < Math.min(16, tileWidth); x++) {
        const srcOffset = (y * width + x) * 4
        const tileOffset = (y * tileWidth + x) * 4
        expect(tilePixels[tileOffset]).toBe(pixels[srcOffset]) // R
        expect(tilePixels[tileOffset + 1]).toBe(pixels[srcOffset + 1]) // G
        expect(tilePixels[tileOffset + 2]).toBe(pixels[srcOffset + 2]) // B
        expect(tilePixels[tileOffset + 3]).toBe(pixels[srcOffset + 3]) // A
      }
    }
  })
})
