import { addUsageInterval, emptyUsageStatistics, parseUsageStatistics, summarizeUsageStatistics, type UsageStatisticsData, type UsageStatisticsSummary } from '@/core/usage-statistics'
import { playExportSuccessSound } from './export-success-sound'

type UsageEvent = 'newProject' | 'save' | 'drawingStroke'

let data = emptyUsageStatistics()
let initialized: Promise<void> | null = null
let activeSessionStartedAt: Date | null = null
let lastAccountedAt: Date | null = null
let persistChain = Promise.resolve()
let persistTimer: number | null = null
const listeners = new Set<() => void>()

const notify = (): void => { for (const listener of listeners) listener() }
const queuePersist = (): Promise<void> => {
  if (persistTimer !== null) { window.clearTimeout(persistTimer); persistTimer = null }
  const json = JSON.stringify(data, null, 2)
  persistChain = persistChain.then(() => window.moonSprite.writeUsageStatistics(json)).catch((error) => console.warn('Failed to persist usage statistics.', error))
  return persistChain
}
const schedulePersist = (): void => {
  if (persistTimer !== null) return
  persistTimer = window.setTimeout(() => { persistTimer = null; void queuePersist() }, 2_000)
}

const accountUntil = (now = new Date()): void => {
  if (!data.enabled || !lastAccountedAt) return
  addUsageInterval(data, lastAccountedAt, now)
  if (activeSessionStartedAt) data.longestSessionMs = Math.max(data.longestSessionMs, now.getTime() - activeSessionStartedAt.getTime())
  lastAccountedAt = now
}

export const initializeUsageStatistics = (): Promise<void> => {
  if (initialized) return initialized
  initialized = (async () => {
    let stored: string | null = null
    try { stored = await window.moonSprite.readUsageStatistics() } catch (error) { console.warn('Failed to read usage statistics.', error) }
    data = parseUsageStatistics(stored)
    const now = new Date()
    if (data.enabled) {
      data.firstUsedAt ??= now.toISOString()
      data.launchCount += 1
      activeSessionStartedAt = now
      lastAccountedAt = now
      await queuePersist()
    }
    window.setInterval(() => {
      if (!data.enabled) return
      accountUntil()
      void queuePersist()
      notify()
    }, 60_000)
    const flush = (): void => { if (data.enabled) { accountUntil(); void queuePersist() } }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
    notify()
  })()
  return initialized
}

const snapshotData = (): UsageStatisticsData => {
  const copy = parseUsageStatistics(JSON.stringify(data))
  if (copy.enabled && lastAccountedAt) addUsageInterval(copy, lastAccountedAt, new Date())
  if (copy.enabled && activeSessionStartedAt) copy.longestSessionMs = Math.max(copy.longestSessionMs, Date.now() - activeSessionStartedAt.getTime())
  return copy
}

export const usageStatisticsSnapshot = (): UsageStatisticsSummary => summarizeUsageStatistics(snapshotData())
export const subscribeUsageStatistics = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener) }

export const recordUsageEvent = (event: UsageEvent): void => {
  void initializeUsageStatistics().then(() => {
    if (!data.enabled) return
    if (event === 'newProject') data.newProjectCount += 1
    else if (event === 'save') data.saveCount += 1
    else if (event === 'drawingStroke') data.drawingStrokeCount += 1
    data.updatedAt = new Date().toISOString()
    schedulePersist()
    notify()
  })
}

export const recordUsageExport = (format: string): void => {
  void initializeUsageStatistics().then(() => {
    if (!data.enabled) return
    data.exportCount += 1
    data.exportFormats[format] = (data.exportFormats[format] ?? 0) + 1
    data.updatedAt = new Date().toISOString()
    schedulePersist()
    notify()
  })
}

export const setUsageStatisticsEnabled = async (enabled: boolean): Promise<void> => {
  await initializeUsageStatistics()
  if (data.enabled === enabled) return
  const now = new Date()
  if (!enabled) {
    accountUntil(now)
    if (activeSessionStartedAt) {
      data.longestSessionMs = Math.max(data.longestSessionMs, now.getTime() - activeSessionStartedAt.getTime())
      data.completedSessionCount += 1
    }
    activeSessionStartedAt = null
    lastAccountedAt = null
  } else {
    data.firstUsedAt ??= now.toISOString()
    activeSessionStartedAt = now
    lastAccountedAt = now
  }
  data.enabled = enabled
  data.updatedAt = now.toISOString()
  await queuePersist()
  notify()
}

export const resetUsageStatistics = async (): Promise<void> => {
  await initializeUsageStatistics()
  const enabled = data.enabled
  const now = new Date()
  data = emptyUsageStatistics(enabled, now)
  if (enabled) {
    data.firstUsedAt = now.toISOString()
    data.launchCount = 1
    activeSessionStartedAt = now
    lastAccountedAt = now
  }
  await queuePersist()
  notify()
}

export const exportUsageStatistics = async (): Promise<boolean> => {
  await initializeUsageStatistics()
  const result = await window.moonSprite.saveUsageStatisticsFile(`moonsprite-usage-statistics-${new Date().toISOString().slice(0, 10)}.json`)
  if (result.canceled || !result.filePath) return false
  const encoded = new TextEncoder().encode(JSON.stringify(snapshotData(), null, 2))
  await window.moonSprite.writeBinaryAtomic(result.filePath, encoded)
  playExportSuccessSound()
  return true
}

export const usageStatisticsStoragePath = (): Promise<string> => window.moonSprite.usageStatisticsPath()
export const openUsageStatisticsFolder = (): Promise<void> => window.moonSprite.openUsageStatisticsFolder()
