import type { LayerMoveState } from './layer-move-state'
import type { GradientStop, LiquifyMode, MoveKind, ShapeRatio, ToolId } from '@shared/types-brush'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionMode, SelectionQuad, SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import type { TilemapCell } from '@shared/types-tiles'
import { pixelEditHasChanges, revertPixelEdit, type PixelEdit } from './history'
import {
  restoreSelectionTranslationPreview
} from './tools-selection-transform-translation'
import {
  type SelectionTransformLayerState,
  type SelectionTransformSource,
  type SelectionTranslationPreview
} from './tools-selection-transform-types'
import { type BrushGradientSample } from './tools-pixel-edit'
import {
  combineSelection,
  inverseSelectionQuadPoint,
  inverseTransformedSelectionPoint,
  rasterLinePoints,
  rectSelection,
  remapTransformedSelectionPoint,
  selectionBoundarySegments,
  selectionContains,
  transformedSelectionBounds,
  transformedSelectionControlPoints,
  transformedSelectionPivotPreset,
  type SelectionShearTransform
} from './selection'
import { balancedStairLinePoints } from './pixel-line'
import { modifierShortcutHeld } from './shortcuts'
import type { TilemapEdit, TilemapSelectionMoveSource } from './tilemap'
import type { FreeTilePlacementEdit, FreeTileSourceEditSnapshot } from './free-tile-document'
import type { FreeTileInstanceTransform } from './free-tile'
import type { AlignmentGuide } from './alignment'
import type { IsoLineDirection } from './isometric'
import { hasReliableBrushPressure, isPressurePointerType } from './pressure'
import type { LiquifyPushStroke } from './liquify'
export type SelectionHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'
export type SelectionRotationHandle = 'rotate-ne' | 'rotate-se' | 'rotate-sw' | 'rotate-nw'
export type SelectionShearHandle = 'shear-n' | 'shear-e' | 'shear-s' | 'shear-w'
export type SelectionHit = 'inside' | 'edge' | 'outside' | SelectionRotationHandle | SelectionShearHandle | SelectionHandle

const selectionHitBoundaryCache = new WeakMap<SelectionMask, Int32Array>()

export const temporaryMoveToolAllowed = (tool: ToolId, moveKind: MoveKind = 'move', selectionKind?: import('@shared/types-selection').SelectionKind): boolean =>
  (tool !== 'selection' || selectionKind === 'magic') && tool !== 'shape' && (tool !== 'move' || moveKind !== 'move')

export const shouldUseTemporaryMoveTool = (tool: ToolId, event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, shortcut: string, moveKind: MoveKind = 'move'): boolean =>
  temporaryMoveToolAllowed(tool, moveKind) && modifierShortcutHeld(event, shortcut)

export const brushLineConnectionOverridesTemporaryMove = (tool: ToolId, event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, shortcut: string, hasAnchor: boolean): boolean =>
  hasAnchor && (tool === 'pencil' || tool === 'eraser') && modifierShortcutHeld(event, shortcut)

export const selectionInteractionOverridesTemporaryMove = (tool: ToolId, hit: SelectionHit, addingToSelection = false): boolean => tool === 'selection' && (hit !== 'outside' || addingToSelection)

export const temporaryMoveForCanvasInteractionAllowed = (tool: ToolId, moveKind: MoveKind, hit: SelectionHit, addingToSelection = false, selectionKind?: import('@shared/types-selection').SelectionKind): boolean =>
  temporaryMoveToolAllowed(tool, moveKind, selectionKind) &&
  (selectionKind === 'magic' || !selectionInteractionOverridesTemporaryMove(tool, hit, addingToSelection))

export const shouldUseTemporaryMoveForCanvasInteraction = (
  tool: ToolId,
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  shortcut: string,
  moveKind: MoveKind,
  hit: SelectionHit,
  addingToSelection = false
): boolean => modifierShortcutHeld(event, shortcut) && temporaryMoveForCanvasInteractionAllowed(tool, moveKind, hit, addingToSelection)

export const temporaryMoveSuppressesToolPreview = (temporaryMoveActive: boolean, brushSizeAdjustmentPreviewActive = false): boolean => temporaryMoveActive && !brushSizeAdjustmentPreviewActive

export const cachedSelectionBoundarySegments = (selection: SelectionMask): Int32Array => {
  const cached = selectionHitBoundaryCache.get(selection)
  if (cached) return cached
  const segments = selectionBoundarySegments(selection)
  selectionHitBoundaryCache.set(selection, segments)
  return segments
}
