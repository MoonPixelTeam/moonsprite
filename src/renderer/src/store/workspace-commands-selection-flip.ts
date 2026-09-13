import { completeDocumentChange } from './workspace-document-change'
import type { SelectionMask } from '@shared/types-selection'
import { commitPixelEdit, revertPixelEdit } from '@/core/history'
import { invalidateRasterContentBounds } from '@/core/document-model'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import {
  applySelectionTransform,
  flipLayer,
  flipSelection
} from '@/core/tools-selection-transform-apply'
import {
  flipSelectionTransformSource
} from '@/core/tools-selection-transform-source'
import {
  restoreSelectionTranslationPreview
} from '@/core/tools-selection-transform-translation'
import { applySelectionTransformLayerState, captureAnimationFrameSelectionTransformStates } from '@/core/selection-transform-targets'
import { flipSelectionMask, transformSelectionMask } from '@/core/selection'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import { applyTilemapDocumentEdit, flipTilemapSelection } from '@/core/tilemap-document'
import { tilemapEditBytes } from '@/core/tilemap'
import { cloneFreeTileCelData, createFreeTileCelData, freeTileCelDataEqual } from '@/core/free-tile'
import { activeFreeTileCelTarget, applyFreeTilePlacementEdit, type FreeTilePlacementEdit } from '@/core/free-tile-document'
import { freeTileTransformTargetToEditRaster } from '@/core/free-tile-edit'
import { flipFreeTileSourceSelection } from './workspace-free-tile-selection-flip'
import { activePaintLayer, cloneSelectionMask, selectedTransformLayersForSession, invalidateSessionContent } from './workspace-session'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { selectionMasksEqual } from './workspace-selection-geometry'
import { tr } from './workspace-translation'
import {
  restoreFloatingPreview,
  markFloatingOverlayChanged,
  markFloatingPreviewChanged,
  floatingSelectionGeometrySource
} from './workspace-floating-preview'
import {
  syncFloatingPrimaryLayerState,
  previewFloatingFreeTileSource,
  clearFloatingSelectionBoxHistory,
  combinedPixelHistoryEntry
} from './workspace-view-selection-helpers'



export function createSelectionFlipCommands({ get, recording }: WorkspaceCommandContext<'commitPixelEdit' | 'mutateActive' | 'redo' | 'undo'>): Pick<WorkspaceViewSelectionCommands, 'flipActiveSelection'> {
  const { recordDocumentOperation } = recording
  return {
    flipActiveSelection(axis) {
      get().mutateActive((session) => {
        if (session.pendingPaste) {
          const pending = session.pendingPaste
          clearFloatingSelectionBoxHistory(pending)
          const previousTarget = pending.target
          const previewDeferred = Boolean(pending.previewDeferred)
          if (previewDeferred) {
            // Deferred previews normally leave the document untouched. Also
            // clean up an already-materialized preview from an older runtime so
            // it cannot become part of the stable background after hot reload.
            if (pending.translationPreview) restoreSelectionTranslationPreview(session.document, pending.translationPreview)
            else if (pending.previewEdit) revertPixelEdit(session.document, pending.previewEdit)
          } else restoreFloatingPreview(session)
          // A flipped floating cel can change its visible bounds even when the
          // selection rectangle stays the same. Drop the source bounds used by
          // layer-style expansion before rebuilding the preview.
          for (const layerId of pending.layers?.map((state) => state.layerId) ?? [pending.layerId]) {
            const layer = session.document.layers.find((candidate) => candidate.id === layerId)
            if (layer) invalidateRasterContentBounds(layer)
          }
          if (pending.layers?.length) {
            for (const layerState of pending.layers) layerState.source = flipSelectionTransformSource(layerState.source, axis)
            syncFloatingPrimaryLayerState(pending)
          } else pending.source = flipSelectionTransformSource(pending.source, axis)
          if (axis === 'horizontal') pending.sourceFlipHorizontal = !pending.sourceFlipHorizontal
          else pending.sourceFlipVertical = !pending.sourceFlipVertical
          if (pending.freeTile) pending.freeTile.selectionSource = flipSelectionMask(pending.freeTile.selectionSource, axis)
          const transformTarget = pending.transformTarget ?? {
            x: pending.target.x,
            y: pending.target.y,
            width: pending.target.width,
            height: pending.target.height
          }
          const angle = pending.transformAngle ?? 0
          const shear = pending.transformShear
          const transformed = transformSelectionMask(floatingSelectionGeometrySource(pending), transformTarget, session.document.width, session.document.height, angle, shear, false)
          if (!transformed) return
          pending.target = transformed
          session.selection = cloneSelectionMask(transformed)
          pending.previewEdit = null
          pending.translationPreview = null
          pending.previewDeferred = previewDeferred
          if (previewDeferred) markFloatingOverlayChanged(session)
          else if (pending.layers?.length) {
            for (const layerState of pending.layers) {
              layerState.previewEdit = applySelectionTransformLayerState(
                session.document,
                layerState,
                transformTarget,
                angle,
                pending.copy,
                shear,
                undefined,
                undefined,
                undefined,
                undefined,
                session.selectionRotationAlgorithm === 'rotsprite'
              )
              layerState.translationPreview = null
            }
            syncFloatingPrimaryLayerState(pending)
            markFloatingPreviewChanged(session, previousTarget, transformed)
          } else if (pending.freeTile) {
            pending.previewEdit = applySelectionTransform(
              pending.freeTile.edit.document,
              pending.source,
              freeTileTransformTargetToEditRaster(pending.freeTile.edit, transformTarget),
              angle,
              pending.copy,
              shear,
              undefined,
              undefined,
              pending.freeTile.edit.layer,
              undefined,
              undefined,
              false,
              session.selectionRotationAlgorithm === 'rotsprite'
            )
            if (!previewFloatingFreeTileSource(session, pending)) markFloatingOverlayChanged(session)
          } else {
            const preview = applySelectionTransform(
              session.document,
              pending.source,
              transformTarget,
              angle,
              pending.copy,
              shear,
              undefined,
              undefined,
              activePaintLayer(session),
              undefined,
              undefined,
              false,
              session.selectionRotationAlgorithm === 'rotsprite'
            )
            if (preview) pending.previewEdit = preview
            markFloatingPreviewChanged(session, previousTarget, transformed)
          }
          return
        }
        const tilemapLayer = activePaintLayer(session)
        if (session.selection && tilemapLayer.kind === 'free-tile') {
          flipFreeTileSourceSelection(session, axis, recordDocumentOperation)
          return
        }
        const freeTileInstanceIds = session.selectedFreeTileInstanceIds.length > 0 ? session.selectedFreeTileInstanceIds : session.selectedFreeTileInstanceId ? [session.selectedFreeTileInstanceId] : []
        // An instance picked on the canvas is a more specific target than a
        // previously selected timeline cel. Keep the cel selection intact for
        // timeline workflows, but do not let it broaden this transform.
        const selectedFreeTileInstanceTakesPriority = !session.selection && tilemapLayer.kind === 'free-tile' && freeTileInstanceIds.length > 0
        // A selected free-tile cel mirrors all of its frame-local instances.
        // Do this before the instance-only path so Shift+H/V on a timeline cel
        // persists in the cel data and cannot be lost on the next refresh.
        const timelineForFreeTiles = ensureAnimationDocument(session.document)
        const selectedFreeTileCelKeys = new Set(session.selectedAnimationCellKeys)
        if (session.selectedAnimationFrameIds.length > 0) {
          for (const cel of timelineForFreeTiles.cels) {
            if (session.selectedAnimationFrameIds.includes(cel.frameId)) selectedFreeTileCelKeys.add(animationCelKey(cel.layerId, cel.frameId))
          }
        }
        const freeTileCelEdits = timelineForFreeTiles.cels
          .filter((cel) => !selectedFreeTileInstanceTakesPriority && selectedFreeTileCelKeys.has(animationCelKey(cel.layerId, cel.frameId)) && session.document.layers.some((layer) => layer.id === cel.layerId && layer.kind === 'free-tile'))
          .map((cel) => {
            if (!cel.freeTiles) cel.freeTiles = createFreeTileCelData()
            const before = cloneFreeTileCelData(cel.freeTiles)
            const after = cloneFreeTileCelData(before)
            for (const instance of after.instances) {
              if (axis === 'horizontal') instance.flipHorizontal = instance.flipHorizontal !== true
              else instance.flipVertical = instance.flipVertical !== true
            }
            return {
              cel,
              before,
              after,
              edit: {
                layerId: cel.layerId,
                frameId: cel.frameId,
                before,
                after,
                dirtyRect: null
              } as FreeTilePlacementEdit
            }
          })
        if (!session.selection && freeTileCelEdits.length > 0) {
          const changed = freeTileCelEdits.filter(({ before, after }) => !freeTileCelDataEqual(before, after))
          if (changed.length > 0) {
            for (const entry of changed) applyFreeTilePlacementEdit(session.document, entry.edit, 'after')
            session.history.push({
              label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
              bytes: changed.reduce((total, entry) => total + (entry.before.instances.length + entry.after.instances.length) * 72, 0),
              undo: () => {
                for (const entry of changed) applyFreeTilePlacementEdit(session.document, entry.edit, 'before')
              },
              redo: () => {
                for (const entry of changed) applyFreeTilePlacementEdit(session.document, entry.edit, 'after')
              },
              invalidation: { kind: 'full' },
              affectedLayerIds: [...new Set(changed.map((entry) => entry.cel.layerId))],
              contentChanged: true,
              requiresAnimationSync: false
            })
            completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
          }
          return
        }
        // Shift+H/V also applies to selected free-tile instances. Keep the
        // operation on the instance metadata (rather than flipping the
        // rendered raster), otherwise the next canvas refresh restores the
        // pre-flip appearance.
        if (!session.selection && tilemapLayer.kind === 'free-tile' && freeTileInstanceIds.length > 0) {
          const target = activeFreeTileCelTarget(session.document)
          if (target) {
            const before = cloneFreeTileCelData(target.freeTiles)
            const selected = new Set(freeTileInstanceIds)
            const after = cloneFreeTileCelData(before)
            for (const instance of after.instances) {
              if (!selected.has(instance.id) || instance.locked === true) continue
              if (axis === 'horizontal') instance.flipHorizontal = instance.flipHorizontal !== true
              else instance.flipVertical = instance.flipVertical !== true
            }
            if (!freeTileCelDataEqual(before, after)) {
              const edit: FreeTilePlacementEdit = {
                layerId: target.layer.id,
                frameId: target.cel.frameId,
                before,
                after,
                dirtyRect: null
              }
              applyFreeTilePlacementEdit(session.document, edit, 'after')
              session.history.push({
                label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
                bytes: (before.instances.length + after.instances.length) * 72,
                undo: () => {
                  applyFreeTilePlacementEdit(session.document, edit, 'before')
                },
                redo: () => {
                  applyFreeTilePlacementEdit(session.document, edit, 'after')
                },
                invalidation: { kind: 'full' },
                affectedLayerIds: [target.layer.id],
                contentChanged: true,
                requiresAnimationSync: false
              })
              completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
            }
          }
          return
        }
        // A selected timeline cel on a tilemap layer represents the complete
        // tilemap cel. With no pixel selection, mirror all of its cells in one
        // document edit so the persisted tile metadata matches the preview.
        const activeTimeline = ensureAnimationDocument(session.document)
        const activeCelKey = animationCelKey(tilemapLayer.id, activeTimeline.activeFrameId)
        const tilemapCelSelected = session.selectedAnimationCellKeys.includes(activeCelKey) || session.selectedAnimationFrameIds.includes(activeTimeline.activeFrameId)
        if (!session.selection && tilemapLayer.kind === 'tilemap' && tilemapCelSelected) {
          const fullCanvasSelection: SelectionMask = {
            x: 0,
            y: 0,
            width: session.document.width,
            height: session.document.height
          }
          const edit = flipTilemapSelection(session.document, tilemapLayer.id, activeTimeline.activeFrameId, fullCanvasSelection, axis)
          if (edit) {
            session.history.push({
              label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
              bytes: tilemapEditBytes(edit),
              undo: () => {
                applyTilemapDocumentEdit(session.document, edit, 'before')
              },
              redo: () => {
                applyTilemapDocumentEdit(session.document, edit, 'after')
              },
              invalidation: edit.dirtyRect
                ? {
                    kind: 'region',
                    frameId: edit.frameId,
                    rect: { ...edit.dirtyRect }
                  }
                : { kind: 'full' },
              affectedLayerIds: [tilemapLayer.id],
              contentChanged: true,
              requiresAnimationSync: false
            })
            completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
          }
          return
        }
        if (session.selection && tilemapLayer.kind === 'tilemap' && session.tilemapMode === 'paint') {
          const beforeSelection = cloneSelectionMask(session.selection)
          const afterSelection = flipSelectionMask(session.selection, axis)
          const edit = flipTilemapSelection(session.document, tilemapLayer.id, ensureAnimationDocument(session.document).activeFrameId, session.selection, axis)
          if (edit) {
            const label = axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical')
            session.history.push({
              label,
              bytes: tilemapEditBytes(edit),
              undo: () => {
                applyTilemapDocumentEdit(session.document, edit, 'before')
              },
              redo: () => {
                applyTilemapDocumentEdit(session.document, edit, 'after')
              },
              invalidation: edit.dirtyRect
                ? {
                    kind: 'region',
                    frameId: edit.frameId,
                    rect: { ...edit.dirtyRect }
                  }
                : { kind: 'full' },
              affectedLayerIds: [tilemapLayer.id],
              contentChanged: true,
              requiresAnimationSync: false
            })
            session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          }
          session.selection = afterSelection
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          return
        }
        const selectedLayers = selectedTransformLayersForSession(session)
        const animationSelectionActive = session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0
        if (session.selection && animationSelectionActive) {
          if (selectedLayers.length === 0 || selectedLayers.some((layer) => layer.kind || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer))) return
          const states = captureAnimationFrameSelectionTransformStates(
            session.document,
            session.selectedAnimationFrameIds,
            selectedLayers.map((layer) => layer.id),
            session.selection,
            session.selectedAnimationCellKeys
          )
          if (states.length === 0) return
          const beforeSelection = cloneSelectionMask(session.selection)
          const selectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
          const afterSelection = flipSelectionMask(session.selection, axis)
          const target = {
            x: session.selection.x,
            y: session.selection.y,
            width: session.selection.width,
            height: session.selection.height,
            ...(axis === 'horizontal' ? { flipHorizontal: true } : { flipVertical: true })
          }
          const entries = states.flatMap((state) => {
            const edit = applySelectionTransformLayerState(session.document, state, target)
            const entry = edit && commitPixelEdit(session.document, edit, axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'))
            return entry ? [entry] : []
          })
          session.selection = afterSelection
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          if (entries.length > 0 && afterSelection)
            session.history.push(
              combinedPixelHistoryEntry(
                session,
                entries,
                axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
                beforeSelection,
                afterSelection,
                selectionPivot,
                selectionPivot
              )
            )
          if (entries.length > 0) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          return
        }
        if (session.selection && selectedLayers.length > 1) {
          if (selectedLayers.some((layer) => layer.kind || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer))) return
          const beforeSelection = cloneSelectionMask(session.selection)
          const selectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
          const afterSelection = flipSelectionMask(session.selection, axis)
          const entries = selectedLayers.flatMap((layer) => {
            const edit = flipSelection(session.document, session.selection!, axis, layer)
            const entry = edit && commitPixelEdit(session.document, edit, axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'))
            return entry ? [entry] : []
          })
          session.selection = afterSelection
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          if (entries.length > 0 && afterSelection)
            session.history.push(
              combinedPixelHistoryEntry(
                session,
                entries,
                axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
                beforeSelection,
                afterSelection,
                selectionPivot,
                selectionPivot
              )
            )
          if (entries.length > 0) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          else if (!selectionMasksEqual(beforeSelection, afterSelection))
            session.history.push({
              label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
              bytes: (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
              undo: () => {
                session.selection = cloneSelectionMask(beforeSelection)
              },
              redo: () => {
                session.selection = cloneSelectionMask(afterSelection)
              },
              documentChanged: false,
              contentChanged: false,
              requiresAnimationSync: false
            })
          return
        }
        const layer = activePaintLayer(session)
        if (isLayerEffectivelyLocked(session.document, layer)) return
        const beforeSelection = cloneSelectionMask(session.selection)
        const afterSelection = session.selection ? flipSelectionMask(session.selection, axis) : null
        const edit = session.selection ? flipSelection(session.document, session.selection, axis, layer) : flipLayer(session.document, axis)
        const entry = edit && commitPixelEdit(session.document, edit, axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'))
        // Flipping a whole styled layer changes the source geometry under the
        // style proxy. A point/region invalidation can leave the cached styled
        // surface behind, especially when the style extends beyond the layer.
        // Rebuild the complete composite for this operation.
        const wholeStyledLayerFlip = !session.selection && hasEnabledLayerStyles(layer.layerStyles)
        const sameMask = beforeSelection?.mask === afterSelection?.mask || (beforeSelection?.mask?.length === afterSelection?.mask?.length && beforeSelection?.mask?.every((value, index) => value === afterSelection?.mask?.[index]))
        const selectionChanged = !sameMask
        session.selection = afterSelection
        session.lastPencilPoint = null
        session.lastEraserPoint = null
        if (entry) {
          session.history.push({
            ...entry,
            bytes: entry.bytes + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
            undo: () => {
              entry.undo()
              session.selection = cloneSelectionMask(beforeSelection)
            },
            redo: () => {
              entry.redo()
              session.selection = cloneSelectionMask(afterSelection)
            }
          })
          session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          if (wholeStyledLayerFlip) invalidateSessionContent(session)
        } else if (selectionChanged) {
          session.history.push({
            label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
            bytes: (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
            undo: () => {
              session.selection = cloneSelectionMask(beforeSelection)
            },
            redo: () => {
              session.selection = cloneSelectionMask(afterSelection)
            }
          })
        }
      })
    }
  }
}
