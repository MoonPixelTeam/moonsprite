import { afterEach, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { createDocument } from '@/core/document'
import type { DocumentSession } from '@/store/workspace-types'
import { createWorkspaceRecording } from '@/store/workspace-recording'
import { initializeUsageStatistics, usageStatisticsSnapshot, setUsageStatisticsEnabled, resetUsageStatistics } from './usage-statistics'
import { parseUsageStatistics } from '@/core/usage-statistics'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('persists committed drawing across projects, honors disable/reset, and round-trips the duration', async () => {
  vi.useFakeTimers()
  const write = vi.fn(async (_json: string) => {})
  Object.defineProperty(window, 'moonSprite', { configurable: true, value: {
    readUsageStatistics: vi.fn(async () => JSON.stringify({ drawingTimeMs: 12_000 })), writeUsageStatistics: write
  } as unknown as MoonSpriteApi })
  await initializeUsageStatistics()
  const recording = createWorkspaceRecording(vi.fn())
  const session = { document: createDocument('drawing', 2, 2, 'rgba') } as DocumentSession
  recording.recordDocumentOperation(session, { stroke: true, durationMs: 2_500 }, false)
  recording.recordDocumentOperation(session, { stroke: true, durationMs: 1_250 }, false)
  await vi.advanceTimersByTimeAsync(2_001)
  expect(usageStatisticsSnapshot().data).toMatchObject({ drawingTimeMs: 15_750, drawingStrokeCount: 2 })
  const persisted = write.mock.calls.at(-1)![0]
  expect(parseUsageStatistics(persisted).drawingTimeMs).toBe(15_750)
  // Opening or closing a document must not import its historical time.
  session.document.statistics!.drawingTimeMs = 999_999
  expect(usageStatisticsSnapshot().data.drawingTimeMs).toBe(15_750)
  await setUsageStatisticsEnabled(false)
  recording.recordDocumentOperation(session, { stroke: true, durationMs: 8_000 }, false)
  await vi.advanceTimersByTimeAsync(2_001)
  expect(usageStatisticsSnapshot().data.drawingTimeMs).toBe(15_750)
  await setUsageStatisticsEnabled(true)
  recording.recordDocumentOperation(session, { durationMs: 500 }, false)
  await vi.advanceTimersByTimeAsync(2_001)
  expect(usageStatisticsSnapshot().data.drawingTimeMs).toBe(16_250)
  await resetUsageStatistics()
  expect(usageStatisticsSnapshot().data).toMatchObject({ drawingTimeMs: 0, drawingStrokeCount: 0 })
})
