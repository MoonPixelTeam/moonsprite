import { expect, it } from 'vitest'
import { createDocument, createLayer } from './document-model'
import { checkCanvasResizeResources } from './canvas-resize-resources'
const memory = { totalBytes: 8e9, freeBytes: 1e9 }
it('retains allocation limits for oversized canvases and low-memory operations', () => {
  const doc = createDocument('budget', 2, 2, 'rgba')
  expect(checkCanvasResizeResources(doc, 40000, 40000, 0, 0, false, memory).allowed).toBe(false)
  expect(checkCanvasResizeResources(doc, 2000, 2000, 0, 0, false, { ...memory, freeBytes: 100 }).allowed).toBe(false)
})
it('budgets cropped surfaces and repeated backgrounds instead of ignoring allocations', () => {
  const doc = createDocument('budget', 1000, 1000, 'rgba')
  const available = { ...memory, freeBytes: 20e6 }
  expect(checkCanvasResizeResources(doc, 100, 100, 0, 0, false, available).allowed).toBe(true)
  for (let i = 0; i < 3; i++) doc.layers.push(createLayer('cropped', 1000, 1000, 'rgba'))
  expect(checkCanvasResizeResources(doc, 100, 100, 0, 0, true, available).allowed).toBe(false)
  doc.layers[0].background = { mode: 'canvas' }
  expect(checkCanvasResizeResources(doc, 2000, 2000, 0, 0, false, available).allowed).toBe(false)
})
