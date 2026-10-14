import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { pixelGridMetrics, usePixelGridMetrics } from './usePixelGridMetrics'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3])('keeps cell edges and border widths on physical pixels at scale %s', (ratio) => {
  for (const size of [14, 18, 22, 30, 40, 48]) {
    const grid = pixelGridMetrics(size, 1, ratio)
    expect(grid.line * ratio).toBeCloseTo(Math.round(ratio) || 1)
    expect(grid.gap).toBe(grid.line)
    for (let column = 0; column < 64; column++) {
      const left = column * (grid.size + grid.gap) * ratio
      const right = left + grid.size * ratio
      expect(left).toBeCloseTo(Math.round(left))
      expect(right).toBeCloseTo(Math.round(right))
    }
    expect(pixelGridMetrics(size, 0, ratio).gap).toBe(0)
  }
})

it('updates on display ratio changes without remounting', () => {
  vi.stubGlobal('devicePixelRatio', 1)
  const { result } = renderHook(() => usePixelGridMetrics(30))
  expect(result.current.size).toBe(30)
  act(() => { vi.stubGlobal('devicePixelRatio', 1.25); window.dispatchEvent(new Event('resize')) })
  expect(result.current.size).toBe(30.4)
  expect(result.current.gap).toBe(0.8)
  expect(result.current.style).toMatchObject({ '--swatch-size': '30.4px', '--palette-swatch-gap': '0.8px' })
})
