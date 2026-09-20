import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { ReferenceImagePanel, ReferenceImageWindows } from './ReferenceImagePanel'
import { addClipboardReference, REFERENCE_PASTE_EVENT, useReferenceImages } from './reference-image-state'
import { useWorkspace } from '@/store/workspace'

beforeEach(() => {
  useReferenceImages.setState({ images: [], activeId: null, windows: [] })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData: vi.fn() } as unknown as CanvasRenderingContext2D)
})
afterEach(() => { cleanup(); useReferenceImages.setState({ images: [], activeId: null, windows: [] }); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('pastes into the reference library without changing the document and retains images after remount', async () => {
  const read = vi.fn().mockResolvedValue({ width: 2, height: 1, data: new Uint8Array(8) })
  vi.stubGlobal('moonSprite', { readClipboardImage: read })
  const before = useWorkspace.getState().sessions
  const view = render(<ReferenceImagePanel docked onClose={() => {}} />, { wrapper: I18nProvider })
  fireEvent.click(view.container.querySelector('header button')!)
  await waitFor(() => expect(useReferenceImages.getState().images).toHaveLength(1))
  expect(useWorkspace.getState().sessions).toBe(before)
  const first = useReferenceImages.getState().activeId
  act(() => view.container.querySelector('section')!.dispatchEvent(new Event(REFERENCE_PASTE_EVENT)))
  await waitFor(() => expect(useReferenceImages.getState().images).toHaveLength(2))
  act(() => useReferenceImages.getState().step(-1))
  expect(useReferenceImages.getState().activeId).toBe(first)
  view.unmount()
  const reopened = render(<ReferenceImagePanel docked onClose={() => {}} />, { wrapper: I18nProvider })
  expect(reopened.container.querySelector('canvas')).not.toBeNull()
  expect(reopened.container.textContent).toContain('1 / 2')
  act(() => useReferenceImages.getState().remove())
  expect(useReferenceImages.getState().images).toHaveLength(1)
  expect(useReferenceImages.getState().activeId).not.toBe(first)
})

it('keeps existing references when the clipboard is empty or unavailable', async () => {
  addClipboardReference({ width: 1, height: 1, data: new Uint8Array(4) })
  const images = useReferenceImages.getState().images
  const message = vi.spyOn(useWorkspace.getState(), 'setMessage')
  const read = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('clipboard unavailable'))
  vi.stubGlobal('moonSprite', { readClipboardImage: read })
  const view = render(<ReferenceImagePanel docked onClose={() => {}} />, { wrapper: I18nProvider })
  fireEvent.click(view.container.querySelector('header button')!)
  await waitFor(() => expect(message).toHaveBeenCalledTimes(1))
  fireEvent.click(view.container.querySelector('header button')!)
  await waitFor(() => expect(message).toHaveBeenCalledTimes(2))
  expect(useReferenceImages.getState().images).toBe(images)
})

it('rejects malformed clipboard pixels before adding a reference', () => {
  expect(() => addClipboardReference({ width: 2, height: 2, data: new Uint8Array(4) })).toThrow()
  expect(useReferenceImages.getState().images).toHaveLength(0)
})

it('opens multiple references with independent navigation and zoom, and closes only the chosen window', () => {
  addClipboardReference({ width: 2, height: 1, data: new Uint8Array(8) })
  addClipboardReference({ width: 1, height: 1, data: new Uint8Array(4) })
  const view = render(<><ReferenceImagePanel docked onClose={() => {}} /><ReferenceImageWindows /></>, { wrapper: I18nProvider })
  const main = view.container.querySelector('section')!
  fireEvent.click(main.querySelector('[data-pixel-icon="export"]')!.closest('button')!)
  fireEvent.click(main.querySelector('[data-pixel-icon="left"]')!.closest('button')!)
  fireEvent.click(main.querySelector('[data-pixel-icon="export"]')!.closest('button')!)
  const panels = view.container.querySelectorAll('section')
  expect(panels).toHaveLength(3)
  expect(panels[0].textContent).toContain('1 / 2')
  expect(panels[1].textContent).toContain('2 / 2')
  expect(panels[2].textContent).toContain('1 / 2')
  expect(panels[1].style.left).not.toBe(panels[2].style.left)
  const images = useReferenceImages.getState().images
  vi.spyOn(panels[1].querySelector('canvas')!, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 200 } as DOMRect)
  fireEvent.click(panels[1].querySelector('header [data-pixel-icon="plus"]')!.closest('button')!)
  expect(useReferenceImages.getState().windows[0].zoom).not.toBeNull()
  expect(useReferenceImages.getState().windows[1].zoom).toBeNull()
  expect(useReferenceImages.getState().images).toBe(images)
  fireEvent.click(panels[1].querySelector('[data-pixel-icon="left"]')!.closest('button')!)
  expect(useReferenceImages.getState().windows[0].zoom).toBeNull()
  fireEvent.click(panels[1].querySelector('[data-pixel-icon="close"]')!.closest('button')!)
  expect(view.container.querySelectorAll('section')).toHaveLength(2)
  expect(useReferenceImages.getState().images).toBe(images)
})

it('pastes into a new floating window without switching the main panel', async () => {
  addClipboardReference({ width: 1, height: 1, data: new Uint8Array(4) })
  const mainId = useReferenceImages.getState().activeId
  vi.stubGlobal('moonSprite', { readClipboardImage: vi.fn().mockResolvedValue({ width: 2, height: 1, data: new Uint8Array(8) }) })
  const view = render(<><ReferenceImagePanel docked onClose={() => {}} /><ReferenceImageWindows /></>, { wrapper: I18nProvider })
  fireEvent.click(view.container.querySelector('.reference-image-navigation [data-pixel-icon="plus"]')!.closest('button')!)
  const floating = view.container.querySelectorAll('section')[1]
  expect(floating.querySelector('canvas')).toBeNull()
  act(() => floating.dispatchEvent(new Event(REFERENCE_PASTE_EVENT)))
  await waitFor(() => expect(useReferenceImages.getState().images).toHaveLength(2))
  expect(useReferenceImages.getState().activeId).toBe(mainId)
  expect(useReferenceImages.getState().windows[0].activeId).toBe(useReferenceImages.getState().images[1].id)
})

it('deletes the floating selection without deleting the main selection or leaving stale windows', () => {
  const store = useReferenceImages.getState()
  addClipboardReference({ width: 1, height: 1, data: new Uint8Array(4) })
  const firstId = useReferenceImages.getState().activeId
  store.openWindow(firstId)
  store.openWindow(firstId)
  addClipboardReference({ width: 2, height: 1, data: new Uint8Array(8) })
  const mainId = useReferenceImages.getState().activeId
  const windowId = useReferenceImages.getState().windows[0].id
  store.remove(windowId)
  expect(useReferenceImages.getState().images.map((image) => image.id)).toEqual([mainId])
  expect(useReferenceImages.getState().activeId).toBe(mainId)
  expect(useReferenceImages.getState().windows.every((panel) => panel.activeId === mainId)).toBe(true)
  store.remove(windowId)
  expect(useReferenceImages.getState().windows.every((panel) => panel.activeId === null)).toBe(true)
  expect(useReferenceImages.getState().activeId).toBeNull()
})

it('ignores clipboard results targeted at a window that has already closed', () => {
  const store = useReferenceImages.getState()
  store.openWindow()
  const id = useReferenceImages.getState().windows[0].id
  store.closeWindow(id)
  addClipboardReference({ width: 1, height: 1, data: new Uint8Array(4) }, id)
  expect(useReferenceImages.getState().images).toHaveLength(0)
  expect(useReferenceImages.getState().windows).toHaveLength(0)
})
