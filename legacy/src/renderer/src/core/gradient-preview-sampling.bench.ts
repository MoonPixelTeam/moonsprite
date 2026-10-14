import { bench, describe } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from './document'
import { compileCompositePointSampler } from './document-composite-sampling'
import { createGradientReplacementSampler } from './gradient-preview-sampling'
import { createDefaultLayerStyles } from './layer-styles'

describe('256px styled gradient drag', () => {
  const document = createDocument('eight styled layers', 256, 256, 'rgba')
  document.layers.push(...Array.from({ length: 7 }, (_, i) => createLayer(`layer ${i}`, 256, 256, 'rgba')))
  document.groups.push(...['a', 'b'].map(id => ({ id, name: id, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const })))
  document.layers.forEach((layer, i) => {
    if (i < 4) layer.groupId = i < 2 ? 'a' : 'b'
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    layer.layerStyles.stroke.size = 3
    for (let y = 4 + i; y < 252; y += 3) for (let x = 4; x < 252; x += 3) {
      writeLayerColor(document, layer, y * 256 + x, { r: i * 30, g: 90, b: 140, a: 128 })
    }
  })
  const activeId = document.layers[5].id
  const reference = compileCompositePointSampler(document, activeId)
  const cached = createGradientReplacementSampler(document, activeId, { x: 0, y: 0, width: 256, height: 256 })
  const draw = (sample: typeof reference) => {
    for (let y = 0; y < 256; y += 1) for (let x = 0; x < 256; x += 1) sample(x, y, { r: x, g: y, b: 150, a: 255 })
  }
  const options = { iterations: 5, warmupIterations: 2, time: 0, warmupTime: 0 }
  bench('uncached layer/style sampling', () => draw(reference), options)
  bench('reuse static preview sources', () => draw(cached), options)
})
