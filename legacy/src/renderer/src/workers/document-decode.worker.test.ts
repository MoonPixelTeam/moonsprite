import { describe, expect, it } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from '@/core/document'
import { addBlankAnimationFrame, animationCelKey, ensureAnimationDocument, setAnimationCelOffsetsForKeys } from '@/core/animation'
import { compositeDocument } from '@/core/document-composite'
import { paintBrush } from '@/core/tools'
import { beginPixelEdit } from '@/core/history'
import { cachedRasterContentBounds, invalidateRasterContentBounds, rasterContentBounds } from '@/core/document-model'
import { restoreDecodedRasterBounds } from '@/core/document-decode-metadata'
import { rehydrateRuntimeRasterDocument } from '@/core/runtime-raster'
import { decodeProject, encodeProject } from '@/core/project-format'
import { processDocumentDecodeRequest, type DecodeWorkerResponse } from './document-decode.worker'

describe('document opening first frame', () => {
  it('prepares the complete active frame after transferring the document, including cel placement and opacity', () => {
    const document = createDocument('active frame', 8, 8, 'rgba')
    document.layers.push(createLayer('upper', 8, 8, 'rgba'))
    ensureAnimationDocument(document)
    writeLayerColor(document, document.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
    addBlankAnimationFrame(document)
    paintBrush(document, document.layers[0], beginPixelEdit(document.layers[0].id), 1, 1, 1, { r: 0, g: 96, b: 255, a: 255 }, 'round')
    paintBrush(document, document.layers[1], beginPixelEdit(document.layers[1].id), 1, 1, 1, { r: 255, g: 255, b: 0, a: 255 }, 'round')
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels.find((item) => item.layerId === document.layers[1].id && item.frameId === timeline.activeFrameId)!
    cel.opacity = 0.5
    setAnimationCelOffsetsForKeys(document, { [animationCelKey(document.layers[1].id, timeline.activeFrameId)]: { x: 2, y: 1 } })
    const bytes = encodeProject(document, { includePreview: false })
    const expected = compositeDocument(decodeProject(bytes))
    expect(expected.some((value) => value !== 0)).toBe(true)
    const responses: DecodeWorkerResponse[] = []
    let complete: (() => void) | undefined
    processDocumentDecodeRequest({ id: 1, data: bytes, filePath: 'large.moonsprite', locale: 'zh-CN', reportProgress: true },
      (response, transfer) => { responses.push(structuredClone(response, { transfer })) },
      (work) => { complete = work })
    expect(responses.find((response) => response.document)?.initialCompositePending).toBe(true)
    const decoded = responses.find((response) => response.document)!
    rehydrateRuntimeRasterDocument(decoded.document!)
    restoreDecodedRasterBounds(decoded.document!, decoded.rasterBounds!)
    const layer = decoded.document!.layers[1]
    const cachedBounds = cachedRasterContentBounds(layer, decoded.document!.palette)
    expect(cachedBounds).not.toBeUndefined()
    invalidateRasterContentBounds(layer)
    expect(rasterContentBounds(layer, decoded.document!.palette)).toEqual(cachedBounds)
    expect(responses.filter((response) => response.progress !== undefined).every((response) => response.progress! < 1)).toBe(true)
    expect(responses.some((response) => response.completed)).toBe(false)
    complete!()
    expect(Array.from(responses.at(-1)!.initialComposite!)).toEqual(Array.from(expected))
    expect(responses.at(-1)?.completed).toBe(true)
  })
})
