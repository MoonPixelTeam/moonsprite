import type { CursorScale } from '@/core/file-preferences'
import { translateCurrent as tr } from '@/core/localization'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import cursorDefault from '@/assets/pixel-icons/01-Slice-1.png'
import cursorBlack from '@/assets/pixel-icons/02-Slice-2.png'
import cursorWhite from '@/assets/pixel-icons/03-Slice-3.png'
import cursorProgress from '@/assets/pixel-icons/04-Slice-4.png'
import cursorGrab from '@/assets/pixel-icons/05-Slice-5.png'
import cursorUnavailable from '@/assets/pixel-icons/06-Slice-6.png'
import cursorNsResize from '@/assets/pixel-icons/10-Slice-7.png'
import cursorEwResize from '@/assets/pixel-icons/11-Slice-8.png'
import cursorNwseResize from '@/assets/pixel-icons/12-Slice-9.png'
import cursorNeswResize from '@/assets/pixel-icons/13-Slice-10.png'
import cursorMove from '@/assets/pixel-icons/14-Slice-11.png'
import cursorEyedropper from '@/assets/pixel-icons/15-Slice-12.png'
import cursorSelectionMove from '@/assets/pixel-icons/16-Icon-16.png'
import cursorCopy from '@/assets/pixel-icons/17-Icon-17.png'
import cursorZoom from '@/assets/pixel-icons/19-Slice-13.png'
import cursorRotate from '@/assets/pixel-icons/20-Slice-14.png'
import cursorRotateNe from '@/assets/pixel-icons/21-Slice-15.png'
import cursorRotateSe from '@/assets/pixel-icons/22-Slice-16.png'
import cursorRotateSw from '@/assets/pixel-icons/23-Slice-17.png'
import cursorRotateNw from '@/assets/pixel-icons/24-Icon-24.png'
import cursorRotateN from '@/assets/pixel-icons/cursor-selection-rotate-n.png'
import cursorRotateS from '@/assets/pixel-icons/cursor-selection-rotate-s.png'
import builtinRotate from '@/assets/pixel-icons/cursor-rotate.png'
import builtinRotateNe from '@/assets/pixel-icons/cursor-selection-rotate-ne.png'
import builtinRotateSe from '@/assets/pixel-icons/cursor-selection-rotate-se.png'
import builtinRotateSw from '@/assets/pixel-icons/cursor-selection-rotate-sw.png'
import builtinRotateNw from '@/assets/pixel-icons/cursor-selection-rotate-nw.png'
import cursorShearHorizontal from '@/assets/pixel-icons/cursor-selection-shear-horizontal.png'
import cursorShearVertical from '@/assets/pixel-icons/cursor-selection-shear-vertical.png'
import cursorShearNesw from '@/assets/pixel-icons/cursor-selection-shear-nesw.png'
import cursorShearNwse from '@/assets/pixel-icons/cursor-selection-shear-nwse.png'
import { isTauriRuntime, normalizeDisplayScaleFactor, observeDisplayScaleFactor } from './display-scale'

export interface CursorDefinition {
  variable: string
  source: string
  builtinSource?: string
  /** Show a genuinely different builtin fallback in the component library. */
  includeBuiltinInLibrary?: boolean
  hotspot: [number, number]
  fallback: string
}

export const CURSOR_ICON_LIBRARY: readonly CursorDefinition[] = [
  { variable: '--cursor-default', source: cursorDefault, hotspot: [9, 5], fallback: 'default' },
  { variable: '--cursor-help', source: cursorDefault, hotspot: [9, 5], fallback: 'help' },
  { variable: '--cursor-progress', source: cursorProgress, hotspot: [11, 5], fallback: 'progress' },
  { variable: '--cursor-wait', source: cursorProgress, hotspot: [11, 5], fallback: 'wait' },
  { variable: '--cursor-project', source: cursorProgress, hotspot: [11, 5], fallback: 'pointer' },
  { variable: '--cursor-crosshair', source: cursorWhite, hotspot: [15, 15], fallback: 'none' },
  { variable: '--cursor-text', source: cursorDefault, hotspot: [9, 5], fallback: 'text' },
  { variable: '--cursor-pointer', source: cursorDefault, hotspot: [9, 5], fallback: 'pointer' },
  { variable: '--cursor-pencil-black', source: cursorBlack, hotspot: [15, 15], fallback: 'none' },
  { variable: '--cursor-pencil-white', source: cursorWhite, hotspot: [15, 15], fallback: 'none' },
  { variable: '--cursor-selection-black', source: cursorBlack, hotspot: [15, 15], fallback: 'none' },
  { variable: '--cursor-selection-white', source: cursorWhite, hotspot: [15, 15], fallback: 'none' },
  { variable: '--cursor-unavailable', source: cursorUnavailable, hotspot: [15, 15], fallback: 'not-allowed' },
  { variable: '--cursor-grab', source: cursorGrab, hotspot: [16, 16], fallback: 'grab' },
  { variable: '--cursor-grabbing', source: cursorGrab, hotspot: [16, 16], fallback: 'grabbing' },
  { variable: '--cursor-move', source: cursorMove, hotspot: [3, 3], fallback: 'move' },
  { variable: '--cursor-swatch-edge', source: cursorMove, hotspot: [3, 3], fallback: 'default' },
  { variable: '--cursor-eyedropper', source: cursorEyedropper, hotspot: [5, 28], fallback: 'none' },
  { variable: '--cursor-selection-move', source: cursorSelectionMove, hotspot: [3, 3], fallback: 'move' },
  { variable: '--cursor-copy', source: cursorCopy, hotspot: [5, 3], fallback: 'copy' },
  { variable: '--cursor-zoom', source: cursorZoom, hotspot: [13, 13], fallback: 'none' },
  { variable: '--cursor-rotate', source: cursorRotate, builtinSource: builtinRotate, hotspot: [12, 22], fallback: 'crosshair' },
  { variable: '--cursor-ns-resize', source: cursorNsResize, hotspot: [15, 15], fallback: 'ns-resize' },
  { variable: '--cursor-n-resize', source: cursorNsResize, hotspot: [15, 15], fallback: 'n-resize' },
  { variable: '--cursor-ew-resize', source: cursorEwResize, hotspot: [15, 15], fallback: 'ew-resize' },
  { variable: '--cursor-nwse-resize', source: cursorNwseResize, hotspot: [16, 16], fallback: 'nwse-resize' },
  { variable: '--cursor-nesw-resize', source: cursorNeswResize, hotspot: [16, 16], fallback: 'nesw-resize' },
  { variable: '--cursor-selection-rotate-ne', source: cursorRotateNe, builtinSource: builtinRotateNe, includeBuiltinInLibrary: true, hotspot: [16, 16], fallback: 'crosshair' },
  { variable: '--cursor-selection-rotate-se', source: cursorRotateSe, builtinSource: builtinRotateSe, hotspot: [16, 16], fallback: 'crosshair' },
  { variable: '--cursor-selection-rotate-sw', source: cursorRotateSw, builtinSource: builtinRotateSw, includeBuiltinInLibrary: true, hotspot: [16, 16], fallback: 'crosshair' },
  { variable: '--cursor-selection-rotate-nw', source: cursorRotateNw, builtinSource: builtinRotateNw, includeBuiltinInLibrary: true, hotspot: [16, 16], fallback: 'crosshair' },
  { variable: '--cursor-selection-rotate-n', source: cursorRotateN, builtinSource: cursorRotateN, hotspot: [16, 16], fallback: 'crosshair' },
  { variable: '--cursor-selection-rotate-s', source: cursorRotateS, builtinSource: cursorRotateS, hotspot: [16, 16], fallback: 'crosshair' },
  { variable: '--cursor-selection-shear-horizontal', source: cursorShearHorizontal, builtinSource: cursorShearHorizontal, hotspot: [16, 16], fallback: 'ew-resize' },
  { variable: '--cursor-selection-shear-vertical', source: cursorShearVertical, builtinSource: cursorShearVertical, hotspot: [16, 16], fallback: 'ns-resize' },
  { variable: '--cursor-selection-shear-nesw', source: cursorShearNesw, builtinSource: cursorShearNesw, hotspot: [16, 16], fallback: 'nesw-resize' },
  { variable: '--cursor-selection-shear-nwse', source: cursorShearNwse, builtinSource: cursorShearNwse, hotspot: [16, 16], fallback: 'nwse-resize' }
] as const

const cursorDefinitions: CursorDefinition[] = [...CURSOR_ICON_LIBRARY]

// Editing feedback must stay deterministic. The system crosshair is visually
// indistinguishable from a lost/unfinished canvas interaction, and the home
// project-card cursor is part of the product's visual language. These cursors
// always use the bundled pixel assets; the preference still controls ordinary
// application cursors and resize cursors.
const canvasPixelCursorVariables = new Set([
  '--cursor-crosshair',
  '--cursor-pencil-black',
  '--cursor-pencil-white',
  '--cursor-selection-black',
  '--cursor-selection-white',
  '--cursor-eyedropper',
  '--cursor-zoom',
  // Home project cards use a dedicated pixel pointer. Keep it available even
  // when ordinary application pointers are delegated to the system cursor.
  '--cursor-project'
])

export type CursorPreferenceSource = 'system' | 'moonsprite'

export const cursorPreferenceSource = (variable: string, useLocalCursors: boolean): CursorPreferenceSource => {
  const definition = cursorDefinitions.find((item) => item.variable === variable)
  return useLocalCursors && !definition?.builtinSource && !canvasPixelCursorVariables.has(variable) ? 'system' : 'moonsprite'
}

export interface CursorOverlayDescriptor {
  source: string
  size: number
  hotspotX: number
  hotspotY: number
}

const CURSOR_ASSET_SIZE = 32
const cursorVariablePattern = /^var\((--cursor-[^)]+)\)$/

export function cursorOverlayDescriptor(cursorValue: string, useLocalCursors: boolean, scale: CursorScale, interfaceScale = 1): CursorOverlayDescriptor | null {
  const variable = cursorVariablePattern.exec(cursorValue.trim())?.[1]
  if (!variable) return null
  const definition = cursorDefinitions.find((item) => item.variable === variable)
  if (!definition) return null
  const normalizedInterfaceScale = Number.isFinite(interfaceScale) && interfaceScale > 0 ? interfaceScale : 1
  const normalizedScale = (Number.isFinite(scale) && scale > 0 ? scale : 1) / normalizedInterfaceScale
  return {
    source: useLocalCursors ? definition.builtinSource ?? definition.source : definition.source,
    size: CURSOR_ASSET_SIZE * normalizedScale,
    hotspotX: definition.hotspot[0] * normalizedScale,
    hotspotY: definition.hotspot[1] * normalizedScale
  }
}

let requestedNativeCursorVisibility = true
let appliedNativeCursorVisibility: boolean | null = null
let nativeCursorVisibilityQueue = Promise.resolve()

export function setNativeCursorVisible(visible: boolean): Promise<void> {
  requestedNativeCursorVisibility = visible
  if (!isTauriRuntime()) return Promise.resolve()
  const requested = visible
  const operation = nativeCursorVisibilityQueue.catch(() => undefined).then(async () => {
    if (requestedNativeCursorVisibility !== requested || appliedNativeCursorVisibility === requested) return
    await getCurrentWindow().setCursorVisible(requested)
    appliedNativeCursorVisibility = requested
  })
  nativeCursorVisibilityQueue = operation
  return operation
}

const scaledCursorCache = new Map<string, Promise<string>>()
let applicationGeneration = 0
let requestedCursorPreferences: { useLocalCursors: boolean; scale: CursorScale } | null = null

const formatCursorNumber = (value: number): string => String(Math.round(value * 1_000_000) / 1_000_000)

const cursorImageValue = (source: string, resolution: number): string => {
  const normalizedResolution = normalizeDisplayScaleFactor(resolution)
  return normalizedResolution === 1
    ? `url('${source}')`
    : `image-set(url('${source}') ${formatCursorNumber(normalizedResolution)}x)`
}

// A CSS image cursor must have a fallback keyword. `none` prevents WebView
// from painting its own arrow while an image is decoding. In the desktop
// runtime, the native fallback command installs the bundled pixel pointer on
// the window and WebView child windows, so `none` never leaves the user with a
// different Windows cursor during a renderer stall.
const softwareCursorFallback = (): string => isTauriRuntime() ? 'none' : 'default'

let nativeCursorSyncGeneration = 0
let nativeCursorSyncQueue = Promise.resolve()
function syncNativeSoftwareCursor(useLocalCursors: boolean): void {
  if (!isTauriRuntime()) return
  const generation = ++nativeCursorSyncGeneration
  nativeCursorSyncQueue = nativeCursorSyncQueue.catch(() => undefined).then(async () => {
    if (generation !== nativeCursorSyncGeneration) return
    await invoke('set_native_cursor', { enabled: !useLocalCursors }).catch(() => undefined)
  })
}

const scaledCursorUrl = (source: string, scale: number): Promise<string> => {
  const key = `${source}:${scale.toFixed(6)}`
  const cached = scaledCursorCache.get(key)
  if (cached) return cached
  const pending = new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) { reject(new Error(tr('core.cursor.scaleFailed'))); return }
      context.imageSmoothingEnabled = false
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => reject(new Error(tr('core.cursor.readFailed')))
    image.src = source
  })
  scaledCursorCache.set(key, pending)
  return pending
}

async function applyCursorPreferencesForDisplayScale(useLocalCursors: boolean, scale: CursorScale, displayScaleFactor: number, preserveCurrentValues: boolean): Promise<void> {
  const generation = ++applicationGeneration
  const root = document.documentElement.style
  const displayResolution = normalizeDisplayScaleFactor(displayScaleFactor)
  // Install an unscaled value synchronously so a preference refresh never falls
  // back to the browser cursor while scaled assets are loading.
  for (const definition of cursorDefinitions) {
    if (cursorPreferenceSource(definition.variable, useLocalCursors) === 'system') {
      root.setProperty(definition.variable, definition.fallback)
      continue
    }
    const builtinSource = definition.builtinSource ?? definition.source
    const preferredSource = useLocalCursors ? builtinSource : definition.source
    const fallbackResolution = displayResolution / scale
    const hotspotX = definition.hotspot[0] / fallbackResolution
    const hotspotY = definition.hotspot[1] / fallbackResolution
    if (!preserveCurrentValues || !root.getPropertyValue(definition.variable)) {
      root.setProperty(definition.variable, `${cursorImageValue(preferredSource, fallbackResolution)} ${formatCursorNumber(hotspotX)} ${formatCursorNumber(hotspotY)}, ${cursorImageValue(builtinSource, fallbackResolution)} ${formatCursorNumber(hotspotX)} ${formatCursorNumber(hotspotY)}, ${softwareCursorFallback()}`)
    }
  }
  const values = await Promise.all(cursorDefinitions.map(async (definition) => {
    if (cursorPreferenceSource(definition.variable, useLocalCursors) === 'system') {
      return [definition.variable, definition.fallback] as const
    }
    const builtinSource = definition.builtinSource ?? definition.source
    const preferredSource = useLocalCursors ? builtinSource : definition.source
    const source = scale === 1
      ? preferredSource
      : await scaledCursorUrl(preferredSource, scale).catch(() => scaledCursorUrl(builtinSource, scale))
    const builtin = scale === 1 ? builtinSource : await scaledCursorUrl(builtinSource, scale)
    const hotspotX = Math.round(definition.hotspot[0] * scale) / displayResolution
    const hotspotY = Math.round(definition.hotspot[1] * scale) / displayResolution
    const builtinValue = `${cursorImageValue(builtin, displayResolution)} ${formatCursorNumber(hotspotX)} ${formatCursorNumber(hotspotY)}`
    return [definition.variable, `${cursorImageValue(source, displayResolution)} ${formatCursorNumber(hotspotX)} ${formatCursorNumber(hotspotY)}, ${builtinValue}, ${softwareCursorFallback()}`] as const
  }))
  if (generation !== applicationGeneration) return
  for (const [variable, value] of values) root.setProperty(variable, value)
}

function handleDisplayScaleChange(displayScaleFactor: number): void {
  const preferences = requestedCursorPreferences
  if (!preferences) return
  void applyCursorPreferencesForDisplayScale(preferences.useLocalCursors, preferences.scale, displayScaleFactor, true).catch(() => undefined)
}

export async function applyCursorPreferences(useLocalCursors: boolean, scale: CursorScale): Promise<void> {
  const request = { useLocalCursors, scale }
  requestedCursorPreferences = request
  syncNativeSoftwareCursor(useLocalCursors)
  const displayScaleFactor = await observeDisplayScaleFactor(handleDisplayScaleChange)
  if (requestedCursorPreferences !== request) return
  await applyCursorPreferencesForDisplayScale(useLocalCursors, scale, displayScaleFactor, false)
}
