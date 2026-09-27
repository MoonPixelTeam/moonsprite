import { saveLayerDensity } from '@/core/layer-panel-preferences'
import { TIMELINE_HIDDEN_PREFERENCE_KEY } from '@/core/file-preferences'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, getActiveLayer } from '@/core/document'
import { normalizeGradientMap } from '@/core/gradient-map'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'
import { I18nProvider } from '../I18nProvider'
import { TEXT_TOOL_DIALOG_EVENT } from '../text-tool-events'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each(['normal', 'text', 'adjustment', 'tilemap', 'free-tile', 'background'] as const)('opens properties on double-click for %s layers', kind => {
  const document = createDocument('entries', 2, 2, 'rgba')
  const layer = getActiveLayer(document)
  if (kind === 'background') layer.background = { mode: 'canvas' }
  else if (kind !== 'normal') layer.kind = kind
  if (kind === 'adjustment') layer.adjustment = { kind: 'gradient-map', enabled: true, gradientMap: normalizeGradientMap(undefined) }
  useWorkspace.getState().addSession(document)
  const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]} /></I18nProvider>)
  fireEvent.doubleClick(view.container.querySelector(`[data-layer-id="${layer.id}"]`)!)
  expect(window.document.querySelector('.layer-properties-body')).not.toBeNull()
  expect(window.document.querySelector('.gradient-map-layer-modal')).toBeNull()
})

it.each(['text', 'adjustment', 'tilemap'] as const)('opens the %s editor from its icon without opening properties', kind => {
  const document = createDocument('entries', 2, 2, 'rgba')
  const layer = getActiveLayer(document)
  layer.kind = kind
  if (kind === 'adjustment') layer.adjustment = { kind: 'gradient-map', enabled: true, gradientMap: normalizeGradientMap(undefined) }
  useWorkspace.getState().addSession(document)
  const onOpen = vi.fn()
  const eventName = kind === 'text' ? TEXT_TOOL_DIALOG_EVENT : 'moonsprite:show-workspace-panel'
  window.addEventListener(eventName, onOpen)
  try {
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]} /></I18nProvider>)
    onOpen.mockClear()
    const icon = view.container.querySelector(`[data-layer-id="${layer.id}"] .layer-status-icon-tooltip [role="button"]`)!
    fireEvent.pointerDown(icon, { button: 0, pointerId: 1 })
    fireEvent.click(icon)
    expect(window.document.querySelector('.layer-properties-body')).toBeNull()
    if (kind === 'adjustment') expect(window.document.querySelector('.gradient-map-layer-modal')).not.toBeNull()
    else expect(onOpen).toHaveBeenCalledTimes(1)
  } finally { window.removeEventListener(eventName, onOpen) }
})


it.each(['normal', 'adjustment'] as const)('opens properties from the ordinary-mode %s thumbnail', kind => {
  localStorage.setItem(TIMELINE_HIDDEN_PREFERENCE_KEY, 'true')
  const document = createDocument('thumbnail properties', 2, 2, 'rgba')
  const layer = getActiveLayer(document)
  if (kind === 'adjustment') {
    layer.kind = kind
    layer.adjustment = { kind: 'gradient-map', enabled: true, gradientMap: normalizeGradientMap(undefined) }
  }
  useWorkspace.getState().addSession(document)
  const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]} /></I18nProvider>)
  fireEvent.doubleClick(view.container.querySelector('.layer-row-thumbnail')!)
  expect(window.document.querySelector('.layer-properties-body')).not.toBeNull()
  expect(window.document.querySelector('.gradient-map-layer-modal')).toBeNull()
})

it.each(['normal', 'detailed'] as const)('keeps adjustment timeline cells bounded and empty without previews (%s)', density => {
  saveLayerDensity(density)
  const document = createDocument('gradient timeline', 2, 2, 'rgba')
  const layer = getActiveLayer(document)
  layer.kind = 'adjustment'
  layer.adjustment = { kind: 'gradient-map', enabled: true, gradientMap: normalizeGradientMap(undefined) }
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().duplicateAnimationFrame()
  const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]} /></I18nProvider>)
  const cells = view.container.querySelectorAll('.layer-animation-cel')
  expect(cells.length).toBeGreaterThan(0)
  for (const cell of cells) {
    expect(Boolean(cell.querySelector('.gradient-map-layer-thumbnail'))).toBe(density === 'detailed')
    expect(cell.querySelector('.cel-content-marker')).toBeNull()
    const thumbnail = cell.querySelector<HTMLElement>('.cel-thumbnail')
    if (thumbnail) { expect(thumbnail.style.width).toBe(''); expect(thumbnail.style.height).toBe('') }
  }
})
