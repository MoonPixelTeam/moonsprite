import { afterEach, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { createDocument } from '@/core/document'
import * as timelapse from '@/core/timelapse'
import { exportTimelapseFile } from './document-file-service'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

const fixture = () => {
  const document = createDocument('Process', 1, 1, 'rgba')
  document.timelapse = { enabled: true, quality: 'low', fps: 12, speed: 1, snapshots: [
    { id: 'one', capturedAt: 100, elapsedMs: 100, width: 1, height: 1, data: new Uint8Array([1]) },
    { id: 'two', capturedAt: 200, elapsedMs: 100, width: 1, height: 1, data: new Uint8Array([2]) }
  ] }
  const exportImage = vi.fn()
  const writeBinaryAtomic = vi.fn(async () => {})
  const fileExists = vi.fn(async (path: string) => !path.includes(' (1)'))
  const api = { exportImage, writeBinaryAtomic, fileExists } as unknown as MoonSpriteApi
  return { document, api, exportImage, writeBinaryAtomic }
}

it('resolves a video name conflict before encoding or displaying progress', async () => {
  const { document, api, exportImage, writeBinaryAtomic } = fixture()
  const order: string[] = []
  const encode = vi.spyOn(timelapse, 'encodeTimelapseVideo').mockImplementation(async () => {
    order.push('encode')
    return new Uint8Array([3])
  })
  const result = await exportTimelapseFile(api, document, 'mp4', {
    name: 'process.mp4', directory: 'D:/exports', mode: 'speed', durationSeconds: 1, quality: 'high', speed: 8
  }, {
    onConflict: async () => { order.push('conflict'); return 'rename' },
    onEncodeStart: () => { order.push('progress') },
    onWriteStart: () => { order.push('write') }
  })
  expect(result).toBeTruthy()
  expect(order).toEqual(['conflict', 'progress', 'encode', 'write'])
  expect(exportImage).not.toHaveBeenCalled()
  expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/exports/process (1).mp4', new Uint8Array([3]))
  expect(encode.mock.calls[0][0]).toMatchObject({ quality: 'high', speed: 8 })
  expect(document.timelapse).toMatchObject({ quality: 'low', speed: 1 })
})

it('cancels a video conflict before starting expensive work', async () => {
  const { document, api, writeBinaryAtomic } = fixture()
  const encode = vi.spyOn(timelapse, 'encodeTimelapseVideo')
  const progress = vi.fn()
  expect(await exportTimelapseFile(api, document, 'webm', {
    name: 'process.webm', directory: 'D:/exports', mode: 'duration', durationSeconds: 1
  }, { onConflict: async () => 'cancel', onEncodeStart: progress })).toBeNull()
  expect(encode).not.toHaveBeenCalled()
  expect(progress).not.toHaveBeenCalled()
  expect(writeBinaryAtomic).not.toHaveBeenCalled()
})

it('checks all image sequence conflicts before starting any export', async () => {
  const { document, api, exportImage, writeBinaryAtomic } = fixture()
  const progress = vi.fn()
  const conflict = vi.fn().mockResolvedValueOnce('rename').mockResolvedValueOnce('cancel')
  expect(await exportTimelapseFile(api, document, 'png', {
    name: 'process.png', directory: 'D:/exports', mode: 'duration', durationSeconds: 1
  }, { onConflict: conflict, onEncodeStart: progress })).toBeNull()
  expect(conflict).toHaveBeenCalledTimes(2)
  expect(exportImage).not.toHaveBeenCalled()
  expect(progress).not.toHaveBeenCalled()
  expect(writeBinaryAtomic).not.toHaveBeenCalled()
})
