import { describe, expect, it } from 'vitest'
import { selectionContains } from './selection'
import { moveSymmetryCenter, symmetryAxisDragAllowed, symmetryAxisSegment, symmetryPoints, symmetrySelection, symmetrySelectionDragDelta, transformSymmetrySelection, type SymmetryAxes } from './symmetry'

const axes = (values: Partial<SymmetryAxes>): SymmetryAxes => ({
  horizontal: false,
  vertical: false,
  diagonalUp: false,
  diagonalDown: false,
  rotational: false,
  ...values
})

describe('symmetry', () => {
  it('allows Ctrl to temporarily move a locked symmetry axis', () => {
    expect(symmetryAxisDragAllowed(false, false)).toBe(true)
    expect(symmetryAxisDragAllowed(true, false)).toBe(false)
    expect(symmetryAxisDragAllowed(true, true)).toBe(true)
  })

  it('reflects points across each canvas-centered axis', () => {
    expect(symmetryPoints({ x: 1, y: 0 }, 6, 4, axes({ horizontal: true }))).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 3 }
    ])
    expect(symmetryPoints({ x: 1, y: 0 }, 6, 4, axes({ vertical: true }))).toEqual([
      { x: 1, y: 0 },
      { x: 4, y: 0 }
    ])
    expect(symmetryPoints({ x: 1, y: 0 }, 6, 4, axes({ diagonalDown: true }))).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 0 }
    ].filter((point, index, points) => points.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y) === index))
    expect(symmetryPoints({ x: 2, y: 0 }, 6, 4, axes({ diagonalDown: true }))).toEqual([
      { x: 2, y: 0 },
      { x: 1, y: 1 }
    ])
    expect(symmetryPoints({ x: 1, y: 0 }, 6, 4, axes({ diagonalUp: true }))).toEqual([
      { x: 1, y: 0 },
      { x: 4, y: 3 }
    ])
  })

  it('computes the multi-axis closure and removes duplicate center pixels', () => {
    expect(symmetryPoints({ x: 0, y: 1 }, 5, 5, axes({ horizontal: true, vertical: true, diagonalDown: true }))).toEqual([
      { x: 0, y: 1 }, { x: 0, y: 3 }, { x: 4, y: 1 }, { x: 1, y: 0 },
      { x: 4, y: 3 }, { x: 3, y: 0 }, { x: 1, y: 4 }, { x: 3, y: 4 }
    ])
    expect(symmetryPoints({ x: 2, y: 2 }, 5, 5, axes({ horizontal: true, vertical: true, diagonalDown: true, diagonalUp: true }))).toEqual([{ x: 2, y: 2 }])
  })



  it('creates a four-way 90-degree rotational orbit around the movable center', () => {
    expect(symmetryPoints({ x: 3, y: 2 }, 5, 5, axes({ rotational: true }))).toEqual([
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 1, y: 2 },
      { x: 2, y: 1 }
    ])
    expect(symmetryPoints({ x: 2, y: 2 }, 5, 5, axes({ rotational: true }))).toEqual([{ x: 2, y: 2 }])
  })



  it('composes rotational symmetry with mirror axes without duplicate pixels', () => {
    const points = symmetryPoints({ x: 5, y: 2 }, 7, 7, axes({ horizontal: true, rotational: true }))
    expect(points).toHaveLength(8)
    expect(points).toContainEqual({ x: 5, y: 4 })
    expect(new Set(points.map((point) => `${point.x}:${point.y}`)).size).toBe(points.length)
  })



  it('mirrors arbitrary selection masks with the same point mapping', () => {
    const selection = { x: 0, y: 0, width: 2, height: 2, mask: new Uint8Array([1, 0, 0, 1]) }
    const mirrored = symmetrySelection(selection, 4, 4, axes({ horizontal: true, vertical: true }))!
    expect([[0, 0], [1, 1], [3, 0], [2, 1], [0, 3], [1, 2], [3, 3], [2, 2]].every(([x, y]) => selectionContains(mirrored, x, y))).toBe(true)
    expect(Array.from(mirrored.mask ?? []).reduce((sum, value) => sum + value, 0)).toBe(8)
  })



  it('moves a rotational side as one region instead of splitting its pixel orbits', () => {
    const rotationalAxes = axes({ rotational: true })
    const selection = symmetrySelection({ x: 1, y: 1, width: 2, height: 2 }, 8, 8, rotationalAxes)!
    const target = { ...selection, x: selection.x + 1 }
    expect(symmetrySelectionDragDelta(selection, { x: 5, y: 2 }, { x: 1, y: 0 }, 8, 8, rotationalAxes, undefined, true)).toEqual({ x: 1, y: 0 })

    const moved = transformSymmetrySelection(selection, target, 8, 8, 0, undefined, rotationalAxes, undefined, true, { x: 5, y: 2 })!
    const movedPoints: string[] = []
    for (let y = moved.y; y < moved.y + moved.height; y += 1) for (let x = moved.x; x < moved.x + moved.width; x += 1) if (selectionContains(moved, x, y)) movedPoints.push(`${x},${y}`)
    expect(movedPoints.sort()).toEqual([
      '1,0', '2,0', '1,1', '2,1',
      '6,1', '7,1', '6,2', '7,2',
      '0,5', '1,5', '0,6', '1,6',
      '5,6', '6,6', '5,7', '6,7'
    ].sort())
  })






})
