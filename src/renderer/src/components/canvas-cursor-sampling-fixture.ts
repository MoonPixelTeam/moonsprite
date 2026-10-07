import { CanvasInputState } from '@/core/canvas-input'
import { createDocument, createLayer, getActiveLayer, writeLayerColor } from '@/core/document-model'
import { createCompositePointSampler, createCompositePointReplacementSampler } from '@/core/document-composite'
import { sessionFromDocument } from '@/store/workspace-session'
import { useWorkspace } from '@/store/workspace'
import type { useCanvasCursor } from './useCanvasCursor'

/** Representative mouse-cursor workload shared by the regression and benchmark. */
export const cursorSamplingFixture = (): {
  ports: Parameters<typeof useCanvasCursor>[0]
  counts: { composite: number; replacement: number }
  canvas: HTMLCanvasElement
  session: ReturnType<typeof sessionFromDocument>
  composite: ReturnType<typeof createCompositePointSampler>
} => {
  const documentModel = createDocument('500px / 10 layers cursor', 500, 500, 'rgba')
  for (let i = 1; i < 10; i++) documentModel.layers.push(createLayer(`layer ${i}`, 500, 500, 'rgba'))
  documentModel.activeLayerId = documentModel.layers[5].id
  for (const layer of documentModel.layers) {
    layer.opacity = 0.6
    for (let x = 0; x < 500; x++) writeLayerColor(documentModel, layer, 100 * 500 + x, { r: 210, g: 130, b: 70, a: 128 })
  }
  const session = sessionFromDocument(documentModel)
  session.tool = 'pencil'
  session.primaryColor = { r: 200, g: 150, b: 100, a: 128 }
  useWorkspace.setState({ sessions: [session], activeId: documentModel.id })
  const input = new CanvasInputState(), canvas = document.createElement('canvas')
  const composite = createCompositePointSampler(documentModel)
  const replacement = createCompositePointReplacementSampler(documentModel, documentModel.activeLayerId)
  const counts = { composite: 0, replacement: 0 }
  const ports = {
    session, inputRef: { current: input }, canvasRef: { current: canvas },
    liveViewRef: { current: session.view },
    symmetryCenter: { x: 250, y: 250 }, symmetryAxisPreferences: { locked: false, thickness: 1 },
    canvasResizePreviewRef: { current: null }, canvasResizeHitAt: () => null, quickToolActive: () => false,
    symmetryAxisHitAt: () => null, temporaryMoveActive: () => false,
    localPointAt: (x: number) => ({ x: x % 500, y: 100 }),
    cursorCompositePointSamplerFor: () => (x: number, y: number) => { counts.composite++; return composite(x, y) },
    cursorCompositePointReplacementSamplerFor: () => (x: number, y: number, color: typeof session.primaryColor) => { counts.replacement++; return replacement(x, y, color) },
    activeLayer: getActiveLayer(documentModel), activeLayerEditable: true, selectionLayersEditable: true,
    scheduleDraw: () => {}, modifierActive: () => false, wheelBrushSizePreviewRef: { current: false },
    selectionPivotHitAt: () => false
  } as unknown as Parameters<typeof useCanvasCursor>[0]
  return { ports, counts, canvas, session, composite }
}
