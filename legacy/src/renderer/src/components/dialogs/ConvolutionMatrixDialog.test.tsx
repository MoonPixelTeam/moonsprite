import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConvolutionMatrixDialog } from './ConvolutionMatrixDialog'

const handle = vi.hoisted(() => ({ update: vi.fn(async () => {}), cancel: vi.fn(), apply: vi.fn(async () => {}) }))
vi.mock('@/store/workspace', () => ({ useWorkspace: { getState: () => ({ beginConvolutionPreview: () => handle }) } }))
vi.mock('@/components/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

it('switches presets and channel buttons; Done after Apply does not apply twice', async () => {
  vi.useFakeTimers()
  const close = vi.fn()
  const view = render(<ConvolutionMatrixDialog onClose={close} />)
  await act(async () => { vi.advanceTimersByTime(50) })
  fireEvent.click(view.getByRole('button', { name: 'drunk-17x17_o' }))
  fireEvent.click(view.getByRole('button', { name: 'A' }))
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ presetId: 'drunk-17x17_o', channels: { r: true, g: true, b: true, a: false } }))
  await act(async () => { fireEvent.click(view.getByText('common.apply')) })
  expect(close).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(view.getByText('convolution.done')) })
  expect(handle.apply).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})
