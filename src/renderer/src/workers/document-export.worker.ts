import type { DocumentSlice, SpriteDocument } from '@shared/types-document'
import type { SelectionMask, SelectionRect } from '@shared/types-selection'
import { cloneDocumentForAnimationFrame } from '@/core/animation'
import { exportAnimationGif } from '@/core/gif'
import { decodePng, exportDocumentImage, exportDocumentSelectionImage, exportDocumentSliceImage } from '@/core/png'
import { documentForLayerExport } from '@/core/layer-export'
import { buildSpriteSheetExportDocument } from '@/core/sprite-sheet'
import { documentVisibleContentBounds } from '@/core/document-composite'
import type { DocumentExportWorkerRequest, DocumentExportWorkerResult } from '@/core/document-export-worker-client'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<DocumentExportWorkerRequest>) => void) | null
  postMessage: (message: { id: number; progress?: number; result?: DocumentExportWorkerResult; done?: boolean; error?: string }, transfer: Transferable[]) => void
}

const gifOptions = (request: DocumentExportWorkerRequest) => ({
  scalePercent: request.scalePercent,
  frameStart: request.gifFrameRange === 'range' ? request.gifFrameStart : undefined,
  frameEnd: request.gifFrameRange === 'range' ? request.gifFrameEnd : undefined,
  loopSectionId: request.gifFrameRange === 'loop-section' ? request.gifLoopSectionId : undefined,
  direction: request.gifDirection ?? 'forward'
})

const intersect = (a: SelectionRect, b: SelectionRect): SelectionRect | null => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

const selectionForCrop = (selection: SelectionMask, crop: SelectionRect): SelectionMask => {
  if (!selection.mask) return { ...crop }
  const mask = new Uint8Array(crop.width * crop.height)
  for (let y = 0; y < crop.height; y += 1) for (let x = 0; x < crop.width; x += 1) {
    const sourceX = crop.x + x - selection.x
    const sourceY = crop.y + y - selection.y
    if (sourceX >= 0 && sourceY >= 0 && sourceX < selection.width && sourceY < selection.height) mask[y * crop.width + x] = selection.mask[sourceY * selection.width + sourceX] ?? 0
  }
  return { ...crop, mask }
}

/** GIF uses one logical canvas for all frames, so its crop must cover its own animation. */
const animationVisibleBounds = (document: SpriteDocument): SelectionRect | null => {
  const bounds = (document.animation?.frames.length
    ? document.animation.frames.map((frame) => documentVisibleContentBounds(cloneDocumentForAnimationFrame(document, frame.id)))
    : [documentVisibleContentBounds(document)])
    .filter((value): value is SelectionRect => Boolean(value))
  if (bounds.length === 0) return null
  const left = Math.min(...bounds.map((value) => value.x))
  const top = Math.min(...bounds.map((value) => value.y))
  const right = Math.max(...bounds.map((value) => value.x + value.width))
  const bottom = Math.max(...bounds.map((value) => value.y + value.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const encode = async (document: SpriteDocument, request: DocumentExportWorkerRequest, index: number, slice?: DocumentSlice, layerId?: string): Promise<DocumentExportWorkerResult> => {
  if ((request.format === 'psd' || request.format === 'ase' || request.format === 'aseprite') && (slice || request.job === 'selection')) throw new Error('Project export does not support cropped output.')
  const sourceDocument = layerId ? documentForLayerExport(document, layerId) : document
  const baseCrop = request.job === 'selection' && request.selection
    ? { x: request.selection.x, y: request.selection.y, width: request.selection.width, height: request.selection.height }
    : slice ? slice : { x: 0, y: 0, width: sourceDocument.width, height: sourceDocument.height }
  // Every batch member is encoded independently: a frame export is trimmed
  // against that frame, and a slice/selection is trimmed inside its own area.
  const trimActive = request.trimMode !== undefined || request.trim === true
  const visible = !trimActive ? null
    : request.trimMode === 'common' || request.trim === true && request.trimMode === undefined
      ? request.format === 'gif' ? animationVisibleBounds(document) : documentVisibleContentBounds(document)
    : request.format === 'gif' ? animationVisibleBounds(sourceDocument)
    : documentVisibleContentBounds(sourceDocument)
  const crop = visible ? intersect(baseCrop, visible) : null
  const effectiveCrop: DocumentSlice = trimActive && crop ? { id: 'trim', name: 'Trim', ...crop } : baseCrop as DocumentSlice
  const selection = request.job === 'selection' && request.selection
    ? trimActive && crop ? selectionForCrop(request.selection, crop) : request.selection
    : null
  const encoded = request.format === 'gif'
    ? { ...exportAnimationGif(document, { ...gifOptions(request), ...(effectiveCrop ? { crop: effectiveCrop } : {}), ...(layerId ? { layerId } : {}) }), extension: 'gif' as const, indexed: false }
      : selection
      ? await exportDocumentSelectionImage(document, selection, request.scalePercent, request.format as Exclude<typeof request.format, 'gif' | 'psd' | 'ase' | 'aseprite'>)
      : trimActive || slice || layerId
      ? await exportDocumentSliceImage(sourceDocument, effectiveCrop, request.scalePercent, request.format as Exclude<typeof request.format, 'ase' | 'aseprite' | 'psd' | 'gif'>)
      : await exportDocumentImage(sourceDocument, request.scalePercent, request.format)
  return { index, bytes: encoded.bytes, extension: encoded.extension as DocumentExportWorkerResult['extension'], indexed: encoded.indexed }
}

scope.onmessage = async (event): Promise<void> => {
  const request = event.data
  try {
    const sourceDocument = request.job === 'sprite-sheet'
      ? buildSpriteSheetExportDocument(
        request.document,
        request.spriteSheetOptions!,
        { ...request.spriteSheetSelection!, selection: request.selection ?? null },
        request.spriteSheetNames!
      ).document
      : request.document
    const jobs: Array<{ slice?: DocumentSlice; layerId?: string; document?: SpriteDocument }> = request.job === 'slices'
      ? (request.slices ?? []).map((slice) => ({ slice }))
      : request.job === 'frames'
          ? (sourceDocument.animation?.frames?.length
          ? sourceDocument.animation.frames.map((frame) => ({ document: cloneDocumentForAnimationFrame(sourceDocument, frame.id) }))
          : [{ document: sourceDocument }])
        : request.job === 'layers'
          ? (request.layerIds ?? []).map((layerId) => ({ layerId }))
          : request.job === 'timelapse'
            ? (sourceDocument.timelapse?.snapshots ?? []).map((snapshot) => ({ document: decodePng(snapshot.data, `${sourceDocument.name}-${snapshot.id}`) }))
            : [{}]
    for (const [index, job] of jobs.entries()) {
      const result = await encode(job.document ?? sourceDocument, request, index, job.slice, job.layerId)
      scope.postMessage({ id: request.id, progress: (index + 1) / Math.max(1, jobs.length) * 100, result }, [result.bytes.buffer])
    }
    scope.postMessage({ id: request.id, progress: 100, done: true }, [])
  } catch (error) {
    scope.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) }, [])
  }
}
