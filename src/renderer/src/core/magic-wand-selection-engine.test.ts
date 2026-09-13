import { describe, expect, it } from 'vitest'
import type { SelectionMask } from '@shared/types-selection'
import { computeMagicWandSelection } from './magic-wand-selection-engine'
import { selectionBoundarySegments, selectionBoundarySegmentsForExterior, selectionPreviewRectangles } from './selection-boundary'

const transparent = 0
const blue = (255 | (255 << 24)) >>> 0
const red = ((255 << 16) | (255 << 24)) >>> 0

const contains = (selection: SelectionMask | null, x: number, y: number): boolean => {
  if (!selection || x < selection.x || y < selection.y || x >= selection.x + selection.width || y >= selection.y + selection.height) return false
  return !selection.mask || selection.mask[(y - selection.y) * selection.width + x - selection.x] === 1
}

describe('magic wand worker selection engine', () => {
  it('selects every matching color without requiring contiguity', () => {
    const pixels = new Uint32Array([blue, red, blue, transparent, blue])
    const selection = computeMagicWandSelection({
      width: 5,
      height: 1,
      x: 0,
      y: 0,
      tolerance: 0,
      contiguous: false,
      gapClosingThreshold: 0,
      layerBounds: { x: 0, y: 0, width: 5, height: 1 }
    }, (x, y) => pixels[y * 5 + x])

    expect(selection).toMatchObject({ x: 0, y: 0, width: 5, height: 1 })
    expect(Array.from(selection?.mask ?? [])).toEqual([1, 0, 1, 0, 1])
  })

  it('uses the shared smart gap closure without leaking to the canvas edge', () => {
    const width = 10
    const height = 10
    const pixels = new Uint32Array(width * height)
    for (let y = 2; y <= 7; y += 1) for (let x = 2; x <= 7; x += 1) {
      if (x !== 2 && x !== 7 && y !== 2 && y !== 7) continue
      if (y === 2 && (x === 4 || x === 5)) continue
      pixels[y * width + x] = blue
    }
    const request = {
      width,
      height,
      x: 4,
      y: 4,
      tolerance: 0,
      contiguous: true,
      layerBounds: { x: 0, y: 0, width, height }
    }
    const leaking = computeMagicWandSelection({ ...request, gapClosingThreshold: 0 }, (x, y) => pixels[y * width + x])
    const closed = computeMagicWandSelection({ ...request, gapClosingThreshold: 2 }, (x, y) => pixels[y * width + x])

    expect(contains(leaking, 0, 0)).toBe(true)
    expect(contains(closed, 4, 4)).toBe(true)
    expect(contains(closed, 0, 0)).toBe(false)
    expect(contains(closed, 4, 2)).toBe(true)
  })

  it('keeps an opaque contiguous selection inside offset layer bounds', () => {
    const selection = computeMagicWandSelection({
      width: 8,
      height: 8,
      x: 3,
      y: 3,
      tolerance: 0,
      contiguous: true,
      gapClosingThreshold: 0,
      layerBounds: { x: 2, y: 2, width: 3, height: 3 }
    }, (x, y) => x >= 2 && y >= 2 && x < 5 && y < 5 ? blue : transparent)

    expect(selection).toEqual({ x: 2, y: 2, width: 3, height: 3 })
  })

  it('short-circuits transparent exterior selection with sparse content bounds', () => {
    const width = 20
    const height = 20
    const pixels = new Uint32Array(width * height)
    for (let y = 8; y < 12; y += 1) for (let x = 8; x < 12; x += 1) pixels[y * width + x] = blue
    const selection = computeMagicWandSelection({
      width,
      height,
      x: 0,
      y: 0,
      tolerance: 0,
      contiguous: true,
      gapClosingThreshold: 0,
      layerBounds: { x: 0, y: 0, width, height },
      contentBounds: { x: 8, y: 8, width: 4, height: 4 }
    }, (x, y) => pixels[y * width + x])

    expect(selection).toMatchObject({ x: 0, y: 0, width, height })
    expect(contains(selection, 0, 0)).toBe(true)
    expect(contains(selection, 8, 8)).toBe(false)
    expect(contains(selection, 19, 19)).toBe(true)
  })

  it('builds the outer and hole boundaries for a mostly selected mask', () => {
    const mask = new Uint8Array(9).fill(1)
    mask[4] = 0

    const segments = selectionBoundarySegments({ x: 0, y: 0, width: 3, height: 3, mask })

    expect(segments.length).toBe(32)
  })

  it('keeps sparse exterior boundary generation equivalent to the full scan', () => {
    const width = 10
    const height = 10
    const mask = new Uint8Array(width * height).fill(1)
    for (let y = 3; y < 7; y += 1) for (let x = 3; x < 7; x += 1) mask[y * width + x] = 0
    const selection = { x: 0, y: 0, width, height, mask }
    const full = Array.from(selectionBoundarySegments(selection)).sort((a, b) => a - b)
    const sparse = Array.from(selectionBoundarySegmentsForExterior(selection, { x: 3, y: 3, width: 4, height: 4 })).sort((a, b) => a - b)
    expect(sparse).toEqual(full)
  })

  it('merges equal selection runs vertically for a lightweight preview', () => {
    const mask = Uint8Array.from([
      1, 1, 0, 1,
      1, 1, 0, 1,
      0, 0, 0, 1
    ])
    expect(Array.from(selectionPreviewRectangles({ x: 0, y: 0, width: 4, height: 3, mask }))).toEqual([
      0, 0, 2, 2,
      3, 0, 1, 3
    ])
  })
})
