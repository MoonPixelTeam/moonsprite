import { encodePng } from '@/core/png-encode'
import { materializeTimelapsePixels, type TimelapsePixels } from '@/core/timelapse-pixels'

interface TimelapseEncodeWorkerRequest {
  id: number
  pixels?: Uint8ClampedArray
  tiledPixels?: TimelapsePixels
  width: number
  height: number
}

interface TimelapseEncodeWorkerResponse {
  id: number
  data?: Uint8Array
  error?: string
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<TimelapseEncodeWorkerRequest>) => void) | null
  postMessage: (message: TimelapseEncodeWorkerResponse, transfer: Transferable[]) => void
}

scope.onmessage = (event): void => {
  const { id, width, height } = event.data
  try {
    const pixels = event.data.tiledPixels ? materializeTimelapsePixels(event.data.tiledPixels) : event.data.pixels
    if (!pixels) throw new Error('Missing timelapse pixels')
    const data = encodePng(pixels, width, height, true).bytes
    scope.postMessage({ id, data }, data.buffer instanceof ArrayBuffer ? [data.buffer] : [])
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }, [])
  }
}
