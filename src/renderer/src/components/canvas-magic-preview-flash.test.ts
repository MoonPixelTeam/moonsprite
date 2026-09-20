import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument, getActiveLayer } from '@/core/document-model'
import type { MagicWandWorkerResult } from '@/core/magic-wand-worker'
import { rectSelection } from '@/core/selection'
import { useWorkspace } from '@/store/workspace'
import { sessionFromDocument } from '@/store/workspace-session'
import { CanvasMagicPreviewFlash } from './canvas-magic-preview-flash'
import { createSelectionBeginCanvasInput } from './canvas-input-selection-begin'
import { renderCanvasSelectionPreview } from './canvas-render-selection-preview'

const dispose: (() => void)[] = []
beforeEach(() => {
  vi.useFakeTimers()
  useWorkspace.setState({ sessions: [], activeId: null })
})
afterEach(() => {
  dispose.splice(0).forEach(fn => fn())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function fixture() {
  const session = sessionFromDocument(createDocument('magic click', 16, 16, 'rgba'))
  session.tool = 'selection'
  session.selectionKind = 'magic'
  session.fillReference = 'current-layer'
  useWorkspace.setState({ sessions: [session], activeId: session.document.id })
  const input = new CanvasInputState()
  const scheduleDraw = vi.fn()
  const flash = new CanvasMagicPreviewFlash(scheduleDraw)
  dispose.push(useWorkspace.subscribe(() => flash.validate()), () => flash.clear(false))
  const close = vi.fn()
  const result: MagicWandWorkerResult = {
    selection: rectSelection(2, 3, 4, 5), boundarySegments: null, previewRectangles: null,
    previewBitmap: { close } as unknown as ImageBitmap, computeMs: 0, boundaryMs: 0
  }
  let reply!: (result: MagicWandWorkerResult) => void
  const pending = new Promise<MagicWandWorkerResult>(resolve => { reply = resolve })
  const ports = {
    selectedFreeTileSelectionTarget: () => null, selectionHit: () => 'outside',
    liveViewRef: { current: session.view }, inputRef: { current: input },
    quickSelectionHandledAtRef: { current: null }, quickSelectionPressRef: { current: null },
    modifierActive: () => false, symmetryCenter: { x: 8, y: 8 },
    magicGestureRef: { current: null }, magicPreviewFlash: flash,
    magicWandWorkerRef: { current: { request: () => pending, dispose: vi.fn() } },
    selectionPreviewColorMode: 'custom', selectionPreviewColor: { r: 255, g: 255, b: 255, a: 255 },
    t: () => 'magic selection', drawSelectionOverlay: vi.fn(), scheduleDraw
  } as unknown as Parameters<typeof createSelectionBeginCanvasInput>[0]
  createSelectionBeginCanvasInput(ports).beginSelection({
    selectionTool: true, session, state: useWorkspace.getState(),
    event: { button: 0, nativeEvent: {}, currentTarget: { style: {} } } as unknown as React.PointerEvent<HTMLCanvasElement>,
    selectionMode: () => 'replace', eyedropperHeld: false, point: { x: 3, y: 4 },
    sampleAtPoint: vi.fn(), editableLayer: getActiveLayer(session.document)
  })
  dispose.push(() => ports.magicGestureRef.current?.cancel(false))
  const drag = input.drag!
  const context = { save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() }
  const paint = () => renderCanvasSelectionPreview({
    inputRef: { current: input }, magicPreviewFlash: flash, context,
    session, document: session.document, view: { zoom: 2 }, previewOriginX: 10, previewOriginY: 20,
    sampleCompositeForPreview: () => ({ r: 0, g: 0, b: 0, a: 255 }),
    customSelectionPreviewColor: '#fff', selectionPreviewColorMode: 'custom', clipBaseCanvas: vi.fn()
  } as unknown as Parameters<typeof renderCanvasSelectionPreview>[0])
  return {
    flash, close, context, paint, scheduleDraw,
    reply: async () => { reply(result); await pending; await Promise.resolve() },
    release: () => { input.finish(); drag.magicRelease?.() }
  }
}

it('flashes on press, expires while held, and does not flash again on release', async () => {
  const f = fixture()
  await f.reply()
  f.paint()
  expect(f.context.drawImage).toHaveBeenCalledOnce()
  expect(useWorkspace.getState().sessions[0].selection).toBeNull()
  vi.advanceTimersByTime(140)
  expect(f.flash.current).toBeNull()
  expect(f.close).toHaveBeenCalledOnce()
  f.release()
  expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 2, y: 3, width: 4, height: 5 })
  expect(f.flash.current).toBeNull()
  expect(f.close).toHaveBeenCalledOnce()
})

it.each(['before-result', 'before-paint'] as const)('keeps a quick click visible when released %s', async mode => {
  const f = fixture()
  if (mode === 'before-result') f.release()
  await f.reply()
  if (mode === 'before-paint') f.release()
  vi.advanceTimersByTime(1000)
  expect(f.close).not.toHaveBeenCalled()
  f.paint()
  expect(f.context.drawImage).toHaveBeenCalledOnce()
  expect(useWorkspace.getState().sessions[0].selection).not.toBeNull()
  vi.advanceTimersByTime(100)
  f.paint()
  vi.advanceTimersByTime(40)
  expect(f.flash.current).toBeNull()
  expect(f.close).toHaveBeenCalledOnce()
})

it('clears a completed flash on tool change without stale pixels or duplicate bitmap disposal', async () => {
  const f = fixture()
  f.release()
  await f.reply()
  f.paint()
  useWorkspace.setState(state => ({ sessions: state.sessions.map(session => ({ ...session, tool: 'pencil' as const })) }))
  expect(f.flash.current).toBeNull()
  vi.advanceTimersByTime(1000)
  expect(f.close).toHaveBeenCalledOnce()
})
