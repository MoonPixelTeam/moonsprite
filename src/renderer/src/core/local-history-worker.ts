import { packLocalHistory, type LocalHistoryPackRequest, type LocalHistoryPackResult } from './local-history-archive'

let worker: Worker | null = null
let sequence = 0
const pending = new Map<number, { resolve: (result: LocalHistoryPackResult) => void; reject: (error: Error) => void }>()

export function packLocalHistoryAsync(request: LocalHistoryPackRequest): Promise<LocalHistoryPackResult> {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => packLocalHistory(request))
  if (!worker) {
    worker = new Worker(new URL('../workers/local-history.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ id: number; result?: LocalHistoryPackResult; error?: string }>) => {
      const task = pending.get(event.data.id)
      if (!task) return
      pending.delete(event.data.id)
      if (event.data.result) task.resolve(event.data.result)
      else task.reject(new Error(event.data.error || 'Local history worker failed'))
    }
    worker.onerror = event => {
      worker?.terminate(); worker = null
      for (const task of pending.values()) task.reject(new Error(event.message || 'Local history worker failed'))
      pending.clear()
    }
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    // Only compressed archives cross this boundary, never full decoded documents.
    try { worker!.postMessage({ id, request }) } catch (error) { pending.delete(id); reject(error) }
  })
}
