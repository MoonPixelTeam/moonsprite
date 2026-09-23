import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, createLayerMask, getActiveLayer, animationMaskAt } from '@/core/document'
import { addBlankAnimationFrame, animationCelAt, animationCelKey, animationCelHasContent, ensureAnimationDocument, refreshActiveAnimationFrame } from '@/core/animation'
import { useWorkspace } from './workspace'
import { cutWorkspaceItems } from './workspace-cut'
import { clipboardService } from './clipboard-service'

beforeEach(() => {
  localStorage.clear()
  clipboardService.clearSelection(); clipboardService.clearLayer(); clipboardService.clearAnimation()
  useWorkspace.setState({ sessions: [], activeId: null })
  vi.stubGlobal('moonSprite', { readClipboardImage: vi.fn().mockResolvedValue(null) })
})
afterEach(() => vi.unstubAllGlobals())
function fixture() {
  const doc = createDocument('cut', 2, 1, 'rgba')
  const layer = getActiveLayer(doc)
  const timeline = ensureAnimationDocument(doc)
  const first = timeline.activeFrameId
  const second = addBlankAnimationFrame(doc)
  animationCelAt(timeline, layer.id, first)!.surface!.pixels.set([255, 0, 0, 255, 0, 255, 0, 255])
  refreshActiveAnimationFrame(doc)
  useWorkspace.getState().addSession(doc)
  return { doc, layer, timeline, first, second, store: useWorkspace.getState() }
}
it('cuts cels, pastes through Ctrl+V command, and restores content with undo', async () => {
  const { doc, layer, timeline, first, second, store } = fixture()
  store.selectAnimationCell(animationCelKey(layer.id, first))
  cutWorkspaceItems('cels')
  expect(animationCelHasContent(animationCelAt(timeline, layer.id, first), doc.palette)).toBe(false)
  store.undo()
  expect(animationCelHasContent(animationCelAt(timeline, layer.id, first), doc.palette)).toBe(true)
  store.redo()
  store.selectAnimationCell(animationCelKey(layer.id, second))
  await store.pasteClipboard()
  expect(animationCelHasContent(animationCelAt(timeline, layer.id, second), doc.palette)).toBe(true)
})
it('cuts only the selected pixels of timeline cels', () => {
  const { layer, timeline, first, store } = fixture()
  store.selectAnimationCell(animationCelKey(layer.id, first))
  store.setSelection({ x: 0, y: 0, width: 1, height: 1 })
  cutWorkspaceItems('cels')
  expect(Array.from(animationCelAt(timeline, layer.id, first)!.surface!.pixels)).toEqual([0, 0, 0, 0, 0, 255, 0, 255])
  store.undo()
  expect(animationCelAt(timeline, layer.id, first)!.surface!.pixels[3]).toBe(255)
})
it('cuts complete frames and can paste and undo them', async () => {
  const { timeline, first, second, store } = fixture()
  store.selectAnimationFrame(first)
  cutWorkspaceItems('frames')
  expect(timeline.frames.map(frame => frame.id)).toEqual([second])
  store.undo()
  expect(timeline.frames).toHaveLength(2)
  store.redo()
  store.selectAnimationFrame(second)
  await store.pasteClipboard()
  expect(timeline.frames).toHaveLength(2)
})
it('cuts mask cells independently and restores them on undo', async () => {
  const { layer, timeline, first, second, store } = fixture()
  animationCelAt(timeline, layer.id, second)!.surface = { format: 'rgba', width: 2, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 0, 0]) }
  refreshActiveAnimationFrame(useWorkspace.getState().sessions[0].document)
  const mask = createLayerMask(layer.id, 2, 1)
  timeline.layerMasks = [{ layerId: layer.id, frameId: first, mask }]
  store.selectAnimationMaskCell(animationCelKey(layer.id, first))
  cutWorkspaceItems('masks')
  expect(animationMaskAt(timeline, layer.id, first)).toBeNull()
  store.undo()
  expect(animationMaskAt(timeline, layer.id, first)).toBeTruthy()
  store.redo()
  store.selectAnimationCell(animationCelKey(layer.id, second))
  await store.pasteClipboard()
  expect(animationMaskAt(timeline, layer.id, second)).toBeTruthy()
})
it('cuts layers with their payload and supports paste and undo', async () => {
  const doc = createDocument('layers', 2, 1, 'rgba')
  const original = getActiveLayer(doc)
  doc.layers.push(createLayer('other', 2, 1, 'rgba'))
  useWorkspace.getState().addSession(doc)
  const store = useWorkspace.getState()
  store.selectLayer(original.id)
  cutWorkspaceItems('layers')
  expect(doc.layers.some(layer => layer.id === original.id)).toBe(false)
  store.undo()
  expect(doc.layers.some(layer => layer.id === original.id)).toBe(true)
  store.redo()
  await store.pasteClipboard()
  expect(doc.layers).toHaveLength(2)
})
it('does not cut locked cels or the last remaining layer', () => {
  const { layer, timeline, first, store } = fixture()
  layer.locked = true
  store.selectAnimationCell(animationCelKey(layer.id, first))
  cutWorkspaceItems('cels')
  expect(animationCelAt(timeline, layer.id, first)!.surface!.pixels[3]).toBe(255)
  layer.locked = false
  store.selectLayer(layer.id)
  cutWorkspaceItems('layers')
  expect(useWorkspace.getState().sessions[0].document.layers).toHaveLength(1)
})

it('cuts a selected group with its child layers as one undoable operation', () => {
  const doc = createDocument('group', 2, 1, 'rgba')
  const child = createLayer('child', 2, 1, 'rgba')
  child.groupId = 'group'
  doc.layers.push(child)
  doc.groups.push({ id: 'group', name: 'group', visible: true, locked: false, opacity: 1, blendMode: 'normal', parentGroupId: null })
  useWorkspace.getState().addSession(doc)
  const store = useWorkspace.getState()
  store.selectGroup('group')
  cutWorkspaceItems('layers')
  expect(doc.groups).toHaveLength(0)
  expect(doc.layers).toHaveLength(1)
  store.undo()
  expect(doc.groups).toHaveLength(1)
  expect(doc.layers.some(layer => layer.id === child.id)).toBe(true)
})
it('cuts all selected free-tile instances only after their copy succeeds', () => {
  const { store } = fixture()
  const session = useWorkspace.getState().sessions[0]
  session.selectedFreeTileInstanceId = 'first'
  session.selectedFreeTileInstanceIds = ['first', 'second']
  const copy = vi.spyOn(store, 'copyFreeTileInstances').mockReturnValue(false)
  const remove = vi.spyOn(store, 'deleteFreeTileInstances').mockReturnValue(true)
  cutWorkspaceItems('free-tiles')
  expect(remove).not.toHaveBeenCalled()
  copy.mockReturnValue(true)
  cutWorkspaceItems('free-tiles')
  expect(remove).toHaveBeenCalledWith(['first', 'second'])
  vi.restoreAllMocks()
})
