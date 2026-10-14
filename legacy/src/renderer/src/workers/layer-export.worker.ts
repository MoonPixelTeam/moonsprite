import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import { cloneDocumentForAnimationFrame } from '@/core/animation'
import { exportAnimationGif } from '@/core/gif'
import { exportDocumentImage, exportDocumentSliceImage } from '@/core/png'
import { documentVisibleContentBounds } from '@/core/document-composite'
import { documentForLayerExport } from '@/core/layer-export'
import type { LayerExportWorkerRequest, LayerExportWorkerResult } from '@/core/layer-export-worker-client'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LayerExportWorkerRequest>) => void) | null
  postMessage: (message: { id: number; progress?: number; result?: LayerExportWorkerResult; done?: boolean; error?: string }, transfer: Transferable[]) => void
}

const trimBoundsForLayerAnimation = (document: SpriteDocument, layerId: string): SelectionRect | null => {
  const frames = document.animation?.frames.length ? document.animation.frames : [null]
  const bounds = frames.map((frame) => documentVisibleContentBounds(documentForLayerExport(frame ? cloneDocumentForAnimationFrame(document, frame.id) : document, layerId)))
    .filter((value): value is SelectionRect => Boolean(value))
  if (bounds.length === 0) return null
  const left = Math.min(...bounds.map((value) => value.x))
  const top = Math.min(...bounds.map((value) => value.y))
  const right = Math.max(...bounds.map((value) => value.x + value.width))
  const bottom = Math.max(...bounds.map((value) => value.y + value.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

scope.onmessage = async (event): Promise<void> => {
  const request = event.data
  try {
    for (const [index, layerId] of request.layerIds.entries()) {
      const layerDocument: SpriteDocument = documentForLayerExport(request.document, layerId)
      const trimBounds = request.trimMode === 'common' || request.trim === true
        ? documentVisibleContentBounds(request.document)
        : request.trimMode === 'individual' ? (request.format === 'gif' ? trimBoundsForLayerAnimation(request.document, layerId) : documentVisibleContentBounds(layerDocument))
        : null
      const encoded = request.format === 'gif'
        ? { ...exportAnimationGif(request.document, { scalePercent: request.scalePercent, protection: request.protection, frameStart: request.gifFrameRange === 'range' ? request.gifFrameStart : undefined, frameEnd: request.gifFrameRange === 'range' ? request.gifFrameEnd : undefined, loopSectionId: request.gifFrameRange === 'loop-section' ? request.gifLoopSectionId : undefined, direction: request.gifDirection ?? 'forward', layerId, ...(trimBounds ? { crop: trimBounds } : {}) }), extension: 'gif' as const, indexed: false }
        : trimBounds
          ? await exportDocumentSliceImage(layerDocument, { id: 'trim', name: 'Trim', ...trimBounds }, request.scalePercent, request.format, request.protection)
          : await exportDocumentImage(layerDocument, request.scalePercent, request.format, request.protection)
      const result: LayerExportWorkerResult = { index, layerId, bytes: encoded.bytes, extension: encoded.extension as LayerExportWorkerResult['extension'], indexed: encoded.indexed }
      scope.postMessage({ id: request.id, progress: (index + 1) / request.layerIds.length * 100, result }, [encoded.bytes.buffer])
    }
    scope.postMessage({ id: request.id, progress: 100, done: true }, [])
  } catch (error) {
    scope.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) }, [])
  }
}
