import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as shortcutApi from '@/core/shortcuts'
import * as quickTools from '@/core/quick-tools'
import { useCanvasShortcutBindings } from './useCanvasShortcutBindings'
import { currentHeldShortcutKeyParts, currentQuickToolMatch, syncHeldShortcutModifiers, useQuickToolShortcut } from './useQuickToolShortcut'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const Probe = ({ observe }: { observe: (bindings: shortcutApi.ShortcutBindings, match: quickTools.QuickToolMatch | null) => void }) => {
  const bindings = useCanvasShortcutBindings()
  const match = useQuickToolShortcut(bindings)
  observe(bindings, match)
  return <span>{match?.id ?? 'none'}</span>
}

const key = (type: 'keydown' | 'keyup', value: string): void => {
  act(() => { window.dispatchEvent(new KeyboardEvent(type, { key: value, code: value === ' ' ? 'Space' : value, bubbles: true })) })
}

describe('shared canvas quick tools', () => {
  it('loads and resolves once for eight canvases, without rendering on unrelated keys', () => {
    const load = vi.spyOn(shortcutApi, 'loadShortcutBindings')
    const conflicts = vi.spyOn(shortcutApi, 'deriveShortcutConflicts')
    const resolve = vi.spyOn(quickTools, 'resolveHeldQuickTool')
    const observe = vi.fn()
    render(<>{Array.from({ length: 8 }, (_, id) => <Probe key={id} observe={observe} />)}</>)
    expect(load).toHaveBeenCalledTimes(1)
    expect(conflicts).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledTimes(1)
    const initialRenders = observe.mock.calls.length
    key('keydown', 'q')
    expect(currentHeldShortcutKeyParts().has('Q')).toBe(true)
    key('keyup', 'q')
    expect(observe).toHaveBeenCalledTimes(initialRenders)
    expect(resolve).toHaveBeenCalledTimes(3)

    key('keydown', ' ')
    expect(observe).toHaveBeenCalledTimes(initialRenders + 8)
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('hand')
    const handMatch = observe.mock.lastCall?.[1]
    key('keydown', 'q')
    key('keyup', 'q')
    expect(observe).toHaveBeenCalledTimes(initialRenders + 8)
    expect(currentQuickToolMatch(observe.mock.lastCall![0])).toBe(handMatch)
    key('keyup', ' ')
    expect(observe).toHaveBeenCalledTimes(initialRenders + 16)
    expect(observe.mock.lastCall?.[1]).toBeNull()
  })

  it('keeps live modifier state even when the effective tool does not change', () => {
    const observe = vi.fn()
    render(<Probe observe={observe} />)
    const renders = observe.mock.calls.length
    act(() => { syncHeldShortcutModifiers({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: true }) })
    expect(currentHeldShortcutKeyParts().has('Shift')).toBe(true)
    expect(observe).toHaveBeenCalledTimes(renders)
    act(() => { syncHeldShortcutModifiers({ ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }) })
    expect(currentHeldShortcutKeyParts().has('Shift')).toBe(false)
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('move')
    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(currentHeldShortcutKeyParts().size).toBe(0)
    expect(observe.mock.lastCall?.[1]).toBeNull()
  })

  it('changes combination tools and restores the less specific tool on release', () => {
    const bindings = structuredClone(shortcutApi.DEFAULT_SHORTCUT_BINDINGS)
    bindings['tool.pencil.quick'] = ['Space+Q']
    shortcutApi.saveShortcutBindings(bindings)
    const observe = vi.fn()
    render(<Probe observe={observe} />)
    key('keydown', ' ')
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('hand')
    key('keydown', 'q')
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('pencil')
    key('keyup', 'q')
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('hand')
    key('keyup', ' ')
    expect(observe.mock.lastCall?.[1]).toBeNull()
  })

  it('refreshes all canvases once when bindings change while a key is held', () => {
    const observe = vi.fn()
    render(<><Probe observe={observe} /><Probe observe={observe} /></>)
    key('keydown', ' ')
    const bindings = structuredClone(observe.mock.lastCall![0])
    bindings['tool.hand.quick'] = []
    bindings['tool.pencil.quick'] = ['Space']
    const load = vi.spyOn(shortcutApi, 'loadShortcutBindings')
    act(() => { shortcutApi.saveShortcutBindings(bindings) })
    expect(load).toHaveBeenCalledTimes(1)
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('pencil')
    expect(observe.mock.calls.at(-2)?.[0]).toBe(observe.mock.lastCall?.[0])
    key('keyup', ' ')
    expect(observe.mock.lastCall?.[1]).toBeNull()
  })

  it('clears temporary tools in text inputs and when the document becomes hidden', () => {
    const observe = vi.fn()
    const view = render(<><Probe observe={observe} /><input aria-label="name" /></>)
    key('keydown', 'Alt')
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('eyedropper')
    fireEvent.keyDown(view.getByLabelText('name'), { key: 'a' })
    expect(observe.mock.lastCall?.[1]).toBeNull()
    key('keydown', ' ')
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(observe.mock.lastCall?.[1]).toBeNull()
    expect(currentHeldShortcutKeyParts().size).toBe(0)
  })

  it('keeps keyboard tracking until the last canvas closes and reloads settings on remount', () => {
    const first = render(<Probe observe={() => {}} />)
    const observe = vi.fn()
    const second = render(<Probe observe={observe} />)
    first.unmount()
    key('keydown', ' ')
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('hand')
    second.unmount()
    expect(currentHeldShortcutKeyParts().size).toBe(0)
    key('keydown', 'Alt')
    expect(currentHeldShortcutKeyParts().size).toBe(0)
    const bindings = structuredClone(shortcutApi.DEFAULT_SHORTCUT_BINDINGS)
    bindings['tool.hand.quick'] = []
    bindings['tool.pencil.quick'] = ['Space']
    shortcutApi.saveShortcutBindings(bindings)
    render(<Probe observe={observe} />)
    expect(observe.mock.lastCall?.[1]).toBeNull()
    key('keydown', ' ')
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('pencil')
  })

  it('preserves independent matches when clients use different bindings', () => {
    const normal = structuredClone(shortcutApi.DEFAULT_SHORTCUT_BINDINGS)
    const custom = structuredClone(normal)
    custom['tool.hand.quick'] = []
    custom['tool.pencil.quick'] = ['Space']
    const left = vi.fn()
    const right = vi.fn()
    const CustomProbe = ({ bindings, observe }: { bindings: shortcutApi.ShortcutBindings; observe: typeof left }) => {
      observe(useQuickToolShortcut(bindings))
      return null
    }
    render(<><CustomProbe bindings={normal} observe={left} /><CustomProbe bindings={custom} observe={right} /></>)
    key('keydown', ' ')
    expect(left.mock.lastCall?.[0]?.target.tool).toBe('hand')
    expect(right.mock.lastCall?.[0]?.target.tool).toBe('pencil')
    expect(currentQuickToolMatch(normal)).toBe(left.mock.lastCall?.[0])
    expect(currentQuickToolMatch(custom)).toBe(right.mock.lastCall?.[0])
    key('keyup', ' ')
    expect(left.mock.lastCall?.[0]).toBeNull()
    expect(right.mock.lastCall?.[0]).toBeNull()
  })

  it('survives StrictMode subscription teardown and leaves no keyboard listener after unmount', () => {
    const observe = vi.fn()
    const view = render(<StrictMode><Probe observe={observe} /></StrictMode>)
    key('keydown', 'Alt')
    expect(observe.mock.lastCall?.[1]?.target.tool).toBe('eyedropper')
    view.unmount()
    key('keydown', ' ')
    expect(currentHeldShortcutKeyParts().size).toBe(0)
  })
})
