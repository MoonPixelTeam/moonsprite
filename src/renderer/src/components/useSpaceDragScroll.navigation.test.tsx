import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSpaceDragScroll } from './useSpaceDragScroll'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('avoids geometry reads during sustained middle panning, observes resize and releases capture', () => {
  let resize: ResizeObserverCallback = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  function Harness() {
    const ref = useRef<HTMLDivElement>(null), pan = useSpaceDragScroll(ref)
    return <div ref={ref} data-testid="viewport" onPointerDown={event => { pan.begin(event) }}
      onPointerMove={event => { pan.move(event) }} onPointerUp={event => { pan.finish(event) }} />
  }
  const view = render(<Harness />), viewport = view.getByTestId('viewport')
  let width = 600
  const dimensions = {
    scrollWidth: vi.fn(() => width), scrollHeight: vi.fn(() => 500),
    clientWidth: vi.fn(() => 200), clientHeight: vi.fn(() => 150)
  }
  for (const [name, get] of Object.entries(dimensions)) Object.defineProperty(viewport, name, { configurable: true, get })
  viewport.setPointerCapture = vi.fn()
  viewport.hasPointerCapture = vi.fn(() => true)
  viewport.releasePointerCapture = vi.fn()
  viewport.scrollLeft = 150; viewport.scrollTop = 100
  const packet = (type: string, x: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, { pointerId: 7, button: 1, clientX: x, clientY: 100 })
    fireEvent(viewport, event)
  }
  packet('pointerdown', 200)
  Object.values(dimensions).forEach(fn => fn.mockClear())
  for (let i = 0; i < 1000; i++) packet('pointermove', 100)
  expect(viewport.scrollLeft).toBe(250)
  Object.values(dimensions).forEach(fn => expect(fn).not.toHaveBeenCalled())
  width = 350
  act(() => resize([], {} as ResizeObserver))
  packet('pointermove', 0)
  expect(viewport.scrollLeft).toBe(150)
  packet('pointerup', 0)
  expect(viewport.releasePointerCapture).toHaveBeenCalledWith(7)
  packet('pointermove', 200)
  expect(viewport.scrollLeft).toBe(150)
  view.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})
