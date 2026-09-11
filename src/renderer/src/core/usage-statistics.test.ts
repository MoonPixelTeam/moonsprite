import { describe, expect, it } from 'vitest'
import { addUsageInterval, emptyUsageStatistics, parseUsageStatistics, summarizeUsageStatistics } from './usage-statistics'

describe('usage statistics', () => {
  it('splits usage across local day and hour boundaries', () => {
    const data = emptyUsageStatistics()
    addUsageInterval(data, new Date(2026, 8, 9, 23, 59, 30), new Date(2026, 8, 10, 0, 0, 30))
    expect(data.totalUsageMs).toBe(60_000)
    expect(data.dailyUsageMs['2026-09-09']).toBe(30_000)
    expect(data.dailyUsageMs['2026-09-10']).toBe(30_000)
    expect(data.hourlyUsageMs[23]).toBe(30_000)
    expect(data.hourlyUsageMs[0]).toBe(30_000)
  })

  it('derives recent totals, streaks and the most active hour', () => {
    const now = new Date(2026, 8, 10, 12)
    const data = emptyUsageStatistics()
    data.dailyUsageMs = { '2026-09-08': 1_000, '2026-09-09': 2_000, '2026-09-10': 3_000 }
    data.hourlyUsageMs[20] = 9_000
    data.totalUsageMs = 6_000
    data.launchCount = 2
    const summary = summarizeUsageStatistics(data, now)
    expect(summary.consecutiveUsageDays).toBe(3)
    expect(summary.totalUsageDays).toBe(3)
    expect(summary.last7DaysMs).toBe(6_000)
    expect(summary.averageSessionMs).toBe(3_000)
    expect(summary.mostActiveHour).toBe(20)
  })

  it('repairs malformed persisted values without disabling statistics', () => {
    const parsed = parseUsageStatistics('{"launchCount":-2,"hourlyUsageMs":[100],"dailyUsageMs":{"bad":7}}')
    expect(parsed.enabled).toBe(true)
    expect(parsed.launchCount).toBe(0)
    expect(parsed.hourlyUsageMs).toHaveLength(24)
    expect(parsed.dailyUsageMs).toEqual({})
  })
})
