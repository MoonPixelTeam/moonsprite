import type { SpriteDocument } from '@shared/types-document'
import type { AnimationCelSurface } from '@shared/types-animation'
import { getCommittedPixelChanges, type HistoryEntry } from './history'
import { getLayerStorageOrigin } from './document-model'
import { resolveAnimationCel } from './animation'
import { lazyRuntimeRasterForSurface, rasterStorageIdentity } from './runtime-raster'
import type { LocalHistoryDelta } from './local-history-delta'

/** Canonical cel geometry and alias topology, independent of the active frame
 * projection. Never read a lazy pixels getter while deciding delta eligibility. */
export function localHistoryDocumentShape(document: SpriteDocument): string {
  const aliases = new Map<object, number>()
  const storage = (surface: AnimationCelSurface) => {
    const runtime = lazyRuntimeRasterForSurface(surface)
    const key = runtime ?? surface.pixels.buffer
    if (!aliases.has(key)) aliases.set(key, aliases.size)
    return [aliases.get(key), runtime ? 0 : surface.pixels.byteOffset, runtime ? 0 : surface.pixels.byteLength]
  }
  return JSON.stringify([
    document.width, document.height, document.colorMode, document.pixelFormat, document.palette,
    document.layers.map(layer => [layer.id, layer.kind, layer.format, layer.linkedContentId,
      !document.animation ? [layer.width, layer.height, layer.offsetX, layer.offsetY, getLayerStorageOrigin(layer)] : null]),
    document.animation?.frames.map(frame => frame.id),
    document.animation?.cels.map(cel => [cel.id, cel.layerId, cel.frameId, cel.linkedCelId,
      cel.surface && [cel.surface.format, cel.surface.width, cel.surface.height, cel.surface.offsetX, cel.surface.offsetY,
        cel.surface.storageOriginX ?? 0, cel.surface.storageOriginY ?? 0, storage(cel.surface)]])
  ])
}

/** Reuse committed immutable pixel patches; unrelated cels are never copied. */
export function captureCommittedHistoryDelta(document: SpriteDocument, entry: HistoryEntry): LocalHistoryDelta | null {
  const edit = getCommittedPixelChanges(entry)
  if (!edit || edit.layerOffset) return null
  const index = document.layers.findIndex(layer => layer.id === edit.layerId), layer = document.layers[index]
  if (!layer || layer.kind) return null
  const timeline = document.animation
  const requested = timeline?.cels.find(cel => cel.layerId === layer.id && cel.frameId === (edit.frameId ?? timeline.activeFrameId))
  const cel = timeline && requested ? resolveAnimationCel(timeline, requested) : null
  if (timeline && (!cel?.surface || cel.text || cel.tilemap || cel.freeTiles)) return null
  const surface = cel?.surface ?? layer
  if (lazyRuntimeRasterForSurface(surface)) return null
  const origin = cel ? { x: cel.surface!.storageOriginX ?? 0, y: cel.surface!.storageOriginY ?? 0 } : getLayerStorageOrigin(layer)
  // On the active frame the writer and canonical cel must still own the same
  // storage. Detached/expanded sources require a structural checkpoint.
  if ((!edit.frameId || edit.frameId === timeline?.activeFrameId) && rasterStorageIdentity(surface) !== rasterStorageIdentity(layer)) return null
  const celIndex = cel ? timeline!.cels.indexOf(cel) : -1
  const candidates = cel ? timeline!.cels.map((candidate, i) => ({ surface: candidate.surface, path: ['animation', 'cels', String(i), 'surface', 'pixels'] }))
    : document.layers.map((candidate, i) => ({ surface: candidate, path: ['layers', String(i), 'pixels'] }))
  // Different views of one buffer need offset remapping in the encoded journal.
  // Retain a structural checkpoint until that mapping is supported.
  if (candidates.some(candidate => {
    const other = candidate.surface
    return other && !lazyRuntimeRasterForSurface(other) && other.pixels.buffer === surface.pixels.buffer &&
      (other.pixels.byteOffset !== surface.pixels.byteOffset || other.pixels.byteLength !== surface.pixels.byteLength)
  })) return null
  const path = cel ? ['animation', 'cels', String(celIndex), 'surface', 'pixels'] : ['layers', String(index), 'pixels']
  const aliases = candidates.flatMap(candidate => {
    const other = candidate.surface
    if (!other || lazyRuntimeRasterForSurface(other)) return []
    if (other.pixels.buffer !== surface.pixels.buffer) return []
    if (other.pixels.byteOffset !== surface.pixels.byteOffset || other.pixels.byteLength !== surface.pixels.byteLength) return []
    return [candidate.path]
  })
  const patches: LocalHistoryDelta['patches'] = []
  const add = (x: number, y: number, width: number, before: Uint8Array, after: Uint8Array): boolean => {
    x -= origin.x; y -= origin.y
    if (x < 0 || y < 0 || x + width > surface.width || y >= surface.height) return false
    patches.push({ path, aliases: aliases.length > 1 ? aliases : undefined, offset: (y * surface.width + x) * 4, before, after })
    return true
  }
  for (const patch of edit.regionPatches) {
    if (patch.format !== surface.format) return null
    const before = new Uint8Array(patch.before.buffer, patch.before.byteOffset, patch.before.byteLength)
    const after = new Uint8Array(patch.after.buffer, patch.after.byteOffset, patch.after.byteLength)
    for (let row = 0; row < patch.height; row++) {
      const start = row * patch.width * 4, end = start + patch.width * 4
      if (!add(patch.x, patch.y + row, patch.width, before.subarray(start, end), after.subarray(start, end))) return null
    }
  }
  const packed = (value: number, length: number): Uint8Array => {
    const result = new Uint8Array(length * 4), view = new DataView(result.buffer)
    for (let i = 0; i < length; i++) view.setUint32(i * 4, value, true)
    return result
  }
  for (let i = 0; i < edit.runXs.length; i++) if (!add(edit.runXs[i], edit.runYs[i], edit.runLengths[i], packed(edit.runBefore[i], edit.runLengths[i]), packed(edit.runAfter[i], edit.runLengths[i]))) return null
  for (let i = 0; i < edit.xs.length; i++) if (!add(edit.xs[i], edit.ys[i], 1, packed(edit.before[i], 1), packed(edit.after[i], 1))) return null
  const origins = document.layers.map(getLayerStorageOrigin)
  return { patches, origins: { before: origins, after: origins }, label: entry.label,
    bytes: patches.reduce((sum, patch) => sum + (patch.before as Uint8Array).byteLength + (patch.after as Uint8Array).byteLength, 0),
    invalidation: entry.invalidation ?? { kind: 'full' }, affectedLayerIds: entry.affectedLayerIds ?? [layer.id], requiresAnimationSelectionNormalization: false,
    ...(cel ? { snapshotFrameId: timeline!.activeFrameId, celTarget: { index: celIndex, id: cel.id, layerId: cel.layerId, frameId: cel.frameId } } : {}) }
}
