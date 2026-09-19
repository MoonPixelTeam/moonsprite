import { afterEach, expect, it, vi } from 'vitest'
import { createPanelDockIntent, panelDockZoneAt } from './panel-docking'

function element(rect: DOMRect, dock?: string, id?: string) {
  const node = document.createElement('div')
  node.getBoundingClientRect = () => rect
  if (dock) node.dataset.panelDockZone = dock
  if (id) node.dataset.inspectorPanelId = id
  return node
}
function stage() {
  const node = element(new DOMRect(0, 0, 800, 600))
  node.className = 'stage-wrap'
  document.body.append(node)
}
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers() })

it('limits empty dock activation to the edge instead of the old 72px band', () => {
  stage()
  expect(panelDockZoneAt(50, 300)).toBeNull()
  expect(panelDockZoneAt(12, 300)?.dock).toBe('left')
  expect(panelDockZoneAt(400, 550)).toBeNull()
  expect(panelDockZoneAt(400, 590)?.dock).toBe('bottom')
})

it.each(['right', 'bottom'])('uses visible insertion boundaries, not panel midpoints (%s)', dock => {
  const horizontal = dock === 'bottom'
  const host = element(new DOMRect(0, 0, 400, 400), dock)
  host.append(element(new DOMRect(0, 0, horizontal ? 200 : 400, horizontal ? 400 : 200), undefined, 'layers'))
  host.append(element(new DOMRect(horizontal ? 200 : 0, horizontal ? 0 : 200, horizontal ? 200 : 400, horizontal ? 400 : 200), undefined, 'history'))
  document.body.append(host)
  expect(panelDockZoneAt(100, 100)).toBeNull()
  const zone = panelDockZoneAt(horizontal ? 200 : 100, horizontal ? 100 : 200)
  expect(zone).toMatchObject({ dock, id: 'layers', insertAfter: true })
  const held = panelDockZoneAt(horizontal ? 222 : 100, horizontal ? 100 : 222, undefined, zone)
  expect(held).toBe(zone)
  expect(panelDockZoneAt(100, 100, undefined, zone)).toBeNull()
})

it.each(['right', 'bottom'])('accepts the outer portion of a panel without aiming at the divider (%s)', dock => {
  const horizontal = dock === 'bottom'
  const host = element(new DOMRect(0, 0, 400, 400), dock)
  host.append(element(new DOMRect(0, 0, 400, 400), undefined, 'layers'))
  document.body.append(host)
  const point = (axis: number) => panelDockZoneAt(horizontal ? axis : 200, horizontal ? 200 : axis)
  expect(point(310)).toMatchObject({ id: 'layers', insertAfter: true })
  expect(point(250)).toMatchObject({ id: 'layers', insertAfter: true })
  expect(point(90)).toMatchObject({ id: 'layers', insertAfter: false })
  expect(point(200)).toBeNull()
  const zone = point(310)!
  expect(horizontal ? zone.preview.left : zone.preview.top).toBe(398)
})

it('keeps a neutral center for small panels and caps reach for very large panels', () => {
  const host = element(new DOMRect(0, 0, 1400, 200), 'bottom')
  const slot = element(new DOMRect(0, 0, 80, 200), undefined, 'layers')
  host.append(slot)
  document.body.append(host)
  expect(panelDockZoneAt(60, 100)).toMatchObject({ insertAfter: true })
  expect(panelDockZoneAt(40, 100)).toBeNull()
  slot.getBoundingClientRect = () => new DOMRect(0, 0, 1400, 200)
  expect(panelDockZoneAt(1300, 100)).toMatchObject({ insertAfter: true })
  expect(panelDockZoneAt(1250, 100)).toMatchObject({ insertAfter: true })
  expect(panelDockZoneAt(1200, 100)).toBeNull()
})

it('does not offer the source panel as its own insertion target', () => {
  const host = element(new DOMRect(0, 0, 200, 400), 'right')
  host.append(element(new DOMRect(0, 0, 200, 400), undefined, 'layers'))
  document.body.append(host)
  expect(panelDockZoneAt(100, 2, 'layers')).toBeNull()
})

it('requires dwell, activates while stationary and cancels a quick pass', () => {
  vi.useFakeTimers(); stage()
  const onChange = vi.fn()
  const intent = createPanelDockIntent(onChange)
  const left = panelDockZoneAt(12, 300)!
  intent.update(left)
  vi.advanceTimersByTime(99)
  expect(intent.active).toBeNull()
  intent.update(null)
  vi.advanceTimersByTime(200)
  expect(intent.active).toBeNull()
  intent.update(left)
  vi.advanceTimersByTime(100)
  expect(intent.active).toBe(left)
  expect(onChange).toHaveBeenLastCalledWith(left)
  intent.update(panelDockZoneAt(790, 300))
  expect(intent.active).toBeNull()
  intent.clear()
  vi.advanceTimersByTime(200)
  expect(intent.active).toBeNull()
})
