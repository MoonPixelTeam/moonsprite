import type { RgbaColor } from '@shared/types-color'
import { readStoredJson, writeStoredJson } from './storage'

export const COLOR_ROLE_PREFERENCES_KEY = 'moonsprite.color-roles.v1'

export interface ColorRolePreferences {
  primary: RgbaColor
  secondary: RgbaColor
}

export const DEFAULT_COLOR_ROLE_PREFERENCES: ColorRolePreferences = {
  primary: { r: 41, g: 121, b: 255, a: 255 },
  secondary: { r: 241, g: 244, b: 248, a: 255 }
}

let pendingPreferences: ColorRolePreferences | null = null
let persistTimer: number | null = null

function normalizeChannel(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(255, Math.round(value)))
    : fallback
}

function normalizeColor(value: unknown, fallback: RgbaColor): RgbaColor {
  if (!value || typeof value !== 'object') return { ...fallback }
  const candidate = value as Partial<RgbaColor>
  return {
    r: normalizeChannel(candidate.r, fallback.r),
    g: normalizeChannel(candidate.g, fallback.g),
    b: normalizeChannel(candidate.b, fallback.b),
    a: normalizeChannel(candidate.a, fallback.a)
  }
}

export function loadColorRolePreferences(storage?: Storage): ColorRolePreferences {
  const stored = readStoredJson<Partial<ColorRolePreferences> | null>(COLOR_ROLE_PREFERENCES_KEY, null, storage)
  return {
    primary: normalizeColor(stored?.primary, DEFAULT_COLOR_ROLE_PREFERENCES.primary),
    secondary: normalizeColor(stored?.secondary, DEFAULT_COLOR_ROLE_PREFERENCES.secondary)
  }
}

export function flushColorRolePreferences(storage?: Storage): void {
  if (persistTimer !== null && typeof window !== 'undefined') window.clearTimeout(persistTimer)
  persistTimer = null
  const pending = pendingPreferences
  pendingPreferences = null
  if (pending) writeStoredJson(COLOR_ROLE_PREFERENCES_KEY, pending, storage)
}

export function persistColorRolePreferences(primary: RgbaColor, secondary: RgbaColor): void {
  pendingPreferences = { primary: { ...primary }, secondary: { ...secondary } }
  if (typeof window === 'undefined') {
    flushColorRolePreferences()
    return
  }
  if (persistTimer !== null) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => flushColorRolePreferences(), 100)
}
