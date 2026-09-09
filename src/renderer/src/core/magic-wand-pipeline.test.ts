import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SelectionMask } from '@shared/types'
import { prepareSelectionBoundary, selectionBoundarySegments, selectionPreviewRectangles, selectionPreviewRectanglesForExterior } from './selection-boundary'
import { prepareMagicWandOperation } from './magic-wand-operation'
import { drawMagicWandPreview } from '../components/canvas-magic-preview'
import type { RasterContext2D } from '../components/canvas-selection-renderer'

describe('magic wand display pipeline', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('reuses worker geometry through selection/history shallow copies without scanning the mask', () => {
    const selection = { x: 0, y: 0, width: 2000, height: 2000, mask: new Uint8Array(4_000_000).fill(1) }
    selection.mask[2001] = 0
    const edges = selectionBoundarySegments(selection)
    const includes = vi.spyOn(selection.mask, 'includes')
    prepareSelectionBoundary(selection, edges)
    expect(selectionBoundarySegments({ ...selection })).toBe(edges)
    expect(includes).not.toHaveBeenCalled()
  })
  it('draws the sparse 2000-square selection with four merged rectangles instead of four million pixel samples', () => {
    const selection = { x: 0, y: 0, width: 2000, height: 2000, mask: new Uint8Array(4_000_000).fill(1) }
    for (let y = 500; y < 564; y++) selection.mask.fill(0, y * 2000 + 500, y * 2000 + 564)
    const rectangles = selectionPreviewRectangles(selection, 2048)
    const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), fill: vi.fn(), drawImage: vi.fn() }
    drawMagicWandPreview(context as unknown as RasterContext2D, selection, rectangles, null, 10, 20, 0.5)
    expect(context.rect).toHaveBeenCalledTimes(4)
    expect(context.fill).toHaveBeenCalledTimes(1)
  })
  it('uses the same black-or-white contrast color as selection previews', () => {
    const selection = { x: 0, y: 0, width: 1, height: 1 }
    const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), fill: vi.fn(), drawImage: vi.fn(), globalCompositeOperation: '', fillStyle: '', filter: '' }
    drawMagicWandPreview(context as unknown as RasterContext2D, selection, new Int32Array([0, 0, 1, 1]), null, 0, 0, 1, '#000000', true)
    expect(context.globalCompositeOperation).toBe('source-over')
    expect(context.fillStyle).toBe('#000000')
  })
  it('bounds path complexity for noisy selections and displays their bitmap in one call', () => {
    const mask = Uint8Array.from({ length: 256 * 256 }, (_, i) => (i + Math.floor(i / 256)) % 2)
    const selection = { x: 3, y: 4, width: 256, height: 256, mask }
    expect(selectionPreviewRectangles(selection, 2048)).toHaveLength(0)
    const context = { save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), rect: vi.fn() }
    const bitmap = {} as ImageBitmap
    drawMagicWandPreview(context as unknown as RasterContext2D, selection, null, bitmap, 10, 20, 2)
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 16, 28, 512, 512)
    expect(context.rect).not.toHaveBeenCalled()
  })
  it('keeps noisy automatic black previews to one filtered bitmap draw', () => {
    const selection = { x: 3, y: 4, width: 2, height: 2 }
    const context = { save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), globalCompositeOperation: '', fillStyle: '', filter: '' }
    const bitmap = {} as ImageBitmap
    drawMagicWandPreview(context as unknown as RasterContext2D, selection, null, bitmap, 10, 20, 2, '#000000', true)
    expect(context.filter).toBe('brightness(0)')
    expect(context.drawImage).toHaveBeenCalledTimes(1)
  })
  it('combines selection in worker coordinates and preserves the original selection', () => {
    const before: SelectionMask = { x: 1, y: 0, width: 2, height: 1, mask: new Uint8Array([1, 1]) }
    const combine = prepareMagicWandOperation({ before, mode: 'subtract' })
    const result = combine({ x: 2, y: 0, width: 1, height: 1 }, 4, 2, 2, 0, 0, false, 0)
    expect(result).toMatchObject({ x: 1, y: 0, width: 1, height: 1 })
    expect(Array.from(before.mask!)).toEqual([1, 1])
  })
  it('preserves every pixel when compressing a transparent exterior with an irregular hole', () => {
    const mask = new Uint8Array(200 * 200).fill(1)
    mask[101 * 200 + 100] = 0
    mask[100 * 200 + 101] = 0
    const rectangles = selectionPreviewRectanglesForExterior({ x: 0, y: 0, width: 200, height: 200, mask }, { x: 100, y: 100, width: 2, height: 2 })
    const actual = new Uint8Array(mask.length)
    for (let i = 0; i < rectangles.length; i += 4) {
      const [x, y, w, h] = rectangles.subarray(i, i + 4)
      for (let row = y; row < y + h; row++) actual.fill(1, row * 200 + x, row * 200 + x + w)
    }
    expect(actual).toEqual(mask)
  })
  it('computes a flipped free-tile source selection in document coordinates', () => {
    const operation = prepareMagicWandOperation({ freeTile: {
      document: { width: 8, height: 4, colorMode: 'rgba', palette: [] },
      bounds: { x: 2, y: 1, width: 2, height: 1 }, instance: { flipHorizontal: true },
      source: { id: 'source', offsetX: 0, offsetY: 0, opacity: 1, visible: true, blendMode: 'normal', tileset: {
        id: 'tiles', name: 'Tile', tileWidth: 2, tileHeight: 1, columns: 1, rows: 1, tileIds: ['one'],
        pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255])
      } }
    } })
    expect(operation(null, 8, 4, 2, 1, 0, true, 0)).toMatchObject({ x: 2, y: 1, width: 1, height: 1 })
    expect(operation(null, 8, 4, 0, 0, 0, true, 0)).toBeNull()
  })
  it('executes the real worker handler for indexed offset, noncontiguous and gap-closing requests', async () => {
    const messages: any[] = []
    vi.stubGlobal('postMessage', (message: unknown) => messages.push(message))
    await import('../workers/magic-wand.worker')
    const send = (data: unknown) => globalThis.onmessage!.call(window, { data } as MessageEvent)
    send({ type: 'initialize', width: 3, height: 1, offsetX: 2, offsetY: 1, format: 'indexed', pixels: new Uint32Array([1, 2, 1]), palette: [{ id: 1, color: { r: 255, g: 0, b: 0, a: 255 } }, { id: 2, color: { r: 0, g: 0, b: 255, a: 255 } }] })
    send({ type: 'operation', operation: {} })
    send({ id: 1, type: 'request', width: 8, height: 4, x: 2, y: 1, tolerance: 0, contiguous: false, gapClosingThreshold: 0 })
    const result = messages.at(-1).result
    expect(result.selection).toMatchObject({ x: 2, y: 1, width: 3, height: 1 })
    expect(Array.from(result.selection.mask)).toEqual([1, 0, 1])
    expect(result.boundarySegments.length).toBeGreaterThan(0)
    send({ id: 2, type: 'request', width: 8, height: 4, x: 2, y: 1, tolerance: 0, contiguous: true, gapClosingThreshold: 1 })
    expect(messages.at(-1).error).toBeUndefined()
    expect(messages.at(-1).result.selection).not.toBeNull()
  })
  it('discovers exact bounds in sparse RGBA tiles without losing isolated opaque pixels', async () => {
    const messages: any[] = []
    vi.stubGlobal('postMessage', (message: unknown) => messages.push(message))
    await import('../workers/magic-wand.worker')
    const send = (data: unknown) => globalThis.onmessage!.call(window, { data } as MessageEvent)
    const offsets = new Int32Array(16)
    offsets[5] = 1
    send({ type: 'initialize', width: 8, height: 8, offsetX: 0, offsetY: 0, format: 'rgba', pixels: new Uint8ClampedArray(0), runtime: {
      data: new Uint8Array([0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0]), tileSize: 2, tileOffsets: offsets
    } })
    send({ type: 'operation', operation: {} })
    send({ id: 1, type: 'request', width: 8, height: 8, x: 0, y: 0, contiguous: true })
    const selected = messages.at(-1).result.selection as SelectionMask
    expect(selected).toMatchObject({ x: 0, y: 0, width: 8, height: 8 })
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      expect(selected.mask![y * 8 + x]).toBe((x === 3 && y === 2) || (x === 2 && y === 3) ? 0 : 1)
    }
  })
})
