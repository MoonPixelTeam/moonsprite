import { fireEvent, render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { NumberInput } from './NumberInput'

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
})
