import { PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { BodyFontScale, ToolIconScale, UiScale } from '@/core/file-preferences'
import { isTauriRuntime, observeDisplayScaleFactor } from './display-scale'

const ZOOM_EPSILON = 0.000001
const BASE_MINIMUM_WINDOW_WIDTH = 1024
const BASE_MINIMUM_WINDOW_HEIGHT = 640

interface NativeScaleTarget {
  scale: UiScale
  displayScaleFactor: number
  zoom: number
}

let requestedScale: UiScale | null = null
let appliedZoomTarget: NativeScaleTarget | null = null
let appliedMinimumScale: UiScale | null = null
let pendingMinimumScale: UiScale | null = null
let desiredTarget: NativeScaleTarget | null = null
let nativeScaleQueue = Promise.resolve()
let minimumSizeObserverInstalled = false

function zoomsMatch(left: number, right: number): boolean {
  return Math.abs(left - right) <= ZOOM_EPSILON
}

function targetsMatch(left: NativeScaleTarget, right: NativeScaleTarget): boolean {
  return left.scale === right.scale
    && zoomsMatch(left.displayScaleFactor, right.displayScaleFactor)
    && zoomsMatch(left.zoom, right.zoom)
}

function nativeScaleTarget(scale: UiScale, displayScaleFactor: number): NativeScaleTarget {
  return { scale, displayScaleFactor, zoom: scale / displayScaleFactor }
}

function minimumWindowSize(scale: UiScale): PhysicalSize {
  return new PhysicalSize(
    Math.round(BASE_MINIMUM_WINDOW_WIDTH * scale),
    Math.round(BASE_MINIMUM_WINDOW_HEIGHT * scale)
  )
}

function queuePendingMinimumSize(): void {
  const operation = nativeScaleQueue.catch(() => undefined).then(async () => {
    const scale = pendingMinimumScale
    if (scale === null) return
    const appWindow = getCurrentWindow()
    if (await appWindow.isMaximized()) return
    await appWindow.setMinSize(minimumWindowSize(scale))
    if (pendingMinimumScale === scale) {
      appliedMinimumScale = scale
      pendingMinimumScale = null
    }
  })
  nativeScaleQueue = operation
}

function ensureMinimumSizeObserver(): void {
  if (minimumSizeObserverInstalled) return
  minimumSizeObserverInstalled = true
  void getCurrentWindow().onResized(queuePendingMinimumSize).catch(() => {
    minimumSizeObserverInstalled = false
  })
}

function queueNativeScale(target: NativeScaleTarget): Promise<void> {
  desiredTarget = target
  const operation = nativeScaleQueue.catch(() => undefined).then(async () => {
    if (!desiredTarget || !targetsMatch(target, desiredTarget)) return
    const zoomApplied = appliedZoomTarget && targetsMatch(target, appliedZoomTarget)
    const minimumApplied = appliedMinimumScale === target.scale || pendingMinimumScale === target.scale
    if (zoomApplied && minimumApplied) return

    const appWindow = getCurrentWindow()
    const wasMaximized = await appWindow.isMaximized()
    if (!zoomApplied) {
      await getCurrentWebview().setZoom(target.zoom)
      appliedZoomTarget = target
    }

    let maximized = await appWindow.isMaximized()
    if (wasMaximized && !maximized) {
      await appWindow.maximize()
      maximized = true
    }
    if (!desiredTarget || !targetsMatch(target, desiredTarget)) return
    if (maximized) {
      pendingMinimumScale = target.scale
      ensureMinimumSizeObserver()
      return
    }
    if (appliedMinimumScale !== target.scale) {
      await appWindow.setMinSize(minimumWindowSize(target.scale))
      appliedMinimumScale = target.scale
    }
    if (pendingMinimumScale === target.scale) pendingMinimumScale = null
  })
  nativeScaleQueue = operation
  return operation
}

function handleDisplayScaleChange(scaleFactor: number): void {
  if (requestedScale === null) return
  void queueNativeScale(nativeScaleTarget(requestedScale, scaleFactor)).catch(() => undefined)
}

export async function applyUiScale(scale: UiScale): Promise<void> {
  if (!isTauriRuntime()) return
  requestedScale = scale
  const displayScaleFactor = await observeDisplayScaleFactor(handleDisplayScaleChange)
  await queueNativeScale(nativeScaleTarget(requestedScale, displayScaleFactor))
}

export function applyToolIconScale(scale: ToolIconScale): void {
  if (typeof document === 'undefined') return
  const compact = scale === 1
  const sizes = {
    '--tool-rail-icon-size': compact ? '22px' : '32px',
    '--tool-rail-utility-icon-size': '22px',
    '--tool-rail-button-size': compact ? '32px' : '44px',
    '--tool-rail-flyout-offset': compact ? '36px' : '48px',
    '--tool-rail-column-size': compact ? '45px' : '57px'
  }
  document.documentElement.dataset.toolIconScale = compact ? 'normal' : 'large'
  for (const [name, value] of Object.entries(sizes)) document.documentElement.style.setProperty(name, value)
}

/** Applies only the shared body-text tokens, leaving canvas coordinates and icon geometry untouched. */
export function applyBodyFontScale(scale: BodyFontScale): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--ui-body-font-scale', String(scale))
}
