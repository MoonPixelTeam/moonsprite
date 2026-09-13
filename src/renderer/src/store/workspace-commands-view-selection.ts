import { completeDocumentChange } from './workspace-document-change'
import { type WorkspaceRecording } from './workspace-recording'
import type { SelectionQuad } from '@shared/types-selection'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { OutlineSettings, SelectionMask, SelectionRect } from '@shared/types-selection'
import type { RasterLayer } from '@shared/types-layer'
import type { SpriteDocument } from '@shared/types-document'
import type { TextCelData } from '@shared/types-text'
import type { ViewState } from '@shared/types-view'
import { commitPixelEdit, revertPixelEdit, type ContentInvalidationHint, type HistoryEntry } from '@/core/history'
import { invalidateRasterContentBounds } from '@/core/document-model'
import { createId, isLayerEffectivelyLocked, isLayerEffectivelyVisible, layerContentBounds, paletteColorIdForCanvas, readLayerColorAt } from '@/core/document-model'
import { documentVisibleContentBounds } from '@/core/document-composite'
import { animationCelKey, cloneAnimationCelSurface, ensureAnimationDocument, refreshActiveAnimationFrame, resolveAnimationCel, syncActiveAnimationFrame, syncActiveAnimationLayer } from '@/core/animation'
import { isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import { antiAliasSelection, outlineSelection, outlineSelectionBoundary } from '@/core/tools-outline'
import { applySelectionTransform, applySelectionTranslationCommit, applySelectionTranslationPreview, captureSelectionTransform, flipLayer, flipSelection, flipSelectionTransformSource, moveSelection, restoreSelectionTranslationPreview, selectionTranslationPreviewEdit, transformSelectionCopy } from '@/core/tools-selection-transform'
import { clampSelection } from '@/core/tools-pixel-edit'
import { clearSelection, fillSelectionOrCanvas } from '@/core/tools-fill'
import { applySelectionTransformLayerState, captureAnimationFrameSelectionTransformStates, selectionTransformLayerForState } from '@/core/selection-transform-targets'
import { flipSelectionMask, invertSelectionMask, rotateSelectionTargetAroundPivot, selectionContains, selectionQuadFromRect, shearTransformedSelection, transformSelectionMask, transformSelectionMaskQuad, transformedSelectionControlPoints, transformedSelectionPivotPreset, type SelectionShearTransform } from '@/core/selection'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { normalizeProjectDisplaySettings } from '@/core/project-metadata'
import { normalizeGapClosingThreshold } from '@/core/contiguous-region'
import { cloneOutlineSettings, defaultOutlineSettings, normalizeOutlineSettings } from '@/core/outline-settings'
import { saveDocumentViewState } from '@/core/document-view-state'
import { cloneTextCelData, convertTextSurface, normalizeTextBoxBounds, rasterizeText } from '@/core/text-raster'
import { hasEnabledLayerStyles } from '@/core/layer-styles'
import { activeTilemapCelTarget, applyTilemapDocumentEdit, applyTilemapSelectionCellMove, applyTilemapTilesetDocumentEdit, convertTilemapPixelEdit, flipTilemapSelection } from '@/core/tilemap-document'
import { tileRepeatFitZoom, tilemapCellBounds, tilemapCellIndexAtPoint, tilemapCellTranslationForSelection, tilemapEditBytes, tilemapTilesetEditBytes, tilemapTilesetEditHasChanges, wrapSelectionMaskForTileRepeat, type TilemapDrawingMode, type TilemapTilesetEdit } from '@/core/tilemap'
import { cloneFreeTileCelData, createFreeTileCelData, freeTileCelDataEqual, freeTileInstanceBounds, freeTileSourceForInstance } from '@/core/free-tile'
import { activeFreeTileCelTarget, applyFreeTilePlacementEdit, applyFreeTileSourceSnapshot, type FreeTilePlacementEdit } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster, freeTileTransformTargetToEditRaster } from '@/core/free-tile-edit'
import { activeLayerMask, activePaintLayer, cloneSelectionMask, isBrushTool, persistToolSettings, rememberBrushProfile, selectedTransformLayersForSession, invalidateSessionContent, touch } from './workspace-session'
import type { AntiAliasPreview } from './workspace-state'
import type { DocumentSession, FloatingPaste, FloatingSelectionBoxHistoryEntry, SelectionPivot } from './workspace-types'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { cloneSelectionPivot, selectionMasksEqual, intersectSelectionRects, rectangularSelection, unionRects } from './workspace-selection-geometry'
import { commitFreeTileSourceEditInSession } from './workspace-free-tile-transaction'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { restoreFloatingPreview, markFloatingOverlayChanged, markFloatingPreviewChanged, floatingSelectionGeometrySource } from './workspace-floating-preview'
import { renderTextAtCurrentSurface, applyTextSurface } from './workspace-text-surface'
import { clearAnimationItemSelection, selectedGroupRows } from './workspace-animation-selection'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection } from './workspace-animation-selection-history'

const tilemapEditCellIndexForSelection = (session: DocumentSession, selection: SelectionMask): number | undefined => {
  if (session.tilemapMode !== 'edit' || activePaintLayer(session).kind !== 'tilemap') return undefined
  const target = activeTilemapCelTarget(session.document)
  if (!target) return undefined
  for (let y = selection.y; y < selection.y + selection.height; y += 1) for (let x = selection.x; x < selection.x + selection.width; x += 1) {
    if (!selectionContains(selection, x, y)) continue
    const index = tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, x, y)
    if (index !== null && target.tilemap.cells[index]) return index
  }
  return undefined
}

const tilemapEditClipForCell = (session: DocumentSession, cellIndex: number | undefined): SelectionRect | undefined => {
  if (cellIndex === undefined) return undefined
  const target = activeTilemapCelTarget(session.document)
  return target?.tilemap.cells[cellIndex]
    ? tilemapCellBounds(target.tilemap, target.surface.offsetX, target.surface.offsetY, cellIndex)
    : undefined
}

const visibleLayerContentBoundsWithinSelection = (document: SpriteDocument, layer: RasterLayer, selection: SelectionMask): SelectionMask | null => {
  // Scan the selection itself. The layer content bounds can be stale or cover
  // another piece of content after the layer has been expanded, while shrink
  // must be based only on pixels inside the current selection.
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let y = selection.y; y < selection.y + selection.height; y += 1) {
    for (let x = selection.x; x < selection.x + selection.width; x += 1) {
      if (!selectionContains(selection, x, y) || readLayerColorAt(document, layer, x, y).a === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) return null
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  if (!selection.mask) return { x: minX, y: minY, width, height }

  // Keep irregular selections irregular while trimming their empty perimeter.
  // The content bounds determine the new frame; the original selection mask
  // determines which pixels remain selected inside that frame.
  const mask = new Uint8Array(width * height)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (selectionContains(selection, x, y)) mask[(y - minY) * width + x - minX] = 1
    }
  }
  return { x: minX, y: minY, width, height, mask }
}

const syncFloatingPrimaryLayerState = (pending: FloatingPaste): void => {
  const primary = pending.layers?.[0]
  if (!primary) return
  pending.layerId = primary.layerId
  pending.source = primary.source
  pending.previewEdit = primary.previewEdit
  pending.translationPreview = primary.translationPreview
}

const previewFloatingFreeTileSource = (session: DocumentSession, pending: FloatingPaste): boolean => {
  if (!pending.freeTile) return false
  const changed = applyFreeTileSourceSnapshot(session.document, freeTileSourceSnapshotFromEditRaster(pending.freeTile.edit))
  if (!changed) return false
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.layersPanelRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
  return true
}

const selectionShearForAngle = (target: SelectionRect, angle: number): SelectionShearTransform | undefined => {
  const normalized = Math.max(-89, Math.min(89, Number.isFinite(angle) ? angle : 0))
  if (Math.abs(normalized) < 0.0001) return undefined
  return {
    axis: 'x',
    edge: 's',
    amount: Math.tan(normalized * Math.PI / 180) * Math.max(1, target.height)
  }
}

const selectionShearAngle = (target: SelectionRect, shear: SelectionShearTransform | undefined): number => {
  if (!shear || shear.amount === 0) return 0
  const reference = shear.axis === 'x' ? Math.max(1, target.height) : Math.max(1, target.width)
  return Math.round(Math.atan(shear.amount / reference) * 1800 / Math.PI) / 10
}

const cloneSelectionQuad = (quad: SelectionQuad | null | undefined): SelectionQuad | null => quad
  ? {
      nw: { ...quad.nw },
      ne: { ...quad.ne },
      se: { ...quad.se },
      sw: { ...quad.sw }
    }
  : null

const translateSelectionQuad = (quad: SelectionQuad | null | undefined, deltaX: number, deltaY: number): SelectionQuad | null => {
  const cloned = cloneSelectionQuad(quad)
  if (!cloned) return null
  for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
    cloned[corner].x += deltaX
    cloned[corner].y += deltaY
  }
  return cloned
}

const clearFloatingSelectionBoxHistory = (pending: FloatingPaste): void => {
  pending.selectionBoxUndo = undefined
  pending.selectionBoxRedo = undefined
}

const recordFloatingSelectionBoxMove = (
  session: DocumentSession,
  pending: FloatingPaste,
  beforeSelection: SelectionMask,
  afterSelection: SelectionMask,
  beforePivot: SelectionPivot | null,
  afterPivot: SelectionPivot | null
): void => {
  const entry: FloatingSelectionBoxHistoryEntry = {
    beforeSelection: cloneSelectionMask(beforeSelection)!,
    afterSelection: cloneSelectionMask(afterSelection)!,
    beforePivot: cloneSelectionPivot(beforePivot),
    afterPivot: cloneSelectionPivot(afterPivot)
  }
  pending.selectionBoxUndo = [...(pending.selectionBoxUndo ?? []), entry]
  pending.selectionBoxRedo = undefined
  session.selection = cloneSelectionMask(afterSelection)
  session.selectionPivot = cloneSelectionPivot(afterPivot)
}

const floatingPasteSelectionForCommit = (session: DocumentSession, pending: FloatingPaste): SelectionMask => pending.source.origin === 'clipboard'
  && (pending.selectionBoxUndo?.length ?? 0) > 0
  && session.selection
  ? cloneSelectionMask(session.selection)!
  : cloneSelectionMask(pending.target)!

const combinedPixelHistoryEntry = (
  session: DocumentSession,
  entries: readonly HistoryEntry[],
  label: string,
  beforeSelection: SelectionMask | null,
  afterSelection: SelectionMask,
  beforeSelectionPivot: SelectionPivot | null,
  afterSelectionPivot: SelectionPivot | null = null,
  beforeFreeTransformQuad: SelectionQuad | null = null,
  afterFreeTransformQuad: SelectionQuad | null = null
): HistoryEntry => ({
  label,
  bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0)
    + (beforeSelection?.mask?.byteLength ?? 0)
    + (afterSelection.mask?.byteLength ?? 0)
    + 64,
  undo: () => {
    for (let index = entries.length - 1; index >= 0; index -= 1) entries[index].undo()
    session.selection = cloneSelectionMask(beforeSelection)
    session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
    session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad)
  },
  redo: () => {
    for (const entry of entries) entry.redo()
    session.selection = cloneSelectionMask(afterSelection)
    session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null
    session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
  },
  invalidation: { kind: 'full' },
  affectedLayerIds: [...new Set(entries.flatMap((entry) => entry.affectedLayerIds ?? []))]
})

const persistDisplaySettings = (session: DocumentSession, view: Partial<ViewState>): boolean => {
  if (!('showPixelGrid' in view) && !('showGrid' in view) && !('grid' in view)) return false
  const current = normalizeProjectDisplaySettings(session.document.displaySettings)
  session.document.displaySettings = normalizeProjectDisplaySettings({
    ...current,
    ...('showPixelGrid' in view ? { showPixelGrid: view.showPixelGrid } : {}),
    ...('showGrid' in view ? { showGrid: view.showGrid } : {}),
    ...('grid' in view ? { grid: view.grid } : {})
  })
  return true
}

const restoreAntiAliasPreviewState = (session: DocumentSession, preview: AntiAliasPreview): void => {
  revertPixelEdit(session.document, preview.edit)
  syncActiveAnimationFrame(session.document)
}

const invalidateAntiAliasPreview = (session: DocumentSession): void => {
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
}

const persistOutlineSettings = (settings: OutlineSettings): void => {
  const preferences = loadEditorPreferences()
  saveEditorPreferences({ ...preferences, outlineSettings: cloneOutlineSettings(settings) })
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonsprite:preferences-changed'))
}

const savedOutlineSettingsForSession = (session: DocumentSession): OutlineSettings => {
  const projectSettings = session.document.outlineSettings
    ? normalizeOutlineSettings(session.document.outlineSettings, session.primaryColor)
    : null
  const softwarePreference = loadEditorPreferences().outlineSettings
  const softwareSettings = softwarePreference
    ? normalizeOutlineSettings(softwarePreference, session.primaryColor)
    : null
  return projectSettings ?? softwareSettings ?? defaultOutlineSettings(session.primaryColor)
}

const deleteFreeTileSourceSelectionInSession = (recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'], session: DocumentSession): HistoryEntry | null => {
  if (!session.selection || session.freeTileMode !== 'edit') return null
  const target = activeFreeTileCelTarget(session.document)
  const instance = target && session.selectedFreeTileInstanceId
    ? target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null
    : null
  const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
  const sourceLayer = source ? target?.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
  if (!target || !instance || !source || sourceLayer?.locked === true || source.visible === false || instance.locked === true || instance.visible === false) return null
  const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
  const sourceEdit = createFreeTileSourceEditRaster(session.document, source, bounds, { x: session.selection.x, y: session.selection.y }, instance)
  if (!sourceEdit) return null
  const selection = freeTileSelectionToEditRaster(sourceEdit, session.selection)
  const edit = selection ? clearSelection(sourceEdit.document, selection, sourceEdit.layer) : null
  if (!edit) return null
  return commitFreeTileSourceEditInSession(recordDocumentOperation,
    session,
    source.id,
    sourceEdit.before,
    freeTileSourceSnapshotFromEditRaster(sourceEdit),
    tr('workspace.history.deleteSelection')
  )
}

export function createWorkspaceViewSelectionCommands({ get, set, recording }: WorkspaceCommandContext<'beginFloatingSelectionTransform' | 'cancelFloatingPaste' | 'cancelTextBoxTransform' | 'commitFloatingPaste' | 'commitPixelEdit' | 'commitSelectionChange' | 'moveActiveSelectionWithSelectionHistory' | 'moveLayerBy' | 'mutateActive' | 'outlineActiveSelection' | 'previewTextBoxTransform' | 'pushHistory' | 'redo' | 'setView' | 'undo' | 'updateFloatingPastePreview'>): WorkspaceViewSelectionCommands {
  const { recordDocumentOperation } = recording
  return {
    setView(view) {
      const state = get()
      const session = activeSession(state)
      if (!session) return
      Object.assign(session.view, view)
      saveDocumentViewState(session.document, session.view, session.symmetryCenter)
      if (persistDisplaySettings(session, view)) touch(session)
      session.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },
    setViewForDocument(documentId, view) {
      const state = get()
      const session = state.sessions.find((item) => item.document.id === documentId)
      if (!session) return
      Object.assign(session.view, view)
      saveDocumentViewState(session.document, session.view, session.symmetryCenter)
      if (persistDisplaySettings(session, view)) touch(session)
      session.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },

    setViewportSize(size) {
      get().mutateActive((session) => {
        session.viewportSize = { width: Math.max(0, size.width), height: Math.max(0, size.height) }
      }, false)
    },
    setViewportSizeForDocument(documentId, size) {
      const state = get()
      const session = state.sessions.find((item) => item.document.id === documentId)
      if (!session) return
      session.viewportSize = { width: Math.max(0, size.width), height: Math.max(0, size.height) }
      session.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },
    setTileRepeatMode(mode) {
      const state = get()
      const session = activeSession(state)
      if (!session) return
      session.view.tileRepeatMode = mode
      if (mode !== 'off') {
        session.view.zoom = tileRepeatFitZoom(
          session.viewportSize.width,
          session.viewportSize.height,
          session.document.width,
          session.document.height,
          mode,
          session.view.rotation
        )
        session.view.panX = 0
        session.view.panY = 0
      }
      session.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },

    setSelection(selection) { get().mutateActive((session) => { session.selection = selection ? { ...selection, mask: selection.mask?.slice() } : null; session.selectionPropertiesActive = false; session.selectionAspectRatio = null; session.selectionAngle = 0; session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = null }, false) },

    setSelectionPropertiesActive(active) { get().mutateActive((session) => { session.selectionPropertiesActive = Boolean(active); if (!active) session.selectionAspectRatio = null }, false) },

    setSelectionAspectRatio(ratio) { get().mutateActive((session) => { session.selectionAspectRatio = session.freeTransformActive ? null : (typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : null) }, false) },

    setSelectionRotationAlgorithm(algorithm: 'fast' | 'rotsprite') { get().mutateActive((session) => { session.selectionRotationAlgorithm = algorithm === 'rotsprite' ? 'rotsprite' : 'fast'; persistToolSettings(session) }, false) },

    updateSelectionProperties(patch) {
      const current = activeSession(get())
      if (!current?.selection) return
      const layer = activePaintLayer(current)
      const pending = current.pendingPaste
      if (layer.kind || isLayerEffectivelyLocked(current.document, layer) || pending?.freeTile) return

      const before = pending?.beforeSelection ? cloneSelectionMask(pending.beforeSelection) : cloneSelectionMask(current.selection)
      const selectedLayers = selectedTransformLayersForSession(current)
      const animationSelectionActive = current.selectedAnimationFrameIds.length > 0 || current.selectedAnimationCellKeys.length > 0
      const states = pending?.layers?.length
        ? pending.layers
        : animationSelectionActive
          ? before
            ? captureAnimationFrameSelectionTransformStates(
                current.document,
                current.selectedAnimationFrameIds,
                selectedLayers.map((candidate) => candidate.id),
                before,
                current.selectedAnimationCellKeys
              )
            : []
          : selectedLayers.length > 1 && before
            ? selectedLayers.flatMap((candidate) => {
                const source = captureSelectionTransform(current.document, before, candidate)
                return source ? [{ layerId: candidate.id, source, previewEdit: null, translationPreview: null }] : []
              })
            : []
      const source = states[0]?.source ?? pending?.source ?? (before ? captureSelectionTransform(current.document, before, layer) : null)
      if (!before || !source) return
      if (states.length > 0 && states.some((state) => {
        const targetLayer = selectionTransformLayerForState(current.document, state)
        return !targetLayer || targetLayer.kind || !isLayerEffectivelyVisible(current.document, targetLayer) || isLayerEffectivelyLocked(current.document, targetLayer)
      })) return
      const currentTarget = pending?.transformTarget ?? {
        x: current.selection.x,
        y: current.selection.y,
        width: current.selection.width,
        height: current.selection.height
      }
      let target = {
        x: Number.isFinite(patch.x) ? Math.round(patch.x!) : currentTarget.x,
        y: Number.isFinite(patch.y) ? Math.round(patch.y!) : currentTarget.y,
        width: Number.isFinite(patch.width) ? Math.max(1, Math.round(patch.width!)) : currentTarget.width,
        height: Number.isFinite(patch.height) ? Math.max(1, Math.round(patch.height!)) : currentTarget.height
      }
      const currentAngle = pending?.transformAngle ?? current.selectionAngle ?? 0
      const currentShear = pending?.transformShear
      const pivot = current.selectionPivot ?? transformedSelectionPivotPreset(currentTarget, 'center', currentAngle, currentShear)
      const hasAnglePatch = Number.isFinite(patch.angle)
      const angle = hasAnglePatch ? Math.round(patch.angle! * 10) / 10 : currentAngle
      if (hasAnglePatch) target = rotateSelectionTargetAroundPivot(target, pivot, angle - currentAngle)
      const nextShearAngle = Number.isFinite(patch.shearAngle)
        ? Math.round(patch.shearAngle! * 10) / 10
        : selectionShearAngle(currentTarget, currentShear)
      let shear = selectionShearForAngle(target, nextShearAngle)
      if (Number.isFinite(patch.shearAngle)) {
        const desiredAmount = shear?.amount ?? 0
        const currentAmount = currentShear?.axis === 'x' ? currentShear.amount : 0
        const points = transformedSelectionControlPoints(target, angle, currentShear)
        const horizontalAxis = { x: points[2].x - points[0].x, y: points[2].y - points[0].y }
        const verticalAxis = { x: points[5].x - points[0].x, y: points[5].y - points[0].y }
        const determinant = horizontalAxis.x * verticalAxis.y - horizontalAxis.y * verticalAxis.x
        const pivotOffset = { x: pivot.x - points[0].x, y: pivot.y - points[0].y }
        const pivotCoordinate = Math.abs(determinant) < 1e-9
          ? 0.5
          : (horizontalAxis.x * pivotOffset.y - horizontalAxis.y * pivotOffset.x) / determinant
        const edge = pivotCoordinate <= 0.5 ? 's' : 'n'
        const edgeDistance = (edge === 's' ? 1 : 0) - pivotCoordinate
        const transformed = Math.abs(edgeDistance) < 1e-9
          ? { target, angle, shear }
          : shearTransformedSelection(target, angle, currentShear, edge, (desiredAmount - currentAmount) * edgeDistance, pivot)
        target = transformed.target
        // shearTransformedSelection derives the final angle from the transformed
        // geometry, so keep the representation and the raster transform aligned.
        if (transformed.angle !== angle) {
          // The selection shear path should preserve the current rotation. This
          // fallback only protects against sub-pixel rounding drift.
          target = rotateSelectionTargetAroundPivot(target, pivot, angle - transformed.angle)
        }
        shear = transformed.shear
      }
      const after = transformSelectionMask(source.selection, target, current.document.width, current.document.height, angle, shear, true)
      if (!after) return
      const same = selectionMasksEqual(current.selection, after)
        && (pending?.transformTarget
          ? pending.transformTarget.x === target.x && pending.transformTarget.y === target.y && pending.transformTarget.width === target.width && pending.transformTarget.height === target.height
          : current.selection.x === target.x && current.selection.y === target.y && current.selection.width === target.width && current.selection.height === target.height)
        && (pending?.transformAngle ?? 0) === angle
        && selectionShearAngle(currentTarget, pending?.transformShear) === nextShearAngle
      if (same) return

      if (pending) restoreFloatingPreview(current)
      if (states.length > 0) {
        const edits = states.flatMap((state) => {
          const edit = applySelectionTransformLayerState(current.document, state, target, angle, false, shear, undefined, undefined, undefined, undefined, current.selectionRotationAlgorithm === 'rotsprite')
          return edit ? [edit] : []
        })
        const primaryEdit = edits[0] ?? null
        if (pending) {
          get().updateFloatingPastePreview(primaryEdit, after, null, target, angle, shear, false, states)
        } else {
          get().beginFloatingSelectionTransform(source, primaryEdit, before, after, false, tr('workspace.history.transformSelectionContent'), null, target, angle, shear, false, undefined, states)
        }
        get().mutateActive((session) => { session.selectionPropertiesActive = true }, false)
        return
      }
      const edit = applySelectionTransform(current.document, source, target, angle, false, shear, undefined, undefined, layer, undefined, undefined, true, current.selectionRotationAlgorithm === 'rotsprite')
      if (pending) {
        get().updateFloatingPastePreview(edit, after, null, target, angle, shear, false)
      } else {
        get().beginFloatingSelectionTransform(source, edit, before, after, false, tr('workspace.history.transformSelectionContent'), null, target, angle, shear, false)
      }
      get().mutateActive((session) => { session.selectionPropertiesActive = true }, false)
    },

    shrinkSelectionToContent() {
      get().commitFloatingPaste()
      const current = activeSession(get())
      if (!current?.selection) { set({ message: tr('workspace.selectionRequired') }); return }
      const layer = activePaintLayer(current)
      const content = layer.kind === 'tilemap' || layer.kind === 'free-tile'
        ? documentVisibleContentBounds(current.document)
        : visibleLayerContentBoundsWithinSelection(current.document, layer, current.selection)
      const next = content ? intersectSelectionRects(current.selection, content) : null
      if (!next) { set({ message: tr('workspace.trim.empty') }); return }
      const after = layer.kind === 'tilemap' || layer.kind === 'free-tile'
        ? rectangularSelection(next)
        : content
      if (selectionMasksEqual(current.selection, after)) return
      get().mutateActive((session) => {
        const before = cloneSelectionMask(session.selection)
        const afterSnapshot = cloneSelectionMask(after)!
        session.selection = afterSnapshot
        session.selectionPropertiesActive = true
        session.selectionAngle = 0
        session.selectionPivot = null
        session.history.push({
          label: tr('toolOptions.shrinkSelection'),
          bytes: 48 + (before?.mask?.byteLength ?? 0),
          undo: () => { session.selection = cloneSelectionMask(before); session.selectionPropertiesActive = true },
          redo: () => { session.selection = cloneSelectionMask(afterSnapshot); session.selectionPropertiesActive = true },
          documentChanged: false,
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, false)
    },

    setSelectionPivot(pivot) { get().mutateActive((session) => { session.selectionPivot = pivot ? { ...pivot } : null }, false) },

    invertSelection() {
      const session = activeSession(get())
      if (!session?.selection) { set({ message: tr('workspace.selectionRequired') }); return }
      const before = cloneSelectionMask(session.selection)
      const after = invertSelectionMask(session.selection, session.document.width, session.document.height)
      get().commitSelectionChange(before, after, tr('app.menu.edit.invertSelection'))
    },

    toggleSelectionOutline() {
      get().mutateActive((session) => {
        session.view.showSelectionOutline = session.view.showSelectionOutline === false
        // 选区描边是视图状态，但切换时必须让合成缓存重新读取浮动粘贴的当前像素。
        session.revision += 1
      }, false)
    },

    beginLayerTransform() {
      if (isCanvasToolGestureLocked()) return
      get().commitFloatingPaste()
      get().cancelTextBoxTransform()
      const session = activeSession(get())
      if (!session) return
      if (activePaintLayer(session).kind === 'free-tile' && session.freeTileMode === 'paint') return
      const layers = selectedTransformLayersForSession(session)
      if (layers.length === 0) {
        set({ message: tr('workspace.transform.selectLayer') })
        return
      }
      if (layers.length > 1 && layers.some((layer) => layer.kind)) {
        set({ message: tr('workspace.transform.multipleUnsupported') })
        return
      }
      if (layers.some((layer) => !isLayerEffectivelyVisible(session.document, layer))) {
        set({ message: tr('workspace.transform.hidden') })
        return
      }
      if (layers.some((layer) => isLayerEffectivelyLocked(session.document, layer))) {
        set({ message: tr('workspace.transform.locked') })
        return
      }
      const layer = layers[0]
      const timeline = ensureAnimationDocument(session.document)
      const textCel = layers.length === 1 && layer.kind === 'text' ? timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === timeline.activeFrameId) : null
      const textSource = textCel ? resolveAnimationCel(timeline, textCel) ?? textCel : null
      if (textCel && textSource?.text?.boxWidth && textSource.text.boxHeight && textSource.surface) {
        // Boxed text already exposes its resize handles while selected. Ctrl+T
        // must not create a second transform mode around the same text area.
        return
      }
      const selectedFreeTileInstanceBounds = layers.length === 1
        && layer.kind === 'free-tile'
        && session.freeTileInstanceLayerId === layer.id
        && session.selectedFreeTileInstanceId
        ? (() => {
            const target = activeFreeTileCelTarget(session.document)
            const instance = target?.layer.id === layer.id
              ? target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null
              : null
            return target && instance
              ? freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
              : null
          })()
        : null
      const contentBounds = selectedFreeTileInstanceBounds ?? layers.reduce<SelectionRect | null>((bounds, candidate) => {
        const candidateBounds = layerContentBounds(session.document, candidate)
        return candidateBounds ? bounds ? unionRects(bounds, candidateBounds) : candidateBounds : bounds
      }, null)
      if (!contentBounds) {
        set({ message: tr('workspace.transform.empty') })
        return
      }
      const visibleBounds = clampSelection(session.document, contentBounds)
      if (!visibleBounds) {
        set({ message: tr('workspace.transform.outside') })
        return
      }
      get().mutateActive((active) => {
        if (isBrushTool(active.tool)) rememberBrushProfile(active)
        active.tool = 'selection'
        active.selection = visibleBounds
        active.selectionKind = 'rectangle'
        active.selectionMode = 'replace'
        active.freeTransformActive = false
        active.freeTransformQuad = null
      }, false)
      set({ message: tr('workspace.transform.started') })
    },

    beginFreeTransform() {
      if (isCanvasToolGestureLocked()) return
      get().commitFloatingPaste()
      get().cancelTextBoxTransform()
      const session = activeSession(get())
      if (!session?.selection) {
        set({ message: tr('workspace.selectionRequired') })
        return
      }
      if (activePaintLayer(session).kind === 'free-tile' && session.freeTileMode === 'paint') return
      const layer = activePaintLayer(session)
      if (!isLayerEffectivelyVisible(session.document, layer)) {
        set({ message: tr('workspace.transform.hidden') })
        return
      }
      if (isLayerEffectivelyLocked(session.document, layer)) {
        set({ message: tr('workspace.transform.locked') })
        return
      }
      get().mutateActive((active) => {
        active.tool = 'selection'
        active.freeTransformActive = true
        active.selectionAspectRatio = null
        active.freeTransformQuad = selectionQuadFromRect(active.selection!)
      }, false)
      set({ message: tr('workspace.transform.freeStarted') })
    },

    beginSelectedTextBoxTransform() {
      const session = activeSession(get())
      if (!session || session.selectedGroupId || session.selectedGroupIds.length > 0 || session.selectedLayerIds.length !== 1) return
      const layer = session.document.layers.find((candidate) => candidate.id === session.selectedLayerIds[0] && candidate.kind === 'text')
      if (!layer || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer)) return
      const timeline = ensureAnimationDocument(session.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!cel || !source?.text?.boxWidth || !source.text.boxHeight || !source.surface) return
      get().mutateActive((active) => {
        active.textBoxTransform = {
          layerId: layer.id,
          frameId: timeline.activeFrameId,
          bounds: {
            x: source.text!.originX ?? source.surface!.offsetX ?? layer.offsetX,
            y: source.text!.originY ?? source.surface!.offsetY ?? layer.offsetY,
            width: source.text!.boxWidth!,
            height: source.text!.boxHeight!
          },
          originalText: cloneTextCelData(source.text!),
          originalSurface: cloneAnimationCelSurface(source.surface!)
        }
      }, false)
    },

    previewTextBoxTransform(bounds) {
      get().mutateActive((session) => {
        const transform = session.textBoxTransform
        if (!transform) return
        const layer = session.document.layers.find((candidate) => candidate.id === transform.layerId && candidate.kind === 'text')
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === transform.layerId && candidate.frameId === transform.frameId)
        const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (!layer || !cel || !source?.text) return
        const target = normalizeTextBoxBounds(bounds)
        const rendered = renderTextAtCurrentSurface(session.document, {
          ...source.text,
          originX: target.x,
          originY: target.y,
          boxWidth: target.width,
          boxHeight: target.height
        }, target.x, target.y)
        const surface = convertTextSurface(rendered.rgba, session.document.colorMode, session.document.palette, (color) => paletteColorIdForCanvas(session.document, color))
        applyTextSurface(session.document, layer, source, cel, rendered.data, surface)
        session.textBoxTransform = { ...transform, bounds: target }
        if (timeline.activeFrameId === transform.frameId) refreshActiveAnimationFrame(session.document)
      }, false)
    },

    commitTextBoxTransform(bounds) {
      const current = activeSession(get())
      const transform = current?.textBoxTransform
      if (!current || !transform) return
      const layer = current.document.layers.find((candidate) => candidate.id === transform.layerId && candidate.kind === 'text')
      const timeline = ensureAnimationDocument(current.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === transform.layerId && candidate.frameId === transform.frameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!layer || !cel || !source?.text || !source.surface) return
      const beforeText = cloneTextCelData(transform.originalText)
      const beforeSurface = cloneAnimationCelSurface(transform.originalSurface)
      const target = normalizeTextBoxBounds(bounds)
      get().previewTextBoxTransform(target)
      get().mutateActive((session) => {
        const activeTransform = session.textBoxTransform
        if (!activeTransform) return
        const activeLayer = session.document.layers.find((candidate) => candidate.id === activeTransform.layerId && candidate.kind === 'text')
        const activeTimeline = ensureAnimationDocument(session.document)
        const activeCel = activeTimeline.cels.find((candidate) => candidate.layerId === activeTransform.layerId && candidate.frameId === activeTransform.frameId)
        const activeSource = resolveAnimationCel(activeTimeline, activeCel ?? null) ?? activeCel
        if (!activeLayer || !activeCel || !activeSource?.text || !activeSource.surface) return
        const afterText = cloneTextCelData(activeSource.text)
        const afterSurface = cloneAnimationCelSurface(activeSource.surface)
        const restore = (text: TextCelData, surface: AnimationCelSurface): void => {
          applyTextSurface(session.document, activeLayer, activeSource, activeCel, cloneTextCelData(text), cloneAnimationCelSurface(surface))
          if (activeTimeline.activeFrameId === activeTransform.frameId) refreshActiveAnimationFrame(session.document)
        }
        session.textBoxTransform = null
        session.history.push({
          label: tr('workspace.history.transformSelectionContent'),
          bytes: beforeSurface.pixels.byteLength + afterSurface.pixels.byteLength + 128,
          undo: () => restore(beforeText, beforeSurface),
          redo: () => restore(afterText, afterSurface)
        })
      })
    },

    cancelTextBoxTransform() {
      get().mutateActive((session) => {
        const transform = session.textBoxTransform
        if (!transform) return
        const layer = session.document.layers.find((candidate) => candidate.id === transform.layerId && candidate.kind === 'text')
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === transform.layerId && candidate.frameId === transform.frameId)
        const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (layer && cel && source) {
          applyTextSurface(session.document, layer, source, cel, cloneTextCelData(transform.originalText), cloneAnimationCelSurface(transform.originalSurface))
          if (timeline.activeFrameId === transform.frameId) refreshActiveAnimationFrame(session.document)
        }
        session.textBoxTransform = null
      }, false)
    },

    setSelectionKind(kind) { get().mutateActive((session) => { session.selectionKind = kind; persistToolSettings(session) }, false) },

    setSelectionMode(mode) { get().mutateActive((session) => { session.selectionMode = mode; persistToolSettings(session) }, false) },

    setSelectionRounded(enabled) { get().mutateActive((session) => { session.selectionRounded = enabled; persistToolSettings(session) }, false) },

    setSelectionCornerRadius(radius) { get().mutateActive((session) => { session.selectionCornerRadius = Math.max(0, Math.min(256, Math.round(radius) || 0)); persistToolSettings(session) }, false) },

    setWandTolerance(tolerance) { get().mutateActive((session) => { session.wandTolerance = Math.max(0, Math.min(255, Math.round(tolerance) || 0)); persistToolSettings(session) }, false) },

    setWandContiguous(contiguous) { get().mutateActive((session) => { session.wandContiguous = contiguous; persistToolSettings(session) }, false) },

    setWandGapClosing(enabled) { get().mutateActive((session) => { session.wandGapClosing = enabled; persistToolSettings(session) }, false) },

    setWandGapThreshold(threshold) { get().mutateActive((session) => { session.wandGapThreshold = normalizeGapClosingThreshold(threshold); persistToolSettings(session) }, false) },

    setCanvasResizePreview(preview) {
      const session = activeSession(get())
      const current = session?.canvasResizePreview
      if (current?.width === preview?.width && current?.height === preview?.height && current?.offsetX === preview?.offsetX && current?.offsetY === preview?.offsetY) return
      get().mutateActive((active) => { active.canvasResizePreview = preview ? { ...preview } : null }, false)
    },

    setOutlinePreview(preview) {
      get().mutateActive((session) => { session.outlinePreview = preview ? { ...preview, color: { ...preview.color }, backgroundColor: { ...preview.backgroundColor }, directions: { ...preview.directions } } : null }, false)
    },

    commitSelectionChange(before, after, label, options = {}) {
      const selectionCommitStartedAt = typeof window !== 'undefined' && window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
      const sameMask = before?.mask === after?.mask
        || (before?.mask?.length === after?.mask?.length
          && (before?.mask?.length ?? 0) < 1_000_000
          && before?.mask?.every((value, index) => value === after?.mask?.[index]))
      const same = before?.x === after?.x && before?.y === after?.y && before?.width === after?.width && before?.height === after?.height && sameMask
      if (same || (!before && !after)) {
        if (selectionCommitStartedAt) window.__moonSpriteCanvasProbe?.recordOperationStage?.('selection.commit-skip', performance.now() - selectionCommitStartedAt)
        return
      }
      get().mutateActive((session) => {
        const resetTimelineSelection = options.resetTimelineSelection === true
          && !session.activeLayerMaskId
          && (session.selectedAnimationFrameIds.length > 0
            || session.selectedAnimationCellKeys.length > 0
            || session.selectedAnimationMaskCellKeys.length > 0
            || session.selectedAnimationMaskRowKeys.length > 0
            || session.selectedLayerIds.length > 1
            || session.selectedGroupIds.length > 0
            || session.selectedGroupId !== null)
        const snapshot = (value: SelectionMask | null): SelectionMask | null => value ? { ...value } : null
        const beforeSnapshot = snapshot(before)
        const afterSnapshot = snapshot(after)
        session.selection = afterSnapshot
        session.selectionPropertiesActive = false
        session.selectionAspectRatio = null
        session.selectionAngle = 0
        session.selectionPivot = null
        session.freeTransformActive = false
        session.freeTransformQuad = null
        if (resetTimelineSelection) {
          const activeLayerId = session.document.activeLayerId
          clearAnimationItemSelection(session)
          session.selectedGroupId = null
          session.selectedGroupIds = []
          session.selectedLayerIds = activeLayerId ? [activeLayerId] : []
          session.layerSelectionExplicit = false
          session.layerSelectionAnchorId = activeLayerId
          session.selectionGuidesPreservedAtContentRevision = undefined
        }
        const entry: HistoryEntry = {
          label,
          bytes: 48 + (before?.mask?.byteLength ?? 0) + (after?.mask?.byteLength ?? 0),
          undo: () => { session.selection = snapshot(beforeSnapshot); session.selectionPivot = null },
          redo: () => { session.selection = snapshot(afterSnapshot); session.selectionPivot = null },
          documentChanged: false,
          contentChanged: false,
          requiresAnimationSync: false
        }
        // Timeline selection is intentionally not part of this deselect history.
        // Once Ctrl+D has ended a transformed multi-selection, undoing the canvas
        // selection must not resurrect the stale multi-target editing context.
        session.history.push(entry)
      }, false)
      if (selectionCommitStartedAt) window.__moonSpriteCanvasProbe?.recordOperationStage?.('selection.commit-total', performance.now() - selectionCommitStartedAt, {
        beforeBytes: before?.mask?.byteLength ?? 0,
        afterBytes: after?.mask?.byteLength ?? 0
      })
    },

    commitFloatingSelectionBoxMove(before, after, beforePivot, afterPivot) {
      if (selectionMasksEqual(before, after) && beforePivot?.x === afterPivot?.x && beforePivot?.y === afterPivot?.y) return
      get().mutateActive((session) => {
        const pending = session.pendingPaste
        if (!pending || pending.source.origin !== 'clipboard') return
        recordFloatingSelectionBoxMove(session, pending, before, after, beforePivot, afterPivot)
      }, false)
    },

    commitTilemapSelectionMove(edit, before, after, label) {
      const session = activeSession(get())
      if (!session || edit.before.size === 0 || edit.after.size === 0) return
      const beforeSelection = cloneSelectionMask(before)
      const afterSelection = cloneSelectionMask(after)
      session.selection = cloneSelectionMask(afterSelection)
      const invalidation: ContentInvalidationHint = edit.dirtyRect
        ? { kind: 'region', frameId: edit.frameId, rect: { ...edit.dirtyRect } }
        : { kind: 'full' }
      get().pushHistory({
        label,
        bytes: tilemapEditBytes(edit) + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 64,
        undo: () => {
          applyTilemapDocumentEdit(session.document, edit, 'before')
          session.selection = cloneSelectionMask(beforeSelection)
        },
        redo: () => {
          applyTilemapDocumentEdit(session.document, edit, 'after')
          session.selection = cloneSelectionMask(afterSelection)
        },
        invalidation,
        affectedLayerIds: [edit.layerId],
        contentChanged: true,
        requiresAnimationSync: false
      })
    },

    togglePixelGrid() {
      const session = activeSession(get())
      if (session) get().setView({ showPixelGrid: !session.view.showPixelGrid })
    },

    toggleGrid() {
      const session = activeSession(get())
      if (session) get().setView({ showGrid: !session.view.showGrid })
    },

    deleteSelection() {
      const current = activeSession(get())
      if (current?.pendingPaste) { get().cancelFloatingPaste(); return }
      if (!current?.selection) return
      if (activePaintLayer(current).kind === 'free-tile' && current.freeTileMode === 'edit' && current.selectedFreeTileInstanceId) {
        get().mutateActive((session) => {
          deleteFreeTileSourceSelectionInSession(recordDocumentOperation, session)
        }, false)
        return
      }
      const mask = activeLayerMask(current)
      if (mask) {
        const edit = fillSelectionOrCanvas(current.document, mask, current.secondaryColor, current.selection)
        if (edit) get().commitPixelEdit(edit, tr('workspace.history.deleteSelection'))
        return
      }
      const operationProbe = window.__moonSpriteCanvasProbe
      const editStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      const edit = clearSelection(current.document, current.selection, activePaintLayer(current))
      operationProbe?.recordOperationStage?.('selection-delete.build-edit', performance.now() - editStartedAt, {
        points: edit?.before.size ?? 0,
        runs: edit?.runs?.length ?? 0,
        densePixels: edit?.denseRegion?.count ?? 0,
        dirtyPixels: edit?.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0
      })
      if (!edit) return
      const commitStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      get().commitPixelEdit(edit, tr('workspace.history.deleteSelection'))
      operationProbe?.recordOperationStage?.('selection-delete.commit-total', performance.now() - commitStartedAt)
    },

    fillForeground() {
      const current = activeSession(get())
      if (!current) return
      if (selectedGroupRows(current).length > 0) return
      if (current.pendingPaste) get().commitFloatingPaste()
      const session = activeSession(get())
      if (!session) return
      const layer = activePaintLayer(session)
      if (layer.kind === 'free-tile' && session.freeTileMode === 'edit' && session.selectedFreeTileInstanceId) {
        const target = activeFreeTileCelTarget(session.document)
        const instance = target?.layer.id === layer.id
          ? target.freeTiles.instances.find((candidate) => candidate.id === session.selectedFreeTileInstanceId) ?? null
          : null
        const source = target && instance ? freeTileSourceForInstance(target.sources, instance) : null
        const sourceLayer = source ? layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
        if (!target || !instance || !source || !sourceLayer || sourceLayer.locked === true || source.visible === false || instance.locked === true || instance.visible === false) return
        const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
        const sourceEdit = createFreeTileSourceEditRaster(session.document, source, bounds, session.selection ? { x: session.selection.x, y: session.selection.y } : undefined, instance)
        if (!sourceEdit) return
        const selection = freeTileSelectionToEditRaster(sourceEdit, session.selection) ?? {
          x: sourceEdit.sourceOffset.x,
          y: sourceEdit.sourceOffset.y,
          width: sourceEdit.transformedSourceBounds.width,
          height: sourceEdit.transformedSourceBounds.height
        }
        const edit = fillSelectionOrCanvas(sourceEdit.document, sourceEdit.layer, session.primaryColor, selection)
        if (!edit) { set({ message: tr('workspace.fill.empty') }); return }
        commitFreeTileSourceEditInSession(recordDocumentOperation,
          session,
          source.id,
          sourceEdit.before,
          freeTileSourceSnapshotFromEditRaster(sourceEdit),
          session.selection ? tr('workspace.history.fillSelectionForeground') : tr('workspace.history.fillCanvasForeground')
        )
        return
      }
      if (!isLayerEffectivelyVisible(session.document, layer)) { set({ message: tr('workspace.fill.invisible') }); return }
      if (isLayerEffectivelyLocked(session.document, layer)) { set({ message: tr('workspace.fill.locked') }); return }
      const operationProbe = window.__moonSpriteCanvasProbe
      const editStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      const edit = fillSelectionOrCanvas(session.document, layer, session.primaryColor, session.selection)
      operationProbe?.recordOperationStage?.('selection-fill.build-edit', performance.now() - editStartedAt, {
        points: edit?.before.size ?? 0,
        runs: edit?.runs?.length ?? 0,
        densePixels: edit?.denseRegion?.count ?? 0,
        dirtyPixels: edit?.dirtyRect ? edit.dirtyRect.width * edit.dirtyRect.height : 0
      })
      if (!edit) { set({ message: tr('workspace.fill.empty') }); return }
      const commitStartedAt = operationProbe?.recordOperationStage ? performance.now() : 0
      get().commitPixelEdit(edit, session.selection ? tr('workspace.history.fillSelectionForeground') : tr('workspace.history.fillCanvasForeground'))
      operationProbe?.recordOperationStage?.('selection-fill.commit-total', performance.now() - commitStartedAt)
    },

    outlineActiveSelection(settings) {
      const session = activeSession(get())
      if (!session) return false
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) { set({ message: tr('workspace.clipboard.layerLocked') }); return false }
      try {
        const normalized = normalizeOutlineSettings(settings, session.primaryColor)!
        const edit = outlineSelection(session.document, layer, session.selection, normalized.color, normalized.thickness, normalized.position, normalized.directions, normalized.kernel, normalized.smartHue, normalized.smartHueDarkness, normalized.backgroundColor, normalized.followOpacity)
        if (!edit) { set({ message: tr('workspace.outline.noContent') }); return false }
        session.document.outlineSettings = cloneOutlineSettings(normalized)
        persistOutlineSettings(normalized)
        const historyLabel = normalized.position === 'inside'
          ? tr('workspace.history.outlineInside')
          : normalized.position === 'both'
            ? tr('workspace.history.outlineBoth')
            : tr('workspace.history.outlineOutside')
        const positionLabel = normalized.position === 'inside'
          ? tr('outline.inside')
          : normalized.position === 'both'
            ? tr('outline.both')
            : tr('outline.outside')
        get().commitPixelEdit(edit, historyLabel)
        set({ message: tr('workspace.outline.applied', { thickness: normalized.thickness, position: positionLabel }) })
        return true
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.outline.applyError') })
        return false
      }
    },

    quickOutlineActiveSelection() {
      const session = activeSession(get())
      if (!session) return false
      const settings = savedOutlineSettingsForSession(session)
      // Quick outline follows geometry/direction preferences but always uses
      // the foreground color at the moment the shortcut is pressed.
      return get().outlineActiveSelection({ ...settings, color: { ...session.primaryColor }, smartHue: false })
    },

    outlineSelectionInside() {
      const session = activeSession(get())
      if (!session) return false
      if (!session.selection) { set({ message: tr('app.selection.required') }); return false }
      const settings = savedOutlineSettingsForSession(session)
      // The S command is deliberately a one-shot inside stroke; it does not
      // change the user's saved Shift+O position preference.
      const insideSettings = {
        ...settings,
        position: 'inside' as const,
        color: { ...session.primaryColor },
        smartHue: false
      }
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) { set({ message: tr('workspace.clipboard.layerLocked') }); return false }
      try {
        const edit = outlineSelectionBoundary(session.document, layer, session.selection, insideSettings.color, insideSettings.thickness, insideSettings.directions, insideSettings.kernel, insideSettings.smartHue, insideSettings.smartHueDarkness, insideSettings.followOpacity)
        if (!edit) { set({ message: tr('workspace.outline.noContent') }); return false }
        get().commitPixelEdit(edit, tr('workspace.history.outlineInside'))
        set({ message: tr('workspace.outline.applied', { thickness: insideSettings.thickness, position: tr('outline.inside') }) })
        return true
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.outline.applyError') })
        return false
      }
    },

    antiAliasSelection(color, autoColorOpacity, includeInteriorColors, colorSource) {
      const session = activeSession(get())
      if (!session) return false
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) { set({ message: tr('workspace.clipboard.layerLocked') }); return false }
      const edit = antiAliasSelection(session.document, layer, session.selection, color, autoColorOpacity, includeInteriorColors, colorSource)
      if (!edit) { set({ message: tr('workspace.outline.noContent') }); return false }
      get().commitPixelEdit(edit, tr('workspace.history.antiAlias'))
      return true
    },

    previewAntiAliasSelection(color, autoColorOpacity, includeInteriorColors, colorSource, previous = null) {
      const state = get()
      const changedSessions = new Set<DocumentSession>()
      if (previous) {
        const previousSession = state.sessions.find((candidate) => candidate.document.id === previous.documentId)
        if (previousSession) {
          restoreAntiAliasPreviewState(previousSession, previous)
          invalidateAntiAliasPreview(previousSession)
          changedSessions.add(previousSession)
        }
      }
      const session = activeSession(state)
      if (!session) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      const layer = activePaintLayer(session)
      if (isLayerEffectivelyLocked(session.document, layer)) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      const edit = antiAliasSelection(session.document, layer, session.selection, color, autoColorOpacity, includeInteriorColors, colorSource)
      if (!edit) {
        if (changedSessions.size > 0) set({ sessions: [...state.sessions] })
        return null
      }
      syncActiveAnimationFrame(session.document)
      invalidateAntiAliasPreview(session)
      changedSessions.add(session)
      set({ sessions: [...state.sessions] })
      return { documentId: session.document.id, edit }
    },

    restoreAntiAliasPreview(preview) {
      if (!preview) return
      const state = get()
      const session = state.sessions.find((candidate) => candidate.document.id === preview.documentId)
      if (!session) return
      restoreAntiAliasPreviewState(session, preview)
      invalidateAntiAliasPreview(session)
      set({ sessions: [...state.sessions] })
    },

    updateFloatingPastePreview(edit, target, translationPreview = null, transformTarget, transformAngle, transformShear, previewDeferred = false, layers, transformQuad) {
      get().mutateActive((session) => {
        if (!session.pendingPaste) return
        const previousTarget = session.pendingPaste.target
        clearFloatingSelectionBoxHistory(session.pendingPaste)
        if (layers) session.pendingPaste.layers = layers
        session.pendingPaste.previewEdit = edit
        session.pendingPaste.translationPreview = translationPreview
        session.pendingPaste.previewDeferred = session.pendingPaste.layers?.length ? false : previewDeferred
        session.pendingPaste.target = cloneSelectionMask(target)!
        if (transformTarget) session.pendingPaste.transformTarget = { ...transformTarget }
        else if ((session.pendingPaste.transformAngle ?? 0) % 360 === 0 && !session.pendingPaste.transformShear) {
          session.pendingPaste.transformTarget = { x: target.x, y: target.y, width: target.width, height: target.height }
        }
        if (transformAngle !== undefined) session.pendingPaste.transformAngle = transformAngle
        if (transformShear !== undefined) session.pendingPaste.transformShear = { ...transformShear }
        else if (transformAngle !== undefined) session.pendingPaste.transformShear = undefined
        if (transformQuad !== undefined) session.pendingPaste.transformQuad = cloneSelectionQuad(transformQuad) ?? undefined
        syncFloatingPrimaryLayerState(session.pendingPaste)
        session.selection = cloneSelectionMask(target)
        if (session.pendingPaste.previewDeferred) markFloatingOverlayChanged(session)
        else markFloatingPreviewChanged(session, previousTarget, target)
      }, false)
    },

    beginFloatingSelectionTransform(source, edit, before, target, copy, label, translationPreview = null, transformTarget, transformAngle = 0, transformShear, previewDeferred = false, tilemapEditCellIndex, layers, transformQuad) {
      get().mutateActive((session) => {
        const layer = layers?.[0] ?? null
        const activeLayer = activePaintLayer(session)
        session.pendingPaste = {
          layerId: layer?.layerId ?? activeLayer.id,
          ...(layers ? { layers } : {}),
          beforeSelection: cloneSelectionMask(before),
          beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
          source: layer?.source ?? source,
          target: cloneSelectionMask(target)!,
          transformTarget: transformTarget ? { ...transformTarget } : { x: target.x, y: target.y, width: target.width, height: target.height },
          transformAngle,
          transformShear: transformShear ? { ...transformShear } : undefined,
          transformQuad: cloneSelectionQuad(transformQuad) ?? undefined,
          previewEdit: layer?.previewEdit ?? edit,
          translationPreview: layer?.translationPreview ?? translationPreview,
          previewDeferred: layers?.length ? false : previewDeferred,
          tilemapEditCellIndex,
          copy,
          label
        }
        session.selection = cloneSelectionMask(target)
        if (session.pendingPaste.previewDeferred) markFloatingOverlayChanged(session)
        else markFloatingPreviewChanged(session, before, target)
      }, false)
    },

    beginFreeTileFloatingSelectionTransform(options) {
      get().mutateActive((session) => {
        const activeLayer = activePaintLayer(session)
        session.pendingPaste = {
          layerId: activeLayer.id,
          beforeSelection: cloneSelectionMask(options.before),
          beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
          source: options.source,
          target: cloneSelectionMask(options.target)!,
          transformTarget: options.transformTarget
            ? { ...options.transformTarget }
            : { x: options.target.x, y: options.target.y, width: options.target.width, height: options.target.height },
          transformAngle: options.transformAngle ?? 0,
          transformShear: options.transformShear ? { ...options.transformShear } : undefined,
          transformQuad: cloneSelectionQuad(options.transformQuad) ?? undefined,
          previewEdit: options.previewEdit,
          translationPreview: options.translationPreview ?? null,
          previewDeferred: false,
          copy: options.copy,
          label: options.label,
          freeTile: {
            sourceId: options.sourceId,
            instanceId: options.instanceId,
            edit: options.edit,
            selectionSource: cloneSelectionMask(options.selectionSource)!
          }
        }
        session.selection = cloneSelectionMask(options.target)
        markFloatingOverlayChanged(session)
      }, false)
    },

    commitFloatingPaste(deselectLabel) {
      const current = activeSession(get())
      if (!current?.pendingPaste) return
      get().mutateActive((session) => {
        const pending = session.pendingPaste
        if (!pending) return
        const beforeFreeTransformQuad = cloneSelectionQuad(session.freeTransformQuad)
        const afterFreeTransformQuad = session.freeTransformActive
          ? cloneSelectionQuad(pending.transformQuad)
            ?? selectionQuadFromRect(pending.transformTarget ?? pending.target)
          : null
        if (pending.freeTile) {
          const beforeSelection = cloneSelectionMask(pending.beforeSelection)
          const afterSelection = cloneSelectionMask(pending.target)
          const beforeSelectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
          const afterSelectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
          const freeTile = pending.freeTile
          session.pendingPaste = null
          if (session.freeTransformActive) session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
          commitFreeTileSourceEditInSession(recordDocumentOperation,
            session,
            freeTile.sourceId,
            freeTile.edit.before,
            freeTileSourceSnapshotFromEditRaster(freeTile.edit),
            pending.label,
            undefined,
            {
              before: beforeSelection,
              after: afterSelection,
              beforePivot: beforeSelectionPivot,
              afterPivot: afterSelectionPivot
            }
          )
          if (deselectLabel && afterSelection) {
            session.selection = null
            session.selectionPivot = null
            session.freeTransformActive = false
            session.freeTransformQuad = null
            session.history.push({
              label: deselectLabel,
              bytes: 48 + (afterSelection.mask?.byteLength ?? 0),
              undo: () => { session.selection = cloneSelectionMask(afterSelection); session.selectionPivot = afterSelectionPivot ? { ...afterSelectionPivot } : null; session.freeTransformActive = false; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) },
              redo: () => { session.selection = null; session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = null },
              documentChanged: false,
              contentChanged: false,
              requiresAnimationSync: false
            })
          }
          return
        }
        if (pending.layers?.length) {
          const beforeAnimationSelection = captureAnimationSelectionHistory(session)
          const transformTarget = pending.transformTarget ?? { x: pending.target.x, y: pending.target.y, width: pending.target.width, height: pending.target.height }
          const simpleTranslation = (pending.transformAngle ?? 0) % 360 === 0
            && !pending.transformShear
            && !pending.transformQuad
            && transformTarget.width === pending.source.selection.width
            && transformTarget.height === pending.source.selection.height
            && !transformTarget.flipHorizontal
            && !transformTarget.flipVertical
          const entries: HistoryEntry[] = []
          for (const layerState of pending.layers) {
            const layer = selectionTransformLayerForState(session.document, layerState)
            if (!layer || layer.kind) continue
            const edit = pending.previewDeferred
              ? layerState.frameId
                ? applySelectionTransformLayerState(session.document, layerState, transformTarget, pending.transformAngle ?? 0, pending.copy, pending.transformShear, undefined, undefined, undefined, pending.transformQuad, session.selectionRotationAlgorithm === 'rotsprite')
                : simpleTranslation
                ? applySelectionTranslationCommit(session.document, layerState.source, transformTarget, pending.copy, layer, session.view.tileRepeatMode)
                : applySelectionTransform(session.document, layerState.source, transformTarget, pending.transformAngle ?? 0, pending.copy, pending.transformShear, undefined, undefined, layer, undefined, pending.transformQuad, false, session.selectionRotationAlgorithm === 'rotsprite')
              : layerState.previewEdit ?? (layerState.translationPreview ? selectionTranslationPreviewEdit(session.document, layerState.translationPreview) : null)
            const entry = edit ? commitPixelEdit(session.document, edit, pending.label) : null
            if (entry) entries.push(entry)
          }
          const beforeSelection = cloneSelectionMask(pending.beforeSelection)
          const tileRepeatMode = session.view.tileRepeatMode ?? 'off'
          const afterSelection = simpleTranslation && tileRepeatMode !== 'off'
            ? wrapSelectionMaskForTileRepeat(pending.target, session.document.width, session.document.height, tileRepeatMode) ?? cloneSelectionMask(pending.target)!
            : cloneSelectionMask(pending.target)!
          const beforeSelectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
          const selectionChanged = !selectionMasksEqual(beforeSelection, afterSelection)
          session.pendingPaste = null
          session.selection = deselectLabel ? null : cloneSelectionMask(afterSelection)
          if (session.freeTransformActive) session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
          else session.freeTransformQuad = null
          if (deselectLabel) session.selectionPivot = null
          if (deselectLabel) {
            session.freeTransformActive = false
            session.freeTransformQuad = null
          }
          const afterAnimationSelection = captureAnimationSelectionHistory(session)
          if (entries.length > 0) {
            const entry = combinedPixelHistoryEntry(
              session,
              entries,
              pending.label,
              beforeSelection,
              afterSelection,
              beforeSelectionPivot,
              null,
              beforeFreeTransformQuad,
              afterFreeTransformQuad
            )
            session.history.push(historyEntryWithAnimationSelection(session, entry, beforeAnimationSelection, afterAnimationSelection))
          } else if (selectionChanged) {
            const entry: HistoryEntry = {
              label: pending.label,
              bytes: 48 + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection.mask?.byteLength ?? 0),
              undo: () => {
                session.selection = cloneSelectionMask(beforeSelection)
                session.selectionPivot = beforeSelectionPivot ? { ...beforeSelectionPivot } : null
                session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad)
              },
              redo: () => {
                session.selection = cloneSelectionMask(afterSelection)
                session.selectionPivot = null
                session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
              },
              documentChanged: false,
              contentChanged: false,
              requiresAnimationSync: false
            }
            session.history.push(historyEntryWithAnimationSelection(session, entry, beforeAnimationSelection, afterAnimationSelection))
          }
          if (deselectLabel) session.history.push({
            label: deselectLabel,
            bytes: 48 + (afterSelection.mask?.byteLength ?? 0),
            undo: () => { session.selection = cloneSelectionMask(afterSelection); session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) },
            redo: () => { session.selection = null; session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = null },
            documentChanged: false,
            contentChanged: false,
            requiresAnimationSync: false
          })
          if (entries.length > 0) {
            for (const layerId of new Set(entries.flatMap((entry) => entry.affectedLayerIds ?? []))) syncActiveAnimationLayer(session.document, layerId)
            session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
            completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
          }
          return
        }
        const activeLayer = session.document.layers.find((layer) => layer.id === pending.layerId)
        const transformTarget = pending.transformTarget ?? { x: pending.target.x, y: pending.target.y, width: pending.target.width, height: pending.target.height }
        const simpleTranslation = (pending.transformAngle ?? 0) % 360 === 0
          && !pending.transformShear
          && !pending.transformQuad
          && transformTarget.width === pending.source.selection.width
          && transformTarget.height === pending.source.selection.height
          && !transformTarget.flipHorizontal
          && !transformTarget.flipVertical
        const currentTilemapTarget = activeLayer?.kind === 'tilemap' ? activeTilemapCelTarget(session.document) : null
        const tilemapTarget = currentTilemapTarget?.layer.id === activeLayer?.id ? currentTilemapTarget : null
        const hybridCellTranslation = session.tilemapMode === 'hybrid'
          && pending.source.origin === 'selection'
          && !pending.sourceFlipHorizontal
          && !pending.sourceFlipVertical
          && simpleTranslation
          && tilemapTarget
          ? tilemapCellTranslationForSelection(
              tilemapTarget.tilemap,
              tilemapTarget.surface.offsetX,
              tilemapTarget.surface.offsetY,
              pending.source.selection,
              transformTarget
            )
          : null
        const edit = hybridCellTranslation
          ? null
          : pending.previewDeferred && activeLayer && (!activeLayer.kind || activeLayer.kind === 'tilemap')
            ? simpleTranslation
              ? applySelectionTranslationCommit(session.document, pending.source, transformTarget, pending.copy, activeLayer, session.view.tileRepeatMode)
              : applySelectionTransform(session.document, pending.source, transformTarget, pending.transformAngle ?? 0, pending.copy, pending.transformShear, undefined, undefined, activeLayer, undefined, pending.transformQuad, false, session.selectionRotationAlgorithm === 'rotsprite')
            : pending.previewEdit ?? (pending.translationPreview ? selectionTranslationPreviewEdit(session.document, pending.translationPreview) : null)
        const timeline = ensureAnimationDocument(session.document)
        const activeCel = activeLayer?.kind === 'text' ? timeline.cels.find((cel) => cel.layerId === activeLayer.id && cel.frameId === timeline.activeFrameId) : null
        const textSource = activeCel ? resolveAnimationCel(timeline, activeCel) ?? activeCel : null
        if (activeLayer?.kind === 'text' && textSource?.text) restoreFloatingPreview(session)
        const beforeText = textSource?.text ? cloneTextCelData(textSource.text) : null
        const beforeTextSurface = activeLayer?.kind === 'text' && textSource?.surface ? cloneAnimationCelSurface(textSource.surface) : null
        let tilemapPixelEdit: TilemapTilesetEdit | null = null
        if (activeLayer?.kind === 'tilemap' && session.tilemapMode !== 'paint') {
          if (hybridCellTranslation && tilemapTarget) {
            restoreFloatingPreview(session)
            tilemapPixelEdit = applyTilemapSelectionCellMove(
              session.document,
              tilemapTarget.layer.id,
              tilemapTarget.cel.frameId,
              pending.source.selection,
              hybridCellTranslation.columns,
              hybridCellTranslation.rows,
              pending.copy
            )
          } else if (edit) {
            const conversionMode: Exclude<TilemapDrawingMode, 'paint'> = session.tilemapMode
            tilemapPixelEdit = convertTilemapPixelEdit(
              session.document,
              edit,
              conversionMode,
              activeLayer.tilemapTilesetId ?? session.selectedTilesetId ?? '',
              () => createId('tile'),
              pending.tilemapEditCellIndex
            )
          }
        }
        const pixelEntry: HistoryEntry | null = tilemapPixelEdit && tilemapTilesetEditHasChanges(tilemapPixelEdit)
          ? {
              label: pending.label,
              bytes: tilemapTilesetEditBytes(tilemapPixelEdit),
              undo: () => { applyTilemapTilesetDocumentEdit(session.document, tilemapPixelEdit, 'before') },
              redo: () => { applyTilemapTilesetDocumentEdit(session.document, tilemapPixelEdit, 'after') },
              invalidation: { kind: 'full' },
              affectedLayerIds: [pending.layerId],
              contentChanged: true,
              requiresAnimationSync: false
            }
          : activeLayer?.kind ? null : edit ? commitPixelEdit(session.document, edit, pending.label) : null
        const selectedTileId = tilemapPixelEdit?.changedTileIds.at(-1)
        if (selectedTileId) {
          session.selectedTilesetId = tilemapPixelEdit!.tilesetId
          session.selectedTileId = selectedTileId
          session.secondaryTileId = session.document.tilesets?.find((tileset) => tileset.id === tilemapPixelEdit!.tilesetId)?.tileIds.includes(session.secondaryTileId ?? '')
            ? session.secondaryTileId
            : selectedTileId
        }
        const selectionSnapshot = (value: SelectionMask | null): SelectionMask | null => value ? { ...value } : null
        const beforeSelection = selectionSnapshot(pending.beforeSelection)
        const tileRepeatMode = session.view.tileRepeatMode ?? 'off'
        const visibleSelection = floatingPasteSelectionForCommit(session, pending)
        const afterSelection = simpleTranslation && tileRepeatMode !== 'off'
          ? wrapSelectionMaskForTileRepeat(visibleSelection, session.document.width, session.document.height, tileRepeatMode) ?? selectionSnapshot(visibleSelection)!
          : selectionSnapshot(visibleSelection)!
        const selectionGeometryChanged = beforeSelection?.x !== afterSelection.x || beforeSelection?.y !== afterSelection.y
          || beforeSelection?.width !== afterSelection.width || beforeSelection?.height !== afterSelection.height
        const sameMask = selectionGeometryChanged || beforeSelection?.mask === afterSelection.mask
          || (beforeSelection?.mask?.length === afterSelection.mask?.length && beforeSelection?.mask?.every((value, index) => value === afterSelection.mask?.[index]))
        const selectionChanged = selectionGeometryChanged || !sameMask
        session.pendingPaste = null
        session.selection = deselectLabel ? null : afterSelection
        if (session.freeTransformActive) session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad)
        else session.freeTransformQuad = null
        if (deselectLabel) session.selectionPivot = null
        if (deselectLabel) {
          session.freeTransformActive = false
          session.freeTransformQuad = null
        }
        let textHistory: { before: TextCelData; after: TextCelData; restore: (value: TextCelData) => void } | null = null
        if (activeLayer?.kind === 'text' && textSource?.text && (edit || selectionChanged)) {
          const sourceTarget = { x: pending.source.selection.x, y: pending.source.selection.y, width: pending.source.selection.width, height: pending.source.selection.height }
          const target = pending.transformTarget ?? { x: pending.target.x, y: pending.target.y, width: pending.target.width, height: pending.target.height }
          const sourceRect = { ...sourceTarget }
          const targetRect = { ...target }
          const nextText = cloneTextCelData(textSource.text)
          nextText.transforms = [...(nextText.transforms ?? []), {
            source: sourceRect,
            target: targetRect,
            angle: pending.transformAngle ?? 0,
            ...(pending.transformShear ? { shear: { ...pending.transformShear } } : {})
          }]
          const rendered = rasterizeText(nextText, nextText.originX ?? sourceRect.x, nextText.originY ?? sourceRect.y)
          const surface = convertTextSurface(rendered.rgba, session.document.colorMode, session.document.palette, (color) => paletteColorIdForCanvas(session.document, color))
          applyTextSurface(session.document, activeLayer, textSource, activeCel!, rendered.data, surface)
          refreshActiveAnimationFrame(session.document)
          const afterText = cloneTextCelData(nextText)
          const afterTextSurface = cloneAnimationCelSurface(surface)
          const restoreText = (value: TextCelData, restoredSurface: AnimationCelSurface): void => {
            applyTextSurface(session.document, activeLayer, textSource, activeCel!, value, cloneAnimationCelSurface(restoredSurface))
            refreshActiveAnimationFrame(session.document)
          }
          textHistory = {
            before: beforeText!,
            after: afterText,
            restore: (value) => restoreText(value, value === beforeText ? beforeTextSurface! : afterTextSurface)
          }
        }
        if (pixelEntry) session.history.push({
          ...pixelEntry,
          bytes: pixelEntry.bytes + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 64,
          undo: () => { pixelEntry.undo(); session.selection = selectionSnapshot(beforeSelection); session.selectionPivot = null; session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad) },
          redo: () => { pixelEntry.redo(); session.selection = selectionSnapshot(afterSelection); session.selectionPivot = null; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) }
        })
        else if (selectionChanged || textHistory) session.history.push({
          label: pending.label,
          bytes: 48 + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
          undo: () => { textHistory?.restore(textHistory.before); session.selection = selectionSnapshot(beforeSelection); session.selectionPivot = null; session.freeTransformQuad = cloneSelectionQuad(beforeFreeTransformQuad) },
          redo: () => { textHistory?.restore(textHistory.after); session.selection = selectionSnapshot(afterSelection); session.selectionPivot = null; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) }
        })
        if (deselectLabel) session.history.push({
          label: deselectLabel,
          bytes: 48 + (afterSelection.mask?.byteLength ?? 0),
          undo: () => { session.selection = selectionSnapshot(afterSelection); session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = cloneSelectionQuad(afterFreeTransformQuad) },
          redo: () => { session.selection = null; session.selectionPivot = null; session.freeTransformActive = false; session.freeTransformQuad = null },
          documentChanged: false,
          contentChanged: false,
          requiresAnimationSync: false
        })
        if (pixelEntry) {
          if (activeLayer?.kind !== 'tilemap') syncActiveAnimationLayer(session.document, pending.layerId)
          if (!deselectLabel) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          completeDocumentChange(session, 'content', recordDocumentOperation, pixelEntry.invalidation)
        } else if (textHistory) {
          if (!deselectLabel) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          touch(session, true)
          recordDocumentOperation(session)
        }
      }, false)
    },

    cancelFloatingPaste() {
      const current = activeSession(get())
      if (!current?.pendingPaste) return
      get().mutateActive((session) => {
        const pending = session.pendingPaste
        if (!pending) return
        if (pending.freeTile) {
          const restored = applyFreeTileSourceSnapshot(session.document, pending.freeTile.edit.before)
          session.selection = cloneSelectionMask(pending.beforeSelection)
          session.selectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
          session.pendingPaste = null
          if (restored) {
            const fromRevision = session.contentRevision
            session.revision += 1
            session.contentRevision += 1
            session.layersPanelRevision += 1
            session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
          } else markFloatingOverlayChanged(session)
          return
        }
        restoreFloatingPreview(session)
        session.selection = cloneSelectionMask(pending.beforeSelection)
        session.selectionPivot = pending.beforeSelectionPivot ? { ...pending.beforeSelectionPivot } : null
        session.pendingPaste = null
        if (pending.previewDeferred) markFloatingOverlayChanged(session)
        else markFloatingPreviewChanged(session, pending.target, pending.beforeSelection ?? pending.target)
      }, false)
    },

    moveActiveSelectionWithSelectionHistory(deltaX, deltaY, allowOutsideCanvas = false) {
      get().mutateActive((session) => {
        if (!session.selection) return
        const currentSelection = cloneSelectionMask(session.selection)!
        const requestedX = currentSelection.x + Math.trunc(deltaX)
        const requestedY = currentSelection.y + Math.trunc(deltaY)
        const nextX = allowOutsideCanvas
          ? requestedX
          : Math.max(0, Math.min(session.document.width - currentSelection.width, requestedX))
        const nextY = allowOutsideCanvas
          ? requestedY
          : Math.max(0, Math.min(session.document.height - currentSelection.height, requestedY))
        const actualX = nextX - currentSelection.x
        const actualY = nextY - currentSelection.y
        if (actualX === 0 && actualY === 0) return

        const pending = session.pendingPaste
        if (pending) {
          const pendingLayer = pending.layers?.length ? null : session.document.layers.find((candidate) => candidate.id === pending.layerId) ?? activePaintLayer(session)
          if (pendingLayer && isLayerEffectivelyLocked(session.document, pendingLayer)) return
          const clipboardSelectionBoxMoved = pending.source.origin === 'clipboard' && !selectionMasksEqual(currentSelection, pending.target)
          if (clipboardSelectionBoxMoved && !allowOutsideCanvas) {
            const nextSelection = { ...currentSelection, x: nextX, y: nextY }
            const beforePivot = cloneSelectionPivot(session.selectionPivot)
            const afterPivot = beforePivot ? { x: beforePivot.x + actualX, y: beforePivot.y + actualY } : null
            recordFloatingSelectionBoxMove(session, pending, currentSelection, nextSelection, beforePivot, afterPivot)
            if (pending.transformQuad) pending.transformQuad = translateSelectionQuad(pending.transformQuad, actualX, actualY) ?? undefined
            return
          }
          // Centering a floating clipboard paste must move its pixels along with
          // the selection box. A box-only move intentionally keeps the
          // materialized preview at its original target until the user begins a
          // content move; the centering command opts into the content path via
          // allowOutsideCanvas. Rebase the transform on the visible selection
          // before applying the requested centering delta so the old preview is
          // restored and cannot become a ghost at the paste origin.
          if (clipboardSelectionBoxMoved && allowOutsideCanvas) {
            restoreFloatingPreview(session)
            pending.target = cloneSelectionMask(currentSelection)!
            pending.transformTarget = { x: currentSelection.x, y: currentSelection.y, width: currentSelection.width, height: currentSelection.height }
            pending.transformAngle = 0
            pending.transformShear = undefined
            pending.transformQuad = undefined
            pending.previewEdit = null
            pending.translationPreview = null
            clearFloatingSelectionBoxHistory(pending)
          }
          clearFloatingSelectionBoxHistory(pending)
          const previousTarget = cloneSelectionMask(pending.target)!
          const angle = pending.transformAngle ?? 0
          const shear = pending.transformShear
          const transformTarget = pending.transformTarget ?? {
            x: pending.target.x,
            y: pending.target.y,
            width: pending.target.width,
            height: pending.target.height
          }
          const nextTransformTarget = { ...transformTarget, x: transformTarget.x + actualX, y: transformTarget.y + actualY }
          const nextTransformQuad = pending.transformQuad
            ? translateSelectionQuad(pending.transformQuad, actualX, actualY)
            : undefined
          if (pending.previewDeferred) {
            // Deferred previews are rendered by CanvasCompositeCache and must
            // never materialize pixels in the document. Centering a selection
            // while such a preview is active only advances its geometry; the
            // source canvas remains untouched until apply/commit.
            const nextSelection = nextTransformQuad
              ? transformSelectionMaskQuad(floatingSelectionGeometrySource(pending), nextTransformQuad, session.document.width, session.document.height, false, pending.source.sourceQuad)
              : transformSelectionMask(floatingSelectionGeometrySource(pending), nextTransformTarget, session.document.width, session.document.height, angle, shear, false)
            if (!nextSelection) return
            pending.target = cloneSelectionMask(nextSelection)!
            pending.transformTarget = nextTransformTarget
            pending.transformQuad = nextTransformQuad ?? undefined
            session.selection = cloneSelectionMask(nextSelection)
            if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
            markFloatingOverlayChanged(session)
            return
          }
          if (pending.freeTile) {
            restoreFloatingPreview(session)
            const nextSelection = nextTransformQuad
              ? transformSelectionMaskQuad(
                  pending.freeTile.selectionSource,
                  nextTransformQuad,
                  session.document.width,
                  session.document.height,
                  false,
                  pending.source.sourceQuad
                    ? translateSelectionQuad(pending.source.sourceQuad, pending.freeTile.edit.origin.x, pending.freeTile.edit.origin.y) ?? undefined
                    : undefined
                )
              : transformSelectionMask(
                  pending.freeTile.selectionSource,
                  nextTransformTarget,
                  session.document.width,
                  session.document.height,
                  angle,
                  shear,
                  false
                )
            if (!nextSelection) return
            const localTarget = freeTileTransformTargetToEditRaster(pending.freeTile.edit, nextTransformTarget)
            const simpleTranslation = angle % 360 === 0
              && !shear
              && !nextTransformQuad
              && nextTransformTarget.width === pending.source.selection.width
              && nextTransformTarget.height === pending.source.selection.height
              && !nextTransformTarget.flipHorizontal
              && !nextTransformTarget.flipVertical
            pending.previewEdit = null
            pending.translationPreview = simpleTranslation
              ? applySelectionTranslationPreview(
                  pending.freeTile.edit.document,
                  pending.source,
                  localTarget,
                  pending.copy,
                  pending.translationPreview,
                  pending.freeTile.edit.layer
                )
              : null
            if (!simpleTranslation) pending.previewEdit = applySelectionTransform(
              pending.freeTile.edit.document,
              pending.source,
              localTarget,
              angle,
              pending.copy,
              shear,
              undefined,
              undefined,
              pending.freeTile.edit.layer,
              undefined,
              nextTransformQuad
                ? {
                    nw: { x: nextTransformQuad.nw.x - pending.freeTile.edit.origin.x, y: nextTransformQuad.nw.y - pending.freeTile.edit.origin.y },
                    ne: { x: nextTransformQuad.ne.x - pending.freeTile.edit.origin.x, y: nextTransformQuad.ne.y - pending.freeTile.edit.origin.y },
                    se: { x: nextTransformQuad.se.x - pending.freeTile.edit.origin.x, y: nextTransformQuad.se.y - pending.freeTile.edit.origin.y },
                    sw: { x: nextTransformQuad.sw.x - pending.freeTile.edit.origin.x, y: nextTransformQuad.sw.y - pending.freeTile.edit.origin.y }
                  }
                : undefined,
              false,
              session.selectionRotationAlgorithm === 'rotsprite'
            )
            pending.target = cloneSelectionMask(nextSelection)!
            pending.transformTarget = nextTransformTarget
            if (nextTransformQuad) pending.transformQuad = nextTransformQuad
            session.selection = cloneSelectionMask(nextSelection)
            if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
            if (!previewFloatingFreeTileSource(session, pending)) markFloatingOverlayChanged(session)
            return
          }
          restoreFloatingPreview(session)
          const nextSelection = nextTransformQuad
            ? transformSelectionMaskQuad(floatingSelectionGeometrySource(pending), nextTransformQuad, session.document.width, session.document.height, false, pending.source.sourceQuad)
            : transformSelectionMask(floatingSelectionGeometrySource(pending), nextTransformTarget, session.document.width, session.document.height, angle, shear, false)
          if (!nextSelection) return
          const simpleTranslation = angle % 360 === 0
            && !shear
            && !nextTransformQuad
            && nextTransformTarget.width === pending.source.selection.width
            && nextTransformTarget.height === pending.source.selection.height
            && !nextTransformTarget.flipHorizontal
            && !nextTransformTarget.flipVertical
          if (pending.layers?.length) {
            for (const layerState of pending.layers) {
              layerState.previewEdit = null
              if (simpleTranslation && !layerState.frameId) {
                const layer = selectionTransformLayerForState(session.document, layerState)
                if (!layer || layer.kind) continue
                layerState.translationPreview = applySelectionTranslationPreview(session.document, layerState.source, nextTransformTarget, pending.copy, layerState.translationPreview, layer, undefined, session.view.tileRepeatMode)
              } else {
                layerState.translationPreview = null
                layerState.previewEdit = applySelectionTransformLayerState(session.document, layerState, nextTransformTarget, angle, pending.copy, shear, undefined, undefined, undefined, nextTransformQuad ?? undefined, session.selectionRotationAlgorithm === 'rotsprite')
              }
            }
            syncFloatingPrimaryLayerState(pending)
            pending.target = cloneSelectionMask(nextSelection)!
            pending.transformTarget = nextTransformTarget
            if (nextTransformQuad) pending.transformQuad = nextTransformQuad
            session.selection = cloneSelectionMask(nextSelection)
            if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
            markFloatingPreviewChanged(session, previousTarget, nextSelection)
            return
          }
          const layer = pendingLayer ?? activePaintLayer(session)
          pending.previewEdit = null
          pending.translationPreview = simpleTranslation
            ? applySelectionTranslationPreview(session.document, pending.source, nextTransformTarget, pending.copy, pending.translationPreview, layer, tilemapEditClipForCell(session, pending.tilemapEditCellIndex), session.view.tileRepeatMode)
            : null
          if (!simpleTranslation) pending.previewEdit = applySelectionTransform(session.document, pending.source, nextTransformTarget, angle, pending.copy, shear, undefined, undefined, layer, undefined, nextTransformQuad ?? undefined, false, session.selectionRotationAlgorithm === 'rotsprite')
          pending.target = cloneSelectionMask(nextSelection)!
          pending.transformTarget = nextTransformTarget
          if (nextTransformQuad) pending.transformQuad = nextTransformQuad
          session.selection = cloneSelectionMask(nextSelection)
          if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
          markFloatingPreviewChanged(session, previousTarget, nextSelection)
          return
        }

        const animationSelectionActive = session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0
        if (animationSelectionActive) {
          const selectedLayers = selectedTransformLayersForSession(session)
          if (session.activeLayerMaskId || selectedLayers.length === 0 || selectedLayers.some((layer) => layer.kind
            || !isLayerEffectivelyVisible(session.document, layer)
            || isLayerEffectivelyLocked(session.document, layer))) return
          const layers = captureAnimationFrameSelectionTransformStates(
            session.document,
            session.selectedAnimationFrameIds,
            selectedLayers.map((layer) => layer.id),
            currentSelection,
            session.selectedAnimationCellKeys
          )
          if (layers.length === 0) return
          const nextSelection = { ...currentSelection, x: nextX, y: nextY }
          for (const layerState of layers) {
            layerState.previewEdit = applySelectionTransformLayerState(session.document, layerState, nextSelection)
          }
          const primary = layers[0]
          session.pendingPaste = {
            layerId: primary.layerId,
            layers,
            beforeSelection: cloneSelectionMask(currentSelection),
            beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
            source: primary.source,
            target: cloneSelectionMask(nextSelection)!,
            transformTarget: { x: nextSelection.x, y: nextSelection.y, width: nextSelection.width, height: nextSelection.height },
            transformAngle: 0,
            previewEdit: primary.previewEdit,
            translationPreview: null,
            copy: false,
            label: tr('workspace.history.moveSelectionContent')
          }
          session.selection = cloneSelectionMask(nextSelection)
          if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
          markFloatingPreviewChanged(session, currentSelection, nextSelection)
          return
        }

        const selectedLayers = selectedTransformLayersForSession(session)
        const multipleLayers = selectedLayers.length > 1
        if (selectedLayers.length === 0 || (multipleLayers && selectedLayers.some((candidate) => candidate.kind))) return
        if (selectedLayers.some((candidate) => !isLayerEffectivelyVisible(session.document, candidate) || isLayerEffectivelyLocked(session.document, candidate))) return
        const layer = multipleLayers ? selectedLayers[0] : activePaintLayer(session)
        if (isLayerEffectivelyLocked(session.document, layer)) return
        const source = captureSelectionTransform(session.document, currentSelection, layer)
        if (!source) return
        const nextSelection = { ...currentSelection, x: nextX, y: nextY }
        const tilemapEditCellIndex = tilemapEditCellIndexForSelection(session, currentSelection)
        if (layer.kind === 'tilemap' && session.tilemapMode === 'edit' && tilemapEditCellIndex === undefined) return
        const translationPreview = applySelectionTranslationPreview(session.document, source, nextSelection, false, null, layer, tilemapEditClipForCell(session, tilemapEditCellIndex), session.view.tileRepeatMode)
        const layers = multipleLayers
          ? selectedLayers.map((candidate) => {
              const candidateSource = candidate.id === layer.id ? source : captureSelectionTransform(session.document, currentSelection, candidate)!
              const candidatePreview = candidate.id === layer.id
                ? translationPreview
                : applySelectionTranslationPreview(session.document, candidateSource, nextSelection, false, null, candidate, undefined, session.view.tileRepeatMode)
              return { layerId: candidate.id, source: candidateSource, previewEdit: null, translationPreview: candidatePreview }
            })
          : undefined
        session.pendingPaste = {
          layerId: layer.id,
          ...(layers ? { layers } : {}),
          beforeSelection: cloneSelectionMask(currentSelection),
          beforeSelectionPivot: session.selectionPivot ? { ...session.selectionPivot } : null,
          source,
          target: cloneSelectionMask(nextSelection)!,
          transformTarget: { x: nextSelection.x, y: nextSelection.y, width: nextSelection.width, height: nextSelection.height },
          transformAngle: 0,
          previewEdit: null,
          translationPreview,
          tilemapEditCellIndex,
          copy: false,
          label: tr('workspace.history.moveSelectionContent')
        }
        session.selection = cloneSelectionMask(nextSelection)
        if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + actualX, y: session.selectionPivot.y + actualY }
        markFloatingPreviewChanged(session, currentSelection, nextSelection)
      }, false)
    },

    flipActiveSelection(axis) {
      get().mutateActive((session) => {
        if (session.pendingPaste) {
          const pending = session.pendingPaste
          clearFloatingSelectionBoxHistory(pending)
          const previousTarget = pending.target
          const previewDeferred = Boolean(pending.previewDeferred)
          if (previewDeferred) {
            // Deferred previews normally leave the document untouched. Also
            // clean up an already-materialized preview from an older runtime so
            // it cannot become part of the stable background after hot reload.
            if (pending.translationPreview) restoreSelectionTranslationPreview(session.document, pending.translationPreview)
            else if (pending.previewEdit) revertPixelEdit(session.document, pending.previewEdit)
          } else restoreFloatingPreview(session)
          // A flipped floating cel can change its visible bounds even when the
          // selection rectangle stays the same. Drop the source bounds used by
          // layer-style expansion before rebuilding the preview.
          for (const layerId of pending.layers?.map((state) => state.layerId) ?? [pending.layerId]) {
            const layer = session.document.layers.find((candidate) => candidate.id === layerId)
            if (layer) invalidateRasterContentBounds(layer)
          }
          if (pending.layers?.length) {
            for (const layerState of pending.layers) layerState.source = flipSelectionTransformSource(layerState.source, axis)
            syncFloatingPrimaryLayerState(pending)
          } else pending.source = flipSelectionTransformSource(pending.source, axis)
          if (axis === 'horizontal') pending.sourceFlipHorizontal = !pending.sourceFlipHorizontal
          else pending.sourceFlipVertical = !pending.sourceFlipVertical
          if (pending.freeTile) pending.freeTile.selectionSource = flipSelectionMask(pending.freeTile.selectionSource, axis)
          const transformTarget = pending.transformTarget ?? { x: pending.target.x, y: pending.target.y, width: pending.target.width, height: pending.target.height }
          const angle = pending.transformAngle ?? 0
          const shear = pending.transformShear
          const transformed = transformSelectionMask(floatingSelectionGeometrySource(pending), transformTarget, session.document.width, session.document.height, angle, shear, false)
          if (!transformed) return
          pending.target = transformed
          session.selection = cloneSelectionMask(transformed)
          pending.previewEdit = null
          pending.translationPreview = null
          pending.previewDeferred = previewDeferred
          if (previewDeferred) markFloatingOverlayChanged(session)
          else if (pending.layers?.length) {
            for (const layerState of pending.layers) {
              layerState.previewEdit = applySelectionTransformLayerState(session.document, layerState, transformTarget, angle, pending.copy, shear, undefined, undefined, undefined, undefined, session.selectionRotationAlgorithm === 'rotsprite')
              layerState.translationPreview = null
            }
            syncFloatingPrimaryLayerState(pending)
            markFloatingPreviewChanged(session, previousTarget, transformed)
          }
          else if (pending.freeTile) {
            pending.previewEdit = applySelectionTransform(
              pending.freeTile.edit.document,
              pending.source,
              freeTileTransformTargetToEditRaster(pending.freeTile.edit, transformTarget),
              angle,
              pending.copy,
              shear,
              undefined,
              undefined,
              pending.freeTile.edit.layer,
              undefined,
              undefined,
              false,
              session.selectionRotationAlgorithm === 'rotsprite'
            )
            if (!previewFloatingFreeTileSource(session, pending)) markFloatingOverlayChanged(session)
          }
          else {
            const preview = applySelectionTransform(session.document, pending.source, transformTarget, angle, pending.copy, shear, undefined, undefined, activePaintLayer(session), undefined, undefined, false, session.selectionRotationAlgorithm === 'rotsprite')
            if (preview) pending.previewEdit = preview
            markFloatingPreviewChanged(session, previousTarget, transformed)
          }
          return
        }
        const tilemapLayer = activePaintLayer(session)
        const freeTileInstanceIds = session.selectedFreeTileInstanceIds.length > 0
          ? session.selectedFreeTileInstanceIds
          : session.selectedFreeTileInstanceId ? [session.selectedFreeTileInstanceId] : []
        // An instance picked on the canvas is a more specific target than a
        // previously selected timeline cel. Keep the cel selection intact for
        // timeline workflows, but do not let it broaden this transform.
        const selectedFreeTileInstanceTakesPriority = !session.selection
          && tilemapLayer.kind === 'free-tile'
          && freeTileInstanceIds.length > 0
        // A selected free-tile cel mirrors all of its frame-local instances.
        // Do this before the instance-only path so Shift+H/V on a timeline cel
        // persists in the cel data and cannot be lost on the next refresh.
        const timelineForFreeTiles = ensureAnimationDocument(session.document)
        const selectedFreeTileCelKeys = new Set(session.selectedAnimationCellKeys)
        if (session.selectedAnimationFrameIds.length > 0) {
          for (const cel of timelineForFreeTiles.cels) {
            if (session.selectedAnimationFrameIds.includes(cel.frameId)) selectedFreeTileCelKeys.add(animationCelKey(cel.layerId, cel.frameId))
          }
        }
        const freeTileCelEdits = timelineForFreeTiles.cels
          .filter((cel) => !selectedFreeTileInstanceTakesPriority && selectedFreeTileCelKeys.has(animationCelKey(cel.layerId, cel.frameId)) && session.document.layers.some((layer) => layer.id === cel.layerId && layer.kind === 'free-tile'))
          .map((cel) => {
            if (!cel.freeTiles) cel.freeTiles = createFreeTileCelData()
            const before = cloneFreeTileCelData(cel.freeTiles)
            const after = cloneFreeTileCelData(before)
            for (const instance of after.instances) {
              if (axis === 'horizontal') instance.flipHorizontal = instance.flipHorizontal !== true
              else instance.flipVertical = instance.flipVertical !== true
            }
            return { cel, before, after, edit: { layerId: cel.layerId, frameId: cel.frameId, before, after, dirtyRect: null } as FreeTilePlacementEdit }
          })
        if (!session.selection && freeTileCelEdits.length > 0) {
          const changed = freeTileCelEdits.filter(({ before, after }) => !freeTileCelDataEqual(before, after))
          if (changed.length > 0) {
            for (const entry of changed) applyFreeTilePlacementEdit(session.document, entry.edit, 'after')
            session.history.push({
              label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
              bytes: changed.reduce((total, entry) => total + (entry.before.instances.length + entry.after.instances.length) * 72, 0),
              undo: () => { for (const entry of changed) applyFreeTilePlacementEdit(session.document, entry.edit, 'before') },
              redo: () => { for (const entry of changed) applyFreeTilePlacementEdit(session.document, entry.edit, 'after') },
              invalidation: { kind: 'full' },
              affectedLayerIds: [...new Set(changed.map((entry) => entry.cel.layerId))],
              contentChanged: true,
              requiresAnimationSync: false
            })
            completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
          }
          return
        }
        // Shift+H/V also applies to selected free-tile instances. Keep the
        // operation on the instance metadata (rather than flipping the
        // rendered raster), otherwise the next canvas refresh restores the
        // pre-flip appearance.
        if (!session.selection && tilemapLayer.kind === 'free-tile' && freeTileInstanceIds.length > 0) {
          const target = activeFreeTileCelTarget(session.document)
          if (target) {
            const before = cloneFreeTileCelData(target.freeTiles)
            const selected = new Set(freeTileInstanceIds)
            const after = cloneFreeTileCelData(before)
            for (const instance of after.instances) {
              if (!selected.has(instance.id) || instance.locked === true) continue
              if (axis === 'horizontal') instance.flipHorizontal = instance.flipHorizontal !== true
              else instance.flipVertical = instance.flipVertical !== true
            }
            if (!freeTileCelDataEqual(before, after)) {
              const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
              applyFreeTilePlacementEdit(session.document, edit, 'after')
              session.history.push({
                label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
                bytes: (before.instances.length + after.instances.length) * 72,
                undo: () => { applyFreeTilePlacementEdit(session.document, edit, 'before') },
                redo: () => { applyFreeTilePlacementEdit(session.document, edit, 'after') },
                invalidation: { kind: 'full' },
                affectedLayerIds: [target.layer.id],
                contentChanged: true,
                requiresAnimationSync: false
              })
              completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
            }
          }
          return
        }
        // A selected timeline cel on a tilemap layer represents the complete
        // tilemap cel. With no pixel selection, mirror all of its cells in one
        // document edit so the persisted tile metadata matches the preview.
        const activeTimeline = ensureAnimationDocument(session.document)
        const activeCelKey = animationCelKey(tilemapLayer.id, activeTimeline.activeFrameId)
        const tilemapCelSelected = session.selectedAnimationCellKeys.includes(activeCelKey)
          || session.selectedAnimationFrameIds.includes(activeTimeline.activeFrameId)
        if (!session.selection && tilemapLayer.kind === 'tilemap' && tilemapCelSelected) {
          const fullCanvasSelection: SelectionMask = { x: 0, y: 0, width: session.document.width, height: session.document.height }
          const edit = flipTilemapSelection(session.document, tilemapLayer.id, activeTimeline.activeFrameId, fullCanvasSelection, axis)
          if (edit) {
            session.history.push({
              label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
              bytes: tilemapEditBytes(edit),
              undo: () => { applyTilemapDocumentEdit(session.document, edit, 'before') },
              redo: () => { applyTilemapDocumentEdit(session.document, edit, 'after') },
              invalidation: edit.dirtyRect ? { kind: 'region', frameId: edit.frameId, rect: { ...edit.dirtyRect } } : { kind: 'full' },
              affectedLayerIds: [tilemapLayer.id],
              contentChanged: true,
              requiresAnimationSync: false
            })
            completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
          }
          return
        }
        if (session.selection && tilemapLayer.kind === 'tilemap' && session.tilemapMode === 'paint') {
          const beforeSelection = cloneSelectionMask(session.selection)
          const afterSelection = flipSelectionMask(session.selection, axis)
          const edit = flipTilemapSelection(session.document, tilemapLayer.id, ensureAnimationDocument(session.document).activeFrameId, session.selection, axis)
          if (edit) {
            const label = axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical')
            session.history.push({
              label,
              bytes: tilemapEditBytes(edit),
              undo: () => { applyTilemapDocumentEdit(session.document, edit, 'before') },
              redo: () => { applyTilemapDocumentEdit(session.document, edit, 'after') },
              invalidation: edit.dirtyRect ? { kind: 'region', frameId: edit.frameId, rect: { ...edit.dirtyRect } } : { kind: 'full' },
              affectedLayerIds: [tilemapLayer.id],
              contentChanged: true,
              requiresAnimationSync: false
            })
            session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          }
          session.selection = afterSelection
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          return
        }
        const selectedLayers = selectedTransformLayersForSession(session)
        const animationSelectionActive = session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0
        if (session.selection && animationSelectionActive) {
          if (selectedLayers.length === 0 || selectedLayers.some((layer) => layer.kind || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer))) return
          const states = captureAnimationFrameSelectionTransformStates(
            session.document,
            session.selectedAnimationFrameIds,
            selectedLayers.map((layer) => layer.id),
            session.selection,
            session.selectedAnimationCellKeys
          )
          if (states.length === 0) return
          const beforeSelection = cloneSelectionMask(session.selection)
          const selectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
          const afterSelection = flipSelectionMask(session.selection, axis)
          const target = {
            x: session.selection.x,
            y: session.selection.y,
            width: session.selection.width,
            height: session.selection.height,
            ...(axis === 'horizontal' ? { flipHorizontal: true } : { flipVertical: true })
          }
          const entries = states.flatMap((state) => {
            const edit = applySelectionTransformLayerState(session.document, state, target)
            const entry = edit && commitPixelEdit(session.document, edit, axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'))
            return entry ? [entry] : []
          })
          session.selection = afterSelection
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          if (entries.length > 0 && afterSelection) session.history.push(combinedPixelHistoryEntry(
            session,
            entries,
            axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
            beforeSelection,
            afterSelection,
            selectionPivot,
            selectionPivot
          ))
          if (entries.length > 0) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          return
        }
        if (session.selection && selectedLayers.length > 1) {
          if (selectedLayers.some((layer) => layer.kind || !isLayerEffectivelyVisible(session.document, layer) || isLayerEffectivelyLocked(session.document, layer))) return
          const beforeSelection = cloneSelectionMask(session.selection)
          const selectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
          const afterSelection = flipSelectionMask(session.selection, axis)
          const entries = selectedLayers.flatMap((layer) => {
            const edit = flipSelection(session.document, session.selection!, axis, layer)
            const entry = edit && commitPixelEdit(session.document, edit, axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'))
            return entry ? [entry] : []
          })
          session.selection = afterSelection
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          if (entries.length > 0 && afterSelection) session.history.push(combinedPixelHistoryEntry(
            session,
            entries,
            axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
            beforeSelection,
            afterSelection,
            selectionPivot,
            selectionPivot
          ))
          if (entries.length > 0) session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          else if (!selectionMasksEqual(beforeSelection, afterSelection)) session.history.push({
            label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'),
            bytes: (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0),
            undo: () => { session.selection = cloneSelectionMask(beforeSelection) },
            redo: () => { session.selection = cloneSelectionMask(afterSelection) },
            documentChanged: false,
            contentChanged: false,
            requiresAnimationSync: false
          })
          return
        }
        const layer = activePaintLayer(session)
        if (isLayerEffectivelyLocked(session.document, layer)) return
        const beforeSelection = cloneSelectionMask(session.selection)
        const afterSelection = session.selection ? flipSelectionMask(session.selection, axis) : null
        const edit = session.selection ? flipSelection(session.document, session.selection, axis, layer) : flipLayer(session.document, axis)
        const entry = edit && commitPixelEdit(session.document, edit, axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'))
        // Flipping a whole styled layer changes the source geometry under the
        // style proxy. A point/region invalidation can leave the cached styled
        // surface behind, especially when the style extends beyond the layer.
        // Rebuild the complete composite for this operation.
        const wholeStyledLayerFlip = !session.selection && hasEnabledLayerStyles(layer.layerStyles)
        const sameMask = beforeSelection?.mask === afterSelection?.mask
          || (beforeSelection?.mask?.length === afterSelection?.mask?.length && beforeSelection?.mask?.every((value, index) => value === afterSelection?.mask?.[index]))
        const selectionChanged = !sameMask
        session.selection = afterSelection
        session.lastPencilPoint = null
        session.lastEraserPoint = null
        if (entry) {
          session.history.push({ ...entry, bytes: entry.bytes + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0), undo: () => { entry.undo(); session.selection = cloneSelectionMask(beforeSelection) }, redo: () => { entry.redo(); session.selection = cloneSelectionMask(afterSelection) } })
          session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
          if (wholeStyledLayerFlip) invalidateSessionContent(session)
        } else if (selectionChanged) {
          session.history.push({ label: axis === 'horizontal' ? tr('workspace.history.flipSelectionHorizontal') : tr('workspace.history.flipSelectionVertical'), bytes: (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0), undo: () => { session.selection = cloneSelectionMask(beforeSelection) }, redo: () => { session.selection = cloneSelectionMask(afterSelection) } })
        }
      })
    },

    transformActiveSelection(beforeSelection, afterSelection, angle = 0) {
      get().mutateActive((session) => {
        const edit = transformSelectionCopy(session.document, beforeSelection, afterSelection, angle, undefined, undefined, undefined, activePaintLayer(session), undefined, session.selectionRotationAlgorithm === 'rotsprite')
        const entry = edit && commitPixelEdit(session.document, edit, angle === 0 ? tr('workspace.history.transformSelectionContent') : tr('workspace.history.rotateSelectionContent'))
        const before = { ...beforeSelection }
        const after = { ...afterSelection }
        session.selection = after
        if (entry) {
          session.history.push({ ...entry, bytes: entry.bytes + 64, undo: () => { entry.undo(); session.selection = { ...before } }, redo: () => { entry.redo(); session.selection = { ...after } } })
        } else if (before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height) {
          session.history.push({ label: tr('workspace.history.transformSelection'), bytes: 48, undo: () => { session.selection = { ...before } }, redo: () => { session.selection = { ...after } } })
        }
      })
    },

    commitSelectionTransform(edit, beforeSelection, afterSelection, label) {
      get().mutateActive((session) => {
        const entry = edit && commitPixelEdit(session.document, edit, label)
        const before = cloneSelectionMask(beforeSelection)!
        const after = cloneSelectionMask(afterSelection)!
        const sameMask = before.mask === after.mask || (before.mask?.length === after.mask?.length && before.mask?.every((value, index) => value === after.mask?.[index]))
        const selectionChanged = before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height || !sameMask
        session.selection = after
        if (entry) {
          session.history.push({ ...entry, bytes: entry.bytes + 64 + (before.mask?.byteLength ?? 0) + (after.mask?.byteLength ?? 0), undo: () => { entry.undo(); session.selection = cloneSelectionMask(before) }, redo: () => { entry.redo(); session.selection = cloneSelectionMask(after) } })
          touch(session)
        } else if (selectionChanged) {
          session.history.push({
            label,
            bytes: 48 + (before.mask?.byteLength ?? 0) + (after.mask?.byteLength ?? 0),
            undo: () => { session.selection = cloneSelectionMask(before) },
            redo: () => { session.selection = cloneSelectionMask(after) },
            documentChanged: false,
            contentChanged: false,
            requiresAnimationSync: false
          })
        }
      }, false)
    },

    moveActiveSelection(deltaX, deltaY) {
      get().mutateActive((session) => {
        if (!session.selection) return
        const edit = moveSelection(session.document, session.selection, deltaX, deltaY, false, activePaintLayer(session))
        const entry = edit && commitPixelEdit(session.document, edit, tr('workspace.history.moveSelection'))
        if (entry) session.history.push(entry)
        if (entry) {
          session.selection = { ...session.selection, x: session.selection.x + deltaX, y: session.selection.y + deltaY }
          if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + deltaX, y: session.selectionPivot.y + deltaY }
        }
      })
    },

    centerActiveContent(axis) {
      const current = activeSession(get())
      if (current?.pendingPaste && current.selection) {
        const selection = current.selection
        const deltaX = axis === 'vertical' ? 0 : Math.round(current.document.width / 2 - (selection.x + selection.width / 2))
        const deltaY = axis === 'horizontal' ? 0 : Math.round(current.document.height / 2 - (selection.y + selection.height / 2))
        if (deltaX !== 0 || deltaY !== 0) get().moveActiveSelectionWithSelectionHistory(deltaX, deltaY, true)
        return
      }

      // A fixed text box is an editable layout rectangle, not just the opaque
      // glyph pixels stored in its raster surface.  layerContentBounds() quite
      // correctly ignores transparent pixels for raster layers, but using that
      // result for boxed text would center the glyphs while leaving the text
      // box itself off-center.  Text without a box uses those same opaque
      // content bounds explicitly, because commitPixelEdit() intentionally
      // rejects raster edits on editable text layers.  Move the text layer
      // through the existing layer move command so its text origin, cel surface
      // offset, and history entry stay in sync.
      if (current && !current.selection) {
        const layer = activePaintLayer(current)
        if (layer.kind === 'text' && !current.activeLayerMaskId) {
          const timeline = current.document.animation
          const cel = timeline?.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
          const source = cel ? resolveAnimationCel(timeline!, cel) ?? cel : null
          const text = source?.text
          const surface = source?.surface
          const bounds = text && surface && text.boxWidth !== undefined && text.boxHeight !== undefined
            ? {
                x: text.originX ?? surface.offsetX ?? layer.offsetX,
                y: text.originY ?? surface.offsetY ?? layer.offsetY,
                width: text.boxWidth,
                height: text.boxHeight
              }
            : layerContentBounds(current.document, layer)
          if (bounds) {
            const deltaX = axis === 'vertical' ? 0 : Math.round(current.document.width / 2 - (bounds.x + bounds.width / 2))
            const deltaY = axis === 'horizontal' ? 0 : Math.round(current.document.height / 2 - (bounds.y + bounds.height / 2))
            if (deltaX !== 0 || deltaY !== 0) get().moveLayerBy(layer.id, deltaX, deltaY)
            return
          }
        }
      }
      get().mutateActive((session) => {
        const layer = activePaintLayer(session)
        if (isLayerEffectivelyLocked(session.document, layer)) return
        const selection = session.selection ? cloneSelectionMask(session.selection) : layerContentBounds(session.document, layer)
        if (!selection) return
        const deltaX = axis === 'vertical' ? 0 : Math.round(session.document.width / 2 - (selection.x + selection.width / 2))
        const deltaY = axis === 'horizontal' ? 0 : Math.round(session.document.height / 2 - (selection.y + selection.height / 2))
        const source = session.selection
          ? captureSelectionTransform(session.document, selection, layer, { preserveOutsideCanvas: true })
          : null
        const target = { ...selection, x: selection.x + deltaX, y: selection.y + deltaY }
        const edit = source
          ? applySelectionTransform(session.document, source, target, 0, false, undefined, undefined, undefined, layer)
          : moveSelection(session.document, selection, deltaX, deltaY, false, layer)
        const entry = edit && commitPixelEdit(session.document, edit, session.selection ? tr('workspace.history.moveSelectionContent') : tr('canvas.history.moveLayer'))
        if (!entry) return
        const beforeSelection = session.selection ? cloneSelectionMask(session.selection) : null
        const beforePivot = session.selectionPivot ? { ...session.selectionPivot } : null
        const afterSelection = beforeSelection ? { ...beforeSelection, x: beforeSelection.x + deltaX, y: beforeSelection.y + deltaY } : null
        const afterPivot = beforePivot ? { x: beforePivot.x + deltaX, y: beforePivot.y + deltaY } : null
        session.history.push({
          ...entry,
          bytes: entry.bytes + (beforeSelection?.mask?.byteLength ?? 0) + (afterSelection?.mask?.byteLength ?? 0) + 48,
          undo: () => {
            entry.undo()
            session.selection = cloneSelectionMask(beforeSelection)
            session.selectionPivot = beforePivot ? { ...beforePivot } : null
          },
          redo: () => {
            entry.redo()
            session.selection = cloneSelectionMask(afterSelection)
            session.selectionPivot = afterPivot ? { ...afterPivot } : null
          }
        })
        if (session.selection) {
          session.selection = { ...session.selection, x: session.selection.x + deltaX, y: session.selection.y + deltaY }
          if (session.selectionPivot) session.selectionPivot = { x: session.selectionPivot.x + deltaX, y: session.selectionPivot.y + deltaY }
        }
      })
    }
  }
}
