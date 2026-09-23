import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { pixelGridMetrics } from '@/components/usePixelGridMetrics'
import { PaletteSelectionOutline } from './PaletteSelectionOutline'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([
  { slots: [1], columns: 1, selected: [1], path: 'M0,0L30,0L30,30L0,30Z' },
  { slots: [1, 2], columns: 2, selected: [1, 2], path: 'M0,0L61,0L61,30L0,30Z' },
  { slots: [1, 2, 3], columns: 2, selected: [1, 2, 3], path: 'M0,0L61,0L61,30L30,30L30,61L0,61Z' },
  { slots: [1, 2, 3, 4], columns: 2, selected: [1, 4], path: 'M0,0L30,0L30,30L0,30Z M31,31L61,31L61,61L31,61Z' }
])('matches the original border-box bounds for $selected', ({ slots, columns, selected, path }) => {
  const { container } = render(<PaletteSelectionOutline slots={slots} columns={columns} selectedIds={selected} swatchSize={30} />)
  expect(container.querySelector('clipPath path')).toHaveAttribute('d', path)
})

it.each([0.75, 1.25, 1.5, 1.75, 2])('keeps the selection aligned with quantized cell bounds at %s', (ratio) => {
  vi.stubGlobal('devicePixelRatio', ratio)
  const grid = pixelGridMetrics(30, 1, ratio)
  const { container } = render(<PaletteSelectionOutline slots={[1, 2]} columns={2} selectedIds={[1, 2]} swatchSize={grid.size} gap={grid.gap} />)
  const path = container.querySelector('clipPath path')!.getAttribute('d')!
  const coordinates = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
  for (const coordinate of coordinates) expect(coordinate * ratio).toBeCloseTo(Math.round(coordinate * ratio))
  for (const stroke of container.querySelectorAll('[stroke-width]')) {
    const physicalWidth = Number(stroke.getAttribute('stroke-width')) * ratio
    expect(physicalWidth).toBeCloseTo(Math.round(physicalWidth))
  }
})
