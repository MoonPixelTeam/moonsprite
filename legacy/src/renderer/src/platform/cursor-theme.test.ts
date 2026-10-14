import { afterEach, expect, it, vi } from 'vitest'
import { applyCursorPreferences, cursorOverlayDescriptor } from './cursor-theme'
import pixelGrabCursor from '@/assets/pixel-grab-cursor.svg'
import type { CursorScale } from '@/core/file-preferences'

// Match Vite's SVG inlining: XML attributes keep literal single quotes.
vi.mock('@/assets/pixel-grab-cursor.svg', () => ({
  default: "data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='32'%3e%3c/svg%3e"
}))

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

it('quotes inlined SVG URLs safely for grab and grabbing at the default scale', async () => {
  await applyCursorPreferences(false, 1)
  for (const cursor of ['grab', 'grabbing']) {
    const value = document.documentElement.style.getPropertyValue(`--cursor-${cursor}`)
    expect(value).toBe(`url("${pixelGrabCursor}") 16 16, url("${pixelGrabCursor}") 16 16, default`)
  }
})

it('quotes inlined SVG URLs safely inside image-set on high DPI displays', async () => {
  const display = await import('./display-scale')
  vi.spyOn(display, 'observeDisplayScaleFactor').mockResolvedValue(2)
  await applyCursorPreferences(false, 1)
  for (const cursor of ['grab', 'grabbing']) {
    const value = document.documentElement.style.getPropertyValue(`--cursor-${cursor}`)
    expect(value).toBe(`image-set(url("${pixelGrabCursor}") 2x) 8 8, image-set(url("${pixelGrabCursor}") 2x) 8 8, default`)
  }
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
