import { describe, expect, it } from 'vitest'
import { snapPointToGrid, snapSelectionBoundsToGrid, snapSelectionTranslationToGrid } from './grid'

describe('grid point snapping', () => {
  it('snaps to the closest grid vertex', () => {
    expect(snapPointToGrid({ x: 5, y: 14 }, { x: 0, y: 0, width: 16, height: 16 })).toEqual({ x: 0, y: 16 })
    expect(snapPointToGrid({ x: 9, y: 7 }, { x: 1, y: 2, width: 4, height: 3 })).toEqual({ x: 9, y: 8 })
    // Aseprite keeps an exact half-cell tie on the lower vertex.
    expect(snapPointToGrid({ x: 8, y: 8 }, { x: 0, y: 0, width: 16, height: 16 })).toEqual({ x: 0, y: 0 })
  })

  it('supports negative origins and leaves invalid settings unchanged', () => {
    expect(snapPointToGrid({ x: -6, y: -5 }, { x: -3, y: -2, width: 4, height: 4 })).toEqual({ x: -3, y: -2 })
    const point = { x: 5, y: 6 }
    expect(snapPointToGrid(point, { x: 0, y: 0, width: 0, height: 16 })).toEqual(point)
  })
})

describe('grid selection snapping', () => {
  it('snaps marquee edges outward to complete cells like Aseprite', () => {
    expect(snapSelectionBoundsToGrid(
      { x: 5, y: 6, width: 7, height: 5 },
      { x: 1, y: 2, width: 4, height: 3 }
    )).toEqual({ x: 5, y: 5, width: 8, height: 6 })
  })

  it('handles negative grid origins and keeps a one-cell click selectable', () => {
    expect(snapSelectionBoundsToGrid(
      { x: 0, y: 0, width: 1, height: 1 },
      { x: -3, y: -2, width: 4, height: 4 }
    )).toEqual({ x: -3, y: -2, width: 4, height: 4 })
  })

  it('leaves invalid bounds or grid settings unchanged', () => {
    const bounds = { x: 2, y: 3, width: 5, height: 6 }
    expect(snapSelectionBoundsToGrid(bounds, { x: 0, y: 0, width: 0, height: 4 })).toEqual(bounds)
  })

  it('snaps a moved selection as one shared offset without a threshold', () => {
    expect(snapSelectionTranslationToGrid(
      [{ x: 1, y: 2, width: 5, height: 4 }, { x: 20, y: 10, width: 2, height: 2 }],
      { x: 7, y: 8 },
      { x: 0, y: 0, width: 16, height: 16 }
    )).toEqual({ x: 15, y: 14 })
  })
})
