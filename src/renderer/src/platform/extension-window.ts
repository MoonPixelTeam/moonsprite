import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { cursorPosition, getCurrentWindow, Window } from '@tauri-apps/api/window'

export interface ExtensionWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ExtensionWindowHitSpan {
  x: number
  y: number
  width: number
}

export interface ExtensionRuntimeWindowMessage {
  extensionId: string
  windowId: string
  message: unknown
}

export const listenForExtensionWindowMessage = async (callback: (message: unknown) => void): Promise<() => void> =>
  listen<unknown>('extension:message', (event) => callback(event.payload), { target: getCurrentWindow().label })

export const listenForExtensionWindowMove = async (callback: (position: { x: number; y: number }) => void): Promise<() => void> =>
  getCurrentWindow().onMoved((event) => callback(event.payload))

export const listenForExtensionWindowFocus = async (callback: (focused: boolean) => void): Promise<() => void> =>
  getCurrentWindow().onFocusChanged((event) => callback(event.payload))

/** The host client bounds can change independently of an extension window. */
export const listenForExtensionHostGeometry = async (callback: () => void): Promise<() => void> => {
  const registrations = await Promise.allSettled(
    // Tauri's native window events exclude AnyLabel targets.
    ['tauri://resize', 'tauri://move', 'tauri://scale-change'].map(event => listen(event, callback, { target: { kind: 'Window', label: 'main' } }))
  )
  const removers = registrations.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  const remove = () => removers.forEach(unlisten => unlisten())
  const failed = registrations.find(result => result.status === 'rejected')
  if (failed?.status === 'rejected') { remove(); throw failed.reason }
  return remove
}

export const listenForExtensionRuntimeWindowMessage = async (callback: (message: ExtensionRuntimeWindowMessage) => void): Promise<() => void> =>
  listen<ExtensionRuntimeWindowMessage>('extension:window-message', (event) => callback(event.payload), { target: 'main' })

export const emitExtensionRuntimeWindowMessage = async (message: ExtensionRuntimeWindowMessage): Promise<void> =>
  emitTo('main', 'extension:window-message', message)

export const startExtensionWindowDrag = async (): Promise<void> => {
  await invoke('start_extension_window_drag')
}

export const extensionWindowBounds = (): Promise<ExtensionWindowBounds> =>
  invoke('get_extension_window_bounds')

/** Logical coordinates relative to the host outer origin, like window bounds. */
export const extensionPointerPosition = async (): Promise<{ x: number; y: number } | null> => {
  const main = await Window.getByLabel('main')
  if (!main) return null
  const [point, outer, inner, size, scale] = await Promise.all([
    // Cursor access can be unavailable while Windows is locked or switching desktops.
    cursorPosition().catch(() => null), main.outerPosition(), main.innerPosition(), main.innerSize(), main.scaleFactor()
  ])
  if (!point) return null
  // Do not expose pointer activity outside the application's client area.
  if (point.x < inner.x || point.y < inner.y || point.x >= inner.x + size.width || point.y >= inner.y + size.height) return null
  return { x: (point.x - outer.x) / scale, y: (point.y - outer.y) / scale }
}

export const setExtensionWindowBounds = async (bounds: ExtensionWindowBounds): Promise<void> => {
  await invoke('set_extension_window_bounds', { bounds })
}

export const setExtensionWindowHitRegion = async (
  sourceWidth: number,
  sourceHeight: number,
  spans: ExtensionWindowHitSpan[]
): Promise<void> => {
  await invoke('set_extension_window_hit_region', { sourceWidth, sourceHeight, spans })
}

/**
 * Extension windows are separate platform windows, so they never inherit the
 * main window's software-cursor mode. The window HTML reports the live policy and
 * the platform installs (or removes) the bundled pixel pointer accordingly.
 */
export const setExtensionWindowCursorPolicy = async (useLocalCursors: boolean): Promise<void> => {
  await invoke('set_extension_window_cursor_policy', { useLocalCursors })
}

export const closeCurrentExtensionWindow = async (): Promise<void> => {
  await getCurrentWindow().close()
}

export const extensionHostBounds = async (): Promise<ExtensionWindowBounds> => {
  const main = await Window.getByLabel('main')
  if (!main) throw new Error('主窗口不存在。')
  const [inner, outer, size, scale] = await Promise.all([main.innerPosition(), main.outerPosition(), main.innerSize(), main.scaleFactor()])
  return { x: (inner.x - outer.x) / scale, y: (inner.y - outer.y) / scale, width: size.width / scale, height: size.height / scale }
}
