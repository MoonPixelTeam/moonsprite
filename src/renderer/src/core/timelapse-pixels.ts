import type { SelectionRect } from '@shared/types-selection'

const TILE_SIZE = 64

export interface TimelapsePixelTile {
  x: number
  y: number
  width: number
  height: number
  pixels: Uint8ClampedArray
}

/** Tiles are immutable and may be shared by queued frames. Never transfer their buffers. */
export interface TimelapsePixels {
  width: number
  height: number
  tiles: readonly TimelapsePixelTile[]
}

export function freezeTimelapsePixels(
  pixels: Uint8ClampedArray, width: number, height: number,
  previous?: TimelapsePixels, dirty?: SelectionRect
): TimelapsePixels {
  const reuse = previous?.width === width && previous.height === height && dirty !== undefined
  const tiles: TimelapsePixelTile[] = []
  for (let y = 0; y < height; y += TILE_SIZE) for (let x = 0; x < width; x += TILE_SIZE) {
    const tileWidth = Math.min(TILE_SIZE, width - x)
    const tileHeight = Math.min(TILE_SIZE, height - y)
    if (reuse && (dirty.width <= 0 || dirty.height <= 0 || x >= dirty.x + dirty.width
      || y >= dirty.y + dirty.height || x + tileWidth <= dirty.x || y + tileHeight <= dirty.y)) {
      tiles.push(previous.tiles[tiles.length])
      continue
    }
    const frozen = new Uint8ClampedArray(tileWidth * tileHeight * 4)
    for (let row = 0; row < tileHeight; row += 1) {
      const start = ((y + row) * width + x) * 4
      frozen.set(pixels.subarray(start, start + tileWidth * 4), row * tileWidth * 4)
    }
    tiles.push({ x, y, width: tileWidth, height: tileHeight, pixels: frozen })
  }
  return { width, height, tiles }
}

/** Materialize in the encoder worker; the UI only does this for fallback/legacy callers. */
export function materializeTimelapsePixels(frame: TimelapsePixels): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(frame.width * frame.height * 4)
  for (const tile of frame.tiles) for (let row = 0; row < tile.height; row += 1) {
    pixels.set(tile.pixels.subarray(row * tile.width * 4, (row + 1) * tile.width * 4),
      ((tile.y + row) * frame.width + tile.x) * 4)
  }
  return pixels
}
