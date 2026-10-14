import type { ProjectReferenceImage } from '@shared/types-document'
import type { ManifestReferenceImage } from './project-format-manifest-types'
import { translateCurrent as tr } from './localization'

const invalidReference = (): Error => new Error(tr('core.project.layerCorrupt', { name: tr('panel.reference') }))

export function validateProjectReferenceImage(image: Pick<ProjectReferenceImage, 'id' | 'width' | 'height'>, byteLength: number): void {
  if (!image || typeof image.id !== 'string' || !/^[\w-]+$/.test(image.id) ||
    !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1 ||
    !Number.isSafeInteger(image.width * image.height * 4) || byteLength !== image.width * image.height * 4) throw invalidReference()
}

export function decodeProjectReferenceImages(metadata: ManifestReferenceImage[] | undefined, files: Readonly<Record<string, Uint8Array>>): ProjectReferenceImage[] {
  if (metadata === undefined) return []
  if (!Array.isArray(metadata)) throw invalidReference()
  const ids = new Set<string>()
  return metadata.map(image => {
    if (!image || typeof image.dataFile !== 'string' || image.dataFile !== `references/${image.id}.rgba` || ids.has(image.id)) throw invalidReference()
    const bytes = files[image.dataFile]
    validateProjectReferenceImage(image, bytes?.byteLength ?? -1)
    ids.add(image.id)
    return { id: image.id, width: image.width, height: image.height, pixels: new Uint8ClampedArray(bytes) }
  })
}
