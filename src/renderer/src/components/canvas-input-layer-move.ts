import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import { cachedLayerContentBounds, getLayerIdsInGroup, isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { expandLayerStyleInvalidationRect } from '@/core/document-composite'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { cloneSelection } from '@/core/selection'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { constrainedTranslation } from '@/core/canvas-input-resize'
import { translatedSelectionRect } from '@/core/canvas-input-preview'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { canvasCursors } from '@/core/canvas-visuals'
import { resolveCanvasMoveAnimationCellKeys, resolveCanvasMoveLayerIds } from '@/components/canvas-move-selection'
import { preserveCanvasSelection, revealLayerInPanel } from '@/components/layer-panel-reveal'
import { animationCelKey, animationCelOffsetsForKeys, ensureAnimationDocument, parseAnimationCelKey } from '@/core/animation'
import { animationMaskOffsetsForLayerMove } from '@/store/workspace-layer-move'

interface Ports {
  topEditableLayerAt: (point: Point) => RasterLayer | null
  showMoveLayerContentPreview: (layer: RasterLayer) => void
  flashMoveLayer: (layer: RasterLayer) => void
  hideMoveLayerContentPreview: (delayMs?: number) => void
  inputRef: import('react').RefObject<CanvasInputState>
  alignmentDragFields: (
    movingBounds: readonly SelectionRect[],
    excludedLayerIds?: readonly string[],
    snapToGridOrigin?: boolean
  ) => {
    alignmentMovingBounds: {
      x: number
      y: number
      width: number
      height: number
      flipHorizontal?: boolean
      flipVertical?: boolean
      flipOriginX?: number
      flipOriginY?: number
    }[]
    alignmentTargetBounds: SelectionRect[]
    alignmentGridEnabled: boolean
    alignmentSnapToGridOrigin: boolean
    alignmentSmartEnabled: boolean
    alignmentThreshold: number
  }
  alignedDragTranslation: (drag: DragState, distance: Point) => Point
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  invalidateOnionSkinDragFrames: (drag: DragState) => void
  invalidateCompositeRect: (selection: SelectionRect | null | undefined, layerIds?: readonly string[]) => void
  scheduleDraw: () => void
}

export function createLayerMoveCanvasInput(ports: Ports) {
  function beginLayerMove({
    freeTransformActive,
    session,
    temporaryMove,
    textCopyTarget,
    event,
    point,
    state,
    canMoveActiveLayer,
    movableActiveLayer,
    eyedropperHeld,
    sampleAtPoint,
    copyLayerHeld
  }: {
    freeTransformActive: boolean
    session: DocumentSession
    temporaryMove: boolean
    textCopyTarget: RasterLayer | null
    event: React.PointerEvent<HTMLCanvasElement>
    point: Point
    state: ReturnType<typeof useWorkspace.getState>
    canMoveActiveLayer: boolean
    movableActiveLayer: RasterLayer
    eyedropperHeld: boolean
    sampleAtPoint: (temporarySampling?: boolean) => void
    copyLayerHeld: boolean
  }): boolean {
    const { topEditableLayerAt, showMoveLayerContentPreview, flashMoveLayer, hideMoveLayerContentPreview, inputRef, alignmentDragFields } = ports
    if (!freeTransformActive && (session.tool === 'move' || temporaryMove || textCopyTarget) && event.button === 0) {
      const additiveSelection = event.shiftKey
      const hitTarget = textCopyTarget ?? (session.moveAutoSelect || additiveSelection ? topEditableLayerAt(point) : null)
      if (inputRef.current.temporaryRightClickAction === 'select-layer-move' && !hitTarget) return true
      let selectedLayerIds = resolveCanvasMoveLayerIds({
        selectedLayerIds: session.selectedLayerIds,
        selectedGroupIds: session.selectedGroupIds,
        layerIdsForGroup: (groupId) => getLayerIdsInGroup(session.document, groupId)
      })
      // Keep the user's explicit layer/group selection separate from the
      // temporary hit target that auto-select may assign below.  The latter
      // must not expand an animated move from the active cel to every frame.
      const hasExplicitLayerSelection = session.layerSelectionExplicit === true
        && (session.selectedLayerIds.length > 0 || session.selectedGroupIds.length > 0)
      if (additiveSelection && hitTarget) {
        state.selectMoveToolLayer(hitTarget.id, true)
        const selectedSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        selectedLayerIds = selectedSession?.selectedLayerIds ?? selectedLayerIds
        revealLayerInPanel(session.document.id, hitTarget.id)
        if (selectedLayerIds.includes(hitTarget.id)) {
          showMoveLayerContentPreview(hitTarget)
          flashMoveLayer(hitTarget)
        } else hideMoveLayerContentPreview()
        return true
      }
      if (!additiveSelection && selectedLayerIds.length > 1 && hitTarget && !selectedLayerIds.includes(hitTarget.id)) {
        state.activateLayerForCanvas(hitTarget.id)
        selectedLayerIds = [hitTarget.id]
        revealLayerInPanel(session.document.id, hitTarget.id)
      }
      const frameSelectionAcrossLayers = session.selectedAnimationFrameIds.length > 0
      let selectedMovableLayers = (
        textCopyTarget ? [textCopyTarget.id] : frameSelectionAcrossLayers ? session.document.layers.map((layer) => layer.id) : selectedLayerIds
      )
        .map((id) => session.document.layers.find((layer) => layer.id === id))
        .filter((layer): layer is RasterLayer =>
          Boolean(layer && isLayerEffectivelyVisible(session.document, layer) && !isLayerEffectivelyLocked(session.document, layer))
        )
      let moveAllSelectedLayers = !textCopyTarget && (frameSelectionAcrossLayers || selectedMovableLayers.length > 1 || session.selectedGroupIds.length > 0)
      const target =
        textCopyTarget ??
        (additiveSelection && hitTarget
          ? hitTarget
          : moveAllSelectedLayers
            ? (selectedMovableLayers.find((layer) => layer.id === session.document.activeLayerId) ?? selectedMovableLayers[0])
            : session.moveAutoSelect
              ? (hitTarget ?? (canMoveActiveLayer ? movableActiveLayer : null))
              : canMoveActiveLayer
                ? movableActiveLayer
                : null)
      if (!target) {
        if (eyedropperHeld) sampleAtPoint()
        return true
      }
      if (!additiveSelection && session.moveAutoSelect && !moveAllSelectedLayers) {
        const currentFrameId = session.document.animation?.activeFrameId
        const targetKey = currentFrameId ? animationCelKey(target.id, currentFrameId) : null
        if (!targetKey || !session.selectedAnimationCellKeys.includes(targetKey)) {
          state.activateLayerForCanvas(target.id)
          selectedLayerIds = [target.id]
          selectedMovableLayers = [target]
          moveAllSelectedLayers = false
          revealLayerInPanel(session.document.id, target.id)
        }
      }
      // Selection changes and click feedback are independent. In particular,
      // erasing an edge invalidates bounds without changing the selected cel.
      showMoveLayerContentPreview(hitTarget ?? target)
      flashMoveLayer(hitTarget ?? target)
      const activeSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
      const currentFrameId = activeSession.document.animation?.activeFrameId
      const layerSelectionAcrossFrames =
        !frameSelectionAcrossLayers &&
        activeSession.selectedAnimationFrameIds.length === 0 &&
        activeSession.selectedAnimationCellKeys.length === 0 &&
        activeSession.selectedAnimationMaskCellKeys.length === 0
      // An animated document with no explicit timeline selection still has a
      // concrete editing cel.  Moving from the canvas must scope that
      // implicit target to the active cel; only a static layer (or an
      // explicitly selected layer/group) should expand to every frame.
      if (layerSelectionAcrossFrames && !textCopyTarget && hasExplicitLayerSelection) moveAllSelectedLayers = true
      const selectedCellKeys = resolveCanvasMoveAnimationCellKeys({
        selectedAnimationCellKeys: activeSession.selectedAnimationCellKeys,
        selectedAnimationFrameIds: activeSession.selectedAnimationFrameIds,
        selectedLayerIds: selectedMovableLayers.map((layer) => layer.id),
        allFrameIds: activeSession.document.animation?.frames.map((frame) => frame.id) ?? [],
        currentFrameId,
        targetLayerId: target.id,
        moveAllSelectedLayers,
        moveSelectedFramesAcrossLayers: frameSelectionAcrossLayers
      })
      const movableCellKeys = selectedCellKeys.filter((key) => {
        const parsed = parseAnimationCelKey(key)
        const layer = parsed ? activeSession.document.layers.find((candidate) => candidate.id === parsed.layerId) : null
        return Boolean(layer && isLayerEffectivelyVisible(activeSession.document, layer) && !isLayerEffectivelyLocked(activeSession.document, layer))
      })
      const animationCellOffsets = animationCelOffsetsForKeys(activeSession.document, movableCellKeys)
      const animationCellKeys = movableCellKeys.filter((key) => animationCellOffsets[key])
      const layerIds = (moveAllSelectedLayers ? selectedMovableLayers.map((layer) => layer.id) : [target.id]).filter((id) => {
        const layer = session.document.layers.find((candidate) => candidate.id === id)
        return Boolean(layer && isLayerEffectivelyVisible(session.document, layer) && !isLayerEffectivelyLocked(session.document, layer))
      })
      const layerOffsets = Object.fromEntries(
        layerIds.map((id) => {
          const layer = session.document.layers.find((candidate) => candidate.id === id)!
          return [id, { x: layer.offsetX, y: layer.offsetY }]
        })
      )
      const rawLayerContentBoundsById = Object.fromEntries(
        layerIds.map((id) => {
          const layer = session.document.layers.find((candidate) => candidate.id === id)!
          // A canvas click must never synchronously scan a whole raster. The
          // old path called layerContentBounds here, which walks every pixel
          // when the derived bounds cache was cold. That made Ctrl-click auto
          // select block the renderer for seconds on large documents. Reuse an
          // established bound; while it is cold, the layer rectangle is a safe
          // conservative invalidation/move bound and can be narrowed later by
          // the normal cache-building paths.
          const cachedBounds = cachedLayerContentBounds(session.document, layer)
          return [id, cachedBounds === undefined ? { x: layer.offsetX, y: layer.offsetY, width: layer.width, height: layer.height } : cachedBounds]
        })
      )
      const layerContentBoundsById = Object.fromEntries(
        layerIds.map((id) => {
          const bounds = rawLayerContentBoundsById[id]
          return [id, bounds ? expandLayerStyleInvalidationRect(session.document, bounds, [id]) : null]
        })
      )
      const moveBounds = Object.values(layerContentBoundsById).filter((bounds): bounds is SelectionRect => Boolean(bounds))
      const selectionStart = cloneSelection(session.selection)
      const alignmentMovingBounds = [
        ...Object.values(rawLayerContentBoundsById).filter((bounds): bounds is SelectionRect => Boolean(bounds)),
        ...(selectionStart ? [selectionStart] : [])
      ]
      window.__moonSpriteCanvasProbe?.recordOperationStage?.('move-layer.bounds', 0, {
        layers: layerIds.length,
        boundedLayers: moveBounds.length,
        dirtyPixels: moveBounds.reduce((sum, bounds) => sum + bounds.width * bounds.height, 0)
      })
      inputRef.current.drag = {
        kind: 'move-layer',
        start: point,
        last: point,
        layerId: target.id,
        layerOffset: { x: target.offsetX, y: target.offsetY },
        layerIds,
        layerOffsets,
        layerContentBounds: layerContentBoundsById,
        layerFrameId: currentFrameId,
        ...alignmentDragFields(alignmentMovingBounds, layerIds),
        animationCellKeys,
        animationCellOffsets,
        animationMaskOffsets: animationMaskOffsetsForLayerMove(activeSession, layerIds, currentFrameId, animationCellKeys),
        duplicateOnDrag: Boolean(textCopyTarget || copyLayerHeld) && layerIds.length === 1 && animationCellKeys.length <= 1,
        originalSelectedLayerIds: [...selectedLayerIds],
        selectionStart,
        selectionPivotStart: activeSession.selectionPivot ? { ...activeSession.selectionPivot } : undefined,
        previewPivot: activeSession.selectionPivot ? { ...activeSession.selectionPivot } : undefined,
        clickLayerId: hitTarget?.id ?? session.document.activeLayerId,
        // Even with automatic layer selection disabled, a click (as opposed to
        // a drag) on another visible layer should activate that layer.
        collapseLayerSelectionOnClick: !additiveSelection && (selectedLayerIds.length > 1 || activeSession.selectedAnimationCellKeys.length > 1)
      }
      preserveCanvasSelection(session.document.id)
      event.currentTarget.style.cursor = textCopyTarget || copyLayerHeld ? canvasCursors.copy : canvasCursors.move
      return true
    }
    return false
  }

  function moveLayer({
    drag,
    point,
    event,
    state,
    session
  }: {
    drag: DragState
    point: Point
    event: React.PointerEvent<HTMLCanvasElement>
    state: ReturnType<typeof useWorkspace.getState>
    session: DocumentSession
  }): boolean {
    const { alignedDragTranslation, modifierActive, t, compositeCacheRef, invalidateOnionSkinDragFrames, invalidateCompositeRect, scheduleDraw } = ports
    if (drag.kind === 'move-layer' && drag.layerId && drag.layerOffset) {
      const distance = alignedDragTranslation(
        drag,
        constrainedTranslation(drag, point.x - drag.start.x, point.y - drag.start.y, modifierActive(event.nativeEvent, 'constrainAxis'))
      )
      const distanceX = distance.x
      const distanceY = distance.y
      drag.moved = drag.moved || distanceX !== 0 || distanceY !== 0
      const previousDistance = drag.layerPreviewOffset ?? { x: 0, y: 0 }
      if (previousDistance.x === distanceX && previousDistance.y === distanceY) return true
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distanceX, y: drag.selectionPivotStart.y + distanceY }
      if (drag.duplicateOnDrag && !drag.duplicatedLayerId && (distanceX !== 0 || distanceY !== 0)) {
        const duplicate = state.beginLayerMoveDuplicatePreview(session.document.id, drag.layerId, t('canvas.history.copySuffix'))
        if (duplicate) {
          drag.duplicatedLayerId = duplicate.layerId
          drag.duplicatedLayer = duplicate.layer
          drag.duplicatedAnimationCels = duplicate.animationCels
          drag.duplicatedLayerIndex = duplicate.insertionIndex
          drag.animationMaskOffsets = animationMaskOffsetsForLayerMove(session, [duplicate.layerId], ensureAnimationDocument(session.document).activeFrameId)
        }
      }
      if (!state.previewLayerMove(session.document.id, drag, distanceX, distanceY)) return true
      // Layer offsets are previewed by mutating the document in place, so the
      // content revision does not change. Drop only placement plans before
      // recompositing the old/new regions; styled proxies otherwise retain
      // the drag-start offset and leave a stale footprint behind.
      compositeCacheRef.current.invalidateLayerPlacementCaches()
      const moveInvalidationLayerIds = drag.duplicatedLayerId ? [drag.duplicatedLayerId] : drag.layerIds
      invalidateOnionSkinDragFrames(drag)
      if (drag.layerContentBounds) {
        let dirtyPixels = 0
        for (const bounds of Object.values(drag.layerContentBounds)) {
          if (!bounds) continue
          dirtyPixels += bounds.width * bounds.height * 2
          if (drag.duplicatedLayer) {
            invalidateCompositeRect(translatedSelectionRect(bounds, previousDistance), moveInvalidationLayerIds)
            invalidateCompositeRect(translatedSelectionRect(bounds, distance), moveInvalidationLayerIds)
          } else {
            compositeCacheRef.current.invalidateDocumentPlacementRect(
              translatedSelectionRect(bounds, previousDistance),
              session.document,
              session.document.animation?.activeFrameId,
              moveInvalidationLayerIds
            )
            compositeCacheRef.current.invalidateDocumentPlacementRect(
              translatedSelectionRect(bounds, distance),
              session.document,
              session.document.animation?.activeFrameId,
              moveInvalidationLayerIds
            )
          }
        }
        window.__moonSpriteCanvasProbe?.recordOperationStage?.('move-layer.cache-invalidation', 0, { dirtyPixels })
      } else {
        compositeCacheRef.current.invalidateAll()
      }
      drag.layerPreviewOffset = { x: distanceX, y: distanceY }
      scheduleDraw()
      return true
    }
    return false
  }

  function endLayerMove({ drag, state, session }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState>; session: DocumentSession }): boolean {
    const {} = ports
    if (drag.kind === 'move-layer') state.commitLayerMove(session.document.id, drag)
    return false
  }

  function endLayerClick({ drag, state, session }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState>; session: DocumentSession }): boolean {
    const {} = ports
    if (drag.kind === 'move-layer' && drag.collapseLayerSelectionOnClick && !drag.moved && drag.clickLayerId) {
      state.activateLayerForCanvas(drag.clickLayerId)
      revealLayerInPanel(session.document.id, drag.clickLayerId)
    }
    return false
  }

  function endLayerPivot({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const {} = ports
    if (drag.kind === 'move-layer' && drag.previewPivot) state.setSelectionPivot(drag.previewPivot)
    return false
  }
  return { beginLayerMove, moveLayer, endLayerMove, endLayerClick, endLayerPivot }
}
