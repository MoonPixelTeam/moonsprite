import { afterEach, expect, it, vi } from 'vitest'
import { CURSOR_SEMANTICS, installCursorSemantics, themedCursorValue } from './cursor-semantics'

let dispose: (() => void) | undefined
const nodes: Element[] = []
const append = <T extends Element>(node: T, parent = document.body): T => {
  parent.append(node)
  nodes.push(node)
  return node
}
const flush = async () => { await new Promise<void>((resolve) => queueMicrotask(resolve)) }
afterEach(() => {
  dispose?.()
  dispose = undefined
  nodes.splice(0).forEach((node) => node.remove())
  vi.restoreAllMocks()
})

it('maps standard cursor types while preserving hidden and specialized cursors', () => {
  expect(themedCursorValue('pointer')).toBe('var(--cursor-pointer, pointer)')
  expect(themedCursorValue('col-resize')).toBe('var(--cursor-ew-resize, col-resize)')
  expect(themedCursorValue('ne-resize')).toBe('var(--cursor-nesw-resize, ne-resize)')
  expect(themedCursorValue('vertical-text')).toBe('var(--cursor-text, vertical-text)')
  for (const value of ['none', 'inherit', 'unset', 'revert', 'revert-layer', 'var(--cursor-eyedropper)', 'url("cursor.png") 1 2, default']) {
    expect(themedCursorValue(value)).toBe(value)
  }
})

it('adapts existing styles, hover states, nested rules and inline priorities', () => {
  const sheet = append(document.createElement('style'), document.head)
  sheet.textContent = '.new-feature:hover { cursor: pointer !important; } @media (min-width: 1px) { .handle { cursor: row-resize; } }'
  const element = append(document.createElement('div'))
  element.style.setProperty('cursor', 'text', 'important')
  const rule = sheet.sheet!.cssRules[0] as CSSStyleRule
  expect(rule.style.getPropertyPriority('cursor')).toBe('important')
  const setRuleProperty = vi.spyOn(rule.style, 'setProperty')
  const setInlineProperty = vi.spyOn(element.style, 'setProperty')
  dispose = installCursorSemantics()
  expect(rule.style.cursor).toBe('var(--cursor-pointer, pointer)')
  // jsdom 29 drops priority when its CSSOM parses var(); verify the real
  // browser API receives the original priority rather than trusting its parser.
  expect(setRuleProperty).toHaveBeenCalledWith('cursor', 'var(--cursor-pointer, pointer)', 'important')
  const nested = (sheet.sheet!.cssRules[1] as CSSGroupingRule).cssRules[0] as CSSStyleRule
  expect(nested.style.cursor).toBe('var(--cursor-ns-resize, row-resize)')
  expect(element.style.cursor).toBe('var(--cursor-text, text)')
  expect(setInlineProperty).toHaveBeenCalledWith('cursor', 'var(--cursor-text, text)', 'important')
})

it('automatically adapts a new feature, portaled content and changing drag state', async () => {
  const computed = vi.spyOn(window, 'getComputedStyle')
  dispose = installCursorSemantics()
  const portal = append(document.createElement('div'))
  portal.innerHTML = '<button style="cursor: pointer">New feature</button><div style="cursor: grab"></div>'
  await flush()
  const drag = portal.lastElementChild as HTMLElement
  expect((portal.firstElementChild as HTMLElement).style.cursor).toBe('var(--cursor-pointer, pointer)')
  expect(drag.style.cursor).toBe('var(--cursor-grab, grab)')
  drag.style.cursor = 'grabbing'
  await flush()
  expect(drag.style.cursor).toBe('var(--cursor-grabbing, grabbing)')
  drag.style.cursor = 'none'
  await flush()
  expect(drag.style.cursor).toBe('none')
  expect(computed).not.toHaveBeenCalled()
})

it('adapts lazy styles and hot replacement without requiring a mouse move', async () => {
  dispose = installCursorSemantics()
  const sheet = append(document.createElement('style'), document.head)
  sheet.textContent = '.lazy { cursor: move; }'
  await flush()
  expect((sheet.sheet!.cssRules[0] as CSSStyleRule).style.cursor).toBe('var(--cursor-move, move)')
  sheet.textContent = '.lazy { cursor: not-allowed; }'
  await flush()
  expect((sheet.sheet!.cssRules[0] as CSSStyleRule).style.cursor).toBe('var(--cursor-unavailable, not-allowed)')
})

it('shares one installation and disconnects observers on cleanup', async () => {
  dispose = installCursorSemantics()
  expect(installCursorSemantics()).toBe(dispose)
  expect(document.querySelectorAll('[data-cursor-semantics]')).toHaveLength(1)
  dispose()
  dispose = undefined
  const element = append(document.createElement('div'))
  element.style.cursor = 'pointer'
  await flush()
  expect(element.style.cursor).toBe('pointer')
  expect(document.querySelector('[data-cursor-semantics]')).toBeNull()
})

it('uses only variables provided by the shared cursor component library', async () => {
  const { CURSOR_ICON_LIBRARY } = await import('./cursor-theme')
  const variables = new Set(CURSOR_ICON_LIBRARY.map((cursor) => cursor.variable))
  for (const variable of Object.values(CURSOR_SEMANTICS)) expect(variables.has(variable)).toBe(true)
})

it('uses native UI and simple crosshair cursors while retaining specialized tool artwork', async () => {
  const { cursorPreferenceSource } = await import('./cursor-theme')
  for (const variable of ['--cursor-default', '--cursor-project', '--cursor-selection-black', '--cursor-selection-white', '--cursor-crosshair', '--cursor-move', '--cursor-ns-resize']) {
    expect(cursorPreferenceSource(variable, true)).toBe('system')
    expect(cursorPreferenceSource(variable, false)).toBe('moonsprite')
  }
  for (const variable of ['--cursor-pencil-black', '--cursor-eyedropper', '--cursor-zoom']) {
    expect(cursorPreferenceSource(variable, true)).toBe('moonsprite')
  }
})

it('keeps software rotation cursors while using native resize cursors', async () => {
  const { cursorPreferenceSource, cursorOverlayDescriptor, CURSOR_ICON_LIBRARY } = await import('./cursor-theme')
  for (const direction of ['ne', 'se', 'sw', 'nw', 'n', 's']) {
    const variable = `--cursor-selection-rotate-${direction}`
    expect(cursorPreferenceSource(variable, true)).toBe('moonsprite')
    expect(cursorOverlayDescriptor(`var(${variable})`, true, 1)).not.toBeNull()
    expect(CURSOR_ICON_LIBRARY.find(cursor => cursor.variable === variable)?.fallback).toBe('crosshair')
    expect(cursorPreferenceSource(variable, false)).toBe('moonsprite')
  }
  for (const variable of ['--cursor-nwse-resize', '--cursor-nesw-resize']) {
    expect(cursorPreferenceSource(variable, true)).toBe('system')
  }
})
