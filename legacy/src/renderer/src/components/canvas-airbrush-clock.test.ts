import { describe, expect, it, vi } from 'vitest'
import { advanceAirbrushClock } from './canvas-airbrush-clock'

describe('airbrush hold scheduling', () => {
  it('keeps ordinary cadence and waits until the next spray is due', () => {
    const spray = vi.fn()
    expect(advanceAirbrushClock(32, 16, 16, spray, () => 16)).toBe(32)
    expect(spray).not.toHaveBeenCalled()
    expect(advanceAirbrushClock(32, 32, 16, spray, () => 32)).toBe(48)
    expect(spray).toHaveBeenCalledTimes(1)
  })
  it('drops excess catch-up debt after a long pause', () => {
    const spray = vi.fn()
    const next = advanceAirbrushClock(16, 1000, 16, spray, () => 1000)
    expect(spray).toHaveBeenCalledTimes(4)
    expect(next).toBe(1016)
    advanceAirbrushClock(next, 1016, 16, spray, () => 1016)
    expect(spray).toHaveBeenCalledTimes(5)
  })
  it('yields after an expensive batch and measures its execution time', () => {
    let now = 1000
    const spray = vi.fn(() => { now += 30 })
    const next = advanceAirbrushClock(16, 1000, 16, spray, () => now)
    expect(spray).toHaveBeenCalledTimes(1)
    expect(next).toBe(1046)
    expect(advanceAirbrushClock(next, 1040, 16, spray, () => 1040)).toBe(next)
    expect(spray).toHaveBeenCalledTimes(1)
  })
})
