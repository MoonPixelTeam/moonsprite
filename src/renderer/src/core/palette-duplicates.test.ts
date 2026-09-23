import { describe, expect, it } from 'vitest'
import { createDocument, findOrAddPaletteColor } from './document'
import { paletteRangeIdsBySlots, paletteSelectionBoundaryEdges } from './palette-layout'

describe('palette duplicate colors and range selection', () => {
  it('keeps duplicate colors as separate palette entries when requested', () => {
    const document = createDocument('duplicate palette colors', 1, 1, 'rgba')
    const color = { r: 24, g: 128, b: 240, a: 255 }
    const first = findOrAddPaletteColor(document, color, true, true)
    const second = findOrAddPaletteColor(document, color, true, true)

    expect(second).not.toBe(first)
    expect(document.palette.filter((entry) => entry.color.r === color.r && entry.color.g === color.g && entry.color.b === color.b && entry.color.a === color.a)).toHaveLength(2)
    expect(document.paletteOrder).toEqual(expect.arrayContaining([first, second]))
  })

  it('selects every occupied slot in a diagonal rectangle while skipping empty slots', () => {
    expect(paletteRangeIdsBySlots([1, 2, 3, 4, null, 6], 3, 0, 5)).toEqual([1, 2, 3, 4, 6])
  })

  it('returns one connected outer boundary instead of internal cell edges', () => {
    expect(paletteSelectionBoundaryEdges([1, 2, 3, 4, null, 6], 3, [1, 2, 3, 4, 6])).toEqual([
      { slot: 0, side: 'top' }, { slot: 0, side: 'left' },
      { slot: 1, side: 'top' }, { slot: 1, side: 'bottom' },
      { slot: 2, side: 'top' }, { slot: 2, side: 'right' },
      { slot: 3, side: 'right' }, { slot: 3, side: 'bottom' }, { slot: 3, side: 'left' },
      { slot: 5, side: 'right' }, { slot: 5, side: 'bottom' }, { slot: 5, side: 'left' }
    ])
  })
})
