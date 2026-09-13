import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, writeLayerColor } from '@/core/document'
import { applySelectionTransform, captureSelectionTransform } from '@/core/tools'
import { CanvasCompositeCache } from './canvas-composite-cache'
import { useWorkspace } from '@/store/workspace'

class MockImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}

class MockOffscreenCanvas {
  static instances: MockOffscreenCanvas[] = []
  readonly pixels: Uint8ClampedArray
  readonly context = {
    putImageData: vi.fn((image: MockImageData, x: number, y: number) => {
      for (let row = 0; row < image.height; row += 1) {
        const sourceOffset = row * image.width * 4
        const targetOffset = ((y + row) * this.width + x) * 4
        this.pixels.set(image.data.subarray(sourceOffset, sourceOffset + image.width * 4), targetOffset)
      }
    }),
    drawImage: vi.fn((source: unknown, ...args: number[]) => {
      if (!(source instanceof MockOffscreenCanvas) || args.length < 8) return
      const [sx, sy, sw, sh, dx, dy, dw, dh] = args
      for (let y = 0; y < Math.ceil(dh); y += 1) for (let x = 0; x < Math.ceil(dw); x += 1) {
        const sourceX = Math.min(source.width - 1, Math.max(0, Math.floor(sx + x * sw / dw)))
        const sourceY = Math.min(source.height - 1, Math.max(0, Math.floor(sy + y * sh / dh)))
        const targetX = Math.floor(dx + x)
        const targetY = Math.floor(dy + y)
        if (targetX < 0 || targetY < 0 || targetX >= this.width || targetY >= this.height) continue
        const sourceOffset = (sourceY * source.width + sourceX) * 4
        const targetOffset = (targetY * this.width + targetX) * 4
        this.pixels.set(source.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset)
      }
    }),
    clearRect: vi.fn((x: number, y: number, width: number, height: number) => {
      const left = Math.max(0, Math.floor(x))
      const top = Math.max(0, Math.floor(y))
      const right = Math.min(this.width, Math.ceil(x + width))
      const bottom = Math.min(this.height, Math.ceil(y + height))
      for (let row = top; row < bottom; row += 1) this.pixels.fill(0, (row * this.width + left) * 4, (row * this.width + right) * 4)
    }),
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low'
  }
  constructor(public width: number, public height: number) {
    this.pixels = new Uint8ClampedArray(width * height * 4)
    MockOffscreenCanvas.instances.push(this)
  }
  getContext() { return this.context }
}

const makeContext = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  drawImage: vi.fn(),
  imageSmoothingEnabled: true
})

const draw = (
  cache: CanvasCompositeCache,
  document: ReturnType<typeof createDocument>,
  context: ReturnType<typeof makeContext>,
  overrides: Record<string, unknown> = {}
) => cache.draw({
  context: context as never,
  document,
  view: { zoom: 1, panX: 0, panY: 0, rotation: 0, mirrored: false, mirroredVertical: false, showGrid: false, relativeLuminance: false, ...(overrides.view as object | undefined) },
  originX: 0,
  originY: 0,
  canvasWidth: document.width,
  canvasHeight: document.height,
  fromX: 0,
  fromY: 0,
  toX: document.width,
  toY: document.height,
  revision: 1,
  contentRevision: 1,
  ...overrides
})

const drawnPixels = (context: ReturnType<typeof makeContext>): Uint8ClampedArray =>
  (context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas).pixels

beforeEach(() => {
  MockOffscreenCanvas.instances = []
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas)
  vi.stubGlobal('ImageData', MockImageData)
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
})

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

/**
 * The canvas keeps a composite surface keyed by the session content revision.
 * Moving a selection materializes the translation into the document, which
 * rebuilds that surface with the moved pixels. Undoing rolls the pixels back
 * through `revertPixelEdit`, which writes layer storage directly; if the store
 * does not invalidate the content revision too, the cache keeps serving the
 * moved surface and the canvas only corrects itself on the next unrelated
 * repaint (toggling a layer's eye, for example).
 */
describe('selection move canvas refresh after undo', () => {
  const setup = () => {
    const document = createDocument('canvas refresh after undo', 16, 1, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    writeLayerColor(document, layer, 1, { r: 0, g: 80, b: 255, a: 255 })
    useWorkspace.getState().addSession(document)
    const selection = { x: 0, y: 0, width: 2, height: 1 }
    useWorkspace.getState().setSelection(selection)
    const target = { x: 8, y: 0, width: 2, height: 1 }
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    return { document, layer, selection, target, cache, context }
  }

  const selectionPreviewFor = (session: ReturnType<typeof useWorkspace.getState>['sessions'][number], layerId: string, target: { x: number; y: number; width: number; height: number }) => session.pendingPaste
    ? { layerId, source: session.pendingPaste.source, target, angle: 0, copy: false, optimizedRotation: false }
    : undefined

  it('renders the original pixels after undoing a materialized deferred move', () => {
    const { document, layer, selection, target, cache, context } = setup()
    draw(cache, document, context, { revision: 1, contentRevision: 1 })
    expect(Array.from(drawnPixels(context).slice(0, 4))).toEqual([255, 0, 0, 255])

    // Exactly what the finish handler does for a simple translation while the
    // drag is still in deferred preview mode: materialize the translation and
    // hand the drag over as a deferred floating paste.
    const source = captureSelectionTransform(document, selection, layer)!
    const previewEdit = applySelectionTransform(document, source, target, 0, false, undefined, undefined, undefined, layer)!
    useWorkspace.getState().beginFloatingSelectionTransform(source, previewEdit, selection, { ...selection, x: 8 }, false, 'moveSelectionContent', null, target, 0, undefined, true)
    const dragged = useWorkspace.getState().sessions[0]
    const contentRevisionWhileDragging = dragged.contentRevision
    draw(cache, document, context, {
      revision: dragged.revision,
      contentRevision: dragged.contentRevision,
      selectionPreview: selectionPreviewFor(dragged, layer.id, target)
    })

    useWorkspace.getState().undo()
    const afterUndo = useWorkspace.getState().sessions[0]
    draw(cache, document, context, {
      revision: afterUndo.revision,
      contentRevision: afterUndo.contentRevision,
      contentInvalidation: afterUndo.contentInvalidation,
      selectionPreview: selectionPreviewFor(afterUndo, layer.id, target)
    })

    const pixels = drawnPixels(context)
    expect(Array.from(pixels.slice(0, 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(pixels.slice(4, 8))).toEqual([0, 80, 255, 255])
    expect(Array.from(pixels.slice(32, 36))).toEqual([0, 0, 0, 0])
    // Rolled back pixels must invalidate the composite surface, not just the
    // document storage.
    expect(afterUndo.contentRevision).toBeGreaterThan(contentRevisionWhileDragging)
  })

  it('renders the original pixels after cancelling a materialized deferred move', () => {
    const { document, layer, selection, target, cache, context } = setup()
    const source = captureSelectionTransform(document, selection, layer)!
    const previewEdit = applySelectionTransform(document, source, target, 0, false, undefined, undefined, undefined, layer)!
    useWorkspace.getState().beginFloatingSelectionTransform(source, previewEdit, selection, { ...selection, x: 8 }, false, 'moveSelectionContent', null, target, 0, undefined, true)
    const dragged = useWorkspace.getState().sessions[0]
    draw(cache, document, context, { revision: dragged.revision, contentRevision: dragged.contentRevision })

    useWorkspace.getState().cancelFloatingPaste()
    const afterCancel = useWorkspace.getState().sessions[0]
    draw(cache, document, context, {
      revision: afterCancel.revision,
      contentRevision: afterCancel.contentRevision,
      contentInvalidation: afterCancel.contentInvalidation
    })

    const pixels = drawnPixels(context)
    expect(Array.from(pixels.slice(0, 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(pixels.slice(4, 8))).toEqual([0, 80, 255, 255])
    expect(Array.from(pixels.slice(32, 36))).toEqual([0, 0, 0, 0])
  })
})
