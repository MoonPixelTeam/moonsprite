import { afterAll, bench, describe, vi } from 'vitest'
import { createDocument, writeLayerColor } from '@/core/document'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { CanvasCompositeCache } from './canvas-composite-cache'

// Native CPU composition is measured; canvas uploads/presentation are excluded.
class CpuCanvas {
  constructor(public width: number, public height: number) {}
  getContext() { return { putImageData() {}, drawImage() {}, clearRect() {} } }
}
vi.stubGlobal('OffscreenCanvas', CpuCanvas)
vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
afterAll(() => vi.unstubAllGlobals())

const fixture = () => {
  const document = createDocument('styled move benchmark', 256, 192, 'rgba')
  const layer = document.layers[0]
  layer.layerStyles = createDefaultLayerStyles()
  layer.layerStyles.stroke = { ...layer.layerStyles.stroke, enabled: true, size: 3 }
  layer.layerStyles.shadow = { ...layer.layerStyles.shadow, enabled: true, blur: 3, offsetX: 3, offsetY: 3 }
  for (let y = 16; y < 80; y += 1) for (let x = 16; x < 96; x += 1) writeLayerColor(document, layer, y * layer.width + x, { r: 50, g: 130, b: 220, a: 200 })
  const cache = new CanvasCompositeCache()
  const options = { document, context: { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, drawImage() {} } as never,
    view: { zoom: 1, panX: 0, panY: 0, rotation: 0, mirrored: false, mirroredVertical: false, showGrid: false, relativeLuminance: false },
    originX: 0, originY: 0, canvasWidth: 256, canvasHeight: 192, fromX: 0, fromY: 0, toX: 256, toY: 192, revision: 1, contentRevision: 1 }
  cache.draw(options)
  let step = 0
  return (placement: boolean) => {
    layer.offsetX = (++step % 4) * 2
    const rect = { x: 0, y: 0, width: 120, height: 104 }
    if (placement) cache.invalidateDocumentPlacementRect(rect, document, document.animation!.activeFrameId, [layer.id])
    else { cache.invalidateLayerPlacementCaches(); cache.invalidateDocumentRect(rect, document, document.animation!.activeFrameId, [layer.id]) }
    cache.draw({ ...options, movingLayerIds: [layer.id] })
    cache.consumePreviewInvalidation(document.animation!.activeFrameId)
  }
}
const previous = fixture(), optimized = fixture()
describe('drag with stroke and shadow enabled', () => {
  bench('pixel-change invalidation per move', () => { previous(false) }, { iterations: 3, warmupIterations: 1, time: 200, warmupTime: 50 })
  bench('reuse styles during placement', () => { optimized(true) }, { iterations: 3, warmupIterations: 1, time: 200, warmupTime: 50 })
})
