import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, writeLayerColor, readLayerColorAt } from './document'
import { encodeProjectSaveAsync, acceptProjectSaveBaseline } from './project-format'
import * as previewModule from './project-format-manifest'
import { decodePng } from './png'
import { unzipSync } from 'fflate'

afterEach(() => vi.restoreAllMocks())

it('reuses the saved preview for a name change and regenerates it for changed pixels and visibility', async () => {
  const generate = vi.spyOn(previewModule, 'encodeProjectPreview')
  const document = createDocument('preview cache', 4, 4, 'rgba')
  const layer = document.layers[0]
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  const first = await encodeProjectSaveAsync(document)
  acceptProjectSaveBaseline(document, 'D:/preview-cache.moonsprite', first)
  document.name = 'renamed'
  document.updatedAt = '2026-09-15T12:00:00.000Z'
  const renamed = await encodeProjectSaveAsync(document)
  expect(generate).toHaveBeenCalledTimes(1)
  expect(unzipSync(renamed.data)['preview.png']).toEqual(unzipSync(first.data)['preview.png'])
  acceptProjectSaveBaseline(document, 'D:/preview-cache.moonsprite', renamed)

  writeLayerColor(document, layer, 0, { r: 0, g: 255, b: 0, a: 255 })
  const painted = await encodeProjectSaveAsync(document)
  expect(generate).toHaveBeenCalledTimes(2)
  const green = decodePng(unzipSync(painted.data)['preview.png'])
  expect(readLayerColorAt(green, green.layers[0], 0, 0)).toEqual({ r: 0, g: 255, b: 0, a: 255 })
  acceptProjectSaveBaseline(document, 'D:/preview-cache.moonsprite', painted)
  layer.visible = false
  const hidden = await encodeProjectSaveAsync(document)
  expect(generate).toHaveBeenCalledTimes(3)
  const transparent = decodePng(unzipSync(hidden.data)['preview.png'])
  expect(readLayerColorAt(transparent, transparent.layers[0], 0, 0).a).toBe(0)
})

it('does not adopt a preview from a failed/unaccepted save', async () => {
  const document = createDocument('preview failure', 2, 2, 'rgba')
  const initial = await encodeProjectSaveAsync(document)
  acceptProjectSaveBaseline(document, 'D:/preview-failure.moonsprite', initial)
  document.layers[0].visible = false
  await encodeProjectSaveAsync(document) // Simulate a failed disk write: no acceptance.
  document.layers[0].visible = true
  document.name = 'metadata only'
  const generate = vi.spyOn(previewModule, 'encodeProjectPreview')
  const retried = await encodeProjectSaveAsync(document)
  expect(generate).not.toHaveBeenCalled()
  expect(unzipSync(retried.data)['preview.png']).toEqual(unzipSync(initial.data)['preview.png'])
})
