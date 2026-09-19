import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer, readLayerColor } from '@/core/document'
import { DEFAULT_APP_LOCALE, translate } from '@/core/localization'
import { useWorkspace } from '@/store/workspace'
import { AdjustmentDialog } from './AdjustmentDialog'

const t = (key: Parameters<typeof translate>[1]) => translate(DEFAULT_APP_LOCALE, key)
const original = { r: 80, g: 80, b: 80, a: 128 }
const pixel = () => {
  const document = useWorkspace.getState().sessions[0].document
  return readLayerColor(document, getActiveLayer(document), 0)
}
beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
  const document = createDocument('colorize dialog', 1, 1, 'rgba')
  getActiveLayer(document).pixels.set([80, 80, 80, 128])
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setPrimaryColor({ r: 0, g: 0, b: 255, a: 255 })
  useWorkspace.getState().setViewportSize({ width: 0, height: 0 })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('toggles colorizing inside hue/saturation, preserves both sets of controls and restores on cancel', async () => {
  const onClose = vi.fn()
  const view = render(<AdjustmentDialog kind="hue-saturation" onClose={onClose} />)
  const toggle = view.getByRole('checkbox', { name: t('adjustment.title.colorize') })
  const hue = view.getByRole('slider', { name: t('adjustment.hue') })
  const saturation = view.getByRole('slider', { name: t('adjustment.saturation') })
  expect(toggle).not.toBeChecked()
  fireEvent.change(hue, { target: { value: '-40' } })
  fireEvent.change(saturation, { target: { value: '-20' } })
  fireEvent.click(toggle)
  expect(hue).toHaveAttribute('min', '0')
  expect(hue).toHaveAttribute('max', '360')
  expect(hue).toHaveValue('240')
  expect(saturation).toHaveAttribute('min', '0')
  expect(saturation).toHaveValue('25')
  await waitFor(() => expect(pixel().b).toBeGreaterThan(pixel().r))
  fireEvent.change(hue, { target: { value: '120' } })
  await waitFor(() => expect(pixel().g).toBeGreaterThan(pixel().r))
  fireEvent.click(toggle)
  expect(hue).toHaveValue('-40')
  expect(saturation).toHaveValue('-20')
  await waitFor(() => expect(pixel()).toEqual(original))
  fireEvent.click(toggle)
  expect(hue).toHaveValue('120')
  await waitFor(() => expect(pixel().g).toBeGreaterThan(pixel().r))
  fireEvent.click(view.getByRole('button', { name: t('common.cancel') }))
  expect(pixel()).toEqual(original)
  expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)
  expect(onClose).toHaveBeenCalledOnce()
})

it('commits colorizing with Apply and supports undo/redo', async () => {
  const view = render(<AdjustmentDialog kind="hue-saturation" onClose={() => {}} />)
  fireEvent.click(view.getByRole('checkbox', { name: t('adjustment.title.colorize') }))
  await waitFor(() => expect(pixel().b).toBeGreaterThan(pixel().r))
  fireEvent.click(view.getByRole('button', { name: t('common.apply') }))
  const tinted = pixel()
  expect(tinted.a).toBe(128)
  view.unmount()
  act(() => useWorkspace.getState().undo())
  expect(pixel()).toEqual(original)
  act(() => useWorkspace.getState().redo())
  expect(pixel()).toEqual(tinted)
})

it('does not show the hue/saturation colorize toggle in brightness/contrast', () => {
  const view = render(<AdjustmentDialog kind="brightness-contrast" onClose={() => {}} />)
  expect(view.queryByRole('checkbox', { name: t('adjustment.title.colorize') })).toBeNull()
})
