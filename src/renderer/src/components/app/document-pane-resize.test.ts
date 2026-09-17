import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { beginDocumentPaneResize } from './document-pane-resize'
import { canvasStageIsVisible } from '../canvas-stage-visibility'
import { endWorkspaceResize, isWorkspaceResizing } from '../workspace-resize'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  endWorkspaceResize()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.replaceChildren()
})

it.each([0.75, 1, 1.5, 2].flatMap(scale => ['horizontal', 'vertical'].map(orientation => ({ scale, orientation: orientation as 'horizontal' | 'vertical' }))))(
  'retains nested canvas pixels and coalesces $orientation resizing at interface scale $scale', ({ scale, orientation }) => {
    const container = document.createElement('div')
    container.innerHTML = '<div class="document-pane-resizer"></div><div class="document-pane-split"><div class="document-pane-canvas-content"><div class="stage-surface" style="width: 500px; height: 400px"><canvas></canvas></div></div></div>'
    document.body.append(container)
    const surface = container.querySelector<HTMLElement>('.stage-surface')!
    const parent = surface.parentElement!
    const canvas = surface.querySelector('canvas')!
    canvas.width = 1000
    canvas.height = 800
    const originalStyle = surface.style.cssText
    const horizontal = orientation === 'horizontal'
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1006 * scale, 1006 * scale))
    vi.spyOn(container.firstElementChild!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 6 * scale, 6 * scale))
    let position = new DOMRect(100 * scale, 60 * scale, 500 * scale, 400 * scale)
    const measure = vi.spyOn(parent, 'getBoundingClientRect').mockImplementation(() => position)
    const gesture = beginDocumentPaneResize(container, orientation, 0.5, { clientX: 0, clientY: 0 })
    expect(canvasStageIsVisible(canvas, null)).toBe(false)
    for (let i = 1; i <= 100; i++) gesture.move({ clientX: i * scale, clientY: i * scale })
    expect(measure).toHaveBeenCalledTimes(1)
    position = new DOMRect((horizontal ? 200 : 100) * scale, (horizontal ? 60 : 160) * scale, 400 * scale, 300 * scale)
    vi.advanceTimersToNextFrame()
    expect(measure).toHaveBeenCalledTimes(2)
    expect(surface.style.transform).toBe(horizontal ? 'translate(-100px, 0px)' : 'translate(0px, -100px)')
    expect(surface.style.width).toBe('500px')
    expect(surface.style.height).toBe('400px')
    expect([canvas.width, canvas.height]).toEqual([1000, 800])
    const commit = vi.fn()
    gesture.move({ clientX: 200 * scale, clientY: 200 * scale })
    gesture.finish(false, commit)
    expect(commit).toHaveBeenCalledExactlyOnceWith(0.7)
    expect(surface.style.cssText).toBe(originalStyle)
    expect(canvasStageIsVisible(canvas, null)).toBe(true)
    expect(isWorkspaceResizing()).toBe(false)
  }
)

it('restores the original split on cancellation and discards queued work', () => {
  const container = document.createElement('div')
  container.style.gridTemplateColumns = '1fr 6px 1fr'
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 500))
  const gesture = beginDocumentPaneResize(container, 'horizontal', 0.5, { clientX: 0, clientY: 0 })
  gesture.move({ clientX: 100, clientY: 0 })
  vi.advanceTimersToNextFrame()
  expect(container.style.gridTemplateColumns).not.toBe('1fr 6px 1fr')
  gesture.move({ clientX: 300, clientY: 0 })
  const commit = vi.fn()
  gesture.finish(true, commit)
  vi.advanceTimersToNextFrame()
  gesture.finish(false, commit)
  expect(commit).not.toHaveBeenCalled()
  expect(container.style.gridTemplateColumns).toBe('1fr 6px 1fr')
  expect(isWorkspaceResizing()).toBe(false)
})
