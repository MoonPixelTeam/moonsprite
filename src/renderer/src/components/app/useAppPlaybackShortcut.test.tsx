import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { deriveShortcutConflicts, loadShortcutBindings } from '@/core/shortcuts'
import { useAppPlaybackShortcut } from './useAppPlaybackShortcut'

const workspace = vi.hoisted(() => ({ getState: vi.fn() }))
vi.mock('@/store/workspace', () => ({ useWorkspace: workspace }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function options() {
  const shortcuts = loadShortcutBindings()
  for (const key of Object.keys(shortcuts) as Array<keyof typeof shortcuts>) shortcuts[key] = []
  shortcuts.toggleAnimationPlayback = ['F8']
  return { homeOpen: false, openMenu: null, popupPanelId: null, timelineHidden: false, shortcuts, shortcutConflictState: deriveShortcutConflicts(shortcuts) }
}

const session = (id: string) => ({
  document: { id, animation: { frames: [{}, {}] } },
  animationPlaying: false, selection: null, textBoxTransform: null
})
const press = () => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', code: 'F8', cancelable: true })))

it('reads the current document at dispatch and removes its listener on unmount', () => {
  const firstCommand = vi.fn(), nextCommand = vi.fn()
  workspace.getState.mockReturnValue({ activeId: 'first', sessions: [session('first')], setAnimationPlaying: firstCommand })
  const hook = renderHook(useAppPlaybackShortcut, { initialProps: options() })
  press()
  expect(firstCommand).toHaveBeenCalledWith(true)
  // No hook rerender: the installed callback must consult the live store.
  workspace.getState.mockReturnValue({ activeId: 'next', sessions: [session('next')], setAnimationPlaying: nextCommand })
  press()
  expect(nextCommand).toHaveBeenCalledOnce()
  workspace.getState.mockReturnValue({ activeId: null, sessions: [], setAnimationPlaying: nextCommand })
  press()
  expect(nextCommand).toHaveBeenCalledOnce()
  hook.unmount()
  workspace.getState.mockClear()
  press()
  expect(workspace.getState).not.toHaveBeenCalled()
})

it('keeps home and hidden-timeline guards current', () => {
  const command = vi.fn()
  workspace.getState.mockReturnValue({ activeId: 'open', sessions: [session('open')], setAnimationPlaying: command })
  const initial = options()
  const hook = renderHook(useAppPlaybackShortcut, { initialProps: initial })
  hook.rerender({ ...initial, homeOpen: true })
  press()
  hook.rerender({ ...initial, timelineHidden: true })
  press()
  expect(command).not.toHaveBeenCalled()
  hook.rerender(initial)
  press()
  expect(command).toHaveBeenCalledOnce()
})
