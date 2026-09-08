import type { SpriteDocument } from '@shared/types'
import { exportAnimationGif } from '@/core/gif'
import { exportDocumentImage } from '@/core/png'
import { documentForLayerExport } from '@/core/layer-export'
import type { LayerExportWorkerRequest, LayerExportWorkerResult } from '@/core/layer-export-worker-client'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LayerExportWorkerRequest>) => void) | null
  postMessage: (message: { id: number; progress?: number; result?: LayerExportWorkerResult; done?: boolean; error?: string }, transfer: Transferable[]) => void
}

scope.onmessage = async (event): Promise<void> => {
  const request = event.data
  try {
    for (const [index, layerId] of request.layerIds.entries()) {
      const layerDocument: SpriteDocument = documentForLayerExport(request.document, layerId)
      const encoded = request.format === 'gif'
        ? { ...exportAnimationGif(request.document, { scalePercent: request.scalePercent, frameStart: request.gifFrameRange === 'range' ? request.gifFrameStart : undefined, frameEnd: request.gifFrameRange === 'range' ? request.gifFrameEnd : undefined, loopSectionId: request.gifFrameRange === 'loop-section' ? request.gifLoopSectionId : undefined, direction: request.gifDirection ?? 'forward', layerId }), extension: 'gif' as const, indexed: false }
        : await exportDocumentImage(layerDocument, request.scalePercent, request.format)
      const result: LayerExportWorkerResult = { index, layerId, bytes: encoded.bytes, extension: encoded.extension as LayerExportWorkerResult['extension'], indexed: encoded.indexed }
      scope.postMessage({ id: request.id, progress: (index + 1) / request.layerIds.length * 100, result }, [encoded.bytes.buffer])
    }
    scope.postMessage({ id: request.id, progress: 100, done: true }, [])
  } catch (error) {
    scope.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) }, [])
  }
}
