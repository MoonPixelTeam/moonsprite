import { Profiler } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.resetModules()
})

it('does not enable React prop tracing for ordinary development editing', async () => {
  window.history.replaceState(null, '', '/')
  const { PerformanceProfiler } = await import('./PerformanceProfiler')
  const child = <span>editor</span>
  expect(PerformanceProfiler({ id: 'MoonSprite', children: child })).toBe(child)
})

it('keeps React profiling available when explicitly requested', async () => {
  window.history.replaceState(null, '', '/?moonsprite-perf')
  const { PerformanceProfiler } = await import('./PerformanceProfiler')
  const result = PerformanceProfiler({ id: 'MoonSprite', children: <span>editor</span> })
  expect(result).toMatchObject({ type: Profiler, props: { id: 'MoonSprite' } })
})
