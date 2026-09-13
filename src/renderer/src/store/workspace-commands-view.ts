import type { ViewState } from '@shared/types-view'
import { normalizeProjectDisplaySettings } from '@/core/project-metadata'
import { saveDocumentViewState } from '@/core/document-view-state'
import { tileRepeatFitZoom } from '@/core/tilemap'
import { touch } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { activeSession } from './workspace-access'

const persistDisplaySettings = (session: DocumentSession, view: Partial<ViewState>): boolean => {
  if (!('showPixelGrid' in view) && !('showGrid' in view) && !('grid' in view)) return false
  const current = normalizeProjectDisplaySettings(session.document.displaySettings)
  session.document.displaySettings = normalizeProjectDisplaySettings({
    ...current,
    ...('showPixelGrid' in view ? { showPixelGrid: view.showPixelGrid } : {}),
    ...('showGrid' in view ? { showGrid: view.showGrid } : {}),
    ...('grid' in view ? { grid: view.grid } : {})
  })
  return true
}

export function createViewCommands({ get, set }: WorkspaceCommandContext<'mutateActive' | 'setView'>): Pick<WorkspaceViewSelectionCommands, 'setView' | 'setViewForDocument' | 'setViewportSize' | 'setViewportSizeForDocument' | 'setTileRepeatMode' | 'togglePixelGrid' | 'toggleGrid'> {
  return {
    setView(view) {
      const state = get()
      const session = activeSession(state)
      if (!session) return
      Object.assign(session.view, view)
      saveDocumentViewState(session.document, session.view, session.symmetryCenter)
      if (persistDisplaySettings(session, view)) touch(session)
      session.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },
    setViewForDocument(documentId, view) {
      const state = get()
      const session = state.sessions.find((item) => item.document.id === documentId)
      if (!session) return
      Object.assign(session.view, view)
      saveDocumentViewState(session.document, session.view, session.symmetryCenter)
      if (persistDisplaySettings(session, view)) touch(session)
      session.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },
    setViewportSize(size) {
      get().mutateActive((session) => {
        session.viewportSize = {
          width: Math.max(0, size.width),
          height: Math.max(0, size.height)
        }
      }, false)
    },
    setViewportSizeForDocument(documentId, size) {
      const state = get()
      const session = state.sessions.find((item) => item.document.id === documentId)
      if (!session) return
      session.viewportSize = {
        width: Math.max(0, size.width),
        height: Math.max(0, size.height)
      }
      session.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },
    setTileRepeatMode(mode) {
      const state = get()
      const session = activeSession(state)
      if (!session) return
      session.view.tileRepeatMode = mode
      if (mode !== 'off') {
        session.view.zoom = tileRepeatFitZoom(session.viewportSize.width, session.viewportSize.height, session.document.width, session.document.height, mode, session.view.rotation)
        session.view.panX = 0
        session.view.panY = 0
      }
      session.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },
    togglePixelGrid() {
      const session = activeSession(get())
      if (session) get().setView({ showPixelGrid: !session.view.showPixelGrid })
    },
    toggleGrid() {
      const session = activeSession(get())
      if (session) get().setView({ showGrid: !session.view.showGrid })
    }
  }
}
