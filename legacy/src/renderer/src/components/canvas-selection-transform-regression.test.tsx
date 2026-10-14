import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document'
import { CanvasInputState, type CanvasDragState } from '@/core/canvas-input'
import { deferredSelectionPreviewOwner } from '@/core/canvas-input-preview'
import { rotateSelectionTargetAroundPivot, selectionContains, transformedSelectionBounds, transformedSelectionPivotPreset } from '@/core/selection'
import { applySelectionTransform, captureSelectionTransform, selectionTransformPreviewRasterPacked } from '@/core/tools-selection-transform'
import { useWorkspace } from '@/store/workspace'
import { useCanvasSelectionTransform } from './useCanvasSelectionTransform'
import { createTransformCanvasInput } from './canvas-input-transform'

beforeEach(() => { localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }) })
afterEach(cleanup)

it.each(['fast', 'rotsprite'] as const)('keeps rotated content inside the mouse-drag selection (%s)', algorithm => {
  for (const origin of [0, 10]) for (const angle of [30, 37, 45, 90, 135]) {
    const document = createDocument('mouse selection regression', 40, 40, 'rgba')
    const layer = document.layers[0]
    const selection = { x: origin, y: origin, width: 9, height: 6 }
    for (let y = origin; y < origin + 6; y++) for (let x = origin; x < origin + 9; x++) {
      writeLayerColor(document, layer, y * 40 + x, { r: 180, g: 90, b: 40, a: 255 })
    }
    const state = useWorkspace.getState()
    state.addSession(document)
    state.setSelection(selection)
    const session = useWorkspace.getState().sessions.find(item => item.document.id === document.id)!
    session.selectionRotationAlgorithm = algorithm
    const source = captureSelectionTransform(document, selection, layer, { preserveOutsideCanvas: true })!
    const pivot = transformedSelectionPivotPreset(selection, 'center')
    const target = rotateSelectionTargetAroundPivot(selection, pivot, angle)
    const drag: CanvasDragState = {
      kind: 'rotate-content', start: { x: origin + 11, y: origin + 3 }, last: { x: origin + 3, y: origin + 11 },
      selectionStart: selection, selectionSource: source, transformStartTarget: selection, startAngle: 0,
      previewTarget: target, previewAngle: angle, previewPending: true, deferredSelectionPreview: true,
      selectionPreparationPending: false, copy: false
    }
    const inputRef = { current: new CanvasInputState() }
    inputRef.current.drag = drag
    const ports = { session, inputRef, draw: vi.fn(), drawSelectionOverlay: vi.fn(), invalidateCompositeRect: vi.fn(), symmetryCenter: { x: 20, y: 20 } } as unknown as Parameters<typeof useCanvasSelectionTransform>[0]
    const hook = renderHook(() => useCanvasSelectionTransform(ports))
    hook.result.current.flushSelectionPreview(drag)
    const raster = selectionTransformPreviewRasterPacked(document, source, target, angle, undefined, layer, undefined, algorithm === 'rotsprite')
    const bounds = transformedSelectionBounds(target, angle)
    const outside: string[] = []
    expect(raster.pixels.some(pixel => (pixel >>> 24) !== 0)).toBe(true)
    for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
      if ((raster.pixels[y * raster.width + x] >>> 24) && !selectionContains(drag.previewSelection!, Math.floor(bounds.x) + x, Math.floor(bounds.y) + y)) outside.push(`${x},${y}`)
    }
    expect(outside, `${algorithm}, origin=${origin}, angle=${angle}`).toEqual([])
    const input = createTransformCanvasInput({ ...ports, t: (key: string) => key, symmetryStartPointForDrag: () => undefined } as unknown as Parameters<typeof createTransformCanvasInput>[0])
    input.endContentTransform({ drag, session, state })
    expect(session.pendingPaste?.target).toEqual(drag.previewSelection)
    hook.unmount()
  }
})

it.each(['fast', 'rotsprite'] as const)('keeps rotate → move → undo → reselect previews deferred and commits exact pixels (%s)', algorithm => {
  const document = createDocument('continuous selection transforms', 40, 40, 'rgba', false)
  const oracle = createDocument('committed transform oracle', 40, 40, 'rgba', false)
  const layer = document.layers[0], oracleLayer = oracle.layers[0]
  const selection = { x: 7, y: 8, width: 9, height: 6 }
  for (let y = 8; y < 14; y++) for (let x = 7; x < 16; x++) {
    if ((x + y) % 3 === 0) continue
    const color = { r: x * 10, g: y * 10, b: 70, a: (x + y) % 2 ? 128 : 255 }
    writeLayerColor(document, layer, y * 40 + x, color)
    writeLayerColor(oracle, oracleLayer, y * 40 + x, color)
  }
  const original = layer.pixels.slice()
  const state = useWorkspace.getState()
  state.addSession(document); state.setSelection(selection)
  const session = useWorkspace.getState().sessions[0]
  session.selectionRotationAlgorithm = algorithm
  const revision = session.contentRevision
  const inputRef = { current: new CanvasInputState() }
  const invalidateCompositeRect = vi.fn()
  const ports = { session, inputRef, draw: vi.fn(), drawSelectionOverlay: vi.fn(), invalidateCompositeRect,
    symmetryCenter: { x: 20, y: 20 } } as unknown as Parameters<typeof useCanvasSelectionTransform>[0]
  const hook = renderHook(() => useCanvasSelectionTransform(ports))
  const input = createTransformCanvasInput({ ...ports, t: (key: string) => key,
    symmetryStartPointForDrag: () => undefined } as unknown as Parameters<typeof createTransformCanvasInput>[0])
  const target = { ...selection, x: 11 }
  const rotate: CanvasDragState = { kind: 'rotate-content', start: { x: 16, y: 8 }, last: { x: 11, y: 14 },
    selectionStart: selection, transformStartTarget: selection, previewTarget: target, previewAngle: 37,
    startAngle: 0, previewPending: true, deferredSelectionPreview: true, selectionPreparationPending: true, copy: false }
  inputRef.current.drag = rotate
  expect(hook.result.current.prepareSelectionTransformDrag(rotate)).toBe(true)
  hook.result.current.flushSelectionPreview(rotate)
  input.endContentTransform({ drag: rotate, session, state })
  hook.result.current.endSelectionAdjustmentEdit()
  expect(session.pendingPaste?.previewDeferred).toBe(true)
  expect(session.pendingPaste?.previewEdit).toBeNull()
  expect(layer.pixels).toEqual(original)
  expect(session.contentRevision).toBe(revision)
  const pending = session.pendingPaste!
  const moved = { ...target, x: target.x + 3, y: target.y + 2 }
  const move: CanvasDragState = { kind: 'move-content', start: rotate.start, last: rotate.last,
    selectionStart: pending.target, selectionSource: pending.source, transformStartTarget: pending.transformTarget,
    startAngle: pending.transformAngle, previewAngle: pending.transformAngle, previewTarget: moved,
    previewPending: true, floatingPaste: true, deferredSelectionPreview: true, selectionPreparationPending: true, copy: false }
  inputRef.current.drag = move
  expect(hook.result.current.prepareSelectionTransformDrag(move)).toBe(true)
  hook.result.current.flushSelectionPreview(move)
  input.endContentTransform({ drag: move, session, state })
  hook.result.current.endSelectionAdjustmentEdit()
  expect(invalidateCompositeRect).not.toHaveBeenCalled()
  expect(layer.pixels).toEqual(original)
  expect(session.contentRevision).toBe(revision)
  const finalSelection = session.selection!
  state.commitFloatingPaste()
  const oracleSource = captureSelectionTransform(oracle, selection, oracleLayer)!
  applySelectionTransform(oracle, oracleSource, moved, 37, false, undefined, undefined, undefined, oracleLayer, undefined, undefined, false, algorithm === 'rotsprite')
  expect(layer.pixels).toEqual(oracleLayer.pixels)
  expect(session.selection).toEqual(finalSelection)
  state.undo()
  expect(layer.pixels).toEqual(original)
  state.redo()
  expect(layer.pixels).toEqual(oracleLayer.pixels)
  state.undo(); state.setSelection(selection)
  const fresh: CanvasDragState = { kind: 'move-content', start: rotate.start, last: rotate.last,
    selectionStart: selection, transformStartTarget: selection, previewTarget: { ...selection, x: 9 },
    startAngle: 0, previewAngle: 0, previewPending: true, deferredSelectionPreview: true, selectionPreparationPending: true }
  inputRef.current.drag = fresh
  hook.result.current.prepareSelectionTransformDrag(fresh); hook.result.current.flushSelectionPreview(fresh)
  input.endContentTransform({ drag: fresh, session, state })
  expect(layer.pixels).toEqual(original)
  state.undo()
  expect(layer.pixels).toEqual(original)
  expect(session.pendingPaste).toBeNull()
  hook.unmount()
})

it.each(['move-content', 'transform-content', 'rotate-content'] as const)(
  'preserves a resized floating preview after a resumed %s returns to its start', kind => {
    const document = createDocument('resumed resized selection', 40, 40, 'rgba')
    const layer = document.layers[0]
    const color = { r: 180, g: 90, b: 40, a: 255 }
    const selection = { x: 2, y: 2, width: 3, height: 2 }
    const target = { x: 10, y: 10, width: 6, height: 4 }
    for (let y = 2; y < 4; y++) for (let x = 2; x < 5; x++) {
      writeLayerColor(document, layer, y * 40 + x, color)
    }
    const state = useWorkspace.getState()
    state.addSession(document)
    state.setSelection(selection)
    const source = captureSelectionTransform(document, selection, layer)!
    const edit = applySelectionTransform(document, source, target, 0, false)
    state.beginFloatingSelectionTransform(source, edit, selection, target, false, 'resize', null, target)
    const session = useWorkspace.getState().sessions[0]
    const inputRef = { current: new CanvasInputState() }
    const drag: CanvasDragState = {
      kind, start: { x: 16, y: 14 }, last: { x: 16, y: 14 },
      selectionStart: target, selectionSource: source, transformStartTarget: target,
      previewTarget: target, startAngle: 0, previewAngle: 0, previewEdit: edit,
      floatingPaste: true, selectionPreparationPending: true, deferredSelectionPreview: true
    }
    inputRef.current.drag = drag
    const invalidateCompositeRect = vi.fn()
    const ports = {
      session, inputRef, invalidateCompositeRect, draw: vi.fn(), drawSelectionOverlay: vi.fn(),
      symmetryCenter: { x: 20, y: 20 }
    } as unknown as Parameters<typeof useCanvasSelectionTransform>[0]
    const hook = renderHook(() => useCanvasSelectionTransform(ports))
    expect(readLayerColorAt(document, layer, 10, 10)).toEqual(color)
    expect(hook.result.current.prepareSelectionTransformDrag(drag)).toBe(true)
    expect(drag.selectionSource).toBe(source)
    expect(drag.previewEdit).toBeNull()
    expect(readLayerColorAt(document, layer, 10, 10).a).toBe(0)
    expect(invalidateCompositeRect).toHaveBeenCalledWith(selection)
    expect(invalidateCompositeRect).toHaveBeenCalledWith(target)

    // Exercise both the outgoing geometry and the exact return to the start.
    for (const away of [true, false]) {
      drag.previewTarget = away
        ? { ...target, ...(kind === 'move-content' ? { x: 18 } : kind === 'transform-content' ? { width: 9 } : {}) }
        : target
      drag.previewAngle = away && kind === 'rotate-content' ? 37 : 0
      drag.previewPending = true
      hook.result.current.flushSelectionPreview(drag)
      expect(deferredSelectionPreviewOwner(drag, false)).toBe('active')
    }
    const input = createTransformCanvasInput({
      ...ports, t: (key: string) => key, symmetryStartPointForDrag: () => undefined
    } as unknown as Parameters<typeof createTransformCanvasInput>[0])
    input.endContentTransform({ drag, session, state })
    inputRef.current.drag = null
    expect(session.pendingPaste?.source).toBe(source)
    expect(session.pendingPaste?.previewDeferred).toBe(true)
    expect(session.pendingPaste?.previewEdit).toBeNull()
    expect(deferredSelectionPreviewOwner(null, Boolean(session.pendingPaste?.previewDeferred))).toBe('pending')
    expect(session.pendingPaste?.transformTarget).toEqual(target)
    state.commitFloatingPaste()
    for (let y = 10; y < 14; y++) for (let x = 10; x < 16; x++) {
      expect(readLayerColorAt(document, layer, x, y)).toEqual(color)
    }
    expect(readLayerColorAt(document, layer, 2, 2).a).toBe(0)
    state.undo()
    expect(readLayerColorAt(document, layer, 2, 2)).toEqual(color)
    expect(readLayerColorAt(document, layer, 10, 10).a).toBe(0)
    state.redo()
    expect(readLayerColorAt(document, layer, 10, 10)).toEqual(color)
    hook.unmount()
  }
)
