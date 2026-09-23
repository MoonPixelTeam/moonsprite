import { CANVAS_REFERENCE_DELETE_EVENT, CANVAS_REFERENCE_PASTE_EVENT } from './canvas-reference-input'
import { REFERENCE_SCALING_KEY } from '@/core/file-preferences'
import { targetsCanvasSurface, referenceNavigationActive } from './canvas-reference-input'
import { createSamplingCanvasInput } from './canvas-input-sampling'
import { CanvasInputState } from '@/core/canvas-input'
import { createRef } from 'react'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CanvasReferences, isOutsideReferenceCanvas, useCanvasReferences } from './CanvasReferences'
import { useWorkspace } from '@/store/workspace'
import { referenceDocumentPoint, referenceViewportPoint, referenceScreenBounds, referenceDocumentBounds, referenceOutlinePath, resizeReferenceBounds, referenceSourcePoint, type ReferenceViewport } from './canvas-reference-geometry'
import { notifyViewPreview } from '@/core/view-preview-lifecycle'
import type { ViewState } from '@shared/types-view'
import { createDocument } from '@/core/document'

beforeEach(() => {
  useWorkspace.setState({ sessions: [], activeId: null })
  const doc = createDocument('Reference test', 100, 100, 'rgba')
  doc.id = 'test'
  useWorkspace.getState().addSession(doc)
})

afterEach(() => { cleanup(); useCanvasReferences.setState({ images: [], pending: null }); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const viewport: ReferenceViewport = { width: 600, height: 400, documentWidth: 100, documentHeight: 100, interfaceScale: 1, rotationIndicatorPosition: 'canvas', view: { zoom: 1, panX: 0, panY: 0, rotation: 0 } }
function setup(outside = true, geometry = viewport, sampling = false, navigate: (event: React.PointerEvent<HTMLDivElement>) => boolean = () => false) {
  const stageRef = createRef<HTMLDivElement>()
  const view = render(<div ref={stageRef}><canvas className="stage-canvas" /><CanvasReferences stageRef={stageRef} documentId="test" viewport={geometry} onNavigatePointerDown={navigate} samplingActive={() => sampling} snapRotation={(event) => event.shiftKey} isOutside={() => outside} /></div>)
  return { ...view, stage: view.container.firstElementChild!, canvas: view.container.querySelector('canvas')! }
}

it('recognizes out-of-bounds coordinates even when the geometry mapper returns a point', () => {
  expect(isOutsideReferenceCanvas({ x: -1, y: 3 }, 16, 12)).toBe(true)
  expect(isOutsideReferenceCanvas({ x: 16, y: 3 }, 16, 12)).toBe(true)
  expect(isOutsideReferenceCanvas({ x: 3, y: 12 }, 16, 12)).toBe(true)
  expect(isOutsideReferenceCanvas({ x: 0, y: 0 }, 16, 12)).toBe(false)
  expect(isOutsideReferenceCanvas(null, 16, 12)).toBe(true)
})

it('imports an image and reports decode errors without adding a broken reference', async () => {
  const decode = vi.fn().mockResolvedValue(undefined)
  const NativeImage = window.Image
  vi.stubGlobal('Image', class extends NativeImage { decode = decode })
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(480)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(240)
  const message = vi.spyOn(useWorkspace.getState(), 'setMessage')
  const view = setup()
  const input = view.container.querySelector('input')!
  fireEvent.change(input, { target: { files: [new File(['image'], 'ref.png', { type: 'image/png' })] } })
  await waitFor(() => expect(useCanvasReferences.getState().images).toHaveLength(1))
  expect(useCanvasReferences.getState().images[0]).toMatchObject({ width: 240, height: 120, name: 'ref.png' })
  decode.mockRejectedValueOnce(new Error('decode failed'))
  fireEvent.change(input, { target: { files: [new File(['broken'], 'broken.png', { type: 'image/png' })] } })
  await waitFor(() => expect(message).toHaveBeenCalledWith(expect.stringContaining('decode failed')))
  expect(useCanvasReferences.getState().images).toHaveLength(1)
})

it('opens the import menu only outside the document and intercepts right-button drawing', () => {
  const view = setup()
  const draw = vi.fn()
  view.canvas.addEventListener('pointerdown', draw)
  fireEvent.pointerDown(view.canvas, { button: 2 })
  expect(draw).not.toHaveBeenCalled()
  fireEvent.contextMenu(view.canvas, { clientX: 30, clientY: 40 })
  expect(view.getByText('添加参考图…')).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(view.queryByRole('dialog')).toBeNull()
  view.unmount()
  const inside = setup(false)
  fireEvent.contextMenu(inside.canvas)
  expect(inside.queryByRole('dialog')).toBeNull()
})

it('allows later transform edits, protects locked references, and never edits the document', () => {
  const sessions = useWorkspace.getState().sessions
  const dirty = sessions[0].document.dirty
  useCanvasReferences.getState().add({ id: 'ref', name: 'reference.png', src: 'data:image/png;base64,', x: 20, y: 40, width: 100, height: 80, angle: 0, flipX: false, flipY: false, locked: false })
  const view = setup()
  fireEvent.contextMenu(view.getByAltText('reference.png'))
  fireEvent.change(view.getByLabelText('旋转角度（°）'), { target: { value: '45' } })
  fireEvent.blur(view.getByLabelText('旋转角度（°）'))
  fireEvent.change(view.getByLabelText('缩放'), { target: { value: '160' } })
  fireEvent.blur(view.getByLabelText('缩放'))
  fireEvent.click(view.getByText('水平镜像'))
  expect(useCanvasReferences.getState().images[0]).toMatchObject({ angle: 45, width: 160, flipX: true })
  fireEvent.click(view.getByRole('button', { name: '锁定参考图' }))
  expect(view.getByLabelText('缩放')).toBeDisabled()
  act(() => { useCanvasReferences.getState().update('ref', { x: 900, angle: 180 }); useCanvasReferences.getState().remove('ref') })
  expect(useCanvasReferences.getState().images[0]).toMatchObject({ x: 20, angle: 45, locked: true })
  fireEvent.click(view.getByRole('button', { name: '解锁参考图' }))
  fireEvent.change(view.getByLabelText('X'), { target: { value: '70' } })
  fireEvent.blur(view.getByLabelText('X'))
  expect(useCanvasReferences.getState().images[0].x).toBe(70)
  expect(useWorkspace.getState().sessions[0].document).toBe(sessions[0].document)
  expect(useWorkspace.getState().sessions[0].document.dirty).toBe(dirty)
})


it('anchors reference geometry through pan, zoom, view rotation, mirroring and interface scaling', () => {
  const point = { x: -47.5, y: 136.25 }
  for (const scale of [0.75, 1, 1.5]) {
    const geometry = { ...viewport, interfaceScale: scale, view: { zoom: 4, panX: 27, panY: -38, rotation: 37, mirrored: true, mirroredVertical: true } }
    const displayed = referenceViewportPoint(point, geometry)
    const restored = referenceDocumentPoint(displayed.x + 12, displayed.y + 24, { left: 12, top: 24 }, geometry)
    expect(restored.x).toBeCloseTo(point.x)
    expect(restored.y).toBeCloseTo(point.y)
    const next = referenceViewportPoint({ x: point.x + 10, y: point.y }, geometry)
    expect(Math.hypot(next.x - displayed.x, next.y - displayed.y)).toBeCloseTo(40 / scale)
  }
})

it('rotates by dragging outside a corner, cancels safely, and follows live navigation', () => {
  const image = { id: 'rotate', name: 'rotate.png', src: '', x: 20, y: 40, width: 100, height: 80, angle: 0, flipX: false, flipY: false, locked: false }
  useCanvasReferences.getState().add(image)
  const geometry = { ...viewport, view: { zoom: 2, panX: 12, panY: -4, rotation: 30, mirrored: true } }
  const view = setup(true, geometry)
  const target = view.getByAltText('rotate.png').parentElement!
  target.setPointerCapture = vi.fn()
  target.releasePointerCapture = vi.fn()
  fireEvent.contextMenu(target)
  fireEvent.keyDown(window, { key: 'Escape' })
  const start = referenceViewportPoint({ x: 130, y: 30 }, geometry)
  const end = referenceViewportPoint({ x: 120, y: 140 }, geometry)
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: start.x, clientY: start.y })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: end.x, clientY: end.y })
  expect(useCanvasReferences.getState().images[0].angle).toBeCloseTo(90)
  fireEvent.pointerCancel(target, { pointerId: 1 })
  expect(useCanvasReferences.getState().images[0]).toMatchObject(image)
  const updatedView = { ...geometry.view, panX: 90, zoom: 3 } as ViewState
  act(() => notifyViewPreview('test', updatedView))
  expect((view.container.querySelector('.canvas-reference-plane') as HTMLElement).style.transform).toBe('')
  expect(parseFloat(target.style.left)).toBeCloseTo(referenceScreenBounds(image, { ...geometry, view: updatedView }).x)
  expect(useCanvasReferences.getState().images[0]).toMatchObject(image)
})

it('shows palette selection only for unlocked left clicks and offers reset and neutral icon actions', () => {
  useCanvasReferences.getState().add({ id: 'ref', name: 'ref.png', src: '', x: 0, y: 0, width: 30, height: 20, angle: 0, flipX: false, flipY: false, locked: true })
  const view = setup()
  const target = view.getByAltText('ref.png').parentElement!
  fireEvent.pointerDown(target, { button: 0, pointerId: 1 })
  expect(view.container.querySelector('.palette-selection-outline')).toBeNull()
  fireEvent.contextMenu(target)
  expect(view.container.querySelector('.palette-selection-outline')).not.toBeNull()
  const unlock = view.getByRole('button', { name: '解锁参考图' })
  expect(unlock.textContent).toBe('')
  expect(view.getByRole('button', { name: '删除' }).className).not.toContain('danger')
  fireEvent.click(unlock)
  fireEvent.click(view.getByRole('button', { name: '水平镜像' }))
  expect(view.getByRole('button', { name: '水平镜像' }).querySelector('svg')).toBeNull()
  fireEvent.click(view.getByRole('button', { name: '重置' }))
  expect(useCanvasReferences.getState().images[0].flipX).toBe(false)
})

it('pastes clipboard pixels as a reference and leaves empty clipboard failures observable', async () => {
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,pixels')
  // Opening the menu probes the clipboard before paste reads it again.
  // Model stable clipboard contents instead of consuming the image on the first read.
  const read = vi.fn().mockResolvedValue({ width: 10, height: 20, data: new Uint8Array(800) })
  vi.stubGlobal('moonSprite', { readClipboardImage: read })
  const message = vi.spyOn(useWorkspace.getState(), 'setMessage')
  const view = setup()
  fireEvent.contextMenu(view.canvas, { clientX: 30, clientY: 40 })
  fireEvent.click(view.getByRole('menuitem', { name: '粘贴为参考图' }))
  await waitFor(() => expect(useCanvasReferences.getState().images).toHaveLength(1))
  expect(useCanvasReferences.getState().images[0]).toMatchObject({ width: 10, height: 20, documentId: 'test' })
  act(() => useWorkspace.getState().undo())
  expect(useCanvasReferences.getState().images).toHaveLength(0)
  read.mockResolvedValue(null)
  fireEvent.contextMenu(view.canvas)
  fireEvent.click(view.getByRole('menuitem', { name: '粘贴为参考图' }))
  await waitFor(() => expect(message).toHaveBeenCalled())
  expect(useCanvasReferences.getState().images).toHaveLength(0)
})


it('uses palette stroke widths and selection resize modifiers, merging one gesture into history', () => {
  const image = { id: 'resize', name: 'resize.png', src: '', x: 20, y: 40, width: 100, height: 80, angle: 0, flipX: false, flipY: false, locked: false }
  useCanvasReferences.getState().add(image)
  const view = setup()
  const target = view.getByAltText('resize.png').parentElement!
  target.setPointerCapture = vi.fn(); target.releasePointerCapture = vi.fn()
  fireEvent.contextMenu(target); fireEvent.keyDown(window, { key: 'Escape' })
  expect(view.container.querySelectorAll('[data-reference-handle]')).toHaveLength(0)
  expect(view.container.querySelector('.palette-selection-outline')?.parentElement?.className).toBe('canvas-references')
  expect(Array.from(view.container.querySelectorAll('path[stroke]')).map(path => path.getAttribute('stroke-width'))).toEqual(['6', '4', '2'])
  expect(view.container.querySelectorAll('path[vector-effect="non-scaling-stroke"]')).toHaveLength(3)
  const start = referenceViewportPoint({ x: 120, y: 80 }, viewport)
  const end = referenceViewportPoint({ x: 160, y: 80 }, viewport)
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: start.x, clientY: start.y })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: end.x, clientY: end.y })
  expect(useCanvasReferences.getState().images[0].width).toBe(140)
  fireEvent.keyDown(window, { key: 'Shift', shiftKey: true })
  let changed = useCanvasReferences.getState().images[0]
  expect(changed.width / changed.height).toBeCloseTo(1.25)
  fireEvent.keyDown(window, { key: 'Alt', altKey: true, shiftKey: true })
  changed = useCanvasReferences.getState().images[0]
  expect(changed.x + changed.width / 2).toBe(70)
  expect(changed.y + changed.height / 2).toBe(80)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(useCanvasReferences.getState().images[0]).toMatchObject(image)
  expect(useWorkspace.getState().sessions[0].history.length).toBe(1)
  fireEvent.pointerDown(target, { button: 0, pointerId: 2, clientX: start.x, clientY: start.y })
  fireEvent.pointerMove(target, { pointerId: 2, clientX: end.x, clientY: end.y })
  fireEvent.pointerUp(target, { pointerId: 2 })
  expect(useWorkspace.getState().sessions[0].history.length).toBe(2)
  act(() => useWorkspace.getState().undo())
  expect(useCanvasReferences.getState().images[0]).toMatchObject(image)
})

it('floats independently of all view changes and reattaches without a visual jump', () => {
  const image = { id: 'fixed', name: 'fixed.png', src: '', x: 20, y: 40, width: 100, height: 80, angle: 17, flipX: true, flipY: false, locked: false }
  useCanvasReferences.getState().add(image)
  const view = setup()
  const target = view.getByAltText('fixed.png').parentElement!
  fireEvent.contextMenu(target)
  fireEvent.click(view.getByRole('button', { name: '独立浮动' }))
  const style = target.getAttribute('style')
  const floating = useCanvasReferences.getState().images[0]
  expect(floating.floating).toBe(true)
  const next = { ...viewport.view, zoom: 4, panX: 90, panY: -80, rotation: 67, mirrored: true } as ViewState
  act(() => notifyViewPreview('test', next))
  expect(target.getAttribute('style')).toBe(style)
  expect(useCanvasReferences.getState().images[0]).toBe(floating)
  fireEvent.click(view.getByRole('button', { name: '独立浮动' }))
  const reattached = useCanvasReferences.getState().images[0]
  expect(reattached.floating).toBe(false)
  const displayed = referenceScreenBounds(reattached, { ...viewport, view: next })
  for (const key of ['x', 'y', 'width', 'height', 'angle'] as const) expect(displayed[key]).toBeCloseTo(floating[key])
  expect(displayed.flipX).toBe(floating.flipX)
  expect(displayed.flipY).toBe(floating.flipY)
  act(() => useWorkspace.getState().undo())
  expect(useCanvasReferences.getState().images[0]).toEqual(floating)
})

it('maps rotated and mirrored reference pixels and samples even a locked reference without editing it', () => {
  const image = { id: 'sample', name: 'sample.png', src: '', x: 0, y: 0, width: 20, height: 10, angle: 90, flipX: true, flipY: false, locked: true }
  expect(referenceSourcePoint(image, { x: 12, y: -3 }, 4, 2)).toEqual({ x: 3, y: 0 })
  useCanvasReferences.getState().add(image)
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(4)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(2)
  const draw = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw, getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) }) } as unknown as CanvasRenderingContext2D)
  const view = setup(true, viewport, true)
  vi.spyOn(view.stage, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 } as DOMRect)
  const target = view.getByAltText('sample.png').parentElement!
  target.setPointerCapture = vi.fn(); target.releasePointerCapture = vi.fn()
  const point = referenceViewportPoint({ x: 12, y: -3 }, viewport)
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: point.x, clientY: point.y })
  fireEvent.pointerUp(target, { pointerId: 1 })
  expect(draw).toHaveBeenCalledWith(view.getByAltText('sample.png'), 3, 0, 1, 1, 0, 0, 1, 1)
  expect(useWorkspace.getState().sessions[0].primaryColor).toEqual({ r: 12, g: 34, b: 56, a: 255 })
  const queue = vi.fn()
  const sampling = createSamplingCanvasInput({
    inputRef: { current: new CanvasInputState() }, queueEyedropperSampleColor: queue,
    updateEyedropperMagnifier: vi.fn()
  } as unknown as Parameters<typeof createSamplingCanvasInput>[0])
  sampling.moveSample({
    drag: { kind: 'sample-color', start: { x: -1, y: -1 }, last: { x: -1, y: -1 }, sampleSecondary: true },
    point: { x: -1, y: -1 }, session: useWorkspace.getState().sessions[0], state: useWorkspace.getState(),
    event: { clientX: point.x, clientY: point.y, currentTarget: view.canvas } as React.PointerEvent<HTMLCanvasElement>
  })
  expect(queue).toHaveBeenCalledWith({ r: 12, g: 34, b: 56, a: 255 }, true)
  expect(useCanvasReferences.getState().images[0]).toMatchObject(image)
  expect(useWorkspace.getState().sessions[0].history.length).toBe(1)
})


it('keeps the native image ratio through numeric scaling and every rotated resize handle', () => {
  const image = { id: 'ratio', name: 'ratio.png', src: '', x: 20, y: 40, width: 93, height: 37, angle: 31, flipX: false, flipY: false, locked: false }
  useCanvasReferences.getState().add(image)
  const view = setup()
  fireEvent.contextMenu(view.getByAltText('ratio.png'))
  expect(view.queryByLabelText('宽')).toBeNull()
  expect(view.queryByLabelText('高')).toBeNull()
  fireEvent.change(view.getByLabelText('缩放'), { target: { value: '125' } })
  fireEvent.blur(view.getByLabelText('缩放'))
  expect(useCanvasReferences.getState().images[0]).toMatchObject({ width: 116.25, height: 46.25 })
  for (const handle of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'] as const) {
    for (const center of [false, true]) {
      const resized = resizeReferenceBounds(image, { x: 28.6, y: -23.4 }, handle, false, center)
      expect(resized.width / resized.height).toBeCloseTo(93 / 37, 12)
      if (center) {
        expect(resized.x + resized.width / 2).toBeCloseTo(image.x + image.width / 2)
        expect(resized.y + resized.height / 2).toBeCloseTo(image.y + image.height / 2)
      }
    }
  }
})

it('hands navigation gestures over before reference selection or editing, including locked references', () => {
  useCanvasReferences.getState().add({ id: 'pan', name: 'pan.png', src: '', x: 20, y: 40, width: 100, height: 80, angle: 0, flipX: false, flipY: false, locked: true })
  const navigate = vi.fn().mockReturnValue(true)
  const view = setup(true, viewport, false, navigate)
  const target = view.getByAltText('pan.png').parentElement!
  fireEvent.pointerDown(target, { button: 1, pointerId: 1 })
  fireEvent.pointerDown(target, { button: 0, pointerId: 2 })
  expect(navigate).toHaveBeenCalledTimes(2)
  expect(view.container.querySelector('.palette-selection-outline')).toBeNull()
  expect(useCanvasReferences.getState().pending).toBeNull()
  expect(useWorkspace.getState().sessions[0].history.length).toBe(1)
})

it('round trips floating coordinates for zoomed, rotated, mirrored views and keeps the outline in screen pixels', () => {
  const image = { x: -20, y: 7, width: 100, height: 40, angle: 23, flipX: true, flipY: false }
  for (const mirrored of [false, true]) for (const mirroredVertical of [false, true]) {
    const geometry = { ...viewport, interfaceScale: 1.25, view: { zoom: 3, panX: 45, panY: -9, rotation: 42, mirrored, mirroredVertical } }
    const screen = referenceScreenBounds(image, geometry)
    const restored = referenceDocumentBounds(screen, geometry)
    for (const key of ['x', 'y', 'width', 'height', 'angle'] as const) expect(restored[key]).toBeCloseTo(image[key])
    expect(restored.flipX).toBe(image.flipX)
    expect(restored.flipY).toBe(image.flipY)
    expect(referenceOutlinePath(screen)).toMatch(/^M.+L.+L.+L.+Z$/)
  }
})

it('brings a reference to the front from the shared menu and restores stacking on undo', () => {
  const refs = useCanvasReferences.getState()
  const image = { name: 'bottom.png', src: '', x: 0, y: 0, width: 100, height: 80, angle: 0, flipX: false, flipY: false, locked: false }
  refs.add({ ...image, id: 'bottom' }); refs.add({ ...image, id: 'top', name: 'top.png' })
  const view = setup()
  fireEvent.contextMenu(view.getByAltText('bottom.png'))
  fireEvent.click(view.getByRole('button', { name: '置于顶层' }))
  expect([...view.container.querySelectorAll('.canvas-reference img')].map((img) => img.getAttribute('alt'))).toEqual(['top.png', 'bottom.png'])
  act(() => useWorkspace.getState().undo())
  expect(useCanvasReferences.getState().images.map((image) => image.id)).toEqual(['bottom', 'top'])
  act(() => useWorkspace.getState().redo())
  expect(useCanvasReferences.getState().images.map((image) => image.id)).toEqual(['top', 'bottom'])
  const length = useWorkspace.getState().sessions[0].history.length
  fireEvent.click(view.getByRole('button', { name: '置于顶层' }))
  expect(useWorkspace.getState().sessions[0].history.length).toBe(length)
})

it('groups label scrubbing into a single history entry on pointer release outside the menu', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  useCanvasReferences.getState().add({ id: 'ref', name: 'scrub.png', src: '', x: 20, y: 40, width: 100, height: 80, angle: 0, flipX: false, flipY: false, locked: false })
  const view = setup()
  fireEvent.contextMenu(view.getByAltText('scrub.png'))
  const label = view.getByText('X', { selector: '.ui-field-label' })
  const history = useWorkspace.getState().sessions[0].history
  const before = history.length
  fireEvent.pointerDown(label, { button: 0, clientX: 10 })
  fireEvent.pointerMove(label, { buttons: 1, clientX: 30 })
  fireEvent.pointerMove(label, { buttons: 1, clientX: 50 })
  expect(useCanvasReferences.getState().images[0].x).toBeCloseTo(20.4)
  expect(history.length).toBe(before)
  fireEvent.pointerUp(window, { button: 0 })
  expect(history.length).toBe(before + 1)
  act(() => useWorkspace.getState().undo())
  expect(useCanvasReferences.getState().images[0].x).toBe(20)
})

it('routes reference wheel targets only to their owning canvas and retains canvas navigation modes', () => {
  const view = setup()
  const overlay = view.container.querySelector('.canvas-references')!
  expect(targetsCanvasSurface([overlay, view.stage], view.canvas)).toBe(true)
  expect(targetsCanvasSurface([overlay, view.stage], document.createElement('canvas'))).toBe(false)
  expect(targetsCanvasSurface([document.body], view.canvas)).toBe(false)
  expect(targetsCanvasSurface([view.canvas], view.canvas)).toBe(true)
  expect(referenceNavigationActive(true, 'pencil', false)).toBe(true)
  expect(referenceNavigationActive(false, 'hand', false)).toBe(true)
  expect(referenceNavigationActive(false, 'pencil', true)).toBe(true)
  expect(referenceNavigationActive(false, 'pencil', false)).toBe(false)
})

it('replaces the selected image from clipboard, preserves placement, and supports undo', async () => {
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,replacement')
  const read = vi.fn().mockResolvedValue({ width: 20, height: 10, data: new Uint8Array(800) })
  vi.stubGlobal('moonSprite', { readClipboardImage: read })
  const original = { id: 'replace', name: 'original.png', src: 'old', x: 20, y: 40, width: 100, height: 80, angle: 30, flipX: true, flipY: false, floating: true, locked: false }
  useCanvasReferences.getState().add(original)
  const view = setup()
  fireEvent.contextMenu(view.getByAltText('original.png'))
  fireEvent.keyDown(window, { key: 'Escape' })
  act(() => { expect(window.dispatchEvent(new CustomEvent(CANVAS_REFERENCE_PASTE_EVENT, { cancelable: true }))).toBe(false) })
  await waitFor(() => expect(useCanvasReferences.getState().images[0].src).toContain('replacement'))
  expect(useCanvasReferences.getState().images).toHaveLength(1)
  expect(useCanvasReferences.getState().images[0]).toMatchObject({ ...original, src: 'data:image/png;base64,replacement', height: 50 })
  act(() => useWorkspace.getState().undo())
  expect(useCanvasReferences.getState().images[0]).toMatchObject(original)
  act(() => useWorkspace.getState().redo())
  expect(useCanvasReferences.getState().images[0].height).toBe(50)
  act(() => useCanvasReferences.getState().update('replace', { locked: true }))
  act(() => { window.dispatchEvent(new CustomEvent(CANVAS_REFERENCE_PASTE_EVENT, { cancelable: true })) })
  expect(read).toHaveBeenCalledTimes(1)
})

it('keeps floating references above ordinary ones even after bringing an ordinary reference forward', () => {
  const refs = useCanvasReferences.getState()
  const base = { src: '', x: 0, y: 0, width: 100, height: 80, angle: 0, flipX: false, flipY: false, locked: false }
  refs.add({ ...base, id: 'floating', name: 'floating', floating: true })
  refs.add({ ...base, id: 'normal', name: 'normal' })
  refs.add({ ...base, id: 'other', name: 'other' })
  const view = setup()
  act(() => refs.bringToFront('normal'))
  expect([...view.container.querySelectorAll('.canvas-reference img')].map(img => img.getAttribute('alt'))).toEqual(['other', 'normal', 'floating'])
})

it('renders references smoothly by default and applies hard-edge preference changes live', () => {
  localStorage.removeItem(REFERENCE_SCALING_KEY)
  useCanvasReferences.getState().add({ id: 'smooth', name: 'smooth', src: '', x: 0, y: 0, width: 100, height: 80, angle: 0, flipX: false, flipY: false, locked: false })
  const view = setup()
  expect(view.getByAltText('smooth').style.imageRendering).toBe('auto')
  act(() => { localStorage.setItem(REFERENCE_SCALING_KEY, 'pixelated'); window.dispatchEvent(new Event('moonsprite:preferences-changed')) })
  expect(view.getByAltText('smooth').style.imageRendering).toBe('pixelated')
  localStorage.removeItem(REFERENCE_SCALING_KEY)
})

it.each([
  { label: '不透明度', key: 'opacity' as const, first: '75', last: '40', initial: 1, final: 0.4 },
  { label: '缩放', key: 'width' as const, first: '150', last: '200', initial: 30, final: 60 },
  { label: '旋转角度（°）', key: 'angle' as const, first: '45', last: '90', initial: 0, final: 90 }
])('previews $key while dragging and records only one undo entry on release', ({ label, key, first, last, initial, final }) => {
  useCanvasReferences.getState().add({ id: 'opacity', name: 'opacity.png', src: 'data:image/png;base64,test', x: 0, y: 0, width: 30, height: 20, angle: 0, flipX: false, flipY: false, locked: false })
  const view = setup()
  fireEvent.contextMenu(view.getByAltText('opacity.png').parentElement!)
  fireEvent.focus(view.getByRole('spinbutton', { name: label }))
  const slider = view.getByRole('slider', { name: label })
  const historyLength = () => useWorkspace.getState().sessions[0].history.length
  const before = historyLength()
  fireEvent.pointerDown(slider, { button: 0, pointerId: 3 })
  fireEvent.change(slider, { target: { value: first } })
  fireEvent.change(slider, { target: { value: last } })
  expect(useCanvasReferences.getState().images[0][key]).toBe(final)
  expect(historyLength()).toBe(before)
  fireEvent.pointerUp(window, { pointerId: 3 })
  expect(historyLength()).toBe(before + 1)
  act(() => useWorkspace.getState().undo())
  expect(useCanvasReferences.getState().images[0][key] ?? 1).toBe(initial)
  act(() => useWorkspace.getState().redo())
  expect(useCanvasReferences.getState().images[0][key]).toBe(final)
})

it('lets canvas drawing pass through locked references and retains the canvas unlock menu', () => {
  const image = { id: 'locked-draw', name: 'locked-draw.png', src: 'data:image/png;base64,test', x: 0, y: 0, width: 30, height: 20, angle: 25, flipX: false, flipY: false, locked: true }
  useCanvasReferences.getState().add(image)
  const view = setup(false)
  const reference = view.getByAltText(image.name).parentElement as HTMLElement
  expect(reference.style.pointerEvents).toBe('none')
  expect((reference.querySelector('.canvas-reference-hit-area') as HTMLElement).style.pointerEvents).toBe('none')
  const draw = vi.fn()
  view.canvas.addEventListener('pointerdown', draw)
  const point = referenceViewportPoint({ x: 15, y: 10 }, viewport)
  expect(fireEvent.pointerDown(view.canvas, { button: 0, pointerId: 1, clientX: point.x, clientY: point.y })).toBe(true)
  expect(draw).toHaveBeenCalledTimes(1)
  expect(useCanvasReferences.getState().pending).toBeNull()
  expect(useWorkspace.getState().sessions[0].history.length).toBe(1)
  fireEvent.contextMenu(view.canvas, { clientX: point.x, clientY: point.y })
  fireEvent.click(view.getByRole('button', { name: '解锁参考图' }))
  expect(useCanvasReferences.getState().images[0].locked).toBe(false)
  expect(reference.style.pointerEvents).toBe('')
  expect((reference.querySelector('.canvas-reference-hit-area') as HTMLElement).style.pointerEvents).toBe('')
})

it('deletes the selected reference through the command and supports undo without deleting locked references', () => {
  const image = { id: 'delete-ref', name: 'delete-ref.png', src: '', x: 0, y: 0, width: 30, height: 20, angle: 0, flipX: false, flipY: false, locked: true }
  useCanvasReferences.getState().add(image)
  const view = setup()
  fireEvent.contextMenu(view.getByAltText(image.name).parentElement!)
  const command = () => window.dispatchEvent(new CustomEvent(CANVAS_REFERENCE_DELETE_EVENT, { cancelable: true }))
  act(() => { expect(command()).toBe(false) })
  expect(useCanvasReferences.getState().images).toHaveLength(1)
  act(() => useCanvasReferences.getState().update(image.id, { locked: false }))
  act(() => { expect(command()).toBe(false) })
  expect(useCanvasReferences.getState().images).toHaveLength(0)
  expect(view.queryByRole('dialog', { name: '参考图' })).toBeNull()
  act(() => useWorkspace.getState().undo())
  expect(useCanvasReferences.getState().images[0].id).toBe(image.id)
})

it('dismisses properties on outside actions even when propagation is stopped, but keeps slider actions inside', () => {
  useCanvasReferences.getState().add({ id: 'dismiss-ref', name: 'dismiss-ref.png', src: '', x: 0, y: 0, width: 30, height: 20, angle: 0, flipX: false, flipY: false, locked: false })
  const view = setup()
  const reference = view.getByAltText('dismiss-ref.png').parentElement!
  const open = () => fireEvent.contextMenu(reference)
  open()
  fireEvent.focus(view.getByRole('spinbutton', { name: '不透明度' }))
  const slider = view.getByRole('slider')
  fireEvent.pointerDown(slider, { button: 0, pointerId: 1 })
  fireEvent.pointerUp(slider, { pointerId: 1 })
  expect(view.getByRole('dialog', { name: '参考图' })).toBeTruthy()
  const outside = document.createElement('button')
  document.body.append(outside)
  outside.addEventListener('pointerdown', event => event.stopPropagation())
  fireEvent.pointerDown(outside, { button: 0 })
  expect(view.queryByRole('dialog', { name: '参考图' })).toBeNull()
  open()
  fireEvent.wheel(view.canvas)
  expect(view.queryByRole('dialog', { name: '参考图' })).toBeNull()
  open()
  fireEvent.focusIn(outside)
  expect(view.queryByRole('dialog', { name: '参考图' })).toBeNull()
  outside.remove()
})

it.each([false, true])('prioritizes locked reference properties over right-button canvas tools (floating=%s)', (floating) => {
  const image = { id: 'right-priority', name: 'right-priority.png', src: '', x: 0, y: 0, width: 30, height: 20, angle: 45, flipX: false, flipY: false, locked: true, floating }
  useCanvasReferences.getState().add(image)
  const view = setup(false)
  const backgroundFill = vi.fn()
  view.canvas.addEventListener('pointerdown', event => { if (event.button === 2) backgroundFill() })
  const point = floating ? { x: 15, y: 10 } : referenceViewportPoint({ x: 15, y: 10 }, viewport)
  const historyLength = useWorkspace.getState().sessions[0].history.length
  expect(fireEvent.pointerDown(view.canvas, { button: 2, pointerId: 2, clientX: point.x, clientY: point.y })).toBe(false)
  expect(backgroundFill).not.toHaveBeenCalled()
  expect(view.getByRole('button', { name: '解锁参考图' })).toBeTruthy()
  fireEvent.contextMenu(view.canvas, { clientX: point.x, clientY: point.y })
  expect(view.getAllByRole('dialog', { name: '参考图' })).toHaveLength(1)
  expect(useWorkspace.getState().sessions[0].history.length).toBe(historyLength)
  // This point is inside the unrotated bounds but outside the rotated image.
  const clear = floating ? { x: 0, y: 0 } : referenceViewportPoint({ x: 0, y: 0 }, viewport)
  expect(fireEvent.pointerDown(view.canvas, { button: 2, pointerId: 3, clientX: clear.x, clientY: clear.y })).toBe(true)
  expect(backgroundFill).toHaveBeenCalledTimes(1)
  expect(view.queryByRole('dialog', { name: '参考图' })).toBeNull()
})
