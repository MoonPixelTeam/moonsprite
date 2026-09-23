import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { unboundedShapePreview } from '@/core/shape-preview'
import { createDocument } from '@/core/document-model'
import { CanvasInputState } from '@/core/canvas-input-controller'
import type { CanvasDragState } from '@/core/canvas-input-contracts'
import { marqueeSelectionCommit } from '@/core/canvas-input-path'
import { rotatedEllipseSelection, rotatedRectSelection } from '@/core/selection'
import { sessionFromDocument } from '@/store/workspace-session'
import { useCanvasRotatableGeometry } from './useCanvasRotatableGeometry'
import { createCanvasSelectionPaths } from './canvas-render-selection-paths'
import { beginSelectionBrush, moveSelectionBrush } from './canvas-selection-brush-gesture'
import { createCanvasBrushPath } from './canvas-render-brush-path'

afterEach(cleanup)

it.each(['rectangle', 'ellipse', 'rectangle-outline', 'ellipse-outline'] as const)('renders only the in-canvas part of the %s contour without adding a closing edge', kind => {
  const draw = vi.fn()
  const color = { r: 255, g: 0, b: 0, a: 255 }
  const { drawShapeContourPreview } = createCanvasBrushPath({
    session: { symmetryAxes: null }, document: { width: 16, height: 16 },
    drawPreviewPixel: draw, previewColorAt: () => color
  } as unknown as Parameters<typeof createCanvasBrushPath>[0])
  const points = unboundedShapePreview({ x: -4, y: 2, width: 10, height: 8 }, kind)
  drawShapeContourPreview(points, color, null)
  expect(draw.mock.calls.map(([x, y]) => ({ x, y }))).toEqual(points.filter(p => p.x >= 0 && p.y >= 0 && p.x < 16 && p.y < 16).map(({ x, y }) => ({ x, y })))
  expect(draw).not.toHaveBeenCalledWith(-4, 5, color)
  if (kind.startsWith('rectangle')) expect(draw).not.toHaveBeenCalledWith(0, 5, color)
})

it.each(['rectangle', 'rectangle-outline', 'ellipse', 'ellipse-outline'] as const)('%s keeps its full translated contour across all document edges', kind => {
  for (const angle of [0, 35, 90]) for (const radius of [0, 3]) {
    const bounds = { x: -6, y: -5, width: 24, height: 22 }
    const points = unboundedShapePreview(bounds, kind, angle, radius)
    const translated = unboundedShapePreview({ ...bounds, x: bounds.x + 50, y: bounds.y + 50 }, kind, angle, radius)
    expect(points).toEqual(translated.map(p => ({ ...p, x: p.x - 50, y: p.y - 50 })))
    expect(points.some(p => p.x < 0)).toBe(true)
    expect(points.some(p => p.y < 0)).toBe(true)
    expect(points.some(p => p.x >= 16)).toBe(true)
    expect(points.some(p => p.y >= 16)).toBe(true)
  }
})

it('does not invent a rectangle edge where the shape crosses the canvas edge', () => {
  const points = unboundedShapePreview({ x: -4, y: 2, width: 10, height: 8 }, 'rectangle')
  expect(points).toContainEqual({ x: -4, y: 5, coverage: 255 })
  expect(points).not.toContainEqual({ x: 0, y: 5, coverage: 255 })
})

it.each(['rectangle', 'ellipse'] as const)('%s defers mask construction until release and clips the final selection', selectionKind => {
  const session = sessionFromDocument(createDocument('boundary', 16, 16, 'rgba'))
  session.selectionKind = selectionKind
  const input = new CanvasInputState()
  const modifiers = { fromCenter: false, proportional: false, rotate: false }
  const { result } = renderHook(() => useCanvasRotatableGeometry({
    session, inputRef: { current: input }, liveViewRef: { current: session.view },
    selectionMarqueeModifierState: () => modifiers,
    alignmentPreferences: { gridAlignmentEnabled: false, smartAlignmentEnabled: false, alignmentGuidesVisible: false, alignmentThreshold: 4 },
    quickSelectionCellAt: () => null, tilemapPaintSelectionForIncoming: s => s,
    scheduleDraw: vi.fn(), selectionCornerRadius: 0, symmetryCenter: session.symmetryCenter
  }))
  const drag: CanvasDragState = { kind: 'marquee', start: { x: 4, y: 4 }, last: { x: -7, y: 22 }, moved: true }
  result.current.updateMarqueePreview(drag, drag.last, modifiers)
  expect(drag.previewTarget!.x).toBe(-7)
  expect(drag.previewSelection).toBeUndefined()
  result.current.updateMarqueePreview(drag, drag.last, modifiers, true)
  const expected = selectionKind === 'ellipse' ? rotatedEllipseSelection(drag.previewTarget!, 16, 16, 0) : rotatedRectSelection(drag.previewTarget!, 16, 16, 0)
  expect(marqueeSelectionCommit(drag, null, true, 'replace').after).toEqual(expected)
  expect(drag.previewSelection!.x).toBeGreaterThanOrEqual(0)
  expect(drag.previewSelection!.y + drag.previewSelection!.height).toBeLessThanOrEqual(16)
})

it('clears the old selection when a completed marquee is entirely outside', () => {
  const before = { x: 2, y: 2, width: 3, height: 3 }
  expect(marqueeSelectionCommit({ selectionStart: before, previewSelection: null }, before, true, 'replace').after).toBeNull()
})

it('renders off-canvas path pixels without clipping or reading document pixels outside', () => {
  const fillRect = vi.fn(), clip = vi.fn(), sample = vi.fn(() => ({ r: 0, g: 0, b: 0, a: 255 }))
  const paths = createCanvasSelectionPaths({
    selectionPreviewColorMode: 'custom', selectionPreviewColor: { r: 255, g: 255, b: 255, a: 255 },
    repeatCopies: [{ x: 0, y: 0, originX: 20, originY: 20, fromX: 0, fromY: 0, toX: 16, toY: 16 }],
    context: { save: vi.fn(), restore: vi.fn(), fillRect }, clipCanvasCopy: clip,
    view: { zoom: 1, tileRepeatMode: 'off' }, deviceScale: { x: 1, y: 1 }, document: { width: 16, height: 16 },
    rect: { width: 100, height: 100 }, sampleCompositeForPreview: sample
  } as unknown as Parameters<typeof createCanvasSelectionPaths>[0])
  paths.drawSelectionPathPreviewPoints([{ x: -3, y: 2 }, { x: 18, y: 2 }])
  expect(fillRect).toHaveBeenCalledWith(17, 22, 1, 1)
  expect(fillRect).toHaveBeenCalledWith(38, 22, 1, 1)
  expect(clip).not.toHaveBeenCalled()
  expect(sample).not.toHaveBeenCalled()
})

it('retains brush preview outside without aliasing negative coordinates into committed pixels', () => {
  const session = sessionFromDocument(createDocument('brush', 16, 16, 'rgba'))
  session.brushSize = 3
  const drag = beginSelectionBrush(session, { x: 1, y: 1 }, null, 'replace', true, 'off')
  moveSelectionBrush(drag, session, { x: -4, y: -4 }, true, 'off')
  expect(drag.selectionBrushStroke!.outsidePreview!.size).toBeGreaterThan(0)
  expect([...drag.selectionBrushStroke!.visited].every(key => key >= 0 && key < 256)).toBe(true)
  expect(drag.selectionBrushStroke!.visited.has(15)).toBe(false)
})
