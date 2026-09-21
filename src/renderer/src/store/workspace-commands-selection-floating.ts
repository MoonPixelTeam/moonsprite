import { completeDocumentChange } from './workspace-document-change'
import { restoredClipboardBytes, restoredClipboardSnapshot } from './workspace-restored-clipboard'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { SelectionMask } from '@shared/types-selection'
import type { TextCelData } from '@shared/types-text'
import { commitPixelEdit, type HistoryEntry } from '@/core/history'
import { createId, paletteColorIdForCanvas } from '@/core/document-model'
import {
  cloneAnimationCelSurface,
  ensureAnimationDocument,
  refreshActiveAnimationFrame,
  resolveAnimationCel,
  syncActiveAnimationLayer
} from '@/core/animation'
import { applySelectionTransform } from '@/core/tools-selection-transform-apply'
import {
  applySelectionTranslationCommit,
  selectionTranslationPreviewEdit
} from '@/core/tools-selection-transform-translation'
import { applySelectionTransformLayerState, selectionTransformLayerForState } from '@/core/selection-transform-targets'
import { selectionQuadFromRect } from '@/core/selection'
import { cloneTextCelData, convertTextSurface, rasterizeText } from '@/core/text-raster'
import {
  activeTilemapCelTarget,
  applyTilemapSelectionCellMove,
  applyTilemapTilesetDocumentEdit,
  convertTilemapPixelEdit
} from '@/core/tilemap-document'
import {
  tilemapCellTranslationForSelection,
  tilemapTilesetEditBytes,
  tilemapTilesetEditHasChanges,
  wrapSelectionMaskForTileRepeat,
  type TilemapDrawingMode,
  type TilemapTilesetEdit
} from '@/core/tilemap'
import { applyFreeTileSourceSnapshot } from '@/core/free-tile-document'
import { freeTileSourceSnapshotFromEditRaster } from '@/core/free-tile-edit'
import { activePaintLayer, cloneSelectionMask, touch } from './workspace-session'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { selectionMasksEqual } from './workspace-selection-geometry'
import { commitFreeTileSourceEditInSession } from './workspace-free-tile-transaction'
import { activeSession } from './workspace-access'
import { restoreFloatingPreview, markFloatingOverlayChanged, markFloatingPreviewChanged } from './workspace-floating-preview'
import { applyTextSurface } from './workspace-text-surface'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection } from './workspace-animation-selection-history'
import {
  syncFloatingPrimaryLayerState,
  clearFloatingSelectionBoxHistory,
  floatingPasteSelectionForCommit,
  combinedPixelHistoryEntry
} from './workspace-view-selection-helpers'
import { cloneSelectionQuad } from './workspace-selection-transform-geometry'
export function createSelectionFloatingCommands({ get, recording }: WorkspaceCommandContext<'beginFloatingSelectionTransform' | 'cancelFloatingPaste' | 'commitFloatingPaste' | 'commitPixelEdit' | 'mutateActive' | 'redo' | 'undo' | 'updateFloatingPastePreview'>): Pick<WorkspaceViewSelectionCommands, 'updateFloatingPastePreview' | 'beginFloatingSelectionTransform' | 'beginFreeTileFloatingSelectionTransform' | 'commitFloatingPaste' | 'cancelFloatingPaste'> {
  const { recordDocumentOperation } = recording
  return {
    updateFloatingPastePreview(edit, target, translationPreview = null, transformTarget, transformAngle, transformShear, previewDeferred = false, layers, transformQuad) {
      get().mutateActive((session) => {
        if (!session.pendingPaste) return
        session.pendingPaste.restoredFromDeselect = false
        const previousTarget = session.pendingPaste.target
        clearFloatingSelectionBoxHistory(session.pendingPaste)
        if (layers) session.pendingPaste.layers = layers
        session.pendingPaste.previewEdit = edit
        session.pendingPaste.translationPreview = translationPreview
        session.pendingPaste.previewDeferred = session.pendingPaste.layers?.length ? false : previewDeferred
        session.pendingPaste.target = cloneSelectionMask(target)!
        if (transformTarget) session.pendingPaste.transformTarget = { ...transformTarget }
        else if ((session.pendingPaste.transformAngle ?? 0) % 360 === 0 && !session.pendingPaste.transformShear) {
          session.pendingPaste.transformTarget = {
            x: target.x,
            y: target.y,
            width: target.width,
            height: target.height
          }
        }
        if (transformAngle !== undefined) session.pendingPaste.transformAngle = transformAngle
        if (transformShear !== undefined) session.pendingPaste.transformShear = { ...transformShear }
        else if (transformAngle !== undefined) session.pendingPaste.transformShear = undefined
        if (transformQuad !== undefined) session.pendingPaste.transformQuad = cloneSelectionQuad(transformQuad) ?? undefined
        syncFloatingPrimaryLayerState(session.pendingPaste)
        session.selection = cloneSelectionMask(target)
        if (session.pendingPaste.previewDeferred) markFloatingOverlayChanged(session)
        else markFloatingPreviewChanged(session, previousTarget, target)
      }, false)
    },
    beginFloatingSelectionTransform(source, edit, before, target, copy, label, translationPreview = null, transformTarget, transformAngle = 0, transformShear, previewDeferred = false, tilemapEditCellIndex, layers, transformQuad) {
      get().mutateActive((session) => {
        const layer = layers?.[0] ?? null
        const activeLayer = activePaintLayer(session)
        session.pendingPaste = {
          layerId: layer?.layerId ?? activeLayer.id,
          ...(layers ? { layers } : {}),
          beforeSelection: cloneSelectionMask(before),
          beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
          source: layer?.source ?? source,
          target: cloneSelectionMask(target)!,
          transformTarget: transformTarget
            ? { ...transformTarget }
            : {
                x: target.x,
                y: target.y,
                width: target.width,
                height: target.height
              },
          transformAngle,
          transformShear: transformShear ? { ...transformShear } : undefined,
          transformQuad: cloneSelectionQuad(transformQuad) ?? undefined,
          previewEdit: layer?.previewEdit ?? edit,
          translationPreview: layer?.translationPreview ?? translationPreview,
          previewDeferred: layers?.length ? false : previewDeferred,
          tilemapEditCellIndex,
          copy,
          label
        }
        session.selection = cloneSelectionMask(target)
        if (session.pendingPaste.previewDeferred) markFloatingOverlayChanged(session)
        else markFloatingPreviewChanged(session, before, target)
      }, false)
    },
    beginFreeTileFloatingSelectionTransform(options) {
      get().mutateActive((session) => {
        const activeLayer = activePaintLayer(session)
        session.pendingPaste = {
          layerId: activeLayer.id,
          beforeSelection: cloneSelectionMask(options.before),
          beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
          source: options.source,
          target: cloneSelectionMask(options.target)!,
          transformTarget: options.transformTarget
            ? { ...options.transformTarget }
            : {
                x: options.target.x,
                y: options.target.y,
                width: options.target.width,
                height: options.target.height
              },
          transformAngle: options.transformAngle ?? 0,
          transformShear: options.transformShear ? { ...options.transformShear } : undefined,
          transformQuad: cloneSelectionQuad(options.transformQuad) ?? undefined,
          previewEdit: options.previewEdit,
          translationPreview: options.translationPreview ?? null,
          previewDeferred: false,
          copy: options.copy,
          label: options.label,
          freeTile: {
            sourceId: options.sourceId,
            instanceId: options.instanceId,
            edit: options.edit,
            selectionSource: cloneSelectionMask(options.selectionSource)!
          }
        }
        session.selection = cloneSelectionMask(options.target)
        markFloatingOverlayChanged(session)
      }, false)
    },
    commitFloatingPaste(deselectLabel) {
      const current = activeSession(get())
      if (!current?.pendingPaste) return
      if (current.pendingPaste.restoredFromDeselect) {
        // Reconfirm unchanged restored content without duplicating pixel history.
        if (deselectLabel && current.history.canRedo) { get().redo(); return }
        get().mutateActive(session => { session.pendingPaste = null }, false)
        return
      }
      get().mutateActive((session) => {
        const pending = session.pendingPaste
        if (!pending) return
        const beforeFreeTransformQuad = cloneSelectionQuad(session.freeTransformQuad)
        const afterFreeTransformQuad = session.freeTransformActive ? (cloneSelectionQuad(pending.transformQuad) ?? selectionQuadFromRect(pending.transformTarget ?? pending.target)) : null
        if (pending.freeTile) {
          const beforeSelection = cloneSelectionMask(pending.beforeSelection)
          const afterSelection = cloneSelectionMask(pending.target)
          const beforeSelectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
          const afterSelectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
          const freeTile = pending.freeTile
          session.pendingPaste = null
          if (session.freeTransformActive) session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
          commitFreeTileSourceEditInSession(recordDocumentOperation, session, freeTile.sourceId, freeTile.edit.before, freeTileSourceSnapshotFromEditRaster(freeTile.edit), pending.label, undefined, {
            before: beforeSelection,
            after: afterSelection,
            beforePivot: beforeSelectionPivot,
            afterPivot: afterSelectionPivot
          })
          if (deselectLabel && afterSelection) {
            session.selection = null
            session.selectionPivot = null
            session.freeTransformActive = false
            session.freeTransformQuad = null
            session.history.push({
              label: deselectLabel,
              bytes: 48 + (afterSelection.mask?.byteLength ?? 0),
              undo: () => {
                session.selection = cloneSelectionMask(afterSelection)
                session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
                session.freeTransformActive = false
                session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
              },
              redo: () => {
                session.selection = null
                session.selectionPivot = null
                session.freeTransformActive = false
                session.freeTransformQuad = null
              },
              documentChanged: false,
              contentChanged: false,
              requiresAnimationSync: false
            })
          }
          return
        }
        if (pending.layers?.length) {
          const beforeAnimationSelection = captureAnimationSelectionHistory(session)
          const transformTarget = pending.transformTarget ?? {
            x: pending.target.x,
            y: pending.target.y,
            width: pending.target.width,
            height: pending.target.height
          }
          const simpleTranslation =
            (pending.transformAngle ?? 0) % 360 === 0 &&
            !pending.transformShear &&
            !pending.transformQuad &&
            transformTarget.width === pending.source.selection.width &&
            transformTarget.height === pending.source.selection.height &&
            !transformTarget.flipHorizontal &&
            !transformTarget.flipVertical
          const entries: HistoryEntry[] = []
          for (const layerState of pending.layers) {
            const layer = selectionTransformLayerForState(session.document, layerState)
            if (!layer || layer.kind) continue
            const edit = pending.previewDeferred
              ? layerState.frameId
                ? applySelectionTransformLayerState(
                    session.document,
                    layerState,
                    transformTarget,
                    pending.transformAngle ?? 0,
                    pending.copy,
                    pending.transformShear,
                    undefined,
                    undefined,
                    undefined,
                    pending.transformQuad,
                    session.selectionRotationAlgorithm === 'rotsprite'
                  )
                : simpleTranslation
                  ? applySelectionTranslationCommit(session.document, layerState.source, transformTarget, pending.copy, layer, session.view.tileRepeatMode)
                  : applySelectionTransform(
                      session.document,
                      layerState.source,
                      transformTarget,
                      pending.transformAngle ?? 0,
                      pending.copy,
                      pending.transformShear,
                      undefined,
                      undefined,
                      layer,
                      undefined,
                      pending.transformQuad,
                      false,
                      session.selectionRotationAlgorithm === 'rotsprite'
                    )
              : (layerState.previewEdit ?? (layerState.translationPreview ? selectionTranslationPreviewEdit(session.document, layerState.translationPreview) : null))
            const entry = edit ? commitPixelEdit(session.document, edit, pending.label) : null
            if (entry) entries.push(entry)
          }
          const beforeSelection = cloneSelectionMask(pending.beforeSelection)
          const tileRepeatMode = session.view.tileRepeatMode ?? 'off'
          const afterSelection =
            simpleTranslation && tileRepeatMode !== 'off'
              ? (wrapSelectionMaskForTileRepeat(pending.target, session.document.width, session.document.height, tileRepeatMode) ?? cloneSelectionMask(pending.target)!)
              : cloneSelectionMask(pending.target)!
          const beforeSelectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
          const selectionChanged = !selectionMasksEqual(beforeSelection, afterSelection)
          session.pendingPaste = null
          session.selection = deselectLabel ? null : cloneSelectionMask(afterSelection)
          if (session.freeTransformActive) session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
          else session.freeTransformQuad = null
          if (deselectLabel) session.selectionPivot = null
          if (deselectLabel) {
            session.freeTransformActive = false
            session.freeTransformQuad = null
          }
          const afterAnimationSelection = captureAnimationSelectionHistory(session)
          if (entries.length > 0) {
            const entry = combinedPixelHistoryEntry(session, entries, pending.label, beforeSelection, afterSelection, beforeSelectionPivot, null, beforeFreeTransformQuad, afterFreeTransformQuad)
            session.history.push(historyEntryWithAnimationSelection(session, entry, beforeAnimationSelection, afterAnimationSelection))
          } else if (selectionChanged) {
            const entry: HistoryEntry = {
              label: pending.label,
              bytes: 48 + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection.mask?.byteLength ?? 0),
              undo: () => {
                session.selection = cloneSelectionMask(beforeSelection)
                session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
                session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad)
              },
              redo: () => {
                session.selection = cloneSelectionMask(afterSelection)
                session.selectionPivot = null
                session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
              },
              documentChanged: false,
              contentChanged: false,
              requiresAnimationSync: false
            }
            session.history.push(historyEntryWithAnimationSelection(session, entry, beforeAnimationSelection, afterAnimationSelection))
          }
          if (deselectLabel)
            session.history.push({
              label: deselectLabel,
              bytes: 48 + (afterSelection.mask?.byteLength ?? 0),
              undo: () => {
                session.selection = cloneSelectionMask(afterSelection)
                session.selectionPivot = null
                session.freeTransformActive = false
                session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
              },
              redo: () => {
                session.selection = null
                session.selectionPivot = null
                session.freeTransformActive = false
                session.freeTransformQuad = null
              },
              documentChanged: false,
              contentChanged: false,
              requiresAnimationSync: false
            })
          if (entries.length > 0) {
            for (const layerId of new Set(entries.flatMap((entry) => entry.affectedLayerIds ?? []))) syncActiveAnimationLayer(session.document, layerId)
            session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
            completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
          }
          return
        }
        const activeLayer = session.document.layers.find((layer) => layer.id === pending.layerId)
        const transformTarget = pending.transformTarget ?? {
          x: pending.target.x,
          y: pending.target.y,
          width: pending.target.width,
          height: pending.target.height
        }
        const simpleTranslation =
          (pending.transformAngle ?? 0) % 360 === 0 &&
          !pending.transformShear &&
          !pending.transformQuad &&
          transformTarget.width === pending.source.selection.width &&
          transformTarget.height === pending.source.selection.height &&
          !transformTarget.flipHorizontal &&
          !transformTarget.flipVertical
        const currentTilemapTarget = activeLayer?.kind === 'tilemap' ? activeTilemapCelTarget(session.document) : null
        const tilemapTarget = currentTilemapTarget?.layer.id === activeLayer?.id ? currentTilemapTarget : null
        const hybridCellTranslation =
          session.tilemapMode === 'hybrid' && pending.source.origin === 'selection' && !pending.sourceFlipHorizontal && !pending.sourceFlipVertical && simpleTranslation && tilemapTarget
            ? tilemapCellTranslationForSelection(tilemapTarget.tilemap, tilemapTarget.surface.offsetX, tilemapTarget.surface.offsetY, pending.source.selection, transformTarget)
            : null
        const edit = hybridCellTranslation
          ? null
          : pending.previewDeferred && activeLayer && (!activeLayer.kind || activeLayer.kind === 'tilemap')
            ? simpleTranslation
              ? applySelectionTranslationCommit(session.document, pending.source, transformTarget, pending.copy, activeLayer, session.view.tileRepeatMode)
              : applySelectionTransform(
                  session.document,
                  pending.source,
                  transformTarget,
                  pending.transformAngle ?? 0,
                  pending.copy,
                  pending.transformShear,
                  undefined,
                  undefined,
                  activeLayer,
                  undefined,
                  pending.transformQuad,
                  false,
                  session.selectionRotationAlgorithm === 'rotsprite'
                )
            : (pending.previewEdit ?? (pending.translationPreview ? selectionTranslationPreviewEdit(session.document, pending.translationPreview) : null))
        const timeline = ensureAnimationDocument(session.document)
        const activeCel = activeLayer?.kind === 'text' ? timeline.cels.find((cel) => cel.layerId === activeLayer.id && cel.frameId === timeline.activeFrameId) : null
        const textSource = activeCel ? (resolveAnimationCel(timeline, activeCel) ?? activeCel) : null
        if (activeLayer?.kind === 'text' && textSource?.text) restoreFloatingPreview(session)
        const beforeText = textSource?.text ? cloneTextCelData(textSource.text) : null
        const beforeTextSurface = activeLayer?.kind === 'text' && textSource?.surface ? cloneAnimationCelSurface(textSource.surface) : null
        let tilemapPixelEdit: TilemapTilesetEdit | null = null
        if (activeLayer?.kind === 'tilemap' && session.tilemapMode !== 'paint') {
          if (hybridCellTranslation && tilemapTarget) {
            restoreFloatingPreview(session)
            tilemapPixelEdit = applyTilemapSelectionCellMove(session.document, tilemapTarget.layer.id, tilemapTarget.cel.frameId, pending.source.selection, hybridCellTranslation.columns, hybridCellTranslation.rows, pending.copy)
          } else if (edit) {
            const conversionMode: Exclude<TilemapDrawingMode, 'paint'> = session.tilemapMode
            tilemapPixelEdit = convertTilemapPixelEdit(session.document, edit, conversionMode, activeLayer.tilemapTilesetId ?? session.selectedTilesetId ?? '', () => createId('tile'), pending.tilemapEditCellIndex)
          }
        }
        const pixelEntry: HistoryEntry | null =
          tilemapPixelEdit && tilemapTilesetEditHasChanges(tilemapPixelEdit)
            ? {
                label: pending.label,
                bytes: tilemapTilesetEditBytes(tilemapPixelEdit),
                undo: () => {
                  applyTilemapTilesetDocumentEdit(session.document, tilemapPixelEdit, 'before')
                },
                redo: () => {
                  applyTilemapTilesetDocumentEdit(session.document, tilemapPixelEdit, 'after')
                },
                invalidation: { kind: 'full' },
                affectedLayerIds: [pending.layerId],
                contentChanged: true,
                requiresAnimationSync: false
              }
            : activeLayer?.kind
              ? null
              : edit
                ? commitPixelEdit(session.document, edit, pending.label)
                : null
        const selectedTileId = tilemapPixelEdit?.changedTileIds.at(-1)
        if (selectedTileId) {
          session.selectedTilesetId = tilemapPixelEdit!.tilesetId
          session.selectedTileId = selectedTileId
          session.secondaryTileId = session.document.tilesets?.find((tileset) => tileset.id === tilemapPixelEdit!.tilesetId)?.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : selectedTileId
        }
        const selectionSnapshot = (value: SelectionMask | null): SelectionMask | null => (value ? { ...value } : null)
        const restoredClipboard = deselectLabel && pending.source.origin === 'clipboard' && !activeLayer?.kind && edit
          ? restoredClipboardSnapshot(pending, edit)
          : null
        const beforeSelection = selectionSnapshot(pending.beforeSelection)
        const tileRepeatMode = session.view.tileRepeatMode ?? 'off'
        const visibleSelection = floatingPasteSelectionForCommit(session, pending)
        const afterSelection =
          simpleTranslation && tileRepeatMode !== 'off'
            ? (wrapSelectionMaskForTileRepeat(visibleSelection, session.document.width, session.document.height, tileRepeatMode) ?? selectionSnapshot(visibleSelection)!)
            : selectionSnapshot(visibleSelection)!
        const selectionGeometryChanged = beforeSelection?.x !== afterSelection.x || beforeSelection?.y !== afterSelection.y || beforeSelection?.width !== afterSelection.width || beforeSelection?.height !== afterSelection.height
        const sameMask =
          selectionGeometryChanged || beforeSelection?.mask === afterSelection.mask || (beforeSelection?.mask?.length === afterSelection.mask?.length && beforeSelection?.mask?.every((value, index) => value === afterSelection.mask?.[index]))
        const selectionChanged = selectionGeometryChanged || !sameMask
        session.pendingPaste = null
        session.selection = deselectLabel ? null : afterSelection
        if (session.freeTransformActive) session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
        else session.freeTransformQuad = null
        if (deselectLabel) session.selectionPivot = null
        if (deselectLabel) {
          session.freeTransformActive = false
          session.freeTransformQuad = null
        }
        let textHistory: {
          before: TextCelData
          after: TextCelData
          restore: (value: TextCelData) => void
        } | null = null
        if (activeLayer?.kind === 'text' && textSource?.text && (edit || selectionChanged)) {
          const sourceTarget = {
            x: pending.source.selection.x,
            y: pending.source.selection.y,
            width: pending.source.selection.width,
            height: pending.source.selection.height
          }
          const target = pending.transformTarget ?? {
            x: pending.target.x,
            y: pending.target.y,
            width: pending.target.width,
            height: pending.target.height
          }
          const sourceRect = { ...sourceTarget }
          const targetRect = { ...target }
          const nextText = cloneTextCelData(textSource.text)
          nextText.transforms = [
            ...(nextText.transforms ?? []),
            {
              source: sourceRect,
              target: targetRect,
              angle: pending.transformAngle ?? 0,
              ...(pending.transformShear ? { shear: { ...pending.transformShear } } : {})
            }
          ]
          const rendered = rasterizeText(nextText, nextText.originX ?? sourceRect.x, nextText.originY ?? sourceRect.y)
          const surface = convertTextSurface(rendered.rgba, session.document.colorMode, session.document.palette, (color) => paletteColorIdForCanvas(session.document, color))
          applyTextSurface(session.document, activeLayer, textSource, activeCel!, rendered.data, surface)
          refreshActiveAnimationFrame(session.document)
          const afterText = cloneTextCelData(nextText)
          const afterTextSurface = cloneAnimationCelSurface(surface)
          const restoreText = (value: TextCelData, restoredSurface: AnimationCelSurface): void => {
            applyTextSurface(session.document, activeLayer, textSource, activeCel!, value, cloneAnimationCelSurface(restoredSurface))
            refreshActiveAnimationFrame(session.document)
          }
          textHistory = {
            before: beforeText!,
            after: afterText,
            restore: (value) => restoreText(value, value === beforeText ? beforeTextSurface! : afterTextSurface)
          }
        }
        if (pixelEntry)
          session.history.push({
            ...pixelEntry,
            // Arrow moves reuse materialized preview surfaces at intermediate
            // positions. Undo/redo must discard them, not patch the final rect.
            invalidation: pending.translationPreview ? { kind: 'full' } : pixelEntry.invalidation,
            bytes: pixelEntry.bytes + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 64,
            undo: () => {
              pixelEntry.undo()
              session.selection = selectionSnapshot(beforeSelection)
              session.selectionPivot = null
              session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad)
            },
            redo: () => {
              pixelEntry.redo()
              session.selection = selectionSnapshot(afterSelection)
              session.selectionPivot = null
              session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
            }
          })
        else if (selectionChanged || textHistory)
          session.history.push({
            label: pending.label,
            bytes: 48 + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
            undo: () => {
              textHistory?.restore(textHistory.before)
              session.selection = selectionSnapshot(beforeSelection)
              session.selectionPivot = null
              session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad)
            },
            redo: () => {
              textHistory?.restore(textHistory.after)
              session.selection = selectionSnapshot(afterSelection)
              session.selectionPivot = null
              session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
            }
          })
        if (deselectLabel)
          session.history.push({
            label: deselectLabel,
            bytes: 48 + (afterSelection.mask?.byteLength ?? 0) + restoredClipboardBytes(restoredClipboard),
            undo: () => {
              if (restoredClipboard) session.pendingPaste = restoredClipboardSnapshot(restoredClipboard, edit!)
              session.selection = selectionSnapshot(afterSelection)
              session.selectionPivot = null
              session.freeTransformActive = false
              session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
            },
            redo: () => {
              session.selection = null
              session.selectionPivot = null
              session.freeTransformActive = false
              session.freeTransformQuad = null
              session.pendingPaste = null
            },
            documentChanged: false,
            contentChanged: false,
            requiresAnimationSync: false
          })
        if (pixelEntry) {
          if (activeLayer?.kind !== 'tilemap') syncActiveAnimationLayer(session.document, pending.layerId)
          if (!deselectLabel) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          completeDocumentChange(session, 'content', recordDocumentOperation, pixelEntry.invalidation)
        } else if (textHistory) {
          if (!deselectLabel) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          touch(session, true)
          recordDocumentOperation(session)
        }
      }, false)
    },
    cancelFloatingPaste() {
      const current = activeSession(get())
      if (!current?.pendingPaste) return
      if (current.pendingPaste.restoredFromDeselect) {
        get().mutateActive(session => { session.pendingPaste = null }, false)
        return
      }
      get().mutateActive((session) => {
        const pending = session.pendingPaste
        if (!pending) return
        if (pending.freeTile) {
          const restored = applyFreeTileSourceSnapshot(session.document, pending.freeTile.edit.before)
          session.selection = cloneSelectionMask(pending.beforeSelection)
          session.selectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
          session.pendingPaste = null
          if (restored) {
            const fromRevision = session.contentRevision
            session.revision += 1
            session.contentRevision += 1
            session.layersPanelRevision += 1
            session.contentInvalidation = {
              kind: 'full',
              fromRevision,
              revision: session.contentRevision
            }
          } else markFloatingOverlayChanged(session)
          return
        }
        restoreFloatingPreview(session)
        session.selection = cloneSelectionMask(pending.beforeSelection)
        session.selectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
        session.pendingPaste = null
        if (pending.previewDeferred) markFloatingOverlayChanged(session)
        else markFloatingPreviewChanged(session, pending.target, pending.beforeSelection ?? pending.target)
      }, false)
    }
  }
}
