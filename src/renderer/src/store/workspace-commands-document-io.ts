import { resolveDocumentClose } from './workspace-close-coordinator'
import { workspaceCommandRuntime } from './workspace-command-runtime'
import type { SpriteDocument } from '@shared/types-document'
import { checkResourceLimit } from '@/core/resource-policy'
import { captureDocumentImageResizeSnapshot, convertDocumentColorMode, createId, documentImageResizeSnapshotBytes, resizeDocumentAt, resizeDocumentImage, restoreDocumentImageResizeSnapshot } from '@/core/document-model'
import { documentAnimationVisibleContentBounds, documentVisibleContentBounds } from '@/core/document-composite'
import { resizeAnimationCelsAt, syncActiveAnimationFrame, synchronizeLinkedLayerContents } from '@/core/animation'
import { directSourceImageSaveTarget, fileNameFromPath } from '@/core/document-files'
import { openProgress } from '@/core/open-progress'
import { recordRuntimeDiagnostic, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { broadcastExtensionRuntimeEvent } from '@/core/extension-runtime'
import { playExportSuccessSound } from '@/platform/export-success-sound'
import { saveProgress } from '@/core/save-progress'
import { clampSelection } from '@/core/tools-pixel-edit'
import { shiftSelection } from '@/core/selection'
import { recordRecentProject } from '@/core/home-history'
import { SAVE_FORMAT_PREFERENCE_KEY, saveImageKindForPreference } from '@/core/file-preferences'
import { readStoredString } from '@/core/storage'
import { persistProjectLayerPanelState } from '@/core/layer-panel-state'
import { captureFreeTileImageResizeState, resizeFreeTileDocumentImage, validateFreeTileImageResize } from '@/core/free-tile-document'
import { exportDocumentFile, openDocumentFile, saveDocumentFile, type ExportOptions, type SaveAsOptions } from './document-file-service'
import { flushLocalHistoryPersist, scheduleLocalHistoryPersist, restoreLocalHistory } from './local-history-service'
import { startDocumentCloseTask, waitForDocumentCloseTasks } from './document-close-tasks'
import { recordUsageEvent, recordUsageExport } from '@/platform/usage-statistics'
import { captureDocumentCanvasResizeSnapshot, captureDocumentColorModeSnapshot, documentCanvasResizeSnapshotBytes, documentColorModeSnapshotBytes, restoreDocumentCanvasResizeSnapshot, restoreDocumentColorModeSnapshot } from './workspace-document-history'
import { cloneSelectionMask, sessionFromDocument } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceDocumentIoCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'

import { createExportConflictHandler } from './workspace-export-conflicts'
import { requestTilesetPanelVisibility, documentUsesTilesetPanel } from './workspace-tileset-panel'

const exportTaskCount = (document: SpriteDocument, options?: ExportOptions): number => {
  switch (options?.target) {
    case 'frames':
      return Math.max(1, document.animation?.frames.length ?? 1)
    case 'slices': {
      const slices = document.slices ?? []
      return options.sliceId ? (slices.some((slice) => slice.id === options.sliceId) ? 1 : 0) : slices.length
    }
    case 'layer':
      return options.layerId && document.layers.some((layer) => layer.id === options.layerId) ? 1 : document.layers.length
    default:
      return 1
  }
}

const cloneProjectRollbackSnapshot = (document: SpriteDocument): SpriteDocument => structuredClone(document)

const projectRollbackSnapshotBytes = (document: SpriteDocument): number => {
  const buffers = new Set<ArrayBufferLike>()
  const visited = new Set<object>()
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (ArrayBuffer.isView(value)) {
      buffers.add(value.buffer)
      return
    }
    if (value instanceof ArrayBuffer) {
      buffers.add(value)
      return
    }
    if (visited.has(value)) return
    visited.add(value)
    if (Array.isArray(value)) for (const item of value) visit(item)
    else for (const item of Object.values(value)) visit(item)
  }
  visit(document)
  return [...buffers].reduce((total, buffer) => total + buffer.byteLength, 0)
}

const restoreProjectRollbackSnapshot = (session: DocumentSession, snapshot: SpriteDocument): void => {
  const history = session.history
  const recoveryOriginId = session.recoveryOriginId
  const revision = session.revision
  const contentRevision = session.contentRevision
  const layersPanelRevision = session.layersPanelRevision
  const restored = sessionFromDocument(cloneProjectRollbackSnapshot(snapshot))
  Object.assign(session, restored)
  session.history = history
  session.recoveryOriginId = recoveryOriginId
  // Canvas composites are keyed by document ID and content revision. Keep
  // those counters monotonic across a document swap so restored pixels cannot
  // collide with a pre-rollback composite cache entry.
  session.revision = revision
  session.contentRevision = contentRevision
  session.layersPanelRevision = layersPanelRevision
}

const commitCanvasResize = (
  session: DocumentSession,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  trimOutside: boolean,
  label: string,
  selectionMode: 'shift' | 'clear' = 'shift'
): void => {
  const before = captureDocumentCanvasResizeSnapshot(session.document)
  const beforeSelection = cloneSelectionMask(session.selection)
  const beforeSelectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
  const sourceWidth = session.document.width
  const sourceHeight = session.document.height
  const resized = resizeDocumentAt(session.document, width, height, offsetX, offsetY, trimOutside)
  resizeAnimationCelsAt(session.document, resized.offsetX, resized.offsetY, trimOutside, sourceWidth, sourceHeight)
  session.selection = selectionMode === 'clear' ? null : shiftSelection(beforeSelection, resized.offsetX, resized.offsetY, width, height)
  session.selectionPivot = selectionMode === 'clear' || !session.selection || !beforeSelectionPivot
    ? null
    : { x: beforeSelectionPivot.x + resized.offsetX, y: beforeSelectionPivot.y + resized.offsetY }
  session.canvasResizePreview = null
  session.lastPencilPoint = null
  session.lastEraserPoint = null
  const after = captureDocumentCanvasResizeSnapshot(session.document)
  const afterSelection = cloneSelectionMask(session.selection)
  const afterSelectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
  session.history.push({
    label,
    bytes: documentCanvasResizeSnapshotBytes(before) + documentCanvasResizeSnapshotBytes(after) + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 64,
    undo: () => {
      restoreDocumentCanvasResizeSnapshot(session.document, before)
      session.selection = cloneSelectionMask(beforeSelection)
      session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
    },
    redo: () => {
      restoreDocumentCanvasResizeSnapshot(session.document, after)
      session.selection = cloneSelectionMask(afterSelection)
      session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
    },
    requiresAnimationSync: false
  })
}

export function createWorkspaceDocumentIoCommands({ get, set, recording, services: { recoveryService, documentTransactions } }: WorkspaceCommandContext<'addSession' | 'autosaveDirty' | 'commitFloatingPaste' | 'discardRecovery' | 'mutateActive' | 'openFiles' | 'openPath' | 'requestDialog' | 'saveActive' | 'setActive', 'recoveryService' | 'documentTransactions'>): WorkspaceDocumentIoCommands {
  const { flushTimelapseCapture, flushTimelapseCaptures } = recording
  const trimCanvas = async (allFrames: boolean): Promise<void> => {
    get().commitFloatingPaste()
    const current = activeSession(get())
    if (!current) return
    syncActiveAnimationFrame(current.document)
    const bounds = allFrames ? documentAnimationVisibleContentBounds(current.document) : documentVisibleContentBounds(current.document)
    if (!bounds) { set({ message: tr('workspace.trim.empty') }); return }
    if (bounds.x === 0 && bounds.y === 0 && bounds.width === current.document.width && bounds.height === current.document.height) return
    try {
      const resource = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(bounds.width, bounds.height, current.document.layers.length, current.document.colorMode, resource)
      if (!check.allowed) throw new Error(check.reason)
      get().mutateActive((session) => {
        commitCanvasResize(session, bounds.width, bounds.height, -bounds.x, -bounds.y, true, tr('workspace.history.trimCanvas'))
      })
    } catch (error) {
      set({ message: error instanceof Error ? error.message : tr('workspace.canvasResizeError') })
    }
  }
  return {
    flushRecordings: (sessions) => flushTimelapseCaptures(sessions),
    async resizeActiveCanvas(width, height, anchor, offsetX, offsetY, trimOutside = false) {
      const current = activeSession(get())
      if (!current || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) { set({ message: tr('workspace.canvasSizePositive') }); return }
      try {
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(width, height, current.document.layers.length, current.document.colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        get().mutateActive((session) => {
          const horizontal = offsetX ?? (anchor === 'nw' || anchor === 'w' || anchor === 'sw' ? 0 : anchor === 'ne' || anchor === 'e' || anchor === 'se' ? width - session.document.width : Math.floor((width - session.document.width) / 2))
          const vertical = offsetY ?? (anchor === 'nw' || anchor === 'n' || anchor === 'ne' ? 0 : anchor === 'sw' || anchor === 's' || anchor === 'se' ? height - session.document.height : Math.floor((height - session.document.height) / 2))
          commitCanvasResize(session, width, height, horizontal, vertical, trimOutside, tr('canvasResize.title'))
        })
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.canvasResizeError') })
      }
    },

    async cropActiveCanvas() {
      get().commitFloatingPaste()
      const current = activeSession(get())
      const bounds = current?.selection ? clampSelection(current.document, current.selection) : null
      if (!current || !bounds) { set({ message: tr('workspace.crop.selectionRequired') }); return }
      try {
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(bounds.width, bounds.height, current.document.layers.length, current.document.colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        get().mutateActive((session) => {
          commitCanvasResize(session, bounds.width, bounds.height, -bounds.x, -bounds.y, true, tr('workspace.history.cropCanvas'))
        })
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.canvasResizeError') })
      }
    },

    trimActiveCanvas: () => trimCanvas(true),
    trimActiveCanvasCurrentFrame: () => trimCanvas(false),

    async resizeActiveImage(width, height, interpolation) {
      const current = activeSession(get())
      if (!current || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) { set({ message: tr('workspace.imageSizePositive') }); return }
      if (current.document.width === width && current.document.height === height) return
      try {
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(width, height, current.document.layers.length, current.document.colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        validateFreeTileImageResize(current.document, width, height)
        get().mutateActive((session) => {
          const before = captureDocumentImageResizeSnapshot(session.document)
          const freeTileResize = captureFreeTileImageResizeState(session.document)
          const beforeSelection = session.selection ? { ...session.selection } : null
          const sourceWidth = session.document.width
          const sourceHeight = session.document.height
          const scaleX = width / sourceWidth
          const scaleY = height / sourceHeight
          resizeDocumentImage(session.document, width, height, interpolation)
          resizeFreeTileDocumentImage(session.document, freeTileResize, interpolation)
          synchronizeLinkedLayerContents(session.document)
          if (beforeSelection) {
            const nextX = Math.floor(beforeSelection.x * scaleX)
            const nextY = Math.floor(beforeSelection.y * scaleY)
            const nextWidth = Math.max(1, Math.ceil((beforeSelection.x + beforeSelection.width) * scaleX) - nextX)
            const nextHeight = Math.max(1, Math.ceil((beforeSelection.y + beforeSelection.height) * scaleY) - nextY)
            const mask = beforeSelection.mask ? new Uint8Array(nextWidth * nextHeight) : undefined
            if (mask && beforeSelection.mask) {
              const sourceX = new Int32Array(nextWidth)
              const sourceY = new Int32Array(nextHeight)
              for (let x = 0; x < nextWidth; x += 1) sourceX[x] = Math.floor((nextX + x + 0.5) / scaleX) - beforeSelection.x
              for (let y = 0; y < nextHeight; y += 1) sourceY[y] = Math.floor((nextY + y + 0.5) / scaleY) - beforeSelection.y
              for (let y = 0; y < nextHeight; y += 1) {
                const localY = sourceY[y]
                if (localY < 0 || localY >= beforeSelection.height) continue
                const sourceRow = localY * beforeSelection.width
                const targetRow = y * nextWidth
                for (let x = 0; x < nextWidth; x += 1) {
                  const localX = sourceX[x]
                  if (localX >= 0 && localX < beforeSelection.width && beforeSelection.mask[sourceRow + localX]) mask[targetRow + x] = 1
                }
              }
            }
            session.selection = { x: nextX, y: nextY, width: nextWidth, height: nextHeight, mask }
          }
          const after = captureDocumentImageResizeSnapshot(session.document)
          const afterSelection = session.selection ? { ...session.selection } : null
          session.history.push({
            label: tr('imageResize.title'),
            bytes: documentImageResizeSnapshotBytes(before) + documentImageResizeSnapshotBytes(after) + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
            undo: () => { restoreDocumentImageResizeSnapshot(session.document, before); synchronizeLinkedLayerContents(session.document); session.selection = beforeSelection ? { ...beforeSelection } : null },
            redo: () => { restoreDocumentImageResizeSnapshot(session.document, after); synchronizeLinkedLayerContents(session.document); session.selection = afterSelection ? { ...afterSelection } : null },
            requiresAnimationSync: false
          })
        }, 'content')
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.imageResizeError') })
      }
    },

    async convertColorMode(mode) {
      const current = activeSession(get())
      if (!current || current.document.colorMode === mode) return
      const resources = await window.moonSprite.getResourceInfo()
      const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length, mode, resources)
      if (!check.allowed) { set({ message: check.reason }); return }
      // Conversion updates every layer/cel surface in place. Avoid the generic
      // animation surface sync, which would rebind cels to the converted layer
      // buffer and invalidate the undo snapshot's object references.
      get().mutateActive((session) => {
        if (session.document.colorMode === mode) return
        const before = captureDocumentColorModeSnapshot(session.document)
        convertDocumentColorMode(session.document, mode)
        const after = captureDocumentColorModeSnapshot(session.document)
        session.history.push({
          label: tr('workspace.history.convertColorMode'), bytes: documentColorModeSnapshotBytes(before) + documentColorModeSnapshotBytes(after),
          undo: () => restoreDocumentColorModeSnapshot(session.document, before),
          redo: () => restoreDocumentColorModeSnapshot(session.document, after),
          invalidation: { kind: 'full' },
          // Color-mode conversion changes every raster representation and must
          // remain a standalone document history entry. Explicit flags prevent
          // generic history handling from treating it as a metadata-only edit.
          documentChanged: true,
          contentChanged: true,
          requiresAnimationSync: false
        })
      }, 'content')
    },

    async saveActive(saveAs = false, options?: SaveAsOptions) {
      let session = activeSession(get())
      if (!session) return false
      const documentId = session.document.id
      const removeSavedRecovery = (recoveryId: string): void => {
        void recoveryService.delete(window.moonSprite, recoveryId).then(() => {
          set((state) => {
            const recoveredSession = state.sessions.find((item) => item.recoveryOriginId === recoveryId)
            if (recoveredSession) recoveredSession.recoveryOriginId = null
            return {
              recoveryRecords: state.recoveryRecords.filter((item) => item.id !== recoveryId),
              ...(recoveredSession ? { sessions: [...state.sessions] } : {})
            }
          })
        }).catch((error) => {
          console.error('MoonSprite recovery cleanup after save failed', error)
        })
      }
      get().commitFloatingPaste()
      try {
        await flushTimelapseCapture(session)
      } catch (error) {
        set({ message: `${session.document.name}: ${error instanceof Error ? error.message : String(error)}` })
        return false
      }
      session = get().sessions.find((item) => item.document.id === documentId) ?? null
      if (!session) return false
      persistProjectLayerPanelState(session)
      if (!saveAs && !session.document.dirty && (session.document.filePath || directSourceImageSaveTarget(session.document))) {
        if (session.recoveryOriginId) removeSavedRecovery(session.recoveryOriginId)
        set({ message: tr('workspace.save.done') })
        return true
      }
      let finishSaveProgress: ((succeeded?: boolean) => void) | undefined
      const beginSaveProgress = (): void => {
        if (!finishSaveProgress) finishSaveProgress = saveProgress.begin(saveAs ? 'saveAs' : 'save')
      }
      const endSaveProgress = (succeeded = true): void => {
        const finish = finishSaveProgress
        if (finish) finish(succeeded)
      }
      let encodedTimelapseSnapshots = session.document.timelapse?.snapshots
      try {
        const result = await saveDocumentFile({
          api: window.moonSprite,
          documentId,
          getDocument: () => {
            const current = get().sessions.find((item) => item.document.id === documentId)
            encodedTimelapseSnapshots = current?.document.timelapse?.snapshots
            return current ? { document: current.document, revision: current.contentRevision } : null
          },
          saveAs,
          options,
          preferredImageFormat: saveImageKindForPreference(readStoredString(SAVE_FORMAT_PREFERENCE_KEY)),
          lifecycle: {
            onEncodeStart: beginSaveProgress
          }
        })
        if (!result) { endSaveProgress(false); return false }
        const saved = get().sessions.find((item) => item.document.id === documentId)
        if (!saved) { endSaveProgress(false); return false }
        if (result.setDocumentFilePath) saved.document.filePath = result.filePath
        else saved.document.sourceFilePath = result.filePath
        saved.document.name = fileNameFromPath(result.filePath)
        persistProjectLayerPanelState(saved)
        const fullySaved = saved.contentRevision === result.revision
          && saved.document.timelapse?.snapshots === encodedTimelapseSnapshots
        if (runtimeDiagnosticsActive()) recordRuntimeDiagnostic('operation-stage', 'project.save.recording', {
          documentId, encodedFrames: encodedTimelapseSnapshots?.length ?? 0,
          currentFrames: saved.document.timelapse?.snapshots.length ?? 0,
          pending: recording.pendingCount(saved.document),
          format: result.filePath.split('.').pop()?.toLowerCase() ?? '',
          fullySaved, encodedRevision: result.revision, currentRevision: saved.contentRevision
        })
        saved.document.dirty = !fullySaved
        set({ sessions: [...get().sessions] })
        recordRecentProject(result.filePath, saved.document.name)
        scheduleLocalHistoryPersist(window.moonSprite, saved)
        const latest = get().sessions.find((item) => item.document.id === documentId)
        if (latest && latest.contentRevision === result.revision && !latest.document.dirty) {
          removeSavedRecovery(latest.recoveryOriginId ?? documentId)
        } else {
          // A save that raced with newer edits should finish immediately; recovery
          // protection continues in the background instead of extending Ctrl+S.
          void get().autosaveDirty().catch(() => undefined)
        }
        set({ message: fullySaved ? tr('workspace.save.done') : tr('workspace.save.newerChanges') })
        endSaveProgress()
        recordUsageEvent('save')
        return true
      } catch (error) {
        endSaveProgress(false)
        set({ message: error instanceof Error ? error.message : tr('workspace.save.error') })
        return false
      }
    },

    async exportActive(options) {
      get().commitFloatingPaste()
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
        const encodingLabel = tr('workspace.export.encoding')
        const exportOptions: ExportOptions | undefined = options
          ? { ...options, selection: options.target === 'selection' ? session.selection : undefined }
          : options
        exportTaskTotal = exportTaskCount(session.document, exportOptions)
        const message = await exportDocumentFile(window.moonSprite, session.document, exportOptions, {
          onEncodeStart: () => updateProgress(12, encodingLabel),
          onEncodeProgress: (value) => updateProgress(12 + value * 0.86, encodingLabel),
          onWriteStart: () => updateProgress(72, tr('workspace.save.writing')),
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
        if (!message) { if (progressStarted) set({ saveProgress: null }); return false }
        const progressVisible = progressStarted && Boolean(get().saveProgress)
        set({ message, ...(progressVisible ? { saveProgress: { title: exportProgressTitle(), value: 100, label: tr('workspace.export.done') } } : {}) })
        if (progressVisible) window.setTimeout(() => { if (get().saveProgress?.value === 100) set({ saveProgress: null }) }, 180)
        recordUsageExport(exportOptions?.format ?? 'png')
        playExportSuccessSound()
        broadcastExtensionRuntimeEvent({ type: 'export-complete', projectId: session.document.id, format: exportOptions?.format })
        return true
      } catch (error) {
        if (canceled) {
          set({ saveProgress: null })
          return false
        }
        set({ message: error instanceof Error ? error.message : tr('workspace.export.error'), ...(progressStarted ? { saveProgress: null } : {}) })
        return false
      } finally {
        if (workspaceCommandRuntime.activeExportCancellation === cancel) workspaceCommandRuntime.activeExportCancellation = null
      }
    },

    async openFiles() {
      const result = await window.moonSprite.openFiles()
      if (!result.canceled) {
        for (const filePath of result.filePaths) await get().openPath(filePath)
      }
    },

    async openPath(filePath, options) {
      const finishOpenProgress = openProgress.begin()
      try {
        await waitForDocumentCloseTasks(filePath)
        let droppedTimelapseFrames = 0
        let restoredTimelapseFrames = 0
        const parsed = await openDocumentFile(window.moonSprite, filePath, {
          onDroppedTimelapseFrames: (report) => {
            droppedTimelapseFrames += report.droppedTimelapseFrames
            restoredTimelapseFrames = report.timelapseFrames
          }
        })
        if (options?.duplicate) parsed.id = createId('doc')
        options?.onBeforeSession?.()
        get().addSession(parsed)
        const opened = get().sessions.find((session) => session.document.id === parsed.id)
        if (opened) {
          try {
            await restoreLocalHistory(window.moonSprite, opened)
            set({ sessions: [...get().sessions] })
          } catch (historyError) {
            console.error('MoonSprite local history restore failed', historyError)
          }
        }
        recordRecentProject(filePath, parsed.name)
        finishOpenProgress()
        // A damaged archive must not look like a clean restore of every frame.
        if (droppedTimelapseFrames > 0) {
          set({ message: tr('workspace.open.timelapseFramesDropped', { dropped: droppedTimelapseFrames, count: restoredTimelapseFrames }) })
        }
        return true
      } catch (error) {
        finishOpenProgress(false)
        set({ message: error instanceof Error ? `${fileNameFromPath(filePath)}: ${error.message}` : tr('workspace.open.error') })
        return false
      }
    },

    async closeDocument(id) {
      const session = get().sessions.find((item) => item.document.id === id)
      if (!session) return
      const preserveOpenedRecovery = session.recoveryOriginId !== null
      const recoverySuppressedBeforeClose = session.recoverySuppressed
      if (documentTransactions.cancelDocument(id, session)) set((state) => ({ sessions: [...state.sessions] }))
      // Land the recording before deciding what to do with the document. A frame that
      // is still waiting for PNG encoding would otherwise be cancelled below and lost
      // even when the user chose to save, or silently with a clean document.
      try {
        await flushTimelapseCapture(session)
      } catch (error) {
        recordRuntimeDiagnostic('error', 'timelapse.flush', {
          documentId: id, message: error instanceof Error ? error.message : String(error)
        })
        set({ message: `${session.document.name}: ${error instanceof Error ? error.message : String(error)}` })
        return
      }
      let discardClosedRecovery = !session.document.dirty && !preserveOpenedRecovery
      const choice = await resolveDocumentClose(session.document.dirty, () => get().requestDialog({ title: tr('workspace.unsaved.title'), message: tr('workspace.unsaved.message', { name: session.document.name }), detail: tr('workspace.unsaved.detail'), choices: [{ id: 'cancel', label: tr('common.cancel'), tone: 'quiet' }, { id: 'discard', label: tr('app.discard'), tone: 'danger' }, { id: 'save', label: tr('common.save'), tone: 'primary' }] }), async () => {
        get().setActive(id)
        return get().saveActive()
      })
      if (choice === 'cancel') return
      if (choice === 'discard' && !preserveOpenedRecovery) discardClosedRecovery = true
      discardClosedRecovery ||= !session.document.dirty && !preserveOpenedRecovery
      if (discardClosedRecovery) session.recoverySuppressed = true
      startDocumentCloseTask(session.document.filePath || session.document.sourceFilePath || id, async () => {
        await flushLocalHistoryPersist(window.moonSprite, session)
        if (discardClosedRecovery) await get().discardRecovery(id)
      }, historyError => {
        console.error('MoonSprite local history close flush failed', historyError)
        session.recoverySuppressed = recoverySuppressedBeforeClose
        set(state => ({
          sessions: state.sessions.some(item => item.document.id === id) ? state.sessions : [...state.sessions, session],
          activeId: state.activeId ?? id,
          message: `${session.document.name}: ${historyError instanceof Error ? historyError.message : String(historyError)}`
        }))
      })
      recording.cancelPending(session.document)
      set((state) => {
        const sessions = state.sessions.filter((item) => item.document.id !== id)
        return { sessions, activeId: state.activeId === id ? (sessions.at(-1)?.document.id ?? null) : state.activeId }
      })
      const active = activeSession(get())
      requestTilesetPanelVisibility(documentUsesTilesetPanel(active?.document))
    },

    restoreProjectBackup(documentId, document) {
      const current = get().sessions.find((session) => session.document.id === documentId)
      if (!current || get().activeId !== documentId) return false
      const identity = {
        id: current.document.id,
        name: current.document.name,
        filePath: current.document.filePath,
        sourceFilePath: current.document.sourceFilePath
      }
      const before = cloneProjectRollbackSnapshot(current.document)
      const after = cloneProjectRollbackSnapshot(document)
      Object.assign(after, identity, { dirty: before.dirty })
      let restored = false
      get().mutateActive((session) => {
        if (session.document.id !== documentId) return
        restoreProjectRollbackSnapshot(session, after)
        session.history.push({
          label: '回档工程备份',
          bytes: projectRollbackSnapshotBytes(before) + projectRollbackSnapshotBytes(after),
          undo: () => restoreProjectRollbackSnapshot(session, before),
          redo: () => restoreProjectRollbackSnapshot(session, after),
          invalidation: { kind: 'full' }
        })
        restored = true
      }, 'content', true)
      return restored
    }
  }
}
