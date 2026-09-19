import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, writeLayerColor } from '@/core/document-model'
import { syncActiveAnimationFrame } from '@/core/animation'
import { translateCurrent } from '@/core/localization'
import { useWorkspace } from '@/store/workspace'
import { AnimationTweenDialog } from './AnimationTweenDialog'
import { animationTweenPreviewFor, drawAnimationTweenPreview } from './animation-tween-preview'

vi.mock('./I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

function fixture(withLoop = false) {
  const document = createDocument('dialog tween', 4, 4, 'rgba', false)
  writeLayerColor(document, document.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  syncActiveAnimationFrame(document)
  if (withLoop) {
    const frameId = document.animation!.activeFrameId
    document.animation!.loopSections = [{ id: 'walk', name: 'Walk', startFrameId: frameId, endFrameId: frameId, direction: 'forward', repeatCount: null }]
  }
  useWorkspace.getState().addSession(document)
  const close = vi.fn()
  const view = render(<AnimationTweenDialog document={document} frameId={document.animation!.activeFrameId} layerId={document.activeLayerId} onClose={close} />)
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
