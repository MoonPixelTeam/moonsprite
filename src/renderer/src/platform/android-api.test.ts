import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types'
import { acceptsTabletCanvasPointer } from '@/core/tablet-input'

const native = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn(), save: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), stat: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: native.open, save: native.save }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: native.readFile, writeFile: native.writeFile, stat: native.stat }))
import { androidImportName, createAndroidApi } from './android-api'

function fixture() {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  const base = { writeBinaryAtomic: vi.fn().mockResolvedValue(undefined),
    writeProjectIncremental: vi.fn().mockResolvedValue(undefined),
    writeScaledPngAtomic: vi.fn().mockResolvedValue({ indexed: false }),
    readBinary: vi.fn().mockResolvedValue(bytes) } as unknown as MoonSpriteApi
  return { base, bytes, api: createAndroidApi(base) }
}
beforeEach(() => { vi.resetAllMocks(); native.invoke.mockResolvedValue('/private/exports/image.png'); native.stat.mockResolvedValue({ size: 4 }) })

describe('Android tablet file boundary', () => {
  it('copies an opaque provider URI to a real path before the editor sees it', async () => {
    const { api, base, bytes } = fixture()
    native.open.mockResolvedValue(['content://provider/document/104'])
    native.readFile.mockResolvedValue(bytes)
    expect(await api.openFiles()).toEqual({ canceled: false, filePaths: ['/private/exports/image.png'] })
    expect(base.writeBinaryAtomic).toHaveBeenCalledWith('/private/exports/image.png', bytes)
    expect(native.invoke).toHaveBeenCalledWith('android_allocate_file', { name: expect.stringMatching(/\.png$/), gallery: false })
  })
  it('does not allocate or write anything when the picker is canceled', async () => {
    const { api, base } = fixture()
    native.open.mockResolvedValue(null); native.save.mockResolvedValue(null)
    expect(await api.openFiles()).toEqual({ canceled: true, filePaths: [] })
    expect(await api.exportImage('image.png', 'png')).toEqual({ canceled: true })
    expect(native.invoke).not.toHaveBeenCalled(); expect(base.writeBinaryAtomic).not.toHaveBeenCalled()
  })
  it('saves projects privately without invoking the external picker', async () => {
    const { api } = fixture()
    await api.saveProject('../drawing.moonsprite')
    expect(native.invoke).toHaveBeenCalledWith('android_allocate_file', { name: 'drawing.moonsprite', gallery: true })
    expect(native.save).not.toHaveBeenCalled()
  })
  it('waits for the external provider and propagates errors while retaining a retry mapping', async () => {
    const { api, bytes, base } = fixture()
    native.save.mockResolvedValue('content://provider/output/32')
    const result = await api.exportImage('image.png', 'png')
    native.writeFile.mockRejectedValueOnce(new Error('provider full')).mockResolvedValueOnce(undefined)
    await expect(api.writeBinaryAtomic(result.filePath!, bytes)).rejects.toThrow('provider full')
    expect(base.writeBinaryAtomic).toHaveBeenCalledWith('/private/exports/image.png', bytes)
    await api.writeBinaryAtomic(result.filePath!, bytes)
    expect(native.writeFile).toHaveBeenCalledTimes(2)
    expect(native.writeFile).toHaveBeenLastCalledWith('content://provider/output/32', bytes)
  })
  it('publishes the resulting PNG, not the source pixels, for native scaled exports', async () => {
    const { api, base, bytes } = fixture()
    native.save.mockResolvedValue('content://provider/output/32')
    const result = await api.exportImage('image.png', 'png')
    await api.writeScaledPngAtomic!(result.filePath!, new Uint8Array(16), { sourceWidth: 2, sourceHeight: 2, outputWidth: 4, outputHeight: 4, forceRgba: false })
    expect(base.readBinary).toHaveBeenCalledWith(result.filePath)
    expect(native.writeFile).toHaveBeenCalledWith('content://provider/output/32', bytes)
  })
  it('rejects oversized imports before loading their bytes', async () => {
    const { api } = fixture(); native.open.mockResolvedValue(['content://provider/large'])
    native.stat.mockResolvedValue({ size: 129 * 1024 * 1024 })
    await expect(api.openFiles()).rejects.toThrow('128 MiB')
    expect(native.readFile).not.toHaveBeenCalled()
  })
  it('keeps useful provider filenames and rejects unknown opaque content', () => {
    expect(androidImportName('content://provider/document/primary%3ADownload%2Fart.png', new Uint8Array())).toBe('art.png')
    expect(() => androidImportName('content://provider/document/104', new Uint8Array())).toThrow('Unsupported file')
  })
  it('prevents a palm from owning a canvas gesture while preserving pen and external mouse input', () => {
    expect(acceptsTabletCanvasPointer('touch', true)).toBe(false)
    expect(acceptsTabletCanvasPointer('pen', true)).toBe(true)
    expect(acceptsTabletCanvasPointer('mouse', true)).toBe(true)
    expect(acceptsTabletCanvasPointer('touch', false)).toBe(true)
  })
})
