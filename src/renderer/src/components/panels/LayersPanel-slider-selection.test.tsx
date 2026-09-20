import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createPortal } from 'react-dom'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { createDocument, createLayer } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { useState } from 'react'
import { Scrollbar } from '../Scrollbar'
import { RangeField } from '../RangeField'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(cleanup)

function Controls() {
  const [scroll, setScroll] = useState(0)
  const session = useWorkspace((state) => state.sessions[0])
  return <>
    <LayersPanel session={session} docked />
    <Scrollbar ariaLabel="Move canvas horizontally" orientation="horizontal" thumbRatio={0.2} value={scroll} onChange={setScroll} />
    <Scrollbar ariaLabel="Move canvas vertically" orientation="vertical" thumbRatio={0.2} value={scroll} onChange={setScroll} />
    <RangeField label="Brush opacity" min={0} max={100} value={session.brushOpacity}
      onChange={(value) => useWorkspace.getState().setBrushOpacity(value)} />
    {createPortal(<>
      <input type="range" aria-label="Color hue" defaultValue={50} />
      <div className="pressure-range-stack"><span data-testid="pressure-track" />
        <div className="pressure-range-hit-surface" data-testid="pressure-hit" />
        <input type="range" aria-label="Pressure minimum" defaultValue={0} />
        <input type="range" aria-label="Pressure maximum" defaultValue={100} />
      </div>
      <label className="color-editor-field"><span data-testid="color-label">Alpha</span>
        <input type="range" aria-label="Color alpha" defaultValue={100} />
        <input type="number" aria-label="Color alpha number" defaultValue={100} />
      </label>
      <label htmlFor="external-range"><span data-testid="external-label">External label</span></label>
      <input id="external-range" type="range" aria-label="External slider" defaultValue={50} />
      <div role="slider" aria-label="Custom slider" tabIndex={0}><span data-testid="custom-thumb" /></div>
      <button data-testid="blank">Unrelated UI</button>
    </>, document.body)}
  </>
}

it.each(['layers', 'frames', 'cels', 'masks', 'groups'] as const)(
  'preserves %s selection through all slider surfaces and still clears it on blank UI', (kind) => {
    const doc = createDocument('slider batch', 2, 2, 'rgba')
    const top = createLayer('Top', 2, 2, 'rgba')
    doc.layers.push(top)
    useWorkspace.getState().addSession(doc)
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(doc)
    const session = useWorkspace.getState().sessions[0]
    const layerIds = doc.layers.map((layer) => layer.id)
    const frameIds = timeline.frames.map((frame) => frame.id)
    const keys = frameIds.map((id) => animationCelKey(top.id, id))
    session.selectedLayerIds = kind === 'layers' ? layerIds : []
    session.selectedAnimationFrameIds = kind === 'frames' ? frameIds : []
    session.selectedAnimationCellKeys = kind === 'cels' ? keys : []
    session.selectedAnimationMaskCellKeys = kind === 'masks' ? keys : []
    session.layerSelectionExplicit = kind === 'layers'
    session.animationCellSelectionExplicit = kind === 'cels'
    if (kind === 'groups') {
      doc.groups.push(...['g1', 'g2'].map((id) => ({ id, name: id, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const })))
      session.selectedGroupIds = ['g1', 'g2']
    }
    const snapshot = () => {
      const current = useWorkspace.getState().sessions[0]
      return [current.selectedLayerIds, current.selectedGroupIds, current.selectedAnimationFrameIds,
        current.selectedAnimationCellKeys, current.selectedAnimationMaskCellKeys].map((ids) => [...ids])
    }
    const before = snapshot()
    const view = render(<Controls />)
    const targets = [...screen.getAllByRole('slider'), ...[
      'pressure-track', 'pressure-hit', 'color-label', 'external-label', 'custom-thumb'
    ].map((id) => screen.getByTestId(id)), screen.getByRole('spinbutton'),
      view.container.querySelector('.range-field-label')!, view.container.querySelector('.range-slider-value')!]
    for (const target of targets) {
      fireEvent.pointerDown(target, { button: 0, pointerId: 1 })
      expect(snapshot()).toEqual(before)
      fireEvent.pointerMove(target, { buttons: 1, pointerId: 1 })
      fireEvent.pointerUp(target, { button: 0, pointerId: 1 })
      expect(snapshot()).toEqual(before)
    }
    const opacity = screen.getByRole('slider', { name: 'Brush opacity' })
    fireEvent.pointerDown(opacity, { button: 0 })
    fireEvent.change(opacity, { target: { value: '40' } })
    fireEvent.pointerUp(opacity)
    expect(useWorkspace.getState().sessions[0].brushOpacity).toBe(40)
    expect(snapshot()).toEqual(before)
    if (kind === 'layers') {
      for (const id of layerIds) expect(view.container.querySelector(`[data-layer-id="${id}"]`)).toHaveClass('selected')
    }
    act(() => { fireEvent.pointerDown(screen.getByTestId('blank'), { button: 0 }) })
    expect(snapshot()).not.toEqual(before)
  })


it('keeps multi-frame outlines while dragging canvas scrollbars and native timeline scrollbars', () => {
  const doc = createDocument('scroll retains frames', 2, 2, 'rgba')
  useWorkspace.getState().addSession(doc)
  useWorkspace.getState().duplicateAnimationFrame()
  const session = useWorkspace.getState().sessions[0]
  const ids = ensureAnimationDocument(doc).frames.map((frame) => frame.id)
  session.selectedAnimationFrameIds = ids
  const { container } = render(<Controls />)
  const assertSelected = () => {
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual(ids)
    for (const id of ids) expect(container.querySelector(`[data-animation-frame-selection~="${id}"]`)).toBeTruthy()
  }
  assertSelected()
  for (const bar of screen.getAllByRole('scrollbar')) {
    const thumb = bar.querySelector('.ui-scrollbar-thumb')!
    bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} })
    thumb.getBoundingClientRect = () => ({ left: 0, top: 0, width: 20, height: 20, right: 20, bottom: 20, x: 0, y: 0, toJSON() {} })
    fireEvent.pointerDown(thumb, { button: 0, pointerId: 1, clientX: 5, clientY: 5 })
    assertSelected()
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 45, clientY: 45 })
    fireEvent.pointerUp(bar, { pointerId: 1 })
    expect(bar).toHaveAttribute('aria-valuenow', '50')
    assertSelected()
    fireEvent.pointerDown(bar, { button: 0, pointerId: 2, clientX: 70, clientY: 70 })
    fireEvent.pointerUp(bar, { pointerId: 2 })
    assertSelected()
  }
  const list = container.querySelector<HTMLElement>('.layer-list')!
  Object.defineProperties(list, {
    offsetWidth: { value: 200 }, offsetHeight: { value: 200 },
    clientWidth: { value: 185 }, clientHeight: { value: 185 },
    scrollWidth: { value: 500 }, scrollHeight: { value: 500 }
  })
  list.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} })
  for (const [clientX, clientY] of [[195, 80], [80, 195]]) {
    fireEvent.pointerDown(list, { button: 0, pointerId: 3, clientX, clientY })
    fireEvent.scroll(list)
    fireEvent.pointerUp(list, { pointerId: 3, clientX, clientY })
    assertSelected()
  }
  fireEvent.pointerDown(list, { button: 0, clientX: 80, clientY: 80 })
  expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([])
})
