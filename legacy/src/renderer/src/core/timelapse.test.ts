import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { captureTimelapseSnapshot, captureTimelapseSnapshotAsync, commitPreparedTimelapseSnapshot, createTimelapseCaptureCache, prepareTimelapseSnapshot, resolveTimelapseMimeType, retainTimelapseSnapshotsWithinBytes, TIMELAPSE_SMART_TARGET_FRAMES, TIMELAPSE_SNAPSHOT_BYTE_BUDGET, timelapseFrameDurations, timelapseFrameHoldMs, timelapseImageOutputDimensions, timelapseOutputDimensions, timelapseOutputScale, timelapsePreviewFramePlan, timelapseSourceDurationMs, timelapseVideoFramePlan } from './timelapse'
import { createDocument, getActiveLayer, readLayerColor, writeLayerColor } from './document'
import { decodePng } from './png'
import { normalizeTimelapseSettings } from './project-metadata'

describe('timelapse video encoding helpers', () => {

  it('bounds retained snapshot bytes for a large multi-frame recording', () => {
    const snapshots = Array.from({ length: 180 }, (_, index) => ({
      id: `snapshot-${index}`,
      capturedAt: index,
      elapsedMs: 1,
      width: 2400,
      height: 2400,
      changeScore: index % 17 === 0 ? 1 : 0.1,
      data: new Uint8Array(2 * 1024 * 1024)
    }))
    const retained = retainTimelapseSnapshotsWithinBytes(snapshots)
    const beforeBytes = snapshots.reduce((total, frame) => total + frame.data.byteLength, 0)
    const afterBytes = retained.reduce((total, frame) => total + frame.data.byteLength, 0)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, quality: 'high', encodedFrameBytes: 2 * 1024 * 1024 },
      inputFrames: snapshots.length,
      retainedFrames: retained.length,
      beforeBytes,
      afterBytes,
      budgetBytes: TIMELAPSE_SNAPSHOT_BYTE_BUDGET,
      reductionRatio: 1 - afterBytes / beforeBytes
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/timelapse-byte-budget-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(afterBytes).toBeLessThanOrEqual(TIMELAPSE_SNAPSHOT_BYTE_BUDGET)
    expect(retained.at(-1)?.id).toBe('snapshot-179')
    expect(evidence.reductionRatio).toBeGreaterThan(0.25)
  })

  it('defaults undo-step recording off while preserving an explicit opt-in', () => {
    expect(normalizeTimelapseSettings(undefined).recordUndoSteps).toBe(false)
    expect(normalizeTimelapseSettings({ recordUndoSteps: true }).recordUndoSteps).toBe(true)
  })

  it('defaults timelapse recording to smart sampling', () => {
    expect(normalizeTimelapseSettings(undefined).mode).toBe('smart')
    expect(normalizeTimelapseSettings({ mode: 'full' }).mode).toBe('full')
  })

  it('selects a supported WebM codec in preference order', () => {
    expect(resolveTimelapseMimeType('webm', (candidate) => candidate === 'video/webm;codecs=vp8'))
      .toBe('video/webm;codecs=vp8')
  })

  it('returns null when the runtime cannot encode the requested video format', () => {
    expect(resolveTimelapseMimeType('mp4', () => false)).toBeNull()
    expect(resolveTimelapseMimeType('webm', () => false)).toBeNull()
  })



  it('distributes frames to an exact requested duration or speed', () => {
    const settings = { fps: 12, speed: 4, snapshots: [{ elapsedMs: 100 }, { elapsedMs: 300 }] } as never
    expect(timelapseSourceDurationMs(settings)).toBeCloseTo(1000 / 6)
    expect(timelapseFrameDurations(settings, { mode: 'duration', durationSeconds: 10 })).toEqual([5000, 5000])
    expect(timelapseFrameDurations(settings, { mode: 'speed', durationSeconds: 1 })).toEqual([1000 / 48, 1000 / 48])
  })

  it('samples enough distinct operation frames for short fixed-FPS exports', () => {
    const settings = { fps: 12, speed: 1, snapshots: Array.from({ length: 100 }, (_, index) => ({ elapsedMs: index * 10 })) } as never
    const oneSecond = timelapseVideoFramePlan(settings, { mode: 'duration', durationSeconds: 1 })
    const twoSeconds = timelapseVideoFramePlan(settings, { mode: 'duration', durationSeconds: 2 })

    expect(oneSecond).toHaveLength(12)
    expect(twoSeconds).toHaveLength(24)
    expect(oneSecond[0].snapshotIndex).toBe(0)
    expect(oneSecond.at(-1)?.snapshotIndex).toBe(99)
    expect(new Set(oneSecond.map((frame) => frame.snapshotIndex)).size).toBeGreaterThan(10)
    expect(timelapseImageOutputDimensions([{ width: 8, height: 4 }, { width: 16, height: 8 }] as never, 200)).toEqual({ width: 32, height: 16 })
  })

  it('previews every retained snapshot before export sampling', () => {
    const snapshots = Array.from({ length: 240 }, (_, index) => ({ elapsedMs: index * 10 }))
    const plan = timelapsePreviewFramePlan({ fps: 12, speed: 4, snapshots } as never)
    expect(plan).toHaveLength(240)
    expect(plan[0].snapshotIndex).toBe(0)
    expect(plan.at(-1)?.snapshotIndex).toBe(239)
  })



  it('discards an asynchronous capture when the document revision changes', async () => {
    const document = createDocument('stale timelapse', 128, 128, 'rgba')
    const cache = createTimelapseCaptureCache()
    let currentRevision = 1
    document.timelapse = { enabled: true, quality: 'low', fps: 12, speed: 8, mode: 'full', snapshots: [] }

    const capture = captureTimelapseSnapshotAsync(document, 1000, {
      cache,
      contentRevision: 1,
      contentInvalidation: { kind: 'full', fromRevision: 0, revision: 1 },
      shouldCommit: () => currentRevision === 1
    })
    currentRevision = 2
    await capture

    expect(document.timelapse.snapshots).toHaveLength(0)
  })



})
