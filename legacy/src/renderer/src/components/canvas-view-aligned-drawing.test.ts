import { expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt } from '@/core/document-model'
import { CanvasInputState } from '@/core/canvas-input-controller'
import type { CanvasDragState, CanvasPoint } from '@/core/canvas-input-contracts'
import { shapeBounds } from '@/core/canvas-input-resize'
import { marqueeSelectionCommit } from '@/core/canvas-input-path'
import { selectionContains, transformedSelectionControlPoints } from '@/core/selection'
import { documentPointFromViewportPoint, viewportPointFromDocumentPointContinuous } from '@/core/view-geometry'
import { revertPixelEdit } from '@/core/history'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { useCanvasRotatableGeometry } from './useCanvasRotatableGeometry'
import { createShapeCanvasInput } from './canvas-input-shape'
import { renderCanvasShapePreview } from './canvas-render-shape-preview'

const modifiers = { fromCenter: false, proportional: false, rotate: false }
const setup = (rotation = 37, mirrored = false, mirroredVertical = false, zoom = 3) => {
  const session = sessionFromDocument(createDocument('view drawing', 128, 128, 'rgba', false))
  Object.assign(session.view, { rotation, mirrored, mirroredVertical, zoom, panX: 17, panY: -9 })
  const inputRef = { current: new CanvasInputState() }
  const geometry = useCanvasRotatableGeometry({
    session, inputRef, liveViewRef: { current: session.view },
    selectionMarqueeModifierState: () => modifiers,
    alignmentPreferences: { gridAlignmentEnabled: false, smartAlignmentEnabled: false, alignmentGuidesVisible: false, alignmentThreshold: 4 },
    quickSelectionCellAt: () => null, tilemapPaintSelectionForIncoming: s => s,
    scheduleDraw: vi.fn(), selectionCornerRadius: 0, symmetryCenter: session.symmetryCenter
  })
  const display = (point: CanvasPoint) => viewportPointFromDocumentPointContinuous(point, 800, 600, 128, 128, session.view, 'view')
  const pixel = (point: CanvasPoint) => documentPointFromViewportPoint(point, 800, 600, 128, 128, session.view, 'view')
  const start = { x: 50, y: 50 }
  const startScreen = display({ x: start.x + 0.5, y: start.y + 0.5 })
  const end = pixel({ x: startScreen.x + 24 * zoom, y: startScreen.y + 12 * zoom })
  const drag = (kind: 'shape' | 'marquee'): CanvasDragState => ({ kind, start, last: end, moved: true, selectionMode: 'replace' })
  const shapes = createShapeCanvasInput({
    inputRef, gridSnapActive: false, draw: vi.fn(), ...geometry,
    currentSelectionMarqueeModifierState: () => modifiers,
    freeTileSourceEditForDrag: () => null, paintSelectionForDrag: () => null,
    symmetryCenter: session.symmetryCenter, shapeCornerRadius: 0, t: (key: string) => key
  } as unknown as Parameters<typeof createShapeCanvasInput>[0])
  return { session, inputRef, geometry, display, pixel, start, end, drag, shapes }
}

it.each(['shape', 'marquee'] as const)('%s follows screen axes in rotated, zoomed and mirrored views in both drag directions', kind => {
  for (const angle of [0, 37, -25, 90, 180, 360]) for (const mirrored of [false, true]) for (const vertical of [false, true]) for (const zoom of [0.5, 3]) {
    const s = setup(angle, mirrored, vertical, zoom)
    for (const reverse of [false, true]) {
      const drag = s.drag(kind)
      if (reverse) [drag.start, drag.last] = [drag.last, drag.start]
      const update = kind === 'shape' ? s.geometry.updateShapePreview : s.geometry.updateMarqueePreview
      update(drag, drag.last, modifiers)
      const corners = transformedSelectionControlPoints(drag.previewTarget!, drag.previewAngle).map(s.display)
      expect(corners[0].y).toBeCloseTo(corners[2].y)
      expect(corners[0].x).toBeCloseTo(corners[5].x)
      expect(Math.abs(corners[2].x - corners[0].x) / zoom).toBeCloseTo(drag.previewTarget!.width)
      expect(Math.abs(drag.previewTarget!.width - 25)).toBeLessThanOrEqual(1)
      expect(Math.abs(drag.previewTarget!.height - 13)).toBeLessThanOrEqual(1)
      const center = s.display({ x: drag.previewTarget!.x + drag.previewTarget!.width / 2, y: drag.previewTarget!.y + drag.previewTarget!.height / 2 })
      const from = s.display({ x: drag.start.x + 0.5, y: drag.start.y + 0.5 })
      const to = s.display({ x: drag.last.x + 0.5, y: drag.last.y + 0.5 })
      expect(Math.abs(center.x - (from.x + to.x) / 2) / zoom).toBeLessThan(0.3)
      expect(Math.abs(center.y - (from.y + to.y) / 2) / zoom).toBeLessThan(0.3)
      update(drag, drag.last, { ...modifiers, proportional: true })
      expect(drag.previewTarget!.width).toBe(drag.previewTarget!.height)
    }
  }
})

it('preserves exact unrotated inclusive pixel bounds', () => {
  const s = setup(0)
  const drag = s.drag('shape')
  s.geometry.updateShapePreview(drag, drag.last, modifiers)
  expect(drag.previewTarget).toEqual(shapeBounds(drag.start, drag.last))
  expect(drag.previewAngle).toBe(0)
})

it.each(['shape', 'marquee'] as const)('%s retains center, movement and explicit rotation modifiers', kind => {
  const s = setup(37, true)
  const drag = s.drag(kind)
  const update = kind === 'shape' ? s.geometry.updateShapePreview : s.geometry.updateMarqueePreview
  update(drag, drag.last, { ...modifiers, fromCenter: true })
  expect(drag.previewTarget!.x + drag.previewTarget!.width / 2).toBeCloseTo(drag.start.x + 0.5)
  expect(drag.previewTarget!.y + drag.previewTarget!.height / 2).toBeCloseTo(drag.start.y + 0.5)
  update(drag, drag.last, modifiers)
  const before = { ...drag.previewTarget! }
  s.inputRef.current.spaceHeld = true
  drag.transformMoveStart = { pointer: drag.last, offset: { x: 0, y: 0 } }
  update(drag, { x: drag.last.x + 5, y: drag.last.y - 3 }, modifiers)
  expect(drag.previewTarget).toEqual({ ...before, x: before.x + 5, y: before.y - 3 })
  s.inputRef.current.spaceHeld = false
  const pointer = { x: drag.last.x + 5, y: drag.last.y - 3 }
  update(drag, pointer, { ...modifiers, rotate: true })
  expect(drag.previewAngle).toBe(37)
  const rotatedPointer = { x: pointer.x - 8, y: pointer.y + 10 }
  update(drag, rotatedPointer, { ...modifiers, rotate: true })
  expect(drag.previewAngle).not.toBe(37)
  const rotated = { ...drag.previewTarget! }, angle = drag.previewAngle
  update(drag, rotatedPointer, modifiers)
  expect(drag.previewTarget).toEqual(rotated)
  expect(drag.previewAngle).toBe(angle)
})

it('orients a shape at its custom anchor on pointer down, before any movement', () => {
  const s = setup(90)
  Object.assign(s.session, { tool: 'shape', shapeKind: 'rectangle', drawFromCanvasCenter: true, drawingAnchor: { x: 0.25, y: 0.5 } })
  s.shapes.beginShape({ session: s.session, canEditLayer: true, tilemapPixelEditBlocked: false,
    event: { button: 0, clientX: 400, clientY: 300 } as React.PointerEvent<HTMLCanvasElement>,
    point: { x: 40, y: 90 }, activeColor: () => s.session.primaryColor, tilemapEditDragState: {} })
  const drag = s.inputRef.current.drag!
  expect(drag.previewAngle).toBe(-90)
  expect(drag.previewTarget!.x + drag.previewTarget!.width / 2).toBe(32)
  expect(drag.previewTarget!.y + drag.previewTarget!.height / 2).toBe(64)
  expect(drag.previewTarget!.width).toBeGreaterThan(drag.previewTarget!.height)
})

it.each(['rectangle', 'ellipse', 'rectangle-outline', 'ellipse-outline'] as const)('%s commits the rotated preview pixels and reverts in one edit', shapeKind => {
  const s = setup(37)
  s.session.shapeKind = shapeKind
  s.session.selectionKind = shapeKind.startsWith('ellipse') ? 'ellipse' : 'rectangle'
  s.session.brushSize = 1
  s.session.primaryColor = { r: 255, g: 0, b: 0, a: 255 }
  const drag = s.drag('shape')
  s.geometry.updateShapePreview(drag, drag.last, modifiers)
  const drawContour = vi.fn()
  renderCanvasShapePreview({ canRenderToolPreview: true, drag, session: s.session,
    paintSelectionForDrag: () => null, drawShapeContourPreview: drawContour,
    document: s.session.document, shapeCornerRadius: 0
  } as unknown as Parameters<typeof renderCanvasShapePreview>[0])
  const preview = new Set((drawContour.mock.calls[0][0] as CanvasPoint[]).map(p => `${p.x},${p.y}`))
  expect(preview.size).toBeGreaterThan(10)
  const marquee = s.drag('marquee')
  s.geometry.updateMarqueePreview(marquee, marquee.last, modifiers)
  expect(marquee.previewTarget).toEqual(drag.previewTarget)
  s.geometry.updateMarqueePreview(marquee, marquee.last, modifiers, true)
  const selection = marqueeSelectionCommit(marquee, null, true, 'replace').after!
  const commit = vi.fn()
  s.shapes.endShape({ drag, session: s.session, state: { commitPixelEdit: commit } as unknown as ReturnType<typeof useWorkspace.getState> })
  expect(commit).toHaveBeenCalledOnce()
  const layer = getActiveLayer(s.session.document)
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const painted = readLayerColorAt(s.session.document, layer, x, y).a > 0
    expect(painted).toBe(shapeKind.endsWith('outline') ? preview.has(`${x},${y}`) : selectionContains(selection, x, y))
    if (preview.has(`${x},${y}`)) expect(painted).toBe(true)
  }
  revertPixelEdit(s.session.document, commit.mock.calls[0][0])
  for (const key of preview) {
    const [x, y] = key.split(',').map(Number)
    expect(readLayerColorAt(s.session.document, layer, x, y).a).toBe(0)
  }
})
