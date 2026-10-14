import { bench, describe } from 'vitest'
import { LayerStyleTileCache } from './layer-style-tile-cache'
import { createDefaultLayerStyles } from './layer-styles'
import { createDocument, compositeRegion, DocumentCompositeCache } from './document'
import { beginPixelEdit } from './history'
import { paintLine, brushStrokeInvalidationRects } from './tools-brush'

describe('1280px real translucent brush with stroke and shadow, 12 live updates', () => {
  for (const reference of [true, false]) {
    bench(reference ? 'per-pixel brush + styled composite' : 'span brush + styled composite', () => {
      const document = createDocument('styled paint', 1280, 1280, 'rgba')
      const layer = document.layers[0]
      layer.layerStyles = createDefaultLayerStyles()
      layer.layerStyles.stroke.enabled = true
      layer.layerStyles.shadow.enabled = true
      const cache = new DocumentCompositeCache(), edit = beginPixelEdit(layer.id)
      const selection = reference ? { x: 0, y: 0, width: 1280, height: 1280 } : null
      for (let i = 0; i < 12; i++) {
        const from = { x: 300 + i * 4, y: 300 }, to = { x: from.x + 4, y: 300 }
        paintLine(document, layer, edit, from.x, from.y, to.x, to.y, 45, { r: 200, g: 40, b: 80, a: 128 }, selection, 'round')
        cache.invalidateLiveSourceCaches()
        for (const rect of brushStrokeInvalidationRects(from, to, 45, null, 1280, 1280)) {
          cache.invalidateStyleSources(document, rect, [layer.id])
          compositeRegion(document, rect.x - 2, rect.y - 2, rect.width + 4, rect.height + 4, cache, 0)
        }
      }
    }, { iterations: 10, warmupIterations: 3, time: 0, warmupTime: 0 })
  }
})

describe('4096px translucent styled source, 64 small live paint updates', () => {
  const geometry = { x: 0, y: 0, width: 4096, height: 4096 }
  const styles = createDefaultLayerStyles()
  styles.stroke.enabled = true
  styles.stroke.size = 3
  styles.shadow.enabled = true
  styles.shadow.blur = 2
  const resolve = (color: { r: number; g: number; b: number; a: number }) => color
  for (const partial of [false, true]) {
    const cache = new LayerStyleTileCache(), owner = {}
    let revision = 0
    const read = (x: number, y: number) => ({
      r: x >= 28 && x < 33 && y >= 28 && y < 33 ? revision % 256 : 40,
      g: 80, b: 120, a: (x + y) % 3 ? 96 : 0
    })
    cache.prepare(owner, 'paint', revision, undefined, geometry, styles, read, resolve)(30, 30)
    bench(partial ? 'refresh affected pixels' : 'rebuild touched tile', () => {
      for (let i = 0; i < 64; i++) {
        const sample = cache.prepare(owner, 'paint', ++revision,
          partial ? [{ x: 28, y: 28, width: 5, height: 5 }] : undefined,
          geometry, styles, read, resolve)
        sample(30, 30)
      }
    }, { iterations: 5, warmupIterations: 1, time: 0, warmupTime: 0 })
  }
})
