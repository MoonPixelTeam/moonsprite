import type { ExportProtection } from './export-protection'
import type { SpriteDocument } from '@shared/types-document'
import type { GifDirection } from './gif'
import { exportDocumentInWorker } from './document-export-worker-client'

export type LayerWorkerFormat = 'png-auto' | 'png-rgba' | 'jpeg' | 'webp' | 'svg' | 'gif' | 'bmp' | 'ico'

export interface LayerExportWorkerRequest {
  id: number
  document: SpriteDocument
  layerIds: string[]
  protection?: ExportProtection
  scalePercent: number
  trim?: boolean
  trimMode?: 'individual' | 'common'
  format: LayerWorkerFormat
  gifFrameRange?: 'all' | 'range' | 'loop-section'
  gifFrameStart?: number
  gifFrameEnd?: number
  gifLoopSectionId?: string
  gifDirection?: GifDirection
}

export interface LayerExportWorkerResult {
  index: number
  layerId: string
  bytes: Uint8Array
  extension: 'png' | 'jpg' | 'webp' | 'svg' | 'gif' | 'bmp' | 'ico'
  indexed: boolean
}

export const exportLayersInWorker = (
  document: SpriteDocument,
  layerIds: readonly string[],
  options: Omit<LayerExportWorkerRequest, 'id' | 'document' | 'layerIds'>,
  callbacks: {
    onProgress?: (value: number) => void
    onResult: (result: LayerExportWorkerResult) => Promise<void> | void
    isCanceled?: () => boolean
    signal?: AbortSignal
  }
): Promise<void> => {
  // Shared exporter waits for the disk consumer's ACK before encoding another
  // layer, and protects worker transfer preparation and cancellation.
  return exportDocumentInWorker(document, { ...options, job: 'layers', layerIds: [...layerIds] }, {
    ...callbacks,
    onResult: result => {
      const layerId = layerIds[result.index]
      if (!layerId || !['png', 'jpg', 'webp', 'svg', 'gif', 'bmp', 'ico'].includes(result.extension)) throw new Error('Invalid layer export result')
      return callbacks.onResult({ ...result, layerId, extension: result.extension as LayerExportWorkerResult['extension'] })
    }
  })
}
