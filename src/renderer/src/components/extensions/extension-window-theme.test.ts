import { afterEach, expect, it, vi } from 'vitest'
import { extensionWindowTheme } from './extension-window-theme'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const assets = [{variable:'--cursor-default',source:'/test-cursor.png',hotspot:'9 5',fallback:'default'}]

it('uses system cursors only when requested by preferences', async () => {
  const css = await extensionWindowTheme(assets, true, 2)
  expect(css).toContain('--cursor-default:default;')
  expect(css).not.toContain('/test-cursor.png')
  expect(css).toContain('body[data-ms-dialog]')
})

it('inlines scaled bundled cursors so sandbox CSP can load them', async () => {
  vi.stubGlobal('Image', class {
    naturalWidth=32
    naturalHeight=32
    onload=()=>{}
    set src(_value: string) { this.onload() }
  })
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage,imageSmoothingEnabled:true} as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cursor')
  const css = await extensionWindowTheme(assets, false, 2)
  expect(css).toContain("url('data:image/png;base64,cursor') 18 10, none")
  expect(drawImage).toHaveBeenCalledWith(expect.anything(),0,0,64,64)
})

it('evicts old extension images and still shares recent image requests', async () => {
  let decodes = 0
  vi.stubGlobal('Image', class {
    naturalWidth = 32
    naturalHeight = 32
    onload = () => {}
    set src(_value: string) { decodes++; this.onload() }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), imageSmoothingEnabled: true } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cursor')
  const asset = (index: number) => [{ ...assets[0], source: `/bounded-${index}.png` }]
  // Exercise the production consumer, not only the generic cache utility.
  for (let index = 0; index < 1000; index++) await extensionWindowTheme(asset(index), false, 2)
  expect(decodes).toBe(1000)
  await extensionWindowTheme(asset(999), false, 2)
  expect(decodes).toBe(1000)
  await extensionWindowTheme(asset(0), false, 2)
  expect(decodes).toBe(1001)
})
