import type { GradientMapSettings } from '@shared/types-gradient-map'
import { normalizeGradientMap } from './gradient-map'

export const GRADIENT_MAP_PRESETS_KEY = 'moonsprite.gradient-map-presets.v1'
export interface GradientMapPreset { name: string; settings: GradientMapSettings }
const ramp = (...colors: string[]): GradientMapSettings => normalizeGradientMap({ stops: colors.map((hex, index) => ({
  position: index / (colors.length - 1), color: { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 255 }
})) })
export const GRADIENT_MAP_BUILTINS = [
  { nameKey: 'gradientMap.grayscale', settings: ramp('000000', 'ffffff') },
  { nameKey: 'gradientMap.silver', settings: ramp('141b26', '6b7b8e', 'f0f5ff', '8795a8', 'ffffff') },
  { nameKey: 'gradientMap.gold', settings: ramp('301a07', '946119', 'f6cf62', 'a56c1c', 'fff7c0') },
  { nameKey: 'gradientMap.copper', settings: ramp('291410', '88432b', 'e69363', 'a35435', 'ffe1b1') },
  { nameKey: 'gradientMap.ocean', settings: ramp('081b39', '155879', '30afbc', 'd2f4e7') },
  { nameKey: 'gradientMap.sunset', settings: ramp('25133d', '813d75', 'ec7862', 'ffe6a2') },
  { nameKey: 'gradientMap.gameboy', settings: { ...ramp('0f380f', '306230', '8bac0f', '9bbc0f'), mode: 'steps' as const } },
  { nameKey: 'gradientMap.sepia', settings: ramp('28160e', 'ffecc0') }
] as const

export function loadGradientMapPresets(storage: Pick<Storage, 'getItem'> = localStorage): GradientMapPreset[] {
  const raw = storage.getItem(GRADIENT_MAP_PRESETS_KEY)
  if (raw === null) return []
  const data: unknown = JSON.parse(raw)
  if (!Array.isArray(data) || data.length > 100) throw new Error('Invalid gradient preset data')
  return data.map(value => {
    if (!value || typeof value.name !== 'string' || !value.name.trim() || !Array.isArray(value.settings?.stops) || value.settings.stops.length < 2 || value.settings.stops.length > 256) throw new Error('Invalid gradient preset')
    return { name: value.name.trim().slice(0, 80), settings: normalizeGradientMap(value.settings) }
  })
}

/** Write first: a failed write must not appear as a successfully saved preset. */
export function saveGradientMapPreset(name: string, settings: GradientMapSettings, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): GradientMapPreset[] {
  const presets = loadGradientMapPresets(storage)
  const label = name.trim().slice(0, 80)
  if (!label) throw new Error('A gradient preset needs a name')
  const next = [...presets.filter(preset => preset.name !== label), { name: label, settings: normalizeGradientMap(settings) }]
  if (next.length > 100) throw new Error('Gradient preset library is full')
  storage.setItem(GRADIENT_MAP_PRESETS_KEY, JSON.stringify(next))
  return next
}

export const gradientMapCss = (settings: GradientMapSettings): string => `linear-gradient(${settings.reverse ? 270 : 90}deg, ${settings.stops.map(stop => `rgb(${stop.color.r}, ${stop.color.g}, ${stop.color.b}) ${stop.position * 100}%`).join(', ')})`

export function deleteGradientMapPreset(name: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): GradientMapPreset[] {
  const next = loadGradientMapPresets(storage).filter(preset => preset.name !== name)
  storage.setItem(GRADIENT_MAP_PRESETS_KEY, JSON.stringify(next))
  return next
}

const HIDDEN_BUILTINS_KEY = 'moonsprite.gradient-map-hidden-builtins.v1'
export function loadHiddenGradientMapPresets(storage: Pick<Storage, 'getItem'> = localStorage): string[] {
  const raw = storage.getItem(HIDDEN_BUILTINS_KEY)
  if (raw === null) return []
  const data: unknown = JSON.parse(raw)
  if (!Array.isArray(data) || data.some(key => typeof key !== 'string')) throw new Error('Invalid hidden gradient presets')
  return data.filter(key => GRADIENT_MAP_BUILTINS.some(preset => preset.nameKey === key))
}

export function hideGradientMapBuiltin(key: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): string[] {
  if (!GRADIENT_MAP_BUILTINS.some(preset => preset.nameKey === key)) throw new Error('Unknown gradient preset')
  const next = [...new Set([...loadHiddenGradientMapPresets(storage), key])]
  storage.setItem(HIDDEN_BUILTINS_KEY, JSON.stringify(next))
  return next
}
