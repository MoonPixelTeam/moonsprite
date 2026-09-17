import { beforeEach, expect, it, vi } from 'vitest'
import { loadNewDocumentPresets, saveNewDocumentPresets } from './new-document-presets'

beforeEach(() => localStorage.clear())

it('persists creation settings and removes deleted presets', () => {
  const preset = { presetName: 'Sprite', width: 32, height: 48, mode: 'indexed' as const, recordDrawing: true }
  expect(saveNewDocumentPresets([preset])).toBe(true)
  expect(loadNewDocumentPresets()).toEqual([preset])
  expect(saveNewDocumentPresets([])).toBe(true)
  expect(loadNewDocumentPresets()).toEqual([])
})

it('ignores invalid stored dimensions and reports failed writes', () => {
  localStorage.setItem('moonsprite.new-document-presets', JSON.stringify([null, { presetName: 'Invalid', width: -1, height: 32, mode: 'rgba', recordDrawing: false }]))
  expect(loadNewDocumentPresets()).toEqual([])
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
  try { expect(saveNewDocumentPresets([])).toBe(false) } finally { failure.mockRestore() }
})
