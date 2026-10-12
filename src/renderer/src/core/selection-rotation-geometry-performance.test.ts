import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer } from './document-model'
import { commitPixelEdit } from './history'
import * as geometry from './selection'
import { captureSelectionTransform } from './tools-selection-transform-source'
import { selectionTransformPreviewRasterPacked } from './tools-selection-transform-raster'
import { applySelectionTransform } from './tools-selection-transform-apply'
import { rasterizeSelectionTransformPacked } from './tools-selection-transform-packed'

afterEach(() => vi.restoreAllMocks())

const previousPoints: typeof geometry.compileSelectionTransformPoints = (source, target, angle = 0, shear, centered = false) => ({
  sourcePoint: (x, y) => geometry.transformedSelectionSourcePoint(source, target, x, y, angle, shear, centered),
  destinationPoint: (x, y) => geometry.transformedSelectionDestinationPoint(source, target, x, y, angle, shear)
})

it('prepares trig once while preserving exact coordinates for masks, flips, shear and centered sampling', () => {
  const source = { x: 8, y: 7, width: 24, height: 20, mask: Uint8Array.from({ length: 480 }, (_, index) => Number(index % 7 !== 0)) }
  for (const angle of [0, 0.00001, 23, -37, 90, 180, 270, 360, 765]) {
    for (const flip of [false, true]) for (const centered of [false, true]) {
      for (const shear of [undefined, { axis: 'x' as const, amount: 7, edge: 'n' as const }, { axis: 'y' as const, amount: -9, edge: 'e' as const }]) {
        const target = { x: -2.3, y: 4.7, width: 35.4, height: 27.8, flipHorizontal: flip, flipVertical: flip, flipOriginX: -2.3, flipOriginY: 32.5 }
        const previous = previousPoints(source, target, angle, shear, centered)
        const prepared = geometry.compileSelectionTransformPoints(source, target, angle, shear, centered)
        for (let y = -3; y < 40; y += 3) for (let x = -5; x < 40; x += 3) {
          expect(prepared.sourcePoint(x, y)).toEqual(previous.sourcePoint(x, y))
          expect(prepared.destinationPoint(x, y)).toEqual(previous.destinationPoint(x, y))
        }
      }
    }
  }
  const document = createDocument('trig count', 64, 64, 'rgba', false)
  new Uint32Array(document.layers[0].pixels.buffer).fill(0xff123456)
  const capture = captureSelectionTransform(document, { x: 16, y: 16, width: 24, height: 24 })!
  const target = { ...capture.selection }, bounds = geometry.transformedSelectionBounds(target, 23)
  const original = geometry.compileSelectionTransformPoints
  const dispatch = vi.spyOn(geometry, 'compileSelectionTransformPoints')
  const trig = vi.spyOn(Math, 'sin')
  dispatch.mockImplementation(previousPoints)
  const expected = new Uint32Array(bounds.width * bounds.height)
  rasterizeSelectionTransformPacked(capture, target, bounds, expected, 23)
  const previousTrigCalls = trig.mock.calls.length
  dispatch.mockImplementation(original); trig.mockClear()
  const actual = new Uint32Array(expected.length)
  rasterizeSelectionTransformPacked(capture, target, bounds, actual, 23)
  expect(actual).toEqual(expected)
  expect(trig.mock.calls.length).toBe(2)
  expect(previousTrigCalls).toBeGreaterThan(1000)
})

it('measures exact 1024-square preview and commit/history on 4K / 100 layers / 8 frames', () => {
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
  const compiled = geometry.compileSelectionTransformPoints, dispatch = vi.spyOn(geometry, 'compileSelectionTransformPoints')
  const target = { x: 1539, y: 1538, width: 1024, height: 1024 }
  const checksum = (values: Uint32Array) => {
    let hash = 2166136261
    for (const value of values) hash = Math.imul(hash ^ value, 16777619)
    return hash >>> 0
  }
  const run = (optimized: boolean, exact = false) => {
    dispatch.mockImplementation(optimized ? compiled : previousPoints)
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
  expect(preview.optimizedMedianMs).toBeLessThan(preview.baselineMedianMs)
  expect(total.optimizedMedianMs).toBeLessThan(total.baselineMedianMs)
  mkdirSync(resolve('output'), { recursive: true })
  writeFileSync(resolve('output/selection-rotation-geometry-after-20261006.json'), `${JSON.stringify({
    scenario: { canvas: '4096x4096', layers: 100, frames: 8, cels: 800, selection: '1024x1024 masked RGBA',
      content: 'nonuniform colors, holes and partial alpha; active-frame rotation; other frame/cel surfaces unchanged' },
    baseline: 'preceding per-pixel trig preparation through the same shared geometry; identical factory spy per raster in both modes',
    method: 'warmup; three alternating samples; three angles per sample; no cross-sample raster reuse; exact full-layer/raster comparison plus all-sample hashes',
    samples: { baseline, optimized }, preview, total,
    previewReductionRatio: 1 - preview.optimizedMedianMs / preview.baselineMedianMs,
    totalReductionRatio: 1 - total.optimizedMedianMs / total.baselineMedianMs,
    memory: 'two ephemeral geometry records and two closures per raster; pixel buffers and history representation unchanged',
    scope: 'real core preview, apply, history creation, undo and redo; excludes capture, Store/React, multi-layer composition and browser frame scheduling'
  }, null, 2)}\n`)
}, 60000)
