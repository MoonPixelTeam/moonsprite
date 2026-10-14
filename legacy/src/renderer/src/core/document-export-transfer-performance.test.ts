// @vitest-environment node
import { afterAll, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDocument, createLayer, createLayerMask } from './document-model'
import { prepareRuntimeRasterDocumentForTransfer } from './runtime-raster'
import { projectDocumentForWorkerTransfer, projectDocumentTransferables } from './project-save-transfer'

const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now()
const fixture = () => {
  const document = createDocument('export transfer baseline', 4096, 4096, 'rgba')
  document.layers = Array.from({ length: 100 }, (_, index) => {
    const layer = createLayer(`Layer ${index}`, 256, 256, 'rgba')
    const pixels = layer.pixels as Uint8ClampedArray
    layer.offsetX = (index * 37) % 3840
    layer.offsetY = (index * 53) % 3840
    for (let p = index % 11; p < pixels.length; p += 4096) pixels[p] = (index * 17) & 255
    return layer
  })
  document.animation!.cels = document.layers.map((layer, index) => ({ id: `cel-${index}`, layerId: layer.id, frameId: document.animation!.frames[0].id, opacity: 1, surface: { format: 'rgba' as const, width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: layer.pixels as Uint8ClampedArray } }))
  document.animation!.frames.push(...Array.from({ length: 7 }, (_, index) => ({ id: `frame-${index + 2}`, duration: 100 })))
  for (let frameIndex = 1; frameIndex < 8; frameIndex += 1) for (const [index, layer] of document.layers.entries()) document.animation!.cels.push({ id: `cel-${frameIndex}-${index}`, layerId: layer.id, frameId: `frame-${frameIndex + 1}`, opacity: 1, surface: document.animation!.cels[index].surface })
  document.animation!.layerMasks = document.layers.slice(0, 20).map((layer, index) => {
    const mask = createLayerMask(layer.id, 256, 256)
    mask.pixels[index * 4] = 255
    return { layerId: layer.id, frameId: document.animation!.frames[index % 8].id, mask }
  })
  return document
}
const median = (values: number[]) => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)]
const measure = (run: () => void) => { for (let i = 0; i < 2; i += 1) run(); const values: number[] = []; for (let i = 0; i < 5; i += 1) { const start = now(); run(); values.push(now() - start) } return { medianMs: Number(median(values).toFixed(2)), samplesMs: values.map(value => Number(value.toFixed(2))) } }

it('measures 4096 canvas 100 layers 8 frames export handoff', () => {
  const document = fixture()
  const baseline = measure(() => { const payload = structuredClone(document); prepareRuntimeRasterDocumentForTransfer(payload); structuredClone({ id: 1, document: payload, job: 'document', format: 'png-rgba', scalePercent: 100 }, { transfer: [] }) })
  const optimized = measure(() => { const payload = projectDocumentForWorkerTransfer(document); const transfer = projectDocumentTransferables(payload); structuredClone({ id: 1, document: payload, job: 'document', format: 'png-rgba', scalePercent: 100 }, { transfer }) })
  const result = { scenario: { width: 4096, height: 4096, layers: 100, frames: 8, masks: 20, layerPixels: '256x256 RGBA' }, baseline, optimized, speedup: Number((baseline.medianMs / optimized.medianMs).toFixed(2)) }
  console.log('EXPORT_TRANSFER_BENCH', JSON.stringify(result))
  mkdirSync(resolve(process.cwd(), 'output'), { recursive: true })
  writeFileSync(resolve(process.cwd(), 'output/document-export-transfer-after-20261006.json'), `${JSON.stringify(result, null, 2)}\n`)
  expect(optimized.medianMs).toBeLessThan(baseline.medianMs)
})

afterAll(() => {})
