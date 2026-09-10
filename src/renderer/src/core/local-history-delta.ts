import type { AnimationCelSurface, RasterLayer, SpriteDocument } from '@shared/types'
import type { HistoryEntry, ContentInvalidationHint } from './history'
import { getLayerStorageOrigin, markLayerContentChanged, setLayerStorageOrigin } from './document'
import { detachRuntimeRaster, lazyRuntimeRasterForSurface, rehydrateRuntimeRasterDocument } from './runtime-raster'

export function prepareHistoryDocument(source: SpriteDocument): SpriteDocument {
  for (const layer of source.layers) if (layer.runtimeRaster) detachRuntimeRaster(layer)
  for (const cel of source.animation?.cels ?? []) if (cel.surface?.runtimeRaster) detachRuntimeRaster(cel.surface)
  return source
}

/** An immutable transfer view that never invokes a lazy surface's pixels getter.
 * The live document/accessors stay untouched; structuredClone copies the compact
 * tile buffers and preserves shared cel storage within the resulting snapshot.
 */
export function historyDocumentTransferView(source: SpriteDocument): SpriteDocument {
  const surfaces = new Map<RasterLayer | AnimationCelSurface, RasterLayer | AnimationCelSurface>()
  const view = <T extends RasterLayer | AnimationCelSurface>(surface: T): T => {
    const existing = surfaces.get(surface)
    if (existing) return existing as T
    const runtime = lazyRuntimeRasterForSurface(surface)
    const descriptors = Object.getOwnPropertyDescriptors(surface)
    descriptors.pixels = { configurable: true, enumerable: true, writable: true, value: runtime
      ? surface.format === 'rgba' ? new Uint8ClampedArray(4) : new Uint32Array(1)
      : surface.pixels }
    // A materialized surface may still carry its old sparse metadata. Its dense
    // pixels are authoritative, so never reinstall that obsolete tile storage.
    if (runtime) descriptors.runtimeRaster = { configurable: true, enumerable: true, writable: true, value: runtime }
    else delete descriptors.runtimeRaster
    const copy = Object.defineProperties({}, descriptors) as T
    surfaces.set(surface, copy)
    return copy
  }
  const copy = { ...source, layers: source.layers.map(layer => view(layer)) }
  if (source.animation) copy.animation = { ...source.animation, cels: source.animation.cels.map(cel => cel.surface ? { ...cel, surface: view(cel.surface) } : cel) }
  copy.layers.forEach((layer, index) => setLayerStorageOrigin(layer, getLayerStorageOrigin(source.layers[index])))
  return copy
}

export function cloneHistoryDocument(source: SpriteDocument): SpriteDocument {
  const copy = structuredClone(historyDocumentTransferView(source))
  copy.layers.forEach((layer, index) => setLayerStorageOrigin(layer, getLayerStorageOrigin(source.layers[index])))
  rehydrateRuntimeRasterDocument(copy)
  return copy
}

/** Count shared pixel storage once, rather than pretending a snapshot costs one byte. */
export function historyDocumentBytes(source: SpriteDocument): number {
  const seen = new Set<object>()
  const size = (value: unknown): number => {
    if (typeof value === 'string') return value.length * 2
    if (!value || typeof value !== 'object') return 8
    if (seen.has(value)) return 0
    seen.add(value)
    if (ArrayBuffer.isView(value)) return size(value.buffer)
    if (value instanceof ArrayBuffer) return value.byteLength
    if (value instanceof Map) return [...value].reduce((total, [key, item]) => total + size(key) + size(item), 32)
    return Object.values(value).reduce<number>((total, item) => total + size(item), 32)
  }
  return size(historyDocumentTransferView(source))
}

type Path = string[]
type Patch = { path: Path; before: unknown; after: unknown; offset?: number; aliases?: Path[] }
export interface LocalHistoryDelta {
  patches: Patch[]
  origins: { before: Array<{ x: number; y: number }>; after: Array<{ x: number; y: number }> }
  label: string
  bytes: number
  invalidation: ContentInvalidationHint
  affectedLayerIds: string[]
  requiresAnimationSelectionNormalization: boolean
}
const identityKeys = new Set(['id', 'filePath', 'sourceFilePath'])

/** Compile once on reopening. Navigation then touches only changed byte runs.
 * Structural/alias changes return null and retain the complete snapshot path.
 */
export function compileLocalHistoryDelta(before: SpriteDocument, after: SpriteDocument, label: string): LocalHistoryDelta | null {
  const patches: Patch[] = []
  const forward = new Map<object, object>(), backward = new Map<object, object>()
  const replacements = new Map<object, Patch>()
  const origins = { before: before.layers.map(getLayerStorageOrigin), after: after.layers.map(getLayerStorageOrigin) }
  let bytes = 0, pixelOnly = true, left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  const affected = new Set<string>()
  const compare = (a: unknown, b: unknown, path: Path): boolean => {
    if (Object.is(a, b)) return true
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
      if ((a && typeof a === 'object') || (b && typeof b === 'object')) return false
      patches.push({ path, before: a, after: b }); bytes += 32 + String(a).length * 2 + String(b).length * 2
      if (!(path.length === 1 && ['dirty', 'updatedAt', 'createdAt'].includes(path[0])) && path[0] !== 'statistics') pixelOnly = false
      return true
    }
    if (forward.has(a) || backward.has(b)) {
      if (forward.get(a) !== b || backward.get(b) !== a) return false
      replacements.get(a)?.aliases?.push(path)
      return true
    }
    forward.set(a, b); backward.set(b, a)
    if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
      if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) return false
      const av = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), bv = new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
      const layer = path.length === 3 && path[0] === 'layers' && path[2] === 'pixels' ? before.layers[Number(path[1])] : undefined
      if (a.byteLength !== b.byteLength) {
        const patch: Patch = { path, before: structuredClone(a), after: structuredClone(b), aliases: [path] }
        patches.push(patch); replacements.set(a, patch)
        bytes += a.byteLength + b.byteLength + 32
        if (layer) affected.add(layer.id)
        pixelOnly = false
        return true
      }
      const aw = a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0 && a.byteLength % 4 === 0 ? new Uint32Array(a.buffer, a.byteOffset, a.byteLength / 4) : null
      const bw = aw ? new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4) : null
      for (let start = 0; start < av.length;) {
        if (aw && bw && start % 4 === 0) {
          let word = start / 4
          while (word < aw.length && aw[word] === bw[word]) word++
          start = word * 4
          if (start === av.length) break
        }
        if (av[start] === bv[start]) { start++; continue }
        let end = Math.min(av.length, start + 1024)
        while (end > start + 1 && av[end - 1] === bv[end - 1]) end--
        patches.push({ path, offset: start, before: av.slice(start, end), after: bv.slice(start, end) }); bytes += (end - start) * 2 + 32
        if (layer) {
          affected.add(layer.id)
          const first = Math.floor(start / 4), last = Math.floor((end - 1) / 4)
          const y0 = Math.floor(first / layer.width), y1 = Math.floor(last / layer.width)
          left = Math.min(left, layer.offsetX + (y0 === y1 ? first % layer.width : 0))
          right = Math.max(right, layer.offsetX + (y0 === y1 ? last % layer.width + 1 : layer.width))
          top = Math.min(top, layer.offsetY + y0); bottom = Math.max(bottom, layer.offsetY + y1 + 1)
        } else pixelOnly = false
        start = end
      }
      return true
    }
    if (Array.isArray(a) !== Array.isArray(b) || (Array.isArray(a) && a.length !== (b as unknown[]).length)) return false
    if (!Array.isArray(a) && (Object.getPrototypeOf(a)?.constructor?.name !== 'Object' || Object.getPrototypeOf(b)?.constructor?.name !== 'Object')) return false
    const ak = Object.keys(a).filter(key => path.length || !identityKeys.has(key))
    const bk = Object.keys(b).filter(key => path.length || !identityKeys.has(key))
    if (ak.length !== bk.length || ak.some(key => !Object.hasOwn(b, key))) return false
    return ak.every(key => compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], [...path, key]))
  }
  if (before.layers.some((layer, index) => {
    const other = after.layers[index]
    if (!other || layer.id !== other.id || layer.runtimeRaster || other.runtimeRaster) return true
    return false
  }) || !compare(before, after, [])) return null
  const invalidation: ContentInvalidationHint = pixelOnly && affected.size
    ? { kind: 'region', frameId: before.animation?.activeFrameId, rect: { x: left, y: top, width: right - left, height: bottom - top } }
    : { kind: 'full' }
  return { patches, origins, label, bytes, invalidation, affectedLayerIds: [...affected], requiresAnimationSelectionNormalization: !pixelOnly }
}

export function hydrateLocalHistoryDelta(target: SpriteDocument, delta: LocalHistoryDelta): HistoryEntry {
  const { patches, origins, ...metadata } = delta
  const affected = new Set(delta.affectedLayerIds)
  const resolve = (root: unknown, path: Path): unknown => path.reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], root)
  const apply = (side: 'before' | 'after'): void => {
    for (const patch of patches) {
      if (patch.aliases) {
        const value = structuredClone(patch[side])
        for (const path of patch.aliases) {
          const parent = resolve(target, path.slice(0, -1)) as Record<string, unknown>
          parent[path.at(-1)!] = value
        }
      } else if (patch.offset !== undefined) {
        const view = resolve(target, patch.path) as ArrayBufferView
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(patch[side] as Uint8Array, patch.offset)
      } else {
        const parent = resolve(target, patch.path.slice(0, -1)) as Record<string, unknown>
        parent[patch.path.at(-1)!] = patch[side]
      }
    }
    // Byte writes bypass the normal brush writer, so explicitly invalidate its caches.
    for (const layer of target.layers) if (affected.has(layer.id)) markLayerContentChanged(layer)
    target.layers.forEach((layer, index) => setLayerStorageOrigin(layer, origins[side][index]))
  }
  return { ...metadata, undo: () => apply('before'), redo: () => apply('after'), requiresAnimationSync: false }
}

export function createLocalHistoryDelta(target: SpriteDocument, before: SpriteDocument, after: SpriteDocument, label: string): HistoryEntry | null {
  const delta = compileLocalHistoryDelta(before, after, label)
  return delta ? hydrateLocalHistoryDelta(target, delta) : null
}
