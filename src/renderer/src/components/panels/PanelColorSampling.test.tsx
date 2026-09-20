import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { CanvasCompositeCache } from '@/components/canvas-composite-cache'
import { createDocument, getActiveLayer, writeLayerColor } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { ReferenceImagePanel } from './ReferenceImagePanel'
import { PreviewPanel } from './PreviewPanel'
import { useReferenceImages } from './reference-image-state'

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
    setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), getImageData: read
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
