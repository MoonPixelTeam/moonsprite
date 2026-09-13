import { describe, expect, it, vi } from 'vitest'
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
    constrain: view => view, clampZoom: zoom => zoom, grabbingCursor: 'grabbing'
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
  it('transitions pan → pinch → pan and leaves final pan completion to the canvas', () => {
    const {navigation, ports, event, state, captures} = setup()
    expect(navigation.down(event(1))).toBe(true)
    navigation.down(event(2, 100))
    expect(ports.endPan).toHaveBeenCalledWith(true)
    navigation.move(event(2, 200))
    expect(state.view.zoom).toBe(2)
    expect(navigation.up(event(2, 200))).toBe(true)
    expect(ports.beginPan).toHaveBeenLastCalledWith({x: 0, y: 0})
    expect(captures.has(2)).toBe(false)
    expect(navigation.up(event(1))).toBe(false)
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
})
