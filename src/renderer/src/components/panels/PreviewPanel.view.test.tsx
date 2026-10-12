import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { createDocument } from '@/core/document'
import { PREVIEW_ZOOM_SHORTCUT_EVENT } from '@/core/preview-zoom-shortcuts'
import { useWorkspace } from '@/store/workspace'
import { PreviewPanel } from './PreviewPanel'
import { PreviewRasterCache } from './preview-raster-cache'
import type { PreviewPanelViewRef } from './usePreviewPanelView'

let previous: ReturnType<typeof useWorkspace.getState>
let size = 201
beforeEach(() => {
  previous = useWorkspace.getState()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('preview view', 2, 2, 'rgba', false))
  vi.useFakeTimers()
  size = 201
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 4 })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('devicePixelRatio', 1)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 201, 201))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    fillRect: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(),
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: vi.fn()
  } as unknown as CanvasRenderingContext2D)
})
afterEach(() => {
  cleanup()
  useWorkspace.setState(previous)
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})
const flush = () => {
  act(() => vi.advanceTimersByTime(32))
  act(() => vi.advanceTimersByTime(17))
}

it.each(['initial-fit', 'zoom-and-pan', 'follow-viewport'])('retains %s across dock and floating remounts with different sizes', mode => {
  const configure = vi.spyOn(PreviewRasterCache.prototype, 'configure')
  const session = useWorkspace.getState().sessions[0]
  const retainedView: PreviewPanelViewRef = { current: null }
  const panel = (key: string, docked = true) => <PreviewPanel key={key} session={session} retainedView={retainedView} docked={docked} onClose={() => {}} />
  const view = render(panel('right'), { wrapper: I18nProvider })
  flush()
  const canvas = view.container.querySelector('canvas')!
  if (mode === 'zoom-and-pan') {
    act(() => canvas.dispatchEvent(new CustomEvent(PREVIEW_ZOOM_SHORTCUT_EVENT, {
      bubbles: true, detail: { zoom: 40, pointer: { x: 80, y: 90 } }
    })))
    const wrap = view.container.querySelector<HTMLElement>('.preview-canvas-wrap')!
    wrap.setPointerCapture = vi.fn()
    wrap.hasPointerCapture = () => true
    wrap.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(wrap, { button: 1, clientX: 80, clientY: 90 })
    fireEvent.pointerMove(wrap, { clientX: 103, clientY: 121 })
    flush()
    fireEvent.pointerUp(wrap)
    flush()
    expect(retainedView.current!.zoom).toBe(40)
    expect(retainedView.current!.pan).not.toEqual({ x: 0, y: 0 })
  } else if (mode === 'follow-viewport') {
    const more = view.container.querySelector<HTMLButtonElement>('.panel-actions button[aria-haspopup="dialog"]')
    if (more) fireEvent.click(more)
    fireEvent.click(view.getByRole('button', { name: '跟随画布视窗' }))
    flush()
    expect(retainedView.current!.followViewport).toBe(true)
  }
  const placement = configure.mock.lastCall![3]
  const snapshot = retainedView.current
  for (const [key, nextSize, docked] of [['left', 400, true], ['bottom', 180, true], ['floating', 300, false], ['right', 250, true]] as const) {
    size = nextSize
    view.rerender(panel(key, docked))
    flush()
    expect(view.container.querySelector('canvas')).not.toBe(canvas)
    expect(configure.mock.lastCall![3]).toMatchObject({ originX: placement.originX, originY: placement.originY, scale: placement.scale })
    expect(retainedView.current).toEqual(snapshot)
  }
})

it('fits a different document instead of carrying over the previous preview view', () => {
  const retainedView: PreviewPanelViewRef = { current: null }
  const session = useWorkspace.getState().sessions[0]
  const view = render(<PreviewPanel session={session} retainedView={retainedView} docked onClose={() => {}} />, { wrapper: I18nProvider })
  flush()
  const canvas = view.container.querySelector('canvas')!
  act(() => canvas.dispatchEvent(new CustomEvent(PREVIEW_ZOOM_SHORTCUT_EVENT, { bubbles: true, detail: { zoom: 40 } })))
  expect(retainedView.current!.zoom).toBe(40)
  useWorkspace.getState().addSession(createDocument('other preview', 4, 4, 'rgba', false))
  size = 300
  view.rerender(<PreviewPanel session={useWorkspace.getState().sessions[1]} retainedView={retainedView} docked onClose={() => {}} />)
  flush()
  expect(retainedView.current).toMatchObject({ zoom: null, pan: { x: 0, y: 0 }, initialPreviewViewport: { width: 300, height: 300 } })
})
