import { workspaceCommandRuntime } from './workspace-command-runtime'
import type { AnimationCel } from '@shared/types-animation'
import { beginPixelEdit, commitPixelEdit, pixelEditHasChanges, revertPixelEdit, type ContentInvalidationHint, type HistoryEntry } from '@/core/history'
import { notifyCanvasPreview } from '@/core/canvas-preview-lifecycle'
import { applySmoothBrush, smoothChangedLiquifyPixels } from '@/core/smooth-brush'
import { createId, findLayerMask, isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { cloneAnimationCel, disconnectAnimationCels, ensureAnimationDocument, refreshActiveAnimationFrame, restoreAnimationCels, syncActiveAnimationFrame, syncActiveAnimationLayer } from '@/core/animation'
import { flushViewPreview } from '@/core/view-preview-lifecycle'
import { consumePendingCanvasGestureHistory } from '@/core/canvas-input'
import { deferCanvasShortcut, isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import { consumeCanvasResizePreviewHistory } from '@/core/canvas-resize-preview'
import { playExportSuccessSound } from '@/platform/export-success-sound'
import { applySelectionTranslationCommit } from '@/core/tools-selection-transform'
import { loadEditorPreferences } from '@/core/file-preferences'
import { normalizeTimelapseSettings } from '@/core/project-metadata'
import { isTimelapseVideoFormat } from '@/core/timelapse'
import { persistProjectLayerPanelState } from '@/core/layer-panel-state'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import { activeTilemapCelTarget, applyTilemapDocumentEdit, applyTilemapTilesetDocumentEdit, convertTilemapPixelEdit } from '@/core/tilemap-document'
import { tilemapEditBytes, tilemapTilesetEditBytes, tilemapTilesetEditHasChanges } from '@/core/tilemap'
import { exportTimelapseFile } from './document-file-service'
import { projectRollbackProgress } from '@/core/project-rollback-progress'
import { inheritCommittedPixelChanges } from '@/core/history'
import { recordUsageExport } from '@/platform/usage-statistics'
import { activePaintLayer, cloneSelectionMask, invalidateSessionContent, touch, touchMetadata } from './workspace-session'
import type { DocumentSession, FloatingSelectionBoxHistoryEntry } from './workspace-types'
import type { WorkspaceHistoryCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { cloneSelectionPivot, selectionMasksEqual } from './workspace-selection-geometry'
import { floatingSelectionGeometrySource, restoreFloatingPreview, markFloatingOverlayChanged, markFloatingPreviewChanged } from './workspace-floating-preview'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection } from './workspace-animation-selection-history'
import { createExportConflictHandler } from './workspace-export-conflicts'
import { ensureLayerSelection, normalizeAnimationSelection, clearAnimationLoopPlayback } from './workspace-animation-selection'
import { documentUsesTilesetPanel, requestTilesetPanelVisibility } from './workspace-tileset-panel'

const PROJECT_ROLLBACK_HISTORY_LABEL = '回档工程备份'

const isProjectRollbackHistoryEntry = (entry: Pick<HistoryEntry, 'label'> | null | undefined): boolean => entry?.label === PROJECT_ROLLBACK_HISTORY_LABEL

const historyPositionIncludesProjectRollback = (entries: readonly { label: string }[], from: number, to: number): boolean =>
  entries.slice(Math.min(from, to), Math.max(from, to)).some(isProjectRollbackHistoryEntry)

const deferProjectRollbackHistoryChange = (operation: () => void): void => {
  projectRollbackProgress.begin()
  const run = () => {
    workspaceCommandRuntime.isApplyingDeferredProjectRollbackHistory = true
    try {
      operation()
    } finally {
      workspaceCommandRuntime.isApplyingDeferredProjectRollbackHistory = false
      projectRollbackProgress.endAfterPaint()
    }
  }
  if (typeof window === 'undefined') {
    run()
    return
  }
  // The first frame lets React paint the overlay; the following frame starts
  // the synchronous document swap without making the dialog flash afterward.
  window.requestAnimationFrame(() => window.requestAnimationFrame(run))
}

const cloneFloatingSelectionBoxHistoryEntry = (entry: FloatingSelectionBoxHistoryEntry): FloatingSelectionBoxHistoryEntry => ({
  beforeSelection: cloneSelectionMask(entry.beforeSelection)!,
  afterSelection: cloneSelectionMask(entry.afterSelection)!,
  beforePivot: cloneSelectionPivot(entry.beforePivot),
  afterPivot: cloneSelectionPivot(entry.afterPivot)
})

const undoFloatingSelectionBoxMove = (session: DocumentSession): boolean => {
  const pending = session.pendingPaste
  const entry = pending?.selectionBoxUndo?.pop()
  if (!pending || !entry) return false
  pending.selectionBoxRedo = [...(pending.selectionBoxRedo ?? []), cloneFloatingSelectionBoxHistoryEntry(entry)]
  session.selection = cloneSelectionMask(entry.beforeSelection)
  session.selectionPivot = cloneSelectionPivot(entry.beforePivot)
  return true
}

const redoFloatingSelectionBoxMove = (session: DocumentSession): boolean => {
  const pending = session.pendingPaste
  const entry = pending?.selectionBoxRedo?.pop()
  if (!pending || !entry) return false
  pending.selectionBoxUndo = [...(pending.selectionBoxUndo ?? []), cloneFloatingSelectionBoxHistoryEntry(entry)]
  session.selection = cloneSelectionMask(entry.afterSelection)
  session.selectionPivot = cloneSelectionPivot(entry.afterPivot)
  return true
}

const restoreMovedClipboardPaste = (session: DocumentSession): boolean => {
  const pending = session.pendingPaste
  if (!pending || pending.source.origin !== 'clipboard' || !pending.copy || pending.layers?.length || pending.freeTile) return false
  const layer = session.document.layers.find((candidate) => candidate.id === pending.layerId)
  if (!layer || layer.kind) return false
  const sourceSelection = floatingSelectionGeometrySource(pending)
  const transformTarget = pending.transformTarget ?? {
    x: pending.target.x,
    y: pending.target.y,
    width: pending.target.width,
    height: pending.target.height
  }
  const atPasteOrigin = transformTarget.x === sourceSelection.x
    && transformTarget.y === sourceSelection.y
    && transformTarget.width === sourceSelection.width
    && transformTarget.height === sourceSelection.height
    && !transformTarget.flipHorizontal
    && !transformTarget.flipVertical
    && (pending.transformAngle ?? 0) % 360 === 0
    && (!pending.transformShear || pending.transformShear.amount === 0)
    && selectionMasksEqual(pending.target, sourceSelection)
  if (atPasteOrigin) return false

  const previousTarget = cloneSelectionMask(pending.target)!
  restoreFloatingPreview(session)
  const target = cloneSelectionMask(sourceSelection)!
  pending.target = cloneSelectionMask(target)!
  pending.transformTarget = { x: target.x, y: target.y, width: target.width, height: target.height }
  pending.transformAngle = 0
  pending.transformShear = undefined
  pending.translationPreview = null
  pending.previewEdit = pending.previewDeferred
    ? null
    : applySelectionTranslationCommit(session.document, pending.source, target, true, layer) ?? beginPixelEdit(layer.id)
  session.selection = cloneSelectionMask(target)
  session.selectionPivot = null
  if (pending.previewDeferred) markFloatingOverlayChanged(session)
  else markFloatingPreviewChanged(session, previousTarget, target)
  return true
}

const shouldCaptureTimelapseHistoryStep = (session: DocumentSession): boolean =>
  normalizeTimelapseSettings(session.document.timelapse, session.document.timelapse?.snapshots ?? []).recordUndoSteps === true

export function createWorkspaceHistoryCommands({ get, set, recording }: WorkspaceCommandContext<'cancelFloatingPaste' | 'cancelTextBoxTransform' | 'commitPixelEdit' | 'mutateActive' | 'redo' | 'requestDialog' | 'setHistoryPosition' | 'undo'>): WorkspaceHistoryCommands {
  const { recordDocumentOperation, flushTimelapseCapture } = recording
  return {
    applySmoothBrushStroke(edit, stroke) {
      const session = activeSession(get())
      if (!session || session.animationPlaying || session.activeLayerMaskId) return false
      const layer = activePaintLayer(session)
      if (layer.id !== edit.layerId || layer.kind || isLayerEffectivelyLocked(session.document, layer) || !isLayerEffectivelyVisible(session.document, layer)) return false
      return applySmoothBrush(session.document, layer, edit, stroke, session.selection, session.smoothStrength)
    },

    cancelSmoothBrushStroke(edit) {
      const session = activeSession(get())
      if (session) revertPixelEdit(session.document, edit)
    },

    beginLiquifyStroke(layerId) {
      let compound = false
      get().mutateActive((session) => {
        const timeline = session.document.animation
        if (!timeline) return
        if (session.liquifyResetHistoryPosition == null || session.liquifyResetHistoryRevision !== session.history.revision) {
          session.liquifyResetHistoryPosition = session.history.position
          session.liquifyResetHistoryRevision = session.history.revision
        }
        const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === timeline.activeFrameId)
        if (!cel) return
        syncActiveAnimationFrame(session.document)
        const before = timeline.cels.map(cloneAnimationCel)
        session.history.beginCompound()
        if (!disconnectAnimationCels(session.document, [cel.id])) {
          session.history.abortCompound()
          return
        }
        const after = ensureAnimationDocument(session.document).cels.map(cloneAnimationCel)
        const restore = (snapshot: AnimationCel[]): void => {
          restoreAnimationCels(session.document, snapshot)
          refreshActiveAnimationFrame(session.document)
        }
        session.history.push({
          label: tr('workspace.history.animationCelUnlink'),
          bytes: [...before, ...after].reduce((sum, item) => sum + (item.surface?.pixels.byteLength ?? 0) + 24, 0),
          undo: () => restore(before),
          redo: () => restore(after),
          invalidation: { kind: 'full' },
          affectedLayerIds: [layerId],
          requiresAnimationSync: false
        })
        compound = true
      }, false)
      return compound
    },

    cancelLiquifyStroke(edit, compound) {
      get().mutateActive((session) => {
        const changed = pixelEditHasChanges(edit) || compound
        revertPixelEdit(session.document, edit)
        if (compound) session.history.abortCompound()
        if (changed) invalidateSessionContent(session)
      }, false)
    },

    commitLiquifyStroke(edit, label, compound, activity, push = false) {
      const current = activeSession(get())
      if (push && current?.liquifySmoothing) {
        const layer = current.document.layers.find((candidate) => candidate.id === edit.layerId)
        if (layer && !layer.kind) smoothChangedLiquifyPixels(current.document, layer, edit, current.selection, current.liquifySmoothingStrength)
      }
      const entry = get().commitPixelEdit(edit, label, activity)
      if (compound) get().mutateActive((session) => {
        if (entry) session.history.endCompound(label)
        else session.history.abortCompound()
        if (entry) session.liquifyResetHistoryRevision = session.history.revision
      }, false)
      else if (entry) get().mutateActive((session) => { session.liquifyResetHistoryRevision = session.history.revision }, false)
      return entry
    },

    commitPixelEdit(edit, label, activity) {
      let committed: HistoryEntry | null = null
      const current = activeSession(get())
      const beforeSelection = current ? captureAnimationSelectionHistory(current) : null
      get().mutateActive((session) => {
        const editedLayer = session.document.layers.find((layer) => layer.id === edit.layerId)
        const layerKind = editedLayer?.kind
        if (layerKind === 'text') {
          revertPixelEdit(session.document, edit)
          set({ message: tr('workspace.text.convertToEditPixels') })
          return
        }
        if (editedLayer?.kind === 'tilemap') {
          if (session.tilemapMode === 'paint') {
            revertPixelEdit(session.document, edit)
            set({ message: tr('workspace.tilemap.convertToEditPixels') })
            return
          }
          const tilesetId = editedLayer.tilemapTilesetId ?? session.selectedTilesetId
          if (!tilesetId) {
            revertPixelEdit(session.document, edit)
            return
          }
          const tilemapEdit = convertTilemapPixelEdit(session.document, edit, session.tilemapMode, tilesetId, () => createId('tile'))
          if (!tilemapEdit || !tilemapTilesetEditHasChanges(tilemapEdit)) return
          const entry: HistoryEntry = {
            label,
            bytes: tilemapTilesetEditBytes(tilemapEdit),
            undo: () => { applyTilemapTilesetDocumentEdit(session.document, tilemapEdit, 'before') },
            redo: () => { applyTilemapTilesetDocumentEdit(session.document, tilemapEdit, 'after') },
            invalidation: { kind: 'full' },
            affectedLayerIds: [edit.layerId],
            contentChanged: true,
            requiresAnimationSync: false
          }
          const afterSelection = beforeSelection ? captureAnimationSelectionHistory(session) : null
          const historyEntry = beforeSelection && afterSelection
            ? historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection)
            : entry
          session.history.push(historyEntry)
          const selectedTileId = tilemapEdit.changedTileIds.at(-1)
          if (selectedTileId) {
            session.selectedTilesetId = tilemapEdit.tilesetId
            session.selectedTileId = selectedTileId
            session.secondaryTileId = session.document.tilesets?.find((tileset) => tileset.id === tilemapEdit.tilesetId)?.tileIds.includes(session.secondaryTileId ?? '')
              ? session.secondaryTileId
              : selectedTileId
          }
          touch(session, true, { kind: 'full' })
          recordDocumentOperation(session, activity)
          committed = historyEntry
          return
        }
        const operationProbe = window.__moonSpriteCanvasProbe
        const historyStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
        const entry = commitPixelEdit(session.document, edit, label, Boolean(session.localHistory) && loadEditorPreferences().localHistoryEnabled)
        operationProbe?.recordOperationStage?.('commit.history-record', performance.now() - historyStartedAt, {
          points: edit.before.size + (edit.points?.count ?? 0),
          runs: edit.runs?.length ?? 0,
          densePixels: edit.denseRegion?.count ?? 0
        })
        if (entry) {
          const afterSelection = beforeSelection ? captureAnimationSelectionHistory(session) : null
          const historyEntry = beforeSelection && afterSelection
            ? historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection)
            : entry
          committed = historyEntry
          const historyPushStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
          inheritCommittedPixelChanges(entry, historyEntry)
          session.history.push(historyEntry)
          operationProbe?.recordOperationStage?.('commit.history-push', performance.now() - historyPushStartedAt)
          const animationSyncStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
          syncActiveAnimationLayer(session.document, edit.layerId)
          operationProbe?.recordOperationStage?.('commit.animation-sync', performance.now() - animationSyncStartedAt)
          const invalidationStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
          // Style proxies add pixels outside the edited source rect. A flipped
          // pasted selection can therefore leave the style-expanded cache
          // partially stale if we invalidate only the raw pixel region.
          const styledLayerEdit = hasEnabledLayerStyles(editedLayer?.layerStyles)
          touch(session, true, styledLayerEdit ? { kind: 'full' } : entry.invalidation)
          operationProbe?.recordOperationStage?.('commit.cache-invalidation', performance.now() - invalidationStartedAt, {
            dirtyPixels: edit.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0,
            dirtyWidth: edit.dirtyRect?.width ?? 0,
            dirtyHeight: edit.dirtyRect?.height ?? 0
          })
          const documentRecordStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
          recordDocumentOperation(session, activity)
          operationProbe?.recordOperationStage?.('commit.document-record', performance.now() - documentRecordStartedAt)
        }
      }, false)
      return committed
    },

    commitTilemapEdit(edit, label, activity) {
      let committed: HistoryEntry | null = null
      get().mutateActive((session) => {
        if (edit.before.size === 0 || edit.after.size === 0) return
        const target = activeTilemapCelTarget(session.document)
        if (!target || target.layer.id !== edit.layerId || target.cel.frameId !== edit.frameId) return
        const invalidation: ContentInvalidationHint = edit.dirtyRect
          ? { kind: 'region', frameId: edit.frameId, rect: { ...edit.dirtyRect } }
          : { kind: 'full' }
        const entry: HistoryEntry = {
          label,
          bytes: tilemapEditBytes(edit),
          undo: () => { applyTilemapDocumentEdit(session.document, edit, 'before') },
          redo: () => { applyTilemapDocumentEdit(session.document, edit, 'after') },
          invalidation,
          affectedLayerIds: [edit.layerId],
          contentChanged: true,
          requiresAnimationSync: false
        }
        session.history.push(entry)
        touch(session, true, invalidation)
        recordDocumentOperation(session, activity)
        committed = entry
      }, false)
      return committed
    },

    commitTilemapTilesetEdit(edit, label, activity) {
      if (!tilemapTilesetEditHasChanges(edit)) return null
      let committed: HistoryEntry | null = null
      get().mutateActive((session) => {
        const target = activeTilemapCelTarget(session.document)
        if (!target || target.layer.id !== edit.tilemapEdit.layerId || target.cel.frameId !== edit.tilemapEdit.frameId) return
        const entry: HistoryEntry = {
          label,
          bytes: tilemapTilesetEditBytes(edit),
          undo: () => { applyTilemapTilesetDocumentEdit(session.document, edit, 'before') },
          redo: () => { applyTilemapTilesetDocumentEdit(session.document, edit, 'after') },
          invalidation: { kind: 'full' },
          affectedLayerIds: [edit.tilemapEdit.layerId],
          contentChanged: true,
          requiresAnimationSync: false
        }
        session.history.push(entry)
        touch(session, true, { kind: 'full' })
        recordDocumentOperation(session, activity)
        committed = entry
      }, false)
      return committed
    },

    setTimelapseSettings(settings) {
      const state = get()
      const session = activeSession(state)
      if (!session) return
      const current = normalizeTimelapseSettings(session.document.timelapse, session.document.timelapse?.snapshots ?? [])
      const next = normalizeTimelapseSettings({ ...current, ...settings }, current.snapshots)
      session.document.timelapse = next
      if (current.mode !== next.mode || !next.enabled) {
        recording.resetSmartCapture(session.document)
        // Already captured drawing frames still belong to the recording.
      } else if (current.recordUndoSteps !== next.recordUndoSteps) {
        // Toggling "record undo steps" only invalidates undo-step captures. A drawing
        // frame that is already waiting for PNG encoding must still be appended,
        // otherwise the operation the user just made disappears from the recording.
        recording.cancelPendingUndoSteps(session.document)
      }
      touch(session)
      set({ sessions: [...state.sessions] })
    },

    clearTimelapse() {
      const state = get()
      const session = activeSession(state)
      if (!session) return
      recording.cancelPending(session.document)
      recording.resetSmartCapture(session.document)
      session.document.timelapse = { ...normalizeTimelapseSettings(session.document.timelapse), snapshots: [] }
      touch(session)
      set({ sessions: [...state.sessions] })
    },

    async exportTimelapse(format, options) {
      const session = activeSession(get())
      if (!session) return false
      let progressStarted = false
      let exportTaskCurrent = 1
      let exportTaskTotal = 1
      let canceled = false
      let nativeCancel: (() => void) | null = null
      const cancel = (): void => {
        if (canceled) return
        canceled = true
        nativeCancel?.()
        if (get().saveProgress) set({ saveProgress: null })
      }
      const onCancelReady = (nextCancel: () => void): void => {
        nativeCancel = nextCancel
        if (canceled) nextCancel()
      }
      workspaceCommandRuntime.activeExportCancellation = cancel
      const exportProgressTitle = (): string => exportTaskTotal > 1
        ? `${tr('workspace.export.progressTitle')} (${exportTaskCurrent}/${exportTaskTotal})`
        : tr('workspace.export.progressTitle')
      const updateProgress = (value: number, label: string): void => {
        if (progressStarted && !get().saveProgress) return
        progressStarted = true
        set({ saveProgress: { title: exportProgressTitle(), value: Math.max(0, Math.min(100, Math.round(value))), label } })
      }
      try {
        await flushTimelapseCapture(session)
        const videoExport = isTimelapseVideoFormat(format)
        exportTaskTotal = videoExport ? 1 : normalizeTimelapseSettings(session.document.timelapse, session.document.timelapse?.snapshots ?? []).snapshots.length
        const encodingLabel = tr(videoExport ? 'workspace.export.videoEncoding' : 'workspace.export.encoding')
        const message = await exportTimelapseFile(window.moonSprite, session.document, format, options, {
          onEncodeStart: () => updateProgress(8, encodingLabel),
          onEncodeProgress: (value) => updateProgress(8 + value * (videoExport ? 0.7 : 0.84), encodingLabel),
          onWriteStart: () => updateProgress(82, tr('workspace.save.writing')),
          onExportTaskStart: (current, total) => {
            exportTaskCurrent = current
            exportTaskTotal = total
            const progress = get().saveProgress
            if (progress) set({ saveProgress: { ...progress, title: exportProgressTitle() } })
          },
          onConflict: createExportConflictHandler(get().requestDialog, exportTaskTotal > 1),
          onCancelReady,
          isCanceled: () => canceled
        })
        if (!message) return false
        set({ message, saveProgress: progressStarted ? { title: exportProgressTitle(), value: 100, label: tr('workspace.export.done'), requiresConfirmation: true } : null })
        recordUsageExport(format)
        playExportSuccessSound()
        window.dispatchEvent(new Event('moonsprite:extension-pet-export'))
        return true
      } catch (error) {
        if (canceled) {
          set({ saveProgress: null })
          return false
        }
        set({ message: error instanceof Error ? error.message : tr('timelapse.exportFailed'), ...(progressStarted ? { saveProgress: null } : {}) })
        return false
      } finally {
        if (workspaceCommandRuntime.activeExportCancellation === cancel) workspaceCommandRuntime.activeExportCancellation = null
      }
    },
    pushHistory(entry) {
      const state = get()
      const session = activeSession(state)
      if (!session) return
      session.history.push(entry)
      if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
      if (entry.documentChanged !== false && entry.requiresAnimationSync !== false) {
        if (entry.affectedLayerIds?.length) for (const layerId of entry.affectedLayerIds) syncActiveAnimationLayer(session.document, layerId)
        else syncActiveAnimationFrame(session.document)
      }
      ensureLayerSelection(session)
      if (entry.requiresAnimationSelectionNormalization === true) normalizeAnimationSelection(session)
      persistProjectLayerPanelState(session)
      if (entry.documentChanged !== false) {
        if (entry.contentChanged === false) touchMetadata(session)
        else touch(session, true, entry.invalidation)
        recordDocumentOperation(session, undefined, entry.contentChanged !== false)
      }
      session.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },

    undo() {
      let session = activeSession(get())
      if (session && isCanvasToolGestureLocked()) {
        const documentId = session.document.id
        deferCanvasShortcut(() => { if (get().activeId === documentId) get().undo() })
        return
      }
      if (session) flushViewPreview(session.document.id)
      session = activeSession(get())
      if (session && consumeCanvasResizePreviewHistory(session.document.id, 'undo')) return
      if (session && consumePendingCanvasGestureHistory(session.document.id, 'undo')) return
      if (session?.pendingPaste) {
        if (undoFloatingSelectionBoxMove(session)) {
          set((state) => ({ sessions: [...state.sessions] }))
          return
        }
        if (restoreMovedClipboardPaste(session)) {
          set((state) => ({ sessions: [...state.sessions] }))
          return
        }
        get().cancelFloatingPaste()
        return
      }
      if (session?.textBoxTransform) get().cancelTextBoxTransform()
      if (!session?.history.canUndo) return
      const showsRollbackProgress = isProjectRollbackHistoryEntry(session.history.latestUndoEntry)
      if (showsRollbackProgress && !workspaceCommandRuntime.isApplyingDeferredProjectRollbackHistory) {
        const documentId = session.document.id
        deferProjectRollbackHistoryChange(() => {
          if (activeSession(get())?.document.id === documentId) get().undo()
        })
        return
      }
      const hadTilesetPanelContent = documentUsesTilesetPanel(session.document)
      get().mutateActive((session) => {
        // History entries for drawing retain the layer/frame activity from the
        // edit. Stop the playhead first so restoring that snapshot returns to
        // the edited cel instead of letting playback immediately advance again.
        if (session.animationPlaying) {
          session.animationPlaying = false
          session.animationPlaybackStartFrameId = null
          clearAnimationLoopPlayback(session)
        }
        const view = { ...session.view }
        const entry = session.history.undo()
        Object.assign(session.view, view)
        if (!entry) return
        // Recordings are a chronology, not a one-frame-per-history-entry stack.
        // Smart sampling and asynchronous encoding break that correspondence;
        // popping here would erase unrelated earlier drawing stages.
        session.liquifyResetHistoryPosition = null
        session.liquifyResetHistoryRevision = null
        if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
        if (entry.documentChanged !== false && entry.requiresAnimationSync !== false) {
          if (entry.affectedLayerIds?.length) for (const layerId of entry.affectedLayerIds) syncActiveAnimationLayer(session.document, layerId)
          else syncActiveAnimationFrame(session.document)
        }
        if (entry.requiresAnimationSelectionNormalization === true) normalizeAnimationSelection(session)
        if (entry.documentChanged !== false) {
          if (entry.contentChanged === false) touchMetadata(session)
          else touch(session, true, entry.invalidation)
          // A preview published before Ctrl+D can outlive the editor's next
          // frame. History owns the restored pixels; drop that stale snapshot.
          if (entry.contentChanged !== false) notifyCanvasPreview(session.document.id, null)
          recordDocumentOperation(session, undefined, entry.contentChanged !== false && shouldCaptureTimelapseHistoryStep(session), 'undo-step')
        }
      }, false)
      const hasTilesetPanelContent = documentUsesTilesetPanel(activeSession(get())?.document)
      if (hadTilesetPanelContent !== hasTilesetPanelContent) requestTilesetPanelVisibility(hasTilesetPanelContent)
    },

    redo() {
      let session = activeSession(get())
      if (session && isCanvasToolGestureLocked()) {
        const documentId = session.document.id
        deferCanvasShortcut(() => { if (get().activeId === documentId) get().redo() })
        return
      }
      if (session) flushViewPreview(session.document.id)
      session = activeSession(get())
      if (session && consumeCanvasResizePreviewHistory(session.document.id, 'redo')) return
      if (session?.textBoxTransform) get().cancelTextBoxTransform()
      session = activeSession(get())
      if (session && consumePendingCanvasGestureHistory(session.document.id, 'redo')) return
      if (session?.pendingPaste && redoFloatingSelectionBoxMove(session)) {
        set((state) => ({ sessions: [...state.sessions] }))
        return
      }
      if (!session?.history.canRedo) return
      const showsRollbackProgress = session.history.timeline.entries[session.history.position]?.label === PROJECT_ROLLBACK_HISTORY_LABEL
      if (showsRollbackProgress && !workspaceCommandRuntime.isApplyingDeferredProjectRollbackHistory) {
        const documentId = session.document.id
        deferProjectRollbackHistoryChange(() => {
          if (activeSession(get())?.document.id === documentId) get().redo()
        })
        return
      }
      const hadTilesetPanelContent = documentUsesTilesetPanel(session.document)
      get().mutateActive((session) => {
        const view = { ...session.view }
        const entry = session.history.redo()
        Object.assign(session.view, view)
        if (!entry) return
        session.liquifyResetHistoryPosition = null
        session.liquifyResetHistoryRevision = null
        if (session.activeLayerMaskId && !findLayerMask(session.document, session.activeLayerMaskId)) session.activeLayerMaskId = null
        if (entry.documentChanged !== false && entry.requiresAnimationSync !== false) {
          if (entry.affectedLayerIds?.length) for (const layerId of entry.affectedLayerIds) syncActiveAnimationLayer(session.document, layerId)
          else syncActiveAnimationFrame(session.document)
        }
        if (entry.requiresAnimationSelectionNormalization === true) normalizeAnimationSelection(session)
        if (entry.documentChanged !== false) {
          if (entry.contentChanged === false) touchMetadata(session)
          else touch(session, true, entry.invalidation)
          if (entry.contentChanged !== false) notifyCanvasPreview(session.document.id, null)
          recordDocumentOperation(session, undefined, entry.contentChanged !== false && shouldCaptureTimelapseHistoryStep(session), 'undo-step')
        }
      }, false)
      const hasTilesetPanelContent = documentUsesTilesetPanel(activeSession(get())?.document)
      if (hadTilesetPanelContent !== hasTilesetPanelContent) requestTilesetPanelVisibility(hasTilesetPanelContent)
    },

    setHistoryPosition(position) {
      const initial = activeSession(get())
      if (!initial || !Number.isFinite(position)) return
      if (isCanvasToolGestureLocked()) {
        const documentId = initial.document.id
        deferCanvasShortcut(() => { if (get().activeId === documentId) get().setHistoryPosition(position) })
        return
      }
      if (consumeCanvasResizePreviewHistory(initial.document.id, position < initial.history.position ? 'undo' : 'redo')) return
      const documentId = initial.document.id
      const target = Math.max(0, Math.min(initial.history.length, Math.trunc(position)))
      if (!workspaceCommandRuntime.isApplyingDeferredProjectRollbackHistory && historyPositionIncludesProjectRollback(initial.history.timeline.entries, initial.history.position, target)) {
        deferProjectRollbackHistoryChange(() => {
          if (activeSession(get())?.document.id === documentId) get().setHistoryPosition(target)
        })
        return
      }
      const maximumSteps = Math.abs(initial.history.position - target) + 16
      for (let step = 0; step < maximumSteps; step += 1) {
        const session = activeSession(get())
        if (!session || session.document.id !== documentId || session.history.position === target) return
        if (session.history.position > target) get().undo()
        else get().redo()
      }
    }
  }
}
