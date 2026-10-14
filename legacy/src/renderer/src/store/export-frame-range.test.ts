import { afterEach, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { createDocument } from '@/core/document'
import { decodePng } from '@/core/png'
import { exportFrameIds } from '@/core/export-frame-range'
import { loadDocumentExportSettings, loadExportPresets, saveExportPresets } from '@/core/export-settings'
import { exportDocumentFile } from './document-file-service'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function fixture() {
  const document = createDocument('range', 1, 1, 'rgba')
  const layer = document.layers[0]
  const timeline = document.animation!
  timeline.frames = [1, 2, 3, 4].map(n => ({ id: `frame-${n}`, duration: 100 }))
  timeline.activeFrameId = 'frame-1'
  layer.pixels.set([10, 0, 0, 255])
  timeline.cels = timeline.frames.map((frame, i) => ({ id: `cel-${i}`, frameId: frame.id, layerId: layer.id, surface: { format: 'rgba' as const, width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray([(i + 1) * 10, 0, 0, 255]) } }))
  timeline.loopSections = [{ id: 'walk', name: 'Walk', startFrameId: 'frame-3', endFrameId: 'frame-4', direction: 'forward', repeatCount: 1 }]
  return document
}

it.each([
  { gifFrameRange: 'range' as const, gifFrameStart: 2, gifFrameEnd: 3, expected: [20, 30] },
  { gifFrameRange: 'loop-section' as const, gifLoopSectionId: 'walk', expected: [30, 40] },
  { gifFrameRange: 'range' as const, gifFrameStart: 2, gifFrameEnd: 3, gifDirection: 'reverse' as const, expected: [30, 20] }
])('exports only selected PNG pixels and remembers the non-GIF range: %j', async ({ expected, ...range }) => {
  vi.stubGlobal('Worker', undefined)
  const document = fixture()
  const writeBinaryAtomic = vi.fn(async (_path: string, _bytes: Uint8Array) => {})
  await exportDocumentFile({ writeBinaryAtomic } as unknown as MoonSpriteApi, document, { name: 'range', format: 'png-rgba', target: 'frames', scalePercent: 100, directory: 'D:/exports', ...range })
  expect(writeBinaryAtomic.mock.calls.map(([path]) => path)).toEqual(['D:/exports/range-001.png', 'D:/exports/range-002.png'])
  expect(writeBinaryAtomic.mock.calls.map(([, bytes]) => decodePng(bytes, 'frame').layers[0].pixels[0])).toEqual(expected)
  expect(loadDocumentExportSettings(document)).toMatchObject(range)
  saveExportPresets([{ presetName: 'range preset', name: 'range', format: 'png-rgba', target: 'frames', scalePercent: 100, ...range }])
  expect(loadExportPresets()[0]).toMatchObject(range)
})

it('clamps invalid ranges and falls back when a remembered loop section was deleted', () => {
  const document = fixture()
  expect(exportFrameIds(document, { gifFrameRange: 'range', gifFrameStart: 9, gifFrameEnd: -1 })).toEqual(['frame-4'])
  expect(exportFrameIds(document, { gifFrameRange: 'loop-section', gifLoopSectionId: 'deleted' })).toHaveLength(4)
})

it('uses the selected frame order in worker exports', async () => {
  const messages: Array<{ result?: { index: number; bytes: Uint8Array }; error?: string; done?: boolean }> = []
  const previous = globalThis.onmessage
  vi.stubGlobal('postMessage', (message: typeof messages[number]) => messages.push(message))
  try {
    await import('@/workers/document-export.worker')
    const handle = globalThis.onmessage as unknown as (event: MessageEvent) => Promise<void>
    await handle({ data: { id: 1, job: 'frames', document: fixture(), format: 'png-rgba', scalePercent: 100, gifFrameRange: 'loop-section', gifLoopSectionId: 'walk' } } as MessageEvent)
    expect(messages.some(message => message.error)).toBe(false)
    expect(messages.filter(message => message.result).map(message => decodePng(message.result!.bytes, 'frame').layers[0].pixels[0])).toEqual([30, 40])
    expect(messages.at(-1)?.done).toBe(true)
  } finally { globalThis.onmessage = previous }
})
