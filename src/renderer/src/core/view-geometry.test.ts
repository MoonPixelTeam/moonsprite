import { describe, expect, it } from 'vitest'
import { clampCanvasViewPan, displayedCanvasCenter, documentPointFromViewportPoint, documentPointFromViewportPointContinuous, mirrorViewportPoint, rotateViewAroundViewportPoint, rotationIndicatorFitsCanvas, rotationIndicatorPointBetweenPointerAndCanvasCenter, rotationIndicatorPointLeftOfPointer, snapViewRotation, unrotatedViewportBounds, unrotatedViewportPoint, unrotateViewportPoint, viewCanvasOrigin, viewPanDeltaFromScreen, viewRotationPivot, viewportPointFromDocumentPointContinuous, viewportSegmentVisible, zoomViewAroundViewportPoint } from './view-geometry'

describe('view rotation geometry', () => {
  it('snaps Shift-constrained view rotation to sixteen directions', () => {
    expect(snapViewRotation(11)).toBe(0)
    expect(snapViewRotation(12)).toBe(22.5)
    expect(snapViewRotation(33)).toBe(22.5)
    expect(snapViewRotation(348)).toBe(337.5)
  })

  it('uses the viewport center for a view-centered rotation indicator', () => {
    expect(viewRotationPivot(800, 600, 120, -45, 'view')).toEqual({ x: 400, y: 300 })
  })

  it('uses the panned canvas center for a canvas-centered rotation indicator', () => {
    expect(viewRotationPivot(800, 600, 120, -45, 'canvas')).toEqual({ x: 520, y: 255 })
  })

  it('places the rotation indicator to the left of the pointer', () => {
    expect(rotationIndicatorPointLeftOfPointer(800, 600, { x: 500, y: 300 })).toEqual({ x: 340, y: 300 })
  })

  it('keeps a pointer-left rotation indicator inside the viewport', () => {
    expect(rotationIndicatorPointLeftOfPointer(800, 600, { x: 20, y: 20 })).toEqual({ x: 64, y: 96 })
    expect(rotationIndicatorPointLeftOfPointer(800, 600, { x: 780, y: 580 })).toEqual({ x: 620, y: 504 })
  })

  it('tracks the displayed canvas center through pan, mirror, and rotation', () => {
    expect(displayedCanvasCenter(800, 600, { zoom: 2, panX: 80, panY: 0, rotation: 90 }, 'view')).toEqual({ x: 400, y: 380 })
    expect(displayedCanvasCenter(800, 600, { zoom: 2, panX: 80, panY: 0, rotation: 90, mirrored: true }, 'view')).toEqual({ x: 400, y: 220 })
  })

  it('keeps the document point beneath a nearby rotation indicator fixed', () => {
    const view = { zoom: 2, panX: 36, panY: -18, rotation: 15, mirrored: true, mirroredVertical: false }
    const indicator = { x: 244, y: 188 }
    const before = documentPointFromViewportPointContinuous(indicator, 800, 600, 128, 96, view, 'view')
    const rotated = rotateViewAroundViewportPoint(view, 105, indicator, 800, 600, 'view')
    const after = documentPointFromViewportPointContinuous(indicator, 800, 600, 128, 96, rotated, 'view')
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('round-trips document points through rotated and mirrored views', () => {
    const view = { zoom: 3, panX: 48, panY: -27, rotation: 37, mirrored: true, mirroredVertical: true }
    const documentPoint = { x: 31.5, y: 18.25 }
    const viewportPoint = viewportPointFromDocumentPointContinuous(documentPoint, 640, 480, 96, 64, view, 'view')
    const restored = documentPointFromViewportPointContinuous(viewportPoint, 640, 480, 96, 64, view, 'view')
    expect(restored.x).toBeCloseTo(documentPoint.x)
    expect(restored.y).toBeCloseTo(documentPoint.y)
  })

  it('detects line segments that cross the viewport with both endpoints outside', () => {
    expect(viewportSegmentVisible({ x: -20, y: 40 }, { x: 220, y: 40 }, 200, 100)).toBe(true)
    expect(viewportSegmentVisible({ x: -20, y: -10 }, { x: 220, y: -10 }, 200, 100)).toBe(false)
  })





  it('maps viewport points to document pixels through rotation and pan', () => {
    const view = { zoom: 2, panX: 10, panY: -4, rotation: 90 }
    const origin = viewCanvasOrigin(800, 600, 100, 50, view)
    const pivot = viewRotationPivot(800, 600, view.panX, view.panY, 'view')
    const point = { x: pivot.x, y: pivot.y }
    expect(documentPointFromViewportPoint(point, 800, 600, 100, 50, view, 'view')).toEqual({ x: 45, y: 27 })
    const bounds = unrotatedViewportBounds(800, 600, view, 'view')
    expect(bounds.left).toBeCloseTo(100)
    expect(bounds.top).toBeCloseTo(-100)
    expect(bounds.right).toBeCloseTo(700)
    expect(bounds.bottom).toBeCloseTo(700)
    expect(origin).toEqual({ x: 310, y: 246 })
  })

  it('undoes display transforms without a document-coordinate round trip', () => {
    const view = { zoom: 32, panX: 0, panY: 0, rotation: 90, mirrored: true, mirroredVertical: true }
    const point = { x: 401.25, y: 299.75 }
    const unrotated = unrotatedViewportPoint(point, 800, 600, view, 'view')
    const pivot = viewRotationPivot(800, 600, view.panX, view.panY, 'view')
    const expected = mirrorViewportPoint(unrotateViewportPoint(point, pivot, view.rotation), pivot, true, true)
    expect(unrotated).toEqual(expected)
  })







  it('keeps an off-center document pixel under the pointer for canvas-centered mirrored zoom', () => {
    const view = { zoom: 2, panX: 60, panY: -30, rotation: 25, mirrored: true, mirroredVertical: false }
    const point = { x: 515, y: 340 }
    const before = documentPointFromViewportPoint(point, 800, 600, 100, 50, view, 'canvas')
    const next = zoomViewAroundViewportPoint(view, 4, point, 800, 600, 100, 50, 'canvas')
    expect(documentPointFromViewportPoint(point, 800, 600, 100, 50, next, 'canvas')).toEqual(before)
  })





  it('clamps the displayed bounds of a rotated canvas', () => {
    const next = clampCanvasViewPan(300, 300, 100, 50, { zoom: 2, panX: 1000, panY: 0, rotation: 90 }, 'view')
    expect(next.panX).toBeCloseTo(150)
    expect(next.panY).toBeCloseTo(0)
  })



})
