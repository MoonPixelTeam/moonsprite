import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { sliderWheelValue, WheelRangeInput } from './useSliderWheel'

afterEach(cleanup)
it('handles fractional steps, both bounds, and modifier steps', () => {
  expect(sliderWheelValue(0.2, -1, 0, 1, 0.1)).toBe(0.3)
  expect(sliderWheelValue(0, 1, 0, 1, 0.1)).toBe(0)
  expect(sliderWheelValue(1, -1, 0, 1, 0.1)).toBe(1)
  expect(sliderWheelValue(20, -1, 0, 100, 1, true)).toBe(25)
})
it('uses the latest input value and blocks parent wheel handlers', () => {
  const change = vi.fn(), parent = vi.fn()
  const view = render(<div onWheel={parent}><WheelRangeInput type="range" min={0} max={255} value={100} onWheelValue={change} readOnly /></div>)
  expect(fireEvent.wheel(view.getByRole('slider'), { deltaY: -100 })).toBe(false)
  expect(change).toHaveBeenLastCalledWith(101)
  expect(parent).not.toHaveBeenCalled()
  view.rerender(<WheelRangeInput type="range" min={0} max={255} value={200} onWheelValue={change} readOnly />)
  fireEvent.wheel(view.getByRole('slider'), { deltaY: 100 })
  expect(change).toHaveBeenLastCalledWith(199)
})
