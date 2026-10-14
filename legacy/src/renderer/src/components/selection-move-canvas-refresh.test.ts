import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compositeRegion, createDocument, writeLayerColor } from '@/core/document'
import { applySelectionTransform, applySelectionTranslationPreview, restoreSelectionTranslationPreview, captureSelectionTransform } from '@/core/tools'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { CanvasCompositeCache } from './canvas-composite-cache'
import { useWorkspace } from '@/store/workspace'
import { notifyCanvasPreview, registerCanvasPreviewListener, type CanvasPreviewSnapshot } from '@/core/canvas-preview-lifecycle'

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

describe.each([128 * 1024 * 1024, 1])('selection preview screen alignment (cache budget %s)', budget => {
  it.each([
    { zoom: 1.25, scale: { x: 1, y: 1 } },
    { zoom: 4.125, scale: { x: 1.25, y: 1.5 } },
    { zoom: 8, scale: { x: 1.25, y: 1.251 } },
    { zoom: 2, scale: { x: 1, y: 1 } },
    { zoom: 0.625, scale: { x: 1, y: 1 } }
  ])('matches applied pixels throughout a move at $zoom with $scale', ({ zoom, scale }) => {
    const document = createDocument('selection screen alignment', 13, 13, 'rgba')
    const layer = document.layers[0]
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      writeLayerColor(document, layer, y * 13 + x, { r: x * 19, g: y * 19, b: 90, a: 255 })
    }
    const selection = { x: 3, y: 3, width: 2, height: 2 }
    const source = captureSelectionTransform(document, selection, layer)!
    const cache = new CanvasCompositeCache(budget)
    const context = makeContext()
    const options = {
      view: { zoom, rotation: 0, mirrored: false, mirroredVertical: false },
      devicePixelRatio: scale, imageSmoothingEnabled: false,
      originX: 2 / scale.x, originY: 3 / scale.y,
      canvasWidth: document.width * zoom, canvasHeight: document.height * zoom,
      fromX: 1, fromY: 2, toX: 12, toY: 12
    }
    // Sample physical pixel centres, as Canvas nearest-neighbour blits do.
    // Inspect the displayed result rather than just the unscaled cache pixels.
    const screenPixels = () => {
      const pixels = new Uint32Array(160 * 160)
      for (const call of context.drawImage.mock.calls) {
        const [canvas, sx, sy, sw, sh, dx, dy, dw, dh] = call as unknown as [MockOffscreenCanvas, number, number, number, number, number, number, number, number]
        const words = new Uint32Array(canvas.pixels.buffer)
        for (let y = Math.max(0, Math.ceil(dy * scale.y - 0.5)); y < Math.min(160, Math.ceil((dy + dh) * scale.y - 0.5)); y++) {
          for (let x = Math.max(0, Math.ceil(dx * scale.x - 0.5)); x < Math.min(160, Math.ceil((dx + dw) * scale.x - 0.5)); x++) {
            const sourceX = Math.floor(sx + ((x + 0.5) / scale.x - dx) * sw / dw + 1e-10)
            const sourceY = Math.floor(sy + ((y + 0.5) / scale.y - dy) * sh / dh + 1e-10)
            pixels[y * 160 + x] = words[sourceY * canvas.width + sourceX]
          }
        }
      }
      return pixels
    }
    for (const y of [4, 6, 4]) {
      const target = { ...selection, y }
      const selectionPreview = { layerId: layer.id, source, target, angle: 0, copy: false }
      context.drawImage.mockClear()
      draw(cache, document, context, { ...options, selectionPreview })
      const moving = screenPixels()
      context.drawImage.mockClear()
      draw(cache, document, context, { ...options, selectionPreview })
      expect(screenPixels()).toEqual(moving) // Pointer released, preview still pending.
      const edit = applySelectionTranslationPreview(document, source, target, false, null, layer)
      context.drawImage.mockClear()
      draw(new CanvasCompositeCache(budget), document, context, options)
      const applied = screenPixels()
      restoreSelectionTranslationPreview(document, edit)
      expect(moving).toEqual(applied)
    }
  })
})

it.each([false, true])('refreshes the full styled selection trail and adjacent contents before apply (group=%s)', grouped => {
  const document = createDocument('styled selection trail', 24, 12, 'rgba')
  const layer = document.layers[0]
  const styles = createDefaultLayerStyles()
  styles.stroke.enabled = true
  styles.stroke.size = 2
  if (grouped) {
    layer.groupId = 'styled'
    document.groups.push({ id: 'styled', name: 'Styled', visible: true, locked: false, opacity: 1, blendMode: 'normal', layerStyles: styles })
  } else layer.layerStyles = styles
  for (const x of [3, 4, 10, 11, 18]) writeLayerColor(document, layer, 5 * 24 + x, { r: 200, g: 60, b: 90, a: 255 })
  const original = layer.pixels.slice()
  const selection = { x: 3, y: 5, width: 2, height: 1 }
  const source = captureSelectionTransform(document, selection, layer)!
  const cache = new CanvasCompositeCache(), context = makeContext()
  expect(cache.supportsSelectionPreview(document, 1, layer.id)).toBe(false)
  draw(cache, document, context)
  let previous = selection
  let preview: ReturnType<typeof applySelectionTranslationPreview> | null = null
  for (const x of [7, 9, 13, 17, -1, 22]) {
    const target = { ...selection, x }
    // Same invalidation sequence as the materialized drag path; the document
    // revision intentionally stays unchanged while the pointer is moving.
    for (const rect of [selection, previous, target]) cache.invalidateDocumentRect(rect, document, undefined, [layer.id])
    preview = applySelectionTranslationPreview(document, source, target, false, preview, layer)
    draw(cache, document, context)
    expect(drawnPixels(context)).toEqual(compositeRegion(document, 0, 0, 24, 12))
    previous = target
  }
  if (preview) restoreSelectionTranslationPreview(document, preview)
  for (const rect of [selection, previous]) cache.invalidateDocumentRect(rect, document, undefined, [layer.id])
  draw(cache, document, context)
  expect(drawnPixels(context)).toEqual(compositeRegion(document, 0, 0, 24, 12))
  expect(layer.pixels).toEqual(original)
})

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
  it('refreshes the canvas and preview after arrow nudges, Ctrl+D and undo', () => {
    const { document, layer, selection } = setup()
    const original = layer.pixels.slice()
    const consumers = [new CanvasCompositeCache(), new CanvasCompositeCache()].map(cache => ({ cache, context: makeContext() }))
    let livePreview: CanvasPreviewSnapshot | null = null
    const stopPreview = registerCanvasPreviewListener(document.id, snapshot => {
      if (!snapshot && livePreview) consumers[1].cache.invalidateAll()
      livePreview = snapshot
    })
    const paint = () => {
      const session = useWorkspace.getState().sessions[0]
      for (const [index, { cache, context }] of consumers.entries()) draw(cache, document, context, {
        revision: index === 1 && livePreview ? livePreview.revision : session.revision,
        contentRevision: index === 1 && livePreview ? livePreview.contentRevision : session.contentRevision,
        contentInvalidation: index === 1 && livePreview ? null : session.contentInvalidation
      })
    }
    paint()
    for (let i = 0; i < 8; i++) {
      useWorkspace.getState().moveActiveSelectionWithSelectionHistory(1, 0, true)
      const session = useWorkspace.getState().sessions[0]
      notifyCanvasPreview(document.id, { document, frameId: document.animation?.activeFrameId ?? 'static', revision: session.revision, contentRevision: session.contentRevision })
      paint()
    }
    expect(Array.from(drawnPixels(consumers[0].context).slice(32, 36))).toEqual([255, 0, 0, 255])
    useWorkspace.getState().commitFloatingPaste('Ctrl+D')
    paint()
    useWorkspace.getState().undo() // Restore the deselected box first.
    paint()
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ ...selection, x: 8 })
    useWorkspace.getState().undo() // Then roll back the grouped arrow movement.
    expect(layer.pixels).toEqual(original)
    expect(useWorkspace.getState().sessions[0].contentInvalidation?.kind).toBe('full')
    paint()
    for (const { context } of consumers) {
      expect(drawnPixels(context)).toEqual(original)
    }
    useWorkspace.getState().redo()
    paint()
    for (const { context } of consumers) expect(Array.from(drawnPixels(context).slice(32, 36))).toEqual([255, 0, 0, 255])
    stopPreview()
  })

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
