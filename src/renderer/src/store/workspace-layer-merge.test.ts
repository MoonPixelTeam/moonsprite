import { beforeEach, describe, expect, it } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, cloneDocumentForAnimationFrame, ensureAnimationDocument, syncActiveAnimationFrame } from '@/core/animation'
import { compositeDocument, createDocument, createLayer, getActiveLayer, writeLayerColor } from '@/core/document'
import { useWorkspace } from './workspace'

describe('multi-frame layer merge history', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null, recoveryRecords: [] })
  })

  it.each(['mergeActiveLayerDown', 'mergeSelectedLayers', 'mergeSelectedGroup', 'mergeVisibleLayers'] as const)('preserves every frame through %s, frame switching, undo and redo', (command) => {
    const document = createDocument('merge history', 1, 1, 'rgba')
    const bottom = getActiveLayer(document)
    const top = createLayer('Top', 1, 1, 'rgba')
    document.layers.push(top)
    document.activeLayerId = top.id
    if (command === 'mergeSelectedGroup') {
      document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 0.7, blendMode: 'normal' })
      bottom.groupId = top.groupId = 'group'
    }
    const originalGroups = structuredClone(document.groups)
    const timeline = ensureAnimationDocument(document)
    for (let index = 0; index < 4; index += 1) {
      if (index > 0) addBlankAnimationFrame(document)
      writeLayerColor(document, bottom, 0, { r: index * 60, g: 50, b: 200, a: 255 })
      writeLayerColor(document, top, 0, { r: 255, g: index * 50, b: 0, a: 120 })
      timeline.frames[index].duration = 100 + index * 25
    }
    activateAnimationFrame(document, timeline.frames[1].id)
    syncActiveAnimationFrame(document)
    const frames = timeline.frames.map((frame) => ({ ...frame }))
    const before = frames.map((frame) => compositeDocument(cloneDocumentForAnimationFrame(document, frame.id)))
    useWorkspace.getState().addSession(document)

    const expectFramesPreserved = () => {
      expect(timeline.frames).toEqual(frames)
      for (const [index, frame] of frames.entries()) {
        activateAnimationFrame(document, frame.id)
        expect(compositeDocument(document)).toEqual(before[index])
      }
    }

    const session = useWorkspace.getState().sessions.find((item) => item.document.id === document.id)!
    session.selectedLayerIds = [bottom.id, top.id]
    if (command === 'mergeSelectedGroup') session.selectedGroupId = 'group'
    useWorkspace.getState()[command]()
    const mergedLayerId = document.activeLayerId
    expect(document.layers).toHaveLength(1)
    expect(timeline.activeFrameId).toBe(frames[1].id)
    expectFramesPreserved()

    useWorkspace.getState().undo()
    expect(document.layers.map((layer) => layer.id)).toEqual([bottom.id, top.id])
    expect(document.groups).toEqual(originalGroups)
    expect(timeline.cels).toHaveLength(8)
    expectFramesPreserved()

    useWorkspace.getState().redo()
    expect(document.layers.map((layer) => layer.id)).toEqual([mergedLayerId])
    expect(timeline.cels).toHaveLength(4)
    expectFramesPreserved()
  })
})
