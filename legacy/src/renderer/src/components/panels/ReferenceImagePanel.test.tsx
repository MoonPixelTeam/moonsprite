import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { ReferenceImagePanel, ReferenceImageWindows } from './ReferenceImagePanel'
import { addClipboardReference, REFERENCE_PASTE_EVENT, useReferenceImages } from './reference-image-state'
import { useWorkspace } from '@/store/workspace'
import { createDocument } from '@/core/document-model'
import { decodeProject, encodeProject, encodeProjectAsync } from '@/core/project-format'

beforeEach(() => {
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('References', 2, 2, 'rgba'))
  useReferenceImages.setState({ images: [], activeId: null, windows: [] })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ putImageData: vi.fn() } as unknown as CanvasRenderingContext2D)
})
afterEach(() => { cleanup(); useWorkspace.setState({ sessions: [], activeId: null }); useReferenceImages.setState({ images: [], activeId: null, windows: [] }); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('pastes into the project reference library without changing artwork or history and retains images after remount', async () => {
  const read = vi.fn().mockResolvedValue({ width: 2, height: 1, data: new Uint8Array(8) })
  vi.stubGlobal('moonSprite', { readClipboardImage: read })
  const session = useWorkspace.getState().sessions[0]
  const pixels = session.document.layers[0].pixels.slice()
  const history = session.history.timeline
  const view = render(<ReferenceImagePanel docked onClose={() => {}} />, { wrapper: I18nProvider })
  fireEvent.click(view.container.querySelector('header button')!)
  await waitFor(() => expect(useReferenceImages.getState().images).toHaveLength(1))
  expect(session.document.referenceImages).toHaveLength(1)
  expect(session.document.dirty).toBe(true)
  expect(session.document.layers[0].pixels).toEqual(pixels)
  expect(session.history.timeline).toEqual(history)
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

it.each(['sync', 'async'])('restores embedded references after saving and reopening (%s)', async mode => {
  const pixels = new Uint8Array([255, 0, 0, 128, 0, 255, 0, 255])
  addClipboardReference({ width: 2, height: 1, data: pixels })
  const source = useWorkspace.getState().sessions[0].document
  const archive = mode === 'sync' ? encodeProject(source, { includePreview: false }) : await encodeProjectAsync(source, { includePreview: false })
  useWorkspace.setState({ sessions: [], activeId: null })
  expect(useReferenceImages.getState().images).toHaveLength(0)
  const project = decodeProject(archive)
  useWorkspace.getState().addSession(project)
  expect(useReferenceImages.getState().images).toHaveLength(1)
  expect(project.referenceImages![0].pixels).toEqual(new Uint8ClampedArray(pixels))
  expect(project.dirty).toBe(false)
  const canvas = useReferenceImages.getState().images[0].canvas
  expect([canvas.width, canvas.height]).toEqual([2, 1])
  const context = canvas.getContext('2d')!
  expect(context.putImageData).toHaveBeenLastCalledWith(expect.objectContaining({ data: new Uint8ClampedArray(pixels) }), 0, 0)
})

it('keeps reference libraries and view navigation separate when switching projects', () => {
  const first = useWorkspace.getState().sessions[0]
  addClipboardReference({ width: 1, height: 1, data: new Uint8Array([12, 34, 56, 78]) })
  const references = first.document.referenceImages
  const history = first.history.timeline
  first.document.dirty = false
  const state = useReferenceImages.getState()
  state.setView(3, { x: 5, y: 7 })
  state.openWindow(state.activeId)
  state.toggleRelativeLuminance()
  expect(first.document.dirty).toBe(false)
  expect(first.document.referenceImages).toBe(references)
  expect(first.history.timeline).toEqual(history)
  const second = createDocument('Other project', 2, 2, 'rgba')
  useWorkspace.getState().addSession(second)
  expect(useReferenceImages.getState().images).toHaveLength(0)
  expect(useReferenceImages.getState().windows).toHaveLength(0)
  addClipboardReference({ width: 2, height: 1, data: new Uint8Array(8) })
  useWorkspace.setState({ activeId: first.document.id })
  expect(useReferenceImages.getState().images[0]).toMatchObject({ zoom: 3, pan: { x: 5, y: 7 } })
  expect(useReferenceImages.getState().windows).toHaveLength(1)
  expect(useReferenceImages.getState().relativeLuminance).toBe(true)
  useReferenceImages.getState().remove()
  expect(first.document.dirty).toBe(true)
  const reopened = decodeProject(encodeProject(first.document, { includePreview: false }))
  expect(reopened.referenceImages).toEqual([])
  expect(second.referenceImages).toHaveLength(1)
})

it('does not paste a pending clipboard read into a different project', async () => {
  let resolve!: (image: { width: number; height: number; data: Uint8Array }) => void
  vi.stubGlobal('moonSprite', { readClipboardImage: () => new Promise(result => { resolve = result }) })
  const first = useWorkspace.getState().sessions[0].document
  const view = render(<ReferenceImagePanel docked onClose={() => {}} />, { wrapper: I18nProvider })
  fireEvent.click(view.container.querySelector('header button')!)
  const second = createDocument('Other project', 2, 2, 'rgba')
  act(() => useWorkspace.getState().addSession(second))
  await act(async () => resolve({ width: 1, height: 1, data: new Uint8Array(4) }))
  expect(first.referenceImages ?? []).toHaveLength(0)
  expect(second.referenceImages ?? []).toHaveLength(0)
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
