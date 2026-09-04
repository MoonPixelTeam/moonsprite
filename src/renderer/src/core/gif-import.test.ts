import { describe, expect, it } from 'vitest'
import { addBlankAnimationFrame, animationCelAt, setAnimationFrameDuration } from './animation'
import { decodeDocumentFileAsync, directSourceImageSaveTarget } from './document-files'
import { createDocument, writeLayerColor } from './document'
import { exportAnimationGif } from './gif'
import { compositeGifFrames } from './gif-import'

const rgba = (...pixels: Array<[number, number, number, number]>): Uint8ClampedArray => new Uint8ClampedArray(pixels.flat())

describe('GIF animation import', () => {
  it('composites transparent patches and restore-background disposal into full canvas frames', () => {
    const frames = compositeGifFrames(3, 1, [
      {
        dims: { left: 0, top: 0, width: 3, height: 1 },
        patch: rgba([255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255]),
        delay: 40,
        disposalType: 1
      },
      {
        dims: { left: 1, top: 0, width: 1, height: 1 },
        patch: rgba([0, 255, 0, 255]),
        delay: 80,
        disposalType: 2
      },
      {
        dims: { left: 1, top: 0, width: 2, height: 1 },
        patch: rgba([0, 0, 0, 0], [0, 0, 255, 255]),
        delay: 120,
        disposalType: 1
      }
    ])

    expect(frames.map((frame) => frame.duration)).toEqual([40, 80, 120])
    expect(frames[0].pixels).toEqual(rgba([255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255]))
    expect(frames[1].pixels).toEqual(rgba([255, 0, 0, 255], [0, 255, 0, 255], [255, 0, 0, 255]))
    expect(frames[2].pixels).toEqual(rgba([255, 0, 0, 255], [0, 0, 0, 0], [0, 0, 255, 255]))
  })

  it('restores the previous composed canvas for disposal type 3', () => {
    const frames = compositeGifFrames(3, 1, [
      {
        dims: { left: 0, top: 0, width: 3, height: 1 },
        patch: rgba([255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255]),
        disposalType: 1
      },
      {
        dims: { left: 1, top: 0, width: 1, height: 1 },
        patch: rgba([0, 255, 0, 255]),
        disposalType: 3
      },
      {
        dims: { left: 2, top: 0, width: 1, height: 1 },
        patch: rgba([0, 0, 255, 255]),
        disposalType: 1
      }
    ])

    expect(frames[1].pixels).toEqual(rgba([255, 0, 0, 255], [0, 255, 0, 255], [255, 0, 0, 255]))
    expect(frames[2].pixels).toEqual(rgba([255, 0, 0, 255], [255, 0, 0, 255], [0, 0, 255, 255]))
  })

  it('opens every encoded GIF frame as an ordered cel with its duration', async () => {
    const source = createDocument('walk', 1, 1, 'rgba')
    const layer = source.layers[0]
    const firstFrameId = source.animation!.activeFrameId
    writeLayerColor(source, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    setAnimationFrameDuration(source, firstFrameId, 40)
    const secondFrameId = addBlankAnimationFrame(source)
    writeLayerColor(source, layer, 0, { r: 0, g: 0, b: 255, a: 255 })
    setAnimationFrameDuration(source, secondFrameId, 230)
    const encoded = exportAnimationGif(source, { scalePercent: 100, direction: 'forward' }).bytes

    const imported = await decodeDocumentFileAsync(encoded, 'D:\\imports\\walk.gif')
    const timeline = imported.animation!
    const importedLayer = imported.layers[0]
    const firstCel = animationCelAt(timeline, importedLayer.id, timeline.frames[0].id)!
    const secondCel = animationCelAt(timeline, importedLayer.id, timeline.frames[1].id)!

    expect(imported).toMatchObject({ name: 'walk.gif', width: 1, height: 1, sourceFilePath: 'D:\\imports\\walk.gif', filePath: null })
    expect(timeline.frames.map((frame) => frame.duration)).toEqual([40, 230])
    expect(timeline.cels).toHaveLength(2)
    expect(timeline.loop).toBe(true)
    expect(firstCel.surface?.pixels).toEqual(rgba([255, 0, 0, 255]))
    expect(secondCel.surface?.pixels).toEqual(rgba([0, 0, 255, 255]))
    expect(importedLayer.pixels).toBe(firstCel.surface?.pixels)
    expect(directSourceImageSaveTarget(imported)).toBeNull()
  })


})
