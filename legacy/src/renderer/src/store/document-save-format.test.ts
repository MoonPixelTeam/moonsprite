import { beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { initializeCanvas } from 'ag-psd'
import type { MoonSpriteApi } from '@shared/types-platform'
import { createDocument, createLayer, writeLayerColor } from '@/core/document-model'
import { addBlankAnimationFrame, syncActiveAnimationFrame } from '@/core/animation'
import { decodeGifAnimation } from '@/core/gif-import'
import { documentSaveCompatibility, documentSaveTarget } from '@/core/document-save-policy'
import { exportDocumentImage } from '@/core/png'
import { saveDocumentFile } from './document-file-service'
import { DEFAULT_EDITOR_PREFERENCES, loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'

beforeEach(() => localStorage.clear())

vi.mock('@/core/png', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/png')>()
  return { ...actual, exportDocumentImage: vi.fn((...args: Parameters<typeof actual.exportDocumentImage>) => {
    if (args[2] === 'jpeg' || args[2] === 'webp') return Promise.resolve({ bytes: new Uint8Array([1, 2, 3]), extension: args[2] === 'jpeg' ? 'jpg' : 'webp', indexed: false, colorCount: 1 })
    return actual.exportDocumentImage(...args)
  }) }
})
beforeAll(() => initializeCanvas(
  (width, height) => ({ width, height } as HTMLCanvasElement),
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' } as ImageData)
))

function fixture(extension = 'png') {
  const document = createDocument('original', 2, 2, 'rgba', false)
  for (let index = 0; index < 4; index++) writeLayerColor(document, document.layers[0], index, { r: 255, g: 0, b: 0, a: 255 })
  syncActiveAnimationFrame(document)
  document.sourceFilePath = `D:/original.${extension}`
  const write = vi.fn(async (_path: string, _bytes: Uint8Array) => {})
  const saveProject = vi.fn(async () => ({ canceled: false, filePath: 'D:/preserved.moonsprite' }))
  const api = { writeBinaryAtomic: write, saveProject } as unknown as MoonSpriteApi
  const request = { api, documentId: document.id, getDocument: () => ({ document, revision: 1 }), saveAs: false, preferredImageFormat: 'png-auto' as const }
  return { document, write, saveProject, request }
}

it.each(['png', 'jpeg', 'jpg', 'webp', 'bmp', 'gif', 'ase', 'aseprite', 'psd'])('saves an imported .%s back to the same path and format', async (extension) => {
  const f = fixture(extension)
  const result = await saveDocumentFile(f.request)
  expect(result?.filePath).toBe(`D:/original.${extension}`)
  expect(f.write).toHaveBeenCalledOnce()
  expect(f.write.mock.calls[0][0]).toBe(result?.filePath)
  expect(f.saveProject).not.toHaveBeenCalled()
  if (extension === 'jpeg' || extension === 'jpg' || extension === 'webp') expect(exportDocumentImage).toHaveBeenCalledWith(f.document, 100, extension === 'webp' ? 'webp' : 'jpeg')
  if (extension === 'psd') expect(new TextDecoder().decode(f.write.mock.calls[0][1].subarray(0, 4))).toBe('8BPS')
  if (extension === 'bmp') expect(new TextDecoder().decode(f.write.mock.calls[0][1].subarray(0, 2))).toBe('BM')
})

it('preserves every GIF frame instead of overwriting the animation with its first frame', async () => {
  const f = fixture('gif')
  addBlankAnimationFrame(f.document)
  await saveDocumentFile(f.request)
  expect(decodeGifAnimation(f.write.mock.calls[0][1], 'saved').animation!.frames).toHaveLength(2)
})

it.each(['cancel', 'format', 'project'] as const)('warns about layered PNG loss before writing and honors %s', async (choice) => {
  const f = fixture()
  f.document.layers.push(createLayer('Extra', 2, 2, 'rgba'))
  const onSaveCompatibility = vi.fn(async () => {
    expect(f.write).not.toHaveBeenCalled()
    return choice
  })
  const result = await saveDocumentFile({ ...f.request, lifecycle: { onSaveCompatibility } })
  expect(onSaveCompatibility).toHaveBeenCalledWith('png-auto', expect.arrayContaining(['layers']))
  if (choice === 'cancel') { expect(result).toBeNull(); expect(f.write).not.toHaveBeenCalled() }
  else expect(f.write.mock.calls[0][0]).toBe(choice === 'project' ? 'D:/preserved.moonsprite' : 'D:/original.png')
})

it('does not overwrite incompatible data without a decision, including existing non-native save paths', async () => {
  const f = fixture('psd')
  f.document.filePath = f.document.sourceFilePath!
  addBlankAnimationFrame(f.document)
  expect(await saveDocumentFile(f.request)).toBeNull()
  expect(f.write).not.toHaveBeenCalled()
})

it('uses the latest saved format ahead of the original import and identifies actual format limitations', () => {
  const f = fixture('ase')
  f.document.filePath = 'D:/latest.moonsprite'
  expect(documentSaveTarget(f.document)?.format).toBe('moonsprite')
  f.document.layers[0].kind = 'text'
  addBlankAnimationFrame(f.document)
  expect(documentSaveCompatibility(f.document, 'moonsprite')).toEqual([])
  expect(documentSaveCompatibility(f.document, 'psd')).toEqual(expect.arrayContaining(['frames', 'editable']))
  expect(documentSaveCompatibility(f.document, 'ase')).not.toContain('frames')
})

it('rechecks new incompatible features added during the confirmation before writing', async () => {
  const f = fixture()
  f.document.layers.push(createLayer('Extra', 2, 2, 'rgba'))
  await expect(saveDocumentFile({ ...f.request, lifecycle: { onSaveCompatibility: async () => {
    addBlankAnimationFrame(f.document)
    return 'format'
  } } })).rejects.toThrow()
  expect(f.write).not.toHaveBeenCalled()
})

it.each(['gif', 'bmp'] as const)('supports explicit Save As in %s format', async (format) => {
  const f = fixture(format)
  const result = await saveDocumentFile({ ...f.request, saveAs: true, options: { name: 'copy', format, scalePercent: 100, directory: 'D:/copies' } })
  expect(result?.filePath).toBe(`D:/copies/copy.${format}`)
  expect(f.write).toHaveBeenCalledOnce()
})

it('enables original-format saving by default and persists either toggle value', () => {
  expect(DEFAULT_EDITOR_PREFERENCES.saveOriginalFormat).toBe(true)
  expect(loadEditorPreferences().saveOriginalFormat).toBe(true)
  saveEditorPreferences({ ...loadEditorPreferences(), saveOriginalFormat: false })
  expect(loadEditorPreferences().saveOriginalFormat).toBe(false)
  saveEditorPreferences({ ...loadEditorPreferences(), saveOriginalFormat: true })
  expect(loadEditorPreferences().saveOriginalFormat).toBe(true)
})

it.each([false, true])('prompts for a native project when disabled and honors confirmation=%s', async (accept) => {
  const f = fixture('aseprite')
  saveEditorPreferences({ ...loadEditorPreferences(), saveOriginalFormat: false })
  const onProjectSaveRequested = vi.fn(async () => {
    expect(f.write).not.toHaveBeenCalled()
    expect(f.saveProject).not.toHaveBeenCalled()
    return accept
  })
  const result = await saveDocumentFile({ ...f.request, lifecycle: { onProjectSaveRequested } })
  expect(onProjectSaveRequested).toHaveBeenCalledOnce()
  if (accept) {
    expect(result).toMatchObject({ filePath: 'D:/preserved.moonsprite', setDocumentFilePath: true })
    expect(f.write).toHaveBeenCalledWith('D:/preserved.moonsprite', expect.any(Uint8Array))
  } else {
    expect(result).toBeNull()
    expect(f.write).not.toHaveBeenCalled()
    expect(f.saveProject).not.toHaveBeenCalled()
  }
  expect(f.document.sourceFilePath).toBe('D:/original.aseprite')
})

it('prompts for already saved image paths too, and requires a decision before conversion', async () => {
  const f = fixture()
  f.document.filePath = 'D:/already-saved.png'
  saveEditorPreferences({ ...loadEditorPreferences(), saveOriginalFormat: false })
  expect(await saveDocumentFile(f.request)).toBeNull()
  expect(f.write).not.toHaveBeenCalled()
  expect(f.saveProject).not.toHaveBeenCalled()
})

it('continues saving native projects normally with the preference disabled', async () => {
  const f = fixture()
  f.document.filePath = 'D:/already-native.moonsprite'
  saveEditorPreferences({ ...loadEditorPreferences(), saveOriginalFormat: false })
  const onProjectSaveRequested = vi.fn(async () => false)
  const result = await saveDocumentFile({ ...f.request, lifecycle: { onProjectSaveRequested } })
  expect(result?.filePath).toBe('D:/already-native.moonsprite')
  expect(onProjectSaveRequested).not.toHaveBeenCalled()
  expect(f.saveProject).not.toHaveBeenCalled()
})

it('defaults new documents to native format when disabled but honors an explicit Save As choice', async () => {
  const f = fixture()
  f.document.sourceFilePath = undefined
  saveEditorPreferences({ ...loadEditorPreferences(), saveOriginalFormat: false })
  expect((await saveDocumentFile(f.request))?.filePath).toBe('D:/preserved.moonsprite')
  const copy = await saveDocumentFile({ ...f.request, saveAs: true, options: { format: 'png-auto', name: 'explicit', directory: 'D:/exports', scalePercent: 100 } })
  expect(copy?.filePath).toBe('D:/exports/explicit.png')
})
