import { MagicWandGesture } from '@/core/magic-wand-gesture'
import { prepareSelectionBoundary } from '@/core/selection-boundary'
import type { MagicWandWorkerResult } from '@/core/magic-wand-worker'
import { prepareMagicWandOperation, type MagicWandOperation } from '@/core/magic-wand-operation'
import type { FreeTileInstance } from '@shared/types-tiles'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionMode, SelectionQuad, SelectionRect } from '@shared/types-selection'
import { createCompositePointSampler } from '@/core/document-composite'
import { type SelectionTransformLayerState } from '@/core/tools-selection-transform'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { startCanvasSelection } from '@/components/layer-panel-reveal'
import {
  cloneSelection,
  combineSelection,
  magicWandSelection,
  rectSelection,
  selectionContains,
  selectionQuadBounds,
  selectionQuadFromRect,
  transformedSelectionBounds,
  type SelectionShearTransform
} from '@/core/selection'
import { CanvasInputState } from '@/core/canvas-input-controller'
import {
  floatingSelectionCopyMode,
  isQuickSelectionSecondPress,
  shouldRestartFloatingSelectionForCopy,
  shouldReuseFloatingSelectionSourceForCopy,
  type QuickSelectionPress
} from '@/core/canvas-input-path'
import { selectionHitStartsContentMove } from '@/core/canvas-input-hit-test'
import { selectionTransformDeferredPreviewEnabled } from '@/core/canvas-input-preview'
import {
  type CanvasDragState as DragState,
  type CanvasPoint as Point,
  type SelectionHandle,
  type SelectionRotationHandle,
  type SelectionShearHandle
} from '@/core/canvas-input-contracts'
import { type SelectionHit } from '@/core/canvas-input-state'
import { canvasCursors, resizeCursors, rotationCursors, shearCursors, selectionCreationCursor } from '@/core/canvas-visuals'
import { MagicWandWorkerClient } from '@/core/magic-wand-worker'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { activeTilemapCelTarget, captureTilemapSelectionMove } from '@/core/tilemap-document'
import { freeTileInstanceBounds } from '@/core/free-tile'
import { selectionCoversRect } from '@/core/free-tile-edit'
import { timelineSelectionPrecedesCanvasMarquee, selectionBoundsEqual } from './canvas-stage-helpers'

interface Ports {
  selectedFreeTileSelectionTarget: (current?: DocumentSession) => {
    target: import('@/core/free-tile-document').FreeTileCelTarget
    instance: FreeTileInstance
    source: import('@/core/free-tile').FreeTileSourceRef
    bounds: SelectionRect
  } | null
  selectionHit: (event: React.PointerEvent<HTMLCanvasElement>) => SelectionHit
  liveViewRef: import('react').RefObject<import('@shared/types-view').ViewState>
  repeatedDocumentPointsAt: (
    clientX: number,
    clientY: number,
    continuous?: boolean,
    allowOutsideCopies?: boolean
  ) => {
    local: Point
    repeated: Point
    offset: {
      x: number
      y: number
    }
  } | null
  quickSelectionPressRef: import('react').RefObject<QuickSelectionPress | null>
  quickSelectionCellAt: (active: DocumentSession, point: Point) => SelectionRect | null
  tilemapPaintSelectionForIncoming: (incoming: SelectionMask | null, current?: DocumentSession) => SelectionMask | null
  inputRef: import('react').RefObject<CanvasInputState>
  quickSelectionHandledAtRef: import('react').RefObject<number | null>
  selectionCrosshair: boolean
  selectionInteractionEditable: boolean
  scheduleDraw: () => void
  displayedResizeCursorForHandle: (hit: SelectionHandle, contentRotation?: number) => string
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  selectionLayersEditable: boolean
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
  freeTransformQuadForSession: (currentSession: DocumentSession) => SelectionQuad | null
  cloneSelectionLayerStates: (layers: readonly SelectionTransformLayerState[] | undefined) => SelectionTransformLayerState[] | undefined
  freeTileFloatingDragFields: (floating: DocumentSession['pendingPaste']) => Partial<DragState>
  tilemapEditCellIndexAtPoint: (point: Point, current?: DocumentSession) => number | null | undefined
  selectedTransformLayers: RasterLayer[]
  canUseDeferredSelectionPreview: (layer: RasterLayer) => boolean
  cloneSelectionQuad: (quad: SelectionQuad | null | undefined) => SelectionQuad | null
  selectionPivotForSession: (currentSession: DocumentSession) => Point | null
  shearCursorForTransform: (hit: SelectionShearHandle, target: SelectionRect, angle?: number, shear?: SelectionShearTransform) => string
  rotationCursorForHit: (hit: SelectionRotationHandle) => string
  selectionTransformModifierState: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) => {
    proportional: boolean
    integerScale: boolean
    fromCenter: boolean
    copy: false
  }
  resizeCursorForHit: (hit: SelectionHandle) => string
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  selectionPreviewColorMode: import('@/core/file-preferences').SelectionPreviewColorMode
  selectionPreviewColor: RgbaColor
  magicGestureRef: import('react').RefObject<{
    cancel: (redraw?: boolean) => void
    drag: DragState
  } | null>
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  drawSelectionOverlay: () => void
  magicWandWorkerRef: import('react').RefObject<MagicWandWorkerClient | null>
}

export function createSelectionBeginCanvasInput(ports: Ports) {
  function beginSelection({
    selectionTool,
    event,
    selectionMode,
    session,
    eyedropperHeld,
    state,
    point,
    sampleAtPoint,
    editableLayer
  }: {
    selectionTool: boolean
    event: React.PointerEvent<HTMLCanvasElement>
    selectionMode: () => SelectionMode
    session: DocumentSession
    eyedropperHeld: boolean
    state: ReturnType<typeof useWorkspace.getState>
    point: Point
    sampleAtPoint: (temporarySampling?: boolean) => void
    editableLayer: RasterLayer
  }): boolean {
    const {
      selectedFreeTileSelectionTarget,
      selectionHit,
      liveViewRef,
      repeatedDocumentPointsAt,
      quickSelectionPressRef,
      quickSelectionCellAt,
      tilemapPaintSelectionForIncoming,
      inputRef,
      quickSelectionHandledAtRef,
      selectionCrosshair,
      selectionInteractionEditable,
      scheduleDraw,
      displayedResizeCursorForHandle,
      modifierActive,
      selectionLayersEditable,
      alignmentDragFields,
      freeTransformQuadForSession,
      cloneSelectionLayerStates,
      freeTileFloatingDragFields,
      tilemapEditCellIndexAtPoint,
      selectedTransformLayers,
      canUseDeferredSelectionPreview,
      cloneSelectionQuad,
      selectionPivotForSession,
      shearCursorForTransform,
      rotationCursorForHit,
      selectionTransformModifierState,
      resizeCursorForHit,
      symmetryCenter,
      selectionPreviewColorMode,
      selectionPreviewColor,
      magicGestureRef,
      t,
      drawSelectionOverlay,
      magicWandWorkerRef
    } = ports
    if (selectionTool && (event.button === 0 || event.button === 2)) {
      const mode = selectionMode()
      const currentSelectionSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
      const freeTileSelectionTarget = selectedFreeTileSelectionTarget(currentSelectionSession)
      const freeTileSelectionBounds = freeTileSelectionTarget?.bounds
      // Keep the visible selection in document space. Source edits are scoped to
      // the selected instance later, but marquee/lasso creation must remain free
      // to cover transparent space around it.
      const currentSelection = currentSelectionSession.selection
      const freeTransformActive = currentSelectionSession.freeTransformActive === true
      const freeTransformHit = freeTransformActive ? selectionHit(event) : 'outside'
      const freeTransformCorner = freeTransformHit === 'nw' || freeTransformHit === 'ne' || freeTransformHit === 'se' || freeTransformHit === 'sw'
      const freeTransformContent = freeTransformHit === 'inside'
      if (freeTransformActive && !(event.button === 0 && (freeTransformCorner || freeTransformContent))) return true
      const customSelectionPivot = currentSelectionSession.selectionPivot ? { ...currentSelectionSession.selectionPivot } : undefined
      const repeatMode = liveViewRef.current.tileRepeatMode ?? 'off'
      const tileRepeatStart = repeatMode === 'off' ? undefined : repeatedDocumentPointsAt(event.clientX, event.clientY, true)?.repeated
      const quickPress: QuickSelectionPress = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        timeStamp: event.timeStamp
      }
      const quickSelectionSecondPress =
        !freeTransformActive &&
        event.button === 0 &&
        session.selectionKind === 'rectangle' &&
        !eyedropperHeld &&
        isQuickSelectionSecondPress(quickSelectionPressRef.current, quickPress, event.detail)
      if (!freeTransformActive && event.button === 0 && session.selectionKind === 'rectangle') {
        quickSelectionPressRef.current = quickSelectionSecondPress ? null : quickPress
      }
      if (quickSelectionSecondPress) {
        state.commitFloatingPaste()
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
        const cell = quickSelectionCellAt(active, point)
        if (cell) {
          if (timelineSelectionPrecedesCanvasMarquee(active)) {
            const timeline = ensureAnimationDocument(active.document)
            state.selectAnimationCell(animationCelKey(active.document.activeLayerId, timeline.activeFrameId))
          }
          startCanvasSelection(session.document.id)
          const before = cloneSelection(active.selection)
          const incoming = tilemapPaintSelectionForIncoming(rectSelection(cell.x, cell.y, cell.width, cell.height), active)
          const baseSelection = combineSelection(before, incoming, mode)
          inputRef.current.drag = {
            kind: 'marquee',
            start: point,
            last: point,
            startClient: { x: event.clientX, y: event.clientY },
            selectionStart: before,
            selectionCommitStart: before,
            selectionMode: mode,
            previewSelection: baseSelection,
            marqueePreviewSelection: incoming,
            marqueeBounds: { ...cell },
            previewTarget: { ...cell },
            quickSelectCell: { ...cell },
            moved: false
          }
          quickSelectionHandledAtRef.current = event.timeStamp
          event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair, selectionInteractionEditable, true)
          scheduleDraw()
          return true
        }
      }
      const rawHit = freeTransformActive ? freeTransformHit : selectionHit(event)
      const transformInteraction = event.button === 0 && !event.shiftKey
      // Once free transform is active, the frame owns the pointer regardless
      // of the selection mode left over from marquee creation. This prevents
      // subtract/intersect modes from turning an interior drag into a new
      // selection gesture.
      const hit = freeTransformActive
        ? freeTransformHit
        : transformInteraction && (mode === 'replace' || mode === 'add' || rawHit !== 'inside')
          ? rawHit
          : 'outside'
      if (event.button === 0 && session.tool === 'selection' && rawHit === 'inside' && hit === 'inside' && session.selection) {
        state.setSelectionPropertiesActive(true)
      }
      if (eyedropperHeld && !(hit in resizeCursors)) {
        sampleAtPoint()
        return true
      }
      if (session.textBoxTransform && event.button === 0) {
        if (hit in resizeCursors) {
          const bounds = { ...session.textBoxTransform.bounds }
          inputRef.current.drag = {
            kind: 'transform-text-box',
            start: point,
            last: point,
            handle: hit as SelectionHandle,
            transformStartTarget: bounds,
            previewTarget: bounds
          }
          event.currentTarget.style.cursor = displayedResizeCursorForHandle(hit as SelectionHandle)
        }
        return true
      }
      const copyRequested = modifierActive(event.nativeEvent, 'copySelectionContent')
      if (selectionLayersEditable && selectionHitStartsContentMove(hit, copyRequested) && session.selection && currentSelection) {
        let floating = session.pendingPaste
        const selectionMatchesFloatingTarget = !floating || selectionBoundsEqual(currentSelection, floating.target)
        const floatingCopyRestart =
          floating &&
          shouldReuseFloatingSelectionSourceForCopy(
            floating.source.origin,
            copyRequested,
            selectionMatchesFloatingTarget,
            Boolean(floating.layers?.length || floating.freeTile)
          )
            ? {
                source: floating.source,
                transformTarget: floating.transformTarget ?? {
                  x: floating.target.x,
                  y: floating.target.y,
                  width: floating.target.width,
                  height: floating.target.height
                },
                transformAngle: floating.transformAngle ?? 0,
                transformShear: floating.transformShear
              }
            : null
        if (floating && !selectionMatchesFloatingTarget) {
          state.commitFloatingPaste()
          floating = null
        }
        if (editableLayer.kind === 'tilemap' && session.tilemapMode === 'paint' && floating) {
          state.commitFloatingPaste()
          floating = null
        }
        if (floating && shouldRestartFloatingSelectionForCopy(floating.copy, copyRequested)) {
          state.commitFloatingPaste()
          floating = null
        }
        const copy = floatingCopyRestart ? true : floatingSelectionCopyMode(floating?.copy ?? null, copyRequested)
        let selectionStart = cloneSelection(currentSelection)!
        if (editableLayer.kind === 'tilemap' && session.tilemapMode === 'paint')
          selectionStart = tilemapPaintSelectionForIncoming(selectionStart) ?? selectionStart
        const selectedFreeTileIds =
          session.selectedFreeTileInstanceIds.length > 0
            ? session.selectedFreeTileInstanceIds
            : session.selectedFreeTileInstanceId
              ? [session.selectedFreeTileInstanceId]
              : []
        const selectedFreeTileInstancesForMove = freeTileSelectionTarget
          ? selectedFreeTileIds.flatMap(
              (id) =>
                freeTileSelectionTarget.target.freeTiles.instances.find(
                  (candidate) => candidate.id === id && candidate.visible !== false && candidate.locked !== true
                ) ?? []
            )
          : []
        const selectedFreeTileMoveBounds =
          selectedFreeTileInstancesForMove.length > 0
            ? (() => {
                const bounds = selectedFreeTileInstancesForMove.map((instance) =>
                  freeTileInstanceBounds(
                    instance,
                    freeTileSelectionTarget!.target.sources,
                    freeTileSelectionTarget!.target.surface.offsetX,
                    freeTileSelectionTarget!.target.surface.offsetY
                  )
                )
                const left = Math.min(...bounds.map((bound) => bound.x))
                const top = Math.min(...bounds.map((bound) => bound.y))
                const right = Math.max(...bounds.map((bound) => bound.x + bound.width))
                const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height))
                return { x: left, y: top, width: right - left, height: bottom - top }
              })()
            : null
        const onlySelectedFreeTileInstance = Boolean(
          !floating &&
            !copy &&
            editableLayer.kind === 'free-tile' &&
            session.freeTileMode === 'edit' &&
            freeTileSelectionTarget &&
            selectedFreeTileInstancesForMove.length > 0 &&
            selectedFreeTileIds.includes(freeTileSelectionTarget.instance.id) &&
            selectedFreeTileMoveBounds &&
            selectionCoversRect(selectionStart, selectedFreeTileMoveBounds)
        )
        if (!freeTransformActive && onlySelectedFreeTileInstance && freeTileSelectionTarget) {
          const placementEdit = state.beginFreeTilePlacement()
          if (placementEdit) {
            const selectionPivotStart = currentSelectionSession.selectionPivot ? { ...currentSelectionSession.selectionPivot } : undefined
            inputRef.current.drag = {
              kind: 'move-content',
              start: point,
              last: point,
              selectionStart,
              selectionPreparationPending: false,
              copy: false,
              floatingPaste: false,
              previewSelection: selectionStart,
              appliedSelection: selectionStart,
              selectionPivotStart,
              previewPivot: selectionPivotStart,
              transformStartTarget: { x: selectionStart.x, y: selectionStart.y, width: selectionStart.width, height: selectionStart.height },
              previewTarget: { x: selectionStart.x, y: selectionStart.y, width: selectionStart.width, height: selectionStart.height },
              previewAngle: 0,
              ...alignmentDragFields([selectionStart], [editableLayer.id]),
              freeTilePlacementEdit: placementEdit,
              freeTileInstanceId: freeTileSelectionTarget.instance.id,
              freeTileInstanceStart: { x: freeTileSelectionTarget.instance.x, y: freeTileSelectionTarget.instance.y },
              freeTileInstanceIds: selectedFreeTileInstancesForMove.map((instance) => instance.id),
              freeTileInstanceStarts: Object.fromEntries(selectedFreeTileInstancesForMove.map((instance) => [instance.id, { x: instance.x, y: instance.y }])),
              freeTileInstanceSelectionMove: true
            }
            event.currentTarget.style.cursor = canvasCursors.move
            return true
          }
        }
        const freeTransformQuad = freeTransformActive ? (freeTransformQuadForSession(currentSelectionSession) ?? selectionQuadFromRect(selectionStart)) : null
        const freeTransform = Boolean(freeTransformQuad)
        const transformTarget = freeTransformQuad
          ? selectionQuadBounds(freeTransformQuad)
          : (floating?.transformTarget ??
            floatingCopyRestart?.transformTarget ?? { x: selectionStart.x, y: selectionStart.y, width: selectionStart.width, height: selectionStart.height })
        const transformAngle = freeTransform ? 0 : (floating?.transformAngle ?? floatingCopyRestart?.transformAngle ?? 0)
        const transformShear = freeTransform ? undefined : (floating?.transformShear ?? floatingCopyRestart?.transformShear)
        const floatingLayers = cloneSelectionLayerStates(floating?.layers)
        const freeTileFloatingFields = freeTileFloatingDragFields(floating)
        const tilemapEditCellIndex = floating?.tilemapEditCellIndex ?? tilemapEditCellIndexAtPoint(point, currentSelectionSession)
        const tilemapSelectionMoveSource =
          !freeTransformActive && editableLayer.kind === 'tilemap' && session.tilemapMode === 'paint'
            ? (() => {
                const target = activeTilemapCelTarget(session.document)
                return target ? captureTilemapSelectionMove(target, selectionStart) : null
              })()
            : null
        if (editableLayer.kind === 'tilemap' && session.tilemapMode === 'edit' && tilemapEditCellIndex == null) return true
        // Free-transform content movement uses the regular selection transform
        // preview even on tilemap layers. The paint-mode guard below only
        // applies to the legacy grid-snapped selection move path.
        if (!freeTransformActive && editableLayer.kind === 'tilemap' && session.tilemapMode === 'paint' && !tilemapSelectionMoveSource) return true
        const alignmentMovingBounds = transformedSelectionBounds(transformTarget, transformAngle, transformShear)
        inputRef.current.drag = {
          kind: 'move-content',
          start: point,
          last: point,
          selectionStart,
          selectionSource: floating?.source ?? floatingCopyRestart?.source,
          selectionLayers: floatingLayers,
          selectionSourceCacheKey: session.selection,
          selectionPreparationPending: !tilemapSelectionMoveSource,
          previewEdit: floating?.previewEdit,
          translationPreview: floating?.translationPreview,
          deferredSelectionPreview:
            freeTransform || tilemapSelectionMoveSource || floatingLayers?.length || selectedTransformLayers.length > 1
              ? false
              : selectionTransformDeferredPreviewEnabled('move-content', canUseDeferredSelectionPreview(editableLayer), transformAngle, transformShear),
          copy,
          floatingPaste: Boolean(floating),
          previewSelection: selectionStart,
          appliedSelection: selectionStart,
          selectionPivotStart: customSelectionPivot,
          previewPivot: customSelectionPivot,
          transformStartTarget: { ...transformTarget },
          startAngle: transformAngle,
          transformStartShear: transformShear ? { ...transformShear } : undefined,
          previewTarget: { ...transformTarget },
          previewAngle: transformAngle,
          previewShear: transformShear ? { ...transformShear } : undefined,
          freeTransform,
          transformStartQuad: cloneSelectionQuad(freeTransformQuad) ?? undefined,
          previewQuad: cloneSelectionQuad(freeTransformQuad) ?? undefined,
          ...alignmentDragFields(
            [alignmentMovingBounds],
            selectedTransformLayers.map((layer) => layer.id),
            true
          ),
          ...freeTileFloatingFields,
          ...(tileRepeatStart ? { tileRepeatStart } : {}),
          ...(tilemapEditCellIndex == null ? {} : { tilemapEditCellIndex }),
          ...(tilemapSelectionMoveSource ? { tilemapSelectionMoveSource, tilemapSelectionMoveDelta: { columns: 0, rows: 0 } } : {})
        }
        event.currentTarget.style.cursor = !floating && copy ? canvasCursors.copy : canvasCursors.move
        return true
      }
      if (hit === 'edge' && session.selection && currentSelection) {
        const preserveFloatingPaste = session.pendingPaste?.source.origin === 'clipboard'
        if (session.pendingPaste && !preserveFloatingPaste) state.commitFloatingPaste()
        const current = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
        const selectionStart = cloneSelection(current.selection)
        if (!selectionStart) return true
        const selectionPivotStart = current.selectionPivot ? { ...current.selectionPivot } : undefined
        inputRef.current.drag = {
          kind: 'move-selection',
          start: point,
          last: point,
          selectionStart,
          previewSelection: selectionStart,
          selectionPivotStart,
          previewPivot: selectionPivotStart,
          floatingPasteSelectionBox: preserveFloatingPaste,
          ...alignmentDragFields([selectionStart], [], true),
          ...(tileRepeatStart ? { tileRepeatStart } : {})
        }
        event.currentTarget.style.cursor = canvasCursors.selectionMove
        return true
      }
      if (hit in shearCursors && session.selection && currentSelection) {
        let floating = session.pendingPaste
        if (floating && !selectionBoundsEqual(currentSelection, floating.target)) {
          state.commitFloatingPaste()
          floating = null
        }
        const selectionStart = cloneSelection(currentSelection)
        const transformTarget = floating?.transformTarget ?? {
          x: selectionStart!.x,
          y: selectionStart!.y,
          width: selectionStart!.width,
          height: selectionStart!.height
        }
        const transformAngle = floating?.transformAngle ?? 0
        const transformShear = floating?.transformShear
        const floatingLayers = cloneSelectionLayerStates(floating?.layers)
        inputRef.current.drag = {
          kind: 'shear-content',
          start: point,
          last: point,
          selectionStart,
          selectionSource: floating?.source,
          selectionLayers: floatingLayers,
          selectionSourceCacheKey: session.selection,
          selectionPreparationPending: true,
          previewEdit: floating?.previewEdit,
          translationPreview: floating?.translationPreview,
          deferredSelectionPreview:
            floatingLayers?.length || selectedTransformLayers.length > 1
              ? false
              : selectionTransformDeferredPreviewEnabled('shear-content', canUseDeferredSelectionPreview(editableLayer), transformAngle, transformShear),
          shearHandle: hit as SelectionShearHandle,
          copy: floatingSelectionCopyMode(floating?.copy ?? null, modifierActive(event.nativeEvent, 'copySelectionContent')),
          floatingPaste: Boolean(floating),
          previewSelection: selectionStart,
          appliedSelection: selectionStart,
          selectionPivotStart: selectionPivotForSession(session) ?? undefined,
          transformStartTarget: { ...transformTarget },
          startAngle: transformAngle,
          transformStartShear: transformShear ? { ...transformShear } : undefined,
          previewTarget: { ...transformTarget },
          previewAngle: transformAngle,
          previewShear: transformShear ? { ...transformShear } : undefined,
          ...freeTileFloatingDragFields(floating)
        }
        event.currentTarget.style.cursor = shearCursorForTransform(hit as SelectionShearHandle, transformTarget, transformAngle, transformShear)
        return true
      }
      if (hit in rotationCursors && session.selection && currentSelection) {
        let floating = session.pendingPaste
        if (floating && !selectionBoundsEqual(currentSelection, floating.target)) {
          state.commitFloatingPaste()
          floating = null
        }
        const selectionStart = cloneSelection(currentSelection)!
        const transformTarget = floating?.transformTarget ?? {
          x: selectionStart.x,
          y: selectionStart.y,
          width: selectionStart.width,
          height: selectionStart.height
        }
        const transformAngle = floating?.transformAngle ?? 0
        const transformShear = floating?.transformShear
        const floatingLayers = cloneSelectionLayerStates(floating?.layers)
        inputRef.current.drag = {
          kind: 'rotate-content',
          start: point,
          last: point,
          selectionStart,
          selectionSource: floating?.source,
          selectionLayers: floatingLayers,
          selectionSourceCacheKey: session.selection,
          selectionPreparationPending: true,
          previewEdit: floating?.previewEdit,
          translationPreview: floating?.translationPreview,
          deferredSelectionPreview:
            floatingLayers?.length || selectedTransformLayers.length > 1
              ? false
              : selectionTransformDeferredPreviewEnabled('rotate-content', canUseDeferredSelectionPreview(editableLayer), transformAngle, transformShear),
          angle: transformAngle,
          startAngle: transformAngle,
          copy: floatingSelectionCopyMode(floating?.copy ?? null, modifierActive(event.nativeEvent, 'copySelectionContent')),
          floatingPaste: Boolean(floating),
          previewSelection: selectionStart,
          appliedSelection: selectionStart,
          selectionPivotStart: selectionPivotForSession(session) ?? undefined,
          transformStartTarget: { ...transformTarget },
          transformStartShear: transformShear ? { ...transformShear } : undefined,
          previewTarget: { ...transformTarget },
          previewAngle: transformAngle,
          previewShear: transformShear ? { ...transformShear } : undefined,
          ...freeTileFloatingDragFields(floating)
        }
        event.currentTarget.style.cursor = rotationCursorForHit(hit as SelectionRotationHandle)
        return true
      }
      if (hit in resizeCursors && session.selection && currentSelection) {
        let floating = session.pendingPaste
        if (floating && !selectionBoundsEqual(currentSelection, floating.target)) {
          state.commitFloatingPaste()
          floating = null
        }
        const selectionStart = cloneSelection(currentSelection)
        const modifiers = selectionTransformModifierState(event.nativeEvent)
        const selectionPivotStart = selectionPivotForSession(currentSelectionSession) ?? undefined
        const freeTransform = currentSelectionSession.freeTransformActive === true
        const transformQuad = freeTransform ? freeTransformQuadForSession(currentSelectionSession) : null
        const transformTarget = transformQuad
          ? selectionQuadBounds(transformQuad)
          : (floating?.transformTarget ?? { x: selectionStart!.x, y: selectionStart!.y, width: selectionStart!.width, height: selectionStart!.height })
        const transformAngle = floating?.transformAngle ?? 0
        const transformShear = floating?.transformShear
        const floatingLayers = cloneSelectionLayerStates(floating?.layers)
        inputRef.current.drag = {
          kind: 'transform-content',
          start: point,
          last: point,
          selectionStart,
          selectionSource: floating?.source,
          selectionLayers: floatingLayers,
          selectionSourceCacheKey: session.selection,
          selectionPreparationPending: true,
          previewEdit: floating?.previewEdit,
          translationPreview: floating?.translationPreview,
          deferredSelectionPreview: freeTransform
            ? false
            : floatingLayers?.length || selectedTransformLayers.length > 1
              ? false
              : selectionTransformDeferredPreviewEnabled('transform-content', canUseDeferredSelectionPreview(editableLayer), transformAngle, transformShear),
          handle: hit as SelectionHandle,
          copy: floatingSelectionCopyMode(floating?.copy ?? null, modifiers.copy),
          floatingPaste: Boolean(floating),
          previewSelection: selectionStart,
          appliedSelection: selectionStart,
          selectionPivotStart,
          previewPivot: selectionPivotStart ? { ...selectionPivotStart } : undefined,
          selectionPivotCustom: Boolean(currentSelectionSession.selectionPivot),
          transformStartTarget: { ...transformTarget },
          startAngle: freeTransform ? 0 : transformAngle,
          transformStartShear: freeTransform ? undefined : transformShear ? { ...transformShear } : undefined,
          previewTarget: { ...transformTarget },
          previewAngle: freeTransform ? 0 : transformAngle,
          previewShear: freeTransform ? undefined : transformShear ? { ...transformShear } : undefined,
          freeTransform,
          transformStartQuad: cloneSelectionQuad(transformQuad) ?? undefined,
          previewQuad: cloneSelectionQuad(transformQuad) ?? undefined,
          ...freeTileFloatingDragFields(floating)
        }
        event.currentTarget.style.cursor = resizeCursorForHit(hit as SelectionHandle)
        return true
      }
      if (session.pendingPaste) state.commitFloatingPaste()
      if (session.selectionKind === 'magic') {
        if (
          freeTileSelectionBounds &&
          !selectionContains(
            rectSelection(freeTileSelectionBounds.x, freeTileSelectionBounds.y, freeTileSelectionBounds.width, freeTileSelectionBounds.height),
            point.x,
            point.y
          )
        )
          return true
        const before = currentSelection
        const initialSelection = session.selection
        const contentRevision = session.contentRevision
        const initialPalette = session.document.palette
        const initialTool = session.tool
        const sourceKey = `${session.document.id}:${session.document.animation?.activeFrameId ?? 'static'}:${editableLayer.id}`
        const tilemap = editableLayer.kind === 'tilemap' && session.tilemapMode === 'paint' ? activeTilemapCelTarget(session.document) : null
        const operation: MagicWandOperation = {
          before: mode === 'replace' ? null : before,
          mode,
          axes: session.symmetryAxes,
          center: symmetryCenter,
          connectivity: session.fillConnectivity,
          previewColor:
            selectionPreviewColorMode === 'custom'
              ? `rgb(${selectionPreviewColor.r} ${selectionPreviewColor.g} ${selectionPreviewColor.b} / ${selectionPreviewColor.a / 255})`
              : undefined,
          ...(tilemap ? { tilemap: { grid: { ...tilemap.tilemap, cells: [] }, offsetX: tilemap.surface.offsetX, offsetY: tilemap.surface.offsetY } } : {}),
          ...(freeTileSelectionTarget && freeTileSelectionBounds
            ? {
                freeTile: {
                  source: freeTileSelectionTarget.source,
                  bounds: freeTileSelectionBounds,
                  instance: freeTileSelectionTarget.instance,
                  document: {
                    width: session.document.width,
                    height: session.document.height,
                    colorMode: session.document.colorMode,
                    palette: session.document.palette
                  }
                }
              }
            : {})
        }
        const drag: DragState = {
          kind: 'magic-preview',
          start: { ...point },
          last: { ...point },
          selectionStart: before,
          selectionMode: mode,
          previewSelection: null
        }
        inputRef.current.drag = drag
        const valid = () => {
          const state = useWorkspace.getState()
          const current = state.sessions.find((item) => item.document.id === session.document.id)
          return (
            state.activeId === session.document.id &&
            current &&
            current.selection === initialSelection &&
            current.contentRevision === contentRevision &&
            current.tool === initialTool &&
            current.selectionKind === 'magic' &&
            current.document.palette === initialPalette &&
            `${current.document.id}:${current.document.animation?.activeFrameId ?? 'static'}:${activePaintLayer(current).id}` === sourceKey
          )
        }
        let unsubscribe = () => {}
        const clearPreview = () => {
          drag.magicPreviewBitmap?.close()
          drag.magicPreviewBitmap = null
          drag.magicPreviewRectangles = null
        }
        const cleanup = () => {
          unsubscribe()
          if (magicGestureRef.current?.drag === drag) magicGestureRef.current = null
          clearPreview()
        }
        const accept = (result: MagicWandWorkerResult) => {
          clearPreview()
          drag.previewSelection = result.selection
          drag.magicPreviewRectangles = result.previewRectangles
          drag.magicPreviewBitmap = result.previewBitmap
          if (result.selection && result.boundarySegments) prepareSelectionBoundary(result.selection, result.boundarySegments)
        }
        const gesture = new MagicWandGesture<MagicWandWorkerResult>(
          (result) => {
            accept(result)
            scheduleDraw()
          },
          (result) => {
            accept(result)
            cleanup()
            const startedAt = performance.now()
            useWorkspace.getState().commitSelectionChange(before, result.selection, t('canvas.history.magicSelection'))
            window.__moonSpriteCanvasProbe?.recordOperationStage?.('magic-wand.commit-selection', performance.now() - startedAt)
            drawSelectionOverlay()
            scheduleDraw()
          },
          (result) => result.previewBitmap?.close()
        )
        const cancel = (redraw = true) => {
          gesture.cancel()
          if (magicGestureRef.current?.drag !== drag) {
            cleanup()
            return
          }
          if (inputRef.current.drag === drag) inputRef.current.finish()
          cleanup()
          magicWandWorkerRef.current?.dispose()
          if (redraw) scheduleDraw()
        }
        magicGestureRef.current = { cancel, drag }
        unsubscribe = useWorkspace.subscribe(() => {
          if (!valid()) cancel()
        })
        drag.magicRelease = () => gesture.release()
        drag.magicRequest = (requestPoint) => {
          drag.last = { ...requestPoint }
          const receive = gesture.request()
          drag.magicWorkerPending = true
          if (session.fillReference === 'visible-layers' && !freeTileSelectionTarget) {
            const startedAt = performance.now()
            const incoming = magicWandSelection(
              session.document,
              editableLayer,
              requestPoint.x,
              requestPoint.y,
              session.wandTolerance,
              session.wandContiguous,
              session.wandContiguous && session.wandGapClosing ? session.wandGapThreshold : 0,
              {
                sourceColorAt: createCompositePointSampler(session.document),
                connectivity: session.fillConnectivity
              }
            )
            const applyOperation = prepareMagicWandOperation(operation)
            const selection = applyOperation(
              incoming,
              session.document.width,
              session.document.height,
              requestPoint.x,
              requestPoint.y,
              session.wandTolerance,
              session.wandContiguous,
              session.wandContiguous && session.wandGapClosing ? session.wandGapThreshold : 0
            )
            drag.magicWorkerPending = false
            receive({ selection, boundarySegments: null, previewRectangles: null, computeMs: performance.now() - startedAt, boundaryMs: 0 })
            return
          }
          magicWandWorkerRef.current ??= new MagicWandWorkerClient()
          const startedAt = performance.now()
          void magicWandWorkerRef.current
            .request(
              editableLayer,
              session.document.width,
              session.document.height,
              requestPoint.x,
              requestPoint.y,
              session.wandTolerance,
              contentRevision,
              initialPalette,
              sourceKey,
              session.wandContiguous,
              session.wandGapClosing ? session.wandGapThreshold : 0,
              operation,
              session.fillConnectivity
            )
            .then((result) => {
              if (!result) return
              window.__moonSpriteCanvasProbe?.recordOperationStage?.('magic-wand.worker-roundtrip', performance.now() - startedAt, {
                computeMs: result.computeMs,
                boundaryMs: result.boundaryMs
              })
              window.__moonSpriteCanvasProbe?.recordOperationStage?.('magic-wand.worker-compute', result.computeMs)
              if (!valid()) {
                result.previewBitmap?.close()
                cancel()
                return
              }
              drag.magicWorkerPending = false
              receive(result)
            })
            .catch((error: unknown) => {
              cancel()
              useWorkspace.setState({ message: `Magic wand: ${error instanceof Error ? error.message : String(error)}` })
            })
        }
        drag.magicRequest(point)
        event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair, selectionInteractionEditable, true)
        drawSelectionOverlay()
        scheduleDraw()
        return true
      }
      if (session.selectionKind === 'lasso') {
        inputRef.current.drag = {
          kind: 'lasso',
          start: point,
          last: point,
          selectionStart: cloneSelection(currentSelection),
          selectionMode: mode,
          previewSelection: cloneSelection(currentSelection),
          path: [point]
        }
        event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair, selectionInteractionEditable, true)
        return true
      }
      if (session.selectionKind === 'polygon-lasso') {
        inputRef.current.drag = {
          kind: 'polygon-lasso',
          start: point,
          last: point,
          selectionStart: cloneSelection(currentSelection),
          selectionMode: mode,
          previewSelection: cloneSelection(currentSelection),
          path: [point]
        }
        event.currentTarget.style.cursor = selectionCreationCursor(selectionCrosshair, selectionInteractionEditable, true)
        return true
      }
    }
    return false
  }
  return { beginSelection }
}
