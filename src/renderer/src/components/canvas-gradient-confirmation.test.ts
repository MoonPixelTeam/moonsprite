import { expect, it, vi } from 'vitest'
import { gradientEditHandle, pendingGradientFor, setPendingGradient, subscribePendingGradient, type PendingGradient } from '@/core/canvas-gradient-confirmation'
import type { CanvasDragState } from '@/core/canvas-input'
import { CanvasInputState } from '@/core/canvas-input'
import type { DocumentSession } from '@/store/workspace'
import { createCanvasPointerUp } from './canvas-pointer-up'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { applyPendingGradientOnEnter, cancelPendingGradientOnEscape } from './canvas-gradient-confirmation-keyboard'

const linear = { kind: 'gradient', start: { x: 10, y: 10 }, last: { x: 50, y: 10 } } as CanvasDragState

it('finds the two endpoint handles and the line move handle', () => {
  expect(gradientEditHandle(linear, { x: 10, y: 10 }, 2, false)).toBe('start')
  expect(gradientEditHandle(linear, { x: 50, y: 10 }, 2, false)).toBe('end')
  expect(gradientEditHandle(linear, { x: 30, y: 12 }, 2, false)).toBe('move')
  expect(gradientEditHandle(linear, { x: 30, y: 30 }, 2, false)).toBeNull()
  expect(gradientEditHandle({ ...linear, last: { ...linear.start } }, { x: 10, y: 10 }, 2, false)).toBe('end')
})

it('uses the radial center for moving and its endpoint for resizing', () => {
  const radial = { ...linear, gradientRadialGeometry: { center: { x: 30, y: 30 }, radiusX: 20, radiusY: 20 } }
  expect(gradientEditHandle(radial, { x: 30, y: 30 }, 2, true)).toBe('move')
  expect(gradientEditHandle(radial, { x: 50, y: 10 }, 2, true)).toBe('end')
})

it('publishes pending action changes per document', () => {
  const listener = vi.fn()
  const unsubscribe = subscribePendingGradient(listener)
  const actions = {
    drag: linear, targetLayer: {} as PendingGradient['targetLayer'],
    apply: vi.fn(), cancel: vi.fn()
  } as PendingGradient
  setPendingGradient('gradient-test', actions)
  expect(pendingGradientFor('gradient-test')).toBe(actions)
  expect(pendingGradientFor('other')).toBeNull()
  setPendingGradient('gradient-test', null)
  expect(pendingGradientFor('gradient-test')).toBeNull()
  expect(listener).toHaveBeenCalledTimes(2)
  unsubscribe()
})

it('locks tool changes until the pending gradient is applied or cancelled', () => {
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('gradient-tool-lock', 4, 4, 'rgba'))
  const state = useWorkspace.getState()
  state.setTool('fill')
  state.setFillKind('gradient')
  const documentId = useWorkspace.getState().activeId!
  setPendingGradient(documentId, { drag: linear, targetLayer: {} as PendingGradient['targetLayer'], apply: vi.fn(), cancel: vi.fn() })
  try {
    state.setTool('pencil')
    state.setFillKind('bucket')
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ tool: 'fill', fillKind: 'gradient' })
  } finally {
    setPendingGradient(documentId, null)
  }
  state.setTool('pencil')
  expect(useWorkspace.getState().sessions[0].tool).toBe('pencil')
})

it('applies a pending gradient on Enter without taking Enter from a focused control', () => {
  const documentId = 'enter-gradient'
  const apply = vi.fn(() => setPendingGradient(documentId, null))
  setPendingGradient(documentId, { drag: linear, targetLayer: {} as PendingGradient['targetLayer'], apply, cancel: vi.fn() })
  const input = document.createElement('input')
  document.body.appendChild(input)
  try {
    input.addEventListener('keydown', event => applyPendingGradientOnEnter(event, documentId))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(apply).not.toHaveBeenCalled()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    expect(applyPendingGradientOnEnter(enter, documentId)).toBe(true)
    expect(enter.defaultPrevented).toBe(true)
    expect(apply).toHaveBeenCalledOnce()
  } finally {
    input.remove()
    setPendingGradient(documentId, null)
  }
})

it('keeps the gradient preview after release without committing pixels', () => {
  const input = new CanvasInputState()
  const drag = { ...linear, start: { ...linear.start }, last: { ...linear.last } }
  input.drag = drag
  const endGradient = vi.fn()
  const deferGradient = vi.fn(() => true)
  const session = { document: { id: 'deferred-gradient' }, freeTransformActive: false } as DocumentSession
  const ports = {
    liveInputSession: () => session, inputRef: { current: input }, symmetryDragRef: { current: null },
    adjustmentPreviewEditRef: { current: false }, stopAirbrushTimer: vi.fn(), stopLiquifyTimer: vi.fn(),
    cancelSelectionPreview: vi.fn(), flushSelectionPreview: vi.fn(), deferGradient,
    fillInput: { endGradient }, scheduleDraw: vi.fn()
  } as unknown as Parameters<typeof createCanvasPointerUp>[0]
  const event = {
    pointerId: 1, nativeEvent: { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false },
    currentTarget: { hasPointerCapture: () => false }
  } as unknown as React.PointerEvent<HTMLCanvasElement>
  createCanvasPointerUp(ports)(event)
  expect(deferGradient).toHaveBeenCalledWith(drag, session)
  expect(endGradient).not.toHaveBeenCalled()
  expect(input.drag).toBeNull()
})

it('Escape closes only the canvas preview and never consumes popup or text-input Escape', () => {
  const documentId = 'escape-gradient'
  const cancel = vi.fn()
  setPendingGradient(documentId, { drag: linear, targetLayer: {} as PendingGradient['targetLayer'], apply: vi.fn(), cancel })
  const popup = document.createElement('div'); popup.className = 'modal-backdrop'; document.body.append(popup)
  try {
    expect(cancelPendingGradientOnEscape(new KeyboardEvent('keydown', { key: 'Escape' }), documentId)).toBe(false)
    popup.remove()
    const composing = new KeyboardEvent('keydown', { key: 'Escape', isComposing: true })
    expect(cancelPendingGradientOnEscape(composing, documentId)).toBe(false)
    const input = document.createElement('input'); input.addEventListener('keydown', e => cancelPendingGradientOnEscape(e, documentId))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(cancel).not.toHaveBeenCalled()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    expect(cancelPendingGradientOnEscape(escape, documentId)).toBe(true)
    expect(escape.defaultPrevented).toBe(true); expect(cancel).toHaveBeenCalledOnce()
  } finally { popup.remove(); setPendingGradient(documentId, null) }
})

it.each(['history-list', 'tileset-tile-grid', 'free-tile-source-grid'])('Escape cancels the gradient with a permanent %s listbox and hidden menus', className => {
  const documentId = 'escape-permanent-panel'
  const cancel = vi.fn(() => setPendingGradient(documentId, null))
  setPendingGradient(documentId, { drag: linear, targetLayer: {} as PendingGradient['targetLayer'], apply: vi.fn(), cancel })
  const host = document.createElement('div')
  host.innerHTML = `<div class="${className}" role="listbox" tabindex="0"></div><div style="display: none"><div role="menu" class="context-menu"></div></div>`
  document.body.append(host)
  const panel = host.firstElementChild!
  const listener = (event: KeyboardEvent) => cancelPendingGradientOnEscape(event, documentId)
  window.addEventListener('keydown', listener, true)
  try {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    panel.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(pendingGradientFor(documentId)).toBeNull()
  } finally { window.removeEventListener('keydown', listener, true); host.remove(); setPendingGradient(documentId, null) }
})

it.each(['themed-select-popover', 'context-menu', 'tool-flyout'])('gives the visible %s one Escape before cancelling the gradient', className => {
  const documentId = 'escape-open-popup'
  const cancel = vi.fn(() => setPendingGradient(documentId, null))
  setPendingGradient(documentId, { drag: linear, targetLayer: {} as PendingGradient['targetLayer'], apply: vi.fn(), cancel })
  const popup = document.createElement('div'); popup.className = className; document.body.append(popup)
  try {
    expect(cancelPendingGradientOnEscape(new KeyboardEvent('keydown', { key: 'Escape' }), documentId)).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    popup.style.visibility = 'hidden'
    expect(cancelPendingGradientOnEscape(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }), documentId)).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
  } finally { popup.remove(); setPendingGradient(documentId, null) }
})
