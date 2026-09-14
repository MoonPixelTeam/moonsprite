import { describe, expect, it } from 'vitest'
import { createDocument } from './document'
import { ellipseSelection, inverseSelectionQuadPoint, invertSelectionMask, lassoSelection, polygonSelection, polygonSelectionPreview, rasterLinePoints, remapTransformedSelectionPoint, rotateSelectionTargetAroundPivot, rotatedEllipseSelection, rotatedRectSelection, selectionContains, selectionQuadBounds, selectionQuadPoint, selectionQuadTransform, shearTransformedSelection, transformedSelectionBounds, transformedSelectionCenter, transformedSelectionControlPoints, transformedSelectionPivotPreset, transformedSelectionShearDirection, transformSelectionMask, transformSelectionMaskQuad } from './selection'

const referenceLassoPixels = (width: number, height: number, path: readonly { x: number; y: number }[]): Set<string> => {
  if (path.length < 3) return new Set()
  const minX = Math.max(0, Math.min(...path.map((point) => point.x)))
  const maxX = Math.min(width - 1, Math.max(...path.map((point) => point.x)))
  const minY = Math.max(0, Math.min(...path.map((point) => point.y)))
  const maxY = Math.min(height - 1, Math.max(...path.map((point) => point.y)))
  const selected = new Set<string>()
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    let inside = false
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const a = path[i]; const b = path[j]
      const cross = (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x)
      const onBoundary = cross === 0
        && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)
        && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)
      if (onBoundary) { inside = true; break }
      if (((a.y > y) !== (b.y > y)) && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1) + a.x) inside = !inside
    }
    if (inside) selected.add(`${x}:${y}`)
  }
  return selected
}

const selectionPixels = (selection: { x: number; y: number; width: number; height: number; mask?: Uint8Array } | null): Set<string> => {
  const pixels = new Set<string>()
  if (!selection) return pixels
  for (let y = selection.y; y < selection.y + selection.height; y += 1) for (let x = selection.x; x < selection.x + selection.width; x += 1) {
    if (!selection.mask || selection.mask[(y - selection.y) * selection.width + x - selection.x] === 1) pixels.add(`${x}:${y}`)
  }
  return pixels
}

describe('selection preview geometry', () => {
  it('matches the previous lasso pixel semantics across concave and clipped paths', () => {
    const document = createDocument('lasso scanline', 18, 14, 'rgba')
    const paths = [
      [{ x: 2, y: 2 }, { x: 12, y: 2 }, { x: 12, y: 9 }, { x: 2, y: 9 }],
      [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 7, y: 5 }, { x: 13, y: 11 }, { x: 1, y: 11 }, { x: 7, y: 7 }],
      [{ x: -4, y: 3 }, { x: 8, y: -2 }, { x: 19, y: 5 }, { x: 10, y: 16 }, { x: -3, y: 10 }],
      [...rasterLinePoints({ x: 2, y: 2 }, { x: 14, y: 7 }), ...rasterLinePoints({ x: 14, y: 7 }, { x: 4, y: 12 })]
    ]
    for (const [index, path] of paths.entries()) expect(selectionPixels(lassoSelection(document, path)), `path ${index}`).toEqual(referenceLassoPixels(document.width, document.height, path))
  })

  it('keeps an extreme outside lasso bounded to the finite document mask', () => {
    const document = createDocument('bounded repeated lasso', 8, 8, 'rgba')
    const selection = lassoSelection(document, [
      { x: -1_000_000, y: -1_000_000 },
      { x: 1_000_000, y: -1_000_000 },
      { x: 1_000_000, y: 1_000_000 },
      { x: -1_000_000, y: 1_000_000 }
    ])

    expect(selection).toMatchObject({ x: 0, y: 0, width: 8, height: 8 })
    expect(selection?.mask).toHaveLength(64)
  })

  it('keeps a clipped live polygon preview pixel-identical inside the visible region', () => {
    const document = createDocument('clipped polygon preview', 24, 20, 'rgba')
    const vertices = [{ x: 2, y: 3 }, { x: 19, y: 2 }, { x: 21, y: 15 }, { x: 5, y: 18 }]
    const pointer = { x: 12, y: 10 }
    const complete = polygonSelection(document, [...vertices, pointer])
    const clipped = polygonSelectionPreview(document, vertices, pointer, false, { x: 6, y: 5, width: 10, height: 8 })

    expect(complete).not.toBeNull()
    expect(clipped).not.toBeNull()
    for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
      const inClip = x >= 6 && x < 16 && y >= 5 && y < 13
      expect(selectionContains(clipped, x, y)).toBe(inClip && selectionContains(complete, x, y))
    }
  })





  it('inverts an irregular selection across the complete canvas', () => {
    const inverted = invertSelectionMask({ x: 1, y: 0, width: 2, height: 2, mask: Uint8Array.from([1, 0, 0, 1]) }, 4, 3)

    expect(inverted).not.toBeNull()
    expect(selectionContains(inverted, 1, 0)).toBe(false)
    expect(selectionContains(inverted, 2, 1)).toBe(false)
    expect(selectionContains(inverted, 0, 0)).toBe(true)
    expect(selectionContains(inverted, 3, 2)).toBe(true)
  })

  it('preserves transformed selection bounds and masks outside the canvas', () => {
    const rectangle = transformSelectionMask(
      { x: 1, y: 1, width: 2, height: 2 },
      { x: -3, y: 4, width: 7, height: 5 },
      6,
      6,
      0,
      undefined,
      false
    )
    expect(rectangle).toEqual({ x: -3, y: 4, width: 7, height: 5 })

    const irregular = transformSelectionMask(
      { x: 1, y: 1, width: 2, height: 2, mask: Uint8Array.from([1, 0, 0, 1]) },
      { x: -2, y: -1, width: 2, height: 2 },
      6,
      6,
      0,
      undefined,
      false
    )
    expect(irregular).toMatchObject({ x: -2, y: -1, width: 2, height: 2 })
    expect(selectionContains(irregular, -2, -1)).toBe(true)
    expect(selectionContains(irregular, -1, 0)).toBe(true)
  })

  it('does not drop sparse masked pixels during diagonal rotation', () => {
    const source = { x: 2, y: 2, width: 2, height: 2, mask: Uint8Array.from([1, 0, 0, 1]) }
    const rotated = transformSelectionMask(source, source, 8, 8, 45, undefined, false)

    expect(selectionContains(rotated, 3, 2)).toBe(true)
    expect(selectionContains(rotated, 3, 3)).toBe(true)
  })

  it('trims empty padding around a rotated masked selection', () => {
    const source = ellipseSelection(4, 5, 8, 4)!
    const rotated = transformSelectionMask(source, source, 20, 20, 45, undefined, false)!
    const hasSelectedPixel = (offsets: number[]): boolean => offsets.some((offset) => rotated.mask?.[offset] === 1)

    expect(hasSelectedPixel(Array.from({ length: rotated.width }, (_, x) => x))).toBe(true)
    expect(hasSelectedPixel(Array.from({ length: rotated.width }, (_, x) => (rotated.height - 1) * rotated.width + x))).toBe(true)
    expect(hasSelectedPixel(Array.from({ length: rotated.height }, (_, y) => y * rotated.width))).toBe(true)
    expect(hasSelectedPixel(Array.from({ length: rotated.height }, (_, y) => y * rotated.width + rotated.width - 1))).toBe(true)
  })

  it('rotates all eight transform control points around the selection center', () => {
    expect(transformedSelectionControlPoints({ x: 2, y: 3, width: 4, height: 2 }, 90)).toEqual([
      { x: 5, y: 2 }, { x: 5, y: 4 }, { x: 5, y: 6 },
      { x: 4, y: 2 }, { x: 4, y: 6 },
      { x: 3, y: 2 }, { x: 3, y: 4 }, { x: 3, y: 6 }
    ])
  })

  it('remaps the selection pivot with normal scaling, shear, and cross-boundary flips', () => {
    expect(remapTransformedSelectionPoint(
      { x: 2, y: 4, width: 4, height: 2 },
      { x: 2, y: 4, width: 8, height: 6 },
      { x: 3, y: 5 }
    )).toEqual({ x: 4, y: 7 })

    const source = { x: 0, y: 0, width: 8, height: 6 }
    const destination = { x: 1, y: 2, width: 12, height: 9 }
    const shear = { axis: 'x' as const, edge: 's' as const, amount: 3 }
    const sourcePoint = transformedSelectionControlPoints(source, 37, shear)[1]
    const expectedPoint = transformedSelectionControlPoints(destination, 37, shear)[1]
    const remappedPoint = remapTransformedSelectionPoint(source, destination, sourcePoint, 37, shear)
    expect(remappedPoint.x).toBeCloseTo(expectedPoint.x)
    expect(remappedPoint.y).toBeCloseTo(expectedPoint.y)

    expect(remapTransformedSelectionPoint(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: -5, y: 0, width: 5, height: 10, flipHorizontal: true },
      { x: 0, y: 5 }
    )).toEqual({ x: 0, y: 5 })
  })

  it('maps four-corner transforms in both directions and reports pixel bounds', () => {
    const quad = {
      nw: { x: 2, y: 2 },
      ne: { x: 8, y: 1 },
      se: { x: 9, y: 7 },
      sw: { x: 1, y: 6 }
    }
    const transform = selectionQuadTransform(quad)
    expect(transform).not.toBeNull()
    const center = selectionQuadPoint(transform!, 0.5, 0.5)!
    const remapped = inverseSelectionQuadPoint(transform!, center)!
    expect(remapped.x).toBeCloseTo(0.5)
    expect(remapped.y).toBeCloseTo(0.5)
    expect(selectionQuadPoint(quad, 0, 0)).toEqual(quad.nw)
    expect(selectionQuadBounds(quad)).toEqual({ x: 1, y: 1, width: 8, height: 6 })
  })

  it('rejects degenerate or self-intersecting four-corner frames', () => {
    expect(selectionQuadTransform({
      nw: { x: 0, y: 0 }, ne: { x: 4, y: 0 }, se: { x: 2, y: 0 }, sw: { x: 0, y: 3 }
    })).toBeNull()
    expect(selectionQuadTransform({
      nw: { x: 0, y: 0 }, ne: { x: 4, y: 4 }, se: { x: 0, y: 4 }, sw: { x: 4, y: 0 }
    })).toBeNull()
  })

  it('rasterizes a rectangular source into a four-corner target mask', () => {
    const transformed = transformSelectionMaskQuad(
      { x: 0, y: 0, width: 2, height: 2 },
      { nw: { x: 1, y: 2 }, ne: { x: 3, y: 2 }, se: { x: 3, y: 4 }, sw: { x: 1, y: 4 } },
      8,
      8
    )
    expect(transformed).toMatchObject({ x: 1, y: 2, width: 2, height: 2 })
    expect(selectionContains(transformed, 1, 2)).toBe(true)
    expect(selectionContains(transformed, 2, 3)).toBe(true)
    expect(selectionContains(transformed, 0, 2)).toBe(false)
  })









  it('keeps the local transform direction while continuing a single-axis shear', () => {
    const start = { x: 2, y: 2, width: 4, height: 4 }
    const first = shearTransformedSelection(start, 0, undefined, 'e', 2)
    const second = shearTransformedSelection(first.target, first.angle, first.shear, 'e', 1)

    expect(first).toEqual({ target: start, angle: 0, shear: { axis: 'y', edge: 'e', amount: 2 } })
    expect(second).toEqual({ target: start, angle: 0, shear: { axis: 'y', edge: 'e', amount: 3 } })
  })








  it('rasterizes rounded rectangle selections with clamped radii', () => {
    const target = { x: 4, y: 5, width: 8, height: 6 }
    const square = rotatedRectSelection(target, 32, 32, 0, true, 0)
    const rounded = rotatedRectSelection(target, 32, 32, 0, true, 3)
    const clamped = rotatedRectSelection(target, 32, 32, 0, true, 99)

    expect(square).toEqual(target)
    expect(rounded).not.toBeNull()
    expect(selectionContains(rounded, target.x, target.y)).toBe(false)
    expect(selectionContains(rounded, target.x + Math.floor(target.width / 2), target.y)).toBe(true)
    expect(selectionContains(rounded, target.x, target.y + Math.floor(target.height / 2))).toBe(true)
    expect(selectionContains(rounded, target.x + target.width - 1, target.y + target.height - 1)).toBe(false)
    expect(clamped).toEqual(rounded)
  })


})
