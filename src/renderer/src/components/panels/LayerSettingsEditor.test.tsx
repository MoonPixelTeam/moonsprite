import { createRef } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { loadEditorPreferences } from '@/core/file-preferences'
import { DEFAULT_LAYER_QUICK_ACTIONS } from '@/core/layer-panel-preferences'
import { LayerSettingsEditor, type LayerSettingsEditorHandle } from './LayerSettingsEditor'
import type { LayerSettingsState } from './layer-panel-settings'

afterEach(cleanup)

it('keeps pointer capture across settings updates and releases it when the editor closes', () => {
  const ref = createRef<LayerSettingsEditorHandle>()
  const value: LayerSettingsState = {
    density: 'normal', onionSkin: loadEditorPreferences().onionSkin,
    timelineHidden: false, sideDockAutoHide: true, skipDisabledFrames: true,
    quickActions: DEFAULT_LAYER_QUICK_ACTIONS.map(action => ({ ...action }))
  }
  const onChange = vi.fn()
  const editor = (settings: LayerSettingsState) => <I18nProvider><LayerSettingsEditor ref={ref} value={settings} onChange={onChange} /></I18nProvider>
  const view = render(editor(value))
  act(() => ref.current!.open())
  fireEvent.click(view.baseElement.querySelector('.layer-quick-actions-collapse')!)
  const handle = view.baseElement.querySelector<HTMLButtonElement>('.quick-command-drag-handle')!
  handle.setPointerCapture = vi.fn()
  handle.hasPointerCapture = vi.fn().mockReturnValue(true)
  handle.releasePointerCapture = vi.fn()
  const down = new Event('pointerdown', { bubbles: true })
  Object.assign(down, { button: 0, pointerId: 7 })
  fireEvent(handle, down)
  expect(handle.setPointerCapture).toHaveBeenCalledWith(7)
  view.rerender(editor({ ...value, quickActions: [...value.quickActions].reverse() }))
  expect(handle.releasePointerCapture).not.toHaveBeenCalled()
  act(() => ref.current!.close())
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(7)
})
