import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scrollbar } from './Scrollbar'

afterEach(cleanup)

describe('Scrollbar', () => {
  it('renders a controlled square thumb with the requested orientation and ratio', () => {
    const { getByRole, container } = render(<Scrollbar ariaLabel="Canvas X" orientation="horizontal" value={0.25} thumbRatio={0.4} onChange={() => undefined} />)
    const scrollbar = getByRole('scrollbar')
    const thumb = container.querySelector<HTMLElement>('.ui-scrollbar-thumb')!
    expect(scrollbar).toHaveClass('ui-scrollbar-horizontal')
    expect(scrollbar).toHaveAttribute('aria-valuenow', '25')
    expect(thumb.style.width).toBe('40%')
    expect(thumb.style.left).toBe('25%')
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
