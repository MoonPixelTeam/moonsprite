import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { animationCelKey, connectAnimationCels, ensureAnimationDocument } from '@/core/animation'
import { createDocument, getActiveLayer } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn().mockResolvedValue({ totalBytes: 8e9, freeBytes: 4e9 }) })
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each(['normal', 'detailed', 'expanded', 'large', 'huge'])('identifies linked thumbnail members without marking independent gap cells at %s density', density => {
  localStorage.setItem('moonsprite.layers.display-density', density)
  const document = createDocument('linked thumbnail decoration', 2, 2, 'rgba')
  const layer = getActiveLayer(document)
  layer.pixels[3] = 255
  useWorkspace.getState().addSession(document)
  for (let index = 0; index < 3; index++) useWorkspace.getState().duplicateAnimationFrame()
  const timeline = ensureAnimationDocument(document)
  const members = [0, 1, 3].map(index => timeline.cels.find(cel => cel.layerId === layer.id && cel.frameId === timeline.frames[index].id)!)
  connectAnimationCels(document, members.map(cel => cel.id))
  useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.frames[0].id))
  const { container, rerender } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  timeline.frames.forEach((frame, index) => {
    const cell = container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, frame.id)}"]`)!
    expect(Boolean(cell.querySelector('.cel-thumbnail.shared-checkerboard'))).toBe(density !== 'normal' && index !== 2)
    expect(Boolean(cell.querySelector('.cel-thumbnail canvas'))).toBe(density !== 'normal')
  })
  expect(container.querySelector('.cel-thumbnail-link')).not.toBeInTheDocument()
  expect(container.querySelector('[data-linked-cel-block][data-frame-index="0"][data-frame-span="2"]')).toBeInTheDocument()
  expect(container.querySelector('[data-linked-cel-connector][data-start-frame-index="1"][data-end-frame-index="3"]')).toBeInTheDocument()
  expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([animationCelKey(layer.id, timeline.frames[0].id)])
  for (const index of [0, 1, 3]) {
    expect(container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.frames[index].id)}"]`)).toHaveClass('selected-cel')
  }
  const boxes = [...container.querySelectorAll<HTMLElement>('[data-animation-cel-selection]')]
  expect(boxes.map(box => [box.style.getPropertyValue('--animation-frame-index'), box.style.getPropertyValue('--animation-frame-span')]))
    .toEqual([['0', '2'], ['3', '1']])
  // Both display modes use the same link-selection gate: choosing an
  // unrelated cel hides the blue bridge, choosing a member reveals it again.
  act(() => { useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.frames[2].id)) })
  rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  expect(container.querySelector('[data-linked-cel-connector]')).not.toBeInTheDocument()
  act(() => { useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.frames[3].id)) })
  rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  expect(container.querySelector('[data-linked-cel-connector]')).toHaveClass('selected')
  act(() => { useWorkspace.getState().clearAnimationSelection(true) })
  rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  expect(container.querySelector('[data-linked-cel-connector]')).not.toBeInTheDocument()
  expect(container.querySelector('[data-linked-cel-block].selected')).not.toBeInTheDocument()
  expect(container.querySelector('[data-animation-cel-selection]')).not.toBeInTheDocument()
})

it.each(['frame', 'cel'] as const)('keeps a linked bridge and hides only its interior dividers when selecting the second %s', (kind) => {
  const document = createDocument('linked frames 1, 2, 4', 1, 1, 'rgba')
  const layer = getActiveLayer(document)
  layer.pixels[3] = 255
  useWorkspace.getState().addSession(document)
  for (let index = 0; index < 3; index++) useWorkspace.getState().duplicateAnimationFrame()
  const timeline = ensureAnimationDocument(document)
  const linkedCels = [0, 1, 3].map(index => timeline.cels.find(cel => cel.layerId === layer.id && cel.frameId === timeline.frames[index].id)!)
  expect(connectAnimationCels(document, linkedCels.map(cel => cel.id))).toBe(true)
  useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.frames[0].id))
  const view = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  const verify = () => {
    expect(view.container.querySelector('[data-linked-cel-connector][data-start-frame-index="1"][data-end-frame-index="3"]')).toHaveClass('selected')
    for (const index of [1, 2]) {
      expect(view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.frames[index].id)}"]`)).toHaveClass('linked-cel-bridge-end')
    }
    const gap = view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.frames[2].id)}"]`)!
    expect(gap).not.toHaveClass('linked-cel-member')
    expect(gap.querySelector('.cel-content-marker')).toBeInTheDocument()
    expect(view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.frames[3].id)}"]`)).not.toHaveClass('linked-cel-bridge-end')
  }
  verify()
  if (kind === 'frame') useWorkspace.getState().selectAnimationFrame(timeline.frames[1].id)
  else useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.frames[1].id))
  view.rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  verify()
})
