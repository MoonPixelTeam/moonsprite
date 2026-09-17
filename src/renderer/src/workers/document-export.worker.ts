import type { DocumentSlice, SpriteDocument } from '@shared/types-document'
import type { SelectionMask } from '@shared/types-selection'
import { cloneDocumentForAnimationFrame } from '@/core/animation'
import { exportAnimationGif } from '@/core/gif'
import { decodePng, exportDocumentImage, exportDocumentSelectionImage, exportDocumentSliceImage } from '@/core/png'
import { documentForLayerExport } from '@/core/layer-export'
import { buildSpriteSheetExportDocument } from '@/core/sprite-sheet'
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

const encode = async (document: SpriteDocument, request: DocumentExportWorkerRequest, index: number, slice?: DocumentSlice, layerId?: string): Promise<DocumentExportWorkerResult> => {
  if (request.format === 'psd' && (slice || request.job === 'selection')) throw new Error('PSD export does not support cropped output.')
  const selection = request.job === 'selection' ? request.selection : null
  const encoded = request.format === 'gif'
    ? { ...exportAnimationGif(document, { ...gifOptions(request), ...(slice ? { crop: slice } : {}), ...(layerId ? { layerId } : {}) }), extension: 'gif' as const, indexed: false }
    : selection
      ? await exportDocumentSelectionImage(document, selection, request.scalePercent, request.format as Exclude<typeof request.format, 'gif' | 'psd'>)
      : slice
      ? await exportDocumentSliceImage(document, slice, request.scalePercent, request.format as Exclude<typeof request.format, 'ase' | 'aseprite' | 'psd' | 'gif'>)
      : await exportDocumentImage(layerId ? documentForLayerExport(document, layerId) : document, request.scalePercent, request.format)
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
