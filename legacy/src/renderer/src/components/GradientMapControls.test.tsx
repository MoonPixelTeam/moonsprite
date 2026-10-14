import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document'
import { DEFAULT_APP_LOCALE, translate } from '@/core/localization'
import { useWorkspace } from '@/store/workspace'
import { AdjustmentDialog } from './dialogs/AdjustmentDialog'
import { GradientMapLayerDialog } from './GradientMapLayerDialog'
import { normalizeGradientMap } from '@/core/gradient-map'
import { useState } from 'react'
import { GradientMapControls } from './GradientMapControls'
import { createGradientMapSampler } from '@/core/gradient-map'
import { GradientStopsEditor } from './GradientStopsEditor'

const t = (key: Parameters<typeof translate>[1]) => translate(DEFAULT_APP_LOCALE, key)
beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
  const document = createDocument('gradient UI', 1, 1, 'rgba')
  getActiveLayer(document).pixels.set([80, 80, 80, 128])
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setViewportSize({ width: 0, height: 0 })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('reverses every stop in the shared gradient editor while preserving colors and alpha', () => {
  const original = [
    { position: 0, color: { r: 15, g: 25, b: 35, a: 55 } },
    { position: 0.25, color: { r: 125, g: 85, b: 10, a: 170 } },
    { position: 1, color: { r: 220, g: 230, b: 240, a: 255 } }
  ]
  let current = original
  function Harness() {
    const [stops, setStops] = useState(original)
    current = stops
    return <GradientStopsEditor open stops={stops} onChange={setStops} disabled={false} primaryColor={original[0].color} secondaryColor={original[2].color} onClose={() => {}} t={t} />
  }
  const view = render(<Harness />)
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.reverse') }))
  expect(current).toEqual([
    { position: 0, color: original[2].color },
    { position: 0.75, color: original[1].color },
    { position: 1, color: original[0].color }
  ])
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.reverse') }))
  expect(current).toEqual(original)
})

it('keeps dragging the same color across another stop and reverses endpoint colors live', () => {
  let current = normalizeGradientMap(undefined)
  function Harness() {
    const [value, setValue] = useState(current)
    current = value
    return <GradientMapControls value={value} onChange={setValue} />
  }
  const view = render(<Harness />)
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.edit') }))
  const track = document.querySelector('.gradient-editor-track')!
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) })
  const white = document.querySelectorAll('.gradient-editor-stop')[1]
  fireEvent.pointerDown(white, { button: 0, buttons: 1, clientX: 100, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(window, { buttons: 1, clientX: 50, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(window, { buttons: 1, clientX: 0, clientY: 10, pointerId: 1 })
  expect(current.stops.map(stop => stop.color.r)).toEqual([255, 0])
  expect(current.stops.map(stop => stop.position)).toEqual([0, 1])
  expect(createGradientMapSampler(current)({ r: 0, g: 0, b: 0, a: 255 }).r).toBe(255)
  fireEvent.pointerMove(window, { buttons: 1, clientX: 25, clientY: 10, pointerId: 1 })
  expect(current.stops[0]).toMatchObject({ position: 0.25, color: { r: 255 } })
  fireEvent.pointerUp(window)
})

it('preserves the dragged color through batched crossings and ignores other pointers', () => {
  const original = [10, 100, 250].map((red, index) => ({ position: 0.2 + index * 0.3, color: { r: red, g: 0, b: 0, a: 255 } }))
  let current = original
  function Harness() {
    const [stops, setStops] = useState(original)
    current = stops
    return <GradientStopsEditor open stops={stops} onChange={setStops} disabled={false} primaryColor={original[0].color} secondaryColor={original[2].color} onClose={() => {}} t={t} />
  }
  const view = render(<Harness />)
  const track = document.querySelector('.gradient-editor-track')!
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.pointerDown(document.querySelectorAll('.gradient-editor-stop')[0], { button: 0, buttons: 1, pointerId: 7, clientX: 20, clientY: 10 })
  act(() => {
    for (const clientX of [60, 90, 40, 70]) fireEvent.pointerMove(window, { buttons: 1, pointerId: 7, clientX, clientY: 10 })
    fireEvent.pointerMove(window, { buttons: 1, pointerId: 8, clientX: 5, clientY: 10 })
    fireEvent.pointerUp(window, { pointerId: 8 })
    fireEvent.pointerMove(window, { buttons: 1, pointerId: 7, clientX: 95, clientY: 10 })
    fireEvent.pointerUp(window, { pointerId: 7 })
  })
  expect(current.map(stop => stop.color.r)).toEqual([100, 250, 10])
  expect(current.map(stop => stop.position)).toEqual([0.5, 0.8, 0.95])
  const finished = current
  fireEvent.pointerMove(window, { buttons: 1, pointerId: 7, clientX: 5, clientY: 10 })
  expect(current).toBe(finished)
  expect(view.getByRole('button', { name: t('gradientMap.reverse') }).querySelector('svg')).toBeTruthy()
})

it('shows saved presets after reopening and restores their full settings', () => {
  let current = normalizeGradientMap(undefined)
  function Harness() {
    const [value, setValue] = useState(current)
    current = value
    return <GradientMapControls value={value} onChange={setValue} />
  }
  let view = render(<Harness />)
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.presets') }))
  fireEvent.click(view.getByRole('option', { name: t('gradientMap.gold') }))
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.reverse') }))
  const saved = current
  fireEvent.change(view.getByRole('textbox', { name: t('gradientMap.presetName') }), { target: { value: 'My gold' } })
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.savePreset') }))
  view.unmount()
  view = render(<Harness />)
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.presets') }))
  fireEvent.click(view.getByRole('option', { name: t('gradientMap.ocean') }))
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.presets') }))
  fireEvent.click(view.getByRole('option', { name: 'My gold' }))
  expect(current).toEqual(saved)
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.presets') }))
  fireEvent.contextMenu(view.getByRole('option', { name: 'My gold' }), { clientX: 100, clientY: 100 })
  fireEvent.click(view.getByRole('menuitem', { name: t('common.delete') }))
  expect(view.queryByRole('option', { name: 'My gold' })).toBeNull()
  expect(current).toEqual(saved)
  view.unmount()
  view = render(<Harness />)
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.presets') }))
  expect(view.queryByRole('option', { name: 'My gold' })).toBeNull()
})

it('reuses the free gradient editor and restores the destructive preview on cancel', async () => {
  const close = vi.fn()
  const view = render(<AdjustmentDialog kind="gradient-map" onClose={close} />)
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.edit') }))
  expect(document.querySelector('.gradient-editor-track')).toBeTruthy()
  fireEvent.click(view.getByRole('button', { name: t('toolOptions.addGradientStop') }))
  expect(document.querySelectorAll('.gradient-editor-stop')).toHaveLength(3)
  fireEvent.click(view.getAllByRole('button', { name: t('common.close') }).at(-1)!)
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.reverse') }))
  const source = getActiveLayer(useWorkspace.getState().sessions[0].document)
  await waitFor(() => expect(source.pixels[0]).toBe(175))
  fireEvent.click(view.getByRole('button', { name: t('common.cancel') }))
  expect(Array.from(source.pixels)).toEqual([80, 80, 80, 128])
  expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)
})

it('opens the same editor for an adjustment layer and keeps its scope when applying', async () => {
  await useWorkspace.getState().addLayer(normalizeGradientMap(undefined))
  const document = useWorkspace.getState().sessions[0].document
  const layer = getActiveLayer(document)
  const view = render(<GradientMapLayerDialog owner={layer} onClose={() => {}} />)
  expect(view.queryByRole('navigation')).toBeNull()
  expect(view.getByRole('dialog', { name: t('gradientMap.title') })).toHaveClass('gradient-map-layer-modal')
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.edit') }))
  expect(window.document.querySelector('.gradient-editor-track')).toBeTruthy()
  fireEvent.click(view.getAllByRole('button', { name: t('common.close') }).at(-1)!)
  fireEvent.click(view.getByRole('button', { name: t('gradientMap.reverse') }))
  fireEvent.click(view.getByRole('button', { name: t('common.apply') }))
  expect(layer.adjustment?.gradientMap).toMatchObject({ reverse: true })
  view.unmount()
  act(() => useWorkspace.getState().undo())
  expect(layer.adjustment?.gradientMap?.reverse).toBe(false)
  act(() => useWorkspace.getState().redo())
  expect(layer.adjustment?.gradientMap?.reverse).toBe(true)
})


it('opens the standalone adjustment dialog immediately after creating its layer', async () => {
  const { LayersPanel } = await import('./panels/LayersPanel')
  const { I18nProvider } = await import('./I18nProvider')
  const { createGradientMapLayerAndEdit } = await import('./gradient-map-layer-dialog')
  const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
  await act(async () => { await createGradientMapLayerAndEdit() })
  const dialog = await view.findByRole('dialog', { name: t('gradientMap.title') })
  expect(dialog).toHaveClass('gradient-map-layer-modal')
  expect(dialog.querySelector('.adjustment-modal-body')).not.toBeNull()
  expect(getActiveLayer(useWorkspace.getState().sessions[0].document).kind).toBe('adjustment')
})


it('keeps stop dragging local, previews only the final position on release and cancels queued work', async () => {
  await useWorkspace.getState().addLayer(normalizeGradientMap(undefined))
  const layer = getActiveLayer(useWorkspace.getState().sessions[0].document)
  const preview = vi.spyOn(useWorkspace.getState(), 'previewLayerAdjustment')
  vi.useFakeTimers()
  try {
    const view = render(<GradientMapLayerDialog owner={layer} onClose={() => {}} />)
    fireEvent.click(view.getByRole('button', { name: t('gradientMap.edit') }))
    const track = document.querySelector('.gradient-editor-track')!
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) })
    preview.mockClear()
    fireEvent.pointerDown(document.querySelectorAll('.gradient-editor-stop')[1], { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 10 })
    for (const clientX of [90, 80, 70, 60, 50]) {
      fireEvent.pointerMove(window, { buttons: 1, pointerId: 1, clientX, clientY: 10 })
      act(() => { vi.advanceTimersByTime(16) })
    }
    expect(document.querySelectorAll('.gradient-editor-stop')[1].getAttribute('style')).toContain('50%')
    expect(preview).not.toHaveBeenCalled()
    fireEvent.pointerUp(window, { pointerId: 1 })
    expect(preview).toHaveBeenCalledTimes(1)
    expect(layer.adjustment?.gradientMap?.stops[1].position).toBe(0.5)
    fireEvent.click(view.getAllByRole('button', { name: t('common.close') }).at(-1)!)
    fireEvent.click(view.getByRole('button', { name: t('gradientMap.reverse') }))
    fireEvent.click(view.getByRole('button', { name: t('common.cancel') }))
    const calls = preview.mock.calls.length
    act(() => { vi.runAllTimers() })
    expect(preview).toHaveBeenCalledTimes(calls)
    expect(layer.adjustment?.gradientMap?.reverse).toBe(false)
    view.unmount()
  } finally { vi.useRealTimers(); preview.mockRestore() }
})

it('reverses on every click from the text action beside the palette button', () => {
  function Harness() {
    const [value, setValue] = useState(normalizeGradientMap(undefined))
    return <GradientMapControls value={value} onChange={setValue} />
  }
  const view = render(<Harness />)
  const reverse = view.getByRole('button', { name: t('gradientMap.reverse') })
  expect(reverse.parentElement).toBe(view.getByRole('button', { name: t('gradientMap.palette') }).parentElement)
  const preview = view.container.querySelector('.gradient-map-edit-preview') as HTMLElement
  const original = preview.style.background
  fireEvent.click(reverse)
  expect(preview.style.background).not.toBe(original)
  fireEvent.click(reverse)
  expect(preview.style.background).toBe(original)
})


it('shows no style badge and disables the style menu for adjustment layers', async () => {
  const { LayersPanel } = await import('./panels/LayersPanel')
  const { I18nProvider } = await import('./I18nProvider')
  await useWorkspace.getState().addLayer(normalizeGradientMap(undefined))
  const session = useWorkspace.getState().sessions[0]!
  const layer = getActiveLayer(session.document)
  const view = render(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
  const row = view.container.querySelector(`[data-layer-id="${layer.id}"]`)!
  expect(row.querySelector('.layer-style-indicator')).toBeNull()
  expect(row.querySelector('.layer-text-indicator')).toBeNull()
  fireEvent.contextMenu(row)
  for (const key of ['layers.layerStyle', 'layers.splitLayerStyles', 'layers.copyLayerStyle', 'layers.pasteLayerStyle', 'layers.clearLayerStyle'] as const) {
    const label = view.getByText(t(key), { selector: '.layer-context-label' })
    expect(label.closest('button')).toBeDisabled()
  }
})
