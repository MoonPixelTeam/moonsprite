import type { SpriteDocument } from '@shared/types-document'
import { isMoonSpriteProjectPath, saveImageKindForPath, sourceRasterImageKindForPath } from './document-files'
import type { SaveImageKind } from './png'
import { hasEnabledLayerStyles } from './layer-styles'
import { readSurfacePackedLocal } from './runtime-raster'

export type DocumentSaveFormat = 'moonsprite' | SaveImageKind | 'gif' | 'bmp'
export type SaveCompatibilityIssue = 'layers' | 'frames' | 'loops' | 'editable' | 'effects' | 'resources' | 'timelapse' | 'transparency' | 'gifColors' | 'frameFlags'

export function documentSaveTarget(document: SpriteDocument): { filePath: string; format: DocumentSaveFormat } | null {
  const filePath = document.filePath || document.sourceFilePath
  if (!filePath || /\.bak$/i.test(filePath)) return null
  const format = isMoonSpriteProjectPath(filePath) ? 'moonsprite' : saveImageKindForPath(filePath) ?? sourceRasterImageKindForPath(filePath)
  return format ? { filePath, format } : null
}

export const saveFormatLabel = (format: DocumentSaveFormat): string => format.startsWith('png-') ? 'PNG' : format.toUpperCase()

/** Describes limitations of our encoders, not just the external format specification. */
export function documentSaveCompatibility(document: SpriteDocument, format: DocumentSaveFormat): SaveCompatibilityIssue[] {
  if (format === 'moonsprite') return []
  const issues = new Set<SaveCompatibilityIssue>()
  const ase = format === 'ase' || format === 'aseprite'
  const structured = ase || format === 'psd'
  const timeline = document.animation
  if (!structured && (document.layers.length > 1 || document.groups.length)) issues.add('layers')
  if (!ase && format !== 'gif' && (timeline?.frames.length ?? 1) > 1) issues.add('frames')
  if (!ase && timeline?.loopSections?.length) issues.add('loops')
  if (timeline?.frames.some((frame) => frame.disabled)) issues.add('frameFlags')
  if (document.layers.some((layer) => layer.kind) || timeline?.cels.some((cel) => cel.text || cel.tilemap || cel.freeTiles)) issues.add('editable')
  const masks = Boolean(timeline?.layerMasks?.length || timeline?.groupMasks?.length)
  const effects = [...document.layers, ...document.groups].some((item) => item.clippingMask || hasEnabledLayerStyles(item.layerStyles)) || document.groups.some((group) => group.cumulativeBlend)
  if (format !== 'psd' && (masks || effects)) issues.add('effects')
  if (document.customBrushes?.length || document.tilesets?.length || document.slices?.length) issues.add('resources')
  if (document.timelapse?.snapshots?.length) issues.add('timelapse')
  if (format === 'jpeg' || format === 'gif') {
    const colors = new Set<number>()
    const palette = new Map(document.palette.map((entry) => [entry.id, entry.color]))
    const surfaces = [ ...document.layers, ...(timeline?.cels.flatMap((cel) => cel.surface ? [cel.surface] : []) ?? []) ]
    for (const surface of surfaces) {
      if (format === 'jpeg' && (surface.offsetX > 0 || surface.offsetY > 0 || surface.offsetX + surface.width < document.width || surface.offsetY + surface.height < document.height)) issues.add('transparency')
      for (let y = 0; y < surface.height; y++) for (let x = 0; x < surface.width; x++) {
        const packed = readSurfacePackedLocal(surface, x, y)
        const color = surface.format === 'indexed' ? palette.get(packed) : { r: packed & 255, g: packed >>> 8 & 255, b: packed >>> 16 & 255, a: packed >>> 24 }
        const alpha = color?.a ?? 0
        if (format === 'jpeg' && alpha < 255) { issues.add('transparency'); return [...issues] }
        if (format === 'gif' && color) {
          if (alpha > 0 && alpha < 255) { issues.add('gifColors'); return [...issues] }
          if (alpha) colors.add((color.r << 16) | (color.g << 8) | color.b)
          if (colors.size > 255) { issues.add('gifColors'); return [...issues] }
        }
      }
    }
    if ([...document.layers, ...(timeline?.cels ?? [])].some((item) => (item.opacity ?? 1) < 1)) issues.add(format === 'gif' ? 'gifColors' : 'transparency')
  }
  return [...issues]
}
