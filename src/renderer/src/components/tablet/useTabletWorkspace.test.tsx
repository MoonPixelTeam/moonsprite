import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { applyToolIconScale } from '@/platform/ui-scale'
import { updateTabletPreferences, useTabletWorkspace } from './useTabletWorkspace'
import { loadInspectorLayout } from '@/core/panel-layout'
import { DEFAULT_PANEL_DOCKS, DEFAULT_PANEL_VISIBILITY, loadPanelDocks, loadPanelVisibility, savePanelDocks, savePanelVisibility } from '@/core/workspace-layout-preferences'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); applyToolIconScale(1) })

it('opens on actual touch once, preserves manual close, and never intercepts layer input or changes icon sizing', () => {
  updateTabletPreferences({ assistPanel: 'auto' })
  applyToolIconScale(1)
  const setVisible = vi.fn()
  const view = renderHook(() => useTabletWorkspace(setVisible))
  expect(setVisible).not.toHaveBeenCalled()
  fireEvent.pointerDown(window, { pointerType: 'mouse' })
  fireEvent.pointerDown(window, { pointerType: 'pen' })
  expect(setVisible).not.toHaveBeenCalled()
  const layer = document.createElement('button')
  layer.dataset.layerId = 'layer'
  document.body.append(layer)
  const down = vi.fn(), click = vi.fn()
  layer.addEventListener('pointerdown', down)
  layer.addEventListener('click', click)
  try {
    fireEvent.pointerDown(layer, { pointerType: 'touch', pointerId: 1 })
    fireEvent.pointerUp(layer, { pointerType: 'touch', pointerId: 1 })
    fireEvent.click(layer)
    expect(setVisible).toHaveBeenCalledExactlyOnceWith('tabletAssist', true)
    expect(down).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    setVisible.mockClear() // Closing the normal panel must not re-arm detection.
    view.rerender()
    act(() => updateTabletPreferences({ pressureEnabled: false }))
    fireEvent.pointerDown(layer, { pointerType: 'touch', pointerId: 2 })
    expect(setVisible).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.tabletUi).toBeUndefined()
    expect(document.documentElement.dataset.toolIconScale).toBe('normal')
    expect(document.documentElement.style.getPropertyValue('--tool-rail-icon-size')).toBe('22px')
  } finally { layer.remove() }
})

it('applies on/off immediately, re-arms auto when requested, and removes detection on unmount', () => {
  updateTabletPreferences({ assistPanel: 'off' })
  const setVisible = vi.fn()
  const view = renderHook(() => useTabletWorkspace(setVisible))
  expect(setVisible).toHaveBeenLastCalledWith('tabletAssist', false)
  fireEvent.pointerDown(window, { pointerType: 'touch' })
  expect(setVisible).toHaveBeenCalledOnce()
  act(() => updateTabletPreferences({ assistPanel: 'on' }))
  expect(setVisible).toHaveBeenLastCalledWith('tabletAssist', true)
  act(() => updateTabletPreferences({ assistPanel: 'off' }))
  expect(setVisible).toHaveBeenLastCalledWith('tabletAssist', false)
  act(() => updateTabletPreferences({ assistPanel: 'auto' }))
  setVisible.mockClear()
  fireEvent.pointerDown(window, { pointerType: 'touch' })
  expect(setVisible).toHaveBeenCalledExactlyOnceWith('tabletAssist', true)
  view.unmount()
  fireEvent.pointerDown(window, { pointerType: 'touch' })
  expect(setVisible).toHaveBeenCalledOnce()
})

it('uses ordinary panel visibility, docking and saved layout without affecting layers', () => {
  expect(DEFAULT_PANEL_VISIBILITY.tabletAssist).toBe(false)
  expect(loadInspectorLayout().order).toContain('tabletAssist')
  savePanelDocks({ ...DEFAULT_PANEL_DOCKS, tabletAssist: 'left' })
  savePanelVisibility({ ...DEFAULT_PANEL_VISIBILITY, tabletAssist: true })
  expect(loadPanelDocks().tabletAssist).toBe('left')
  expect(loadPanelVisibility().tabletAssist).toBe(true)
  savePanelVisibility({ ...loadPanelVisibility(), tabletAssist: false })
  expect(loadPanelVisibility()).toEqual(DEFAULT_PANEL_VISIBILITY)
})
