import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer } from './document-model'
import { ensureAnimationDocument } from './animation'
import { layerPanelTopologyKey } from './layer-panel-topology-key'
import { useWorkspace } from '@/store/workspace'

afterEach(() => { vi.restoreAllMocks(); useWorkspace.setState({ sessions: [], activeId: null }) })

it('does not visit 12,474 slots on repeated UI reads, and invalidates versioned link edits', () => {
  const document = createDocument('large topology', 1, 1, 'rgba')
  document.layers.push(...Array.from({ length: 41 }, () => createLayer('layer', 1, 1, 'rgba')))
  document.animation!.frames = Array.from({ length: 297 }, (_, index) => ({ id: `f${index}`, duration: 100 }))
  ensureAnimationDocument(document)
  const timeline = document.animation!, key = layerPanelTopologyKey(document, 0)
  const map = vi.spyOn(timeline.cels, 'map')
  for (let i = 0; i < 100; i++) { timeline.activeFrameId = `f${i}`; expect(layerPanelTopologyKey(document, 0)).toBe(key) }
  expect(map).not.toHaveBeenCalled()
  timeline.cels[1].linkedCelId = timeline.cels[0].id
  expect(layerPanelTopologyKey(document, 1)).not.toBe(key)
  const linked = layerPanelTopologyKey(document, 1)
  timeline.cels = timeline.cels.slice().reverse()
  expect(layerPanelTopologyKey(document, 1)).not.toBe(linked)
})

it('tracks store metadata/undo and leaves regional painting and frame navigation stable', () => {
  const document = createDocument('store topology', 2, 2, 'rgba')
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0], key = () => layerPanelTopologyKey(document, session.layersPanelRevision)
  const original = key()
  useWorkspace.getState().setView({ zoom: 3 })
  expect(key()).toBe(original)
  useWorkspace.getState().addAnimationFrame()
  expect(key()).not.toBe(original)
  useWorkspace.getState().undo()
  expect(document.animation!.frames).toHaveLength(1)
  expect(key()).not.toBe(original) // A new token also releases obsolete topology consumers.
})

it('checks unversioned construction and same-length edits rather than trusting array identity', () => {
  const document = createDocument('unversioned', 1, 1, 'rgba')
  const key = layerPanelTopologyKey(document)
  document.animation!.cels[0].linkedCelId = 'changed'
  expect(layerPanelTopologyKey(document)).not.toBe(key)
})
