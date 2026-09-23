import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCanvasTouchNavigation, type TouchNavigationPorts } from './canvas-touch-navigation'

const setup = () => {
  const state: ReturnType<TouchNavigationPorts['read']> = {
    preferences: { api: 'auto', touchMode: 'navigate', twoFingerZoomEnabled: true, twoFingerRotateEnabled: true },
    view: { zoom: 1, panX: 0, panY: 0, rotation: 0 },
    documentSize: { width: 100, height: 100 }, viewportSize: { width: 500, height: 500 }, rotationIndicatorPosition: 'view'
  }
  const ports: TouchNavigationPorts = {
    read: () => state, beginPan: vi.fn(), endPan: vi.fn(),
    preview: vi.fn(view => { state.view = view }), finishPinch: vi.fn(),
    constrain: view => view, clampZoom: zoom => zoom, grabbingCursor: 'grabbing', history: vi.fn(), cancelDrawing: vi.fn(), sample: vi.fn(), feedback: vi.fn()
  }
  const target = document.createElement('canvas')
  const captures = new Set<number>()
  target.setPointerCapture = id => { captures.add(id) }
  target.hasPointerCapture = id => captures.has(id)
  target.releasePointerCapture = id => { captures.delete(id) }
  const event = (pointerId: number, x = 0, y = 0) => ({pointerType: 'touch', pointerId, clientX: x, clientY: y, currentTarget: target, preventDefault: vi.fn()})
  return { state, ports, event, captures, navigation: createCanvasTouchNavigation(() => ports) }
}

describe('touch navigation ownership', () => {
  afterEach(() => vi.useRealTimers())
  it('transitions pan → pinch → pan and finishes navigation without invoking drawing release', () => {
    const {navigation, ports, event, state, captures} = setup()
    expect(navigation.down(event(1))).toBe(true)
    navigation.down(event(2, 100))
    expect(ports.endPan).toHaveBeenCalledWith(true)
    navigation.move(event(2, 200))
    expect(state.view.zoom).toBe(2)
    expect(navigation.up(event(2, 200))).toBe(true)
    expect(ports.beginPan).toHaveBeenLastCalledWith({x: 0, y: 0})
    expect(captures.has(2)).toBe(false)
    expect(navigation.up(event(1))).toBe(true)
    expect(ports.history).not.toHaveBeenCalled()
  })

  it('cancellation discards all pointer membership and the next reused id begins a new pan', () => {
    const {navigation, ports, event} = setup()
    navigation.down(event(1)); navigation.down(event(2, 100))
    expect(navigation.up(event(2), true)).toBe(true)
    expect(ports.endPan).toHaveBeenLastCalledWith(false)
    expect(ports.finishPinch).toHaveBeenCalledExactlyOnceWith(false)
    navigation.down(event(2, 30))
    expect(ports.beginPan).toHaveBeenLastCalledWith({x: 30, y: 0})
    expect(navigation.move(event(2, 40))).toBe(false)
  })

  it('keeps separate canvases independent and resets on device lifecycle changes', () => {
    const first = setup(), second = setup()
    first.navigation.down(first.event(1)); first.navigation.down(first.event(2, 100))
    second.navigation.down(second.event(1))
    expect(second.navigation.move(second.event(1, 100))).toBe(false)
    expect(second.ports.preview).not.toHaveBeenCalled()
    first.navigation.reset()
    expect(first.navigation.move(first.event(2, 200))).toBe(false)
  })

  it('reads current input preferences and does not capture draw-mode touches', () => {
    const {navigation, state, event, ports} = setup()
    state.preferences.touchMode = 'draw'
    expect(navigation.down(event(1))).toBe(false)
    expect(ports.beginPan).not.toHaveBeenCalled()
    state.preferences.touchMode = 'disabled'
    expect(navigation.down(event(1))).toBe(true)
    expect(navigation.move(event(1))).toBe(true)
    expect(ports.preview).not.toHaveBeenCalled()
  })

  it.each([2, 3])('runs a %i finger tap once and only after all fingers lift', count => {
    const { navigation, ports, event } = setup()
    for (let i = 1; i <= count; i++) navigation.down(event(i, i * 50))
    for (let i = 1; i < count; i++) navigation.up(event(i, i * 50))
    expect(ports.history).not.toHaveBeenCalled()
    navigation.up(event(count, count * 50))
    expect(ports.history).toHaveBeenCalledExactlyOnceWith(count === 2 ? 'undo' : 'redo')
  })

  it('does not undo after a moved or held gesture', () => {
    vi.useFakeTimers()
    const { navigation, ports, event } = setup()
    navigation.down(event(1)); navigation.down(event(2, 100))
    vi.advanceTimersByTime(400)
    navigation.up(event(1)); navigation.up(event(2, 100))
    expect(ports.history).not.toHaveBeenCalled()
    navigation.down(event(1)); navigation.down(event(2, 100)); navigation.move(event(2, 140))
    navigation.up(event(1)); navigation.up(event(2, 140))
    expect(ports.history).not.toHaveBeenCalled()
  })

  it('keeps the original pinch pair stable when a third finger arrives', () => {
    const { navigation, state, event } = setup()
    navigation.down(event(1)); navigation.down(event(2, 100)); navigation.move(event(2, 150))
    const before = { ...state.view }
    navigation.down(event(3, 400)); navigation.move(event(3, 450))
    expect(state.view).toEqual(before)
    navigation.up(event(2, 150)); navigation.move(event(3, 450))
    expect(state.view).toEqual(before)
  })

  it('rolls back only an initial finger stroke when a quick second finger takes navigation', () => {
    const { navigation, state, event, ports } = setup()
    state.preferences.touchMode = 'draw'
    expect(navigation.down(event(1))).toBe(false)
    expect(navigation.down(event(2, 100))).toBe(true)
    expect(ports.cancelDrawing).toHaveBeenCalledOnce()
    navigation.move(event(2, 200))
    expect(state.view.zoom).toBe(2)
    navigation.up(event(2, 200)); expect(navigation.up(event(1))).toBe(true)
  })

  it('never steals an established finger stroke for navigation', () => {
    const { navigation, state, event, ports } = setup()
    state.preferences.touchMode = 'draw'
    navigation.down(event(1)); expect(navigation.move(event(1, 30))).toBe(false)
    expect(navigation.down(event(2, 100))).toBe(true)
    navigation.move(event(2, 200)); navigation.up(event(2, 200))
    expect(ports.cancelDrawing).not.toHaveBeenCalled()
    expect(ports.preview).not.toHaveBeenCalled()
    expect(navigation.up(event(1, 30))).toBe(false)
  })

  it('ignores palm contacts during and immediately after a pen stroke until a fresh contact', () => {
    vi.useFakeTimers()
    const { navigation, event, ports } = setup()
    navigation.penDown(); expect(navigation.down(event(1))).toBe(true)
    navigation.penUp(); vi.advanceTimersByTime(300)
    expect(navigation.move(event(1, 100))).toBe(true)
    navigation.up(event(1, 100))
    expect(ports.beginPan).not.toHaveBeenCalled()
    navigation.down(event(2))
    expect(ports.beginPan).toHaveBeenCalledOnce()
  })

  it('restores the starting view on cancel and releases capture', () => {
    const { navigation, event, state, captures } = setup(), before = { ...state.view }
    navigation.down(event(1)); navigation.down(event(2, 100)); navigation.move(event(2, 200))
    navigation.up(event(2, 200), true)
    expect(state.view).toEqual(before); expect(captures.size).toBe(0)
  })

  it('samples only after stationary long press and clears its timer on reset', () => {
    vi.useFakeTimers()
    const { navigation, event, state, ports } = setup()
    state.preferences.longPressEyedropper = true
    navigation.down(event(1)); vi.advanceTimersByTime(449)
    expect(ports.sample).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect(ports.sample).toHaveBeenCalledOnce()
    expect(navigation.move(event(1, 30))).toBe(false)
    expect(navigation.up(event(1, 30))).toBe(false)
    navigation.down(event(2)); navigation.reset(); vi.advanceTimersByTime(600)
    expect(ports.sample).toHaveBeenCalledOnce()
  })

  it('allows touch navigation even when the pen API is disabled', () => {
    const { navigation, state, event, ports } = setup()
    state.preferences.api = 'disabled'
    navigation.down(event(1)); expect(ports.beginPan).toHaveBeenCalledOnce()
  })

  it('keeps the same pinch anchor when the stage is offset inside the window', () => {
    const origin = setup(), offset = setup()
    offset.ports.viewportPoint = point => ({ x: point.x - 200, y: point.y - 80 })
    origin.navigation.down(origin.event(1, 100, 100)); origin.navigation.down(origin.event(2, 200, 100))
    offset.navigation.down(offset.event(1, 300, 180)); offset.navigation.down(offset.event(2, 400, 180))
    origin.navigation.move(origin.event(2, 300, 100)); offset.navigation.move(offset.event(2, 500, 180))
    expect(offset.state.view).toEqual(origin.state.view)
  })
})
