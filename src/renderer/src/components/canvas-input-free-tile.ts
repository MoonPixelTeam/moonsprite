import type { FreeTileInstance } from '@shared/types-tiles'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { createId } from '@/core/document-model'
import { beginPixelEdit } from '@/core/history'
import { paintBrush } from '@/core/tools-brush'
import { type BrushGradientSample } from '@/core/tools-pixel-edit'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { rasterLinePoints, selectionContains, shiftSelection } from '@/core/selection'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { beginBrushSpeedTracking } from '@/core/canvas-input-pointer'
import { constrainedTranslation, selectionMovePointerDelta } from '@/core/canvas-input-resize'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input-contracts'
import { canvasCursors } from '@/core/canvas-visuals'
import { symmetrySelectionDragDelta } from '@/core/symmetry'
import { shouldUseFreeTileInstanceMove } from '@/components/canvas-move-selection'
import { freeTileInstanceAtPoint, freeTileInstanceBounds, freeTileSourceForInstance, freeTileSourceStampOrigin } from '@/core/free-tile'
import { activeFreeTileCelTarget, freeTileInstanceAtDocumentPoint, freeTileSourceForId } from '@/core/free-tile-document'
import { freeTileSourceSnapshotFromEditRaster, type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import { publishFreeTileInstanceFlash } from '@/components/free-tile-instance-events'
import { LineAnchorHistory, brushAngleWithDynamics } from './canvas-stage-helpers'

interface Ports {
  inputRef: import('react').RefObject<CanvasInputState>
  scheduleDraw: () => void
  isoGridSnapActive: boolean
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
  snapToIsoGrid: (point: Point) => Point
  optimizedRotationEnabled: boolean
  compositeCacheRef: import('react').RefObject<import('@/components/canvas-composite-cache').CanvasCompositeCache>
  isoLineAlignmentActive: boolean
  modifierActive: (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, id: import('@/core/shortcuts').ShortcutId) => boolean
  unionFreeTileDirtyRect: (current: SelectionRect | null, incoming: SelectionRect) => SelectionRect
  localPointAt: (clientX: number, clientY: number, allowOutsideCopies?: boolean) => Point | null
  symmetryCenter: import('@/core/symmetry').SymmetryCenter
  alignedDragTranslation: (drag: DragState, distance: Point) => Point
  t: (key: import('@/locales/contracts').TranslationKey, params?: import('@/locales/contracts').TranslationParams) => string
  endSelectionAdjustmentEdit: () => void
  draw: () => void
  freeTileSourceEditForDrag: (drag: DragState) => FreeTileSourceEditRaster | null
  commitFreeTileSourceDrag: (drag: DragState, label: string) => boolean
  lineAnchorHistoryRef: import('react').RefObject<LineAnchorHistory | null>
}

export function createFreeTileCanvasInput(ports: Ports) {
  function beginInstanceMove({
    freeTransformActive,
    session,
    temporaryMove,
    event,
    movableActiveLayer,
    point,
    canMoveActiveLayer,
    state
  }: {
    freeTransformActive: boolean
    session: DocumentSession
    temporaryMove: boolean
    event: React.PointerEvent<HTMLCanvasElement>
    movableActiveLayer: RasterLayer
    point: Point
    canMoveActiveLayer: boolean
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { inputRef } = ports
    if (
      !freeTransformActive &&
      (session.tool === 'move' || temporaryMove) &&
      event.button === 0 &&
      movableActiveLayer.kind === 'free-tile' &&
      shouldUseFreeTileInstanceMove(movableActiveLayer.id, session.freeTileInstanceLayerId)
    ) {
      const target = activeFreeTileCelTarget(session.document)
      const selectedInstance =
        target?.freeTiles.instances.find((instance) => instance.id === session.selectedFreeTileInstanceId && instance.visible !== false) ?? null
      const selectedBounds =
        target && selectedInstance ? freeTileInstanceBounds(selectedInstance, target.sources, target.surface.offsetX, target.surface.offsetY) : null
      const selectedHit =
        selectedInstance &&
        selectedBounds &&
        point.x >= selectedBounds.x &&
        point.y >= selectedBounds.y &&
        point.x < selectedBounds.x + selectedBounds.width &&
        point.y < selectedBounds.y + selectedBounds.height
          ? selectedInstance
          : null
      const instance = selectedHit ?? (target ? freeTileInstanceAtDocumentPoint(target, point.x, point.y) : null)
      const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
      const sourceLayer = source ? target?.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
      if (target && instance && instance.locked !== true && source && sourceLayer?.locked !== true && canMoveActiveLayer) {
        const selectedIds =
          session.selectedFreeTileInstanceIds.length > 0 && session.selectedFreeTileInstanceIds.includes(instance.id)
            ? session.selectedFreeTileInstanceIds
            : [instance.id]
        const movingInstances = selectedIds.flatMap(
          (id) => target.freeTiles.instances.find((candidate) => candidate.id === id && candidate.visible !== false && candidate.locked !== true) ?? []
        )
        const starts = Object.fromEntries(movingInstances.map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }]))
        if (!session.selectedFreeTileInstanceIds.includes(instance.id)) state.setSelectedFreeTileInstance(instance.id)
        publishFreeTileInstanceFlash({ documentId: session.document.id, instanceId: instance.id })
        const placementEdit = state.beginFreeTilePlacement()
        if (!placementEdit) return true
        inputRef.current.drag = {
          kind: 'free-tile-instance-move',
          start: point,
          last: point,
          freeTilePlacementEdit: placementEdit,
          freeTileSourceId: source.id,
          freeTileInstanceId: instance.id,
          freeTileInstanceStart: { x: instance.x, y: instance.y },
          freeTileInstanceIds: movingInstances.map((candidate) => candidate.id),
          freeTileInstanceStarts: starts,
          startedAt: Date.now()
        }
        event.currentTarget.style.cursor = canvasCursors.move
        return true
      }
    }
    return false
  }

  function beginFreeTile({
    freeTileTarget,
    session,
    point,
    state,
    prepareFreeTileSourceEdit,
    event,
    brushPatternOrigin,
    brushDynamicsAtEvent,
    activeColor,
    brushGradientAt,
    activeBrushTexture,
    activeBrushImage,
    proceduralAntialiasStrength,
    activeBrushPaintMode,
    activeBrushDither
  }: {
    freeTileTarget: ReturnType<typeof import('@/core/free-tile-document').activeFreeTileCelTarget>
    session: DocumentSession
    point: Point
    state: ReturnType<typeof useWorkspace.getState>
    prepareFreeTileSourceEdit: () => {
      source: NonNullable<ReturnType<typeof freeTileSourceForId>>
      instance: FreeTileInstance
      placementEdit: ReturnType<() => import('@/core/free-tile-document').FreeTilePlacementEdit | null>
      sourceEdit: FreeTileSourceEditRaster
      selection: SelectionMask | null
      sourceRegion: SelectionRect
    } | null
    event: React.PointerEvent<HTMLCanvasElement>
    brushPatternOrigin: (point: Point, size?: number, imageBrush?: import('@shared/types-brush').ImageBrush | null) => Point
    brushDynamicsAtEvent: (
      pointerEvent: Pick<React.PointerEvent<HTMLCanvasElement>, 'pointerId' | 'pointerType' | 'pressure' | 'buttons'>,
      speed?: number
    ) => {
      size: number
      opacityScale: number
      gradientAmount: number | null
      angle: number
    }
    activeColor: (button?: number) => RgbaColor
    brushGradientAt: (buttonColor: RgbaColor, gradientAmount: number | null) => BrushGradientSample | undefined
    activeBrushTexture: import('@shared/types-brush').BrushTexture
    activeBrushImage: import('@shared/types-brush').ImageBrush | null
    proceduralAntialiasStrength: number
    activeBrushPaintMode: import('@shared/types-brush').BrushPaintMode
    activeBrushDither: import('@shared/types-brush').BrushDitherSettings | undefined
  }): boolean {
    const {
      inputRef,
      scheduleDraw,
      isoGridSnapActive,
      repeatedDocumentPointsAt,
      snapToIsoGrid,
      optimizedRotationEnabled,
      compositeCacheRef,
      isoLineAlignmentActive
    } = ports
    if (freeTileTarget) {
      const selectedSource = freeTileSourceForId(session.document, freeTileTarget.layer, session.selectedTilesetId) ?? freeTileTarget.sources[0] ?? null
      if (session.freeTileMode === 'paint') {
        if (session.selection && !selectionContains(session.selection, point.x, point.y)) return true
        const placementEdit = state.beginFreeTilePlacement()
        if (!placementEdit) return true
        if (session.tool === 'eraser') {
          const instance = freeTileInstanceAtDocumentPoint(freeTileTarget, point.x, point.y)
          if (!instance || instance.locked === true) return true
          placementEdit.after.instances = placementEdit.after.instances.filter((candidate) => candidate.id !== instance.id)
          if (session.selectedFreeTileInstanceId === instance.id) state.setSelectedFreeTileInstance(null)
          placementEdit.dirtyRect = freeTileInstanceBounds(instance, freeTileTarget.sources, freeTileTarget.surface.offsetX, freeTileTarget.surface.offsetY)
          state.previewFreeTilePlacement(placementEdit)
          inputRef.current.drag = {
            kind: 'free-tile-draw',
            start: point,
            last: point,
            freeTilePlacementEdit: placementEdit,
            freeTileInstanceId: instance.id,
            startedAt: Date.now()
          }
          scheduleDraw()
          return true
        }
        if (!selectedSource) return true
        const tileId = selectedSource.tileset.tileIds[0]
        if (!tileId) return true
        const origin = freeTileSourceStampOrigin(point.x, point.y, selectedSource, freeTileTarget.surface.offsetX, freeTileTarget.surface.offsetY)
        const instance: FreeTileInstance = {
          id: createId('free-tile-instance'),
          sourceId: selectedSource.id,
          x: origin.x,
          y: origin.y,
          opacity: selectedSource.opacity,
          blendMode: selectedSource.blendMode
        }
        placementEdit.after.instances.push(instance)
        placementEdit.dirtyRect = freeTileInstanceBounds(instance, freeTileTarget.sources, freeTileTarget.surface.offsetX, freeTileTarget.surface.offsetY)
        state.previewFreeTilePlacement(placementEdit)
        state.setSelectedFreeTileInstance(instance.id)
        inputRef.current.drag = {
          kind: 'free-tile-draw',
          start: point,
          last: point,
          freeTilePlacementEdit: placementEdit,
          freeTileSourceId: selectedSource.id,
          freeTileInstanceId: instance.id,
          freeTileLastStampOrigin: origin,
          startedAt: Date.now()
        }
        scheduleDraw()
        return true
      }
      const prepared = prepareFreeTileSourceEdit()
      if (!prepared) return true
      const { source, instance, placementEdit, sourceEdit, selection } = prepared
      const isoPointerStart = isoGridSnapActive ? (repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.local ?? point) : point
      const strokePoint = isoGridSnapActive ? snapToIsoGrid(isoPointerStart) : point
      const local = { x: strokePoint.x - sourceEdit.origin.x, y: strokePoint.y - sourceEdit.origin.y }
      const edit = beginPixelEdit(sourceEdit.layer.id)
      const patternOrigin = brushPatternOrigin(local)
      const colorReplacement =
        session.tool === 'eraser' && event.button === 2 ? { source: { ...session.primaryColor }, target: { ...session.secondaryColor } } : undefined
      const dynamics = brushDynamicsAtEvent(event)
      const strokeColor = activeColor(event.button)
      const gradient = colorReplacement ? undefined : brushGradientAt(strokeColor, dynamics.gradientAmount)
      if (!isoGridSnapActive)
        paintBrush(
          sourceEdit.document,
          sourceEdit.layer,
          edit,
          local.x,
          local.y,
          dynamics.size,
          strokeColor,
          session.brushShape,
          selection,
          activeBrushTexture,
          session.brushTextureScale,
          activeBrushImage,
          session.brushImageSettings,
          proceduralAntialiasStrength,
          activeBrushPaintMode,
          patternOrigin,
          undefined,
          undefined,
          colorReplacement,
          dynamics.opacityScale,
          undefined,
          false,
          gradient,
          'off',
          activeBrushDither,
          brushAngleWithDynamics(session, dynamics.angle),
          optimizedRotationEnabled,
          session.tool === 'eraser' ? 'simple' : session.inkMode
        )
      const after = freeTileSourceSnapshotFromEditRaster(sourceEdit)
      const tileId = source.tileset.tileIds[0]
      if (tileId) state.setSelectedFreeTileInstance(instance.id, undefined, event.button === 2 ? 'secondary' : 'primary')
      else state.setSelectedFreeTileInstance(instance.id)
      state.previewFreeTileSource(source.id, after.width, after.height, after.pixels, after.offsetX, after.offsetY)
      compositeCacheRef.current.invalidateAll()
      inputRef.current.drag = {
        kind: 'free-tile-edit',
        start: strokePoint,
        last: strokePoint,
        edit,
        path: isoGridSnapActive
          ? []
          : [
              {
                ...strokePoint,
                size: dynamics.size,
                opacityScale: dynamics.opacityScale,
                angle: brushAngleWithDynamics(session, dynamics.angle),
                color: strokeColor,
                gradient
              }
            ],
        isoAlignedStroke: isoLineAlignmentActive ? (session.tool === 'eraser' ? 'eraser' : 'pencil') : undefined,
        isoAlignedRawAnchor: isoLineAlignmentActive && !isoGridSnapActive ? isoPointerStart : undefined,
        isoAlignedRawEndpoint: isoLineAlignmentActive && !isoGridSnapActive ? isoPointerStart : undefined,
        isoAlignedDirectionSamples: isoLineAlignmentActive ? 0 : undefined,
        isoGridStrokeEdges: isoGridSnapActive ? [] : undefined,
        isoGridPointer: isoGridSnapActive ? isoPointerStart : undefined,
        isoGridHoveredEdgeKey: isoGridSnapActive ? null : undefined,
        color: strokeColor,
        colorReplacement,
        patternOrigin,
        lastBrushSize: dynamics.size,
        lastOpacityScale: dynamics.opacityScale,
        lastBrushColor: strokeColor,
        lastBrushGradientActive: Boolean(gradient),
        brushSpeed: beginBrushSpeedTracking({ clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp }),
        freeTilePlacementEdit: placementEdit ?? undefined,
        freeTileSourceId: source.id,
        freeTileInstanceId: instance.id,
        freeTileEditDocument: sourceEdit.document,
        freeTileEditLayer: sourceEdit.layer,
        freeTileSourceBefore: sourceEdit.before,
        freeTileEditOrigin: sourceEdit.origin,
        freeTileEditSourceOffset: sourceEdit.sourceOffset,
        freeTileEditInstanceTransform: sourceEdit.instanceTransform,
        freeTileEditTransformedSourceBounds: sourceEdit.transformedSourceBounds,
        freeTileEditSelection: selection,
        freeTileLastLocal: local,
        startedAt: Date.now()
      }
      scheduleDraw()
      return true
    }
    return false
  }

  function moveInstance({
    drag,
    session,
    point,
    event,
    state
  }: {
    drag: DragState
    session: DocumentSession
    point: Point
    event: React.PointerEvent<HTMLCanvasElement>
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { modifierActive, unionFreeTileDirtyRect, compositeCacheRef, scheduleDraw } = ports
    if (drag.kind === 'free-tile-instance-move' && drag.freeTilePlacementEdit && drag.freeTileInstanceId) {
      const target = activeFreeTileCelTarget(session.document)
      if (!target || target.layer.id !== drag.freeTilePlacementEdit.layerId || target.cel.frameId !== drag.freeTilePlacementEdit.frameId) return true
      const instanceIds = drag.freeTileInstanceIds?.length ? drag.freeTileInstanceIds : [drag.freeTileInstanceId]
      const instances = instanceIds.flatMap((id) => {
        const instance = drag.freeTilePlacementEdit!.after.instances.find((candidate) => candidate.id === id)
        if (!instance) return []
        const start = drag.freeTileInstanceStarts?.[id] ?? (id === drag.freeTileInstanceId ? drag.freeTileInstanceStart : undefined)
        return start ? [{ instance, start }] : []
      })
      if (instances.length === 0) return true
      const distance = constrainedTranslation(drag, point.x - drag.start.x, point.y - drag.start.y, modifierActive(event.nativeEvent, 'constrainAxis'))
      let dirtyRect = drag.freeTilePlacementEdit.dirtyRect
      let changed = false
      for (const { instance, start } of instances) {
        const nextX = start.x + distance.x
        const nextY = start.y + distance.y
        if (instance.x === nextX && instance.y === nextY) continue
        const previousBounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        instance.x = nextX
        instance.y = nextY
        dirtyRect = unionFreeTileDirtyRect(dirtyRect, previousBounds)
        dirtyRect = unionFreeTileDirtyRect(dirtyRect, freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY))
        changed = true
      }
      if (!changed) return true
      drag.freeTilePlacementEdit.dirtyRect = dirtyRect
      state.previewFreeTilePlacement(drag.freeTilePlacementEdit)
      compositeCacheRef.current.invalidateAll()
      event.currentTarget.style.cursor = canvasCursors.move
      scheduleDraw()
      return true
    }
    return false
  }

  function moveFreeTileDraw({
    drag,
    session,
    previousPoint,
    pointerSamples,
    state
  }: {
    drag: DragState
    session: DocumentSession
    previousPoint: Point
    pointerSamples: {
      clientX: number
      clientY: number
      timeStamp?: number
      pointerType: string
      pressure: number | undefined
      pressureAvailable: boolean
      previousPressure: number | undefined
    }[]
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { scheduleDraw, localPointAt, unionFreeTileDirtyRect, compositeCacheRef } = ports
    if (drag.kind === 'free-tile-draw' && drag.freeTilePlacementEdit) {
      // Placement is a click action; only the eraser keeps a continuous drag gesture.
      if (session.tool !== 'eraser') {
        scheduleDraw()
        return true
      }
      const target = activeFreeTileCelTarget(session.document)
      if (!target || target.layer.id !== drag.freeTilePlacementEdit.layerId || target.cel.frameId !== drag.freeTilePlacementEdit.frameId) return true
      let previous = drag.freeTileLastLocal ?? previousPoint
      let changed = false
      for (const sample of pointerSamples) {
        const samplePoint = localPointAt(sample.clientX, sample.clientY, true)
        if (!samplePoint) continue
        const points = rasterLinePoints(previous, samplePoint)
        for (let index = 1; index < points.length; index += 1) {
          const drawPoint = points[index]
          if (session.selection && !selectionContains(session.selection, drawPoint.x, drawPoint.y)) continue
          if (session.tool === 'eraser') {
            const instance = freeTileInstanceAtPoint(
              drag.freeTilePlacementEdit.after,
              target.sources,
              drawPoint.x,
              drawPoint.y,
              target.surface.offsetX,
              target.surface.offsetY
            )
            if (!instance || instance.locked === true) continue
            drag.freeTilePlacementEdit.after.instances = drag.freeTilePlacementEdit.after.instances.filter((candidate) => candidate.id !== instance.id)
            if (session.selectedFreeTileInstanceId === instance.id) state.setSelectedFreeTileInstance(null)
            drag.freeTilePlacementEdit.dirtyRect = unionFreeTileDirtyRect(
              drag.freeTilePlacementEdit.dirtyRect,
              freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
            )
            changed = true
            continue
          }
          const source = freeTileSourceForId(session.document, target.layer, drag.freeTileSourceId)
          if (!source) continue
          const origin = freeTileSourceStampOrigin(drawPoint.x, drawPoint.y, source, target.surface.offsetX, target.surface.offsetY)
          if (drag.freeTileLastStampOrigin?.x === origin.x && drag.freeTileLastStampOrigin.y === origin.y) continue
          const instance: FreeTileInstance = {
            id: createId('free-tile-instance'),
            sourceId: source.id,
            x: origin.x,
            y: origin.y,
            opacity: source.opacity,
            blendMode: source.blendMode
          }
          drag.freeTilePlacementEdit.after.instances.push(instance)
          drag.freeTileInstanceId = instance.id
          drag.freeTilePlacementEdit.dirtyRect = unionFreeTileDirtyRect(
            drag.freeTilePlacementEdit.dirtyRect,
            freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
          )
          drag.freeTileLastStampOrigin = origin
          changed = true
        }
        previous = samplePoint
      }
      drag.freeTileLastLocal = previous
      if (changed) {
        state.previewFreeTilePlacement(drag.freeTilePlacementEdit)
        if (drag.freeTileInstanceId && session.tool !== 'eraser') state.setSelectedFreeTileInstance(drag.freeTileInstanceId)
        compositeCacheRef.current.invalidateAll()
      }
      scheduleDraw()
      return true
    }
    return false
  }

  function moveFreeTileSelection({
    drag,
    session,
    event,
    point,
    state
  }: {
    drag: DragState
    session: DocumentSession
    event: React.PointerEvent<HTMLCanvasElement>
    point: Point
    state: ReturnType<typeof useWorkspace.getState>
  }): boolean {
    const { repeatedDocumentPointsAt, symmetryCenter, alignedDragTranslation, modifierActive, unionFreeTileDirtyRect, compositeCacheRef, scheduleDraw } = ports
    if (drag.kind === 'move-content' && drag.freeTileInstanceSelectionMove && drag.freeTilePlacementEdit && drag.freeTileInstanceId && drag.selectionStart) {
      const target = activeFreeTileCelTarget(session.document)
      if (!target || target.layer.id !== drag.freeTilePlacementEdit.layerId || target.cel.frameId !== drag.freeTilePlacementEdit.frameId) return true
      const instanceIds = drag.freeTileInstanceIds?.length ? drag.freeTileInstanceIds : [drag.freeTileInstanceId]
      const instances = instanceIds.flatMap((id) => {
        const instance = drag.freeTilePlacementEdit!.after.instances.find((candidate) => candidate.id === id)
        if (!instance) return []
        const start = drag.freeTileInstanceStarts?.[id] ?? (id === drag.freeTileInstanceId ? drag.freeTileInstanceStart : undefined)
        return start ? [{ instance, start }] : []
      })
      if (instances.length === 0) return true
      const repeatedPoint = drag.tileRepeatStart ? repeatedDocumentPointsAt(event.clientX, event.clientY, true, true)?.repeated : undefined
      const pointerDelta = selectionMovePointerDelta(drag, point, repeatedPoint)
      const dragDelta = symmetrySelectionDragDelta(
        drag.selectionStart,
        drag.start,
        pointerDelta,
        session.document.width,
        session.document.height,
        session.symmetryAxes,
        symmetryCenter,
        true
      )
      const distance = alignedDragTranslation(drag, constrainedTranslation(drag, dragDelta.x, dragDelta.y, modifierActive(event.nativeEvent, 'constrainAxis')))
      const nextSelection = shiftSelection(drag.selectionStart, distance.x, distance.y, session.document.width, session.document.height)
      let dirtyRect = drag.freeTilePlacementEdit.dirtyRect
      let changed = false
      for (const { instance, start } of instances) {
        const nextX = start.x + distance.x
        const nextY = start.y + distance.y
        if (instance.x === nextX && instance.y === nextY) continue
        const previousBounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        instance.x = nextX
        instance.y = nextY
        dirtyRect = unionFreeTileDirtyRect(dirtyRect, previousBounds)
        dirtyRect = unionFreeTileDirtyRect(dirtyRect, freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY))
        changed = true
      }
      if (!changed) return true
      drag.freeTilePlacementEdit.dirtyRect = dirtyRect
      drag.last = point
      drag.previewTarget = {
        ...(drag.transformStartTarget ?? drag.selectionStart),
        x: drag.selectionStart.x + distance.x,
        y: drag.selectionStart.y + distance.y
      }
      drag.previewSelection = nextSelection
      drag.appliedSelection = nextSelection
      if (drag.selectionPivotStart) drag.previewPivot = { x: drag.selectionPivotStart.x + distance.x, y: drag.selectionPivotStart.y + distance.y }
      state.previewFreeTilePlacement(drag.freeTilePlacementEdit)
      compositeCacheRef.current.invalidateAll()
      event.currentTarget.style.cursor = canvasCursors.move
      scheduleDraw()
      return true
    }
    return false
  }

  function endFreeTileSelection({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { t, endSelectionAdjustmentEdit, compositeCacheRef, draw } = ports
    if (drag.kind === 'move-content' && drag.freeTileInstanceSelectionMove && drag.freeTilePlacementEdit && drag.selectionStart) {
      state.commitFreeTilePlacement(drag.freeTilePlacementEdit, t('workspace.history.moveSelectionContent'), {
        before: drag.selectionStart,
        after: drag.previewSelection ?? drag.selectionStart,
        beforePivot: drag.selectionPivotStart ? { ...drag.selectionPivotStart } : null,
        afterPivot: drag.previewPivot ? { ...drag.previewPivot } : null
      })
      if (drag.previewPivot) state.setSelectionPivot(drag.previewPivot)
      endSelectionAdjustmentEdit()
      compositeCacheRef.current.invalidateAll()
      draw()
      return true
    }
    return false
  }

  function endFreeTileTransform({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { freeTileSourceEditForDrag, t, endSelectionAdjustmentEdit, compositeCacheRef, draw } = ports
    if (
      (drag.kind === 'move-content' || drag.kind === 'transform-content' || drag.kind === 'rotate-content' || drag.kind === 'shear-content') &&
      drag.freeTileSelectionTransform &&
      drag.freeTileSourceId &&
      drag.selectionStart &&
      drag.previewSelection
    ) {
      const sourceEdit = freeTileSourceEditForDrag(drag)
      const label = drag.copy
        ? t('workspace.history.copySelectionContent')
        : drag.kind === 'rotate-content'
          ? t('workspace.history.rotateSelectionContent')
          : drag.kind === 'move-content'
            ? t('workspace.history.moveSelectionContent')
            : t('workspace.history.transformSelectionContent')
      if (drag.floatingPaste)
        state.updateFloatingPastePreview(
          drag.previewEdit ?? null,
          drag.previewSelection,
          drag.translationPreview,
          drag.previewTarget,
          drag.previewAngle,
          drag.previewShear,
          false,
          undefined,
          drag.previewQuad
        )
      else if (sourceEdit && drag.freeTileInstanceId && drag.freeTileSelectionSource && drag.selectionSource)
        state.beginFreeTileFloatingSelectionTransform({
          sourceId: drag.freeTileSourceId,
          instanceId: drag.freeTileInstanceId,
          edit: sourceEdit,
          selectionSource: drag.freeTileSelectionSource,
          source: drag.selectionSource,
          previewEdit: drag.previewEdit ?? null,
          before: drag.selectionStart,
          target: drag.previewSelection,
          copy: Boolean(drag.copy),
          label,
          translationPreview: drag.translationPreview,
          transformTarget: drag.previewTarget,
          transformAngle: drag.previewAngle,
          transformShear: drag.previewShear,
          transformQuad: drag.previewQuad
        })
      if (drag.previewPivot) state.setSelectionPivot(drag.selectionPivotCustom === false ? null : drag.previewPivot)
      endSelectionAdjustmentEdit()
      compositeCacheRef.current.invalidateAll()
      draw()
      return true
    }
    return false
  }

  function endInstanceMove({ drag, state }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { t, compositeCacheRef, draw } = ports
    if (drag.kind === 'free-tile-instance-move' && drag.freeTilePlacementEdit) {
      state.commitFreeTilePlacement(drag.freeTilePlacementEdit, t('canvas.history.moveFreeTileInstance'))
      compositeCacheRef.current.invalidateAll()
      draw()
      return true
    }
    return false
  }

  function endFreeTileDraw({ drag, state, session }: { drag: DragState; state: ReturnType<typeof useWorkspace.getState>; session: DocumentSession }): boolean {
    const { t, compositeCacheRef, draw } = ports
    if (drag.kind === 'free-tile-draw' && drag.freeTilePlacementEdit) {
      state.commitFreeTilePlacement(
        drag.freeTilePlacementEdit,
        t(session.tool === 'eraser' ? 'canvas.history.eraseFreeTiles' : 'canvas.history.placeFreeTiles')
      )
      compositeCacheRef.current.invalidateAll()
      draw()
      return true
    }
    return false
  }

  function endFreeTileEdit({ drag, session, state }: { drag: DragState; session: DocumentSession; state: ReturnType<typeof useWorkspace.getState> }): boolean {
    const { commitFreeTileSourceDrag, t, lineAnchorHistoryRef, compositeCacheRef, draw } = ports
    if (
      drag.kind === 'free-tile-edit' &&
      drag.freeTileSourceId &&
      drag.freeTileSourceBefore &&
      drag.freeTileEditDocument &&
      drag.freeTileEditLayer &&
      drag.freeTileEditOrigin &&
      drag.freeTileEditSourceOffset
    ) {
      commitFreeTileSourceDrag(drag, t('canvas.history.draw'))
      lineAnchorHistoryRef.current = null
      if (session.tool === 'eraser') state.setLastEraserPoint(drag.last)
      else state.setLastPencilPoint(drag.last)
      compositeCacheRef.current.invalidateAll()
      draw()
      return true
    }
    return false
  }
  return {
    beginInstanceMove,
    beginFreeTile,
    moveInstance,
    moveFreeTileDraw,
    moveFreeTileSelection,
    endFreeTileSelection,
    endFreeTileTransform,
    endInstanceMove,
    endFreeTileDraw,
    endFreeTileEdit
  }
}
