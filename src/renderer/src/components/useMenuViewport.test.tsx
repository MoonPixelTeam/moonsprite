import { useRef } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useMenuViewport } from './useMenuViewport'

function Menu({ submenu = false }: { submenu?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useMenuViewport(ref)
  return <div ref={ref}><div data-testid="anchor"><div data-testid="menu" className={`menu-popover ${submenu ? 'menu-submenu-popover' : ''}`} /></div></div>
}

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) })

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps a wide translated menu inside the viewport and resets placement after resize', () => {
  vi.stubGlobal('innerWidth', 800)
  vi.stubGlobal('innerHeight', 600)
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([rect(0, 0, 1, 1)] as unknown as DOMRectList)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'menu' ? rect(650, 30, 400, 240) : rect(650, 0, 100, 30)
  })
  const view = render(<Menu />)
  expect(view.getByTestId('menu').style.left).toBe('-258px')
  vi.stubGlobal('innerWidth', 1200)
  fireEvent(window, new Event('resize'))
  expect(view.getByTestId('menu').style.left).toBe('')
})

it('flips a newly revealed submenu left and moves it above the bottom edge', () => {
  vi.stubGlobal('innerWidth', 800)
  vi.stubGlobal('innerHeight', 600)
  let visible = false
  let resize = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() =>
    (visible ? [rect(0, 0, 1, 1)] : []) as unknown as DOMRectList)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid !== 'menu') return rect(500, 490, 200, 30)
    return rect(this.style.right ? 102 : 698, 485, 400, 200)
  })
  const view = render(<Menu submenu />)
  expect(view.getByTestId('menu').style.right).toBe('')
  visible = true
  resize()
  expect(view.getByTestId('menu').style.right).toBe('calc(100% - 2px)')
  expect(view.getByTestId('menu').style.top).toBe('-98px')
  view.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})
