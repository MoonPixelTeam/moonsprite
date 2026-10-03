import { beforeEach, expect, it } from 'vitest'
import { createDocument, createLayer, createLayerMask } from '@/core/document'
import { addBlankAnimationFrame, animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

const setup = () => {
  const document = createDocument('cell navigation', 2, 2, 'rgba')
  const lower = document.layers[0]
  const upper = createLayer('Upper', 2, 2, 'rgba')
  document.layers.push(upper)
  const timeline = ensureAnimationDocument(document)
  const first = timeline.activeFrameId
  const second = addBlankAnimationFrame(document)
  const third = addBlankAnimationFrame(document)
  const mask = createLayerMask(lower.id, 2, 2)
  const nextMask = createLayerMask(lower.id, 2, 2)
  timeline.layerMasks = [
    { layerId: lower.id, frameId: first, mask },
    { layerId: lower.id, frameId: third, mask: nextMask }
  ]
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().selectAnimationCell(animationCelKey(lower.id, first))
  return { document, lower, upper, timeline, first, second, third, mask, nextMask }
}

it('steps vertically through normal and mask cells in panel order, including the outer boundary', () => {
  const { lower, upper, first, mask } = setup()
  const state = useWorkspace.getState()
  const session = state.sessions[0]
  const history = session.history.canUndo
  const dirty = session.document.dirty
  state.stepAnimationCell('layer', -1)
  expect(session.selectedAnimationMaskCellKeys).toEqual([animationCelKey(lower.id, first)])
  expect(session.activeLayerMaskId).toBe(mask.id)
  expect(session.selectedAnimationCellKeys).toEqual([])
  state.stepAnimationCell('layer', -1)
  expect(session.selectedAnimationCellKeys).toEqual([animationCelKey(upper.id, first)])
  expect(session.activeLayerMaskId).toBeNull()
  state.stepAnimationCell('layer', -1)
  expect(session.selectedAnimationCellKeys).toEqual([animationCelKey(upper.id, first)])
  state.stepAnimationCell('layer', 1)
  expect(session.selectedAnimationMaskCellKeys).toEqual([animationCelKey(lower.id, first)])
  state.stepAnimationCell('layer', 1)
  expect(session.selectedAnimationCellKeys).toEqual([animationCelKey(lower.id, first)])
  expect(session.selectedAnimationMaskCellKeys).toEqual([])
  expect(session.history.canUndo).toBe(history)
  expect(session.document.dirty).toBe(dirty)
})

it('keeps the mask row across empty slots, populated frames and frame wrapping', () => {
  const { lower, first, second, third, mask, nextMask, timeline } = setup()
  const state = useWorkspace.getState()
  const session = state.sessions[0]
  state.stepAnimationCell('layer', -1)
  for (const [delta, frameId, maskId] of [
    [1, second, null], [1, third, nextMask.id], [1, first, mask.id], [-1, third, nextMask.id]
  ] as const) {
    state.stepAnimationCell('frame', delta)
    expect(session.timelineActiveContext).toMatchObject({
      row: { kind: 'mask', ownerKind: 'layer', ownerId: lower.id }, frameId
    })
    expect(session.selectedAnimationMaskCellKeys).toEqual([animationCelKey(lower.id, frameId)])
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.activeLayerMaskId).toBe(maskId)
  }
  expect(timeline.layerMasks).toHaveLength(2)
})

it('can enter an empty mask slot vertically and return to its normal cel', () => {
  const { lower, second, timeline } = setup()
  const state = useWorkspace.getState()
  const session = state.sessions[0]
  state.selectAnimationCell(animationCelKey(lower.id, second))
  state.stepAnimationCell('layer', -1)
  expect(session.selectedAnimationMaskCellKeys).toEqual([animationCelKey(lower.id, second)])
  expect(session.activeLayerMaskId).toBeNull()
  state.stepAnimationCell('layer', 1)
  expect(session.selectedAnimationCellKeys).toEqual([animationCelKey(lower.id, second)])
  expect(timeline.layerMasks).toHaveLength(2)
})

it('includes group mask cells while respecting collapsed child rows', () => {
  const { document, lower, upper, timeline, first, second } = setup()
  document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
  upper.groupId = 'group'
  const mask = createLayerMask('group', 2, 2)
  timeline.groupMasks = [{ groupId: 'group', frameId: first, mask }]
  const state = useWorkspace.getState()
  const session = state.sessions[0]
  session.collapsedGroupIds = ['group']
  state.selectAnimationCell(animationCelKey(lower.id, first))
  state.stepAnimationCell('layer', -1)
  state.stepAnimationCell('layer', -1)
  expect(session.timelineActiveContext.row).toEqual({ kind: 'mask', ownerKind: 'group', ownerId: 'group' })
  expect(session.activeLayerMaskId).toBe(mask.id)
  state.stepAnimationCell('frame', 1)
  expect(session.selectedAnimationMaskCellKeys).toEqual([animationCelKey('group', second)])
  state.stepAnimationCell('layer', 1)
  expect(session.selectedAnimationMaskCellKeys).toEqual([animationCelKey(lower.id, second)])
})
