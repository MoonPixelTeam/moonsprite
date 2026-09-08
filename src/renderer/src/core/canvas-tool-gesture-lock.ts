const activePointers = new Set<number>()
const pendingShortcuts: Array<() => void> = []
let pendingReleaseScheduled = false

const schedulePendingShortcuts = (): void => {
  if (pendingReleaseScheduled || activePointers.size > 0 || pendingShortcuts.length === 0) return
  pendingReleaseScheduled = true
  queueMicrotask(() => {
    pendingReleaseScheduled = false
    if (activePointers.size > 0) return
    const shortcuts = pendingShortcuts.splice(0)
    for (const shortcut of shortcuts) shortcut()
  })
}

export const beginCanvasToolGesture = (pointerId: number): void => {
  activePointers.add(pointerId)
}

export const endCanvasToolGesture = (pointerId: number): void => {
  activePointers.delete(pointerId)
  schedulePendingShortcuts()
}

export const clearCanvasToolGestures = (): void => {
  activePointers.clear()
  pendingShortcuts.length = 0
}

export const isCanvasToolGestureLocked = (): boolean => activePointers.size > 0

export const deferCanvasShortcut = (shortcut: () => void): void => {
  pendingShortcuts.push(shortcut)
  schedulePendingShortcuts()
}
