import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, layerContentBounds } from '@/core/document-model'
import { CanvasInputState } from '@/core/canvas-input-controller'
import type { CanvasDragState } from '@/core/canvas-input-contracts'
import { canvasCenteredDragFields, drawingAnchorPoint, drawingAnchorActive } from '@/core/canvas-centered-drawing'
import { marqueeSelectionCommit } from '@/core/canvas-input-path'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import { useCanvasRotatableGeometry } from './useCanvasRotatableGeometry'
import { createShapeCanvasInput } from './canvas-input-shape'

afterEach(cleanup)

const modifiers = { fromCenter: false, proportional: false, rotate: false }

it.each([['shape', 32, 24], ['shape', 31, 25], ['marquee', 32, 24], ['marquee', 31, 25]] as const)('%s stays centered on a %s x %s canvas during resize, rotation and temporary movement', (kind, width, height) => {
  const session = sessionFromDocument(createDocument('center', width, height, 'rgba'))
  session.shapeKind = 'ellipse'
  session.selectionKind = 'ellipse'
  session.drawFromCanvasCenter = true
  session.view.showGrid = true
  session.view.grid = { x: 3, y: 2, width: 4, height: 4 }
  const input = new CanvasInputState()
  const { result } = renderHook(() => useCanvasRotatableGeometry({
    session, inputRef: { current: input }, liveViewRef: { current: session.view },
    selectionMarqueeModifierState: () => modifiers, alignmentPreferences: { gridAlignmentEnabled: true, smartAlignmentEnabled: false, alignmentGuidesVisible: false, alignmentThreshold: 4 },
    quickSelectionCellAt: () => null, tilemapPaintSelectionForIncoming: selection => selection,
    scheduleDraw: vi.fn(), selectionCornerRadius: 0, symmetryCenter: session.symmetryCenter
  }))
  const point = { x: 20, y: 16 }
  const drag: CanvasDragState = { kind, start: point, last: point, selectionMode: 'replace', ...canvasCenteredDragFields(true, session.document, point) }
  const assertCenter = () => {
    const bounds = drag.previewTarget!
    expect(bounds.x + bounds.width / 2).toBe(width / 2)
    expect(bounds.y + bounds.height / 2).toBe(height / 2)
    expect(Number.isInteger(bounds.x) && Number.isInteger(bounds.y)).toBe(true)
  }
  const update = kind === 'shape' ? result.current.updateShapePreview : result.current.updateMarqueePreview
  assertCenter()
  update(drag, { x: 23, y: 18 }, modifiers)
  assertCenter()
  update(drag, { x: 21, y: 15 }, { ...modifiers, proportional: true })
  assertCenter()
  input.spaceHeld = true
  drag.transformMoveStart = { pointer: point, offset: { x: 11, y: -5 } }
  update(drag, { x: 22, y: 17 }, modifiers)
  assertCenter()
  input.spaceHeld = false
  update(drag, { x: 22, y: 17 }, { ...modifiers, rotate: true })
  update(drag, { x: 12, y: 19 }, { ...modifiers, rotate: true })
  assertCenter()
  update(drag, { x: 23, y: 18 }, modifiers)
  assertCenter()
  if (kind === 'marquee') {
    const committed = marqueeSelectionCommit(drag, null, true, 'replace')
    expect(committed.after).toEqual(drag.previewSelection)
    expect(committed.after).not.toBeNull()
  }
})

it.each(['rectangle', 'rectangle-outline', 'ellipse', 'ellipse-outline'] as const)('%s previews at the canvas center from pointer down and commits those bounds', shapeKind => {
  const session = sessionFromDocument(createDocument('center shape', 32, 24, 'rgba'))
  Object.assign(session, { tool: 'shape', shapeKind, drawFromCanvasCenter: true })
  const inputRef = { current: new CanvasInputState() }
  const commit = vi.fn()
  const shapes = createShapeCanvasInput({
    inputRef, gridSnapActive: false, draw: vi.fn(),
    freeTileSourceEditForDrag: () => null, paintSelectionForDrag: () => null,
    symmetryCenter: session.symmetryCenter, shapeCornerRadius: 0, t: (key: string) => key
  } as unknown as Parameters<typeof createShapeCanvasInput>[0])
  shapes.beginShape({ session, canEditLayer: true, tilemapPixelEditBlocked: false,
    event: { button: 0, clientX: 20, clientY: 16 } as React.PointerEvent<HTMLCanvasElement>,
    point: { x: 20, y: 16 }, activeColor: () => ({ r: 255, g: 0, b: 0, a: 255 }), tilemapEditDragState: {} })
  const drag = inputRef.current.drag!
  expect(drag.previewTarget).toEqual({ x: 11, y: 7, width: 10, height: 10 })
  shapes.endShape({ drag, session, state: { commitPixelEdit: commit } as unknown as ReturnType<typeof useWorkspace.getState> })
  expect(layerContentBounds(session.document, getActiveLayer(session.document))).toEqual(drag.previewTarget)
  expect(commit).toHaveBeenCalledOnce()
})

it('leaves pointer-based creation unchanged when disabled', () => {
  expect(canvasCenteredDragFields(false, { width: 32, height: 24 }, { x: 20, y: 16 })).toEqual({})
})


it.each([{ x: 0, y: 0 }, { x: 32, y: 24 }, { x: 8, y: 6.5 }])('keeps a custom anchor fixed during drawing and rotation: %j', anchor => {
  const session = sessionFromDocument(createDocument('anchor', 32, 24, 'rgba'))
  Object.assign(session, { tool: 'shape', shapeKind: 'ellipse', drawFromCanvasCenter: true, drawingAnchor: { x: anchor.x / 32, y: anchor.y / 24 } })
  expect(drawingAnchorPoint(session)).toEqual(anchor)
  expect(drawingAnchorActive(session)).toBe(true)
  const input = new CanvasInputState()
  const { result } = renderHook(() => useCanvasRotatableGeometry({
    session, inputRef: { current: input }, liveViewRef: { current: session.view }, selectionMarqueeModifierState: () => modifiers,
    alignmentPreferences: { gridAlignmentEnabled: false, smartAlignmentEnabled: false, alignmentGuidesVisible: false, alignmentThreshold: 4 },
    quickSelectionCellAt: () => null, tilemapPaintSelectionForIncoming: selection => selection, scheduleDraw: vi.fn(), selectionCornerRadius: 0, symmetryCenter: session.symmetryCenter
  }))
  const point = { x: 20, y: 16 }
  const drag: CanvasDragState = { kind: 'shape', start: point, last: point, ...canvasCenteredDragFields(true, session.document, point, false, null, anchor) }
  for (const [target, rotate] of [[{ x: 23, y: 18 }, false], [{ x: 22, y: 17 }, true], [{ x: 12, y: 19 }, true], [{ x: 23, y: 18 }, false]] as const) {
    result.current.updateShapePreview(drag, target, { ...modifiers, rotate })
    expect(drag.previewTarget!.x + drag.previewTarget!.width / 2).toBe(anchor.x)
    expect(drag.previewTarget!.y + drag.previewTarget!.height / 2).toBe(anchor.y)
  }
  session.shapeKind = 'polygon'
  expect(drawingAnchorActive(session)).toBe(false)
})

it('stores drawing anchor changes independently of selection pivots and document history', () => {
  useWorkspace.setState({ sessions: [], activeId: null })
  const document = createDocument('anchor settings', 32, 24, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions.find(item => item.document.id === document.id)!
  session.selectionPivot = { x: 2, y: 3 }
  const historyLength = session.history.length
  const dirty = document.dirty
  useWorkspace.getState().setDrawingAnchor({ x: 8, y: 6 })
  useWorkspace.getState().setDrawingAnchorVisible(false)
  expect(drawingAnchorPoint(session)).toEqual({ x: 8, y: 6 })
  expect(session.selectionPivot).toEqual({ x: 2, y: 3 })
  expect(session.drawingAnchorVisible).toBe(false)
  expect(session.history.length).toBe(historyLength)
  expect(document.dirty).toBe(dirty)
  localStorage.clear()
})
