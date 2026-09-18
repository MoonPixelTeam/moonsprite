import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeCanvas } from 'ag-psd'
import type { MoonSpriteApi, ScaledPngWriteOptions } from '@shared/types-platform'
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
  it('writes Save As directly to its selected directory without reopening the native save dialog', async () => {
    const saveProject = vi.fn(async () => ({ canceled: true }))
    const writeBinaryAtomic = vi.fn(async () => {})
    const document = createDocument('Chosen location', 2, 2, 'rgba')
    const current = { document, revision: 1 }
    const api = { saveProject, writeBinaryAtomic } as unknown as MoonSpriteApi

    await expect(saveDocumentFile({
      api,
      documentId: document.id,
      getDocument: () => current,
      saveAs: true,
      options: { name: 'chosen-location', format: 'moonsprite', scalePercent: 100, directory: 'D:/selected-folder' },
      preferredImageFormat: null
    })).resolves.toMatchObject({ filePath: 'D:/selected-folder/chosen-location.moonsprite' })

    expect(saveProject).not.toHaveBeenCalled()
    expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/selected-folder/chosen-location.moonsprite', expect.any(Uint8Array))
  })

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

  it('exports an editable Aseprite project with the requested .ase extension', async () => {
    const { api, writeBinaryAtomic } = exportApi()
    const document = createDocument('Aseprite project', 2, 2, 'rgba')

    await expect(exportDocumentFile(api, document, { name: 'sprite', format: 'ase', scalePercent: 100, target: 'document', directory: 'D:/exports' })).resolves.toBe('已导出 ASE 图像。')

    expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/exports/sprite.ase', expect.any(Uint8Array))
    const bytes = writeBinaryAtomic.mock.calls[0][1]
    expect(bytes[4]).toBe(0xe0)
    expect(bytes[5]).toBe(0xa5)
  })

  it('waits for an explicit decision before writing over an existing export', async () => {
    const writeBinaryAtomic = vi.fn(async () => {})
    const fileExists = vi.fn(async (filePath: string) => filePath === 'D:/exports/layers.psd' || filePath === 'D:/exports/layers (1).psd')
    const api = { fileExists, writeBinaryAtomic } as unknown as MoonSpriteApi
    const document = createDocument('Layered project', 2, 2, 'rgba')
    const decisions: string[] = []

    await expect(exportDocumentFile(api, document, { name: 'layers.psd', format: 'psd', scalePercent: 100, target: 'document', directory: 'D:/exports' }, {
      onConflict: async (path, suggested) => { decisions.push(`${path}|${suggested}`); return 'rename' }
    })).resolves.toBe('已导出 PSD 工程。')

    expect(decisions).toEqual(['D:/exports/layers.psd|D:/exports/layers (2).psd'])
    expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/exports/layers (2).psd', expect.any(Uint8Array))
  })

  it('cancels an export when the conflict decision is canceled', async () => {
    const writeBinaryAtomic = vi.fn(async () => {})
    const fileExists = vi.fn(async () => true)
    const api = { fileExists, writeBinaryAtomic } as unknown as MoonSpriteApi
    const document = createDocument('Layered project', 2, 2, 'rgba')

    await expect(exportDocumentFile(api, document, { name: 'layers.psd', format: 'psd', scalePercent: 100, target: 'document', directory: 'D:/exports' }, {
      onConflict: async () => 'cancel'
    })).resolves.toBeNull()
    expect(writeBinaryAtomic).not.toHaveBeenCalled()
  })




})

describe('native PNG export service', () => {
  it('isolates a selected layer through the normal composite pipeline', async () => {
    const writeBinaryAtomic = vi.fn(async (_filePath: string, _data: Uint8Array) => {})
    const api = { writeBinaryAtomic } as unknown as MoonSpriteApi
    const document = createDocument('Layer target', 1, 1, 'rgba')
    const bottom = document.layers[0]
    if (bottom.format !== 'rgba') throw new Error('Expected an RGBA layer')
    bottom.name = 'Bottom layer'
    bottom.pixels.set([0, 0, 255, 255])
    const topDocument = createDocument('Top', 1, 1, 'rgba')
    const top = topDocument.layers[0]
    if (top.format !== 'rgba') throw new Error('Expected an RGBA layer')
    top.id = 'selected-layer'
    top.name = 'Selected layer'
    top.pixels.set([255, 0, 0, 255])
    document.layers.push(top)

    await expect(exportDocumentFile(api, document, {
      name: 'selected-layer', format: 'png-rgba', scalePercent: 100, target: 'layer', layerId: top.id, directory: 'D:/exports'
    })).resolves.toBe('已导出 1 个图层图像。')

    expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/exports/selected-layer-Selected layer.png', expect.any(Uint8Array))
    const output = decodePng(writeBinaryAtomic.mock.calls[0][1])
    const layer = output.layers[0]
    if (layer.format !== 'rgba') throw new Error('Expected an RGBA layer')
    expect(Array.from(layer.pixels)).toEqual([255, 0, 0, 255])
  })

  it('exports every layer with a distinct layer-name suffix when no layer is selected', async () => {
    const writeBinaryAtomic = vi.fn(async (_filePath: string, _data: Uint8Array) => {})
    const api = { writeBinaryAtomic } as unknown as MoonSpriteApi
    const document = createDocument('All layers', 1, 1, 'rgba')
    const bottom = document.layers[0]
    bottom.name = 'Bottom'
    const top = createDocument('Top', 1, 1, 'rgba').layers[0]
    top.id = 'top-layer'
    top.name = 'Top'
    document.layers.push(top)

    await expect(exportDocumentFile(api, document, {
      name: 'all-layers', format: 'png-rgba', scalePercent: 100, target: 'layer', directory: 'D:/exports'
    })).resolves.toBe('已导出 2 个图层图像。')

    expect(writeBinaryAtomic.mock.calls.map(([filePath]) => filePath)).toEqual([
      'D:/exports/all-layers-Bottom.png',
      'D:/exports/all-layers-Top.png'
    ])
  })

  it('resolves layer export name conflicts before it reports encoding progress', async () => {
    const writeBinaryAtomic = vi.fn(async (_filePath: string, _data: Uint8Array) => {})
    const fileExists = vi.fn(async (filePath: string) => filePath === 'D:/exports/conflict-Only layer.png')
    const api = { fileExists, writeBinaryAtomic } as unknown as MoonSpriteApi
    const document = createDocument('Layer conflict', 1, 1, 'rgba')
    document.layers[0].name = 'Only layer'
    let encodeStarts = 0

    await expect(exportDocumentFile(api, document, {
      name: 'conflict', format: 'png-rgba', scalePercent: 100, target: 'layer', directory: 'D:/exports'
    }, {
      onEncodeStart: () => { encodeStarts += 1 },
      onConflict: async () => {
        expect(encodeStarts).toBe(0)
        return 'rename'
      }
    })).resolves.toBe('已导出 1 个图层图像。')

    expect(encodeStarts).toBe(1)
  })

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

describe('slice export conflict handling', () => {
  it('resolves a GIF slice conflict before it reports encoding progress', async () => {
    const writeBinaryAtomic = vi.fn(async (_filePath: string, _data: Uint8Array) => {})
    const fileExists = vi.fn(async (filePath: string) => filePath === 'D:/exports/Slice 1.gif')
    const api = { fileExists, writeBinaryAtomic } as unknown as MoonSpriteApi
    const document = createDocument('Slice conflict', 1, 1, 'rgba')
    document.slices = [{ id: 'slice-1', name: 'Slice 1', x: 0, y: 0, width: 1, height: 1 }]
    let encodeStarts = 0

    await expect(exportDocumentFile(api, document, {
      name: 'slice-conflict', format: 'gif', scalePercent: 100, target: 'slices', directory: 'D:/exports'
    }, {
      onEncodeStart: () => { encodeStarts += 1 },
      onConflict: async () => {
        expect(encodeStarts).toBe(0)
        return 'rename'
      }
    })).resolves.toContain('1')

    expect(encodeStarts).toBe(1)
    expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/exports/Slice 1 (1).gif', expect.any(Uint8Array))
  })

  it('resolves a frame export conflict before fallback encoding begins', async () => {
    const writeBinaryAtomic = vi.fn(async (_filePath: string, _data: Uint8Array) => {})
    const fileExists = vi.fn(async (filePath: string) => filePath === 'D:/exports/frames-001.png')
    const api = { fileExists, writeBinaryAtomic } as unknown as MoonSpriteApi
    const document = createDocument('Frame conflict', 1, 1, 'rgba')
    let encodeStarts = 0

    await expect(exportDocumentFile(api, document, {
      name: 'frames', format: 'png-rgba', scalePercent: 100, target: 'frames', directory: 'D:/exports'
    }, {
      onEncodeStart: () => { encodeStarts += 1 },
      onConflict: async () => {
        expect(encodeStarts).toBe(0)
        return 'rename'
      }
    })).resolves.toContain('1')

    expect(encodeStarts).toBe(1)
    expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/exports/frames-001 (1).png', expect.any(Uint8Array))
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

  it('resolves existing timelapse frame paths before writing', async () => {
    const exportImage = vi.fn(async () => ({ canceled: false, filePath: 'D:/exports/process.png' }))
    const writeBinaryAtomic = vi.fn(async () => {})
    const fileExists = vi.fn(async (filePath: string) => filePath === 'D:/exports/process-001.png')
    const api = { exportImage, writeBinaryAtomic, fileExists } as unknown as MoonSpriteApi
    const document = createDocument('Process', 1, 1, 'rgba')
    const data = encodePng(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1, true).bytes
    document.timelapse = { enabled: true, quality: 'low', fps: 12, speed: 1, snapshots: [{ id: 'one', capturedAt: 100, elapsedMs: 100, width: 1, height: 1, data }] }

    await expect(exportTimelapseFile(api, document, 'png', { mode: 'duration', durationSeconds: 1, scalePercent: 100 }, {
      onConflict: async () => 'rename'
    })).resolves.toBe('已导出 1 张 PNG 图片。')
    expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/exports/process-001 (1).png', expect.any(Uint8Array))
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

  it('applies conflict resolution before writing the sprite sheet', async () => {
    const writeBinaryAtomic = vi.fn(async () => {})
    const fileExists = vi.fn(async (filePath: string) => filePath === 'D:/exports/Hero.png')
    const api = { fileExists, writeBinaryAtomic } as unknown as MoonSpriteApi
    const document = createDocument('Combined', 1, 2, 'rgba')
    await expect(exportSpriteSheetFile(api, document, 'Hero.png', 'D:/exports', {
      onConflict: async () => 'rename'
    })).resolves.toBe('D:/exports/Hero (1).png')
    expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/exports/Hero (1).png', expect.any(Uint8Array))
  })
})
