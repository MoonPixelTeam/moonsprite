import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from '@/core/document-model'
import { assignRasterStorage, installRuntimeRaster, surfacePixelsMaterialized } from '@/core/runtime-raster'
import { addBlankAnimationFrame, syncActiveAnimationFrame } from '@/core/animation'
import { translateCurrent } from '@/core/localization'
import { useWorkspace } from '@/store/workspace'
import { AnimationTweenDialog } from './AnimationTweenDialog'
import { animationTweenPreviewFor, drawAnimationTweenPreview } from './animation-tween-preview'

vi.mock('./I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

it('keeps sparse layers lazy when enabling a multi-layer endpoint preview', () => {
  const document = createDocument('sparse endpoint', 4, 4, 'rgba', false)
  document.layers.push(createLayer('second', 4, 4, 'rgba'))
  syncActiveAnimationFrame(document)
  for (const layer of document.layers) {
    const surface = document.animation!.cels.find(cel => cel.layerId === layer.id)!.surface!
    const data = new Uint8Array(4 * 4 * 4)
    data.set([10, 20, 30, 255])
    installRuntimeRaster(surface, { kind: 'sparse-tiles-v1', format: 'rgba', width: 4, height: 4, tileSize: 64, data, tileOffsets: new Int32Array([1]) })
    assignRasterStorage(layer, surface)
  }
  useWorkspace.getState().addSession(document)
  const view = render(<AnimationTweenDialog document={document} frameId={document.animation!.activeFrameId} layerId={document.activeLayerId} onClose={() => {}} />)
  fireEvent.click(view.getByRole('checkbox', { name: 'timeline.tween.previewEndpoint' }))
  expect(view.getByRole('checkbox', { name: 'timeline.tween.previewEndpoint' })).toBeChecked()
  expect(document.layers.map(surfacePixelsMaterialized)).toEqual([false, false])
})

function fixture(withLoop = false, initialLoopSectionId?: string) {
  const document = createDocument('dialog tween', 4, 4, 'rgba', false)
  writeLayerColor(document, document.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  syncActiveAnimationFrame(document)
  if (withLoop) {
    const frameId = document.animation!.activeFrameId
    document.animation!.loopSections = [{ id: 'walk', name: 'Walk', startFrameId: frameId, endFrameId: frameId, direction: 'forward', repeatCount: null }]
  }
  useWorkspace.getState().addSession(document)
  const close = vi.fn()
  const view = render(<AnimationTweenDialog document={document} frameId={document.animation!.activeFrameId} layerId={document.activeLayerId} initialLoopSectionId={initialLoopSectionId} onClose={close} />)
  return { document, close, view }
}
it('cancels without writing frames or history', () => {
  const { document, close, view } = fixture()
  fireEvent.change(view.getByRole('slider'), { target: { value: '3' } })
  fireEvent.click(view.getByText('common.cancel'))
  expect(close).toHaveBeenCalledOnce()
  expect(document.animation!.frames).toHaveLength(1)
  expect(useWorkspace.getState().sessions[0].history.position).toBe(0)
})
it('passes the optional auto-fit canvas toggle to generation', () => {
  const { view } = fixture()
  const generate = vi.spyOn(useWorkspace.getState(), 'generateAnimationTween').mockReturnValue(true)
  const toggle = view.getByRole('checkbox', { name: 'timeline.tween.autoCropCanvas' })
  expect(toggle).not.toBeChecked()
  fireEvent.click(toggle)
  fireEvent.click(view.getByText('timeline.tween.generate'))
  expect(generate).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String), expect.objectContaining({ autoCropCanvas: true }))
})
it('defaults to between-frame generation when a next frame exists and previews both endpoints', () => {
  const document = createDocument('between', 4, 4, 'rgba', false)
  const first = document.animation!.activeFrameId
  writeLayerColor(document, document.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  const last = addBlankAnimationFrame(document)
  writeLayerColor(document, document.layers[0], 0, { r: 0, g: 255, b: 0, a: 255 })
  syncActiveAnimationFrame(document)
  useWorkspace.getState().addSession(document)
  const close = vi.fn()
  const view = render(<AnimationTweenDialog document={document} frameId={first} layerId={document.activeLayerId} onClose={close} />)
  expect(view.getByRole('button', { name: 'timeline.tween.scope' })).toHaveTextContent('timeline.tween.scopeBetween')
  expect(view.getByRole('button', { name: 'timeline.tween.betweenMode' })).toHaveTextContent('timeline.tween.morph')
  expect(view.getByRole('button', { name: 'timeline.tween.layerScope' })).toHaveTextContent('timeline.tween.allLayers')
  expect(view.getByRole('slider')).toHaveAttribute('aria-valuetext', '10 / 10')
  expect(view.getByRole('spinbutton', { name: 'timeline.tween.betweenCount' })).toHaveValue('8')
  expect(view.queryByRole('spinbutton', { name: 'timeline.tween.offsetX' })).not.toBeInTheDocument()
  expect(view.queryByRole('button', { name: 'timeline.tween.pathMode' })).not.toBeInTheDocument()
  expect(view.queryByRole('checkbox', { name: 'timeline.tween.previewEndpoint' })).not.toBeInTheDocument()
  fireEvent.click(view.getByText('timeline.tween.generate'))
  expect(document.animation!.frames).toHaveLength(10)
  expect(document.animation!.frames[0].id).toBe(first)
  expect(document.animation!.frames.at(-1)!.id).toBe(last)
  expect(close).toHaveBeenCalledOnce()
})

it('explains why between-frame generation is unavailable on the last frame', () => {
  const { view } = fixture()
  fireEvent.click(view.getByRole('button', { name: 'timeline.tween.scope' }))
  fireEvent.click(view.getByRole('option', { name: 'timeline.tween.scopeBetween' }))
  expect(view.getByRole('alert')).toHaveTextContent(translateCurrent('timeline.tween.noNextFrame'))
  expect(view.getByText('timeline.tween.generate')).toBeDisabled()
})
it('allows switching an empty endpoint from morphing to crossfade', () => {
  const { document, view, close } = fixture()
  act(() => { useWorkspace.getState().addAnimationFrame() })
  fireEvent.click(view.getByRole('button', { name: 'timeline.tween.scope' }))
  fireEvent.click(view.getByRole('option', { name: 'timeline.tween.scopeBetween' }))
  fireEvent.click(view.getByRole('button', { name: 'timeline.tween.layerScope' }))
  fireEvent.click(view.getByRole('option', { name: 'timeline.tween.currentLayer' }))
  expect(view.getByRole('alert')).toHaveTextContent(translateCurrent('timeline.tween.morphNeedsContent'))
  expect(view.getByText('timeline.tween.generate')).toBeDisabled()
  fireEvent.click(view.getByRole('button', { name: 'timeline.tween.betweenMode' }))
  fireEvent.click(view.getByRole('option', { name: 'timeline.tween.crossfade' }))
  expect(view.queryByRole('alert')).not.toBeInTheDocument()
  expect(view.getByText('timeline.tween.generate')).toBeEnabled()
  fireEvent.click(view.getByText('timeline.tween.generate'))
  expect(document.animation!.frames).toHaveLength(10)
  expect(close).toHaveBeenCalledOnce()
})
it('submits to the existing timeline in one history step', () => {
  const { document, close, view } = fixture()
  fireEvent.click(view.getByText('timeline.tween.generate'))
  expect(document.animation!.frames).toHaveLength(9)
  expect(document.animation!.loopSections).toEqual([expect.objectContaining({ startFrameId: document.animation!.frames[1].id, endFrameId: document.animation!.frames[8].id })])
  expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
  expect(close).toHaveBeenCalledOnce()
})

it('updates the canvas endpoint independently of scrubbing and clears it on disable or unmount', () => {
  const { document, view } = fixture()
  const drawImage = vi.fn()
  const context = { save: vi.fn(), restore: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D
  const draw = () => drawAnimationTweenPreview(context, document.id, 0, 0, 1, { x: 1, y: 1 })
  const expectPosition = (x: number) => {
    expect(drawImage).toHaveBeenCalled()
    drawImage.mock.calls.at(-1)!.slice(1).forEach((value, index) => expect(value).toBeCloseTo([x, 0, 1, 1][index]))
  }
  const toggle = view.getByRole('checkbox', { name: 'timeline.tween.previewEndpoint' })
  draw()
  expect(drawImage).not.toHaveBeenCalled()
  fireEvent.click(toggle)
  draw()
  expectPosition(16)
  fireEvent.change(view.getByRole('slider'), { target: { value: '0' } })
  draw()
  expectPosition(16)
  fireEvent.change(view.getByRole('spinbutton', { name: 'timeline.tween.offsetX' }), { target: { value: '24' } })
  fireEvent.blur(view.getByRole('spinbutton', { name: 'timeline.tween.offsetX' }))
  draw()
  expectPosition(24)
  const cachedBitmap = animationTweenPreviewFor(document.id)!.canvas
  act(() => animationTweenPreviewFor(document.id)!.move!.onChange(31, -3))
  expect(view.getByRole('spinbutton', { name: 'timeline.tween.offsetX' })).toHaveValue('31')
  expect(view.getByRole('spinbutton', { name: 'timeline.tween.offsetY' })).toHaveValue('-3')
  expect(animationTweenPreviewFor(document.id)!.canvas).toBe(cachedBitmap)
  expect(animationTweenPreviewFor(document.id)).toMatchObject({ offsetX: 31, offsetY: -3 })
  fireEvent.click(toggle)
  drawImage.mockClear()
  draw()
  expect(drawImage).not.toHaveBeenCalled()
  fireEvent.click(toggle)
  view.unmount()
  draw()
  expect(drawImage).not.toHaveBeenCalled()
  expect(document.animation!.frames).toHaveLength(1)
  expect(useWorkspace.getState().sessions[0].history.position).toBe(0)
})

it('selects a loop source and generates ordinary frames after it', () => {
  const { document, close, view } = fixture(true)
  fireEvent.keyDown(view.getByRole('button', { name: 'timeline.tween.scope' }), { key: 'ArrowDown' })
  expect(view.getByRole('button', { name: 'timeline.tween.loopSection' })).toHaveTextContent('Walk')
  expect(view.getByRole('slider')).toHaveValue('0')
  const sections = structuredClone(document.animation!.loopSections)
  fireEvent.click(view.getByText('timeline.tween.generate'))
  expect(document.animation!.frames).toHaveLength(9)
  expect(document.animation!.loopSections).toEqual([...sections!, expect.objectContaining({ startFrameId: document.animation!.frames[1].id, endFrameId: document.animation!.frames[8].id })])
  expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
  expect(close).toHaveBeenCalledOnce()
})

it('explains unavailable loops and allows switching back to single-frame generation', () => {
  const { document, view } = fixture()
  const scope = view.getByRole('button', { name: 'timeline.tween.scope' })
  fireEvent.keyDown(scope, { key: 'ArrowDown' })
  expect(view.getByRole('alert')).toHaveTextContent(translateCurrent('timeline.tween.invalidLoop'))
  expect(view.getByText('timeline.tween.generate')).toBeDisabled()
  fireEvent.keyDown(scope, { key: 'ArrowUp' })
  expect(view.queryByRole('alert')).not.toBeInTheDocument()
  expect(view.getByText('timeline.tween.generate')).toBeEnabled()
  expect(document.animation!.frames).toHaveLength(1)
  expect(useWorkspace.getState().sessions[0].history.position).toBe(0)
})

it('uses a loop created after opening for both the visible source and generated poses', () => {
  const { document, view } = fixture()
  const firstFrameId = document.animation!.activeFrameId
  act(() => {
    useWorkspace.getState().addAnimationFrame()
    writeLayerColor(document, document.layers[0], 0, { r: 0, g: 255, b: 0, a: 255 })
    syncActiveAnimationFrame(document)
    useWorkspace.getState().createAnimationLoopSection({ name: 'Created while open', startFrameId: firstFrameId, endFrameId: document.animation!.activeFrameId, direction: 'forward', repeatCount: null })
  })
  const sourceFrames = document.animation!.frames.map((frame) => frame.id)
  fireEvent.keyDown(view.getByRole('button', { name: 'timeline.tween.scope' }), { key: 'ArrowDown' })
  expect(view.getByRole('button', { name: 'timeline.tween.loopSection' })).toHaveTextContent('Created while open')
  expect(view.getByText('timeline.tween.generate')).toBeEnabled()
  const beforeHistory = useWorkspace.getState().sessions[0].history.position
  fireEvent.click(view.getByText('timeline.tween.generate'))
  const timeline = document.animation!
  expect(timeline.frames.slice(0, 2).map((frame) => frame.id)).toEqual(sourceFrames)
  expect(timeline.frames).toHaveLength(10)
  const first = timeline.cels.find((cel) => cel.frameId === timeline.frames[2].id && cel.layerId === document.activeLayerId)!
  const second = timeline.cels.find((cel) => cel.frameId === timeline.frames[3].id && cel.layerId === document.activeLayerId)!
  expect(Array.from(first.surface!.pixels.slice(0, 4))).toEqual([255, 0, 0, 255])
  expect(Array.from(second.surface!.pixels.slice(0, 4))).toEqual([0, 255, 0, 255])
  expect(timeline.loopSections).toHaveLength(2)
  expect(timeline.loopSections![1]).toMatchObject({ startFrameId: timeline.frames[2].id, endFrameId: timeline.frames[9].id })
  expect(useWorkspace.getState().sessions[0].history.position).toBe(beforeHistory + 1)
})

it('refreshes an open loop source after creation, deletion and undo', () => {
  const { document, view } = fixture()
  const frameId = document.animation!.activeFrameId
  fireEvent.keyDown(view.getByRole('button', { name: 'timeline.tween.scope' }), { key: 'ArrowDown' })
  expect(view.getByText('timeline.tween.generate')).toBeDisabled()
  let id = ''
  act(() => { id = useWorkspace.getState().createAnimationLoopSection({ name: 'Live loop', startFrameId: frameId, endFrameId: frameId, direction: 'forward', repeatCount: null })! })
  expect(view.getByRole('button', { name: 'timeline.tween.loopSection' })).toHaveTextContent('Live loop')
  expect(view.getByText('timeline.tween.generate')).toBeEnabled()
  act(() => useWorkspace.getState().deleteAnimationLoopSection(id))
  expect(view.getByText('timeline.tween.generate')).toBeDisabled()
  act(() => useWorkspace.getState().undo())
  expect(view.getByRole('button', { name: 'timeline.tween.loopSection' })).toHaveTextContent('Live loop')
  expect(view.getByText('timeline.tween.generate')).toBeEnabled()
})

it('plays at the configured frame duration, pauses on seek, and restarts from the endpoint', () => {
  vi.useFakeTimers()
  const { document, view } = fixture()
  const slider = view.getByRole('slider')
  expect(slider).toHaveAttribute('aria-valuetext', '9 / 9')
  fireEvent.click(view.getByRole('button', { name: 'timelapse.playPreview' }))
  expect(slider).toHaveValue('0')
  act(() => { vi.advanceTimersByTime(220) })
  expect(slider).toHaveValue('2')
  expect(slider).toHaveAttribute('aria-valuetext', '3 / 9')
  fireEvent.change(slider, { target: { value: '5' } })
  act(() => { vi.advanceTimersByTime(200) })
  expect(slider).toHaveValue('5')
  fireEvent.click(view.getByRole('button', { name: 'timelapse.playPreview' }))
  act(() => { vi.advanceTimersByTime(400) })
  expect(slider).toHaveValue('8')
  expect(view.getByRole('button', { name: 'timelapse.playPreview' })).toBeEnabled()
  expect(document.animation!.frames).toHaveLength(1)
  expect(useWorkspace.getState().sessions[0].history.position).toBe(0)
})

it('applies a path from the large editor and generates it in one undoable operation', () => {
  const { document, view } = fixture()
  fireEvent.click(view.getByRole('button', { name: 'timeline.tween.pathMode' }))
  fireEvent.click(view.getByRole('option', { name: 'timeline.tween.pathDrawn' }))
  const generate = view.getByText('timeline.tween.generate') as HTMLButtonElement
  expect(generate.disabled).toBe(true)
  const canvas = view.getByLabelText('timeline.tween.pathDrawn') as HTMLCanvasElement
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 900, height: 520 } as DOMRect)
  canvas.setPointerCapture = vi.fn(); canvas.hasPointerCapture = vi.fn().mockReturnValue(true); canvas.releasePointerCapture = vi.fn()
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 200, clientY: 100 })
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 200, clientY: 200 })
  expect(generate.disabled).toBe(true)
  expect(document.animation!.frames).toHaveLength(1)
  expect(useWorkspace.getState().sessions[0].history.position).toBe(0)
  fireEvent.click(view.getByRole('button', { name: 'common.apply' }))
  expect(generate.disabled).toBe(false)
  fireEvent.click(view.getByRole('button', { name: 'timeline.tween.pathEdit' }))
  fireEvent.click(view.getByRole('button', { name: 'timeline.tween.pathClear' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(generate.disabled).toBe(false)
  fireEvent.click(generate)
  expect(document.animation!.frames).toHaveLength(9)
  expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
  act(() => useWorkspace.getState().undo())
  expect(document.animation!.frames).toHaveLength(1)
  act(() => useWorkspace.getState().redo())
  expect(document.animation!.frames).toHaveLength(9)
})

it('opens directly on the loop requested by the context menu', () => {
  const { view } = fixture(true, 'walk')
  expect(view.getByRole('button', { name: 'timeline.tween.scope' })).toHaveTextContent('timeline.tween.scopeLoop')
  expect(view.getByRole('button', { name: 'timeline.tween.loopSection' })).toHaveTextContent('Walk')
})

it('edits curves in a separate draft dialog and applies or cancels without generating frames', () => {
  const { view, document } = fixture()
  expect(view.queryByRole('img', { name: 'timeline.tween.curve' })).toBeNull()
  const open = () => {
    fireEvent.click(view.getByText('timeline.tween.curveEdit'))
    return within(view.getByRole('dialog', { name: 'timeline.tween.curveEdit' }))
  }
  let dialog = open()
  fireEvent.click(dialog.getByRole('button', { name: 'timeline.tween.easing' }))
  fireEvent.click(view.getByRole('option', { name: 'timeline.tween.custom' }))
  expect(dialog.getByLabelText('X1')).toBeInTheDocument()
  fireEvent.click(dialog.getByText('common.cancel'))
  expect(view.queryByRole('dialog', { name: 'timeline.tween.curveEdit' })).toBeNull()
  dialog = open()
  expect(dialog.getByRole('button', { name: 'timeline.tween.easing' })).toHaveTextContent('timeline.tween.linear')
  fireEvent.click(dialog.getByRole('button', { name: 'timeline.tween.easing' }))
  fireEvent.click(view.getByRole('option', { name: 'timeline.tween.custom' }))
  fireEvent.click(dialog.getByText('common.apply'))
  expect(view.queryByRole('dialog', { name: 'timeline.tween.curveEdit' })).toBeNull()
  dialog = open()
  expect(dialog.getByLabelText('X1')).toBeInTheDocument()
  fireEvent.keyDown(dialog.getByLabelText('X1'), { key: 'Escape' })
  expect(view.queryByRole('dialog', { name: 'timeline.tween.curveEdit' })).toBeNull()
  expect(document.animation!.frames).toHaveLength(1)
})

it.each(['linear', 'ease-in', 'ease-out', 'ease-in-out'])('editing %s preset controls switches the draft to custom', (easing) => {
  const { view } = fixture()
  fireEvent.click(view.getByText('timeline.tween.curveEdit'))
  const dialog = within(view.getByRole('dialog', { name: 'timeline.tween.curveEdit' }))
  fireEvent.click(dialog.getByRole('button', { name: 'timeline.tween.easing' }))
  fireEvent.click(view.getByRole('option', { name: 'timeline.tween.' + easing }))
  expect(dialog.getByLabelText('X1')).toBeInTheDocument()
  const input = dialog.getByLabelText('X1')
  fireEvent.change(input, { target: { value: '0.25' } })
  fireEvent.blur(input)
  expect(dialog.getByRole('button', { name: 'timeline.tween.easing' })).toHaveTextContent('timeline.tween.custom')
  expect(dialog.getByLabelText('X1')).toHaveValue('0.25')
})
