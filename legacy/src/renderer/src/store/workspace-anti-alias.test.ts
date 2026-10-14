/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { decodeAseprite, encodeAseprite } from '@/core/aseprite'
import { animationLayerAtFrame, syncActiveAnimationFrame } from '@/core/animation'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { packColor } from '@/core/raster'
import { antiAliasSelection } from '@/core/tools-outline'
import type { SpriteDocument } from '@shared/types-document'
import { useWorkspace } from './workspace'

const croppedAseprite = (): Uint8Array => {
  const document = createDocument('cropped cel', 161, 122, 'rgba')
  const layer = getActiveLayer(document)
  Object.assign(layer, { width: 153, height: 115, offsetX: 9, offsetY: 10, pixels: new Uint8ClampedArray(153 * 115 * 4) })
  for (const [x, y] of [[0, 1], [1, 0], [2, 2], [152, 114]]) {
    writeLayerColor(document, layer, y * layer.width + x, { r: 210, g: 65, b: 90, a: 255 })
  }
  syncActiveAnimationFrame(document)
  return encodeAseprite(document)
}

// Include off-canvas pixels: the reported file's cel extends past the canvas.
const pixels = (document: SpriteDocument, frameId?: string): number[] => {
  const layer = frameId ? animationLayerAtFrame(document, document.activeLayerId, frameId)! : getActiveLayer(document)
  return Array.from({ length: 170 * 130 }, (_, index) => packColor(readLayerColorAt(document, layer, index % 170, Math.floor(index / 170))))
}

const expectPixels = (actual: number[], expected: number[]): void => {
  expect(actual.filter((value, index) => value !== expected[index]).length, 'changed pixel count').toBe(0)
}

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

const cases: Array<[string, () => Uint8Array]> = [['generated cropped Aseprite', croppedAseprite]]
if (process.env.MOONSPRITE_ASEPRITE_REGRESSION_FILE) {
  cases.push(['reported Aseprite file', () => new Uint8Array(readFileSync(process.env.MOONSPRITE_ASEPRITE_REGRESSION_FILE!))])
}

describe.each(cases)('anti-alias: %s', (_name, source) => {
  it('previews at the correct coordinates, replaces the preview, and cancels without pixel damage', () => {
    const bytes = source()
    const document = decodeAseprite(bytes)
    const original = pixels(document)
    useWorkspace.getState().addSession(document)
    let preview = useWorkspace.getState().previewAntiAliasSelection(null, 50)
    expect(preview).not.toBeNull()
    const expected = decodeAseprite(bytes)
    antiAliasSelection(expected, getActiveLayer(expected), null, null, 50)
    expectPixels(pixels(document), pixels(expected))
    preview = useWorkspace.getState().previewAntiAliasSelection(null, 75, false, 'automatic', preview)
    const replaced = decodeAseprite(bytes)
    antiAliasSelection(replaced, getActiveLayer(replaced), null, null, 75)
    expectPixels(pixels(document), pixels(replaced))
    useWorkspace.getState().restoreAntiAliasPreview(preview)
    expectPixels(pixels(document), original)
    expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)
  })

  it('applies after preview and restores every original pixel on undo', () => {
    const document = decodeAseprite(source())
    const original = pixels(document)
    useWorkspace.getState().addSession(document)
    const preview = useWorkspace.getState().previewAntiAliasSelection(null)
    useWorkspace.getState().restoreAntiAliasPreview(preview)
    expect(useWorkspace.getState().antiAliasSelection(null)).toBe(true)
    const applied = pixels(document)
    expect(applied.some((value, index) => value !== original[index])).toBe(true)
    useWorkspace.getState().undo()
    expectPixels(pixels(document), original)
    useWorkspace.getState().redo()
    expectPixels(pixels(document), applied)
  })

  it('applies and undoes across cropped active and inactive cels', () => {
    const document = decodeAseprite(source())
    useWorkspace.getState().addSession(document)
    const firstFrame = document.animation!.activeFrameId
    useWorkspace.getState().duplicateAnimationFrame()
    const secondFrame = document.animation!.activeFrameId
    useWorkspace.getState().selectAnimationFrame(firstFrame)
    useWorkspace.getState().selectAnimationFrame(secondFrame, 'toggle')
    const originals = [pixels(document, firstFrame), pixels(document, secondFrame)]
    expect(useWorkspace.getState().antiAliasSelection(null)).toBe(true)
    const applied = [pixels(document, firstFrame), pixels(document, secondFrame)]
    expect(applied.every((frame, index) => frame.some((value, offset) => value !== originals[index][offset]))).toBe(true)
    useWorkspace.getState().undo()
    expectPixels(pixels(document, firstFrame), originals[0])
    expectPixels(pixels(document, secondFrame), originals[1])
    useWorkspace.getState().redo()
    expectPixels(pixels(document, firstFrame), applied[0])
    expectPixels(pixels(document, secondFrame), applied[1])
  })
})
