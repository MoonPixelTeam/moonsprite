import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createLayer, getActiveLayer } from '@/core/document'
import { ensureAnimationDocument, animationCelKey } from '@/core/animation'
import { beginPixelEdit, recordPixel } from '@/core/history'
import { packColor } from '@/core/raster'
import { useWorkspace } from './workspace'

const red = { r: 255, g: 0, b: 0, a: 255 }

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, layerStyleClipboard: null, message: null, saveProgress: null, dialog: null })
})

describe('layer, frame, and cel selection modes', () => {
  it('keeps the three selection modes mutually exclusive', () => {
    const document = createDocument('selection modes', 2, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    const secondLayer = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(secondLayer)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectLayer(firstLayer.id)
    useWorkspace.getState().selectLayer(secondLayer.id, 'toggle')
    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedLayerIds).toEqual([firstLayer.id, secondLayer.id])
    expect(session.selectedAnimationFrameIds).toEqual([])
    expect(session.selectedAnimationCellKeys).toEqual([])

    const frameId = ensureAnimationDocument(document).activeFrameId
    useWorkspace.getState().selectAnimationFrame(frameId)
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([frameId])
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedLayerIds).toEqual([document.activeLayerId])

    useWorkspace.getState().selectAnimationCell(animationCelKey(secondLayer.id, frameId))
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([])
    expect(session.selectedAnimationCellKeys).toEqual([animationCelKey(secondLayer.id, frameId)])
    expect(session.selectedLayerIds).toEqual([secondLayer.id])

    useWorkspace.getState().selectAnimationFrame(frameId)
    useWorkspace.getState().selectLayer(firstLayer.id)
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([])
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedLayerIds).toEqual([firstLayer.id])
  })

  it('preserves an explicit multi-layer selection after drawing', () => {
    const document = createDocument('selection after drawing', 2, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    const secondLayer = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(secondLayer)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectLayer(firstLayer.id)
    useWorkspace.getState().selectLayer(secondLayer.id, 'toggle')
    const edit = beginPixelEdit(secondLayer.id)
    recordPixel(document, secondLayer, edit, 0, packColor(red))
    useWorkspace.getState().commitPixelEdit(edit, 'draw')

    const session = useWorkspace.getState().sessions[0]
    expect(session.document.activeLayerId).toBe(secondLayer.id)
    expect(session.selectedLayerIds).toEqual([firstLayer.id, secondLayer.id])
    expect(session.selectedAnimationFrameIds).toEqual([])
    expect(session.selectedAnimationCellKeys).toEqual([])
  })

  it('keeps the active layer as the current interaction selection', () => {
    const document = createDocument('clear layer selection', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().clearLayerSelection()

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedLayerIds).toEqual([layer.id])
    expect(session.document.activeLayerId).toBe(layer.id)
  })
})
