import { describe, expect, it } from 'vitest'
import { balancedStairLinePoints } from './pixel-line'
import { advanceIsoAlignedStrokeSegment, ISO_GUIDE_BASE_SPACING, isoGridLineEndpoint, isoGridLineSegment, isoGuidePixelPattern, isoGuideSegments, isoGuideSpacingForZoom, isoLineEndpoint, snapIsoPointToGridVertex, traceIsoGridPointerEdges, updateIsoAlignedStrokePath, type IsoAlignedStrokeSegmentState } from './isometric'

const runLengths = (points: Array<{ x: number; y: number }>, major: 'x' | 'y'): number[] => {
  const minor = major === 'x' ? 'y' : 'x'
  const runs: number[] = []
  for (const point of points) {
    const previous = points[runs.reduce((total, length) => total + length, 0) - 1]
    if (!previous || point[minor] !== previous[minor]) runs.push(1)
    else runs[runs.length - 1] += 1
  }
  return runs
}

describe('ISO view geometry', () => {
  it('constrains lines to the configured isometric stair or a cardinal direction', () => {
    const diagonalEnd = isoLineEndpoint({ x: 2, y: 3 }, { x: 13, y: 8 })
    const diagonal = balancedStairLinePoints({ x: 2, y: 3 }, diagonalEnd)
    expect(runLengths(diagonal, 'x')).toEqual(new Array(6).fill(2))

    const threeStepEnd = isoLineEndpoint({ x: 2, y: 3 }, { x: 20, y: 9 }, 3)
    const threeStepDiagonal = balancedStairLinePoints({ x: 2, y: 3 }, threeStepEnd)
    expect(runLengths(threeStepDiagonal, 'x')).toEqual(new Array(6).fill(3))

    expect(isoLineEndpoint({ x: 4, y: 4 }, { x: 4, y: 18 })).toEqual({ x: 4, y: 18 })
    expect(isoLineEndpoint({ x: 4, y: 4 }, { x: 18, y: 4 })).toEqual({ x: 18, y: 4 })
    expect(isoLineEndpoint({ x: 0, y: 0 }, { x: 3, y: 12 })).toEqual({ x: 0, y: 12 })
  })


  it('lets the initial pixel steps settle before locking the first direction', () => {
    const start: IsoAlignedStrokeSegmentState = { anchor: { x: 0, y: 0 }, endpoint: { x: 0, y: 0 }, direction: null }
    const horizontalSample = advanceIsoAlignedStrokeSegment(start, { x: 1, y: 0 })
    const diagonalSample = advanceIsoAlignedStrokeSegment(horizontalSample, { x: 1, y: 1 })
    const establishedDiagonal = advanceIsoAlignedStrokeSegment(diagonalSample, { x: 3, y: 2 })

    expect(horizontalSample.direction).toBe('right')
    expect(diagonalSample.lockedEndpoint).toBeUndefined()
    expect(diagonalSample.anchor).toEqual(start.anchor)
    expect(diagonalSample.direction).toBe('down-right')
    expect(establishedDiagonal.lockedEndpoint).toBeUndefined()
    expect(establishedDiagonal.endpoint).toEqual({ x: 3, y: 1 })
  })





  it('maps a turn from raw pointer movement instead of bridging to its offset aligned endpoint', () => {
    const turned = advanceIsoAlignedStrokeSegment({
      anchor: { x: 0, y: 0 },
      endpoint: { x: 11, y: 5 },
      rawAnchor: { x: 0, y: 0 },
      rawEndpoint: { x: 14, y: 1 },
      direction: 'down-right',
      directionSamples: 8
    }, { x: 15, y: 0 })

    expect(turned.lockedEndpoint).toEqual({ x: 11, y: 5 })
    expect(turned.rawAnchor).toEqual({ x: 14, y: 1 })
    expect(turned.direction).toBe('up-right')
    expect(turned.endpoint).toEqual({ x: 12, y: 5 })
  })

  it('snaps stroke starts to the nearest ISO grid vertex', () => {
    expect(snapIsoPointToGridVertex({ x: 7, y: 3 }, 2, 8)).toEqual({ x: 8, y: 4 })
    expect(snapIsoPointToGridVertex({ x: 12, y: 1 }, 2, 8, { x: 5, y: -2 })).toEqual({ x: 13, y: 2 })
  })

  it('keeps grid-snapped straight lines on a diagonal grid family', () => {
    const endpoint = isoGridLineEndpoint({ x: 0, y: 0 }, { x: 12, y: 1 }, 2)
    expect(endpoint).toEqual({ x: 9, y: 4 })
    expect(balancedStairLinePoints({ x: 0, y: 0 }, endpoint)).toEqual(expect.arrayContaining([
      { x: 0, y: 0 },
      { x: 8, y: 4 },
      { x: 9, y: 4 }
    ]))
  })


  it('returns the complete grid edge actually crossed by the pointer', () => {
    const traced = traceIsoGridPointerEdges({ x: 3, y: 0 }, { x: 3, y: 3 }, {
      stairStep: 2,
      spacing: 8
    })

    expect(traced.edges).toEqual([{
      key: '0:0:1',
      from: { x: 0, y: 0 },
      to: { x: 7, y: 3 },
      startVertex: { x: 0, y: 0 },
      endVertex: { x: 8, y: 4 }
    }])
    expect(traced.hoveredEdgeKey).toBeNull()
  })










  it('turns only after completing the active grid edge', () => {
    const turned = advanceIsoAlignedStrokeSegment({
      anchor: { x: 0, y: 0 },
      endpoint: { x: 6, y: 3 },
      rawAnchor: { x: 0, y: 0 },
      rawEndpoint: { x: 6, y: 3 },
      direction: 'down-right',
      directionSamples: 4
    }, { x: 11, y: -1 }, 2, {
      diagonalOnly: true,
      grid: { spacing: 8 }
    })

    expect(turned.lockedEndpoints).toEqual([{ x: 7, y: 3 }, { x: 8, y: 3 }])
    expect(turned.anchor).toEqual({ x: 8, y: 3 })
    expect(turned.direction).toBe('up-right')
    expect(turned.endpoint).toEqual({ x: 15, y: 0 })
    expect(balancedStairLinePoints({ x: 0, y: 0 }, { x: 7, y: 3 })).toHaveLength(8)
    expect(runLengths(balancedStairLinePoints({ x: 8, y: 3 }, turned.endpoint), 'x')).toEqual(new Array(4).fill(2))
  })









  it('clips both isometric guide families to the visible document bounds', () => {
    const bounds = { left: 8, top: 4, right: 24, bottom: 16 }
    const segments = isoGuideSegments(32, 24, bounds, { spacing: ISO_GUIDE_BASE_SPACING })
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.some(({ start, end }) => (end.y - start.y) / (end.x - start.x) > 0)).toBe(true)
    expect(segments.some(({ start, end }) => (end.y - start.y) / (end.x - start.x) < 0)).toBe(true)
    for (const { start, end } of segments) {
      for (const point of [start, end]) {
        expect(point.x).toBeGreaterThanOrEqual(bounds.left)
        expect(point.x).toBeLessThanOrEqual(bounds.right)
        expect(point.y).toBeGreaterThanOrEqual(bounds.top)
        expect(point.y).toBeLessThanOrEqual(bounds.bottom)
      }
      expect(Math.abs((end.y - start.y) / (end.x - start.x))).toBeCloseTo(0.5)
    }
  })





})
