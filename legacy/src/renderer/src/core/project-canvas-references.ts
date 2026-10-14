import { strFromU8, strToU8 } from 'fflate'
import type { ProjectCanvasReference, ReferencePlacement } from '@shared/types-document'
import type { ManifestCanvasReference } from './project-format-manifest-types'
import { translateCurrent as tr } from './localization'

const invalid = (): Error => new Error(tr('core.project.layerCorrupt', { name: tr('panel.reference') }))
const validatePlacement = (value: ReferencePlacement): void => {
  if (!value || !['x', 'y', 'width', 'height', 'angle'].every(key => Number.isFinite(value[key as keyof ReferencePlacement])) ||
    value.width <= 0 || value.height <= 0 || typeof value.flipX !== 'boolean' || typeof value.flipY !== 'boolean' ||
    (value.opacity !== undefined && (!Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1))) throw invalid()
}
const copyPlacement = ({ x, y, width, height, angle, flipX, flipY, opacity }: ReferencePlacement): ReferencePlacement =>
  ({ x, y, width, height, angle, flipX, flipY, ...(opacity === undefined ? {} : { opacity }) })

function validate(image: ProjectCanvasReference): void {
  validatePlacement(image)
  if (typeof image.id !== 'string' || !/^[\w-]+$/.test(image.id) || typeof image.name !== 'string' ||
    typeof image.locked !== 'boolean' || (image.floating !== undefined && typeof image.floating !== 'boolean') ||
    typeof image.src !== 'string' || !/^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.src)) throw invalid()
  if (image.initial !== undefined) validatePlacement(image.initial)
}

function metadata(image: ProjectCanvasReference): Omit<ProjectCanvasReference, 'src'> {
  return { ...copyPlacement(image), id: image.id, name: image.name, locked: image.locked,
    ...(image.floating === undefined ? {} : { floating: image.floating }), ...(image.initial ? { initial: copyPlacement(image.initial) } : {}) }
}

export function encodeCanvasReferences(images: readonly ProjectCanvasReference[] | undefined, files: Record<string, Uint8Array>): ManifestCanvasReference[] {
  const ids = new Set<string>()
  return (images ?? []).map(image => {
    validate(image)
    if (ids.has(image.id)) throw invalid()
    ids.add(image.id)
    const dataFile = `references/canvas/${image.id}.dataurl`
    files[dataFile] = strToU8(image.src)
    // Image replacement retains its ID. Always encode this resource rather than
    // reusing a baseline that could still contain the previous image.
    return { ...metadata(image), dataFile }
  })
}

export function decodeCanvasReferences(images: ManifestCanvasReference[] | undefined, files: Readonly<Record<string, Uint8Array>>): ProjectCanvasReference[] {
  if (images === undefined) return []
  if (!Array.isArray(images)) throw invalid()
  const ids = new Set<string>()
  return images.map(image => {
    if (!image || image.dataFile !== `references/canvas/${image.id}.dataurl` || !files[image.dataFile] || ids.has(image.id)) throw invalid()
    const decoded = { ...image, src: strFromU8(files[image.dataFile]) }
    validate(decoded)
    ids.add(image.id)
    return { ...metadata(decoded), src: decoded.src }
  })
}
