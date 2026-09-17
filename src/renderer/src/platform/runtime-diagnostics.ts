import { invoke } from '@tauri-apps/api/core'
import { createDiagnosticWriter } from './runtime-diagnostic-writer'
import { playExportSuccessSound } from './export-success-sound'
import { DIAGNOSTIC_MODE_CHANGED, loadDiagnosticMode, type DiagnosticMode } from '@/core/diagnostic-preferences'
import {
  configureRuntimeDiagnostics,
  installRuntimeDiagnosticWatchdog,
  runtimeDiagnosticSnapshot,
  recordRuntimeDiagnostic,
  setRuntimeDiagnosticCollection,
  type RuntimeDiagnosticDetail,
  type RuntimeDiagnosticEvent
} from '@/core/runtime-diagnostics'

const BROWSER_DIAGNOSTIC_STORAGE_KEY = 'moonsprite.runtime-diagnostics.v1'
const MAX_BROWSER_EVENTS = 100
let installed = false
let mode: DiagnosticMode | null = null
let browserEvents: RuntimeDiagnosticEvent[] | undefined

const persistBrowserFallback = (events: readonly RuntimeDiagnosticEvent[]): void => {
  try {
    if (!browserEvents) {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(BROWSER_DIAGNOSTIC_STORAGE_KEY) ?? '[]')
        browserEvents = Array.isArray(stored) ? stored.slice(-MAX_BROWSER_EVENTS).filter((event): event is RuntimeDiagnosticEvent =>
          event !== null && typeof event === 'object' && typeof event.sessionId === 'string' && typeof event.sequence === 'number'
        ) : []
      } catch {
        browserEvents = []
      }
    }
    const unique = new Map(browserEvents.map((event) => [`${event.sessionId}:${event.sequence}`, event]))
    for (const event of events) unique.set(`${event.sessionId}:${event.sequence}`, event)
    browserEvents = [...unique.values()].slice(-MAX_BROWSER_EVENTS)
    localStorage.setItem(BROWSER_DIAGNOSTIC_STORAGE_KEY, JSON.stringify(browserEvents))
  } catch {
    // The in-memory ring remains available when browser storage is unavailable.
  }
}

const persistEvents = async (events: readonly RuntimeDiagnosticEvent[]): Promise<void> => {
  if (!('__TAURI_INTERNALS__' in window)) {
    persistBrowserFallback(events)
    return
  }
  await invoke('append_diagnostic_events', { events })
}

const writer = createDiagnosticWriter(persistEvents, persistBrowserFallback)

export const installRuntimeDiagnostics = (contextProvider: () => RuntimeDiagnosticDetail): (() => void) => {
  if (installed) return () => {}
  installed = true
  let stopWatchdog: (() => void) | null = null
  const refresh = (): void => {
    const next = loadDiagnosticMode()
    if (next === mode) return
    writer.discardPending()
    mode = next
    if (next === 'off') { stopWatchdog?.(); stopWatchdog = null }
    setRuntimeDiagnosticCollection(next !== 'off')
    configureRuntimeDiagnostics(next === 'full' ? writer.enqueue : next === 'memory' ? () => {} : null, contextProvider)
    if (next !== 'off') {
      stopWatchdog ??= installRuntimeDiagnosticWatchdog()
      recordRuntimeDiagnostic('session', 'diagnostic.mode', { mode: next })
    }
  }
  const checkpoint = (): void => { if (mode === 'full') { writer.checkpoint(); void writer.flush() } }
  const visibilityChange = (): void => { if (document.visibilityState === 'hidden') checkpoint() }
  window.addEventListener(DIAGNOSTIC_MODE_CHANGED, refresh)
  window.addEventListener('moonsprite:preferences-changed', refresh)
  window.addEventListener('pagehide', checkpoint)
  document.addEventListener('visibilitychange', visibilityChange)
  refresh()
  return () => {
    window.removeEventListener(DIAGNOSTIC_MODE_CHANGED, refresh)
    window.removeEventListener('moonsprite:preferences-changed', refresh)
    window.removeEventListener('pagehide', checkpoint)
    document.removeEventListener('visibilitychange', visibilityChange)
    stopWatchdog?.()
    writer.discardPending()
    setRuntimeDiagnosticCollection(false)
    configureRuntimeDiagnostics(null)
    installed = false
    mode = null
  }
}

export const openRuntimeDiagnosticLogs = async (): Promise<void> => {
  if (mode === 'full') await writer.flush()
  if ('__TAURI_INTERNALS__' in window && mode !== 'memory') {
    await invoke('open_diagnostic_logs')
    return
  }
  const events = runtimeDiagnosticSnapshot()
  const url = URL.createObjectURL(new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `moonsprite-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
  playExportSuccessSound()
}
