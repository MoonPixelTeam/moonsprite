import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createLayer, createLayerMask, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { addBlankAnimationFrame, animationLayerAtFrame, duplicateAnimationFrame, ensureAnimationDocument, animationCelKey } from '@/core/animation'
import { beginPixelEdit, recordPixel } from '@/core/history'
import { packColor } from '@/core/raster'
import { normalizeAnimationSelection, useWorkspace } from './workspace'
import { isToolAvailableForSession } from './workspace-session'

const red = { r: 255, g: 0, b: 0, a: 255 }
const transparent = { r: 0, g: 0, b: 0, a: 0 }

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, layerStyleClipboard: null, message: null, saveProgress: null, dialog: null })
})

describe('layer, frame, and cel selection modes', () => {
  it('deletes the selected area from every selected layer as one history step', () => {
    const document = createDocument('delete selected layers', 2, 1, 'rgba')
    const first = getActiveLayer(document)
    const second = createLayer('Second', 2, 1, 'rgba')
    document.layers.push(second)
    for (const layer of [first, second]) {
      writeLayerColor(document, layer, 0, red)
      writeLayerColor(document, layer, 1, red)
    }
    ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayer(first.id)
    useWorkspace.getState().selectLayer(second.id, 'toggle')
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })

    useWorkspace.getState().deleteSelection()

    expect(readLayerColorAt(document, first, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, second, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, first, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, second, 1, 0)).toEqual(red)
    expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, first, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, second, 0, 0)).toEqual(red)
    useWorkspace.getState().redo()
    expect(readLayerColorAt(document, first, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, second, 0, 0)).toEqual(transparent)
  })

  it('deletes the selected area from every selected animation cell only', () => {
    const document = createDocument('delete selected cells', 2, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    writeLayerColor(document, layer, 1, red)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = duplicateAnimationFrame(document)
    const thirdFrameId = duplicateAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, secondFrameId), 'toggle')
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })

    useWorkspace.getState().deleteSelection()

    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, firstFrameId)!, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, secondFrameId)!, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, thirdFrameId)!, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, firstFrameId)!, 1, 0)).toEqual(red)
    expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, firstFrameId)!, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, secondFrameId)!, 0, 0)).toEqual(red)
    useWorkspace.getState().redo()
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, firstFrameId)!, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, secondFrameId)!, 0, 0)).toEqual(transparent)
  })

  it('deletes the selected area from every layer in the selected frames only', () => {
    const document = createDocument('delete selected frames', 2, 1, 'rgba')
    const first = getActiveLayer(document)
    const second = createLayer('Second', 2, 1, 'rgba')
    document.layers.push(second)
    for (const layer of [first, second]) {
      writeLayerColor(document, layer, 0, red)
      writeLayerColor(document, layer, 1, red)
    }
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = duplicateAnimationFrame(document)
    const thirdFrameId = duplicateAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationFrame(firstFrameId)
    useWorkspace.getState().selectAnimationFrame(secondFrameId, 'toggle')
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })

    useWorkspace.getState().deleteSelection()

    for (const frameId of [firstFrameId, secondFrameId]) for (const layer of [first, second]) {
      expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, frameId)!, 0, 0)).toEqual(transparent)
      expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, frameId)!, 1, 0)).toEqual(red)
    }
    for (const layer of [first, second]) {
      expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, thirdFrameId)!, 0, 0)).toEqual(red)
    }
    expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
    useWorkspace.getState().undo()
    for (const frameId of [firstFrameId, secondFrameId]) for (const layer of [first, second]) {
      expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, frameId)!, 0, 0)).toEqual(red)
    }
  })

  it('fills every selected animation cell and keeps the cell selection active', () => {
    const document = createDocument('fill selected cells', 2, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = duplicateAnimationFrame(document)
    const thirdFrameId = duplicateAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    const firstKey = animationCelKey(layer.id, firstFrameId)
    const secondKey = animationCelKey(layer.id, secondFrameId)
    useWorkspace.getState().selectAnimationCell(firstKey)
    useWorkspace.getState().selectAnimationCell(secondKey, 'toggle')
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
    useWorkspace.getState().setPrimaryColor(red)

    useWorkspace.getState().fillForeground()

    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, firstFrameId)!, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, secondFrameId)!, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, thirdFrameId)!, 0, 0)).toEqual(transparent)
    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([firstKey, secondKey])
    expect(session.selection).toMatchObject({ x: 0, y: 0, width: 1, height: 1 })
    expect(session.selectionGuidesPreservedAtContentRevision).toBe(session.contentRevision)
    expect(session.history.position).toBe(1)

    useWorkspace.getState().undo()
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([firstKey, secondKey])
    expect(session.selection).toMatchObject({ x: 0, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, firstFrameId)!, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, secondFrameId)!, 0, 0)).toEqual(transparent)
  })

  it('scales and rotates every selected cell without clearing either selection', () => {
    const document = createDocument('transform selected cells', 6, 4, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 1 * document.width + 1, red)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = duplicateAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    const firstKey = animationCelKey(layer.id, firstFrameId)
    const secondKey = animationCelKey(layer.id, secondFrameId)
    useWorkspace.getState().selectAnimationCell(firstKey)
    useWorkspace.getState().selectAnimationCell(secondKey, 'toggle')
    useWorkspace.getState().setSelection({ x: 1, y: 1, width: 1, height: 1 })
    useWorkspace.getState().setSelectionPropertiesActive(true)

    useWorkspace.getState().updateSelectionProperties({ x: 2, y: 1, width: 2, height: 2, angle: 90 })

    let session = useWorkspace.getState().sessions[0]
    expect(session.pendingPaste?.layers?.map(({ layerId, frameId }) => animationCelKey(layerId, frameId!))).toEqual([secondKey, firstKey])
    expect(session.pendingPaste?.transformTarget).toMatchObject({ width: 2, height: 2 })
    expect(session.pendingPaste?.transformAngle).toBe(90)
    expect(session.selectedAnimationCellKeys).toEqual([firstKey, secondKey])
    expect(session.selection).not.toBeNull()

    useWorkspace.getState().commitFloatingPaste()

    session = useWorkspace.getState().sessions[0]
    expect(session.pendingPaste).toBeNull()
    expect(session.selectedAnimationCellKeys).toEqual([firstKey, secondKey])
    expect(session.selection).not.toBeNull()
    expect(session.history.position).toBe(1)
  })

  it('switches a canvas hit target without creating an explicit layer selection', () => {
    const document = createDocument('canvas active layer', 2, 2, 'rgba')
    const second = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(second)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().activateLayerForCanvas(second.id)

    const session = useWorkspace.getState().sessions[0]
    expect(session.document.activeLayerId).toBe(second.id)
    expect(session.layerSelectionExplicit).toBe(false)
    // Normalization keeps the active row ID available to the timeline, but
    // the false explicit flag is what prevents a blue selection outline.
    expect(session.selectedLayerIds).toEqual([second.id])
    expect(session.timelineActiveContext.row).toMatchObject({ kind: 'layer', ownerId: second.id })
  })

  it('disables and clears selection aspect linking when entering free transform', () => {
    const document = createDocument('free transform aspect link', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 2, height: 1 })
    useWorkspace.getState().setSelectionPropertiesActive(true)
    useWorkspace.getState().setSelectionAspectRatio(2)
    useWorkspace.getState().beginFreeTransform()

    const session = useWorkspace.getState().sessions[0]
    expect(session.freeTransformActive).toBe(true)
    expect(session.selectionAspectRatio).toBeNull()
  })

  it('stores the selection aspect link outside document content and history', () => {
    const document = createDocument('selection aspect link', 4, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const before = useWorkspace.getState().sessions[0]
    const contentRevision = before.contentRevision
    const historyPosition = before.history.position

    useWorkspace.getState().setSelectionAspectRatio(2)

    let session = useWorkspace.getState().sessions[0]
    expect(session.selectionAspectRatio).toBe(2)
    expect(session.document.dirty).toBe(false)
    expect(session.contentRevision).toBe(contentRevision)
    expect(session.history.position).toBe(historyPosition)

    useWorkspace.getState().setSelectionAspectRatio(null)
    session = useWorkspace.getState().sessions[0]
    expect(session.selectionAspectRatio).toBeNull()
    expect(session.history.position).toBe(historyPosition)
  })

  it('restricts group selection to viewport navigation and whole-group move tools', () => {
    const document = createDocument('group tool availability', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const group = { id: 'group-tools', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    document.groups.push(group)
    layer.groupId = group.id
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectGroup(group.id)
    const session = useWorkspace.getState().sessions[0]

    expect(isToolAvailableForSession(session, 'move')).toBe(true)
    expect(isToolAvailableForSession(session, 'hand')).toBe(true)
    expect(isToolAvailableForSession(session, 'zoom')).toBe(true)
    expect(isToolAvailableForSession(session, 'rotate')).toBe(true)
    for (const tool of ['pencil', 'eraser', 'airbrush', 'fill', 'shape', 'line', 'selection', 'eyedropper', 'text'] as const) {
      expect(isToolAvailableForSession(session, tool)).toBe(false)
    }
  })

  it('keeps frame and cel selection mutually exclusive while using the cel layer as implicit selection', () => {
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
    const contentRevisionBeforeFrameSelection = session.contentRevision
    useWorkspace.getState().selectAnimationFrame(frameId)
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([frameId])
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedLayerIds).toEqual([])
    expect(session.layerSelectionExplicit).toBe(false)
    expect(session.contentRevision).toBe(contentRevisionBeforeFrameSelection)
    expect(session.document.dirty).toBe(false)

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

  it('clears selected cels when selecting one or more frames', () => {
    const document = createDocument('cel to frame', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    const thirdFrameId = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, secondFrameId), 'toggle')
    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([
      animationCelKey(layer.id, firstFrameId),
      animationCelKey(layer.id, secondFrameId),
    ])
    expect(session.animationCellSelectionExplicit).toBe(true)

    useWorkspace.getState().selectAnimationFrame(thirdFrameId)
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedAnimationFrameIds).toEqual([thirdFrameId])
    expect(session.animationCellSelectionExplicit).toBe(false)
  })

  it('clears formal group selection while preserving its active context when selecting frames', () => {
    const document = createDocument('group and frame', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const group = {
      id: 'group-selection',
      name: 'Group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
    }
    document.groups.push(group)
    layer.groupId = group.id
    const frameId = ensureAnimationDocument(document).activeFrameId
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectGroup(group.id)
    useWorkspace.getState().selectAnimationFrame(frameId)
    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedGroupIds).toEqual([])
    expect(session.selectedGroupId).toBeNull()
    expect(session.layerSelectionExplicit).toBe(false)
    expect(session.layerSelectionAnchorId).toBe(group.id)
    expect(session.selectedAnimationFrameIds).toEqual([frameId])
  })

  it('keeps ordinary cel and mask cel selection isolated', () => {
    const document = createDocument('mask selection', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const frameId = timeline.activeFrameId
    const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frameId)
    if (!cel) throw new Error('missing test cel')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)

    const key = animationCelKey(layer.id, frameId)
    useWorkspace.getState().selectAnimationCell(key)
    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([key])
    expect(session.selectedAnimationMaskCellKeys).toEqual([])

    useWorkspace.getState().selectAnimationMaskCell(key, 'replace')
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedAnimationMaskCellKeys).toEqual([key])
    expect(session.animationCellSelectionExplicit).toBe(false)
  })

  it('keeps a linked member mask selection valid', () => {
    const document = createDocument('linked member mask selection', 2, 2, 'rgba')
    const sourceLayer = getActiveLayer(document)
    const memberLayer = createLayer('Member', 2, 2, 'rgba')
    document.layers.push(memberLayer)
    const timeline = ensureAnimationDocument(document)
    const frameId = timeline.activeFrameId
    const source = timeline.cels.find((cel) => cel.layerId === sourceLayer.id && cel.frameId === frameId)
    if (!source) throw new Error('missing source cel')
    const member = timeline.cels.find((cel) => cel.layerId === memberLayer.id && cel.frameId === frameId)
    if (!member) throw new Error('missing member cel')
    const sourceMask = createLayerMask(sourceLayer.id, 2, 2)
    const memberMask = createLayerMask(memberLayer.id, 2, 2)
    memberMask.linkedMaskId = sourceMask.id
    timeline.layerMasks ??= []
    timeline.layerMasks.push(
      { layerId: sourceLayer.id, frameId, mask: sourceMask },
      { layerId: memberLayer.id, frameId, mask: memberMask }
    )
    useWorkspace.getState().addSession(document)

    const session = useWorkspace.getState().sessions[0]
    const memberKey = animationCelKey(memberLayer.id, frameId)
    useWorkspace.getState().mutateActive((session) => {
      session.selectedAnimationMaskCellKeys = [memberKey]
      session.animationMaskCellSelectionAnchorKey = memberKey
    }, false)
    normalizeAnimationSelection(session)
    expect(session.selectedAnimationMaskCellKeys).toEqual([memberKey])
  })

  it('does not normalize stale timeline keys during a pure pixel undo', () => {
    const document = createDocument('pixel undo selection preservation', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const frameId = ensureAnimationDocument(document).activeFrameId
    useWorkspace.getState().addSession(document)
    const staleKey = animationCelKey('missing-layer', frameId)
    useWorkspace.getState().mutateActive((session) => {
      session.selectedAnimationCellKeys = [staleKey]
      session.animationCellSelectionExplicit = true
    }, false)
    const edit = beginPixelEdit(layer.id)
    recordPixel(document, layer, edit, 0, packColor(red))
    useWorkspace.getState().commitPixelEdit(edit, 'pixel undo selection preservation')
    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([staleKey])
  })

  it('normalizes deleted frame references and keeps undo/redo activity legal', () => {
    const document = createDocument('frame cleanup', 2, 2, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const secondFrameId = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationFrame(secondFrameId)
    useWorkspace.getState().deleteAnimationFrame()

    let session = useWorkspace.getState().sessions[0]
    const currentTimeline = ensureAnimationDocument(session.document)
    expect(currentTimeline.frames.some((frame) => frame.id === secondFrameId)).toBe(false)
    expect(currentTimeline.frames.some((frame) => frame.id === currentTimeline.activeFrameId)).toBe(true)
    expect(session.selectedAnimationFrameIds).not.toContain(secondFrameId)

    useWorkspace.getState().undo()
    session = useWorkspace.getState().sessions[0]
    expect(ensureAnimationDocument(session.document).frames.some((frame) => frame.id === secondFrameId)).toBe(true)
    expect(session.selectedAnimationFrameIds.every((id) => ensureAnimationDocument(session.document).frames.some((frame) => frame.id === id))).toBe(true)

    useWorkspace.getState().redo()
    session = useWorkspace.getState().sessions[0]
    expect(ensureAnimationDocument(session.document).frames.some((frame) => frame.id === session.document.animation!.activeFrameId)).toBe(true)
    expect(session.selectedAnimationFrameIds.every((id) => ensureAnimationDocument(session.document).frames.some((frame) => frame.id === id))).toBe(true)
  })

  it('normalizes once at the end of a multi-frame delete boundary', () => {
    const document = createDocument('multi-frame delete cleanup', 2, 2, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    const thirdFrameId = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationFrame(firstFrameId)
    useWorkspace.getState().selectAnimationFrame(secondFrameId, 'toggle')
    useWorkspace.getState().selectAnimationFrame(thirdFrameId, 'toggle')

    useWorkspace.getState().deleteSelectedAnimationItems()
    const session = useWorkspace.getState().sessions[0]
    const remaining = ensureAnimationDocument(session.document)
    expect(remaining.frames).toHaveLength(1)
    expect(session.selectedAnimationFrameIds).toEqual([])
    expect(session.animationFrameSelectionAnchorId).toBeNull()
    expect(session.history.latestUndoEntry?.requiresAnimationSelectionNormalization).toBe(true)

    useWorkspace.getState().undo()
    let restored = useWorkspace.getState().sessions[0]
    expect(ensureAnimationDocument(restored.document).frames).toHaveLength(3)

    useWorkspace.getState().redo()
    restored = useWorkspace.getState().sessions[0]
    expect(ensureAnimationDocument(restored.document).frames).toHaveLength(1)
    expect(restored.selectedAnimationFrameIds).toEqual([])
  })

  it('clears deleted cel selection and keeps undo/redo selection references legal', () => {
    const document = createDocument('cel cleanup', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const frameId = ensureAnimationDocument(document).activeFrameId
    const key = animationCelKey(layer.id, frameId)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationCell(key)
    const beforeContentRevision = useWorkspace.getState().sessions[0].contentRevision

    useWorkspace.getState().deleteSelectedAnimationItems()
    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedAnimationMaskCellKeys).toEqual([])
    expect(session.contentRevision).toBeGreaterThan(beforeContentRevision)

    useWorkspace.getState().undo()
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.animationCellSelectionExplicit).toBe(false)
    expect(ensureAnimationDocument(session.document).frames.some((frame) => frame.id === ensureAnimationDocument(session.document).activeFrameId)).toBe(true)

    useWorkspace.getState().redo()
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedAnimationMaskCellKeys).toEqual([])
  })

  it('filters a stale cel key when the underlying cel is removed', () => {
    const document = createDocument('stale cel key', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const frameId = timeline.activeFrameId
    const key = animationCelKey(layer.id, frameId)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationCell(key)

    const session = useWorkspace.getState().sessions[0]
    session.document.animation!.cels = session.document.animation!.cels.filter((cel) => cel.layerId !== layer.id || cel.frameId !== frameId)
    normalizeAnimationSelection(session)
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.animationCellSelectionExplicit).toBe(false)
  })

  it('falls back deterministically from invalid active layer/frame ids', () => {
    const document = createDocument('active fallback', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().mutateActive((session) => {
      session.document.activeLayerId = 'missing-layer'
      timeline.activeFrameId = 'missing-frame'
    }, false)

    const session = useWorkspace.getState().sessions[0]
    normalizeAnimationSelection(session)
    expect(session.document.activeLayerId).toBe(layer.id)
    expect(ensureAnimationDocument(session.document).activeFrameId).toBe(timeline.frames[0].id)
    expect(session.document.dirty).toBe(false)
  })

  it('preserves the implicit/explicit cel distinction', () => {
    const document = createDocument('implicit cel', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const frameId = ensureAnimationDocument(document).activeFrameId
    const key = animationCelKey(layer.id, frameId)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().mutateActive((session) => {
      session.selectedAnimationCellKeys = [key]
      session.animationCellSelectionExplicit = false
    }, false)
    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([key])
    expect(session.animationCellSelectionExplicit).toBe(false)

    useWorkspace.getState().selectAnimationCell(key)
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([key])
    expect(session.animationCellSelectionExplicit).toBe(true)
  })

  it('keeps sparse empty timeline slots non-materialized during selection', () => {
    const document = createDocument('sparse empty selection', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    timeline.cels = []
    const beforeCels = timeline.cels.length
    const beforeSurfaces = timeline.cels.filter((cel) => cel.surface).length
    useWorkspace.getState().addSession(document)
    const beforeSession = useWorkspace.getState().sessions[0]
    const beforeContentRevision = beforeSession.contentRevision
    const beforeDirty = beforeSession.document.dirty
    const beforeHistoryPosition = beforeSession.history.position

    useWorkspace.getState().selectLayer(layer.id)
    useWorkspace.getState().setActiveAnimationFrame(secondFrameId)
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, secondFrameId))

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([animationCelKey(layer.id, secondFrameId)])
    expect(session.document.animation?.cels.length ?? 0).toBe(beforeCels)
    expect(session.document.animation?.cels.filter((cel) => cel.surface).length ?? 0).toBe(beforeSurfaces)
    expect(session.contentRevision).toBe(beforeContentRevision)
    expect(session.document.dirty).toBe(beforeDirty)
    expect(session.history.position).toBe(beforeHistoryPosition)
    expect(firstFrameId).not.toBe(secondFrameId)
  })

  it('supports replace, toggle, and range semantics for frame selection', () => {
    const document = createDocument('frame modes', 2, 2, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const first = timeline.activeFrameId
    const second = addBlankAnimationFrame(document)
    const third = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectAnimationFrame(first, 'replace')
    useWorkspace.getState().selectAnimationFrame(second, 'toggle')
    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([first, second])

    useWorkspace.getState().selectAnimationFrame(second, 'toggle')
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([first])

    useWorkspace.getState().selectAnimationFrame(third, 'range')
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([first, second, third])
  })

  it('supports replace, toggle, and range semantics for cel selection', () => {
    const document = createDocument('cel modes', 2, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    const secondLayer = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(secondLayer)
    const timeline = ensureAnimationDocument(document)
    addBlankAnimationFrame(document)
    const firstFrame = timeline.activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const thirdFrame = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)

    const firstKey = animationCelKey(firstLayer.id, firstFrame)
    const secondKey = animationCelKey(firstLayer.id, secondFrame)
    const rangeEndKey = animationCelKey(secondLayer.id, thirdFrame)
    useWorkspace.getState().selectAnimationCell(firstKey, 'replace')
    useWorkspace.getState().selectAnimationCell(secondKey, 'toggle')
    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([firstKey, secondKey])

    useWorkspace.getState().selectAnimationCell(secondKey, 'toggle')
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([firstKey])

    useWorkspace.getState().selectAnimationCell(rangeEndKey, 'range')
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([
      animationCelKey(firstLayer.id, firstFrame),
      animationCelKey(firstLayer.id, secondFrame),
      animationCelKey(firstLayer.id, thirdFrame),
      animationCelKey(secondLayer.id, firstFrame),
      animationCelKey(secondLayer.id, secondFrame),
      rangeEndKey,
    ])
    expect(session.animationCellSelectionExplicit).toBe(true)
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

  it('clears explicit animation selection while keeping the active layer and frame', () => {
    const document = createDocument('clear blank panel selection', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const frameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationFrame(secondFrameId)
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, frameId))

    // This mirrors LayersPanel's blank-area pointer handler.
    useWorkspace.getState().clearLayerSelection()
    useWorkspace.getState().clearAnimationSelection()

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([])
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedAnimationMaskCellKeys).toEqual([])
    expect(session.animationCellSelectionExplicit).toBe(false)
    expect(session.selectedLayerIds).toEqual([layer.id])
    expect(session.selectedGroupIds).toEqual([])
    expect(session.selectedGroupId).toBeNull()
    expect(session.document.activeLayerId).toBe(layer.id)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(frameId)
  })

  it('keeps arrow layer navigation active-only when no layer is explicitly selected', () => {
    const document = createDocument('active-only layer navigation', 2, 2, 'rgba')
    const first = getActiveLayer(document)
    const second = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(second)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().stepLayerSelection(-1)

    const next = useWorkspace.getState().sessions[0]
    expect(next.document.activeLayerId).toBe(second.id)
    expect(next.selectedLayerIds).toEqual([second.id])
    expect(next.selectedGroupIds).toEqual([])
    expect(next.selectedGroupId).toBeNull()
  })

  it('preserves explicit single-layer selection while stepping', () => {
    const document = createDocument('explicit layer navigation', 2, 2, 'rgba')
    const first = getActiveLayer(document)
    const second = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(second)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayer(first.id)

    useWorkspace.getState().stepLayerSelection(-1)

    const next = useWorkspace.getState().sessions[0]
    expect(next.document.activeLayerId).toBe(second.id)
    expect(next.selectedLayerIds).toEqual([second.id])
    expect(next.selectedGroupIds).toEqual([])
  })

  it('keeps arrow frame navigation active-only when no frame is explicitly selected', () => {
    const document = createDocument('active-only frame navigation', 2, 2, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const first = timeline.activeFrameId
    const second = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    session.selectedAnimationFrameIds = []
    useWorkspace.setState({ sessions: [...useWorkspace.getState().sessions] })

    useWorkspace.getState().stepAnimationFrame(1)

    const next = useWorkspace.getState().sessions[0]
    expect(next.document.animation?.activeFrameId).toBe(first)
    expect(next.selectedAnimationFrameIds).toEqual([])
    expect(next.document.animation?.activeFrameId).not.toBe(second)
  })

  it('clears timeline item selections while continuously stepping frames', () => {
    const document = createDocument('continuous active-only frame navigation', 2, 2, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const first = timeline.activeFrameId
    const second = addBlankAnimationFrame(document)
    const third = addBlankAnimationFrame(document)
    timeline.activeFrameId = first
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    session.selectedLayerIds = []
    session.selectedGroupIds = []
    session.selectedGroupId = null
    session.layerSelectionExplicit = false
    session.selectedAnimationFrameIds = []
    const celKey = animationCelKey(session.document.layers[0].id, first)
    session.selectedAnimationCellKeys = [celKey]
    session.selectedAnimationMaskCellKeys = []
    useWorkspace.setState({ sessions: [...useWorkspace.getState().sessions] })

    useWorkspace.getState().stepAnimationFrame(1)
    useWorkspace.getState().stepAnimationFrame(1)
    useWorkspace.getState().stepAnimationFrame(-1)
    useWorkspace.getState().stepAnimationFrame(-1)

    const next = useWorkspace.getState().sessions[0]
    expect(next.document.animation?.activeFrameId).toBe(first)
    expect(next.selectedAnimationFrameIds).toEqual([])
    expect(next.selectedAnimationCellKeys).toEqual([])
    expect(next.selectedAnimationMaskCellKeys).toEqual([])
    expect(next.selectedLayerIds).toEqual([])
    expect(next.selectedGroupIds).toEqual([])
    expect(next.selectedGroupId).toBeNull()
    expect(next.layerSelectionExplicit).toBe(false)
    expect(second).not.toBe(third)
  })

  it('clears explicit frame selection while stepping', () => {
    const document = createDocument('explicit frame navigation', 2, 2, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const first = timeline.activeFrameId
    const second = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationFrame(first)

    useWorkspace.getState().stepAnimationFrame(1)

    const next = useWorkspace.getState().sessions[0]
    expect(next.document.animation?.activeFrameId).toBe(second)
    expect(next.selectedAnimationFrameIds).toEqual([])
  })

  it('limits arrow stepping to a loop section only in tag playback mode', () => {
    const document = createDocument('loop-aware arrow navigation', 2, 2, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const first = timeline.activeFrameId
    const second = addBlankAnimationFrame(document)
    const third = addBlankAnimationFrame(document)
    const fourth = addBlankAnimationFrame(document)
    timeline.loopSections = [{ id: 'tag', name: 'Tag', startFrameId: first, endFrameId: second, direction: 'forward', repeatCount: null }]
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    session.selectedAnimationFrameIds = []
    session.animationPlaybackMode = 'all'
    timeline.activeFrameId = second
    useWorkspace.getState().stepAnimationFrame(1)
    expect(timeline.activeFrameId).toBe(third)

    session.animationPlaybackMode = 'tag'
    timeline.activeFrameId = second
    useWorkspace.getState().stepAnimationFrame(1)
    expect(timeline.activeFrameId).toBe(first)
    expect(fourth).not.toBe(third)
  })

  it('moves the active animation cell across layers and frames', () => {
    const document = createDocument('cell arrow navigation', 2, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    const secondLayer = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(secondLayer)
    const timeline = ensureAnimationDocument(document)
    addBlankAnimationFrame(document)
    const firstFrame = timeline.activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    timeline.activeFrameId = firstFrame
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().stepAnimationCell('layer', -1)
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([animationCelKey(secondLayer.id, firstFrame)])
    useWorkspace.getState().stepAnimationCell('frame', 1)
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([animationCelKey(secondLayer.id, secondFrame)])
    expect(firstLayer.id).not.toBe(secondLayer.id)
  })
})
