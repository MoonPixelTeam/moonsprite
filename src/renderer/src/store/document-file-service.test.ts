import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeCanvas } from 'ag-psd'
import type { MoonSpriteApi, ScaledPngWriteOptions } from '@shared/types'
import { createDocument } from '@/core/document'
import { setRuntimeAppLocale } from '@/core/localization'
import { decodePng } from '@/core/png'
import { encodePng } from '@/core/png-encode'
import { exportDocumentFile, exportSpriteSheetFile, exportTimelapseFile, saveDocumentFile } from './document-file-service'

beforeAll(() => {
  initializeCanvas(
    (width, height) => ({ width, height } as HTMLCanvasElement),
    (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height, colorSpace: 'srgb' } as ImageData)
  )
})

beforeEach(() => {
  setRuntimeAppLocale(null)
  localStorage.clear()
})

const exportApi = () => {
  const exportImage = vi.fn(async () => ({ canceled: false, filePath: 'D:/exports/layers.psd' }))
  const writeBinaryAtomic = vi.fn(async (_filePath: string, _data: Uint8Array) => {})
  const getResourceInfo = vi.fn(async () => ({ totalBytes: 1, freeBytes: 1 }))
  const api = {
    getResourceInfo,
    exportImage,
    writeBinaryAtomic
  } as unknown as MoonSpriteApi
  return { api, exportImage, writeBinaryAtomic, getResourceInfo }
}

describe('document PSD export service', () => {
  it('writes a layered PSD file directly to an explicit export directory', async () => {
    const { api, exportImage, writeBinaryAtomic, getResourceInfo } = exportApi()
    const document = createDocument('Layered project', 2, 2, 'rgba')

    await expect(exportDocumentFile(api, document, { name: 'layers.psd', format: 'psd', scalePercent: 100, target: 'document', directory: 'D:/exports' })).resolves.toBe('已导出 PSD 工程。')

    expect(exportImage).not.toHaveBeenCalled()
    expect(getResourceInfo).not.toHaveBeenCalled()
    expect(writeBinaryAtomic).toHaveBeenCalledTimes(1)
    expect(writeBinaryAtomic.mock.calls[0][0]).toBe('D:/exports/layers.psd')
    expect(new TextDecoder().decode(writeBinaryAtomic.mock.calls[0][1].subarray(0, 4))).toBe('8BPS')
  })

  it('keeps the native export dialog fallback when no directory is supplied', async () => {
    const { api, exportImage, writeBinaryAtomic } = exportApi()
    const document = createDocument('Layered project', 2, 2, 'rgba')

    await expect(exportDocumentFile(api, document, { name: 'layers.psd', format: 'psd', scalePercent: 100, target: 'document' })).resolves.toBe('已导出 PSD 工程。')

    expect(exportImage).toHaveBeenCalledWith('layers.psd', 'psd')
    expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/exports/layers.psd', expect.any(Uint8Array))
  })




})

describe('native PNG export service', () => {
  it('delegates scaling to the atomic platform writer without allocating the scaled surface in the renderer', async () => {
    const writeScaledPngAtomic = vi.fn(async (_filePath: string, _source: Uint8Array, _options: ScaledPngWriteOptions, onProgress?: (value: number) => void) => {
      onProgress?.(0)
      onProgress?.(50)
      onProgress?.(100)
      return { indexed: false }
    })
    const writeBinaryAtomic = vi.fn(async () => {})
    const getResourceInfo = vi.fn(async () => ({ totalBytes: 1, freeBytes: 1 }))
    const api = { writeScaledPngAtomic, writeBinaryAtomic, getResourceInfo } as unknown as MoonSpriteApi
    const progress: number[] = []
    const document = createDocument('Large export', 2, 1, 'rgba')
    const layer = document.layers[0]
    if (layer.format !== 'rgba') throw new Error('Expected an RGBA layer')
    layer.pixels.set([255, 0, 0, 255, 0, 0, 255, 128])

    await expect(exportDocumentFile(api, document, { name: 'large', format: 'png-rgba', scalePercent: 1000, target: 'document', directory: 'D:/exports' }, {
      onEncodeProgress: (value) => progress.push(value)
    })).resolves.toContain('PNG')

    expect(getResourceInfo).not.toHaveBeenCalled()
    expect(writeBinaryAtomic).not.toHaveBeenCalled()
    expect(writeScaledPngAtomic).toHaveBeenCalledTimes(1)
    const [filePath, source, options] = writeScaledPngAtomic.mock.calls[0]
    expect(filePath).toBe('D:/exports/large.png')
    expect(Array.from(source)).toEqual([255, 0, 0, 255, 0, 0, 255, 128])
    expect(options).toEqual({ sourceWidth: 2, sourceHeight: 1, outputWidth: 20, outputHeight: 10, forceRgba: true })
    expect(progress).toEqual([0, 50, 100])
  })



  it('propagates cancellation after the native writer exposes its cancel handle', async () => {
    const nativeCancel = vi.fn()
    const writeScaledPngAtomic = vi.fn(async (
      _filePath: string,
      _source: Uint8Array,
      _options: ScaledPngWriteOptions,
      _onProgress?: (value: number) => void,
      onCancelReady?: (cancel: () => void) => void
    ) => {
      onCancelReady?.(nativeCancel)
      return { indexed: false }
    })
    const api = { writeScaledPngAtomic } as unknown as MoonSpriteApi
    const document = createDocument('cancel export', 1, 1, 'rgba')
    let canceled = false

    await expect(exportDocumentFile(api, document, { name: 'cancel-export', format: 'png-rgba', scalePercent: 100, target: 'document', directory: 'D:/exports' }, {
      isCanceled: () => canceled,
      onCancelReady: (cancel) => {
        canceled = true
        cancel()
      }
    })).rejects.toThrow('export canceled')

    expect(nativeCancel).toHaveBeenCalledTimes(1)
  })
})

describe('timelapse image sequence export service', () => {
  it('chooses one path and writes numbered PNG frames at the requested scale', async () => {
    const exportImage = vi.fn(async () => ({ canceled: false, filePath: 'D:/exports/process.png' }))
    const writes: Array<{ filePath: string; data: Uint8Array }> = []
    const writeBinaryAtomic = vi.fn(async (filePath: string, data: Uint8Array) => { writes.push({ filePath, data }) })
    const getResourceInfo = vi.fn(async () => ({ totalBytes: 1, freeBytes: 1 }))
    const api = {
      getResourceInfo,
      exportImage,
      writeBinaryAtomic
    } as unknown as MoonSpriteApi
    const document = createDocument('Process', 2, 1, 'rgba')
    const frame = (id: string, color: [number, number, number, number], elapsedMs: number) => ({
      id,
      capturedAt: elapsedMs,
      elapsedMs,
      width: 2,
      height: 1,
      data: encodePng(new Uint8ClampedArray([...color, 0, 0, 0, 0]), 2, 1, true).bytes
    })
    document.timelapse = { enabled: true, quality: 'low', fps: 12, speed: 1, snapshots: [frame('one', [255, 0, 0, 255], 100), frame('two', [0, 255, 0, 255], 200)] }

    await expect(exportTimelapseFile(api, document, 'png', { mode: 'duration', durationSeconds: 1, scalePercent: 200 })).resolves.toBe('已导出 2 张 PNG 图片。')

    expect(exportImage).toHaveBeenCalledTimes(1)
    expect(getResourceInfo).not.toHaveBeenCalled()
    expect(writeBinaryAtomic).toHaveBeenCalledTimes(2)
    expect(writes.map((entry) => entry.filePath)).toEqual(['D:/exports/process-001.png', 'D:/exports/process-002.png'])
    expect(decodePng(writes[0].data)).toMatchObject({ width: 4, height: 2 })
    expect(decodePng(writes[1].data)).toMatchObject({ width: 4, height: 2 })
  })
})

describe('sprite sheet file export service', () => {
  it('writes one combined PNG file to the selected directory with a safe name', async () => {
    const writeBinaryAtomic = vi.fn(async (_filePath: string, _data: Uint8Array) => {})
    const chooseDirectory = vi.fn(async () => ({ canceled: false, directoryPath: 'D:/exports' }))
    const api = { writeBinaryAtomic, chooseDirectory } as unknown as MoonSpriteApi
    const document = createDocument('Combined', 1, 2, 'rgba')

    await expect(exportSpriteSheetFile(api, document, 'Hero.png', 'D:/exports')).resolves.toBe('D:/exports/Hero.png')

    expect(chooseDirectory).not.toHaveBeenCalled()
    expect(writeBinaryAtomic.mock.calls.map(([filePath]) => filePath)).toEqual(['D:/exports/Hero.png'])
    for (const [, bytes] of writeBinaryAtomic.mock.calls) {
      expect(Array.from(bytes.subarray(1, 4))).toEqual([80, 78, 71])
    }
  })
})
