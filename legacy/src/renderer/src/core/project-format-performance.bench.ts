import { bench, describe } from 'vitest'
import { animationCelAt, connectAnimationCels, ensureAnimationDocument } from './animation'
import { createDocument, createLayer } from './document'
import { decodeProject, encodeProject } from './project-format'

const WIDTH = 4000
const HEIGHT = 2000
const LAYER_COUNT = 12
const FRAME_COUNT = 12
const document = createDocument('large project format benchmark', WIDTH, HEIGHT, 'rgba')
document.layers = Array.from({ length: LAYER_COUNT }, (_, index) => {
  const width = 1200
  const height = 800
  const layer = createLayer(`Layer ${index}`, width, height, 'rgba')
  layer.offsetX = (index * 257) % (WIDTH - width)
  layer.offsetY = (index * 149) % (HEIGHT - height)
  if (layer.format !== 'rgba') throw new Error('RGBA benchmark layer required')
  for (let y = index % 13; y < height; y += 29) for (let x = 0; x < width; x += 7) {
    const offset = (y * width + x) * 4
    layer.pixels[offset] = 32 + index * 12
    layer.pixels[offset + 1] = 220 - index * 7
    layer.pixels[offset + 2] = 96 + index * 5
    layer.pixels[offset + 3] = 255
  }
  return layer
})
document.activeLayerId = document.layers[0].id
document.animation = {
  frames: Array.from({ length: FRAME_COUNT }, (_, index) => ({ id: `frame-${index + 1}`, duration: 100 })),
  cels: [],
  groupMasks: [],
  activeFrameId: 'frame-1',
  loop: true
}
const timeline = ensureAnimationDocument(document)
for (const layer of document.layers) {
  const source = animationCelAt(timeline, layer.id, 'frame-1')!
  const linkedIds = [source.id]
  for (let frameIndex = 1; frameIndex < FRAME_COUNT; frameIndex += 1) linkedIds.push(animationCelAt(timeline, layer.id, `frame-${frameIndex + 1}`)!.id)
  connectAnimationCels(document, linkedIds)
}
document.timelapse = { enabled: false, quality: 'medium', fps: 12, speed: 8, snapshots: [] }

const encoded = encodeProject(document, { includePreview: false, compressionLevel: 1 })

describe('large project format', () => {
  bench('encode 4000x2000 with 12 layers and 12 linked frames', () => {
    encodeProject(document, { includePreview: false, compressionLevel: 1 })
  }, { iterations: 3, warmupIterations: 1 })

  bench('decode 4000x2000 with 12 layers and 12 linked frames', () => {
    decodeProject(encoded)
  }, { iterations: 3, warmupIterations: 1 })
})
