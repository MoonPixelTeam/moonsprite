import type { OutlineSettings } from '@shared/types-selection'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import { antiAliasSelection, outlineSelection, outlineSelectionBoundary } from '@/core/tools-outline'
import { clearSelection, fillSelectionOrCanvas } from '@/core/tools-fill'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { cloneOutlineSettings, defaultOutlineSettings, normalizeOutlineSettings } from '@/core/outline-settings'
import { freeTileInstanceBounds, freeTileSourceForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster } from '@/core/free-tile-edit'
import { activeLayerMask, activePaintLayer, selectedTransformLayersForSession } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { commitFreeTileSourceEditInSession } from './workspace-free-tile-transaction'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { createSelectionAntiAliasCommands } from './workspace-commands-selection-anti-alias'
import { commitSelectedEffectInSession, deleteFreeTileSourceSelectionInSession, deleteSelectedTargetsInSession, selectedEffectTargets, selectionEffectUsesMultipleTargets } from './workspace-selection-effects-support'

const persistOutlineSettings = (settings: OutlineSettings): void => {
  const preferences = loadEditorPreferences()
  saveEditorPreferences({ ...preferences, outlineSettings: cloneOutlineSettings(settings) })
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonsprite:preferences-changed'))
}

const savedOutlineSettingsForSession = (session: DocumentSession): OutlineSettings => {
  const projectSettings = session.document.outlineSettings ? normalizeOutlineSettings(session.document.outlineSettings, session.primaryColor) : null
  const softwarePreference = loadEditorPreferences().outlineSettings
  const softwareSettings = softwarePreference ? normalizeOutlineSettings(softwarePreference, session.primaryColor) : null
  return projectSettings ?? softwareSettings ?? defaultOutlineSettings(session.primaryColor)
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
    ...createSelectionAntiAliasCommands({ get, set, recording }),

  }
}
