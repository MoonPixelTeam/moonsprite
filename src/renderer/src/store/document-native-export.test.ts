import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { createDocument } from '@/core/document-model'
import { decodeProject, encodeProject, registerProjectSaveBaseline } from '@/core/project-format'
import { encodePng } from '@/core/png-encode'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { loadDocumentExportSettings, loadExportPresets, loadRecentExportPaths, saveExportPresets, withExportFileExtension } from '@/core/export-settings'
import { exportDocumentFile } from './document-file-service'

beforeEach(() => { localStorage.clear(); vi.stubGlobal('Worker', undefined) })
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

const options = { name: 'sprite.png', format: 'moonsprite' as const, scalePercent: 200, trim: true, trimMode: 'common' as const, directory: 'D:/exports' }
function fixture() {
  const document = createDocument('Native export', 2, 2, 'rgba')
  const secondLayer = createDocument('Second layer', 2, 2, 'rgba').layers[0]
  document.layers.push(secondLayer)
  document.layers[0].pixels.set([255, 0, 0, 255])
  secondLayer.pixels.set([0, 255, 0, 255])
  const timeline = document.animation!
  timeline.frames.push({ id: 'second-frame', duration: 230 })
  timeline.cels.push({ id: 'second-cel', layerId: secondLayer.id, frameId: 'second-frame', surface: { format: 'rgba', width: 2, height: 2, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(secondLayer.pixels) } })
  document.referenceImages = [{ id: 'reference', width: 1, height: 1, pixels: new Uint8ClampedArray([0, 0, 255, 255]) }]
  document.filePath = 'D:/source/original.moonsprite'
  return document
}

it('exports a complete reopenable archive after a save baseline without changing its source', async () => {
  const document = fixture()
  registerProjectSaveBaseline(document, document.filePath!, encodeProject(document))
  const original = JSON.stringify(document)
  const saveProject = vi.fn()
  const writeBinaryAtomic = vi.fn(async (_path: string, _bytes: Uint8Array) => {})
  const api = { writeBinaryAtomic, saveProject } as unknown as MoonSpriteApi
  await expect(exportDocumentFile(api, document, options)).resolves.toBe('已导出 MoonSprite 工程。')
  expect(saveProject).not.toHaveBeenCalled()
  expect(writeBinaryAtomic).toHaveBeenCalledTimes(1)
  const [path, bytes] = writeBinaryAtomic.mock.calls[0]
  expect(path).toBe('D:/exports/sprite.moonsprite')
  const reopened = decodeProject(bytes)
  expect(reopened).toMatchObject({ name: document.name, width: 2, height: 2 })
  expect(reopened.layers.map(layer => layer.pixels)).toEqual(document.layers.map(layer => layer.pixels))
  expect(reopened.animation!.frames).toEqual(document.animation!.frames)
  expect(reopened.animation!.cels).toMatchObject(document.animation!.cels)
  expect(reopened.referenceImages).toEqual(document.referenceImages)
  expect(JSON.stringify(document)).toBe(original)
  expect(loadDocumentExportSettings(document)).toMatchObject({ name: 'sprite.moonsprite', format: 'moonsprite', scalePercent: 100, target: 'document', directory: 'D:/exports' })
  expect(loadDocumentExportSettings(document)?.trimMode).toBeUndefined()
  expect(loadEditorPreferences()).toMatchObject({ lastExportDirectory: 'D:/exports', lastSaveDirectory: '' })
  expect(loadRecentExportPaths()[0].filePath).toBe(path)
})

it('uses the shared export directory in the native project dialog and normalizes its extension', async () => {
  saveEditorPreferences({ ...loadEditorPreferences(), exportLocationMode: 'recent', lastExportDirectory: 'D:/previous' })
  const saveProject = vi.fn(async () => ({ canceled: false, filePath: 'D:/chosen/renamed' }))
  const exportImage = vi.fn()
  const writeBinaryAtomic = vi.fn(async (_path: string, _bytes: Uint8Array) => {})
  await exportDocumentFile({ saveProject, exportImage, writeBinaryAtomic } as unknown as MoonSpriteApi, fixture(), { ...options, directory: undefined })
  expect(saveProject).toHaveBeenCalledWith('D:/previous/sprite.moonsprite', 'moonsprite')
  expect(exportImage).not.toHaveBeenCalled()
  expect(writeBinaryAtomic).toHaveBeenCalledWith('D:/chosen/renamed.moonsprite', expect.any(Uint8Array))
  expect(loadEditorPreferences()).toMatchObject({ lastExportDirectory: 'D:/chosen', lastSaveDirectory: '' })
})

it('embeds local recording bytes so the exported project can reopen independently', async () => {
  const document = fixture()
  const bytes = encodePng(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1, false).bytes
  const local = { store: 'store', chunk: 'chunk', offset: 0, length: bytes.length, checksum: 0 }
  document.timelapse = { enabled: true, quality: 'low', fps: 12, speed: 1, snapshots: [{ id: 'recorded-frame', capturedAt: 100, elapsedMs: 100, width: 1, height: 1, data: new Uint8Array(), local }] }
  const readTimelapseFrame = vi.fn(async () => bytes)
  const writeBinaryAtomic = vi.fn(async (_path: string, _bytes: Uint8Array) => {})
  await exportDocumentFile({ readTimelapseFrame, writeBinaryAtomic } as unknown as MoonSpriteApi, document, options)
  expect(readTimelapseFrame).toHaveBeenCalledWith(local)
  expect(decodeProject(writeBinaryAtomic.mock.calls[0][1]).timelapse!.snapshots[0].data).toEqual(bytes)
  expect(document.timelapse.snapshots[0]).toMatchObject({ data: new Uint8Array(), local })
})

it('leaves export memory untouched when the dialog is canceled or a write fails', async () => {
  const document = fixture()
  const writeBinaryAtomic = vi.fn(async () => { throw new Error('disk full') })
  const saveProject = vi.fn(async () => ({ canceled: true }))
  const api = { writeBinaryAtomic, saveProject } as unknown as MoonSpriteApi
  await expect(exportDocumentFile(api, document, { ...options, directory: undefined })).resolves.toBeNull()
  expect(writeBinaryAtomic).not.toHaveBeenCalled()
  await expect(exportDocumentFile(api, document, options)).rejects.toThrow('disk full')
  expect(loadDocumentExportSettings(document)).toBeNull()
  expect(loadRecentExportPaths()).toEqual([])
  expect(loadEditorPreferences().lastExportDirectory).toBe('')
})

it.each(['cancel', 'rename', 'overwrite'] as const)('reuses export conflict handling for %s', async decision => {
  const writeBinaryAtomic = vi.fn(async (_path: string, _bytes: Uint8Array) => {})
  const fileExists = vi.fn(async (path: string) => path === 'D:/exports/sprite.moonsprite')
  const result = await exportDocumentFile({ writeBinaryAtomic, fileExists } as unknown as MoonSpriteApi, fixture(), options, { onConflict: async () => decision })
  if (decision === 'cancel') { expect(result).toBeNull(); expect(writeBinaryAtomic).not.toHaveBeenCalled() }
  else expect(writeBinaryAtomic).toHaveBeenCalledWith(`D:/exports/sprite${decision === 'rename' ? ' (1)' : ''}.moonsprite`, expect.any(Uint8Array))
})

it('stops before writing if canceled during encoding and rejects partial project targets', async () => {
  const writeBinaryAtomic = vi.fn()
  const api = { writeBinaryAtomic } as unknown as MoonSpriteApi
  let canceled = false
  await expect(exportDocumentFile(api, fixture(), options, { isCanceled: () => canceled, onEncodeProgress: () => { canceled = true } })).rejects.toThrow('canceled')
  await expect(exportDocumentFile(api, fixture(), { ...options, target: 'selection' })).rejects.toThrow('工程格式')
  expect(writeBinaryAtomic).not.toHaveBeenCalled()
  expect(loadRecentExportPaths()).toEqual([])
})

it('remembers native project presets with whole-project settings and the correct extension', () => {
  expect(withExportFileExtension('sprite.aseprite', 'moonsprite')).toBe('sprite.moonsprite')
  saveExportPresets([{ ...options, presetName: 'Project', target: 'frames' }])
  expect(loadExportPresets()[0]).toMatchObject({ name: 'sprite.moonsprite', format: 'moonsprite', scalePercent: 100 })
  expect(loadExportPresets()[0].target ?? 'document').toBe('document')
  expect(loadExportPresets()[0].trimMode).toBeUndefined()
})
