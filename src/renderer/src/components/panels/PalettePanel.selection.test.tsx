import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { palettePanelRenderKey } from '@/core/panel-render-keys'
import { useWorkspace } from '@/store/workspace'
import { PalettePanel } from './PalettePanel'

vi.mock('@/components/use-palette-grid-columns', () => ({ usePaletteGridColumns: () => 10 }))

const rectangle = (x: number, y: number, width: number, height: number): DOMRect =>
  ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) })

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('moonsprite.palette-layout-mode', 'auto')
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId = 1
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.matches('[data-palette-slot]')) {
      const slot = Number(this.dataset.paletteSlot)
      return rectangle(10 + slot % 10 * 31, 10 + Math.floor(slot / 10) * 31, 30, 30)
    }
    if (this.matches('.swatch-grid')) return rectangle(0, 0, 340, 200)
    if (this.matches('.palette-selection-box')) {
      const value = (name: string) => Number(this.style.getPropertyValue(`--palette-selection-${name}`))
      return rectangle(10 + value('left') * 31, 10 + value('top') * 31, value('width') * 31 - 1, value('height') * 31 - 1)
    }
    if (this.matches('.palette-swatch-grid-surface')) return rectangle(10, 10, 309, 61)
    return rectangle(0, 0, 0, 0)
  })
  // jsdom does not lay out SVG lines; model their real boundary geometry.
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: SVGElement) {
    const x1 = Number(this.getAttribute('x1')), x2 = Number(this.getAttribute('x2'))
    const y1 = Number(this.getAttribute('y1')), y2 = Number(this.getAttribute('y2'))
    return rectangle(9.5 + x1, 9.5 + y1, x2 - x1, y2 - y1)
  })
  const document = createDocument('palette selection', 1, 1, 'rgba')
  document.palette = Array.from({ length: 16 }, (_, index) => ({
    id: index + 1, name: `Color ${index + 1}`, color: { r: index * 10, g: 0, b: 0, a: 255 }
  }))
  document.paletteOrder = document.palette.map(entry => entry.id)
  document.nextColorId = 17
  document.paletteColumns = 10
  document.paletteSlots = [...document.paletteOrder, null, null, null, null]
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().selectPaletteColors([], -1)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
})

function Harness() {
  const session = useWorkspace(state => state.sessions[0])
  // Document commands mutate the session in place; the app subscribes to this
  // render key as well so palette-only edits reach the panel.
  useWorkspace(state => palettePanelRenderKey(state.sessions[0]))
  return <PalettePanel session={session} docked />
}

const session = () => useWorkspace.getState().sessions[0]

describe('palette selection gestures and clipboard', () => {
  it.each([0, 2])('selects a color with button %s and preserves the other color role', button => {
    const primary = { ...session().primaryColor }
    const secondary = { ...session().secondaryColor }
    const { container } = render(<Harness />)
    const swatch = container.querySelector('[data-palette-slot="2"]')!
    fireEvent.pointerDown(swatch, { button, clientX: 87, clientY: 25 })
    fireEvent.pointerUp(swatch, { button, clientX: 87, clientY: 25 })
    expect(session().selectedPaletteIds).toEqual([3])
    expect(swatch).toHaveClass('selected')
    const color = session().document.palette.find(entry => entry.id === 3)!.color
    expect(session().primaryColor).toEqual(button === 0 ? color : primary)
    expect(session().secondaryColor).toEqual(button === 2 ? color : secondary)
    expect(container.querySelector('[data-palette-selection-outline]')).not.toBeNull()
  })

  it('right-clicks an already selected color without moving it or changing foreground', () => {
    useWorkspace.getState().selectPaletteColors([1, 2], 1)
    const primary = { ...session().primaryColor }
    const order = [...session().document.paletteOrder]
    const { container } = render(<Harness />)
    const swatch = container.querySelector('[data-palette-slot="1"]')!
    fireEvent.pointerDown(swatch, { button: 2, clientX: 56, clientY: 25 })
    fireEvent.pointerUp(swatch, { button: 2, clientX: 56, clientY: 25 })
    expect(session().selectedPaletteIds).toEqual([2])
    expect(session().paletteSecondarySelectionId).toBe(2)
    expect(session().primaryColor).toEqual(primary)
    expect(session().document.paletteOrder).toEqual(order)
  })

  it('activates the shared selection hover state on the outline and clears it away from the edge', () => {
    useWorkspace.getState().selectPaletteColors([1, 2], 1)
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    fireEvent.pointerMove(grid, { clientX: 25, clientY: 10 })
    expect(grid).toHaveClass('selection-outline-hovered')
    fireEvent.pointerMove(grid, { clientX: 273, clientY: 149 })
    expect(grid).not.toHaveClass('selection-outline-hovered')
  })

  it('updates the role marker while a left or right selection drag crosses cells', () => {
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    const dragRole = (button: number, from: string, to: string) => {
      fireEvent.pointerDown(container.querySelector(`[data-palette-slot="${from}"]`)!, { button, clientX: 10 + Number(from) % 10 * 31 + 15, clientY: 25 })
      fireEvent.pointerMove(grid, { clientX: 10 + Number(to) % 10 * 31 + 15, clientY: 25, buttons: button === 2 ? 2 : 1 })
      expect(button === 0 ? session().paletteSelectionId : session().paletteSecondarySelectionId).toBe(Number(to) + 1)
      fireEvent.pointerUp(grid, { button, clientX: 10 + Number(to) % 10 * 31 + 15, clientY: 25 })
    }
    dragRole(0, '0', '3')
    expect(container.querySelector('[data-palette-id="4"]')).toHaveClass('primary')
    dragRole(2, '4', '6')
    expect(container.querySelector('[data-palette-id="7"]')).toHaveClass('secondary')
  })

  it.each(['release', 'cancel', 'blur'])('retains the original handle cursor during capture and restores it on %s', finish => {
    const { container } = render(<Harness />)
    const handle = container.querySelector<HTMLElement>('[data-palette-grow]')!
    const grid = container.querySelector<HTMLElement>('.swatch-grid')!
    handle.style.cursor = 'ew-resize'
    fireEvent.pointerDown(handle, { button: 0, clientX: 211, clientY: 56 })
    expect(grid).toHaveClass('palette-grow-dragging')
    expect(grid.style.getPropertyValue('--palette-grow-cursor')).toBe('ew-resize')
    fireEvent.pointerMove(grid, { clientX: 304, clientY: 56, buttons: 1 })
    expect(grid).toHaveClass('palette-grow-dragging')
    if (finish === 'release') fireEvent.pointerUp(grid)
    else if (finish === 'cancel') fireEvent.pointerCancel(grid)
    else fireEvent.blur(window)
    expect(grid).not.toHaveClass('palette-grow-dragging')
  })

  it('marks only the picked foreground and background slots among duplicate colors', () => {
    const store = useWorkspace.getState()
    const color = { r: 42, g: 128, b: 230, a: 255 }
    const first = store.addPaletteColor(color)!
    const second = store.addPaletteColor(color)!
    const third = store.addPaletteColor(color)!
    store.selectPaletteColor(second)
    store.selectSecondaryPaletteColor(third)
    const { container } = render(<Harness />)
    const marker = (role: string) => Array.from(container.querySelectorAll<HTMLElement>(`[data-palette-id].${role}`)).map(element => Number(element.dataset.paletteId))
    expect(marker('primary')).toEqual([second])
    expect(marker('secondary')).toEqual([third])
    act(() => store.selectSecondaryPaletteColor(first))
    expect(marker('secondary')).toEqual([first])
    act(() => store.selectPaletteColor(third))
    expect(marker('primary')).toEqual([third])
    expect(marker('secondary')).toEqual([first])
  })

  it('falls back to one visible matching slot after a marked duplicate is removed', () => {
    const store = useWorkspace.getState()
    const color = { r: 42, g: 128, b: 230, a: 255 }
    const first = store.addPaletteColor(color)!
    const second = store.addPaletteColor(color)!
    store.selectPaletteColor(second)
    store.selectSecondaryPaletteColor(second)
    const { container } = render(<Harness />)
    act(() => store.deletePaletteColors([second]))
    expect(container.querySelectorAll('[data-palette-id].primary')).toHaveLength(1)
    expect(container.querySelectorAll('[data-palette-id].secondary')).toHaveLength(1)
    expect(container.querySelector('[data-palette-id].primary')).toHaveAttribute('data-palette-id', String(first))
    expect(container.querySelector('[data-palette-id].secondary')).toHaveAttribute('data-palette-id', String(first))
  })

  it.each(['outside', 'color-panel', 'palette-blank'])('clears selection when clicking %s', region => {
    useWorkspace.getState().selectPaletteColors([1, 2], 2)
    const { container } = render(<><Harness /><div data-testid="outside" /><div className="color-panel" /></>)
    expect(container.querySelectorAll('[data-palette-slot].selected')).toHaveLength(2)
    const target = region === 'palette-blank' ? container.querySelector('.swatch-grid')!
      : region === 'color-panel' ? container.querySelector('.color-panel')! : container.querySelector('[data-testid="outside"]')!
    fireEvent.pointerDown(target, { button: 0, clientX: 330, clientY: 180 })
    expect(session().selectedPaletteIds).toEqual([])
    expect(session().paletteSelectionId).toBeNull()
    expect(container.querySelector('[data-palette-slot].selected')).toBeNull()
    expect(container.querySelector('[data-palette-selection-outline]')).toBeNull()
  })

  it('does not select generated slots during dragging, after release, or after redo', () => {
    useWorkspace.getState().selectPaletteColors([1, 2], 2)
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    const primary = { ...session().primaryColor }
    fireEvent.pointerDown(container.querySelector('[data-palette-grow]')!, { button: 0, clientX: 211, clientY: 56 })
    fireEvent.pointerMove(grid, { clientX: 304, clientY: 56, buttons: 1 })
    expect(container.querySelector('[data-palette-slot].selected')).toBeNull()
    fireEvent.pointerUp(grid)
    expect(session().document.paletteOrder).toHaveLength(19)
    expect(session().selectedPaletteIds).toEqual([])
    expect(session().paletteSelectionId).toBeNull()
    expect(session().primaryColor).toEqual(primary)
    expect(container.querySelector('[data-palette-selection-outline]')).toBeNull()
    act(() => useWorkspace.getState().undo())
    act(() => useWorkspace.getState().redo())
    expect(container.querySelector('[data-palette-slot].selected')).toBeNull()
    expect(session().selectedPaletteIds).toEqual([])
  })

  it.each([0, 2])('moves manual colors with button %s and restores their slots on undo', button => {
    localStorage.setItem('moonsprite.palette-layout-mode', 'manual')
    useWorkspace.getState().selectPaletteColors([1, 2], 1)
    const before = [...session().document.paletteSlots!]
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    fireEvent.pointerDown(container.querySelector('[data-palette-slot="0"]')!, { button, clientX: 25, clientY: 10 })
    fireEvent.pointerMove(grid, { clientX: 273, clientY: 149, buttons: button === 2 ? 2 : 1 })
    expect(container.querySelector('[data-palette-slot="48"]')).toHaveAttribute('data-palette-id', '1')
    expect(container.querySelector('[data-palette-slot="49"]')).toHaveAttribute('data-palette-id', '2')
    fireEvent.pointerUp(grid, { clientX: 273, clientY: 149 })
    expect(session().document.paletteSlots?.slice(48, 50)).toEqual([1, 2])
    expect(session().document.paletteSlots?.slice(0, 2)).toEqual([null, null])
    act(() => useWorkspace.getState().undo())
    expect(session().document.paletteSlots).toEqual(before)
    act(() => useWorkspace.getState().redo())
    expect(session().document.paletteSlots?.slice(48, 50)).toEqual([1, 2])
  })

  it('selects a manual empty slot and a rectangle entirely below the existing colors', () => {
    localStorage.setItem('moonsprite.palette-layout-mode', 'manual')
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    const historyPosition = session().history.position
    fireEvent.pointerDown(grid, { button: 0, clientX: 273, clientY: 149 })
    fireEvent.pointerUp(grid, { clientX: 273, clientY: 149 })
    let outline = container.querySelector<HTMLElement>('.palette-selection-box')!
    expect(outline.style.getPropertyValue('--palette-selection-left')).toBe('8')
    expect(outline.style.getPropertyValue('--palette-selection-top')).toBe('4')
    fireEvent.pointerDown(grid, { button: 0, clientX: 25, clientY: 118 })
    fireEvent.pointerMove(grid, { clientX: 273, clientY: 180, buttons: 1 })
    fireEvent.pointerUp(grid, { clientX: 273, clientY: 180 })
    outline = container.querySelector<HTMLElement>('.palette-selection-box')!
    expect(outline.style.getPropertyValue('--palette-selection-left')).toBe('0')
    expect(outline.style.getPropertyValue('--palette-selection-top')).toBe('3')
    expect(outline.style.getPropertyValue('--palette-selection-width')).toBe('9')
    expect(outline.style.getPropertyValue('--palette-selection-height')).toBe('3')
    expect(session().selectedPaletteIds).toEqual([])
    expect(session().history.position).toBe(historyPosition)
  })

  it('starts a manual box selection in virtual empty space and selects colors in reverse', () => {
    localStorage.setItem('moonsprite.palette-layout-mode', 'manual')
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    fireEvent.pointerDown(grid, { button: 0, clientX: 304, clientY: 180 })
    fireEvent.pointerMove(grid, { clientX: 25, clientY: 25, buttons: 1 })
    fireEvent.pointerUp(grid, { clientX: 25, clientY: 25 })
    expect(session().selectedPaletteIds).toEqual(session().document.paletteOrder)
    const outline = container.querySelector<HTMLElement>('.palette-selection-box')!
    expect(outline.style.getPropertyValue('--palette-selection-width')).toBe('10')
    expect(outline.style.getPropertyValue('--palette-selection-height')).toBe('6')
    expect(container.querySelector('.palette-selection-outline')).toBeNull()
  })

  it('keeps the empty margins of a manual rectangle while moving its colors', () => {
    localStorage.setItem('moonsprite.palette-layout-mode', 'manual')
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    fireEvent.pointerDown(container.querySelector('[data-palette-slot="10"]')!, { button: 0, clientX: 25, clientY: 56 })
    fireEvent.pointerMove(grid, { clientX: 273, clientY: 118, buttons: 1 })
    fireEvent.pointerUp(grid, { clientX: 273, clientY: 118 })
    fireEvent.pointerDown(grid, { button: 0, clientX: 25, clientY: 41 })
    fireEvent.pointerMove(grid, { clientX: 56, clientY: 87, buttons: 1 })
    fireEvent.pointerUp(grid, { clientX: 56, clientY: 87 })
    const outline = container.querySelector<HTMLElement>('.palette-selection-box')!
    expect(outline.style.getPropertyValue('--palette-selection-left')).toBe('1')
    expect(outline.style.getPropertyValue('--palette-selection-top')).toBe('2')
    expect(outline.style.getPropertyValue('--palette-selection-width')).toBe('9')
    expect(outline.style.getPropertyValue('--palette-selection-height')).toBe('3')
    expect(session().document.paletteSlots?.slice(21, 27)).toEqual([11, 12, 13, 14, 15, 16])
  })

  it('allows newly exposed manual space after a height resize without adding empty buttons', () => {
    localStorage.setItem('moonsprite.palette-layout-mode', 'manual')
    const { container } = render(<Harness />)
    const grid = container.querySelector<HTMLElement>('.swatch-grid')!
    const buttonCount = container.querySelectorAll('[data-palette-slot]').length
    Object.defineProperty(grid, 'getBoundingClientRect', { value: () => rectangle(0, 0, 340, 400) })
    fireEvent.pointerDown(grid, { button: 0, clientX: 273, clientY: 366 })
    fireEvent.pointerUp(grid, { clientX: 273, clientY: 366 })
    const outline = container.querySelector<HTMLElement>('.palette-selection-box')!
    expect(outline.style.getPropertyValue('--palette-selection-top')).toBe('11')
    expect(container.querySelectorAll('[data-palette-slot]')).toHaveLength(buttonCount)
    fireEvent.doubleClick(grid, { clientX: 273, clientY: 366 })
    expect(session().document.paletteSlots?.indexOf(17)).toBe(118)
    expect(container.querySelector('[data-palette-slot="118"]')).toHaveAttribute('data-palette-id')
  })

  it.each([[330, 60], [330, 150], [400, 250]])('selects the incomplete last row when dragging to (%i, %i)', (clientX, clientY) => {
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    fireEvent.pointerDown(container.querySelector('[data-palette-slot="0"]')!, { button: 0, clientX: 25, clientY: 25 })
    fireEvent.pointerMove(grid, { clientX, clientY, buttons: 1 })
    expect(container.querySelectorAll('[aria-pressed="true"][data-palette-id]')).toHaveLength(16)
    fireEvent.pointerUp(grid, { clientX, clientY })
    expect(session().selectedPaletteIds).toEqual(session().document.paletteOrder)
    // The outline turns at the short row, with no internal or empty-cell edges.
    expect(container.querySelector('[data-slot="9"][data-side="bottom"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="15"][data-side="right"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="5"][data-side="bottom"]')).toBeNull()
    expect(container.querySelector('[data-slot="16"]')).toBeNull()
    expect(container.querySelectorAll('[data-palette-selection-outline]')).toHaveLength(24)
  })

  it('starts a new selection on an internal seam instead of moving the old group', () => {
    useWorkspace.getState().selectPaletteColors(session().document.paletteOrder, 1)
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    fireEvent.pointerDown(container.querySelector('[data-palette-slot="1"]')!, { button: 0, clientX: 42, clientY: 25 })
    fireEvent.pointerMove(grid, { clientX: 87, clientY: 25, buttons: 1 })
    fireEvent.pointerUp(grid, { clientX: 87, clientY: 25 })
    expect(session().selectedPaletteIds).toEqual([2, 3])
    expect(session().document.paletteOrder).toEqual(Array.from({ length: 16 }, (_, index) => index + 1))
  })

  it('moves the outline with the colors when dragging an actual outer edge', () => {
    useWorkspace.getState().selectPaletteColors([1, 2], 1)
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    fireEvent.pointerDown(container.querySelector('[data-palette-slot="0"]')!, { button: 0, clientX: 25, clientY: 10 })
    fireEvent.pointerMove(grid, { clientX: 56, clientY: 56, buttons: 1 })
    expect(container.querySelector('[data-slot="11"][data-side="top"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="12"][data-side="right"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="0"]')).toBeNull()
    fireEvent.pointerUp(grid, { clientX: 56, clientY: 56 })
    expect(session().selectedPaletteIds).toEqual([1, 2])
  })

  it('copies selected duplicate colors and pastes over the selected targets in place', async () => {
    const workspace = useWorkspace.getState()
    const color = { r: 42, g: 128, b: 230, a: 255 }
    const first = workspace.addPaletteColor(color)!
    const second = workspace.addPaletteColor(color)!
    expect(first).not.toBe(second)
    workspace.selectPaletteColors([first, second], second)
    let clipboard = ''
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(async (value: string) => { clipboard = value }),
        readText: vi.fn(async () => clipboard)
      }
    })
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    await act(async () => { fireEvent.keyDown(grid, { key: 'c', ctrlKey: true }) })
    expect(JSON.parse(clipboard.split(':').slice(1).join(':'))).toEqual([color, color])
    const order = [...session().document.paletteOrder]
    const before = session().document.palette.slice(0, 2).map(entry => ({ ...entry.color }))
    act(() => workspace.selectPaletteColors([1, 2], 2))
    await act(async () => { fireEvent.keyDown(grid, { key: 'v', ctrlKey: true }) })
    expect(session().document.palette.slice(0, 2).map(entry => entry.color)).toEqual([color, color])
    expect(session().document.paletteOrder).toEqual(order)
    act(() => workspace.undo())
    expect(session().document.palette.slice(0, 2).map(entry => entry.color)).toEqual(before)
    act(() => workspace.redo())
    expect(session().document.palette.slice(0, 2).map(entry => entry.color)).toEqual([color, color])
    act(() => workspace.selectPaletteColors([], -1))
    await act(async () => { fireEvent.keyDown(grid, { key: 'v', ctrlKey: true }) })
    expect(session().document.paletteOrder).toHaveLength(order.length + 2)
    expect(new Set(session().selectedPaletteIds).size).toBe(2)
  })

  it('adds black colors by dragging the adaptive empty slot to the right', () => {
    localStorage.setItem('moonsprite.palette-edit-locked', 'false')
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    const empty = container.querySelector('[data-palette-grow]')!
    fireEvent.pointerDown(empty, { button: 0, clientX: 211, clientY: 41 })
    fireEvent.pointerMove(grid, { clientX: 304, clientY: 41, buttons: 1 })
    expect(container.querySelectorAll('.palette-grow-handle').length).toBe(1)
    expect(container.querySelector('[data-palette-grow-slot="19"]')).not.toBeNull()
    expect(container.querySelectorAll('.palette-swatch-grid-surface .occupied').length).toBeGreaterThan(16)
    fireEvent.pointerUp(grid, { clientX: 304, clientY: 41 })
    const black = session().document.palette.filter(entry => entry.color.r === 0 && entry.color.g === 0 && entry.color.b === 0 && entry.color.a === 255)
    expect(black.length).toBe(4)
    expect(session().document.paletteOrder).toHaveLength(19)
    expect(session().document.paletteSlots?.slice(16, 19)).toEqual(session().document.paletteOrder.slice(16, 19))
  })

  it('keeps the handle and preview aligned when growing downward', () => {
    localStorage.setItem('moonsprite.palette-edit-locked', 'false')
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    const empty = container.querySelector('[data-palette-grow]')!
    fireEvent.pointerDown(empty, { button: 0, clientX: 211, clientY: 41 })
    fireEvent.pointerMove(grid, { clientX: 211, clientY: 72, buttons: 1 })
    expect(container.querySelector('[data-palette-grow-slot="26"]')).not.toBeNull()
    expect(container.querySelector('[data-palette-slot="16"]')).toHaveClass('occupied')
    expect(container.querySelector('[data-palette-slot="25"]')).toHaveClass('occupied')
    expect(container.querySelector('[data-palette-slot="26"]')).toBeNull()
    fireEvent.pointerUp(grid, { clientX: 211, clientY: 72 })
    const slots = session().document.paletteSlots!
    expect(slots[16]).toBe(session().document.paletteOrder[16])
    expect(session().document.paletteOrder).toHaveLength(26)
    expect(slots[25]).toBe(session().document.paletteOrder[25])
  })

  it('retracts pending black slots when dragging the handle back to its starting cell', () => {
    localStorage.setItem('moonsprite.palette-edit-locked', 'false')
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    const empty = container.querySelector('[data-palette-grow]')!
    fireEvent.pointerDown(empty, { button: 0, clientX: 211, clientY: 41 })
    fireEvent.pointerMove(grid, { clientX: 304, clientY: 41, buttons: 1 })
    expect(container.querySelectorAll('.palette-swatch-grid-surface .occupied').length).toBeGreaterThan(16)
    fireEvent.pointerMove(grid, { clientX: 211, clientY: 41, buttons: 1 })
    expect(container.querySelectorAll('.palette-swatch-grid-surface .occupied').length).toBe(16)
    fireEvent.pointerUp(grid, { clientX: 211, clientY: 41 })
    expect(session().document.paletteOrder).toHaveLength(16)
  })

  it('shrinks committed slots in a second drag and restores them with undo and redo', () => {
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    const handle = () => container.querySelector('[data-palette-grow]')!
    const visible = () => Array.from(container.querySelectorAll<HTMLElement>('[data-palette-id]')).map(element => Number(element.dataset.paletteId))
    const original = [...session().document.paletteOrder]
    fireEvent.pointerDown(handle(), { button: 0, clientX: 211, clientY: 56 })
    fireEvent.pointerMove(grid, { clientX: 304, clientY: 56, buttons: 1 })
    fireEvent.pointerUp(grid)
    const expanded = [...session().document.paletteOrder]
    expect(expanded).toHaveLength(19)
    const historyPosition = session().history.position
    fireEvent.pointerDown(handle(), { button: 0, clientX: 304, clientY: 56 })
    fireEvent.pointerMove(grid, { clientX: 211, clientY: 56, buttons: 1 })
    expect(handle()).toHaveAttribute('data-palette-grow-slot', '16')
    expect(visible()).toEqual(original)
    // Resizing is a preview until release, even for previously committed cells.
    expect(session().document.paletteOrder).toEqual(expanded)
    expect(session().history.position).toBe(historyPosition)
    fireEvent.pointerUp(grid)
    expect(session().document.paletteOrder).toEqual(original)
    expect(visible()).toEqual(original)
    expect(session().history.position).toBe(historyPosition + 1)
    act(() => useWorkspace.getState().undo())
    expect(visible()).toEqual(expanded)
    act(() => useWorkspace.getState().redo())
    expect(visible()).toEqual(original)
  })

  it('restores existing colors when reversing a shrink and cancels without editing history', () => {
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    const handle = container.querySelector('[data-palette-grow]')!
    const original = [...session().document.paletteOrder]
    const historyPosition = session().history.position
    fireEvent.pointerDown(handle, { button: 0, clientX: 211, clientY: 56 })
    expect(container.querySelectorAll('.occupied')).toHaveLength(16)
    fireEvent.pointerMove(grid, { clientX: 118, clientY: 56, buttons: 1 })
    expect(container.querySelectorAll('.occupied')).toHaveLength(13)
    fireEvent.pointerMove(grid, { clientX: 211, clientY: 56, buttons: 1 })
    expect(container.querySelector('[data-palette-slot="15"]')).toHaveAttribute('data-palette-id', '16')
    fireEvent.pointerUp(grid)
    expect(session().history.position).toBe(historyPosition)
    fireEvent.pointerDown(handle, { button: 0, clientX: 211, clientY: 56 })
    fireEvent.pointerMove(grid, { clientX: 25, clientY: 25, buttons: 1 })
    expect(container.querySelectorAll('.occupied')).toHaveLength(1)
    fireEvent.pointerCancel(grid)
    expect(container.querySelectorAll('.occupied')).toHaveLength(16)
    expect(session().document.paletteOrder).toEqual(original)
    expect(session().history.position).toBe(historyPosition)
  })

  it('preserves the copied row and restores the destination rectangle on undo', async () => {
    localStorage.setItem('moonsprite.palette-layout-mode', 'manual')
    useWorkspace.getState().selectPaletteColors([1, 2, 3, 4], 4)
    let clipboard = ''
    vi.stubGlobal('navigator', { clipboard: {
      writeText: vi.fn(async (value: string) => { clipboard = value }), readText: vi.fn(async () => clipboard)
    } })
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    await act(async () => { fireEvent.keyDown(grid, { key: 'c', ctrlKey: true }) })
    fireEvent.pointerDown(grid, { button: 0, clientX: 87, clientY: 118 })
    fireEvent.pointerMove(grid, { clientX: 149, clientY: 149, buttons: 1 })
    fireEvent.pointerUp(grid, { clientX: 149, clientY: 149 })
    const historyPosition = session().history.position
    await act(async () => { fireEvent.keyDown(grid, { key: 'v', ctrlKey: true }) })
    const slots = session().document.paletteSlots!
    const colors = [32, 33, 34, 35].map(slot => session().document.palette.find(entry => entry.id === slots[slot])!.color.r)
    expect(colors).toEqual([0, 10, 20, 30])
    expect(slots[43] ?? null).toBeNull()
    const outline = container.querySelector<HTMLElement>('.palette-selection-box')!
    expect(outline.style.getPropertyValue('--palette-selection-left')).toBe('2')
    expect(outline.style.getPropertyValue('--palette-selection-top')).toBe('3')
    expect(outline.style.getPropertyValue('--palette-selection-width')).toBe('4')
    expect(outline.style.getPropertyValue('--palette-selection-height')).toBe('1')
    expect(session().history.position).toBe(historyPosition + 1)
    act(() => useWorkspace.getState().undo())
    expect(session().document.paletteOrder).toHaveLength(16)
    expect(outline.style.getPropertyValue('--palette-selection-width')).toBe('3')
    expect(outline.style.getPropertyValue('--palette-selection-height')).toBe('2')
    act(() => useWorkspace.getState().redo())
    expect(session().document.paletteSlots?.[35]).toBe(slots[35])
    expect(outline.style.getPropertyValue('--palette-selection-width')).toBe('4')
    expect(outline.style.getPropertyValue('--palette-selection-height')).toBe('1')
  })

  it('preserves rows and holes when pasting at an empty slot and restores that slot after undo', async () => {
    localStorage.setItem('moonsprite.palette-layout-mode', 'manual')
    useWorkspace.getState().selectPaletteColors([1, 3, 11, 13], 13)
    let clipboard = ''
    vi.stubGlobal('navigator', { clipboard: {
      writeText: vi.fn(async (value: string) => { clipboard = value }), readText: vi.fn(async () => clipboard)
    } })
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    await act(async () => { fireEvent.keyDown(grid, { key: 'c', ctrlKey: true }) })
    fireEvent.pointerDown(grid, { button: 0, clientX: 211, clientY: 149 })
    fireEvent.pointerUp(grid, { clientX: 211, clientY: 149 })
    await act(async () => { fireEvent.keyDown(grid, { key: 'v', ctrlKey: true }) })
    const slots = session().document.paletteSlots!
    expect([46, 48, 56, 58].map(slot => session().document.palette.find(entry => entry.id === slots[slot])!.color.r)).toEqual([0, 20, 100, 120])
    expect(slots[47]).toBeNull()
    expect(slots[57]).toBeNull()
    const outline = () => container.querySelector<HTMLElement>('.palette-selection-box')!
    expect(outline().style.getPropertyValue('--palette-selection-width')).toBe('3')
    expect(outline().style.getPropertyValue('--palette-selection-height')).toBe('2')
    act(() => useWorkspace.getState().undo())
    expect(outline().style.getPropertyValue('--palette-selection-left')).toBe('6')
    expect(outline().style.getPropertyValue('--palette-selection-top')).toBe('4')
    expect(outline().style.getPropertyValue('--palette-selection-width')).toBe('1')
    expect(outline().style.getPropertyValue('--palette-selection-height')).toBe('1')
    fireEvent.pointerDown(grid, { button: 0, clientX: 273, clientY: 87 })
    fireEvent.pointerUp(grid, { clientX: 273, clientY: 87 })
    act(() => useWorkspace.getState().redo())
    expect(outline().style.getPropertyValue('--palette-selection-left')).toBe('6')
    expect(outline().style.getPropertyValue('--palette-selection-top')).toBe('4')
    expect(outline().style.getPropertyValue('--palette-selection-width')).toBe('3')
    expect(outline().style.getPropertyValue('--palette-selection-height')).toBe('2')
  })

  it('clears obsolete auto selection boxes after deleting selected colors', () => {
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    fireEvent.pointerDown(container.querySelector('[data-palette-slot="0"]')!, { button: 0, clientX: 25, clientY: 25 })
    fireEvent.pointerMove(grid, { clientX: 149, clientY: 56, buttons: 1 })
    fireEvent.pointerUp(grid, { clientX: 149, clientY: 56 })
    const ids = [...session().selectedPaletteIds]
    act(() => useWorkspace.getState().deletePaletteColors(ids))
    expect(session().document.paletteOrder).toHaveLength(6)
    expect(session().selectedPaletteIds).toEqual([])
    expect(container.querySelector('[data-palette-selection-outline]')).toBeNull()
    expect(container.querySelector('.palette-slot.focused')).toBeNull()
    act(() => useWorkspace.getState().undo())
    expect(session().selectedPaletteIds).toEqual(ids)
    expect(container.querySelector('.palette-selection-outline')).not.toBeNull()
    expect(container.querySelector('.palette-selection-box')).toBeNull()
  })
})
