import type { DocumentSlice, SpriteDocument } from '@shared/types-document'
import { prepareLocalTimelapseSave, portableTimelapseDocument } from './timelapse-library-service'
import { readTimelapseFrame } from '@/platform/timelapse-library'
import type { MoonSpriteApi } from '@shared/types-platform'
import type { TimelapseExportFormat } from '@shared/types-timelapse'
import type { RasterLayer } from '@shared/types-layer'
import { checkTypedArrayLimit } from '@/core/resource-policy'
import { decodeDocumentFileAsync, encodeDocumentForPath, encodeDocumentForSourceImage, fileExtension, fileNameFromPath, joinDirectoryPath, normalizeSaveDialogPath, sanitizeFileStem, saveImageDialogFormat, saveImageExtension, saveImageKindForPath } from '@/core/document-files'
import { documentSaveTarget, documentSaveCompatibility, type DocumentSaveFormat, type SaveCompatibilityIssue } from '@/core/document-save-policy'
import { decodePng, exportDocumentImage, exportDocumentSliceImage, type SaveImageKind } from '@/core/png'
import { sliceExportFileName } from '@/core/slices'
import { loadEditorPreferences } from '@/core/file-preferences'
import { translate, translateCurrent as tr } from '@/core/localization'
import { exportAnimationGif } from '@/core/gif'
import { encodeTimelapseVideo, isTimelapseVideoFormat, type TimelapseExportOptions } from '@/core/timelapse'
import { normalizeTimelapseSettings } from '@/core/project-metadata'
import { RECENT_EXPORTS_CHANGED_EVENT, exportFileExtension, parentDirectoryFromPath, recordRecentExportPath, saveDocumentExportSettings, withExportFileExtension, type DocumentExportSettings } from '@/core/export-settings'
import { acceptProjectSaveBaseline, encodeProjectAsync, encodeProjectSaveAsync, registerProjectSaveBaseline, type ProjectDecodeReport } from '@/core/project-format'
import { cloneDocumentForAnimationFrame } from '@/core/animation'
import { compositeRegion, compositeRegionAsync } from '@/core/document-composite'
import { selectionContains } from '@/core/selection'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import { beginRuntimeDiagnosticOperation, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'
import { documentDiagnosticDetail } from '@/core/document-diagnostics'
import { documentForLayerExport } from '@/core/layer-export'
import { exportLayersInWorker } from '@/core/layer-export-worker-client'
import { exportDocumentInWorker } from '@/core/document-export-worker-client'
import type { SpriteSheetBuildNames, SpriteSheetExportOptions, SpriteSheetExportSelection } from '@/core/sprite-sheet'

export type ExportOptions = DocumentExportSettings

type PngFileFormat = Extract<SaveImageKind, 'png-auto' | 'png-rgba'>
type PngSourceRegion = Pick<DocumentSlice, 'x' | 'y' | 'width' | 'height'>

/**
 * Creates a non-destructive export view containing one layer and its parent
 * groups.  The normal compositor still renders the result, so text/tilemap/
 * free-tile cels, styles, masks, opacity and blend modes remain WYSIWYG.
 */
const isPngFileFormat = (format: string): format is PngFileFormat => format === 'png-auto' || format === 'png-rgba'
const isProjectExportFormat = (format: string): format is Extract<SaveImageKind, 'psd' | 'ase' | 'aseprite'> => format === 'psd' || format === 'ase' || format === 'aseprite'

/** Let the renderer paint progress state before synchronous pixel encoding starts. */
const yieldToHost = (): Promise<void> => new Promise((resolve) => {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') window.setTimeout(resolve, 0)
  else setTimeout(resolve, 0)
})

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
  if (document.animation?.layerMasks?.some((entry) => entry.layerId === layer.id && entry.frameId === document.animation?.activeFrameId)) return null

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

async function writeDocumentPngAtomicResponsive(
  api: MoonSpriteApi,
  filePath: string,
  document: SpriteDocument,
  scalePercent: number,
  format: PngFileFormat,
  onProgress?: (value: number) => void,
  onCancelReady?: (cancel: () => void) => void,
  shouldCancel?: () => boolean
): Promise<{ indexed: boolean } | null> {
  if (!api.writeScaledPngAtomic) return null
  const ratio = Math.max(0.01, Math.min(64, scalePercent / 100))
  const pixels = await compositeRegionAsync(document, 0, 0, document.width, document.height, (value) => onProgress?.(value * 0.9), shouldCancel)
  if (shouldCancel?.()) throw new Error('MoonSprite export canceled.')
  return api.writeScaledPngAtomic(filePath, new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    sourceWidth: document.width,
    sourceHeight: document.height,
    outputWidth: Math.max(1, Math.round(document.width * ratio)),
    outputHeight: Math.max(1, Math.round(document.height * ratio)),
    forceRgba: format === 'png-rgba'
  }, (value) => onProgress?.(90 + value * 0.1), onCancelReady)
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

function rememberLastDocumentExport(document: SpriteDocument, options: ExportOptions | undefined, actual: Pick<DocumentExportSettings, 'name' | 'format' | 'scalePercent' | 'target' | 'directory' | 'layerId' | 'trim' | 'trimMode'>): void {
  saveDocumentExportSettings(document, {
    ...actual,
    ...(actual.target === 'slices' && options?.sliceId ? { sliceId: options.sliceId } : {}),
    ...(actual.target === 'layer' && actual.layerId ? { layerId: actual.layerId } : {}),
    ...(options?.presetName ? { presetName: options.presetName } : {}),
    ...(options?.trim ? { trim: true } : {}),
    ...(options?.trimMode ? { trimMode: options.trimMode } : {}),
    ...(actual.format === 'gif' ? {
      gifFrameRange: options?.gifFrameRange ?? 'all',
      ...(options?.gifFrameStart !== undefined ? { gifFrameStart: options.gifFrameStart } : {}),
      ...(options?.gifFrameEnd !== undefined ? { gifFrameEnd: options.gifFrameEnd } : {}),
      ...(options?.gifFrameRange === 'loop-section' && options.gifLoopSectionId ? { gifLoopSectionId: options.gifLoopSectionId } : {}),
      gifDirection: options?.gifDirection ?? 'forward'
    } : {})
  })
}

export interface SaveAsOptions {
  includeTimelapse?: boolean
  name: string
  format: DocumentSaveFormat
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
  onProjectSaveRequested?: () => Promise<boolean>
  onSaveCompatibility?: (format: DocumentSaveFormat, issues: SaveCompatibilityIssue[]) => Promise<'format' | 'project' | 'cancel'>
  onEncodeStart?: () => void
  onEncodeProgress?: (value: number) => void
  onExportTaskStart?: (current: number, total: number) => void
  onWriteStart?: () => void
  onCancelReady?: (cancel: () => void) => void
  /** Resolve an existing export target before any bytes are written. */
  onConflict?: (filePath: string, suggestedPath: string) => Promise<'overwrite' | 'rename' | 'cancel'>
  isCanceled?: () => boolean
}

export interface OpenDocumentLifecycle {
  onReadStart?: () => void
  onReadProgress?: (bytesRead: number, totalBytes: number) => void
  onDecodeStart?: () => void
  onDecodeProgress?: (value: number) => void
  /** Timelapse frames the archive declared but could not restore. */
  onDroppedTimelapseFrames?: (report: ProjectDecodeReport) => void
}

const EXPORT_CANCELED_MESSAGE = 'MoonSprite export canceled.'

function throwIfExportCanceled(lifecycle?: FileOperationLifecycle): void {
  if (lifecycle?.isCanceled?.()) throw new Error(EXPORT_CANCELED_MESSAGE)
}

async function nextAvailableExportPath(api: MoonSpriteApi, filePath: string): Promise<string | null> {
  if (!api.fileExists) return filePath
  const fileName = fileNameFromPath(filePath)
  const extensionIndex = fileName.lastIndexOf('.')
  const stem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : ''
  const directory = parentDirectoryFromPath(filePath)
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = joinDirectoryPath(directory, `${stem} (${index})${extension}`)
    if (!(await api.fileExists(candidate))) return candidate
  }
  return null
}

async function resolveExportPath(api: MoonSpriteApi, filePath: string, lifecycle?: FileOperationLifecycle): Promise<string | null> {
  if (!api.fileExists || !(await api.fileExists(filePath))) return filePath
  const suggestedPath = await nextAvailableExportPath(api, filePath)
  if (!suggestedPath) return null
  const decision = await lifecycle?.onConflict?.(filePath, suggestedPath)
  if (decision === 'overwrite') return filePath
  if (decision === 'rename') return suggestedPath
  // A conflict without an explicit decision is treated as cancellation so
  // callers never overwrite an existing export by accident.
  return null
}

const saveOperations = new Map<string, Promise<SaveDocumentResult | null>>()
// Entries live only as long as their result/pending callers. A newer generation
// must pass through the queue and encode again, including newly recorded frames.
const savedGenerations = new WeakMap<SaveDocumentResult, {
  document: SpriteDocument
  revision: number
  snapshots: NonNullable<SpriteDocument['timelapse']>['snapshots'] | undefined
  metadata: string
}>()
const saveMetadata = (document: SpriteDocument): string => JSON.stringify([
  document.name, document.filePath, document.sourceFilePath, document.displaySettings,
  document.statistics, document.layerPanelState, document.updatedAt,
  { ...document.timelapse, snapshots: undefined }, document.timelapse?.snapshots
    ? [document.timelapse.snapshots.length, document.timelapse.snapshots.at(-1)?.id] : null
])

export function saveDocumentFile(request: SaveDocumentRequest): Promise<SaveDocumentResult | null> {
  const pending = saveOperations.get(request.documentId)
  const operation = (async (): Promise<SaveDocumentResult | null> => {
    if (pending) {
      try {
        const result = await pending
        const saved = result ? savedGenerations.get(result) : undefined
        const current = request.getDocument()
        if (!request.saveAs && !request.options && result && saved && current
          && saved.document === current.document && saved.revision === current.revision
          && saved.snapshots === current.document.timelapse?.snapshots && saved.metadata === saveMetadata(current.document)) return result
      } catch { /* A failed earlier save must not block the queued retry. */ }
    }
    const initial = request.getDocument()
    if (!initial) return null
    let approvedIssues: SaveCompatibilityIssue[] = []
    const confirmFormat = async (format: DocumentSaveFormat): Promise<'format' | 'project' | 'cancel'> => {
      const current = request.getDocument()
      if (!current) return 'cancel'
      approvedIssues = documentSaveCompatibility(current.document, format)
      if (!approvedIssues.length) return 'format'
      return await request.lifecycle?.onSaveCompatibility?.(format, approvedIssues) ?? 'cancel'
    }
    const validateApproval = (document: SpriteDocument, format: DocumentSaveFormat): void => {
      if (documentSaveCompatibility(document, format).some((issue) => !approvedIssues.includes(issue))) throw new Error(tr('file.save.changedDuringConfirmation'))
    }
    const saveOriginalFormat = loadEditorPreferences().saveOriginalFormat
    const originalTarget = documentSaveTarget(initial.document)
    let forceProject = !request.options && !saveOriginalFormat && originalTarget?.format !== 'moonsprite'
    if (forceProject && originalTarget && !request.saveAs) {
      if (!await request.lifecycle?.onProjectSaveRequested?.()) return null
      if (!request.getDocument()) return null
    }
    const directSourceTarget = !request.saveAs && !request.options && !forceProject ? originalTarget : null
    if (directSourceTarget && directSourceTarget.format !== 'moonsprite') {
      const decision = await confirmFormat(directSourceTarget.format)
      if (decision === 'cancel') return null
      forceProject = decision === 'project'
      const source = request.getDocument()
      const currentTarget = source ? documentSaveTarget(source.document) : null
      if (!forceProject && source && currentTarget?.filePath === directSourceTarget.filePath && currentTarget.format === directSourceTarget.format) {
        validateApproval(source.document, currentTarget.format)
        request.lifecycle?.onEncodeStart?.()
        const nativePng = isPngFileFormat(currentTarget.format)
          ? await writeDocumentPngAtomic(request.api, currentTarget.filePath, source.document, 100, currentTarget.format, undefined, request.lifecycle?.onEncodeProgress)
          : null
        if (!nativePng) {
          const data = currentTarget.format === 'gif' || currentTarget.format === 'bmp'
            ? await encodeDocumentForSourceImage(source.document, currentTarget.format, request.lifecycle?.onEncodeProgress)
            : await encodeDocumentForPath(source.document, currentTarget.filePath, currentTarget.format, 100, request.lifecycle?.onEncodeProgress)
          request.lifecycle?.onWriteStart?.()
          await request.api.writeBinaryAtomic(currentTarget.filePath, data)
        }
        return { filePath: currentTarget.filePath, revision: source.revision, setDocumentFilePath: Boolean(source.document.filePath) }
      }
      if (!forceProject) return null
    }
    const existingFormat = initial.document.filePath
      ? (/\.moonsprite$/i.test(initial.document.filePath) ? 'moonsprite' as const : saveImageKindForPath(initial.document.filePath))
      : null
    let selectedFormat: DocumentSaveFormat = forceProject ? 'moonsprite' : request.options?.format ?? documentSaveTarget(initial.document)?.format ?? existingFormat ?? request.preferredImageFormat ?? 'moonsprite'
    if (!forceProject) {
      const decision = await confirmFormat(selectedFormat)
      if (decision === 'cancel') return null
      if (decision === 'project') { selectedFormat = 'moonsprite'; forceProject = true }
    }
    const imageFormat = selectedFormat === 'moonsprite' ? null : selectedFormat
    const fallbackName = sanitizeFileStem(initial.document.name, 'MoonSprite-export')
    const requestedName = sanitizeFileStem(request.options?.name ?? fallbackName, fallbackName)
    const saveDirectory = request.options?.directory?.trim() || loadEditorPreferences().saveDirectory
    const requestedDirectory = request.options?.directory?.trim()
    let filePath = forceProject ? null : initial.document.filePath
    if ((!filePath || request.saveAs) && requestedDirectory) {
      const extension = imageFormat ? saveImageExtension(imageFormat) : 'moonsprite'
      filePath = joinDirectoryPath(requestedDirectory, `${requestedName}.${extension}`)
    } else if ((!filePath || request.saveAs) && imageFormat) {
      const extension = saveImageExtension(imageFormat)
      const result = await request.api.saveProject(joinDirectoryPath(saveDirectory, `${requestedName}.${extension}`), saveImageDialogFormat(imageFormat))
      if (result.canceled || !result.filePath || !request.getDocument()) return null
      filePath = normalizeSaveDialogPath(result.filePath, imageFormat)
    } else if (!filePath || request.saveAs) {
      const result = await request.api.saveProject(joinDirectoryPath(saveDirectory, `${requestedName}.moonsprite`))
      if (result.canceled || !result.filePath || !request.getDocument()) return null
      filePath = result.filePath.endsWith('.moonsprite') ? result.filePath : `${result.filePath}.moonsprite`
    }
    const beforePersistence = request.getDocument()
    if (!beforePersistence || !filePath) return null
    if (!imageFormat) await prepareLocalTimelapseSave(beforePersistence.document, request.api)
    const source = request.getDocument()
    if (!source) return null
    validateApproval(source.document, selectedFormat)
    const generation = { document: source.document, revision: source.revision, snapshots: source.document.timelapse?.snapshots, metadata: saveMetadata(source.document) }
    request.lifecycle?.onEncodeStart?.()
    if (!imageFormat) {
      if (request.options?.includeTimelapse) {
        // Deliberate portable export: keep it outside the incremental baseline.
        const portable = await portableTimelapseDocument(source.document, request.api)
        const data = await encodeProjectAsync(portable, { onProgress: request.lifecycle?.onEncodeProgress })
        request.lifecycle?.onWriteStart?.()
        await request.api.writeBinaryAtomic(filePath, data)
        return { filePath, revision: source.revision, setDocumentFilePath: true }
      }
      const encoded = await encodeProjectSaveAsync(source.document, { onProgress: request.lifecycle?.onEncodeProgress })
      request.lifecycle?.onWriteStart?.()
      let acceptBaseline = true
      if (encoded.sourcePath && encoded.reusableEntries.length > 0) {
        try {
          await request.api.writeProjectIncremental(filePath, encoded.sourcePath, encoded.data)
        } catch (error) {
          console.warn('MoonSprite incremental save failed; retrying with a complete archive', error)
          const completeArchive = await encodeProjectAsync(source.document)
          await request.api.writeBinaryAtomic(filePath, completeArchive)
          // The fallback has a fresh, complete archive. Register it only after the write succeeds.
          registerProjectSaveBaseline(source.document, filePath, completeArchive)
          acceptBaseline = false
        }
      } else await request.api.writeBinaryAtomic(filePath, encoded.data)
      if (acceptBaseline) acceptProjectSaveBaseline(source.document, filePath, encoded)
    } else {
      const nativePng = isPngFileFormat(imageFormat)
        ? await writeDocumentPngAtomic(request.api, filePath, source.document, request.options?.scalePercent ?? 100, imageFormat, undefined, request.lifecycle?.onEncodeProgress)
        : null
      if (!nativePng) {
        const data = imageFormat === 'gif'
          ? await encodeDocumentForSourceImage(source.document, imageFormat, request.lifecycle?.onEncodeProgress, request.options?.scalePercent ?? 100)
          : await encodeDocumentForPath(source.document, filePath, imageFormat, request.options?.scalePercent ?? 100, request.lifecycle?.onEncodeProgress)
        request.lifecycle?.onWriteStart?.()
        await request.api.writeBinaryAtomic(filePath, data)
      }
    }
    const result = { filePath, revision: source.revision, setDocumentFilePath: true }
    if (!imageFormat && !request.saveAs && !request.options) savedGenerations.set(result, generation)
    return result
  })()
  saveOperations.set(request.documentId, operation)
  void operation.finally(() => {
    if (saveOperations.get(request.documentId) === operation) saveOperations.delete(request.documentId)
  }).catch(() => undefined)
  return operation
}

export async function exportDocumentFile(api: MoonSpriteApi, document: SpriteDocument, options?: ExportOptions, lifecycle?: FileOperationLifecycle): Promise<string | null> {
  throwIfExportCanceled(lifecycle)
  options ??= {} as ExportOptions
  if (!options) options = {} as ExportOptions
  const scalePercent = Math.max(1, Math.min(6400, Math.round(options?.scalePercent ?? 100)))
  const fallbackName = sanitizeFileStem(document.name, 'MoonSprite-export')
  const requestedName = sanitizeFileStem(options?.name ?? fallbackName, fallbackName)
  const format = options?.format ?? 'png-auto'
  const requestedTarget = options?.target ?? 'document'
  const selectedLayerId = requestedTarget === 'layer' && options?.layerId && document.layers.some((layer) => layer.id === options.layerId)
    ? options.layerId
    : undefined
  const exportLayers = requestedTarget === 'layer'
    ? selectedLayerId
      ? document.layers.filter((layer) => layer.id === selectedLayerId)
      : document.layers
    : []
  const effectiveTarget = requestedTarget === 'layer' ? 'document' : requestedTarget
  if (requestedTarget === 'layer') {
    if (isProjectExportFormat(format)) throw new Error(translate(loadEditorPreferences().language, 'file.export.projectDocumentOnly'))
    const exportWidth = Math.max(1, Math.round(document.width * scalePercent / 100))
    const exportHeight = Math.max(1, Math.round(document.height * scalePercent / 100))
    if (!Number.isSafeInteger(exportWidth) || !Number.isSafeInteger(exportHeight)) throw new Error(translate(loadEditorPreferences().language, 'file.export.safeRange'))
    const directoryPath = await resolveBatchExportDirectory(api, options?.directory)
    if (!directoryPath) return null
    throwIfExportCanceled(lifecycle)
    const usedNames = new Set<string>()
    const extension = exportFileExtension(format)
    const destinations: Array<{ layer: RasterLayer; path: string }> = []
    for (const [index, layer] of exportLayers.entries()) {
      throwIfExportCanceled(lifecycle)
      const layerStem = sanitizeFileStem(layer.name, `layer-${index + 1}`)
      let fileStem = `${requestedName}-${layerStem}`
      let duplicateIndex = 2
      while (usedNames.has(fileStem.toLocaleLowerCase())) fileStem = `${requestedName}-${layerStem}-${duplicateIndex++}`
      usedNames.add(fileStem.toLocaleLowerCase())
      const requestedLayerPath = joinDirectoryPath(directoryPath, `${fileStem}.${extension}`)
      const resolvedLayerPath = await resolveExportPath(api, requestedLayerPath, lifecycle)
      if (!resolvedLayerPath) return null
      destinations.push({ layer, path: resolvedLayerPath })
    }
    lifecycle?.onEncodeStart?.()
    await yieldToHost()
    let lastPath = directoryPath
    if (typeof Worker !== 'undefined') {
      await exportLayersInWorker(document, destinations.map(({ layer }) => layer.id), {
        scalePercent,
        trimMode: options.trimMode ?? (options.trim ? 'individual' : undefined),
        format,
        gifFrameRange: options?.gifFrameRange,
        gifFrameStart: options?.gifFrameStart,
        gifFrameEnd: options?.gifFrameEnd,
        gifLoopSectionId: options?.gifLoopSectionId,
        gifDirection: options?.gifDirection
      }, {
        onProgress: (value) => lifecycle?.onEncodeProgress?.(value),
        isCanceled: lifecycle?.isCanceled,
        onResult: async (result) => {
          const destination = destinations[result.index]
          if (!destination) throw new Error('Layer export worker returned an invalid layer index.')
          lifecycle?.onExportTaskStart?.(result.index + 1, destinations.length)
          lastPath = destination.path
          lifecycle?.onWriteStart?.()
          await api.writeBinaryAtomic(lastPath, result.bytes)
        }
      })
      throwIfExportCanceled(lifecycle)
      rememberExportPath(lastPath)
      rememberLastDocumentExport(document, options, {
        name: withExportFileExtension(requestedName, format),
        format,
        scalePercent,
        trimMode: options.trimMode ?? (options.trim ? 'individual' : undefined),
        target: 'layer',
        ...(selectedLayerId ? { layerId: selectedLayerId } : {}),
        directory: directoryPath
      })
      return translate(loadEditorPreferences().language, 'file.export.layers', { count: exportLayers.length })
    }
    for (const [index, { layer, path }] of destinations.entries()) {
      throwIfExportCanceled(lifecycle)
      await yieldToHost()
      lifecycle?.onExportTaskStart?.(index + 1, destinations.length)
      lastPath = path
      const layerDocument = format === 'gif' ? document : documentForLayerExport(document, layer.id)
      if (isPngFileFormat(format) && api.writeScaledPngAtomic) {
        await writeDocumentPngAtomicResponsive(api, lastPath, layerDocument, scalePercent, format, (value) => {
          throwIfExportCanceled(lifecycle)
          lifecycle?.onEncodeProgress?.((index + value / 100) / exportLayers.length * 100)
        }, lifecycle?.onCancelReady, lifecycle?.isCanceled)
      } else {
        const output = format === 'gif'
          ? exportAnimationGif(document, { scalePercent, frameStart: options?.gifFrameRange === 'range' ? options?.gifFrameStart : undefined, frameEnd: options?.gifFrameRange === 'range' ? options?.gifFrameEnd : undefined, loopSectionId: options?.gifFrameRange === 'loop-section' ? options?.gifLoopSectionId : undefined, direction: options?.gifDirection ?? 'forward', layerId: layer.id })
          : await exportDocumentImage(layerDocument, scalePercent, format)
        lifecycle?.onWriteStart?.()
        await api.writeBinaryAtomic(lastPath, output.bytes)
      }
      throwIfExportCanceled(lifecycle)
      lifecycle?.onEncodeProgress?.((index + 1) / exportLayers.length * 100)
    }
    rememberExportPath(lastPath)
    rememberLastDocumentExport(document, options, {
      name: withExportFileExtension(requestedName, format),
      format,
      scalePercent,
      target: 'layer',
      ...(selectedLayerId ? { layerId: selectedLayerId } : {}),
      directory: directoryPath
    })
    return translate(loadEditorPreferences().language, 'file.export.layers', { count: exportLayers.length })
  }
  if (effectiveTarget === 'selection') {
    if (isProjectExportFormat(format)) throw new Error(translate(loadEditorPreferences().language, 'file.export.projectDocumentOnly'))
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
    const resolvedPath = await resolveExportPath(api, path, lifecycle)
    if (!resolvedPath) return null
    path = resolvedPath
    if (typeof Worker !== 'undefined') {
      lifecycle?.onEncodeStart?.()
      await exportDocumentInWorker(document, {
        job: 'selection',
        format,
        scalePercent,
        trimMode: options.trimMode ?? (options.trim ? 'individual' : undefined),
        selection,
        gifFrameRange: options.gifFrameRange,
        gifFrameStart: options.gifFrameStart,
        gifFrameEnd: options.gifFrameEnd,
        gifLoopSectionId: options.gifLoopSectionId,
        gifDirection: options.gifDirection
      }, {
        onProgress: (value) => lifecycle?.onEncodeProgress?.(value),
        isCanceled: lifecycle?.isCanceled,
        onResult: async (result) => {
          if (!path.toLowerCase().endsWith(`.${result.extension}`)) path = `${path}.${result.extension}`
          lifecycle?.onWriteStart?.()
          await api.writeBinaryAtomic(path, result.bytes)
        }
      })
      throwIfExportCanceled(lifecycle)
      rememberExportPath(path)
      rememberLastDocumentExport(document, options, { name: fileNameFromPath(path), format, scalePercent, target: 'selection', directory: parentDirectoryFromPath(path) })
      return translate(loadEditorPreferences().language, 'file.export.image', { extension: exportFileExtension(format).toUpperCase() })
    }
    throwIfExportCanceled(lifecycle)
    lifecycle?.onEncodeStart?.()
    let output: { extension: string; indexed: boolean }
    if (isPngFileFormat(format) && api.writeScaledPngAtomic) {
      const nativePng = await writeDocumentPngAtomic(api, path, document, scalePercent, format, region, lifecycle?.onEncodeProgress, lifecycle?.onCancelReady, selection)
      output = { extension: 'png', indexed: nativePng?.indexed ?? false }
    } else {
      const encoded = format === 'gif'
        ? { ...exportAnimationGif(document, { scalePercent, frameStart: options.gifFrameRange === 'range' ? options.gifFrameStart : undefined, frameEnd: options.gifFrameRange === 'range' ? options.gifFrameEnd : undefined, loopSectionId: options.gifFrameRange === 'loop-section' ? options.gifLoopSectionId : undefined, direction: options.gifDirection ?? 'forward', crop: region }), extension: 'gif' as const, indexed: false }
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
  if (effectiveTarget === 'slices') {
    if (isProjectExportFormat(format)) throw new Error(translate(loadEditorPreferences().language, 'file.export.projectDocumentOnly'))
    const documentSlices = document.slices ?? []
    if (documentSlices.length === 0) throw new Error(translate(loadEditorPreferences().language, 'file.export.noSlices'))
    const slices = options.sliceId ? documentSlices.filter((slice) => slice.id === options.sliceId) : documentSlices
    if (slices.length === 0) throw new Error(translate(loadEditorPreferences().language, 'file.export.sliceMissing'))
    const directoryPath = await resolveBatchExportDirectory(api, options.directory)
    if (!directoryPath) return null
    // Resolve every destination before reporting encoding progress.  The
    // fallback renderer path is synchronous, so resolving a collision from
    // inside its encode loop otherwise leaves the progress dialog visible
    // behind the conflict dialog.
    const extension = exportFileExtension(format)
    const usedSliceNames = new Set<string>()
    const destinations: Array<{ slice: DocumentSlice; path: string }> = []
    for (const slice of slices) {
      throwIfExportCanceled(lifecycle)
      const requestedPath = joinDirectoryPath(directoryPath, sliceExportFileName(slice, extension, usedSliceNames))
      const resolvedPath = await resolveExportPath(api, requestedPath, lifecycle)
      if (!resolvedPath) return null
      destinations.push({ slice, path: resolvedPath })
    }
    if (typeof Worker !== 'undefined') {
      lifecycle?.onEncodeStart?.()
      let lastPath = directoryPath
      await exportDocumentInWorker(document, {
        job: 'slices',
        format,
        scalePercent,
        trimMode: options.trimMode ?? (options.trim ? 'individual' : undefined),
        slices: destinations.map(({ slice }) => slice),
        gifFrameRange: options.gifFrameRange,
        gifFrameStart: options.gifFrameStart,
        gifFrameEnd: options.gifFrameEnd,
        gifLoopSectionId: options.gifLoopSectionId,
        gifDirection: options.gifDirection
      }, {
        onProgress: (value) => lifecycle?.onEncodeProgress?.(value),
        isCanceled: lifecycle?.isCanceled,
        onResult: async (result) => {
          const destination = destinations[result.index]
          if (!destination) throw new Error('Document export worker returned an invalid slice index.')
          lifecycle?.onExportTaskStart?.(result.index + 1, destinations.length)
          lastPath = destination.path
          lifecycle?.onWriteStart?.()
          await api.writeBinaryAtomic(lastPath, result.bytes)
        }
      })
      throwIfExportCanceled(lifecycle)
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
    throwIfExportCanceled(lifecycle)
    lifecycle?.onEncodeStart?.()
    let lastPath = directoryPath
    for (const [index, { slice, path }] of destinations.entries()) {
      throwIfExportCanceled(lifecycle)
      lifecycle?.onExportTaskStart?.(index + 1, slices.length)
      if (isPngFileFormat(format) && api.writeScaledPngAtomic) {
        lastPath = path
        await writeDocumentPngAtomic(api, lastPath, document, scalePercent, format, slice, (value) => {
          throwIfExportCanceled(lifecycle)
          lifecycle?.onEncodeProgress?.((index + value / 100) / slices.length * 100)
        }, lifecycle?.onCancelReady)
        throwIfExportCanceled(lifecycle)
        continue
      }
      throwIfExportCanceled(lifecycle)
      const output = format === 'gif'
        ? { ...exportAnimationGif(document, { scalePercent, frameStart: options?.gifFrameRange === 'range' ? options.gifFrameStart : undefined, frameEnd: options?.gifFrameRange === 'range' ? options.gifFrameEnd : undefined, loopSectionId: options?.gifFrameRange === 'loop-section' ? options.gifLoopSectionId : undefined, direction: options?.gifDirection ?? 'forward', crop: slice }), extension: 'gif' as const, indexed: false }
        : await exportDocumentSliceImage(document, slice, scalePercent, format)
      throwIfExportCanceled(lifecycle)
      lastPath = path
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
  if (effectiveTarget === 'frames') {
    if (format === 'gif') throw new Error(translate(loadEditorPreferences().language, 'file.export.framesGifUnsupported'))
    if (isProjectExportFormat(format)) throw new Error(translate(loadEditorPreferences().language, 'file.export.projectDocumentOnly'))
    const exportWidth = Math.max(1, Math.round(document.width * scalePercent / 100))
    const exportHeight = Math.max(1, Math.round(document.height * scalePercent / 100))
    if (!Number.isSafeInteger(exportWidth) || !Number.isSafeInteger(exportHeight)) throw new Error(translate(loadEditorPreferences().language, 'file.export.safeRange'))
    const directoryPath = await resolveBatchExportDirectory(api, options.directory)
    if (!directoryPath) return null
    const frameIds = document.animation?.frames.map((frame) => frame.id) ?? [null]
    const digits = Math.max(3, String(frameIds.length).length)
    const extension = exportFileExtension(format)
    const destinations: Array<{ frameId: string | null; path: string }> = []
    for (const [index, frameId] of frameIds.entries()) {
      throwIfExportCanceled(lifecycle)
      const frameNumber = String(index + 1).padStart(digits, '0')
      const requestedPath = joinDirectoryPath(directoryPath, `${requestedName}-${frameNumber}.${extension}`)
      const resolvedPath = await resolveExportPath(api, requestedPath, lifecycle)
      if (!resolvedPath) return null
      destinations.push({ frameId, path: resolvedPath })
    }
    if (typeof Worker !== 'undefined') {
      lifecycle?.onEncodeStart?.()
      let lastPath = directoryPath
      await exportDocumentInWorker(document, {
        job: 'frames',
        format,
        scalePercent,
        trim: options.trim
      }, {
        onProgress: (value) => lifecycle?.onEncodeProgress?.(value),
        isCanceled: lifecycle?.isCanceled,
        onResult: async (result) => {
          const destination = destinations[result.index]
          if (!destination) throw new Error('Document export worker returned an invalid frame index.')
          lifecycle?.onExportTaskStart?.(result.index + 1, destinations.length)
          lastPath = destination.path
          lifecycle?.onWriteStart?.()
          await api.writeBinaryAtomic(lastPath, result.bytes)
        }
      })
      throwIfExportCanceled(lifecycle)
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
    throwIfExportCanceled(lifecycle)
    lifecycle?.onEncodeStart?.()
    let lastPath = directoryPath
    for (const [index, { frameId, path }] of destinations.entries()) {
      throwIfExportCanceled(lifecycle)
      lifecycle?.onExportTaskStart?.(index + 1, frameIds.length)
      const frameDocument = frameId ? cloneDocumentForAnimationFrame(document, frameId) : document
      if (isPngFileFormat(format) && api.writeScaledPngAtomic) {
        lastPath = path
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
      lastPath = path
      if (index === 0) lifecycle?.onWriteStart?.()
      await api.writeBinaryAtomic(lastPath, output.bytes)
      throwIfExportCanceled(lifecycle)
    }
    rememberExportPath(lastPath)
    rememberLastDocumentExport(document, options, {
      name: withExportFileExtension(requestedName, format),
      format,
      scalePercent,
      trimMode: options.trimMode ?? (options.trim ? 'individual' : undefined),
      target: 'frames',
      directory: directoryPath
    })
    return translate(loadEditorPreferences().language, 'file.export.frames', { count: frameIds.length })
  }
  const exportWidth = Math.max(1, Math.round(document.width * scalePercent / 100))
  const exportHeight = Math.max(1, Math.round(document.height * scalePercent / 100))
  if (!Number.isSafeInteger(exportWidth) || !Number.isSafeInteger(exportHeight)) throw new Error(translate(loadEditorPreferences().language, 'file.export.safeRange'))
  const extension = exportFileExtension(format)
  const dialogFormat = format === 'png-auto' || format === 'png-rgba' ? 'png' : format === 'ase' || format === 'aseprite' ? 'aseprite' : format
  const selectedDirectory = options?.directory?.trim()
  let path = selectedDirectory ? joinDirectoryPath(selectedDirectory, `${requestedName}.${extension}`) : ''
  if (!path) {
    const result = await api.exportImage(joinDirectoryPath(loadEditorPreferences().exportDirectory, `${requestedName}.${extension}`), dialogFormat)
    if (result.canceled || !result.filePath) return null
    path = result.filePath.toLowerCase().endsWith(`.${extension}`) ? result.filePath : `${result.filePath}.${extension}`
  }
  const resolvedPath = await resolveExportPath(api, path, lifecycle)
  if (!resolvedPath) return null
  path = resolvedPath
  if (typeof Worker !== 'undefined') {
    lifecycle?.onEncodeStart?.()
    await exportDocumentInWorker(document, {
        job: 'document',
        format,
        scalePercent,
        trimMode: options.trimMode ?? (options.trim ? 'individual' : undefined),
      gifFrameRange: options.gifFrameRange,
      gifFrameStart: options.gifFrameStart,
      gifFrameEnd: options.gifFrameEnd,
      gifLoopSectionId: options.gifLoopSectionId,
      gifDirection: options.gifDirection
    }, {
      onProgress: (value) => lifecycle?.onEncodeProgress?.(value),
      isCanceled: lifecycle?.isCanceled,
      onResult: async (result) => {
        if (!path.toLowerCase().endsWith(`.${result.extension}`)) path = `${path}.${result.extension}`
        lifecycle?.onWriteStart?.()
        await api.writeBinaryAtomic(path, result.bytes)
      }
    })
    throwIfExportCanceled(lifecycle)
    rememberExportPath(path)
    rememberLastDocumentExport(document, options, { name: fileNameFromPath(path), format, scalePercent, target: 'document', directory: parentDirectoryFromPath(path) })
    if (format === 'psd') return translate(loadEditorPreferences().language, 'file.export.psd')
    return translate(loadEditorPreferences().language, 'file.export.image', { extension: exportFileExtension(format).toUpperCase() })
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
      ? { ...exportAnimationGif(document, { scalePercent, frameStart: options?.gifFrameRange === 'range' ? options.gifFrameStart : undefined, frameEnd: options?.gifFrameRange === 'range' ? options.gifFrameEnd : undefined, loopSectionId: options?.gifFrameRange === 'loop-section' ? options.gifLoopSectionId : undefined, direction: options?.gifDirection ?? 'forward', layerId: selectedLayerId }), extension: 'gif' as const, indexed: false }
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
  requestedDirectory?: string,
  lifecycle?: FileOperationLifecycle,
  build?: { options: SpriteSheetExportOptions; selection: SpriteSheetExportSelection; names: SpriteSheetBuildNames }
): Promise<string | null> {
  const directoryPath = await resolveBatchExportDirectory(api, requestedDirectory)
  if (!directoryPath) return null
  const baseName = sanitizeFileStem(requestedName, 'MoonSprite-sprite-sheet')
  const requestedPath = joinDirectoryPath(directoryPath, `${baseName}.png`)
  const filePath = await resolveExportPath(api, requestedPath, lifecycle)
  if (!filePath) return null
  if (typeof Worker !== 'undefined') {
    lifecycle?.onEncodeStart?.()
    await exportDocumentInWorker(document, {
      job: build ? 'sprite-sheet' : 'document',
      format: 'png-auto',
      scalePercent: 100,
      ...(build ? {
        spriteSheetOptions: build.options,
        spriteSheetSelection: build.selection,
        spriteSheetNames: build.names,
        selection: build.selection.selection
      } : {})
    }, {
      onProgress: (value) => lifecycle?.onEncodeProgress?.(value),
      isCanceled: lifecycle?.isCanceled,
      onResult: async (result) => {
        lifecycle?.onWriteStart?.()
        await api.writeBinaryAtomic(filePath, result.bytes)
      }
    })
    throwIfExportCanceled(lifecycle)
    rememberExportPath(filePath)
    return filePath
  }
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
  const settings = normalizeTimelapseSettings({ ...document.timelapse, ...(options.quality ? { quality: options.quality } : {}), ...(options.speed !== undefined ? { speed: options.speed } : {}) }, document.timelapse?.snapshots ?? [])
  if (settings.snapshots.length === 0) throw new Error(translate(loadEditorPreferences().language, 'timelapse.noFrames'))
  const fallbackName = sanitizeFileStem(document.name, 'MoonSprite-timelapse')
  const extension = format === 'jpeg' ? 'jpg' : format
  const requestedName = sanitizeFileStem((options.name ?? '').replace(/\.(mp4|webm)$/i, ''), `${fallbackName}-timelapse`)
  const selectedDirectory = options.directory?.trim()
  let selectedPath = selectedDirectory ? joinDirectoryPath(selectedDirectory, `${requestedName}.${extension}`) : ''
  if (!selectedPath) {
    const result = await api.exportImage(joinDirectoryPath(loadEditorPreferences().exportDirectory, `${requestedName}.${extension}`), format)
    if (result.canceled || !result.filePath) return null
    selectedPath = result.filePath
  }
  throwIfExportCanceled(lifecycle)

  if (!isTimelapseVideoFormat(format)) {
    const scalePercent = Math.max(1, Math.min(6400, Math.round(options.scalePercent ?? 100)))
    const requestedStem = sanitizeFileStem(fileNameFromPath(selectedPath), fallbackName)
    const directory = parentDirectoryFromPath(selectedPath)
    const digits = Math.max(3, String(settings.snapshots.length).length)
    // Resolve every destination before progress UI or encoding starts.
    const destinations: string[] = []
    for (let index = 0; index < settings.snapshots.length; index += 1) {
      throwIfExportCanceled(lifecycle)
      const frameNumber = String(index + 1).padStart(digits, '0')
      const requestedPath = joinDirectoryPath(directory, `${requestedStem}-${frameNumber}.${extension}`)
      const resolvedPath = await resolveExportPath(api, requestedPath, lifecycle)
      if (!resolvedPath) return null
      destinations.push(resolvedPath)
    }
    throwIfExportCanceled(lifecycle)
    if (typeof Worker !== 'undefined' && !settings.snapshots.some(frame => frame.local)) {
      lifecycle?.onEncodeStart?.()
      let lastPath = directory
      await exportDocumentInWorker(document, {
        job: 'timelapse',
        format: format === 'jpeg' ? 'jpeg' : 'png-rgba',
        scalePercent
      }, {
        onProgress: (value) => lifecycle?.onEncodeProgress?.(value),
        isCanceled: lifecycle?.isCanceled,
        onResult: async (workerResult) => {
          const destination = destinations[workerResult.index]
          if (!destination) throw new Error('Document export worker returned an invalid timelapse frame index.')
          lifecycle?.onExportTaskStart?.(workerResult.index + 1, destinations.length)
          lastPath = destination
          lifecycle?.onWriteStart?.()
          await api.writeBinaryAtomic(lastPath, workerResult.bytes)
        }
      })
      throwIfExportCanceled(lifecycle)
      rememberExportPath(lastPath)
      return translate(loadEditorPreferences().language, 'timelapse.exportedImages', { count: settings.snapshots.length, format: format === 'jpeg' ? 'JPG' : 'PNG' })
    }
    lifecycle?.onEncodeStart?.()
    let lastPath = selectedPath
    for (const [index, snapshot] of settings.snapshots.entries()) {
      throwIfExportCanceled(lifecycle)
      lifecycle?.onExportTaskStart?.(index + 1, settings.snapshots.length)
      const frameDocument = decodePng(await readTimelapseFrame(snapshot, api), `${document.name}-${index + 1}`)
      lastPath = destinations[index]
      if (format === 'png' && api.writeScaledPngAtomic) {
        await writeDocumentPngAtomic(api, lastPath, frameDocument, scalePercent, 'png-rgba', undefined, (value) => {
          throwIfExportCanceled(lifecycle)
          lifecycle?.onEncodeProgress?.((index + value / 100) / settings.snapshots.length * 100)
        }, lifecycle?.onCancelReady)
      } else {
        throwIfExportCanceled(lifecycle)
        const output = await exportDocumentImage(frameDocument, scalePercent, format === 'jpeg' ? 'jpeg' : 'png-rgba')
        throwIfExportCanceled(lifecycle)
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

  // Chromium exposes MediaRecorder/captureStream on the window canvas, not
  // reliably in dedicated workers. Keep this video-only path on the renderer;
  // still-image/timelapse-frame exports above use the document worker.
  const filePath = selectedPath.toLowerCase().endsWith(`.${extension}`) ? selectedPath : `${selectedPath}.${extension}`
  const resolvedFilePath = await resolveExportPath(api, filePath, lifecycle)
  if (!resolvedFilePath) return null
  throwIfExportCanceled(lifecycle)
  lifecycle?.onEncodeStart?.()
  throwIfExportCanceled(lifecycle)
  const bytes = await encodeTimelapseVideo(settings, format, options, (value) => {
    throwIfExportCanceled(lifecycle)
    lifecycle?.onEncodeProgress?.(value)
  }, snapshot => readTimelapseFrame(snapshot, api))
  throwIfExportCanceled(lifecycle)
  lifecycle?.onWriteStart?.()
  await api.writeBinaryAtomic(resolvedFilePath, bytes)
  throwIfExportCanceled(lifecycle)
  rememberExportPath(resolvedFilePath)
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
    const document = await decodeDocumentFileAsync(bytes, filePath, lifecycle?.onDecodeProgress, lifecycle?.onDroppedTimelapseFrames)
    diagnostic?.mark('decode-complete', {
      ...documentDiagnosticDetail(document),
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
