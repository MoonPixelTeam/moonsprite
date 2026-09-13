// Three Scale2x passes have a source-space dependency radius below two pixels.
// Generate tiles with that halo, so tile edges have exactly the same neighbours
// as a complete 8x raster. The cache size is independent of the selection area.
const TILE_SIZE = 32
const HALO = 2
const MAX_TILES = 32
export const ROTSPRITE_SCALE = 8

export function scale2xPacked(source: Uint32Array, width: number, height: number): { pixels: Uint32Array<ArrayBuffer>; width: number; height: number } {
  const nextWidth = width * 2
  const pixels = new Uint32Array(nextWidth * height * 2)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = source[y * width + x]
    const a = source[Math.max(0, y - 1) * width + x]
    const b = source[y * width + Math.min(width - 1, x + 1)]
    const c = source[y * width + Math.max(0, x - 1)]
    const d = source[Math.min(height - 1, y + 1) * width + x]
    const output = y * 2 * nextWidth + x * 2
    pixels[output] = c === a && c !== d && a !== b ? a : p
    pixels[output + 1] = a === b && a !== c && b !== d ? b : p
    pixels[output + nextWidth] = d === c && d !== b && c !== a ? c : p
    pixels[output + nextWidth + 1] = b === d && b !== a && d !== c ? d : p
  }
  return { pixels, width: nextWidth, height: height * 2 }
}

interface SourceTile { pixels: Uint32Array; width: number; x: number; y: number }

export class RotSpriteSource {
  private readonly tiles = new Map<number, SourceTile>()
  private lastKey = -1
  private lastTile: SourceTile | undefined

  constructor(readonly width: number, readonly height: number, private readonly read: (x: number, y: number) => number) {}

  get cachedBytes(): number {
    let bytes = 0
    for (const tile of this.tiles.values()) bytes += tile.pixels.byteLength
    return bytes
  }

  sample(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width * ROTSPRITE_SCALE || y >= this.height * ROTSPRITE_SCALE) return 0
    const tileX = Math.floor(x / (TILE_SIZE * ROTSPRITE_SCALE))
    const tileY = Math.floor(y / (TILE_SIZE * ROTSPRITE_SCALE))
    const key = tileY * Math.ceil(this.width / TILE_SIZE) + tileX
    let tile = key === this.lastKey ? this.lastTile : this.tiles.get(key)
    if (!tile) {
      const left = Math.max(0, tileX * TILE_SIZE - HALO)
      const top = Math.max(0, tileY * TILE_SIZE - HALO)
      const width = Math.min(this.width, (tileX + 1) * TILE_SIZE + HALO) - left
      const height = Math.min(this.height, (tileY + 1) * TILE_SIZE + HALO) - top
      let scaled = { pixels: new Uint32Array(width * height), width, height }
      for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        scaled.pixels[row * width + column] = this.read(left + column, top + row)
      }
      for (let pass = 0; pass < 3; pass++) scaled = scale2xPacked(scaled.pixels, scaled.width, scaled.height)
      tile = { pixels: scaled.pixels, width: scaled.width, x: left * ROTSPRITE_SCALE, y: top * ROTSPRITE_SCALE }
      if (this.tiles.size >= MAX_TILES) this.tiles.delete(this.tiles.keys().next().value!)
      this.tiles.set(key, tile)
    } else if (key !== this.lastKey) {
      this.tiles.delete(key)
      this.tiles.set(key, tile)
    }
    this.lastKey = key
    this.lastTile = tile
    return tile.pixels[(y - tile.y) * tile.width + x - tile.x]
  }
}
