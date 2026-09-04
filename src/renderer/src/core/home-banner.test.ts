import { describe, expect, it } from 'vitest'
import { resolveHomeBanners, type HomeBannerDefinition } from './home-banner'

const definitions: readonly HomeBannerDefinition[] = [
  { id: 'first', kind: 'project', projectFileName: '滤镜测试.moonsprite', author: '90y', authorUrl: 'https://moonpx.art/user/90y' },
  { id: 'second', kind: 'project', projectFileName: 'other.moonsprite', author: 'artist', authorUrl: 'https://example.com/artist' }
]

describe('resolveHomeBanners', () => {
  it('keeps curated order and resolves extensionless gallery names', () => {
    const result = resolveHomeBanners(definitions, [
      { filePath: 'gallery/other.moonsprite', fileName: 'other', modifiedAt: 2 },
      { filePath: 'gallery/滤镜测试.moonsprite', fileName: '滤镜测试', modifiedAt: 1 }
    ])
    expect(result.map((item) => item.id)).toEqual(['first', 'second'])
    expect(result[0]).toMatchObject({ filePath: 'gallery/滤镜测试.moonsprite', author: '90y' })
  })

  it('filters unavailable projects without changing the remaining metadata', () => {
    const result = resolveHomeBanners(definitions, [{ filePath: 'gallery/other.moonsprite', fileName: 'other', modifiedAt: 2 }])
    expect(result).toEqual([{ ...definitions[1], filePath: 'gallery/other.moonsprite', fileName: 'other', modifiedAt: 2 }])
  })

  it('uses the first deterministic match when a gallery contains duplicate names', () => {
    const result = resolveHomeBanners([definitions[0]], [
      { filePath: 'gallery/a/滤镜测试.moonsprite', fileName: '滤镜测试', modifiedAt: 3 },
      { filePath: 'gallery/b/滤镜测试.moonsprite', fileName: '滤镜测试', modifiedAt: 4 }
    ])
    expect(result[0]?.filePath).toBe('gallery/a/滤镜测试.moonsprite')
  })

  it('keeps image entries without requiring a gallery project', () => {
    const image = { id: 'image', kind: 'image' as const, imageAssetKey: 'banner', imageName: 'banner.png', author: 'artist', authorUrl: 'https://example.com' }
    expect(resolveHomeBanners([image], [])).toEqual([image])
  })
})
