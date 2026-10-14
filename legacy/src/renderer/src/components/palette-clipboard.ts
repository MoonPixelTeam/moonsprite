import type { RgbaColor } from '@shared/types-color'
import type { PaletteSlotLayout } from '@shared/types-files'

export interface PaletteClipboard {
  colors: RgbaColor[]
  layout?: PaletteSlotLayout
}

const V1 = 'MOONSPRITE_PALETTE_V1:'
const V2 = 'MOONSPRITE_PALETTE_V2:'

export const encodePaletteClipboard = (clipboard: PaletteClipboard): string => clipboard.layout
  ? `${V2}${JSON.stringify(clipboard)}` : `${V1}${JSON.stringify(clipboard.colors)}`

export const parsePaletteClipboard = (value: string): PaletteClipboard | null => {
  const version = value.startsWith(V2) ? V2 : value.startsWith(V1) ? V1 : null
  if (!version) return null
  try {
    const parsed = JSON.parse(value.slice(version.length))
    const source: unknown = version === V1 ? parsed : parsed?.colors
    if (!Array.isArray(source) || source.length === 0) return null
    if (!source.every(color => color && typeof color === 'object' && ['r', 'g', 'b', 'a'].every(channel => typeof color[channel] === 'number' && Number.isFinite(color[channel])))) return null
    const colors: RgbaColor[] = source.map(color => {
      const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
      return { r: channel(color.r), g: channel(color.g), b: channel(color.b), a: channel(color.a) }
    })
    if (version === V1) return { colors }
    const layout = parsed.layout
    if (!layout || !Number.isSafeInteger(layout.columns) || layout.columns < 1 || layout.columns > 256
      || !Array.isArray(layout.slots) || layout.slots.length === 0 || layout.slots.length % layout.columns !== 0
      || !layout.slots.every((index: unknown) => index === null || (typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 && index < colors.length))) return null
    return { colors, layout: { columns: layout.columns, slots: layout.slots } }
  } catch {
    return null
  }
}
