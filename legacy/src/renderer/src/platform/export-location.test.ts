import { expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { chooseExportLocation } from './export-location'

it.each(['png-auto', 'png-rgba', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'psd', 'aseprite', 'mp4', 'webm', 'ase', 'moonsprite'] as const)('uses a file-saving dialog for %s and returns the chosen directory and name', async format => {
  const extension = format.startsWith('png') ? 'png' : format === 'jpeg' ? 'jpg' : format
  const result = { canceled: false, filePath: `D:\\art\\chosen.${extension}` }
  const exportImage = vi.fn(async () => result), saveProject = vi.fn(async () => result), chooseDirectory = vi.fn()
  const api = { exportImage, saveProject, chooseDirectory } as unknown as MoonSpriteApi
  expect(await chooseExportLocation(api, 'C:/exports', 'original', format)).toEqual({ directory: 'D:\\art', name: `chosen.${extension}` })
  expect(format === 'ase' || format === 'moonsprite' ? saveProject : exportImage).toHaveBeenCalledWith(`C:/exports/original.${extension}`, format.startsWith('png') ? 'png' : format)
  expect(chooseDirectory).not.toHaveBeenCalled()
})

it('handles cancellation and filenames entered while browsing all file types', async () => {
  const exportImage = vi.fn().mockResolvedValueOnce({ canceled: true }).mockResolvedValueOnce({ canceled: false, filePath: 'D:/drawing.txt' })
  const api = { exportImage } as unknown as MoonSpriteApi
  expect(await chooseExportLocation(api, '', 'drawing', 'png')).toBeNull()
  expect(await chooseExportLocation(api, '', 'drawing', 'png')).toEqual({ directory: 'D:/', name: 'drawing.txt.png' })
})
