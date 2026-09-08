import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compositeRegion, createDocument, createLayer, createLayerMask, DocumentCompositeCache, readLayerColor, writeLayerColor } from '@/core/document'
import { ensureAnimationDocument } from '@/core/animation'
import { brushStrokeInvalidationRects, captureSelectionTransform, paintBrush, paintLine, solidBrushStampDifferenceRects, type SelectionTransformSource } from '@/core/tools'
import { beginPixelEdit, commitPixelEdit } from '@/core/history'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { registerInitialDocumentComposite, registerPendingInitialDocumentComposite } from '@/core/initial-document-composite'
import { deviceAlignedCanvasRect } from '@/core/canvas-render-plan'
import { CanvasCompositeCache } from './canvas-composite-cache'
import { installRuntimeRaster } from '@/core/runtime-raster'

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

class MockImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}

const view = (overrides: Record<string, unknown> = {}) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
  mirrored: false,
  mirroredVertical: false,
  showGrid: false,
  relativeLuminance: false,
  ...overrides
})

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
  view: view(overrides.view as Record<string, unknown> | undefined),
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
  ...overrides,
  ...(overrides.view ? { view: view(overrides.view as Record<string, unknown>) } : {})
})

beforeEach(() => {
  MockOffscreenCanvas.instances = []
  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas)
  vi.stubGlobal('ImageData', MockImageData)
})

afterEach(() => vi.unstubAllGlobals())

describe('CanvasCompositeCache', () => {
  it('shows a moved layer across enabled tile-repeat boundaries', () => {
    const document = createDocument('repeated moved layer', 4, 1, 'rgba')
    const moving = createLayer('moving', 4, 1, 'rgba')
    document.layers.push(moving)
    writeLayerColor(document, moving, 3, { r: 255, g: 0, b: 0, a: 255 })
    moving.offsetX = 1
    const context = makeContext()

    draw(new CanvasCompositeCache(), document, context, { movingLayerIds: [moving.id], view: view({ zoom: 8, tileRepeatMode: 'x' }) })

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const pixels = surface.context.putImageData.mock.calls.at(-1)?.[0] as MockImageData
    expect(Array.from(pixels.data.slice(0, 4))).toEqual([255, 0, 0, 255])
  })

  it('renders a second pencil stroke in a transparent area', () => {
    const document = createDocument('transparent second stroke', 16, 16, 'rgba')
    const layer = document.layers[0]
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    const paint = (x: number, y: number, revision: number) => {
      const edit = beginPixelEdit(layer.id)
      paintBrush(document, layer, edit, x, y, 1, { r: 0, g: 96, b: 255, a: 255 }, 'square')
      commitPixelEdit(document, edit, 'pencil')
      const frameId = document.animation?.activeFrameId ?? 'static'
      cache.invalidateDocumentRect(edit.dirtyRect, document, frameId, [layer.id])
      draw(cache, document, context, { revision, contentRevision: revision, contentInvalidation: { kind: 'region', fromRevision: revision - 1, revision, frameId, rect: edit.dirtyRect } })
    }
    paint(2, 2, 1)
    paint(12, 12, 2)
    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(Array.from(surface.pixels.slice((12 * 16 + 12) * 4, (12 * 16 + 12) * 4 + 4))).toEqual([0, 96, 255, 255])
  })

  it('does not publish a bitmap captured before a brush invalidation', async () => {
    const document = createDocument('stale brush bitmap', 256, 256, 'rgba')
    const layer = document.layers[0]
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    const pending: Array<(bitmap: MockOffscreenCanvas) => void> = []
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<MockOffscreenCanvas>((resolve) => {
      pending.push(resolve)
    })))
    const frameId = document.animation?.activeFrameId ?? 'static'

    draw(cache, document, context)
    expect(pending).toHaveLength(1)

    const edit = beginPixelEdit(layer.id)
    paintBrush(document, layer, edit, 64, 64, 128, { r: 255, g: 64, b: 32, a: 255 }, 'square')
    cache.invalidateDocumentRect(edit.dirtyRect, document, frameId, [layer.id])
    draw(cache, document, context, {
      revision: 2,
      contentRevision: 2,
      contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, frameId, rect: edit.dirtyRect }
    })

    const stale = new MockOffscreenCanvas(256, 256)
    pending[0](stale)
    await Promise.resolve()
    const surfaces = (cache as unknown as { surfaces: Map<string, { bitmap?: unknown }> }).surfaces
    expect([...surfaces.values()][0]?.bitmap).toBeUndefined()
  })

  it('batches fragmented large-brush edges into one local surface upload', () => {
    const document = createDocument('large brush upload batching', 256, 256, 'rgba')
    const layer = document.layers[0]
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    const frameId = document.animation?.activeFrameId ?? 'static'
    draw(cache, document, context)

    const initialEdit = beginPixelEdit(layer.id)
    paintBrush(document, layer, initialEdit, 96, 96, 128, { r: 41, g: 121, b: 255, a: 255 }, 'round')
    cache.invalidateDocumentRect(initialEdit.dirtyRect, document, frameId, [layer.id])
    draw(cache, document, context)

    const edit = beginPixelEdit(layer.id)
    paintLine(document, layer, edit, 96, 96, 98, 98, 128, { r: 41, g: 121, b: 255, a: 255 }, null, 'round')
    const fragments = solidBrushStampDifferenceRects({ x: 96, y: 96 }, { x: 98, y: 98 }, 128, 'round')
    expect(fragments.length).toBeGreaterThan(1)
    for (const rect of fragments) cache.invalidateDocumentRect(rect, document, frameId, [layer.id])

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const uploadsBefore = surface.context.putImageData.mock.calls.length
    draw(cache, document, context)
    expect(surface.context.putImageData.mock.calls.length - uploadsBefore).toBe(1)

    const expected = compositeRegion(document, 0, 0, document.width, document.height, new DocumentCompositeCache(), 1)
    expect(Array.from(surface.pixels)).toEqual(Array.from(expected))
  })

  it('reuses the live surface when a large stroke is committed', () => {
    const document = createDocument('commit live surface', 256, 256, 'rgba')
    const layer = document.layers[0]
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    const frameId = document.animation?.activeFrameId ?? 'static'

    draw(cache, document, context)
    const edit = beginPixelEdit(layer.id)
    paintLine(document, layer, edit, 64, 64, 192, 64, 128, { r: 255, g: 64, b: 32, a: 255 })
    cache.invalidateDocumentRect(edit.dirtyRect, document, frameId, [layer.id])
    draw(cache, document, context)
    const entry = commitPixelEdit(document, edit, 'brush')
    expect(entry).not.toBeNull()
    cache.retainLivePreview(document, frameId)
    const beforeUploads = (context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas).context.putImageData.mock.calls.length
    draw(cache, document, context, {
      revision: 2,
      contentRevision: 2,
      contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, frameId, rect: edit.dirtyRect }
    })
    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const uploads = surface.context.putImageData.mock.calls.slice(beforeUploads)
    expect(uploads).toHaveLength(0)
    expect(Array.from(surface.pixels.slice((64 * document.width + 64) * 4, (64 * document.width + 64) * 4 + 4))).toEqual([255, 64, 32, 255])
  })

  it('renders a live stroke after a sparse runtime layer is materialized', () => {
    const document = createDocument('sparse live stroke', 4, 4, 'rgba')
    const layer = document.layers[0]
    const tileSize = 2
    const data = new Uint8Array(tileSize * tileSize * 4)
    data.set([255, 0, 0, 255], 0)
    installRuntimeRaster(layer, {
      kind: 'sparse-tiles-v1', format: 'rgba', width: 4, height: 4, tileSize,
      tileOffsets: Int32Array.from([1, 0, 0, 0]), data
    })
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    draw(cache, document, context, { revision: 1, contentRevision: 1 })
    const edit = beginPixelEdit(layer.id)
    paintBrush(document, layer, edit, 3, 3, 1, { r: 0, g: 96, b: 255, a: 255 }, 'square')
    const frameId = document.animation?.activeFrameId ?? 'static'
    cache.invalidateDocumentRect(edit.dirtyRect, document, frameId, [layer.id])
    draw(cache, document, context, { revision: 1, contentRevision: 1 })
    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(Array.from(surface.pixels.slice((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 4))).toEqual([0, 96, 255, 255])
  })

  it('recomposes an undo after a live preview on a cached surface', () => {
    const document = createDocument('undo after live preview', 4, 4, 'rgba')
    const layer = document.layers[0]
    const cache = new CanvasCompositeCache(4 * 4 * 4)
    const context = makeContext()
    const frameId = document.animation?.activeFrameId ?? 'static'

    draw(cache, document, context, { revision: 1, contentRevision: 1 })

    const edit = beginPixelEdit(layer.id)
    paintBrush(document, layer, edit, 1, 1, 1, { r: 255, g: 0, b: 0, a: 255 }, 'square')
    cache.invalidateDocumentRect(edit.dirtyRect, document, frameId, [layer.id])
    draw(cache, document, context, { revision: 1, contentRevision: 1 })

    const entry = commitPixelEdit(document, edit, 'pencil')
    expect(entry).not.toBeNull()
    entry!.undo()
    draw(cache, document, context, {
      revision: 2,
      contentRevision: 2,
      contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, frameId, rect: edit.dirtyRect }
    })

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const pixelOffset = (1 * document.width + 1) * 4
    expect(Array.from(surface.pixels.slice(pixelOffset, pixelOffset + 4))).toEqual([0, 0, 0, 0])
  })

  it('clips the composite to device-aligned canvas boundaries', () => {
    const document = createDocument('aligned canvas clip', 4, 4, 'rgba')
    const context = makeContext()
    const cache = new CanvasCompositeCache()
    const geometry = { originX: 10.2, originY: 5.1, canvasWidth: 12.3, canvasHeight: 13.7, devicePixelRatio: 1.5 }

    draw(cache, document, context, {
      ...geometry,
      view: view({ zoom: 3.075 }),
      fromX: 0,
      fromY: 0,
      toX: document.width,
      toY: document.height
    })

    const boundary = deviceAlignedCanvasRect(geometry.originX, geometry.originY, geometry.canvasWidth, geometry.canvasHeight, geometry.devicePixelRatio)
    expect(context.rect).toHaveBeenCalledWith(boundary.left, boundary.top, boundary.width, boundary.height)

    // The cache clips to the complete canvas, but only draws the visible
    // document region. Assert that this destination is aligned independently
    // from the outer canvas boundary.
    const visibleBoundary = deviceAlignedCanvasRect(
      geometry.originX,
      geometry.originY,
      document.width * 3.075,
      document.height * 3.075,
      geometry.devicePixelRatio
    )
    const drawCalls = context.drawImage.mock.calls
    expect(drawCalls.length).toBeGreaterThan(1)
    expect(drawCalls.reduce((area, call) => area + (call[3] as number) * (call[4] as number), 0)).toBe(document.width * document.height)
    expect(drawCalls.every((call) => call.slice(3, 5).every((size) => Number.isInteger(size) && size > 0))).toBe(true)
    const destinationRects = drawCalls.map((call) => ({
      left: call[5] as number,
      top: call[6] as number,
      right: (call[5] as number) + (call[7] as number),
      bottom: (call[6] as number) + (call[8] as number)
    }))
    expect(Math.min(...destinationRects.map((rect) => rect.left))).toBe(visibleBoundary.left)
    expect(Math.min(...destinationRects.map((rect) => rect.top))).toBe(visibleBoundary.top)
    expect(Math.max(...destinationRects.map((rect) => rect.right))).toBe(visibleBoundary.right)
    expect(Math.max(...destinationRects.map((rect) => rect.bottom))).toBe(visibleBoundary.bottom)
  })

  it('uses one bitmap blit during a fractional zoom preview', () => {
    const document = createDocument('fractional zoom preview', 32, 32, 'rgba')
    const context = makeContext()

    draw(new CanvasCompositeCache(), document, context, {
      view: view({ zoom: 4.125 }),
      canvasWidth: document.width * 4.125,
      canvasHeight: document.height * 4.125,
      imageSmoothingEnabled: false,
      fastViewPreview: true,
      devicePixelRatio: 1.5
    })

    // The committed pixel-aligned path intentionally splits the image into
    // many runs. Interactive zoom/pan must stay a single drawImage call so
    // the browser can keep the UI responsive at high magnifications.
    expect(context.drawImage).toHaveBeenCalledOnce()
  })

  it('composites supported animation frames through Canvas2D layer sources', () => {
    const document = createDocument('gpu animation frame', 4, 4, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 5, { r: 24, g: 96, b: 220, a: 255 })
    const context = makeContext()

    draw(new CanvasCompositeCache(), document, context, { animationPlayback: true })

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(surface.context.drawImage).toHaveBeenCalled()
    expect(Array.from(surface.pixels.slice(5 * 4, 5 * 4 + 4))).toEqual([24, 96, 220, 255])
  })

  it('shares a completed animation frame between canvas consumers', () => {
    const document = createDocument('shared animation frame', 4, 4, 'rgba')
    writeLayerColor(document, document.layers[0], 6, { r: 180, g: 40, b: 90, a: 255 })
    const editorContext = makeContext()
    const previewContext = makeContext()

    draw(new CanvasCompositeCache(), document, editorContext, { animationPlayback: true })
    draw(new CanvasCompositeCache(), document, previewContext, { animationPlayback: true })

    expect(previewContext.drawImage.mock.calls.at(-1)?.[0]).toBe(editorContext.drawImage.mock.calls.at(-1)?.[0])
  })

  it('bounds committed fractional blits for large visible regions', () => {
    const document = createDocument('large fractional region', 256, 256, 'rgba')
    const context = makeContext()

    draw(new CanvasCompositeCache(), document, context, {
      view: view({ zoom: 4.125 }),
      canvasWidth: document.width * 4.125,
      canvasHeight: document.height * 4.125,
      imageSmoothingEnabled: false,
      devicePixelRatio: 1.5
    })

    // The exact run path is retained for small regions, but a large viewport
    // must never create a rows×columns storm of drawImage calls.
    expect(context.drawImage).toHaveBeenCalledOnce()
  })

  it('keeps rotated fractional zoom contiguous after the preview commits', () => {
    const document = createDocument('rotated fractional zoom', 32, 32, 'rgba')
    const context = makeContext()

    draw(new CanvasCompositeCache(), document, context, {
      view: view({ zoom: 4.125, rotation: 37 }),
      canvasWidth: document.width * 4.125,
      canvasHeight: document.height * 4.125,
      imageSmoothingEnabled: false,
      devicePixelRatio: 1.5
    })

    // Pixel-run alignment is an axis-aligned optimization. Applying it
    // before the outer rotation creates a seam at every run boundary.
    expect(context.drawImage).toHaveBeenCalledOnce()
  })

  it('keeps a moved selection preview separate from document pixels', () => {
    const document = createDocument('selection preview', 6, 2, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 1, { r: 255, g: 0, b: 0, a: 128 })
    const source = captureSelectionTransform(document, { x: 1, y: 0, width: 1, height: 1 }, layer)!
    const before = readLayerColor(document, layer, 1)
    const context = makeContext()

    draw(new CanvasCompositeCache(), document, context, {
      view: view({ zoom: 16 }),
      canvasWidth: 96,
      canvasHeight: 32,
      selectionPreview: { layerId: layer.id, source, target: { x: 4, y: 0, width: 1, height: 1 }, angle: 0, copy: false }
    })

    expect(readLayerColor(document, layer, 1)).toEqual(before)
    expect(context.drawImage).toHaveBeenCalledOnce()
  })

  it('clears the visible tail of an off-canvas preview before centering it', () => {
    const document = createDocument('gif off-canvas selection preview', 8, 1, 'rgba')
    ensureAnimationDocument(document)
    const layer = document.layers[0]
    writeLayerColor(document, layer, 1, { r: 255, g: 0, b: 0, a: 255 })
    writeLayerColor(document, layer, 2, { r: 0, g: 80, b: 255, a: 255 })
    writeLayerColor(document, layer, 3, { r: 0, g: 200, b: 80, a: 255 })
    const source = captureSelectionTransform(document, { x: 1, y: 0, width: 3, height: 1 }, layer)!
    const cache = new CanvasCompositeCache()
    const context = makeContext()

    draw(cache, document, context, {
      selectionPreview: { layerId: layer.id, source, target: { x: -1, y: 0, width: 3, height: 1 }, angle: 0, copy: false }
    })
    draw(cache, document, context, {
      selectionPreview: { layerId: layer.id, source, target: { x: 3, y: 0, width: 3, height: 1 }, angle: 0, copy: false }
    })

    const preview = (cache as unknown as { selectionPreview?: { canvas: MockOffscreenCanvas } }).selectionPreview
    if (!preview) throw new Error('selection preview surface was not created')
    expect(Array.from(preview.canvas.pixels.slice(0, 4))).toEqual([0, 0, 0, 0])
    expect(Array.from(preview.canvas.pixels.slice(3 * 4, 4 * 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(preview.canvas.pixels.slice(4 * 4, 5 * 4))).toEqual([0, 80, 255, 255])
    expect(Array.from(preview.canvas.pixels.slice(5 * 4, 6 * 4))).toEqual([0, 200, 80, 255])
  })

  it('keeps selection previews available when the active layer has styles', () => {
    const document = createDocument('styled selection preview', 6, 2, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 1, { r: 255, g: 0, b: 0, a: 255 })
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    const cache = new CanvasCompositeCache()
    const source = captureSelectionTransform(document, { x: 1, y: 0, width: 1, height: 1 }, layer)!

    expect(cache.supportsSelectionPreview(document, 1, layer.id)).toBe(true)

    draw(cache, document, makeContext(), {
      view: view({ zoom: 16 }),
      canvasWidth: 96,
      canvasHeight: 32,
      selectionPreview: { layerId: layer.id, source, target: { x: 4, y: 0, width: 1, height: 1 }, angle: 0, copy: false }
    })
  })

  it('refreshes styled pixels during a live stroke without a document revision change', () => {
    const document = createDocument('styled live stroke', 6, 2, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    const compositeCache = new DocumentCompositeCache()
    compositeRegion(document, 0, 0, document.width, document.height, compositeCache, 1)

    layer.pixels[4 * 4] = 0
    layer.pixels[4 * 4 + 1] = 96
    layer.pixels[4 * 4 + 2] = 255
    layer.pixels[4 * 4 + 3] = 255
    const output = compositeRegion(document, 0, 0, document.width, document.height, compositeCache, 1, undefined, { x: 4, y: 0, width: 1, height: 1 })

    expect(Array.from(output.slice(4 * 4, 4 * 4 + 4))).toEqual([0, 96, 255, 255])
  })

  it('refreshes a cached styled surface after a live stroke invalidation', () => {
    const document = createDocument('styled live surface', 6, 2, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    const cache = new CanvasCompositeCache()
    const context = makeContext()

    draw(cache, document, context)
    layer.pixels[4 * 4] = 0
    layer.pixels[4 * 4 + 1] = 96
    layer.pixels[4 * 4 + 2] = 255
    layer.pixels[4 * 4 + 3] = 255
    const frameId = document.animation?.activeFrameId ?? 'static'
    cache.invalidateDocumentRect({ x: 4, y: 0, width: 1, height: 1 }, document, frameId, [layer.id])
    draw(cache, document, context)

    const pixels = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const patchCall = pixels.context.putImageData.mock.calls.at(-1) as [MockImageData, number, number]
    const [patch, x, y] = patchCall
    expect({ width: patch.width, height: patch.height, x, y }).toEqual({ width: 3, height: 2, x: 3, y: 0 })
    expect(Array.from(patch.data.slice(4, 8))).toEqual([0, 96, 255, 255])
  })

  it('forwards a live source region to a preview cache without rebuilding its surface', () => {
    const document = createDocument('live preview invalidation', 8, 8, 'rgba')
    const layer = document.layers[0]
    const sourceCache = new CanvasCompositeCache()
    const previewCache = new CanvasCompositeCache()
    const sourceContext = makeContext()
    const previewContext = makeContext()
    const frameId = document.animation?.activeFrameId ?? 'static'

    draw(sourceCache, document, sourceContext)
    draw(previewCache, document, previewContext)
    const previewSurface = previewContext.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas

    writeLayerColor(document, layer, 3 * document.width + 4, { r: 0, g: 96, b: 255, a: 255 })
    sourceCache.invalidateDocumentRect({ x: 4, y: 3, width: 1, height: 1 }, document, frameId, [layer.id])
    draw(sourceCache, document, sourceContext)

    const invalidation = sourceCache.consumePreviewInvalidation(frameId)
    expect(invalidation).toEqual({ kind: 'region', rect: { x: 4, y: 3, width: 1, height: 1 } })
    if (invalidation?.kind === 'region') previewCache.invalidateDocumentRect(invalidation.rect, document, frameId)
    draw(previewCache, document, previewContext)

    const updatedSurface = previewContext.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(updatedSurface).toBe(previewSurface)
    expect(Array.from(updatedSurface.pixels.slice((3 * document.width + 4) * 4, (3 * document.width + 4) * 4 + 4))).toEqual([0, 96, 255, 255])
  })

  it('forwards an explicit full invalidation once', () => {
    const cache = new CanvasCompositeCache()

    cache.invalidateAll()

    expect(cache.consumePreviewInvalidation()).toEqual({ kind: 'full' })
    expect(cache.consumePreviewInvalidation()).toBeNull()
  })

  it('does not reuse a pending worker snapshot after the first edit', () => {
    const document = createDocument('edited while initial composite pending', 2, 1, 'rgba')
    const layer = document.layers[0]
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    const frameId = document.animation?.activeFrameId ?? 'static'
    registerPendingInitialDocumentComposite(document, new Promise<void>(() => undefined), frameId)

    draw(cache, document, context, { contentRevision: 0, revision: 0 })
    writeLayerColor(document, layer, 0, { r: 0, g: 96, b: 255, a: 255 })
    cache.invalidateDocumentRect({ x: 0, y: 0, width: 1, height: 1 }, document, frameId, [layer.id])

    // Simulate the worker completing with the stale pre-edit snapshot.
    registerInitialDocumentComposite(document, new Uint8ClampedArray(2 * 4), frameId)
    draw(cache, document, context, { contentRevision: 0, revision: 0 })

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(Array.from(surface.pixels.slice(0, 4))).toEqual([0, 96, 255, 255])
  })

  it('refreshes the same styled surface for consecutive live strokes', () => {
    const document = createDocument('consecutive styled live strokes', 96, 96, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.innerGlow = { ...layer.layerStyles.innerGlow, enabled: true, size: 3 }
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    const frameId = document.animation?.activeFrameId ?? 'static'

    draw(cache, document, context)

    const firstEdit = beginPixelEdit(layer.id)
    paintLine(document, layer, firstEdit, 20, 48, 76, 48, 9, { r: 255, g: 0, b: 0, a: 255 })
    cache.invalidateDocumentRect(firstEdit.dirtyRect, document, frameId, [layer.id])
    draw(cache, document, context)

    const secondEdit = beginPixelEdit(layer.id)
    paintLine(document, layer, secondEdit, 48, 20, 48, 76, 9, { r: 0, g: 96, b: 255, a: 255 })
    cache.invalidateDocumentRect(secondEdit.dirtyRect, document, frameId, [layer.id])
    draw(cache, document, context)

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const actual = surface.pixels
    const expected = compositeRegion(document, 0, 0, document.width, document.height, new DocumentCompositeCache(), 1)
    expect(Array.from(actual)).toEqual(Array.from(expected))
    const centerOffset = (48 * document.width + 48) * 4
    expect(Array.from(actual.slice(centerOffset, centerOffset + 4))).toEqual([0, 96, 255, 255])
  })

  it('rebuilds styled pixels after full invalidation between live strokes', () => {
    const document = createDocument('full styled invalidation', 96, 96, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.innerGlow = { ...layer.layerStyles.innerGlow, enabled: true, size: 3 }
    const cache = new CanvasCompositeCache()
    const context = makeContext()

    const paintStroke = (from: { x: number; y: number }, to: { x: number; y: number }, color: { r: number; g: number; b: number; a: number }): void => {
      const edit = beginPixelEdit(layer.id)
      paintLine(document, layer, edit, from.x, from.y, to.x, to.y, 9, color)
      cache.invalidateAll()
      draw(cache, document, context, { contentRevision: 0, revision: 0 })
    }

    draw(cache, document, context, { contentRevision: 0, revision: 0 })
    paintStroke({ x: 20, y: 48 }, { x: 76, y: 48 }, { r: 255, g: 0, b: 0, a: 255 })
    paintStroke({ x: 48, y: 20 }, { x: 48, y: 76 }, { r: 0, g: 96, b: 255, a: 255 })

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const expected = compositeRegion(document, 0, 0, document.width, document.height, new DocumentCompositeCache(), 1)
    expect(Array.from(surface.pixels)).toEqual(Array.from(expected))
  })

  it('refreshes styled pixels when consecutive strokes use the real brush invalidation path', () => {
    const document = createDocument('real brush invalidation', 96, 96, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.innerGlow = { ...layer.layerStyles.innerGlow, enabled: true, size: 3 }
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    const frameId = document.animation?.activeFrameId ?? 'static'

    draw(cache, document, context, { contentRevision: 0, revision: 0 })

    const paintStroke = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      color: { r: number; g: number; b: number; a: number },
      contentRevision: number,
      invalidationRevision: number
    ): void => {
      const edit = beginPixelEdit(layer.id)
      paintLine(document, layer, edit, from.x, from.y, to.x, to.y, 9, color)
      for (const rect of brushStrokeInvalidationRects(from, to, 9, null, document.width, document.height)) {
        cache.invalidateDocumentRect(rect, document, frameId, [layer.id])
      }
      draw(cache, document, context, {
        contentRevision,
        revision: contentRevision,
        contentInvalidation: {
          kind: 'region',
          fromRevision: invalidationRevision - 1,
          revision: invalidationRevision,
          frameId,
          rect: edit.dirtyRect
        }
      })
    }

    paintStroke({ x: 20, y: 48 }, { x: 76, y: 48 }, { r: 255, g: 0, b: 0, a: 255 }, 0, 0)
    paintStroke({ x: 48, y: 20 }, { x: 48, y: 76 }, { r: 0, g: 96, b: 255, a: 255 }, 1, 1)

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const expected = compositeRegion(document, 0, 0, document.width, document.height, new DocumentCompositeCache(), 1)
    expect(Array.from(surface.pixels)).toEqual(Array.from(expected))
    const centerOffset = (48 * document.width + 48) * 4
    expect(Array.from(surface.pixels.slice(centerOffset, centerOffset + 4))).toEqual([0, 96, 255, 255])
  })

  it('refreshes every visible styled block for consecutive strokes', () => {
    const styleCases = [
      { name: 'stroke', apply: (styles: ReturnType<typeof createDefaultLayerStyles>) => ({
        ...styles,
        stroke: { ...styles.stroke, enabled: true, size: 2 }
      }) },
      { name: 'shadow', apply: (styles: ReturnType<typeof createDefaultLayerStyles>) => ({
        ...styles,
        shadow: { ...styles.shadow, enabled: true, offsetX: 2, offsetY: 2, blur: 2 }
      }) },
      { name: 'inner glow', apply: (styles: ReturnType<typeof createDefaultLayerStyles>) => ({
        ...styles,
        innerGlow: { ...styles.innerGlow, enabled: true, size: 3 }
      }) },
      { name: 'combined', apply: (styles: ReturnType<typeof createDefaultLayerStyles>) => ({
        ...styles,
        stroke: { ...styles.stroke, enabled: true, size: 2 },
        shadow: { ...styles.shadow, enabled: true, offsetX: 2, offsetY: 2, blur: 2 },
        innerGlow: { ...styles.innerGlow, enabled: true, size: 3 }
      }) }
    ]

    for (const styleCase of styleCases) {
      const document = createDocument(`styled ${styleCase.name}`, 96, 96, 'rgba')
      const layer = document.layers[0]
      layer.layerStyles = styleCase.apply(createDefaultLayerStyles())
      const cache = new CanvasCompositeCache()
      const context = makeContext()
      const frameId = document.animation?.activeFrameId ?? 'static'
      draw(cache, document, context, { contentRevision: 0, revision: 0 })

      const paintStroke = (from: { x: number; y: number }, to: { x: number; y: number }, color: { r: number; g: number; b: number; a: number }, contentRevision: number): void => {
        const edit = beginPixelEdit(layer.id)
        paintLine(document, layer, edit, from.x, from.y, to.x, to.y, 9, color)
        for (const rect of brushStrokeInvalidationRects(from, to, 9, null, document.width, document.height)) {
          cache.invalidateDocumentRect(rect, document, frameId, [layer.id])
        }
        draw(cache, document, context, {
          contentRevision,
          revision: contentRevision,
          contentInvalidation: contentRevision > 0
            ? { kind: 'region', fromRevision: contentRevision - 1, revision: contentRevision, frameId, rect: edit.dirtyRect }
            : null
        })
      }

      paintStroke({ x: 20, y: 48 }, { x: 76, y: 48 }, { r: 255, g: 0, b: 0, a: 255 }, 0)
      paintStroke({ x: 48, y: 20 }, { x: 48, y: 76 }, { r: 0, g: 96, b: 255, a: 255 }, 1)

      const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
      const expected = compositeRegion(document, 0, 0, document.width, document.height, new DocumentCompositeCache(), 1)
      expect(Array.from(surface.pixels), styleCase.name).toEqual(Array.from(expected))
    }
  })

  it('keeps selection previews continuous across tile-repeat seams', () => {
    const document = createDocument('repeated selection preview', 4, 1, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 3, { r: 255, g: 0, b: 0, a: 255 })
    const source = captureSelectionTransform(document, { x: 3, y: 0, width: 1, height: 1 }, layer)!
    const context = makeContext()

    draw(new CanvasCompositeCache(), document, context, {
      view: view({ zoom: 8, tileRepeatMode: 'x' }),
      canvasWidth: 32,
      canvasHeight: 8,
      selectionPreview: { layerId: layer.id, source, target: { x: 4, y: 0, width: 1, height: 1 }, angle: 0, copy: false }
    })

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const patches = surface.context.putImageData.mock.calls.map(([patch, x, y]) => ({ patch: patch as MockImageData, x, y }))
    expect(patches.some(({ patch, x, y }) => x === 0 && y === 0 && Array.from(patch.data).slice(0, 4).every((value, index) => value === [255, 0, 0, 255][index]))).toBe(true)
  })

  it('renders clipboard pixels without mutating the source document', () => {
    const document = createDocument('clipboard preview', 4, 1, 'rgba')
    const layer = document.layers[0]
    const source: SelectionTransformSource = {
      selection: { x: 0, y: 0, width: 1, height: 1 },
      values: Uint32Array.from([0xff0000ff]),
      selectedOffsets: new Uint32Array(0),
      opaqueOffsets: new Uint32Array(0),
      opaqueIndices: new Uint32Array(0),
      opaqueValues: new Uint32Array(0),
      origin: 'clipboard'
    }
    const context = makeContext()

    draw(new CanvasCompositeCache(), document, context, {
      selectionPreview: { layerId: layer.id, source, target: { x: 2, y: 0, width: 1, height: 1 }, angle: 0, copy: true }
    })

    expect(readLayerColor(document, layer, 2)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(surface.context.putImageData).toHaveBeenCalled()
  })





  it('refreshes a stale invalidation at the actual pasted pixel', () => {
    const document = createDocument('stale invalidation', 8, 8, 'rgba')
    const layer = document.layers[0]
    const context = makeContext()
    const cache = new CanvasCompositeCache()
    draw(cache, document, context)

    writeLayerColor(document, layer, 5 * document.width + 6, { r: 0, g: 96, b: 255, a: 255 })
    draw(cache, document, context, {
      contentRevision: 2,
      contentInvalidation: { kind: 'region', fromRevision: 0, revision: 1, rect: { x: 1, y: 1, width: 1, height: 1 } }
    })

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    const pixels = surface.context.putImageData.mock.calls.at(-1)?.[0] as MockImageData
    const offset = (5 * document.width + 6) * 4
    expect(Array.from(pixels.data.slice(offset, offset + 4))).toEqual([0, 96, 255, 255])
  })
})
