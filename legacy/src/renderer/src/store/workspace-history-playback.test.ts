import { beforeEach, describe, expect, it } from 'vitest'
import { ensureAnimationDocument } from '@/core/animation'
import { createDocument, createLayer } from '@/core/document'
import { beginPixelEdit, recordPixel } from '@/core/history'
import { packColor } from '@/core/raster'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

describe('workspace history during animation playback', () => {
  it('pauses playback and returns to the edited cel when drawing is undone', () => {
    const document = createDocument('undo drawing during playback', 2, 2, 'rgba')
    const originalLayer = document.layers[0]
    const editedLayer = createLayer('Edited layer', 2, 2, 'rgba')
    document.layers.push(editedLayer)
    document.activeLayerId = editedLayer.id
    useWorkspace.getState().addSession(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    useWorkspace.getState().duplicateAnimationFrame()
    const secondFrameId = timeline.activeFrameId
    useWorkspace.getState().setActiveAnimationFrame(firstFrameId)
    const edit = beginPixelEdit(editedLayer.id)
    recordPixel(document, editedLayer, edit, 0, packColor({ r: 255, g: 0, b: 0, a: 255 }))
    useWorkspace.getState().commitPixelEdit(edit, 'draw before playback')

    useWorkspace.getState().setAnimationPlaybackMode('all')
    useWorkspace.getState().setAnimationPlaying(true)
    useWorkspace.getState().advanceAnimationFrame()
    useWorkspace.getState().selectLayer(originalLayer.id)
    expect(timeline.activeFrameId).toBe(secondFrameId)
    expect(document.activeLayerId).toBe(originalLayer.id)
    expect(useWorkspace.getState().sessions[0].animationPlaying).toBe(true)

    useWorkspace.getState().undo()

    const session = useWorkspace.getState().sessions[0]
    expect(session.animationPlaying).toBe(false)
    expect(session.animationPlaybackLoopSectionId).toBeNull()
    expect(timeline.activeFrameId).toBe(firstFrameId)
    expect(document.activeLayerId).toBe(editedLayer.id)
    expect(session.timelineActiveContext).toMatchObject({
      row: { kind: 'layer', ownerKind: 'layer', ownerId: editedLayer.id },
      frameId: firstFrameId,
    })
  })
})
