import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PanelActions } from './PanelActions'

vi.mock('../I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../PixelUtilityIcon', () => ({ PixelUtilityIcon: () => null }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('keeps every action reachable after narrowing and restores them when widened', () => {
  let width = 320
  let resize = () => {}
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() {} })
  const click = vi.fn()
  render(<section className="panel"><PanelActions><button onClick={click}>Zoom</button><button disabled>Delete</button><button>Close</button></PanelActions></section>)
  expect(screen.queryByText('panel.moreActions')).toBeNull()
  expect(screen.getByText('Zoom')).toBeTruthy()
  act(() => { width = 42; resize() })
  expect(screen.queryByText('Zoom')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'panel.moreActions' }))
  expect(screen.getByRole('dialog').parentElement).toBe(document.body)
  fireEvent.click(screen.getByText('Zoom'))
  expect(click).toHaveBeenCalledOnce()
  expect((screen.getByText('Delete') as HTMLButtonElement).disabled).toBe(true)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  act(() => { width = 320; resize() })
  expect(screen.getByText('Zoom')).toBeTruthy()
})
