import { type WorkspaceRecording } from './workspace-recording'
import type { OutlineSettings } from '@shared/types-selection'
import { commitPixelEdit, revertPixelEdit, type HistoryEntry } from '@/core/history'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { syncActiveAnimationFrame } from '@/core/animation'
import { antiAliasSelection, outlineSelection, outlineSelectionBoundary } from '@/core/tools-outline'
import { clearSelection, fillSelectionOrCanvas } from '@/core/tools-fill'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { cloneOutlineSettings, defaultOutlineSettings, normalizeOutlineSettings } from '@/core/outline-settings'
import { freeTileInstanceBounds, freeTileSourceForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster } from '@/core/free-tile-edit'
import { activeLayerMask, activePaintLayer } from './workspace-session'
import type { AntiAliasPreview } from './workspace-state'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { commitFreeTileSourceEditInSession } from './workspace-free-tile-transaction'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { selectedGroupRows } from './workspace-animation-selection'

const restoreAntiAliasPreviewState = (session: DocumentSession, preview: AntiAliasPreview): void => {
  revertPixelEdit(session.document, preview.edit)
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
      if (selectedGroupRows(current).length > 0) return
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
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) {
        set({ message: tr('workspace.clipboard.layerLocked') })
        return false
      }
      try {
        const normalized = normalizeOutlineSettings(settings, session.primaryColor)!
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
        const historyLabel = normalized.position === 'inside' ? tr('workspace.history.outlineInside') : normalized.position === 'both' ? tr('workspace.history.outlineBoth') : tr('workspace.history.outlineOutside')
        const positionLabel = normalized.position === 'inside' ? tr('outline.inside') : normalized.position === 'both' ? tr('outline.both') : tr('outline.outside')
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
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      const edit = antiAliasSelection(session.document, layer, session.selection, color, autoColorOpacity, includeInteriorColors, colorSource)
      if (!edit) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      syncActiveAnimationFrame(session.document)
      invalidateAntiAliasPreview(session)
      changedSessions.add(session)
      set({ sessions: [...state.sessions] })
      return { documentId: session.document.id, edit }
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
