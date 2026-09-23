import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { DEFAULT_SPRITE_SHEET_IMPORT as defaults } from '@/core/sprite-sheet-import'
import { SpriteSheetImportPreview } from './SpriteSheetImportPreview'
vi.mock('../I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/core/document-composite', () => ({ compositeRegionAsync: async () => new Uint8ClampedArray(64 * 32 * 4) }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn().mockResolvedValue({ freeBytes: 2 ** 40 }) })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function setup(paddingX = 0) {
  const onChange = vi.fn(), options = { ...defaults, paddingX }
  const view = render(<SpriteSheetImportPreview source={createDocument('sheet', 64, 32, 'rgba', false)} revision={0} options={options} disabled={false} onChange={onChange} />)
  const canvas = view.getByLabelText('spriteSheetImport.preview') as HTMLCanvasElement
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 720, height: 480 } as DOMRect)
  canvas.setPointerCapture = vi.fn(); canvas.hasPointerCapture = vi.fn().mockReturnValue(true); canvas.releasePointerCapture = vi.fn()
  return { canvas, onChange, options }
}
it('moves the first tile in document pixels and restores its draft when cancelled', () => {
  const { canvas, onChange, options } = setup()
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 120, clientY: 160 })
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 170 })
  expect(onChange).toHaveBeenLastCalledWith({ ...options, x: 2, y: 1 })
  fireEvent.pointerCancel(canvas, { pointerId: 1 })
  expect(onChange).toHaveBeenLastCalledWith(options)
})
it('drags the first tile edge and padding ruler independently', () => {
  const { canvas, onChange, options } = setup(2)
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 200, clientY: 160 })
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 230, clientY: 160 })
  expect(onChange).toHaveBeenLastCalledWith({ ...options, width: 19 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 220, clientY: 160 })
  fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 240, clientY: 160 })
  expect(onChange).toHaveBeenLastCalledWith({ ...options, paddingX: 4 })
})
it('keeps zoom and pan out of the slicing settings', () => {
  const { canvas, onChange } = setup()
  fireEvent.pointerDown(canvas, { button: 1, pointerId: 3, clientX: 120, clientY: 160 })
  fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 150, clientY: 170 })
  fireEvent.pointerUp(canvas, { pointerId: 3 })
  fireEvent.wheel(canvas, { deltaY: -100, clientX: 150, clientY: 170 })
  expect(onChange).not.toHaveBeenCalled()
})
