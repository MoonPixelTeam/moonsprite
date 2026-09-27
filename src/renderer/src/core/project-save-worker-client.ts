import type { ProjectEncodeWorkerPayload, ProjectEncodeWorkerResponse, ProjectEncodeWorkerResult } from './project-format-manifest-types'
import { projectDocumentForWorkerTransfer } from './project-save-transfer'
import { beginRuntimeDiagnosticOperation, runtimeDiagnosticsActive, type RuntimeDiagnosticOperation } from './runtime-diagnostics'

let projectEncodeWorker: Worker | null = null

let projectEncodeSequence = 0

const pendingProjectEncodes = new Map<
  number,
  {
    resolve: (result: ProjectEncodeWorkerResult) => void
    reject: (error: Error) => void
    diagnostic: RuntimeDiagnosticOperation | null
  }
>()

const resetProjectEncodeWorker = (error: Error): void => {
  projectEncodeWorker?.terminate()
  projectEncodeWorker = null
  for (const request of pendingProjectEncodes.values()) {
    request.diagnostic?.finish('error', { message: error.message })
    request.reject(error)
  }
  pendingProjectEncodes.clear()
}

const ensureProjectEncodeWorker = (): Worker => {
  if (projectEncodeWorker) return projectEncodeWorker
  const worker = new Worker(new URL('../workers/project-encode.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<ProjectEncodeWorkerResponse>) => {
    if (projectEncodeWorker !== worker) return
    if (!event.data || !Number.isSafeInteger(event.data.id) || event.data.id < 0) {
      resetProjectEncodeWorker(new Error(event.data?.error || 'Project encode worker message could not be decoded'))
      return
    }
    const request = pendingProjectEncodes.get(event.data.id)
    if (!request) return
    pendingProjectEncodes.delete(event.data.id)
    if (event.data.result) {
      request.diagnostic?.finish('ok', {
        outputBytes: event.data.result.data.byteLength
      })
      request.resolve(event.data.result)
    } else {
      const error = new Error(event.data.error || 'Project encode failed')
      request.diagnostic?.finish('error', { message: error.message })
      request.reject(error)
    }
  }
  worker.onerror = (event) => {
    if (projectEncodeWorker === worker) resetProjectEncodeWorker(new Error(event.message || 'Project encode worker failed'))
  }
  worker.onmessageerror = () => {
    if (projectEncodeWorker === worker) resetProjectEncodeWorker(new Error('Project encode worker message could not be decoded'))
  }
  projectEncodeWorker = worker
  return worker
}

export const encodeProjectInWorker = (payload: ProjectEncodeWorkerPayload, encodeFallback: (payload: ProjectEncodeWorkerPayload) => ProjectEncodeWorkerResult): Promise<ProjectEncodeWorkerResult> => {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => encodeFallback(payload))
  return new Promise((resolve, reject) => {
    const id = ++projectEncodeSequence
    const diagnostic = runtimeDiagnosticsActive()
      ? beginRuntimeDiagnosticOperation(
          'project.encode.worker',
          {
            width: payload.document.width,
            height: payload.document.height,
            layers: payload.document.layers.length,
            frames: payload.document.animation?.frames.length ?? 1,
            incremental: payload.incremental
          },
          5_000
        )
      : null
    pendingProjectEncodes.set(id, { resolve, reject, diagnostic })
    try {
      const postStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      ensureProjectEncodeWorker().postMessage({ id, payload: { ...payload, document: projectDocumentForWorkerTransfer(payload.document) } })
      diagnostic?.mark('post-message', {
        durationMs: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - postStartedAt)
      })
    } catch (error) {
      pendingProjectEncodes.delete(id)
      const failure = error instanceof Error ? error : new Error(String(error))
      diagnostic?.finish('error', { message: failure.message })
      reject(failure)
    }
  })
}

