import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document'
import { ensureAnimationDocument } from '@/core/animation'
import { normalizeTextCelData } from '@/core/text-raster'
import { CanvasInputState } from '@/core/canvas-input-controller'
import type { CanvasDragState } from '@/core/canvas-input-contracts'
import { useWorkspace } from '@/store/workspace'
import * as textSurface from '@/store/workspace-text-surface'
import { CanvasCompositeCache } from './canvas-composite-cache'
import { createTextCanvasInput } from './canvas-input-text'
import { createSliceCanvasInput } from './canvas-input-slice'
import { nonContentPreviewDragKinds } from './canvas-stage-helpers'

let previous: ReturnType<typeof useWorkspace.getState>
beforeEach(() => { previous = useWorkspace.getState(); useWorkspace.setState({ sessions: [], activeId: null }) })
afterEach(() => { useWorkspace.setState(previous); vi.restoreAllMocks() })
const event = { clientX: 20, clientY: 30, nativeEvent: {} } as import('react').PointerEvent<HTMLCanvasElement>
function fixture() {
  const doc = createDocument('box drag', 4096, 4096, 'rgba', false)
  const layer = getActiveLayer(doc), timeline = ensureAnimationDocument(doc), cel = timeline.cels[0]
  layer.kind = 'text'; layer.width = 12; layer.height = 8; layer.offsetX = 1; layer.offsetY = 2
  layer.pixels = new Uint8ClampedArray(12 * 8 * 4); layer.pixels[3] = 255
  cel.surface = { format: 'rgba', width: 12, height: 8, offsetX: 1, offsetY: 2, pixels: layer.pixels }
  cel.text = normalizeTextCelData({ text: 'Box', originX: 1, originY: 2, boxWidth: 12, boxHeight: 8 })
  useWorkspace.getState().addSession(doc)
  useWorkspace.getState().beginSelectedTextBoxTransform()
  return { doc, layer, cel, session: useWorkspace.getState().sessions[0] }
}

it('translates text without rasterizing or replacing pixels; commit/undo/redo and cancel preserve geometry', () => {
  const { layer, cel, session } = fixture(), state = useWorkspace.getState()
  const rasterize = vi.spyOn(textSurface, 'renderTextAtCurrentSurface')
  const pixels = cel.surface!.pixels, history = session.history.position, revision = session.contentRevision
  const target = { x: 100, y: 120, width: 12, height: 8 }
  for (let x = 2; x <= 100; x++) state.previewTextBoxTransform({ ...target, x })
  expect(cel.surface!.pixels).toBe(pixels)
  expect(layer.pixels).toBe(pixels)
  expect(session.contentRevision).toBe(revision)
  expect(session.history.position).toBe(history)
  const uiRevision = session.uiRevision
  state.previewTextBoxTransform(target)
  expect(session.uiRevision).toBe(uiRevision)
  state.commitTextBoxTransform(target)
  expect(rasterize).not.toHaveBeenCalled()
  expect(session.history.position).toBe(history + 1)
  state.undo(); expect(layer.offsetX).toBe(1); expect(cel.text!.originY).toBe(2)
  state.redo(); expect(layer.offsetX).toBe(100); expect(cel.text!.originY).toBe(120)
  state.beginSelectedTextBoxTransform(); state.previewTextBoxTransform({ ...target, x: 200 }); state.cancelTextBoxTransform()
  expect(layer.offsetX).toBe(100)
})

it('reflows changed text dimensions once, skips duplicate samples and does not rasterize again on commit', () => {
  const { doc, session } = fixture(), state = useWorkspace.getState()
  const rasterize = vi.spyOn(textSurface, 'renderTextAtCurrentSurface').mockImplementation((_doc, raw, x, y) => ({
    data: normalizeTextCelData(raw), rgba: { format: 'rgba', width: raw.boxWidth!, height: raw.boxHeight!, offsetX: x, offsetY: y, pixels: new Uint8ClampedArray(raw.boxWidth! * raw.boxHeight! * 4) }
  }))
  const target = { x: 1, y: 2, width: 20, height: 10 }
  state.previewTextBoxTransform(target); state.previewTextBoxTransform(target); state.commitTextBoxTransform(target)
  expect(rasterize).toHaveBeenCalledTimes(1)
  expect(getActiveLayer(doc).width).toBe(20)
  state.undo(); expect(getActiveLayer(doc).width).toBe(12)
  state.redo(); expect(getActiveLayer(doc).width).toBe(20)
  expect(session.contentInvalidation?.kind).toBe('region')
})

it('invalidates just old/new text extents on a 4K canvas and publishes text content previews', () => {
  const { session } = fixture(), cache = new CanvasCompositeCache(), draw = vi.fn()
  const invalidate = vi.spyOn(cache, 'invalidateDocumentRect').mockImplementation(() => {})
  const full = vi.spyOn(cache, 'invalidateAll')
  const input = createTextCanvasInput({ inputRef: { current: new CanvasInputState() }, compositeCacheRef: { current: cache }, textToolBoxRef: { current: null },
    textLayerAt: () => null, displayedResizeCursorForHandle: () => '', scheduleDraw: draw,
    selectionTransformModifierState: () => ({ proportional: false, integerScale: false, fromCenter: false, copy: false }) })
  const drag: CanvasDragState = { kind: 'transform-text-box', start: { x: 1, y: 2 }, last: { x: 1, y: 2 }, moved: true,
    transformStartTarget: { x: 1, y: 2, width: 12, height: 8 }, previewTarget: { x: 1, y: 2, width: 12, height: 8 } }
  for (let n = 0; n < 100; n++) input.moveTextTransform({ drag, event, point: { x: 20, y: 30 }, session, state: useWorkspace.getState() })
  expect(invalidate).toHaveBeenCalledTimes(2)
  expect(invalidate.mock.calls.map(call => call[0])).toEqual([{ x: 1, y: 2, width: 12, height: 8 }, { x: 20, y: 30, width: 12, height: 8 }])
  expect(full).not.toHaveBeenCalled(); expect(draw).toHaveBeenCalledOnce()
  expect(nonContentPreviewDragKinds.has('transform-text-box')).toBe(false)
})

it('slice movement stays metadata-only, skips duplicate/clamped samples and remains undoable', () => {
  const doc = createDocument('slices', 64, 64, 'rgba', false)
  useWorkspace.getState().addSession(doc)
  const state = useWorkspace.getState(), id = state.createSlice({ x: 0, y: 0, width: 12, height: 8 })!
  const session = useWorkspace.getState().sessions[0], revision = session.contentRevision, pixels = doc.layers[0].pixels
  const draw = vi.fn(), input = createSliceCanvasInput({ sliceTool: true, inputRef: { current: new CanvasInputState() }, sliceHandleAt: () => null,
    displayedResizeCursorForHandle: () => '', scheduleDraw: draw, selectionCrosshair: false })
  const rect = { x: 0, y: 0, width: 12, height: 8 }
  const drag: CanvasDragState = { kind: 'move-slice', start: { x: 0, y: 0 }, last: { x: 0, y: 0 }, moved: true,
    sliceId: id, sliceIds: [id], sliceStarts: { [id]: rect }, sliceStart: rect, slicePreviewTargets: { [id]: rect }, previewTarget: rect }
  for (let i = 0; i < 100; i++) input.moveSlice({ drag, event, point: { x: 100 + i, y: 100 + i }, session })
  expect(draw).toHaveBeenCalledOnce()
  expect(doc.slices![0].x).toBe(0)
  input.endSliceMove({ drag, event, state })
  expect(doc.slices![0].x).toBe(52)
  state.undo(); expect(doc.slices![0].x).toBe(0)
  state.redo(); expect(doc.slices![0].x).toBe(52)
  expect(session.contentRevision).toBe(revision); expect(doc.layers[0].pixels).toBe(pixels)
})
