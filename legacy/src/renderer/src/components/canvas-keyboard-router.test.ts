import { describe, expect, it, vi } from 'vitest'
import { createCanvasKeyboardRouter } from './canvas-keyboard-router'

describe('resident canvas keyboard routing', () => {
  it('dispatches a key once to the active canvas and keeps inactive modifiers current', () => {
    const router = createCanvasKeyboardRouter(window)
    const active = vi.fn(), inactive = vi.fn(), modifiers = vi.fn()
    const a = router.register({ isActive: () => true, keyDown: active })
    const b = router.register({ isActive: () => false, keyDown: inactive, inactiveModifiers: modifiers })
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true }))
      expect(active).toHaveBeenCalledTimes(1)
      expect(inactive).not.toHaveBeenCalled()
      expect(modifiers.mock.calls[0][0].ctrlKey).toBe(true)
    } finally { a(); b() }
  })

  it('releases a chord in its original canvas after switching documents', () => {
    const router = createCanvasKeyboardRouter(window)
    let active = 'a'
    const releaseA = vi.fn(), releaseB = vi.fn()
    const a = router.register({ isActive: () => active === 'a', keyUp: releaseA })
    const b = router.register({ isActive: () => active === 'b', keyUp: releaseB })
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true }))
      active = 'b'
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', code: 'ControlLeft' }))
      expect(releaseA).toHaveBeenCalledTimes(1)
      expect(releaseB).toHaveBeenCalledTimes(1)
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'x', code: 'KeyX' }))
      expect(releaseA).toHaveBeenCalledTimes(1)
    } finally { a(); b() }
  })

  it('preserves immediate propagation stops and removes listeners after disposal', () => {
    const router = createCanvasKeyboardRouter(window)
    const later = vi.fn()
    const first = router.register({ isActive: () => true, keyDown: (event) => event.stopImmediatePropagation() })
    const second = router.register({ isActive: () => true, keyDown: later })
    const event = new KeyboardEvent('keydown', { key: 'Escape' })
    const original = event.stopImmediatePropagation
    try {
      window.dispatchEvent(event)
      expect(later).not.toHaveBeenCalled()
      expect(event.stopImmediatePropagation).toBe(original)
    } finally { first(); second() }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    expect(later).not.toHaveBeenCalled()
  })
})
