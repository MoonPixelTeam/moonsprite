import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { TrendBars } from './UsageStatisticsDialog'

it('shows zero data without fake bars, and exposes exact usage on keyboard focus', () => {
  const { rerender } = render(<TrendBars items={[{ key: '2026-09-14', usageMs: 0 }]} />)
  expect(screen.getByText('这段时间暂无使用记录')).toBeInTheDocument()
  expect(screen.getByRole('button').querySelector('i')).toHaveStyle({ height: '0%' })
  rerender(<TrendBars compact items={[{ key: '2026-09-14', usageMs: 90_000 }, { key: '2026-09-15', usageMs: 0 }]} />)
  fireEvent.focus(screen.getByRole('button', { name: /2026-09-14/ }))
  expect(screen.getByText('1 分钟', { selector: 'strong' })).toBeInTheDocument()
  expect(screen.queryByText('这段时间暂无使用记录')).not.toBeInTheDocument()
})

it('labels weekly periods including their ending date across year boundaries', () => {
  render(<TrendBars items={[{ key: '2025-12-29', usageMs: 3_600_000 }]} />)
  expect(screen.getByRole('button', { name: /2025-12-29 — 2026-01-04/ })).toBeInTheDocument()
})

it('uses compact hour labels on the trend scale', () => {
  render(<TrendBars items={[{ key: '2026-09-14', usageMs: 90 * 60_000 }]} />)
  expect(screen.getByText('2时')).toBeInTheDocument()
  expect(screen.getAllByText('1时').length).toBeGreaterThan(0)
  expect(screen.getAllByText('0时').length).toBeGreaterThan(0)
})
