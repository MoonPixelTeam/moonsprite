import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, createLayer, writeLayerColor } from '@/core/document'
import { CanvasInputState } from '@/core/canvas-input'
import { sessionFromDocument } from '@/store/workspace-session'
import { canvasAdaptiveContrast } from './canvas-adaptive-contrast'
import { renderCanvasBrush } from './canvas-render-brush'
import { deviceAlignedPixelRect } from '@/core/canvas-render-plan'

vi.mock('./canvas-adaptive-contrast', () => ({ canvasAdaptiveContrast: vi.fn(() => '#fff') }))
afterEach(() => vi.clearAllMocks())

it.each(['full', 'full-edge'] as const)('composites %s brush below upper layers on the document pixel grid', mode => {
 for (const alpha of [255, 128]) for (const scale of [1, 1.25, 1.5, 2]) for (const thickness of [1, 2, 3]) {
  const document = createDocument('outline', 512, 512, 'rgba', false)
  const upper = createLayer('upper', 512, 512, 'rgba')
  document.layers.push(upper)
  writeLayerColor(document, upper, 200 * 512 + 200, { r: 0, g: 0, b: 255, a: alpha })
  const session = sessionFromDocument(document)
  Object.assign(session, { tool: 'pencil', brushSize: 1, brushTexture: 'solid', primaryColor: { r: 255, g: 0, b: 0, a: 255 } })
  session.view.zoom = 2
  const input = new CanvasInputState()
  Object.assign(input.pointer, { visible: true, point: { x: 200, y: 200 } })
  let translation = { x: 0, y: 0 }
  const stack: typeof translation[] = []
  const context = {
    save: vi.fn(() => stack.push({ ...translation })), restore: vi.fn(() => { translation = stack.pop()! }),
    getTransform: () => ({ a: scale, b: 0, c: 0, d: scale, e: translation.x, f: translation.y }),
    translate: vi.fn((x: number, y: number) => { translation.x += x * scale; translation.y += y * scale }),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), lineWidth: thickness
  }
  const args = {
    currentActiveLayer: getActiveLayer(document), currentSession: session, document,
    brushPreviewMode: mode, brushEdgeThickness: thickness, canRenderToolPreview: true, inputRef: { current: input },
    activeDrag: null, drag: null, pointerOverCanvas: vi.fn(() => true), drawingBrushPreviewEnabled: true,
    brushPreviewOverlaySupported: () => false, repeatedDocumentPointsAt: () => null,
    tilemapEditSelectionAtPoint: () => undefined, paintSelectionForDrag: () => null,
    snapBrushPointToGrid: (point: unknown) => point, brushPatternOrigin: () => ({ x: 0, y: 0 }),
    context, view: session.view, optimizedRotationEnabled: false,
    previewPixelRect: (x: number, y: number) => deviceAlignedPixelRect(0.3, 0.7, 2, x, y, scale),
    repeatCopies: [{ x: 0, y: 0, originX: 0, originY: 0, fromX: 0, fromY: 0, toX: 512, toY: 512 }],
    fromX: 0, fromY: 0, toX: 512, toY: 512,
    brushPreviewStackCacheRef: { current: null }, brushPreviewCompositeCacheRef: { current: null },
    fillPreviewPixelRects: vi.fn(() => {
      // Replacement colors include the unchanged upper layer. Even a half
      // physical pixel translation produces seams and moving upper edges.
      expect(translation).toEqual({ x: 0, y: 0 })
    })
  } as unknown as Parameters<typeof renderCanvasBrush>[0]
  renderCanvasBrush(args)
  const fills = vi.mocked(args.fillPreviewPixelRects).mock.lastCall![0]
  expect(fills).toHaveLength(1)
  expect(fills[0].color.b).toBe(alpha)
  expect(fills[0].color.r).toBe(255 - alpha)
  expect(fills[0].color.a).toBe(255)
  expect(fills[0].pixelRect).toEqual(deviceAlignedPixelRect(0.3, 0.7, 2, 200, 200, scale))
  expect(translation).toEqual({ x: 0, y: 0 })
  expect(context.stroke).toHaveBeenCalledTimes(mode === 'full-edge' ? 1 : 0)
 }
})
