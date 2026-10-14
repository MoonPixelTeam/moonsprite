import type { AnimationCelSurface } from '@shared/types-animation'
import type { PaletteEntry } from '@shared/types-color'
import type { SelectionMask } from '@shared/types-selection'
import { getRasterContentRevision, rasterContentBounds } from './document-model'
import { lazyRuntimeRasterForSurface, rasterStorageIdentity, readSurfacePackedLocal, runtimeRasterVisibleBounds } from './runtime-raster'

interface ContentEntry {
  revision: number
  value: boolean
}

export interface AnimationCelContentCacheStats {
  cacheHits: number
  cacheMisses: number
  pixelScans: number
  paletteSetBuilds: number
}

const contentCache = new WeakMap<object, Map<string, ContentEntry>>()
interface SelectionEntry { key: string; selection: SelectionMask | null | undefined; bytes: number }
const selectionCache = new WeakMap<object, SelectionEntry>()
const selectionLru = new Set<SelectionEntry>()
let selectionBytes = 0
let selectionBuilds = 0
let selectionHits = 0
let selectionEvictions = 0
export const animationCelSelectionCacheStats = () => ({ builds: selectionBuilds, hits: selectionHits, evictions: selectionEvictions, bytes: selectionBytes, entries: selectionLru.size })
const paletteSets = new Map<string, ReadonlySet<number>>()
const stats: AnimationCelContentCacheStats = { cacheHits: 0, cacheMisses: 0, pixelScans: 0, paletteSetBuilds: 0 }

const paletteVisibilityKey = (palette: readonly PaletteEntry[]): string => {
  if (palette.length === 0) return '*'
  return palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id).sort((a, b) => a - b).join(',')
}

const opaquePaletteIdsFor = (palette: readonly PaletteEntry[]): ReadonlySet<number> | undefined => {
  if (palette.length === 0) return undefined
  const key = paletteVisibilityKey(palette)
  const cached = paletteSets.get(key)
  if (cached) return cached
  const ids = new Set(palette.filter((entry) => entry.color.a > 0).map((entry) => entry.id))
  // Palette edits are infrequent, but avoid retaining an unbounded history of signatures.
  if (paletteSets.size >= 16) paletteSets.clear()
  paletteSets.set(key, ids)
  stats.paletteSetBuilds += 1
  return ids
}

const contentKeyFor = (surface: AnimationCelSurface, palette: readonly PaletteEntry[]): string =>
  surface.format === 'rgba' ? 'rgba' : `indexed:${paletteVisibilityKey(palette)}`

export const resetAnimationCelContentCacheStats = (): void => {
  stats.cacheHits = 0
  stats.cacheMisses = 0
  stats.pixelScans = 0
  stats.paletteSetBuilds = 0
}

export const animationCelContentCacheStats = (): AnimationCelContentCacheStats => ({ ...stats })

/** Returns whether a cel has visible pixels, reusing the result for shared, revisioned storage. */
export const animationCelSurfaceHasContent = (surface: AnimationCelSurface, palette: readonly PaletteEntry[] = []): boolean => {
  const opaqueIds = surface.format === 'indexed' ? opaquePaletteIdsFor(palette) : undefined
  const runtimeBounds = runtimeRasterVisibleBounds(surface, opaqueIds)
  if (runtimeBounds !== undefined) return runtimeBounds !== null

  const storage = rasterStorageIdentity(surface)
  const revision = getRasterContentRevision(storage)
  const key = contentKeyFor(surface, palette)
  const entries = contentCache.get(storage)
  const cached = entries?.get(key)
  // Revision zero is reserved for untracked in-place writes (common in low-level tests
  // and during document construction), so do not return a stale result for those surfaces.
  if (revision > 0 && cached?.revision === revision) {
    stats.cacheHits += 1
    return cached.value
  }

  stats.cacheMisses += 1
  stats.pixelScans += 1
  let value: boolean
  if (surface.format === 'rgba') {
    value = false
    for (let index = 3; index < surface.pixels.length; index += 4) {
      if (surface.pixels[index] > 0) {
        value = true
        break
      }
    }
  }
  else if (opaqueIds === undefined) value = surface.pixels.some((pixel) => pixel !== 0)
  else value = surface.pixels.some((pixel) => opaqueIds.has(pixel))

  if (revision > 0) {
    const nextEntries = entries ?? new Map<string, ContentEntry>()
    if (nextEntries.size >= 8 || (nextEntries.size && nextEntries.values().next().value?.revision !== revision)) nextEntries.clear()
    nextEntries.set(key, { revision, value })
    contentCache.set(storage, nextEntries)
  }
  return value
}

const MAX_CACHED_SELECTION_MASK_BYTES = 4 * 1024 * 1024

/** Builds and reuses a local content mask while returning a private copy to callers. */
export const animationCelSurfaceContentSelection = (
  surface: AnimationCelSurface,
  palette: readonly PaletteEntry[],
  canvasWidth: number,
  canvasHeight: number
): SelectionMask | null => {
  const sourceLeft = Math.max(0, -surface.offsetX)
  const sourceTop = Math.max(0, -surface.offsetY)
  const sourceRight = Math.min(surface.width, canvasWidth - surface.offsetX)
  const sourceBottom = Math.min(surface.height, canvasHeight - surface.offsetY)
  if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) return null

  const opaqueIds = surface.format === 'indexed' ? opaquePaletteIdsFor(palette) : undefined
  const storage = rasterStorageIdentity(surface)
  const revision = getRasterContentRevision(storage)
  const key = `${revision}:${surface.width}:${surface.height}:${sourceLeft}:${sourceTop}:${sourceRight}:${sourceBottom}:${contentKeyFor(surface, palette)}`
  const runtime = lazyRuntimeRasterForSurface(surface)
  // Sparse runtime tiles are immutable; edits detach them into revisioned pixels.
  const cacheable = revision > 0 || runtime !== null
  const cached = cacheable ? selectionCache.get(storage) : undefined
  const copy = (local: SelectionMask | null): SelectionMask | null => local ? {
    ...local, x: surface.offsetX + local.x, y: surface.offsetY + local.y,
    ...(local.mask ? { mask: local.mask.slice() } : {})
  } : null
  if (cached?.key === key && cached.selection !== undefined) {
    selectionHits += 1
    selectionLru.delete(cached)
    selectionLru.add(cached)
    return copy(cached.selection)
  }
  if (cached && selectionLru.delete(cached)) {
    selectionBytes -= cached.bytes
    cached.selection = undefined
  }
  const local = (() => {
    selectionBuilds += 1
    const opaqueAt = (x: number, y: number): boolean => surface.format === 'rgba'
      ? (readSurfacePackedLocal(surface, x, y) >>> 24) > 0
      : opaqueIds ? opaqueIds.has(readSurfacePackedLocal(surface, x, y)) : readSurfacePackedLocal(surface, x, y) !== 0
    // Unrevisioned construction buffers and an empty indexed palette need the
    // legacy visibility scan; rasterContentBounds requires explicit palette IDs.
    const canUseBounds = cacheable && (surface.format === 'rgba' || palette.length > 0)
    const bounds = runtime ? runtimeRasterVisibleBounds(surface, opaqueIds) : canUseBounds ? rasterContentBounds(surface, palette) : undefined
    if (bounds === null) return null
    const left = Math.max(sourceLeft, bounds?.x ?? sourceLeft)
    const top = Math.max(sourceTop, bounds?.y ?? sourceTop)
    const right = Math.min(sourceRight, bounds ? bounds.x + bounds.width : sourceRight)
    const bottom = Math.min(sourceBottom, bounds ? bounds.y + bounds.height : sourceBottom)
    let minX = left, minY = top, maxX = right - 1, maxY = bottom - 1
    if (!bounds || bounds.x < sourceLeft || bounds.y < sourceTop || bounds.x + bounds.width > sourceRight || bounds.y + bounds.height > sourceBottom) {
      minX = right; minY = bottom; maxX = -1; maxY = -1
      for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
        if (!opaqueAt(x, y)) continue
        minX = Math.min(minX, x); minY = Math.min(minY, y)
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      }
    }
    if (maxX < minX || maxY < minY) return null
    const width = maxX - minX + 1, height = maxY - minY + 1
    const mask = new Uint8Array(width * height)
    let selected = 0
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      if (!opaqueAt(x, y)) continue
      mask[(y - minY) * width + x - minX] = 1
      selected += 1
    }
    const result: SelectionMask = selected === mask.length
      ? { x: minX, y: minY, width, height }
      : { x: minX, y: minY, width, height, mask }
    return result
  })()
  const bytes = local?.mask?.byteLength ?? 0
  if (cacheable && bytes <= MAX_CACHED_SELECTION_MASK_BYTES) {
    while (selectionBytes + bytes > MAX_CACHED_SELECTION_MASK_BYTES || selectionLru.size >= 256) {
      const oldest = selectionLru.values().next().value!
      selectionLru.delete(oldest)
      selectionEvictions += 1
      selectionBytes -= oldest.bytes
      oldest.selection = undefined
    }
    const entry = { key, selection: local, bytes }
    selectionCache.set(storage, entry)
    selectionLru.add(entry)
    selectionBytes += bytes
  }
  return local ? { ...local, x: surface.offsetX + local.x, y: surface.offsetY + local.y,
    ...(cacheable && bytes <= MAX_CACHED_SELECTION_MASK_BYTES && local.mask ? { mask: local.mask.slice() } : {}) } : null
}
