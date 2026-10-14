import { describe, expect, it } from 'vitest'
import markd from '../../../../palettes/markd-221.palette.json'
import { builtInPalettes } from './built-in-palettes'

describe('Markd221 built-in palette', () => {
  it('matches the desktop palette in the web fallback, including the original layout', () => {
    const palette = builtInPalettes.find(item => item.id === 'markd-221')!
    expect(palette.name).toBe('Markd221')
    expect(palette.columns).toBe(22)
    expect(palette.colors).toHaveLength(221)
    const hex = palette.colors.map(color => '#' + [color.r, color.g, color.b, color.a]
      .map(channel => channel.toString(16).padStart(2, '0').toUpperCase()).join(''))
    expect(hex).toEqual(markd.colors)
    expect(palette.slots).toEqual(markd.slots)
    expect(palette.slots).toHaveLength(22 * 17)
    expect(palette.slots.filter(slot => slot !== null).sort((a, b) => a! - b!))
      .toEqual(Array.from({ length: 221 }, (_, index) => index))
  })

  it('preserves supplied colors, duplicate swatches and their coordinate placements', () => {
    expect(markd.colors[markd.slots[0]!]).toBe('#FAF5CDFF') // A1
    expect(markd.colors[markd.slots[16]!]).toBe('#F6D4CBFF') // E1
    expect(markd.colors[markd.slots[12 * 22 + 8]!]).toBe('#FBFBFBFF') // H1
    expect(markd.colors[markd.slots[12 * 22 + 9]!]).toBe('#FBFBFBFF') // H2
    expect(markd.colors[markd.slots[13 * 22 + 18]!]).toBe('#747D7AFF') // M15
    expect(markd.slots[6]).toBeNull()
  })
})
