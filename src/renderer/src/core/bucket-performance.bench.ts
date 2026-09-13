import { bench, describe } from 'vitest'
import { compositeRegion, createDocument, createLayer, DocumentCompositeCache, markLayerContentChanged } from './document'
import { floodFillSymmetric } from './tools'
import { commitPixelEdit } from './history'

// Representative CPU phases, intentionally excluding browser paint/GPU and IO.
// Keep this opt-in: pnpm exec vitest bench .../bucket-performance.bench.ts --run
describe('4K layered bucket CPU phases', () => {
  const document = createDocument('4K bucket profile', 4000, 4000, 'rgba')
  const layer = document.layers[0]
  const words = new Uint32Array(layer.pixels.buffer, layer.pixels.byteOffset, layer.pixels.byteLength / 4)
  for (let y = 1000; y < 1200; y++) words.fill(0xffcc5533, y * 4000 + 1000, y * 4000 + 1200)
  markLayerContentChanged(layer)
  for (let i = 0; i < 7; i++) {
    const overlay = createLayer(`overlay-${i}`, 256, 256, 'rgba')
    new Uint32Array(overlay.pixels.buffer).fill(0x806633cc)
    overlay.offsetX = 128 + i * 384
    overlay.offsetY = 128 + i * 384
    document.layers.push(overlay)
  }
  const cache = new DocumentCompositeCache()
  let revision = 1
  compositeRegion(document, 0, 0, 4000, 4000, cache, revision)

  bench('fill, history and full visible redraw', () => {
    const phases: Record<string, number> = {}
    const measure = <T,>(name: string, task: () => T): T => {
      const start = performance.now()
      const result = task()
      phases[name] = Math.round((performance.now() - start) * 100) / 100
      return result
    }
    const edit = measure('fillMs', () => floodFillSymmetric(document, layer, 0, 0,
      { r: 41, g: 121, b: 255, a: 255 }, null, true, null, 1, undefined, 'solid', 1, 0, 'paint'))!
    const history = measure('historyMs', () => commitPixelEdit(document, edit, 'bucket'))!
    measure('fillCompositeMs', () => compositeRegion(document, 0, 0, 4000, 4000, cache, ++revision, edit.dirtyRect))
    measure('undoMs', () => history.undo())
    measure('undoCompositeMs', () => compositeRegion(document, 0, 0, 4000, 4000, cache, ++revision, edit.dirtyRect))
    if (words[0] !== 0 || words[1000 * 4000 + 1000] !== 0xffcc5533) throw new Error('Fill undo corrupted the source')
    console.info('bucket-phases', JSON.stringify(phases))
  }, { iterations: 3, warmupIterations: 1, time: 0, warmupTime: 0 })
})
