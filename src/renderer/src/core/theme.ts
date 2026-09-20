import type { RgbaColor } from '@shared/types-color'
import { readStoredString, writeStoredString } from './storage'

export const THEME_PREFERENCE_KEY = 'moonsprite.preference.theme'
export const THEME_SCHEMA_VERSION = 2

export type ThemeMode = 'dark' | 'light'

export interface ThemeSeedColors {
  workspace: string
  surface: string
  raisedSurface: string
  deepSurface: string
  canvasSurround: string
  border: string
  borderStrong: string
  controlBackground: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  accent: string
  danger: string
  success: string
  warning: string
}

export interface ThemeVisualDefaults {
  checkerLight: RgbaColor
  checkerDark: RgbaColor
  pixelGrid: RgbaColor
  customGrid: RgbaColor
  onionPrevious: RgbaColor
  onionNext: RgbaColor
  symmetryAxis: RgbaColor
}

export interface ThemeDefinition {
  kind: 'moonsprite-theme'
  schemaVersion: 2
  id: string
  name: string
  baseThemeId?: string
  seeds: ThemeSeedColors
  visualDefaults: ThemeVisualDefaults
}

export interface ThemePreferences {
  activeThemeId: string
  followSystem?: boolean
  customThemes: ThemeDefinition[]
  visualOverrides?: Partial<ThemeVisualDefaults>
}

export type ThemePalette = { [K in keyof ThemeVisualDefaults]: string }

export interface ResolvedTheme {
  definition: ThemeDefinition
  visualDefaults: ThemeVisualDefaults
  mode: ThemeMode
  variables: Record<string, string>
}

const DARK_SEEDS: ThemeSeedColors = {
  workspace: '#090a0d', surface: '#171a21', raisedSurface: '#20242d', deepSurface: '#10141b', canvasSurround: '#4a4a51',
  border: '#303641', borderStrong: '#596271', controlBackground: '#0b0e13', textPrimary: '#f1f4f8', textSecondary: '#c2cad5', textMuted: '#9aa3b2',
  accent: '#2979ff', danger: '#ef5350', success: '#66bb6a', warning: '#ffab26'
}
const LIGHT_SEEDS: ThemeSeedColors = {
  workspace: '#bec7d2', surface: '#ffffff', raisedSurface: '#edf1f5', deepSurface: '#d8dfe7', canvasSurround: '#aeb8c4',
  border: '#98a5b4', borderStrong: '#5f6d7f', controlBackground: '#f8fafc', textPrimary: '#17202b', textSecondary: '#334155', textMuted: '#667386',
  accent: '#1d63d8', danger: '#b8323a', success: '#247a4d', warning: '#9a5a00'
}
const PINK_SEEDS: ThemeSeedColors = {
  workspace: '#f1dce8', surface: '#ffffff', raisedSurface: '#fff7fb', deepSurface: '#f6e6ef', canvasSurround: '#e7cedb',
  border: '#e3bfd1', borderStrong: '#aa7aa0', controlBackground: '#fffafd', textPrimary: '#49283a', textSecondary: '#70485d', textMuted: '#956f82',
  accent: '#b73575', danger: '#b92f55', success: '#34765f', warning: '#8f5a18'
}
const GRAY_SEEDS: ThemeSeedColors = {
  workspace: '#31343a', surface: '#3f434a', raisedSurface: '#4f545c', deepSurface: '#282c31', canvasSurround: '#595f67',
  border: '#555c65', borderStrong: '#77818d', controlBackground: '#23272c', textPrimary: '#e9ecef', textSecondary: '#ccd1d8', textMuted: '#a5acb5',
  accent: '#2979ff', danger: '#ef5350', success: '#66bb6a', warning: '#ffab26'
}
const DARK_GRAY_SEEDS: ThemeSeedColors = {
  workspace: '#0c0d0f', surface: '#1c1e22', raisedSurface: '#25272c', deepSurface: '#14171b', canvasSurround: '#4e5054',
  border: '#383b40', borderStrong: '#646870', controlBackground: '#101215', textPrimary: '#f3f4f6', textSecondary: '#c6c9ce', textMuted: '#9fa2a8',
  accent: '#2979ff', danger: '#ef5350', success: '#66bb6a', warning: '#ffab26'
}
const AMBER_SEEDS: ThemeSeedColors = {
  workspace: '#211b16', surface: '#2b241d', raisedSurface: '#3b3026', deepSurface: '#1c1713', canvasSurround: '#51463b',
  border: '#5f5144', borderStrong: '#806c58', controlBackground: '#19140f', textPrimary: '#fff5e8', textSecondary: '#e4d3bf', textMuted: '#b4a08c',
  accent: '#8b5a16', danger: '#df6258', success: '#6bbf7a', warning: '#d89a2b'
}
const MINT_SEEDS: ThemeSeedColors = {
  workspace: '#122525', surface: '#183434', raisedSurface: '#214343', deepSurface: '#0e1d1d', canvasSurround: '#3a5552',
  border: '#365f5a', borderStrong: '#518077', controlBackground: '#0d1919', textPrimary: '#edf9f5', textSecondary: '#c3ded7', textMuted: '#8db3a9',
  accent: '#147d69', danger: '#dc625d', success: '#63b77a', warning: '#d6a13a'
}
const PLUM_SEEDS: ThemeSeedColors = {
  workspace: '#211827', surface: '#2d2038', raisedSurface: '#3b2a4a', deepSurface: '#1a121f', canvasSurround: '#51415b',
  border: '#584667', borderStrong: '#795d8b', controlBackground: '#17101c', textPrimary: '#f7effc', textSecondary: '#decde8', textMuted: '#b09ab9',
  accent: '#7836a1', danger: '#df626e', success: '#67b879', warning: '#d6a248'
}
const OCEAN_SEEDS: ThemeSeedColors = {
  workspace: '#0b1020', surface: '#14273a', raisedSurface: '#283052', deepSurface: '#080d18', canvasSurround: '#4b5268',
  border: '#31536a', borderStrong: '#65779a', controlBackground: '#090f1a', textPrimary: '#f2f6ff', textSecondary: '#c7d6e8', textMuted: '#8fa5bc',
  accent: '#176f73', danger: '#c94f68', success: '#4c9a6a', warning: '#c58a28'
}
const FOREST_SEEDS: ThemeSeedColors = {
  workspace: '#141510', surface: '#20281e', raisedSurface: '#3a3525', deepSurface: '#0c100d', canvasSurround: '#50544a',
  border: '#465744', borderStrong: '#7a765b', controlBackground: '#0c110e', textPrimary: '#f7f3df', textSecondary: '#d7d2b0', textMuted: '#a49d7a',
  accent: '#8a5b16', danger: '#c14e4e', success: '#4e8a5a', warning: '#b87818'
}
const SUNSET_SEEDS: ThemeSeedColors = {
  workspace: '#191326', surface: '#27243a', raisedSurface: '#443044', deepSurface: '#100d1a', canvasSurround: '#585064',
  border: '#514b70', borderStrong: '#80677e', controlBackground: '#0e0c18', textPrimary: '#fff3f7', textSecondary: '#ddcedf', textMuted: '#aa97ad',
  accent: '#9a3f67', danger: '#c4494f', success: '#43836e', warning: '#b77a2a'
}
const CLASSIC_SEEDS: ThemeSeedColors = {
  workspace: '#68717d', surface: '#d1d1cd', raisedSurface: '#b9b9b7', deepSurface: '#8f9499', canvasSurround: '#747d87',
  border: '#777c81', borderStrong: '#4f555a', controlBackground: '#dededb', textPrimary: '#202326', textSecondary: '#354047', textMuted: '#414a51',
  accent: '#4b6f93', danger: '#a64e57', success: '#3d7049', warning: '#875b16'
}
const SLATE_SEEDS: ThemeSeedColors = {
  workspace: '#5f665f', surface: '#d5d6ca', raisedSurface: '#b9bcb2', deepSurface: '#858b80', canvasSurround: '#72796f',
  border: '#7b8276', borderStrong: '#4e574e', controlBackground: '#dedfd5', textPrimary: '#242824', textSecondary: '#3e483e', textMuted: '#505b50',
  accent: '#55765c', danger: '#a34c4e', success: '#3e754b', warning: '#8a641b'
}
const COPPER_SEEDS: ThemeSeedColors = {
  workspace: '#6e6b68', surface: '#d4d0c6', raisedSurface: '#bcb8b0', deepSurface: '#918d87', canvasSurround: '#817b78',
  border: '#837f79', borderStrong: '#58534c', controlBackground: '#e2ded5', textPrimary: '#282725', textSecondary: '#48433d', textMuted: '#5c5750',
  accent: '#8f6650', danger: '#a44d49', success: '#4f714c', warning: '#93621a'
}
// Cyberpunk
const CYBERPUNK_SEEDS: ThemeSeedColors = {
  workspace: '#06060d', surface: '#121222', raisedSurface: '#1e1c33', deepSurface: '#0a0916', canvasSurround: '#2a2440',
  border: '#3a3259', borderStrong: '#6d5bd0', controlBackground: '#0b0a14', textPrimary: '#eef2ff', textSecondary: '#b6c2e2', textMuted: '#8a93b5',
  accent: '#c9176f', danger: '#ff4d6d', success: '#35e08a', warning: '#ffc53d'
}
const DARK_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 69, g: 77, b: 92, a: 143 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 239, g: 83, b: 80, a: 255 }, onionNext: { r: 41, g: 121, b: 255, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const LIGHT_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 119, g: 128, b: 142, a: 150 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 205, g: 55, b: 53, a: 255 }, onionNext: { r: 31, g: 97, b: 210, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const PINK_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 166, g: 112, b: 141, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 192, g: 45, b: 82, a: 255 }, onionNext: { r: 83, g: 121, b: 190, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const GRAY_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 193, g: 198, b: 207, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 239, g: 83, b: 80, a: 255 }, onionNext: { r: 41, g: 121, b: 255, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const DARK_GRAY_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 184, g: 184, b: 184, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 239, g: 83, b: 80, a: 255 }, onionNext: { r: 41, g: 121, b: 255, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const AMBER_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 183, g: 158, b: 126, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 223, g: 98, b: 88, a: 255 }, onionNext: { r: 224, g: 162, b: 59, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const MINT_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 151, g: 197, b: 187, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 220, g: 98, b: 93, a: 255 }, onionNext: { r: 56, g: 169, b: 144, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const PLUM_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 190, g: 163, b: 205, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 223, g: 98, b: 110, a: 255 }, onionNext: { r: 168, g: 90, b: 214, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const OCEAN_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 105, g: 154, b: 177, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 219, g: 90, b: 119, a: 255 }, onionNext: { r: 48, g: 181, b: 174, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const FOREST_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 145, g: 166, b: 134, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 211, g: 83, b: 76, a: 255 }, onionNext: { r: 78, g: 151, b: 103, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const SUNSET_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 168, g: 147, b: 184, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 218, g: 73, b: 91, a: 255 }, onionNext: { r: 74, g: 192, b: 176, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const CLASSIC_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 76, g: 82, b: 88, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 178, g: 55, b: 68, a: 255 }, onionNext: { r: 49, g: 98, b: 168, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const SLATE_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 82, g: 96, b: 84, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 174, g: 73, b: 77, a: 255 }, onionNext: { r: 64, g: 119, b: 158, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const COPPER_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 91, g: 87, b: 81, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 174, g: 74, b: 67, a: 255 }, onionNext: { r: 67, g: 119, b: 157, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }
const CYBERPUNK_VISUALS: ThemeVisualDefaults = { checkerLight: { r: 192, g: 192, b: 192, a: 255 }, checkerDark: { r: 128, g: 128, b: 128, a: 255 }, pixelGrid: { r: 108, g: 92, b: 158, a: 145 }, customGrid: { r: 0, g: 0, b: 255, a: 255 }, onionPrevious: { r: 255, g: 77, b: 109, a: 255 }, onionNext: { r: 0, g: 229, b: 255, a: 255 }, symmetryAxis: { r: 0, g: 0, b: 255, a: 255 } }

export const BUILT_IN_THEMES: readonly ThemeDefinition[] = [
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'dark', name: 'MoonSprite Dark', seeds: DARK_SEEDS, visualDefaults: DARK_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'dark-gray', name: 'MoonSprite Dark Gray', seeds: DARK_GRAY_SEEDS, visualDefaults: DARK_GRAY_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'gray', name: 'MoonSprite Gray', seeds: GRAY_SEEDS, visualDefaults: GRAY_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'light', name: 'MoonSprite Light', seeds: LIGHT_SEEDS, visualDefaults: LIGHT_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'pink', name: 'MoonSprite Pink', seeds: PINK_SEEDS, visualDefaults: PINK_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'classic', name: 'Pixel Classic', seeds: CLASSIC_SEEDS, visualDefaults: CLASSIC_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'slate', name: 'Pixel Moss', seeds: SLATE_SEEDS, visualDefaults: SLATE_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'copper', name: 'Pixel Copper', seeds: COPPER_SEEDS, visualDefaults: COPPER_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'amber', name: 'Pixel Amber', seeds: AMBER_SEEDS, visualDefaults: AMBER_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'mint', name: 'Pixel Mint', seeds: MINT_SEEDS, visualDefaults: MINT_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'plum', name: 'Pixel Plum', seeds: PLUM_SEEDS, visualDefaults: PLUM_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'ocean', name: 'Pixel Aurora', seeds: OCEAN_SEEDS, visualDefaults: OCEAN_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'forest', name: 'Pixel Workshop', seeds: FOREST_SEEDS, visualDefaults: FOREST_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'sunset', name: 'Pixel Bloom', seeds: SUNSET_SEEDS, visualDefaults: SUNSET_VISUALS },
  { kind: 'moonsprite-theme', schemaVersion: 2, id: 'cyberpunk', name: 'Cyberpunk Neon', seeds: CYBERPUNK_SEEDS, visualDefaults: CYBERPUNK_VISUALS }
]
export const DEFAULT_THEME_PREFERENCES: ThemePreferences = { activeThemeId: 'dark', customThemes: [] }

const visualKeys = ['checkerLight', 'checkerDark', 'pixelGrid', 'customGrid', 'onionPrevious', 'onionNext', 'symmetryAxis'] as const
const seedKeys = Object.keys(DARK_SEEDS) as Array<keyof ThemeSeedColors>
const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)
const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))
const copyRgba = (value: RgbaColor): RgbaColor => ({ r: clamp(value.r), g: clamp(value.g), b: clamp(value.b), a: clamp(value.a) })
const copyVisuals = (value: ThemeVisualDefaults): ThemeVisualDefaults => Object.fromEntries(visualKeys.map((key) => [key, copyRgba(value[key])])) as unknown as ThemeVisualDefaults
const hexBytes = (value: string): [number, number, number, number] => { const hex = value.slice(1); return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16), hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255] }
const mixThemeColors = (from: string, to: string, toAmount: number): string => { const [fromR, fromG, fromB] = hexBytes(from); const [toR, toG, toB] = hexBytes(to); const amount = Math.max(0, Math.min(1, toAmount)); return `#${[fromR + (toR - fromR) * amount, fromG + (toG - fromG) * amount, fromB + (toB - fromB) * amount].map((channel) => clamp(channel).toString(16).padStart(2, '0')).join('')}` }
const cssColor = (value: string): string => { const [r, g, b, a] = hexBytes(value); return a === 255 ? value.slice(0, 7).toLowerCase() : `rgb(${r} ${g} ${b} / ${a / 255})` }
const rgbaFromHex = (value: string): RgbaColor => { const [r, g, b, a] = hexBytes(value); return { r, g, b, a } }
export const rgbaHex = (value: RgbaColor): string => `#${[value.r, value.g, value.b, value.a].map((channel) => clamp(channel).toString(16).padStart(2, '0')).join('')}`
export function parseThemeColor(value: unknown, fallback: RgbaColor): RgbaColor { return validColor(value) ? rgbaFromHex(value) : copyRgba(fallback) }

const linearChannel = (channel: number): number => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4 }
export const themeColorLuminance = (value: string): number => { const [r, g, b] = hexBytes(validColor(value) ? value : '#000000'); return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b) }
const darkestThemeSeed = (seeds: ThemeSeedColors): string => Object.values(seeds).reduce((darkest, candidate) => themeColorLuminance(candidate) < themeColorLuminance(darkest) ? candidate : darkest)
export const themeContrastRatio = (a: string, b: string): number => { const light = Math.max(themeColorLuminance(a), themeColorLuminance(b)); const dark = Math.min(themeColorLuminance(a), themeColorLuminance(b)); return (light + 0.05) / (dark + 0.05) }
const highestContrastColor = (background: string, candidates: readonly string[]): string => candidates.reduce((best, candidate) => themeContrastRatio(candidate, background) > themeContrastRatio(best, background) ? candidate : best)
export function inferThemeMode(seeds: ThemeSeedColors): ThemeMode { return themeColorLuminance(seeds.textPrimary) < themeColorLuminance(seeds.surface) ? 'light' : 'dark' }
export function systemThemeId(): 'dark' | 'light' { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' }

export function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia('(prefers-color-scheme: light)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function installSystemThemeSync(getPreferences: () => ThemePreferences): () => void {
  return subscribeSystemTheme(() => {
    const preferences = getPreferences()
    if (!preferences.followSystem) return
    applyThemeToDocument(preferences)
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  })
}

export function themeById(preferences: ThemePreferences, id = preferences.followSystem ? systemThemeId() : preferences.activeThemeId): ThemeDefinition { return BUILT_IN_THEMES.find((theme) => theme.id === id) ?? BUILT_IN_THEMES[0] }
export function defaultThemeVisuals(id = 'dark'): ThemeVisualDefaults { return copyVisuals(themeById({ activeThemeId: id, customThemes: [] }).visualDefaults) }

export function resolveTheme(preferences: ThemePreferences): ResolvedTheme {
  const definition = themeById(preferences)
  const visualDefaults = copyVisuals({ ...definition.visualDefaults, ...preferences.visualOverrides })
  const s = definition.seeds
  const mode = inferThemeMode(s)
  const dark = mode === 'dark'
  const light = mode === 'light'
  const originalDark = definition.id === 'dark'
  const onAccent = '#ffffff'
  const onDanger = '#ffffff'
  // Interaction colors are derived from the theme's seed surfaces instead of
  // being keyed by theme id. This keeps every built-in palette layered and
  // makes imported themes behave like first-class themes.
  const lightDerived = {
    surfaceMuted: mixThemeColors(s.raisedSurface, s.deepSurface, 0.7),
    surfaceHover: mixThemeColors(s.raisedSurface, s.deepSurface, 0.45),
    surfaceActive: mixThemeColors(s.surface, s.accent, 0.16),
    surfaceDisabled: mixThemeColors(s.deepSurface, s.workspace, 0.18),
    borderMuted: mixThemeColors(s.border, s.borderStrong, 0.3),
    borderHover: mixThemeColors(s.borderStrong, s.textPrimary, 0.15),
    textFaint: mixThemeColors(s.textMuted, s.textPrimary, 0.25),
    textSoft: mixThemeColors(s.textPrimary, s.textSecondary, 0.25),
    textSecondaryStrong: mixThemeColors(s.textSecondary, s.textPrimary, 0.15),
    textMutedStrong: mixThemeColors(s.textMuted, s.textSecondary, 0.18),
    textSoftAlt: mixThemeColors(s.textMuted, s.textSecondary, 0.45),
    textBright: mixThemeColors(s.textPrimary, '#000000', 0.18),
    textDisabled: mixThemeColors(s.textMuted, s.textPrimary, 0.65),
    iconMuted: mixThemeColors(s.textMuted, s.textPrimary, 0.12),
    accentHover: mixThemeColors(s.accent, s.surface, 0.12),
    accentSelected: mixThemeColors(s.accent, s.textPrimary, 0.16),
    accentSoft: mixThemeColors(s.surface, s.accent, 0.14),
    dangerHover: mixThemeColors(s.danger, s.textPrimary, 0.12),
    dangerSoft: mixThemeColors(s.surface, s.danger, 0.12),
    successSoft: mixThemeColors(s.surface, s.success, 0.12),
    warningSoft: mixThemeColors(s.surface, s.warning, 0.12),
    canvasGridBorder: mixThemeColors(s.border, s.borderStrong, 0.35),
    divider: mixThemeColors(s.raisedSurface, s.border, 0.28),
    scrollbarTrack: mixThemeColors(s.deepSurface, s.workspace, 0.18),
    scrollbarThumb: mixThemeColors(s.border, s.borderStrong, 0.45)
  }
  const surfaceMuted = originalDark ? '#11141a' : dark ? mixThemeColors(s.surface, s.deepSurface, 0.55) : lightDerived.surfaceMuted
  const surfaceHover = originalDark ? '#20242d' : dark ? mixThemeColors(s.surface, s.raisedSurface, 0.7) : lightDerived.surfaceHover
  const surfaceActive = originalDark ? '#212c40' : dark ? mixThemeColors(s.surface, s.accent, 0.2) : lightDerived.surfaceActive
  const surfaceDisabled = originalDark ? '#111319' : dark ? mixThemeColors(s.deepSurface, s.workspace, 0.35) : lightDerived.surfaceDisabled
  const borderMuted = originalDark ? '#454d5c' : dark ? mixThemeColors(s.border, s.borderStrong, 0.4) : lightDerived.borderMuted
  const borderHover = originalDark ? '#596476' : dark ? mixThemeColors(s.borderStrong, s.textMuted, 0.2) : lightDerived.borderHover
  const textFaint = originalDark ? '#7f8998' : dark ? mixThemeColors(s.textMuted, s.workspace, 0.24) : lightDerived.textFaint
  const textSoft = originalDark ? '#d4dae4' : dark ? mixThemeColors(s.textPrimary, s.textSecondary, 0.3) : lightDerived.textSoft
  const textSecondaryStrong = originalDark ? '#c6ccd6' : dark ? mixThemeColors(s.textSecondary, s.textPrimary, 0.18) : lightDerived.textSecondaryStrong
  const textMutedStrong = originalDark ? '#8f99a8' : dark ? mixThemeColors(s.textMuted, s.textSecondary, 0.2) : lightDerived.textMutedStrong
  const textSoftAlt = originalDark ? '#aeb8c7' : dark ? mixThemeColors(s.textMuted, s.textSecondary, 0.45) : lightDerived.textSoftAlt
  const textBright = originalDark ? '#edf2fb' : dark ? mixThemeColors(s.textPrimary, '#ffffff', 0.08) : lightDerived.textBright
  const textDisabled = originalDark ? '#616874' : dark ? mixThemeColors(s.textMuted, s.workspace, 0.48) : lightDerived.textDisabled
  const iconMuted = originalDark ? '#727b89' : dark ? mixThemeColors(s.textMuted, s.workspace, 0.2) : lightDerived.iconMuted
  const accentHover = originalDark ? '#478bff' : dark ? mixThemeColors(s.accent, s.textPrimary, 0.22) : lightDerived.accentHover
  const accentSelected = originalDark ? '#256de6' : dark ? mixThemeColors(s.accent, s.workspace, 0.18) : lightDerived.accentSelected
  const accentSoft = originalDark ? '#182a46' : dark ? mixThemeColors(s.surface, s.accent, 0.18) : lightDerived.accentSoft
  const dangerHover = originalDark ? '#f16b68' : dark ? mixThemeColors(s.danger, s.textPrimary, 0.15) : lightDerived.dangerHover
  const dangerSoft = originalDark ? '#422024' : dark ? mixThemeColors(s.surface, s.danger, 0.2) : lightDerived.dangerSoft
  const successSoft = originalDark ? '#233b28' : dark ? mixThemeColors(s.surface, s.success, 0.2) : lightDerived.successSoft
  const warningSoft = originalDark ? '#45361d' : dark ? mixThemeColors(s.surface, s.warning, 0.2) : lightDerived.warningSoft
  const developmentNoticeText = highestContrastColor(warningSoft, [s.warning, s.textPrimary, '#ffffff', '#101216'])
  const canvasGridBorder = originalDark ? '#566170' : dark ? mixThemeColors(s.border, s.borderStrong, 0.55) : lightDerived.canvasGridBorder
  const divider = originalDark ? '#252b36' : dark ? mixThemeColors(s.surface, s.deepSurface, 0.4) : lightDerived.divider
  const layersBackground = originalDark ? s.surface : dark ? mixThemeColors(s.surface, s.deepSurface, 0.35) : s.surface
  const homeBackground = s.deepSurface
  const paletteBackground = mode === 'dark' ? layersBackground : s.canvasSurround
  const scrollbarTrack = originalDark ? s.deepSurface : dark ? s.deepSurface : lightDerived.scrollbarTrack
  const scrollbarThumb = originalDark ? s.borderStrong : dark ? s.borderStrong : lightDerived.scrollbarThumb
  const magnifierLine = darkestThemeSeed(s)
  const variables: Record<string, string> = {
    '--theme-workspace-background': s.workspace, '--theme-app-background': s.workspace, '--theme-home-background': homeBackground, '--theme-surface': s.surface, '--theme-raised-surface': s.raisedSurface, '--theme-control-background': s.controlBackground, '--theme-deep-surface': s.deepSurface, '--theme-magnifier-line': magnifierLine,
    '--theme-surface-muted': surfaceMuted, '--theme-surface-hover': surfaceHover, '--theme-surface-active': surfaceActive, '--theme-surface-disabled': surfaceDisabled, '--theme-canvas-surround': s.canvasSurround, '--theme-layers-background': layersBackground, '--theme-palette-background': paletteBackground,
    '--theme-border': s.border, '--theme-border-subtle': s.border, '--theme-border-strong': s.borderStrong, '--theme-border-muted': borderMuted, '--theme-border-hover': borderHover, '--theme-canvas-grid-border': canvasGridBorder, '--theme-divider': divider,
    '--theme-text-primary': s.textPrimary, '--theme-text-secondary': s.textSecondary, '--theme-text-muted': s.textMuted, '--theme-text-faint': textFaint, '--theme-text-soft': textSoft, '--theme-text-secondary-strong': textSecondaryStrong, '--theme-text-muted-strong': textMutedStrong, '--theme-text-soft-alt': textSoftAlt, '--theme-text-bright': textBright, '--theme-text-disabled': textDisabled, '--theme-icon-muted': iconMuted,
    '--theme-accent': s.accent, '--theme-accent-hover': accentHover, '--theme-accent-selected': accentSelected, '--theme-accent-soft': accentSoft, '--theme-on-accent': onAccent, '--theme-danger': s.danger, '--theme-danger-hover': dangerHover, '--theme-danger-soft': dangerSoft, '--theme-on-danger': onDanger, '--theme-success': s.success, '--theme-success-soft': successSoft, '--theme-warning': s.warning, '--theme-warning-soft': warningSoft, '--theme-development-notice-text': developmentNoticeText, '--theme-development-notice-background': warningSoft, '--theme-development-notice-border': s.warning,
    '--theme-overlay': dark ? '#00000073' : '#18202b52', '--theme-shadow': dark ? '#0000006b' : '#18202b38', '--theme-shadow-strong': dark ? '#0000009e' : '#18202b52', '--theme-scrollbar-track': scrollbarTrack, '--theme-scrollbar-thumb': scrollbarThumb, '--theme-selection-contrast': '#ffffff', '--theme-selection-outline-dark': '#090a0d', '--theme-selection-outline-light': '#f1f4f8',
    '--theme-checker-light': rgbaHex(visualDefaults.checkerLight), '--theme-checker-dark': rgbaHex(visualDefaults.checkerDark), '--theme-pixel-grid': rgbaHex(visualDefaults.pixelGrid), '--theme-custom-grid': rgbaHex(visualDefaults.customGrid), '--theme-onion-previous': rgbaHex(visualDefaults.onionPrevious), '--theme-onion-next': rgbaHex(visualDefaults.onionNext), '--theme-symmetry-axis': rgbaHex(visualDefaults.symmetryAxis), '--theme-selection': s.accent
  }
  return { definition, visualDefaults, mode, variables: Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, value.startsWith('#') ? cssColor(value) : value])) }
}

let themeApplyRevision = 0

export function applyThemeToDocument(preferences: ThemePreferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const resolved = resolveTheme(preferences)
  const revision = ++themeApplyRevision

  // Theme variables are changed as a single visual operation. Without this
  // guard, every component transition (background, text, border, etc.) briefly
  // interpolates from the previous theme and produces a flash while switching.
  root.dataset.themeSwitching = 'true'
  for (const [name, value] of Object.entries(resolved.variables)) root.style.setProperty(name, value)
  root.dataset.themeId = resolved.definition.id
  root.dataset.themeMode = resolved.mode
  root.style.colorScheme = resolved.mode
  // Commit the new token set while the guard is active. This prevents the
  // browser from deferring the style change until after the guard is removed.
  void root.getBoundingClientRect()

  const clearThemeSwitching = (): void => {
    if (themeApplyRevision === revision) delete root.dataset.themeSwitching
  }
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(clearThemeSwitching)
  else clearThemeSwitching()
}
export function copyTheme(theme: ThemeDefinition, id: string, name: string): ThemeDefinition { return { ...theme, id, name, seeds: { ...theme.seeds }, visualDefaults: copyVisuals(theme.visualDefaults) } }
const uniqueThemeId = (base: string, themes: readonly ThemeDefinition[]): string => { const normalized = base.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'custom-theme'; let id = normalized; let index = 2; while (BUILT_IN_THEMES.some((theme) => theme.id === id) || themes.some((theme) => theme.id === id)) id = `${normalized}-${index++}`; return id }
export function editableThemePreferences(preferences: ThemePreferences, suffix = 'Custom'): { preferences: ThemePreferences; definition: ThemeDefinition } { const current = themeById(preferences); if (preferences.customThemes.some((theme) => theme.id === current.id)) return { preferences, definition: current }; const definition = { ...copyTheme(current, uniqueThemeId(`${current.name} ${suffix}`, preferences.customThemes), `${current.name} ${suffix}`), baseThemeId: current.id }; return { preferences: { activeThemeId: definition.id, customThemes: [...preferences.customThemes, definition] }, definition } }
export function withThemePaletteColors(preferences: ThemePreferences, colors: Partial<ThemePalette>): ThemePreferences { const visualOverrides = { ...(preferences.visualOverrides ?? {}) }; for (const key of visualKeys) { const value = colors[key]; if (value && validColor(value)) visualOverrides[key] = rgbaFromHex(value) }; return { activeThemeId: preferences.activeThemeId, followSystem: preferences.followSystem, customThemes: [], visualOverrides } }

const validRgba = (value: unknown): value is RgbaColor => Boolean(value && typeof value === 'object' && ['r', 'g', 'b', 'a'].every((key) => { const channel = (value as Record<string, unknown>)[key]; return typeof channel === 'number' && Number.isFinite(channel) && channel >= 0 && channel <= 255 }))
const parseVisuals = (value: unknown, fallback: ThemeVisualDefaults): ThemeVisualDefaults | null => { if (!value || typeof value !== 'object' || Array.isArray(value)) return copyVisuals(fallback); const source = value as Record<string, unknown>; if (Object.keys(source).some((key) => !visualKeys.includes(key as typeof visualKeys[number]))) return null; const result = copyVisuals(fallback); for (const key of visualKeys) if (source[key] !== undefined) { if (!validRgba(source[key])) return null; result[key] = copyRgba(source[key] as RgbaColor) }; return result }
const parseLegacy = (candidate: Record<string, unknown>): ThemeDefinition | null => { if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || !candidate.seeds || typeof candidate.seeds !== 'object') return null; const raw = candidate.seeds as Record<string, unknown>; const seeds = { ...DARK_SEEDS }; const aliases: Record<string, keyof ThemeSeedColors> = { workspace: 'workspace', appBackground: 'workspace', surface: 'surface', raisedSurface: 'raisedSurface', deepSurface: 'deepSurface', canvasSurround: 'canvasSurround', border: 'border', borderStrong: 'borderStrong', controlBackground: 'controlBackground', textPrimary: 'textPrimary', textSecondary: 'textSecondary', textMuted: 'textMuted', accent: 'accent', danger: 'danger', success: 'success', warning: 'warning' }; for (const [key, target] of Object.entries(aliases)) if (raw[key] !== undefined) seeds[target] = raw[key] as string; if (!seedKeys.every((key) => validColor(seeds[key]))) return null; const mode = inferThemeMode(seeds); const visualDefaults = parseVisuals(candidate.visualDefaults, mode === 'light' ? LIGHT_VISUALS : DARK_VISUALS); if (!visualDefaults) return null; const baseThemeId = typeof candidate.baseThemeId === 'string' ? candidate.baseThemeId : undefined; return { kind: 'moonsprite-theme', schemaVersion: 2, id: candidate.id.trim(), name: candidate.name.trim() || 'Custom theme', ...(baseThemeId ? { baseThemeId } : {}), seeds, visualDefaults } }
const parseV3 = (candidate: Record<string, unknown>): ThemeDefinition | null => { if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || !candidate.palette || typeof candidate.palette !== 'object') return null; const p = candidate.palette as Record<string, unknown>; const seeds = { ...DARK_SEEDS, workspace: p.workspace, surface: p.panel, raisedSurface: p.raised, deepSurface: p.panelSecondary, controlBackground: p.control, canvasSurround: p.canvasSurround, textPrimary: p.text, textSecondary: p.textSecondary, textMuted: p.textMuted, border: p.border, borderStrong: p.borderStrong, accent: p.accent, danger: p.danger, success: p.success, warning: p.warning } as unknown as ThemeSeedColors; if (!seedKeys.every((key) => validColor(seeds[key]))) return null; const mode = inferThemeMode(seeds); const visualSource = Object.fromEntries(visualKeys.map((key) => [key, p[key]])); const visualDefaults = parseVisuals(visualSource, mode === 'light' ? LIGHT_VISUALS : DARK_VISUALS); return visualDefaults ? { kind: 'moonsprite-theme', schemaVersion: 2, id: candidate.id.trim(), name: candidate.name.trim() || 'Custom theme', baseThemeId: mode, seeds, visualDefaults } : null }
export function parseThemeDefinition(value: unknown): ThemeDefinition | null { if (!value || typeof value !== 'object') return null; const candidate = value as Record<string, unknown>; if (candidate.kind !== 'moonsprite-theme' || typeof candidate.schemaVersion !== 'number') return null; if (candidate.schemaVersion === 3) return parseV3(candidate); if (candidate.schemaVersion === 1 || candidate.schemaVersion === 2) return parseLegacy(candidate); return null }
export function normalizeThemePreferences(value: unknown): ThemePreferences { if (!value || typeof value !== 'object') return { ...DEFAULT_THEME_PREFERENCES, customThemes: [] }; const candidate = value as Record<string, unknown>; const requested = typeof candidate.activeThemeId === 'string' ? candidate.activeThemeId : 'dark'; const activeThemeId = BUILT_IN_THEMES.some((theme) => theme.id === requested) ? requested : 'dark'; const visualOverrides = candidate.visualOverrides && typeof candidate.visualOverrides === 'object' ? parseVisuals(candidate.visualOverrides, DARK_VISUALS) : null; return { activeThemeId, ...(candidate.followSystem === true ? { followSystem: true } : {}), customThemes: [], ...(visualOverrides ? { visualOverrides } : {}) } }
export function loadThemePreferences(storage?: Storage): ThemePreferences { try { const value = readStoredString(THEME_PREFERENCE_KEY, storage); return value ? normalizeThemePreferences(JSON.parse(value) as unknown) : { ...DEFAULT_THEME_PREFERENCES, customThemes: [] } } catch { return { ...DEFAULT_THEME_PREFERENCES, customThemes: [] } } }
export function saveThemePreferences(preferences: ThemePreferences, storage?: Storage): void { writeStoredString(THEME_PREFERENCE_KEY, JSON.stringify(normalizeThemePreferences(preferences)), storage) }
export function parseImportedTheme(text: string): ThemeDefinition | null { try { return parseThemeDefinition(JSON.parse(text) as unknown) } catch { return null } }
export function serializeTheme(theme: ThemeDefinition): string { return JSON.stringify(theme, null, 2) }
