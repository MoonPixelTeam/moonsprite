import { recordRuntimeDiagnostic } from '@/core/runtime-diagnostics'
import { createApplicationCloseCoordinator, resolveDocumentClose } from '@/store/workspace-close-coordinator'
import { useEffect } from 'react'
import { flushColorRolePreferences } from '@/core/color-role-preferences'
import { initializeAppWindow, showAppWindow } from '@/platform/app-window'
import { initializeUsageStatistics } from '@/platform/usage-statistics'
import { loadMainWindowState } from '@/core/workspace-layout-preferences'
import { useWorkspace } from '@/store/workspace'
import { waitForDocumentCloseTasks } from '@/store/document-close-tasks'
import { flushLocalHistoryPersist } from '@/store/local-history-service'
import { useI18n } from '@/components/I18nProvider'
import { persistMainWindowState } from './app-window-state'

export function useAppWindowLifecycle() {
  const { t } = useI18n()
  useEffect(() => {
    void initializeUsageStatistics()
  }, [])

  useEffect(() => {
    let disposed = false
    let saveTimer: number | null = null
    let removeGeometryObservers: (() => void) | null = null
    const scheduleSave = (): void => {
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        saveTimer = null
        void persistMainWindowState()
      }, 220)
    }
    const setup = async (): Promise<void> => {
      const stored = loadMainWindowState()
      const removeObservers = await initializeAppWindow(stored, scheduleSave)
      if (!stored) await persistMainWindowState()
      if (disposed) removeObservers()
      else removeGeometryObservers = removeObservers
    }
    void setup().catch(() => {
      /* Keep the configured default window when restoration is unavailable, but never leave it invisible. */
      void showAppWindow().catch(() => {})
    })
    return () => {
      disposed = true
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      removeGeometryObservers?.()
    }
  }, [])

  useEffect(() => {
    const preventContextMenu = (event: MouseEvent): void => event.preventDefault()
    window.addEventListener('contextmenu', preventContextMenu)
    return () => window.removeEventListener('contextmenu', preventContextMenu)
  }, [])

  useEffect(() => {
    let drag: { modal: HTMLElement; startX: number; startY: number; left: number; top: number } | null = null
    let zIndex = 220
    const pointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || !(event.target instanceof Element)) return
      const header = event.target.closest<HTMLElement>('.modal > header')
      if (!header || event.target.closest('button, input, select, textarea, label')) return
      const modal = header.parentElement
      if (!modal) return
      const bounds = modal.getBoundingClientRect()
      modal.style.left = `${bounds.left}px`
      modal.style.top = `${bounds.top}px`
      modal.style.transform = 'none'
      modal.style.zIndex = String(++zIndex)
      drag = { modal, startX: event.clientX, startY: event.clientY, left: bounds.left, top: bounds.top }
      event.preventDefault()
    }
    const pointerMove = (event: PointerEvent): void => {
      if (!drag) return
      const bounds = drag.modal.getBoundingClientRect()
      const left = Math.max(0, Math.min(window.innerWidth - bounds.width, drag.left + event.clientX - drag.startX))
      const top = Math.max(0, Math.min(window.innerHeight - bounds.height, drag.top + event.clientY - drag.startY))
      drag.modal.style.left = `${left}px`
      drag.modal.style.top = `${top}px`
    }
    const pointerUp = (): void => {
      drag = null
    }
    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
    return () => {
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
    }
  }, [])

  useEffect(() => {
    const close = createApplicationCloseCoordinator({
      hasDialog: () => Boolean(useWorkspace.getState().dialog),
      sessions: () => useWorkspace.getState().sessions,
      prepare: async () => {
        flushColorRolePreferences()
        try {
          await persistMainWindowState()
        } catch (error) {
          recordRuntimeDiagnostic('error', 'app.close.window-state', { message: error instanceof Error ? error.message : String(error) })
        }
      },
      flushRecordings: (sessions) => useWorkspace.getState().flushRecordings(sessions),
      confirm: (session) =>
        resolveDocumentClose(
          session.document.dirty,
          () => {
            useWorkspace.getState().setActive(session.document.id)
            return useWorkspace.getState().requestDialog({
              title: t('app.unsaved.title'),
              message: t('app.unsaved.message', { name: session.document.name }),
              detail: t('app.unsaved.detail'),
              choices: [
                { id: 'cancel', label: t('common.cancel'), tone: 'quiet' },
                { id: 'discard', label: t('app.discard'), tone: 'danger' },
                { id: 'save', label: t('common.save'), tone: 'primary' }
              ]
            })
          },
          () => useWorkspace.getState().saveActive()
        ),
      discardRecovery: (id) => useWorkspace.getState().discardRecovery(id),
      waitForDocumentCloses: waitForDocumentCloseTasks,
      flushHistory: (session) => flushLocalHistoryPersist(window.moonSprite, session),
      approve: () => window.moonSprite.approveClose(),
      cancel: () => window.moonSprite.cancelClose(),
      reportError: (error) => {
        console.error('MoonSprite history flush before exit failed', error)
        useWorkspace.getState().setMessage(error instanceof Error ? error.message : String(error))
      }
    })
    const unsubscribe = window.moonSprite.onRequestClose(close)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return {}
}
