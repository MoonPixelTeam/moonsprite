import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PaletteSelectionOutline } from './PaletteSelectionOutline'

afterEach(cleanup)

it.each([
  { slots: [1], columns: 1, selected: [1], path: 'M0,0L30,0L30,30L0,30Z' },
  { slots: [1, 2], columns: 2, selected: [1, 2], path: 'M0,0L61,0L61,30L0,30Z' },
  { slots: [1, 2, 3], columns: 2, selected: [1, 2, 3], path: 'M0,0L61,0L61,30L30,30L30,61L0,61Z' },
  { slots: [1, 2, 3, 4], columns: 2, selected: [1, 4], path: 'M0,0L30,0L30,30L0,30Z M31,31L61,31L61,61L31,61Z' }
])('matches the original border-box bounds for $selected', ({ slots, columns, selected, path }) => {
  const { container } = render(<PaletteSelectionOutline slots={slots} columns={columns} selectedIds={selected} swatchSize={30} />)
  expect(container.querySelector('clipPath path')).toHaveAttribute('d', path)
})
