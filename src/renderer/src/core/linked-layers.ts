import type { AnimationCelSurface } from '@shared/types-animation'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { SpriteDocument } from '@shared/types-document'
import { getLayerStorageOrigin, setLayerStorageOrigin } from './document-model'
import { assignRasterStorage } from './runtime-raster'

type LinkedRasterSurface = RasterLayer | AnimationCelSurface

const surfaceStorageOrigin = (surface: LinkedRasterSurface): { x: number; y: number } =>
  'id' in surface
    ? getLayerStorageOrigin(surface)
    : { x: surface.storageOriginX ?? 0, y: surface.storageOriginY ?? 0 }

const setSurfaceStorageOrigin = (surface: LinkedRasterSurface, x: number, y: number): void => {
  if ('id' in surface) setLayerStorageOrigin(surface, { x, y })
  else {
    surface.storageOriginX = Math.trunc(x)
    surface.storageOriginY = Math.trunc(y)
  }
}

export const isLinkableRasterLayer = (layer: RasterLayer | null | undefined): layer is RasterLayer =>
  Boolean(layer && !layer.kind && !layer.background)

export const linkedLayerMembers = (document: SpriteDocument, linkedContentId: string): RasterLayer[] =>
  document.layers.filter((layer) => isLinkableRasterLayer(layer) && layer.linkedContentId === linkedContentId)

const BUILT_IN_LINKED_NAME_SUFFIXES = ['关联', 'Linked'] as const

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const linkedLayerNameParts = (
  name: string,
  currentSuffix: string
): { baseName: string; index: number | null } | null => {
  const suffixes = [...new Set([currentSuffix, ...BUILT_IN_LINKED_NAME_SUFFIXES].filter(Boolean))]
  for (const suffix of suffixes) {
    const escapedSuffix = escapeRegExp(suffix)
    const numbered = name.match(new RegExp(`^(.*?)\\s+${escapedSuffix}\\s*(\\d+)$`, 'i'))
    if (numbered?.[1]?.trim()) return { baseName: numbered[1].trim(), index: Number(numbered[2]) }
    const legacy = name.match(new RegExp(`^(.*?)\\s+${escapedSuffix}$`, 'i'))
    if (legacy?.[1]?.trim()) return { baseName: legacy[1].trim(), index: null }
  }
  return null
}

export interface LinkedLayerNameSequence {
  baseName: string
  nextIndex: number
}

export const linkedLayerDefaultNameSequence = (
  document: SpriteDocument,
  linkedContentId: string,
  currentSuffix: string,
  fallbackName: string
): LinkedLayerNameSequence => {
  const members = linkedLayerMembers(document, linkedContentId)
  const parsedMembers = members.flatMap((layer) => {
    const parts = linkedLayerNameParts(layer.name, currentSuffix)
    return parts ? [parts] : []
  })
  const parsedFallback = linkedLayerNameParts(fallbackName, currentSuffix)
  const baseName = parsedMembers[0]?.baseName
    ?? parsedFallback?.baseName
    ?? members[0]?.name.trim()
    ?? fallbackName.trim()
  const numberedIndices = parsedMembers
    .filter((parts) => parts.baseName.toLocaleLowerCase() === baseName.toLocaleLowerCase() && parts.index !== null)
    .map((parts) => parts.index!)
  return {
    baseName,
    nextIndex: numberedIndices.length > 0 ? Math.max(...numberedIndices) + 1 : Math.max(1, members.length + 1)
  }
}

const sameDisplayColor = (left: RgbaColor | null | undefined, right: RgbaColor | null | undefined): boolean =>
  left === right || Boolean(left && right && left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a)

export const setLinkedLayerGroupDisplayColor = (
  document: SpriteDocument,
  linkedContentId: string,
  displayColor: RgbaColor | null | undefined
): void => {
  for (const layer of linkedLayerMembers(document, linkedContentId)) {
    if (!displayColor) {
      delete layer.displayColor
      continue
    }
    if (!sameDisplayColor(layer.displayColor, displayColor)) layer.displayColor = { ...displayColor }
  }
}

export const normalizeLinkedLayerMetadata = (document: SpriteDocument): void => {
  for (const layer of document.layers) {
    if (typeof layer.linkedContentId === 'string' && layer.linkedContentId.trim() && isLinkableRasterLayer(layer)) continue
    delete layer.linkedContentId
  }
  const linkedContentIds = new Set(document.layers.flatMap((layer) => layer.linkedContentId ? [layer.linkedContentId] : []))
  for (const linkedContentId of linkedContentIds) {
    const displayColor = linkedLayerMembers(document, linkedContentId).find((layer) => layer.displayColor)?.displayColor
    setLinkedLayerGroupDisplayColor(document, linkedContentId, displayColor)
  }
}

export const linkedLayerMemberCount = (document: SpriteDocument, linkedContentId: string | null | undefined): number =>
  linkedContentId ? linkedLayerMembers(document, linkedContentId).length : 0

export const linkedLayerGroups = (document: SpriteDocument): Map<string, RasterLayer[]> => {
  normalizeLinkedLayerMetadata(document)
  const groups = new Map<string, RasterLayer[]>()
  for (const layer of document.layers) {
    if (!layer.linkedContentId) continue
    const members = groups.get(layer.linkedContentId) ?? []
    members.push(layer)
    groups.set(layer.linkedContentId, members)
  }
  return groups
}

/** Shares editable storage while preserving the target layer or cel's independent canvas placement. */
export const shareLinkedRasterContent = (target: LinkedRasterSurface, source: LinkedRasterSurface): void => {
  if (target === source || target.format !== source.format) return
  const targetOrigin = surfaceStorageOrigin(target)
  const sourceOrigin = surfaceStorageOrigin(source)
  const anchorX = target.offsetX - targetOrigin.x
  const anchorY = target.offsetY - targetOrigin.y
  target.width = source.width
  target.height = source.height
  target.offsetX = anchorX + sourceOrigin.x
  target.offsetY = anchorY + sourceOrigin.y
  setSurfaceStorageOrigin(target, sourceOrigin.x, sourceOrigin.y)
  assignRasterStorage(target, source)
}
