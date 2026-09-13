import { describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import { CanvasInputState } from '@/core/canvas-input'
import { brushMaskOffsets, brushStampAnchor } from '@/core/tools-brush'
import { sessionFromDocument } from '@/store/workspace-session'
import { renderCanvasAirbrush } from './canvas-render-airbrush'
import { canvasAdaptiveContrast } from './canvas-adaptive-contrast'

vi.mock('./canvas-adaptive-contrast', () => ({ canvasAdaptiveContrast: vi.fn(() => '#fff') }))

describe('airbrush outline work', () => {
  it('preserves all outline segments while projecting only edge pixels and sampling a bounded backdrop', () => {
    const document = createDocument('outline', 512, 512, 'rgba', false)
    const session = sessionFromDocument(document)
    Object.assign(session, { tool: 'airbrush', airbrushScatterRadius: 64, airbrushParticleRadius: 1 })
    session.view.zoom = 1
    const input = new CanvasInputState()
    Object.assign(input.pointer, { visible: true, point: { x: 200, y: 200 }, clientX: 200, clientY: 200 })
    const lineTo = vi.fn(), stroke = vi.fn()
    const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo, stroke, lineWidth: 1 }
    const pixelRects = vi.fn((x: number, y: number) => [{ x, y, width: 1, height: 1 }])
    renderCanvasAirbrush({
      canRenderToolPreview: true, inputRef: { current: input }, session, drag: null,
      drawingBrushPreviewEnabled: true, repeatedDocumentPointsAt: () => null,
      paintSelectionForDrag: () => null, gridSnapActive: false, document,
      symmetryCenter: { x: 256, y: 256 }, view: session.view,
      sampleCompositeForPreview: () => ({ r: 0, g: 0, b: 0, a: 255 }), context,
      activeTheme: { variables: {} }, previewPointKey: (x: number, y: number) => `${x}:${y}`,
      previewPixelRects: pixelRects, drawPreviewPixel: () => [],
      previewColorAt: () => ({ r: 0, g: 0, b: 0, a: 255 })
    } as unknown as Parameters<typeof renderCanvasAirbrush>[0])
    const mask = brushMaskOffsets(129, 'round'), anchor = brushStampAnchor(129, null)
    const points = new Set(mask.map(p => `${200 - anchor.x + p.x}:${200 - anchor.y + p.y}`))
    let edges = 0, boundaryPixels = 0
    for (const point of points) {
      const [x, y] = point.split(':').map(Number)
      const missing = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([px, py]) => !points.has(`${px}:${py}`)).length
      edges += missing
      if (missing) boundaryPixels++
    }
    expect(lineTo).toHaveBeenCalledTimes(edges)
    expect(pixelRects).toHaveBeenCalledTimes(boundaryPixels)
    expect(boundaryPixels).toBeLessThan(mask.length / 10)
    expect(stroke).toHaveBeenCalledTimes(1)
    const bounds = vi.mocked(canvasAdaptiveContrast).mock.lastCall?.[1]
    expect(bounds).toBeDefined()
    expect(bounds!.width).toBeLessThan(140)
    expect(bounds!.height).toBeLessThan(140)
    for (const [x, y] of pixelRects.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(bounds!.x)
      expect(y).toBeGreaterThanOrEqual(bounds!.y)
      expect(x + 1).toBeLessThanOrEqual(bounds!.x + bounds!.width)
      expect(y + 1).toBeLessThanOrEqual(bounds!.y + bounds!.height)
    }
  })
})
