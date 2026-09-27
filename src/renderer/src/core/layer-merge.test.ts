import { buildLayerPanelTree } from './layer-panel-layout'
import { describe, expect, it } from 'vitest'
import { compositeDocument, createDocument, createLayer, getActiveLayer, writeLayerColor } from './document'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelAt, cloneDocumentForAnimationFrame, ensureAnimationDocument, linkAnimationFrameCels, syncActiveAnimationFrame } from './animation'
import { mergeLayerDown, mergeLayerGroup, mergeRasterLayers, mergeVisibleLayers } from './layer-merge'

const red = { r: 255, g: 0, b: 0, a: 180 }
const blue = { r: 0, g: 80, b: 255, a: 255 }
const green = { r: 0, g: 220, b: 80, a: 160 }

describe('layer merging', () => {
  describe.each(['down', 'selected', 'group', 'visible'] as const)('%s merge', (operation) => {
  it.each(['rgba', 'indexed', 'grayscale'] as const)('preserves all four frames in %s documents', (colorMode) => {
    const document = createDocument('four frames', 2, 1, colorMode)
    const bottom = getActiveLayer(document)
    const top = createLayer('Top', 2, 1, colorMode)
    document.layers.push(top)
    if (operation === 'group') {
      document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
      bottom.groupId = top.groupId = 'group'
    }
    const timeline = ensureAnimationDocument(document)
    for (let index = 0; index < 4; index += 1) {
      if (index > 0) addBlankAnimationFrame(document)
      writeLayerColor(document, bottom, 0, { r: 40 + index * 50, g: 0, b: 0, a: 255 })
      writeLayerColor(document, top, 0, { r: 0, g: 50 + index * 50, b: 0, a: 255 })
      top.offsetX = 1
      timeline.frames[index].duration = 80 + index * 30
    }
    timeline.frames[2].disabled = true
    activateAnimationFrame(document, timeline.frames[1].id)
    const frames = timeline.frames.map((frame) => ({ ...frame }))
    const activeFrameId = timeline.activeFrameId
    const before = frames.map((frame) => compositeDocument(cloneDocumentForAnimationFrame(document, frame.id)))

    const result = operation === 'down' ? mergeLayerDown(document, top.id)
      : operation === 'selected' ? mergeRasterLayers(document, [bottom.id, top.id])
        : operation === 'group' ? mergeLayerGroup(document, 'group') : mergeVisibleLayers(document)

    expect(result.ok).toBe(true)
    expect(timeline.frames).toEqual(frames)
    expect(timeline.activeFrameId).toBe(activeFrameId)
    expect(document.layers).toHaveLength(1)
    expect(timeline.cels).toHaveLength(4)
    const merged = getActiveLayer(document)
    expect(new Set(timeline.cels.map((cel) => cel.surface?.pixels)).size).toBe(4)
    for (const [index, frame] of frames.entries()) {
      activateAnimationFrame(document, frame.id)
      expect(compositeDocument(document)).toEqual(before[index])
      expect(animationCelAt(timeline, merged.id, frame.id)?.surface).toBeDefined()
    }
  })

  })

  it.each(['down', 'selected', 'group', 'visible'] as const)('%s resolves linked source cels and retains empty frames without copying the active result', (operation) => {
    const document = createDocument('linked and blank frames', 1, 1, 'rgba')
    const bottom = getActiveLayer(document)
    writeLayerColor(document, bottom, 0, blue)
    const top = createLayer('Top', 1, 1, 'rgba')
    writeLayerColor(document, top, 0, red)
    document.layers.push(top)
    if (operation === 'group') {
      document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
      bottom.groupId = top.groupId = 'group'
    }
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    const blankFrameId = addBlankAnimationFrame(document)
    linkAnimationFrameCels(document, firstFrameId, secondFrameId, [bottom.id, top.id])
    activateAnimationFrame(document, firstFrameId)
    top.opacity = 0.5
    syncActiveAnimationFrame(document)
    const before = compositeDocument(document)

    const result = operation === 'down' ? mergeLayerDown(document, top.id)
      : operation === 'selected' ? mergeRasterLayers(document, [bottom.id, top.id])
        : operation === 'group' ? mergeLayerGroup(document, 'group') : mergeVisibleLayers(document)
    expect(result.ok).toBe(true)

    activateAnimationFrame(document, secondFrameId)
    expect(compositeDocument(document)).toEqual(before)
    activateAnimationFrame(document, blankFrameId)
    expect(compositeDocument(document)).toEqual(new Uint8ClampedArray(4))
    expect(timeline.cels.every((cel) => !cel.linkedCelId)).toBe(true)
  })

  it('merges contiguous raster layers without changing their normal-mode result', () => {
    const document = createDocument('layers', 1, 1, 'rgba')
    const bottom = getActiveLayer(document)
    bottom.name = 'Bottom'
    writeLayerColor(document, bottom, 0, blue)
    const top = createLayer('Top', 1, 1, 'rgba')
    writeLayerColor(document, top, 0, red)
    document.layers.push(top)
    const before = compositeDocument(document)

    const result = mergeRasterLayers(document, [bottom.id, top.id])

    expect(result.ok).toBe(true)
    expect(document.layers).toHaveLength(1)
    expect(document.layers[0].name).toBe('Top 合并')
    expect(Array.from(compositeDocument(document))).toEqual(Array.from(before))
  })

  it('flattens a nested group while preserving the outer group properties and visual result', () => {
    const document = createDocument('group', 1, 1, 'rgba')
    const background = getActiveLayer(document)
    writeLayerColor(document, background, 0, blue)
    const first = createLayer('First', 1, 1, 'rgba')
    first.groupId = 'parent'
    writeLayerColor(document, first, 0, red)
    const second = createLayer('Second', 1, 1, 'rgba')
    second.groupId = 'child'
    writeLayerColor(document, second, 0, green)
    document.layers.push(first, second)
    document.groups.push(
      { id: 'parent', name: 'Effects', parentGroupId: null, visible: true, locked: false, opacity: 0.65, blendMode: 'screen' },
      { id: 'child', name: 'Child', parentGroupId: 'parent', visible: true, locked: false, opacity: 0.7, blendMode: 'normal' }
    )
    const before = compositeDocument(document)

    const result = mergeLayerGroup(document, 'parent')

    expect(result.ok).toBe(true)
    expect(document.groups).toHaveLength(0)
    expect(document.layers).toHaveLength(2)
    const merged = document.layers[1]
    expect(merged).toMatchObject({ name: 'Effects', opacity: 0.65, blendMode: 'screen', visible: true })
    expect(Array.from(compositeDocument(document))).toEqual(Array.from(before))
  })





  it('bakes selected blend modes into the merged layer', () => {
    const document = createDocument('blend mode', 1, 1, 'rgba')
    const bottom = getActiveLayer(document)
    writeLayerColor(document, bottom, 0, blue)
    const top = createLayer('Multiply', 1, 1, 'rgba')
    writeLayerColor(document, top, 0, red)
    top.blendMode = 'multiply'
    document.layers.push(top)
    const before = compositeDocument(document)

    const result = mergeRasterLayers(document, [bottom.id, top.id])

    expect(result.ok).toBe(true)
    expect(document.layers).toHaveLength(1)
    expect(Array.from(compositeDocument(document))).toEqual(Array.from(before))
  })
})


it.each(['group', 'visible'] as const)('%s preserves nested groups, frame masks and untouched hidden content', operation => {
  const document = createDocument('masked groups', 2, 1, 'rgba')
  const hidden = getActiveLayer(document)
  hidden.visible = false
  const bottom = createLayer('Bottom', 2, 1, 'rgba')
  const top = createLayer('Top', 2, 1, 'rgba')
  bottom.groupId = 'outer'
  top.groupId = 'inner'
  document.layers.push(bottom, top)
  document.groups.push(
    { id: 'outer', name: 'Outer', visible: true, locked: false, opacity: 0.65, blendMode: 'normal' },
    { id: 'inner', name: 'Inner', parentGroupId: 'outer', visible: true, locked: false, opacity: 0.7, blendMode: 'normal' }
  )
  const timeline = ensureAnimationDocument(document)
  for (let index = 0; index < 4; index++) {
    if (index) addBlankAnimationFrame(document)
    writeLayerColor(document, hidden, 0, { r: index * 60, g: 100, b: 0, a: 255 })
    writeLayerColor(document, bottom, 0, blue)
    writeLayerColor(document, top, 0, red)
    writeLayerColor(document, top, 1, green)
    const mask = createLayer('mask', 2, 1, 'rgba')
    if (mask.format !== 'rgba') throw new Error('Expected RGBA mask')
    mask.pixels.set([255, 255, 255, index * 70, 255, 255, 255, 255])
    timeline.groupMasks!.push({ groupId: 'outer', frameId: timeline.activeFrameId,
      mask: { ...mask, ownerKind: 'group', ownerId: 'outer' } })
  }
  activateAnimationFrame(document, timeline.frames[1].id)
  syncActiveAnimationFrame(document)
  const frames = structuredClone(timeline.frames)
  const before = frames.map(frame => compositeDocument(cloneDocumentForAnimationFrame(document, frame.id)))
  const hiddenCels = timeline.cels.filter(cel => cel.layerId === hidden.id)
  const result = operation === 'group' ? mergeLayerGroup(document, 'outer') : mergeVisibleLayers(document)
  expect(result.ok).toBe(true)
  expect(document.layers).toHaveLength(2)
  expect(timeline.cels.filter(cel => cel.layerId === hidden.id)).toEqual(hiddenCels)
  expect(timeline.groupMasks).toHaveLength(0)
  for (const [index, frame] of frames.entries()) {
    activateAnimationFrame(document, frame.id)
    expect(compositeDocument(document)).toEqual(before[index])
  }
})

it.each(['upper', 'middle', 'lower'])('keeps merged nested %s group at its exact visual row among anchored and empty siblings', target => {
  const document = createDocument('nested order', 1, 1, 'rgba')
  const initial = getActiveLayer(document); initial.groupId = 'lower'
  const middle = createLayer('middle', 1, 1, 'rgba'); middle.groupId = 'deep'
  const upper = createLayer('upper', 1, 1, 'rgba'); upper.groupId = 'upper'
  // Intentionally disagree with panel order, as happens after mixed row moves.
  document.layers = [upper, initial, middle]
  document.groups = [
    { id: 'parent', name: 'parent', visible: true, locked: false, opacity: 1, blendMode: 'normal' },
    ...['upper', 'empty', 'middle', 'lower'].map((id, i) => ({ id, name: id, parentGroupId: 'parent', panelOrder: 4 - i, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const })),
    { id: 'deep', name: 'deep', parentGroupId: 'middle', visible: true, locked: false, opacity: 1, blendMode: 'normal' }
  ]
  writeLayerColor(document, initial, 0, red); writeLayerColor(document, middle, 0, blue); writeLayerColor(document, upper, 0, green)
  const pixels = compositeDocument(document)
  const rows = buildLayerPanelTree(document).filter(row => row.depth === 1)
  const result = mergeLayerGroup(document, target)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(buildLayerPanelTree(document).filter(row => row.depth === 1)).toEqual(rows.map(row => row.id === target ? { ...row, kind: 'layer', id: result.layerId } : row))
  expect(getActiveLayer(document).groupId).toBe('parent')
  expect(compositeDocument(document)).toEqual(pixels)
})
