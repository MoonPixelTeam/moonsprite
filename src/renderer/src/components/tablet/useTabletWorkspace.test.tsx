import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { applyToolIconScale } from '@/platform/ui-scale'
import { updateTabletPreferences, useTabletWorkspace } from './useTabletWorkspace'

afterEach(() => {
  cleanup()
  localStorage.clear()
  applyToolIconScale(1)
})

it('uses actual large icons in touch layout and restores the saved desktop size', () => {
  const preferences = loadEditorPreferences()
  saveEditorPreferences({ ...preferences, toolIconScale: 1, tablet: { ...preferences.tablet, touchUi: 'off' } })
  const view = renderHook(() => useTabletWorkspace())
  const root = document.documentElement
  expect(root.dataset.toolIconScale).toBe('normal')
  act(() => updateTabletPreferences({ touchUi: 'on' }))
  expect(root.dataset.toolIconScale).toBe('large')
  expect(root.style.getPropertyValue('--tool-rail-icon-size')).toBe('32px')
  expect(root.style.getPropertyValue('--tool-rail-column-size')).toBe('57px')
  // App preference synchronization must not reset the effective touch size.
  act(() => applyToolIconScale(1))
  expect(root.dataset.toolIconScale).toBe('large')
  expect(loadEditorPreferences().toolIconScale).toBe(1)
  act(() => updateTabletPreferences({ touchUi: 'off' }))
  expect(root.dataset.toolIconScale).toBe('normal')
  expect(root.style.getPropertyValue('--tool-rail-icon-size')).toBe('22px')
  act(() => updateTabletPreferences({ touchUi: 'on' }))
  view.unmount()
  expect(root.dataset.toolIconScale).toBe('normal')
})
