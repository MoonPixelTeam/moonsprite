export type PaletteLayoutMode = 'manual' | 'auto'
export interface PaletteGridLine {
  key: string
  column: number
  row: number
  side: 'left' | 'right' | 'top' | 'bottom'
  position: 'edge' | 'gap'
  extend: boolean
  hidden: boolean
}

/** Keep four stable edges per color so wrapping never needs new DOM nodes. */
export function paletteGridLines(slots: readonly (number | null)[], columns: number): PaletteGridLine[] {
  const cells = slots.flatMap((id, index) => id === null ? [] : [{ id, index }])
  return paletteCellLines(cells, columns, slots.length)
}

function paletteCellLines(cells: readonly { id: number; index: number }[], columns: number, length: number): PaletteGridLine[] {
  const occupiedSlots = new Set(cells.map(cell => cell.index))
  return cells.flatMap(({ id, index }) => {
    const column = index % columns, row = Math.floor(index / columns)
    const occupied = (offset: number): boolean => occupiedSlots.has(offset)
    const right = column < columns - 1 && index + 1 < length
    const bottom = index + columns < length
    return [
      { key: `${id}-left`, column, row, side: 'left', position: column === 0 ? 'edge' : 'gap', extend: bottom, hidden: column > 0 && occupied(index - 1) },
      { key: `${id}-right`, column, row, side: 'right', position: right ? 'gap' : 'edge', extend: bottom, hidden: false },
      { key: `${id}-top`, column, row, side: 'top', position: row === 0 ? 'edge' : 'gap', extend: right, hidden: row > 0 && occupied(index - columns) },
      { key: `${id}-bottom`, column, row, side: 'bottom', position: bottom ? 'gap' : 'edge', extend: right, hidden: false }
    ] as PaletteGridLine[]
  })
}

export const paletteGridLineClass = (line: PaletteGridLine): string =>
  `palette-cell-line palette-cell-line-${line.side} palette-cell-line-${line.position} ${line.extend ? 'palette-cell-line-extended' : ''}`

const autoCellEdges = (index: number, columns: number, length: number) => ({
  'palette-auto-left': index % columns === 0,
  'palette-auto-top': index < columns,
  'palette-auto-right-gap': index % columns < columns - 1 && index + 1 < length,
  'palette-auto-bottom-gap': index + columns < length
})

export const paletteAutoCellClass = (index: number, columns: number, length: number): string =>
  Object.entries(autoCellEdges(index, columns, length)).filter(([, enabled]) => enabled).map(([name]) => name).join(' ')

/** Browser layout preview only. React still owns the committed slots and events. */
export function createPaletteGridResize(grid: HTMLElement, sourceColumns: number, mode: PaletteLayoutMode) {
  const surface = grid.querySelector<HTMLElement>('.palette-swatch-grid-surface')
  const buttons = [...grid.querySelectorAll<HTMLElement>('[data-palette-slot]')]
  const cells = buttons.map(button => ({ index: Number(button.dataset.paletteSlot), element: button.closest<HTMLElement>('.palette-swatch-wrap') }))
  const colors = buttons.filter(button => button.dataset.paletteId !== undefined).map(button => ({
    id: Number(button.dataset.paletteId), index: Number(button.dataset.paletteSlot), selected: button.classList.contains('selected')
  }))
  const lines = new Map([...grid.querySelectorAll<HTMLElement>('[data-palette-line]')].map(line => [line.dataset.paletteLine!, line]))
  const outline = grid.querySelector<HTMLElement>('[data-palette-selection-outline]')
  const setNumber = (element: HTMLElement, name: string, value: number): void => {
    const text = String(value)
    if (element.style.getPropertyValue(name) !== text) element.style.setProperty(name, text)
  }
  return {
    update(columns: number): void {
      const surfaceColumns = mode === 'auto' ? Math.max(1, Math.min(columns, buttons.length)) : columns
      if (mode === 'manual') grid.classList.add('palette-grid-resizing-manual')
      // Only the grid owner needs this value. An inherited variable here would
      // invalidate every swatch and border on each column change.
      if (surface) setNumber(surface, '--palette-layout-columns', surfaceColumns)
      if (mode === 'auto') for (const cell of cells) {
        if (!cell.element) continue
        for (const [name, enabled] of Object.entries(autoCellEdges(cell.index, surfaceColumns, buttons.length))) {
          if (cell.element.classList.contains(name) !== enabled) cell.element.classList.toggle(name, enabled)
        }
      }
      const placed = colors.map(color => ({ ...color, index: mode === 'manual'
        ? Math.floor(color.index / sourceColumns) * columns + color.index % sourceColumns : color.index }))
      const length = placed.reduce((maximum, color) => Math.max(maximum, color.index + 1), mode === 'manual' ? columns : 0)
      for (const line of lines.size ? paletteCellLines(placed, surfaceColumns, length) : []) {
        const element = lines.get(line.key)
        if (!element) continue
        const className = paletteGridLineClass(line)
        if (element.className !== className) element.className = className
        if (element.hidden !== line.hidden) element.hidden = line.hidden
        setNumber(element, '--palette-line-column', line.column)
        setNumber(element, '--palette-line-row', line.row)
      }
      if (mode === 'auto' && outline) {
        const selected = placed.filter(color => color.selected)
        if (selected.length) {
          let left = Infinity, top = Infinity, right = 0, bottom = 0
          for (const color of selected) {
            const x = color.index % columns, y = Math.floor(color.index / columns)
            left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
          }
          setNumber(outline, '--palette-selection-left', left)
          setNumber(outline, '--palette-selection-top', top)
          setNumber(outline, '--palette-selection-width', right - left + 1)
          setNumber(outline, '--palette-selection-height', bottom - top + 1)
        }
      }
    },
    finish(): void { grid.classList.remove('palette-grid-resizing-manual') }
  }
}
