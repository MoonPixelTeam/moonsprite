import { findLayerMask, isLayerMask } from './document-model'
import type { SelectionMask, SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { animationLayerAtFrame, createAnimationCelLookup, ensureAnimationDocument, parseAnimationCelKey, syncAnimationLayerAtFrame } from './animation'
import type { PixelEdit } from './history'
import type { SelectionShearTransform } from './selection'
import type { SymmetryAxes, SymmetryCenter, SymmetryPoint } from './symmetry'
import { applySelectionTransform, captureSelectionTransform, type SelectionTransformLayerState } from './tools-selection-transform'

export interface AnimationSelectionTargetPair {
  layerId: string
  frameId: string
}

/**
 * Resolve the timeline selection into concrete layer/frame targets. Cell
 * selections are exact targets; frame selections expand across the selected
 * layers. Keeping this as a pure operation makes the same target set usable
 * by drag previews and command-based transforms.
 */
export const animationSelectionTargetPairs = (
  selectedFrameIds: readonly string[],
  selectedLayerIds: readonly string[],
  selectedCellKeys: readonly string[] = []
): AnimationSelectionTargetPair[] => {
  const pairs: AnimationSelectionTargetPair[] = []
  const seen = new Set<string>()
  const add = (pair: AnimationSelectionTargetPair): void => {
    const key = `${pair.layerId}:${pair.frameId}`
    if (seen.has(key)) return
    seen.add(key)
    pairs.push(pair)
  }
  for (const key of selectedCellKeys) {
    const target = parseAnimationCelKey(key)
    if (target) add(target)
  }
  for (const frameId of selectedFrameIds) {
    for (const layerId of selectedLayerIds) add({ layerId, frameId })
  }
  return pairs
}

export const captureAnimationFrameSelectionTransformStates = (
  document: SpriteDocument,
  selectedFrameIds: readonly string[],
  selectedLayerIds: readonly string[],
  selection: SelectionMask,
  selectedCellKeys: readonly string[] = [],
  options?: { preserveOutsideCanvas?: boolean }
): SelectionTransformLayerState[] => {
  const timeline = ensureAnimationDocument(document)
  const pairs = animationSelectionTargetPairs(selectedFrameIds, selectedLayerIds, selectedCellKeys)
  if (pairs.length === 0) return []
  const orderedPairs = [...pairs].sort((left, right) => {
    // Keep the active frame as one contiguous batch. Within each frame, put
    // the active layer first; elevating only the active layer without first
    // grouping the active frame would split that frame around other batches
    // and make multi-frame transforms apply in the wrong order.
    const leftActiveFrame = left.frameId === timeline.activeFrameId
    const rightActiveFrame = right.frameId === timeline.activeFrameId
    if (leftActiveFrame !== rightActiveFrame) return leftActiveFrame ? -1 : 1
    const leftActive = left.layerId === document.activeLayerId
    const rightActive = right.layerId === document.activeLayerId
    if (leftActive !== rightActive) return leftActive ? -1 : 1
    const frameDelta = timeline.frames.findIndex((frame) => frame.id === left.frameId) - timeline.frames.findIndex((frame) => frame.id === right.frameId)
    if (frameDelta !== 0) return frameDelta
    return document.layers.findIndex((layer) => layer.id === left.layerId) - document.layers.findIndex((layer) => layer.id === right.layerId)
  })
  const lookup = createAnimationCelLookup(timeline)
  const capturedSourceIds = new Set<string>()
  const states: SelectionTransformLayerState[] = []
  for (const { frameId, layerId } of orderedPairs) {
    const layerDefinition = document.layers.find((layer) => layer.id === layerId)
    if (!layerDefinition || layerDefinition.kind) continue
    const cel = lookup.at(layerId, frameId)
    const sourceCel = lookup.resolve(cel)
    const sourceKey = sourceCel ? `${layerId}:${sourceCel.id}` : null
    if (!sourceCel?.surface || !sourceKey || capturedSourceIds.has(sourceKey)) continue
    const layer = frameId === timeline.activeFrameId
      ? layerDefinition
      : animationLayerAtFrame(document, layerId, frameId)
    if (!layer || layer.kind) continue
    const source = captureSelectionTransform(document, selection, layer, options)
    if (!source) continue
    capturedSourceIds.add(sourceKey)
    states.push({ layerId, frameId, source, previewEdit: null, translationPreview: null })
  }
  return states
}

export const selectionTransformLayerForState = (
  document: SpriteDocument,
  state: Pick<SelectionTransformLayerState, 'layerId' | 'frameId'>
) => {
  const mask = findLayerMask(document, state.layerId)
  if (mask) return mask
  if (!state.frameId || document.animation?.activeFrameId === state.frameId) {
    return document.layers.find((candidate) => candidate.id === state.layerId) ?? null
  }
  return animationLayerAtFrame(document, state.layerId, state.frameId)
}

export const applySelectionTransformLayerState = (
  document: SpriteDocument,
  state: SelectionTransformLayerState,
  target: SelectionRect,
  angle = 0,
  copy = false,
  shear?: SelectionShearTransform,
  symmetryAxes?: SymmetryAxes,
  symmetryCenter?: SymmetryCenter,
  symmetryStartPoint?: SymmetryPoint,
  quad?: SelectionQuad,
  optimizedRotation = false
): PixelEdit | null => {
  const layer = selectionTransformLayerForState(document, state)
  if (!layer || layer.kind) return null
  const edit = applySelectionTransform(document, state.source, target, angle, copy, shear, symmetryAxes, symmetryCenter, layer, symmetryStartPoint, quad, false, optimizedRotation)
  if (state.frameId && !isLayerMask(layer)) {
    if (edit) edit.frameId = state.frameId
    syncAnimationLayerAtFrame(document, layer, state.frameId)
  }
  return edit
}
