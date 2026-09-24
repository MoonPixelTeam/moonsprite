import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { CanvasCompositeCache } from '@/components/canvas-composite-cache'
import { createDocument, getActiveLayer, writeLayerColor } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { ReferenceImagePanel } from './ReferenceImagePanel'
import { PreviewPanel } from './PreviewPanel'
import { useReferenceImages } from './reference-image-state'
import { notifyCanvasPreview } from '@/core/canvas-preview-lifecycle'
import { captureSelectionTransform } from '@/core/tools-selection-transform-source'
import { canvasCompositeCacheFor } from '@/components/canvas-composite-registry'

let previous: ReturnType<typeof useWorkspace.getState>
const color = { r: 35, g: 70, b: 105, a: 128 }
const read = vi.fn(() => ({ data: new Uint8ClampedArray([color.r, color.g, color.b, color.a]) }))
beforeEach(() => {
  previous = useWorkspace.getState()
  useWorkspace.setState({ sessions: [], activeId: null })
  useReferenceImages.setState({ images: [], activeId: null, windows: [], relativeLuminance: false })
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 4 })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('devicePixelRatio', 1)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    scale: vi.fn(), translate: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    fillRect: vi.fn(), clearRect: vi.fn(), createPattern: () => null, drawImage: vi.fn(),
    setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), getImageData: read,
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: vi.fn()
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(CanvasCompositeCache.prototype, 'draw').mockImplementation(() => {})
  read.mockClear()
  const document = createDocument('sampling', 2, 2, 'rgba', false)
  writeLayerColor(document, getActiveLayer(document), 3, color)
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setTool('pencil')
})
afterEach(() => {
  cleanup(); useWorkspace.setState(previous)
  useReferenceImages.setState({ images: [], activeId: null, windows: [] })
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

const clickSample = (panel: HTMLElement, altKey: boolean) => {
  panel.setPointerCapture = vi.fn()
  panel.hasPointerCapture = () => true
  panel.releasePointerCapture = vi.fn()
  fireEvent.pointerDown(panel, { button: 0, clientX: 150, clientY: 150, altKey })
  fireEvent.pointerUp(panel)
}

it('keeps preview artwork at its initial scale when the panel is resized', () => {
  vi.useFakeTimers()
  try {
    const observers: Array<() => void> = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { observers.push(callback) }
      observe() {} disconnect() {}
    })
    let size = 200
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, size, size))
    const session = useWorkspace.getState().sessions[0]
    const view = render(<PreviewPanel session={session} docked onClose={() => {}} />, { wrapper: I18nProvider })
    act(() => vi.advanceTimersByTime(32))
    const context = view.container.querySelector('canvas')!.getContext('2d')!
    const initial = vi.mocked(context.rect).mock.lastCall!
    expect(initial[2]).toBeGreaterThan(0)
    vi.mocked(context.rect).mockClear()
    size = 400
    act(() => { observers.forEach(callback => callback()); vi.advanceTimersByTime(32) })
    const resized = vi.mocked(context.rect).mock.lastCall!
    expect(resized.slice(2)).toEqual(initial.slice(2))
    expect(resized[0] - initial[0]).toBe(100)
    expect(resized[1] - initial[1]).toBe(100)
  } finally { vi.useRealTimers() }
})

it('opens preview playback settings above its floating ancestor', () => {
  const session = useWorkspace.getState().sessions[0]
  const view = render(<div style={{ position: 'fixed', zIndex: 1500 }}><PreviewPanel session={session} docked onClose={() => {}} /></div>, { wrapper: I18nProvider })
  const button = view.container.querySelector<HTMLButtonElement>('button[aria-label="播放动画"]')!
  fireEvent.contextMenu(button, { clientX: 100, clientY: 100 })
  const menu = document.querySelector<HTMLElement>('.animation-context-menu')!
  expect(menu.parentElement).toBe(document.body)
  expect(Number(menu.style.zIndex)).toBeGreaterThan(1500)
})

it.each(['alt', 'eyedropper'])('samples the reference source with %s without moving the reference', mode => {
  const source = document.createElement('canvas')
  source.width = source.height = 2
  useReferenceImages.getState().add(source)
  if (mode === 'eyedropper') useWorkspace.getState().setTool('eyedropper')
  const view = render(<ReferenceImagePanel docked onClose={() => {}} />, { wrapper: I18nProvider })
  clickSample(view.container.querySelector('.preview-canvas-wrap')!, mode === 'alt')
  expect(read).toHaveBeenCalledWith(1, 1, 1, 1)
  expect(useWorkspace.getState().sessions[0].primaryColor).toEqual(color)
  expect(useReferenceImages.getState().images[0].pan).toEqual({ x: 0, y: 0 })
  expect(view.container.querySelector('.space-panning')).toBeNull()
})

it('Alt-samples preview document pixels including alpha without sampling its checkerboard', () => {
  const session = useWorkspace.getState().sessions[0]
  const revision = session.contentRevision
  const view = render(<PreviewPanel session={session} docked onClose={() => {}} />, { wrapper: I18nProvider })
  clickSample(view.container.querySelector('.preview-canvas-wrap')!, true)
  expect(useWorkspace.getState().sessions[0].primaryColor).toEqual(color)
  expect(read).not.toHaveBeenCalled()
  expect(session.tool).toBe('pencil')
  expect(session.contentRevision).toBe(revision)
  expect(view.container.querySelector('.space-panning')).toBeNull()
})

it('retains the committed base after a deferred transform ends but clears mutated live previews', () => {
  const session = useWorkspace.getState().sessions[0]
  render(<PreviewPanel session={session} docked onClose={() => {}} />, { wrapper: I18nProvider })
  const invalidate = vi.spyOn(CanvasCompositeCache.prototype, 'invalidateAll')
  const source = captureSelectionTransform(session.document, { x: 0, y: 0, width: 2, height: 2 })!
  const snapshot = { document: session.document, frameId: session.document.animation!.activeFrameId, revision: session.revision, contentRevision: session.contentRevision }
  notifyCanvasPreview(session.document.id, { ...snapshot, selectionPreview: { layerId: session.document.activeLayerId, source, target: source.selection, angle: 23, copy: false } })
  notifyCanvasPreview(session.document.id, null)
  expect(invalidate).not.toHaveBeenCalled()
  notifyCanvasPreview(session.document.id, snapshot)
  notifyCanvasPreview(session.document.id, null)
  expect(invalidate).toHaveBeenCalledOnce()
})

it.each(['raster', 'layer-move'])('updates %s through small raster surfaces without full-resolution composition', kind => {
  vi.useFakeTimers()
  try {
    const session = useWorkspace.getState().sessions[0]
    render(<PreviewPanel session={session} docked onClose={() => {}} />, { wrapper: I18nProvider })
    vi.advanceTimersByTime(32)
    const context = HTMLCanvasElement.prototype.getContext.call(document.createElement('canvas'), '2d') as CanvasRenderingContext2D
    vi.mocked(context.drawImage).mockClear()
    vi.mocked(CanvasCompositeCache.prototype.draw).mockClear()
    const snapshot = { document: session.document, frameId: session.document.animation!.activeFrameId,
      revision: session.revision, contentRevision: session.contentRevision,
      liveRasterEdit: kind === 'raster', movingLayerIds: kind === 'layer-move' ? [session.document.activeLayerId] : undefined }
    for (let i = 0; i < 120; i++) {
      notifyCanvasPreview(session.document.id, { ...snapshot, invalidation: { kind: 'region', rect: { x: 0, y: 0, width: 1, height: 1 } } })
      vi.advanceTimersByTime(8)
    }
    expect(context.drawImage).toHaveBeenCalled()
    expect(CanvasCompositeCache.prototype.draw).not.toHaveBeenCalled()
    vi.mocked(context.drawImage).mockClear()
    notifyCanvasPreview(session.document.id, null)
    vi.advanceTimersByTime(17)
    expect(context.drawImage).toHaveBeenCalled()
    expect(CanvasCompositeCache.prototype.draw).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})

it('waits for the main 4K composite on mount and presents its complete shared image in one frame', () => {
  vi.useFakeTimers()
  try {
    const doc = createDocument('large preview mount', 4096, 4096, 'rgba', false)
    useWorkspace.getState().addSession(doc)
    const session = useWorkspace.getState().sessions.find(item => item.document === doc)!
    const mainCache = canvasCompositeCacheFor(doc)
    const shared = document.createElement('canvas')
    const source = vi.spyOn(mainCache, 'previewSource').mockReturnValue({ source: shared as unknown as OffscreenCanvas, dirtyRects: [] })
    const context = shared.getContext('2d')!
    vi.mocked(context.putImageData).mockClear()
    render(<PreviewPanel session={session} docked onClose={() => {}} />, { wrapper: I18nProvider })
    expect(source).not.toHaveBeenCalled()
    vi.advanceTimersByTime(17)
    expect(source).toHaveBeenCalled()
    expect(context.drawImage).toHaveBeenCalledWith(shared, 0, 0, 200, 200)
    expect(context.putImageData).not.toHaveBeenCalled()
    vi.mocked(context.drawImage).mockClear()
    vi.advanceTimersByTime(200)
    expect(context.drawImage).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})
