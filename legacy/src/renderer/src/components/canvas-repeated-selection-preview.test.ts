import { describe, expect, it, vi } from 'vitest'
import { drawBrushCoverageOverlay } from './canvas-brush-coverage-overlay'
import { renderCanvasSelectionPreview } from './canvas-render-selection-preview'

describe('repeated selection display', () => {
  it('stops painting marquee cursor corners after switching to the selection brush', () => {
    const drawCorners = vi.fn()
    const point = { x: 5, y: 6 }
    const ports = {
      inputRef: { current: { drag: null, pointer: { visible: true, point, clientX: 10, clientY: 12 } } },
      session: { tool: 'selection', selectionKind: 'rectangle', selectionMode: 'replace', selection: null },
      document: { width: 16, height: 16 },
      canRenderToolPreview: true,
      repeatedDocumentPointsAt: () => ({ local: point, repeated: point }),
      sampleCompositeForPreview: () => ({ r: 255, g: 255, b: 255, a: 255 }),
      selectionPreviewColorForBackground: () => '#000',
      drawSelectionCursorCorners: drawCorners
    } as unknown as Parameters<typeof renderCanvasSelectionPreview>[0]
    renderCanvasSelectionPreview(ports)
    expect(drawCorners).toHaveBeenCalledWith(5, 6, '#000')
    drawCorners.mockClear()
    ports.session.selectionKind = 'brush'
    // Full redraws (including release) must never leave a corner mark behind
    // when subsequent pointer movement updates only the brush overlay.
    renderCanvasSelectionPreview(ports)
    point.x = 9
    renderCanvasSelectionPreview(ports)
    expect(drawCorners).not.toHaveBeenCalled()
    ports.session.selectionKind = 'rectangle'
    renderCanvasSelectionPreview(ports)
    expect(drawCorners).toHaveBeenCalledWith(9, 6, '#000')
  })

  it('draws the actual lasso path outside the base canvas like a marquee', () => {
    const draw = vi.fn()
    const copies = [{ x: 0, y: 0, originX: 0, originY: 0, fromX: 0, fromY: 0, toX: 16, toY: 16 }]
    const drag = { kind: 'lasso', path: [{ x: 14, y: 4 }, { x: 19, y: 4 }], last: { x: 19, y: 4 }, selectionMode: 'replace' }
    const ports = {
      inputRef: { current: { drag, spaceHeld: true, pointer: { point: drag.last } } },
      repeatCopies: copies, view: { tileRepeatMode: 'x' },
      session: { symmetryAxes: null }, document: { width: 16, height: 16 },
      drawSelectionPathPreviewPoints: draw, lassoPreviewClosed: false
    } as unknown as Parameters<typeof renderCanvasSelectionPreview>[0]
    renderCanvasSelectionPreview(ports)
    expect(draw).toHaveBeenCalledOnce()
    expect([...draw.mock.calls[0][0]]).toContainEqual({ x: 19, y: 4 })
    expect([...draw.mock.calls[0][0]]).not.toContainEqual({ x: 3, y: 4 })
    expect(draw.mock.calls[0][1]).toBe(copies)
    expect(draw.mock.calls[0][2]).toBe(true)
  })

  it.each(['x', 'y', 'both', 'off'] as const)('draws brush coverage on all %s copies', mode => {
    const fillRect = vi.fn()
    drawBrushCoverageOverlay({ fillRect }, new Set([3 * 16 + 1]), 16, 16, mode, 100, 100, 2, { x: 1, y: 1 })
    const xs = mode === 'x' || mode === 'both' ? [-32, 0, 32] : [0]
    const ys = mode === 'y' || mode === 'both' ? [-32, 0, 32] : [0]
    expect(fillRect).toHaveBeenCalledTimes(xs.length * ys.length)
    for (const x of xs) for (const y of ys) expect(fillRect).toHaveBeenCalledWith(102 + x, 106 + y, 2, 2)
  })
})

it.each([false, true])('honors the rounded checkbox in marquee previews (enabled=%s)', selectionRounded => {
  const draw = vi.fn()
  const target = { x: 2, y: 2, width: 12, height: 12 }
  renderCanvasSelectionPreview({
    inputRef: { current: { drag: { kind: 'marquee', moved: true, previewTarget: target, last: { x: 13, y: 13 } }, sampling: true, pointer: { visible: false } } },
    session: { tool: 'selection', selectionKind: 'rectangle', selectionRounded, selectionCornerRadius: 4, symmetryAxes: null },
    document: { width: 16, height: 16 }, view: { tileRepeatMode: 'off' }, repeatCopies: [],
    drawSelectionPathPreviewPoints: draw
  } as unknown as Parameters<typeof renderCanvasSelectionPreview>[0])
  const points = draw.mock.calls[0][0] as Array<{ x: number; y: number }>
  expect(points.some(point => point.x === target.x && point.y === target.y)).toBe(!selectionRounded)
})
