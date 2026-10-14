import { afterEach, expect, it } from 'vitest'
import { isRedundantTooltip } from './tooltip-content'

afterEach(() => { document.body.replaceChildren() })

const anchor = (html: string): HTMLElement => {
  const element = document.createElement('button')
  element.innerHTML = html
  document.body.append(element)
  return element
}

it('suppresses repeated labels including nested text and decorative icons', () => {
  expect(isRedundantTooltip(anchor('<span aria-hidden="true">+</span><span>New layer</span>'), 'New layer')).toBe(true)
  expect(isRedundantTooltip(anchor('  Brush\n size '), 'Brush size')).toBe(true)
})

it('retains icon explanations, shortcuts and supplementary details', () => {
  expect(isRedundantTooltip(anchor('<svg><title>Save</title></svg>'), 'Save')).toBe(false)
  expect(isRedundantTooltip(anchor('Save'), 'Save (Ctrl+S)')).toBe(false)
  expect(isRedundantTooltip(anchor('Opacity'), 'Controls layer transparency')).toBe(false)
  expect(isRedundantTooltip(anchor('<span hidden>Save</span>'), 'Save')).toBe(false)
})

it('retains complete text when the label is clipped', () => {
  const element = anchor('<span>Long document name</span>')
  Object.defineProperties(element.firstElementChild, {
    clientWidth: { value: 100 }, clientHeight: { value: 20 }, scrollWidth: { value: 180 }
  })
  expect(isRedundantTooltip(element, 'Long document name')).toBe(false)
})
