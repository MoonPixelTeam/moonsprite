import type { AnimationTimeline } from '@shared/types-animation'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { animationCelKey, parseAnimationCelKey } from '@/core/animation'
import type { DocumentSession } from '@/store/workspace'
import type { AnimationPointerDrag } from './animation-gesture-types'

export type AnimationCelDropClampContext = {
  drag: Extract<AnimationPointerDrag, { kind: 'cel' | 'mask' }>
  ownerIds: string[]
  frameIds: string[]
  ownerIndex: Map<string, number>
  frameIndex: Map<string, number>
  sourcePositions: Array<{ row: number; column: number }>
  minRow: number
  maxRow: number
  minColumn: number
  maxColumn: number
}

export const createAnimationCelDropClampContext = (
  drag: Extract<AnimationPointerDrag, { kind: 'cel' | 'mask' }>,
  session: Readonly<DocumentSession>,
  timeline: AnimationTimeline
): AnimationCelDropClampContext => {
  const ownerIds = drag.kind === 'mask'
    ? buildLayerPanelTree({ layers: session.document.layers, groups: session.document.groups, collapsedGroupIds: [] }).map((node) => node.id)
    : session.document.layers.map((layer) => layer.id)
  const frameIds = timeline.frames.map((frame) => frame.id)
  const ownerIndex = new Map(ownerIds.map((id, index) => [id, index]))
  const frameIndex = new Map(frameIds.map((id, index) => [id, index]))
  const sourcePositions = drag.cellKeys.flatMap((key) => {
    const parsed = parseAnimationCelKey(key)
    if (!parsed) return []
    const row = ownerIndex.get(parsed.layerId)
    const column = frameIndex.get(parsed.frameId)
    return row === undefined || column === undefined ? [] : [{ row, column }]
  })
  return {
    drag,
    ownerIds,
    frameIds,
    ownerIndex,
    frameIndex,
    sourcePositions,
    minRow: sourcePositions.length > 0 ? Math.min(...sourcePositions.map((position) => position.row)) : 0,
    maxRow: sourcePositions.length > 0 ? Math.max(...sourcePositions.map((position) => position.row)) : 0,
    minColumn: sourcePositions.length > 0 ? Math.min(...sourcePositions.map((position) => position.column)) : 0,
    maxColumn: sourcePositions.length > 0 ? Math.max(...sourcePositions.map((position) => position.column)) : 0
  }
}

export const clampAnimationCelDropTarget = (context: AnimationCelDropClampContext, candidateKey: string): string | null => {
  const anchor = parseAnimationCelKey(context.drag.sourceAnchorKey)
  const candidate = parseAnimationCelKey(candidateKey)
  if (!anchor || !candidate) return null
  const anchorOwner = context.ownerIndex.get(anchor.layerId)
  const anchorFrame = context.frameIndex.get(anchor.frameId)
  const candidateOwner = context.ownerIndex.get(candidate.layerId)
  const candidateFrame = context.frameIndex.get(candidate.frameId)
  if (anchorOwner === undefined || anchorFrame === undefined || candidateOwner === undefined || candidateFrame === undefined) return null
  if (context.sourcePositions.length === 0) return candidateKey
  const rowDelta = Math.max(-context.minRow, Math.min(context.ownerIds.length - 1 - context.maxRow, candidateOwner - anchorOwner))
  const columnDelta = Math.max(-context.minColumn, Math.min(context.frameIds.length - 1 - context.maxColumn, candidateFrame - anchorFrame))
  const boundedOwnerId = context.ownerIds[anchorOwner + rowDelta]
  const boundedFrameId = context.frameIds[anchorFrame + columnDelta]
  return boundedOwnerId && boundedFrameId ? animationCelKey(boundedOwnerId, boundedFrameId) : null
}
