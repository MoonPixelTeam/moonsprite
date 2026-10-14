import { expect, it } from 'vitest'
import { shallow } from 'zustand/shallow'
import { createDocument } from '@/core/document-model'
import { sessionFromDocument, touch } from '@/store/workspace-session'
import { canvasSessionRenderState } from './document-canvas-state'
import { useWorkspace } from '@/store/workspace'

it('isolates another document while detecting in-place edits and selection-only updates', () => {
  const a = sessionFromDocument(createDocument('a', 2, 2, 'rgba'))
  const b = sessionFromDocument(createDocument('b', 2, 2, 'rgba'))
  const beforeA = canvasSessionRenderState(a), beforeB = canvasSessionRenderState(b)
  touch(a, true)
  expect(shallow(beforeA, canvasSessionRenderState(a))).toBe(false)
  expect(shallow(beforeB, canvasSessionRenderState(b))).toBe(true)
  const beforeSelection = canvasSessionRenderState(b)
  b.selectedLayerIds.length = 0
  expect(shallow(beforeSelection, canvasSessionRenderState(b))).toBe(false)
})

it('notifies the correct resident canvas for real tool, view and shared-color commands', () => {
  const a = sessionFromDocument(createDocument('a', 2, 2, 'rgba'))
  const b = sessionFromDocument(createDocument('b', 2, 2, 'rgba'))
  useWorkspace.setState({ sessions: [a, b], activeId: a.document.id })
  try {
    const beforeB = canvasSessionRenderState(b), content = a.contentRevision
    let beforeA = canvasSessionRenderState(a)
    useWorkspace.getState().setBrushAngle(45)
    expect(shallow(beforeA, canvasSessionRenderState(a))).toBe(false)
    expect(shallow(beforeB, canvasSessionRenderState(b))).toBe(true)
    beforeA = canvasSessionRenderState(a)
    useWorkspace.getState().setView({ mirrored: true })
    expect(shallow(beforeA, canvasSessionRenderState(a))).toBe(false)
    expect(a.contentRevision).toBe(content)
    beforeA = canvasSessionRenderState(a)
    useWorkspace.getState().setView({ showGrid: !a.view.showGrid })
    expect(shallow(beforeA, canvasSessionRenderState(a))).toBe(false)
    useWorkspace.getState().syncCanvasToolSettings(b.document.id)
    expect(shallow(beforeB, canvasSessionRenderState(b))).toBe(false)
    const beforeColor = canvasSessionRenderState(b)
    useWorkspace.getState().setPrimaryColor({ r: 1, g: 2, b: 3, a: 255 })
    expect(shallow(beforeColor, canvasSessionRenderState(b))).toBe(false)
  } finally { useWorkspace.setState({ sessions: [], activeId: null }) }
})
