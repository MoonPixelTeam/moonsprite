import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer } from './document-model'
import { commitPixelEdit } from './history'
import { captureSelectionTransform } from './tools-selection-transform-source'
import { selectionTransformPreviewRasterPacked } from './tools-selection-transform-raster'
import { applySelectionTransform } from './tools-selection-transform-apply'
import * as commit from './tools-selection-transform-commit'
import { applyPackedSelectionTransform as precedingCommit } from './__fixtures__/selection-transform-commit-reference'

afterEach(() => vi.restoreAllMocks())

it('preserves pixels, exact dirty bounds and dense history for overlap, copies, masks and clipping', () => {
  const document = createDocument('row kernel cases', 80, 64, 'rgba', false)
  const layer = document.layers[0]
  if (layer.format !== 'rgba') throw new Error('RGBA fixture required')
  const pixels = new Uint32Array(layer.pixels.buffer)
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = index % 11 === 0 ? 0
    : ((index % 5 === 0 ? 0x80000000 : 0xff000000) | ((index * 123457) & 0xffffff)) >>> 0
  const original = layer.pixels.slice()
  for (const masked of [false, true]) for (const copy of [false, true]) {
    const selection = { x: 16, y: 14, width: 24, height: 20,
      mask: masked ? Uint8Array.from({ length: 480 }, (_, index) => Number(index % 3 !== 0)) : undefined }
    layer.pixels.set(original)
    const source = captureSelectionTransform(document, selection, layer)!
    for (const angle of [0, 23, -37, 48, 90, 180]) for (const target of [
      { x: 19, y: 17, width: 24, height: 20 }, { x: -4, y: 2, width: 24, height: 20 },
      { x: 20.3, y: 18.7, width: 40.4, height: 30.8 }, { x: 90, y: 80, width: 24, height: 20 }
    ]) {
      layer.pixels.set(original)
      const expected = precedingCommit(document, layer, source, target, angle, copy)
      const expectedPixels = layer.pixels.slice()
      layer.pixels.set(original)
      const actual = commit.applyPackedSelectionTransform(document, layer, source, target, angle, copy)
      expect(actual?.dirtyRect).toEqual(expected?.dirtyRect)
      expect(actual?.denseRegion).toEqual(expected?.denseRegion)
      expect(Buffer.from(layer.pixels).equals(Buffer.from(expectedPixels))).toBe(true)
      expect(actual === null).toBe(expected === null)
      expect(actual === undefined).toBe(expected === undefined)
    }
  }
})

it('reduces exact 1024-square row commit/history on 4K / 100 layers / 8 frames', () => {
  const document = createDocument('rotation chain', 4096, 4096, 'rgba', false)
  const layer = document.layers[0]
  if (layer.format !== 'rgba') throw new Error('RGBA fixture required')
  const pixels = new Uint32Array(layer.pixels.buffer)
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = index % 11 === 0 ? 0
    : ((index % 5 === 0 ? 0x80000000 : 0xff000000) | ((index * 123457) & 0xffffff)) >>> 0
  for (let index = 1; index < 100; index += 1) {
    const other = createLayer(`Other ${index}`, 32, 32, 'rgba')
    new Uint32Array(other.pixels.buffer).fill((0xff000000 | index * 31247) >>> 0)
    document.layers.push(other)
  }
  const timeline = document.animation!
  timeline.frames = Array.from({ length: 8 }, (_, index) => ({ id: `rotation-frame-${index}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = document.layers.flatMap((owner, index) => timeline.frames.map((frame, frameIndex) => ({
    id: `${owner.id}:${frame.id}`, layerId: owner.id, frameId: frame.id,
    surface: owner === layer && frameIndex === 0 ? { format: 'rgba' as const, width: 4096, height: 4096, offsetX: 0, offsetY: 0, pixels: layer.pixels }
      : { format: 'rgba' as const, width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray([index, frameIndex, 200, 255]) }
  })))
  const inactive = timeline.cels.filter(cel => cel.layerId !== layer.id || cel.frameId !== timeline.activeFrameId)
    .map(cel => ({ cel, original: cel.surface!.pixels.slice() }))
  const originalPixels = layer.pixels.slice()
  const selection = { x: 1536, y: 1536, width: 1024, height: 1024,
    mask: Uint8Array.from({ length: 1024 * 1024 }, (_, index) => Number(index % 13 !== 0 && Math.floor(index / 1024) % 17 !== 0)) }
  const capture = captureSelectionTransform(document, selection, layer, { cacheOpaqueOffsets: false })!
  const compiled = commit.applyPackedSelectionTransform, dispatch = vi.spyOn(commit, 'applyPackedSelectionTransform')
  const target = { x: 1539, y: 1538, width: 1024, height: 1024 }
  const checksum = (values: Uint32Array) => {
    let hash = 2166136261
    for (const value of values) hash = Math.imul(hash ^ value, 16777619)
    return hash >>> 0
  }
  const run = (optimized: boolean, exact = false) => {
    dispatch.mockImplementation(optimized ? compiled : precedingCommit)
    const stages = { previewMs: 0, commitHistoryMs: 0, undoRedoMs: 0 }, hashes: number[] = []
    let exactRaster: Uint32Array | undefined, exactPixels: Uint8ClampedArray | undefined
    for (const angle of [17, 23, 31]) {
      layer.pixels.set(originalPixels)
      // Fresh capture identity prevents a previous sample's cached raster hit.
      const source = { ...capture }
      let started = performance.now()
      const raster = selectionTransformPreviewRasterPacked(document, source, target, angle, undefined, layer)
      stages.previewMs += performance.now() - started
      started = performance.now()
      const edit = applySelectionTransform(document, source, target, angle, false, undefined, undefined, undefined, layer)
      const entry = edit && commitPixelEdit(document, edit, 'Rotate')
      if (!entry) throw new Error('Missing rotation history')
      stages.commitHistoryMs += performance.now() - started
      started = performance.now(); entry.undo()
      stages.undoRedoMs += performance.now() - started
      expect(Buffer.from(layer.pixels).equals(Buffer.from(originalPixels))).toBe(true)
      started = performance.now(); entry.redo()
      stages.undoRedoMs += performance.now() - started
      hashes.push(checksum(raster.pixels), checksum(new Uint32Array(layer.pixels.buffer)))
      if (exact && angle === 31) { exactRaster = raster.pixels; exactPixels = layer.pixels.slice() }
    }
    return { ...stages, totalMs: stages.previewMs + stages.commitHistoryMs + stages.undoRedoMs, hashes, exactRaster, exactPixels }
  }
  const expected = run(false, true), actual = run(true, true)
  expect(Buffer.from(actual.exactRaster!.buffer).equals(Buffer.from(expected.exactRaster!.buffer))).toBe(true)
  expect(Buffer.from(actual.exactPixels!).equals(Buffer.from(expected.exactPixels!))).toBe(true)
  expect(actual.hashes).toEqual(expected.hashes)
  const baseline: ReturnType<typeof run>[] = [], optimized: ReturnType<typeof run>[] = []
  for (let index = 0; index < 3; index += 1) {
    if (index % 2 === 0) { baseline.push(run(false)); optimized.push(run(true)) }
    else { optimized.push(run(true)); baseline.push(run(false)) }
  }
  for (const sample of [...baseline, ...optimized]) expect(sample.hashes).toEqual(expected.hashes)
  for (const { cel, original } of inactive) expect(cel.surface!.pixels).toEqual(original)
  const median = (samples: ReturnType<typeof run>[], key: keyof typeof actual & ('previewMs' | 'commitHistoryMs' | 'undoRedoMs' | 'totalMs')) => samples.map(sample => sample[key]).sort((a, b) => a - b)[1]
  const preview = { baselineMedianMs: median(baseline, 'previewMs'), optimizedMedianMs: median(optimized, 'previewMs') }
  const total = { baselineMedianMs: median(baseline, 'totalMs'), optimizedMedianMs: median(optimized, 'totalMs') }
  const commitHistory = { baselineMedianMs: median(baseline, 'commitHistoryMs'), optimizedMedianMs: median(optimized, 'commitHistoryMs') }
  expect(commitHistory.optimizedMedianMs).toBeLessThan(commitHistory.baselineMedianMs * 0.9)
  expect(total.optimizedMedianMs).toBeLessThan(total.baselineMedianMs)
  mkdirSync(resolve('output'), { recursive: true })
  writeFileSync(resolve('output/selection-commit-row-after-20261006.json'), `${JSON.stringify({
    scenario: { canvas: '4096x4096', layers: 100, frames: 8, cels: 800, selection: '1024x1024 masked RGBA',
      content: 'nonuniform colors, holes and partial alpha; active-frame rotation; other frame/cel surfaces unchanged' },
    baseline: 'frozen preceding commit; identical optimized raster and history algorithms in both modes; identical commit dispatch spy',
    method: 'warmup; three alternating samples; three angles per sample; no cross-sample raster reuse; exact full-layer/raster comparison plus all-sample hashes',
    samples: { baseline, optimized }, preview, commitHistory, total,
    commitHistoryReductionRatio: 1 - commitHistory.optimizedMedianMs / commitHistory.baselineMedianMs,
    previewReductionRatio: 1 - preview.optimizedMedianMs / preview.baselineMedianMs,
    totalReductionRatio: 1 - total.optimizedMedianMs / total.baselineMedianMs,
    memory: 'no added pixel buffers; dense history representation and ownership unchanged; row calculations use scalar locals',
    scope: 'real core preview, apply, history creation, undo and redo; excludes capture, Store/React, multi-layer composition and browser frame scheduling'
  }, null, 2)}\n`)
}, 60000)

