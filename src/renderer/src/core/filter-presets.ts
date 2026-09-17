import type { BlendMode, RgbaColor } from '@shared/types-color'

/** Built-in non-destructive filter layers available from the Edit menu. */
export type FilterPresetId =
  | 'crt-scanlines-subtle'
  | 'crt-scanlines-medium'
  | 'crt-scanlines-strong'
  | 'vhs-color-fringe'
  | 'vignette'
  | 'phosphor-glow'

export interface FilterPresetDefinition {
  id: FilterPresetId
  name: string
  description: string
  blendMode: BlendMode
  opacity: number
}

export type LcdScanlineType = 'classic' | 'rgb' | 'interlaced'

export interface LcdScreenFilterOptions {
  width: number
  height: number
  scanlineTypes: readonly LcdScanlineType[]
}

export const DEFAULT_LCD_SCREEN_FILTER_OPTIONS: LcdScreenFilterOptions = {
  width: 1,
  height: 1,
  scanlineTypes: ['classic']
}

const LCD_SCANLINE_TYPES: readonly LcdScanlineType[] = ['classic', 'rgb', 'interlaced']

export const normalizeLcdScreenFilterOptions = (options?: Partial<LcdScreenFilterOptions>): LcdScreenFilterOptions => {
  const width = Number.isFinite(options?.width) ? Math.max(1, Math.round(options!.width!)) : DEFAULT_LCD_SCREEN_FILTER_OPTIONS.width
  const height = Number.isFinite(options?.height) ? Math.max(1, Math.round(options!.height!)) : DEFAULT_LCD_SCREEN_FILTER_OPTIONS.height
  const scanlineTypes = LCD_SCANLINE_TYPES.filter((type) => options?.scanlineTypes?.includes(type))
  return { width, height, scanlineTypes: options?.scanlineTypes ? scanlineTypes : [...DEFAULT_LCD_SCREEN_FILTER_OPTIONS.scanlineTypes] }
}

/** RGB channel placement offsets. Green remains the reference channel. */
export const lcdChannelOffset = (channel: 0 | 1 | 2, options: LcdScreenFilterOptions): { x: number; y: number } => {
  const direction = channel === 0 ? -1 : channel === 2 ? 1 : 0
  return { x: direction * options.width, y: direction * options.height }
}

/** Returns the fixed LCD grille texture shown by the LCD filter. */
export const lcdScanlineColorAtNormalized = (x: number, y: number, normalized: LcdScreenFilterOptions): RgbaColor => {
  void normalized
  const verticalStripe = x % 4 === 0
  const horizontalStripe = y % 4 === 0
  return { r: 0, g: 0, b: 0, a: verticalStripe ? 112 : horizontalStripe ? 36 : 0 }
}

export const lcdScanlineColorAt = (x: number, y: number, options?: Partial<LcdScreenFilterOptions>): RgbaColor =>
  lcdScanlineColorAtNormalized(x, y, normalizeLcdScreenFilterOptions(options))

/** Applies the LCD channel hue phase while keeping the source value and alpha. */
export const lcdChannelColorAtNormalized = (color: RgbaColor, channel: 0 | 1 | 2, x: number, y: number, normalized: LcdScreenFilterOptions): RgbaColor => {
  if (color.a === 0) return { r: 0, g: 0, b: 0, a: 0 }
  void x
  void y
  void normalized
  // Position offsets are applied while sampling the source surface. This
  // function only separates the requested source channel and never adds
  // scanline/periodic shading to RGB layers.
  return channel === 0
    ? { r: color.r, g: 0, b: 0, a: color.a }
    : channel === 1
      ? { r: 0, g: color.g, b: 0, a: color.a }
      : { r: 0, g: 0, b: color.b, a: color.a }
}

export const lcdChannelColorAt = (color: RgbaColor, channel: 0 | 1 | 2, x: number, y: number, options?: Partial<LcdScreenFilterOptions>): RgbaColor =>
  lcdChannelColorAtNormalized(color, channel, x, y, normalizeLcdScreenFilterOptions(options))

export const FILTER_PRESETS: readonly FilterPresetDefinition[] = [
  { id: 'crt-scanlines-subtle', name: 'CRT 扫描线（经典隔行）', description: '传统隔行扫描：每隔一行压暗，形成最干净的 CRT 线条。', blendMode: 'soft-light', opacity: 1 },
  { id: 'crt-scanlines-medium', name: 'CRT 扫描线（RGB 荧光栅）', description: '水平扫描线叠加红绿蓝荧光点阵，模拟彩色显像管。', blendMode: 'soft-light', opacity: 0.72 },
  { id: 'crt-scanlines-strong', name: 'CRT 扫描线（交错栅格）', description: '三行交错的粗细栅格，带有老式显示器的干扰纹理。', blendMode: 'soft-light', opacity: 1 },
  { id: 'vhs-color-fringe', name: 'VHS 色彩偏移', description: '交替的青红条纹，模拟录像带色彩串扰。', blendMode: 'screen', opacity: 0.35 },
  { id: 'vignette', name: '暗角', description: '压低边缘亮度，让视觉集中在画布中心。', blendMode: 'multiply', opacity: 1 },
  { id: 'phosphor-glow', name: '荧光绿辉光', description: '叠加柔和的绿色荧光显示器色调。', blendMode: 'screen', opacity: 0.24 }
]

const transparent: RgbaColor = { r: 0, g: 0, b: 0, a: 0 }

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

/** Generates a full-canvas RGBA overlay for a filter layer. */
export const renderFilterPreset = (presetId: FilterPresetId, width: number, height: number): Uint8ClampedArray => {
  const output = new Uint8ClampedArray(Math.max(0, width * height * 4))
  const write = (x: number, y: number, color: RgbaColor): void => {
    const offset = (y * width + x) * 4
    output[offset] = clampByte(color.r)
    output[offset + 1] = clampByte(color.g)
    output[offset + 2] = clampByte(color.b)
    output[offset + 3] = clampByte(color.a)
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let color = transparent
    if (presetId === 'crt-scanlines-subtle' && y % 2 === 1) color = { r: 0, g: 0, b: 0, a: 64 }
    else if (presetId === 'crt-scanlines-medium') {
      if (y % 2 === 1) color = { r: 0, g: 0, b: 0, a: 48 }
      else color = x % 3 === 0
        ? { r: 255, g: 64, b: 48, a: 28 }
        : x % 3 === 1
          ? { r: 64, g: 255, b: 96, a: 28 }
          : { r: 64, g: 128, b: 255, a: 28 }
    } else if (presetId === 'crt-scanlines-strong') {
      const phase = y % 3
      if (phase === 1) color = { r: 0, g: 0, b: 0, a: 96 }
      else if (phase === 2 && x % 2 === 0) color = { r: 0, g: 0, b: 18, a: 48 }
    }
    else if (presetId === 'vhs-color-fringe') color = x % 3 === 0
      ? { r: 255, g: 24, b: 92, a: 70 }
      : x % 3 === 1
        ? { r: 24, g: 220, b: 255, a: 52 }
        : transparent
    else if (presetId === 'vignette') {
      const dx = (x + 0.5) / Math.max(1, width) - 0.5
      const dy = (y + 0.5) / Math.max(1, height) - 0.5
      const distance = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.7072)
      color = { r: 0, g: 0, b: 0, a: clampByte(Math.max(0, distance - 0.35) * 210) }
    } else if (presetId === 'phosphor-glow') color = { r: 72, g: 255, b: 144, a: 72 }
    write(x, y, color)
  }
  return output
}

export const filterPresetById = (id: string): FilterPresetDefinition | null => FILTER_PRESETS.find((preset) => preset.id === id) ?? null
