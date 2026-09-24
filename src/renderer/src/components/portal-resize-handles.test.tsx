import { useRef } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PortalResizeHandles } from './floating-panel'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('keeps all edge handles interactive and updates their viewport geometry after moving', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(Number.parseFloat(this.style.left), 80, 400, 300)
  })
  const onResize = vi.fn()
  function Harness({ left }: { left: number }) {
    const ref = useRef<HTMLElement>(null)
    const position = { left, top: 80, width: 400, height: 300, zIndex: 601 }
    return <section ref={ref} style={position}><PortalResizeHandles targetRef={ref} position={position} onResize={onResize} /></section>
  }
  const view = render(<Harness left={100} />)
  const portal = document.querySelector<HTMLElement>('.floating-resize-portal')!
  expect(portal.style.width).toBe('')
  expect(portal.style.getPropertyValue('--resize-left')).toBe('100px')
  expect(portal.style.getPropertyValue('--resize-width')).toBe('400px')
  expect(portal.style.getPropertyValue('--resize-height')).toBe('300px')
  expect(portal.style.getPropertyValue('--resize-z-index')).toBe('602')
  const directions = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']
  for (const direction of directions) {
    fireEvent.pointerDown(portal.querySelector(`.resize-${direction}`)!, { button: 0 })
    expect(onResize).toHaveBeenLastCalledWith(expect.anything(), direction)
  }
  view.rerender(<Harness left={240} />)
  expect(portal.style.getPropertyValue('--resize-left')).toBe('240px')
  view.unmount()
  expect(document.querySelector('.floating-resize-portal')).toBeNull()
})
