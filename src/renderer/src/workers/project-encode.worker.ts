import { encodeProjectWorkerPayload, type ProjectEncodeWorkerPayload, type ProjectEncodeWorkerResult } from '@/core/project-format'
import { rehydrateRuntimeRasterDocument } from '@/core/runtime-raster'

interface ProjectEncodeWorkerRequest {
  id: number
  payload: ProjectEncodeWorkerPayload
}

interface ProjectEncodeWorkerResponse {
  id: number
  result?: ProjectEncodeWorkerResult
  error?: string
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ProjectEncodeWorkerRequest>) => void) | null
  onmessageerror: (() => void) | null
  postMessage: (message: ProjectEncodeWorkerResponse, transfer: Transferable[]) => void
}

scope.onmessage = (event): void => {
  if (!event.data || !Number.isSafeInteger(event.data.id)) {
    scope.postMessage({ id: -1, error: 'Project encode worker message could not be decoded' }, [])
    return
  }
  const { id, payload } = event.data
  try {
    rehydrateRuntimeRasterDocument(payload.document)
    const result = encodeProjectWorkerPayload(payload)
    scope.postMessage({ id, result }, [result.data.buffer])
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }, [])
  }
}

scope.onmessageerror = () => {
  scope.postMessage({ id: -1, error: 'Project encode worker message could not be decoded' }, [])
}
