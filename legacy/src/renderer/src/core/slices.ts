import type { DocumentSlice } from '@shared/types-document'
import type { SelectionRect } from '@shared/types-selection'

export interface AutoSliceSettings {
  width: number
  height: number
  gapX: number
  gapY: number
  startX: number
  startY: number
}

export const MAX_AUTO_SLICES = 10_000

const finiteInteger = (value: unknown): number | null => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : null
}

export const sanitizeSliceName = (value: unknown, fallback = 'Slice'): string => {
  const name = typeof value === 'string' ? value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '') : ''
  return name || fallback
}

export function clampSliceRect(rect: SelectionRect, documentWidth: number, documentHeight: number): SelectionRect {
  const maxWidth = Math.max(1, Math.round(documentWidth))
  const maxHeight = Math.max(1, Math.round(documentHeight))
  const x = Math.max(0, Math.min(maxWidth - 1, Math.round(rect.x)))
  const y = Math.max(0, Math.min(maxHeight - 1, Math.round(rect.y)))
  const width = Math.max(1, Math.min(maxWidth - x, Math.round(rect.width)))
  const height = Math.max(1, Math.min(maxHeight - y, Math.round(rect.height)))
  return { x, y, width, height }
}

export function normalizeDocumentSlices(value: unknown, documentWidth: number, documentHeight: number): DocumentSlice[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const slices: DocumentSlice[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Record<string, unknown>
    const rawId = typeof candidate.id === 'string' ? candidate.id.trim() : ''
    const x = finiteInteger(candidate.x)
    const y = finiteInteger(candidate.y)
    const width = finiteInteger(candidate.width)
    const height = finiteInteger(candidate.height)
    if (!rawId || ids.has(rawId) || x === null || y === null || width === null || height === null || width < 1 || height < 1) continue
    const bounds = clampSliceRect({ x, y, width, height }, documentWidth, documentHeight)
    ids.add(rawId)
    slices.push({ id: rawId, name: sanitizeSliceName(candidate.name, `Slice ${slices.length + 1}`), ...bounds })
  }
  return slices
}

export const sliceAtPoint = (slices: readonly DocumentSlice[], x: number, y: number): DocumentSlice | null => {
  for (let index = slices.length - 1; index >= 0; index -= 1) {
    const slice = slices[index]
    if (x >= slice.x && y >= slice.y && x < slice.x + slice.width && y < slice.y + slice.height) return slice
  }
  return null
}

export const moveSliceRect = (slice: SelectionRect, deltaX: number, deltaY: number, documentWidth: number, documentHeight: number): SelectionRect => ({
  ...slice,
  x: Math.max(0, Math.min(documentWidth - slice.width, Math.round(slice.x + deltaX))),
  y: Math.max(0, Math.min(documentHeight - slice.height, Math.round(slice.y + deltaY)))
})

export function moveSliceRects(slices: readonly SelectionRect[], deltaX: number, deltaY: number, documentWidth: number, documentHeight: number): SelectionRect[] {
  if (slices.length === 0) return []
  const left = Math.min(...slices.map((slice) => slice.x))
  const top = Math.min(...slices.map((slice) => slice.y))
  const right = Math.max(...slices.map((slice) => slice.x + slice.width))
  const bottom = Math.max(...slices.map((slice) => slice.y + slice.height))
  const x = Math.max(-left, Math.min(documentWidth - right, Math.round(deltaX)))
  const y = Math.max(-top, Math.min(documentHeight - bottom, Math.round(deltaY)))
  return slices.map((slice) => ({ ...slice, x: slice.x + x, y: slice.y + y }))
}

export function autoSliceCount(documentWidth: number, documentHeight: number, settings: AutoSliceSettings): number {
  const width = Math.max(1, Math.round(settings.width))
  const height = Math.max(1, Math.round(settings.height))
  const gapX = Math.max(0, Math.round(settings.gapX))
  const gapY = Math.max(0, Math.round(settings.gapY))
  const startX = Math.max(0, Math.round(settings.startX))
  const startY = Math.max(0, Math.round(settings.startY))
  if (width > documentWidth || height > documentHeight || startX + width > documentWidth || startY + height > documentHeight) return 0
  const columns = Math.floor((documentWidth - startX + gapX) / (width + gapX))
  const rows = Math.floor((documentHeight - startY + gapY) / (height + gapY))
  return Math.max(0, columns) * Math.max(0, rows)
}

export function autoSliceRects(documentWidth: number, documentHeight: number, settings: AutoSliceSettings, limit = MAX_AUTO_SLICES): SelectionRect[] {
  const width = Math.max(1, Math.round(settings.width))
  const height = Math.max(1, Math.round(settings.height))
  const gapX = Math.max(0, Math.round(settings.gapX))
  const gapY = Math.max(0, Math.round(settings.gapY))
  const startX = Math.max(0, Math.round(settings.startX))
  const startY = Math.max(0, Math.round(settings.startY))
  if (limit < 1) return []
  const columns = Math.floor((documentWidth - startX + gapX) / (width + gapX))
  const rows = Math.floor((documentHeight - startY + gapY) / (height + gapY))
  const count = autoSliceCount(documentWidth, documentHeight, settings)
  if (count < 1 || count > limit) return []
  const slices: SelectionRect[] = []
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    slices.push({ x: startX + column * (width + gapX), y: startY + row * (height + gapY), width, height })
  }
  return slices
}

export const sliceExportFileName = (slice: DocumentSlice, extension: string, used: Set<string>): string => {
  const stem = sanitizeSliceName(slice.name, 'Slice')
  let candidate = stem
  let suffix = 2
  while (used.has(candidate.toLocaleLowerCase())) candidate = `${stem}-${suffix++}`
  used.add(candidate.toLocaleLowerCase())
  return `${candidate}.${extension}`
}
