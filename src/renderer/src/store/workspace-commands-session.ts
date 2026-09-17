import { mutateDocumentSession } from './workspace-mutation'
import type { SpriteDocument } from '@shared/types-document'
import type { StoredPalette } from '@shared/types-files'
import { checkResourceLimit } from '@/core/resource-policy'
import { createDocument } from '@/core/document-model'
import { flushViewPreview } from '@/core/view-preview-lifecycle'
import { recordRuntimeDiagnostic, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { playExportSuccessSound } from '@/platform/export-success-sound'
import { broadcastExtensionRuntimeEvent } from '@/core/extension-runtime'
import { createSpriteSheetDocument, createSpriteSheetExportTargets, EmptySpriteSheetError, resolveSpriteSheetArea, stackSpriteSheetDocuments, type SpriteSheetExportOptions } from '@/core/sprite-sheet'
import { readStoredString } from '@/core/storage'
import { ACTIVE_PALETTE_ID_STORAGE_KEY } from '@/core/panel-preferences'
import { normalizePaletteColumns, normalizePaletteSlots, paletteOrderFromSlots } from '@/core/palette-layout'
import { exportSpriteSheetFile } from './document-file-service'
import { configureLocalHistory } from './local-history-service'
import { recordUsageEvent, recordUsageExport } from '@/platform/usage-statistics'
import { sessionFromDocument } from './workspace-session'
import { applyPalette as applyPaletteCommand } from './workspace-palette'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceSessionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { createExportConflictHandler } from './workspace-export-conflicts'

import { requestTilesetPanelVisibility, documentUsesTilesetPanel } from './workspace-tileset-panel'
import { normalizeAnimationSelection } from './workspace-animation-selection'

const applyStoredPaletteToNewDocument = (document: SpriteDocument, palette: StoredPalette): void => {
  const paletteSession = sessionFromDocument(document)
  const layout = palette.columns !== undefined && palette.slots !== undefined
    ? { columns: palette.columns, slots: palette.slots }
    : undefined
  applyPaletteCommand(paletteSession, palette.colors.map((color) => ({ ...color })), layout)
  // The temporary session only applies the document data; its UI state and history
  // are intentionally discarded before the new document enters the workspace.
  document.paletteColumns = normalizePaletteColumns(document.paletteColumns)
  document.paletteSlots = normalizePaletteSlots(document.palette.map((entry) => entry.id), document.paletteOrder, document.paletteSlots, document.paletteColumns)
  document.paletteOrder = paletteOrderFromSlots(document.paletteSlots)
}

async function buildSpriteSheetResult(sourceSession: DocumentSession, options: SpriteSheetExportOptions) {
  const source = sourceSession.document
  const area = resolveSpriteSheetArea(source, options.area, sourceSession.selection)
  const names = {
    document: tr('workspace.spriteSheet.documentName', { name: source.name }),
    layer: tr('workspace.spriteSheet.layerName')
  }
  const targets = createSpriteSheetExportTargets(source, {
    selectedLayerIds: sourceSession.selectedLayerIds,
    selectedGroupIds: sourceSession.selectedGroupIds,
    selectedFrameIds: sourceSession.selectedAnimationFrameIds
  }, options)
  if (targets.length === 0) throw new Error(tr('workspace.spriteSheet.noTargets'))
  const parts = targets.flatMap((target) => {
    try {
      return [createSpriteSheetDocument(source, names, {
        ...options,
        area,
        selection: options.area === 'selection' ? sourceSession.selection : null,
        frameIds: target.frameIds,
        layerIds: target.layerIds
      })]
    } catch (error) {
      if (options.ignoreEmpty && error instanceof EmptySpriteSheetError) return []
      throw error
    }
  })
  const result = stackSpriteSheetDocuments(parts, names)
  return result
}

export function createWorkspaceSessionCommands({ get, set, recording, services: { documentTransactions } }: WorkspaceCommandContext<'addSession' | 'commitFloatingPaste' | 'requestDialog', 'documentTransactions'>): WorkspaceSessionCommands {
  const { recordDocumentOperation } = recording
  return {
    async newDocument(name, width, height, colorMode, recordDrawing = false) {
      try {
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(width, height, 1, colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        const document = createDocument(name || tr('workspace.defaultName'), width, height, colorMode, recordDrawing)
        const previousPaletteId = readStoredString(ACTIVE_PALETTE_ID_STORAGE_KEY)
        if (previousPaletteId) {
          try {
            const listing = await window.moonSprite.listPalettes()
            const previousPalette = listing.palettes.find((palette) => palette.id === previousPaletteId)
            if (previousPalette) applyStoredPaletteToNewDocument(document, previousPalette)
          } catch (error) {
            console.warn('Failed to restore the last selected palette for a new document.', error)
          }
        }
        get().addSession(document)
        recordUsageEvent('newProject')
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
      }
    },

    async exportSpriteSheet(options: SpriteSheetExportOptions, sourceDocumentId?: string) {
      get().commitFloatingPaste()
      const sourceSession = sourceDocumentId
        ? get().sessions.find((session) => session.document.id === sourceDocumentId) ?? null
        : activeSession(get())
      if (!sourceSession) return false
      try {
        if (options.outputFile && typeof Worker !== 'undefined') {
          const names = {
            document: tr('workspace.spriteSheet.documentName', { name: sourceSession.document.name }),
            layer: tr('workspace.spriteSheet.layerName')
          }
          const path = await exportSpriteSheetFile(window.moonSprite, sourceSession.document, options.name, options.directory, {
            onConflict: createExportConflictHandler(get().requestDialog, false)
          }, {
            options,
            selection: {
              selectedLayerIds: sourceSession.selectedLayerIds,
              selectedGroupIds: sourceSession.selectedGroupIds,
              selectedFrameIds: sourceSession.selectedAnimationFrameIds,
              selection: sourceSession.selection
            },
            names
          })
          if (!path) return false
          set({ message: tr('workspace.spriteSheet.exported', { count: 1 }) })
          recordUsageExport('png-sprite-sheet')
          playExportSuccessSound()
          broadcastExtensionRuntimeEvent({ type: 'export-complete', projectId: sourceSession.document.id, format: 'png-sprite-sheet' })
          return true
        }
        const result = await buildSpriteSheetResult(sourceSession, options)
        if (options.outputFile) {
          const path = await exportSpriteSheetFile(window.moonSprite, result.document, options.name, options.directory, {
            onConflict: createExportConflictHandler(get().requestDialog, false)
          })
          if (!path) return false
          set({ message: tr('workspace.spriteSheet.exported', { count: 1 }) })
          recordUsageExport('png-sprite-sheet')
        } else {
          result.document.dirty = true
          get().addSession(result.document)
          set({ message: tr('workspace.spriteSheet.created', { count: 1 }) })
        }
        playExportSuccessSound()
        if (options.outputFile) broadcastExtensionRuntimeEvent({ type: 'export-complete', projectId: sourceSession.document.id, format: 'png-sprite-sheet' })
        return true
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.spriteSheet.error') })
        return false
      }
    },

    async previewSpriteSheet(sourceDocumentId, options, previousPreviewDocumentIds) {
      const sourceSession = get().sessions.find((session) => session.document.id === sourceDocumentId)
      if (!sourceSession) return null
      if (get().activeId === sourceDocumentId) get().commitFloatingPaste()
      try {
        const result = await buildSpriteSheetResult(sourceSession, options)
        const previousIds = new Set(previousPreviewDocumentIds)
        for (const documentId of previousIds) flushViewPreview(documentId)
        const currentState = get()
        const previousPreviewSession = currentState.sessions.find((session) => (
          session.document.id === currentState.activeId && previousIds.has(session.document.id)
        )) ?? currentState.sessions.find((session) => previousIds.has(session.document.id))
        result.document.dirty = false
        const previewSession = sessionFromDocument(result.document)
        if (previousPreviewSession) {
          previewSession.view = {
            ...previousPreviewSession.view,
            grid: previousPreviewSession.view.grid ? { ...previousPreviewSession.view.grid } : undefined
          }
          previewSession.viewportSize = { ...previousPreviewSession.viewportSize }
        }
        previewSession.primaryColor = { ...currentState.sharedPrimaryColor }
        previewSession.secondaryColor = { ...currentState.sharedSecondaryColor }
        previewSession.recoverySuppressed = true
        for (const session of currentState.sessions) {
          if (previousIds.has(session.document.id)) documentTransactions.cancelDocument(session.document.id, session)
        }
        set((state) => {
          const sessions = [
            ...state.sessions.filter((session) => !previousIds.has(session.document.id)),
            previewSession
          ]
          return { sessions, activeId: previewSession.document.id }
        })
        requestTilesetPanelVisibility(false)
        return [previewSession.document.id]
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.spriteSheet.error') })
        return null
      }
    },

    closeSpriteSheetPreview(documentIds, preferredActiveId) {
      const ids = new Set(documentIds)
      if (ids.size === 0) return
      for (const session of get().sessions) {
        if (ids.has(session.document.id)) documentTransactions.cancelDocument(session.document.id, session)
      }
      set((state) => {
        const sessions = state.sessions.filter((session) => !ids.has(session.document.id))
        if (!ids.has(state.activeId ?? '')) return { sessions }
        const preferred = sessions.find((session) => session.document.id === preferredActiveId)
        return { sessions, activeId: preferred?.document.id ?? sessions.at(-1)?.document.id ?? null }
      })
      const active = activeSession(get())
      requestTilesetPanelVisibility(documentUsesTilesetPanel(active?.document))
    },

    addSession(document, options) {
      const existing = get().sessions.find((session) => session.document.id === document.id)
      if (existing) return
      const session = sessionFromDocument(document)
      configureLocalHistory(session, window.moonSprite)
      normalizeAnimationSelection(session)
      session.recoveryOriginId = options?.recoveryOriginId ?? null
      session.primaryColor = { ...get().sharedPrimaryColor }
      session.secondaryColor = { ...get().sharedSecondaryColor }
      set((state) => ({ sessions: [...state.sessions, session], activeId: document.id, message: null }))
      requestTilesetPanelVisibility(documentUsesTilesetPanel(document))
    },

    reorderSessions(documentIds) {
      set((state) => {
        const byId = new Map(state.sessions.map((session) => [session.document.id, session]))
        const seen = new Set<string>()
        const ordered = documentIds.flatMap((documentId) => {
          const session = byId.get(documentId)
          if (!session || seen.has(documentId)) return []
          seen.add(documentId)
          return [session]
        })
        for (const session of state.sessions) if (!seen.has(session.document.id)) ordered.push(session)
        return { sessions: ordered }
      })
    },

    setActive(id) {
      // Split panes activate on pointer/wheel capture. Re-entering the active
      // pane must not merge a floating paste into its layer before dragging it.
      if (get().activeId === id) return
      const switchStartedAt = runtimeDiagnosticsActive() ? performance.now() : 0
      get().commitFloatingPaste()
      const state = get()
      const current = activeSession(state)
      if (current && current.document.id !== id) documentTransactions.cancelDocument(current.document.id, current)
      const target = state.sessions.find((session) => session.document.id === id)
      // Switching tabs only changes the active document. Cloning the complete
      // sessions array here invalidated every canvas host and made each large
      // document redraw synchronously, even though none of their session data
      // changed.
      set({ activeId: id })
      requestTilesetPanelVisibility(documentUsesTilesetPanel(target?.document))
      if (switchStartedAt) recordRuntimeDiagnostic('operation-stage', 'workspace.tab-switch.store', {
        documentId: id,
        durationMs: Math.round((performance.now() - switchStartedAt) * 100) / 100,
        canvasWidth: target?.document.width ?? 0,
        canvasHeight: target?.document.height ?? 0
      })
    },
      mutateActive(mutator, dirty = true, normalizeSelection = false, markSelectionNormalizationHistory = normalizeSelection, invalidation) {
      const state = get()
      const session = activeSession(state)
      if (!session) return
      mutateDocumentSession(session, mutator, {
        change: dirty === true ? 'content-and-animation' : dirty === false ? 'ui' : dirty,
        normalizeSelection, markSelectionNormalizationHistory, invalidation
      }, recordDocumentOperation)
      set({ sessions: [...state.sessions] })
    }
  }
}
