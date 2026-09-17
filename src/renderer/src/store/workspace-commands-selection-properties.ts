import type { SelectionMask } from '@shared/types-selection'
import { type ContentInvalidationHint, type HistoryEntry } from '@/core/history'
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/core/document-model'
import {
  documentVisibleContentBounds
} from '@/core/document-composite-region'
import {
  applySelectionTransform
} from '@/core/tools-selection-transform-apply'
import {
  captureSelectionTransform
} from '@/core/tools-selection-transform-source'
import {
  applySelectionTransformLayerState,
  captureAnimationFrameSelectionTransformStates,
  selectionTransformLayerForState
} from '@/core/selection-transform-targets'
import {
  invertSelectionMask,
  rotateSelectionTargetAroundPivot,
  shearTransformedSelection,
  transformSelectionMask,
  transformedSelectionControlPoints,
  transformedSelectionPivotPreset
} from '@/core/selection'
import { normalizeGapClosingThreshold } from '@/core/contiguous-region'
import { applyTilemapDocumentEdit } from '@/core/tilemap-document'
import { tilemapEditBytes } from '@/core/tilemap'
import { activePaintLayer, cloneSelectionMask, persistToolSettings, selectedTransformLayersForSession } from './workspace-session'
import type { WorkspaceViewSelectionCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { selectionMasksEqual, intersectSelectionRects, rectangularSelection } from './workspace-selection-geometry'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { restoreFloatingPreview } from './workspace-floating-preview'
import { clearAnimationItemSelection } from './workspace-animation-selection'
import { visibleLayerContentBoundsWithinSelection, recordFloatingSelectionBoxMove } from './workspace-view-selection-helpers'
import { selectionShearForAngle, selectionShearAngle } from './workspace-selection-transform-geometry'



export function createSelectionPropertiesCommands({ get, set }: WorkspaceCommandContext<'beginFloatingSelectionTransform' | 'commitFloatingPaste' | 'commitSelectionChange' | 'mutateActive' | 'pushHistory' | 'redo' | 'undo' | 'updateFloatingPastePreview'>): Pick<WorkspaceViewSelectionCommands, 'setSelection' | 'setSelectionPropertiesActive' | 'setSelectionAspectRatio' | 'setSelectionRotationAlgorithm' | 'updateSelectionProperties' | 'shrinkSelectionToContent' | 'setSelectionPivot' | 'invertSelection' | 'toggleSelectionOutline' | 'setSelectionKind' | 'setSelectionMode' | 'setSelectionRounded' | 'setSelectionCornerRadius' | 'setWandTolerance' | 'setWandContiguous' | 'setWandGapClosing' | 'setWandGapThreshold' | 'setCanvasResizePreview' | 'setOutlinePreview' | 'commitSelectionChange' | 'commitFloatingSelectionBoxMove' | 'commitTilemapSelectionMove'> {
  return {
    setSelection(selection) {
      get().mutateActive((session) => {
        session.selection = selection ? { ...selection, mask: selection.mask?.slice() } : null
        session.selectionPropertiesActive = false
        session.selectionAspectRatio = null
        session.selectionAngle = 0
        session.selectionPivot = null
        session.freeTransformActive = false
        session.freeTransformQuad = null
      }, false)
    },
    setSelectionPropertiesActive(active) {
      get().mutateActive((session) => {
        session.selectionPropertiesActive = Boolean(active)
        if (!active) session.selectionAspectRatio = null
      }, false)
    },
    setSelectionAspectRatio(ratio) {
      get().mutateActive((session) => {
        session.selectionAspectRatio = session.freeTransformActive ? null : typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : null
      }, false)
    },
    setSelectionRotationAlgorithm(algorithm: 'fast' | 'rotsprite') {
      get().mutateActive((session) => {
        session.selectionRotationAlgorithm = algorithm === 'rotsprite' ? 'rotsprite' : 'fast'
        persistToolSettings(session)
      }, false)
    },
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
                return source
                  ? [
                      {
                        layerId: candidate.id,
                        source,
                        previewEdit: null,
                        translationPreview: null
                      }
                    ]
                  : []
              })
            : []
      const source = states[0]?.source ?? pending?.source ?? (before ? captureSelectionTransform(current.document, before, layer) : null)
      if (!before || !source) return
      if (
        states.length > 0 &&
        states.some((state) => {
          const targetLayer = selectionTransformLayerForState(current.document, state)
          return !targetLayer || targetLayer.kind || !isLayerEffectivelyVisible(current.document, targetLayer) || isLayerEffectivelyLocked(current.document, targetLayer)
        })
      )
        return
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
      const nextShearAngle = Number.isFinite(patch.shearAngle) ? Math.round(patch.shearAngle! * 10) / 10 : selectionShearAngle(currentTarget, currentShear)
      let shear = selectionShearForAngle(target, nextShearAngle)
      if (Number.isFinite(patch.shearAngle)) {
        const desiredAmount = shear?.amount ?? 0
        const currentAmount = currentShear?.axis === 'x' ? currentShear.amount : 0
        const points = transformedSelectionControlPoints(target, angle, currentShear)
        const horizontalAxis = {
          x: points[2].x - points[0].x,
          y: points[2].y - points[0].y
        }
        const verticalAxis = {
          x: points[5].x - points[0].x,
          y: points[5].y - points[0].y
        }
        const determinant = horizontalAxis.x * verticalAxis.y - horizontalAxis.y * verticalAxis.x
        const pivotOffset = {
          x: pivot.x - points[0].x,
          y: pivot.y - points[0].y
        }
        const pivotCoordinate = Math.abs(determinant) < 1e-9 ? 0.5 : (horizontalAxis.x * pivotOffset.y - horizontalAxis.y * pivotOffset.x) / determinant
        const edge = pivotCoordinate <= 0.5 ? 's' : 'n'
        const edgeDistance = (edge === 's' ? 1 : 0) - pivotCoordinate
        const transformed = Math.abs(edgeDistance) < 1e-9 ? { target, angle, shear } : shearTransformedSelection(target, angle, currentShear, edge, (desiredAmount - currentAmount) * edgeDistance, pivot)
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
      const same =
        selectionMasksEqual(current.selection, after) &&
        (pending?.transformTarget
          ? pending.transformTarget.x === target.x && pending.transformTarget.y === target.y && pending.transformTarget.width === target.width && pending.transformTarget.height === target.height
          : current.selection.x === target.x && current.selection.y === target.y && current.selection.width === target.width && current.selection.height === target.height) &&
        (pending?.transformAngle ?? 0) === angle &&
        selectionShearAngle(currentTarget, pending?.transformShear) === nextShearAngle
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
        get().mutateActive((session) => {
          session.selectionPropertiesActive = true
        }, false)
        return
      }
      const edit = applySelectionTransform(current.document, source, target, angle, false, shear, undefined, undefined, layer, undefined, undefined, true, current.selectionRotationAlgorithm === 'rotsprite')
      if (pending) {
        get().updateFloatingPastePreview(edit, after, null, target, angle, shear, false)
      } else {
        get().beginFloatingSelectionTransform(source, edit, before, after, false, tr('workspace.history.transformSelectionContent'), null, target, angle, shear, false)
      }
      get().mutateActive((session) => {
        session.selectionPropertiesActive = true
      }, false)
    },
    shrinkSelectionToContent() {
      get().commitFloatingPaste()
      const current = activeSession(get())
      if (!current?.selection) {
        set({ message: tr('workspace.selectionRequired') })
        return
      }
      const layer = activePaintLayer(current)
      const content = layer.kind === 'tilemap' || layer.kind === 'free-tile' ? documentVisibleContentBounds(current.document) : visibleLayerContentBoundsWithinSelection(current.document, layer, current.selection)
      const next = content ? intersectSelectionRects(current.selection, content) : null
      if (!next) {
        set({ message: tr('workspace.trim.empty') })
        return
      }
      const after = layer.kind === 'tilemap' || layer.kind === 'free-tile' ? rectangularSelection(next) : content
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
          undo: () => {
            session.selection = cloneSelectionMask(before)
            session.selectionPropertiesActive = true
          },
          redo: () => {
            session.selection = cloneSelectionMask(afterSnapshot)
            session.selectionPropertiesActive = true
          },
          documentChanged: false,
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, false)
    },
    setSelectionPivot(pivot) {
      get().mutateActive((session) => {
        session.selectionPivot = pivot ? { ...pivot } : null
      }, false)
    },
    invertSelection() {
      const session = activeSession(get())
      if (!session?.selection) {
        set({ message: tr('workspace.selectionRequired') })
        return
      }
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
    setSelectionKind(kind) {
      get().mutateActive((session) => {
        session.selectionKind = kind
        persistToolSettings(session)
      }, false)
    },
    setSelectionMode(mode) {
      get().mutateActive((session) => {
        session.selectionMode = mode
        persistToolSettings(session)
      }, false)
    },
    setSelectionRounded(enabled) {
      get().mutateActive((session) => {
        session.selectionRounded = enabled
        persistToolSettings(session)
      }, false)
    },
    setSelectionCornerRadius(radius) {
      get().mutateActive((session) => {
        session.selectionCornerRadius = Math.max(0, Math.min(256, Math.round(radius) || 0))
        persistToolSettings(session)
      }, false)
    },
    setWandTolerance(tolerance) {
      get().mutateActive((session) => {
        session.wandTolerance = Math.max(0, Math.min(255, Math.round(tolerance) || 0))
        persistToolSettings(session)
      }, false)
    },
    setWandContiguous(contiguous) {
      get().mutateActive((session) => {
        session.wandContiguous = contiguous
        persistToolSettings(session)
      }, false)
    },
    setWandGapClosing(enabled) {
      get().mutateActive((session) => {
        session.wandGapClosing = enabled
        persistToolSettings(session)
      }, false)
    },
    setWandGapThreshold(threshold) {
      get().mutateActive((session) => {
        session.wandGapThreshold = normalizeGapClosingThreshold(threshold)
        persistToolSettings(session)
      }, false)
    },
    setCanvasResizePreview(preview) {
      const session = activeSession(get())
      const current = session?.canvasResizePreview
      if (current?.width === preview?.width && current?.height === preview?.height && current?.offsetX === preview?.offsetX && current?.offsetY === preview?.offsetY) return
      get().mutateActive((active) => {
        active.canvasResizePreview = preview ? { ...preview } : null
      }, false)
    },
    setOutlinePreview(preview) {
      get().mutateActive((session) => {
        session.outlinePreview = preview
          ? {
              ...preview,
              color: { ...preview.color },
              backgroundColor: { ...preview.backgroundColor },
              directions: { ...preview.directions }
            }
          : null
      }, false)
    },
    commitSelectionChange(before, after, label, options = {}) {
      const selectionCommitStartedAt = typeof window !== 'undefined' && window.__moonSpriteCanvasProbe?.recordOperationStage ? performance.now() : 0
      const sameMask = before?.mask === after?.mask || (before?.mask?.length === after?.mask?.length && (before?.mask?.length ?? 0) < 1_000_000 && before?.mask?.every((value, index) => value === after?.mask?.[index]))
      const same = before?.x === after?.x && before?.y === after?.y && before?.width === after?.width && before?.height === after?.height && sameMask
      if (same || (!before && !after)) {
        if (selectionCommitStartedAt) window.__moonSpriteCanvasProbe?.recordOperationStage?.('selection.commit-skip', performance.now() - selectionCommitStartedAt)
        return
      }
      get().mutateActive((session) => {
        const resetTimelineSelection =
          options.resetTimelineSelection === true &&
          !session.activeLayerMaskId &&
          (session.selectedAnimationFrameIds.length > 0 ||
            session.selectedAnimationCellKeys.length > 0 ||
            session.selectedAnimationMaskCellKeys.length > 0 ||
            session.selectedAnimationMaskRowKeys.length > 0 ||
            session.selectedLayerIds.length > 1 ||
            session.selectedGroupIds.length > 0 ||
            session.selectedGroupId !== null)
        const snapshot = (value: SelectionMask | null): SelectionMask | null => (value ? { ...value } : null)
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
          undo: () => {
            session.selection = snapshot(beforeSnapshot)
            session.selectionPivot = null
          },
          redo: () => {
            session.selection = snapshot(afterSnapshot)
            session.selectionPivot = null
          },
          documentChanged: false,
          contentChanged: false,
          requiresAnimationSync: false
        }
        // Timeline selection is intentionally not part of this deselect history.
        // Once Ctrl+D has ended a transformed multi-selection, undoing the canvas
        // selection must not resurrect the stale multi-target editing context.
        session.history.push(entry)
      }, false)
      if (selectionCommitStartedAt)
        window.__moonSpriteCanvasProbe?.recordOperationStage?.('selection.commit-total', performance.now() - selectionCommitStartedAt, {
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
      const invalidation: ContentInvalidationHint = edit.dirtyRect ? { kind: 'region', frameId: edit.frameId, rect: { ...edit.dirtyRect } } : { kind: 'full' }
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
    }
  }
}
