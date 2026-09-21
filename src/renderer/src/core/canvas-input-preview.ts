import type { ShapeRatio } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { pixelEditHasChanges, revertPixelEdit } from './history'
import {
  restoreSelectionTranslationPreview
} from './tools-selection-transform-translation'
import {
  type SelectionTransformSource
} from './tools-selection-transform-types'
import { transformedSelectionBounds, type SelectionShearTransform } from './selection'
import { type CanvasDragState, type CanvasPoint, type MarqueeModifierMode } from './canvas-input-contracts'
import { shapeBounds } from './canvas-input-resize'

export const layerMovePreviewActive = (
  drag: CanvasDragState | null | undefined
): drag is CanvasDragState & {
  kind: 'move-layer'
  moved: true
  layerContentBounds: NonNullable<CanvasDragState['layerContentBounds']>
  layerPreviewOffset: CanvasPoint
} => drag?.kind === 'move-layer' && drag.moved === true && Boolean(drag.layerContentBounds) && Boolean(drag.layerPreviewOffset)

export const sampledForegroundColorToAdd = (drag: Pick<CanvasDragState, 'kind' | 'sampleSecondary' | 'sampledColor'>, shortcutHeld: boolean): RgbaColor | null =>
  shortcutHeld && drag.kind === 'sample-color' && !drag.sampleSecondary && drag.sampledColor ? { ...drag.sampledColor } : null

export const paletteSamplingShortcutStartsPrimarySample = (shortcutHeld: boolean, button: number): boolean => shortcutHeld && button === 0

export interface CachedSelectionTransformSource {
  document: SpriteDocument
  contentRevision: number
  layerId: string
  selection: SelectionMask
  source: SelectionTransformSource
}

export const cachedSelectionTransformSource = (
  cached: CachedSelectionTransformSource | null | undefined,
  document: SpriteDocument,
  contentRevision: number,
  layerId: string,
  selection: SelectionMask | null | undefined
): SelectionTransformSource | null => (cached && cached.document === document && cached.contentRevision === contentRevision && cached.layerId === layerId && cached.selection === selection ? cached.source : null)

export const deferredSelectionCommitInvalidationRects = (drag: Pick<CanvasDragState, 'selectionSource' | 'selectionStart' | 'previewSelection'>): SelectionRect[] =>
  [drag.selectionSource?.selection, drag.selectionStart, drag.previewSelection].filter((selection): selection is SelectionRect => Boolean(selection))

export const selectionTransformGeometrySource = (drag: Pick<CanvasDragState, 'freeTileSelectionTransform' | 'freeTileSelectionSource' | 'selectionSource' | 'selectionStart'>): SelectionMask | null => {
  if (drag.freeTileSelectionTransform) return drag.freeTileSelectionSource ?? drag.selectionStart ?? null
  const source = drag.selectionSource?.selection
  if (!source) return drag.selectionStart ?? null
  return drag.selectionSource?.origin === 'clipboard' ? { x: source.x, y: source.y, width: source.width, height: source.height } : source
}

export const resolveMarqueeModifierMode = (modifiers: { fromCenter: boolean; rotate: boolean }, preferredMode?: MarqueeModifierMode): MarqueeModifierMode | null => {
  if (preferredMode === 'rotate' && modifiers.rotate) return 'rotate'
  if (preferredMode === 'resize' && modifiers.fromCenter) return 'resize'
  if (modifiers.rotate) return 'rotate'
  if (modifiers.fromCenter) return 'resize'
  return null
}

export const revertCancelledCanvasDragPixelChanges = (document: SpriteDocument, drag: CanvasDragState): boolean => {
  if (drag.floatingPaste) return false
  if (drag.translationPreview) {
    const changed = drag.translationPreview.count > 0
    restoreSelectionTranslationPreview(document, drag.translationPreview)
    return changed
  }
  const edit = drag.kind === 'draw' || drag.kind === 'fill' || drag.kind === 'airbrush' || drag.kind === 'liquify' || drag.kind === 'smooth' ? drag.edit : drag.previewEdit
  if (!edit) return false
  const changed = pixelEditHasChanges(edit)
  revertPixelEdit(document, edit)
  if (drag.kind === 'draw' && drag.perfectPixelCommittedEdit) {
    const committedChanged = pixelEditHasChanges(drag.perfectPixelCommittedEdit)
    revertPixelEdit(document, drag.perfectPixelCommittedEdit)
    return changed || committedChanged
  }
  return changed
}

export const shouldPreserveLineAnchorAfterNoopDrag = (drag: Pick<CanvasDragState, 'kind' | 'preserveLineAnchorOnNoop'>, committed: boolean): boolean => !committed && drag.kind === 'draw' && drag.preserveLineAnchorOnNoop === true

export const selectionGestureMoved = (start: CanvasPoint | undefined, end: CanvasPoint, threshold = 3): boolean => Boolean(start && (Math.abs(end.x - start.x) > threshold || Math.abs(end.y - start.y) > threshold))

const selectionCreationKinds = new Set<CanvasDragState['kind']>(['marquee', 'lasso', 'polygon-lasso'])

const selectionPreviewKinds = new Set<CanvasDragState['kind']>(['magic-preview', 'move-selection', 'move-content', 'transform-content', 'rotate-content', 'shear-content'])

const selectionContentTransformKinds = new Set<CanvasDragState['kind']>(['move-content', 'transform-content', 'rotate-content', 'shear-content'])

export type SelectionContentTransformKind = 'move-content' | 'transform-content' | 'rotate-content' | 'shear-content'

export const selectionTransformDeferredPreviewEnabled = (kind: SelectionContentTransformKind, supported: boolean, angle = 0, shear?: SelectionShearTransform): boolean =>
  supported && (kind !== 'transform-content' || (angle % 360 === 0 && !shear))

export const deferredSelectionPreviewMaterializationRequired = (simpleTranslation: boolean, floatingPaste: boolean, sourceOrigin?: SelectionTransformSource['origin']): boolean =>
  !simpleTranslation && !(floatingPaste && sourceOrigin === 'clipboard')

export const deferredSelectionPreviewOwner = (
  drag: Pick<CanvasDragState, 'kind' | 'selectionPreparationPending' | 'deferredSelectionPreview' | 'selectionSource' | 'previewTarget'> | null | undefined,
  pendingDeferred: boolean
): 'active' | 'pending' | null => {
  if (!drag || !selectionContentTransformKinds.has(drag.kind) || drag.selectionPreparationPending) return pendingDeferred ? 'pending' : null
  return drag.deferredSelectionPreview && drag.selectionSource && drag.previewTarget ? 'active' : null
}

export const canvasGestureForPreview = (drag: CanvasDragState | null | undefined): CanvasDragState | null => (drag?.kind === 'pan' && drag.resumeDrag?.kind === 'polygon-lasso' ? drag.resumeDrag : (drag ?? null))

export const brushPreviewAllowedDuringDrag = (drag: Pick<CanvasDragState, 'kind'> | null | undefined, drawingKind: 'draw' | 'airbrush', drawingBrushPreviewEnabled: boolean): boolean =>
  !drag || (drag.kind === drawingKind && drawingBrushPreviewEnabled)

export const marqueePreviewTargetForDrag = (drag: CanvasDragState | null | undefined): SelectionRect | null => {
  const previewDrag = canvasGestureForPreview(drag)
  return previewDrag?.kind === 'marquee' && (previewDrag.moved || previewDrag.quickSelectCell) ? (previewDrag.previewTarget ?? previewDrag.marqueeBounds ?? null) : null
}

/** Returns the current geometry used by the canvas size readout while a
 * rectangle/ellipse, line, or curve is being drawn. */
export const drawingSizePreviewTargetForDrag = (drag: CanvasDragState | null | undefined, shapeRatio: ShapeRatio | null = null): SelectionRect | null => {
  const previewDrag = canvasGestureForPreview(drag)
  if (!previewDrag) return null
  if (previewDrag.kind === 'marquee') return marqueePreviewTargetForDrag(previewDrag)
  if (previewDrag.kind === 'shape') {
    const hasMoved = previewDrag.start.x !== previewDrag.last.x || previewDrag.start.y !== previewDrag.last.y
    if (!previewDrag.previewTarget && !hasMoved) return null
    return previewDrag.previewTarget ?? shapeBounds(previewDrag.start, previewDrag.last, previewDrag.constrain, shapeRatio)
  }
  if (previewDrag.kind === 'line-shape') {
    if (previewDrag.start.x === previewDrag.last.x && previewDrag.start.y === previewDrag.last.y) return null
    return shapeBounds(previewDrag.start, previewDrag.last)
  }
  if (previewDrag.kind === 'curve-shape') {
    const end = previewDrag.curveEnd ?? previewDrag.last
    if (!previewDrag.curveEnd && previewDrag.start.x === end.x && previewDrag.start.y === end.y) return null
    return shapeBounds(previewDrag.start, end)
  }
  return null
}

export const selectionOverlayMaskForDrag = (currentSelection: SelectionMask | null, drag: CanvasDragState | null | undefined): SelectionMask | null => {
  const previewDrag = canvasGestureForPreview(drag)
  if (!previewDrag) return currentSelection
  if (previewDrag.kind === 'marquee' && previewDrag.quickSelectCell) return null
  if (selectionCreationKinds.has(previewDrag.kind)) return previewDrag.selectionStart ?? null
  if (selectionPreviewKinds.has(previewDrag.kind)) return previewDrag.previewSelection ?? currentSelection
  return currentSelection
}

export interface SelectionOverlayFrame {
  selection: SelectionMask | null
  target?: SelectionRect
  angle: number
  shear?: SelectionShearTransform
  quad?: SelectionQuad
  pivot?: CanvasPoint
}

/** Keeps Free Tile pixels and transform chrome on the same applied preview update. */
export const selectionOverlayFrameForDrag = (currentSelection: SelectionMask | null, drag: CanvasDragState | null | undefined): SelectionOverlayFrame => {
  const previewDrag = canvasGestureForPreview(drag)
  const transformed = previewDrag && selectionContentTransformKinds.has(previewDrag.kind) ? previewDrag : null
  const useAppliedFreeTileFrame = Boolean(transformed?.freeTileSelectionTransform && transformed.appliedPreviewTarget)
  return {
    selection: useAppliedFreeTileFrame ? (transformed?.appliedSelection === undefined ? currentSelection : transformed.appliedSelection) : selectionOverlayMaskForDrag(currentSelection, previewDrag),
    target: transformed ? (useAppliedFreeTileFrame ? transformed.appliedPreviewTarget : (transformed.previewTarget ?? transformed.transformStartTarget ?? transformed.selectionStart ?? undefined)) : undefined,
    angle: transformed ? (useAppliedFreeTileFrame ? (transformed.appliedPreviewAngle ?? transformed.previewAngle ?? transformed.startAngle ?? 0) : (transformed.previewAngle ?? transformed.startAngle ?? 0)) : 0,
    shear: transformed ? (useAppliedFreeTileFrame ? transformed.appliedPreviewShear : (transformed.previewShear ?? transformed.transformStartShear)) : undefined,
    quad: transformed ? (useAppliedFreeTileFrame ? transformed.appliedPreviewQuad : (transformed.previewQuad ?? transformed.transformStartQuad)) : undefined,
    pivot: previewDrag ? (useAppliedFreeTileFrame ? transformed?.appliedPreviewPivot : previewDrag.previewPivot) : undefined
  }
}

export const selectionTransformModifiers = (modifiers: {
  ctrlKey: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey: boolean
  proportionalLocked?: boolean
}): {
  proportional: boolean
  integerScale: boolean
  fromCenter: boolean
  copy: false
} => {
  return {
    proportional: modifiers.shiftKey || modifiers.proportionalLocked === true,
    integerScale: Boolean(modifiers.ctrlKey || modifiers.metaKey),
    fromCenter: Boolean(modifiers.altKey),
    copy: false
  }
}

export const constrainFreeTransformCornerToAspectRatio = (startQuad: SelectionQuad, handle: 'nw' | 'ne' | 'se' | 'sw', point: CanvasPoint, aspectRatio: number): CanvasPoint => {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return { x: Math.round(point.x), y: Math.round(point.y) }
  const oppositeHandle = ({ nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' } as const)[handle]
  const opposite = startQuad[oppositeHandle]
  const start = startQuad[handle]
  const rawX = point.x - opposite.x
  const rawY = point.y - opposite.y
  const signX = rawX === 0 ? Math.sign(start.x - opposite.x) || 1 : Math.sign(rawX)
  const signY = rawY === 0 ? Math.sign(start.y - opposite.y) || 1 : Math.sign(rawY)
  const absoluteX = Math.abs(rawX)
  const absoluteY = Math.abs(rawY)
  const widthDriven = absoluteX / aspectRatio >= absoluteY
  const width = Math.max(1, Math.round(widthDriven ? absoluteX : absoluteY * aspectRatio))
  const height = Math.max(1, Math.round(widthDriven ? absoluteX / aspectRatio : absoluteY))
  return { x: opposite.x + signX * width, y: opposite.y + signY * height }
}

export const selectionTransformPreviewChanged = (drag: CanvasDragState): boolean => {
  const start = drag.transformStartTarget ?? drag.selectionStart
  const target = drag.previewTarget
  if (!start || !target) return false
  if (
    start.x !== target.x ||
    start.y !== target.y ||
    start.width !== target.width ||
    start.height !== target.height ||
    start.flipHorizontal !== target.flipHorizontal ||
    start.flipVertical !== target.flipVertical ||
    start.flipOriginX !== target.flipOriginX ||
    start.flipOriginY !== target.flipOriginY
  )
    return true
  const startQuad = drag.transformStartQuad
  const previewQuad = drag.previewQuad
  if (startQuad || previewQuad) {
    if (!startQuad || !previewQuad) return true
    for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
      if (startQuad[corner].x !== previewQuad[corner].x || startQuad[corner].y !== previewQuad[corner].y) return true
    }
  }
  const normalizeAngle = (value: number): number => ((value % 360) + 360) % 360
  if (normalizeAngle(drag.startAngle ?? 0) !== normalizeAngle(drag.previewAngle ?? drag.startAngle ?? 0)) return true
  const startShear = drag.transformStartShear?.amount === 0 ? undefined : drag.transformStartShear
  const previewShear = drag.previewShear?.amount === 0 ? undefined : drag.previewShear
  return startShear?.axis !== previewShear?.axis || startShear?.edge !== previewShear?.edge || startShear?.amount !== previewShear?.amount
}

export const translatedSelectionRect = (rect: SelectionRect, offset: CanvasPoint): SelectionRect => ({
  ...rect,
  x: rect.x + offset.x,
  y: rect.y + offset.y,
  ...(Number.isFinite(rect.flipOriginX) ? { flipOriginX: rect.flipOriginX! + offset.x } : {}),
  ...(Number.isFinite(rect.flipOriginY) ? { flipOriginY: rect.flipOriginY! + offset.y } : {})
})

const selectionShearsEqual = (left: SelectionShearTransform | undefined, right: SelectionShearTransform | undefined): boolean =>
  left === right || Boolean(left && right && left.axis === right.axis && left.edge === right.edge && left.amount === right.amount)

/** Reuses an already transformed mask when a drag only changes its integer position. */
export const translatedSelectionTransformPreviewMask = (
  drag: Pick<CanvasDragState, 'kind' | 'selectionStart' | 'transformStartTarget' | 'startAngle' | 'transformStartShear'>,
  target: SelectionRect,
  angle: number,
  shear: SelectionShearTransform | undefined,
  canvasWidth: number,
  canvasHeight: number
): SelectionMask | undefined => {
  const selection = drag.selectionStart
  const startTarget = drag.transformStartTarget
  const startAngle = drag.startAngle ?? 0
  if (drag.kind !== 'move-content' || !selection || !startTarget || angle !== startAngle || !selectionShearsEqual(shear, drag.transformStartShear)) return undefined

  const delta = { x: target.x - startTarget.x, y: target.y - startTarget.y }
  if (!Number.isInteger(delta.x) || !Number.isInteger(delta.y)) return undefined
  const translatedTarget = translatedSelectionRect(startTarget, delta)
  if (
    target.width !== translatedTarget.width ||
    target.height !== translatedTarget.height ||
    Boolean(target.flipHorizontal) !== Boolean(translatedTarget.flipHorizontal) ||
    Boolean(target.flipVertical) !== Boolean(translatedTarget.flipVertical) ||
    (target.flipHorizontal && target.flipOriginX !== translatedTarget.flipOriginX) ||
    (target.flipVertical && target.flipOriginY !== translatedTarget.flipOriginY)
  )
    return undefined

  const startBounds = transformedSelectionBounds(startTarget, startAngle, drag.transformStartShear)
  const targetBounds = transformedSelectionBounds(target, angle, shear)
  const withinCanvas = (bounds: SelectionRect): boolean => bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= canvasWidth && bounds.y + bounds.height <= canvasHeight
  if (!withinCanvas(startBounds) || !withinCanvas(targetBounds)) return undefined

  return {
    ...selection,
    x: selection.x + delta.x,
    y: selection.y + delta.y
  }
}
