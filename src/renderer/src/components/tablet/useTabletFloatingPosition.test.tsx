import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Button } from '@/components/Button'
import { PanelResizeHandles } from '@/components/floating-panel'
import { useTabletFloatingPosition } from './useTabletFloatingPosition'

afterEach(cleanup)

function Fixture() {
  const floating = useTabletFloatingPosition('left', true)
  return <div data-testid="host"><aside {...floating} data-testid="panel"><header>Drag</header><Button>Action</Button><div data-testid="blank" /><PanelResizeHandles onResize={event => floating.onPointerDown(event)} /></aside></div>
}

function setup() {
  const view = render(<Fixture />), host = view.getByTestId('host'), panel = view.getByTestId('panel')
  Object.defineProperties(host, { clientWidth: { configurable: true, value: 800 }, clientHeight: { configurable: true, value: 600 } })
  Object.defineProperties(panel, { offsetWidth: { value: 200 }, offsetHeight: { value: 400 } })
  host.getBoundingClientRect = () => ({ left: 100, top: 80, width: 800, height: 600 }) as DOMRect
  panel.getBoundingClientRect = () => ({ left: 108, top: 88, width: 200, height: 400 }) as DOMRect
  const captured = new Set<number>()
  panel.setPointerCapture = vi.fn(id => { captured.add(id) })
  panel.hasPointerCapture = id => captured.has(id)
  panel.releasePointerCapture = vi.fn(id => { captured.delete(id) })
  return { view, host, panel, captured }
}

it('drags from blank space, stays above the dock boundary, and reclamps after the canvas shrinks', () => {
  const { view, panel, host, captured } = setup()
  fireEvent.pointerDown(view.getByTestId('blank'), { pointerId: 1, button: 0, clientX: 120, clientY: 100 })
  fireEvent.pointerMove(panel, { pointerId: 1, clientX: 1100, clientY: 1000 })
  expect(panel.style.left).toBe('592px'); expect(panel.style.top).toBe('192px')
  fireEvent.pointerUp(panel, { pointerId: 1 }); expect(captured.size).toBe(0)
  Object.defineProperties(host, { clientWidth: { value: 500 }, clientHeight: { value: 500 } })
  fireEvent(window, new Event('resize'))
  expect(panel.style.left).toBe('292px'); expect(panel.style.top).toBe('92px')
})

it('leaves controls clickable and restores placement when the drag is canceled or focus is lost', () => {
  const { view, panel } = setup()
  fireEvent.pointerDown(view.getByRole('button'), { pointerId: 2, button: 0 })
  expect(panel.setPointerCapture).not.toHaveBeenCalled()
  for (const cancel of ['pointercancel', 'blur']) {
    fireEvent.pointerDown(view.getByText('Drag'), { pointerId: 1, button: 0, clientX: 120, clientY: 100 })
    fireEvent.pointerMove(panel, { pointerId: 1, clientX: 220, clientY: 150 })
    expect(panel.style.left).toBe('108px')
    if (cancel === 'blur') fireEvent.blur(window)
    else fireEvent.pointerCancel(panel, { pointerId: 1 })
    expect(panel.style.left).toBe(''); expect(panel.dataset.dragging).toBeUndefined()
  }
})

it.each(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'])('resizes from the shared %s handle while keeping the opposite edge fixed', direction => {
  const { panel } = setup()
  fireEvent.pointerDown(panel.querySelector(`.resize-${direction}`)!, { pointerId: 1, button: 0, clientX: 200, clientY: 200 })
  fireEvent.pointerMove(panel, { pointerId: 1, clientX: 210, clientY: 210 })
  expect(panel.style.width).toBe(`${200 + (direction.includes('e') ? 10 : direction.includes('w') ? -10 : 0)}px`)
  expect(panel.style.getPropertyValue('--tablet-panel-height')).toBe(`${400 + (direction.includes('s') ? 10 : direction.includes('n') ? -10 : 0)}px`)
  expect(panel.style.left).toBe(direction.includes('w') ? '18px' : '8px')
  expect(panel.style.top).toBe(direction.includes('n') ? '18px' : '8px')
  fireEvent.pointerUp(panel, { pointerId: 1 })
  expect(panel.dataset.resizing).toBeUndefined()
  expect(panel.dataset.sized).toBe('true')
})

it('limits resize to the canvas, enforces a usable minimum and restores size on cancellation', () => {
  const { panel } = setup()
  fireEvent.pointerDown(panel.querySelector('.resize-se')!, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
  fireEvent.pointerMove(panel, { pointerId: 1, clientX: 2000, clientY: 2000 })
  expect(panel.style.width).toBe('784px'); expect(panel.style.getPropertyValue('--tablet-panel-height')).toBe('584px')
  fireEvent.pointerMove(panel, { pointerId: 1, clientX: -2000, clientY: -2000 })
  expect(panel.style.width).toBe('180px'); expect(panel.style.getPropertyValue('--tablet-panel-height')).toBe('120px')
  fireEvent.pointerCancel(panel, { pointerId: 1 })
  expect(panel.style.width).toBe(''); expect(panel.style.getPropertyValue('--tablet-panel-height')).toBe('')
  expect(panel.dataset.sized).toBeUndefined()
})
