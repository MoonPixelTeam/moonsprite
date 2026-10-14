import type { PaletteEntry, RgbaColor } from '@shared/types-color'

export interface OpaquePaletteData {
  ids: Set<number>
  lookup: Uint8Array | null
  signature: string
  colors: ReadonlyMap<number, RgbaColor>
}

/** Revision-scoped indexed palette visibility data shared by tile queries and raster compositing. */
export class DocumentCompositePaletteCache {
  private entries = new WeakMap<object, { revision: number; data: OpaquePaletteData }>()

  data(palette: readonly PaletteEntry[], revision: number): OpaquePaletteData {
    const cached = this.entries.get(palette)
    if (cached?.revision === revision) return cached.data
    const ids = new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id))
    let maxId = -1
    for (const entry of palette) maxId = Math.max(maxId, entry.id)
    const lookup = maxId >= 0 && maxId <= 0xffff
      ? (() => {
          const table = new Uint8Array(maxId + 1)
          for (const entry of palette) if (entry.color.a > 0) table[entry.id] = 1
          return table
        })()
      : null
    const data = { ids, lookup, signature: palette.map((entry) => `${entry.id}:${entry.color.a}`).join(','), colors: new Map(palette.map((entry) => [entry.id, entry.color])) }
    this.entries.set(palette, { revision, data })
    return data
  }

  clear(): void {
    this.entries = new WeakMap()
  }
}
