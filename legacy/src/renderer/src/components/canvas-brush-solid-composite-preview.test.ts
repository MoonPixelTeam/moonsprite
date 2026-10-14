import { expect, it, vi } from 'vitest'
import { deviceAlignedPixelRect } from '@/core/canvas-render-plan'
import { solidBrushPreviewRowSpans } from '@/core/tools-brush'
import { solidCompositePreviewRects } from './canvas-brush-solid-composite-preview'
import { createDocument, getActiveLayer } from '@/core/document'
import { createCompositePointReplacementSampler } from '@/core/document-composite'
import { CanvasInputState } from '@/core/canvas-input'
import { sessionFromDocument } from '@/store/workspace-session'
import { renderCanvasBrush } from './canvas-render-brush'

it.each(['round', 'square'] as const)('preserves clipped %s geometry and colors across fractional zoom and DPR', shape => {
  const rows = solidBrushPreviewRowSpans(12, shape, 25, true).map(span => ({ y: span.y - 3, left: span.left - 3, right: span.right - 3 }))
  for (const zoom of [0.25, 1.25, 4.5]) for (const dpr of [1, 1.25, 1.5, 2]) {
    const rectAt = (x: number, y: number) => deviceAlignedPixelRect(0.25, 0.75, zoom, x, y, { x: dpr, y: dpr })
    const colorAt = (x: number, y: number) => ({ r: x < 4 ? 20 : 50, g: y, b: 90, a: x === 5 ? 128 : 255 })
    const entries = solidCompositePreviewRects(rows, 8, 8, colorAt, rectAt)
    for (const row of rows) for (let x = Math.max(0, row.left); x <= Math.min(7, row.right); x++) {
      if (row.y < 0 || row.y >= 8) continue
      const rect = rectAt(x, row.y)
      const entry = entries.filter(e => e.sampleY === row.y && e.sampleX <= x).at(-1)
      expect(entry?.color).toEqual(colorAt(x, row.y))
      expect(entry!.pixelRect.x).toBeLessThanOrEqual(rect.x)
      expect(entry!.pixelRect.x + entry!.pixelRect.width).toBeGreaterThanOrEqual(rect.x + rect.width)
      expect(entry?.pixelRect.y).toBe(rect.y)
      expect(entry?.pixelRect.height).toBe(rect.height)
      if (x === 5) expect(entry?.sampleX).toBe(5)
    }
    for (const entry of entries) {
      expect(entry.sampleX).toBeGreaterThanOrEqual(0)
      expect(entry.sampleY).toBeGreaterThanOrEqual(0)
      expect(entry.sampleY).toBeLessThan(8)
    }
  }
})

it('reduces a uniform opaque 64px preview to one rectangle per row and retains translucent checkerboard samples', () => {
  const rows = solidBrushPreviewRowSpans(64, 'square', 0, false)
  const rectAt = (x: number, y: number) => ({ x, y, width: 1, height: 1 })
  const opaque = vi.fn(() => ({ r: 10, g: 20, b: 30, a: 255 }))
  const entries = solidCompositePreviewRects(rows, 64, 64, opaque, rectAt)
  expect(opaque).toHaveBeenCalledTimes(4096)
  expect(entries).toHaveLength(64)
  expect(entries.every(e => e.pixelRect.width === 64)).toBe(true)
  const translucent = solidCompositePreviewRects(rows, 64, 64, () => ({ r: 10, g: 20, b: 30, a: 128 }), rectAt)
  expect(translucent).toHaveLength(4096)
  expect(solidCompositePreviewRects(rows, 0, 0, opaque, rectAt)).toEqual([])
})

it.each(['normal', 'multiply', 'screen'] as const)('retains grouped %s compositing and invalidates cached opacity after an edit', blendMode => {
  const document = createDocument('grouped hover', 8, 8, 'rgba')
  const layer = getActiveLayer(document)
  layer.groupId = 'group'
  document.groups.push({ id: 'group', name: 'group', parentGroupId: null, visible: true, locked: false, opacity: 0.6, blendMode })
  const session = sessionFromDocument(document)
  Object.assign(session, { tool: 'pencil', brushSize: 4, brushTexture: 'solid', inkMode: 'simple', brushOpacity: 100 })
  const input = new CanvasInputState()
  Object.assign(input.pointer, { visible: true, point: { x: 3, y: 3 } })
  const sample = createCompositePointReplacementSampler(document, layer.id)
  const previewColorAt = vi.fn((x: number, y: number) => sample(x, y, session.primaryColor))
  const fill = vi.fn()
  const args = {
    currentActiveLayer: layer, currentSession: session, document, brushPreviewMode: 'full', canRenderToolPreview: true,
    inputRef: { current: input }, activeDrag: null, drag: null, pointerOverCanvas: () => true, drawingBrushPreviewEnabled: true,
    brushPreviewOverlaySupported: () => false, repeatedDocumentPointsAt: () => null, tilemapEditSelectionAtPoint: () => undefined,
    paintSelectionForDrag: () => null, snapBrushPointToGrid: (point: unknown) => point, brushPatternOrigin: () => ({ x: 0, y: 0 }),
    context: { save: vi.fn(), restore: vi.fn() }, view: session.view, optimizedRotationEnabled: false,
    previewPixelRect: (x: number, y: number) => ({ x, y, width: 1, height: 1 }),
    brushPreviewStackCacheRef: { current: null }, brushPreviewCompositeCacheRef: { current: null }, previewColorAt, fillPreviewPixelRects: fill
  } as unknown as Parameters<typeof renderCanvasBrush>[0]
  renderCanvasBrush(args)
  for (const entry of fill.mock.lastCall![0]) expect(entry.color).toEqual(sample(entry.sampleX, entry.sampleY, session.primaryColor))
  previewColorAt.mockClear()
  renderCanvasBrush(args)
  expect(previewColorAt).not.toHaveBeenCalled()
  session.brushOpacity = 50
  session.revision++
  renderCanvasBrush(args)
  expect(previewColorAt).toHaveBeenCalled()
  expect(session.history.revision).toBe(0)
})
