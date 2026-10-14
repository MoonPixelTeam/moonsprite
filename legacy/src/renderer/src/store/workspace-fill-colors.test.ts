import { beforeEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt } from '@/core/document'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
})
it('fills with either color without swapping colors and supports undo', () => {
  const doc = createDocument('fill', 3, 3, 'rgba')
  useWorkspace.getState().addSession(doc)
  const session = useWorkspace.getState().sessions[0]
  const foreground = { ...session.primaryColor }
  const background = { ...session.secondaryColor }
  useWorkspace.getState().fillForeground('background')
  expect(readLayerColorAt(doc, getActiveLayer(doc), 1, 1)).toEqual(background)
  expect(useWorkspace.getState().sessions[0].primaryColor).toEqual(foreground)
  expect(useWorkspace.getState().sessions[0].secondaryColor).toEqual(background)
  useWorkspace.getState().fillForeground()
  expect(readLayerColorAt(doc, getActiveLayer(doc), 1, 1)).toEqual(foreground)
  useWorkspace.getState().undo()
  const restored = useWorkspace.getState().sessions[0].document
  expect(readLayerColorAt(restored, getActiveLayer(restored), 1, 1)).toEqual(background)
})
