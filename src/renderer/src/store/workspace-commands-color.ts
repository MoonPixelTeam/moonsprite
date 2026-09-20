import { completeDocumentChange } from './workspace-document-change'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import type { PixelFormat } from '@shared/types-raster'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { commitPixelEdit, revertPixelEdit, type HistoryEntry, type PixelEdit } from '@/core/history'
import { isLayerEffectivelyLocked } from '@/core/document-model'
import { animationLayerAtFrame, ensureAnimationDocument, parseAnimationCelKey, syncActiveAnimationFrame } from '@/core/animation'
import { resolveAnimationLoopSectionRange } from '@/core/animation-loop-sections'
import { replaceLayerColor } from '@/core/tools-fill'
import { colorEquals } from '@/core/raster'
import { readStoredString } from '@/core/storage'
import { persistColorRolePreferences } from '@/core/color-role-preferences'
import { activePaintLayer, remapSelectionBrushColors } from './workspace-session'
import { addPaletteColor as addPaletteColorCommand, applyPalette as applyPaletteCommand, deletePaletteColors as deletePaletteColorsCommand, gradientPaletteColors as gradientPaletteColorsCommand, gradientPaletteSlots as gradientPaletteSlotsCommand, movePaletteColor as movePaletteColorCommand, pastePaletteColors as pastePaletteColorsCommand, reorderPaletteColors as reorderPaletteColorsCommand, reversePaletteColors as reversePaletteColorsCommand, selectPaletteColor as selectPaletteColorCommand, selectPaletteColors as selectPaletteColorsCommand, sortPaletteColors as sortPaletteColorsCommand, updatePaletteColor as updatePaletteColorCommand } from './workspace-palette'
import type { ColorReplacementPreview, ColorReplacementTarget } from './workspace-state'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceColorCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { quantizePixelColor } from '@/core/pixel-format'

const cloneColorReplacementPalette = (palette: SpriteDocument['palette']): SpriteDocument['palette'] =>
  palette.map((entry) => ({ ...entry, color: { ...entry.color } }))

const colorReplacementPalettesEqual = (left: SpriteDocument['palette'], right: SpriteDocument['palette']): boolean =>
  left.length === right.length && left.every((entry, index) => {
    const candidate = right[index]
    return Boolean(candidate && entry.id === candidate.id && colorEquals(entry.color, candidate.color))
  })

interface ColorReplacementResult {
  edits: PixelEdit[]
  pixelCount: number
  paletteCount: number
  lockedCount: number
}

const applyColorReplacementTarget = (session: DocumentSession, target: ColorReplacementTarget, sourceColor: RgbaColor, replacementColor: RgbaColor): ColorReplacementResult => {
  const edits: PixelEdit[] = []
  const seenPixels = new Set<object>()
  let lockedCount = 0
  const collect = (layer: RasterLayer | null, frameId?: string, selection: SelectionMask | null = null): void => {
    if (!layer || seenPixels.has(layer.pixels)) return
    seenPixels.add(layer.pixels)
    if (isLayerEffectivelyLocked(session.document, layer)) {
      lockedCount += 1
      return
    }
    const edit = replaceLayerColor(session.document, layer, sourceColor, replacementColor, selection)
    if (!edit) return
    if (frameId) edit.frameId = frameId
    edits.push(edit)
  }

  syncActiveAnimationFrame(session.document)
  const timeline = ensureAnimationDocument(session.document)
  if (target === 'palette') {
    let paletteCount = 0
    for (const entry of session.document.palette) {
      if (entry.id === 0 || !colorEquals(entry.color, sourceColor)) continue
      entry.color = { ...replacementColor }
      paletteCount += 1
    }
    if (colorEquals(session.primaryColor, sourceColor)) session.primaryColor = { ...replacementColor }
    if (colorEquals(session.secondaryColor, sourceColor)) session.secondaryColor = { ...replacementColor }
    return { edits, pixelCount: 0, paletteCount, lockedCount }
  }

  if (target === 'layer') {
    collect(activePaintLayer(session), timeline.activeFrameId)
  } else if (target === 'selection') {
    if (session.selection) collect(activePaintLayer(session), timeline.activeFrameId, session.selection)
  } else if (target === 'document') {
    for (const frame of timeline.frames) for (const layer of session.document.layers) collect(animationLayerAtFrame(session.document, layer.id, frame.id), frame.id)
  } else if (target === 'layers') {
    const layerIds = new Set(session.selectedLayerIds)
    for (const frame of timeline.frames) for (const layerId of layerIds) collect(animationLayerAtFrame(session.document, layerId, frame.id), frame.id)
  } else if (target === 'frames') {
    const frameIds = new Set(session.selectedAnimationFrameIds)
    for (const frameId of frameIds) for (const layer of session.document.layers) collect(animationLayerAtFrame(session.document, layer.id, frameId), frameId)
  } else if (target.startsWith('loop-section:')) {
    const sectionId = target.slice('loop-section:'.length)
    const section = timeline.loopSections?.find((candidate) => candidate.id === sectionId)
    const range = section ? resolveAnimationLoopSectionRange(timeline, section) : null
    if (range) {
      for (let frameIndex = range.startIndex; frameIndex <= range.endIndex; frameIndex += 1) {
        const frameId = timeline.frames[frameIndex].id
        for (const layer of session.document.layers) collect(animationLayerAtFrame(session.document, layer.id, frameId), frameId)
      }
    }
  } else {
    for (const key of session.selectedAnimationCellKeys) {
      const cell = parseAnimationCelKey(key)
      if (cell) collect(animationLayerAtFrame(session.document, cell.layerId, cell.frameId), cell.frameId)
    }
  }

  return {
    edits,
    pixelCount: edits.reduce((count, edit) => count + edit.before.size, 0),
    paletteCount: 0,
    lockedCount
  }
}

const restoreColorReplacementPreviewState = (session: DocumentSession, preview: ColorReplacementPreview): void => {
  for (let index = preview.edits.length - 1; index >= 0; index -= 1) revertPixelEdit(session.document, preview.edits[index])
  session.document.palette = cloneColorReplacementPalette(preview.palette)
  session.document.nextColorId = preview.nextColorId
  session.primaryColor = { ...preview.primaryColor }
  session.secondaryColor = { ...preview.secondaryColor }
  syncActiveAnimationFrame(session.document)
}

const invalidateColorReplacementPreview = (session: DocumentSession): void => {
  session.revision += 1
  session.contentRevision += 1
}

const paletteEditSynchronizationLocked = (): boolean => readStoredString('moonsprite.palette-edit-locked') !== 'false'

const paletteColorSynchronizationEnabled = (): boolean => readStoredString('moonsprite.palette-sync-colors') === 'true'

const updatePaletteColorWithSynchronization = (session: DocumentSession, id: number, color: RgbaColor): boolean => {
  const entry = session.document.palette.find((candidate) => candidate.id === id)
  if (!entry || colorEquals(entry.color, color)) return false
  const sourceColor = { ...entry.color }
  if (!paletteColorSynchronizationEnabled() || session.document.colorMode === 'indexed') {
    updatePaletteColorCommand(session, id, color)
    return true
  }

  const label = tr('palette.history.updated')
  session.history.beginCompound()
  updatePaletteColorCommand(session, id, color)
  const result = applyColorReplacementTarget(session, 'document', sourceColor, color)
  for (const edit of result.edits) {
    const history = commitPixelEdit(session.document, edit, label)
    if (history) session.history.push(history)
  }
  session.history.endCompound(label)
  return true
}

export function createWorkspaceColorCommands({ get, set, recording }: WorkspaceCommandContext<'deletePaletteColors' | 'mutateActive' | 'redo' | 'setPrimaryColor' | 'undo'>): WorkspaceColorCommands {
  const { recordDocumentOperation } = recording
  return {
    setPixelFormat(format: PixelFormat) {
      const state = get()
      let changed = false
      for (const session of state.sessions) {
        const document = session.document
        if (document.colorMode !== 'rgba' || (document.pixelFormat ?? 'rgba32') === format) continue
        document.pixelFormat = format
        const seen = new Set<Uint8ClampedArray>()
        const quantizePixels = (pixels: Uint8ClampedArray): void => {
          if (seen.has(pixels)) return
          seen.add(pixels)
          for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
            const color = quantizePixelColor({ r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] }, format)
            pixels[offset] = color.r
            pixels[offset + 1] = color.g
            pixels[offset + 2] = color.b
            pixels[offset + 3] = color.a
          }
        }
        for (const layer of document.layers) if (layer.format === 'rgba') quantizePixels(layer.pixels)
        for (const cel of document.animation?.cels ?? []) if (cel.surface?.format === 'rgba') quantizePixels(cel.surface.pixels)
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        changed = true
      }
      if (changed) set({ sessions: [...state.sessions] })
    },
    setPrimaryColor(color) {
      const state = get()
      for (const session of state.sessions) {
        session.uiRevision += 1
        const previous = { ...session.primaryColor }
        const paletteId = session.paletteSelectionId
        const paletteEntry = paletteId === null ? null : session.document.palette.find((entry) => entry.id === paletteId)
        const editLocked = paletteEditSynchronizationLocked()
        const paletteChanged = paletteId !== null && paletteEntry && !editLocked && colorEquals(paletteEntry.color, previous)
          ? updatePaletteColorWithSynchronization(session, paletteId, color)
          : false
        session.primaryColor = { ...color }
        if (session.brushImage?.intrinsicSize) session.brushImage = remapSelectionBrushColors(session.brushImage, session.primaryColor, session.secondaryColor)
        if (paletteChanged && paletteColorSynchronizationEnabled()) {
          completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        }
        if (!editLocked) continue
        const matching = paletteEntry && colorEquals(paletteEntry.color, color)
          ? paletteEntry
          : session.document.palette.find((entry) => session.document.paletteOrder.includes(entry.id) && colorEquals(entry.color, color))
        session.paletteSelectionId = matching?.id ?? null
        session.selectedPaletteIds = matching
          ? session.selectedPaletteIds.includes(matching.id) ? session.selectedPaletteIds : [matching.id]
          : []
      }
      persistColorRolePreferences(color, state.sharedSecondaryColor)
      set({ sharedPrimaryColor: { ...color }, sessions: [...state.sessions] })
    },
    setSecondaryColor(color) {
      const state = get()
      for (const session of state.sessions) {
        session.uiRevision += 1
        const previous = { ...session.secondaryColor }
        const paletteId = session.paletteSecondarySelectionId
        const paletteEntry = paletteId === null ? null : session.document.palette.find((entry) => entry.id === paletteId)
        const editLocked = paletteEditSynchronizationLocked()
        const paletteChanged = paletteId !== null && paletteEntry && !editLocked && colorEquals(paletteEntry.color, previous)
          ? updatePaletteColorWithSynchronization(session, paletteId, color)
          : false
        session.secondaryColor = { ...color }
        if (session.brushImage?.intrinsicSize) session.brushImage = remapSelectionBrushColors(session.brushImage, session.primaryColor, session.secondaryColor)
        if (paletteChanged && paletteColorSynchronizationEnabled()) {
          completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        }
        if (!editLocked) continue
        const matching = paletteEntry && colorEquals(paletteEntry.color, color)
          ? paletteEntry
          : session.document.palette.find((entry) => session.document.paletteOrder.includes(entry.id) && colorEquals(entry.color, color))
        session.paletteSecondarySelectionId = matching?.id ?? null
      }
      persistColorRolePreferences(state.sharedPrimaryColor, color)
      set({ sharedSecondaryColor: { ...color }, sessions: [...state.sessions] })
    },

    replaceColor(target, sourceColor, replacementColor) {
      const state = get()
      const session = activeSession(state)
      if (!session) return
      if (colorEquals(sourceColor, replacementColor)) {
        set({ message: tr('workspace.colorReplace.sameColor') })
        return
      }
      const beforePalette = cloneColorReplacementPalette(session.document.palette)
      const beforeNextColorId = session.document.nextColorId
      const beforePrimaryColor = { ...session.primaryColor }
      const beforeSecondaryColor = { ...session.secondaryColor }
      const result = applyColorReplacementTarget(session, target, sourceColor, replacementColor)
      const labels: Record<Exclude<ColorReplacementTarget, `loop-section:${string}`>, string> = {
        layer: tr('workspace.history.replaceColorLayer'),
        document: tr('workspace.history.replaceColorDocument'),
        selection: tr('workspace.history.replaceColorSelection'),
        layers: tr('workspace.history.replaceColorLayers'),
        frames: tr('workspace.history.replaceColorFrames'),
        cells: tr('workspace.history.replaceColorCells'),
        palette: tr('workspace.history.replaceColorPalette')
      }
      const label = target.startsWith('loop-section:') ? tr('workspace.history.replaceColorFrames') : labels[target as Exclude<ColorReplacementTarget, `loop-section:${string}`>]
      const entries = result.edits.map((edit) => commitPixelEdit(session.document, edit, label)).filter((entry): entry is HistoryEntry => Boolean(entry))
      const afterPalette = cloneColorReplacementPalette(session.document.palette)
      const afterNextColorId = session.document.nextColorId
      const afterPrimaryColor = { ...session.primaryColor }
      const afterSecondaryColor = { ...session.secondaryColor }
      const paletteChanged = beforeNextColorId !== afterNextColorId || !colorReplacementPalettesEqual(beforePalette, afterPalette)
      if (entries.length === 0 && !paletteChanged) {
        set({ message: tr(result.lockedCount > 0 ? 'workspace.colorReplace.locked' : 'workspace.colorReplace.noMatch') })
        return
      }
      session.history.push({
        label,
        bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) + (beforePalette.length + afterPalette.length) * 24,
        undo: () => {
          for (let index = entries.length - 1; index >= 0; index -= 1) entries[index].undo()
          session.document.palette = cloneColorReplacementPalette(beforePalette)
          session.document.nextColorId = beforeNextColorId
          session.primaryColor = { ...beforePrimaryColor }
          session.secondaryColor = { ...beforeSecondaryColor }
        },
        redo: () => {
          session.document.palette = cloneColorReplacementPalette(afterPalette)
          session.document.nextColorId = afterNextColorId
          session.primaryColor = { ...afterPrimaryColor }
          session.secondaryColor = { ...afterSecondaryColor }
          for (const entry of entries) entry.redo()
        },
        invalidation: { kind: 'full' }
      })
      syncActiveAnimationFrame(session.document)
      completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
      set({ sessions: [...state.sessions], message: tr('workspace.colorReplace.done', { count: result.pixelCount + result.paletteCount }) })
    },

    previewColorReplacement(target, sourceColor, replacementColor, previous = null) {
      const state = get()
      const changedSessions = new Set<DocumentSession>()
      if (previous) {
        const previousSession = state.sessions.find((candidate) => candidate.document.id === previous.documentId)
        if (previousSession) {
          restoreColorReplacementPreviewState(previousSession, previous)
          changedSessions.add(previousSession)
        }
      }
      const session = activeSession(state)
      if (!session || colorEquals(sourceColor, replacementColor)) {
        for (const changed of changedSessions) invalidateColorReplacementPreview(changed)
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      const preview: ColorReplacementPreview = {
        documentId: session.document.id,
        edits: [],
        palette: cloneColorReplacementPalette(session.document.palette),
        nextColorId: session.document.nextColorId,
        primaryColor: { ...session.primaryColor },
        secondaryColor: { ...session.secondaryColor }
      }
      const result = applyColorReplacementTarget(session, target, sourceColor, replacementColor)
      preview.edits = result.edits
      const paletteChanged = preview.nextColorId !== session.document.nextColorId || !colorReplacementPalettesEqual(preview.palette, session.document.palette)
      if (result.edits.length === 0 && !paletteChanged) {
        for (const changed of changedSessions) invalidateColorReplacementPreview(changed)
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      syncActiveAnimationFrame(session.document)
      changedSessions.add(session)
      for (const changed of changedSessions) invalidateColorReplacementPreview(changed)
      set({ sessions: [...state.sessions] })
      return preview
    },

    restoreColorReplacementPreview(preview) {
      if (!preview) return
      const state = get()
      const session = state.sessions.find((candidate) => candidate.document.id === preview.documentId)
      if (!session) return
      restoreColorReplacementPreviewState(session, preview)
      invalidateColorReplacementPreview(session)
      set({ sessions: [...state.sessions] })
    },

    selectSecondaryPaletteColor(id) {
      get().mutateActive((session) => {
        const entry = session.document.palette.find((candidate) => candidate.id === id)
        if (!entry) return
        session.paletteSecondarySelectionId = id
        session.secondaryColor = { ...entry.color }
      }, false)
      const session = activeSession(get())
      if (session) {
        persistColorRolePreferences(get().sharedPrimaryColor, session.secondaryColor)
        set({ sharedSecondaryColor: { ...session.secondaryColor } })
      }
    },
    swapPrimarySecondaryColors() {
      const state = get()
      const primary = { ...state.sharedPrimaryColor }
      const secondary = { ...state.sharedSecondaryColor }
      for (const session of state.sessions) {
        session.uiRevision += 1
        session.primaryColor = { ...secondary }
        session.secondaryColor = { ...primary }
        const previousPrimaryId = session.paletteSelectionId
        session.paletteSecondarySelectionId = previousPrimaryId
        if (session.brushImage?.intrinsicSize) session.brushImage = remapSelectionBrushColors(session.brushImage, session.primaryColor, session.secondaryColor)
        const matching = session.document.palette.find((entry) => session.document.paletteOrder.includes(entry.id) && colorEquals(entry.color, session.primaryColor))
        session.paletteSelectionId = matching?.id ?? null
        session.selectedPaletteIds = matching
          ? session.selectedPaletteIds.includes(matching.id) ? session.selectedPaletteIds : [matching.id]
          : []
      }
      persistColorRolePreferences(secondary, primary)
      set({ sharedPrimaryColor: secondary, sharedSecondaryColor: primary, sessions: [...state.sessions] })
    },

    selectPaletteColor(id, additive = false) {
      get().mutateActive((session) => selectPaletteColorCommand(session, id, additive), false)
      const session = activeSession(get())
      if (session && session.paletteSelectionId !== null) get().setPrimaryColor(session.primaryColor)
    },

    selectPaletteColors(ids, primaryId) {
      get().mutateActive((session) => selectPaletteColorsCommand(session, ids, primaryId), false)
      const session = activeSession(get())
      if (session && session.paletteSelectionId !== null) get().setPrimaryColor(session.primaryColor)
    },

    addPaletteColor(color, target) {
      let addedId: number | null = null
      get().mutateActive((session) => {
        addedId = addPaletteColorCommand(session, color, paletteEditSynchronizationLocked(), target)
      })
      return addedId
    },

    pastePaletteColors(colors, target) {
      let pastedIds: number[] = []
      get().mutateActive((session) => { pastedIds = pastePaletteColorsCommand(session, colors, target) })
      return pastedIds
    },

    updatePaletteColor(id, color) {
      get().mutateActive((session) => updatePaletteColorWithSynchronization(session, id, color))
    },

    applyPalette(colors, layout) {
      get().mutateActive((session) => applyPaletteCommand(session, colors, layout))
    },

    deletePaletteColor(id) {
      get().deletePaletteColors([id])
    },

    deletePaletteColors(ids) {
      get().mutateActive((session) => deletePaletteColorsCommand(session, ids))
    },

    movePaletteColor(direction) {
      get().mutateActive((session) => movePaletteColorCommand(session, direction))
    },

    reorderPaletteColors(ids, targetSlots, targetColumns) {
      get().mutateActive((session) => reorderPaletteColorsCommand(session, ids, targetSlots, targetColumns))
    },

    reversePaletteColors() {
      get().mutateActive((session) => reversePaletteColorsCommand(session))
    },

    gradientPaletteColors(byHue) {
      get().mutateActive((session) => gradientPaletteColorsCommand(session, byHue))
    },

    gradientPaletteSlots(slotIndices, sourceSlots, columns, byHue) {
      get().mutateActive((session) => gradientPaletteSlotsCommand(session, slotIndices, sourceSlots, columns, byHue))
    },

    sortPaletteColors(mode, direction) {
      get().mutateActive((session) => sortPaletteColorsCommand(session, mode, direction))
    }
  }
}
