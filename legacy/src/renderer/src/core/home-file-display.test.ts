import { describe, expect, it } from 'vitest'
import {
  HOME_FILE_DISPLAY_FORMATS,
  HOME_FILE_DISPLAY_FORMATS_STORAGE_KEY,
  getHomeFileDisplayFormats,
  homeFileDisplayFormatForPath,
  matchesHomeFileDisplayFormats,
  normalizeHomeFileDisplayFormats,
  saveHomeFileDisplayFormats
} from './home-file-display'

const memoryStorage = (): Storage => {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) }
  }
}

describe('home file display formats', () => {
  it('defaults to every supported display format', () => {
    expect(getHomeFileDisplayFormats(memoryStorage())).toEqual(HOME_FILE_DISPLAY_FORMATS)
  })

  it('persists multiple formats in canonical order', () => {
    const storage = memoryStorage()
    expect(saveHomeFileDisplayFormats(['jpg', 'project', 'jpg'], storage)).toEqual(['project', 'jpg'])
    expect(getHomeFileDisplayFormats(storage)).toEqual(['project', 'jpg'])
  })

  it('normalizes stale values while preserving an intentional empty selection', () => {
    expect(normalizeHomeFileDisplayFormats(['removed-format', 'gif', 'png'])).toEqual(['png', 'gif'])
    expect(normalizeHomeFileDisplayFormats([])).toEqual([])
    expect(normalizeHomeFileDisplayFormats(null)).toEqual(HOME_FILE_DISPLAY_FORMATS)
  })

  it('groups project and jpeg extensions and ignores case', () => {
    expect(homeFileDisplayFormatForPath('C:\\art\\sprite.MOONSPRITE')).toBe('project')
    expect(homeFileDisplayFormatForPath('C:\\art\\sprite.MOONSPRITE.BAK')).toBe('project')
    expect(homeFileDisplayFormatForPath('sprite.ASE')).toBe('project')
    expect(homeFileDisplayFormatForPath('sprite.aseprite')).toBe('project')
    expect(homeFileDisplayFormatForPath('sprite.psd')).toBe('project')
    expect(homeFileDisplayFormatForPath('photo.JPEG')).toBe('jpg')
    expect(matchesHomeFileDisplayFormats('photo.jpg', ['jpg'])).toBe(true)
    expect(matchesHomeFileDisplayFormats('photo.jpeg', ['jpg'])).toBe(true)
  })

  it('filters unsupported paths and paths without an extension', () => {
    expect(homeFileDisplayFormatForPath('sprite.txt')).toBeNull()
    expect(homeFileDisplayFormatForPath('README')).toBeNull()
    expect(matchesHomeFileDisplayFormats('sprite.png', ['project', 'jpg'])).toBe(false)
  })

  it('stores an intentional empty selection', () => {
    const storage = memoryStorage()
    saveHomeFileDisplayFormats([], storage)
    expect(storage.getItem(HOME_FILE_DISPLAY_FORMATS_STORAGE_KEY)).toBe('[]')
    expect(getHomeFileDisplayFormats(storage)).toEqual([])
  })
})
