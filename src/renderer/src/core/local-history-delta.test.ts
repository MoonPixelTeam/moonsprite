import { expect, it } from 'vitest'
import { createDocument, createLayer, getLayerStorageOrigin, setLayerStorageOrigin } from './document'
import { cloneHistoryDocument, createLocalHistoryDelta, historyDocumentBytes, historyDocumentTransferView, hydrateLocalHistoryDelta } from './local-history-delta'
import { assignRasterStorage, installRuntimeRaster, rasterStorageIdentity, readSurfacePackedLocal, rehydrateRuntimeRasterDocument, surfacePixelsMaterialized } from './runtime-raster'
import { HistoryStack } from './history'

it.each(['rgba', 'indexed'] as const)('restores %s pixels in place without replacing other layers or shared cel storage', mode => {
  const before = createDocument('delta', 2000, 2000, mode)
  before.layers.push(createLayer('untouched', 2, 2, mode))
  const after = cloneHistoryDocument(before)
  after.layers[0].pixels[4001] = 123
  const target = cloneHistoryDocument(after)
  const layer = target.layers[0], pixels = layer.pixels, untouched = target.layers[1]
  const entry = createLocalHistoryDelta(target, before, after, 'paint')!
  expect(entry).not.toBeNull()
  expect(entry.bytes).toBeLessThan(4096)
  expect(entry.invalidation?.kind).toBe('region')
  for (let index = 0; index < 20; index++) {
    entry.undo(); expect(pixels[4001]).toBe(0)
    entry.redo(); expect(pixels[4001]).toBe(123)
  }
  expect(target.layers[0]).toBe(layer)
  expect(target.layers[0].pixels).toBe(pixels)
  expect(target.layers[1]).toBe(untouched)
  expect(target.animation!.cels[0].surface!.pixels).toBe(pixels)
  expect(before.layers[0].pixels[4001]).toBe(0)
  expect(after.layers[0].pixels[4001]).toBe(123)
})

it('does not apply local-history patches through prototype keys', () => {
  const target = createDocument('safe-path', 2, 2, 'rgba')
  const entry = hydrateLocalHistoryDelta(target, {
    patches: [{ path: ['__proto__', 'polluted'], before: false, after: true }],
    origins: { before: [{ x: 0, y: 0 }], after: [{ x: 0, y: 0 }] }, label: 'unsafe', bytes: 0,
    invalidation: { kind: 'full' }, affectedLayerIds: [], requiresAnimationSelectionNormalization: false
  })
  entry.redo()
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})

it('keeps storage origins and computes canvas invalidation without counting the origin twice', () => {
  const before = createDocument('offset', 8, 8, 'rgba')
  before.layers[0].offsetX = 12; before.layers[0].offsetY = -3
  setLayerStorageOrigin(before.layers[0], { x: 12, y: -3 })
  const after = cloneHistoryDocument(before)
  after.layers[0].pixels[4] = 99
  const target = cloneHistoryDocument(after)
  expect(getLayerStorageOrigin(target.layers[0])).toEqual({ x: 12, y: -3 })
  expect(createLocalHistoryDelta(target, before, after, 'paint')?.invalidation).toMatchObject({ kind: 'region', rect: { x: 13, y: -3, width: 1, height: 1 } })
})

it('retains the safe fallback for resized layers and changes to linked storage topology', () => {
  const before = createDocument('structure', 4, 4, 'rgba')
  const after = cloneHistoryDocument(before)
  after.layers.push(createLayer('new', 4, 4, 'rgba'))
  expect(createLocalHistoryDelta(cloneHistoryDocument(after), before, after, 'layer')).toBeNull()
  const unlinked = cloneHistoryDocument(before)
  unlinked.animation!.cels[0].surface!.pixels = unlinked.layers[0].pixels.slice()
  expect(createLocalHistoryDelta(cloneHistoryDocument(unlinked), before, unlinked, 'unlink')).toBeNull()
})

it('hydrates undo and redo positions without replay and accounts for shared snapshot buffers', () => {
  const history = new HistoryStack()
  let applies = 0
  const entries = [1, 2, 3].map(value => ({ label: String(value), bytes: value * 10, undo: () => { applies-- }, redo: () => { applies++ } }))
  history.restoreTimeline(entries, 1)
  expect(applies).toBe(0)
  expect(history.position).toBe(1)
  expect(history.memoryBytes).toBe(10)
  history.redo(); expect(applies).toBe(1)
  expect(history.latestUndoEntry?.label).toBe('2')
  const document = createDocument('memory', 100, 100, 'rgba')
  expect(historyDocumentBytes(document)).toBeGreaterThanOrEqual(40000)
  expect(historyDocumentBytes(document)).toBeLessThan(80000)
})

it('restores expanded pixel storage while retaining shared cel aliases and unaffected layer objects', () => {
  const before = createDocument('expand', 4, 4, 'rgba')
  const after = cloneHistoryDocument(before)
  const expanded = new Uint8ClampedArray(8 * 4 * 4)
  expanded[99] = 200
  after.layers[0].width = 8; after.layers[0].pixels = expanded
  after.animation!.cels[0].surface!.width = 8; after.animation!.cels[0].surface!.pixels = expanded
  const target = cloneHistoryDocument(after), originalLayer = target.layers[0]
  const entry = createLocalHistoryDelta(target, before, after, 'expand')!
  expect(entry).not.toBeNull()
  entry.undo(); expect(target.layers[0].width).toBe(4)
  entry.redo(); expect(target.layers[0].width).toBe(8)
  expect(target.layers[0]).toBe(originalLayer)
  expect(target.layers[0].pixels[99]).toBe(200)
  expect(target.animation!.cels[0].surface!.pixels).toBe(target.layers[0].pixels)
  target.layers[0].pixels[99] = 201
  expect(after.layers[0].pixels[99]).toBe(200)
})

it('measures navigation separately from the one-time delta compilation on a 4000px canvas', () => {
  const before = createDocument('4k audit', 4000, 4000, 'rgba'), after = cloneHistoryDocument(before)
  after.layers[0].pixels[16004003] = 255
  const target = cloneHistoryDocument(after)
  const compileStart = performance.now()
  const entry = createLocalHistoryDelta(target, before, after, 'paint')!
  const compileMs = performance.now() - compileStart
  expect(entry).not.toBeNull()
  let deltaMs = 0, cloneMs = 0
  for (let index = 0; index < 5; index++) {
    let start = performance.now(); entry.undo(); entry.redo(); deltaMs += performance.now() - start
    start = performance.now(); cloneHistoryDocument(before); cloneHistoryDocument(after); cloneMs += performance.now() - start
  }
  console.info(JSON.stringify({ scenario: '4k-local-history-navigation', compileMs, deltaUndoRedoMeanMs: deltaMs / 5, fullCloneUndoRedoMeanMs: cloneMs / 5, deltaBytes: entry.bytes }))
  expect(target.layers[0].pixels[16004003]).toBe(255)
})

const sparseHistoryDocument = () => {
  const document = createDocument('sparse baseline', 1, 1, 'rgba')
  document.width = document.height = 4000
  const layer = document.layers[0]
  layer.width = layer.height = 4000
  const offsets = new Int32Array(63 * 63); offsets[0] = 1
  const data = new Uint8Array(64 * 64 * 4); data.set([1, 2, 3, 255])
  installRuntimeRaster(layer, { kind: 'sparse-tiles-v1', format: 'rgba', width: 4000, height: 4000, tileSize: 64, tileOffsets: offsets, data })
  const surface = document.animation!.cels[0].surface!
  surface.width = surface.height = 4000
  assignRasterStorage(surface, layer)
  return document
}

it('captures a 4k sparse baseline without materializing either live pixels or snapshot pixels', () => {
  const document = sparseHistoryDocument()
  const getter = Object.getOwnPropertyDescriptor(document.layers[0], 'pixels')!.get
  expect(historyDocumentBytes(document)).toBeLessThan(100_000)
  expect(surfacePixelsMaterialized(document.layers[0])).toBe(false)
  const copy = cloneHistoryDocument(document)
  expect(Object.getOwnPropertyDescriptor(document.layers[0], 'pixels')!.get).toBe(getter)
  expect(surfacePixelsMaterialized(document.layers[0])).toBe(false)
  expect(surfacePixelsMaterialized(copy.layers[0])).toBe(false)
  expect(rasterStorageIdentity(copy.layers[0])).toBe(rasterStorageIdentity(copy.animation!.cels[0].surface!))
  expect(rasterStorageIdentity(copy.layers[0])).not.toBe(rasterStorageIdentity(document.layers[0]))
  expect(readSurfacePackedLocal(copy.layers[0], 0, 0)).toBe(0xff030201)
  copy.layers[0].pixels[0] = 99
  expect(readSurfacePackedLocal(document.layers[0], 0, 0)).toBe(0xff030201)
  expect(surfacePixelsMaterialized(document.layers[0])).toBe(false)
})

it('transfers compact history tiles without invoking getters and does not reinstall stale tiles after edits', () => {
  const document = sparseHistoryDocument()
  const transferred = structuredClone(historyDocumentTransferView(document))
  expect(transferred.layers[0].pixels.byteLength).toBe(4)
  expect(surfacePixelsMaterialized(document.layers[0])).toBe(false)
  rehydrateRuntimeRasterDocument(transferred)
  expect(readSurfacePackedLocal(transferred.layers[0], 0, 0)).toBe(0xff030201)
  document.layers[0].pixels[0] = 77
  const copy = cloneHistoryDocument(document)
  expect(copy.layers[0].runtimeRaster).toBeUndefined()
  expect(copy.layers[0].pixels[0]).toBe(77)
  expect(copy.animation!.cels[0].surface!.pixels).toBe(copy.layers[0].pixels)
})
