import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useToolOptionsScroll } from './useToolOptionsScroll'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function Row() {
  const ref = useToolOptionsScroll()
  return <div ref={ref} data-testid="row"><input defaultValue="100" /><div><div className="brush-size-popover" style={{ position: 'absolute', width: 210 }}>Slider</div></div></div>
}

it('scrolls overflowing controls with vertical, horizontal and line wheels without editing inputs', () => {
  const view = render(<Row />)
  const row = view.getByTestId('row')
  Object.defineProperties(row, { scrollWidth: { value: 1000 }, clientWidth: { value: 300 } })
  const input = view.container.querySelector('input')!
  fireEvent.wheel(input, { deltaY: 60 })
  expect(row.scrollLeft).toBe(60)
  fireEvent.wheel(row, { deltaX: 40, deltaY: 5 })
  expect(row.scrollLeft).toBe(100)
  fireEvent.wheel(row, { deltaY: -2, deltaMode: 1 })
  expect(row.scrollLeft).toBe(52)
  expect(input.value).toBe('100')
  fireEvent.wheel(row, { deltaY: 30, ctrlKey: true })
  fireEvent.wheel(view.getByText('Slider'), { deltaY: 30 })
  expect(row.scrollLeft).toBe(52)
})

it('does not swallow wheel events when everything fits', () => {
  const view = render(<Row />)
  const event = new WheelEvent('wheel', { deltaY: 20, bubbles: true, cancelable: true })
  view.getByTestId('row').dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})

it('keeps inline flyouts fixed outside the scroll clip and anchored after scrolling', () => {
  const view = render(<Row />)
  const row = view.getByTestId('row')
  const panel = view.getByText('Slider')
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 40))
  vi.spyOn(panel.parentElement!, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 5, 70, 24))
  fireEvent.scroll(row)
  expect(panel.style.position).toBe('fixed')
  expect(panel.style.left).toBe('100px')
  expect(panel.style.top).toBe('33px')
  expect(panel.style.visibility).toBe('')
})
