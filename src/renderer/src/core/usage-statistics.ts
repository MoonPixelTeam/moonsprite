export interface UsageStatisticsData {
  version: 1
  enabled: boolean
  firstUsedAt: string | null
  launchCount: number
  totalUsageMs: number
  longestSessionMs: number
  completedSessionCount: number
  newProjectCount: number
  saveCount: number
  exportCount: number
  exportFormats: Record<string, number>
  drawingStrokeCount: number
  dailyUsageMs: Record<string, number>
  hourlyUsageMs: number[]
  updatedAt: string
}

export interface UsageStatisticsSummary {
  data: UsageStatisticsData
  totalUsageDays: number
  consecutiveUsageDays: number
  last7DaysMs: number
  last30DaysMs: number
  averageSessionMs: number
  mostActiveHour: number | null
  dailyTrend: Array<{ key: string; usageMs: number }>
  weeklyTrend: Array<{ key: string; usageMs: number }>
}

const finiteCount = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0

export const emptyUsageStatistics = (enabled = true, now = new Date()): UsageStatisticsData => ({
  version: 1,
  enabled,
  firstUsedAt: null,
  launchCount: 0,
  totalUsageMs: 0,
  longestSessionMs: 0,
  completedSessionCount: 0,
  newProjectCount: 0,
  saveCount: 0,
  exportCount: 0,
  exportFormats: {},
  drawingStrokeCount: 0,
  dailyUsageMs: {},
  hourlyUsageMs: Array.from({ length: 24 }, () => 0),
  updatedAt: now.toISOString()
})

export const parseUsageStatistics = (source: string | null | undefined, now = new Date()): UsageStatisticsData => {
  if (!source) return emptyUsageStatistics(true, now)
  try {
    const value = JSON.parse(source) as Partial<UsageStatisticsData>
    const formats = value.exportFormats && typeof value.exportFormats === 'object'
      ? Object.fromEntries(Object.entries(value.exportFormats).filter(([key]) => key.length > 0).map(([key, count]) => [key, finiteCount(count)]))
      : {}
    const days = value.dailyUsageMs && typeof value.dailyUsageMs === 'object'
      ? Object.fromEntries(Object.entries(value.dailyUsageMs).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).map(([key, duration]) => [key, finiteCount(duration)]))
      : {}
    const hours = Array.isArray(value.hourlyUsageMs) ? value.hourlyUsageMs.slice(0, 24).map(finiteCount) : []
    while (hours.length < 24) hours.push(0)
    return {
      version: 1,
      enabled: value.enabled !== false,
      firstUsedAt: typeof value.firstUsedAt === 'string' ? value.firstUsedAt : null,
      launchCount: finiteCount(value.launchCount),
      totalUsageMs: finiteCount(value.totalUsageMs),
      longestSessionMs: finiteCount(value.longestSessionMs),
      completedSessionCount: finiteCount(value.completedSessionCount),
      newProjectCount: finiteCount(value.newProjectCount),
      saveCount: finiteCount(value.saveCount),
      exportCount: finiteCount(value.exportCount),
      exportFormats: formats,
      drawingStrokeCount: finiteCount(value.drawingStrokeCount),
      dailyUsageMs: days,
      hourlyUsageMs: hours,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now.toISOString()
    }
  } catch {
    return emptyUsageStatistics(true, now)
  }
}

export const localDateKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const nextHour = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1)

export const addUsageInterval = (data: UsageStatisticsData, startedAt: Date, endedAt: Date): UsageStatisticsData => {
  if (endedAt.getTime() <= startedAt.getTime()) return data
  let cursor = new Date(startedAt)
  while (cursor.getTime() < endedAt.getTime()) {
    const boundary = nextHour(cursor)
    const segmentEnd = new Date(Math.min(boundary.getTime(), endedAt.getTime()))
    const duration = segmentEnd.getTime() - cursor.getTime()
    const day = localDateKey(cursor)
    data.dailyUsageMs[day] = (data.dailyUsageMs[day] ?? 0) + duration
    data.hourlyUsageMs[cursor.getHours()] = (data.hourlyUsageMs[cursor.getHours()] ?? 0) + duration
    data.totalUsageMs += duration
    cursor = segmentEnd
  }
  data.updatedAt = endedAt.toISOString()
  return data
}

const dateAtLocalMidnight = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const shiftedDateKey = (date: Date, deltaDays: number): string => {
  const shifted = dateAtLocalMidnight(date)
  shifted.setDate(shifted.getDate() + deltaDays)
  return localDateKey(shifted)
}

const mondayKey = (dayKey: string): string => {
  const date = new Date(`${dayKey}T00:00:00`)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return localDateKey(date)
}

export const summarizeUsageStatistics = (data: UsageStatisticsData, now = new Date()): UsageStatisticsSummary => {
  const activeDays = Object.keys(data.dailyUsageMs).filter((key) => (data.dailyUsageMs[key] ?? 0) > 0).sort()
  const activeDaySet = new Set(activeDays)
  let consecutiveUsageDays = 0
  let cursor = activeDaySet.has(localDateKey(now)) ? 0 : -1
  while (activeDaySet.has(shiftedDateKey(now, cursor))) {
    consecutiveUsageDays += 1
    cursor -= 1
  }
  const dailyTrend = Array.from({ length: 30 }, (_, index) => {
    const key = shiftedDateKey(now, index - 29)
    return { key, usageMs: data.dailyUsageMs[key] ?? 0 }
  })
  const weekly = new Map<string, number>()
  for (const [key, duration] of Object.entries(data.dailyUsageMs)) weekly.set(mondayKey(key), (weekly.get(mondayKey(key)) ?? 0) + duration)
  const currentMonday = new Date(`${mondayKey(localDateKey(now))}T00:00:00`)
  const weeklyTrend = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(currentMonday)
    date.setDate(date.getDate() + (index - 11) * 7)
    const key = localDateKey(date)
    return { key, usageMs: weekly.get(key) ?? 0 }
  })
  let mostActiveHour: number | null = null
  let mostActiveDuration = 0
  data.hourlyUsageMs.forEach((duration, hour) => {
    if (duration > mostActiveDuration) { mostActiveDuration = duration; mostActiveHour = hour }
  })
  return {
    data,
    totalUsageDays: activeDays.length,
    consecutiveUsageDays,
    last7DaysMs: dailyTrend.slice(-7).reduce((sum, item) => sum + item.usageMs, 0),
    last30DaysMs: dailyTrend.reduce((sum, item) => sum + item.usageMs, 0),
    averageSessionMs: data.launchCount > 0 ? Math.round(data.totalUsageMs / data.launchCount) : 0,
    mostActiveHour,
    dailyTrend,
    weeklyTrend
  }
}
