import { expect, it } from 'vitest'
import { createDocument } from './document-model'
import { beginPixelEdit, revertPixelEdit } from './history'
import { restoreSelectionTranslationPreview, selectionTranslationPreviewEdit } from './tools-selection-transform-translation'
import type { SelectionTranslationPreview } from './tools-selection-transform-types'

it('can discard empty previews even after their target disappears', () => {
  const document = createDocument('empty preview', 2, 2, 'rgba')
  const preview: SelectionTranslationPreview = {
    layerId: 'removed-layer', count: 0, marks: new Uint8Array(4),
    canvasIndices: new Uint32Array(1), indices: new Uint32Array(1), before: new Uint32Array(1)
  }
  expect(() => restoreSelectionTranslationPreview(document, preview)).not.toThrow()
  expect(selectionTranslationPreviewEdit(document, preview)).toBeNull()
  expect(() => revertPixelEdit(document, beginPixelEdit('removed-layer'))).not.toThrow()
  // Actual modifications must still report a missing target, never silently disappear.
  preview.count = 1
  expect(() => restoreSelectionTranslationPreview(document, preview)).toThrow()
  expect(() => selectionTranslationPreviewEdit(document, preview)).toThrow()
  const edit = beginPixelEdit('removed-layer')
  edit.before.set(0, 0xff000000)
  expect(() => revertPixelEdit(document, edit)).toThrow()
})
