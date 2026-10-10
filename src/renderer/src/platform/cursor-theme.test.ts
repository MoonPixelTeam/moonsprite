import { afterEach, expect, it, vi } from 'vitest'
import { applyCursorPreferences, cursorOverlayDescriptor } from './cursor-theme'
import pixelGrabCursor from '@/assets/pixel-grab-cursor.svg'
import type { CursorScale } from '@/core/file-preferences'

vi.mock('./display-scale', () => ({
  isTauriRuntime: () => false,
  normalizeDisplayScaleFactor: (value: number) => value,
  observeDisplayScaleFactor: () => Promise.resolve(1)
}))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each(['grab', 'grabbing'])('uses the SVG hand with the same scaled hotspot for %s', cursor => {
  expect(cursorOverlayDescriptor(`var(--cursor-${cursor})`, false, 2)).toEqual({
    source: pixelGrabCursor, size: 64, hotspotX: 32, hotspotY: 32
  })
})

it('bounds scaled cursor images across every supported scale and regenerates evicted assets', async () => {
  const decodes: string[] = []
  vi.stubGlobal('Image', class {
    naturalWidth = 32
    naturalHeight = 32
    onload = () => {}
    set src(value: string) { decodes.push(value); this.onload() }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), imageSmoothingEnabled: true } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cursor')
  await applyCursorPreferences(false, 1.25)
  const first = decodes.length
  expect(first).toBeGreaterThan(0)
  await applyCursorPreferences(false, 1.25)
  expect(decodes).toHaveLength(first)
  for (const scale of [1.5, 2, 3, 4] as CursorScale[]) await applyCursorPreferences(false, scale)
  const all = decodes.length
  expect(all).toBeGreaterThan(64)
  await applyCursorPreferences(false, 1.25)
  expect(decodes.length).toBeGreaterThan(all)
  const warmed = decodes.length
  await applyCursorPreferences(false, 1.25)
  expect(decodes).toHaveLength(warmed)
  expect(document.documentElement.style.getPropertyValue('--cursor-default')).toContain('data:image/png;base64,cursor')
})
