import { beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, writeLayerColor, compositeRegion } from '@/core/document'
import { decodeDocumentFile } from '@/core/document-files'
import { encodePng } from '@/core/png-encode'
import { encodePsd } from '@/core/psd'
import { encodeAseprite } from '@/core/aseprite'
import { useWorkspace } from './workspace'

beforeEach(() => {
  Object.defineProperty(window, 'moonSprite', { configurable: true, value: { getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 })) } })
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
})
it.each(['png', 'psd', 'aseprite'])('resizes imported %s and preserves undo/redo', async extension => {
  const source = createDocument('import', 2, 2, 'rgba')
  writeLayerColor(source, source.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  const bytes = extension === 'png' ? encodePng(compositeRegion(source, 0, 0, 2, 2), 2, 2, true).bytes : extension === 'psd' ? encodePsd(source) : encodeAseprite(source)
  const document = decodeDocumentFile(bytes, `C:/import/image.${extension}`)
  useWorkspace.getState().addSession(document)
  await useWorkspace.getState().resizeActiveCanvas(4, 4, 'center', 1, 1, true)
  expect(useWorkspace.getState().message).toBeNull()
  expect(document.width).toBe(4)
  expect(document.height).toBe(4)
  expect([...compositeRegion(document, 1, 1, 1, 1)]).toEqual([255, 0, 0, 255])
  useWorkspace.getState().undo()
  expect(document.width).toBe(2)
  useWorkspace.getState().redo()
  expect(document.width).toBe(4)
})

it('expands a 286-layer imported canvas without budgeting 286 full-size bitmaps', async () => {
  const source = createDocument('many small cels', 1500, 1500, 'rgba')
  for (let i = 1; i < 286; i++) source.layers.push(createLayer(`cel ${i}`, 2, 2, 'rgba'))
  writeLayerColor(source, source.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  const document = decodeDocumentFile(encodeAseprite(source), 'import.aseprite')
  useWorkspace.getState().addSession(document)
  await useWorkspace.getState().resizeActiveCanvas(2000, 2000, 'nw', 0, 0, true)
  expect(useWorkspace.getState().message).toBeNull()
  expect(document.width).toBe(2000)
  useWorkspace.getState().undo()
  expect(document.width).toBe(1500)
  useWorkspace.getState().redo()
  expect(document.width).toBe(2000)
})

it.skipIf(!process.env.MOONSPRITE_RESIZE_FIXTURE)('resizes the supplied reproduction project', async () => {
  const { readFileSync } = await import('node:fs')
  const path = process.env.MOONSPRITE_RESIZE_FIXTURE!
  const document = decodeDocumentFile(new Uint8Array(readFileSync(path)), path)
  const { createHash } = await import('node:crypto')
  const pixelsDigest = () => {
    const hash = createHash('sha256')
    for (const layer of document.layers) hash.update(new Uint8Array(layer.pixels.buffer, layer.pixels.byteOffset, layer.pixels.byteLength))
    return hash.digest('hex')
  }
  const original = pixelsDigest()
  useWorkspace.getState().addSession(document)
  await useWorkspace.getState().resizeActiveCanvas(2000, 2000, 'nw', 0, 0, true)
  expect(useWorkspace.getState().message).toBeNull()
  expect([document.width, document.height]).toEqual([2000, 2000])
  expect(pixelsDigest()).toBe(original)
  useWorkspace.getState().undo()
  expect([document.width, document.height]).toEqual([1500, 1500])
  useWorkspace.getState().redo()
  expect([document.width, document.height]).toEqual([2000, 2000])
}, 30000)
