import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { deriveShortcutConflicts, shortcutKeyPart, type ShortcutBindings, type ShortcutConflictState } from '@/core/shortcuts'
import { resolveHeldQuickTool, type QuickToolMatch } from '@/core/quick-tools'

const heldParts = new Set<string>()
interface MatchStore {
  read: () => QuickToolMatch | null
  listeners: Set<() => void>
}
const activeStores = new Set<MatchStore>()
const conflictCache = new WeakMap<ShortcutBindings, ShortcutConflictState>()
const matchStores = new WeakMap<ShortcutBindings, WeakMap<ShortcutConflictState, MatchStore>>()
let revision = 0
let listening = false
let keyboardUsers = 0

export const quickToolConflictsFor = (shortcuts: ShortcutBindings): ShortcutConflictState => {
  let conflicts = conflictCache.get(shortcuts)
  if (!conflicts) {
    conflicts = deriveShortcutConflicts(shortcuts)
    conflictCache.set(shortcuts, conflicts)
  }
  return conflicts
}

const matchStoreFor = (shortcuts: ShortcutBindings, conflicts: ShortcutConflictState): MatchStore => {
  let stores = matchStores.get(shortcuts)
  if (!stores) {
    stores = new WeakMap()
    matchStores.set(shortcuts, stores)
  }
  let store = stores.get(conflicts)
  if (!store) {
    let seenRevision = -1
    let match: QuickToolMatch | null = null
    store = {
      listeners: new Set(),
      read: () => {
        if (seenRevision !== revision) {
          const next = resolveHeldQuickTool(shortcuts, heldParts, conflicts)
          // Preserve snapshot identity when unrelated keys leave the match unchanged.
          if (next?.id !== match?.id || next?.binding !== match?.binding || next?.target !== match?.target) match = next
          seenRevision = revision
        }
        return match
      }
    }
    stores.set(conflicts, store)
  }
  return store
}

const notify = (): void => {
  const previous = [...activeStores].map((store) => [store, store.read()] as const)
  revision += 1
  for (const [store, match] of previous) {
    if (store.read() !== match) for (const listener of store.listeners) listener()
  }
}

const clearHeldParts = (): void => {
  if (heldParts.size === 0) return
  heldParts.clear()
  notify()
}

const keyboardTargetBlocksQuickTools = (target: EventTarget | null): boolean => target instanceof Element
  && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [data-shortcut-recorder="true"]'))

const keyDown = (event: KeyboardEvent): void => {
  if (keyboardTargetBlocksQuickTools(event.target)) {
    clearHeldParts()
    return
  }
  const part = shortcutKeyPart(event)
  if (!part || part === 'WheelUp' || part === 'WheelDown' || heldParts.has(part)) return
  heldParts.add(part)
  notify()
}

const keyUp = (event: KeyboardEvent): void => {
  const part = shortcutKeyPart(event)
  if (!heldParts.delete(part)) return
  notify()
}

const visibilityChange = (): void => {
  if (document.hidden) clearHeldParts()
}

const startListening = (): void => {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('keydown', keyDown, true)
  window.addEventListener('keyup', keyUp, true)
  window.addEventListener('blur', clearHeldParts)
  document.addEventListener('visibilitychange', visibilityChange)
}

const stopListening = (): void => {
  if (!listening || typeof window === 'undefined') return
  listening = false
  window.removeEventListener('keydown', keyDown, true)
  window.removeEventListener('keyup', keyUp, true)
  window.removeEventListener('blur', clearHeldParts)
  document.removeEventListener('visibilitychange', visibilityChange)
  clearHeldParts()
}

const subscribe = (store: MatchStore, listener: () => void): (() => void) => {
  store.read()
  store.listeners.add(listener)
  activeStores.add(store)
  return () => {
    store.listeners.delete(listener)
    if (store.listeners.size === 0) activeStores.delete(store)
  }
}

export const currentHeldShortcutKeyParts = (): ReadonlySet<string> => heldParts

export function syncHeldShortcutModifiers(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): void {
  let changed = false
  const sync = (part: 'Ctrl' | 'Win' | 'Alt' | 'Shift', active: boolean): void => {
    if (active) {
      if (!heldParts.has(part)) {
        heldParts.add(part)
        changed = true
      }
      return
    }
    if (heldParts.delete(part)) changed = true
  }
  sync('Ctrl', Boolean(event.ctrlKey))
  sync('Win', Boolean(event.metaKey))
  sync('Alt', Boolean(event.altKey))
  sync('Shift', Boolean(event.shiftKey))
  if (changed) notify()
}

export function currentQuickToolMatch(
  shortcuts: ShortcutBindings,
  conflicts: ShortcutConflictState = quickToolConflictsFor(shortcuts)
): QuickToolMatch | null {
  return matchStoreFor(shortcuts, conflicts).read()
}

export function useQuickToolShortcut(shortcuts: ShortcutBindings): QuickToolMatch | null {
  // Configuration changes resubscribe snapshots without releasing keys still held.
  useEffect(() => {
    keyboardUsers += 1
    startListening()
    return () => {
      keyboardUsers -= 1
      if (keyboardUsers === 0) stopListening()
    }
  }, [])
  const store = matchStoreFor(shortcuts, quickToolConflictsFor(shortcuts))
  const subscribeMatch = useMemo(() => (listener: () => void) => subscribe(store, listener), [store])
  return useSyncExternalStore(subscribeMatch, store.read, store.read)
}
