import { expect, it } from 'vitest'
import { unzipSync, zipSync } from 'fflate'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor } from './document'
import { activateAnimationFrame, addBlankAnimationFrame, deleteAnimationFrame, ensureAnimationDocument } from './animation'
import { decodeProject, encodeProject, encodeProjectSaveAsync, registerProjectSaveBaseline } from './project-format'

it('preserves each loop first frame across frame switching, incremental saving, reopening and deleting the first frame', async () => {
  const document = createDocument('frame save regression', 4, 4, 'rgba')
  const first = ensureAnimationDocument(document).activeFrameId
  const colors = [{ r: 230, g: 10, b: 20, a: 255 }, { r: 10, g: 230, b: 20, a: 255 }, { r: 10, g: 20, b: 230, a: 255 }]
  writeLayerColor(document, getActiveLayer(document), 0, colors[0])
  const second = addBlankAnimationFrame(document)
  writeLayerColor(document, getActiveLayer(document), 0, colors[1])
  const love = addBlankAnimationFrame(document)
  writeLayerColor(document, getActiveLayer(document), 0, colors[2])
  document.animation!.loopSections = [
    { id: 'love', name: 'love', startFrameId: love, endFrameId: love, direction: 'forward', repeatCount: null },
    { id: 'taunt', name: 'taunt', startFrameId: first, endFrameId: second, direction: 'forward', repeatCount: null }
  ]
  let archive = encodeProject(document)
  for (const removeFirst of [false, true]) {
    const restored = decodeProject(archive)
    expect(registerProjectSaveBaseline(restored, 'frame-save.moonsprite', archive)).toBe(true)
    if (removeFirst) deleteAnimationFrame(restored, first)
    activateAnimationFrame(restored, removeFirst ? second : first)
    const save = await encodeProjectSaveAsync(restored)
    const files = unzipSync(archive)
    const patch = unzipSync(save.data)
    for (const entry of save.reusableEntries) expect(patch[entry.path]).toBeUndefined()
    archive = zipSync({ ...files, ...patch })
    const reopened = decodeProject(archive)
    for (const [index, frame] of [first, second, love].entries()) {
      if (removeFirst && frame === first) continue
      activateAnimationFrame(reopened, frame)
      expect(readLayerColorAt(reopened, getActiveLayer(reopened), 0, 0)).toEqual(colors[index])
    }
    // Save from the other loop before deleting the original first frame.
    archive = encodeProject(reopened)
  }
})
