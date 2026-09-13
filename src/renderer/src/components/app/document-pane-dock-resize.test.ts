import { afterEach, expect, it, vi } from 'vitest'
import type { DocumentPaneNode, DocumentPaneSplit } from '@/core/document-pane-layout'
import { beginDocumentPaneDockResize } from './document-pane-dock-resize'

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

function fixture(orientation: 'horizontal' | 'vertical' = 'horizontal', scale = 1) {
  const layout: DocumentPaneSplit = { kind: 'split', id: 'outer', orientation, ratio: 0.5,
    first: { kind: 'leaf', id: 'a', documentId: 'a' }, second: { kind: 'leaf', id: 'b', documentId: 'b' } }
  const area = document.createElement('div')
  area.innerHTML = `<div class="split-workspace"><div class="document-pane-split ${orientation}" data-document-split-id="outer">
    <div style="width: 500px; height: 500px"></div><div class="document-pane-resizer"></div><div style="width: 500px; height: 500px"></div>
  </div></div>`
  document.body.append(area)
  const split = area.querySelector<HTMLElement>('.document-pane-split')!
  const property: 'gridTemplateColumns' | 'gridTemplateRows' = orientation === 'horizontal' ? 'gridTemplateColumns' : 'gridTemplateRows'
  split.style[property] = 'minmax(0, 0.5fr) 6px minmax(0, 0.5fr)'
  const first = vi.spyOn(split.children[0], 'getBoundingClientRect').mockReturnValue(new DOMRect(200 * scale, 100 * scale, 500 * scale, 500 * scale))
  const second = vi.spyOn(split.children[2], 'getBoundingClientRect').mockReturnValue(new DOMRect(706 * scale, 606 * scale, 500 * scale, 500 * scale))
  return { area, layout, split, first, second, property }
}

it.each([0.75, 1, 1.5, 2].flatMap(scale => (['left', 'right', 'bottom'] as const).map(edge => ({ scale, edge }))))(
  'anchors the far pane when the $edge dock moves at scale $scale and saves the measured ratio', ({ scale, edge }) => {
    const { area, layout, split, first, second, property } = fixture(edge === 'bottom' ? 'vertical' : 'horizontal', scale)
    const gesture = beginDocumentPaneDockResize(area, layout, edge)!
    const fixedTrack = 'var(--document-pane-fixed-track)'
    expect(split.style.getPropertyValue('--document-pane-fixed-track')).toBe('clamp(10%, 500px, calc(90% - 6px))')
    expect(split.style[property]).toBe(edge === 'left' ? `minmax(0, 1fr) 6px ${fixedTrack}` : `${fixedTrack} 6px minmax(0, 1fr)`)
    // The browser keeps the far track at 500 CSS px and gives the near pane
    // the remaining 400 px after the dock consumes another 100 px.
    if (edge === 'left') first.mockReturnValue(new DOMRect(300 * scale, 100 * scale, 400 * scale, 500 * scale))
    else if (edge === 'right') second.mockReturnValue(new DOMRect(706 * scale, 100 * scale, 400 * scale, 500 * scale))
    else second.mockReturnValue(new DOMRect(200 * scale, 606 * scale, 500 * scale, 400 * scale))
    gesture.update()
    expect(layout.ratio).toBe(0.5)
    const next = gesture.finish() as DocumentPaneSplit
    expect(next.ratio).toBeCloseTo(edge === 'left' ? 400 / 900 : 500 / 900)
    expect(next.first).toBe(layout.first)
    expect(next.second).toBe(layout.second)
    expect(split.style[property]).not.toContain('var(')
    expect(split.style.getPropertyValue('--document-pane-fixed-track')).toBe('')
    // Starting another dock gesture must capture the current geometry.
    const following = beginDocumentPaneDockResize(area, next, edge)!
    expect(following.finish()).toBe(next)
  }
)

it('anchors nested dividers while leaving the perpendicular split ratio intact', () => {
  const { area, layout, split, first } = fixture()
  const nested: DocumentPaneSplit = { ...layout, id: 'inner', first: { kind: 'leaf', id: 'c', documentId: 'c' } }
  const perpendicular: DocumentPaneSplit = { ...layout, id: 'vertical', orientation: 'vertical', first: nested }
  layout.first = perpendicular
  const nestedElement = split.cloneNode(true) as HTMLElement
  nestedElement.dataset.documentSplitId = 'inner'
  split.children[0].append(nestedElement)
  const fixedFirst = vi.spyOn(nestedElement.children[0], 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 500))
  vi.spyOn(nestedElement.children[2], 'getBoundingClientRect').mockReturnValue(new DOMRect(106, 0, 250, 500))
  const gesture = beginDocumentPaneDockResize(area, layout, 'left')!
  expect(nestedElement.style.gridTemplateColumns).toContain('var(--document-pane-fixed-track)')
  first.mockReturnValue(new DOMRect(0, 0, 400, 500))
  fixedFirst.mockReturnValue(new DOMRect(0, 0, 150, 500))
  const next = gesture.finish() as DocumentPaneSplit
  expect((next.first as DocumentPaneSplit).ratio).toBe(perpendicular.ratio)
  expect(((next.first as DocumentPaneSplit).first as DocumentPaneSplit).ratio).toBeCloseTo(150 / 400)
  expect(nested.ratio).toBe(0.5)
})

it('restores temporary tracks on cleanup and ignores workspaces without splits', () => {
  const { area, layout, split, property } = fixture()
  const template = split.style[property]
  const gesture = beginDocumentPaneDockResize(area, layout, 'right')!
  expect(gesture.finish(true)).toBe(layout)
  expect(split.style[property]).toBe(template)
  expect(beginDocumentPaneDockResize(area, null, 'left')).toBeNull()
  expect(beginDocumentPaneDockResize(null, layout, 'right')).toBeNull()
  expect(beginDocumentPaneDockResize(area, layout.first as DocumentPaneNode, 'bottom')).toBeNull()
})
