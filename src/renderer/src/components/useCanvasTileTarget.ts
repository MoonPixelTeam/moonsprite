import type { FreeTileInstance, TilemapCell } from '@shared/types-tiles'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { activePaintLayer } from '@/store/workspace-session'
import { cloneSelection, selectionContains } from '@/core/selection'
import { type CanvasDragState as DragState, type CanvasPoint as Point } from '@/core/canvas-input'
import { activeTilemapCelTarget } from '@/core/tilemap-document'
import {
  expandSelectionToTilemapCells,
  tilemapCellBounds,
  tilemapCellIndexAtPoint,
  tilemapEditableSelectionAtPoint,
  tilesetHasOnlyTransparentTile
} from '@/core/tilemap'
import { freeTileInstanceBounds, freeTileSourceForInstance, freeTileTileIdForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget, freeTileInstanceAtDocumentPoint } from '@/core/free-tile-document'
import { freeTileSourceSnapshotFromEditRaster, type FreeTileSourceEditRaster } from '@/core/free-tile-edit'
interface Ports {
  readonly session: DocumentSession
}

export function useCanvasTileTarget(ports: Ports) {
  const selectedFreeTileSelectionTarget = (current: DocumentSession = ports.session) => {
    const layer = activePaintLayer(current)
    if (layer.kind !== 'free-tile' || !current.selectedFreeTileInstanceId) return null
    const target = activeFreeTileCelTarget(current.document)
    if (!target || target.layer.id !== layer.id) return null
    const instance = target.freeTiles.instances.find((candidate) => candidate.id === current.selectedFreeTileInstanceId) ?? null
    const source = instance ? freeTileSourceForInstance(target.sources, instance) : null
    const sourceLayer = source ? target.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
    if (
      !instance ||
      !source ||
      !sourceLayer ||
      instance.visible === false ||
      instance.locked === true ||
      source.visible === false ||
      sourceLayer.locked === true
    )
      return null
    return {
      target,
      instance,
      source,
      bounds: freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
    }
  }

  const selectedFreeTileInstances = (current: DocumentSession = ports.session) => {
    const layer = activePaintLayer(current)
    if (layer.kind !== 'free-tile') return null
    const target = activeFreeTileCelTarget(current.document)
    if (!target || target.layer.id !== layer.id) return null
    const ids =
      current.selectedFreeTileInstanceIds.length > 0
        ? current.selectedFreeTileInstanceIds
        : current.selectedFreeTileInstanceId
          ? [current.selectedFreeTileInstanceId]
          : []
    const instances = ids.flatMap((id) => target.freeTiles.instances.find((candidate) => candidate.id === id) ?? [])
    return instances.length > 0 ? { target, layer, instances } : null
  }

  const selectedFreeTileInstancesBounds = (current: DocumentSession = ports.session): SelectionRect | null => {
    const selected = selectedFreeTileInstances(current)
    if (!selected) return null
    const bounds = selected.instances.map((instance) =>
      freeTileInstanceBounds(instance, selected.target.sources, selected.target.surface.offsetX, selected.target.surface.offsetY)
    )
    const left = Math.min(...bounds.map((bound) => bound.x))
    const top = Math.min(...bounds.map((bound) => bound.y))
    const right = Math.max(...bounds.map((bound) => bound.x + bound.width))
    const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height))
    return { x: left, y: top, width: right - left, height: bottom - top }
  }

  const tilemapPaintSelectionForIncoming = (incoming: SelectionMask | null, current: DocumentSession = ports.session): SelectionMask | null => {
    if (!incoming || current.tilemapMode !== 'paint' || activePaintLayer(current).kind !== 'tilemap') return incoming
    const target = activeTilemapCelTarget(current.document)
    return target
      ? expandSelectionToTilemapCells(incoming, target.tilemap, target.surface.offsetX, target.surface.offsetY, {
          x: 0,
          y: 0,
          width: current.document.width,
          height: current.document.height
        })
      : incoming
  }

  const tilemapEditCellIndexAtPoint = (point: Point, current: DocumentSession = ports.session): number | null | undefined => {
    if (current.tilemapMode !== 'edit' || activePaintLayer(current).kind !== 'tilemap') return undefined
    const target = activeTilemapCelTarget(current.document)
    const index = target ? tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, point.x, point.y) : null
    return target && index !== null && target.tilemap.cells[index] ? index : null
  }

  const tilemapEditClipForCell = (cellIndex: number | undefined, current: DocumentSession = ports.session): SelectionRect | undefined => {
    if (cellIndex === undefined) return undefined
    const target = activeTilemapCelTarget(current.document)
    if (!target?.tilemap.cells[cellIndex]) return undefined
    return tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, cellIndex)
  }

  const tilemapEditCreatesFirstTile = (current: DocumentSession = ports.session): boolean => {
    if (current.tilemapMode !== 'edit' || activePaintLayer(current).kind !== 'tilemap') return false
    const target = activeTilemapCelTarget(current.document)
    const tileset = target?.layer.tilemapTilesetId ? current.document.tilesets?.find((candidate) => candidate.id === target.layer.tilemapTilesetId) : null
    return Boolean(tileset && tilesetHasOnlyTransparentTile(tileset))
  }

  const tilemapEditSelectionAtPoint = (point: Point, current: DocumentSession = ports.session, armOutsideTiles = false): SelectionMask | null | undefined => {
    if (current.tilemapMode !== 'edit' || activePaintLayer(current).kind !== 'tilemap') return undefined
    const target = activeTilemapCelTarget(current.document)
    return target
      ? tilemapEditableSelectionAtPoint(
          target.tilemap,
          target.surface.offsetX,
          target.surface.offsetY,
          point,
          { x: 0, y: 0, width: current.document.width, height: current.document.height },
          current.selection,
          armOutsideTiles,
          tilemapEditCreatesFirstTile(current)
        )
      : null
  }

  const paintSelectionForDrag = (drag: DragState): SelectionMask | null => drag.tilemapEditSelection ?? ports.session.selection

  const tilemapCellAllowedBySelection = (
    target: NonNullable<ReturnType<typeof activeTilemapCelTarget>>,
    index: number,
    selection: SelectionMask | null
  ): boolean => {
    if (!selection) return true
    const bounds = tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, index)
    const left = Math.max(0, bounds.x, selection.x)
    const top = Math.max(0, bounds.y, selection.y)
    const right = Math.min(ports.session.document.width, bounds.x + bounds.width, selection.x + selection.width)
    const bottom = Math.min(ports.session.document.height, bounds.y + bounds.height, selection.y + selection.height)
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) if (selectionContains(selection, x, y)) return true
    return false
  }

  const tilemapCellAtPoint = (point: Point, current: DocumentSession = ports.session): TilemapCell | null | undefined => {
    if (current.tilemapMode !== 'paint' || activePaintLayer(current).kind !== 'tilemap') return undefined
    const target = activeTilemapCelTarget(current.document)
    const index = target ? tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, point.x, point.y) : null
    const cell = index === null ? null : (target?.tilemap.cells[index] ?? null)
    return cell ? { ...cell } : null
  }

  const freeTileAtPoint = (
    point: Point,
    current: DocumentSession = ports.session
  ): { sourceId: string; tilesetId: string; tileId: string; instance: FreeTileInstance } | null | undefined => {
    if (activePaintLayer(current).kind !== 'free-tile' || current.freeTileMode !== 'paint') return undefined
    const target = activeFreeTileCelTarget(current.document)
    const instance = target ? freeTileInstanceAtDocumentPoint(target, point.x, point.y) : null
    const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
    const tileId = target && instance ? freeTileTileIdForInstance(target.sources, instance) : null
    return source && instance && tileId ? { sourceId: source.id, tilesetId: source.tileset.id, tileId, instance: { ...instance } } : null
  }

  const unionFreeTileDirtyRect = (current: SelectionRect | null, incoming: SelectionRect): SelectionRect => {
    if (!current) return { ...incoming }
    const left = Math.min(current.x, incoming.x)
    const top = Math.min(current.y, incoming.y)
    const right = Math.max(current.x + current.width, incoming.x + incoming.width)
    const bottom = Math.max(current.y + current.height, incoming.y + incoming.height)
    return { x: left, y: top, width: right - left, height: bottom - top }
  }

  const freeTileSourceEditForDrag = (drag: DragState): FreeTileSourceEditRaster | null => {
    if (!drag.freeTileEditDocument || !drag.freeTileEditLayer || !drag.freeTileSourceBefore || !drag.freeTileEditOrigin || !drag.freeTileEditSourceOffset)
      return null
    return {
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
  }

  const freeTileFloatingDragFields = (floating: DocumentSession['pendingPaste']): Partial<DragState> => {
    if (!floating?.freeTile) return {}
    const { freeTile } = floating
    return {
      freeTileSelectionTransform: true,
      freeTileSelectionSource: cloneSelection(freeTile.selectionSource) ?? undefined,
      freeTileSelectionPivotBefore: floating.beforeSelectionPivot ? { ...floating.beforeSelectionPivot } : null,
      freeTileSourceId: freeTile.sourceId,
      freeTileInstanceId: freeTile.instanceId,
      freeTileEditDocument: freeTile.edit.document,
      freeTileEditLayer: freeTile.edit.layer,
      freeTileSourceBefore: freeTile.edit.before,
      freeTileEditOrigin: { ...freeTile.edit.origin },
      freeTileEditSourceOffset: { ...freeTile.edit.sourceOffset },
      freeTileEditInstanceTransform: { ...freeTile.edit.instanceTransform },
      freeTileEditTransformedSourceBounds: { ...freeTile.edit.transformedSourceBounds }
    }
  }

  const freeTileLocalPoint = (drag: DragState, point: Point): Point =>
    drag.freeTileEditOrigin ? { x: point.x - drag.freeTileEditOrigin.x, y: point.y - drag.freeTileEditOrigin.y } : point

  const commitFreeTileSourceDrag = (drag: DragState, label: string): boolean => {
    const sourceEdit = freeTileSourceEditForDrag(drag)
    if (!sourceEdit || !drag.freeTileSourceId) return false
    const after = freeTileSourceSnapshotFromEditRaster(sourceEdit)
    useWorkspace.getState().commitFreeTileSourceEdit(drag.freeTileSourceId, sourceEdit.before, after, label, drag.freeTilePlacementEdit)
    return true
  }
  return {
    selectedFreeTileSelectionTarget,
    selectedFreeTileInstancesBounds,
    tilemapPaintSelectionForIncoming,
    tilemapEditCellIndexAtPoint,
    tilemapEditClipForCell,
    tilemapEditCreatesFirstTile,
    tilemapEditSelectionAtPoint,
    paintSelectionForDrag,
    tilemapCellAllowedBySelection,
    tilemapCellAtPoint,
    freeTileAtPoint,
    unionFreeTileDirtyRect,
    freeTileSourceEditForDrag,
    freeTileFloatingDragFields,
    freeTileLocalPoint,
    commitFreeTileSourceDrag
  }
}
