import { processAdjustmentPreview } from '@/core/adjustment-preview-processing'
import type { AdjustmentPreviewBaseline, AdjustmentPreviewResult, AdjustmentPreviewWorkerRequest, AdjustmentPreviewWorkerResponse } from '@/core/adjustment-preview-protocol'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<AdjustmentPreviewWorkerRequest>) => void) | null
  postMessage: (message: AdjustmentPreviewWorkerResponse, transfer: Transferable[]) => void
}

let baseline: AdjustmentPreviewBaseline | null = null
let queued: Extract<AdjustmentPreviewWorkerRequest, { type: 'adjust' }> | null = null
let generation = 0
let processing = false

const resultTransferables = (result: AdjustmentPreviewResult): Transferable[] => result.layers.flatMap((layer) => layer.pixels.buffer instanceof ArrayBuffer ? [layer.pixels.buffer] : [])

const runQueued = (): void => {
  if (processing || !baseline || !queued) return
  const request = queued
  const source = baseline
  const token = generation
  queued = null
  processing = true
  void processAdjustmentPreview(
    source,
    request.id,
    request.adjustment,
    request.region,
    () => token === generation,
    () => new Promise((resolve) => globalThis.setTimeout(resolve, 0))
  ).then((result) => {
    if (result && token === generation) scope.postMessage(result, resultTransferables(result))
  }).catch((error) => {
    if (token === generation) scope.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) }, [])
  }).finally(() => {
    processing = false
    runQueued()
  })
}

scope.onmessage = (event): void => {
  const request = event.data
  generation += 1
  if (request.type === 'initialize') {
    baseline = request.baseline
    queued = null
    return
  }
  if (request.type === 'cancel') {
    queued = null
    return
  }
  queued = request
  runQueued()
}
