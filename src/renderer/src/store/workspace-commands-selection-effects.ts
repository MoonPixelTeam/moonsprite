import { type WorkspaceRecording } from './workspace-recording'
import type { RasterLayer } from '@shared/types-layer'
import type { OutlineSettings } from '@shared/types-selection'
import { commitPixelEdit, revertPixelEdit, type HistoryEntry, type PixelEdit } from '@/core/history'
import { animationMaskAt, isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { animationLayerAtFrame, parseAnimationCelKey, syncActiveAnimationFrame } from '@/core/animation'
import { antiAliasSelection, outlineSelection, outlineSelectionBoundary } from '@/core/tools-outline'
import { clearSelection, fillSelectionOrCanvas } from '@/core/tools-fill'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { cloneOutlineSettings, defaultOutlineSettings, normalizeOutlineSettings } from '@/core/outline-settings'
import { freeTileInstanceBounds, freeTileSourceForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster } from '@/core/free-tile-edit'
import { activeLayerMask, activePaintLayer, selectedTransformLayersForSession } from './workspace-session'
import type { AntiAliasPreview } from './workspace-state'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { commitFreeTileSourceEditInSession } from './workspace-free-tile-transaction'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { completeDocumentChange } from './workspace-document-change'

const restoreAntiAliasPreviewState = (session: DocumentSession, preview: AntiAliasPreview): void => {
  for (let index = preview.edits.length - 1; index >= 0; index -= 1) revertPixelEdit(session.document, preview.edits[index])
  syncActiveAnimationFrame(session.document)
}

const invalidateAntiAliasPreview = (session: DocumentSession): void => {
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.contentInvalidation = {
    kind: 'full',
    fromRevision,
    revision: session.contentRevision
  }
  session.selectionGuidesPreservedAtContentRevision = session.contentRevision
}

const persistOutlineSettings = (settings: OutlineSettings): void => {
  const preferences = loadEditorPreferences()
  saveEditorPreferences({
    ...preferences,
    outlineSettings: cloneOutlineSettings(settings)
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonsprite:preferences-changed'))
}

const savedOutlineSettingsForSession = (session: DocumentSession): OutlineSettings => {
  const projectSettings = session.document.outlineSettings ? normalizeOutlineSettings(session.document.outlineSettings, session.primaryColor) : null
  const softwarePreference = loadEditorPreferences().outlineSettings
  const softwareSettings = softwarePreference ? normalizeOutlineSettings(softwarePreference, session.primaryColor) : null
  return projectSettings ?? softwareSettings ?? defaultOutlineSettings(session.primaryColor)
}

const deleteFreeTileSourceSelectionInSession = (recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'], session: DocumentSession): HistoryEntry | null => {
  if (!session.selection || session.freeTileMode !== 'edit') return null
  const target = activeFreeTileCelTarget(session.document)
  const instance = target && session.selectedFreeTileInstanceId ? (target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null) : null
  const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
  const sourceLayer = source ? target?.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
  if (!target || !instance || !source || sourceLayer?.locked === true || source.visible === false || instance.locked === true || instance.visible === false) return null
  const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
  const sourceEdit = createFreeTileSourceEditRaster(session.document, source, bounds, { x: session.selection.x, y: session.selection.y }, instance)
  if (!sourceEdit) return null
  const selection = freeTileSelectionToEditRaster(sourceEdit, session.selection)
  const edit = selection ? clearSelection(sourceEdit.document, selection, sourceEdit.layer) : null
  if (!edit) return null
  return commitFreeTileSourceEditInSession(recordDocumentOperation, session, source.id, sourceEdit.before, freeTileSourceSnapshotFromEditRaster(sourceEdit), tr('workspace.history.deleteSelection'))
}

interface SelectionEffectTarget {
  layer: RasterLayer
  frameId?: string
  mask: boolean
}

const selectedEffectTargets = (session: DocumentSession): SelectionEffectTarget[] => {
  const timeline = session.document.animation
  const targets: SelectionEffectTarget[] = []
  const seenPixels = new Set<object>()
  const collect = (layer: RasterLayer | null, frameId?: string, mask = false): void => {
    if (!layer || layer.kind || seenPixels.has(layer.pixels)) return
    seenPixels.add(layer.pixels)
    targets.push({ layer, frameId, mask })
  }

  syncActiveAnimationFrame(session.document)
  if (timeline && session.selectedAnimationMaskCellKeys.length > 0) {
    for (const key of session.selectedAnimationMaskCellKeys) {
      const target = parseAnimationCelKey(key)
      if (target) collect(animationMaskAt(timeline, target.layerId, target.frameId), target.frameId, true)
    }
    return targets
  }
  if (timeline && session.selectedAnimationCellKeys.length > 0) {
    for (const key of session.selectedAnimationCellKeys) {
      const target = parseAnimationCelKey(key)
      if (target) collect(animationLayerAtFrame(session.document, target.layerId, target.frameId), target.frameId)
    }
    return targets
  }

  const layers = selectedTransformLayersForSession(session)
  if (timeline && session.selectedAnimationFrameIds.length > 0) {
    for (const frameId of session.selectedAnimationFrameIds) {
      for (const layer of layers) collect(animationLayerAtFrame(session.document, layer.id, frameId), frameId)
    }
    return targets
  }

  const frameId = timeline?.activeFrameId
  for (const layer of layers) collect(frameId ? animationLayerAtFrame(session.document, layer.id, frameId) : layer, frameId)
  return targets
}

const selectionEffectUsesMultipleTargets = (session: DocumentSession): boolean =>
  selectedTransformLayersForSession(session).length > 1
  || session.selectedAnimationFrameIds.length > 1
  || session.selectedAnimationCellKeys.length > 1
  || session.selectedAnimationMaskCellKeys.length > 1

const commitSelectedEffectInSession = (
  recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'],
  session: DocumentSession,
  label: string,
  createEdit: (target: SelectionEffectTarget) => PixelEdit | null
): HistoryEntry | null => {
  const edits: PixelEdit[] = []
  for (const target of selectedEffectTargets(session)) {
    const edit = createEdit(target)
    if (!edit) continue
    if (target.frameId) edit.frameId = target.frameId
    edits.push(edit)
  }
  if (edits.length === 0) return null

  const capturePersistentChanges = Boolean(session.localHistory) && loadEditorPreferences().localHistoryEnabled
  let committedCount = 0
  session.history.beginCompound()
  try {
    for (const edit of edits) {
      const entry = commitPixelEdit(session.document, edit, label, capturePersistentChanges)
      if (entry) {
        session.history.push(entry)
        committedCount += 1
      }
    }
    session.history.endCompound(label)
  } catch (error) {
    session.history.abortCompound()
    for (let index = edits.length - 1; index >= 0; index -= 1) revertPixelEdit(session.document, edits[index])
    syncActiveAnimationFrame(session.document)
    throw error
  }

  const entry = committedCount > 0 ? session.history.latestUndoEntry : null
  syncActiveAnimationFrame(session.document)
  if (entry) {
    session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
    completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
  }
  return entry
}

const deleteSelectedTargetsInSession = (
  recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'],
  session: DocumentSession
): HistoryEntry | null => {
  if (!session.selection) return null
  return commitSelectedEffectInSession(recordDocumentOperation, session, tr('workspace.history.deleteSelection'), (target) => target.mask
    ? fillSelectionOrCanvas(session.document, target.layer, session.secondaryColor, session.selection)
    : clearSelection(session.document, session.selection!, target.layer))
}

export function createSelectionEffectsCommands({ get, set, recording }: WorkspaceCommandContext<'cancelFloatingPaste' | 'commitFloatingPaste' | 'commitPixelEdit' | 'mutateActive' | 'outlineActiveSelection'>): Pick<WorkspaceViewSelectionCommands, 'deleteSelection' | 'fillForeground' | 'outlineActiveSelection' | 'quickOutlineActiveSelection' | 'outlineSelectionInside' | 'antiAliasSelection' | 'previewAntiAliasSelection' | 'restoreAntiAliasPreview'> {
  const { recordDocumentOperation } = recording
  return {
    deleteSelection() {
      const current = activeSession(get())
      if (current?.pendingPaste) {
        get().cancelFloatingPaste()
        return
      }
      if (!current?.selection) return
      if (activePaintLayer(current).kind === 'free-tile' && current.freeTileMode === 'edit' && current.selectedFreeTileInstanceId) {
        get().mutateActive((session) => {
          deleteFreeTileSourceSelectionInSession(recordDocumentOperation, session)
        }, false)
        return
      }
      if (selectionEffectUsesMultipleTargets(current)) {
        get().mutateActive((session) => {
          deleteSelectedTargetsInSession(recordDocumentOperation, session)
        }, false)
        return
      }
      const mask = activeLayerMask(current)
      if (mask) {
        const edit = fillSelectionOrCanvas(current.document, mask, current.secondaryColor, current.selection)
        if (edit) get().commitPixelEdit(edit, tr('workspace.history.deleteSelection'))
        return
      }
      const operationProbe = window.__moonSpriteCanvasProbe
      const editStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      const edit = clearSelection(current.document, current.selection, activePaintLayer(current))
      operationProbe?.recordOperationStage?.('selection-delete.build-edit', performance.now() - editStartedAt, {
        points: edit?.before.size ?? 0,
        runs: edit?.runs?.length ?? 0,
        densePixels: edit?.denseRegion?.count ?? 0,
        dirtyPixels: edit?.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0
      })
      if (!edit) return
      const commitStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      get().commitPixelEdit(edit, tr('workspace.history.deleteSelection'))
      operationProbe?.recordOperationStage?.('selection-delete.commit-total', performance.now() - commitStartedAt)
    },
    fillForeground() {
      const current = activeSession(get())
      if (!current) return
      if (current.pendingPaste) get().commitFloatingPaste()
      const session = activeSession(get())
      if (!session) return
      const layer = activePaintLayer(session)
      if (layer.kind === 'free-tile' && session.freeTileMode === 'edit' && session.selectedFreeTileInstanceId) {
        const target = activeFreeTileCelTarget(session.document)
        const instance = target?.layer.id === layer.id ? (target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null) : null
        const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
        const sourceLayer = source ? layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
        if (!target || !instance || !source || !sourceLayer || sourceLayer.locked === true || source.visible === false || instance.locked === true || instance.visible === false) return
        const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        const sourceEdit = createFreeTileSourceEditRaster(session.document, source, bounds, session.selection ? { x: session.selection.x, y: session.selection.y } : undefined, instance)
        if (!sourceEdit) return
        const selection = freeTileSelectionToEditRaster(sourceEdit, session.selection) ?? {
          x: sourceEdit.sourceOffset.x,
          y: sourceEdit.sourceOffset.y,
          width: sourceEdit.transformedSourceBounds.width,
          height: sourceEdit.transformedSourceBounds.height
        }
        const edit = fillSelectionOrCanvas(sourceEdit.document, sourceEdit.layer, session.primaryColor, selection)
        if (!edit) {
          set({ message: tr('workspace.fill.empty') })
          return
        }
        commitFreeTileSourceEditInSession(
          recordDocumentOperation,
          session,
          source.id,
          sourceEdit.before,
          freeTileSourceSnapshotFromEditRaster(sourceEdit),
          session.selection ? tr('workspace.history.fillSelectionForeground') : tr('workspace.history.fillCanvasForeground')
        )
        return
      }
      if (selectionEffectUsesMultipleTargets(session)) {
        let result: 'done' | 'empty' | 'locked' | 'invisible' = 'empty'
        get().mutateActive((active) => {
          const targets = selectedEffectTargets(active)
          if (selectedTransformLayersForSession(active).some((candidate) => candidate.kind)) return
          if (targets.some((target) => !isLayerEffectivelyVisible(active.document, target.layer))) {
            result = 'invisible'
            return
          }
          if (targets.some((target) => isLayerEffectivelyLocked(active.document, target.layer))) {
            result = 'locked'
            return
          }
          const label = active.selection ? tr('workspace.history.fillSelectionForeground') : tr('workspace.history.fillCanvasForeground')
          const entry = commitSelectedEffectInSession(recordDocumentOperation, active, label, (target) =>
            fillSelectionOrCanvas(active.document, target.layer, active.primaryColor, active.selection))
          if (entry) result = 'done'
        }, false)
        if (result === 'empty') set({ message: tr('workspace.fill.empty') })
        else if (result === 'locked') set({ message: tr('workspace.fill.locked') })
        else if (result === 'invisible') set({ message: tr('workspace.fill.invisible') })
        return
      }
      if (!isLayerEffectivelyVisible(session.document, layer)) {
        set({ message: tr('workspace.fill.invisible') })
        return
      }
      if (isLayerEffectivelyLocked(session.document, layer)) {
        set({ message: tr('workspace.fill.locked') })
        return
      }
      const operationProbe = window.__moonSpriteCanvasProbe
      const editStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      const edit = fillSelectionOrCanvas(session.document, layer, session.primaryColor, session.selection)
      operationProbe?.recordOperationStage?.('selection-fill.build-edit', performance.now() - editStartedAt, {
        points: edit?.before.size ?? 0,
        runs: edit?.runs?.length ?? 0,
        densePixels: edit?.denseRegion?.count ?? 0,
        dirtyPixels: edit?.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0
      })
      if (!edit) {
        set({ message: tr('workspace.fill.empty') })
        return
      }
      const commitStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      get().commitPixelEdit(edit, session.selection ? tr('workspace.history.fillSelectionForeground') : tr('workspace.history.fillCanvasForeground'))
      operationProbe?.recordOperationStage?.('selection-fill.commit-total', performance.now() - commitStartedAt)
    },
    outlineActiveSelection(settings) {
      const session = activeSession(get())
      if (!session) return false
      const normalized = normalizeOutlineSettings(settings, session.primaryColor)!
      const historyLabel = normalized.position === 'inside' ? tr('workspace.history.outlineInside') : normalized.position === 'both' ? tr('workspace.history.outlineBoth') : tr('workspace.history.outlineOutside')
      const positionLabel = normalized.position === 'inside' ? tr('outline.inside') : normalized.position === 'both' ? tr('outline.both') : tr('outline.outside')
      if (selectionEffectUsesMultipleTargets(session)) {
        let applied = false
        try {
          get().mutateActive((active) => {
            const targets = selectedEffectTargets(active)
            if (targets.some((target) => isLayerEffectivelyLocked(active.document, target.layer))) return
            const entry = commitSelectedEffectInSession(recordDocumentOperation, active, historyLabel, (target) => outlineSelection(
              active.document,
              target.layer,
              active.selection,
              normalized.color,
              normalized.thickness,
              normalized.position,
              normalized.directions,
              normalized.kernel,
              normalized.smartHue,
              normalized.smartHueDarkness,
              normalized.backgroundColor,
              normalized.followOpacity
            ))
            if (!entry) return
            active.document.outlineSettings = cloneOutlineSettings(normalized)
            applied = true
          }, false)
          if (!applied) {
            set({ message: tr('workspace.outline.noContent') })
            return false
          }
          persistOutlineSettings(normalized)
          set({ message: tr('workspace.outline.applied', { thickness: normalized.thickness, position: positionLabel }) })
          return true
        } catch (error) {
          set({ message: error instanceof Error ? error.message : tr('workspace.outline.applyError') })
          return false
        }
      }
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) {
        set({ message: tr('workspace.clipboard.layerLocked') })
        return false
      }
      try {
        const edit = outlineSelection(
          session.document,
          layer,
          session.selection,
          normalized.color,
          normalized.thickness,
          normalized.position,
          normalized.directions,
          normalized.kernel,
          normalized.smartHue,
          normalized.smartHueDarkness,
          normalized.backgroundColor,
          normalized.followOpacity
        )
        if (!edit) {
          set({ message: tr('workspace.outline.noContent') })
          return false
        }
        session.document.outlineSettings = cloneOutlineSettings(normalized)
        persistOutlineSettings(normalized)
        get().commitPixelEdit(edit, historyLabel)
        set({
          message: tr('workspace.outline.applied', {
            thickness: normalized.thickness,
            position: positionLabel
          })
        })
        return true
      } catch (error) {
        set({
          message: error instanceof Error ? error.message : tr('workspace.outline.applyError')
        })
        return false
      }
    },
    quickOutlineActiveSelection() {
      const session = activeSession(get())
      if (!session) return false
      const settings = savedOutlineSettingsForSession(session)
      // Quick outline follows geometry/direction preferences but always uses
      // the foreground color at the moment the shortcut is pressed.
      return get().outlineActiveSelection({
        ...settings,
        color: { ...session.primaryColor },
        smartHue: false
      })
    },
    outlineSelectionInside() {
      const session = activeSession(get())
      if (!session) return false
      if (!session.selection) {
        set({ message: tr('app.selection.required') })
        return false
      }
      const settings = savedOutlineSettingsForSession(session)
      // The S command is deliberately a one-shot inside stroke; it does not
      // change the user's saved Shift+O position preference.
      const insideSettings = {
        ...settings,
        position: 'inside' as const,
        color: { ...session.primaryColor },
        smartHue: false
      }
      if (selectionEffectUsesMultipleTargets(session)) {
        let applied = false
        try {
          get().mutateActive((active) => {
            const targets = selectedEffectTargets(active)
            if (targets.some((target) => isLayerEffectivelyLocked(active.document, target.layer))) return
            applied = Boolean(commitSelectedEffectInSession(recordDocumentOperation, active, tr('workspace.history.outlineInside'), (target) => outlineSelectionBoundary(
              active.document,
              target.layer,
              active.selection!,
              insideSettings.color,
              insideSettings.thickness,
              insideSettings.directions,
              insideSettings.kernel,
              insideSettings.smartHue,
              insideSettings.smartHueDarkness,
              insideSettings.followOpacity
            )))
          }, false)
          if (!applied) {
            set({ message: tr('workspace.outline.noContent') })
            return false
          }
          set({ message: tr('workspace.outline.applied', { thickness: insideSettings.thickness, position: tr('outline.inside') }) })
          return true
        } catch (error) {
          set({ message: error instanceof Error ? error.message : tr('workspace.outline.applyError') })
          return false
        }
      }
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) {
        set({ message: tr('workspace.clipboard.layerLocked') })
        return false
      }
      try {
        const edit = outlineSelectionBoundary(
          session.document,
          layer,
          session.selection,
          insideSettings.color,
          insideSettings.thickness,
          insideSettings.directions,
          insideSettings.kernel,
          insideSettings.smartHue,
          insideSettings.smartHueDarkness,
          insideSettings.followOpacity
        )
        if (!edit) {
          set({ message: tr('workspace.outline.noContent') })
          return false
        }
        get().commitPixelEdit(edit, tr('workspace.history.outlineInside'))
        set({
          message: tr('workspace.outline.applied', {
            thickness: insideSettings.thickness,
            position: tr('outline.inside')
          })
        })
        return true
      } catch (error) {
        set({
          message: error instanceof Error ? error.message : tr('workspace.outline.applyError')
        })
        return false
      }
    },
    antiAliasSelection(color, autoColorOpacity, includeInteriorColors, colorSource) {
      const session = activeSession(get())
      if (!session) return false
      if (selectionEffectUsesMultipleTargets(session)) {
        let applied = false
        get().mutateActive((active) => {
          const targets = selectedEffectTargets(active)
          if (targets.some((target) => isLayerEffectivelyLocked(active.document, target.layer))) return
          applied = Boolean(commitSelectedEffectInSession(recordDocumentOperation, active, tr('workspace.history.antiAlias'), (target) =>
            antiAliasSelection(active.document, target.layer, active.selection, color, autoColorOpacity, includeInteriorColors, colorSource)))
        }, false)
        if (!applied) set({ message: tr('workspace.outline.noContent') })
        return applied
      }
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) {
        set({ message: tr('workspace.clipboard.layerLocked') })
        return false
      }
      const edit = antiAliasSelection(session.document, layer, session.selection, color, autoColorOpacity, includeInteriorColors, colorSource)
      if (!edit) {
        set({ message: tr('workspace.outline.noContent') })
        return false
      }
      get().commitPixelEdit(edit, tr('workspace.history.antiAlias'))
      return true
    },
    previewAntiAliasSelection(color, autoColorOpacity, includeInteriorColors, colorSource, previous = null) {
      const state = get()
      const changedSessions = new Set<DocumentSession>()
      if (previous) {
        const previousSession = state.sessions.find((candidate) => candidate.document.id === previous.documentId)
        if (previousSession) {
          restoreAntiAliasPreviewState(previousSession, previous)
          invalidateAntiAliasPreview(previousSession)
          changedSessions.add(previousSession)
        }
      }
      const session = activeSession(state)
      if (!session) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      const targets = selectedEffectTargets(session)
      if (targets.length === 0 || targets.some((target) => isLayerEffectivelyLocked(session.document, target.layer))) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      const edits = targets.flatMap((target) => {
        const edit = antiAliasSelection(session.document, target.layer, session.selection, color, autoColorOpacity, includeInteriorColors, colorSource)
        if (!edit) return []
        if (target.frameId) edit.frameId = target.frameId
        return [edit]
      })
      if (edits.length === 0) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      syncActiveAnimationFrame(session.document)
      invalidateAntiAliasPreview(session)
      changedSessions.add(session)
      set({ sessions: [...state.sessions] })
      return { documentId: session.document.id, edits }
    },
    restoreAntiAliasPreview(preview) {
      if (!preview) return
      const state = get()
      const session = state.sessions.find((candidate) => candidate.document.id === preview.documentId)
      if (!session) return
      restoreAntiAliasPreviewState(session, preview)
      invalidateAntiAliasPreview(session)
      set({ sessions: [...state.sessions] })
    }
  }
}
