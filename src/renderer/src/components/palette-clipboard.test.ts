import { expect, it } from 'vitest'
import { encodePaletteClipboard, parsePaletteClipboard } from './palette-clipboard'

const color = { r: 10, g: 30, b: 80, a: 255 }

it('round-trips duplicate colors and a sparse two-dimensional layout', () => {
  const clipboard = { colors: [color, color], layout: { columns: 3, slots: [0, null, null, null, null, 1] } }
  expect(parsePaletteClipboard(encodePaletteClipboard(clipboard))).toEqual(clipboard)
})

it('reads legacy palette copies without inventing a layout', () => {
  expect(parsePaletteClipboard(`MOONSPRITE_PALETTE_V1:${JSON.stringify([color])}`)).toEqual({ colors: [color] })
})

it.each([
  { columns: 0, slots: [0] }, { columns: 2, slots: [0] },
  { columns: 1, slots: [1] }, { columns: 1, slots: [-1] }
])('rejects invalid clipboard coordinates $columns/$slots', layout => {
  expect(parsePaletteClipboard(`MOONSPRITE_PALETTE_V2:${JSON.stringify({ colors: [color], layout })}`)).toBeNull()
})
