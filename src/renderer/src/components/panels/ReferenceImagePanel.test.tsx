import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { ReferenceImagePanel } from './ReferenceImagePanel'
import { addClipboardReference, REFERENCE_PASTE_EVENT, useReferenceImages } from './reference-image-state'
import { useWorkspace } from '@/store/workspace'

beforeEach(() => {
  useReferenceImages.setState({ images: [], activeId: null })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData: vi.fn() } as unknown as CanvasRenderingContext2D)
})
afterEach(() => { cleanup(); useReferenceImages.setState({ images: [], activeId: null }); vi.restoreAllMocks(); vi.unstubAllGlobals() })

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
