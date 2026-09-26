import { fireEvent, render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { NumberInput } from './NumberInput'
import { FormField } from './FormField'

afterEach(() => vi.useRealTimers())

describe('NumberInput steppers', () => {
  it('applies the first reverse pointerdown after releasing a long press', () => {
    vi.useFakeTimers()
    const onValueChange = vi.fn()
    function Harness() {
      const [value, setValue] = useState(0)
      return <NumberInput value={value} onValueChange={(next) => { onValueChange(next); setValue(next) }} />
    }
    render(<Harness />)
    const [increment, decrement] = screen.getAllByRole('button')

    fireEvent.pointerDown(increment, { button: 0, buttons: 1 })
    act(() => { vi.advanceTimersByTime(700) })
    fireEvent.pointerUp(increment, { button: 0, buttons: 0 })

    const beforeReverse = onValueChange.mock.lastCall?.[0] as number
    fireEvent.pointerDown(decrement, { button: 0, buttons: 1 })
    expect(onValueChange).toHaveBeenLastCalledWith(beforeReverse - 1)

    // A late click from the released increment press must not clear the new press's suppression.
    fireEvent.click(increment)
    fireEvent.pointerUp(decrement, { button: 0, buttons: 0 })
    fireEvent.click(decrement)
    expect(onValueChange).toHaveBeenLastCalledWith(beforeReverse - 1)
  })

  it('scrubs a field value from its label and uses a 10x Shift multiplier', () => {
    const onValueChange = vi.fn()
    function Harness() {
      const [value, setValue] = useState(5)
      return <FormField label="Size"><NumberInput value={value} min={0} max={100} step={1} onValueChange={(next) => { onValueChange(next); setValue(next) }} /></FormField>
    }
    render(<Harness />)
    const label = screen.getByText('Size')
    expect(label).toHaveAttribute('data-number-scrubbable', 'true')

    fireEvent.pointerDown(label, { button: 0, buttons: 1, pointerId: 1, clientX: 10 })
    fireEvent.pointerMove(label, { buttons: 1, pointerId: 1, clientX: 13 })
    expect(onValueChange).toHaveBeenLastCalledWith(8)
    fireEvent.pointerMove(label, { buttons: 1, pointerId: 1, clientX: 15, shiftKey: true })
    expect(onValueChange).toHaveBeenLastCalledWith(28)
    fireEvent.pointerUp(label, { button: 0, buttons: 0, pointerId: 1, clientX: 15 })
  })

  it('does not make an ambiguous multi-number field label scrubbable', () => {
    render(<FormField label="Origin"><NumberInput aria-label="X" value={0} onValueChange={() => undefined} /><NumberInput aria-label="Y" value={0} onValueChange={() => undefined} /></FormField>)
    expect(screen.getByText('Origin')).not.toHaveAttribute('data-number-scrubbable')
  })
})


it('adjusts by wheel without scrolling ancestors and respects steps and bounds', () => {
  const changed = vi.fn()
  const view = render(<NumberInput value={2} min={1} max={3} step={0.5} onValueChange={changed} />)
  const input = view.container.querySelector('input')!
  fireEvent.wheel(input, { deltaY: -100 })
  fireEvent.wheel(input, { deltaY: -100 })
  fireEvent.wheel(input, { deltaY: -100 })
  expect(changed.mock.calls.map(call => call[0])).toEqual([2.5, 3])
  fireEvent.wheel(input, { deltaY: 100 })
  expect(changed).toHaveBeenLastCalledWith(2.5)
  view.rerender(<NumberInput value={2} disabled onValueChange={changed} />)
  const count = changed.mock.calls.length
  fireEvent.wheel(input, { deltaY: -100 })
  expect(changed).toHaveBeenCalledTimes(count)
})
