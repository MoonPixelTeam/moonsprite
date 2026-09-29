import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from './document'
import { encodeAnimatedWebp, exportAnimatedImage } from './webp-animation'
import { saveExportPresets, loadExportPresets } from './export-settings'
import { exportDocumentFile } from '@/store/document-file-service'
import type { MoonSpriteApi } from '@shared/types-platform'

// A single-frame RIFF envelope; browser pixel encoding is stubbed separately from muxing.
const still = new Uint8Array([82,73,70,70,14,0,0,0,87,69,66,80,86,80,56,76,1,0,0,0,47,0])
const u24 = (b: Uint8Array, o: number) => b[o] | b[o + 1] << 8 | b[o + 2] << 16
function chunks(bytes: Uint8Array) {
  const result: Array<{ tag: string; data: Uint8Array }> = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(view.getUint32(4, true)).toBe(bytes.length - 8)
  for (let o = 12; o < bytes.length;) {
    const size = view.getUint32(o + 4, true)
    result.push({ tag: String.fromCharCode(...bytes.subarray(o, o + 4)), data: bytes.slice(o + 8, o + 8 + size) })
    o += 8 + size + (size & 1)
  }
  return result
}
function mockEncoder() {
  const pixels: number[][] = []
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return { putImageData: (data: { data: Uint8ClampedArray }) => pixels.push([...data.data]) } }
    async convertToBlob() { return { arrayBuffer: async () => still.slice().buffer } }
  })
  return pixels
}
function fixture() {
  const doc = createDocument('webp', 1, 1, 'rgba')
  const timeline = doc.animation!
  timeline.frames = [{ id: 'a', duration: 70 }, { id: 'b', duration: 230 }]
  timeline.activeFrameId = 'a'
  doc.layers[0].pixels.set([255, 0, 0, 255])
  timeline.cels = timeline.frames.map((frame, i) => ({ id: `cel-${i}`, layerId: doc.layers[0].id, frameId: frame.id, surface: { format: 'rgba' as const, width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(i ? [0, 0, 0, 0] : [255, 0, 0, 255]) } }))
  return doc
}
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })
it.each([true, false])('writes durations, canvas size, loop and replacement flags: %s', loop => {
  const result = chunks(encodeAnimatedWebp([{ bytes: still, duration: 70 }, { bytes: still, duration: 230 }], 2, 3, loop))
  expect(result.map(c => c.tag)).toEqual(['VP8X', 'ANIM', 'ANMF', 'ANMF'])
  expect(u24(result[0].data, 4)).toBe(1)
  expect(u24(result[0].data, 7)).toBe(2)
  expect(result[1].data[4]).toBe(loop ? 0 : 1)
  expect(result.slice(2).map(c => u24(c.data, 12))).toEqual([70, 230])
  expect(result.slice(2).map(c => c.data[15])).toEqual([2, 2])
  expect(result[2].data.slice(16)).toEqual(still.slice(12))
})
it('rejects non-WebP browser fallback and truncated frame chunks', () => {
  expect(() => encodeAnimatedWebp([{ bytes: new Uint8Array(20), duration: 100 }], 1, 1, false)).toThrow()
  expect(() => encodeAnimatedWebp([{ bytes: still.slice(0, -1), duration: 100 }], 1, 1, false)).toThrow()
})
it('uses the selected frame order, transparency and original durations', async () => {
  const pixels = mockEncoder()
  const output = await exportAnimatedImage(fixture(), { scalePercent: 100, direction: 'reverse' }, 'webp')
  expect(output.frameCount).toBe(2)
  expect(pixels.map(p => p[3])).toEqual([0, 255])
  expect(chunks(output.bytes).filter(c => c.tag === 'ANMF').map(c => u24(c.data, 12))).toEqual([230, 70])
})
it('exports an old WebP frames target as one file and migrates presets', async () => {
  mockEncoder()
  vi.stubGlobal('Worker', undefined)
  const writeBinaryAtomic = vi.fn(async (_path: string, _bytes: Uint8Array) => {})
  const options = { name: 'webp', format: 'webp' as const, target: 'frames' as const, scalePercent: 100, directory: 'D:/exports', gifFrameRange: 'range' as const, gifFrameStart: 1, gifFrameEnd: 2 }
  await exportDocumentFile({ writeBinaryAtomic } as unknown as MoonSpriteApi, fixture(), options)
  expect(writeBinaryAtomic).toHaveBeenCalledTimes(1)
  expect(writeBinaryAtomic.mock.calls[0][0]).toBe('D:/exports/webp.webp')
  expect(chunks(writeBinaryAtomic.mock.calls[0][1]).filter(c => c.tag === 'ANMF')).toHaveLength(2)
  saveExportPresets([{ ...options, presetName: 'webp' }])
  expect(loadExportPresets()[0].target ?? 'document').toBe('document')
  expect(loadExportPresets()[0]).toMatchObject({ gifFrameStart: 1, gifFrameEnd: 2 })
})
it('encodes a selected WebP range in the document worker as one animation', async () => {
  mockEncoder()
  const messages: Array<{ result?: { bytes: Uint8Array }; error?: string }> = []
  const previous = globalThis.onmessage
  vi.stubGlobal('postMessage', (message: typeof messages[number]) => messages.push(message))
  try {
    await import('@/workers/document-export.worker')
    await (globalThis.onmessage as unknown as (event: MessageEvent) => Promise<void>)({ data: { id: 1, job: 'document', document: fixture(), format: 'webp', scalePercent: 100, gifFrameRange: 'range', gifFrameStart: 2, gifFrameEnd: 2 } } as MessageEvent)
    expect(messages.filter(m => m.error)).toEqual([])
    const results = messages.filter(m => m.result)
    expect(results).toHaveLength(1)
    expect(chunks(results[0].result!.bytes).filter(c => c.tag === 'ANMF').map(c => u24(c.data, 12))).toEqual([230])
  } finally { globalThis.onmessage = previous }
})
