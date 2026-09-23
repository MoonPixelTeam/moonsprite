import { renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document-model'
import { captureSelectionTransform } from '@/core/tools-selection-transform'
import { CanvasInputState, type CanvasDragState } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
import { useCanvasSelectionTransform } from './useCanvasSelectionTransform'

beforeEach(() => { localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }) })

it.each([0, -2])('preserves the moved paste frame after deselect and undo (x=%s)', x => {
  const document = createDocument('paste move deselect undo', 8, 8, 'rgba', false)
  const layer = getActiveLayer(document)
  const origin = { x: 2, y: 2, width: 4, height: 2 }
  const source = captureSelectionTransform(document, origin, layer)!
  source.origin = 'clipboard'
  source.values.fill(0xff0000ff)
  source.opaqueOffsets = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7])
  const state = useWorkspace.getState()
  state.addSession(document)
  state.beginFloatingSelectionTransform(source, null, origin, origin, true, 'paste', null, origin, 0, undefined, true)
  state.moveActiveSelectionWithSelectionHistory(x - origin.x, 0, true)
  state.commitFloatingPaste('deselect')
  state.undo()
  const session = useWorkspace.getState().sessions[0]
  expect(session.pendingPaste?.restoredFromDeselect).toBe(true)
  expect(session.selection).toMatchObject({ ...origin, x })
  const drag: CanvasDragState = {
    kind: 'move-content', start: { x: 1, y: 2 }, last: { x: 1, y: 2 },
    selectionStart: session.selection!, selectionPreparationPending: true,
    selectionSource: session.pendingPaste!.source,
    previewTarget: { ...session.selection! }, transformStartTarget: { ...session.selection! },
    deferredSelectionPreview: false, copy: true, floatingPaste: true
  }
  const ports = {
    session, multipleAnimationSelection: false, inputRef: { current: new CanvasInputState() },
    invalidateCompositeRect: vi.fn(), draw: vi.fn(), scheduleDraw: vi.fn(), drawSelectionOverlay: vi.fn()
  } as unknown as Parameters<typeof useCanvasSelectionTransform>[0]
  const hook = renderHook(() => useCanvasSelectionTransform(ports))
  expect(hook.result.current.prepareSelectionTransformDrag(drag)).toBe(true)
  expect(drag.selectionSource!.selection).toMatchObject(origin)
  expect(Array.from(drag.selectionSource!.values)).toEqual(Array(8).fill(0xff0000ff))
  expect(drag.selectionSource!.selection.width).toBe(drag.previewTarget!.width)
  hook.unmount()
  state.redo()
  expect(session.selection).toBeNull()
  expect(session.pendingPaste).toBeNull()
  state.undo()
  expect(session.pendingPaste?.source.values).toEqual(source.values)
  state.moveActiveSelectionWithSelectionHistory(2 - x, 0, true)
  state.commitFloatingPaste('deselect')
  const restored = captureSelectionTransform(document, origin, layer)!
  expect(Array.from(restored.values)).toEqual(Array(8).fill(0xff0000ff))
})
