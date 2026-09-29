import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, DocumentCompositeCache, writeLayerColor } from '@/core/document'
import { captureSelectionTransform } from '@/core/tools-selection-transform'
import { flipSelection } from '@/core/tools'
import { preparedSelectionBackdrop, scheduleSelectionBackdrop } from './canvas-selection-prewarm'

afterEach(() => vi.unstubAllGlobals())
function idleQueue() {
  const jobs = new Map<number, () => void>()
  let id = 0
  vi.stubGlobal('requestIdleCallback', (job: () => void) => { jobs.set(++id, job); return id })
  vi.stubGlobal('cancelIdleCallback', (key: number) => jobs.delete(key))
  return { jobs, flush() { while (jobs.size) { const [key, job] = jobs.entries().next().value!; jobs.delete(key); job() } } }
}

it('prepares only during idle time and reuses lower pixels with a newly captured selection', () => {
  const idle = idleQueue(), document = createDocument('warm selection', 512, 512, 'rgba')
  const lower = document.layers[0], active = createLayer('active', 512, 512, 'rgba')
  document.layers.push(active)
  new Uint32Array(lower.pixels.buffer).fill(0xff503020)
  const composite = new DocumentCompositeCache(), read = vi.spyOn(composite, 'normalLayerRegion')
  const rect = { x: 100, y: 100, width: 200, height: 200 }
  const stop = scheduleSelectionBackdrop(composite, document, active.id, 1, rect, () => true)
  expect(read).not.toHaveBeenCalled()
  idle.flush()
  const cache = preparedSelectionBackdrop(document, active.id, 1)!
  expect(cache).toBeDefined()
  read.mockClear()
  const source = captureSelectionTransform(document, rect, active)!
  const pixels = cache.read(document, active, [lower], source, true, { ...rect, x: 101 }, 1)
  expect(read).not.toHaveBeenCalled()
  expect(new Uint32Array(pixels.buffer).every(value => value === 0xff503020)).toBe(true)
  expect(preparedSelectionBackdrop(document, active.id, 2)).toBe(cache)
  writeLayerColor(document, lower, 0, { r: 255, g: 0, b: 0, a: 255 })
  expect(preparedSelectionBackdrop(document, active.id, 1)).toBeUndefined()
  stop()
})

it.each(['pointerdown', 'keydown', 'cleanup', 'obsolete'])('cancels prewarm before work when %s occurs', reason => {
  const idle = idleQueue(), document = createDocument('cancel preparation', 512, 512, 'rgba')
  const composite = new DocumentCompositeCache(), read = vi.spyOn(composite, 'normalLayerRegion')
  const stop = scheduleSelectionBackdrop(composite, document, document.activeLayerId, 1, { x: 20, y: 20, width: 200, height: 200 }, () => reason !== 'obsolete')
  if (reason === 'cleanup') stop()
  else if (reason !== 'obsolete') window.dispatchEvent(new Event(reason))
  idle.flush()
  expect(read).not.toHaveBeenCalled()
  expect(preparedSelectionBackdrop(document, document.activeLayerId, 1)).toBeUndefined()
  stop()
})

 it('keeps the warm lower stack after an actual selection flip and invalidates changed dependencies', () => {
  const idle = idleQueue(), document = createDocument('flip then move', 512, 512, 'rgba')
  const lower = document.layers[0], active = createLayer('active', 512, 512, 'rgba')
  document.layers.push(active)
  new Uint32Array(lower.pixels.buffer).fill(0xff503020)
  writeLayerColor(document, active, 100 * 512 + 100, { r: 255, g: 0, b: 0, a: 255 })
  const composite = new DocumentCompositeCache(), read = vi.spyOn(composite, 'normalLayerRegion')
  const rect = { x: 100, y: 100, width: 200, height: 200 }
  scheduleSelectionBackdrop(composite, document, active.id, 1, rect, () => true)
  idle.flush()
  const cache = preparedSelectionBackdrop(document, active.id, 1)!
  flipSelection(document, rect, 'horizontal', active)
  expect(preparedSelectionBackdrop(document, active.id, 2)).toBe(cache)
  read.mockClear()
  const source = captureSelectionTransform(document, rect, active, { cacheOpaqueOffsets: false })!
  expect(source.values[199]).toBe(0xff0000ff)
  const actual = cache.read(document, active, [lower], source, false, { ...rect, x: 101 }, 2)
  expect(read).not.toHaveBeenCalled()
  expect(new Uint32Array(actual.buffer).every(value => value === 0xff503020)).toBe(true)
  lower.opacity = 0.5
  expect(preparedSelectionBackdrop(document, active.id, 2)).toBeUndefined()
  cache.read(document, active, [lower], source, false, rect, 2)
  expect(read).toHaveBeenCalled()
  lower.opacity = 1
  // Replacing storage with the same dimensions/revision must not reuse old pixels.
  lower.pixels = new Uint8ClampedArray(lower.pixels.length)
  expect(preparedSelectionBackdrop(document, active.id, 2)).toBeUndefined()
})
