import type { SelectionMask, SelectionQuad, SelectionRect, SpriteDocument } from '@shared/types'
import { animationLayerAtFrame, createAnimationCelLookup, ensureAnimationDocument, parseAnimationCelKey, syncAnimationLayerAtFrame } from './animation'
import type { PixelEdit } from './history'
import type { SelectionShearTransform } from './selection'
import type { SymmetryAxes, SymmetryCenter, SymmetryPoint } from './symmetry'
import { applySelectionTransform, captureSelectionTransform, type SelectionTransformLayerState } from './tools'

export const captureAnimationFrameSelectionTransformStates = (
  document: SpriteDocument,
  selectedFrameIds: readonly string[],
  selectedLayerIds: readonly string[],
  selection: SelectionMask,
  selectedCellKeys: readonly string[] = []
): SelectionTransformLayerState[] => {
  const timeline = ensureAnimationDocument(document)
  const selectedFrames = new Set(selectedFrameIds)
  const selectedLayers = new Set(selectedLayerIds)
  const explicitCellTargets = selectedCellKeys
    .map((key) => parseAnimationCelKey(key))
    .filter((target): target is { layerId: string; frameId: string } => Boolean(target))
    .filter((target) => selectedFrames.size === 0 || selectedFrames.has(target.frameId))
    .filter((target) => selectedLayers.size === 0 || selectedLayers.has(target.layerId))
  if (explicitCellTargets.length === 0 && (selectedFrameIds.length < 1 || selectedLayerIds.length === 0)) return []
  const pairs = explicitCellTargets.length > 0
    ? explicitCellTargets
    : timeline.frames
      .filter((frame) => selectedFrames.has(frame.id))
      .flatMap((frame) => document.layers.filter((layer) => selectedLayers.has(layer.id)).map((layer) => ({ layerId: layer.id, frameId: frame.id })))
  const orderedPairs = [...pairs].sort((left, right) => {
    const leftActive = left.frameId === timeline.activeFrameId && left.layerId === document.activeLayerId
    const rightActive = right.frameId === timeline.activeFrameId && right.layerId === document.activeLayerId
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
    const source = captureSelectionTransform(document, selection, layer)
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
  quad?: SelectionQuad
): PixelEdit | null => {
  const layer = selectionTransformLayerForState(document, state)
  if (!layer || layer.kind) return null
  const edit = applySelectionTransform(document, state.source, target, angle, copy, shear, symmetryAxes, symmetryCenter, layer, symmetryStartPoint, quad)
  if (state.frameId) {
    if (edit) edit.frameId = state.frameId
    syncAnimationLayerAtFrame(document, layer, state.frameId)
  }
  return edit
}
