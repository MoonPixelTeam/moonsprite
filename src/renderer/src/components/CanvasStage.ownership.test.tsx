import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, readLayerColorAt } from '@/core/document-model'
import { activeTilemapCelTarget, writeTilemapCell } from '@/core/tilemap-document'
import { beginTilemapEdit, writeTilesetTilePixels } from '@/core/tilemap'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { rectSelection } from '@/core/selection'
import { CanvasInputState, type CanvasDragState } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
import { CanvasStage } from './CanvasStage'
import { useCanvasSelectionTransform } from './useCanvasSelectionTransform'
import { renderCanvasFrame } from './canvas-render-frame'
import { beginWorkspaceResize, endWorkspaceResize } from './workspace-resize'
import { canvasCompositeCacheFor, releaseCanvasCompositeCache } from './canvas-composite-registry'
import { CANVAS_VIEW_SCROLLBARS_ENABLED_KEY } from '@/core/file-preferences'
import { canvasToolCursor } from '@/core/canvas-visuals'

// Keep real controllers, geometry, pointer routing and Store commands. Rendering
// pixels belongs to the renderer tests and requires a browser canvas backend.
vi.mock('./canvas-render-frame', () => ({ renderCanvasFrame: vi.fn() }))

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  readonly pressure: number
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
    this.pressure = init.pressure ?? 0.5
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 240))
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLCanvasElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLCanvasElement.prototype, 'hasPointerCapture', { configurable: true, value: () => true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function addSession(name = 'controller ownership') {
  useWorkspace.getState().addSession(createDocument(name, 8, 8, 'rgba'))
  return useWorkspace.getState().sessions.at(-1)!
}

async function tilePaintCanvas(kind: 'grid' | 'free') {
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 })), readUsageStatistics: vi.fn(async () => null), writeUsageStatistics: vi.fn(async () => {}) })
  const document = addSession('tile gesture').document
  await act(async () => {
    if (kind === 'grid') await useWorkspace.getState().createTilemapLayer({ name: 'Grid', tileWidth: 2, tileHeight: 2 })
    else await useWorkspace.getState().createFreeTileLayer({ name: 'Free' })
  })
  const tileset = document.tilesets![0]
  const pixels = new Uint8ClampedArray(tileset.tileWidth * tileset.tileHeight * 4)
  for (let index = 0; index < pixels.length; index += 4) pixels.set([220, 40, 30, 255], index)
  writeTilesetTilePixels(tileset, tileset.tileIds[0], pixels)
  act(() => {
    useWorkspace.getState().setSelectedTile(tileset.id, tileset.tileIds[0])
    useWorkspace.getState().setTilemapMode('paint')
    useWorkspace.getState().setFreeTileMode('paint')
    useWorkspace.getState().setTool('pencil')
    useWorkspace.getState().setViewportSizeForDocument(document.id, { width: 320, height: 240 })
  })
  const view = render(<CanvasStage session={useWorkspace.getState().sessions[0]} />)
  const canvas = view.container.querySelector<HTMLCanvasElement>('.stage-canvas')!
  const rerender = () => view.rerender(<CanvasStage session={useWorkspace.getState().sessions[0]} />)
  const pointer = (phase: 'Down' | 'Move' | 'Up', x: number, y: number) => {
    const zoom = useWorkspace.getState().sessions[0].view.zoom
    fireEvent[`pointer${phase}`](canvas, { pointerId: 1, button: 0, buttons: phase === 'Up' ? 0 : 1, clientX: 160 + (x - 4) * zoom, clientY: 120 + (y - 4) * zoom })
  }
  return { document, pointer, rerender }
}

it('paints and erases mirrored grid tile strokes as one undo step', async () => {
  const { document, pointer, rerender } = await tilePaintCanvas('grid')
  act(() => {
    useWorkspace.getState().setSymmetryCenter({ x: 4, y: 4 })
    useWorkspace.getState().setSymmetryAxis('horizontal', true)
    useWorkspace.getState().setSymmetryAxis('vertical', true)
  })
  rerender()
  pointer('Down', 1, 1); pointer('Move', 3, 1); pointer('Up', 3, 1)
  const cells = () => activeTilemapCelTarget(document)!.tilemap.cells
  const painted = () => cells().flatMap((cell, index) => cell ? [index] : [])
  expect(painted()).toEqual([0, 1, 2, 3, 12, 13, 14, 15])
  act(() => useWorkspace.getState().undo())
  expect(painted()).toEqual([])
  act(() => { useWorkspace.getState().redo(); useWorkspace.getState().setTool('eraser') })
  rerender()
  pointer('Down', 1, 1); pointer('Move', 3, 1); pointer('Up', 3, 1)
  expect(painted()).toEqual([])
  act(() => useWorkspace.getState().undo())
  expect(painted()).toEqual([0, 1, 2, 3, 12, 13, 14, 15])
})

it.each([
  ['horizontal', [1, 13]], ['vertical', [1, 2]], ['diagonalDown', [1, 4]], ['diagonalUp', [1, 11]], ['rotational', [1, 7, 8, 14]]
] as const)('uses the %s symmetry axis for grid tiles', async (axis, expected) => {
  const { document, pointer, rerender } = await tilePaintCanvas('grid')
  act(() => {
    useWorkspace.getState().setSymmetryAxis(axis, true)
    useWorkspace.getState().setSymmetryCenter({ x: 4, y: 4 })
  })
  rerender()
  pointer('Down', 3, 1); pointer('Up', 3, 1)
  expect(activeTilemapCelTarget(document)!.tilemap.cells.flatMap((cell, index) => cell ? [index] : [])).toEqual(expected)
})

it('clips mirrored grid tile painting to the selection', async () => {
  const { document, pointer, rerender } = await tilePaintCanvas('grid')
  act(() => {
    useWorkspace.getState().setSymmetryAxis('vertical', true)
    useWorkspace.getState().setSymmetryCenter({ x: 4, y: 4 })
    useWorkspace.getState().setSelection(rectSelection(0, 0, 2, 2))
  })
  rerender()
  pointer('Down', 1, 1); pointer('Up', 1, 1)
  expect(activeTilemapCelTarget(document)!.tilemap.cells.flatMap((cell, index) => cell ? [index] : [])).toEqual([0])
})

it.each([0, 1])('drags the free tile eraser from x=%s across multiple instances in one undo step', async startX => {
  const { document, pointer, rerender } = await tilePaintCanvas('free')
  const target = activeFreeTileCelTarget(document)!
  const placement = useWorkspace.getState().beginFreeTilePlacement()!
  placement.after.instances = [1, 3, 5].map(x => ({ id: `instance-${x}`, sourceId: target.sources[0].id, x, y: 1 }))
  act(() => {
    useWorkspace.getState().previewFreeTilePlacement(placement)
    useWorkspace.getState().commitFreeTilePlacement(placement, 'Fixture')
    useWorkspace.getState().setTool('eraser')
  })
  rerender()
  pointer('Down', startX, 1); pointer('Move', 5, 1); pointer('Up', 5, 1)
  expect(activeFreeTileCelTarget(document)!.freeTiles.instances).toEqual([])
  act(() => useWorkspace.getState().undo())
  expect(activeFreeTileCelTarget(document)!.freeTiles.instances.map(instance => instance.id)).toEqual(['instance-1', 'instance-3', 'instance-5'])
  act(() => useWorkspace.getState().redo())
  expect(activeFreeTileCelTarget(document)!.freeTiles.instances).toEqual([])
})

it('keeps locked and unselected free tile instances while dragging the eraser from blank canvas', async () => {
  const { document, pointer, rerender } = await tilePaintCanvas('free')
  const sourceId = activeFreeTileCelTarget(document)!.sources[0].id
  const placement = useWorkspace.getState().beginFreeTilePlacement()!
  placement.after.instances = [1, 3, 5].map(x => ({ id: `instance-${x}`, sourceId, x, y: 1, locked: x === 3 }))
  act(() => {
    useWorkspace.getState().previewFreeTilePlacement(placement)
    useWorkspace.getState().commitFreeTilePlacement(placement, 'Fixture')
    useWorkspace.getState().setSelection(rectSelection(0, 1, 4, 1))
    useWorkspace.getState().setTool('eraser')
  })
  rerender()
  pointer('Down', 0, 1); pointer('Move', 7, 1); pointer('Up', 7, 1)
  expect(activeFreeTileCelTarget(document)!.freeTiles.instances.map(instance => instance.id)).toEqual(['instance-3', 'instance-5'])
})

it('mirrors free tile placement and erasing using the canvas symmetry axes', async () => {
  const { document, pointer, rerender } = await tilePaintCanvas('free')
  act(() => {
    useWorkspace.getState().setSymmetryCenter({ x: 4, y: 4 })
    useWorkspace.getState().setSymmetryAxis('vertical', true)
  })
  rerender()
  pointer('Down', 1, 1); pointer('Up', 1, 1)
  expect(activeFreeTileCelTarget(document)!.freeTiles.instances.map(instance => instance.x).sort()).toEqual([1, 6])
  act(() => useWorkspace.getState().setTool('eraser'))
  rerender()
  pointer('Down', 1, 1); pointer('Up', 1, 1)
  expect(activeFreeTileCelTarget(document)!.freeTiles.instances).toEqual([])
  act(() => useWorkspace.getState().undo())
  expect(activeFreeTileCelTarget(document)!.freeTiles.instances).toHaveLength(2)
})

describe('CanvasStage controller composition', () => {
  it('adopts a replaced render cache without switching or modifying the document', () => {
    const session = addSession('renderer replacement')
    const previous = canvasCompositeCacheFor(session.document)
    const { rerender } = render(<CanvasStage session={session} />)
    act(() => vi.advanceTimersToNextFrame())
    expect(vi.mocked(renderCanvasFrame).mock.calls.at(-1)![0].resources.compositeCacheRef.current).toBe(previous)
    // A reloaded module creates a new registry while React retains hook refs.
    releaseCanvasCompositeCache(session.document)
    const replacement = canvasCompositeCacheFor(session.document)
    rerender(<CanvasStage session={{ ...session }} />)
    act(() => vi.advanceTimersToNextFrame())
    expect(vi.mocked(renderCanvasFrame).mock.calls.at(-1)![0].resources.compositeCacheRef.current).toBe(replacement)
    expect(useWorkspace.getState().sessions[0]).toBe(session)
  })

  it('skips queued and newly requested draws while a split surface is frozen, then redraws on release', () => {
    const session = addSession('frozen split')
    const { container } = render(<CanvasStage session={session} />)
    const surface = container.querySelector<HTMLElement>('.stage-surface')!
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => {
      beginWorkspaceResize()
      surface.dataset.canvasResizeFrozen = 'true'
      vi.advanceTimersToNextFrame()
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
      vi.advanceTimersToNextFrame()
    })
    expect(renderCanvasFrame).not.toHaveBeenCalled()
    act(() => {
      delete surface.dataset.canvasResizeFrozen
      endWorkspaceResize()
      vi.advanceTimersToNextFrame()
    })
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
  })

  it('draws only the visible tab among eight resident canvases and catches up on activation', () => {
    const sessions = Array.from({ length: 8 }, (_, index) => addSession(`resident ${index}`))
    render(<>{sessions.map(session => <div key={session.document.id} className="document-tab-stage" data-document-id={session.document.id}>
      <CanvasStage session={session} />
    </div>)}</>)
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
    expect(vi.mocked(renderCanvasFrame).mock.calls[0][0].resources.canvasRef.current?.closest('.document-tab-stage')?.getAttribute('data-document-id')).toBe(sessions[7].document.id)

    vi.mocked(renderCanvasFrame).mockClear()
    act(() => {
      useWorkspace.getState().setViewForDocument(sessions[0].document.id, { zoom: 6 })
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
    })
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)

    vi.mocked(renderCanvasFrame).mockClear()
    act(() => useWorkspace.getState().setActive(sessions[0].document.id))
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
    expect(vi.mocked(renderCanvasFrame).mock.calls[0][0].resources.liveViewRef.current.zoom).toBe(6)
  })

  it('skips a queued frame if its tab becomes hidden before the RAF runs', () => {
    const first = addSession('queued first'), second = addSession('queued second')
    act(() => useWorkspace.getState().setActive(first.document.id))
    render(<>{[first, second].map(session => <div key={session.document.id} className="document-tab-stage" data-document-id={session.document.id}>
      <CanvasStage session={session} />
    </div>)}</>)
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => useWorkspace.getState().setActive(second.document.id))
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
    expect(vi.mocked(renderCanvasFrame).mock.calls[0][0].resources.canvasRef.current?.closest('.document-tab-stage')?.getAttribute('data-document-id')).toBe(second.document.id)
  })

  it('continues drawing every visible split pane even when only one document is active', () => {
    const first = addSession('split first'), second = addSession('split second')
    render(<>{[first, second].map(session => <section key={session.document.id} className="document-pane">
      <CanvasStage session={session} />
    </section>)}</>)
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(2)
    const guideSurfaces = vi.mocked(renderCanvasFrame).mock.calls.map(([frame]) => frame.resources.guideCanvasRef.current)
    expect(new Set(guideSurfaces).size).toBe(2)
    expect(guideSurfaces.every(canvas => canvas?.classList.contains('stage-guide-overlay'))).toBe(true)
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => {
      useWorkspace.getState().setActive(first.document.id)
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
    })
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(2)
  })

  it('coalesces wheel zoom with a pending canvas draw and paints the final view', () => {
    const session = addSession('zoom scheduling')
    const revision = session.revision
    const contentRevision = session.contentRevision
    const { container } = render(<CanvasStage session={session} />)
    const canvas = container.querySelector<HTMLCanvasElement>('.stage-canvas')!
    vi.mocked(renderCanvasFrame).mockClear()
    // Mount already queued a draw. Multiple wheel events must join it.
    for (let index = 0; index < 3; index++) {
      fireEvent.wheel(canvas, { deltaY: -100, clientX: 160, clientY: 120 })
    }
    act(() => vi.advanceTimersToNextFrame())
    expect(renderCanvasFrame).toHaveBeenCalledTimes(1)
    const { resources } = vi.mocked(renderCanvasFrame).mock.calls[0][0]
    const zoom = resources.liveViewRef.current.zoom
    expect(zoom).toBeGreaterThan(session.view.zoom)
    expect(resources.zoomPreviewStartRef.current).not.toBeNull()
    act(() => vi.advanceTimersByTime(150))
    expect(renderCanvasFrame).toHaveBeenCalledTimes(2)
    expect(resources.zoomPreviewStartRef.current).toBeNull()
    const committed = useWorkspace.getState().sessions[0]
    expect(committed.view.zoom).toBe(zoom)
    expect(committed.revision).toBe(revision)
    expect(committed.contentRevision).toBe(contentRevision)
  })

  it('keeps the stationary dot cursor visible as zoom crosses 800%', async () => {
    localStorage.setItem('moonsprite.preference.painting-cursor-shape', 'dot')
    const initial = addSession('dot zoom')
    useWorkspace.getState().setViewForDocument(initial.document.id, { zoom: 8 })
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<CanvasStage session={session} />)
    const canvas = container.querySelector<HTMLCanvasElement>('.stage-canvas')!
    const dot = container.querySelector<HTMLElement>('.stage-adaptive-cursor')!
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 160, clientY: 120 })
    await act(async () => {})
    expect(dot.hidden).toBe(false)

    fireEvent.wheel(canvas, { deltaY: 100, clientX: 160, clientY: 120 })
    expect(dot.hidden).toBe(false)
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 160, clientY: 120 })
    expect(dot.hidden).toBe(false)
  })

  it('keeps the paint cursor outside the image without painting there', () => {
    const session = addSession('outside paint cursor')
    const revision = session.revision
    const contentRevision = session.contentRevision
    const { container } = render(<CanvasStage session={session} />)
    const canvas = container.querySelector<HTMLCanvasElement>('.stage-canvas')!
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
    expect(canvas.style.cursor).toBe(canvasToolCursor('pencil', session.primaryColor))
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, buttons: 0, clientX: 5, clientY: 5 })
    expect(useWorkspace.getState().sessions[0].revision).toBe(revision)
    expect(useWorkspace.getState().sessions[0].contentRevision).toBe(contentRevision)
  })

  it('uses the component-library scrollbars for an overflowing zoomed view', () => {
    const session = addSession('view scrollbars')
    useWorkspace.getState().setViewportSizeForDocument(session.document.id, { width: 320, height: 240 })
    useWorkspace.getState().setViewForDocument(session.document.id, { zoom: 50 })
    const current = useWorkspace.getState().sessions[0]
    const { container } = render(<CanvasStage session={current} />)
    expect(container.querySelector('.stage-view-scrollbar-horizontal.ui-scrollbar[role="scrollbar"]')).not.toBeNull()
    expect(container.querySelector('.stage-view-scrollbar-vertical.ui-scrollbar[role="scrollbar"]')).not.toBeNull()
    // The horizontal track now fills the corner; no extra composited overlay.
    expect(container.querySelector('.stage-view-scrollbar-corner')).toBeNull()
    expect(container.querySelector('.stage-view-scrollbar-horizontal')).toHaveClass('stage-view-scrollbar-with-corner')
    expect(container.querySelector('.stage-view-scrollbar.component-scrollbar')).toBeNull()
  })

  it('hides overflowing view scrollbars when the preference is disabled', () => {
    localStorage.setItem(CANVAS_VIEW_SCROLLBARS_ENABLED_KEY, 'false')
    const session = addSession('hidden view scrollbars')
    useWorkspace.getState().setViewportSizeForDocument(session.document.id, { width: 320, height: 240 })
    useWorkspace.getState().setViewForDocument(session.document.id, { zoom: 50 })
    const { container } = render(<CanvasStage session={useWorkspace.getState().sessions[0]} />)
    expect(container.querySelector('.stage-view-scrollbar')).toBeNull()
  })

  it('routes a real hand drag through down/move/up without changing document revision', () => {
    addSession()
    useWorkspace.getState().setTool('hand')
    const session = useWorkspace.getState().sessions[0]
    const { container, unmount } = render(<CanvasStage session={session} />)
    const canvas = container.querySelector<HTMLCanvasElement>('.stage-canvas')!
    const before = { ...useWorkspace.getState().sessions[0].view }
    const revision = session.revision
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 160, clientY: 120 })
    fireEvent.pointerMove(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 180, clientY: 130 })
    fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, buttons: 0, clientX: 180, clientY: 130 })
    const after = useWorkspace.getState().sessions[0]
    expect(after.view.panX).toBeGreaterThan(before.panX)
    expect(after.view.panY).toBeGreaterThan(before.panY)
    expect(after.revision).toBe(revision)
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1)
    unmount()
    vi.mocked(renderCanvasFrame).mockClear()
    act(() => vi.advanceTimersByTime(500))
    expect(renderCanvasFrame).not.toHaveBeenCalled()
  })

  it('releases the document render cache when its closed canvas unmounts', () => {
    const session = addSession('closed render resources')
    const cache = canvasCompositeCacheFor(session.document)
    const { unmount } = render(<CanvasStage session={session} />)
    act(() => useWorkspace.setState({ sessions: [], activeId: null }))
    unmount()
    expect(canvasCompositeCacheFor(session.document)).not.toBe(cache)
  })

  it('cancels a pending selection preview on document switch and unmount without a viewport owner', () => {
    const first = addSession('first')
    const second = addSession('second')
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame')
    const draw = vi.fn()
    const inputRef = { current: new CanvasInputState() }
    const { result, rerender, unmount } = renderHook(
      ({ session }) =>
        useCanvasSelectionTransform({
          session,
          inputRef,
          draw
        } as unknown as Parameters<typeof useCanvasSelectionTransform>[0]),
      { initialProps: { session: first } }
    )
    const drag = { kind: 'move-selection', start: { x: 0, y: 0 }, last: { x: 0, y: 0 } } as CanvasDragState
    inputRef.current.drag = drag
    act(() => result.current.scheduleSelectionPreview(drag))
    rerender({ session: second })
    expect(cancelFrame).toHaveBeenCalledTimes(1)
    act(() => result.current.scheduleSelectionPreview(drag))
    unmount()
    expect(cancelFrame).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(100))
    expect(draw).not.toHaveBeenCalled()
  })
})

it.each(['pencil', 'eraser', 'fill', 'shape', 'line', 'airbrush'] as const)('does not paint adjustment layers with %s', tool => {
  const session = addSession('adjustment paint protection')
  session.document.layers[0].kind = 'adjustment'
  session.tool = tool
  useWorkspace.getState().setViewportSizeForDocument(session.document.id, { width: 320, height: 240 })
  const revision = session.contentRevision
  const view = render(<CanvasStage session={session} />)
  const canvas = view.container.querySelector<HTMLCanvasElement>('.stage-canvas')!
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 160, clientY: 120 })
  fireEvent.pointerMove(canvas, { pointerId: 1, buttons: 1, clientX: 162, clientY: 122 })
  fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, clientX: 162, clientY: 122 })
  expect(useWorkspace.getState().sessions[0].contentRevision).toBe(revision)
})

it('still paints ordinary raster layers at the same test coordinates', () => {
  const session = addSession('normal paint control')
  session.tool = 'pencil'
  useWorkspace.getState().setViewportSizeForDocument(session.document.id, { width: 320, height: 240 })
  const revision = session.contentRevision
  const view = render(<CanvasStage session={session} />)
  const canvas = view.container.querySelector<HTMLCanvasElement>('.stage-canvas')!
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 160, clientY: 120 })
  fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, clientX: 160, clientY: 120 })
  expect(useWorkspace.getState().sessions[0].contentRevision).toBeGreaterThan(revision)
})

it.each(['new', 'existing'] as const)('paints the %s raster layer after selecting a tile and preserves tile painting when switching back', async targetKind => {
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 })) })
  const initial = addSession('raster after tile selection')
  const document = initial.document
  const originalRasterId = document.activeLayerId
  await act(async () => { await useWorkspace.getState().createTilemapLayer({ name: 'Terrain', tileWidth: 2, tileHeight: 2 }) })
  const tileLayerId = document.activeLayerId
  const tileset = document.tilesets!.find(item => item.id === document.layers.find(layer => layer.id === tileLayerId)!.tilemapTilesetId)!
  writeTilesetTilePixels(tileset, tileset.tileIds[0], new Uint8ClampedArray([
    220, 40, 30, 255, 220, 40, 30, 255, 220, 40, 30, 255, 220, 40, 30, 255
  ]))
  act(() => { useWorkspace.getState().setSelectedTile(tileset.id, tileset.tileIds[0]); useWorkspace.getState().setTilemapMode('paint') })
  if (targetKind === 'new') await act(async () => { await useWorkspace.getState().addLayer() })
  else act(() => useWorkspace.getState().selectLayer(originalRasterId))
  const rasterId = document.activeLayerId
  act(() => {
    useWorkspace.getState().selectLayer(rasterId)
    useWorkspace.getState().setTool('pencil')
    useWorkspace.getState().setBrushSize(1)
    useWorkspace.getState().setViewportSizeForDocument(document.id, { width: 320, height: 240 })
  })
  let session = useWorkspace.getState().sessions[0]
  const raster = document.layers.find(layer => layer.id === rasterId)!
  const view = render(<CanvasStage session={session} />)
  const canvas = view.container.querySelector<HTMLCanvasElement>('.stage-canvas')!
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 160, clientY: 120 })
  fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, buttons: 0, clientX: 160, clientY: 120 })
  expect(document.activeLayerId).toBe(rasterId)
  expect(readLayerColorAt(document, raster, 4, 4)).toEqual(session.primaryColor)
  expect(document.animation!.cels.find(cel => cel.layerId === tileLayerId)!.tilemap!.cells.every(cell => cell === null)).toBe(true)
  expect(useWorkspace.getState().sessions[0].selectedTileId).toBe(tileset.tileIds[0])
  act(() => useWorkspace.getState().undo())
  expect(readLayerColorAt(document, raster, 4, 4).a).toBe(0)
  act(() => useWorkspace.getState().redo())
  expect(document.activeLayerId).toBe(rasterId)
  expect(readLayerColorAt(document, raster, 4, 4)).toEqual(session.primaryColor)
  act(() => useWorkspace.getState().selectLayer(tileLayerId))
  session = useWorkspace.getState().sessions[0]
  view.rerender(<CanvasStage session={session} />)
  fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, buttons: 1, clientX: 160, clientY: 120 })
  fireEvent.pointerUp(canvas, { pointerId: 2, button: 0, buttons: 0, clientX: 160, clientY: 120 })
  expect(document.activeLayerId).toBe(tileLayerId)
  expect(activeTilemapCelTarget(document)!.tilemap.cells.some(cell => cell?.tileId === tileset.tileIds[0])).toBe(true)
  expect(readLayerColorAt(document, raster, 4, 4)).toEqual(session.primaryColor)
})

it('selects one tile on click and moves its cell references by whole tiles with mouse and arrow keys', async () => {
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 })) })
  const document = addSession('tile units').document
  await act(async () => { await useWorkspace.getState().createTilemapLayer({ name: 'Terrain', tileWidth: 2, tileHeight: 2 }) })
  const target = activeTilemapCelTarget(document)!
  const tileset = document.tilesets![0]
  writeTilesetTilePixels(tileset, tileset.tileIds[0], new Uint8ClampedArray([
    220, 40, 30, 255, 220, 40, 30, 255, 220, 40, 30, 255, 220, 40, 30, 255
  ]))
  const cell = { tilesetId: tileset.id, tileId: tileset.tileIds[0], flipHorizontal: true }
  const edit = beginTilemapEdit(target.layer.id, target.cel.frameId)
  writeTilemapCell(document, target, edit, 10, cell)
  act(() => {
    useWorkspace.getState().commitTilemapEdit(edit, 'Set source tile')
    useWorkspace.getState().setTilemapMode('paint')
    useWorkspace.getState().setTool('selection')
    useWorkspace.getState().setSelectionKind('rectangle')
    useWorkspace.getState().setSelectionMode('replace')
    useWorkspace.getState().setView({ zoom: 10, panX: 0, panY: 0 })
    useWorkspace.getState().setViewportSizeForDocument(document.id, { width: 320, height: 240 })
  })
  const view = render(<CanvasStage session={useWorkspace.getState().sessions[0]} />)
  const canvas = view.container.querySelector<HTMLCanvasElement>('.stage-canvas')!
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 165, clientY: 125 })
  fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, buttons: 0, clientX: 165, clientY: 125 })
  expect(useWorkspace.getState().sessions[0].selection).toEqual({ x: 4, y: 4, width: 2, height: 2 })
  view.rerender(<CanvasStage session={useWorkspace.getState().sessions[0]} />)
  fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, buttons: 1, clientX: 165, clientY: 125 })
  fireEvent.pointerMove(canvas, { pointerId: 2, buttons: 1, clientX: 185, clientY: 125 })
  fireEvent.pointerUp(canvas, { pointerId: 2, button: 0, buttons: 0, clientX: 185, clientY: 125 })
  expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 6, y: 4, width: 2, height: 2 })
  expect(target.tilemap.cells[10]).toBeNull()
  expect(target.tilemap.cells[11]).toEqual(cell)
  view.rerender(<CanvasStage session={useWorkspace.getState().sessions[0]} />)
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 4, y: 4, width: 2, height: 2 })
  expect(target.tilemap.cells[10]).toEqual(cell)
  expect(target.tilemap.cells[11]).toBeNull()
  act(() => useWorkspace.getState().undo())
  expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 6, y: 4, width: 2, height: 2 })
  expect(target.tilemap.cells[11]).toEqual(cell)
  act(() => useWorkspace.getState().redo())
  expect(target.tilemap.cells[10]).toEqual(cell)
  expect(document.tilesets).toHaveLength(1)
})
