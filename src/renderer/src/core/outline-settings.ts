import type { OutlineDirection, OutlineKernel, OutlinePosition, OutlineSettings, RgbaColor } from '@shared/types'
import { colorEquals } from './raster'

export const OUTLINE_DIRECTIONS: readonly OutlineDirection[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
export const DEFAULT_OUTLINE_SMART_HUE_DARKNESS = 45
const positions = new Set<OutlinePosition>(['inside', 'outside', 'both'])
const kernels = new Set<OutlineKernel>(['round', 'square', 'horizontal', 'vertical'])
const diagonalDirections = new Set<OutlineDirection>(['nw', 'ne', 'sw', 'se'])

export const allOutlineDirections = (): OutlineSettings['directions'] => ({ nw: true, n: true, ne: true, w: true, e: true, sw: true, s: true, se: true })

export const outlineDirectionsForKernel = (kernel: OutlineKernel): OutlineSettings['directions'] => {
  const directions = allOutlineDirections()
  if (kernel === 'round') for (const direction of diagonalDirections) directions[direction] = false
  if (kernel === 'horizontal') for (const direction of ['nw', 'n', 'ne', 'sw', 's', 'se'] as OutlineDirection[]) directions[direction] = false
  if (kernel === 'vertical') for (const direction of ['nw', 'w', 'sw', 'ne', 'e', 'se'] as OutlineDirection[]) directions[direction] = false
  return directions
}

export const outlineDirectionsMatchKernel = (kernel: OutlineKernel, directions: OutlineSettings['directions']): boolean => {
  const preset = outlineDirectionsForKernel(kernel)
  return OUTLINE_DIRECTIONS.every((direction) => preset[direction] === directions[direction])
}

export const outlineDirectionForOffset = (dx: number, dy: number): OutlineDirection | null => {
  if (dx === 0 && dy === 0) return null
  if (dy < 0) return dx < 0 ? 'nw' : dx > 0 ? 'ne' : 'n'
  if (dy > 0) return dx < 0 ? 'sw' : dx > 0 ? 'se' : 's'
  return dx < 0 ? 'w' : 'e'
}

export const outlineKernelContainsOffset = (dx: number, dy: number, radius: number, kernel: OutlineKernel): boolean => {
  if (dx === 0 && dy === 0) return false
  if (kernel === 'horizontal') return dy === 0 && Math.abs(dx) <= radius
  if (kernel === 'vertical') return dx === 0 && Math.abs(dy) <= radius
  if (kernel === 'round') return dx * dx + dy * dy <= radius * radius
  return Math.max(Math.abs(dx), Math.abs(dy)) <= radius
}

export const normalizeOutlineKernel = (value: unknown, fallback: OutlineKernel): OutlineKernel => kernels.has(value as OutlineKernel) ? value as OutlineKernel : fallback
export const normalizeOutlinePosition = (value: unknown, fallback: OutlinePosition): OutlinePosition => positions.has(value as OutlinePosition) ? value as OutlinePosition : fallback

export const normalizeOutlineDirections = (value: unknown, fallback: OutlineSettings['directions']): OutlineSettings['directions'] => {
  const candidate = value && typeof value === 'object' ? value as Partial<OutlineSettings['directions']> : null
  return Object.fromEntries(OUTLINE_DIRECTIONS.map((direction) => [direction, typeof candidate?.[direction] === 'boolean' ? candidate[direction] : fallback[direction]])) as OutlineSettings['directions']
}

const clampChannel = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : fallback

const clampPercentage = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback

type OutlineStrokeColorSettings = Pick<OutlineSettings, 'color' | 'smartHue' | 'smartHueDarkness' | 'followOpacity'>

export const resolveOutlineStrokeColor = (
  settings: OutlineStrokeColorSettings,
  referenceColor: RgbaColor,
  resolveDynamicColor: (color: RgbaColor) => RgbaColor = (color) => color
): RgbaColor => {
  if (!settings.smartHue && !settings.followOpacity) return settings.color
  if (referenceColor.a === 0) return settings.color
  const alpha = settings.followOpacity
    ? Math.round(settings.color.a * referenceColor.a / 255)
    : settings.color.a
  if (!settings.smartHue) return { ...settings.color, a: alpha }
  const multiplier = 1 - clampPercentage(settings.smartHueDarkness, DEFAULT_OUTLINE_SMART_HUE_DARKNESS) / 100
  return resolveDynamicColor({
    r: Math.round(referenceColor.r * multiplier),
    g: Math.round(referenceColor.g * multiplier),
    b: Math.round(referenceColor.b * multiplier),
    a: alpha
  })
}

export const defaultOutlineSettings = (color: RgbaColor): OutlineSettings => ({
  color: { ...color },
  backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
  thickness: 1,
  position: 'outside',
  kernel: 'round',
  directions: outlineDirectionsForKernel('round'),
  smartHue: false,
  smartHueDarkness: DEFAULT_OUTLINE_SMART_HUE_DARKNESS,
  followOpacity: false,
  previewEnabled: true
})

export const cloneOutlineSettings = (settings: OutlineSettings): OutlineSettings => ({
  ...settings,
  color: { ...settings.color },
  backgroundColor: { ...settings.backgroundColor },
  directions: { ...settings.directions }
})

export const normalizeOutlineSettings = (value: unknown, fallbackColor?: RgbaColor): OutlineSettings | null => {
  if (!value || typeof value !== 'object') return fallbackColor ? defaultOutlineSettings(fallbackColor) : null
  const candidate = value as Partial<OutlineSettings>
  const fallback = defaultOutlineSettings(fallbackColor ?? { r: 0, g: 0, b: 0, a: 255 })
  const color = candidate.color && typeof candidate.color === 'object' ? candidate.color : fallback.color
  const backgroundColor = candidate.backgroundColor && typeof candidate.backgroundColor === 'object' ? candidate.backgroundColor : fallback.backgroundColor
  return {
    color: {
      r: clampChannel(color.r, fallback.color.r),
      g: clampChannel(color.g, fallback.color.g),
      b: clampChannel(color.b, fallback.color.b),
      a: clampChannel(color.a, fallback.color.a)
    },
    backgroundColor: {
      r: clampChannel(backgroundColor.r, fallback.backgroundColor.r),
      g: clampChannel(backgroundColor.g, fallback.backgroundColor.g),
      b: clampChannel(backgroundColor.b, fallback.backgroundColor.b),
      a: clampChannel(backgroundColor.a, fallback.backgroundColor.a)
    },
    thickness: typeof candidate.thickness === 'number' && Number.isFinite(candidate.thickness)
      ? Math.max(1, Math.min(64, Math.round(candidate.thickness)))
      : fallback.thickness,
    position: normalizeOutlinePosition(candidate.position, fallback.position),
    kernel: normalizeOutlineKernel(candidate.kernel, fallback.kernel),
    directions: normalizeOutlineDirections(candidate.directions, fallback.directions),
    smartHue: candidate.smartHue === true,
    smartHueDarkness: clampPercentage(candidate.smartHueDarkness, fallback.smartHueDarkness),
    followOpacity: candidate.followOpacity === true,
    previewEnabled: candidate.previewEnabled !== false
  }
}
