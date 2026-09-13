import { expect, it } from 'vitest'
import { createPaletteGridResize, paletteGridLines, paletteGridLineClass, paletteAutoCellClass } from './palette-grid-resize'

const makeGrid = (slots: Array<number | null>, columns: number): HTMLElement => {
  const grid = document.createElement('div')
  const surface = document.createElement('span')
  surface.className = 'palette-swatch-grid-surface'
  grid.append(surface)
  slots.forEach((id, index) => {
    const wrap = document.createElement('span')
    wrap.className = 'palette-swatch-wrap'
    wrap.style.left = `${index % columns * 31}px`
    wrap.style.top = `${Math.floor(index / columns) * 31}px`
    const button = document.createElement('button')
    button.dataset.paletteSlot = String(index)
    if (id !== null) button.dataset.paletteId = String(id)
    if (id === 2 || id === 3) button.classList.add('selected')
    wrap.append(button)
    surface.append(wrap)
  })
  for (const line of paletteGridLines(slots, columns)) {
    const element = document.createElement('span')
    element.dataset.paletteLine = line.key
    element.hidden = line.hidden
    element.className = paletteGridLineClass(line)
    element.style.setProperty('--palette-line-column', String(line.column))
    element.style.setProperty('--palette-line-row', String(line.row))
    surface.append(element)
  }
  const outline = document.createElement('span')
  outline.dataset.paletteSelectionOutline = ''
  grid.append(outline)
  return grid
}

it('wraps auto colors and selected outlines without replacing buttons or losing boundary edges', () => {
  const grid = makeGrid([1, 2, 3, 4, 5, 6], 3)
  const buttons = [...grid.querySelectorAll('button')]
  const preview = createPaletteGridResize(grid, 3, 'auto')
  preview.update(2)
  expect([...grid.querySelectorAll('button')]).toEqual(buttons)
  expect(buttons[2].parentElement!.classList.contains('palette-auto-left')).toBe(true)
  expect(buttons[2].parentElement!.classList.contains('palette-auto-top')).toBe(false)
  const left3 = grid.querySelector<HTMLElement>('[data-palette-line="3-left"]')!
  expect(left3.hidden).toBe(false)
  expect(left3.style.getPropertyValue('--palette-line-column')).toBe('0')
  expect(left3.style.getPropertyValue('--palette-line-row')).toBe('1')
  expect(grid.querySelector<HTMLElement>('[data-palette-line="4-top"]')!.hidden).toBe(true)
  const outline = grid.querySelector<HTMLElement>('[data-palette-selection-outline]')!
  expect(outline.style.getPropertyValue('--palette-selection-width')).toBe('2')
  expect(outline.style.getPropertyValue('--palette-selection-height')).toBe('2')
  preview.update(3)
  expect(buttons[2].parentElement!.classList.contains('palette-auto-top')).toBe(true)
  expect(left3.hidden).toBe(true)
  expect(outline.style.getPropertyValue('--palette-selection-height')).toBe('1')
  preview.finish()
})

it('retains sparse manual cell coordinates across widening and narrowing', () => {
  const grid = makeGrid([1, null, 2, null, null, 3, 4], 4)
  const preview = createPaletteGridResize(grid, 4, 'manual')
  const initialChildren = [...grid.children]
  const originalPositions = [...grid.querySelectorAll<HTMLElement>('.palette-swatch-wrap')].map(cell => cell.style.cssText)
  for (const columns of [8, 3, 16, 4]) {
    preview.update(columns)
    const edge = grid.querySelector<HTMLElement>('[data-palette-line="4-right"]')!
    expect(edge.style.getPropertyValue('--palette-line-column')).toBe('2')
    expect(edge.style.getPropertyValue('--palette-line-row')).toBe('1')
    expect([...grid.children]).toEqual(initialChildren)
    expect([...grid.querySelectorAll<HTMLElement>('.palette-swatch-wrap')].map(cell => cell.style.cssText)).toEqual(originalPositions)
    expect(grid.classList.contains('palette-grid-resizing-manual')).toBe(true)
  }
  preview.finish()
  expect(grid.classList.contains('palette-grid-resizing-manual')).toBe(false)
})

it('matches the original edge geometry for dense auto palettes, including incomplete rows', () => {
  for (const length of [1, 5, 16, 127]) for (const capacity of [1, 2, 4, 8, 17, 128]) {
    const columns = Math.min(length, capacity)
    const lines = paletteGridLines(Array.from({ length }, (_, index) => index + 1), columns)
    for (let index = 0; index < length; index++) {
      const classes = paletteAutoCellClass(index, columns, length).split(' ')
      const [left, right, top, bottom] = lines.slice(index * 4, index * 4 + 4)
      expect(classes.includes('palette-auto-left')).toBe(!left.hidden)
      expect(classes.includes('palette-auto-top')).toBe(!top.hidden)
      expect(classes.includes('palette-auto-right-gap')).toBe(right.position === 'gap')
      expect(classes.includes('palette-auto-bottom-gap')).toBe(bottom.position === 'gap')
    }
  }
})

it('updates auto cell borders and selection without separate edge nodes', () => {
  const grid = makeGrid([1, 2, 3, 4, 5], 3)
  grid.querySelectorAll('[data-palette-line]').forEach(line => line.remove())
  const buttons = [...grid.querySelectorAll('button')]
  const preview = createPaletteGridResize(grid, 3, 'auto')
  for (const columns of [1, 2, 4, 8, 3]) {
    preview.update(columns)
    buttons.forEach((button, index) => {
      const actual = [...button.parentElement!.classList].filter(name => name.startsWith('palette-auto-'))
      expect(actual.sort()).toEqual(paletteAutoCellClass(index, Math.min(columns, 5), 5).split(' ').filter(Boolean).sort())
    })
    expect([...grid.querySelectorAll('button')]).toEqual(buttons)
    expect(grid.querySelectorAll('[data-palette-line]')).toHaveLength(0)
  }
  expect(grid.querySelector<HTMLElement>('[data-palette-selection-outline]')!.style.getPropertyValue('--palette-selection-height')).toBe('1')
  preview.finish()
})
