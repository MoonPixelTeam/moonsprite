import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Scrollbar } from './Scrollbar'

let resize: ResizeObserverCallback
const disconnect = vi.fn()
const context = { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' }
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
}
beforeEach(() => {
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 10))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(10)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })

const notifyResize = (width: number, height: number) => act(() => resize([{ contentRect: new DOMRect(0, 0, width, height) } as ResizeObserverEntry], {} as ResizeObserver))

describe('Scrollbar', () => {
  it('updates a fixed surface without moving DOM layers or reading layout during pan', () => {
    const props = { ariaLabel: 'Canvas X', orientation: 'horizontal' as const, thumbRatio: 0.4, onChange: vi.fn() }
    const { getByRole, container, rerender } = render(<Scrollbar {...props} value={0.25} />)
    const thumb = container.querySelector<HTMLCanvasElement>('.ui-scrollbar-thumb')!
    expect(getByRole('scrollbar')).toHaveAttribute('aria-valuenow', '25')
    expect([thumb.width, thumb.height]).toEqual([200, 10])
    expect(context.fillRect).toHaveBeenLastCalledWith(30, 0, 80, 10)
    const measure = vi.mocked(HTMLElement.prototype.getBoundingClientRect)
    measure.mockClear()
    for (let step = 0; step <= 60; step++) rerender(<Scrollbar {...props} value={step / 60} />)
    expect(context.fillRect).toHaveBeenLastCalledWith(120, 0, 80, 10)
    expect(thumb.getAttribute('style')).toBeNull()
    expect([thumb.width, thumb.height]).toEqual([200, 10])
    expect(measure).not.toHaveBeenCalled()
    expect(props.onChange).not.toHaveBeenCalled()
  })

  it('preserves the grab offset and centers track clicks with a minimum sized thumb', () => {
    const onChange = vi.fn()
    const { getByRole, rerender } = render(<Scrollbar ariaLabel="Canvas X" orientation="horizontal" value={0.5} thumbRatio={0.01} onChange={onChange} />)
    const bar = getByRole('scrollbar')
    expect(context.fillRect).toHaveBeenLastCalledWith(90, 0, 20, 10)
    fireEvent.pointerDown(bar, { button: 0, clientX: 95 })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(bar, { clientX: 131 })
    expect(onChange).toHaveBeenLastCalledWith(0.7)
    fireEvent.pointerCancel(bar)
    onChange.mockClear()
    fireEvent.pointerMove(bar, { clientX: 180 })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.pointerDown(bar, { button: 0, clientX: 190 })
    expect(onChange).toHaveBeenLastCalledWith(1)
    fireEvent.pointerUp(bar)
    rerender(<Scrollbar ariaLabel="Canvas X" orientation="horizontal" value={1} thumbRatio={1} onChange={onChange} />)
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 0, 200, 10)
    fireEvent.pointerDown(bar, { button: 0, clientX: 190 })
    fireEvent.pointerMove(bar, { clientX: 180 })
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('keeps vertical hit testing and pixel boundaries aligned through zoom, resize and DPR changes', () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 15, 300))
    vi.mocked(Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')!.get!).mockReturnValue(10)
    vi.mocked(Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')!.get!).mockReturnValue(200)
    const onChange = vi.fn()
    const { getByRole, container, unmount } = render(<Scrollbar ariaLabel="Canvas Y" orientation="vertical" value={1} thumbRatio={0.01} onChange={onChange} />)
    const canvas = container.querySelector('canvas')!
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 270, 15, 30)
    fireEvent.pointerDown(getByRole('scrollbar'), { button: 0, clientY: 290 })
    fireEvent.pointerMove(getByRole('scrollbar'), { clientY: 155 })
    expect(onChange).toHaveBeenLastCalledWith(0.5)
    vi.stubGlobal('devicePixelRatio', 2)
    notifyResize(10, 200)
    expect([canvas.width, canvas.height]).toEqual([30, 600])
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 540, 30, 60)
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 15, 15))
    notifyResize(10, 10)
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 0, 30, 30)
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('refreshes theme and hover colors without resetting scroll position', async () => {
    const { getByRole } = render(<Scrollbar ariaLabel="Canvas X" orientation="horizontal" value={0.5} thumbRatio={0.4} onChange={vi.fn()} />)
    const bar = getByRole('scrollbar')
    bar.style.setProperty('--theme-scrollbar-thumb', 'rgb(10, 20, 30)')
    bar.style.setProperty('--theme-text-muted', 'rgb(40, 50, 60)')
    await act(async () => { document.documentElement.dataset.themeId = 'scrollbar-test' })
    expect(context.fillStyle).toBe('rgb(10, 20, 30)')
    fireEvent.pointerEnter(bar)
    expect(context.fillStyle).toBe('rgb(40, 50, 60)')
    fireEvent.pointerLeave(bar)
    expect(context.fillStyle).toBe('rgb(10, 20, 30)')
    expect(bar).toHaveAttribute('aria-valuenow', '50')
    delete document.documentElement.dataset.themeId
  })

  it('supports keyboard scrolling and clamps at the ends', () => {
    const onChange = vi.fn()
    const { getByRole, rerender } = render(<Scrollbar ariaLabel="Canvas Y" orientation="vertical" value={0.98} thumbRatio={0.25} onChange={onChange} />)
    fireEvent.keyDown(getByRole('scrollbar'), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(1)
    rerender(<Scrollbar ariaLabel="Canvas Y" orientation="vertical" value={0.5} thumbRatio={0.25} onChange={onChange} />)
    fireEvent.keyDown(getByRole('scrollbar'), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(0)
  })
})
