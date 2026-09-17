import { unzipSync } from 'fflate'
import { translateCurrent as tr } from './localization'
import { MAX_TILESET_PIXELS } from './tilemap'
import { projectZipDirectory, projectZipFiles } from './project-format-zip'
import { readManifest, encodeProjectPreview } from './project-format-manifest'
import { type ProjectGalleryReadOptions, type ProjectGalleryMetadata } from './project-format-manifest-types'
import { decodeProject } from './project-format-decode'

export function readProjectExpandedRasterBytes(input: Uint8Array): number | null {
  try {
    const directory = projectZipDirectory(input)
    const files = directory ? (projectZipFiles(input, directory, new Set(['manifest.json'])) ?? unzipSync(input, { filter: (file) => file.name === 'manifest.json' })) : unzipSync(input, { filter: (file) => file.name === 'manifest.json' })
    const source = readManifest(files).document
    const resources = new Map<string, number>()
    const add = (dataFile: unknown, width: unknown, height: unknown, bytesPerPixel = 4): void => {
      if (typeof dataFile !== 'string' || !dataFile || resources.has(dataFile)) return
      const resourceWidth = Number(width)
      const resourceHeight = Number(height)
      const bytes = resourceWidth * resourceHeight * bytesPerPixel
      if (!Number.isSafeInteger(resourceWidth) || !Number.isSafeInteger(resourceHeight) || resourceWidth < 1 || resourceHeight < 1 || !Number.isSafeInteger(bytes)) throw new Error('invalid raster size')
      resources.set(dataFile, bytes)
    }
    for (const layer of source.layers ?? []) add(layer.dataFile, layer.width ?? source.width, layer.height ?? source.height)
    for (const tileset of source.tilesets ?? []) {
      const width = tileset.columns * tileset.tileWidth
      const height = tileset.rows * tileset.tileHeight
      if (!Number.isSafeInteger(width * height) || width * height > MAX_TILESET_PIXELS) throw new Error('invalid tileset size')
      add(tileset.dataFile, width, height)
    }
    for (const cel of source.animation.cels ?? []) {
      if (cel.dataFile) add(cel.dataFile, cel.width, cel.height)
      if (cel.mask) add(cel.mask.dataFile, cel.mask.width, cel.mask.height)
    }
    for (const entry of source.animation.layerMasks ?? []) add(entry.mask.dataFile, entry.mask.width, entry.mask.height)
    for (const entry of source.animation.groupMasks ?? []) add(entry.mask.dataFile, entry.mask.width, entry.mask.height)
    let total = 0
    for (const bytes of resources.values()) {
      total += bytes
      if (!Number.isSafeInteger(total)) return null
    }
    return total
  } catch {
    return null
  }
}

export function readProjectGalleryMetadata(input: Uint8Array, options: ProjectGalleryReadOptions = {}): ProjectGalleryMetadata {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(input, {
      filter: (file) => file.name === 'manifest.json' || file.name === 'preview.png'
    })
  } catch {
    throw new Error(tr('core.project.galleryUnzip'))
  }
  const manifest = readManifest(files)
  const source = manifest.document
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1) {
    throw new Error(tr('core.project.galleryCanvasSize'))
  }
  if (source.colorMode !== 'rgba' && source.colorMode !== 'indexed' && source.colorMode !== 'grayscale') throw new Error(tr('core.project.galleryColorMode'))
  const preview = files['preview.png']
  if (!preview?.byteLength) {
    if (!options.generateMissingPreview) throw new Error(tr('core.project.missingPreview'))
    const document = decodeProject(input)
    return {
      name: source.name || tr('core.document.untitled'),
      width: source.width,
      height: source.height,
      colorMode: source.colorMode,
      preview: encodeProjectPreview(document)
    }
  }
  return {
    name: source.name || tr('core.document.untitled'),
    width: source.width,
    height: source.height,
    colorMode: source.colorMode,
    preview: preview.slice()
  }
}
