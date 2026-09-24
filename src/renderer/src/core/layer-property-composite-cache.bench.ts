import { bench, describe } from 'vitest'
import { compositeRegion, createDocument, createLayer, cacheRasterContentBounds } from './document'
import { DocumentCompositeCache } from './document-composite-cache'
import { LayerPropertyCompositeCache } from './layer-property-composite-cache'

describe('4096px document, 48 translucent layers, 384px viewport', () => {
  const document = createDocument('property benchmark', 4096, 4096, 'rgba', false)
  // A shared immutable raster keeps benchmark setup bounded; each layer is
  // still independently blended, with distinct opacity and blend settings.
  const pixels = new Uint8ClampedArray(4096 * 4096 * 4)
  new Uint32Array(pixels.buffer).fill(0xb4aa7860)
  document.layers = Array.from({ length: 48 }, (_, i) => {
    const layer = createLayer(`layer ${i}`, 1, 1, 'rgba')
    layer.width = 4096; layer.height = 4096; layer.pixels = pixels; layer.opacity = 0.6; layer.blendMode = i % 3 ? 'normal' : 'multiply'
    cacheRasterContentBounds(layer, document.palette, { x: 0, y: 0, width: 4096, height: 4096 })
    return layer
  })
  const target = document.layers[47], rect = { x: 0, y: 0, width: 384, height: 384 }
  const ordinary = new DocumentCompositeCache(), styles = new DocumentCompositeCache(), cached = new LayerPropertyCompositeCache()
  let revision = 0
  const change = () => {
    target.opacity = target.opacity === 0.6 ? 0.7 : 0.6
    return { compositeOnly: true as const, propertyOwnerIds: [target.id], fromRevision: revision, revision: ++revision }
  }
  const warm = change(); cached.render(document, rect, revision, warm, styles)
  const options = { iterations: 5, warmupIterations: 1, time: 0, warmupTime: 0 }
  bench('reblend every layer', () => { change(); compositeRegion(document, 0, 0, 384, 384, ordinary, revision) }, options)
  bench('reuse unchanged backdrop and isolated source', () => {
    const hint = change(); cached.render(document, rect, revision, hint, styles)
  }, options)
})

describe.each(['bottom-layer', 'group'] as const)('1024px grouped canvas, opacity of %s', kind => {
  const document = createDocument('group property benchmark', 1024, 1024, 'rgba', false)
  document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 0.8, blendMode: 'normal' })
  const pixels = new Uint8ClampedArray(1024 * 1024 * 4)
  new Uint32Array(pixels.buffer).fill(0xb4aa7860)
  document.layers = Array.from({ length: 8 }, (_, i) => {
    const layer = createLayer(`layer ${i}`, 1, 1, 'rgba')
    layer.width = 1024; layer.height = 1024; layer.pixels = pixels; layer.opacity = 0.6; layer.groupId = 'group'
    cacheRasterContentBounds(layer, document.palette, { x: 0, y: 0, width: 1024, height: 1024 })
    return layer
  })
  const target = kind === 'group' ? document.groups[0] : document.layers[0]
  const rect = { x: 0, y: 0, width: 1024, height: 1024 }
  const ordinary = new DocumentCompositeCache(), sources = new DocumentCompositeCache(), cached = new LayerPropertyCompositeCache()
  let revision = 0
  const change = () => {
    target.opacity = target.opacity === 0.6 ? 0.7 : 0.6
    return { compositeOnly: true as const, propertyOwnerIds: [target.id], fromRevision: revision, revision: ++revision }
  }
  const options = { iterations: 3, warmupIterations: 1, time: 0, warmupTime: 0 }
  bench('ordinary scanline composite', () => { change(); compositeRegion(document, 0, 0, 1024, 1024, ordinary, revision) }, options)
  bench('property preview composite', () => {
    const hint = change()
    cached.render(document, rect, revision, hint, sources) ?? compositeRegion(document, 0, 0, 1024, 1024, sources, revision)
  }, options)
})
