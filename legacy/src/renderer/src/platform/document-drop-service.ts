import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { normalizeDroppedDocumentPaths } from '@/core/document-drop'
import { loadEditorPreferences } from '@/core/file-preferences'
import { translate } from '@/core/localization'
import { subscribeToNativeDocumentDrops, type NativeDocumentDropSource } from './document-drop-events'

type RustDropSubscriber = (onDrop: (paths: string[]) => void) => Promise<UnlistenFn>
export interface DocumentDropPosition { x: number; y: number }

export interface DocumentDropServiceOptions {
  acceptsAdditionalPath?(path: string): boolean
  openPath(path: string): boolean | Promise<boolean>
  pathForFile(file: File): string
  claimPaths?(paths: string[], position?: DocumentDropPosition): boolean | Promise<boolean>
  onDragOver?(paths: string[], position?: DocumentDropPosition): void
  onDragLeave?(): void
  onOpened?(): void
  eventTarget?: Window
  desktop?: boolean
  nativeSources?: NativeDocumentDropSource[]
  rustSubscriber?: RustDropSubscriber
  dedupeMs?: number
  now?: () => number
  devicePixelRatio?: number
  warn?: (message: string, error: unknown) => void
}

const defaultRustSubscriber: RustDropSubscriber = (onDrop) =>
  listen<string[]>('app:file-drop', (event) => onDrop(event.payload))

export function startDocumentDropService(options: DocumentDropServiceOptions): () => void {
  const target = options.eventTarget ?? window
  const desktop = options.desktop ?? '__TAURI_INTERNALS__' in window
  const nativeSources = options.nativeSources ?? (desktop ? [getCurrentWebview(), getCurrentWindow()] : [])
  const rustSubscriber = options.rustSubscriber ?? (desktop ? defaultRustSubscriber : undefined)
  const dedupeMs = options.dedupeMs ?? 1_000
  const now = options.now ?? Date.now
  const devicePixelRatio = Math.max(1, options.devicePixelRatio ?? window.devicePixelRatio ?? 1)
  const warn = options.warn ?? ((message: string, error: unknown) => console.warn(message, error))
  const recentlyOpened = new Map<string, number>()
  const cleanups = new Map<string, () => void>()
  const pending = new Set<string>()
  let active = true

  const handleDroppedPaths = (paths: string[], position?: DocumentDropPosition): void => {
    const timestamp = now()
    for (const [key, openedAt] of recentlyOpened) {
      if (timestamp - openedAt >= dedupeMs) recentlyOpened.delete(key)
    }
    const freshPaths: string[] = []
    for (const path of normalizeDroppedDocumentPaths(paths, options.acceptsAdditionalPath)) {
      const key = path.toLowerCase()
      if (recentlyOpened.has(key)) continue
      recentlyOpened.set(key, timestamp)
      freshPaths.push(path)
    }
    if (freshPaths.length === 0) return
    void Promise.resolve(options.claimPaths?.(freshPaths, position) ?? false).then((claimed) => {
      if (claimed) return
      for (const path of freshPaths) {
        void Promise.resolve(options.openPath(path)).then((opened) => {
          if (active && opened) options.onOpened?.()
        }).catch((error) => warn(translate(loadEditorPreferences().language, 'platform.drop.openError', { path }), error))
      }
    }).catch((error) => {
      warn(translate(loadEditorPreferences().language, 'platform.drop.claimError'), error)
      for (const path of freshPaths) void Promise.resolve(options.openPath(path)).then((opened) => {
        if (active && opened) options.onOpened?.()
      }).catch((openError) => warn(translate(loadEditorPreferences().language, 'platform.drop.openError', { path }), openError))
    })
  }

  const subscribe = (key: string, create: () => Promise<() => void>): void => {
    if (!active || cleanups.has(key) || pending.has(key)) return
    pending.add(key)
    void create().then((cleanup) => {
      pending.delete(key)
      if (!active) { cleanup(); return }
      cleanups.set(key, cleanup)
    }).catch((error) => {
      pending.delete(key)
      if (active) warn(translate(loadEditorPreferences().language, 'platform.drop.subscribeError', { key }), error)
    })
  }

  const ensureDesktopSubscriptions = (): void => {
    if (!desktop) return
    nativeSources.forEach((source, index) => subscribe(`native-${index}`, () => subscribeToNativeDocumentDrops(
      source,
      ({ paths, position }) => handleDroppedPaths(paths, { x: position.x / devicePixelRatio, y: position.y / devicePixelRatio }),
      ({ paths, position }) => options.onDragOver?.(paths, { x: position.x / devicePixelRatio, y: position.y / devicePixelRatio }),
      () => options.onDragLeave?.()
    )))
    if (rustSubscriber) subscribe('rust-window-event', () => rustSubscriber((paths) => handleDroppedPaths(paths)))
  }

  const dragOver = (event: DragEvent): void => {
    event.preventDefault()
    options.onDragOver?.([], { x: event.clientX, y: event.clientY })
  }
  const drop = (event: DragEvent): void => {
    event.preventDefault()
    options.onDragLeave?.()
    const paths = Array.from(event.dataTransfer?.files ?? []).map(options.pathForFile).filter(Boolean)
    handleDroppedPaths(paths, { x: event.clientX, y: event.clientY })
  }
  const dragLeave = (): void => options.onDragLeave?.()
  const focus = (): void => ensureDesktopSubscriptions()

  target.addEventListener('dragover', dragOver, true)
  target.addEventListener('drop', drop, true)
  target.addEventListener('dragleave', dragLeave, true)
  target.addEventListener('focus', focus)
  ensureDesktopSubscriptions()

  return () => {
    active = false
    target.removeEventListener('dragover', dragOver, true)
    target.removeEventListener('drop', drop, true)
    target.removeEventListener('dragleave', dragLeave, true)
    target.removeEventListener('focus', focus)
    for (const cleanup of cleanups.values()) cleanup()
    cleanups.clear()
    pending.clear()
    recentlyOpened.clear()
  }
}
