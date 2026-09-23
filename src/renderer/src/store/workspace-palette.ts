import type { PaletteSlotLayout } from '@shared/types-files'
import type { RgbaColor } from '@shared/types-color'
import { applyIndexedPaletteRemap, findOrAddPaletteColor, remapIndexedDocumentToVisiblePalette, type IndexedPaletteRemap } from '@/core/document-model'
import { colorEquals } from '@/core/raster'
import { loadEditorPreferences } from '@/core/file-preferences'
import { translate, type TranslationKey, type TranslationParams } from '@/core/localization'
import { comparePaletteColors, paletteGradient, type PaletteSortDirection, type PaletteSortMode } from '@/core/palette'
import { addPaletteIdToSlots, normalizePaletteColumns, normalizePaletteSlots, paletteOrderFromSlots, repositionPaletteSlots } from '@/core/palette-layout'
import { remapSelectionBrushColors } from './workspace-session'
import type { DocumentSession, PaletteColorTarget } from './workspace-types'

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

const capturePaletteEdit = (session: DocumentSession) => ({
  entries: session.document.palette.map(entry => ({ entry, color: { ...entry.color } })),
  layout: currentPaletteLayout(session),
  nextColorId: session.document.nextColorId,
  selected: [...session.selectedPaletteIds],
  primaryId: session.paletteSelectionId,
  primaryColor: { ...session.primaryColor }
})

const recordPaletteEdit = (session: DocumentSession, before: ReturnType<typeof capturePaletteEdit>, selection?: PaletteColorTarget['selection']): void => {
  const after = capturePaletteEdit(session)
  if (before.entries.length === after.entries.length && before.entries.every((item, index) => item.entry.id === after.entries[index].entry.id && colorEquals(item.color, after.entries[index].color))
    && before.layout.columns === after.layout.columns && before.layout.slots.length === after.layout.slots.length
    && before.layout.slots.every((id, index) => id === after.layout.slots[index])) return
  const apply = (snapshot: typeof before, view?: NonNullable<typeof selection>['before']): void => {
    // Preserve entry objects used by earlier color-edit history commands.
    session.document.palette = snapshot.entries.map(({ entry, color }) => { entry.color = { ...color }; return entry })
    session.document.nextColorId = snapshot.nextColorId
    applyPaletteSlots(session, snapshot.layout.slots, snapshot.layout.columns)
    session.selectedPaletteIds = [...snapshot.selected]
    session.paletteSelectionId = snapshot.primaryId
    session.primaryColor = { ...snapshot.primaryColor }
    if (view) session.paletteSelectionRestore = { ...view, boxSelection: view.boxSelection ? { ...view.boxSelection } : null }
  }
  session.history.push({
    label: tr('palette.history.updated'),
    bytes: (before.entries.length + after.entries.length) * 40 + (before.layout.slots.length + after.layout.slots.length) * 4 + 64,
    undo: () => apply(before, selection?.before), redo: () => apply(after, selection?.after)
  })
}

const createPaletteColor = (session: DocumentSession, color: RgbaColor, visible: boolean): number => {
  if (color.a !== 0) return findOrAddPaletteColor(session.document, color, visible, true)
  // Transparent swatches are independent slots too; never reuse reserved ID 0.
  const id = session.document.nextColorId++
  session.document.palette.push({ id, name: tr('core.document.colorName', { id }), color: { ...color } })
  if (visible) {
    const layout = currentPaletteLayout(session)
    applyPaletteSlots(session, addPaletteIdToSlots(layout.slots, id, layout.columns), layout.columns)
  }
  return id
}

export function addPaletteColor(session: DocumentSession, color: RgbaColor = session.primaryColor, selectAdded = true, target?: PaletteColorTarget): number {
  const before = capturePaletteEdit(session)
  // Palette entries are slots, not a set of unique colors.  Creating a new
  // swatch must therefore keep a distinct id even when the RGBA value already
  // exists elsewhere in the palette.
  const id = createPaletteColor(session, color, true)
  if (target && target.indices.length > 0) {
    const slots = addPaletteIdToSlots(target.slots, id, target.columns)
    applyPaletteSlots(session, repositionPaletteSlots(slots, [id], target.indices[0], id, target.columns), target.columns)
  }
  session.paletteSelectionId = selectAdded ? id : null
  session.selectedPaletteIds = selectAdded ? [id] : []
  recordPaletteEdit(session, before)
  return id
}

export function pastePaletteColors(session: DocumentSession, colors: readonly RgbaColor[], target?: PaletteColorTarget): number[] {
  if (colors.length === 0) return []
  const before = capturePaletteEdit(session)
  const selectedIds = session.document.paletteOrder.filter((id) => session.selectedPaletteIds.includes(id))
  const layout = target ?? { ...before.layout, indices: selectedIds.map(id => before.layout.slots.indexOf(id)) }
  const indices = [...new Set(layout.indices.filter(index => Number.isSafeInteger(index) && index >= 0))]
  const ids: number[] = []
  if (indices.length > 0) {
    const slots = normalizePaletteSlots(session.document.palette.map(entry => entry.id), session.document.paletteOrder, layout.slots, layout.columns)
    for (let index = 0; index < Math.min(colors.length, indices.length); index++) {
      const slot = indices[index]
      while (slots.length <= slot) slots.push(null)
      const existing = session.document.palette.find(entry => entry.id === slots[slot])
      // Indexed zero remains the reserved transparent color.
      if (existing?.id === 0 && session.document.colorMode === 'indexed') continue
      if (existing) {
        existing.color = { ...colors[index] }
        ids.push(existing.id)
      } else {
        const id = createPaletteColor(session, colors[index], false)
        slots[slot] = id
        ids.push(id)
      }
    }
    applyPaletteSlots(session, normalizePaletteSlots(session.document.palette.map(entry => entry.id), paletteOrderFromSlots(slots), slots, layout.columns), layout.columns)
  } else {
    ids.push(...colors.map(color => createPaletteColor(session, color, true)))
  }
  const selected = [...new Set(ids.filter((id) => session.document.paletteOrder.includes(id)))]
  const primaryId = selected.at(-1) ?? null
  session.selectedPaletteIds = selected
  session.paletteSelectionId = primaryId
  const active = primaryId === null ? null : session.document.palette.find((entry) => entry.id === primaryId)
  if (active) session.primaryColor = { ...active.color }
  if (target?.selection) session.paletteSelectionRestore = { ...target.selection.after }
  recordPaletteEdit(session, before, target?.selection)
  return selected
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
  const usedPaletteIds = new Set<number>()
  const colorIds = colors.map((color) => {
    // Reuse duplicate entries in order, but create a new entry when the
    // imported palette contains more occurrences than the document currently
    // has. This preserves repeated colors without accumulating hidden copies
    // every time the same palette is opened.
    const reusable = document.palette.find((entry) => !usedPaletteIds.has(entry.id) && colorEquals(entry.color, color))
    if (reusable) {
      usedPaletteIds.add(reusable.id)
      return reusable.id
    }
    const id = findOrAddPaletteColor(document, color, false, true)
    usedPaletteIds.add(id)
    return id
  })
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
