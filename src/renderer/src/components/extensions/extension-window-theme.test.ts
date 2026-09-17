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
