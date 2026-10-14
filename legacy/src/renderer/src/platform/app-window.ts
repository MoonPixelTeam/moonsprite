import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import { availableMonitors, getCurrentWindow } from '@tauri-apps/api/window'
import type { WorkspaceLayout } from '@shared/types-workspace'

export type AppWindowLayout = NonNullable<WorkspaceLayout['mainWindow']>

const currentDesktopWindow = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  ? getCurrentWindow()
  : null

let restoreMaximizedAfterFullscreen = false
let fullscreenTransition: Promise<boolean> | null = null

let maximizeCursorResetPending = false
let maximizeCursorResetInFlight = false
let maximizeCursorResetGeneration = 0

const resetAppWindowNativeCursor = async (appWindow: NonNullable<ReturnType<typeof currentDesktopWindow>>): Promise<boolean> => {
  try {
    await appWindow.setCursorIcon('default')
    return true
  } catch {
    return false
  }
}

const windowLayoutIsVisible = async (layout: AppWindowLayout): Promise<boolean> => {
  try {
    const monitors = await availableMonitors()
    return monitors.some((monitor) => {
      const area = monitor.workArea
      const overlapWidth = Math.min(layout.x + layout.width, area.position.x + area.size.width) - Math.max(layout.x, area.position.x)
      const overlapHeight = Math.min(layout.y + layout.height, area.position.y + area.size.height) - Math.max(layout.y, area.position.y)
      return overlapWidth >= 80 && overlapHeight >= 48
    })
  } catch {
    return true
  }
}

export async function readAppWindowLayout(): Promise<AppWindowLayout | null> {
  const appWindow = currentDesktopWindow()
  if (!appWindow) return null
  const maximized = await appWindow.isMaximized()
  const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.innerSize()])
  return { x: position.x, y: position.y, width: size.width, height: size.height, maximized }
}

export async function applyAppWindowLayout(layout: AppWindowLayout, mode: 'workspace' | 'startup' = 'workspace'): Promise<void> {
  const appWindow = currentDesktopWindow()
  if (!appWindow) return
  const isMaximized = await appWindow.isMaximized()
  if (mode === 'workspace' && layout.maximized && isMaximized) return
  if (mode === 'startup' || (!layout.maximized && isMaximized)) await appWindow.unmaximize()
  const [currentPosition, currentSize, visible] = await Promise.all([
    appWindow.outerPosition(),
    appWindow.innerSize(),
    windowLayoutIsVisible(layout)
  ])
  if (Math.abs(currentSize.width - layout.width) > 1 || Math.abs(currentSize.height - layout.height) > 1) {
    await appWindow.setSize(new PhysicalSize(layout.width, layout.height))
  }
  if (!visible) await appWindow.center()
  else if (Math.abs(currentPosition.x - layout.x) > 1 || Math.abs(currentPosition.y - layout.y) > 1) {
    await appWindow.setPosition(new PhysicalPosition(layout.x, layout.y))
  }
  if (layout.maximized) await appWindow.maximize()
}

export async function initializeAppWindow(
  layout: AppWindowLayout | null,
  onGeometryChanged: () => void,
  fallbackSize = { width: 1440, height: 900 }
): Promise<() => void> {
  const appWindow = currentDesktopWindow()
  if (!appWindow) return () => {}
  if (layout) await applyAppWindowLayout(layout, 'startup')
  else {
    await appWindow.setSize(new PhysicalSize(fallbackSize.width, fallbackSize.height))
    await appWindow.center()
  }
  await appWindow.show()
  const [removeMoved, removeResized] = await Promise.all([
    appWindow.onMoved(onGeometryChanged),
    appWindow.onResized(onGeometryChanged)
  ])
  return () => {
    removeMoved()
    removeResized()
  }
}

export async function showAppWindow(): Promise<void> {
  await currentDesktopWindow()?.show()
}

export async function startAppWindowDragging(): Promise<boolean> {
  if (!currentDesktopWindow()) return false
  return invoke<boolean>('start_window_drag_if_primary_pressed')
}

export async function minimizeAppWindow(): Promise<void> {
  await currentDesktopWindow()?.minimize()
}

export async function toggleAppWindowMaximized(): Promise<boolean> {
  const appWindow = currentDesktopWindow()
  if (!appWindow) return false
  await appWindow.toggleMaximize()
  const maximized = await appWindow.isMaximized()
  // Windows can overwrite this first reset with a later non-client hit test.
  // Keep one deferred reset armed for the next button-free client pointer move.
  maximizeCursorResetGeneration += 1
  maximizeCursorResetPending = true
  await resetAppWindowNativeCursor(appWindow)
  return maximized
}

export async function toggleAppWindowFullscreen(): Promise<boolean> {
  // Ignore repeated F11 presses while the native transition is in flight.
  if (fullscreenTransition) return fullscreenTransition
  const appWindow = currentDesktopWindow()
  if (!appWindow) return false
  const transition = (async () => {
    const fullscreen = await appWindow.isFullscreen()
    if (fullscreen) {
      await appWindow.setFullscreen(false)
      if (restoreMaximizedAfterFullscreen) await appWindow.maximize()
      restoreMaximizedAfterFullscreen = false
      return false
    }
    const maximized = await appWindow.isMaximized()
    // Tao's Windows borderless WM_NCCALCSIZE path uses rcWork while the
    // window is maximized, reserving the taskbar strip even in fullscreen.
    if (maximized) await appWindow.unmaximize()
    try {
      await appWindow.setFullscreen(true)
    } catch (error) {
      if (maximized) await appWindow.maximize()
      throw error
    }
    restoreMaximizedAfterFullscreen = maximized
    return true
  })()
  fullscreenTransition = transition
  try { return await transition } finally { fullscreenTransition = null }
}

export async function settleAppWindowCursorAfterMaximize(): Promise<boolean> {
  if (!maximizeCursorResetPending || maximizeCursorResetInFlight) return false
  const appWindow = currentDesktopWindow()
  if (!appWindow) {
    maximizeCursorResetPending = false
    return false
  }
  const generation = maximizeCursorResetGeneration
  maximizeCursorResetInFlight = true
  try {
    return await resetAppWindowNativeCursor(appWindow)
  } finally {
    if (generation === maximizeCursorResetGeneration) maximizeCursorResetPending = false
    maximizeCursorResetInFlight = false
  }
}

export async function closeAppWindow(): Promise<void> {
  await currentDesktopWindow()?.close()
}

export function observeAppWindowMaximized(onChange: (maximized: boolean) => void): () => void {
  const appWindow = currentDesktopWindow()
  if (!appWindow) {
    onChange(false)
    return () => {}
  }

  let disposed = false
  let removeResized: (() => void) | null = null
  let refreshInFlight = false
  let refreshQueued = false

  const refresh = async (): Promise<void> => {
    if (refreshInFlight) {
      refreshQueued = true
      return
    }
    refreshInFlight = true
    try {
      const maximized = await appWindow.isMaximized()
      if (!disposed) onChange(maximized)
    } catch {
      // Keep the current caption state when the native query is unavailable.
    } finally {
      refreshInFlight = false
      if (refreshQueued && !disposed) {
        refreshQueued = false
        void refresh()
      }
    }
  }

  void refresh()
  void appWindow.onResized(() => { void refresh() }).then((remove) => {
    if (disposed) remove()
    else removeResized = remove
  }).catch(() => {})

  return () => {
    disposed = true
    removeResized?.()
  }
}
