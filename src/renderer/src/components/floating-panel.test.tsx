import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FloatingDockPreview, useFloatingPanel, type FixedPanelDock } from './floating-panel'
import type { PanelDockPlacement } from './panel-docking'

function Panel({ onDock }: { onDock: (dock: FixedPanelDock, placement?: PanelDockPlacement) => void }) {
  const panel = useFloatingPanel({ x: 100, y: 100, width: 200, height: 150 }, false, true, undefined, false, onDock)
  return <><section ref={panel.ref} style={panel.style} className={panel.style ? 'floating-panel' : ''} data-testid="panel"><header onPointerDown={panel.startDrag}>Drag</header></section><FloatingDockPreview style={panel.dockPreview} /></>
}
beforeEach(() => {
  vi.useFakeTimers()
  const stage = document.createElement('div')
  stage.className = 'stage-wrap'
  stage.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  document.body.append(stage)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(Number.parseFloat(this.style.left) || 100, Number.parseFloat(this.style.top) || 100, 200, this.tagName === 'HEADER' ? 32 : 150)
  })
})
afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.useRealTimers() })
const move = (x: number, y = 300, altKey = false) => fireEvent.pointerMove(window, { clientX: x, clientY: y, altKey })
function begin() {
  const onDock = vi.fn()
  const view = render(<Panel onDock={onDock} />)
  fireEvent.pointerDown(view.getByText('Drag'), { button: 0, clientX: 120, clientY: 110, pointerId: 1 })
  return { onDock, view }
}

it('ignores small title-bar movements', () => {
  const { onDock, view } = begin()
  move(125, 111)
  fireEvent.pointerUp(window, { clientX: 125, clientY: 111 })
  expect(view.getByTestId('panel').style.left).toBe('100px')
  expect(onDock).not.toHaveBeenCalled()
})

it('does not dock on a quick pass or a release-only hit with no preview', () => {
  const { onDock } = begin()
  move(12)
  act(() => vi.advanceTimersByTime(60))
  fireEvent.pointerUp(window, { clientX: 790, clientY: 300 })
  act(() => vi.advanceTimersByTime(200))
  expect(onDock).not.toHaveBeenCalled()
  expect(document.querySelector('.inspector-dock-preview')).toBeNull()
})

it('commits the confirmed preview instead of choosing a different dock on release', () => {
  const { onDock } = begin()
  move(12)
  act(() => vi.advanceTimersByTime(150))
  expect(document.querySelector('.inspector-dock-preview')).not.toBeNull()
  fireEvent.pointerUp(window, { clientX: 790, clientY: 300 })
  expect(onDock).toHaveBeenCalledWith('left', expect.objectContaining({ dock: 'left' }))
})

it('passes the previewed insertion position when docking a floating panel into a stack', () => {
  const host = document.createElement('div')
  host.dataset.panelDockZone = 'right'
  host.getBoundingClientRect = () => new DOMRect(800, 0, 200, 600)
  const slot = document.createElement('div')
  slot.dataset.inspectorPanelId = 'history'
  slot.getBoundingClientRect = () => new DOMRect(800, 0, 200, 600)
  host.append(slot)
  document.body.append(host)
  const { onDock } = begin()
  move(850, 5)
  act(() => vi.advanceTimersByTime(150))
  fireEvent.pointerUp(window, { clientX: 850, clientY: 5 })
  expect(onDock).toHaveBeenCalledWith('right', expect.objectContaining({ id: 'history', insertAfter: false }))
})

it('keeps the actual floating position when released outside a dock', () => {
  const { onDock, view } = begin()
  move(400, 350)
  fireEvent.pointerUp(window, { clientX: 400, clientY: 350 })
  expect(view.getByTestId('panel').style.left).toBe('380px')
  expect(view.getByTestId('panel').style.top).toBe('340px')
  expect(onDock).not.toHaveBeenCalled()
  // A new press must not reuse the previous drag's pointer when Alt changes.
  fireEvent.pointerDown(view.getByText('Drag'), { button: 0, clientX: 480, clientY: 350 })
  fireEvent.keyDown(window, { key: 'Alt', altKey: true })
  fireEvent.keyUp(window, { key: 'Alt' })
  fireEvent.pointerUp(window, { clientX: 480, clientY: 350 })
  expect(view.getByTestId('panel').style.left).toBe('380px')
})

it('Alt disarms a stationary preview and releasing Alt waits before rearming', () => {
  const { onDock } = begin()
  move(12)
  act(() => vi.advanceTimersByTime(150))
  fireEvent.keyDown(window, { key: 'Alt', altKey: true })
  expect(document.querySelector('.inspector-dock-preview')).toBeNull()
  move(13, 300, true)
  act(() => vi.advanceTimersByTime(200))
  expect(document.querySelector('.inspector-dock-preview')).toBeNull()
  fireEvent.keyUp(window, { key: 'Alt' })
  act(() => vi.advanceTimersByTime(150))
  expect(document.querySelector('.inspector-dock-preview')).not.toBeNull()
  fireEvent.pointerUp(window, { clientX: 13, clientY: 300, altKey: true })
  expect(onDock).not.toHaveBeenCalled()
})

it.each(['escape', 'blur', 'pointercancel'])('restores the original position on %s and clears pending docking', reason => {
  const { onDock, view } = begin()
  move(12)
  if (reason === 'escape') fireEvent.keyDown(window, { key: 'Escape' })
  else if (reason === 'blur') fireEvent(window, new Event('blur'))
  else fireEvent.pointerCancel(window)
  act(() => vi.advanceTimersByTime(200))
  expect(view.getByTestId('panel').style.left).toBe('100px')
  expect(view.getByTestId('panel').style.top).toBe('100px')
  expect(document.querySelector('.inspector-dock-preview')).toBeNull()
  expect(onDock).not.toHaveBeenCalled()
})
