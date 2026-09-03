import type { RasterLayer, SelectionRect, SpriteDocument } from '@shared/types'
import { animationLayerAtFrame, setAnimationLayerOffsetsAtFrame } from './animation'
import { getLayer, getLayerMaskOwner, getLayerStorageOrigin, isLayerMask, layerIndexAtStoragePoint, markLayerContentChanged, normalizeLayerPackedValue, readLayerPacked, writeLayerPacked, writeLayerPackedRun } from './document'

export interface HistoryEntry {
  label: string
  bytes: number
  undo: () => void
  redo: () => void
  invalidation?: ContentInvalidationHint
  affectedLayerIds?: string[]
  documentChanged?: boolean
  contentChanged?: boolean
  requiresAnimationSync?: boolean
  /**
   * Structural animation/layer changes can invalidate timeline selections.
   * Pixel-only entries leave this unset so undo/redo can avoid a full scan.
   */
  requiresAnimationSelectionNormalization?: boolean
}

export interface HistoryTimelineEntry {
  label: string
  position: number
}

export interface HistoryTimeline {
  entries: HistoryTimelineEntry[]
  position: number
}

export type ContentInvalidationHint =
  | { kind: 'full' }
  | { kind: 'region'; frameId?: string; rect: SelectionRect }

const combineInvalidations = (entries: readonly HistoryEntry[]): ContentInvalidationHint | undefined => {
  const invalidations = entries.map((entry) => entry.invalidation)
  if (invalidations.some((invalidation) => !invalidation || invalidation.kind !== 'region')) return undefined
  const regions = invalidations as Array<Extract<ContentInvalidationHint, { kind: 'region' }>>
  const frameId = regions[0]?.frameId
  if (regions.some((region) => region.frameId !== frameId)) return undefined
  const left = Math.min(...regions.map((region) => region.rect.x))
  const top = Math.min(...regions.map((region) => region.rect.y))
  const right = Math.max(...regions.map((region) => region.rect.x + region.rect.width))
  const bottom = Math.max(...regions.map((region) => region.rect.y + region.rect.height))
  return { kind: 'region', frameId, rect: { x: left, y: top, width: right - left, height: bottom - top } }
}

const compoundHistoryEntry = (entries: readonly HistoryEntry[], label: string): HistoryEntry => ({
  label,
  bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  undo: () => { for (let index = entries.length - 1; index >= 0; index -= 1) entries[index].undo() },
  redo: () => { for (const entry of entries) entry.redo() },
  invalidation: combineInvalidations(entries),
  affectedLayerIds: [...new Set(entries.flatMap((entry) => entry.affectedLayerIds ?? []))],
  documentChanged: entries.some((entry) => entry.documentChanged !== false),
  contentChanged: entries.some((entry) => entry.documentChanged !== false && entry.contentChanged !== false),
  requiresAnimationSync: entries.some((entry) => entry.documentChanged !== false && entry.requiresAnimationSync !== false),
  requiresAnimationSelectionNormalization: entries.some((entry) => entry.requiresAnimationSelectionNormalization === true)
})

export class HistoryStack {
  private undoEntries: HistoryEntry[] = []
  private redoEntries: HistoryEntry[] = []
  private bytes = 0
  private compoundEntries: HistoryEntry[] | null = null
  private compoundDepth = 0
  private stackRevision = 0
  private animationSelectionNormalizationRequested = false

  constructor(private readonly maxBytes = 256 * 1024 * 1024) {}

  get canUndo(): boolean { return this.undoEntries.length > 0 }
  get canRedo(): boolean { return this.redoEntries.length > 0 }
  get memoryBytes(): number { return this.bytes }
  get latestUndoEntry(): HistoryEntry | null { return this.undoEntries.at(-1) ?? null }
  get position(): number { return this.undoEntries.length }
  get length(): number { return this.undoEntries.length + this.redoEntries.length }
  get revision(): number { return this.stackRevision }
  get timeline(): HistoryTimeline {
    const entries = [...this.undoEntries, ...[...this.redoEntries].reverse()]
      .map((entry, index) => ({ label: entry.label, position: index + 1 }))
    return { entries, position: this.position }
  }

  clear(): void {
    this.undoEntries = []
    this.redoEntries = []
    this.bytes = 0
    this.compoundEntries = null
    this.compoundDepth = 0
    this.animationSelectionNormalizationRequested = false
    this.stackRevision += 1
  }

  /** Mark entries recorded by the current mutateActive scope as structural. */
  setAnimationSelectionNormalizationRequested(requested: boolean): void {
    this.animationSelectionNormalizationRequested = requested
  }

  push(entry: HistoryEntry): void {
    if (this.animationSelectionNormalizationRequested && entry.requiresAnimationSelectionNormalization !== true) {
      entry = { ...entry, requiresAnimationSelectionNormalization: true }
    }
    if (this.compoundEntries) {
      this.compoundEntries.push(entry)
      return
    }
    this.undoEntries.push(entry)
    this.bytes += entry.bytes
    this.redoEntries = []
    while (this.bytes > this.maxBytes && this.undoEntries.length > 1) {
      this.bytes -= this.undoEntries.shift()!.bytes
    }
    this.stackRevision += 1
  }

  beginCompound(): void {
    if (this.compoundDepth === 0) this.compoundEntries = []
    this.compoundDepth += 1
  }

  endCompound(label: string): void {
    if (this.compoundDepth === 0) return
    this.compoundDepth -= 1
    if (this.compoundDepth > 0) return
    const entries = this.compoundEntries
    this.compoundEntries = null
    if (!entries || entries.length === 0) return
    if (entries.length === 1) {
      this.push({ ...entries[0], label })
      return
    }
    this.push(compoundHistoryEntry(entries, label))
  }

  abortCompound(): void {
    if (this.compoundDepth === 0) return
    const entries = this.compoundEntries ?? []
    this.compoundEntries = null
    this.compoundDepth = 0
    for (let index = entries.length - 1; index >= 0; index -= 1) entries[index].undo()
    this.stackRevision += 1
  }

  mergeLastTwo(label: string): HistoryEntry | null {
    if (this.compoundDepth > 0 || this.undoEntries.length < 2) return null
    const entries = this.undoEntries.splice(-2)
    this.bytes -= entries.reduce((sum, entry) => sum + entry.bytes, 0)
    const merged = compoundHistoryEntry(entries, label)
    this.push(merged)
    return merged
  }

  undo(): HistoryEntry | null {
    const entry = this.undoEntries[this.undoEntries.length - 1]
    if (!entry) return null
    entry.undo()
    this.undoEntries.pop()
    this.bytes -= entry.bytes
    this.redoEntries.push(entry)
    this.stackRevision += 1
    return entry
  }

  redo(): HistoryEntry | null {
    const entry = this.redoEntries[this.redoEntries.length - 1]
    if (!entry) return null
    entry.redo()
    this.redoEntries.pop()
    this.undoEntries.push(entry)
    this.bytes += entry.bytes
    this.stackRevision += 1
    return entry
  }
}

export interface PixelEdit {
  layerId: string
  frameId?: string
  before: Map<number, number>
  after: Map<number, number>
  points?: PixelEditPoints
  runs?: PixelEditRun[]
  denseRegion?: PixelEditDenseRegion
  layerOffset?: PixelEditLayerOffset
  dirtyRect?: SelectionRect
}

export interface PixelEditPoints {
  indices: Uint32Array
  before: Uint32Array
  after: Uint32Array
  count: number
}

export interface PixelEditRun {
  index: number
  length: number
  before: number
  after: number
}

export interface PixelEditDenseRegion {
  x: number
  y: number
  width: number
  height: number
  before: Uint32Array
  after: Uint32Array
  changed: Uint8Array
  count: number
}

export interface PixelEditLayerOffset {
  beforeX: number
  beforeY: number
  afterX: number
  afterY: number
}

type RegionPatchPixels = Uint8ClampedArray | Uint32Array

interface CommittedPixelRegionPatch {
  format: RasterLayer['format']
  x: number
  y: number
  width: number
  height: number
  before: RegionPatchPixels
  after: RegionPatchPixels
}

const REGION_PATCH_MIN_POINTS = 256
const REGION_PATCH_MAX_AREA_FACTOR = 3

const writePackedToPatch = (patch: RegionPatchPixels, format: RasterLayer['format'], index: number, value: number): void => {
  if (format === 'indexed') {
    ;(patch as Uint32Array)[index] = value
    return
  }
  const offset = index * 4
  const pixels = patch as Uint8ClampedArray
  pixels[offset] = value & 0xff
  pixels[offset + 1] = (value >>> 8) & 0xff
  pixels[offset + 2] = (value >>> 16) & 0xff
  pixels[offset + 3] = (value >>> 24) & 0xff
}

const copyLayerRegion = (layer: RasterLayer, x: number, y: number, width: number, height: number): RegionPatchPixels | null => {
  const origin = getLayerStorageOrigin(layer)
  const localX = x - origin.x
  const localY = y - origin.y
  if (localX < 0 || localY < 0 || localX + width > layer.width || localY + height > layer.height) return null
  if (layer.format === 'indexed') {
    const pixels = new Uint32Array(width * height)
    for (let row = 0; row < height; row += 1) {
      const source = (localY + row) * layer.width + localX
      pixels.set(layer.pixels.subarray(source, source + width), row * width)
    }
    return pixels
  }
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    const source = ((localY + row) * layer.width + localX) * 4
    pixels.set(layer.pixels.subarray(source, source + width * 4), row * width * 4)
  }
  return pixels
}

const regionPatchFromPoints = (layer: RasterLayer, xs: Int32Array, ys: Int32Array, before: Uint32Array, after: Uint32Array): CommittedPixelRegionPatch | null => {
  if (xs.length < REGION_PATCH_MIN_POINTS) return null
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (let offset = 0; offset < xs.length; offset += 1) {
    left = Math.min(left, xs[offset])
    top = Math.min(top, ys[offset])
    right = Math.max(right, xs[offset] + 1)
    bottom = Math.max(bottom, ys[offset] + 1)
  }
  const width = right - left
  const height = bottom - top
  const area = width * height
  if (!Number.isSafeInteger(area) || area <= 0 || area > xs.length * REGION_PATCH_MAX_AREA_FACTOR) return null
  const afterPixels = copyLayerRegion(layer, left, top, width, height)
  if (!afterPixels) return null
  const beforePixels = afterPixels.slice() as RegionPatchPixels
  for (let offset = 0; offset < xs.length; offset += 1) {
    const patchIndex = (ys[offset] - top) * width + xs[offset] - left
    writePackedToPatch(beforePixels, layer.format, patchIndex, before[offset])
    writePackedToPatch(afterPixels, layer.format, patchIndex, after[offset])
  }
  return { format: layer.format, x: left, y: top, width, height, before: beforePixels, after: afterPixels }
}

const regionPatchFromDenseEdit = (layer: RasterLayer, dense: PixelEditDenseRegion): CommittedPixelRegionPatch => {
  if (layer.format === 'indexed') return {
    format: layer.format,
    x: dense.x,
    y: dense.y,
    width: dense.width,
    height: dense.height,
    before: dense.before,
    after: dense.after
  }
  const before = new Uint8ClampedArray(dense.before.buffer as ArrayBuffer, dense.before.byteOffset, dense.before.byteLength)
  const after = new Uint8ClampedArray(dense.after.buffer as ArrayBuffer, dense.after.byteOffset, dense.after.byteLength)
  return { format: layer.format, x: dense.x, y: dense.y, width: dense.width, height: dense.height, before, after }
}

const applyRegionPatch = (layer: RasterLayer, patch: CommittedPixelRegionPatch, pixels: RegionPatchPixels): void => {
  if (layer.format !== patch.format) return
  const origin = getLayerStorageOrigin(layer)
  const localX = patch.x - origin.x
  const localY = patch.y - origin.y
  const sourceX = Math.max(0, -localX)
  const sourceY = Math.max(0, -localY)
  const targetX = Math.max(0, localX)
  const targetY = Math.max(0, localY)
  const width = Math.min(patch.width - sourceX, layer.width - targetX)
  const height = Math.min(patch.height - sourceY, layer.height - targetY)
  if (width <= 0 || height <= 0) return
  if (patch.format === 'indexed') {
    const sourcePixels = pixels as Uint32Array
    const targetPixels = layer.pixels as Uint32Array
    for (let row = 0; row < height; row += 1) {
      const source = (sourceY + row) * patch.width + sourceX
      const target = (targetY + row) * layer.width + targetX
      targetPixels.set(sourcePixels.subarray(source, source + width), target)
    }
    return
  }
  const sourcePixels = pixels as Uint8ClampedArray
  const targetPixels = layer.pixels as Uint8ClampedArray
  for (let row = 0; row < height; row += 1) {
    const source = ((sourceY + row) * patch.width + sourceX) * 4
    const target = ((targetY + row) * layer.width + targetX) * 4
    targetPixels.set(sourcePixels.subarray(source, source + width * 4), target)
  }
}

export function beginPixelEdit(layerId: string): PixelEdit {
  return { layerId, before: new Map(), after: new Map() }
}

export function preparePixelEdit(document: SpriteDocument, edit: PixelEdit): void {
  if (edit.frameId || !document.animation) return
  const target = getLayer(document, edit.layerId)
  edit.frameId = isLayerMask(target)
    ? getLayerMaskOwner(document, target)?.frameId
    : document.animation.activeFrameId
}

/** Records a pixel when the caller already has its current packed value. */
export function recordPixelKnownCurrent(document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, index: number, current: number, next: number): boolean {
  preparePixelEdit(document, edit)
  next = normalizeLayerPackedValue(document, layer, next)
  if (current === next) return false
  if (!edit.dirtyRect) markLayerContentChanged(layer)
  if (!edit.before.has(index)) edit.before.set(index, current)
  edit.after.set(index, next)
  const x = index % layer.width + layer.offsetX
  const y = Math.floor(index / layer.width) + layer.offsetY
  if (!edit.dirtyRect) edit.dirtyRect = { x, y, width: 1, height: 1 }
  else {
    const dirty = edit.dirtyRect
    const left = Math.min(dirty.x, x)
    const top = Math.min(dirty.y, y)
    const right = Math.max(dirty.x + dirty.width, x + 1)
    const bottom = Math.max(dirty.y + dirty.height, y + 1)
    dirty.x = left
    dirty.y = top
    dirty.width = right - left
    dirty.height = bottom - top
  }
  writeLayerPacked(document, layer, index, next)
  return true
}

export function recordPixel(document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, index: number, next: number): boolean {
  const current = readLayerPacked(document, layer, index)
  return recordPixelKnownCurrent(document, layer, edit, index, current, next)
}

export function commitPixelEdit(document: SpriteDocument, edit: PixelEdit, label: string): HistoryEntry | null {
  const pointCount = edit.points?.count ?? 0
  if (edit.before.size === 0 && pointCount === 0 && !edit.runs?.length && !edit.denseRegion?.count && !edit.layerOffset) return null
  const maskTarget = isLayerMask(getLayer(document, edit.layerId))
  const editedLayer = maskTarget ? null : document.layers.find((layer) => layer.id === edit.layerId) ?? null
  const linkedLayerIds = editedLayer?.linkedContentId
    ? document.layers
        .filter((layer) => !layer.kind && !layer.background && layer.linkedContentId === editedLayer.linkedContentId)
        .map((layer) => layer.id)
    : []
  const frameId = edit.frameId ?? document.animation?.activeFrameId
  const layerForFrame = (): RasterLayer => maskTarget
    ? getLayer(document, edit.layerId)
    : frameId && document.animation?.activeFrameId !== frameId
    ? animationLayerAtFrame(document, edit.layerId, frameId) ?? getLayer(document, edit.layerId)
    : getLayer(document, edit.layerId)
  const layer = layerForFrame()
  const capacity = edit.before.size + pointCount
  let xs = new Int32Array(capacity)
  let ys = new Int32Array(capacity)
  let before = new Uint32Array(capacity)
  let after = new Uint32Array(capacity)
  const storageOrigin = getLayerStorageOrigin(layer)
  let count = 0
  for (const [index, beforeValue] of edit.before) {
    const afterValue = edit.after.get(index) ?? beforeValue
    if (afterValue === beforeValue) continue
    xs[count] = index % layer.width + storageOrigin.x
    ys[count] = Math.floor(index / layer.width) + storageOrigin.y
    before[count] = beforeValue
    after[count] = afterValue
    count += 1
  }
  if (edit.points) for (let offset = 0; offset < edit.points.count; offset += 1) {
    const beforeValue = edit.points.before[offset]
    const afterValue = edit.points.after[offset]
    if (afterValue === beforeValue) continue
    const index = edit.points.indices[offset]
    xs[count] = index % layer.width + storageOrigin.x
    ys[count] = Math.floor(index / layer.width) + storageOrigin.y
    before[count] = beforeValue
    after[count] = afterValue
    count += 1
  }
  if (count < capacity) {
    xs = xs.slice(0, count)
    ys = ys.slice(0, count)
    before = before.slice(0, count)
    after = after.slice(0, count)
  }
  const regionPatches: CommittedPixelRegionPatch[] = []
  const pointRegionPatch = regionPatchFromPoints(layer, xs, ys, before, after)
  if (pointRegionPatch) {
    regionPatches.push(pointRegionPatch)
    xs = new Int32Array(0)
    ys = new Int32Array(0)
    before = new Uint32Array(0)
    after = new Uint32Array(0)
  }
  const runCount = edit.runs?.length ?? 0
  const runXs = new Int32Array(runCount)
  const runYs = new Int32Array(runCount)
  const runLengths = new Uint32Array(runCount)
  const runBefore = new Uint32Array(runCount)
  const runAfter = new Uint32Array(runCount)
  for (let offset = 0; offset < runCount; offset += 1) {
    const run = edit.runs![offset]
    runXs[offset] = run.index % layer.width + storageOrigin.x
    runYs[offset] = Math.floor(run.index / layer.width) + storageOrigin.y
    runLengths[offset] = run.length
    runBefore[offset] = run.before
    runAfter[offset] = run.after
  }
  const denseRegion = edit.denseRegion
  if (denseRegion?.count) regionPatches.unshift(regionPatchFromDenseEdit(layer, denseRegion))
  const layerOffset = edit.layerOffset
  if (xs.length === 0 && runCount === 0 && regionPatches.length === 0 && !layerOffset) return null
  const apply = (values: Uint32Array): void => {
    const layer = layerForFrame()
    if (xs.length > 0) markLayerContentChanged(layer)
    const origin = getLayerStorageOrigin(layer)
    const mask = isLayerMask(layer)
    for (let offset = 0; offset < xs.length; offset += 1) {
      const localX = xs[offset] - origin.x
      const localY = ys[offset] - origin.y
      if (localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height) continue
      const index = localY * layer.width + localX
      const value = values[offset]
      if (mask || layer.format === 'indexed' || document.colorMode === 'grayscale') writeLayerPacked(document, layer, index, value)
      else {
        const pixelOffset = index * 4
        layer.pixels[pixelOffset] = value & 0xff
        layer.pixels[pixelOffset + 1] = (value >>> 8) & 0xff
        layer.pixels[pixelOffset + 2] = (value >>> 16) & 0xff
        layer.pixels[pixelOffset + 3] = (value >>> 24) & 0xff
      }
    }
  }
  const applyRuns = (values: Uint32Array): void => {
    const layer = layerForFrame()
    if (runCount > 0) markLayerContentChanged(layer)
    for (let offset = 0; offset < runCount; offset += 1) {
      const start = layerIndexAtStoragePoint(layer, runXs[offset], runYs[offset])
      if (start === null) continue
      writeLayerPackedRun(document, layer, start, runLengths[offset], values[offset])
    }
  }
  const applyRegionPatches = (side: 'before' | 'after'): void => {
    if (regionPatches.length === 0) return
    const layer = layerForFrame()
    markLayerContentChanged(layer)
    for (const patch of regionPatches) applyRegionPatch(layer, patch, patch[side])
  }
  const regionPatchBytes = regionPatches.reduce((sum, patch) => sum + patch.before.byteLength + patch.after.byteLength, 0)
  const applyLayerOffset = (x: number, y: number): void => {
    if (frameId) setAnimationLayerOffsetsAtFrame(document, edit.layerId, frameId, x, y)
    else {
      const layer = getLayer(document, edit.layerId)
      layer.offsetX = x
      layer.offsetY = y
    }
  }
  return {
    label,
    bytes: xs.byteLength + ys.byteLength + before.byteLength + after.byteLength + runXs.byteLength + runYs.byteLength + runLengths.byteLength + runBefore.byteLength + runAfter.byteLength + regionPatchBytes + (layerOffset ? 32 : 0),
    undo: () => { applyRuns(runBefore); applyRegionPatches('before'); apply(before); if (layerOffset) applyLayerOffset(layerOffset.beforeX, layerOffset.beforeY) },
    redo: () => { applyRuns(runAfter); applyRegionPatches('after'); apply(after); if (layerOffset) applyLayerOffset(layerOffset.afterX, layerOffset.afterY) },
    invalidation: linkedLayerIds.length > 1
      ? { kind: 'full' }
      : edit.dirtyRect ? { kind: 'region', frameId, rect: { ...edit.dirtyRect } } : undefined,
    affectedLayerIds: linkedLayerIds.length > 0 ? linkedLayerIds : [edit.layerId]
  }
}

export function revertPixelEdit(document: SpriteDocument, edit: PixelEdit | null | undefined): void {
  if (!edit) return
  if (edit.layerOffset) {
    const frameId = edit.frameId ?? document.animation?.activeFrameId
    if (frameId) setAnimationLayerOffsetsAtFrame(document, edit.layerId, frameId, edit.layerOffset.beforeX, edit.layerOffset.beforeY)
    else {
      const target = getLayer(document, edit.layerId)
      target.offsetX = edit.layerOffset.beforeX
      target.offsetY = edit.layerOffset.beforeY
    }
  }
  const maskTarget = isLayerMask(getLayer(document, edit.layerId))
  const layer = !maskTarget && edit.frameId && document.animation?.activeFrameId !== edit.frameId
    ? animationLayerAtFrame(document, edit.layerId, edit.frameId) ?? getLayer(document, edit.layerId)
    : getLayer(document, edit.layerId)
  if (edit.before.size > 0 || edit.points?.count || edit.runs?.length || edit.denseRegion?.count) markLayerContentChanged(layer)
  for (const run of edit.runs ?? []) {
    writeLayerPackedRun(document, layer, run.index, run.length, run.before)
  }
  const denseRegion = edit.denseRegion
  if (denseRegion?.count) for (let offset = 0; offset < denseRegion.changed.length; offset += 1) {
    if (denseRegion.changed[offset] === 0) continue
    const x = denseRegion.x + offset % denseRegion.width
    const y = denseRegion.y + Math.floor(offset / denseRegion.width)
    const index = layerIndexAtStoragePoint(layer, x, y)
    if (index !== null) writeLayerPacked(document, layer, index, denseRegion.before[offset])
  }
  if (edit.points) for (let offset = 0; offset < edit.points.count; offset += 1) {
    writeLayerPacked(document, layer, edit.points.indices[offset], edit.points.before[offset])
  }
  for (const [index, value] of edit.before) writeLayerPacked(document, layer, index, value)
}
