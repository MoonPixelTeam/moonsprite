import type { PaletteSlotLayout } from '@shared/types-files'
import type { RgbaColor } from '@shared/types-color'
import { applyIndexedPaletteRemap, findOrAddPaletteColor, remapIndexedDocumentToVisiblePalette, type IndexedPaletteRemap } from '@/core/document-model'
import { colorEquals } from '@/core/raster'
import { loadEditorPreferences } from '@/core/file-preferences'
import { translate, type TranslationKey, type TranslationParams } from '@/core/localization'
import { comparePaletteColors, paletteGradient, type PaletteSortDirection, type PaletteSortMode } from '@/core/palette'
import { normalizePaletteColumns, normalizePaletteSlots, paletteOrderFromSlots } from '@/core/palette-layout'
import { remapSelectionBrushColors } from './workspace-session'
import type { DocumentSession } from './workspace-types'

const tr = (key: TranslationKey, params?: TranslationParams): string => translate(loadEditorPreferences().language, key, params)

const currentPaletteLayout = (session: DocumentSession): { slots: Array<number | null>; columns: number } => {
  const columns = normalizePaletteColumns(session.document.paletteColumns)
  return {
    columns,
    slots: normalizePaletteSlots(
      session.document.palette.map((entry) => entry.id),
      session.document.paletteOrder,
      session.document.paletteSlots,
      columns
    )
  }
}

const applyPaletteSlots = (session: DocumentSession, slots: readonly (number | null)[], columns: number): void => {
  session.document.paletteSlots = [...slots]
  session.document.paletteColumns = normalizePaletteColumns(columns)
  session.document.paletteOrder = paletteOrderFromSlots(slots)
}

export function selectPaletteColors(session: DocumentSession, ids: number[], primaryId: number): void {
  const available = new Set(session.document.paletteOrder)
  session.selectedPaletteIds = [...new Set(ids.filter((id) => available.has(id)))]
  session.paletteSelectionId = session.selectedPaletteIds.includes(primaryId) ? primaryId : session.selectedPaletteIds.at(-1) ?? null
  const active = session.document.palette.find((candidate) => candidate.id === session.paletteSelectionId)
  if (!active) return
  session.primaryColor = { ...active.color }
  if (session.brushImage?.intrinsicSize) session.brushImage = remapSelectionBrushColors(session.brushImage, session.primaryColor, session.secondaryColor)
}

export function selectPaletteColor(session: DocumentSession, id: number, additive = false): void {
  const entry = session.document.palette.find((candidate) => candidate.id === id)
  if (!entry) return
  const selected = !additive
    ? [id]
    : session.selectedPaletteIds.includes(id)
      ? session.selectedPaletteIds.filter((entryId) => entryId !== id)
      : [...session.selectedPaletteIds, id]
  selectPaletteColors(session, selected, id)
}

export function addPaletteColor(session: DocumentSession, color: RgbaColor = session.primaryColor, selectAdded = true): number {
  const id = findOrAddPaletteColor(session.document, color, true)
  session.paletteSelectionId = selectAdded ? id : null
  session.selectedPaletteIds = selectAdded ? [id] : []
  return id
}

export function updatePaletteColor(session: DocumentSession, id: number, color: RgbaColor): void {
  const entry = session.document.palette.find((candidate) => candidate.id === id)
  if (!entry || colorEquals(entry.color, color)) return
  const beforeColor = { ...entry.color }
  const beforePrimary = { ...session.primaryColor }
  const beforeSecondary = { ...session.secondaryColor }
  const apply = (next: RgbaColor): void => {
    entry.color = { ...next }
    if (colorEquals(session.primaryColor, beforeColor)) session.primaryColor = { ...next }
    if (colorEquals(session.secondaryColor, beforeColor)) session.secondaryColor = { ...next }
  }
  apply(color)
  session.history.push({
    label: tr('palette.history.updated'),
    bytes: 32,
    undo: () => {
      entry.color = { ...beforeColor }
      session.primaryColor = { ...beforePrimary }
      session.secondaryColor = { ...beforeSecondary }
    },
    redo: () => apply(color)
  })
}

export function applyPalette(session: DocumentSession, colors: RgbaColor[], layout?: PaletteSlotLayout): void {
  const document = session.document
  const beforeOrder = [...document.paletteOrder]
  const beforeLayout = currentPaletteLayout(session)
  const beforeSlots = beforeLayout.slots
  const beforeColumns = beforeLayout.columns
  const beforeSelected = [...session.selectedPaletteIds]
  const beforePrimary = session.paletteSelectionId
  const colorIds = colors.map((color) => findOrAddPaletteColor(document, color, false))
  const requestedOrder = [...new Set(document.colorMode === 'indexed' ? [0, ...colorIds] : colorIds)]
  const afterColumns = layout ? normalizePaletteColumns(layout.columns) : beforeColumns
  const requestedSlots = layout?.slots.map((colorIndex) => colorIndex === null ? null : colorIds[colorIndex] ?? null)
  const afterSlots = normalizePaletteSlots(document.palette.map((entry) => entry.id), requestedOrder, requestedSlots, afterColumns)
  const afterOrder = paletteOrderFromSlots(afterSlots)
  if (afterColumns === beforeColumns && afterSlots.length === beforeSlots.length && afterSlots.every((id, index) => id === beforeSlots[index])) return
  const matchingCurrent = afterOrder.find((id) => {
    const entry = document.palette.find((candidate) => candidate.id === id)
    return Boolean(entry && colorEquals(entry.color, session.primaryColor))
  })
  const afterSelected = matchingCurrent === undefined ? [] : [matchingCurrent]
  const afterPrimary = matchingCurrent ?? null
  const apply = (order: number[], slots: Array<number | null>, columns: number, selected: number[], primary: number | null): void => {
    document.paletteOrder = [...order]
    document.paletteSlots = [...slots]
    document.paletteColumns = columns
    session.selectedPaletteIds = [...selected]
    session.paletteSelectionId = primary
  }
  apply(afterOrder, afterSlots, afterColumns, afterSelected, afterPrimary)
  const pixelRemap: IndexedPaletteRemap[] = remapIndexedDocumentToVisiblePalette(document)
  const pixelRemapBytes = pixelRemap.reduce((total, change) => total + change.before.byteLength + change.after.byteLength, 0)
  session.history.push({
    label: tr('palette.history.changed'),
    bytes: (beforeOrder.length + afterOrder.length + beforeSlots.length + afterSlots.length + beforeSelected.length + afterSelected.length) * 4 + pixelRemapBytes + 32,
    undo: () => { apply(beforeOrder, beforeSlots, beforeColumns, beforeSelected, beforePrimary); applyIndexedPaletteRemap(pixelRemap, 'before') },
    redo: () => { apply(afterOrder, afterSlots, afterColumns, afterSelected, afterPrimary); applyIndexedPaletteRemap(pixelRemap, 'after') }
  })
}

export function deletePaletteColors(session: DocumentSession, ids: number[]): void {
  const document = session.document
  const removed = new Set(ids.filter((id) => document.paletteOrder.includes(id) && (document.colorMode !== 'indexed' || id !== 0)))
  if (removed.size === 0) return
  const beforeOrder = [...document.paletteOrder]
  const beforeLayout = currentPaletteLayout(session)
  const beforeSlots = beforeLayout.slots
  const beforeColumns = beforeLayout.columns
  const afterSlots = beforeSlots.map((id) => id !== null && removed.has(id) ? null : id)
  const afterOrder = paletteOrderFromSlots(afterSlots)
  const beforeSelected = [...session.selectedPaletteIds]
  const beforePrimary = session.paletteSelectionId
  const afterSelected = beforeSelected.filter((id) => !removed.has(id))
  const afterPrimary = afterSelected.includes(beforePrimary ?? -1) ? beforePrimary : afterSelected.at(-1) ?? null
  document.paletteOrder = afterOrder
  document.paletteSlots = afterSlots
  document.paletteColumns = beforeColumns
  session.selectedPaletteIds = afterSelected
  session.paletteSelectionId = afterPrimary
  const pixelRemap: IndexedPaletteRemap[] = remapIndexedDocumentToVisiblePalette(document)
  const pixelRemapBytes = pixelRemap.reduce((total, change) => total + change.before.byteLength + change.after.byteLength, 0)
  session.history.push({
    label: removed.size > 1 ? tr('palette.history.deletedMany') : tr('palette.history.deleted'),
    bytes: (beforeOrder.length + afterOrder.length + beforeSlots.length + afterSlots.length + beforeSelected.length + afterSelected.length) * 4 + pixelRemapBytes + 32,
    undo: () => { document.paletteOrder = [...beforeOrder]; document.paletteSlots = [...beforeSlots]; document.paletteColumns = beforeColumns; session.selectedPaletteIds = [...beforeSelected]; session.paletteSelectionId = beforePrimary; applyIndexedPaletteRemap(pixelRemap, 'before') },
    redo: () => { document.paletteOrder = [...afterOrder]; document.paletteSlots = [...afterSlots]; document.paletteColumns = beforeColumns; session.selectedPaletteIds = [...afterSelected]; session.paletteSelectionId = afterPrimary; applyIndexedPaletteRemap(pixelRemap, 'after') }
  })
}

export function movePaletteColor(session: DocumentSession, direction: -1 | 1): void {
  const layout = currentPaletteLayout(session)
  const slots = layout.slots
  const currentIndex = slots.indexOf(session.paletteSelectionId ?? -1)
  const targetIndex = currentIndex + direction
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= slots.length) return
  const before = [...slots]
  const after = [...slots]
  ;[after[currentIndex], after[targetIndex]] = [after[targetIndex], after[currentIndex]]
  applyPaletteSlots(session, after, layout.columns)
  session.history.push({ label: tr('palette.history.reordered'), bytes: (before.length + after.length) * 4, undo: () => applyPaletteSlots(session, before, layout.columns), redo: () => applyPaletteSlots(session, after, layout.columns) })
}

export function reorderPaletteColors(session: DocumentSession, ids: number[], targetSlots: Array<number | null>, targetColumns: number): void {
  const beforeLayout = currentPaletteLayout(session)
  const before = beforeLayout.slots
  const afterColumns = normalizePaletteColumns(targetColumns)
  const after = normalizePaletteSlots(session.document.palette.map((entry) => entry.id), session.document.paletteOrder, targetSlots, afterColumns)
  if (afterColumns === beforeLayout.columns && after.length === before.length && after.every((id, index) => id === before[index])) return
  const movingCount = ids.filter((id) => before.includes(id)).length
  applyPaletteSlots(session, after, afterColumns)
  session.history.push({
    label: movingCount > 1 ? tr('palette.history.reorderedMany') : tr('palette.history.reordered'),
    bytes: (before.length + after.length) * 4,
    undo: () => applyPaletteSlots(session, before, beforeLayout.columns),
    redo: () => applyPaletteSlots(session, after, afterColumns)
  })
}

export function sortPaletteColors(session: DocumentSession, mode: PaletteSortMode, direction: PaletteSortDirection): void {
  const beforeLayout = currentPaletteLayout(session)
  const before = beforeLayout.slots
  const entriesById = new Map(session.document.palette.map((entry) => [entry.id, entry]))
  const indexedTransparentId = session.document.colorMode === 'indexed' && session.document.paletteOrder.includes(0) ? 0 : null
  const sorted = session.document.paletteOrder
    .filter((id) => id !== indexedTransparentId && entriesById.has(id))
    .map((id, index) => ({ id, index, color: entriesById.get(id)!.color }))
    .sort((left, right) => comparePaletteColors(left.color, right.color, mode, direction) || left.index - right.index)
    .map((entry) => entry.id)
  const ordered = indexedTransparentId === null ? sorted : [indexedTransparentId, ...sorted]
  const after = [...ordered, ...new Array<number | null>(Math.max(0, before.length - ordered.length)).fill(null)]
  if (after.length === before.length && after.every((id, index) => id === before[index])) return
  applyPaletteSlots(session, after, beforeLayout.columns)
  session.history.push({
    label: tr('palette.history.sorted'),
    bytes: (before.length + after.length) * 4,
    undo: () => applyPaletteSlots(session, before, beforeLayout.columns),
    redo: () => applyPaletteSlots(session, after, beforeLayout.columns)
  })
}

const paletteOperationIds = (session: DocumentSession): number[] => {
  const selected = new Set(session.selectedPaletteIds)
  const selectedInOrder = session.document.paletteOrder.filter((id) => selected.has(id))
  return selectedInOrder.length >= 2 ? selectedInOrder : [...session.document.paletteOrder]
    .filter((id) => session.document.colorMode !== 'indexed' || id !== 0)
}

const applyPaletteColors = (session: DocumentSession, ids: readonly number[], colors: readonly RgbaColor[], label: TranslationKey): void => {
  const entriesById = new Map(session.document.palette.map((entry) => [entry.id, entry]))
  const changes = ids.flatMap((id, index) => {
    const entry = entriesById.get(id)
    const color = colors[index]
    return entry && color && !colorEquals(entry.color, color) ? [{ entry, before: { ...entry.color }, after: { ...color } }] : []
  })
  if (changes.length === 0) return
  const apply = (key: 'before' | 'after'): void => {
    for (const change of changes) change.entry.color = { ...change[key] }
  }
  apply('after')
  session.history.push({
    label: tr(label),
    bytes: changes.length * 40,
    undo: () => apply('before'),
    redo: () => apply('after')
  })
}

export function reversePaletteColors(session: DocumentSession): void {
  const ids = paletteOperationIds(session)
  const colorsById = new Map(session.document.palette.map((entry) => [entry.id, entry.color]))
  const reversed = ids.map((id) => colorsById.get(id)!).reverse()
  applyPaletteColors(session, ids, reversed, 'palette.history.reversed')
}

export function gradientPaletteColors(session: DocumentSession, byHue: boolean): void {
  const selected = new Set(session.selectedPaletteIds)
  const ids = session.document.paletteOrder.filter((id) => selected.has(id))
  if (ids.length < 2) return
  const entriesById = new Map(session.document.palette.map((entry) => [entry.id, entry]))
  const start = entriesById.get(ids[0])?.color
  const end = entriesById.get(ids.at(-1)!)?.color
  if (!start || !end) return
  applyPaletteColors(session, ids, paletteGradient(start, end, ids.length, byHue), byHue ? 'palette.history.hueGradient' : 'palette.history.gradient')
}

export function gradientPaletteSlots(session: DocumentSession, slotIndices: number[], sourceSlots: Array<number | null>, columns: number, byHue: boolean): void {
  const indices = [...new Set(slotIndices.filter((index) => Number.isSafeInteger(index) && index >= 0))].sort((left, right) => left - right)
  if (indices.length < 2) return
  const document = session.document
  const beforePalette = document.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
  const beforeOrder = [...document.paletteOrder]
  const beforeLayout = currentPaletteLayout(session)
  const beforeNextColorId = document.nextColorId
  const afterColumns = normalizePaletteColumns(columns)
  const afterSlots = normalizePaletteSlots(document.palette.map((entry) => entry.id), document.paletteOrder, sourceSlots, afterColumns)
  const requiredLength = Math.max(...indices) + 1
  while (afterSlots.length < requiredLength) afterSlots.push(...new Array<number | null>(afterColumns).fill(null))
  const entriesById = new Map(document.palette.map((entry) => [entry.id, entry]))
  const firstColor = entriesById.get(afterSlots[indices[0]] ?? -1)?.color ?? session.primaryColor
  const lastColor = entriesById.get(afterSlots[indices.at(-1)!] ?? -1)?.color ?? session.secondaryColor
  const colors = paletteGradient(firstColor, lastColor, indices.length, byHue)
  for (let offset = 0; offset < indices.length; offset += 1) {
    const slot = indices[offset]
    const existing = entriesById.get(afterSlots[slot] ?? -1)
    if (existing) {
      existing.color = { ...colors[offset] }
      continue
    }
    const id = document.nextColorId++
    const entry = { id, name: tr('core.document.colorName', { id }), color: { ...colors[offset] } }
    document.palette.push(entry)
    entriesById.set(id, entry)
    afterSlots[slot] = id
  }
  document.paletteSlots = afterSlots
  document.paletteColumns = afterColumns
  document.paletteOrder = paletteOrderFromSlots(afterSlots)
  const afterPalette = document.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
  const afterOrder = [...document.paletteOrder]
  const afterNextColorId = document.nextColorId
  const apply = (palette: typeof afterPalette, order: number[], slots: Array<number | null>, targetColumns: number, nextColorId: number): void => {
    document.palette = palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
    document.paletteOrder = [...order]
    document.paletteSlots = [...slots]
    document.paletteColumns = targetColumns
    document.nextColorId = nextColorId
  }
  session.history.push({
    label: tr(byHue ? 'palette.history.hueGradient' : 'palette.history.gradient'),
    bytes: (beforePalette.length + afterPalette.length) * 40 + (beforeLayout.slots.length + afterSlots.length) * 4,
    undo: () => apply(beforePalette, beforeOrder, beforeLayout.slots, beforeLayout.columns, beforeNextColorId),
    redo: () => apply(afterPalette, afterOrder, afterSlots, afterColumns, afterNextColorId)
  })
}
