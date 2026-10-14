import { packLocalHistory, type LocalHistoryPackRequest } from '@/core/local-history-archive'

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<{ id: number; request: LocalHistoryPackRequest }>) => void) | null; postMessage: (message: unknown, transfer: Transferable[]) => void }
scope.onmessage = event => {
  const { id, request } = event.data
  try {
    const result = packLocalHistory(request)
    const buffers = new Set<ArrayBuffer>([result.archive.buffer as ArrayBuffer])
    for (const delta of result.deltas) if (delta) buffers.add(delta.buffer as ArrayBuffer)
    scope.postMessage({ id, result }, [...buffers])
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }, [])
  }
}
