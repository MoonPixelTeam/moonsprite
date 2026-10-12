import { packLocalHistory, type LocalHistoryPackRequest, type LocalHistoryPackResult } from './local-history-archive'

let worker: Worker | null = null
let sequence = 0
const pending = new Map<number, { resolve: (result: LocalHistoryPackResult) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>()
const resetWorker = (error: Error): void => {
  worker?.terminate(); worker = null
  for (const task of pending.values()) { clearTimeout(task.timeout); task.reject(error) }
  pending.clear()
}

export function packLocalHistoryAsync(request: LocalHistoryPackRequest): Promise<LocalHistoryPackResult> {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => packLocalHistory(request))
  if (!worker) {
    worker = new Worker(new URL('../workers/local-history.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ id: number; result?: LocalHistoryPackResult; error?: string }>) => {
      if (!event.data) { resetWorker(new Error('Local history worker message could not be decoded')); return }
      const task = pending.get(event.data.id)
      if (!task) return
      pending.delete(event.data.id)
      clearTimeout(task.timeout)
      if (event.data.result) task.resolve(event.data.result)
      else task.reject(new Error(event.data.error || 'Local history worker failed'))
    }
    worker.onerror = event => {
      resetWorker(new Error(event.message || 'Local history worker failed'))
    }
    worker.onmessageerror = () => resetWorker(new Error('Local history worker message could not be decoded'))
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence
    const timeout = setTimeout(() => resetWorker(new Error('Local history worker timed out')), 300_000)
    pending.set(id, { resolve, reject, timeout })
    // Only compressed archives cross this boundary, never full decoded documents.
    try { worker!.postMessage({ id, request }) } catch (error) { pending.delete(id); clearTimeout(timeout); reject(error) }
  })
}
