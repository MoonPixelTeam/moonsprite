import type { PaletteEntry, RgbaColor } from '@shared/types-color'
import { colorEquals } from './raster'

export type PaletteSwatchSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge'
export const PALETTE_SWATCH_PIXELS: Record<PaletteSwatchSize, number> = { tiny: 22, small: 30, medium: 40, large: 52, huge: 64 }
export const PALETTE_SWATCH_GAP = 0
export const PALETTE_GRID_COLUMNS = 8
export const isPaletteDeleteKey = (key: string): boolean => key === 'Delete' || key === 'Backspace'

export const normalizePaletteColumns = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) ? Math.max(1, Math.min(256, value)) : PALETTE_GRID_COLUMNS

const paletteSlotCount = (minimum: number, columns: number): number =>
  Math.max(columns, Math.ceil(Math.max(0, minimum) / columns) * columns)

export const paletteOrderFromSlots = (slots: readonly (number | null)[]): number[] => {
  const seen = new Set<number>()
  return slots.flatMap((id) => {
    if (id === null || seen.has(id)) return []
    seen.add(id)
    return [id]
  })
}

export const visiblePaletteColors = (palette: readonly PaletteEntry[], paletteOrder: readonly number[]): RgbaColor[] => {
  const entriesById = new Map(palette.map((entry) => [entry.id, entry]))
  return paletteOrder.flatMap((id) => {
    const entry = entriesById.get(id)
    return entry ? [entry.color] : []
  })
}

export const normalizePaletteSlots = (
  paletteIds: readonly number[],
  paletteOrder: readonly number[],
  source?: readonly unknown[],
  requestedColumns = PALETTE_GRID_COLUMNS
): Array<number | null> => {
  const columns = normalizePaletteColumns(requestedColumns)
  const paletteIdSet = new Set(paletteIds)
  const visibleIds: number[] = []
  const visibleIdSet = new Set<number>()
  for (const id of paletteOrder) {
    if (!paletteIdSet.has(id) || visibleIdSet.has(id)) continue
    visibleIds.push(id)
    visibleIdSet.add(id)
  }
  const visibleSet = new Set(visibleIds)
  const slots = new Array<number | null>(paletteSlotCount(Math.max(source?.length ?? 0, visibleIds.length), columns)).fill(null)
  const placed = new Set<number>()

  if (source) {
    for (let index = 0; index < Math.min(source.length, slots.length); index += 1) {
      const id = source[index]
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || !visibleSet.has(id) || placed.has(id)) continue
      slots[index] = id
      placed.add(id)
    }
  }

  for (const id of visibleIds) {
    if (placed.has(id)) continue
    let index = slots.indexOf(null)
    if (index < 0) {
      index = slots.length
      slots.push(...new Array<number | null>(columns).fill(null))
    }
    slots[index] = id
    placed.add(id)
  }
  return slots
}

export const addPaletteIdToSlots = (slots: readonly (number | null)[], id: number, requestedColumns = PALETTE_GRID_COLUMNS): Array<number | null> => {
  if (slots.includes(id)) return [...slots]
  const columns = normalizePaletteColumns(requestedColumns)
  const next = [...slots]
  const emptyIndex = next.indexOf(null)
  if (emptyIndex >= 0) next[emptyIndex] = id
  else next.push(id, ...new Array<number | null>(columns - 1).fill(null))
  return next
}

export interface PaletteGridLayout {
  slots: Array<number | null>
  columns: number
  rows: number
}

export const fitPaletteSlotsToGrid = (
  slots: readonly (number | null)[],
  sourceColumnCount: number,
  requestedColumnCount: number,
  requestedRowCount: number
): PaletteGridLayout => {
  const sourceColumns = normalizePaletteColumns(sourceColumnCount)
  const entries = slots.flatMap((id, index) => id === null ? [] : [{ id, x: index % sourceColumns, y: Math.floor(index / sourceColumns) }])
  const occupiedColumns = entries.reduce((maximum, entry) => Math.max(maximum, entry.x + 1), 1)
  const occupiedRows = entries.reduce((maximum, entry) => Math.max(maximum, entry.y + 1), 1)
  const columns = Math.max(normalizePaletteColumns(requestedColumnCount), occupiedColumns)
  const rows = Math.max(1, Math.trunc(requestedRowCount), occupiedRows)
  const next = new Array<number | null>(columns * rows).fill(null)
  for (const entry of entries) next[entry.y * columns + entry.x] = entry.id
  return { slots: next, columns, rows }
}

export const paletteGridCapacity = (width: number, height: number, swatchSize: number, gap = PALETTE_SWATCH_GAP, padding = 8): { columns: number; rows: number } => ({
  columns: Math.max(1, Math.floor((Math.max(0, width - padding * 2) + gap) / (swatchSize + gap))),
  rows: Math.max(1, Math.floor((Math.max(0, height - padding * 2) + gap) / (swatchSize + gap)))
})

export const paletteRangeIds = (slots: readonly (number | null)[], columns: number, anchorId: number, targetId: number): number[] => {
  const normalizedColumns = normalizePaletteColumns(columns)
  const anchorIndex = slots.indexOf(anchorId)
  const targetIndex = slots.indexOf(targetId)
  if (anchorIndex < 0 || targetIndex < 0) return [targetId]
  const left = Math.min(anchorIndex % normalizedColumns, targetIndex % normalizedColumns)
  const right = Math.max(anchorIndex % normalizedColumns, targetIndex % normalizedColumns)
  const top = Math.min(Math.floor(anchorIndex / normalizedColumns), Math.floor(targetIndex / normalizedColumns))
  const bottom = Math.max(Math.floor(anchorIndex / normalizedColumns), Math.floor(targetIndex / normalizedColumns))
  const result: number[] = []
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    const id = slots[y * normalizedColumns + x]
    if (id !== null) result.push(id)
  }
  return result
}

export const paletteSlotRange = (columns: number, startSlot: number, endSlot: number): { left: number; top: number; right: number; bottom: number } => {
  const normalizedColumns = normalizePaletteColumns(columns)
  const start = Math.max(0, Math.trunc(startSlot))
  const end = Math.max(0, Math.trunc(endSlot))
  return {
    left: Math.min(start % normalizedColumns, end % normalizedColumns),
    top: Math.min(Math.floor(start / normalizedColumns), Math.floor(end / normalizedColumns)),
    right: Math.max(start % normalizedColumns, end % normalizedColumns),
    bottom: Math.max(Math.floor(start / normalizedColumns), Math.floor(end / normalizedColumns))
  }
}

export const paletteRangeIdsBySlots = (slots: readonly (number | null)[], columns: number, startSlot: number, endSlot: number): number[] => {
  const range = paletteSlotRange(columns, startSlot, endSlot)
  const result: number[] = []
  for (let y = range.top; y <= range.bottom; y += 1) for (let x = range.left; x <= range.right; x += 1) {
    const id = slots[y * normalizePaletteColumns(columns) + x]
    if (id !== null && id !== undefined) result.push(id)
  }
  return result
}

export type PaletteSelectionBoundarySide = 'top' | 'right' | 'bottom' | 'left'
export interface PaletteSelectionBoundaryEdge {
  slot: number
  side: PaletteSelectionBoundarySide
}

/** Returns only the outer edges of selected occupied slots, including turns. */
export const paletteSelectionBoundaryEdges = (
  slots: readonly (number | null)[],
  columns: number,
  selectedIds: readonly number[]
): PaletteSelectionBoundaryEdge[] => {
  const normalizedColumns = normalizePaletteColumns(columns)
  const selected = new Set(selectedIds)
  const isSelected = (slot: number): boolean => {
    const id = slots[slot]
    return id !== null && id !== undefined && selected.has(id)
  }
  const edges: PaletteSelectionBoundaryEdge[] = []
  for (let slot = 0; slot < slots.length; slot += 1) {
    if (!isSelected(slot)) continue
    const column = slot % normalizedColumns
    if (!isSelected(slot - normalizedColumns)) edges.push({ slot, side: 'top' })
    if (column === normalizedColumns - 1 || !isSelected(slot + 1)) edges.push({ slot, side: 'right' })
    if (!isSelected(slot + normalizedColumns)) edges.push({ slot, side: 'bottom' })
    if (column === 0 || !isSelected(slot - 1)) edges.push({ slot, side: 'left' })
  }
  return edges
}

export const repositionPaletteSlots = (
  slots: readonly (number | null)[],
  ids: readonly number[],
  targetSlot: number,
  anchorId: number,
  requestedColumns = PALETTE_GRID_COLUMNS
): Array<number | null> => {
  const columns = normalizePaletteColumns(requestedColumns)
  const selected = new Set(ids)
  const moving = slots.flatMap((id, index) => id !== null && selected.has(id)
    ? [{ id, index, x: index % columns, y: Math.floor(index / columns) }]
    : [])
  const anchor = moving.find((entry) => entry.id === anchorId) ?? moving[0]
  if (!anchor) return [...slots]

  const targetIndex = Math.max(0, Math.trunc(targetSlot))
  const targetX = targetIndex % columns
  const targetY = Math.floor(targetIndex / columns)
  const minimumX = Math.min(...moving.map((entry) => entry.x))
  const maximumX = Math.max(...moving.map((entry) => entry.x))
  const minimumY = Math.min(...moving.map((entry) => entry.y))
  const deltaX = Math.max(-minimumX, Math.min(columns - 1 - maximumX, targetX - anchor.x))
  const deltaY = Math.max(-minimumY, targetY - anchor.y)
  const destinations = moving.map((entry) => (entry.y + deltaY) * columns + entry.x + deltaX)
  const requiredLength = Math.max(...destinations) + 1
  const next = [...slots, ...new Array<number | null>(Math.max(0, paletteSlotCount(requiredLength, columns) - slots.length)).fill(null)]
  const sourceSlots: number[] = []
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== null && selected.has(next[index]!)) {
      sourceSlots.push(index)
      next[index] = null
    }
  }

  const displaced: number[] = []
  for (let offset = 0; offset < moving.length; offset += 1) {
    const destination = destinations[offset]
    const occupant = next[destination]
    if (occupant !== null) displaced.push(occupant)
    next[destination] = moving[offset].id
  }

  const destinationSet = new Set(destinations)
  for (const id of displaced) {
    let destination = sourceSlots.find((index) => !destinationSet.has(index) && next[index] === null)
    if (destination === undefined) destination = next.findIndex((entry, index) => entry === null && !destinationSet.has(index))
    if (destination < 0) {
      destination = next.length
      next.push(...new Array<number | null>(columns).fill(null))
    }
    next[destination] = id
  }
  return next
}

export const paletteColorsEqual = (left: RgbaColor[], right: RgbaColor[]): boolean =>
  left.length === right.length && left.every((color, index) => colorEquals(color, right[index]))

export const paletteMarkerColor = (color: RgbaColor): string => {
  if (color.a < 128) return '#090a0d'
  const linear = (channel: number): number => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = linear(color.r) * 0.2126 + linear(color.g) * 0.7152 + linear(color.b) * 0.0722
  return luminance > 0.179 ? '#090a0d' : '#fff'
}

export const paletteColorRoles = (color: RgbaColor, primary: RgbaColor, secondary: RgbaColor): { primary: boolean; secondary: boolean } => ({
  primary: colorEquals(color, primary),
  secondary: colorEquals(color, secondary)
})
