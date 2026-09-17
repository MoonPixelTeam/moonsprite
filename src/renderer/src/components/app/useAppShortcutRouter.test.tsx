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
