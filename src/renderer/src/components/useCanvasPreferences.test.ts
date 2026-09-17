import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { loadEditorPreferences, saveEditorPreferences, ISO_VIEW_PREFERENCES_PREVIEW_EVENT } from '@/core/file-preferences'
import { useCanvasPreferences } from './useCanvasPreferences'

afterEach(() => {cleanup(); localStorage.clear()})
it('refreshes the preference snapshot together without persisting an iso preview', () => {
  const {result} = renderHook(useCanvasPreferences)
  const initial = loadEditorPreferences()
  const preview = {...initial.isoView, stairStep: initial.isoView.stairStep === 3 ? 2 : 3}
  act(() => window.dispatchEvent(new CustomEvent(ISO_VIEW_PREFERENCES_PREVIEW_EVENT, {detail: preview})))
  expect(result.current.isoView).toEqual(preview)
  expect(loadEditorPreferences().isoView).toEqual(initial.isoView)
  act(() => {saveEditorPreferences({...initial, wheelZoomEnabled: !initial.wheelZoomEnabled, drawingBrushPreviewEnabled: !initial.drawingBrushPreviewEnabled}); window.dispatchEvent(new Event('moonsprite:preferences-changed'))})
  expect(result.current.wheelZoomEnabled).toBe(!initial.wheelZoomEnabled)
  expect(result.current.drawingBrushPreviewEnabled).toBe(!initial.drawingBrushPreviewEnabled)
  expect(result.current.isoView).toEqual(initial.isoView)
})
