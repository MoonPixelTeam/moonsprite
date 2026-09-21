import { beforeEach, expect, it } from 'vitest'
import { protectExportPixels } from './export-protection'
import { createDocument, writeLayerColor } from './document'
import { exportDocumentImage } from './png'
import { DEFAULT_EDITOR_PREFERENCES, EXPORT_PROTECTION_KEY, loadEditorPreferences, saveEditorPreferences } from './file-preferences'

beforeEach(() => localStorage.clear())
it('defaults off, persists valid modes, and rejects invalid stored modes', () => {
  expect(loadEditorPreferences().exportProtection).toBe('off')
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, exportProtection: 'blur-noise' })
  expect(loadEditorPreferences().exportProtection).toBe('blur-noise')
  localStorage.setItem(EXPORT_PROTECTION_KEY, 'invalid')
  expect(loadEditorPreferences().exportProtection).toBe('off')
})
it('leaves original-size, downscaled, and disabled exports untouched', () => {
  const image = { pixels: new Uint8ClampedArray([255, 0, 0, 255]), width: 1, height: 1 }
  expect(protectExportPixels(image, 800)).toBe(image)
  expect(protectExportPixels(image, 100, 'blur')).toBe(image)
  expect(protectExportPixels(image, 50, 'blur-noise')).toBe(image)
})
it('softens enlarged edges without dark transparent fringes or source mutations', () => {
  const image = { pixels: new Uint8ClampedArray(8 * 4), width: 8, height: 1 }
  for (let x = 0; x < 4; x++) image.pixels.set([255, 0, 0, 255], x * 4)
  const original = image.pixels.slice()
  const output = protectExportPixels(image, 400, 'blur')
  expect(image.pixels).toEqual(original)
  expect(output.pixels[3 * 4 + 3]).toBeLessThan(255)
  expect(output.pixels[4 * 4 + 3]).toBeGreaterThan(0)
  expect(output.pixels[4 * 4]).toBe(255)
  expect(protectExportPixels(image, 400, 'blur-noise')).toEqual(protectExportPixels(image, 400, 'blur-noise'))
})
it('only protects explicitly requested image encodes, leaving subsequent save encodes unchanged', async () => {
  const document = createDocument('export', 2, 1, 'rgba')
  writeLayerColor(document, document.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  writeLayerColor(document, document.layers[0], 1, { r: 0, g: 0, b: 255, a: 255 })
  const before = document.layers[0].pixels.slice()
  const plain = await exportDocumentImage(document, 400, 'png-rgba')
  const protectedImage = await exportDocumentImage(document, 400, 'png-rgba', 'blur')
  expect(protectedImage.bytes).not.toEqual(plain.bytes)
  expect(protectedImage.width).toBe(8)
  expect((await exportDocumentImage(document, 400, 'png-rgba')).bytes).toEqual(plain.bytes)
  expect(document.layers[0].pixels).toEqual(before)
})
