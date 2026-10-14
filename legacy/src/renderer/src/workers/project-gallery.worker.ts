import type { ProjectGalleryMetadata } from '@/core/project-format'
import { readProjectGalleryMetadata } from '@/core/project-format'
import { setRuntimeAppLocale, type AppLocale } from '@/core/localization'

interface GalleryWorkerRequest {
  id: number
  data: Uint8Array
  locale: AppLocale
}

interface GalleryWorkerResponse {
  id: number
  metadata?: ProjectGalleryMetadata
  error?: string
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<GalleryWorkerRequest>) => void) | null
  postMessage: (message: GalleryWorkerResponse, transfer: Transferable[]) => void
}

scope.onmessage = (event): void => {
  const { id, data, locale } = event.data
  setRuntimeAppLocale(locale)
  try {
    const metadata = readProjectGalleryMetadata(data, { generateMissingPreview: true })
    const transfer = metadata.preview.buffer instanceof ArrayBuffer ? [metadata.preview.buffer] : []
    scope.postMessage({ id, metadata }, transfer)
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }, [])
  }
}
