import { readStoredJson, readStoredString, removeStoredValue, writeStoredString } from './storage'

export { readStoredString, removeStoredValue, writeStoredString } from './storage'

export const ACTIVE_PALETTE_ID_STORAGE_KEY = 'moonsprite.active-palette-id'

export interface FloatingPosition { x: number; y: number; width?: number; height?: number }

interface PersistedFloatingPosition extends FloatingPosition {
  viewportWidth?: number
  viewportHeight?: number
}

export interface ViewportSize { width: number; height: number }

export interface FloatingResizeOptions {
  responsiveToViewport: boolean
  followViewportRight: boolean
  userPositioned: boolean
  initialRightOffset: number
  minWidth: number
  minHeight: number
}

const clampToRange = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

function remapFloatingCoordinate(position: number, panelSize: number, previousViewportSize: number, viewportSize: number): number {
  const previousTravel = Math.max(0, previousViewportSize - panelSize)
  const nextTravel = Math.max(0, viewportSize - panelSize)
  if (nextTravel <= 0) return 0
  if (previousTravel <= 0) return clampToRange(position, 0, nextTravel)
  return clampToRange(position / previousTravel, 0, 1) * nextTravel
}

export function resizeFloatingPosition(position: FloatingPosition, previousViewport: ViewportSize, viewport: ViewportSize, options: FloatingResizeOptions, measuredSize: { width?: number; height?: number } = {}): FloatingPosition {
  const width = position.width
  const height = position.height
  const visibleWidth = width ?? measuredSize.width ?? options.minWidth
  const visibleHeight = height ?? measuredSize.height ?? options.minHeight
  const rawX = options.responsiveToViewport
    ? remapFloatingCoordinate(position.x, visibleWidth, previousViewport.width, viewport.width)
    : options.followViewportRight && !options.userPositioned
      ? viewport.width - options.initialRightOffset
      : position.x
  const rawY = options.responsiveToViewport
    ? remapFloatingCoordinate(position.y, visibleHeight, previousViewport.height, viewport.height)
    : position.y
  const next: FloatingPosition = {
    x: clampToRange(rawX, 0, Math.max(0, viewport.width - visibleWidth)),
    y: clampToRange(rawY, 0, Math.max(0, viewport.height - visibleHeight))
  }
  if (width !== undefined) next.width = width
  if (height !== undefined) next.height = height
  return next
}

export function loadFloatingPosition(key: string | undefined, initialPosition: FloatingPosition | null, viewport: ViewportSize, responsiveToViewport: boolean, forceDocked: boolean, storage?: Storage): FloatingPosition | null {
  if (forceDocked || !key) return forceDocked ? null : initialPosition
  try {
    const stored = readStoredJson<PersistedFloatingPosition | null>(key, null, storage)
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
      const storedWidth = typeof stored.width === 'number' && Number.isFinite(stored.width) ? stored.width : undefined
      const storedHeight = typeof stored.height === 'number' && Number.isFinite(stored.height) ? stored.height : undefined
      const width = storedWidth === undefined ? undefined : storedWidth > viewport.width * 1.25 ? initialPosition?.width ?? 280 : Math.max(180, Math.min(viewport.width - 12, storedWidth))
      const height = storedHeight === undefined ? undefined : storedHeight > viewport.height * 1.25 ? initialPosition?.height ?? 240 : Math.max(120, Math.min(viewport.height - 12, storedHeight))
      const measuredWidth = width ?? 220
      const measuredHeight = height ?? 130
      const previousViewport = {
        width: typeof stored.viewportWidth === 'number' && stored.viewportWidth > 0 ? stored.viewportWidth : viewport.width,
        height: typeof stored.viewportHeight === 'number' && stored.viewportHeight > 0 ? stored.viewportHeight : viewport.height
      }
      const x = responsiveToViewport ? remapFloatingCoordinate(stored.x, measuredWidth, previousViewport.width, viewport.width) : stored.x
      const y = responsiveToViewport ? remapFloatingCoordinate(stored.y, measuredHeight, previousViewport.height, viewport.height) : stored.y
      return {
        x: Math.max(0, Math.min(Math.max(0, viewport.width - measuredWidth), x)),
        y: Math.max(0, Math.min(Math.max(0, viewport.height - measuredHeight), y)),
        width,
        height
      }
    }
  } catch {
    return initialPosition
  }
  return initialPosition
}

export function saveFloatingPosition(key: string | undefined, position: FloatingPosition | null, viewport: ViewportSize, storage?: Storage): void {
  if (!key) return
  if (!position) {
    removeStoredValue(key, storage)
    return
  }
  writeStoredString(key, JSON.stringify({ ...position, viewportWidth: viewport.width, viewportHeight: viewport.height }), storage)
}

export type PanelColorPickerScheme = 'moon-ring' | 'sv-square' | 'hs-square' | 'wheel' | 'normal-map'
export interface PanelColorPickerConfig {
  scheme: PanelColorPickerScheme
  hueSteps: number
  colorSteps: number
  moonField?: 'hsv-square' | 'hsl-triangle'
}

export function parseColorPickerConfig(configValue: string | null, schemeValue: string | null, huePresets: readonly number[], colorPresets: readonly number[], fallbackScheme: PanelColorPickerScheme = 'sv-square'): PanelColorPickerConfig {
  const schemes: readonly PanelColorPickerScheme[] = ['moon-ring', 'sv-square', 'hs-square', 'wheel', 'normal-map']
  const schemeFromStorage = schemes.includes(schemeValue as PanelColorPickerScheme) ? schemeValue as PanelColorPickerScheme : fallbackScheme
  const defaults: PanelColorPickerConfig = { scheme: schemeFromStorage, hueSteps: huePresets[0] ?? 0, colorSteps: colorPresets[0] ?? 0, moonField: 'hsv-square' }
  try {
    const stored = JSON.parse(configValue ?? 'null') as Partial<PanelColorPickerConfig> | null
    if (!stored) return defaults
    const nearestPreset = (value: unknown, presets: readonly number[]): number => {
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || presets.length === 0) return presets[0] ?? 0
      return presets.reduce((nearest, preset) => Math.abs(preset - numeric) < Math.abs(nearest - numeric) ? preset : nearest, presets[0])
    }
    return {
      scheme: schemes.includes(stored.scheme as PanelColorPickerScheme) ? stored.scheme as PanelColorPickerScheme : defaults.scheme,
      hueSteps: nearestPreset(stored.hueSteps, huePresets),
      colorSteps: nearestPreset(stored.colorSteps, colorPresets),
      moonField: stored.moonField === 'hsl-triangle' ? 'hsl-triangle' : 'hsv-square'
    }
  } catch {
    return defaults
  }
}

export function saveColorPickerConfig(config: PanelColorPickerConfig, storage?: Storage): void {
  writeStoredString('moonsprite.color-picker-config', JSON.stringify(config), storage)
  writeStoredString('moonsprite.color-picker-scheme', config.scheme, storage)
}
