import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PaletteSwatch, usePaletteSwatchActions } from './PaletteSwatch'

afterEach(cleanup)

it('keeps cached swatches interactive with current handlers and updates changed visual state', () => {
  const oldBegin = vi.fn(), newBegin = vi.fn(), oldAdd = vi.fn(), newAdd = vi.fn()
  function Harness({ begin = oldBegin, add = oldAdd, selected = false, id = 7, color = 'red' }) {
    const actions = usePaletteSwatchActions(begin, add)
    return <PaletteSwatch slot={3} id={id} className="swatch" wrapClassName="palette-swatch-wrap"
      label="test color" selected={selected} color={color} markerColor="black" actions={actions} />
  }
  const { getByRole, rerender } = render(<Harness />)
  const button = getByRole('button')
  // Only callbacks changed: the memoized swatch keeps its initial markup.
  rerender(<Harness begin={newBegin} add={newAdd} />)
  expect(getByRole('button')).toBe(button)
  fireEvent.pointerDown(button)
  fireEvent.doubleClick(button)
  expect(oldBegin).not.toHaveBeenCalled()
  expect(oldAdd).not.toHaveBeenCalled()
  expect(newBegin).toHaveBeenCalledWith(expect.anything(), 3, 7)
  expect(newAdd).toHaveBeenCalledWith(3)
  rerender(<Harness begin={newBegin} add={newAdd} selected id={9} color="blue" />)
  expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(button).toHaveAttribute('data-palette-id', '9')
  expect(button.style.getPropertyValue('--swatch-color')).toBe('blue')
  fireEvent.pointerDown(button)
  expect(newBegin).toHaveBeenLastCalledWith(expect.anything(), 3, 9)
})
