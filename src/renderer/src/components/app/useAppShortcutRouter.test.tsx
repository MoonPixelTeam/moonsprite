import { CANVAS_REFERENCE_DELETE_EVENT, CANVAS_REFERENCE_PASTE_EVENT } from '../canvas-reference-input'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { createDocument } from '@/core/document-model'
import { loadShortcutBindings } from '@/core/shortcuts'
import { useWorkspace } from '@/store/workspace'
import { useAppShortcutRouter } from './useAppShortcutRouter'

afterEach(() => { cleanup(); vi.restoreAllMocks(); useWorkspace.setState({sessions: [], activeId: null}) })

function options(): Parameters<typeof useAppShortcutRouter>[0] {
  const shortcuts = loadShortcutBindings()
  for (const key of Object.keys(shortcuts) as Array<keyof typeof shortcuts>) shortcuts[key] = []
  return {
    shortcuts,
    homeOpen: false, outlineOpen: false, openMenu: false, shortcutOpen: false, timelineHidden: false,
    commandScope: () => 'canvas', selectionOverride: () => false,
    pointerPosition: () => null, commandSurface: () => null, rotationIndicatorPosition: 'canvas',
    onEscape: vi.fn(), commands: {}, openAdjustment: vi.fn(), publishShortcutCommand: vi.fn()
  }
}

it('routes paste to the focused reference panel without editing the sprite', () => {
  const initial = options()
  initial.shortcuts.paste = ['Ctrl+V']
  initial.shortcuts.undo = ['Ctrl+Z']
  const panel = document.createElement('section')
  panel.className = 'reference-image-panel'
  panel.tabIndex = -1
  document.body.append(panel)
  panel.focus()
  const referencePaste = vi.fn()
  panel.addEventListener('moonsprite:paste-reference', referencePaste)
  const paste = vi.spyOn(useWorkspace.getState(), 'pasteClipboard')
  const undo = vi.spyOn(useWorkspace.getState(), 'undo')
  renderHook(() => useAppShortcutRouter(initial), { wrapper: I18nProvider })
  act(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true })))
  act(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })))
  expect(referencePaste).toHaveBeenCalledTimes(1)
  expect(paste).not.toHaveBeenCalled()
  expect(undo).not.toHaveBeenCalled()
  panel.remove()
})

it('uses the latest UI command, suppresses repeats and removes listeners on unmount', () => {
  const first = vi.fn(), next = vi.fn(), initial = options()
  initial.shortcuts.newDocument = ['Ctrl+N']
  initial.commands.newDocument = first
  const hook = renderHook(useAppShortcutRouter, {initialProps: initial, wrapper: I18nProvider})
  const press = (repeat = false) => act(() => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'n', code: 'KeyN', ctrlKey: true, repeat, cancelable: true})))
  press(); press(true)
  expect(first).toHaveBeenCalledTimes(1)
  hook.rerender({...initial, commands: {newDocument: next}})
  press()
  expect(next).toHaveBeenCalledTimes(1)
  hook.unmount(); press()
  expect(next).toHaveBeenCalledTimes(1)
})

it('routes F11 to the fullscreen command', () => {
  const fullscreen = vi.fn()
  const initial = options()
  initial.shortcuts.toggleFullscreen = ['F11']
  initial.commands.toggleFullscreen = fullscreen
  renderHook(() => useAppShortcutRouter(initial), {wrapper: I18nProvider})

  act(() => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'F11', code: 'F11', cancelable: true})))

  expect(fullscreen).toHaveBeenCalledTimes(1)
})

it('cycles shared tool bindings using the current Store state between events', () => {
  useWorkspace.setState({sessions: [], activeId: null})
  useWorkspace.getState().addSession(createDocument('tool cycle', 4, 4, 'rgba'))
  useWorkspace.getState().setTool('pencil')
  const initial = options()
  initial.shortcuts['tool.pencil'] = ['B']
  initial.shortcuts['tool.eraser'] = ['B']
  renderHook(() => useAppShortcutRouter(initial), {wrapper: I18nProvider})
  const press = () => act(() => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'b', code: 'KeyB', cancelable: true})))
  press()
  expect(useWorkspace.getState().sessions[0].tool).toBe('eraser')
  press()
  expect(useWorkspace.getState().sessions[0].tool).toBe('pencil')
})

it('offers Ctrl+V to selected canvas references without pasting into the document or text fields', () => {
  const initial = options()
  initial.shortcuts.paste = ['Ctrl+V']
  const paste = vi.spyOn(useWorkspace.getState(), 'pasteClipboard')
  const receive = vi.fn((event: Event) => event.preventDefault())
  window.addEventListener(CANVAS_REFERENCE_PASTE_EVENT, receive)
  const hook = renderHook(() => useAppShortcutRouter(initial), { wrapper: I18nProvider })
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true })))
  expect(receive).toHaveBeenCalledTimes(1)
  expect(paste).not.toHaveBeenCalled()
  const input = document.createElement('input')
  document.body.append(input)
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true })))
  expect(receive).toHaveBeenCalledTimes(1)
  input.remove()
  hook.unmount()
  window.removeEventListener(CANVAS_REFERENCE_PASTE_EVENT, receive)
})

it('routes Ctrl+X to selected layers instead of the canvas selection', () => {
  useWorkspace.setState({ sessions: [], activeId: null })
  const doc = createDocument('cut layers', 2, 2, 'rgba')
  useWorkspace.getState().addSession(doc)
  useWorkspace.getState().selectLayer(doc.activeLayerId)
  const initial = options()
  initial.shortcuts.cut = ['Ctrl+X']
  initial.commandScope = () => 'layers'
  const copy = vi.spyOn(useWorkspace.getState(), 'copySelectedLayersToClipboard').mockReturnValue(true)
  const remove = vi.spyOn(useWorkspace.getState(), 'deleteSelectedLayers').mockImplementation(() => {})
  const selection = vi.spyOn(useWorkspace.getState(), 'cutSelection').mockImplementation(() => {})
  renderHook(() => useAppShortcutRouter(initial), { wrapper: I18nProvider })
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, cancelable: true })))
  expect(copy).toHaveBeenCalledTimes(1)
  expect(remove).toHaveBeenCalledTimes(1)
  expect(selection).not.toHaveBeenCalled()
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, repeat: true, cancelable: true })))
  expect(remove).toHaveBeenCalledTimes(1)
})

it('routes the configured delete shortcut to the selected reference before canvas deletion', () => {
  useWorkspace.getState().addSession(createDocument('reference deletion', 4, 4, 'rgba'))
  const initial = options()
  initial.shortcuts.deleteLayer = ['Ctrl+D']
  const receive = vi.fn((event: Event) => event.preventDefault())
  window.addEventListener(CANVAS_REFERENCE_DELETE_EVENT, receive)
  const deleteSelection = vi.spyOn(useWorkspace.getState(), 'deleteSelection')
  renderHook(() => useAppShortcutRouter(initial), { wrapper: I18nProvider })
  try {
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true })))
    expect(receive).toHaveBeenCalledTimes(1)
    expect(deleteSelection).not.toHaveBeenCalled()
    const input = document.createElement('input')
    document.body.append(input)
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })))
    expect(receive).toHaveBeenCalledTimes(1)
    input.remove()
  } finally {
    window.removeEventListener(CANVAS_REFERENCE_DELETE_EVENT, receive)
  }
})
