import type { SpriteDocument } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'
import { createDocument, createId, convertDocumentColorMode } from './document-model'
import { compositeRegionAsync } from './document-composite'
import { checkTypedArrayLimit } from './resource-policy'
import { translateCurrent as tr } from './localization'

export type SpriteSheetImportLayout = 'horizontal' | 'vertical' | 'rows' | 'columns'
export interface SpriteSheetImportOptions {
  layout: SpriteSheetImportLayout
  x: number; y: number; width: number; height: number
  paddingX: number; paddingY: number; partialTiles: boolean
}
export const DEFAULT_SPRITE_SHEET_IMPORT: SpriteSheetImportOptions = {
  layout: 'rows', x: 0, y: 0, width: 16, height: 16, paddingX: 0, paddingY: 0, partialTiles: false
}
export function spriteSheetImportPlan(size: { width: number; height: number }, options: SpriteSheetImportOptions) {
  const { x, y, width, height, paddingX, paddingY, partialTiles, layout } = options
  if (!['horizontal', 'vertical', 'rows', 'columns'].includes(layout)
    || ![x, y, width, height, paddingX, paddingY, size.width, size.height].every(Number.isSafeInteger)
    || width < 1 || height < 1 || size.width < 1 || size.height < 1 || width > 262144 || height > 262144
    || Math.abs(x) > 262144 || Math.abs(y) > 262144 || paddingX < 0 || paddingY < 0 || paddingX > 262144 || paddingY > 262144) throw new Error(tr('spriteSheetImport.invalid'))
  const spans = (available: number, tile: number, gap: number) => Math.max(0, Math.floor((available + gap + (partialTiles ? tile - 1 : 0)) / (tile + gap)))
  const columns = layout === 'vertical' ? 1 : spans(size.width - x, width, paddingX)
  const rows = layout === 'horizontal' ? 1 : spans(size.height - y, height, paddingY)
  const count = columns * rows
  if (!Number.isSafeInteger(count) || count > 10000) throw new Error(tr('spriteSheetImport.tooMany'))
  const tiles: SelectionRect[] = []
  for (let index = 0; index < count; index++) {
    const column = layout === 'columns' ? Math.floor(index / rows) : index % columns
    const row = layout === 'columns' ? index % rows : Math.floor(index / columns)
    tiles.push({ x: x + column * (width + paddingX), y: y + row * (height + paddingY), width, height })
  }
  return { columns, rows, count, tiles }
}
export function spriteSheetFrameSizeFromCount(extent: number, origin: number, padding: number, count: number): number {
  return Math.max(1, Math.floor((extent - origin - padding * (Math.max(1, count) - 1)) / Math.max(1, count)))
}

/** Flatten the current visible frame; keep out-of-canvas pixels transparent, even for oversized strips. */
export async function buildImportedSpriteSheet(source: SpriteDocument, options: SpriteSheetImportOptions): Promise<SpriteDocument> {
  const plan = spriteSheetImportPlan(source, options)
  if (!plan.count) throw new Error(tr('spriteSheetImport.empty'))
  const check = checkTypedArrayLimit(options.width, options.height, plan.count, 'rgba')
  if (!check.allowed) throw new Error(check.reason)
  const output = createDocument(source.name, options.width, options.height, 'rgba', false)
  const layer = output.layers[0]
  layer.name = tr('spriteSheetImport.layer')
  output.palette = source.palette.map(entry => ({ ...entry, color: { ...entry.color } }))
  output.paletteOrder = [...source.paletteOrder]; output.paletteSlots = source.paletteSlots?.slice()
  output.paletteColumns = source.paletteColumns; output.nextColorId = source.nextColorId
  const frames = plan.tiles.map((_, index) => ({ id: createId('frame'), duration: source.animation?.frames[index]?.duration ?? source.animation?.frames.at(-1)?.duration ?? 100 }))
  const cels = []
  for (const [index, tile] of plan.tiles.entries()) {
    const pixels = new Uint8ClampedArray(tile.width * tile.height * 4)
    const left = Math.max(0, tile.x), top = Math.max(0, tile.y)
    const right = Math.min(source.width, tile.x + tile.width), bottom = Math.min(source.height, tile.y + tile.height)
    if (right > left && bottom > top) {
      const clipped = await compositeRegionAsync(source, left, top, right - left, bottom - top, undefined, undefined, 128)
      for (let row = 0; row < bottom - top; row++) pixels.set(clipped.subarray(row * (right - left) * 4, (row + 1) * (right - left) * 4), ((top - tile.y + row) * tile.width + left - tile.x) * 4)
    }
    cels.push({ id: createId('cel'), layerId: layer.id, frameId: frames[index].id, opacity: 1,
      surface: { format: 'rgba' as const, width: tile.width, height: tile.height, offsetX: 0, offsetY: 0, pixels } })
    if (index % 32 === 31) await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  output.animation = { frames, cels, activeFrameId: frames[0].id, loop: source.animation?.loop ?? true, loopSections: [], groupMasks: [], layerMasks: [] }
  if (layer.format === 'rgba') layer.pixels = cels[0].surface.pixels
  convertDocumentColorMode(output, source.colorMode)
  output.pixelFormat = source.pixelFormat
  return output
}
