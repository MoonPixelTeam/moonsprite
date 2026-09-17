import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { unzipSync, zipSync } from 'fflate'
import { createDocument } from '@/core/document-model'
import { encodePng } from '@/core/png-encode'
import { decodeProject } from '@/core/project-format'
import { encodeProject } from '@/core/project-format-encode'
import { configureRuntimeDiagnostics, resetRuntimeDiagnosticsForTests, runtimeDiagnosticSnapshot } from '@/core/runtime-diagnostics'
import { MAX_TIMELAPSE_ARCHIVE_BYTES, storedTimelapseEntryViews } from '@/core/project-format-zip'
/** CRC-32 of the raw frame bytes, as the zip central directory expects. */
const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
const pixels = (value: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(4 * 4 * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value
    data[index + 3] = 255
  }
  return data
}

const recordingDocument = (frames: readonly number[]) => {
  const document = createDocument('timelapse archive', 4, 4, 'rgba')
  document.timelapse = {
    enabled: true,
    recordUndoSteps: false,
    quality: 'medium',
    fps: 12,
    speed: 8,
    mode: 'full',
    snapshots: frames.map((value, index) => ({
      id: `frame-${index}`,
      capturedAt: index,
      elapsedMs: index === 0 ? 0 : 1,
      width: 4,
      height: 4,
      data: encodePng(pixels(value), 4, 4, true).bytes
    }))
  }
  return document
}

describe('timelapse archive restore', () => {
  beforeEach(() => { configureRuntimeDiagnostics(() => {}) })
  afterEach(() => { vi.restoreAllMocks(); resetRuntimeDiagnosticsForTests() })

  it('reports frames the manifest declares but the archive no longer carries', () => {
    const archive = encodeProject(recordingDocument([10, 20, 30]))
    const files = unzipSync(archive)
    // Simulate a truncated or repacked archive that lost one frame payload.
    delete files['timelapse/frame-1.png']
    const reports: unknown[] = []

    const restored = decodeProject(zipSync(files), { onDroppedTimelapseFrames: (report) => reports.push(report) })

    expect(restored.timelapse?.snapshots.map((snapshot) => snapshot.id)).toEqual(['frame-0', 'frame-2'])
    expect(reports).toEqual([{ droppedTimelapseFrames: 1, dropReasons: ['missing-data'], timelapseFrames: 2 }])
    expect(runtimeDiagnosticSnapshot().find((event) => event.name === 'project.timelapse.restore')?.detail)
      .toMatchObject({ declaredFrames: 3, droppedFrames: 1, restoredFrames: 2, reasons: 'missing-data' })
  })

  it('reports frames whose manifest dimensions are unusable', () => {
    const archive = encodeProject(recordingDocument([10, 20]))
    const files = unzipSync(archive)
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
    manifest.document.timelapse.snapshots[0].width = 0
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))
    const reports: { droppedTimelapseFrames: number; dropReasons: string[] }[] = []

    const restored = decodeProject(zipSync(files), { onDroppedTimelapseFrames: (report) => reports.push(report) })

    expect(restored.timelapse?.snapshots).toHaveLength(1)
    expect(reports[0].droppedTimelapseFrames).toBe(1)
    expect(reports[0].dropReasons).toEqual(['invalid-dimensions'])
  })

  it('stays silent and diagnostic-free when every frame restores', () => {
    const reports: unknown[] = []
    const restored = decodeProject(encodeProject(recordingDocument([10, 20])), { onDroppedTimelapseFrames: (report) => reports.push(report) })

    expect(restored.timelapse?.snapshots).toHaveLength(2)
    expect(reports).toHaveLength(0)
    expect(runtimeDiagnosticSnapshot().some((event) => event.name === 'project.timelapse.restore')).toBe(false)
  })

  it('restores frames that another tool re-packed with deflate compression', () => {
    const archive = encodeProject(recordingDocument([10, 20, 30]))
    const files = unzipSync(archive)
    // MoonSprite stores timelapse PNGs with level 0; a foreign repack may deflate them.
    const repacked = zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, [data, { level: name.startsWith('timelapse/') ? 6 : 0 }] as const])), { level: 0 })

    const restored = decodeProject(repacked)

    expect(restored.timelapse?.snapshots.map((snapshot) => snapshot.id)).toEqual(['frame-0', 'frame-1', 'frame-2'])
  })

  it('bounds the timelapse payload an archive may expand to', () => {
    const directory = new Map([['timelapse/oversized.png', {
      compression: 8, flags: 0, compressedSize: 1,
      uncompressedSize: MAX_TIMELAPSE_ARCHIVE_BYTES + 1, localOffset: 0
    }]])
    // Check the advertised expansion before any allocation/inflate occurs.
    expect(() => storedTimelapseEntryViews(new Uint8Array(), directory)).toThrow('preserve the complete recording')
  })
})
