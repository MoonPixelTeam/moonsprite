import { expect, it } from 'vitest'
import { createDocument, createLayer } from './document-model'
import { activeFreeTileCelTarget } from './free-tile-document'
import { activeTilemapCelTarget } from './tilemap-document'

it('raster UI probes leave a sparse 42-layer, 297-frame animation untouched', () => {
  const document = createDocument('raster probe', 160, 192, 'rgba')
  document.layers.push(...Array.from({ length: 41 }, () => createLayer('layer', 160, 192, 'rgba')))
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 297 }, (_, i) => ({ id: `f${i}`, duration: 100 }))
  const cels = timeline.cels
  // Any read of cel metadata means the probe entered animation normalization.
  const untouched = new Proxy(cels, { get() { throw new Error('raster probe visited animation cels') } })
  timeline.cels = untouched
  for (let i = 0; i < 100; i++) {
    expect(activeFreeTileCelTarget(document)).toBeNull()
    expect(activeTilemapCelTarget(document)).toBeNull()
  }
  expect(timeline.cels).toBe(untouched)
  timeline.cels = cels
  expect(cels).toHaveLength(1)
})

it('does not create an animation during raster target inspection', () => {
  const document = createDocument('uninitialized raster', 2, 2, 'rgba')
  delete document.animation
  expect(activeFreeTileCelTarget(document)).toBeNull()
  expect(activeTilemapCelTarget(document)).toBeNull()
  expect(document.animation).toBeUndefined()
})
