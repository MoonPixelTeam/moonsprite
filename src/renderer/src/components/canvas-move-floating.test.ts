import { beforeEach, expect, it, vi } from 'vitest'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document'
import { captureSelectionTransform, applySelectionTranslationPreview, restoreSelectionTranslationPreview } from '@/core/tools-selection-transform'
import { CanvasInputState } from '@/core/canvas-input-controller'
import type { CanvasDragState } from '@/core/canvas-input-contracts'
import { useWorkspace } from '@/store/workspace'
import { createTransformCanvasInput } from './canvas-input-transform'
import { createLayerMoveCanvasInput } from './canvas-input-layer-move'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

const red = { r: 255, g: 0, b: 0, a: 255 }

it('hands a resumed materialized selection back to the overlay after dragging away and back', () => {
  const document = createDocument('round trip floating drag', 16, 16, 'rgba')
  const layer = document.layers[0]
  writeLayerColor(document, layer, 2 * 16 + 2, red)
  const state = useWorkspace.getState()
  state.addSession(document)
  const before = { x: 2, y: 2, width: 2, height: 2 }
  const target = { ...before, x: 6 }
  state.setSelection(before)
  const source = captureSelectionTransform(document, before, layer)!
  const preview = applySelectionTranslationPreview(document, source, target, false, null, layer)
  state.beginFloatingSelectionTransform(source, null, before, target, false, 'move', preview, target)
  const session = useWorkspace.getState().sessions[0]
  // Resuming with the compositor first restores materialized pixels. Returning
  // the pointer to its start is still an ownership change at pointer-up.
  restoreSelectionTranslationPreview(document, preview)
  const drag: CanvasDragState = {
    kind: 'move-content', start: { x: 6, y: 2 }, last: { x: 6, y: 2 },
    selectionStart: target, previewSelection: target, selectionSource: source,
    transformStartTarget: target, previewTarget: target, floatingPaste: true,
    selectionPreparationPending: false, deferredSelectionPreview: true,
    deferredSelectionWasMaterialized: true, previewEdit: null, translationPreview: null
  }
  const input = createTransformCanvasInput({ t: (key: string) => key, invalidateCompositeRect: vi.fn() } as unknown as Parameters<typeof createTransformCanvasInput>[0])
  input.endContentTransform({ drag, session, state })
  expect(session.pendingPaste?.previewDeferred).toBe(true)
  expect(session.pendingPaste?.translationPreview).toBeNull()
  state.commitFloatingPaste()
  expect(readLayerColorAt(document, layer, 2, 2).a).toBe(0)
  expect(readLayerColorAt(document, layer, 6, 2)).toEqual(red)
  state.undo()
  expect(readLayerColorAt(document, layer, 2, 2)).toEqual(red)
  state.redo()
  expect(readLayerColorAt(document, layer, 6, 2)).toEqual(red)
})

it('confirms floating content before temporary layer movement captures its offsets', () => {
  const document = createDocument('floating to temporary move', 320, 320, 'rgba')
  const layer = document.layers[0]
  writeLayerColor(document, layer, 10 * 320 + 10, red)
  const state = useWorkspace.getState()
  state.addSession(document)
  state.setSelection({ x: 0, y: 0, width: 320, height: 320 })
  state.moveActiveSelectionWithSelectionHistory(4, 0, true)
  const session = useWorkspace.getState().sessions[0]
  expect(session.pendingPaste?.previewDeferred).toBe(true)
  session.moveAutoSelect = false
  const inputRef = { current: new CanvasInputState() }
  const input = createLayerMoveCanvasInput({
    inputRef, topEditableLayerAt: () => layer, showMoveLayerContentPreview: vi.fn(),
    flashMoveLayer: vi.fn(), hideMoveLayerContentPreview: vi.fn(), alignmentDragFields: () => ({})
  } as unknown as Parameters<typeof createLayerMoveCanvasInput>[0])
  input.beginLayerMove({
    freeTransformActive: false, session, temporaryMove: true, textCopyTarget: null,
    event: { button: 0, shiftKey: false, currentTarget: { style: {} } } as React.PointerEvent<HTMLCanvasElement>,
    point: { x: 14, y: 10 }, state, canMoveActiveLayer: true, movableActiveLayer: layer,
    eyedropperHeld: false, sampleAtPoint: vi.fn(), copyLayerHeld: false
  })
  expect(session.pendingPaste).toBeNull()
  const drag = inputRef.current.drag!
  expect(drag.layerOffset).toEqual({ x: 4, y: 0 })
  state.previewLayerMove(document.id, drag, 3, 0)
  state.commitLayerMove(document.id, drag)
  expect(readLayerColorAt(document, layer, 17, 10)).toEqual(red)
  state.undo()
  expect(readLayerColorAt(document, layer, 14, 10)).toEqual(red)
  state.undo()
  expect(readLayerColorAt(document, layer, 10, 10)).toEqual(red)
})
