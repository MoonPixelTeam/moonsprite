import { invoke } from '@tauri-apps/api/core'
import {
  configureRuntimeDiagnostics,
  installRuntimeDiagnosticWatchdog,
  runtimeDiagnosticSnapshot,
  type RuntimeDiagnosticDetail,
  type RuntimeDiagnosticEvent
} from '@/core/runtime-diagnostics'

const BROWSER_DIAGNOSTIC_STORAGE_KEY = 'moonsprite.runtime-diagnostics.v1'
const MAX_BROWSER_EVENTS = 100
let installed = false

const persistBrowserFallback = (events: readonly RuntimeDiagnosticEvent[]): void => {
  try {
    const stored = JSON.parse(localStorage.getItem(BROWSER_DIAGNOSTIC_STORAGE_KEY) ?? '[]') as RuntimeDiagnosticEvent[]
    const next = [...stored, ...events].slice(-MAX_BROWSER_EVENTS)
    localStorage.setItem(BROWSER_DIAGNOSTIC_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The in-memory ring remains available when browser storage is unavailable.
  }
}

const persistEvents = (events: readonly RuntimeDiagnosticEvent[]): void => {
  if (!('__TAURI_INTERNALS__' in window)) {
    persistBrowserFallback(events)
    return
  }
  void invoke('append_diagnostic_events', { events }).catch(() => persistBrowserFallback(events))
}

export const installRuntimeDiagnostics = (contextProvider: () => RuntimeDiagnosticDetail): void => {
  if (installed) return
  installed = true
  configureRuntimeDiagnostics(persistEvents, contextProvider)
  installRuntimeDiagnosticWatchdog()
}

export const openRuntimeDiagnosticLogs = async (): Promise<void> => {
  if ('__TAURI_INTERNALS__' in window) {
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
}
