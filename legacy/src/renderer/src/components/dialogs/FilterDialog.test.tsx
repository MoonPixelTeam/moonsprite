import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FilterDialog } from './FilterDialog'

const handle = vi.hoisted(() => ({ update: vi.fn(async () => {}), cancel: vi.fn(), apply: vi.fn(async () => {}) }))
vi.mock('@/store/workspace', () => ({ useWorkspace: { getState: () => ({
  activeId: 'doc', sessions: [{ document: { id: 'doc' }, selectedLayerIds: ['layer'] }], beginFilterPreview: () => handle
}) } }))
vi.mock('@/components/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

it('switches choices, previews parameters, applies current choice and cleans up', async () => {
  vi.useFakeTimers()
  const close = vi.fn()
  const view = render(<FilterDialog initialFilter="vignette" onClose={close} />)
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'vignette' }))
  fireEvent.click(view.getByText('filter.preset.phosphor-glow.name'))
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'phosphor-glow', opacity: 0.24 }))
  fireEvent.change(view.getByRole('slider'), { target: { value: '50' } })
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ opacity: 0.5 }))
  await act(async () => { fireEvent.click(view.getByText('common.apply')) })
  expect(handle.apply).toHaveBeenCalledWith(expect.objectContaining({ id: 'phosphor-glow', opacity: 0.5 }))
  expect(close).toHaveBeenCalledOnce()
  view.unmount()
  expect(handle.cancel).toHaveBeenCalledOnce()
})
