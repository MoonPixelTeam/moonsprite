import { describe, expect, it } from 'vitest'
import { spaceDragScrollPosition } from './useSpaceDragScroll'

describe('spaceDragScrollPosition', () => {
  it('moves both scroll axes opposite to the dragged hand', () => {
    expect(spaceDragScrollPosition({
      startClientX: 80,
      startClientY: 50,
      clientX: 44,
      clientY: 77,
      startScrollLeft: 120,
      startScrollTop: 90,
      maxScrollLeft: 300,
      maxScrollTop: 200
    })).toEqual({ left: 156, top: 63 })
  })

  it('keeps the scroll position within the native container bounds', () => {
    expect(spaceDragScrollPosition({
      startClientX: 20,
      startClientY: 20,
      clientX: 300,
      clientY: -300,
      startScrollLeft: 10,
      startScrollTop: 10,
      maxScrollLeft: 100,
      maxScrollTop: 80
    })).toEqual({ left: 0, top: 80 })
  })
})
