import { PAINTING_CURSOR_TYPE_KEY, SELECTION_CROSSHAIR_PREFERENCE_KEY, USE_LOCAL_CURSORS_PREFERENCE_KEY } from '@/core/file-preferences'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PointerPressureAdapter } from '@/core/canvas-input'
import { useCanvasPenCursor } from './useCanvasPenCursor'
import { canvasCursors } from '@/core/canvas-visuals'
import { CANVAS_VIEWPORT_EVENT } from './canvas-viewport-events'
import { setNativeCursorVisible } from '@/platform/cursor-theme'

vi.mock('@/platform/cursor-theme', () => ({
  setNativeCursorVisible: vi.fn(async () => {}),
  cursorOverlayDescriptor: (_cursor: string, _native: boolean, scale: number, ui: number) => ({ source: '/cursor.png', size: 32 * scale / ui, hotspotX: 15 * scale / ui, hotspotY: 15 * scale / ui })
}))
beforeEach(() => { localStorage.setItem('moonsprite.preference.painting-cursor-shape', 'cross') })
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

function Harness({ cursorValue = canvasCursors.pencilBlack, stageBounds = () => ({ left: 10, top: 20 }) as DOMRect, paintingPoint }: {
  cursorValue?: string
  stageBounds?: () => DOMRect
  paintingPoint?: (point: { x: number; y: number }) => { x: number; y: number }
} = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pressureAdapterRef = useRef(new PointerPressureAdapter())
  const cursor = useCanvasPenCursor({ canvasRef, pressureAdapterRef, interfaceScale: 1, stageBounds, paintingPoint })
  return <><canvas ref={canvasRef} style={{ cursor: cursorValue }} onPointerMove={cursor.syncPenCursor} onPointerLeave={cursor.hidePenCursor} /><img ref={cursor.penCursorRef} hidden /><span data-testid="adaptive" ref={cursor.adaptiveCursorRef} hidden /></>
}

it.each(['mouse', 'pen'])('keeps the %s screen hotspot fixed when a transform toolbar moves the stage without pointer input', async pointerType => {
  let bounds = { left: 10, top: 20 } as DOMRect
  const stageBounds = () => bounds
  const view = render(<Harness stageBounds={stageBounds} />)
  const canvas = view.container.querySelector('canvas')!
  const move = new Event('pointermove', { bubbles: true })
  Object.assign(move, { clientX: 140, clientY: 170, pointerType, pointerId: 1 })
  fireEvent(canvas, move)
  const overlay = view.getByTestId('adaptive')
  expect(overlay.style.transform).toBe('translate3d(115px, 135px, 0)')
  bounds = { left: 30, top: 52 } as DOMRect
  act(() => window.dispatchEvent(new CustomEvent(CANVAS_VIEWPORT_EVENT)))
  expect(overlay.style.transform).toBe('translate3d(95px, 103px, 0)')
  await act(async () => { canvas.style.cursor = canvasCursors.move })
  expect(overlay.hidden).toBe(true)
  if (pointerType === 'pen') expect(view.container.querySelector('img')!.style.transform).toBe('translate3d(95px, 103px, 0)')
  bounds = { left: 10, top: 20 } as DOMRect
  view.rerender(<Harness stageBounds={stageBounds} />)
  await act(async () => { canvas.style.cursor = canvasCursors.pencilBlack })
  expect(overlay.style.transform).toBe('translate3d(115px, 135px, 0)')
})

it('uses current pixel alignment after rerender and on subsequent cursor-style changes', async () => {
  localStorage.setItem('moonsprite.preference.painting-cursor-align-pixel', 'true')
  const view = render(<Harness paintingPoint={() => ({ x: 30, y: 40 })} />)
  const canvas = view.container.querySelector('canvas')!
  const move = new Event('pointermove', { bubbles: true })
  Object.assign(move, { clientX: 40, clientY: 70, pointerType: 'mouse', pointerId: 1 })
  fireEvent(canvas, move)
  const latestPoint = vi.fn(() => ({ x: 32, y: 42 }))
  view.rerender(<Harness paintingPoint={latestPoint} />)
  expect(view.getByTestId('adaptive').style.transform).toBe('translate3d(17px, 27px, 0)')
  latestPoint.mockClear()
  await act(async () => { canvas.style.cursor = canvasCursors.pencilWhite })
  expect(latestPoint).toHaveBeenCalled()
  expect(view.getByTestId('adaptive').style.transform).toBe('translate3d(17px, 27px, 0)')
})

it.each(['blur', 'moonsprite:extension-pointer-enter'])('clears the canvas overlay on %s without a canvas leave event', (type) => {
  const view = render(<Harness />)
  const canvas = view.container.querySelector('canvas')!
  const move = new Event('pointermove', { bubbles: true })
  Object.assign(move, { clientX: 40, clientY: 70, pointerType: 'mouse', pointerId: 1 })
  fireEvent(canvas, move)
  expect(view.getByTestId('adaptive').hidden).toBe(false)
  fireEvent(window, new Event(type))
  expect(view.getByTestId('adaptive').hidden).toBe(true)
  expect(canvas.dataset.adaptiveCursor).toBeUndefined()
})

it('uses one backdrop mask for a pointer crossing dark and light regions, then clears it on tool change and leave', async () => {
  const view = render(<Harness />)
  const canvas = view.container.querySelector('canvas')!
  const overlay = view.getByTestId('adaptive')
  const move = (x: number, y: number) => {
    const event = new Event('pointermove', { bubbles: true })
    Object.assign(event, { clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1 })
    fireEvent(canvas, event)
  }
  move(40, 70)
  expect(overlay.hidden).toBe(false)
  expect(overlay.style.transform).toBe('translate3d(15px, 35px, 0)')
  expect(overlay.style.maskImage).toContain('/cursor.png')
  expect(overlay.style.backdropFilter).toContain('invert(1)')
  expect(canvas.dataset.adaptiveCursor).toBe('true')
  expect(view.container.querySelector('img')!.hidden).toBe(true)

  await act(async () => { canvas.style.cursor = canvasCursors.pencilWhite })
  expect(overlay.hidden).toBe(false)
  await act(async () => { canvas.style.cursor = canvasCursors.move })
  expect(overlay.hidden).toBe(true)
  expect(canvas.dataset.adaptiveCursor).toBeUndefined()
  await act(async () => { canvas.style.cursor = canvasCursors.pencilBlack })
  move(80, 90)
  expect(overlay.style.transform).toBe('translate3d(55px, 55px, 0)')
  fireEvent.pointerLeave(canvas)
  expect(overlay.hidden).toBe(true)
  expect(canvas.dataset.adaptiveCursor).toBeUndefined()
})

it.each(['mouse', 'pen'])('uses a system crosshair for simple native %s input and keeps sprite crosshairs independent', (pointerType) => {
  localStorage.setItem(PAINTING_CURSOR_TYPE_KEY, 'simple')
  localStorage.setItem(USE_LOCAL_CURSORS_PREFERENCE_KEY, 'true')
  const view = render(<Harness />)
  const canvas = view.container.querySelector('canvas')!
  const move = new Event('pointermove', { bubbles: true })
  Object.assign(move, { clientX: 40, clientY: 70, pointerType, pointerId: 1 })
  fireEvent(canvas, move)
  expect(document.documentElement.dataset.penInput).toBeUndefined()
  expect(canvas.dataset.paintingCursor).toBe('system')
  expect(view.getByTestId('adaptive')).not.toBeVisible()
  view.unmount()
  localStorage.setItem(PAINTING_CURSOR_TYPE_KEY, 'sprite')
  const sprite = render(<Harness />)
  fireEvent(sprite.container.querySelector('canvas')!, move)
  expect(sprite.getByTestId('adaptive')).toBeVisible()
  expect(sprite.container.querySelector('canvas')!.dataset.paintingCursor).toBeUndefined()
})

it.each([canvasCursors.crosshair, canvasCursors.selectionBlack, canvasCursors.selectionWhite])('uses the native selection cursor %s when the painting overlay is disabled', (cursorValue) => {
  localStorage.setItem(SELECTION_CROSSHAIR_PREFERENCE_KEY, 'false')
  localStorage.setItem(USE_LOCAL_CURSORS_PREFERENCE_KEY, 'true')
  localStorage.setItem(PAINTING_CURSOR_TYPE_KEY, 'sprite')
  const view = render(<Harness cursorValue={cursorValue} />)
  const canvas = view.container.querySelector('canvas')!
  const move = new Event('pointermove', { bubbles: true })
  Object.assign(move, { clientX: 40, clientY: 70, pointerType: 'mouse', pointerId: 1 })
  fireEvent(canvas, move)
  expect(canvas.dataset.paintingCursor).toBe('system')
  expect(view.getByTestId('adaptive')).not.toBeVisible()
})

it.each([canvasCursors.move, canvasCursors.copy])('does not measure stage geometry for the native mouse cursor %s', cursorValue => {
  const stageBounds = vi.fn(() => ({ left: 10, top: 20 }) as DOMRect)
  const view = render(<Harness cursorValue={cursorValue} stageBounds={stageBounds} />)
  const canvas = view.container.querySelector('canvas')!
  for (let x = 0; x < 1000; x++) {
    const event = new Event('pointermove', { bubbles: true })
    Object.assign(event, { clientX: x, clientY: 70, pointerType: 'mouse', pointerId: 1 })
    fireEvent(canvas, event)
  }
  expect(stageBounds).not.toHaveBeenCalled()
  expect(view.getByTestId('adaptive').hidden).toBe(true)
  expect(view.container.querySelector('img')!.hidden).toBe(true)
})

it('measures software cursor geometry once per input and still follows external size and cursor changes', async () => {
  let bounds = { left: 10, top: 20 } as DOMRect
  const stageBounds = vi.fn(() => bounds)
  const view = render(<Harness stageBounds={stageBounds} />)
  const canvas = view.container.querySelector('canvas')!
  for (let x = 0; x < 1000; x++) {
    await act(async () => {
      // The tool handler writes the cursor before the device router syncs it.
      canvas.style.cursor = x % 2 ? canvasCursors.pencilWhite : canvasCursors.pencilBlack
      const event = new Event('pointermove', { bubbles: true })
      Object.assign(event, { clientX: x, clientY: 70, pointerType: 'mouse', pointerId: 1 })
      fireEvent(canvas, event)
    })
  }
  expect(stageBounds).toHaveBeenCalledTimes(1000)
  expect(view.getByTestId('adaptive').style.transform).toBe('translate3d(974px, 35px, 0)')
  bounds = { left: 30, top: 52 } as DOMRect
  await act(async () => { canvas.style.width = '800px' })
  expect(stageBounds).toHaveBeenCalledTimes(1001)
  expect(view.getByTestId('adaptive').style.transform).toBe('translate3d(954px, 3px, 0)')
  await act(async () => { canvas.style.cursor = canvasCursors.move })
  expect(stageBounds).toHaveBeenCalledTimes(1001)
  expect(view.getByTestId('adaptive').hidden).toBe(true)
  await act(async () => { canvas.style.cursor = canvasCursors.pencilBlack })
  expect(stageBounds).toHaveBeenCalledTimes(1002)
  expect(view.getByTestId('adaptive').style.transform).toBe('translate3d(954px, 3px, 0)')
})

const pointerPacket = (canvas: HTMLCanvasElement, type: string, x: number, timeStamp: number, pointerType = 'pen', buttons = 0, pointerId = 7) => {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { clientX: x, clientY: 70, pointerType, buttons, pointerId })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  fireEvent(canvas, event)
}

it.each(['mouse', 'pen'])('updates the %s overlay from raw input without waiting for pointermove, layout, or native IPC', pointerType => {
  const stageBounds = vi.fn(() => ({ left: 10, top: 20 }) as DOMRect)
  const view = render(<Harness stageBounds={stageBounds} />)
  const canvas = view.container.querySelector('canvas')!
  const overlay = view.getByTestId('adaptive')
  pointerPacket(canvas, 'pointerrawupdate', 40, 1, pointerType)
  expect(overlay.hidden).toBe(true)
  pointerPacket(canvas, 'pointermove', 40, 2, pointerType)
  stageBounds.mockClear()
  vi.mocked(setNativeCursorVisible).mockClear()
  const frame = vi.spyOn(window, 'requestAnimationFrame')
  for (let x = 41; x <= 140; x++) pointerPacket(canvas, 'pointerrawupdate', x, x, pointerType)
  expect(overlay.style.transform).toBe('translate3d(115px, 35px, 0)')
  expect(stageBounds).not.toHaveBeenCalled()
  expect(setNativeCursorVisible).not.toHaveBeenCalled()
  expect(frame).not.toHaveBeenCalled()
  pointerPacket(canvas, 'pointermove', 90, 90, pointerType)
  expect(overlay.style.transform).toBe('translate3d(115px, 35px, 0)')
  // Browsers without raw events keep working through ordinary moves.
  pointerPacket(canvas, 'pointermove', 160, 160, pointerType)
  expect(overlay.style.transform).toBe('translate3d(135px, 35px, 0)')
})

it.each(['cross', 'dot', 'pixel-cross'])('preserves pixel alignment for %s during a pen stroke and viewport changes', shape => {
  localStorage.setItem('moonsprite.preference.painting-cursor-shape', shape)
  localStorage.setItem('moonsprite.preference.painting-cursor-align-pixel', 'true')
  let bounds = { left: 10, top: 20 } as DOMRect
  const view = render(<Harness stageBounds={() => bounds} paintingPoint={point => ({ x: Math.floor(point.x / 8) * 8 + 4, y: 52 })} />)
  const canvas = view.container.querySelector('canvas')!
  const hotspot = shape === 'dot' ? 1.5 : 15
  pointerPacket(canvas, 'pointermove', 40, 1, 'pen', 1)
  pointerPacket(canvas, 'pointerrawupdate', 80, 2, 'pen', 1)
  expect(view.getByTestId('adaptive').style.transform).toBe(`translate3d(${68 - hotspot}px, ${52 - hotspot}px, 0)`)
  bounds = { left: 30, top: 20 } as DOMRect
  act(() => window.dispatchEvent(new CustomEvent(CANVAS_VIEWPORT_EVENT)))
  pointerPacket(canvas, 'pointerrawupdate', 96, 3, 'pen', 1)
  expect(view.getByTestId('adaptive').style.transform).toBe(`translate3d(${68 - hotspot}px, ${52 - hotspot}px, 0)`)
})

it('does not let raw touch, compatibility mouse, button changes, or dismissed input take over the pen cursor', () => {
  const view = render(<Harness cursorValue={canvasCursors.move} />)
  const canvas = view.container.querySelector('canvas')!
  const image = view.container.querySelector('img')!
  pointerPacket(canvas, 'pointermove', 40, 1)
  pointerPacket(canvas, 'pointerrawupdate', 60, 2)
  expect(image.style.transform).toBe('translate3d(35px, 35px, 0)')
  for (const [type, buttons, id] of [['touch', 0, 7], ['mouse', 0, 7]] as const) {
    pointerPacket(canvas, 'pointerrawupdate', 100, 3, type, buttons, id)
    expect(image.style.transform).toBe('translate3d(35px, 35px, 0)')
  }
  pointerPacket(canvas, 'pointerrawupdate', 100, 3, 'pen', 1, 7)
  expect(image.style.transform).toBe('translate3d(75px, 35px, 0)')
  pointerPacket(canvas, 'pointerrawupdate', 120, 3, 'pen', 0, 8)
  expect(image.style.transform).toBe('translate3d(75px, 35px, 0)')
  fireEvent(window, new Event('blur'))
  pointerPacket(canvas, 'pointerrawupdate', 100, 4)
  expect(image.hidden).toBe(true)
  expect(image.style.transform).toBe('translate3d(75px, 35px, 0)')
  pointerPacket(canvas, 'pointermove', 110, 5)
  fireEvent.pointerLeave(canvas)
  pointerPacket(canvas, 'pointerrawupdate', 120, 6)
  expect(image.hidden).toBe(true)
  view.unmount()
  pointerPacket(canvas, 'pointerrawupdate', 130, 7)
  expect(image.hidden).toBe(true)
})
