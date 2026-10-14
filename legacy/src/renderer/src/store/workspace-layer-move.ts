import type { AnimationCel } from '@shared/types-animation'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { animationCelKey, cloneAnimationCel, cloneAnimationCelsForLayer, ensureAnimationDocument, parseAnimationCelKey, removeAnimationCelsForLayers, restoreAnimationCels, setAnimationCelOffsets, setAnimationCelOffsetsForKeys, animationCelOffsetsForKeys } from '@/core/animation'
import { animationMaskAt } from '@/core/document-model'
import type { LayerMoveState } from '@/core/layer-move-state'
export type { LayerMoveState } from '@/core/layer-move-state'
import type { ContentInvalidationHint, HistoryEntry } from '@/core/history'
import { cloneLayerStyles, layerStylesHistoryBytes } from '@/core/layer-styles'
import { cloneSelection } from '@/core/selection'
import { cloneTextCelData, translateTextCelData } from '@/core/text-cel-data'
import type { DocumentSession } from './workspace-types'

type Point = { x: number; y: number }


export interface LayerMoveDuplicateResult {
  layerId: string
  layer: RasterLayer
  animationCels: AnimationCel[]
  insertionIndex: number
}

const moveLayerInvalidation = (move: LayerMoveState, frameId?: string): ContentInvalidationHint | undefined => {
  if (!move.layerContentBounds || !move.layerPreviewOffset) return undefined
  const bounds = Object.values(move.layerContentBounds).filter((candidate): candidate is SelectionRect => Boolean(candidate))
  if (bounds.length === 0) return undefined
  const moved = bounds.map((candidate) => ({
    x: candidate.x + move.layerPreviewOffset!.x,
    y: candidate.y + move.layerPreviewOffset!.y,
    width: candidate.width,
    height: candidate.height
  }))
  const regions = [...bounds, ...moved]
  const left = Math.min(...regions.map((region) => region.x))
  const top = Math.min(...regions.map((region) => region.y))
  const right = Math.max(...regions.map((region) => region.x + region.width))
  const bottom = Math.max(...regions.map((region) => region.y + region.height))
  return { kind: 'region', frameId, rect: { x: left, y: top, width: right - left, height: bottom - top } }
}

export const animationMaskOffsetsForLayerMove = (session: DocumentSession, layerIds: readonly string[], frameId: string | undefined, animationCellKeys: readonly string[] = []): Record<string, Point> => {
  if (!frameId && animationCellKeys.length === 0) return {}
  const timeline = ensureAnimationDocument(session.document)
  const keys = animationCellKeys.length
    ? animationCellKeys
    : frameId ? layerIds.map((layerId) => `${layerId}\u0000${frameId}`) : []
  return Object.fromEntries(keys.flatMap((key) => {
    const target = parseAnimationCelKey(key)
    const mask = target ? animationMaskAt(timeline, target.layerId, target.frameId) : null
    return mask && mask.moveWithOwner !== false ? [[key, { x: mask.offsetX, y: mask.offsetY }] as const] : []
  }))
}

const setAnimationMaskOffsets = (session: DocumentSession, offsets: Readonly<Record<string, Point>>): void => {
  if (Object.keys(offsets).length === 0) return
  const timeline = ensureAnimationDocument(session.document)
  const seen = new Set<string>()
  for (const [key, offset] of Object.entries(offsets)) {
    const target = parseAnimationCelKey(key)
    const mask = target ? animationMaskAt(timeline, target.layerId, target.frameId) : null
    if (!mask || seen.has(mask.id)) continue
    seen.add(mask.id)
    mask.offsetX = offset.x
    mask.offsetY = offset.y
  }
}

const previewAnimationMaskOffsets = (session: DocumentSession, move: LayerMoveState, distanceX: number, distanceY: number): void => {
  if (!move.animationMaskOffsets) move.animationMaskOffsets = animationMaskOffsetsForLayerMove(session, move.layerIds ?? [], move.layerFrameId, move.animationCellKeys ?? [])
  setAnimationMaskOffsets(session, Object.fromEntries(Object.entries(move.animationMaskOffsets).map(([key, offset]) => [key, { x: offset.x + distanceX, y: offset.y + distanceY }])))
}

export const beginLayerMoveDuplicatePreview = (
  session: DocumentSession,
  sourceLayerId: string,
  copySuffix: string,
  now = Date.now()
): LayerMoveDuplicateResult | null => {
  const source = session.document.layers.find((candidate) => candidate.id === sourceLayerId)
  if (!source) return null
  const layerStyles = cloneLayerStyles(source.layerStyles)
  const copy = source.format === 'rgba'
    ? { ...source, id: `${source.id}-copy-${now}`, name: `${source.name} ${copySuffix}`, ...(layerStyles ? { layerStyles } : {}), pixels: new Uint8ClampedArray(source.pixels) } as RasterLayer
    : { ...source, id: `${source.id}-copy-${now}`, name: `${source.name} ${copySuffix}`, ...(layerStyles ? { layerStyles } : {}), pixels: new Uint32Array(source.pixels) } as RasterLayer
  const insertionIndex = session.document.layers.indexOf(source) + 1
  session.document.layers.splice(insertionIndex, 0, copy)
  cloneAnimationCelsForLayer(session.document, source.id, copy)
  session.document.activeLayerId = copy.id
  session.selectedLayerIds = [copy.id]
  session.selectedGroupId = null
  session.selectedGroupIds = []
  return {
    layerId: copy.id,
    layer: copy,
    animationCels: ensureAnimationDocument(session.document).cels
      .filter((cel) => cel.layerId === copy.id)
      .map(cloneAnimationCel),
    insertionIndex
  }
}

export const previewLayerMove = (
  session: DocumentSession,
  move: LayerMoveState,
  distanceX: number,
  distanceY: number
): boolean => {
  if (!move.layerId) return false
  if (!move.duplicatedLayerId && move.animationCellOffsets && move.animationCellKeys?.length) {
    const nextOffsets = Object.fromEntries(move.animationCellKeys.map((key) => {
      const offset = move.animationCellOffsets![key]
      return [key, { x: offset.x + distanceX, y: offset.y + distanceY }]
    }))
    setAnimationCelOffsetsForKeys(session.document, nextOffsets)
    previewAnimationMaskOffsets(session, move, distanceX, distanceY)
  } else {
    const layerIds = move.duplicatedLayerId ? [move.duplicatedLayerId] : move.layerIds ?? [move.layerId]
    for (const layerId of layerIds) {
      const layer = session.document.layers.find((candidate) => candidate.id === layerId)
      const offset = move.duplicatedLayerId ? move.layerOffset : move.layerOffsets?.[layerId]
      if (!layer || !offset) continue
      layer.offsetX = offset.x + distanceX
      layer.offsetY = offset.y + distanceY
    }
    if (move.animationMaskOffsets) previewAnimationMaskOffsets(session, move, distanceX, distanceY)
  }
  if (move.duplicatedLayerId && move.duplicatedAnimationCels?.length) {
    // The duplicated cels own their own text origins. Move them with the
    // preview so subsequent text rasterization uses the copied position.
    // Use the drag-start snapshots as the source on every pointer update:
    // unlike surfaces, text origin metadata is not represented by layer
    // offsets and must not accumulate or retain the original layer's origin.
    const timeline = ensureAnimationDocument(session.document)
    for (const original of move.duplicatedAnimationCels) {
      if (!original.text) continue
      const duplicate = timeline.cels.find((cel) => cel.layerId === move.duplicatedLayerId && cel.frameId === original.frameId)
      if (!duplicate) continue
      duplicate.text = translateTextCelData(cloneTextCelData(original.text), distanceX, distanceY)
    }
    const offsets = Object.fromEntries(move.duplicatedAnimationCels.flatMap((cel) => cel.surface
      ? [[animationCelKey(move.duplicatedLayerId!, cel.frameId), { x: cel.surface.offsetX + distanceX, y: cel.surface.offsetY + distanceY }] as const]
      : []))
    setAnimationCelOffsetsForKeys(session.document, offsets)
  }
  if (move.selectionStart) {
    // Layer movement preserves off-canvas pixels, so its selection must also
    // remain intact instead of being clipped to the document bounds.
    session.selection = {
      ...cloneSelection(move.selectionStart)!,
      x: move.selectionStart.x + distanceX,
      y: move.selectionStart.y + distanceY
    }
  }
  return true
}

export const cancelLayerMovePreview = (session: DocumentSession, move: LayerMoveState): boolean => {
  if (move.duplicatedLayerId) {
    session.document.layers = session.document.layers.filter((layer) => layer.id !== move.duplicatedLayerId)
    removeAnimationCelsForLayers(session.document, [move.duplicatedLayerId])
    if (move.layerId) session.document.activeLayerId = move.layerId
    session.selectedLayerIds = move.originalSelectedLayerIds?.length ? [...move.originalSelectedLayerIds] : move.layerId ? [move.layerId] : []
    session.selectedGroupId = null
    session.selectedGroupIds = []
  } else if (move.animationCellOffsets && move.animationCellKeys?.length) {
    setAnimationCelOffsetsForKeys(session.document, move.animationCellOffsets)
    if (move.animationMaskOffsets) setAnimationMaskOffsets(session, move.animationMaskOffsets)
  } else {
    for (const layerId of move.layerIds ?? (move.layerId ? [move.layerId] : [])) {
      const layer = session.document.layers.find((candidate) => candidate.id === layerId)
      const offset = move.layerOffsets?.[layerId] ?? (layerId === move.layerId ? move.layerOffset : undefined)
      if (layer && offset) {
        layer.offsetX = offset.x
        layer.offsetY = offset.y
      }
    }
    if (move.animationMaskOffsets) setAnimationMaskOffsets(session, move.animationMaskOffsets)
  }
  if (move.selectionStart !== undefined) session.selection = cloneSelection(move.selectionStart)
  return true
}

const duplicateHistoryBytes = (layer: RasterLayer, cels: readonly AnimationCel[]): number =>
  layer.pixels.byteLength
  + cels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0) + (cel.tilemap?.cells.length ?? 0) * 24, 0)
  + layerStylesHistoryBytes(layer.layerStyles)
  + 32

export const createLayerMoveHistoryEntry = (
  session: DocumentSession,
  move: LayerMoveState,
  labels: { single: string; multiple: string }
): HistoryEntry | null => {
  if (!move.duplicatedLayer && move.animationCellOffsets && move.animationCellKeys?.length) {
    const before = move.animationCellOffsets
    const after = animationCelOffsetsForKeys(session.document, move.animationCellKeys)
    const beforeMasks = move.animationMaskOffsets ?? animationMaskOffsetsForLayerMove(session, move.layerIds ?? [], move.layerFrameId, move.animationCellKeys)
    const afterMasks = animationMaskOffsetsForLayerMove(session, move.layerIds ?? [], move.layerFrameId, move.animationCellKeys)
    const beforeSelection = cloneSelection(move.selectionStart ?? null)
    const afterSelection = cloneSelection(session.selection)
    const offsetsChanged = move.animationCellKeys.some((key) => after[key] && (after[key].x !== before[key].x || after[key].y !== before[key].y))
    const maskOffsetsChanged = Object.keys(beforeMasks).some((key) => afterMasks[key] && (afterMasks[key].x !== beforeMasks[key].x || afterMasks[key].y !== beforeMasks[key].y))
    if (!offsetsChanged && !maskOffsetsChanged) return null
    const affectedLayerIds = [...new Set(move.animationCellKeys.map((key) => parseAnimationCelKey(key)?.layerId).filter((id): id is string => Boolean(id)))]
    const activeFrameOnly = Boolean(move.layerFrameId) && move.animationCellKeys.every((key) => parseAnimationCelKey(key)?.frameId === move.layerFrameId)
    return {
      label: move.animationCellKeys.length > 1 ? labels.multiple : labels.single,
      bytes: move.animationCellKeys.length * 32 + Object.keys(beforeMasks).length * 16,
      undo: () => {
        setAnimationCelOffsetsForKeys(session.document, before)
        setAnimationMaskOffsets(session, beforeMasks)
        session.selection = cloneSelection(beforeSelection)
      },
      redo: () => {
        setAnimationCelOffsetsForKeys(session.document, after)
        setAnimationMaskOffsets(session, afterMasks)
        session.selection = cloneSelection(afterSelection)
      },
      invalidation: activeFrameOnly ? moveLayerInvalidation(move, move.layerFrameId) : undefined,
      affectedLayerIds,
      requiresAnimationSync: false
    }
  }

  if (!move.duplicatedLayer && move.layerIds && move.layerIds.length > 1 && move.layerOffsets) {
    const before = move.layerOffsets
    const beforeMasks = move.animationMaskOffsets ?? animationMaskOffsetsForLayerMove(session, move.layerIds, move.layerFrameId)
    const afterMasks = animationMaskOffsetsForLayerMove(session, move.layerIds, move.layerFrameId)
    const beforeSelection = cloneSelection(move.selectionStart ?? null)
    const afterSelection = cloneSelection(session.selection)
    const after = Object.fromEntries(move.layerIds.map((id) => {
      const layer = session.document.layers.find((candidate) => candidate.id === id)
      return [id, { x: layer?.offsetX ?? before[id].x, y: layer?.offsetY ?? before[id].y }]
    }))
    const offsetsChanged = move.layerIds.some((id) => after[id].x !== before[id].x || after[id].y !== before[id].y)
    const maskOffsetsChanged = Object.keys(beforeMasks).some((key) => afterMasks[key] && (afterMasks[key].x !== beforeMasks[key].x || afterMasks[key].y !== beforeMasks[key].y))
    if (!offsetsChanged && !maskOffsetsChanged) return null
    const frameId = move.layerFrameId
    return {
      label: labels.multiple,
      bytes: move.layerIds.length * 32 + Object.keys(beforeMasks).length * 16,
      undo: () => {
        if (frameId) setAnimationCelOffsets(session.document, frameId, before)
        else restoreLayerOffsets(session, before)
        setAnimationMaskOffsets(session, beforeMasks)
        session.selection = cloneSelection(beforeSelection)
      },
      redo: () => {
        if (frameId) setAnimationCelOffsets(session.document, frameId, after)
        else restoreLayerOffsets(session, after)
        setAnimationMaskOffsets(session, afterMasks)
        session.selection = cloneSelection(afterSelection)
      },
      invalidation: moveLayerInvalidation(move, frameId),
      affectedLayerIds: [...move.layerIds],
      requiresAnimationSync: false
    }
  }

  if (!move.layerId || !move.layerOffset) return null
  const layerId = move.duplicatedLayerId ?? move.layerId
  const layer = session.document.layers.find((candidate) => candidate.id === layerId)
  const beforeMasks = move.animationMaskOffsets ?? animationMaskOffsetsForLayerMove(session, move.layerIds ?? [move.layerId], move.layerFrameId)
  const afterMasks = animationMaskOffsetsForLayerMove(session, move.layerIds ?? [move.layerId], move.layerFrameId)
  const maskOffsetsChanged = Object.keys(beforeMasks).some((key) => afterMasks[key] && (afterMasks[key].x !== beforeMasks[key].x || afterMasks[key].y !== beforeMasks[key].y))
  if (!layer || (!move.duplicatedLayer && layer.offsetX === move.layerOffset.x && layer.offsetY === move.layerOffset.y && !maskOffsetsChanged)) return null
  const before = { ...move.layerOffset }
  const after = { x: layer.offsetX, y: layer.offsetY }
  const beforeSelection = cloneSelection(move.selectionStart ?? null)
  const afterSelection = cloneSelection(session.selection)
  const duplicatedLayer = move.duplicatedLayer
  // Redo must restore the copy after its final drag position has been applied.
  // The drag-start snapshot intentionally remains in move for cancellation, so
  // using it here would restore stale text origins after an undo/redo cycle.
  const duplicatedAnimationCels = duplicatedLayer
    ? ensureAnimationDocument(session.document).cels
      .filter((cel) => cel.layerId === layerId)
      .map(cloneAnimationCel)
    : []
  return {
    label: labels.single,
    bytes: duplicatedLayer ? duplicateHistoryBytes(duplicatedLayer, duplicatedAnimationCels) : 32,
    undo: () => {
      if (duplicatedLayer) {
        session.document.layers = session.document.layers.filter((candidate) => candidate.id !== layerId)
        removeAnimationCelsForLayers(session.document, [layerId])
        session.document.activeLayerId = move.layerId!
        session.selectedLayerIds = move.originalSelectedLayerIds?.length ? [...move.originalSelectedLayerIds] : [move.layerId!]
        session.selectedGroupId = null
        session.selectedGroupIds = []
      } else if (move.layerFrameId) {
        setAnimationCelOffsets(session.document, move.layerFrameId, { [layerId]: before })
      } else {
        restoreLayerOffsets(session, { [layerId]: before })
      }
      setAnimationMaskOffsets(session, beforeMasks)
      session.selection = cloneSelection(beforeSelection)
    },
    redo: () => {
      if (duplicatedLayer) {
        if (!session.document.layers.some((candidate) => candidate.id === layerId)) {
          session.document.layers.splice(move.duplicatedLayerIndex ?? session.document.layers.length, 0, duplicatedLayer)
        }
        restoreAnimationCels(session.document, duplicatedAnimationCels)
        duplicatedLayer.offsetX = after.x
        duplicatedLayer.offsetY = after.y
        session.document.activeLayerId = layerId
        session.selectedLayerIds = [layerId]
        session.selectedGroupId = null
        session.selectedGroupIds = []
      } else if (move.layerFrameId) {
        setAnimationCelOffsets(session.document, move.layerFrameId, { [layerId]: after })
      } else {
        restoreLayerOffsets(session, { [layerId]: after })
      }
      setAnimationMaskOffsets(session, afterMasks)
      session.selection = cloneSelection(afterSelection)
    },
    invalidation: duplicatedLayer ? undefined : moveLayerInvalidation(move, move.layerFrameId),
    affectedLayerIds: duplicatedLayer ? undefined : [layerId],
    requiresAnimationSync: duplicatedLayer ? undefined : false,
    requiresAnimationSelectionNormalization: duplicatedLayer ? true : undefined
  }
}

const restoreLayerOffsets = (session: DocumentSession, offsets: Readonly<Record<string, Point>>): void => {
  for (const [layerId, offset] of Object.entries(offsets)) {
    const layer = session.document.layers.find((candidate) => candidate.id === layerId)
    if (!layer) continue
    layer.offsetX = offset.x
    layer.offsetY = offset.y
  }
}
