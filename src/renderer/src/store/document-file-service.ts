import type { DocumentSlice, MoonSpriteApi, SpriteDocument, TimelapseExportFormat } from '@shared/types'
import { checkTypedArrayLimit } from '@/core/resource-policy'
import { decodeDocumentFileAsync, directSourceImageSaveTarget, encodeDocumentForPath, encodeDocumentForSourceImage, fileExtension, fileNameFromPath, joinDirectoryPath, normalizeSaveDialogPath, sanitizeFileStem, saveImageDialogFormat, saveImageExtension, saveImageKindForPath, sourceRasterImageKindForPath } from '@/core/document-files'
import { decodePng, exportDocumentImage, exportDocumentSliceImage, type SaveImageKind } from '@/core/png'
import { sliceExportFileName } from '@/core/slices'
import { loadEditorPreferences } from '@/core/file-preferences'
import { translate } from '@/core/localization'
import { exportAnimationGif } from '@/core/gif'
import { encodeTimelapseVideo, isTimelapseVideoFormat, type TimelapseExportOptions } from '@/core/timelapse'
import { normalizeTimelapseSettings } from '@/core/project-metadata'
import { RECENT_EXPORTS_CHANGED_EVENT, exportFileExtension, parentDirectoryFromPath, recordRecentExportPath, saveDocumentExportSettings, withExportFileExtension, type DocumentExportSettings } from '@/core/export-settings'
import { acceptProjectSaveBaseline, clearProjectSaveBaseline, encodeProjectAsync, encodeProjectSaveAsync } from '@/core/project-format'
import { cloneDocumentForAnimationFrame } from '@/core/animation'
import { compositeRegion } from '@/core/document'
import { selectionContains } from '@/core/selection'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import { beginRuntimeDiagnosticOperation, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'

export type ExportOptions = DocumentExportSettings

type PngFileFormat = Extract<SaveImageKind, 'png-auto' | 'png-rgba'>
type PngSourceRegion = Pick<DocumentSlice, 'x' | 'y' | 'width' | 'height'>

const isPngFileFormat = (format: string): format is PngFileFormat => format === 'png-auto' || format === 'png-rgba'

interface DirectPngSource {
  data: Uint8Array
  sourceFormat: 'rgba' | 'indexed'
  palette?: Uint8Array
}

const packedPalette = (document: SpriteDocument): Uint8Array => {
  const output = new Uint8Array(document.palette.length * 4)
  for (const [index, entry] of document.palette.entries()) {
    const offset = index * 4
    output[offset] = entry.color.r
    output[offset + 1] = entry.color.g
    output[offset + 2] = entry.color.b
    output[offset + 3] = entry.color.a
  }
  return output
}

/** Returns a zero-copy source only when the visible document is already one contiguous surface. */
const directPngSource = (document: SpriteDocument, sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number): DirectPngSource | null => {
  if (sourceX !== 0 || sourceY !== 0 || sourceWidth !== document.width || sourceHeight !== document.height) return null
  if (document.groups.length !== 0 || document.layers.length !== 1) return null
  if (document.animation?.groupMasks?.some((entry) => entry.frameId === document.animation?.activeFrameId && entry.mask)) return null
  const layer = document.layers[0]
  if (!layer.visible || layer.opacity !== 1 || layer.blendMode !== 'normal' || layer.clippingMask === true || hasEnabledLayerStyles(layer.layerStyles)) return null
  if (layer.kind || layer.offsetX !== 0 || layer.offsetY !== 0 || layer.width !== document.width || layer.height !== document.height) return null
  if (document.animation?.cels.some((cel) => cel.layerId === layer.id && cel.frameId === document.animation?.activeFrameId && cel.mask)) return null

  if (layer.format === 'rgba') {
    const byteLength = document.width * document.height * 4
    if (layer.pixels.byteLength !== byteLength) return null
    return { data: new Uint8Array(layer.pixels.buffer, layer.pixels.byteOffset, layer.pixels.byteLength), sourceFormat: 'rgba' }
  }

  if (document.palette.length === 0 || document.palette.length > 256 || layer.pixels.length !== document.width * document.height) return null
  const data = new Uint8Array(layer.pixels.length)
  const sequentialPalette = document.palette.every((entry, index) => entry.id === index)
  if (sequentialPalette) {
    for (let index = 0; index < layer.pixels.length; index += 1) {
      const paletteIndex = layer.pixels[index]
      if (paletteIndex >= document.palette.length) return null
      data[index] = paletteIndex
    }
  } else {
    const paletteIndices = new Map(document.palette.map((entry, index) => [entry.id, index]))
    for (let index = 0; index < layer.pixels.length; index += 1) {
      const paletteIndex = paletteIndices.get(layer.pixels[index])
      if (paletteIndex === undefined || paletteIndex > 255) return null
      data[index] = paletteIndex
    }
  }
  return { data, sourceFormat: 'indexed', palette: packedPalette(document) }
}

async function writeDocumentPngAtomic(
  api: MoonSpriteApi,
  filePath: string,
  document: SpriteDocument,
  scalePercent: number,
  format: PngFileFormat,
  region?: PngSourceRegion,
  onProgress?: (value: number) => void,
  onCancelReady?: (cancel: () => void) => void,
  selection?: ExportOptions['selection']
): Promise<{ indexed: boolean } | null> {
  if (!api.writeScaledPngAtomic) return null
  const sourceX = region?.x ?? 0
  const sourceY = region?.y ?? 0
  const sourceWidth = region?.width ?? document.width
  const sourceHeight = region?.height ?? document.height
  const ratio = Math.max(0.01, Math.min(64, scalePercent / 100))
  const outputWidth = Math.max(1, Math.round(sourceWidth * ratio))
  const outputHeight = Math.max(1, Math.round(sourceHeight * ratio))
  const direct = directPngSource(document, sourceX, sourceY, sourceWidth, sourceHeight)
  const pixels = direct?.data ?? (() => {
    const composite = compositeRegion(document, sourceX, sourceY, sourceWidth, sourceHeight)
    if (!selection) return new Uint8Array(composite.buffer, composite.byteOffset, composite.byteLength)
    const masked = Uint8Array.from(composite)
    for (let y = 0; y < sourceHeight; y += 1) for (let x = 0; x < sourceWidth; x += 1) {
      if (selectionContains(selection, sourceX + x, sourceY + y)) continue
      masked[(y * sourceWidth + x) * 4 + 3] = 0
    }
    return masked
  })()
  return api.writeScaledPngAtomic(
    filePath,
    pixels,
    {
      sourceWidth,
      sourceHeight,
      outputWidth,
      outputHeight,
      forceRgba: format === 'png-rgba',
      ...(direct?.sourceFormat === 'indexed' && direct.palette ? { sourceFormat: 'indexed' as const, palette: direct.palette } : {})
    },
    onProgress,
    onCancelReady
  )
}

async function resolveBatchExportDirectory(api: MoonSpriteApi, requestedDirectory?: string): Promise<string | null> {
  const directory = requestedDirectory?.trim()
  if (directory) return directory
  const result = await api.chooseDirectory(loadEditorPreferences().exportDirectory)
  return result.canceled || !result.directoryPath ? null : result.directoryPath
}

function rememberExportPath(filePath: string): void {
  if (!recordRecentExportPath(filePath)) return
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RECENT_EXPORTS_CHANGED_EVENT))
}

function rememberLastDocumentExport(document: SpriteDocument, options: ExportOptions | undefined, actual: Pick<DocumentExportSettings, 'name' | 'format' | 'scalePercent' | 'target' | 'directory'>): void {
  saveDocumentExportSettings(document, {
    ...actual,
    ...(actual.target === 'slices' && options?.sliceId ? { sliceId: options.sliceId } : {}),
    ...(options?.presetName ? { presetName: options.presetName } : {}),
    ...(actual.format === 'gif' ? {
      gifFrameRange: options?.gifFrameRange ?? 'all',
      ...(options?.gifFrameStart !== undefined ? { gifFrameStart: options.gifFrameStart } : {}),
      ...(options?.gifFrameEnd !== undefined ? { gifFrameEnd: options.gifFrameEnd } : {}),
      gifDirection: options?.gifDirection ?? 'forward'
    } : {})
  })
}

export interface SaveAsOptions {
  name: string
  format: 'moonsprite' | SaveImageKind
  scalePercent: number
  directory?: string
}

interface SaveDocumentRequest {
  api: MoonSpriteApi
  documentId: string
  getDocument: () => { document: SpriteDocument; revision: number } | null
  saveAs: boolean
  options?: SaveAsOptions
  preferredImageFormat: SaveImageKind | null
  lifecycle?: FileOperationLifecycle
}

export interface SaveDocumentResult {
  filePath: string
  revision: number
  setDocumentFilePath: boolean
}

export interface FileOperationLifecycle {
  onEncodeStart?: () => void
  onEncodeProgress?: (value: number) => void
  onWriteStart?: () => void
  onCancelReady?: (cancel: () => void) => void
  isCanceled?: () => boolean
}

export interface OpenDocumentLifecycle {
  onReadStart?: () => void
  onReadProgress?: (bytesRead: number, totalBytes: number) => void
  onDecodeStart?: () => void
  onDecodeProgress?: (value: number) => void
}

const EXPORT_CANCELED_MESSAGE = 'MoonSprite export canceled.'

function throwIfExportCanceled(lifecycle?: FileOperationLifecycle): void {
  if (lifecycle?.isCanceled?.()) throw new Error(EXPORT_CANCELED_MESSAGE)
}

const saveOperations = new Map<string, Promise<SaveDocumentResult | null>>()

export function saveDocumentFile(request: SaveDocumentRequest): Promise<SaveDocumentResult | null> {
  const pending = saveOperations.get(request.documentId)
  const operation = (async (): Promise<SaveDocumentResult | null> => {
    if (pending) {
      try { await pending } catch { /* A failed earlier save must not block the queued retry. */ }
    }
    const initial = request.getDocument()
    if (!initial) return null
    const directSourceTarget = !request.saveAs && !request.options ? directSourceImageSaveTarget(initial.document) : null
    if (directSourceTarget) {
      const source = request.getDocument()
      const currentTarget = source ? directSourceImageSaveTarget(source.document) : null
      if (source && currentTarget?.filePath === directSourceTarget.filePath && currentTarget.format === directSourceTarget.format) {
        request.lifecycle?.onEncodeStart?.()
        const nativePng = isPngFileFormat(currentTarget.format)
          ? await writeDocumentPngAtomic(request.api, currentTarget.filePath, source.document, 100, currentTarget.format, undefined, request.lifecycle?.onEncodeProgress)
          : null
        if (!nativePng) {
          const data = await encodeDocumentForSourceImage(source.document, currentTarget.format, request.lifecycle?.onEncodeProgress)
          request.lifecycle?.onWriteStart?.()
          await request.api.writeBinaryAtomic(currentTarget.filePath, data)
        }
        return { filePath: currentTarget.filePath, revision: source.revision, setDocumentFilePath: false }
      }
    }
    const importedImageRequiresProject = !request.saveAs
      && !request.options
      && !initial.document.filePath
      && Boolean(sourceRasterImageKindForPath(initial.document.sourceFilePath ?? ''))
    const existingFormat = initial.document.filePath
      ? (/\.moonsprite$/i.test(initial.document.filePath) ? 'moonsprite' as const : saveImageKindForPath(initial.document.filePath))
      : null
    const selectedFormat: 'moonsprite' | SaveImageKind = request.options?.format ?? existingFormat ?? (importedImageRequiresProject ? 'moonsprite' : request.preferredImageFormat) ?? 'moonsprite'
    const imageFormat = selectedFormat === 'moonsprite' ? null : selectedFormat
    const fallbackName = sanitizeFileStem(initial.document.name, 'MoonSprite-export')
    const requestedName = sanitizeFileStem(request.options?.name ?? fallbackName, fallbackName)
    const saveDirectory = request.options?.directory?.trim() || loadEditorPreferences().saveDirectory
    let filePath = initial.document.filePath
    if ((!filePath || request.saveAs) && imageFormat) {
      const extension = saveImageExtension(imageFormat)
      const result = await request.api.saveProject(joinDirectoryPath(saveDirectory, `${requestedName}.${extension}`), saveImageDialogFormat(imageFormat))
      if (result.canceled || !result.filePath || !request.getDocument()) return null
      filePath = normalizeSaveDialogPath(result.filePath, imageFormat)
    } else if (!filePath || request.saveAs) {
      const result = await request.api.saveProject(joinDirectoryPath(saveDirectory, `${requestedName}.moonsprite`))
      if (result.canceled || !result.filePath || !request.getDocument()) return null
      filePath = result.filePath.endsWith('.moonsprite') ? result.filePath : `${result.filePath}.moonsprite`
    }
    const source = request.getDocument()
    if (!source || !filePath) return null
    request.lifecycle?.onEncodeStart?.()
    if (!imageFormat) {
      const encoded = await encodeProjectSaveAsync(source.document, { onProgress: request.lifecycle?.onEncodeProgress })
      request.lifecycle?.onWriteStart?.()
      let acceptBaseline = true
      if (encoded.sourcePath && encoded.reusableEntries.length > 0) {
        try {
          await request.api.writeProjectIncremental(filePath, encoded.sourcePath, encoded.data)
        } catch {
          await request.api.writeBinaryAtomic(filePath, await encodeProjectAsync(source.document))
          clearProjectSaveBaseline(source.document)
          acceptBaseline = false
        }
      } else await request.api.writeBinaryAtomic(filePath, encoded.data)
      if (acceptBaseline) acceptProjectSaveBaseline(source.document, filePath, encoded)
    } else {
      const nativePng = isPngFileFormat(imageFormat)
        ? await writeDocumentPngAtomic(request.api, filePath, source.document, request.options?.scalePercent ?? 100, imageFormat, undefined, request.lifecycle?.onEncodeProgress)
        : null
      if (!nativePng) {
        const data = await encodeDocumentForPath(source.document, filePath, imageFormat, request.options?.scalePercent ?? 100, request.lifecycle?.onEncodeProgress)
        request.lifecycle?.onWriteStart?.()
        await request.api.writeBinaryAtomic(filePath, data)
      }
    }
    return { filePath, revision: source.revision, setDocumentFilePath: true }
  })()
  saveOperations.set(request.documentId, operation)
  void operation.finally(() => {
    if (saveOperations.get(request.documentId) === operation) saveOperations.delete(request.documentId)
  }).catch(() => undefined)
  return operation
}

export async function exportDocumentFile(api: MoonSpriteApi, document: SpriteDocument, options?: ExportOptions, lifecycle?: FileOperationLifecycle): Promise<string | null> {
  throwIfExportCanceled(lifecycle)
  const scalePercent = Math.max(1, Math.min(6400, Math.round(options?.scalePercent ?? 100)))
  const fallbackName = sanitizeFileStem(document.name, 'MoonSprite-export')
  const requestedName = sanitizeFileStem(options?.name ?? fallbackName, fallbackName)
  const format = options?.format ?? 'png-auto'
  if (options?.target === 'selection') {
    if (format === 'psd') throw new Error(translate(loadEditorPreferences().language, 'file.export.psdDocumentOnly'))
    const selection = options.selection
    if (!selection || selection.width < 1 || selection.height < 1) throw new Error(translate(loadEditorPreferences().language, 'file.export.selectionMissing'))
    const region = { id: 'selection', name: 'Selection', x: selection.x, y: selection.y, width: selection.width, height: selection.height }
    const exportWidth = Math.max(1, Math.round(region.width * scalePercent / 100))
    const exportHeight = Math.max(1, Math.round(region.height * scalePercent / 100))
    if (!Number.isSafeInteger(exportWidth) || !Number.isSafeInteger(exportHeight)) throw new Error(translate(loadEditorPreferences().language, 'file.export.safeRange'))
    const extension = exportFileExtension(format)
    const dialogFormat = isPngFileFormat(format) ? 'png' : format
    const selectedDirectory = options.directory?.trim()
    let path = selectedDirectory ? joinDirectoryPath(selectedDirectory, `${requestedName}.${extension}`) : ''
    if (!path) {
      const result = await api.exportImage(joinDirectoryPath(loadEditorPreferences().exportDirectory, `${requestedName}.${extension}`), dialogFormat)
      if (result.canceled || !result.filePath) return null
      path = result.filePath.toLowerCase().endsWith(`.${extension}`) ? result.filePath : `${result.filePath}.${extension}`
    }
    throwIfExportCanceled(lifecycle)
    lifecycle?.onEncodeStart?.()
    let output: { extension: string; indexed: boolean }
    if (isPngFileFormat(format) && api.writeScaledPngAtomic) {
      const nativePng = await writeDocumentPngAtomic(api, path, document, scalePercent, format, region, lifecycle?.onEncodeProgress, lifecycle?.onCancelReady, selection)
      output = { extension: 'png', indexed: nativePng?.indexed ?? false }
    } else {
      const encoded = format === 'gif'
        ? { ...exportAnimationGif(document, { scalePercent, frameStart: options.gifFrameRange === 'range' ? options.gifFrameStart : undefined, frameEnd: options.gifFrameRange === 'range' ? options.gifFrameEnd : undefined, direction: options.gifDirection ?? 'forward', crop: region }), extension: 'gif' as const, indexed: false }
        : await exportDocumentSliceImage(document, region, scalePercent, format)
      if (!path.toLowerCase().endsWith(`.${encoded.extension}`)) path = `${path}.${encoded.extension}`
      lifecycle?.onWriteStart?.()
      await api.writeBinaryAtomic(path, encoded.bytes)
      output = encoded
    }
    throwIfExportCanceled(lifecycle)
    rememberExportPath(path)
    rememberLastDocumentExport(document, options, { name: fileNameFromPath(path), format, scalePercent, target: 'selection', directory: parentDirectoryFromPath(path) })
    return output.indexed ? translate(loadEditorPreferences().language, 'file.export.indexed') : translate(loadEditorPreferences().language, 'file.export.image', { extension: output.extension.toUpperCase() })
  }
  if (options?.target === 'slices') {
    if (format === 'psd') throw new Error(translate(loadEditorPreferences().language, 'file.export.psdDocumentOnly'))
    const documentSlices = document.slices ?? []
    if (documentSlices.length === 0) throw new Error(translate(loadEditorPreferences().language, 'file.export.noSlices'))
    const slices = options.sliceId ? documentSlices.filter((slice) => slice.id === options.sliceId) : documentSlices
    if (slices.length === 0) throw new Error(translate(loadEditorPreferences().language, 'file.export.sliceMissing'))
    const directoryPath = await resolveBatchExportDirectory(api, options.directory)
    if (!directoryPath) return null
    throwIfExportCanceled(lifecycle)
    lifecycle?.onEncodeStart?.()
    const used = new Set<string>()
    let lastPath = directoryPath
    for (const [index, slice] of slices.entries()) {
      throwIfExportCanceled(lifecycle)
      if (isPngFileFormat(format) && api.writeScaledPngAtomic) {
        const fileName = sliceExportFileName(slice, 'png', used)
        lastPath = joinDirectoryPath(directoryPath, fileName)
        await writeDocumentPngAtomic(api, lastPath, document, scalePercent, format, slice, (value) => {
          throwIfExportCanceled(lifecycle)
          lifecycle?.onEncodeProgress?.((index + value / 100) / slices.length * 100)
        }, lifecycle?.onCancelReady)
        throwIfExportCanceled(lifecycle)
        continue
      }
      throwIfExportCanceled(lifecycle)
      const output = format === 'gif'
        ? { ...exportAnimationGif(document, { scalePercent, frameStart: options?.gifFrameRange === 'range' ? options.gifFrameStart : undefined, frameEnd: options?.gifFrameRange === 'range' ? options.gifFrameEnd : undefined, direction: options?.gifDirection ?? 'forward', crop: slice }), extension: 'gif' as const, indexed: false }
        : await exportDocumentSliceImage(document, slice, scalePercent, format)
      throwIfExportCanceled(lifecycle)
      const fileName = sliceExportFileName(slice, output.extension, used)
      lastPath = joinDirectoryPath(directoryPath, fileName)
      lifecycle?.onWriteStart?.()
      await api.writeBinaryAtomic(lastPath, output.bytes)
      throwIfExportCanceled(lifecycle)
    }
    rememberExportPath(lastPath)
    rememberLastDocumentExport(document, options, {
      name: withExportFileExtension(requestedName, format),
      format,
      scalePercent,
      target: 'slices',
      directory: directoryPath
    })
    return translate(loadEditorPreferences().language, 'file.export.slices', { count: slices.length })
  }
  if (options?.target === 'frames') {
    if (format === 'gif') throw new Error(translate(loadEditorPreferences().language, 'file.export.framesGifUnsupported'))
    if (format === 'psd') throw new Error(translate(loadEditorPreferences().language, 'file.export.psdDocumentOnly'))
    const exportWidth = Math.max(1, Math.round(document.width * scalePercent / 100))
    const exportHeight = Math.max(1, Math.round(document.height * scalePercent / 100))
    if (!Number.isSafeInteger(exportWidth) || !Number.isSafeInteger(exportHeight)) throw new Error(translate(loadEditorPreferences().language, 'file.export.safeRange'))
    const directoryPath = await resolveBatchExportDirectory(api, options.directory)
    if (!directoryPath) return null
    throwIfExportCanceled(lifecycle)
    const frameIds = document.animation?.frames.map((frame) => frame.id) ?? [null]
    const digits = Math.max(3, String(frameIds.length).length)
    lifecycle?.onEncodeStart?.()
    let lastPath = directoryPath
    for (const [index, frameId] of frameIds.entries()) {
      throwIfExportCanceled(lifecycle)
      const frameDocument = frameId ? cloneDocumentForAnimationFrame(document, frameId) : document
      const frameNumber = String(index + 1).padStart(digits, '0')
      if (isPngFileFormat(format) && api.writeScaledPngAtomic) {
        lastPath = joinDirectoryPath(directoryPath, `${requestedName}-${frameNumber}.png`)
        await writeDocumentPngAtomic(api, lastPath, frameDocument, scalePercent, format, undefined, (value) => {
          throwIfExportCanceled(lifecycle)
          lifecycle?.onEncodeProgress?.((index + value / 100) / frameIds.length * 100)
        }, lifecycle?.onCancelReady)
        throwIfExportCanceled(lifecycle)
        continue
      }
      throwIfExportCanceled(lifecycle)
      const output = await exportDocumentImage(frameDocument, scalePercent, format)
      throwIfExportCanceled(lifecycle)
      lastPath = joinDirectoryPath(directoryPath, `${requestedName}-${frameNumber}.${output.extension}`)
      if (index === 0) lifecycle?.onWriteStart?.()
      await api.writeBinaryAtomic(lastPath, output.bytes)
      throwIfExportCanceled(lifecycle)
    }
    rememberExportPath(lastPath)
    rememberLastDocumentExport(document, options, {
      name: withExportFileExtension(requestedName, format),
      format,
      scalePercent,
      target: 'frames',
      directory: directoryPath
    })
    return translate(loadEditorPreferences().language, 'file.export.frames', { count: frameIds.length })
  }
  const exportWidth = Math.max(1, Math.round(document.width * scalePercent / 100))
  const exportHeight = Math.max(1, Math.round(document.height * scalePercent / 100))
  if (!Number.isSafeInteger(exportWidth) || !Number.isSafeInteger(exportHeight)) throw new Error(translate(loadEditorPreferences().language, 'file.export.safeRange'))
  const extension = exportFileExtension(format)
  const dialogFormat = format === 'png-auto' || format === 'png-rgba' ? 'png' : format
  const selectedDirectory = options?.directory?.trim()
  let path = selectedDirectory ? joinDirectoryPath(selectedDirectory, `${requestedName}.${extension}`) : ''
  if (!path) {
    const result = await api.exportImage(joinDirectoryPath(loadEditorPreferences().exportDirectory, `${requestedName}.${extension}`), dialogFormat)
    if (result.canceled || !result.filePath) return null
    path = result.filePath.toLowerCase().endsWith(`.${extension}`) ? result.filePath : `${result.filePath}.${extension}`
  }
  lifecycle?.onEncodeStart?.()
  throwIfExportCanceled(lifecycle)
  let output: { extension: string; indexed: boolean }
  if (isPngFileFormat(format) && api.writeScaledPngAtomic) {
    if (!path.toLowerCase().endsWith('.png')) path = `${path}.png`
    const nativePng = await writeDocumentPngAtomic(api, path, document, scalePercent, format, undefined, (value) => {
      throwIfExportCanceled(lifecycle)
      lifecycle?.onEncodeProgress?.(value)
    }, lifecycle?.onCancelReady)
    throwIfExportCanceled(lifecycle)
    output = { extension: 'png', indexed: nativePng?.indexed ?? false }
  } else {
    throwIfExportCanceled(lifecycle)
    const encoded = format === 'gif'
      ? { ...exportAnimationGif(document, { scalePercent, frameStart: options?.gifFrameRange === 'range' ? options.gifFrameStart : undefined, frameEnd: options?.gifFrameRange === 'range' ? options.gifFrameEnd : undefined, direction: options?.gifDirection ?? 'forward' }), extension: 'gif' as const, indexed: false }
      : await exportDocumentImage(document, scalePercent, format)
    throwIfExportCanceled(lifecycle)
    if (!path.toLowerCase().endsWith(`.${encoded.extension}`)) path = `${path}.${encoded.extension}`
    lifecycle?.onWriteStart?.()
    await api.writeBinaryAtomic(path, encoded.bytes)
    throwIfExportCanceled(lifecycle)
    output = encoded
  }
  throwIfExportCanceled(lifecycle)
  rememberExportPath(path)
  rememberLastDocumentExport(document, options, {
    name: fileNameFromPath(path),
    format,
    scalePercent,
    target: 'document',
    directory: parentDirectoryFromPath(path)
  })
  if (format === 'psd') return translate(loadEditorPreferences().language, 'file.export.psd')
  return output.indexed ? translate(loadEditorPreferences().language, 'file.export.indexed') : translate(loadEditorPreferences().language, 'file.export.image', { extension: output.extension.toUpperCase() })
}

export async function exportSpriteSheetFile(
  api: MoonSpriteApi,
  document: SpriteDocument,
  requestedName: string,
  requestedDirectory?: string
): Promise<string | null> {
  const directoryPath = await resolveBatchExportDirectory(api, requestedDirectory)
  if (!directoryPath) return null
  const baseName = sanitizeFileStem(requestedName, 'MoonSprite-sprite-sheet')
  const filePath = joinDirectoryPath(directoryPath, `${baseName}.png`)
  if (api.writeScaledPngAtomic) await writeDocumentPngAtomic(api, filePath, document, 100, 'png-auto')
  else {
    const output = await exportDocumentImage(document, 100, 'png-auto')
    await api.writeBinaryAtomic(filePath, output.bytes)
  }
  rememberExportPath(filePath)
  return filePath
}

export async function exportTimelapseFile(api: MoonSpriteApi, document: SpriteDocument, format: TimelapseExportFormat, options: TimelapseExportOptions, lifecycle?: FileOperationLifecycle): Promise<string | null> {
  throwIfExportCanceled(lifecycle)
  const settings = normalizeTimelapseSettings(document.timelapse, document.timelapse?.snapshots ?? [])
  if (settings.snapshots.length === 0) throw new Error(translate(loadEditorPreferences().language, 'timelapse.noFrames'))
  const fallbackName = sanitizeFileStem(document.name, 'MoonSprite-timelapse')
  const extension = format === 'jpeg' ? 'jpg' : format
  const result = await api.exportImage(joinDirectoryPath(loadEditorPreferences().exportDirectory, `${fallbackName}-timelapse.${extension}`), format)
  if (result.canceled || !result.filePath) return null

  if (!isTimelapseVideoFormat(format)) {
    const scalePercent = Math.max(1, Math.min(6400, Math.round(options.scalePercent ?? 100)))
    const requestedStem = sanitizeFileStem(fileNameFromPath(result.filePath), fallbackName)
    const directory = parentDirectoryFromPath(result.filePath)
    const digits = Math.max(3, String(settings.snapshots.length).length)
    lifecycle?.onEncodeStart?.()
    let lastPath = result.filePath
    for (const [index, snapshot] of settings.snapshots.entries()) {
      throwIfExportCanceled(lifecycle)
      const frameDocument = decodePng(snapshot.data, `${document.name}-${index + 1}`)
      const frameNumber = String(index + 1).padStart(digits, '0')
      if (format === 'png' && api.writeScaledPngAtomic) {
        lastPath = joinDirectoryPath(directory, `${requestedStem}-${frameNumber}.png`)
        await writeDocumentPngAtomic(api, lastPath, frameDocument, scalePercent, 'png-rgba', undefined, (value) => {
          throwIfExportCanceled(lifecycle)
          lifecycle?.onEncodeProgress?.((index + value / 100) / settings.snapshots.length * 100)
        }, lifecycle?.onCancelReady)
      } else {
        throwIfExportCanceled(lifecycle)
        const output = await exportDocumentImage(frameDocument, scalePercent, format === 'jpeg' ? 'jpeg' : 'png-rgba')
        throwIfExportCanceled(lifecycle)
        lastPath = joinDirectoryPath(directory, `${requestedStem}-${frameNumber}.${output.extension}`)
        if (index === 0) lifecycle?.onWriteStart?.()
        await api.writeBinaryAtomic(lastPath, output.bytes)
      }
      throwIfExportCanceled(lifecycle)
      lifecycle?.onEncodeProgress?.((index + 1) / settings.snapshots.length * 100)
    }
    throwIfExportCanceled(lifecycle)
    rememberExportPath(lastPath)
    return translate(loadEditorPreferences().language, 'timelapse.exportedImages', { count: settings.snapshots.length, format: format === 'jpeg' ? 'JPG' : 'PNG' })
  }

  lifecycle?.onEncodeStart?.()
  throwIfExportCanceled(lifecycle)
  const bytes = await encodeTimelapseVideo(settings, format, options, (value) => {
    throwIfExportCanceled(lifecycle)
    lifecycle?.onEncodeProgress?.(value)
  })
  throwIfExportCanceled(lifecycle)
  const filePath = result.filePath.toLowerCase().endsWith(`.${extension}`) ? result.filePath : `${result.filePath}.${extension}`
  lifecycle?.onWriteStart?.()
  await api.writeBinaryAtomic(filePath, bytes)
  throwIfExportCanceled(lifecycle)
  rememberExportPath(filePath)
  return translate(loadEditorPreferences().language, 'timelapse.exported', { format: format.toUpperCase() })
}

export async function openDocumentFile(api: MoonSpriteApi, filePath: string, lifecycle?: OpenDocumentLifecycle): Promise<SpriteDocument> {
  const diagnostic = runtimeDiagnosticsActive()
    ? beginRuntimeDiagnosticOperation('file.open', { extension: fileExtension(filePath) }, 5_000)
    : null
  try {
    lifecycle?.onReadStart?.()
    diagnostic?.mark('read-start')
    const bytes = await api.readBinary(filePath, ({ bytesRead, totalBytes }) => lifecycle?.onReadProgress?.(bytesRead, totalBytes))
    diagnostic?.mark('read-complete', { archiveBytes: bytes.byteLength })
    lifecycle?.onDecodeStart?.()
    const document = await decodeDocumentFileAsync(bytes, filePath, lifecycle?.onDecodeProgress)
    diagnostic?.mark('decode-complete', {
      width: document.width,
      height: document.height,
      layers: document.layers.length,
      frames: document.animation?.frames.length ?? 1
    })
    const check = checkTypedArrayLimit(document.width, document.height, document.layers.length, document.colorMode)
    if (!check.allowed) throw new Error(check.reason)
    diagnostic?.finish('ok')
    return document
  } catch (error) {
    diagnostic?.finish('error', { message: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
