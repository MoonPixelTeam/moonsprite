import { beforeEach, describe, expect, it } from 'vitest'
import type { LayerStyles, SpriteDocument } from '@shared/types'
import { cloneDocumentForAnimationFrame, ensureAnimationDocument, syncActiveAnimationFrame } from '@/core/animation'
import { compositeRegion, createDocument, createLayer, createLayerMask, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { decodeProject, encodeProject } from '@/core/project-format'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, layerStyleClipboard: null, message: null, dialog: null })
})

const render = (document: SpriteDocument): Uint8ClampedArray => compositeRegion(document, -3, -3, 14, 14)
const expectSameImage = (actual: Uint8ClampedArray, expected: Uint8ClampedArray, tolerance = 1): void => {
  expect(actual.length).toBe(expected.length)
  let maximum = 0
  for (let i = 0; i < actual.length; i += 1) maximum = Math.max(maximum, Math.abs(actual[i] - expected[i]))
  expect(maximum).toBeLessThanOrEqual(tolerance)
}
const setup = (configure: (styles: LayerStyles) => void, mode: 'rgba' | 'indexed' | 'grayscale' = 'rgba') => {
  const document = createDocument('split styles', 8, 8, mode)
  const source = getActiveLayer(document)
  source.name = '角色'
  for (let y = 2; y < 6; y += 1) for (let x = 2; x < 6; x += 1) writeLayerColor(document, source, y * source.width + x, { r: 80, g: 150, b: 220, a: 128 })
  const styles = createDefaultLayerStyles()
  configure(styles)
  source.layerStyles = styles
  useWorkspace.getState().addSession(document)
  return { document, source, styles }
}

describe('split layer styles into editable pixels', () => {
  it.each(['shadow', 'outerStroke', 'innerStroke', 'innerGlow', 'colorOverlay', 'gradientOverlay'] as const)('extracts only %s and preserves the composite', (part) => {
    const { document, source } = setup((styles) => {
      if (part === 'outerStroke' || part === 'innerStroke') { styles.stroke.enabled = true; styles.stroke.position = part === 'innerStroke' ? 'inside' : 'outside' }
      else styles[part].enabled = true
      styles.innerGlow.color = { r: 255, g: 0, b: 0, a: 255 }
      styles.colorOverlay.color = { r: 255, g: 0, b: 0, a: 255 }
    })
    const pixels = source.pixels.slice()
    const before = render(document)
    useWorkspace.getState().splitLayerStyles(source.id)
    const effect = document.layers.find((layer) => layer.id !== source.id)!
    expect(document.layers).toHaveLength(2)
    expect(effect.kind).toBeUndefined()
    expect(effect.layerStyles).toBeUndefined()
    expect(source.layerStyles).toBeUndefined()
    expect(source.pixels).toEqual(pixels)
    expectSameImage(render(document), before)
    if (part === 'innerGlow' || part === 'innerStroke') expect(readLayerColorAt(document, effect, 3, 3).a).toBeLessThan(255)
    if (part === 'colorOverlay') expect(readLayerColorAt(document, effect, 2, 2)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(readLayerColorAt(document, effect, -3, -3).a).toBe(0)
    if (part === 'outerStroke') expect(readLayerColorAt(document, effect, effect.offsetX, effect.offsetY).a).toBe(0)
    // It is an ordinary writable pixel layer, not a live effect or copied base.
    writeLayerColor(document, effect, 0, { r: 12, g: 34, b: 56, a: 255 })
    expect(readLayerColorAt(document, effect, effect.offsetX, effect.offsetY)).toEqual({ r: 12, g: 34, b: 56, a: 255 })
  })

  it('names and orders all effects, including both stroke sides, and restores everything in one undo/redo', () => {
    const { document, source, styles } = setup((s) => {
      s.shadow.enabled = s.stroke.enabled = s.colorOverlay.enabled = s.gradientOverlay.enabled = s.innerGlow.enabled = true
      s.stroke.position = 'both'
      s.stroke.smartHue = true
      s.innerGlow.size = 2
    })
    source.opacity = 0.6
    source.blendMode = 'multiply'
    const background = createLayer('背景', 8, 8, 'rgba')
    for (let i = 0; i < 64; i += 1) writeLayerColor(document, background, i, { r: 200, g: 100, b: 80, a: 255 })
    document.layers.unshift(background)
    syncActiveAnimationFrame(document)
    const before = render(document)
    const beforeLayerIds = document.layers.map((layer) => layer.id)
    useWorkspace.getState().splitLayerStyles(source.id)
    expect(document.layers.map((layer) => layer.name)).toEqual(['背景', '角色-投影', '角色-外描边', '角色', '角色-颜色叠加', '角色-渐变叠加', '角色-内发光', '角色-内描边'])
    expect(document.groups[0]).toMatchObject({ opacity: 0.6, blendMode: 'multiply' })
    expectSameImage(render(document), before, 2)
    const after = render(document)
    useWorkspace.getState().undo()
    expect(document.layers.map((layer) => layer.id)).toEqual(beforeLayerIds)
    expect(document.groups).toHaveLength(0)
    expect(source.layerStyles).toEqual(styles)
    expect(source.opacity).toBe(0.6)
    expect(source.blendMode).toBe('multiply')
    expectSameImage(render(document), before, 0)
    expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)
    useWorkspace.getState().redo()
    expectSameImage(render(document), after, 0)
    const restored = decodeProject(encodeProject(document))
    expect(restored.layers.map((layer) => layer.name)).toEqual(document.layers.map((layer) => layer.name))
    expectSameImage(render(restored), after, 0)
  })

  it('splits every animation frame, including linked cels with masks and an empty frame', () => {
    const { document, source } = setup((s) => { s.shadow.enabled = s.innerGlow.enabled = true })
    syncActiveAnimationFrame(document)
    const timeline = ensureAnimationDocument(document)
    const first = timeline.cels.find((cel) => cel.layerId === source.id)!
    timeline.frames.push({ id: 'second', duration: 100 }, { id: 'linked', duration: 100 }, { id: 'empty', duration: 100 })
    const secondPixels = new Uint8ClampedArray(8 * 8 * 4)
    secondPixels.set([0, 200, 100, 255], (6 * 8 + 6) * 4)
    timeline.cels.push({ id: 'second-cel', layerId: source.id, frameId: 'second', opacity: 0.4, surface: { format: 'rgba', width: 8, height: 8, offsetX: 0, offsetY: 0, pixels: secondPixels } }, { id: 'linked-cel', layerId: source.id, frameId: 'linked', linkedCelId: first.id, opacity: 0.7 })
    const mask = createLayerMask(first.id, 8, 8)
    mask.pixels.set([0, 0, 0, 255], (2 * 8 + 2) * 4)
    timeline.layerMasks = [{ layerId: source.id, frameId: first.frameId, mask }]
    const before = timeline.frames.map((frame) => render(cloneDocumentForAnimationFrame(document, frame.id)))
    useWorkspace.getState().splitLayerStyles(source.id)
    for (const [index, frame] of timeline.frames.entries()) {
      expectSameImage(render(cloneDocumentForAnimationFrame(document, frame.id)), before[index], 2)
      for (const effect of document.layers.filter((layer) => layer.id !== source.id)) {
        const cel = document.animation!.cels.find((item) => item.layerId === effect.id && item.frameId === frame.id)!
        expect(cel.surface).toBeTruthy()
        expect(cel.linkedCelId).toBeFalsy()
      }
    }
    expect(document.animation!.layerMasks).toHaveLength(1)
    expect(document.animation!.cels.find((cel) => cel.id === 'linked-cel')?.linkedCelId).toBe(first.id)
    useWorkspace.getState().undo()
    expect(document.animation!.groupMasks).toHaveLength(0)
    expect(document.animation!.cels.find((cel) => cel.id === 'second-cel')?.opacity).toBe(0.4)
    useWorkspace.getState().redo()
    document.animation!.frames.forEach((frame, index) => expectSameImage(render(cloneDocumentForAnimationFrame(document, frame.id)), before[index], 2))
  })

  it.each(['indexed', 'grayscale'] as const)('keeps %s color/storage rules', (mode) => {
    const { document, source } = setup((s) => { s.stroke.enabled = s.colorOverlay.enabled = true }, mode)
    const before = render(document)
    useWorkspace.getState().splitLayerStyles(source.id)
    expect(document.layers.every((layer) => layer.format === source.format)).toBe(true)
    expectSameImage(render(document), before)
    const after = render(document)
    useWorkspace.getState().undo()
    expectSameImage(render(document), before, 0)
    useWorkspace.getState().redo()
    expectSameImage(render(document), after, 0)
  })

  it('does not create history for locked, disabled, or missing styles', () => {
    const { document, source } = setup((s) => { s.innerGlow.enabled = true })
    source.locked = true
    useWorkspace.getState().splitLayerStyles(source.id)
    source.locked = false
    source.layerStyles!.enabled = false
    useWorkspace.getState().splitLayerStyles(source.id)
    delete source.layerStyles
    useWorkspace.getState().splitLayerStyles(source.id)
    expect(document.layers).toHaveLength(1)
    expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)
  })
})
