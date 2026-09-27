import { bench, describe } from 'vitest'
import { createDocument, createLayer, cacheRasterContentBounds } from './document'
import { DocumentCompositeCache } from './document-composite-cache'
import { LayerPropertyCompositeCache } from './layer-property-composite-cache'
import { LayerPropertyProjectedPreview } from './layer-property-projected-preview'

describe('4096x4096, 100 full-size translucent layers, top opacity, 25% display at DPR 1', () => {
  const document = createDocument('projected property benchmark', 4096, 4096, 'rgba', false)
  // Sharing immutable source storage avoids a 6.4 GiB fixture. Every layer
  // still covers the full canvas and participates in background composition.
  const pixels = new Uint8ClampedArray(4096 * 4096 * 4)
  new Uint32Array(pixels.buffer).fill(0xb4aa7860)
  const rect = { x: 0, y: 0, width: 4096, height: 4096 }
  document.layers = Array.from({ length: 100 }, (_, i) => {
    const layer = createLayer(`layer ${i}`, 1, 1, 'rgba')
    layer.width = 4096; layer.height = 4096; layer.pixels = pixels; layer.opacity = 0.6
    cacheRasterContentBounds(layer, document.palette, rect)
    return layer
  })
  const target = document.layers[99], full = new LayerPropertyCompositeCache(), sources = new DocumentCompositeCache()
  const projected = new LayerPropertyProjectedPreview()
  let revision = 0
  const change = () => {
    target.opacity = target.opacity === 0.6 ? 0.7 : 0.6
    return { compositeOnly: true as const, propertyOwnerIds: [target.id], fromRevision: 0, revision: ++revision }
  }
  const fullStart = performance.now(), fullHint = change()
  full.render(document, rect, revision, fullHint, sources)
  console.info(`Full-resolution first backdrop: ${(performance.now() - fullStart).toFixed(1)} ms`)
  const projectedStart = performance.now(), projectedHint = change()
  projected.render(document, rect, 1024, 1024, revision, projectedHint)
  console.info(`Display-resolution first backdrop: ${(performance.now() - projectedStart).toFixed(1)} ms`)
  const options = { iterations: 5, warmupIterations: 1, time: 0, warmupTime: 0 }
  bench('previous full-resolution warm update', () => { const hint = change(); full.render(document, rect, revision, hint, sources) }, options)
  bench('display-resolution warm update', () => { const hint = change(); projected.render(document, rect, 1024, 1024, revision, hint) }, options)
})
