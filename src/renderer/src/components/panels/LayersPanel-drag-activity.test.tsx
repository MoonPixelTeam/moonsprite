import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelKey } from '@/core/animation'
import { createDocument, createLayer, writeLayerColor } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn().mockResolvedValue({ totalBytes: 8e9, freeBytes: 4e9 }) })
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([false, true])('keeps every traversed frame active before releasing a cel range drag (group=%s)', (group) => {
  const document = createDocument('drag activity', 1, 1, 'rgba')
  const layer = document.layers[0]
  if (group) {
    document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    layer.groupId = 'group'
  }
  document.layers.push(createLayer('Other row', 1, 1, 'rgba'))
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  for (let i = 1; i < 5; i++) addBlankAnimationFrame(document)
  const frames = document.animation!.frames
  activateAnimationFrame(document, frames[0].id)
  useWorkspace.getState().addSession(document)
  const view = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  const cell = (i: number) => view.container.querySelector(`[data-animation-${group ? 'group-cel' : 'cel'}-key="${animationCelKey(group ? 'group' : layer.id, frames[i].id)}"]`)!
  fireEvent.pointerDown(cell(0), { button: 0, pointerId: 1, clientX: 10, clientY: 50 })
  for (let end = 1; end < 5; end++) {
    fireEvent.pointerMove(cell(end), { buttons: 1, pointerId: 1, clientX: 10 + end * 28, clientY: 50 })
    for (let index = 0; index <= end; index++) {
      expect(view.container.querySelector(`[data-animation-frame-id="${frames[index].id}"]`)).toHaveClass('active')
    }
  }
  fireEvent.pointerUp(cell(4), { button: 0, pointerId: 1 })
})
