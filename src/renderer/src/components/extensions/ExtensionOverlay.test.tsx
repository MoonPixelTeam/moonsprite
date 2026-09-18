import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExtensionOverlay } from './ExtensionOverlay'
import { overlayBounds, overlayRegion } from './extension-overlay-geometry'
const bridge = vi.hoisted(() => ({ surface: null as any }))
vi.mock('./ExtensionWindow', () => ({ ExtensionWindow: ({ surface }: any) => { bridge.surface = surface; return <iframe title="surface" /> } }))
vi.mock('@/platform/extension-window', () => ({ extensionPointerPosition: async () => ({ x: 50, y: 70 }), extensionHostBounds: async () => ({ x: 5, y: 10 }) }))
afterEach(cleanup)
it('updates local bounds and clips input without native windows; preserves bounds when hidden', async () => {
  const definition = { windowId: 'widget', resourceId: 'page', visible: true, bounds: { x: 10, y: 20, width: 200, height: 100 } }
  const props = { extensionId: 'extension', definition, onClose: vi.fn() }
  const view = render(<ExtensionOverlay {...props} />)
  const element = document.querySelector('[data-extension-overlay]') as HTMLElement
  expect(element.style.clipPath).toBe('inset(50%)')
  await bridge.surface.request('window.setHitRegion', { sourceWidth: 100, sourceHeight: 50, spans: [{ x: 2, y: 3, width: 4 }] })
  expect(element.style.clipPath).toBe('path("M4 6h8v2h-8Z")')
  await bridge.surface.request('window.setBounds', { bounds: { x: 30, y: 40, width: 200, height: 100 } })
  expect(element.style.left).toBe('30px')
  view.rerender(<ExtensionOverlay {...props} definition={{ ...definition, visible: false }} />)
  expect(element.style.left).toBe('30px')
  expect((element.parentElement as HTMLElement).style.display).toBe('none')
  expect(await bridge.surface.request('window.getPointerPosition')).toEqual({ x: 45, y: 60 })
})
it('notifies host resize and removes its subscription on unmount', () => {
  const view = render(<ExtensionOverlay extensionId="a" definition={{windowId:'a',resourceId:'b',visible:true,bounds:{x:0,y:0,width:10,height:10}}} onClose={() => {}} />)
  const listener = vi.fn()
  bridge.surface.subscribe(listener)
  act(() => fireEvent(window, new Event('resize')))
  expect(listener).toHaveBeenCalledWith({ kind: 'host-geometry' })
  view.unmount(); listener.mockClear()
  fireEvent(window, new Event('resize'))
  expect(listener).not.toHaveBeenCalled()
})
it('rejects non-finite geometry, excessive allocation and malformed regions', () => {
  expect(() => overlayBounds({ x: NaN, y: 0, width: 10, height: 10 })).toThrow()
  expect(() => overlayBounds({ x: 0, y: 0, width: 99999, height: 10 })).toThrow()
  expect(() => overlayRegion({ sourceWidth: 10, sourceHeight: 10, spans: [{ x: 9, y: 0, width: 2 }] })).toThrow()
  expect(() => overlayRegion({ sourceWidth: 10, sourceHeight: 10, spans: Array(65537).fill({ x: 0, y: 0, width: 1 }) })).toThrow()
})
