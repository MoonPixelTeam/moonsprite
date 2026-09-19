import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { createDocument, createLayer, getActiveLayer } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, layerStyleClipboard: null, message: null, dialog: null })
})
afterEach(cleanup)

it.each(['horizontal', 'vertical'] as const)('keeps layer highlights after consecutive %s mirrors with or without a marquee', (axis) => {
  const document = createDocument('mirror selection retention', 2, 2, 'rgba')
  const bottom = getActiveLayer(document)
  const top = createLayer('Top', 2, 2, 'rgba')
  document.layers.push(top)
  for (const layer of document.layers) layer.pixels.set([255, 0, 0, 255], 0)
  useWorkspace.getState().addSession(document)
  const { container } = render(<ConnectedPanel />)
  act(() => { useWorkspace.getState().selectLayerRows([bottom.id, top.id], []) })

  for (const marquee of [null, { x: 0, y: 0, width: 2, height: 2 }]) {
    act(() => { useWorkspace.getState().setSelection(marquee) })
    for (let repeat = 0; repeat < 2; repeat++) {
      act(() => { useWorkspace.getState().flipActiveSelection(axis) })
      const session = useWorkspace.getState().sessions[0]
      expect(session.selection).toEqual(marquee)
      expect(session.selectedLayerIds).toEqual([bottom.id, top.id])
      for (const layer of document.layers) {
        expect(container.querySelector(`[data-layer-id="${layer.id}"]`)).toHaveClass('selected')
      }
    }
  }
})

function ConnectedPanel() {
  const session = useWorkspace((state) => state.sessions[0] ?? null)
  return session ? <LayersPanel session={session} docked /> : null
}

it('keeps a selected layer batch visibly selected while applying right-click properties', async () => {
  const document = createDocument('layer property selection', 2, 2, 'rgba')
  const bottom = getActiveLayer(document)
  const top = createLayer('Top', 2, 2, 'rgba')
  document.layers.push(top)
  useWorkspace.getState().addSession(document)
  const { container } = render(<ConnectedPanel />)
  const bottomRow = container.querySelector<HTMLElement>(`[data-layer-id="${bottom.id}"]`)
  const topRow = container.querySelector<HTMLElement>(`[data-layer-id="${top.id}"]`)
  if (!bottomRow || !topRow) throw new Error('expected layer rows')
  fireEvent.pointerDown(bottomRow, { button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(window, { clientX: 10, clientY: 10 })
  fireEvent.pointerDown(topRow, { button: 0, ctrlKey: true, clientX: 10, clientY: 30 })
  fireEvent.pointerUp(window, { clientX: 10, clientY: 30 })
  await waitFor(() => expect(bottomRow).toHaveClass('selected'))

  fireEvent.contextMenu(topRow, { clientX: 20, clientY: 20 })
  const properties = screen.getByRole('menuitem', { name: '属性' })
  // The real UI first emits pointerdown on the portalled layer context menu.
  // This must not be interpreted as a click outside the timeline selection.
  fireEvent.pointerDown(properties)
  fireEvent.click(properties)
  const dialogTitle = screen.getByRole('heading', { name: '多个图层属性' })
  expect(dialogTitle).toBeInTheDocument()
  expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([bottom.id, top.id])
  expect(container.querySelector(`[data-layer-id="${bottom.id}"]`)).toHaveClass('selected')
  expect(container.querySelector(`[data-layer-id="${top.id}"]`)).toHaveClass('selected')
  fireEvent.click(screen.getByRole('button', { name: '混合模式' }))
  const alternateBlendMode = screen.getAllByRole('option').find((option) => option.getAttribute('aria-selected') === 'false')
  if (!alternateBlendMode) throw new Error('expected alternate blend mode')
  fireEvent.pointerDown(alternateBlendMode)
  fireEvent.click(alternateBlendMode)
  await waitFor(() => {
    expect(container.querySelector(`[data-layer-id="${bottom.id}"]`)).toHaveClass('selected')
    expect(container.querySelector(`[data-layer-id="${top.id}"]`)).toHaveClass('selected')
  })
  fireEvent.change(screen.getByRole('slider', { name: '不透明度' }), { target: { value: '40' } })
  await waitFor(() => {
    expect(container.querySelector(`[data-layer-id="${bottom.id}"]`)).toHaveClass('selected')
    expect(container.querySelector(`[data-layer-id="${top.id}"]`)).toHaveClass('selected')
  })
  const close = screen.getByRole('button', { name: '关闭' })
  fireEvent.pointerDown(close)
  fireEvent.click(close)
  expect(bottom.opacity).toBe(0.4)
  expect(top.opacity).toBe(0.4)
  expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([bottom.id, top.id])
  await waitFor(() => {
    expect(container.querySelector(`[data-layer-id="${bottom.id}"]`)).toHaveClass('selected')
    expect(container.querySelector(`[data-layer-id="${top.id}"]`)).toHaveClass('selected')
  })

})

it('keeps a selected layer batch visibly selected after a selection fill', async () => {
  const document = createDocument('layer fill selection retention', 2, 1, 'rgba')
  const bottom = getActiveLayer(document)
  const top = createLayer('Top', 2, 1, 'rgba')
  document.layers.push(top)
  useWorkspace.getState().addSession(document)
  const { container } = render(<ConnectedPanel />)
  act(() => {
    useWorkspace.getState().selectLayerRows([bottom.id, top.id], [])
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
  })
  await waitFor(() => {
    expect(container.querySelector(`[data-layer-id="${bottom.id}"]`)).toHaveClass('selected')
    expect(container.querySelector(`[data-layer-id="${top.id}"]`)).toHaveClass('selected')
  })

  act(() => { useWorkspace.getState().fillForeground() })

  const session = useWorkspace.getState().sessions[0]
  expect(session.selectedLayerIds).toEqual([bottom.id, top.id])
  expect(session.selectionGuidesPreservedAtContentRevision).toBe(session.contentRevision)
  await waitFor(() => {
    expect(container.querySelector(`[data-layer-id="${bottom.id}"]`)).toHaveClass('selected')
    expect(container.querySelector(`[data-layer-id="${top.id}"]`)).toHaveClass('selected')
  })
})

it('uses the Shift/Ctrl row selection made immediately before opening the context menu', () => {
  const document = createDocument('pointer layer property selection', 2, 2, 'rgba')
  const bottom = getActiveLayer(document)
  const top = createLayer('Top', 2, 2, 'rgba')
  document.layers.push(top)
  useWorkspace.getState().addSession(document)
  const { container } = render(<ConnectedPanel />)
  const bottomRow = container.querySelector<HTMLElement>(`[data-layer-id="${bottom.id}"]`)!
  const topRow = container.querySelector<HTMLElement>(`[data-layer-id="${top.id}"]`)!

  fireEvent.pointerDown(bottomRow, { button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(window, { clientX: 10, clientY: 10 })
  fireEvent.pointerDown(topRow, { button: 0, ctrlKey: true, clientX: 10, clientY: 30 })
  fireEvent.pointerUp(window, { clientX: 10, clientY: 30 })
  expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([bottom.id, top.id])

  fireEvent.contextMenu(topRow, { clientX: 20, clientY: 20 })
  fireEvent.click(screen.getByRole('menuitem', { name: '属性' }))
  const dialogTitle = screen.getByRole('heading', { name: '多个图层属性' })
  expect(dialogTitle).toBeInTheDocument()
  fireEvent.change(screen.getByRole('slider', { name: '不透明度' }), { target: { value: '40' } })
  fireEvent.submit(dialogTitle.closest('form')!)
  expect(bottom.opacity).toBe(0.4)
  expect(top.opacity).toBe(0.4)
})

it('disables batch properties when a selected range also contains a layer-mask row', () => {
  const document = createDocument('mask cannot have layer properties', 2, 2, 'rgba')
  const first = getActiveLayer(document)
  const second = createLayer('Second', 2, 2, 'rgba')
  document.layers.push(second)
  useWorkspace.getState().addSession(document)
  const timeline = ensureAnimationDocument(document)
  const cel = timeline.cels.find((item) => item.layerId === first.id)!
  useWorkspace.getState().createLayerMask(cel.id)
  const session = useWorkspace.getState().sessions[0]
  session.selectedLayerIds = [first.id, second.id]
  session.selectedAnimationMaskRowKeys = [`layer:${first.id}`]
  session.layerSelectionExplicit = true
  const { container } = render(<ConnectedPanel />)

  fireEvent.contextMenu(container.querySelector(`[data-layer-id="${first.id}"]`)!, { clientX: 20, clientY: 20 })
  expect(screen.getByRole('menuitem', { name: '属性' })).toBeDisabled()
})

it('keeps multi-frame and multi-cel selections after their respective batch operations', () => {
  const document = createDocument('timeline selection retention', 2, 2, 'rgba')
  const layer = getActiveLayer(document)
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().duplicateAnimationFrame()
  const timeline = ensureAnimationDocument(document)
  const [firstFrame, secondFrame] = timeline.frames
  const firstKey = animationCelKey(layer.id, firstFrame.id)
  const secondKey = animationCelKey(layer.id, secondFrame.id)
  const session = useWorkspace.getState().sessions[0]
  session.selectedAnimationFrameIds = [firstFrame.id, secondFrame.id]
  session.animationFrameSelectionAnchorId = secondFrame.id
  useWorkspace.getState().setActiveAnimationFrameDuration(160)
  expect(session.selectedAnimationFrameIds).toEqual([firstFrame.id, secondFrame.id])
  expect(session.selectionGuidesPreservedAtContentRevision).toBe(session.contentRevision)

  session.selectedAnimationFrameIds = []
  session.animationFrameSelectionAnchorId = null
  session.selectedAnimationCellKeys = [firstKey, secondKey]
  session.animationCellSelectionAnchorKey = secondKey
  session.animationCellSelectionExplicit = true

  useWorkspace.getState().setAnimationCelProperties(layer.id, secondFrame.id, { opacity: 0.6, zIndex: 3 }, [firstKey, secondKey])
  expect(session.selectedAnimationFrameIds).toEqual([])
  expect(session.selectedAnimationCellKeys).toEqual([firstKey, secondKey])
  expect(session.selectionGuidesPreservedAtContentRevision).toBe(session.contentRevision)
})
