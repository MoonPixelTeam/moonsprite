import { cacheRasterContentBounds, cachedRasterContentBounds, getActiveLayer, getLayerStorageOrigin, markLayerContentChanged, setLayerStorageOrigin } from '@/core/document-model'
import { animationCelAt, ensureAnimationDocument } from '@/core/animation'
import type { LayerMergeSuccess } from '@/core/layer-merge'
import type { AdjustmentSnapshot, DocumentSession } from './workspace-types'
import { touch } from './workspace-session'
import { translateCurrent as tr } from '@/core/localization'
import { captureDocumentStructureSnapshot, documentStructureDeltaBytes, restoreDocumentStructureSnapshot, type DocumentStructureSnapshot } from './workspace-document-history'
import type { SelectionRect } from '@shared/types-selection'

const adjustmentTargetLayerIds = (session: DocumentSession): string[] => {
  if (session.selection) return [getActiveLayer(session.document).id]
  const selected = session.selectedLayerIds.filter((id) => session.document.layers.some((layer) => layer.id === id))
  return [...new Set(selected.length > 0 ? selected : [getActiveLayer(session.document).id])]
}

export function captureAdjustmentSnapshot(session: DocumentSession, targetLayerIds = adjustmentTargetLayerIds(session)): AdjustmentSnapshot {
  const timeline = ensureAnimationDocument(session.document)
  return {
    layers: targetLayerIds.flatMap((layerId) => {
      const layer = session.document.layers.find((candidate) => candidate.id === layerId)
      if (!layer) return []
      const storageOrigin = getLayerStorageOrigin(layer)
      return [{
        layerId,
        frameId: timeline.activeFrameId,
        width: layer.width,
        height: layer.height,
        offsetX: layer.offsetX,
        offsetY: layer.offsetY,
        storageOriginX: storageOrigin.x,
        storageOriginY: storageOrigin.y,
        pixels: layer.format === 'rgba' ? new Uint8ClampedArray(layer.pixels) : new Uint32Array(layer.pixels)
      }]
    }),
    palette: session.document.palette.map((entry) => ({ ...entry, color: { ...entry.color } })),
    nextColorId: session.document.nextColorId
  }
}

const bindAdjustmentSnapshotPixels = (
  session: DocumentSession,
  layerSnapshot: AdjustmentSnapshot['layers'][number],
  pixels: Uint8ClampedArray | Uint32Array
): void => {
  const timeline = ensureAnimationDocument(session.document)
  const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
  if (!layer) return
  if ((layer.format === 'rgba') !== (pixels instanceof Uint8ClampedArray)) throw new Error(tr('core.history.adjustmentFormatChanged'))
  const frameId = layerSnapshot.frameId ?? timeline.activeFrameId
  const cel = animationCelAt(timeline, layerSnapshot.layerId, frameId)
  if (cel) cel.surface = layer.format === 'rgba' && pixels instanceof Uint8ClampedArray
    ? { format: 'rgba', width: layerSnapshot.width, height: layerSnapshot.height, offsetX: layerSnapshot.offsetX, offsetY: layerSnapshot.offsetY, storageOriginX: layerSnapshot.storageOriginX, storageOriginY: layerSnapshot.storageOriginY, pixels }
    : layer.format === 'indexed' && pixels instanceof Uint32Array
      ? { format: 'indexed', width: layerSnapshot.width, height: layerSnapshot.height, offsetX: layerSnapshot.offsetX, offsetY: layerSnapshot.offsetY, storageOriginX: layerSnapshot.storageOriginX, storageOriginY: layerSnapshot.storageOriginY, pixels }
      : undefined
  if (timeline.activeFrameId === frameId) {
    layer.width = layerSnapshot.width
    layer.height = layerSnapshot.height
    layer.offsetX = layerSnapshot.offsetX
    layer.offsetY = layerSnapshot.offsetY
    layer.pixels = pixels
    setLayerStorageOrigin(layer, { x: layerSnapshot.storageOriginX, y: layerSnapshot.storageOriginY })
    if (cel?.surface) cel.surface.pixels = layer.pixels
  }
}

const restoreAdjustmentPalette = (session: DocumentSession, snapshot: AdjustmentSnapshot): void => {
  session.document.palette = snapshot.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
  session.document.nextColorId = snapshot.nextColorId
}

/** Rebinds snapshot geometry to writable layer storage. Partial previews initialize newly detached storage from the baseline. */
export function prepareAdjustmentSnapshotTargets(session: DocumentSession, snapshot: AdjustmentSnapshot, initializeDetachedPixels = false): void {
  const timeline = ensureAnimationDocument(session.document)
  for (const layerSnapshot of snapshot.layers) {
    const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
    if (!layer) continue
    const frameId = layerSnapshot.frameId ?? timeline.activeFrameId
    const cel = animationCelAt(timeline, layerSnapshot.layerId, frameId)
    const celPixels = cel?.surface?.pixels
    const current = timeline.activeFrameId === frameId ? layer.pixels : celPixels
    const expectedLength = layerSnapshot.pixels.length
    const currentIsShared = current !== undefined && (
      session.document.layers.some((candidate) => candidate.id !== layer.id && candidate.pixels === current)
      || timeline.cels.some((candidate) => candidate.id !== cel?.id && candidate.surface?.pixels === current)
    )
    const pixels = layerSnapshot.pixels instanceof Uint8ClampedArray
      ? current instanceof Uint8ClampedArray && current.length === expectedLength && !currentIsShared ? current : new Uint8ClampedArray(expectedLength)
      : current instanceof Uint32Array && current.length === expectedLength && !currentIsShared ? current : new Uint32Array(expectedLength)
    if (initializeDetachedPixels && pixels !== current) {
      if (pixels instanceof Uint8ClampedArray && layerSnapshot.pixels instanceof Uint8ClampedArray) pixels.set(layerSnapshot.pixels)
      else if (pixels instanceof Uint32Array && layerSnapshot.pixels instanceof Uint32Array) pixels.set(layerSnapshot.pixels)
    }
    bindAdjustmentSnapshotPixels(session, layerSnapshot, pixels)
  }
  restoreAdjustmentPalette(session, snapshot)
}

export function restorePreparedAdjustmentSnapshotLayer(session: DocumentSession, layerSnapshot: AdjustmentSnapshot['layers'][number]): void {
  const pixels = layerSnapshot.pixels instanceof Uint8ClampedArray ? new Uint8ClampedArray(layerSnapshot.pixels) : new Uint32Array(layerSnapshot.pixels)
  bindAdjustmentSnapshotPixels(session, layerSnapshot, pixels)
}

export function restoreAdjustmentSnapshot(session: DocumentSession, snapshot: AdjustmentSnapshot): void {
  for (const layerSnapshot of snapshot.layers) {
    const pixels = layerSnapshot.pixels instanceof Uint8ClampedArray ? new Uint8ClampedArray(layerSnapshot.pixels) : new Uint32Array(layerSnapshot.pixels)
    bindAdjustmentSnapshotPixels(session, layerSnapshot, pixels)
  }
  restoreAdjustmentPalette(session, snapshot)
}

const intersectAdjustmentRestoreRect = (first: SelectionRect, second: SelectionRect): SelectionRect | null => {
  const x = Math.max(first.x, second.x)
  const y = Math.max(first.y, second.y)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const bottom = Math.min(first.y + first.height, second.y + second.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

const mergeAdjustmentRestoreRects = (first: SelectionRect, second: SelectionRect): SelectionRect => {
  const x = Math.min(first.x, second.x)
  const y = Math.min(first.y, second.y)
  const right = Math.max(first.x + first.width, second.x + second.width)
  const bottom = Math.max(first.y + first.height, second.y + second.height)
  return { x, y, width: right - x, height: bottom - y }
}

/** Restores only preview-touched rows. Returns null when geometry drift required a full restore. */
export function restoreAdjustmentSnapshotRegions(
  session: DocumentSession,
  snapshot: AdjustmentSnapshot,
  regions: readonly SelectionRect[]
): Array<{ layerId: string; rect: SelectionRect }> | null {
  const timeline = ensureAnimationDocument(session.document)
  const targets = snapshot.layers.flatMap((layerSnapshot) => {
    const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
    const frameId = layerSnapshot.frameId ?? timeline.activeFrameId
    if (!layer) return []
    const origin = getLayerStorageOrigin(layer)
    const compatible = timeline.activeFrameId === frameId
      && layer.width === layerSnapshot.width
      && layer.height === layerSnapshot.height
      && layer.offsetX === layerSnapshot.offsetX
      && layer.offsetY === layerSnapshot.offsetY
      && origin.x === layerSnapshot.storageOriginX
      && origin.y === layerSnapshot.storageOriginY
      && layer.pixels.length === layerSnapshot.pixels.length
      && (layer.pixels instanceof Uint8ClampedArray) === (layerSnapshot.pixels instanceof Uint8ClampedArray)
    return compatible ? [{ layer, layerSnapshot }] : [{ layer, layerSnapshot, incompatible: true as const }]
  })
  if (targets.some((target) => 'incompatible' in target)) {
    restoreAdjustmentSnapshot(session, snapshot)
    return null
  }

  const restored: Array<{ layerId: string; rect: SelectionRect }> = []
  for (const target of targets) {
    const { layer, layerSnapshot } = target
    const cachedBounds = cachedRasterContentBounds(layer, session.document.palette)
    const layerBounds = { x: layer.offsetX, y: layer.offsetY, width: layer.width, height: layer.height }
    const components = layer.pixels instanceof Uint8ClampedArray ? 4 : 1
    let restoredRect: SelectionRect | null = null
    for (const region of regions) {
      const rect = intersectAdjustmentRestoreRect(region, layerBounds)
      if (!rect) continue
      const localX = rect.x - layer.offsetX
      const localY = rect.y - layer.offsetY
      for (let row = 0; row < rect.height; row += 1) {
        const offset = ((localY + row) * layer.width + localX) * components
        const length = rect.width * components
        if (layer.pixels instanceof Uint8ClampedArray && layerSnapshot.pixels instanceof Uint8ClampedArray) {
          layer.pixels.set(layerSnapshot.pixels.subarray(offset, offset + length), offset)
        } else if (layer.pixels instanceof Uint32Array && layerSnapshot.pixels instanceof Uint32Array) {
          layer.pixels.set(layerSnapshot.pixels.subarray(offset, offset + length), offset)
        }
      }
      restoredRect = restoredRect ? mergeAdjustmentRestoreRects(restoredRect, rect) : rect
    }
    if (!restoredRect) continue
    markLayerContentChanged(layer)
    if (cachedBounds !== undefined) cacheRasterContentBounds(layer, snapshot.palette, cachedBounds)
    restored.push({ layerId: layer.id, rect: restoredRect })
  }
  restoreAdjustmentPalette(session, snapshot)
  return restored
}

export interface LayerUiSnapshot {
  selectedLayerIds: string[]
  layerSelectionExplicit: boolean
  selectedGroupId: string | null
  selectedGroupIds: string[]
  collapsedGroupIds: string[]
}

export const captureLayerUi = (session: DocumentSession): LayerUiSnapshot => ({
  selectedLayerIds: [...session.selectedLayerIds],
  layerSelectionExplicit: session.layerSelectionExplicit === true,
  selectedGroupId: session.selectedGroupId,
  selectedGroupIds: [...session.selectedGroupIds],
  collapsedGroupIds: [...session.collapsedGroupIds]
})

const restoreLayerUi = (session: DocumentSession, snapshot: LayerUiSnapshot): void => {
  session.selectedLayerIds = [...snapshot.selectedLayerIds]
  session.layerSelectionExplicit = snapshot.layerSelectionExplicit === true
  session.selectedGroupId = snapshot.selectedGroupId
  session.selectedGroupIds = [...snapshot.selectedGroupIds]
  session.collapsedGroupIds = [...snapshot.collapsedGroupIds]
}

export function commitLayerMerge(session: DocumentSession, beforeDocument: DocumentStructureSnapshot, beforeUi: LayerUiSnapshot, result: LayerMergeSuccess, label: string): void {
  session.selectedGroupId = null
  session.selectedGroupIds = []
  session.selectedLayerIds = [result.layerId]
  session.layerSelectionExplicit = true
  session.collapsedGroupIds = session.collapsedGroupIds.filter((id) => !result.removedGroupIds.includes(id))
  touch(session)
  const afterDocument = captureDocumentStructureSnapshot(session.document)
  const afterUi = captureLayerUi(session)
  session.history.push({
    label,
    bytes: documentStructureDeltaBytes(beforeDocument, afterDocument),
    undo: () => { restoreDocumentStructureSnapshot(session.document, beforeDocument); restoreLayerUi(session, beforeUi) },
    redo: () => { restoreDocumentStructureSnapshot(session.document, afterDocument); restoreLayerUi(session, afterUi) },
    invalidation: { kind: 'full' },
    requiresAnimationSync: false
  })
}
