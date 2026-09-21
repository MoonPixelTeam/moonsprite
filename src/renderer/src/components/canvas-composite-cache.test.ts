import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compositeRegion, createDocument, createLayer, createLayerMask, DocumentCompositeCache, readLayerColorAt, readLayerColor, writeLayerColor } from '@/core/document'
import { animationCelKey, ensureAnimationDocument, setAnimationCelOffsetsForKeys } from '@/core/animation'
import { brushStrokeInvalidationRects, captureSelectionTransform, paintBrush, paintLine, solidBrushStampDifferenceRects, type SelectionTransformSource } from '@/core/tools'
import { beginPixelEdit, commitPixelEdit } from '@/core/history'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { registerInitialDocumentComposite, registerPendingInitialDocumentComposite } from '@/core/initial-document-composite'
import { deviceAlignedCanvasRect, deviceAlignedDocumentRect } from '@/core/canvas-render-plan'
import { useWorkspace } from '@/store/workspace'
import { CanvasCompositeCache, canvasCompositeCacheFor, releaseCanvasCompositeCache } from './canvas-composite-cache'
import { installRuntimeRaster } from '@/core/runtime-raster'
import { BLEND_MODES } from '@shared/types-color'
import { applyGradient } from '@/core/gradient'
import { filledShapePathPixelPoints, paintShapePixelPoints } from '@/core/tools-shapes'
import { invalidateRasterContentBounds } from '@/core/document-model'
import { gpuBlendModeFor } from './canvas-composite-cache-surfaces'
import { createStrokeCanvasInput } from './canvas-input-stroke'
import * as selectionRaster from '@/core/tools-selection-transform-raster'
import { blendOver } from '@/core/raster'

class MockOffscreenCanvas {
  static instances: MockOffscreenCanvas[] = []
  pixels: Uint8ClampedArray
  get width() { return this.canvasWidth }
  set width(value: number) { this.canvasWidth = value; this.pixels = new Uint8ClampedArray(value * this.canvasHeight * 4) }
  get height() { return this.canvasHeight }
  set height(value: number) { this.canvasHeight = value; this.pixels = new Uint8ClampedArray(this.canvasWidth * value * 4) }
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
    setTransform: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low'
  }
  constructor(private canvasWidth: number, private canvasHeight: number) {
    this.pixels = new Uint8ClampedArray(canvasWidth * canvasHeight * 4)
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

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('CanvasCompositeCache', () => {
  it.each([1, 0.6])('preserves the lower-half circle move on apply at opacity %s', opacity => {
    useWorkspace.setState({ sessions: [], activeId: null, message: null })
    const document = createDocument('lower half moved up', 12, 12, 'rgba')
    const layer = document.layers[0]
    layer.opacity = opacity
    const color = { r: 80, g: 100, b: 130, a: 64 }
    const clear = { r: 0, g: 0, b: 0, a: 0 }
    const original = Array.from({ length: 144 }, (_, i) =>
      (i % 12 - 5.5) ** 2 + (Math.floor(i / 12) - 5.5) ** 2 <= 25 ? color : clear)
    original.forEach((pixel, i) => writeLayerColor(document, layer, i, pixel))
    useWorkspace.getState().addSession(document)
    const selection = { x: 0, y: 6, width: 12, height: 6 }
    const target = { ...selection, y: 4 }
    useWorkspace.getState().setSelection(selection)
    const source = captureSelectionTransform(document, selection, layer)!
    const cache = new CanvasCompositeCache(), context = makeContext()
    let displayed: Uint8ClampedArray = new Uint8ClampedArray()
    for (const y of [4, 3, 4]) {
      draw(cache, document, context, { selectionPreview: { layerId: layer.id, source, target: { ...target, y }, angle: 0, copy: false } })
      displayed = (context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels.slice()
    }
    useWorkspace.getState().beginFloatingSelectionTransform(source, null, selection, target, false, 'move lower half', null, target, 0, undefined, true)
    useWorkspace.getState().commitFloatingPaste()
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const base = y < 6 ? original[y * 12 + x] : clear
      const top = y >= 4 && y < 10 ? original[(y + 2) * 12 + x] : clear
      expect(readLayerColorAt(document, layer, x, y)).toEqual(blendOver(base, top))
    }
    // Only the two-row overlap band darkens; the moved lower half stays at 64.
    expect(readLayerColorAt(document, layer, 5, 4).a).toBe(112)
    expect(readLayerColorAt(document, layer, 5, 7).a).toBe(64)
    expect(readLayerColorAt(document, layer, 5, 10).a).toBe(0)
    expect(displayed).toEqual(compositeRegion(document, 0, 0, 12, 12, new DocumentCompositeCache(), 2))
    useWorkspace.getState().undo()
    original.forEach((pixel, i) => expect(readLayerColorAt(document, layer, i % 12, Math.floor(i / 12))).toEqual(pixel))
    useWorkspace.getState().redo()
    expect(displayed).toEqual(compositeRegion(document, 0, 0, 12, 12, new DocumentCompositeCache(), 3))
  })

  it('shares an existing preview bootstrap without compositing and reports unrendered offscreen damage', () => {
    const document = createDocument('shared preview', 16, 16, 'rgba', false)
    const cache = new CanvasCompositeCache()
    expect(cache.previewSource(document, 'frame-1', 1, false)).toBeNull()
    draw(cache, document, makeContext(), { frameId: 'frame-1' })
    const composite = vi.spyOn(DocumentCompositeCache.prototype, 'normalLayersFor')
    expect(cache.previewSource(document, 'frame-1', 1, false)?.source).toBeDefined()
    expect(cache.previewSource(document, 'frame-1', 2, false)).toBeNull()
    expect(cache.previewSource(document, 'frame-2', 1, false)).toBeNull()
    expect(cache.previewSource(document, 'frame-1', 1, true)).toBeNull()
    const rect = { x: 12, y: 12, width: 2, height: 2 }
    cache.invalidateDocumentRect(rect, document, 'frame-1')
    expect(cache.previewSource(document, 'frame-1', 1, false)?.dirtyRects).toContainEqual(rect)
    expect(composite).not.toHaveBeenCalled()
  })
  it.each([false, true])('commits a styled stroke then pans without redrawing its full bounds (pending tail=%s)', pendingTail => {
    const document = createDocument('release then pan', 192, 192, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    layer.layerStyles.shadow.enabled = true
    useWorkspace.setState({ sessions: [], activeId: null })
    useWorkspace.getState().addSession(document)
    const cache = new CanvasCompositeCache(), context = makeContext()
    const render = () => {
      const s = useWorkspace.getState().sessions[0]
      draw(cache, document, context, { revision: s.revision, contentRevision: s.contentRevision, contentInvalidation: s.contentInvalidation, fastViewPreview: true, originX: 3 })
      return context.drawImage.mock.lastCall![0] as MockOffscreenCanvas
    }
    const surface = render(), edit = beginPixelEdit(layer.id)
    const paint = (x: number, y: number) => {
      paintBrush(document, layer, edit, x, y, 5, { r: 255, g: 0, b: 0, a: 255 }, 'round')
      cache.invalidateDocumentRect({ x: x - 3, y: y - 3, width: 7, height: 7 }, document, document.animation?.activeFrameId, [layer.id])
    }
    paint(20, 20); paint(160, 160); render()
    if (pendingTail) paint(162, 160)
    surface.context.putImageData.mockClear()
    const input = createStrokeCanvasInput({ compositeCacheRef: { current: cache }, lineAnchorHistoryRef: { current: null }, t: (key: string) => key } as unknown as Parameters<typeof createStrokeCanvasInput>[0])
    input.endRaster({ state: useWorkspace.getState(), session: useWorkspace.getState().sessions[0],
      drag: { kind: 'draw', edit, start: { x: 20, y: 20 }, last: { x: 162, y: 160 }, path: [{ x: 20, y: 20 }, { x: 162, y: 160 }], startedAt: Date.now() } as Parameters<typeof input.endRaster>[0]['drag'] })
    expect(render()).toBe(surface)
    const uploaded = surface.context.putImageData.mock.calls.reduce((sum, [image]) => sum + image.width * image.height, 0)
    expect(uploaded).toBeLessThanOrEqual(pendingTail ? 256 : 0)
    expect(surface.pixels).toEqual(compositeRegion(document, 0, 0, 192, 192, new DocumentCompositeCache(), 1))
    useWorkspace.getState().undo()
    expect(render().pixels.some(value => value !== 0)).toBe(false)
    useWorkspace.getState().redo()
    expect(render().pixels).toEqual(compositeRegion(document, 0, 0, 192, 192, new DocumentCompositeCache(), 2))
  })

  it.each([1, 12])('keeps symmetric styled uploads local with %s queued pointer samples', samples => {
    const document = createDocument('styled upload locality', 256, 256, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    draw(cache, document, context)
    const surface = context.drawImage.mock.lastCall![0] as MockOffscreenCanvas
    const axes = { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: false }
    const frameId = document.animation?.activeFrameId ?? 'static'
    const edit = beginPixelEdit(layer.id)
    for (let sample = 0; sample < samples; sample++) {
      const point = { x: 80 + sample % 3, y: 80 }
      paintBrush(document, layer, edit, point.x, point.y, 5, { r: 255, g: 0, b: 0, a: 255 }, 'round', null, 'solid', 1, null, undefined, 0, 'paint', undefined, axes)
      for (const rect of brushStrokeInvalidationRects(point, point, 5, null, 256, 256, axes)) cache.invalidateDocumentRect(rect, document, frameId, [layer.id])
    }
    surface.context.putImageData.mockClear()
    draw(cache, document, context)
    const uploads = surface.context.putImageData.mock.calls
    expect(uploads.length).toBeGreaterThan(0)
    expect(uploads.length).toBeLessThanOrEqual(4)
    expect(uploads.reduce((sum, [image]) => sum + image.width * image.height, 0)).toBeLessThanOrEqual(1024)
    expect(surface.pixels).toEqual(compositeRegion(document, 0, 0, 256, 256, new DocumentCompositeCache(), 1))
  })

  it.each(['gradient', 'freeform', 'brush'] as const)('keeps styled %s results through commit and history without dropping the canvas surface', tool => {
    const document = createDocument('styled commit', 96, 96, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    layer.layerStyles.stroke.size = 2
    layer.layerStyles.shadow.enabled = true
    layer.layerStyles.innerGlow.enabled = true
    useWorkspace.setState({ sessions: [], activeId: null })
    useWorkspace.getState().addSession(document)
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    const render = () => {
      const session = useWorkspace.getState().sessions[0]
      draw(cache, document, context, {
        revision: session.revision,
        contentRevision: session.contentRevision,
        contentInvalidation: session.contentInvalidation
      })
      return context.drawImage.mock.lastCall![0] as MockOffscreenCanvas
    }
    const surface = render()
    const color = { r: 41, g: 121, b: 255, a: 180 }
    const rect = { x: 32, y: 32, width: 16, height: 16 }
    const edit = tool === 'gradient'
      ? applyGradient(document, layer, { x: 32, y: 32 }, { x: 48, y: 48 }, color, { ...color, r: 255 }, rect)!
      : beginPixelEdit(layer.id)
    if (tool === 'freeform') paintShapePixelPoints(document, layer, edit,
      filledShapePathPixelPoints(document, [{ x: 32, y: 32 }, { x: 48, y: 32 }, { x: 40, y: 48 }]), color)
    if (tool === 'brush') paintLine(document, layer, edit, 32, 40, 48, 40, 5, color)
    // A fresh compositor must see new pixels even when an empty source was cached.
    const beforeCommit = compositeRegion(document, 0, 0, 96, 96, new DocumentCompositeCache(), 1)
    invalidateRasterContentBounds(layer)
    const expected = compositeRegion(document, 0, 0, 96, 96, new DocumentCompositeCache(), 2)
    expect(expected.some(value => value !== 0)).toBe(true)
    expect(beforeCommit).toEqual(expected)
    useWorkspace.getState().commitPixelEdit(edit, 'styled drawing')
    expect(useWorkspace.getState().sessions[0].contentInvalidation?.kind).toBe('region')
    expect(render()).toBe(surface)
    expect(surface.pixels).toEqual(expected)
    useWorkspace.getState().undo()
    expect(render().pixels.some(value => value !== 0)).toBe(false)
    useWorkspace.getState().redo()
    expect(render().pixels).toEqual(expected)
  })

  it.each(['normal', 'multiply', 'screen'] as const)('preserves cropped %s layers when a high-zoom drag starts', mode => {
    const document = createDocument('cropped drag', 64, 64, 'rgba')
    document.layers.push(createLayer('moving', 64, 64, 'rgba'), createLayer('upper', 64, 64, 'rgba'))
    const timeline = ensureAnimationDocument(document)
    document.layers.forEach((layer, index) => {
      layer.pixels = layer.pixels.slice()
      layer.blendMode = mode
      layer.opacity = 0.6 + index * 0.1
      layer.offsetX = index * 3; layer.offsetY = index * 5
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        writeLayerColor(document, layer, y * 64 + x, { r: x * 3, g: y * 3, b: index * 70, a: (x + y) % 3 ? 170 : 0 })
      }
    })
    const moving = document.layers[1]
    for (const zoom of [16, 24, 32]) {
      const cache = new CanvasCompositeCache(), context = makeContext()
      const options = { fromX: 17, fromY: 21, toX: 48, toY: 52, view: view({ zoom }), originX: -275, originY: -337 }
      draw(cache, document, context, options)
      const full = (context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels.slice()
      setAnimationCelOffsetsForKeys(document, { [animationCelKey(moving.id, timeline.activeFrameId)]: { x: moving.offsetX, y: moving.offsetY } })
      draw(cache, document, context, { ...options, movingLayerIds: [moving.id] })
      const preview = context.drawImage.mock.lastCall![0] as MockOffscreenCanvas
      for (let y = 0; y < 31; y++) {
        expect(preview.pixels.slice(y * 31 * 4, (y + 1) * 31 * 4)).toEqual(full.slice(((y + 21) * 64 + 17) * 4, ((y + 21) * 64 + 48) * 4))
      }
    }
  })

  it('isolates blended move previews from the screen backdrop and places a cropped viewport in document coordinates', () => {
    const document = createDocument('blended move with panned viewport', 12, 12, 'rgba')
    const bottom = document.layers[0]
    const moving = createLayer('Moving', 3, 3, 'rgba')
    const upper = createLayer('Stationary', 2, 2, 'rgba')
    bottom.blendMode = 'multiply'
    moving.blendMode = 'screen'
    moving.opacity = 0.6
    moving.offsetX = 4; moving.offsetY = 5
    upper.blendMode = 'multiply'
    upper.offsetX = 6; upper.offsetY = 7
    writeLayerColor(document, bottom, 0, { r: 200, g: 40, b: 80, a: 128 })
    writeLayerColor(document, moving, 0, { r: 30, g: 220, b: 50, a: 180 })
    writeLayerColor(document, upper, 0, { r: 60, g: 80, b: 230, a: 160 })
    document.layers.push(moving, upper)
    const cache = new CanvasCompositeCache()
    const screenOperations: string[] = []
    const context = makeContext()
    let operation = 'source-over'
    Object.defineProperty(context, 'globalCompositeOperation', { get: () => operation, set: value => { operation = value; screenOperations.push(value) } })
    const options = { movingLayerIds: [moving.id], view: view({ zoom: 2 }), originX: -5, originY: -7, fromX: 3, fromY: 4, toX: 10, toY: 11 }
    draw(cache, document, context, options)
    // The editor target already contains a checkerboard. Layer blend modes
    // must never see that backdrop or leave partial output on fallback.
    expect(screenOperations.every(mode => mode === 'source-over')).toBe(true)
    expect(context.drawImage).toHaveBeenCalledTimes(1)
    expect(context.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 7, 7, 1, 1, 14, 14])
    const pixels = () => (context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels
    expect(pixels()).toEqual(compositeRegion(document, 3, 4, 7, 7, new DocumentCompositeCache(), 1))
    context.drawImage.mockClear()
    moving.offsetY += 2
    draw(cache, document, context, options)
    expect(pixels()).toEqual(compositeRegion(document, 3, 4, 7, 7, new DocumentCompositeCache(), 1))
    expect(context.drawImage.mock.lastCall!.slice(1)).toEqual([0, 0, 7, 7, 1, 1, 14, 14])
    expect(upper.offsetY).toBe(7)
  })

  it('keeps browser blend operations out of document previews with different alpha semantics', () => {
    expect(gpuBlendModeFor('normal')).toBe('source-over')
    for (const mode of BLEND_MODES.filter(mode => mode !== 'normal')) expect(gpuBlendModeFor(mode)).toBeNull()
  })

  it.each([7.5, 16])('keeps stationary pixel edges identical during dragging at zoom %s with fractional display scaling', zoom => {
    const document = createDocument('move pixel alignment', 12, 12, 'rgba')
    const layer = document.layers[0]
    layer.blendMode = 'multiply'
    writeLayerColor(document, layer, 6 * 12 + 5, { r: 180, g: 40, b: 160, a: 180 })
    const options = { view: view({ zoom }), originX: -45.3, originY: -65.7,
      fromX: 3, fromY: 4, toX: 10, toY: 11, devicePixelRatio: { x: 1.23, y: 1.27 } }
    const cache = new CanvasCompositeCache(), context = makeContext()
    draw(cache, document, context, options)
    const committed = context.drawImage.mock.calls.map(call => call.slice(1))
    context.drawImage.mockClear()
    draw(cache, document, context, { ...options, movingLayerIds: [layer.id] })
    // Preview textures start at the viewport; committed textures at document 0.
    const preview = context.drawImage.mock.calls.map(call => {
      const [sx, sy, ...rest] = call.slice(1) as number[]
      return [sx + 3, sy + 4, ...rest]
    })
    expect(preview).toEqual(committed)
  })

  it.each(BLEND_MODES.filter(mode => mode !== 'normal'))('matches committed %s pixels throughout a move in flat and grouped stacks', mode => {
    for (const grouping of ['flat', 'opacity-group', 'blend-group']) {
      const document = createDocument('translucent duplicate layers', 12, 12, 'rgba')
      const bottom = document.layers[0]
      const moving = createLayer('Duplicate', 6, 6, 'rgba')
      const upper = createLayer('Duplicate', 6, 6, 'rgba')
      document.layers.push(moving, upper)
      bottom.blendMode = mode
      moving.blendMode = grouping === 'blend-group' ? 'normal' : mode
      upper.blendMode = mode
      bottom.opacity = 0.6; moving.opacity = 0.7; upper.opacity = 0.8
      moving.offsetX = 3; moving.offsetY = 3
      upper.offsetX = 4; upper.offsetY = 5
      for (const layer of document.layers) {
        for (let i = 0; i < layer.width * layer.height; i += 1) {
          writeLayerColor(document, layer, i, { r: 190, g: 30 + i % 100, b: 170, a: i % 3 === 0 ? 0 : 160 })
        }
      }
      if (grouping !== 'flat') {
        moving.groupId = 'group'
        document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false,
          opacity: 0.65, blendMode: grouping === 'blend-group' ? mode : 'normal' })
      }
      const cache = new CanvasCompositeCache(), context = makeContext()
      draw(cache, document, context)
      for (const [offsetX, offsetY] of [[3, 3], [5, 1], [-1, 4], [3, 3]]) {
        moving.offsetX = offsetX; moving.offsetY = offsetY
        cache.invalidateDocumentPlacementRect({ x: 0, y: 0, width: 12, height: 12 }, document, undefined, [moving.id])
        draw(cache, document, context, { movingLayerIds: [moving.id], view: view({ zoom: 7.5 }) })
        const expected = compositeRegion(document, 0, 0, 12, 12, new DocumentCompositeCache(), 1)
        expect((context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels, grouping).toEqual(expected)
        expect([upper.offsetX, upper.offsetY]).toEqual([4, 5])
      }
      const duringDrag = (context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels.slice()
      draw(cache, document, context, { contentRevision: 2, revision: 2 })
      expect((context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels).toEqual(duringDrag)
    }
  })

  it('applies an accumulated preview region after rendering an intermediate revision', () => {
    const document = createDocument('accumulated source preview', 64, 64, 'rgba')
    const cache = new CanvasCompositeCache(), context = makeContext()
    draw(cache, document, context, { revision: 1, contentRevision: 1 })
    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    writeLayerColor(document, document.layers[0], 65, { r: 255, g: 0, b: 0, a: 255 })
    draw(cache, document, context, { revision: 2, contentRevision: 2,
      contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, rect: { x: 1, y: 1, width: 1, height: 1 } } })
    writeLayerColor(document, document.layers[0], 66, { r: 0, g: 255, b: 0, a: 255 })
    surface.context.putImageData.mockClear()
    draw(cache, document, context, { revision: 3, contentRevision: 3,
      contentInvalidation: { kind: 'region', fromRevision: 1, revision: 3, rect: { x: 1, y: 1, width: 2, height: 1 } } })
    const uploads = surface.context.putImageData.mock.calls
    expect(uploads.length).toBeGreaterThan(0)
    expect(uploads.every(([image]) => image.width * image.height < 64 * 64)).toBe(true)
    expect(surface.pixels.slice(65 * 4, 67 * 4)).toEqual(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]))
  })

  it('keeps one unfinished bitmap capture across repeated invalidations', async () => {
    const document = createDocument('long stroke capture backlog', 256, 256, 'rgba')
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    const pending: Array<(bitmap: { close: () => void }) => void> = []
    const capture = vi.fn(() => new Promise<{ close: () => void }>(resolve => pending.push(resolve)))
    vi.stubGlobal('createImageBitmap', capture)
    draw(cache, document, context)
    for (let x = 0; x < 60; x += 1) {
      writeLayerColor(document, document.layers[0], x, { r: x, g: 0, b: 0, a: 255 })
      cache.invalidateDocumentRect({ x, y: 0, width: 1, height: 1 }, document)
      draw(cache, document, context)
    }
    expect(capture).toHaveBeenCalledTimes(1)
    const close = vi.fn()
    pending[0]({ close })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(close).toHaveBeenCalledTimes(1)
    draw(cache, document, context)
    expect(capture).toHaveBeenCalledTimes(2)
  })

  it('releases a closed document cache and closes a bitmap capture that finishes late', async () => {
    const document = createDocument('closed document resources', 256, 256, 'rgba')
    const cache = canvasCompositeCacheFor(document)
    const context = makeContext()
    let finishCapture!: (bitmap: { close: () => void }) => void
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<{ close: () => void }>(resolve => { finishCapture = resolve })))
    draw(cache, document, context)
    releaseCanvasCompositeCache(document)
    const close = vi.fn()
    finishCapture({ close })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(close).toHaveBeenCalledTimes(1)
    expect(canvasCompositeCacheFor(document)).not.toBe(cache)
  })

  it.each([true, false])('defers bitmap captures during a long stroke (full surface: %s)', async (fullSurface) => {
    const document = createDocument('live stroke without snapshots', 256, 256, 'rgba')
    const cache = fullSurface ? new CanvasCompositeCache() : new CanvasCompositeCache(1)
    const context = makeContext()
    const capture = vi.fn(async () => ({ close: vi.fn() }))
    vi.stubGlobal('createImageBitmap', capture)
    for (let x = 0; x < 60; x += 1) {
      writeLayerColor(document, document.layers[0], x, { r: x, g: 0, b: 0, a: 255 })
      cache.invalidateDocumentRect({ x, y: 0, width: 1, height: 1 }, document)
      draw(cache, document, context, { liveRasterEdit: true })
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    expect(capture).not.toHaveBeenCalled()
    const source = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(Array.from(source.pixels.slice(59 * 4, 60 * 4))).toEqual([59, 0, 0, 255])
    draw(cache, document, context, { liveRasterEdit: false })
    expect(capture).toHaveBeenCalledTimes(1)
  })

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
    cache.retainLivePreview(document, frameId, 2)
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

    for (const call of context.drawImage.mock.calls) {
      const [, x, y, width, height, dx, dy, dw, dh] = call
      const expected = deviceAlignedDocumentRect(geometry.originX, geometry.originY, 3.075, x, y, width, height, 1.5)
      expect([dx, dy, dw, dh]).toEqual([expected.left, expected.top, expected.width, expected.height])
    }
  })

  it.each([undefined, 1])('keeps pixel boundaries stable during pan/zoom and release (cache budget %s)', (budget) => {
    const document = createDocument('fractional navigation', 32, 32, 'rgba')
    const cache = new CanvasCompositeCache(budget)
    const context = makeContext()
    for (const zoom of [4.125, 64.013]) for (const step of [0, 1, 2]) {
      const geometry = {
        view: view({ zoom }), originX: 10.2 + step / 3, originY: 5.1 - step / 3,
        canvasWidth: document.width * zoom, canvasHeight: document.height * zoom,
        fromX: step, fromY: step, toX: 30, toY: 30,
        imageSmoothingEnabled: false, devicePixelRatio: { x: 1.5, y: 1.501 }
      }
      context.drawImage.mockClear()
      draw(cache, document, context, { ...geometry, fastViewPreview: true })
      const movingRects = context.drawImage.mock.calls.map((call) => call.slice(1))
      expect(movingRects.length).toBeGreaterThan(0)
      context.drawImage.mockClear()
      draw(cache, document, context, { ...geometry, fastViewPreview: false })
      expect(context.drawImage.mock.calls.map((call) => call.slice(1))).toEqual(movingRects)
    }
  })

  it('reuses the 4K composite and bounds fractional blits across dock resizes', () => {
    const document = createDocument('4K dock resize', 4000, 4000, 'rgba', false)
    writeLayerColor(document, document.layers[0], 4000 * 2000 + 2000, { r: 24, g: 96, b: 220, a: 255 })
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    draw(cache, document, context, { view: view({ zoom: 3.075 }), fromX: 1900, fromY: 1900, toX: 2100, toY: 2100, devicePixelRatio: 1.5, fastViewPreview: true })
    const surfaceCount = MockOffscreenCanvas.instances.length
    const uploads = MockOffscreenCanvas.instances.reduce((count, surface) => count + surface.context.putImageData.mock.calls.length, 0)
    for (let step = 0; step < 30; step++) {
      context.drawImage.mockClear()
      draw(cache, document, context, {
        view: view({ zoom: 3.075 }), fromX: 1900, fromY: 1900, toX: 2100 + step, toY: 2100 + step,
        originX: -5700 + step / 2, originY: -5700 + step / 2, devicePixelRatio: 1.5, fastViewPreview: true
      })
      expect(context.drawImage.mock.calls.length).toBeLessThanOrEqual(230)
    }
    expect(MockOffscreenCanvas.instances).toHaveLength(surfaceCount)
    expect(MockOffscreenCanvas.instances.reduce((count, surface) => count + surface.context.putImageData.mock.calls.length, 0)).toBe(uploads)
    context.drawImage.mockClear()
    // The settled frame uses the same exact pixel grid as navigation.
    draw(cache, document, context, { view: view({ zoom: 3.075 }), fromX: 1990, fromY: 1990, toX: 2010, toY: 2010, devicePixelRatio: 1.5 })
    expect(context.drawImage.mock.calls.length).toBeLessThanOrEqual(400)
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

  it('reuses an aligned immutable viewport during pan and releases it on content invalidation', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async (canvas: MockOffscreenCanvas) => {
      const bitmap = new MockOffscreenCanvas(canvas.width, canvas.height)
      bitmap.pixels.set(canvas.pixels)
      return Object.assign(bitmap, { close: vi.fn() })
    }))
    const document = createDocument('cached aligned pan', 256, 256, 'rgba')
    const cache = new CanvasCompositeCache(), context = makeContext()
    const geometry = { view: view({ zoom: 4.5 }), fromX: 60, fromY: 60, toX: 180, toY: 180,
      originX: -250, originY: -250, imageSmoothingEnabled: false, devicePixelRatio: 1 }
    draw(cache, document, context, geometry)
    await Promise.resolve()
    context.drawImage.mockClear()
    draw(cache, document, context, geometry)
    expect(context.drawImage).toHaveBeenCalledOnce()
    const aligned = context.drawImage.mock.lastCall![0] as MockOffscreenCanvas
    const created = MockOffscreenCanvas.instances.length
    const passes = aligned.context.drawImage.mock.calls.length
    for (let step = 1; step < 12; step++) {
      context.drawImage.mockClear()
      draw(cache, document, context, { ...geometry, originX: -250 - step, fromX: 60 + step, toX: 180 + step })
      expect(context.drawImage).toHaveBeenCalledOnce()
      expect(context.drawImage.mock.lastCall![0]).toBe(aligned)
    }
    expect(aligned.context.drawImage.mock.calls.length).toBe(passes)
    expect(MockOffscreenCanvas.instances).toHaveLength(created)
    cache.invalidateSurface()
    expect([aligned.width, aligned.height]).toEqual([0, 0])
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

    // The final vertical pass is bounded by the visible source rows.
    expect(context.drawImage.mock.calls.length).toBeLessThanOrEqual(256)
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

  it('shares transformed pixels across canvases and refreshes changed transforms and content', () => {
    const document = createDocument('shared selection', 8, 4, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 0, { r: 255, g: 80, b: 40, a: 255 })
    const source = captureSelectionTransform(document, { x: 0, y: 0, width: 2, height: 2 }, layer)!
    const rasterize = vi.spyOn(selectionRaster, 'selectionTransformPreviewRasterPacked')
    const canvases = [new CanvasCompositeCache(), new CanvasCompositeCache()]
    const contexts = [makeContext(), makeContext()]
    const selectionPreview = { layerId: layer.id, source, target: { x: 3, y: 0, width: 3, height: 3 }, angle: 0, copy: false }
    const renderBoth = (contentRevision: number) => canvases.forEach((cache, i) => draw(cache, document, contexts[i], { selectionPreview, contentRevision }))
    renderBoth(1)
    expect(rasterize).toHaveBeenCalledTimes(1)
    expect((contexts[0].drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels).toEqual((contexts[1].drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels)
    selectionPreview.target.x += 1
    renderBoth(1)
    expect(rasterize).toHaveBeenCalledTimes(1)
    selectionPreview.target.width += 1
    renderBoth(1)
    expect(rasterize).toHaveBeenCalledTimes(2)
    renderBoth(2)
    expect(rasterize).toHaveBeenCalledTimes(3)
  })

  it('keeps cached selection pixels exact while moving, cancelling and revising content', () => {
    const document = createDocument('cached selection pixels', 384, 128, 'rgba')
    const lower = document.layers[0]
    const layer = createLayer('selection', 384, 128, 'rgba')
    document.layers.push(layer)
    const colorAt = (x: number) => ({ r: 230, g: 60, b: 40, a: [0, 128, 255][x % 3] })
    for (let y = 0; y < 128; y++) for (let x = 0; x < 384; x++) {
      writeLayerColor(document, lower, y * 384 + x, { r: 40, g: 90, b: 180, a: 190 })
      if (x < 128) writeLayerColor(document, layer, y * 384 + x, colorAt(x))
    }
    const source = captureSelectionTransform(document, { x: 0, y: 0, width: 128, height: 128 }, layer)!
    const original = layer.pixels.slice()
    const cache = new CanvasCompositeCache(), context = makeContext()
    const displayed = () => (context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels
    const renderMoved = (x: number, contentRevision: number) => {
      draw(cache, document, context, { contentRevision, selectionPreview: { layerId: layer.id, source, target: { x, y: 0, width: 128, height: 128 }, angle: 0, copy: false } })
      const actual = displayed().slice()
      layer.pixels.fill(0)
      for (let y = 0; y < 128; y++) for (let col = 0; col < 128; col++) writeLayerColor(document, layer, y * 384 + x + col, colorAt(col))
      const expected = compositeRegion(document, 0, 0, 384, 128, new DocumentCompositeCache(), contentRevision)
      layer.pixels.set(original)
      expect(actual).toEqual(expected)
    }
    renderMoved(160, 1)
    renderMoved(180, 1)
    draw(cache, document, context)
    expect(displayed()).toEqual(compositeRegion(document, 0, 0, 384, 128, new DocumentCompositeCache(), 1))
    renderMoved(160, 1)
    writeLayerColor(document, lower, 161, { r: 1, g: 2, b: 3, a: 255 })
    renderMoved(160, 2)
    expect(layer.pixels).toEqual(original)
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

    // Assert the surface actually presented, independent of which renderer owns it.
    const preview = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(preview).toBeInstanceOf(MockOffscreenCanvas)
    expect(Array.from(preview.pixels.slice(0, 4))).toEqual([0, 0, 0, 0])
    expect(Array.from(preview.pixels.slice(3 * 4, 4 * 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(preview.pixels.slice(4 * 4, 5 * 4))).toEqual([0, 80, 255, 255])
    expect(Array.from(preview.pixels.slice(5 * 4, 6 * 4))).toEqual([0, 200, 80, 255])
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

  it('recomposes styled output when a layer moves after its pixels change', () => {
    const document = createDocument('styled layer move preview', 8, 4, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    writeLayerColor(document, layer, 2 + document.width, { r: 0, g: 96, b: 255, a: 255 })
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    draw(cache, document, context)

    const oldBounds = { x: 1, y: 0, width: 3, height: 3 }
    layer.offsetX = 2
    cache.invalidateLayerPlacementCaches()
    const newBounds = { x: 3, y: 0, width: 3, height: 3 }
    const frameId = document.animation?.activeFrameId ?? 'static'
    cache.invalidateDocumentRect(oldBounds, document, frameId)
    cache.invalidateDocumentRect(newBounds, document, frameId)
    draw(cache, document, context, { movingLayerIds: [layer.id] })

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(Array.from(surface.pixels.slice((0 * document.width + 1) * 4, (0 * document.width + 1) * 4 + 4))).toEqual([0, 0, 0, 0])
    expect(Array.from(surface.pixels.slice((1 * document.width + 4) * 4, (1 * document.width + 4) * 4 + 4))).toEqual([0, 96, 255, 255])
  })

  it('recomposes styled output after a liquify-like edit followed by a move', () => {
    const document = createDocument('styled liquify then move', 8, 4, 'rgba')
    const layer = document.layers[0]
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.stroke.enabled = true
    writeLayerColor(document, layer, 2 + document.width, { r: 255, g: 0, b: 0, a: 255 })
    const cache = new CanvasCompositeCache()
    const context = makeContext()
    draw(cache, document, context, { revision: 1, contentRevision: 1 })

    // Simulate the in-place pixel mutation performed by liquify and its
    // region invalidation before the subsequent layer move.
    layer.pixels[1 * document.width * 4 + 2 * 4] = 0
    layer.pixels[1 * document.width * 4 + 2 * 4 + 1] = 96
    layer.pixels[1 * document.width * 4 + 2 * 4 + 2] = 255
    const frameId = document.animation?.activeFrameId ?? 'static'
    cache.invalidateDocumentRect({ x: 2, y: 1, width: 1, height: 1 }, document, frameId, [layer.id])
    draw(cache, document, context, { revision: 2, contentRevision: 2, contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, frameId, rect: { x: 2, y: 1, width: 1, height: 1 } } })

    layer.offsetX = 2
    cache.invalidateLayerPlacementCaches()
    cache.invalidateDocumentRect({ x: 1, y: 0, width: 3, height: 3 }, document, frameId)
    cache.invalidateDocumentRect({ x: 3, y: 0, width: 3, height: 3 }, document, frameId)
    draw(cache, document, context, { revision: 2, contentRevision: 2, movingLayerIds: [layer.id] })

    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(Array.from(surface.pixels.slice((0 * document.width + 1) * 4, (0 * document.width + 1) * 4 + 4))).toEqual([0, 0, 0, 0])
    expect(Array.from(surface.pixels.slice((1 * document.width + 4) * 4, (1 * document.width + 4) * 4 + 4))).toEqual([0, 96, 255, 255])
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

  it('reuses a decoded active frame without recompositing its layers', () => {
    const document = createDocument('complete initial frame', 2, 1, 'rgba')
    const pixels = new Uint8ClampedArray([0, 96, 255, 255, 0, 0, 0, 0])
    registerInitialDocumentComposite(document, pixels, document.animation?.activeFrameId, { completeFrame: true })
    const context = makeContext()
    draw(new CanvasCompositeCache(), document, context, { contentRevision: 0, revision: 0 })
    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    // The layer is empty: these pixels must come from the prepared frame.
    expect(surface.pixels).toEqual(pixels)
  })

  it.each(['shell', 'other-frame', 'edited'] as const)('rejects an initial %s snapshot', (kind) => {
    const document = createDocument('unsafe initial frame', 2, 1, 'rgba')
    writeLayerColor(document, document.layers[0], 0, { r: 0, g: 96, b: 255, a: 255 })
    registerInitialDocumentComposite(document, new Uint8ClampedArray(8), kind === 'other-frame' ? 'other' : document.animation?.activeFrameId, { completeFrame: kind !== 'shell' })
    const context = makeContext()
    draw(new CanvasCompositeCache(), document, context, { contentRevision: kind === 'edited' ? 1 : 0, revision: 0 })
    const surface = context.drawImage.mock.calls.at(-1)?.[0] as MockOffscreenCanvas
    expect(Array.from(surface.pixels.slice(0, 4))).toEqual([0, 96, 255, 255])
  })

  it('seeds preview before the first main draw but stops sharing after a live edit', () => {
    const document = createDocument('preview first', 2, 1, 'rgba')
    const frameId = document.animation!.activeFrameId
    registerInitialDocumentComposite(document, new Uint8ClampedArray([0, 96, 255, 255, 0, 0, 0, 0]), frameId, { completeFrame: true })
    const cache = new CanvasCompositeCache()
    expect(cache.previewSource(document, frameId, 0, false)?.source).toBeInstanceOf(MockOffscreenCanvas)
    expect(cache.previewSource(document, 'other', 0, false)).toBeNull()
    expect(cache.previewSource(document, frameId, 0, true)).toBeNull()
    expect(cache.previewSource(document, frameId, 1, false)).toBeNull()
    cache.invalidateDocumentRect({ x: 0, y: 0, width: 1, height: 1 }, document, frameId)
    expect(cache.previewSource(document, frameId, 0, false)).toBeNull()
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
    registerInitialDocumentComposite(document, new Uint8ClampedArray(2 * 4), frameId, { completeFrame: true })
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


describe.each([{ name: 'full surface', bytes: 128 * 1024 * 1024 }, { name: 'region surface', bytes: 1 }])('history invalidation: $name', ({ bytes }) => {
  it.each([false, true])('presents fill, undo and redo completely on the first frame (selection=%s)', (selected) => {
    useWorkspace.setState({ sessions: [], activeId: null })
    const document = createDocument('atomic visible fill', 512, 512, 'rgba')
    useWorkspace.getState().addSession(document)
    if (selected) useWorkspace.getState().setSelection({ x: 8, y: 8, width: 496, height: 496 })
    const cache = new CanvasCompositeCache(bytes)
    const context = makeContext()
    const requestRedraw = vi.fn()
    const drawSession = (): void => {
      const current = useWorkspace.getState().sessions[0]
      draw(cache, current.document, context, { revision: current.revision, contentRevision: current.contentRevision, contentInvalidation: current.contentInvalidation, requestRedraw })
    }
    drawSession()
    try {
      for (const command of ['fillForeground', 'undo', 'redo'] as const) {
        useWorkspace.getState()[command]()
        drawSession()
        const current = useWorkspace.getState().sessions[0]
        const surface = context.drawImage.mock.calls.at(-1)![0] as MockOffscreenCanvas
        const expected = compositeRegion(current.document, 0, 0, 512, 512, new DocumentCompositeCache(), current.contentRevision)
        expect(surface.pixels.every((value, index) => value === expected[index]), `${command}: mixed old/new pixels in first displayed frame`).toBe(true)
        expect(requestRedraw).not.toHaveBeenCalled()
      }
    } finally {
      useWorkspace.setState({ sessions: [], activeId: null })
    }
  })

  it('preserves an erase queued when pointer-up precedes the next draw', () => {
    const document = createDocument('erase before RAF', 4, 4, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 5, { r: 255, g: 0, b: 0, a: 255 })
    const cache = new CanvasCompositeCache(bytes)
    const context = makeContext()
    const frameId = document.animation!.activeFrameId
    draw(cache, document, context)
    const edit = beginPixelEdit(layer.id)
    paintBrush(document, layer, edit, 1, 1, 1, { r: 0, g: 0, b: 0, a: 0 }, 'square')
    cache.invalidateDocumentRect(edit.dirtyRect, document, frameId, [layer.id])
    cache.retainLivePreview(document, frameId, 2)
    commitPixelEdit(document, edit, 'erase')
    draw(cache, document, context, {
      contentRevision: 2, revision: 2,
      contentInvalidation: { kind: 'region', fromRevision: 1, revision: 2, frameId, rect: edit.dirtyRect }
    })
    const surface = context.drawImage.mock.calls.at(-1)![0] as MockOffscreenCanvas
    expect(readLayerColor(document, layer, 5).a).toBe(0)
    expect(surface.pixels[23]).toBe(0)
  })

  it('does not let a retained commit hide undo and redo before the next draw', () => {
    const document = createDocument('undo before RAF', 4, 4, 'rgba')
    const layer = document.layers[0]
    const cache = new CanvasCompositeCache(bytes)
    const context = makeContext()
    const frameId = document.animation!.activeFrameId
    draw(cache, document, context)
    const edit = beginPixelEdit(layer.id)
    paintBrush(document, layer, edit, 1, 1, 1, { r: 255, g: 0, b: 0, a: 255 }, 'square')
    cache.invalidateDocumentRect(edit.dirtyRect, document, frameId, [layer.id])
    draw(cache, document, context)
    cache.retainLivePreview(document, frameId, 2)
    const entry = commitPixelEdit(document, edit, 'draw')!
    entry.undo()
    draw(cache, document, context, {
      revision: 3, contentRevision: 3,
      contentInvalidation: { kind: 'region', fromRevision: 2, revision: 3, frameId, rect: edit.dirtyRect }
    })
    let surface = context.drawImage.mock.calls.at(-1)![0] as MockOffscreenCanvas
    expect(readLayerColor(document, layer, 5).a).toBe(0)
    expect(surface.pixels[23]).toBe(0)
    entry.redo()
    draw(cache, document, context, { revision: 4, contentRevision: 4,
      contentInvalidation: { kind: 'region', fromRevision: 3, revision: 4, frameId, rect: edit.dirtyRect } })
    surface = context.drawImage.mock.calls.at(-1)![0] as MockOffscreenCanvas
    expect(surface.pixels[23]).toBe(255)
  })
})


it('refreshes a cancelled liquify preview through Store invalidation without adding history or dirtying the document', () => {
  useWorkspace.setState({ sessions: [], activeId: null })
  const document = createDocument('liquify rollback surface', 4, 4, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0]
  const layer = document.layers[0]
  const cache = new CanvasCompositeCache()
  const context = makeContext()
  const frameId = document.animation!.activeFrameId
  const dirty = document.dirty
  const revision = session.contentRevision
  draw(cache, document, context, { revision, contentRevision: revision })
  const edit = beginPixelEdit(layer.id)
  paintBrush(document, layer, edit, 1, 1, 1, { r: 255, g: 0, b: 0, a: 255 }, 'square')
  cache.invalidateDocumentRect(edit.dirtyRect, document, frameId, [layer.id])
  draw(cache, document, context, { revision, contentRevision: revision })
  expect((context.drawImage.mock.calls.at(-1)![0] as MockOffscreenCanvas).pixels[23]).toBe(255)
  useWorkspace.getState().cancelLiquifyStroke(edit, false)
  draw(cache, document, context, { revision: session.revision, contentRevision: session.contentRevision, contentInvalidation: session.contentInvalidation })
  expect((context.drawImage.mock.calls.at(-1)![0] as MockOffscreenCanvas).pixels[23]).toBe(0)
  expect(readLayerColor(document, layer, 5).a).toBe(0)
  expect(session.history.position).toBe(0)
  expect(document.dirty).toBe(dirty)
})


describe('styled layer placement previews', () => {
  it.each(['stroke', 'shadow', 'innerGlow', 'combined'])('reuses %s pixels through drag, cancellation and a subsequent edit', effect => {
    const document = createDocument('styled move reuse', 64, 48, 'rgba')
    const layer = document.layers[0]
    const styles = createDefaultLayerStyles()
    if (effect === 'stroke' || effect === 'combined') styles.stroke = { ...styles.stroke, enabled: true, size: 2 }
    if (effect === 'shadow' || effect === 'combined') styles.shadow = { ...styles.shadow, enabled: true, blur: 2, offsetX: 2, offsetY: 2 }
    if (effect === 'innerGlow' || effect === 'combined') styles.innerGlow = { ...styles.innerGlow, enabled: true, size: 2 }
    layer.layerStyles = styles
    for (let y = 6; y < 12; y += 1) for (let x = 6; x < 12; x += 1) writeLayerColor(document, layer, y * layer.width + x, { r: 20, g: 110, b: 240, a: 180 })
    const cache = new CanvasCompositeCache()
    const preview = new CanvasCompositeCache()
    const context = makeContext(), previewContext = makeContext()
    const frameId = document.animation!.activeFrameId
    const rect = { x: 0, y: 0, width: 64, height: 48 }
    const blocks = vi.spyOn(DocumentCompositeCache.prototype as unknown as { renderStyledLayerBlock: (...args: unknown[]) => Uint8ClampedArray }, 'renderStyledLayerBlock')
    draw(cache, document, context)
    draw(preview, document, previewContext)
    for (const offset of [2, 5, 0]) {
      layer.offsetX = offset
      cache.invalidateDocumentPlacementRect(rect, document, frameId, [layer.id])
      const invalidation = cache.consumePreviewInvalidation(frameId)
      expect(invalidation).toEqual({ kind: 'region', rect, placementOnly: true, layerIds: [layer.id] })
      preview.invalidateDocumentPlacementRect(rect, document, frameId, invalidation?.kind === 'region' ? invalidation.layerIds : undefined)
      blocks.mockClear()
      draw(cache, document, context, { movingLayerIds: [layer.id] })
      draw(preview, document, previewContext, { movingLayerIds: [layer.id] })
      expect(blocks).not.toHaveBeenCalled()
      const expected = compositeRegion(document, 0, 0, 64, 48, new DocumentCompositeCache(), 1)
      expect((context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels).toEqual(expected)
      expect((previewContext.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels).toEqual(expected)
    }
    writeLayerColor(document, layer, 8 * layer.width + 8, { r: 255, g: 0, b: 0, a: 255 })
    cache.invalidateDocumentRect({ x: 8, y: 8, width: 1, height: 1 }, document, frameId, [layer.id])
    blocks.mockClear()
    draw(cache, document, context, { revision: 2, contentRevision: 2 })
    expect(blocks).toHaveBeenCalled()
    expect((context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels)
      .toEqual(compositeRegion(document, 0, 0, 64, 48, new DocumentCompositeCache(), 2))
  })

  it('refreshes ancestor group styles when a child moves inside unchanged group bounds', () => {
    const document = createDocument('group style placement', 32, 24, 'rgba')
    const moving = document.layers[0]
    moving.groupId = 'group'
    writeLayerColor(document, moving, 8 * 32 + 8, { r: 255, g: 0, b: 0, a: 255 })
    const anchor = createLayer('fixed group extent', 32, 24, 'rgba')
    anchor.groupId = 'group'
    writeLayerColor(document, anchor, 3 * 32 + 3, { r: 0, g: 0, b: 255, a: 255 })
    writeLayerColor(document, anchor, 18 * 32 + 25, { r: 0, g: 0, b: 255, a: 255 })
    document.layers.push(anchor)
    const layerStyles = createDefaultLayerStyles()
    layerStyles.stroke = { ...layerStyles.stroke, enabled: true, size: 1 }
    document.groups = [{ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal', layerStyles }]
    const cache = new CanvasCompositeCache(), context = makeContext()
    draw(cache, document, context)
    moving.offsetX = 4
    cache.invalidateDocumentPlacementRect({ x: 0, y: 0, width: 32, height: 24 }, document, document.animation!.activeFrameId, [moving.id])
    draw(cache, document, context, { movingLayerIds: [moving.id] })
    expect((context.drawImage.mock.lastCall![0] as MockOffscreenCanvas).pixels)
      .toEqual(compositeRegion(document, 0, 0, 32, 24, new DocumentCompositeCache(), 1))
  })

  it('preserves pixel invalidation when an edit and a move share a preview frame', () => {
    const document = createDocument('mixed preview updates', 16, 16, 'rgba')
    const cache = new CanvasCompositeCache(), context = makeContext()
    draw(cache, document, context)
    const frameId = document.animation!.activeFrameId
    cache.invalidateDocumentRect({ x: 1, y: 1, width: 1, height: 1 }, document, frameId)
    cache.invalidateDocumentPlacementRect({ x: 5, y: 5, width: 1, height: 1 }, document, frameId, [document.activeLayerId])
    expect(cache.consumePreviewInvalidation(frameId)).toEqual({ kind: 'region', rect: { x: 1, y: 1, width: 5, height: 5 } })
  })
})


describe('navigation region window', () => {
  it('reuses the source window across nearby pans and updates newly exposed erased pixels', () => {
    const document = createDocument('region pan', 512, 256, 'rgba')
    const layer = document.layers[0], cache = new CanvasCompositeCache(128 * 1024), context = makeContext()
    writeLayerColor(document, layer, 105 + 105 * 512, { r: 255, g: 80, b: 20, a: 255 })
    const geometry = { fromX: 100, fromY: 100, toX: 164, toY: 164 }
    draw(cache, document, context, geometry)
    const region = context.drawImage.mock.lastCall![0] as MockOffscreenCanvas
    const count = MockOffscreenCanvas.instances.length
    region.context.putImageData.mockClear()
    for (let step = 1; step <= 16; step++) draw(cache, document, context, { fromX: 100 + step, fromY: 100, toX: 164 + step, toY: 164 })
    expect(MockOffscreenCanvas.instances).toHaveLength(count)
    expect(context.drawImage.mock.lastCall![0]).toBe(region)
    expect(region.context.putImageData).not.toHaveBeenCalled()
    writeLayerColor(document, layer, 105 + 105 * 512, { r: 0, g: 0, b: 0, a: 0 })
    cache.invalidateDocumentRect({ x: 105, y: 105, width: 1, height: 1 }, document)
    draw(cache, document, context, { fromX: 116, fromY: 100, toX: 180, toY: 164, liveRasterEdit: true })
    draw(cache, document, context, geometry)
    expect(context.drawImage.mock.lastCall![0]).toBe(region)
    expect(region.pixels).toEqual(compositeRegion(document, 68, 68, 128, 128, new DocumentCompositeCache(), 1))
    cache.dispose()
  })
})
