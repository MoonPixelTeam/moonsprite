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
import * as packed from './tools-selection-transform-packed'
import * as holeFilling from './selection-rotation-hole-fill'
import { rasterizeSelectionTransformPacked as precedingRasterize } from './__fixtures__/selection-rotation-holes-reference'

afterEach(() => vi.restoreAllMocks())

// Frozen dense simultaneous rounds, with scan counts added once per round.
const denseFill = (output: Uint32Array, width: number, candidates: Uint32Array, additions: Uint32Array, count: number) => {
  const height = output.length / width
  let checks = 0
  while (count > 0) {
    checks += output.length
    let added = 0
    for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
      const index = row * width + col
      if ((candidates[index] >>> 24) === 0) continue
      let neighbors = 0
      if (col > 0 && (output[index - 1] >>> 24) !== 0) neighbors += 1
      if (col + 1 < width && (output[index + 1] >>> 24) !== 0) neighbors += 1
      if (row > 0 && (output[index - width] >>> 24) !== 0) neighbors += 1
      if (row + 1 < height && (output[index + width] >>> 24) !== 0) neighbors += 1
      if (neighbors >= 2) additions[added++] = index
    }
    if (added === 0) break
    for (let offset = 0; offset < added; offset += 1) {
      const index = additions[offset]
      output[index] = candidates[index]; candidates[index] = 0
    }
    count -= added
  }
  return checks
}

const measureRealHoles = (output: Uint32Array, width: number, indices: Uint32Array, values: Uint32Array, count: number) => {
  const dense = new Uint32Array(output.length)
  for (let index = 0; index < count; index += 1) dense[indices[index]] = values[index]
  const run = (reuse: boolean) => {
    let ms = 0, checks = 0
    for (let batch = 0; batch < 8; batch += 1) {
      // Equal output/scratch allocation and initialization stay outside timing.
      const pixels = output.slice(), first = reuse ? indices.slice() : dense.slice(), second = reuse ? values.slice() : new Uint32Array(output.length)
      const started = performance.now()
      checks = reuse ? holeFilling.fillSelectionRotationHoles(pixels, width, first, second, count) : denseFill(pixels, width, first, second, count)
      ms += performance.now() - started
    }
    return { ms, checksPerRaster: checks }
  }
  for (let index = 0; index < 3; index += 1) { run(false); run(true) }
  const baseline = [], optimized = []
  for (let index = 0; index < 5; index += 1) {
    if (index % 2) { optimized.push(run(true)); baseline.push(run(false)) }
    else { baseline.push(run(false)); optimized.push(run(true)) }
  }
  const median = (samples: ReturnType<typeof run>[]) => samples.map(sample => sample.ms).sort((a, b) => a - b)[2]
  const baselineMedianMs = median(baseline), optimizedMedianMs = median(optimized)
  expect(optimizedMedianMs).toBeLessThan(baselineMedianMs * 0.9)
  expect(optimized[0].checksPerRaster).toBeLessThan(baseline[0].checksPerRaster)
  const expected = output.slice(), actual = output.slice()
  denseFill(expected, width, dense.slice(), new Uint32Array(output.length), count)
  holeFilling.fillSelectionRotationHoles(actual, width, indices.slice(), values.slice(), count)
  expect(Buffer.from(actual.buffer).equals(Buffer.from(expected.buffer))).toBe(true)
  return { region: `${width}x${output.length / width}`, initialHoleCount: count, batchesPerSample: 8,
    method: 'real pre-fill raster and holes captured from production; three warmups and five alternating samples; identical output/scratch sizes; initialization excluded from stage timing',
    baseline, optimized, baselineMedianMs, optimizedMedianMs, reductionRatio: 1 - optimizedMedianMs / baselineMedianMs }
}

it('matches frozen simultaneous rounds for dense, thin, sparse, masked and clipped rotations', () => {
  const document = createDocument('hole filling patterns', 80, 64, 'rgba', false)
  const layer = document.layers[0]
  if (layer.format !== 'rgba') throw new Error('RGBA fixture required')
  const pixels = new Uint32Array(layer.pixels.buffer)
  for (const pattern of ['solid', 'contour', 'isolated', 'noise']) {
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 80; x += 1) {
      const present = pattern === 'solid' || (pattern === 'contour' ? x % 9 === 0 || y % 11 === 0
        : pattern === 'isolated' ? x % 7 === 0 && y % 5 === 0 : (x * 31 + y * 17) % 13 < 7)
      pixels[y * 80 + x] = present ? ((x % 5 ? 0xff000000 : 0x80000000) | (x * 197 + y * 31247)) >>> 0 : 0
    }
    for (const masked of [false, true]) for (const offsets of [true, false]) {
      const selection = { x: 16, y: 14, width: 24, height: 20,
        mask: masked ? Uint8Array.from({ length: 480 }, (_, index) => Number(index % 3 !== 0)) : undefined }
      const source = captureSelectionTransform(document, selection, layer, { cacheOpaqueOffsets: offsets })!
      for (const angle of [0.001, 8, 23, 45, -37, 90, 180, 270, 765]) for (const x of [-12, 19, 69]) {
        const target = { x, y: x < 0 ? -5 : 17, width: 24, height: 20 }
        const bounds = geometry.transformedSelectionBounds(target, angle)
        const left = Math.max(0, bounds.x), top = Math.max(0, bounds.y)
        const right = Math.min(80, bounds.x + bounds.width), bottom = Math.min(64, bounds.y + bounds.height)
        const clipped = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
        const expected = new Uint32Array(clipped.width * clipped.height), actual = new Uint32Array(expected.length)
        precedingRasterize(source, target, clipped, expected, angle)
        packed.rasterizeSelectionTransformPacked(source, target, clipped, actual, angle)
        expect(Buffer.from(actual.buffer).equals(Buffer.from(expected.buffer))).toBe(true)
      }
    }
  }
})

it('reduces hole filling in exact 1024-square preview and commit/history on 4K / 100 layers / 8 frames', () => {
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
  const compiled = packed.rasterizeSelectionTransformPacked, dispatch = vi.spyOn(packed, 'rasterizeSelectionTransformPacked')
  const target = { x: 1539, y: 1538, width: 1024, height: 1024 }
  const checksum = (values: Uint32Array) => {
    let hash = 2166136261
    for (const value of values) hash = Math.imul(hash ^ value, 16777619)
    return hash >>> 0
  }
  const run = (optimized: boolean, exact = false) => {
    dispatch.mockImplementation(optimized ? compiled : precedingRasterize)
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
  let capturedHoles: Parameters<typeof holeFilling.fillSelectionRotationHoles> | undefined
  const realFill = holeFilling.fillSelectionRotationHoles
  const fillSpy = vi.spyOn(holeFilling, 'fillSelectionRotationHoles').mockImplementation((output, width, indices, values, count) => {
    capturedHoles ??= [output.slice(), width, indices.slice(), values.slice(), count]
    return realFill(output, width, indices, values, count)
  })
  const expected = run(false, true), actual = run(true, true)
  fillSpy.mockRestore()
  if (!capturedHoles) throw new Error('Real rotation did not reach hole filling')
  const actualHoleFilling = measureRealHoles(...capturedHoles)
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
  mkdirSync(resolve('output'), { recursive: true })
  writeFileSync(resolve('output/selection-rotation-holes-after-20261006.json'), `${JSON.stringify({
    scenario: { canvas: '4096x4096', layers: 100, frames: 8, cels: 800, selection: '1024x1024 masked RGBA',
      content: 'nonuniform colors, holes and partial alpha; active-frame rotation; other frame/cel surfaces unchanged' },
    baseline: 'frozen immediately preceding dense-scan rasterizer, with compiled geometry in both modes; identical raster dispatch spy',
    method: 'warmup; three alternating samples; three angles per sample; no cross-sample raster reuse; exact full-layer/raster comparison plus all-sample hashes',
    samples: { baseline, optimized }, preview, total, actualHoleFilling,
    previewReductionRatio: 1 - preview.optimizedMedianMs / preview.baselineMedianMs,
    totalReductionRatio: 1 - total.optimizedMedianMs / total.baselineMedianMs,
    acceptance: 'hole-filling stage reduction and exact pixels; complete core pipeline timings are observational and below a reliable gain threshold',
    memory: 'same two area-sized Uint32 buffers (8 bytes per destination pixel); partition in place; no added pixel buffers or persistent cache',
    scope: 'real core preview, apply, history creation, undo and redo; excludes capture, Store/React, multi-layer composition and browser frame scheduling'
  }, null, 2)}\n`)
}, 60000)

