import { currentAppLocale } from './localization'
import { readProjectGalleryMetadata, type ProjectGalleryMetadata } from './project-format'

interface GalleryWorkerResponse {
  id: number
  metadata?: ProjectGalleryMetadata
  error?: string
}

let galleryRequestSequence = 0

export const readProjectGalleryMetadataAsync = (data: Uint8Array): Promise<ProjectGalleryMetadata> => {
  if (typeof Worker === 'undefined') return Promise.resolve(readProjectGalleryMetadata(data, { generateMissingPreview: true }))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/project-gallery.worker.ts', import.meta.url), { type: 'module', name: 'moonsprite-project-gallery' })
    const id = ++galleryRequestSequence
    const finish = (): void => worker.terminate()
    worker.onmessage = (event: MessageEvent<GalleryWorkerResponse>) => {
      if (event.data.id !== id) return
      finish()
      if (event.data.metadata) resolve(event.data.metadata)
      else reject(new Error(event.data.error || 'Project gallery metadata failed'))
    }
    worker.onerror = (event) => {
      finish()
      reject(new Error(event.message || 'Project gallery worker failed'))
    }
    const transfer = data.buffer instanceof ArrayBuffer ? [data.buffer] : []
    worker.postMessage({ id, data, locale: currentAppLocale() }, transfer)
  })
}
