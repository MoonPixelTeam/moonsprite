import { readStoredString, writeStoredString } from './storage'

export type DiagnosticMode = 'off' | 'memory' | 'full' | 'lag'
export const DIAGNOSTIC_MODE_KEY = 'moonsprite.preference.diagnostic-mode'
export const DIAGNOSTIC_MODE_CHANGED = 'moonsprite:diagnostic-mode-changed'
export const parseDiagnosticMode = (value: string | null): DiagnosticMode => value === 'off' || value === 'memory' || value === 'lag' ? value : 'full'
export const loadDiagnosticMode = (): DiagnosticMode => parseDiagnosticMode(readStoredString(DIAGNOSTIC_MODE_KEY))
export function saveDiagnosticMode(mode: DiagnosticMode): boolean {
  if (!writeStoredString(DIAGNOSTIC_MODE_KEY, mode)) return false
  window.dispatchEvent(new Event(DIAGNOSTIC_MODE_CHANGED))
  return true
}
