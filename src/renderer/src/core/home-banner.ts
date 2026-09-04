/**
 * Curated works shown in the start-screen banner.
 *
 * The banner intentionally stores only metadata. Project paths are resolved
 * against the runtime gallery listing so the app works both in development
 * and in an installed build without copying user projects into the source
 * tree.
 */
export interface HomeBannerDefinition {
  id: string
  kind: 'project' | 'image'
  projectFileName?: string
  imageAssetKey?: string
  imageName?: string
  author: string
  authorUrl: string
}

export interface HomeBannerGalleryProject {
  filePath: string
  fileName: string
  modifiedAt: number
}

export interface ResolvedHomeBanner extends HomeBannerDefinition {
  filePath?: string
  fileName?: string
  modifiedAt?: number
}

export const homeBannerDefinitions: readonly HomeBannerDefinition[] = [
  {
    id: 'filter-test-90y',
    kind: 'project',
    projectFileName: '城堡.moonsprite',
    author: '90y',
    authorUrl: 'https://moonpx.art/user/220430763143860224/feed?tab=latest'
  },
  {
    id: 'fire-banner',
    kind: 'image',
    imageAssetKey: 'home-banner-fire',
    imageName: '火焰之境',
    author: '90y',
    authorUrl: 'https://moonpx.art/user/220430763143860224/feed?tab=latest'
  },
  {
    id: 'crystal-banner',
    kind: 'image',
    imageAssetKey: 'home-banner-crystal',
    imageName: '月球基底',
    author: '90y',
    authorUrl: 'https://moonpx.art/user/220430763143860224/feed?tab=latest'
  },
  {
    id: 'coast-banner',
    kind: 'image',
    imageAssetKey: 'home-banner-coast',
    imageName: '沙船',
    author: '90y',
    authorUrl: 'https://moonpx.art/user/220430763143860224/feed?tab=latest'
  },
  {
    id: 'hall-banner',
    kind: 'image',
    imageAssetKey: 'home-banner-hall',
    imageName: '大厅',
    author: '90y',
    authorUrl: 'https://moonpx.art/user/220430763143860224/feed?tab=latest'
  }
]

const basename = (filePath: string): string => filePath.split(/[\\/]/).pop() ?? filePath

const withoutProjectExtension = (fileName: string): string => fileName.replace(/\.moonsprite$/i, '')

/** Resolve curated entries to projects currently available in the gallery. */
export const resolveHomeBanners = (
  definitions: readonly HomeBannerDefinition[],
  projects: readonly HomeBannerGalleryProject[]
): ResolvedHomeBanner[] => {
  const byName = new Map<string, HomeBannerGalleryProject>()
  for (const project of projects) {
    const key = withoutProjectExtension(basename(project.fileName || project.filePath)).toLowerCase()
    if (!byName.has(key)) byName.set(key, project)
  }
  return definitions.flatMap((definition) => {
    if (definition.kind === 'image') return [{ ...definition }]
    if (!definition.projectFileName) return []
    const key = withoutProjectExtension(basename(definition.projectFileName)).toLowerCase()
    const project = byName.get(key)
    return project ? [{ ...definition, ...project }] : []
  })
}
