import { describe, expect, it } from 'vitest'
import { canvasResizePreviewClippedRects, canvasResizePreviewExposedRects } from './canvas-resize-preview'

describe('canvas resize preview geometry', () => {
  it('returns the four exposed strips when the proposed canvas expands', () => {
    expect(canvasResizePreviewExposedRects(
      { x: -10, y: -6, width: 120, height: 112 },
      { x: 0, y: 0, width: 100, height: 100 }
    )).toEqual([
      { x: -10, y: -6, width: 120, height: 6 },
      { x: -10, y: 100, width: 120, height: 6 },
      { x: -10, y: 0, width: 10, height: 100 },
      { x: 100, y: 0, width: 10, height: 100 }
    ])
  })

  it('returns only the proposed canvas when it is a crop with no overlap', () => {
    expect(canvasResizePreviewExposedRects(
      { x: 140, y: 20, width: 12, height: 14 },
      { x: 0, y: 0, width: 100, height: 100 }
    )).toEqual([{ x: 140, y: 20, width: 12, height: 14 }])
  })

  it('returns no exposed area when the proposed canvas is inside the committed canvas', () => {
    expect(canvasResizePreviewExposedRects(
      { x: 10, y: 12, width: 40, height: 36 },
      { x: 0, y: 0, width: 100, height: 100 }
    )).toEqual([])
  })

  it('returns the committed strips that are clipped when the proposed canvas shrinks', () => {
    expect(canvasResizePreviewClippedRects(
      { x: 10, y: 12, width: 40, height: 36 },
      { x: 0, y: 0, width: 100, height: 100 }
    )).toEqual([
      { x: 0, y: 0, width: 100, height: 12 },
      { x: 0, y: 48, width: 100, height: 52 },
      { x: 0, y: 12, width: 10, height: 36 },
      { x: 50, y: 12, width: 50, height: 36 }
    ])
  })
})
