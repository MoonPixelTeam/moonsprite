import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, writeLayerColor, readLayerColorAt } from '@/core/document'
import { loadToolSettings } from '@/core/tool-preferences'
import { DEFAULT_SHORTCUTS } from '@/core/shortcuts'
import { TOOL_DEFINITIONS, normalEditorToolIconFor } from '@/components/app/editor-tools'
import normalIcon from '@/assets/tool-icons/tool-magic-eraser-normal.svg'
import { createFillCanvasInput } from '@/components/canvas-input-fill'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { revertCancelledCanvasDragPixelChanges, type CanvasDragState } from '@/core/canvas-input'
import { cancelsActiveCanvasDrawWhileRightHeld, cancelsActiveCanvasDrawWithRightClick } from '@/components/useCanvasDeviceRouter'
import { beginCanvasToolGesture, clearCanvasToolGestures, endCanvasToolGesture, isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import { useWorkspace } from './workspace'
import { eraseWorkspaceMatchingColor, setMagicEraserContiguous } from './workspace-magic-eraser'

beforeEach(() => { clearCanvasToolGestures(); vi.useFakeTimers(); localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }) })
afterEach(() => { clearCanvasToolGestures(); vi.runOnlyPendingTimers(); vi.useRealTimers(); useWorkspace.setState({ sessions: [], activeId: null }) })
const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 0, b: 255, a: 255 }
function setup() {
  const document = createDocument('magic eraser', 3, 1, 'rgba', false)
  const layer = document.layers[0]
  ;[red, blue, red].forEach((color, index) => writeLayerColor(document, layer, index, color))
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setTool('magic-eraser')
  return { document, layer, session: useWorkspace.getState().sessions[0], pixel: (x: number) => readLayerColorAt(document, layer, x, 0) }
}
it('clears disconnected matching colors in one undoable operation', () => {
  const { pixel, session } = setup()
  expect(session.magicEraserContiguous).toBe(false)
  eraseWorkspaceMatchingColor({ x: 0, y: 0 })
  expect([pixel(0).a, pixel(1).a, pixel(2).a]).toEqual([0, 255, 0])
  expect(session.selection).toBeNull()
  useWorkspace.getState().undo()
  expect([pixel(0), pixel(2)]).toEqual([red, red])
  useWorkspace.getState().redo()
  expect(pixel(2).a).toBe(0)
})
it('erases on pointerdown while its own canvas gesture lock is held', () => {
  const { pixel } = setup()
  beginCanvasToolGesture(7)
  eraseWorkspaceMatchingColor({ x: 0, y: 0 })
  expect([pixel(0).a, pixel(1).a, pixel(2).a]).toEqual([0, 255, 0])
  expect(isCanvasToolGestureLocked()).toBe(true)
  endCanvasToolGesture(7)
  useWorkspace.getState().undo()
  expect([pixel(0), pixel(2)]).toEqual([red, red])
})
it('keeps the existing selection and does not erase outside it', () => {
  const { pixel, session } = setup()
  useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
  eraseWorkspaceMatchingColor({ x: 2, y: 0 })
  expect(pixel(2)).toEqual(red)
  eraseWorkspaceMatchingColor({ x: 0, y: 0 })
  expect(pixel(0).a).toBe(0)
  expect(pixel(2)).toEqual(red)
  expect(session.selection).toMatchObject({ x: 0, width: 1 })
})
it('cancels only the pending erase when the right button joins the held left button', () => {
  const { document, pixel, session } = setup()
  const beforeHistory = session.history.canUndo
  const previewEdit = eraseWorkspaceMatchingColor({ x: 0, y: 0 }, true)!
  const drag: CanvasDragState = { kind: 'magic-eraser', start: { x: 0, y: 0 }, last: { x: 0, y: 0 }, previewEdit }
  expect(pixel(0).a).toBe(0)
  expect(session.history.canUndo).toBe(beforeHistory)
  expect(cancelsActiveCanvasDrawWithRightClick({ button: 2, buttons: 3 }, drag)).toBe(true)
  expect(cancelsActiveCanvasDrawWhileRightHeld({ buttons: 3 }, drag)).toBe(true)
  expect(cancelsActiveCanvasDrawWhileRightHeld({ buttons: 1 }, drag)).toBe(false)
  expect(revertCancelledCanvasDragPixelChanges(document, drag)).toBe(true)
  expect([pixel(0), pixel(2)]).toEqual([red, red])
  expect(session.history.canUndo).toBe(beforeHistory)
})
it('commits a released erase once and supports ordinary undo afterwards', () => {
  const { pixel } = setup()
  const edit = eraseWorkspaceMatchingColor({ x: 0, y: 0 }, true)!
  useWorkspace.getState().commitPixelEdit(edit, '魔术橡皮擦')
  expect(pixel(2).a).toBe(0)
  useWorkspace.getState().undo()
  expect([pixel(0), pixel(2)]).toEqual([red, red])
})
it('refreshes the erased region on press before release and remains cancellable', () => {
  const { document, pixel } = setup()
  const inputRef = { current: new CanvasInputState() }
  const invalidateCompositeRect = vi.fn()
  const draw = vi.fn(() => {
    expect(invalidateCompositeRect).toHaveBeenCalledOnce()
    expect([pixel(0).a, pixel(2).a]).toEqual([0, 0])
  })
  const input = createFillCanvasInput({ inputRef, draw, invalidateCompositeRect } as unknown as Parameters<typeof createFillCanvasInput>[0])
  input.beginMagicEraser({ x: 0, y: 0 })
  const drag = inputRef.current.drag!
  expect(invalidateCompositeRect).toHaveBeenCalledWith(drag.previewEdit!.dirtyRect, [drag.previewEdit!.layerId])
  expect(draw).toHaveBeenCalledOnce()
  expect(revertCancelledCanvasDragPixelChanges(document, drag)).toBe(true)
  expect([pixel(0), pixel(2)]).toEqual([red, red])
})
it('supports contiguous mode, persists it, and keeps wand settings independent', () => {
  const { pixel, session } = setup()
  setMagicEraserContiguous(true)
  vi.advanceTimersByTime(100)
  expect(loadToolSettings().magicEraserContiguous).toBe(true)
  eraseWorkspaceMatchingColor({ x: 0, y: 0 })
  expect(pixel(0).a).toBe(0)
  expect(pixel(2)).toEqual(red)
  expect(session.wandContiguous).toBe(true)
})
it('honors tolerance and locked layers', () => {
  const { document, layer, pixel } = setup()
  writeLayerColor(document, layer, 2, { ...red, r: 250 })
  useWorkspace.getState().setWandTolerance(5)
  layer.locked = true
  eraseWorkspaceMatchingColor({ x: 0, y: 0 })
  expect(pixel(0)).toEqual(red)
  layer.locked = false
  eraseWorkspaceMatchingColor({ x: 0, y: 0 })
  expect(pixel(2).a).toBe(0)
})
it('samples visible layers but erases only the active layer', () => {
  const { document, pixel } = setup()
  const upper = createLayer('upper', 3, 1, 'rgba')
  document.layers.push(upper)
  writeLayerColor(document, upper, 2, blue)
  useWorkspace.getState().setFillReference('visible-layers')
  eraseWorkspaceMatchingColor({ x: 0, y: 0 })
  expect(pixel(0).a).toBe(0)
  expect(pixel(2)).toEqual(red)
  expect(readLayerColorAt(document, upper, 2, 0)).toEqual(blue)
})
it('registers Shift+E and both component-library icon sizes', () => {
  expect(DEFAULT_SHORTCUTS['tool.magicEraser']).toBe('Shift+E')
  const tool = TOOL_DEFINITIONS.find(item => item.id === 'magic-eraser')!
  expect(tool.shortcutId).toBe('tool.magicEraser')
  expect(normalEditorToolIconFor(tool.icon)).toBe(normalIcon)
})
