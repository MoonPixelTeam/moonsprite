import { describe, expect, it } from 'vitest'
import { shiftSelection } from './selection'
import { selectionBoundarySegments } from './selection-boundary'

describe('rectangular selection boundaries', () => {
  it.each([[3, 2], [-3, -2], [-10, -10]])('keeps all four edges after moving by %s, %s', (dx, dy) => {
    const original = { x: 8, y: 8, width: 45, height: 40 }
    const moved = shiftSelection(original, dx, dy, 64, 64)!
    expect(moved.mask).toBeDefined()
    const { width, height } = moved
    const segments = selectionBoundarySegments(moved)
    expect(Array.from(segments)).toEqual([
      0, 0, width, 0,
      width, 0, width, height,
      width, height, 0, height,
      0, height, 0, 0
    ])
    expect(segments).toEqual(selectionBoundarySegments({ x: moved.x, y: moved.y, width, height }))
  })
})
