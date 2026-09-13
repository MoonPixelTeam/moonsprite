import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document'
import { CanvasInputState } from '@/core/canvas-input'
import { sessionFromDocument } from '@/store/workspace-session'
import { canvasAdaptiveContrast } from './canvas-adaptive-contrast'
import { renderCanvasBrush } from './canvas-render-brush'

vi.mock('./canvas-adaptive-contrast', () => ({ canvasAdaptiveContrast: vi.fn(() => '#fff') }))
afterEach(() => vi.clearAllMocks())

it.each(['solid', 'grain'] as const)('bounds the %s brush backdrop to its rendered outline', texture => {
  const document = createDocument('outline', 512, 512, 'rgba', false)
  const session = sessionFromDocument(document)
  Object.assign(session, { tool: 'pencil', brushSize: 16, brushTexture: texture })
  session.view.zoom = 2
  const input = new CanvasInputState()
  Object.assign(input.pointer, { visible: true, point: { x: 200, y: 200 } })
  const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), lineWidth: 1 }
  const args = {
    currentActiveLayer: getActiveLayer(document), currentSession: session, document,
    brushPreviewMode: 'edge', canRenderToolPreview: true, inputRef: { current: input },
    activeDrag: null, drag: null, pointerOverCanvas: true, drawingBrushPreviewEnabled: true,
    brushPreviewOverlaySupported: () => false, repeatedDocumentPointsAt: () => null,
    tilemapEditSelectionAtPoint: () => undefined, paintSelectionForDrag: () => null,
    snapBrushPointToGrid: (point: unknown) => point, brushPatternOrigin: () => ({ x: 0, y: 0 }),
    context, view: session.view, optimizedRotationEnabled: false,
    previewPixelRect: (x: number, y: number) => ({ x: x * 2, y: y * 2, width: 2, height: 2 }),
    repeatCopies: [{ x: 0, y: 0, originX: 0, originY: 0, fromX: 0, fromY: 0, toX: 512, toY: 512 }],
    fromX: 0, fromY: 0, toX: 512, toY: 512,
    brushPreviewStackCacheRef: { current: null }, brushPreviewCompositeCacheRef: { current: null },
    fillPreviewPixelRects: vi.fn()
  } as unknown as Parameters<typeof renderCanvasBrush>[0]
  renderCanvasBrush(args)
  expect(context.stroke).toHaveBeenCalledOnce()
  expect(context.lineTo.mock.calls.length).toBeGreaterThan(0)
  const bounds = vi.mocked(canvasAdaptiveContrast).mock.lastCall?.[1]
  expect(bounds).toBeDefined()
  // A 16px brush at 2x zoom must not filter a 1024x1024 stage.
  expect(bounds!.width * bounds!.height).toBeLessThan(40 * 40)
  for (const [x, y] of [...context.moveTo.mock.calls, ...context.lineTo.mock.calls]) {
    expect(x).toBeGreaterThan(bounds!.x)
    expect(y).toBeGreaterThan(bounds!.y)
    expect(x).toBeLessThan(bounds!.x + bounds!.width)
    expect(y).toBeLessThan(bounds!.y + bounds!.height)
  }
  // An empty, off-document cursor must not copy or filter any backdrop.
  vi.mocked(canvasAdaptiveContrast).mockClear()
  context.stroke.mockClear()
  input.pointer.point = { x: -100, y: -100 }
  renderCanvasBrush(args)
  expect(canvasAdaptiveContrast).not.toHaveBeenCalled()
  expect(context.stroke).not.toHaveBeenCalled()
})
