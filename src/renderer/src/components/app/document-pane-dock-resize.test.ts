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

it('restores temporary tracks on cleanup without changing unsplit layout', () => {
  const { area, layout, split, property } = fixture()
  const template = split.style[property]
  const gesture = beginDocumentPaneDockResize(area, layout, 'right')!
  expect(gesture.finish(true)).toBe(layout)
  expect(split.style[property]).toBe(template)
  expect(beginDocumentPaneDockResize(area, null, 'left')!.finish()).toBeNull()
  expect(beginDocumentPaneDockResize(null, layout, 'right')).toBeNull()
  expect(beginDocumentPaneDockResize(area, layout.first as DocumentPaneNode, 'bottom')!.finish()).toBe(layout.first)
})

it.each([0.75, 1, 1.5, 2])('holds a single canvas at the same screen position at interface scale %s', (scale) => {
  const area = document.createElement('div')
  area.innerHTML = '<div class="stage-wrap"><div class="stage-surface" style="width: 500px; height: 400px"><canvas width="1000" height="800"></canvas></div></div>'
  document.body.append(area)
  const surface = area.querySelector<HTMLElement>('.stage-surface')!
  const original = surface.style.cssText
  let bounds = new DOMRect(100 * scale, 60 * scale, 500 * scale, 400 * scale)
  vi.spyOn(surface.parentElement!, 'getBoundingClientRect').mockImplementation(() => bounds)
  const gesture = beginDocumentPaneDockResize(area, null, 'left')!
  bounds = new DOMRect(180 * scale, 60 * scale, 420 * scale, 400 * scale)
  gesture.update()
  expect(surface.style.transform).toBe('translate(-80px, 0px)')
  expect(surface.style.width).toBe('500px')
  expect(surface.dataset.canvasResizeFrozen).toBe('true')
  expect(surface.querySelector('canvas')!.width).toBe(1000)
  expect(gesture.finish()).toBeNull()
  expect(surface.style.cssText).toBe(original)
  expect(surface.dataset.canvasResizeFrozen).toBeUndefined()
})

it('anchors both embedded canvases independently while the left dock moves', () => {
  const { area, layout, split, first } = fixture()
  for (const child of [split.children[0], split.children[2]]) {
    child.innerHTML = '<div class="stage-surface" style="width: 500px; height: 500px"><canvas width="1000" height="1000"></canvas></div>'
  }
  const surfaces = [...area.querySelectorAll<HTMLElement>('.stage-surface')]
  const gesture = beginDocumentPaneDockResize(area, layout, 'left')!
  first.mockReturnValue(new DOMRect(320, 100, 380, 500))
  gesture.update()
  expect(surfaces.map((surface) => surface.style.transform)).toEqual(['translate(-120px, 0px)', 'translate(0px, 0px)'])
  expect(surfaces.every((surface) => surface.dataset.canvasResizeFrozen === 'true')).toBe(true)
  expect(surfaces.map((surface) => surface.querySelector('canvas')!.width)).toEqual([1000, 1000])
  gesture.finish()
  expect(surfaces.every((surface) => !surface.dataset.canvasResizeFrozen && surface.style.transform === '')).toBe(true)
})
