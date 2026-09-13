import { useSyncExternalStore } from 'react'
import { loadShortcutBindings, type ShortcutBindings } from '@/core/shortcuts'

const listeners = new Set<() => void>()
let snapshot: ShortcutBindings | null = null

const getSnapshot = (): ShortcutBindings => snapshot ??= loadShortcutBindings()

const refresh = (): void => {
  snapshot = loadShortcutBindings()
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void): (() => void) => {
  if (listeners.size === 0) window.addEventListener('moonsprite:shortcuts-changed', refresh)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('moonsprite:shortcuts-changed', refresh)
      snapshot = null
    }
  }
}

/** Resident canvases share one configuration load and one change listener. */
export const useCanvasShortcutBindings = (): ShortcutBindings => useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
