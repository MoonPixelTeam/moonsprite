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
  it('moves manual colors into unused rows and restores their slots on undo', () => {
    localStorage.setItem('moonsprite.palette-layout-mode', 'manual')
    useWorkspace.getState().selectPaletteColors([1, 2], 1)
    const before = [...session().document.paletteSlots!]
    const { container } = render(<Harness />)
    const grid = container.querySelector('.swatch-grid')!
    fireEvent.pointerDown(container.querySelector('[data-palette-slot="0"]')!, { button: 0, clientX: 25, clientY: 10 })
    fireEvent.pointerMove(grid, { clientX: 273, clientY: 149, buttons: 1 })
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
