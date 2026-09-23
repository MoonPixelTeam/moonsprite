import { describe, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document'
import { brushMaskOffsets, brushPathStampPoints, brushStampAnchor } from '@/core/tools-brush'
import { rasterLinePoints, selectionContains } from '@/core/selection'
import type { BrushShape } from '@shared/types-brush'
import type { SelectionMask } from '@shared/types-selection'
import { sessionFromDocument } from '@/store/workspace-session'
import { createCanvasBrushPath } from './canvas-render-brush-path'
import { solidBrushPathSpans, visitSolidBrushPathColors } from './canvas-solid-brush-path'

function reference(centers: readonly { x: number; y: number }[], size: number, shape: BrushShape, angle: number) {
  const anchor = brushStampAnchor(size, null, angle, shape)
  const pixels = new Set<number>()
  for (const center of centers) {
    const mask = brushMaskOffsets(size, shape, 'solid', 1, center.x - anchor.x, center.y - anchor.y, null, undefined, 0, 'paint', 0, 0, undefined, angle, true)
    for (const point of mask) {
      const x = center.x - anchor.x + point.x, y = center.y - anchor.y + point.y
      if (x >= 0 && y >= 0 && x < 80 && y < 64) pixels.add(y * 80 + x)
    }
  }
  return pixels
}

describe('solid brush path preview', () => {
  for (const [shape, angle] of [['round', 0], ['round', 23], ['square', 0], ['square', 90], ['line', 0]] as const) {
    it.each([1, 2, 17, 32])(`matches stamped ${shape} footprint at ${angle} degrees, size %s`, size => {
      const path = [...rasterLinePoints({ x: -5, y: 3 }, { x: 72, y: 60 }), ...rasterLinePoints({ x: 72, y: 60 }, { x: 20, y: 12 })]
      const centers = brushPathStampPoints(path, size, null, angle, shape)
      const expected = reference(centers, size, shape, angle)
      const actual = new Set<number>()
      for (const span of solidBrushPathSpans(centers, size, shape, angle, true, 80, 64)) {
        for (let x = span.left; x <= span.right; x++) {
          const index = span.y * 80 + x
          expect(actual.has(index)).toBe(false)
          actual.add(index)
        }
      }
      expect(actual).toEqual(expected)
    })
  }

  it('splits runs at selection holes, color changes and translucent checkerboard samples', () => {
    const emit = vi.fn(), colorAt = vi.fn((x: number) => ({ r: x < 4 ? 1 : 2, g: 0, b: 0, a: x < 5 ? 255 : 128 }))
    const selection = { x: 0, y: 0, width: 8, height: 1, mask: new Uint8Array([1, 1, 0, 1, 1, 1, 1, 1]) }
    visitSolidBrushPathColors([{ y: 0, left: 0, right: 7 }], selection, colorAt, emit)
    expect(emit.mock.calls.map(([left, right]) => [left, right])).toEqual([[0, 1], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7]])
    expect(colorAt).toHaveBeenCalledTimes(7)
  })

  it.each(['pencil', 'eraser'] as const)('preserves %s baseline, selection and color sampling once per covered pixel', tool => {
    const document = createDocument('line preview', 80, 64, 'rgba', false), layer = getActiveLayer(document)
    const session = sessionFromDocument(document)
    Object.assign(session, { tool, brushSize: 17, brushShape: 'round', symmetryAxes: [] })
    const selection: SelectionMask = { x: 5, y: 8, width: 50, height: 40, mask: Uint8Array.from({ length: 2000 }, (_, i) => i % 3 ? 1 : 0) }
    const points = rasterLinePoints({ x: 2, y: 3 }, { x: 70, y: 58 })
    const baseline = new Map([[20 * 80 + 21, 0xff123456]])
    const sampled = new Set<number>(), rendered = new Set<number>()
    const previewColorAt = vi.fn((x, y, erase, coverage, _color, base) => {
      const index = y * 80 + x
      expect(sampled.has(index)).toBe(false); sampled.add(index)
      expect(erase).toBe(tool === 'eraser'); expect(coverage).toBe(255)
      if (index === 20 * 80 + 21) expect(base).toEqual({ r: 0x56, g: 0x34, b: 0x12, a: 255 })
      return { r: 30, g: 40, b: 50, a: 255 }
    })
    const args = {
      session, currentSession: session, document, currentActiveLayer: layer, activeLayer: layer,
      activeBrushImage: null, activeBrushTexture: 'solid', activeBrushDither: undefined, activeBrushPreviewMode: 'paint',
      brushPatternOrigin: () => ({ x: 0, y: 0 }), optimizedRotationEnabled: true, proceduralAntialiasStrength: 0,
      view: { ...session.view, zoom: 1, tileRepeatMode: 'off' }, deviceScale: { x: 1, y: 1 },
      previewPixelPlacements: (x: number, y: number) => [{ point: { x, y }, copy: { originX: 0, originY: 0 } }],
      previewColorAt, fillPreviewPixelRects: (entries: Array<{ pixelRect: { x: number; y: number; width: number }; sampleX: number; sampleY: number }>) => {
        for (const e of entries) for (let x = e.pixelRect.x; x < e.pixelRect.x + e.pixelRect.width; x++) rendered.add(e.sampleY * 80 + x)
      }
    } as unknown as Parameters<typeof createCanvasBrushPath>[0]
    createCanvasBrushPath(args).drawBrushPathPreview(points, session.primaryColor, tool === 'eraser', baseline, selection)
    const expected = new Set([...reference(brushPathStampPoints(points, 17, null, 0, 'round'), 17, 'round', 0)]
      .filter(i => selectionContains(selection, i % 80, Math.floor(i / 80))))
    expect(sampled).toEqual(expected); expect(rendered).toEqual(expected)
    expect(sampled.has(20 * 80 + 21)).toBe(true)
  })
})
