import { describe, expect, it } from 'vitest'
import { DEFAULT_LCD_SCREEN_FILTER_OPTIONS, FILTER_PRESETS, filterPresetById, lcdChannelColorAt, lcdChannelOffset, lcdScanlineColorAt, normalizeLcdScreenFilterOptions, renderFilterPreset } from './filter-presets'

describe('filter presets', () => {
  it('exposes three distinct CRT scanline styles and additional presets', () => {
    const scanlinePresets = FILTER_PRESETS.filter((preset) => preset.id.startsWith('crt-scanlines-'))
    expect(scanlinePresets).toHaveLength(3)
    expect(scanlinePresets.every((preset) => preset.blendMode === 'soft-light')).toBe(true)
    expect(FILTER_PRESETS.map((preset) => preset.id)).toEqual(expect.arrayContaining(['vhs-color-fringe', 'vignette', 'phosphor-glow']))
  })

  it('renders three CRT styles with different spatial/color signatures', () => {
    const classic = renderFilterPreset('crt-scanlines-subtle', 3, 4)
    const rgb = renderFilterPreset('crt-scanlines-medium', 3, 4)
    const grille = renderFilterPreset('crt-scanlines-strong', 3, 4)
    expect(Array.from(classic.slice(0, 12))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(Array.from(classic.slice(12, 16))).toEqual([0, 0, 0, 64])
    expect(Array.from(rgb.slice(0, 4))).toEqual([255, 64, 48, 28])
    expect(Array.from(rgb.slice(4, 8))).toEqual([64, 255, 96, 28])
    expect(Array.from(grille.slice(12, 16))).toEqual([0, 0, 0, 96])
    expect(new Set([Array.from(classic), Array.from(rgb), Array.from(grille)].map((value) => value.join(','))).size).toBe(3)
  })

  it('keeps preset lookup deterministic for invalid ids', () => {
    expect(filterPresetById('missing')).toBeNull()
    expect(filterPresetById('vignette')?.blendMode).toBe('multiply')
  })

  it('normalizes LCD dimensions with the fixed grille as the default', () => {
    expect(normalizeLcdScreenFilterOptions()).toEqual(DEFAULT_LCD_SCREEN_FILTER_OPTIONS)
    expect(normalizeLcdScreenFilterOptions({ width: 0.4, height: -3, scanlineTypes: ['rgb', 'invalid' as never] })).toEqual({ width: 1, height: 1, scanlineTypes: ['rgb'] })
    expect(normalizeLcdScreenFilterOptions({ scanlineTypes: [] }).scanlineTypes).toEqual([])
  })

  it('renders the fixed vertical grille and keeps RGB layers free of scanline alpha', () => {
    const vertical = lcdScanlineColorAt(0, 1, { width: 1, height: 1 })
    const gap = lcdScanlineColorAt(3, 1, { width: 1, height: 1 })
    const horizontal = lcdScanlineColorAt(3, 0, { width: 1, height: 1 })
    expect(vertical).toEqual({ r: 0, g: 0, b: 0, a: 112 })
    expect(gap).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(horizontal).toEqual({ r: 0, g: 0, b: 0, a: 36 })
    const source = { r: 220, g: 120, b: 40, a: 255 }
    const redChannel = lcdChannelColorAt(source, 0, 1, 1, { width: 3, height: 2 })
    const blueChannel = lcdChannelColorAt(source, 2, 1, 1, { width: 3, height: 2 })
    expect(redChannel.r).toBeGreaterThan(redChannel.g)
    expect(blueChannel.b).toBeGreaterThan(blueChannel.r)
    expect(lcdChannelColorAt(source, 0, 0, 0, { width: 3, height: 2 }).a).toBe(source.a)
    expect(lcdChannelColorAt(source, 0, 0, 1, { width: 3, height: 2 }).a).toBe(source.a)
    expect(lcdChannelOffset(0, { width: 2, height: 3, scanlineTypes: [] })).toEqual({ x: -2, y: -3 })
    expect(lcdChannelOffset(1, { width: 2, height: 3, scanlineTypes: [] })).toEqual({ x: 0, y: 0 })
    expect(lcdChannelOffset(2, { width: 2, height: 3, scanlineTypes: [] })).toEqual({ x: 2, y: 3 })
  })
})
