import { commitPixelEdit } from '@/core/history'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible, layerContentBounds } from '@/core/document-model'
import { resolveAnimationCel } from '@/core/animation'
import {
  applySelectionTransform,
  moveSelection
} from '@/core/tools-selection-transform-apply'
import {
  applySelectionTranslationPreview
} from '@/core/tools-selection-transform-translation'
import {
  captureSelectionTransform
} from '@/core/tools-selection-transform-source'
import {
  applySelectionTransformLayerState,
  captureAnimationFrameSelectionTransformStates,
  selectionTransformLayerForState
} from '@/core/selection-transform-targets'
import { transformSelectionMask, transformSelectionMaskQuad } from '@/core/selection'
import { freeTileTransformTargetToEditRaster } from '@/core/free-tile-edit'
import { activePaintLayer, cloneSelectionMask, selectedTransformLayersForSession } from './workspace-session'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { cloneSelectionPivot, selectionMasksEqual } from './workspace-selection-geometry'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import {
  restoreFloatingPreview,
  markFloatingOverlayChanged,
  markFloatingPreviewChanged,
  floatingSelectionGeometrySource
} from './workspace-floating-preview'
import {
  tilemapEditCellIndexForSelection,
  tilemapEditClipForCell,
  syncFloatingPrimaryLayerState,
  previewFloatingFreeTileSource,
  clearFloatingSelectionBoxHistory,
  recordFloatingSelectionBoxMove
} from './workspace-view-selection-helpers'
import { translateSelectionQuad } from './workspace-selection-transform-geometry'



export function createSelectionMoveCommands({ get }: WorkspaceCommandContext<'commitPixelEdit' | 'moveActiveSelectionWithSelectionHistory' | 'moveLayerBy' | 'mutateActive' | 'redo' | 'undo'>): Pick<WorkspaceViewSelectionCommands, 'moveActiveSelectionWithSelectionHistory' | 'moveActiveSelection' | 'centerActiveContent'> {
  return {
    moveActiveSelectionWithSelectionHistory(deltaX, deltaY, allowOutsideCanvas = false) {
      get().mutateActive((session) => {
        if (!session.selection) return
        const currentSelection = cloneSelectionMask(session.selection)!
        const requestedX = currentSelection.x + Math.trunc(deltaX)
        const requestedY = currentSelection.y + Math.trunc(deltaY)
        const nextX = allowOutsideCanvas ? requestedX : Math.max(0, Math.min(session.document.width - currentSelection.width, requestedX))
        const nextY = allowOutsideCanvas ? requestedY : Math.max(0, Math.min(session.document.height - currentSelection.height, requestedY))
        const actualX = nextX - currentSelection.x
        const actualY = nextY - currentSelection.y
        if (actualX === 0 && actualY === 0) return

        const pending = session.pendingPaste
        if (pending) {
          const pendingLayer = pending.layers?.length ? null : (session.document.layers.find((candidate) => candidate.id === pending.layerId) ?? activePaintLayer(session))
          if (pendingLayer && isLayerEffectivelyLocked(session.document, pendingLayer)) return
          const clipboardSelectionBoxMoved = pending.source.origin === 'clipboard' && !selectionMasksEqual(currentSelection, pending.target)
          if (clipboardSelectionBoxMoved && !allowOutsideCanvas) {
            const nextSelection = { ...currentSelection, x: nextX, y: nextY }
            const beforePivot = cloneSelectionPivot(session.selectionPivot)
            const afterPivot = beforePivot ? { x: beforePivot.x + actualX, y: beforePivot.y + actualY } : null
            recordFloatingSelectionBoxMove(session, pending, currentSelection, nextSelection, beforePivot, afterPivot)
            if (pending.transformQuad) pending.transformQuad = translateSelectionQuad(pending.transformQuad, actualX, actualY) ?? undefined
            return
          }
          // Centering a floating clipboard paste must move its pixels along with
          // the selection box. A box-only move intentionally keeps the
          // materialized preview at its original target until the user begins a
          // content move; the centering command opts into the content path via
          // allowOutsideCanvas. Rebase the transform on the visible selection
          // before applying the requested centering delta so the old preview is
          // restored and cannot become a ghost at the paste origin.
          if (clipboardSelectionBoxMoved && allowOutsideCanvas) {
            restoreFloatingPreview(session)
            pending.target = cloneSelectionMask(currentSelection)!
            pending.transformTarget = {
              x: currentSelection.x,
              y: currentSelection.y,
              width: currentSelection.width,
              height: currentSelection.height
            }
            pending.transformAngle = 0
            pending.transformShear = undefined
            pending.transformQuad = undefined
            pending.previewEdit = null
            pending.translationPreview = null
            clearFloatingSelectionBoxHistory(pending)
          }
          clearFloatingSelectionBoxHistory(pending)
          const previousTarget = cloneSelectionMask(pending.target)!
          const angle = pending.transformAngle ?? 0
          const shear = pending.transformShear
          const transformTarget = pending.transformTarget ?? {
            x: pending.target.x,
            y: pending.target.y,
            width: pending.target.width,
            height: pending.target.height
          }
          const nextTransformTarget = {
            ...transformTarget,
            x: transformTarget.x + actualX,
            y: transformTarget.y + actualY
          }
          const nextTransformQuad = pending.transformQuad ? translateSelectionQuad(pending.transformQuad, actualX, actualY) : undefined
          if (pending.previewDeferred) {
            // Deferred previews are rendered by CanvasCompositeCache and must
            // never materialize pixels in the document. Centering a selection
            // while such a preview is active only advances its geometry; the
            // source canvas remains untouched until apply/commit.
            const nextSelection = nextTransformQuad
              ? transformSelectionMaskQuad(floatingSelectionGeometrySource(pending), nextTransformQuad, session.document.width, session.document.height, false, pending.source.sourceQuad)
              : transformSelectionMask(floatingSelectionGeometrySource(pending), nextTransformTarget, session.document.width, session.document.height, angle, shear, false)
            if (!nextSelection) return
            pending.target = cloneSelectionMask(nextSelection)!
            pending.transformTarget = nextTransformTarget
            pending.transformQuad = nextTransformQuad ?? undefined
            session.selection = cloneSelectionMask(nextSelection)
            if (session.selectionPivot)
              session.selectionPivot = {
                x: session.selectionPivot.x + actualX,
                y: session.selectionPivot.y + actualY
              }
            markFloatingOverlayChanged(session)
            return
          }
          if (pending.freeTile) {
            restoreFloatingPreview(session)
            const nextSelection = nextTransformQuad
              ? transformSelectionMaskQuad(
                  pending.freeTile.selectionSource,
                  nextTransformQuad,
                  session.document.width,
                  session.document.height,
                  false,
                  pending.source.sourceQuad ? (translateSelectionQuad(pending.source.sourceQuad, pending.freeTile.edit.origin.x, pending.freeTile.edit.origin.y) ?? undefined) : undefined
                )
              : transformSelectionMask(pending.freeTile.selectionSource, nextTransformTarget, session.document.width, session.document.height, angle, shear, false)
            if (!nextSelection) return
            const localTarget = freeTileTransformTargetToEditRaster(pending.freeTile.edit, nextTransformTarget)
            const simpleTranslation =
              angle % 360 === 0 &&
              !shear &&
              !nextTransformQuad &&
              nextTransformTarget.width === pending.source.selection.width &&
              nextTransformTarget.height === pending.source.selection.height &&
              !nextTransformTarget.flipHorizontal &&
              !nextTransformTarget.flipVertical
            pending.previewEdit = null
            pending.translationPreview = simpleTranslation ? applySelectionTranslationPreview(pending.freeTile.edit.document, pending.source, localTarget, pending.copy, pending.translationPreview, pending.freeTile.edit.layer) : null
            if (!simpleTranslation)
              pending.previewEdit = applySelectionTransform(
                pending.freeTile.edit.document,
                pending.source,
                localTarget,
                angle,
                pending.copy,
                shear,
                undefined,
                undefined,
                pending.freeTile.edit.layer,
                undefined,
                nextTransformQuad
                  ? {
                      nw: {
                        x: nextTransformQuad.nw.x - pending.freeTile.edit.origin.x,
                        y: nextTransformQuad.nw.y - pending.freeTile.edit.origin.y
                      },
                      ne: {
                        x: nextTransformQuad.ne.x - pending.freeTile.edit.origin.x,
                        y: nextTransformQuad.ne.y - pending.freeTile.edit.origin.y
                      },
                      se: {
                        x: nextTransformQuad.se.x - pending.freeTile.edit.origin.x,
                        y: nextTransformQuad.se.y - pending.freeTile.edit.origin.y
                      },
                      sw: {
                        x: nextTransformQuad.sw.x - pending.freeTile.edit.origin.x,
                        y: nextTransformQuad.sw.y - pending.freeTile.edit.origin.y
                      }
                    }
                  : undefined,
                false,
                session.selectionRotationAlgorithm === 'rotsprite'
              )
            pending.target = cloneSelectionMask(nextSelection)!
            pending.transformTarget = nextTransformTarget
            if (nextTransformQuad) pending.transformQuad = nextTransformQuad
            session.selection = cloneSelectionMask(nextSelection)
            if (session.selectionPivot)
              session.selectionPivot = {
                x: session.selectionPivot.x + actualX,
                y: session.selectionPivot.y + actualY
              }
            if (!previewFloatingFreeTileSource(session, pending)) markFloatingOverlayChanged(session)
            return
          }
          restoreFloatingPreview(session)
          const nextSelection = nextTransformQuad
            ? transformSelectionMaskQuad(floatingSelectionGeometrySource(pending), nextTransformQuad, session.document.width, session.document.height, false, pending.source.sourceQuad)
            : transformSelectionMask(floatingSelectionGeometrySource(pending), nextTransformTarget, session.document.width, session.document.height, angle, shear, false)
          if (!nextSelection) return
          const simpleTranslation =
            angle % 360 === 0 &&
            !shear &&
            !nextTransformQuad &&
            nextTransformTarget.width === pending.source.selection.width &&
            nextTransformTarget.height === pending.source.selection.height &&
            !nextTransformTarget.flipHorizontal &&
            !nextTransformTarget.flipVertical
          if (pending.layers?.length) {
            for (const layerState of pending.layers) {
              layerState.previewEdit = null
              if (simpleTranslation && !layerState.frameId) {
                const layer = selectionTransformLayerForState(session.document, layerState)
                if (!layer || layer.kind) continue
                layerState.translationPreview = applySelectionTranslationPreview(session.document, layerState.source, nextTransformTarget, pending.copy, layerState.translationPreview, layer, undefined, session.view.tileRepeatMode)
              } else {
                layerState.translationPreview = null
                layerState.previewEdit = applySelectionTransformLayerState(
                  session.document,
                  layerState,
                  nextTransformTarget,
                  angle,
                  pending.copy,
                  shear,
                  undefined,
                  undefined,
                  undefined,
                  nextTransformQuad ?? undefined,
                  session.selectionRotationAlgorithm === 'rotsprite'
                )
              }
            }
            syncFloatingPrimaryLayerState(pending)
            pending.target = cloneSelectionMask(nextSelection)!
            pending.transformTarget = nextTransformTarget
            if (nextTransformQuad) pending.transformQuad = nextTransformQuad
            session.selection = cloneSelectionMask(nextSelection)
            if (session.selectionPivot)
              session.selectionPivot = {
                x: session.selectionPivot.x + actualX,
                y: session.selectionPivot.y + actualY
              }
            markFloatingPreviewChanged(session, previousTarget, nextSelection)
            return
          }
          const layer = pendingLayer ?? activePaintLayer(session)
          pending.previewEdit = null
          pending.translationPreview = simpleTranslation
            ? applySelectionTranslationPreview(
                session.document,
                pending.source,
                nextTransformTarget,
                pending.copy,
                pending.translationPreview,
                layer,
                tilemapEditClipForCell(session, pending.tilemapEditCellIndex),
                session.view.tileRepeatMode
              )
            : null
          if (!simpleTranslation)
            pending.previewEdit = applySelectionTransform(
              session.document,
              pending.source,
              nextTransformTarget,
              angle,
              pending.copy,
              shear,
              undefined,
              undefined,
              layer,
              undefined,
              nextTransformQuad ?? undefined,
              false,
              session.selectionRotationAlgorithm === 'rotsprite'
            )
          pending.target = cloneSelectionMask(nextSelection)!
          pending.transformTarget = nextTransformTarget
          if (nextTransformQuad) pending.transformQuad = nextTransformQuad
          session.selection = cloneSelectionMask(nextSelection)
          if (session.selectionPivot)
            session.selectionPivot = {
              x: session.selectionPivot.x + actualX,
              y: session.selectionPivot.y + actualY
            }
          markFloatingPreviewChanged(session, previousTarget, nextSelection)
          return
        }

        const animationSelectionActive = session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0
        if (animationSelectionActive) {
          const selectedLayers = selectedTransformLayersForSession(session)
          if (session.activeLayerMaskId || selectedLayers.length === 0 || selectedLayers.some((layer) => layer.kind || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer))) return
          const layers = captureAnimationFrameSelectionTransformStates(
            session.document,
            session.selectedAnimationFrameIds,
            selectedLayers.map((layer) => layer.id),
            currentSelection,
            session.selectedAnimationCellKeys,
            { preserveOutsideCanvas: true }
          )
          if (layers.length === 0) return
          const nextSelection = { ...currentSelection, x: nextX, y: nextY }
          for (const layerState of layers) {
            layerState.previewEdit = applySelectionTransformLayerState(session.document, layerState, nextSelection)
          }
          const primary = layers[0]
          session.pendingPaste = {
            layerId: primary.layerId,
            layers,
            beforeSelection: cloneSelectionMask(currentSelection),
            beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
            source: primary.source,
            target: cloneSelectionMask(nextSelection)!,
            transformTarget: {
              x: nextSelection.x,
              y: nextSelection.y,
              width: nextSelection.width,
              height: nextSelection.height
            },
            transformAngle: 0,
            previewEdit: primary.previewEdit,
            translationPreview: null,
            copy: false,
            label: tr('workspace.history.moveSelectionContent')
          }
          session.selection = cloneSelectionMask(nextSelection)
          if (session.selectionPivot)
            session.selectionPivot = {
              x: session.selectionPivot.x + actualX,
              y: session.selectionPivot.y + actualY
            }
          markFloatingPreviewChanged(session, currentSelection, nextSelection)
          return
        }

        const selectedLayers = selectedTransformLayersForSession(session)
        const multipleLayers = selectedLayers.length > 1
        if (selectedLayers.length === 0 || (multipleLayers && selectedLayers.some((candidate) => candidate.kind))) return
        if (selectedLayers.some((candidate) => !isLayerEffectivelyVisible(session.document, candidate) || isLayerEffectivelyLocked(session.document, candidate))) return
        const layer = multipleLayers ? selectedLayers[0] : activePaintLayer(session)
        if (isLayerEffectivelyLocked(session.document, layer)) return
        // Keep source and target dimensions identical when the marquee extends
        // outside the canvas; clipping the source turns later nudges into scaling.
        const source = captureSelectionTransform(session.document, currentSelection, layer, { preserveOutsideCanvas: true })
        if (!source) return
        const nextSelection = { ...currentSelection, x: nextX, y: nextY }
        const tilemapEditCellIndex = tilemapEditCellIndexForSelection(session, currentSelection)
        if (layer.kind === 'tilemap' && session.tilemapMode === 'edit' && tilemapEditCellIndex === undefined) return
        const translationPreview = applySelectionTranslationPreview(session.document, source, nextSelection, false, null, layer, tilemapEditClipForCell(session, tilemapEditCellIndex), session.view.tileRepeatMode)
        const layers = multipleLayers
          ? selectedLayers.map((candidate) => {
              const candidateSource = candidate.id === layer.id ? source : captureSelectionTransform(session.document, currentSelection, candidate, { preserveOutsideCanvas: true })!
              const candidatePreview = candidate.id === layer.id ? translationPreview : applySelectionTranslationPreview(session.document, candidateSource, nextSelection, false, null, candidate, undefined, session.view.tileRepeatMode)
              return {
                layerId: candidate.id,
                source: candidateSource,
                previewEdit: null,
                translationPreview: candidatePreview
              }
            })
          : undefined
        session.pendingPaste = {
          layerId: layer.id,
          ...(layers ? { layers } : {}),
          beforeSelection: cloneSelectionMask(currentSelection),
          beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
          source,
          target: cloneSelectionMask(nextSelection)!,
          transformTarget: {
            x: nextSelection.x,
            y: nextSelection.y,
            width: nextSelection.width,
            height: nextSelection.height
          },
          transformAngle: 0,
          previewEdit: null,
          translationPreview,
          tilemapEditCellIndex,
          copy: false,
          label: tr('workspace.history.moveSelectionContent')
        }
        session.selection = cloneSelectionMask(nextSelection)
        if (session.selectionPivot)
          session.selectionPivot = {
            x: session.selectionPivot.x + actualX,
            y: session.selectionPivot.y + actualY
          }
        markFloatingPreviewChanged(session, currentSelection, nextSelection)
      }, false)
    },
    moveActiveSelection(deltaX, deltaY) {
      get().mutateActive((session) => {
        if (!session.selection) return
        const edit = moveSelection(session.document, session.selection, deltaX, deltaY, false, activePaintLayer(session))
        const entry = edit && commitPixelEdit(session.document, edit, tr('workspace.history.moveSelection'))
        if (entry) session.history.push(entry)
        if (entry) {
          session.selection = {
            ...session.selection,
            x: session.selection.x + deltaX,
            y: session.selection.y + deltaY
          }
          if (session.selectionPivot)
            session.selectionPivot = {
              x: session.selectionPivot.x + deltaX,
              y: session.selectionPivot.y + deltaY
            }
        }
      })
    },
    centerActiveContent(axis) {
      const current = activeSession(get())
      if (current?.pendingPaste && current.selection) {
        const selection = current.selection
        const deltaX = axis === 'vertical' ? 0 : Math.round(current.document.width / 2 - (selection.x + selection.width / 2))
        const deltaY = axis === 'horizontal' ? 0 : Math.round(current.document.height / 2 - (selection.y + selection.height / 2))
        if (deltaX !== 0 || deltaY !== 0) get().moveActiveSelectionWithSelectionHistory(deltaX, deltaY, true)
        return
      }

      // A fixed text box is an editable layout rectangle, not just the opaque
      // glyph pixels stored in its raster surface.  layerContentBounds() quite
      // correctly ignores transparent pixels for raster layers, but using that
      // result for boxed text would center the glyphs while leaving the text
      // box itself off-center.  Text without a box uses those same opaque
      // content bounds explicitly, because commitPixelEdit() intentionally
      // rejects raster edits on editable text layers.  Move the text layer
      // through the existing layer move command so its text origin, cel surface
      // offset, and history entry stay in sync.
      if (current && !current.selection) {
        const layer = activePaintLayer(current)
        if (layer.kind === 'text' && !current.activeLayerMaskId) {
          const timeline = current.document.animation
          const cel = timeline?.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
          const source = cel ? (resolveAnimationCel(timeline!, cel) ?? cel) : null
          const text = source?.text
          const surface = source?.surface
          const bounds =
            text && surface && text.boxWidth !== undefined && text.boxHeight !== undefined
              ? {
                  x: text.originX ?? surface.offsetX ?? layer.offsetX,
                  y: text.originY ?? surface.offsetY ?? layer.offsetY,
                  width: text.boxWidth,
                  height: text.boxHeight
                }
              : layerContentBounds(current.document, layer)
          if (bounds) {
            const deltaX = axis === 'vertical' ? 0 : Math.round(current.document.width / 2 - (bounds.x + bounds.width / 2))
            const deltaY = axis === 'horizontal' ? 0 : Math.round(current.document.height / 2 - (bounds.y + bounds.height / 2))
            if (deltaX !== 0 || deltaY !== 0) get().moveLayerBy(layer.id, deltaX, deltaY)
            return
          }
        }
      }
      get().mutateActive((session) => {
        const layer = activePaintLayer(session)
        if (isLayerEffectivelyLocked(session.document, layer)) return
        const selection = session.selection ? cloneSelectionMask(session.selection) : layerContentBounds(session.document, layer)
        if (!selection) return
        const deltaX = axis === 'vertical' ? 0 : Math.round(session.document.width / 2 - (selection.x + selection.width / 2))
        const deltaY = axis === 'horizontal' ? 0 : Math.round(session.document.height / 2 - (selection.y + selection.height / 2))
        const source = session.selection
          ? captureSelectionTransform(session.document, selection, layer, {
              preserveOutsideCanvas: true
            })
          : null
        const target = {
          ...selection,
          x: selection.x + deltaX,
          y: selection.y + deltaY
        }
        const edit = source ? applySelectionTransform(session.document, source, target, 0, false, undefined, undefined, undefined, layer) : moveSelection(session.document, selection, deltaX, deltaY, false, layer)
        const entry = edit && commitPixelEdit(session.document, edit, session.selection ? tr('workspace.history.moveSelectionContent') : tr('canvas.history.moveLayer'))
        if (!entry) return
        const beforeSelection = session.selection ? cloneSelectionMask(session.selection) : null
        const beforePivot = session.selectionPivot ? { ...session.selectionPivot } : null
        const afterSelection = beforeSelection
          ? {
              ...beforeSelection,
              x: beforeSelection.x + deltaX,
              y: beforeSelection.y + deltaY
            }
          : null
        const afterPivot = beforePivot ? { x: beforePivot.x + deltaX, y: beforePivot.y + deltaY } : null
        session.history.push({
          ...entry,
          bytes: entry.bytes + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 48,
          undo: () => {
            entry.undo()
            session.selection = cloneSelectionMask(beforeSelection)
            session.selectionPivot = beforePivot ? { ...beforePivot } : null
          },
          redo: () => {
            entry.redo()
            session.selection = cloneSelectionMask(afterSelection)
            session.selectionPivot = afterPivot ? { ...afterPivot } : null
          }
        })
        if (session.selection) {
          session.selection = {
            ...session.selection,
            x: session.selection.x + deltaX,
            y: session.selection.y + deltaY
          }
          if (session.selectionPivot)
            session.selectionPivot = {
              x: session.selectionPivot.x + deltaX,
              y: session.selectionPivot.y + deltaY
            }
        }
      })
    }
  }
}
