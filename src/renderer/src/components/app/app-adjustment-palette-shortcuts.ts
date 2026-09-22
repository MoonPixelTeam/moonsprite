import type { AppShortcutContext } from './app-shortcut-context'
import type { AdjustmentKind } from '@/core/adjustments'
import type { ShortcutId } from '@/core/shortcuts'
export function handleAdjustmentPaletteShortcuts({ event, session, matches, openAdjustment, publishShortcutCommand }: Pick<AppShortcutContext, 'event' | 'session' | 'matches' | 'openAdjustment' | 'publishShortcutCommand'>): boolean {
  const adjustmentShortcuts: Array<[ShortcutId, AdjustmentKind]> = [
    ['adjustmentColorBalance', 'color-balance'],
    ['adjustmentBrightnessContrast', 'brightness-contrast'],
    ['adjustmentHueSaturation', 'hue-saturation'],
    ['adjustmentCurves', 'curves']
  ]
  const adjustment = adjustmentShortcuts.find(([action]) => matches(action))
  if (adjustment) {
    event.preventDefault()
    event.stopPropagation()
    if (session && !event.repeat) { openAdjustment(adjustment[1]) }
    return true
  }
  const paletteShortcut = ([
    'togglePaletteEditLock', 'extractPaletteColors', 'togglePaletteColorSync', 'reversePaletteColors',
    'createPaletteGradient', 'createPaletteHueGradient', 'sortPaletteHue', 'sortPaletteSaturation',
    'sortPaletteBrightness', 'sortPaletteLuminance', 'sortPaletteRed', 'sortPaletteGreen',
    'sortPaletteBlue', 'sortPaletteAlpha', 'paletteSortAscending', 'paletteSortDescending',
    'paletteSwatchTiny', 'paletteSwatchSmall', 'paletteSwatchMedium', 'paletteSwatchLarge',
    'paletteSwatchHuge', 'savePalette', 'openPaletteFolder', 'refreshPalettes'
  ] as const).find((id) => matches(id))
  if (paletteShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) publishShortcutCommand(paletteShortcut, 'palette')
    return true
  }
  return false
}
