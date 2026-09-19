import { drawingAnchorActive, drawingAnchorPoint } from '@/core/canvas-centered-drawing'
import { useEffect, useRef } from 'react'
import type { FreeTileInstance } from '@shared/types-tiles'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionQuad, SelectionRect } from '@shared/types-selection'
import { revertPixelEdit } from '@/core/history'
import {
  applySelectionTransform,
  applySelectionTranslationPreview,
  captureSelectionTransform,
  restoreSelectionTranslationPreview,
  type SelectionTransformLayerState,
  type SelectionTransformSource
} from '@/core/tools-selection-transform'
import {
  applySelectionTransformLayerState,
  captureAnimationFrameSelectionTransformStates,
  selectionTransformLayerForState
} from '@/core/selection-transform-targets'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activeLayerMask, activePaintLayer, selectedTransformLayersAreEditable, selectedTransformLayersForSession } from '@/store/workspace-session'
import {
  cloneSelection,
  selectionQuadBounds,
  selectionQuadFromRect,
  selectionQuadTransform,
  transformedSelectionBounds,
  transformedSelectionPivotPreset,
  transformSelectionMask,
  transformSelectionMaskQuad
} from '@/core/selection'
import {
  CanvasInputState,
  constrainFreeTransformCornerToAspectRatio,
  resizeTransformedSelectionBounds,
  selectionPivotAfterResize,
  selectionPivotHit,
  selectionTransformGeometrySource,
  translatedSelectionTransformPreviewMask,
  type CanvasDragState as DragState,
  type CanvasPoint as Point
} from '@/core/canvas-input'
import { hasSymmetry, transformSymmetrySelection } from '@/core/symmetry'
import {
  beginAdjustmentPreviewEdit,
  endAdjustmentPreviewEdit,
  hasAdjustmentPreviewController,
  prepareAdjustmentPreviewEdit,
  renderAdjustmentPreviewEdit
} from '@/core/adjustment-preview-lifecycle'
import { preserveCanvasSelection } from '@/components/layer-panel-reveal'
import {
  createFreeTileSourceEditRaster,
  freeTileSelectionForInstanceEdit,
  freeTileSelectionToEditRaster,
  freeTileSourceSnapshotFromEditRaster,
  freeTileTransformTargetToEditRaster
} from '@/core/free-tile-edit'
interface Ports {
  readonly session: DocumentSession
  readonly draw: () => void
  readonly symmetryCenter: import('@/core/symmetry').SymmetryCenter
  readonly compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  readonly invalidateCompositeRect: (selection: SelectionRect | null | undefined, layerIds?: readonly string[]) => void
  readonly invalidateOnionSkinDragFrames: (drag: DragState) => void
  readonly tilemapEditClipForCell: (cellIndex: number | undefined, current?: DocumentSession) => SelectionRect | undefined
  readonly drawSelectionOverlay: () => void
  readonly inputRef: import('react').RefObject<CanvasInputState>
  readonly selectionTransformModifierState: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
    proportional: boolean
    integerScale: boolean
    fromCenter: boolean
    copy: false
  }
  readonly multipleAnimationSelection: boolean
  readonly selectionLayersEditable: boolean
  readonly selectedTransformLayers: RasterLayer[]
  readonly selectedFreeTileSelectionTarget: (current?: DocumentSession) => {
    target: import('@/core/free-tile-document').FreeTileCelTarget
    instance: FreeTileInstance
    source: import('@/core/free-tile').FreeTileSourceRef
    bounds: SelectionRect
  } | null
  readonly displayedSelectionPoint: (point: Point) => Point
  readonly stagePoint: (clientX: number, clientY: number) => Point
}

export function useCanvasSelectionTransform(ports: Ports) {
  const selectionPreviewFrameRef = useRef<number | null>(null)

  const adjustmentPreviewEditRef = useRef(false)

  const cloneSelectionLayerStates = (layers: readonly SelectionTransformLayerState[] | undefined): SelectionTransformLayerState[] | undefined =>
    layers?.map((layer) => ({ ...layer }))

  const syncPrimarySelectionLayerState = (drag: DragState): void => {
    const primary = drag.selectionLayers?.[0]
    if (!primary) return
    drag.selectionSource = primary.source
    drag.previewEdit = primary.previewEdit
    drag.translationPreview = primary.translationPreview
  }

  const restoreSelectionLayerPreviews = (layers: readonly SelectionTransformLayerState[]): void => {
    for (const layer of layers) {
      if (layer.translationPreview) restoreSelectionTranslationPreview(ports.session.document, layer.translationPreview)
      else if (layer.previewEdit) revertPixelEdit(ports.session.document, layer.previewEdit)
    }
  }

  const symmetryStartPointForDrag = (drag: DragState): Point | undefined => {
    if (!hasSymmetry(ports.session.symmetryAxes)) return undefined
    const source = drag.selectionSource?.selection
    const target = drag.transformStartTarget
    if (!source || !target) return drag.start
    const angle = (((drag.startAngle ?? 0) % 360) + 360) % 360
    if (angle !== 0 || drag.transformStartShear || target.flipHorizontal || target.flipVertical) return drag.start
    return {
      x: drag.start.x - (target.x - source.x),
      y: drag.start.y - (target.y - source.y)
    }
  }

  const flushSelectionPreview = (drag: DragState, render = false): void => {
    if (!drag.previewPending || !drag.selectionStart || !drag.previewTarget) return
    if (drag.tilemapSelectionMoveSource) {
      drag.previewPending = false
      if (render) ports.draw()
      return
    }
    if (adjustmentPreviewEditRef.current) prepareAdjustmentPreviewEdit(ports.session.document.id)
    drag.previewPending = false
    const target = { ...drag.previewTarget }
    const angle = drag.previewAngle ?? 0
    const shear = drag.previewShear ? { ...drag.previewShear } : undefined
    const quad = drag.freeTransform ? (drag.previewQuad ?? drag.transformStartQuad) : undefined
    const symmetryStartPoint = symmetryStartPointForDrag(drag)
    const rawTarget = drag.kind === 'move-selection' ? { ...drag.selectionStart, x: target.x, y: target.y } : target
    const transformSourceSelection = selectionTransformGeometrySource(drag) ?? drag.selectionStart
    const translatedPreviewSelection =
      drag.freeTransform || drag.freeTileSelectionTransform || hasSymmetry(ports.session.symmetryAxes)
        ? undefined
        : translatedSelectionTransformPreviewMask(drag, target, angle, shear, ports.session.document.width, ports.session.document.height)
    const previewSelection =
      translatedPreviewSelection ??
      (drag.freeTransform && quad
        ? transformSelectionMaskQuad(
            transformSourceSelection,
            quad,
            ports.session.document.width,
            ports.session.document.height,
            false,
            selectionSourceQuadForCanvas(drag)
          )
        : drag.freeTileSelectionTransform
          ? drag.kind === 'move-selection'
            ? rawTarget
            : transformSelectionMask(transformSourceSelection, target, ports.session.document.width, ports.session.document.height, angle, shear, false)
          : hasSymmetry(ports.session.symmetryAxes)
            ? transformSymmetrySelection(
                transformSourceSelection,
                rawTarget,
                ports.session.document.width,
                ports.session.document.height,
                angle,
                shear,
                ports.session.symmetryAxes,
                ports.symmetryCenter,
                false,
                symmetryStartPoint
              )
            : drag.kind === 'move-selection'
              ? rawTarget
              : transformSelectionMask(transformSourceSelection, target, ports.session.document.width, ports.session.document.height, angle, shear, false))
    drag.previewSelection = previewSelection

    if (drag.kind !== 'move-selection' && drag.selectionSource) {
      if (drag.freeTileSelectionTransform) {
        const sourceEdit =
          drag.freeTileEditDocument && drag.freeTileEditLayer && drag.freeTileSourceBefore && drag.freeTileEditOrigin && drag.freeTileEditSourceOffset
            ? {
                document: drag.freeTileEditDocument,
                layer: drag.freeTileEditLayer,
                before: drag.freeTileSourceBefore,
                origin: drag.freeTileEditOrigin,
                sourceOffset: drag.freeTileEditSourceOffset,
                instanceTransform: drag.freeTileEditInstanceTransform ?? {},
                transformedSourceBounds: drag.freeTileEditTransformedSourceBounds ?? {
                  x: drag.freeTileSourceBefore.offsetX,
                  y: drag.freeTileSourceBefore.offsetY,
                  width: drag.freeTileSourceBefore.width,
                  height: drag.freeTileSourceBefore.height
                }
              }
            : null
        if (sourceEdit && drag.freeTileSourceId) {
          const localTarget = freeTileTransformTargetToEditRaster(sourceEdit, target)
          const localQuad = quad
            ? {
                nw: { x: quad.nw.x - sourceEdit.origin.x, y: quad.nw.y - sourceEdit.origin.y },
                ne: { x: quad.ne.x - sourceEdit.origin.x, y: quad.ne.y - sourceEdit.origin.y },
                se: { x: quad.se.x - sourceEdit.origin.x, y: quad.se.y - sourceEdit.origin.y },
                sw: { x: quad.sw.x - sourceEdit.origin.x, y: quad.sw.y - sourceEdit.origin.y }
              }
            : undefined
          if (drag.translationPreview) {
            restoreSelectionTranslationPreview(sourceEdit.document, drag.translationPreview)
            drag.translationPreview = null
          }
          if (drag.previewEdit) revertPixelEdit(sourceEdit.document, drag.previewEdit)
          drag.previewEdit = applySelectionTransform(
            sourceEdit.document,
            drag.selectionSource,
            localTarget,
            angle,
            Boolean(drag.copy),
            shear,
            undefined,
            undefined,
            sourceEdit.layer,
            symmetryStartPoint,
            localQuad,
            false,
            ports.session.selectionRotationAlgorithm === 'rotsprite'
          )
          const cropped = freeTileSourceSnapshotFromEditRaster(sourceEdit)
          drag.appliedSelection = previewSelection
          drag.appliedPreviewTarget = { ...target }
          drag.appliedPreviewAngle = angle
          drag.appliedPreviewShear = shear ? { ...shear } : undefined
          drag.appliedPreviewQuad = cloneSelectionQuad(quad) ?? undefined
          drag.appliedPreviewPivot = drag.previewPivot ? { ...drag.previewPivot } : undefined
          useWorkspace.getState().previewFreeTileSource(drag.freeTileSourceId, cropped.width, cropped.height, cropped.pixels, cropped.offsetX, cropped.offsetY)
          ports.compositeCacheRef.current.invalidateAll()
        }
      } else if (drag.deferredSelectionPreview) {
        drag.appliedSelection = drag.previewSelection
      } else {
        const previewLayerIds = drag.selectionLayers?.map((layer) => layer.layerId)
        ports.invalidateCompositeRect(drag.selectionStart, previewLayerIds)
        ports.invalidateCompositeRect(drag.appliedSelection, previewLayerIds)
        ports.invalidateCompositeRect(drag.previewSelection, previewLayerIds)
        const translation =
          !drag.freeTransform &&
          drag.kind === 'move-content' &&
          !hasSymmetry(ports.session.symmetryAxes) &&
          angle % 360 === 0 &&
          !drag.previewShear &&
          !target.flipHorizontal &&
          !target.flipVertical &&
          target.width === drag.selectionSource.selection.width &&
          target.height === drag.selectionSource.selection.height
        if (drag.selectionLayers?.length) {
          for (const layerState of drag.selectionLayers) {
            if (translation && !layerState.frameId) {
              const layer = selectionTransformLayerForState(ports.session.document, layerState)
              if (!layer || layer.kind) continue
              if (layerState.translationPreview) layerState.previewEdit = null
              else if (layerState.previewEdit) {
                revertPixelEdit(ports.session.document, layerState.previewEdit)
                layerState.previewEdit = null
              }
              layerState.translationPreview = applySelectionTranslationPreview(
                ports.session.document,
                layerState.source,
                target,
                drag.copy,
                layerState.translationPreview,
                layer,
                undefined,
                ports.session.view.tileRepeatMode
              )
            } else {
              if (layerState.translationPreview) {
                restoreSelectionTranslationPreview(ports.session.document, layerState.translationPreview)
                layerState.translationPreview = null
              }
              if (layerState.previewEdit) revertPixelEdit(ports.session.document, layerState.previewEdit)
              layerState.previewEdit = applySelectionTransformLayerState(
                ports.session.document,
                layerState,
                target,
                angle,
                drag.copy,
                drag.previewShear,
                ports.session.symmetryAxes,
                ports.symmetryCenter,
                symmetryStartPoint,
                quad,
                ports.session.selectionRotationAlgorithm === 'rotsprite'
              )
            }
          }
          syncPrimarySelectionLayerState(drag)
          ports.invalidateOnionSkinDragFrames(drag)
        } else if (translation) {
          if (drag.translationPreview) drag.previewEdit = null
          else if (drag.previewEdit) {
            revertPixelEdit(ports.session.document, drag.previewEdit)
            drag.previewEdit = null
          }
          drag.translationPreview = applySelectionTranslationPreview(
            ports.session.document,
            drag.selectionSource,
            target,
            drag.copy,
            drag.translationPreview,
            activePaintLayer(ports.session),
            ports.tilemapEditClipForCell(drag.tilemapEditCellIndex),
            ports.session.view.tileRepeatMode
          )
        } else {
          if (drag.translationPreview) {
            restoreSelectionTranslationPreview(ports.session.document, drag.translationPreview)
            drag.translationPreview = null
          }
          if (drag.previewEdit) revertPixelEdit(ports.session.document, drag.previewEdit)
          drag.previewEdit = applySelectionTransform(
            ports.session.document,
            drag.selectionSource,
            target,
            angle,
            drag.copy,
            drag.previewShear,
            ports.session.symmetryAxes,
            ports.symmetryCenter,
            activePaintLayer(ports.session),
            symmetryStartPoint,
            quad,
            false,
            ports.session.selectionRotationAlgorithm === 'rotsprite'
          )
        }
        drag.appliedSelection = drag.previewSelection
        drag.appliedPreviewQuad = cloneSelectionQuad(quad) ?? undefined
      }
    }
    if (render) {
      if (adjustmentPreviewEditRef.current) renderAdjustmentPreviewEdit(ports.session.document.id, drag.previewSelection ?? null)
      if (drag.kind === 'move-selection') ports.drawSelectionOverlay()
      else ports.draw()
    }
  }

  const scheduleSelectionPreview = (drag: DragState, immediate = false): void => {
    drag.previewPending = true
    if (immediate || drag.freeTileSelectionTransform === true) {
      if (selectionPreviewFrameRef.current !== null) window.cancelAnimationFrame(selectionPreviewFrameRef.current)
      selectionPreviewFrameRef.current = null
      flushSelectionPreview(drag, true)
      return
    }
    if (selectionPreviewFrameRef.current !== null) return
    selectionPreviewFrameRef.current = window.requestAnimationFrame(() => {
      selectionPreviewFrameRef.current = null
      if (ports.inputRef.current.drag === drag) flushSelectionPreview(drag, true)
    })
  }

  const canUseDeferredSelectionPreview = (layer: RasterLayer): boolean =>
    !activeLayerMask(ports.session) &&
    !ports.session.view.relativeLuminance &&
    !hasSymmetry(ports.session.symmetryAxes) &&
    !(layer.kind === 'tilemap' && ports.session.tilemapMode === 'edit') &&
    !hasAdjustmentPreviewController(ports.session.document.id) &&
    ports.compositeCacheRef.current.supportsSelectionPreview(ports.session.document, ports.session.contentRevision, layer.id)

  const prepareDeferredFloatingSelectionPreview = (drag: DragState): void => {
    if (!drag.floatingPaste || !drag.deferredSelectionPreview || !drag.selectionSource || !drag.transformStartTarget) return
    drag.deferredSelectionRestoreTarget = { ...drag.transformStartTarget }
    drag.deferredSelectionRestoreAngle = drag.startAngle ?? 0
    drag.deferredSelectionRestoreShear = drag.transformStartShear ? { ...drag.transformStartShear } : undefined
    drag.deferredSelectionWasMaterialized = Boolean(drag.translationPreview || drag.previewEdit)
    if (drag.translationPreview) restoreSelectionTranslationPreview(ports.session.document, drag.translationPreview)
    else if (drag.previewEdit) revertPixelEdit(ports.session.document, drag.previewEdit)
    if (drag.deferredSelectionWasMaterialized && drag.selectionSource.origin === 'clipboard') {
      // A floating clipboard paste can switch from a materialized preview to
      // the lossless overlay path after its first transform. Rebuild the base
      // composite so a later view zoom cannot reuse pixels from the reverted
      // materialized preview as either a ghost or a missing overlay backdrop.
      ports.compositeCacheRef.current.invalidateAll()
    } else {
      ports.invalidateCompositeRect(drag.selectionSource.selection)
      ports.invalidateCompositeRect(transformedSelectionBounds(drag.transformStartTarget, drag.startAngle ?? 0, drag.transformStartShear))
    }
    drag.previewEdit = null
    drag.translationPreview = null
  }

  const restoreDeferredFloatingSelectionPreview = (drag: DragState): void => {
    if (
      !drag.floatingPaste ||
      !drag.deferredSelectionPreview ||
      !drag.deferredSelectionWasMaterialized ||
      !drag.selectionSource ||
      !drag.deferredSelectionRestoreTarget
    )
      return
    applySelectionTransform(
      ports.session.document,
      drag.selectionSource,
      drag.deferredSelectionRestoreTarget,
      drag.deferredSelectionRestoreAngle ?? 0,
      Boolean(drag.copy),
      drag.deferredSelectionRestoreShear,
      ports.session.symmetryAxes,
      ports.symmetryCenter,
      activePaintLayer(ports.session),
      symmetryStartPointForDrag(drag),
      undefined,
      false,
      ports.session.selectionRotationAlgorithm === 'rotsprite'
    )
    ports.invalidateCompositeRect(drag.selectionSource.selection)
    ports.invalidateCompositeRect(drag.selectionStart)
  }

  const updateSelectionTransformPreview = (drag: DragState, point: Point, modifiers: ReturnType<typeof ports.selectionTransformModifierState>): void => {
    if (drag.kind !== 'transform-content' || !drag.selectionStart || !drag.handle) return
    const transformStart = drag.transformStartTarget ?? drag.selectionStart
    const target = resizeTransformedSelectionBounds(
      transformStart,
      { x: point.x - drag.start.x, y: point.y - drag.start.y },
      drag.startAngle ?? 0,
      drag.handle,
      modifiers.proportional,
      modifiers.integerScale,
      modifiers.fromCenter,
      modifiers.fromCenter ? drag.selectionPivotStart : undefined
    )
    if (
      drag.previewTarget?.x === target.x &&
      drag.previewTarget.y === target.y &&
      drag.previewTarget.width === target.width &&
      drag.previewTarget.height === target.height &&
      drag.previewTarget.flipHorizontal === target.flipHorizontal &&
      drag.previewTarget.flipVertical === target.flipVertical &&
      drag.previewTarget.flipOriginX === target.flipOriginX &&
      drag.previewTarget.flipOriginY === target.flipOriginY
    )
      return
    if (!prepareSelectionTransformDrag(drag)) return
    drag.previewTarget = target
    drag.previewAngle = drag.startAngle ?? 0
    drag.previewShear = drag.transformStartShear ? { ...drag.transformStartShear } : undefined
    if (drag.selectionPivotStart) {
      drag.previewPivot = selectionPivotAfterResize(transformStart, target, drag.selectionPivotStart, {
        angle: drag.startAngle,
        shear: drag.transformStartShear,
        fromCenter: modifiers.fromCenter,
        custom: drag.selectionPivotCustom
      })
    }
    scheduleSelectionPreview(drag)
  }

  const updateFreeTransformPreview = (drag: DragState, point: Point): void => {
    if (!drag.freeTransform || !drag.selectionStart || !drag.handle) return
    if (drag.handle !== 'nw' && drag.handle !== 'ne' && drag.handle !== 'se' && drag.handle !== 'sw') return
    const startQuad =
      drag.transformStartQuad ?? selectionQuadFromRect(drag.transformStartTarget ?? drag.selectionStart, drag.startAngle ?? 0, drag.transformStartShear)
    const nextQuad: SelectionQuad = {
      nw: { ...startQuad.nw },
      ne: { ...startQuad.ne },
      se: { ...startQuad.se },
      sw: { ...startQuad.sw }
    }
    // Keep the frame pixel-aligned while allowing the selected corner to move
    // independently. A linked aspect ratio constrains that corner against its
    // opposite corner; the other three corners are still copied verbatim.
    nextQuad[drag.handle] =
      ports.session.selectionAspectRatio == null
        ? { x: Math.round(point.x), y: Math.round(point.y) }
        : constrainFreeTransformCornerToAspectRatio(startQuad, drag.handle, point, ports.session.selectionAspectRatio)
    if (!selectionQuadTransform(nextQuad)) return
    const target = selectionQuadBounds(nextQuad)
    const previousQuad = drag.previewQuad ?? startQuad
    if (
      previousQuad.nw.x === nextQuad.nw.x &&
      previousQuad.nw.y === nextQuad.nw.y &&
      previousQuad.ne.x === nextQuad.ne.x &&
      previousQuad.ne.y === nextQuad.ne.y &&
      previousQuad.se.x === nextQuad.se.x &&
      previousQuad.se.y === nextQuad.se.y &&
      previousQuad.sw.x === nextQuad.sw.x &&
      previousQuad.sw.y === nextQuad.sw.y
    )
      return
    if (!prepareSelectionTransformDrag(drag)) return
    drag.last = point
    drag.previewQuad = nextQuad
    drag.previewTarget = target
    drag.previewAngle = 0
    drag.previewShear = undefined
    drag.previewPivot = undefined
    // Free transforms are materialized during the drag so zooming or panning
    // cannot fall back to the rectangular deferred preview.
    scheduleSelectionPreview(drag, true)
  }

  const beginSelectionAdjustmentEdit = (): void => {
    if (adjustmentPreviewEditRef.current) return
    adjustmentPreviewEditRef.current = true
    beginAdjustmentPreviewEdit(ports.session.document.id)
  }

  const endSelectionAdjustmentEdit = (): void => {
    if (!adjustmentPreviewEditRef.current) return
    adjustmentPreviewEditRef.current = false
    endAdjustmentPreviewEdit(ports.session.document.id)
  }

  const prepareSelectionTransformDrag = (drag: DragState): boolean => {
    if (!drag.selectionPreparationPending) return Boolean(drag.selectionSource)
    drag.selectionPreparationPending = false
    preserveCanvasSelection(ports.session.document.id)
    beginSelectionAdjustmentEdit()
    const sourceQuadForOrigin = (origin?: Point): SelectionQuad | undefined => {
      if (!drag.freeTransform || !drag.transformStartQuad) return undefined
      const offsetX = origin?.x ?? 0
      const offsetY = origin?.y ?? 0
      return {
        nw: { x: drag.transformStartQuad.nw.x - offsetX, y: drag.transformStartQuad.nw.y - offsetY },
        ne: { x: drag.transformStartQuad.ne.x - offsetX, y: drag.transformStartQuad.ne.y - offsetY },
        se: { x: drag.transformStartQuad.se.x - offsetX, y: drag.transformStartQuad.se.y - offsetY },
        sw: { x: drag.transformStartQuad.sw.x - offsetX, y: drag.transformStartQuad.sw.y - offsetY }
      }
    }
    const ensureSourceQuad = (source: SelectionTransformSource, origin?: Point): void => {
      // A floating source can be transformed repeatedly before confirmation.
      // Its original frame must remain stable, so only initialize this once.
      if (source.sourceQuad) return
      const sourceQuad = sourceQuadForOrigin(origin)
      if (sourceQuad) source.sourceQuad = sourceQuad
    }
    if (drag.selectionSource) ensureSourceQuad(drag.selectionSource)
    if (!drag.selectionSource && drag.selectionStart) {
      const layer = activePaintLayer(ports.session)
      if (ports.multipleAnimationSelection) {
        if (!ports.selectionLayersEditable) {
          endSelectionAdjustmentEdit()
          return false
        }
        drag.deferredSelectionPreview = false
        drag.selectionLayers = captureAnimationFrameSelectionTransformStates(
          ports.session.document,
          ports.session.selectedAnimationFrameIds,
          ports.selectedTransformLayers.map((candidate) => candidate.id),
          drag.selectionStart,
          ports.session.selectedAnimationCellKeys
        )
        if (drag.selectionLayers.length === 0) {
          endSelectionAdjustmentEdit()
          return false
        }
        for (const layerState of drag.selectionLayers) ensureSourceQuad(layerState.source)
        syncPrimarySelectionLayerState(drag)
      } else if (layer.kind === 'free-tile') {
        const selectedTarget = ports.selectedFreeTileSelectionTarget()
        const scopedSelection = freeTileSelectionForInstanceEdit(drag.selectionStart, selectedTarget?.bounds)
        if (!selectedTarget || !scopedSelection) {
          endSelectionAdjustmentEdit()
          return false
        }
        const sourceEdit = createFreeTileSourceEditRaster(
          ports.session.document,
          selectedTarget.source,
          selectedTarget.bounds,
          undefined,
          selectedTarget.instance
        )
        const localSelection = sourceEdit ? freeTileSelectionToEditRaster(sourceEdit, scopedSelection) : null
        const source = sourceEdit && localSelection ? captureSelectionTransform(sourceEdit.document, localSelection, sourceEdit.layer) : null
        if (!sourceEdit || !localSelection || !source) {
          endSelectionAdjustmentEdit()
          return false
        }
        drag.selectionStart = scopedSelection
        drag.selectionSource = source
        ensureSourceQuad(source, sourceEdit.origin)
        drag.deferredSelectionPreview = false
        drag.freeTileSelectionTransform = true
        drag.freeTileSelectionSource = cloneSelection(scopedSelection) ?? undefined
        drag.appliedSelection = cloneSelection(scopedSelection)
        drag.appliedPreviewTarget = { ...(drag.previewTarget ?? drag.transformStartTarget ?? scopedSelection) }
        drag.appliedPreviewAngle = drag.previewAngle ?? drag.startAngle ?? 0
        drag.appliedPreviewShear = drag.previewShear ? { ...drag.previewShear } : drag.transformStartShear ? { ...drag.transformStartShear } : undefined
        drag.appliedPreviewPivot = drag.previewPivot ? { ...drag.previewPivot } : undefined
        drag.freeTileSelectionPivotBefore = ports.session.selectionPivot ? { ...ports.session.selectionPivot } : null
        drag.freeTileSourceId = selectedTarget.source.id
        drag.freeTileInstanceId = selectedTarget.instance.id
        drag.freeTileEditDocument = sourceEdit.document
        drag.freeTileEditLayer = sourceEdit.layer
        drag.freeTileSourceBefore = sourceEdit.before
        drag.freeTileEditOrigin = sourceEdit.origin
        drag.freeTileEditSourceOffset = sourceEdit.sourceOffset
        drag.freeTileEditInstanceTransform = sourceEdit.instanceTransform
        drag.freeTileEditTransformedSourceBounds = sourceEdit.transformedSourceBounds
        drag.freeTileEditSelection = localSelection
      } else {
        const layers = selectedTransformLayersForSession(ports.session)
        if (layers.length > 1) {
          if (!selectedTransformLayersAreEditable(ports.session, layers)) {
            endSelectionAdjustmentEdit()
            return false
          }
          drag.deferredSelectionPreview = false
          drag.selectionLayers = layers.flatMap((layer) => {
            const source = captureSelectionTransform(ports.session.document, drag.selectionStart!, layer)
            if (source) ensureSourceQuad(source)
            return source ? [{ layerId: layer.id, source, previewEdit: null, translationPreview: null }] : []
          })
          syncPrimarySelectionLayerState(drag)
        } else {
          drag.selectionSource =
            captureSelectionTransform(ports.session.document, drag.selectionStart, layer, { cacheOpaqueOffsets: !drag.deferredSelectionPreview }) ?? undefined
          if (drag.selectionSource) ensureSourceQuad(drag.selectionSource)
        }
      }
    }
    if (!drag.selectionSource) {
      endSelectionAdjustmentEdit()
      return false
    }
    prepareDeferredFloatingSelectionPreview(drag)
    if (drag.selectionStart) renderAdjustmentPreviewEdit(ports.session.document.id, drag.selectionStart)
    return true
  }

  useEffect(
    () => () => {
      if (!adjustmentPreviewEditRef.current) return
      adjustmentPreviewEditRef.current = false
      endAdjustmentPreviewEdit(ports.session.document.id)
    },
    [ports.session.document.id]
  )

  const cloneSelectionQuad = (quad: SelectionQuad | null | undefined): SelectionQuad | null =>
    quad
      ? {
          nw: { ...quad.nw },
          ne: { ...quad.ne },
          se: { ...quad.se },
          sw: { ...quad.sw }
        }
      : null

  const selectionSourceQuadForCanvas = (drag: DragState): SelectionQuad | undefined => {
    const sourceQuad = drag.selectionSource?.sourceQuad
    if (!sourceQuad) return undefined
    const origin = drag.freeTileSelectionTransform ? drag.freeTileEditOrigin : undefined
    const offsetX = origin?.x ?? 0
    const offsetY = origin?.y ?? 0
    return {
      nw: { x: sourceQuad.nw.x + offsetX, y: sourceQuad.nw.y + offsetY },
      ne: { x: sourceQuad.ne.x + offsetX, y: sourceQuad.ne.y + offsetY },
      se: { x: sourceQuad.se.x + offsetX, y: sourceQuad.se.y + offsetY },
      sw: { x: sourceQuad.sw.x + offsetX, y: sourceQuad.sw.y + offsetY }
    }
  }

  const freeTransformQuadForSession = (currentSession: DocumentSession): SelectionQuad | null => {
    const selection = currentSession.selection
    if (!selection) return null
    const pending = currentSession.pendingPaste
    const persisted = pending?.transformQuad ?? currentSession.freeTransformQuad
    if (persisted) return cloneSelectionQuad(persisted)
    const target = pending?.transformTarget ?? selection
    return selectionQuadFromRect(target, pending?.transformAngle ?? 0, pending?.transformShear)
  }

  const selectionPivotForSession = (currentSession: DocumentSession): Point | null => {
    if (drawingAnchorActive(currentSession)) return drawingAnchorPoint(currentSession)
    const selection = currentSession.selection
    if (!selection) return null
    const floating = currentSession.pendingPaste
    const target = floating?.transformTarget ?? selection
    return currentSession.selectionPivot
      ? { ...currentSession.selectionPivot }
      : transformedSelectionPivotPreset(target, 'center', floating?.transformAngle ?? 0, floating?.transformShear)
  }

  const selectionPivotHitAt = (clientX: number, clientY: number): boolean => {
    const currentSession = useWorkspace.getState().sessions.find((item) => item.document.id === ports.session.document.id) ?? ports.session
    if (drawingAnchorActive(currentSession) ? !currentSession.drawingAnchorVisible : currentSession.view.showSelectionPivot === false) return false
    const pivot = selectionPivotForSession(currentSession)
    if (!pivot) return false
    return selectionPivotHit(ports.displayedSelectionPoint(pivot), ports.stagePoint(clientX, clientY))
  }
  const cancelSelectionPreview = (): void => {
    if (selectionPreviewFrameRef.current !== null) window.cancelAnimationFrame(selectionPreviewFrameRef.current)
    selectionPreviewFrameRef.current = null
  }
  useEffect(() => cancelSelectionPreview, [ports.session.document.id])
  return {
    cancelSelectionPreview,
    adjustmentPreviewEditRef,
    cloneSelectionLayerStates,
    restoreSelectionLayerPreviews,
    symmetryStartPointForDrag,
    flushSelectionPreview,
    scheduleSelectionPreview,
    canUseDeferredSelectionPreview,
    restoreDeferredFloatingSelectionPreview,
    updateSelectionTransformPreview,
    updateFreeTransformPreview,
    endSelectionAdjustmentEdit,
    prepareSelectionTransformDrag,
    cloneSelectionQuad,
    freeTransformQuadForSession,
    selectionPivotForSession,
    selectionPivotHitAt
  }
}
