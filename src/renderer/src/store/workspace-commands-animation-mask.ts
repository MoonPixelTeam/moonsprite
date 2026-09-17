import { animationLinkSlotKeys } from '@/core/animation-slot-selection'
import type { LayerMask } from '@shared/types-layer'
import { animationMaskAt, createAnimationMaskLookup, createId, resolveAnimationMask } from '@/core/document-model'
import { activateAnimationFrame, animationCelKey, ensureAnimationDocument, parseAnimationCelKey } from '@/core/animation'
import { clipboardService } from './clipboard-service'
import type { AnimationMaskClipboardItem } from './workspace-types'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { tr } from './workspace-translation'
import {
  cloneAnimationMaskForOwner,
  animationMaskOwnerKind,
  animationMaskSlotSnapshot,
  setAnimationMaskSlot,
  restoreAnimationMaskSlots
} from './workspace-animation-mask-slots'
import { activeSession } from './workspace-access'
import { captureAnimationSelectionHistory, restoreAnimationSelectionHistory } from './workspace-animation-selection-history'
import {
  whiteAnimationMaskForOwner,
  animationMaskOwnerIds,
  mapAnimationMaskBlock,
  animationMaskPlacementsTargetEmptyLayerCel,
  animationMaskOwnerLocked
} from './workspace-animation-commands-helpers'



export function createAnimationMaskCommands({ get, set }: WorkspaceCommandContext<'mutateActive'>): Pick<WorkspaceAnimationCommands, 'copySelectedAnimationMasks' | 'pasteAnimationMasks' | 'moveSelectedAnimationMasks' | 'connectSelectedAnimationMasks' | 'disconnectSelectedAnimationMasks'> {
  return {
    copySelectedAnimationMasks() {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const selected = new Set(session.selectedAnimationMaskCellKeys)
        const ownerIndexes = new Map(animationMaskOwnerIds(session).map((id, index) => [id, index]))
        const frameIndexes = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
        const clipboard = [...selected]
          .flatMap((key): AnimationMaskClipboardItem[] => {
            const target = parseAnimationCelKey(key)
            const ownerKind = target ? animationMaskOwnerKind(session.document, target.layerId) : null
            const mask = target ? animationMaskAt(timeline, target.layerId, target.frameId) : null
            return target && ownerKind && mask
              ? [
                  {
                    key,
                    mask: cloneAnimationMaskForOwner(mask, ownerKind, mask.ownerId, { preserveLink: false })
                  }
                ]
              : []
          })
          .sort((left, right) => {
            const leftTarget = parseAnimationCelKey(left.key)!
            const rightTarget = parseAnimationCelKey(right.key)!
            return (ownerIndexes.get(leftTarget.layerId) ?? 0) - (ownerIndexes.get(rightTarget.layerId) ?? 0) || (frameIndexes.get(leftTarget.frameId) ?? 0) - (frameIndexes.get(rightTarget.frameId) ?? 0)
          })
        session.animationMaskClipboard = clipboard
        session.animationMaskClipboardAnchorKey = clipboard[0]?.key ?? null
        if (clipboard.length > 0) {
          clipboardService.clearAnimation()
          session.animationCellClipboard = []
          session.animationCellClipboardAnchorKey = null
          session.animationFrameClipboard = []
          clipboardService.captureAnimationCopySystemBaseline(typeof window.moonSprite?.readClipboardImage === 'function' ? () => window.moonSprite.readClipboardImage() : undefined)
        }
      }, false)
    },
    pasteAnimationMasks(ownerId, frameId) {
      const current = activeSession(get())
      if (!current || !current.animationMaskClipboard.length) return
      const currentTimeline = ensureAnimationDocument(current.document)
      const currentFallback = parseAnimationCelKey(current.selectedAnimationMaskCellKeys.at(-1) ?? '')
      const currentTargetOwnerId = ownerId ?? currentFallback?.layerId
      const currentTargetFrameId = frameId ?? currentFallback?.frameId
      const currentSourceAnchorKey = current.animationMaskClipboardAnchorKey ?? current.animationMaskClipboard[0].key
      if (!currentTargetOwnerId || !currentTargetFrameId) return
      const currentPlacements = mapAnimationMaskBlock(
        current,
        current.animationMaskClipboard.map((item) => item.key),
        currentSourceAnchorKey,
        currentTargetOwnerId,
        currentTargetFrameId
      )
      if (animationMaskPlacementsTargetEmptyLayerCel(current, currentPlacements)) {
        set({ message: tr('workspace.layerMask.emptyCel') })
        return
      }
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          if (!session.animationMaskClipboard.length) return
          const beforeSelection = captureAnimationSelectionHistory(session)
          const fallback = parseAnimationCelKey(session.selectedAnimationMaskCellKeys.at(-1) ?? '')
          const targetOwnerId = ownerId ?? fallback?.layerId
          const targetFrameId = frameId ?? fallback?.frameId
          const sourceAnchorKey = session.animationMaskClipboardAnchorKey ?? session.animationMaskClipboard[0].key
          if (!targetOwnerId || !targetFrameId) return
          const placements = mapAnimationMaskBlock(
            session,
            session.animationMaskClipboard.map((item) => item.key),
            sourceAnchorKey,
            targetOwnerId,
            targetFrameId
          )
          if (!placements.length || placements.some((placement) => animationMaskOwnerLocked(session.document, parseAnimationCelKey(placement.targetKey)?.layerId ?? ''))) return
          if (animationMaskPlacementsTargetEmptyLayerCel(session, placements)) return
          const sourceByKey = new Map(session.animationMaskClipboard.map((item) => [item.key, item]))
          const before = placements.flatMap(({ targetKey }) => {
            const target = parseAnimationCelKey(targetKey)
            const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
            return snapshot ? [snapshot] : []
          })
          for (const placement of placements) {
            const source = sourceByKey.get(placement.sourceKey)
            const target = parseAnimationCelKey(placement.targetKey)
            const ownerKind = target ? animationMaskOwnerKind(session.document, target.layerId) : null
            if (!source || !target || !ownerKind) continue
            const copied = cloneAnimationMaskForOwner(source.mask, ownerKind, source.mask.ownerId, { id: createId('mask'), preserveLink: false })
            setAnimationMaskSlot(session.document, target.layerId, target.frameId, copied)
          }
          const afterKeys = placements.map((placement) => placement.targetKey)
          const after = afterKeys.flatMap((key) => {
            const target = parseAnimationCelKey(key)
            const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
            return snapshot ? [snapshot] : []
          })
          session.selectedAnimationMaskCellKeys = afterKeys
          session.animationMaskCellSelectionAnchorKey = afterKeys.at(-1) ?? null
          session.activeLayerMaskId = null
          const afterSelection = captureAnimationSelectionHistory(session)
          session.history.push({
            label: tr('workspace.history.pasteAnimationMask'),
            bytes: [...before, ...after].reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
            undo: () => {
              restoreAnimationMaskSlots(session.document, before)
              restoreAnimationSelectionHistory(session, beforeSelection)
            },
            redo: () => {
              restoreAnimationMaskSlots(session.document, after)
              restoreAnimationSelectionHistory(session, afterSelection)
            },
            invalidation: { kind: 'full' }
          })
        },
        true,
        true
      )
    },
    moveSelectedAnimationMasks(ownerId, frameId, sourceAnchorKey) {
      get().mutateActive(
        (session) => {
          const beforeSelection = captureAnimationSelectionHistory(session)
          const timeline = ensureAnimationDocument(session.document)
          const directByKey = new Map<string, LayerMask>()
          for (const entry of timeline.layerMasks ?? []) directByKey.set(animationCelKey(entry.layerId, entry.frameId), entry.mask)
          for (const entry of timeline.groupMasks ?? []) directByKey.set(animationCelKey(entry.groupId, entry.frameId), entry.mask)
          const resolvedByKey = createAnimationMaskLookup(ensureAnimationDocument(session.document))
          const linkedKeys = session.selectedAnimationMaskCellKeys.filter((key) => {
            const direct = directByKey.get(key)
            const resolved = resolvedByKey.get(key)
            return Boolean(resolved && (!direct || direct.linkedMaskId))
          })
          if (linkedKeys.length) {
            session.selectedAnimationMaskCellKeys = session.selectedAnimationMaskCellKeys.filter((key) => {
              const direct = directByKey.get(key)
              return Boolean(direct && !direct.linkedMaskId)
            })
            session.animationMaskCellSelectionAnchorKey = session.selectedAnimationMaskCellKeys.at(-1) ?? null
            set({ message: tr('workspace.animation.incompatibleCel') })
            return
          }
          const sourceKeys = session.selectedAnimationMaskCellKeys.filter((key) => directByKey.has(key))
          const placements = mapAnimationMaskBlock(session, sourceKeys, sourceAnchorKey, ownerId, frameId)
          if (!placements.length || placements.length !== sourceKeys.length || placements.every((placement) => placement.sourceKey === placement.targetKey)) return
          if (placements.some((placement) => animationMaskOwnerLocked(session.document, parseAnimationCelKey(placement.targetKey)?.layerId ?? ''))) return
          const affectedKeys = [...new Set(placements.flatMap((placement) => [placement.sourceKey, placement.targetKey]))]
          const before = affectedKeys.flatMap((key) => {
            const target = parseAnimationCelKey(key)
            const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
            return snapshot ? [snapshot] : []
          })
          const sourceMasks = new Map(
            placements.flatMap((placement) => {
              const target = parseAnimationCelKey(placement.sourceKey)
              const mask = target ? (directByKey.get(placement.sourceKey) ?? null) : null
              const ownerKind = target ? animationMaskOwnerKind(session.document, target.layerId) : null
              return target && mask && ownerKind ? [[placement.sourceKey, cloneAnimationMaskForOwner(mask, ownerKind, mask.ownerId)] as const] : []
            })
          )
          for (const sourceKey of sourceKeys) {
            const target = parseAnimationCelKey(sourceKey)
            const sourceMask = directByKey.get(sourceKey)
            const ownerKind = target ? animationMaskOwnerKind(session.document, target.layerId) : null
            if (target && sourceMask && ownerKind) setAnimationMaskSlot(session.document, target.layerId, target.frameId, whiteAnimationMaskForOwner(sourceMask, ownerKind, sourceMask.ownerId))
          }
          for (const placement of placements) {
            const source = sourceMasks.get(placement.sourceKey)
            const target = parseAnimationCelKey(placement.targetKey)
            if (source && target) setAnimationMaskSlot(session.document, target.layerId, target.frameId, source)
          }
          const after = affectedKeys.flatMap((key) => {
            const target = parseAnimationCelKey(key)
            const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
            return snapshot ? [snapshot] : []
          })
          if (ensureAnimationDocument(session.document).activeFrameId !== frameId) activateAnimationFrame(session.document, frameId)
          if (session.document.layers.some((layer) => layer.id === ownerId)) session.document.activeLayerId = ownerId
          const afterKeys = placements.map((placement) => placement.targetKey)
          session.selectedAnimationMaskCellKeys = afterKeys
          session.animationMaskCellSelectionAnchorKey = afterKeys.at(-1) ?? null
          const afterSelection = captureAnimationSelectionHistory(session)
          session.history.push({
            label: tr('workspace.history.moveAnimationMask'),
            bytes: [...before, ...after].reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
            undo: () => {
              restoreAnimationMaskSlots(session.document, before)
              restoreAnimationSelectionHistory(session, beforeSelection)
            },
            redo: () => {
              restoreAnimationMaskSlots(session.document, after)
              restoreAnimationSelectionHistory(session, afterSelection)
            },
            invalidation: { kind: 'full' }
          })
        },
        true,
        true
      )
    },
    connectSelectedAnimationMasks() {
      get().mutateActive(
        (session) => {
          const beforeSelection = captureAnimationSelectionHistory(session)
          const timeline = ensureAnimationDocument(session.document)
          const frameIndexes = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
          const resolvedByKey = createAnimationMaskLookup(ensureAnimationDocument(session.document))
          const directByKey = new Map<string, LayerMask>()
          for (const entry of timeline.layerMasks ?? []) directByKey.set(animationCelKey(entry.layerId, entry.frameId), entry.mask)
          for (const entry of timeline.groupMasks ?? []) directByKey.set(animationCelKey(entry.groupId, entry.frameId), entry.mask)
          const keys = animationLinkSlotKeys(session.selectedAnimationMaskCellKeys,
            [...session.document.layers, ...session.document.groups].map((owner) => owner.id), timeline.frames.map((frame) => frame.id),
            (key) => resolvedByKey.has(key))
          const selected = keys.flatMap((key) => {
            const target = parseAnimationCelKey(key)
            const mask = target ? (directByKey.get(key) ?? null) : null
            const resolved = resolvedByKey.get(key) ?? mask
            return target ? [{ key, target, mask, resolved }] : []
          })
          const byOwner = new Map<string, typeof selected>()
          for (const item of selected) byOwner.set(item.target.layerId, [...(byOwner.get(item.target.layerId) ?? []), item])
          const linkable = [...byOwner.values()].filter((items) => items.length > 1 && items.some((item) => item.resolved))
          if (!linkable.length || linkable.some((items) => animationMaskOwnerLocked(session.document, items[0].target.layerId))) return
          const affectedKeys = linkable.flatMap((items) => items.map((item) => item.key))
          const before = affectedKeys.flatMap((key) => {
            const target = parseAnimationCelKey(key)
            const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
            return snapshot ? [snapshot] : []
          })
          let changed = false
          for (const items of linkable) {
            items.sort((left, right) => (frameIndexes.get(left.target.frameId) ?? 0) - (frameIndexes.get(right.target.frameId) ?? 0))
            const source = items.find((item) => item.resolved)!.resolved!
            for (const item of items) {
              if (!item.mask) {
                const ownerKind = animationMaskOwnerKind(session.document, item.target.layerId)!
                const mask = cloneAnimationMaskForOwner(source, ownerKind, item.target.layerId, { id: createId('mask') })
                mask.linkedMaskId = source.id
                setAnimationMaskSlot(session.document, item.target.layerId, item.target.frameId, mask)
                changed = true
              } else if (item.mask.id !== source.id && item.mask.linkedMaskId !== source.id) {
                item.mask.linkedMaskId = source.id
                changed = true
              }
            }
          }
          if (!changed) return
          const after = affectedKeys.flatMap((key) => {
            const target = parseAnimationCelKey(key)
            const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
            return snapshot ? [snapshot] : []
          })
          const afterSelection = captureAnimationSelectionHistory(session)
          session.history.push({
            label: tr('workspace.history.animationMaskLink'),
            bytes: [...before, ...after].reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
            undo: () => {
              restoreAnimationMaskSlots(session.document, before)
              restoreAnimationSelectionHistory(session, beforeSelection)
            },
            redo: () => {
              restoreAnimationMaskSlots(session.document, after)
              restoreAnimationSelectionHistory(session, afterSelection)
            },
            invalidation: { kind: 'full' }
          })
        },
        true,
        true
      )
    },
    disconnectSelectedAnimationMasks() {
      get().mutateActive(
        (session) => {
          const beforeSelection = captureAnimationSelectionHistory(session)
          const timeline = ensureAnimationDocument(session.document)
          const selectedKeys = new Set(session.selectedAnimationMaskCellKeys)
          const resolvedByKey = createAnimationMaskLookup(ensureAnimationDocument(session.document))
          const slots = [
            ...(timeline.layerMasks ?? []).map((entry) => ({
              ownerId: entry.layerId,
              frameId: entry.frameId,
              mask: entry.mask
            })),
            ...(timeline.groupMasks ?? []).map((entry) => ({
              ownerId: entry.groupId,
              frameId: entry.frameId,
              mask: entry.mask
            }))
          ]
          const selectedRootIds = new Set(
            slots.flatMap((slot) => {
              const key = animationCelKey(slot.ownerId, slot.frameId)
              return selectedKeys.has(key) ? [resolvedByKey.get(key)?.id ?? slot.mask.id] : []
            })
          )
          const affected = slots.filter((slot) => {
            if (!slot.mask.linkedMaskId) return false
            const key = animationCelKey(slot.ownerId, slot.frameId)
            return selectedKeys.has(key) || selectedRootIds.has(resolvedByKey.get(key)?.id ?? slot.mask.id)
          })
          if (!affected.length || affected.some((slot) => animationMaskOwnerLocked(session.document, slot.ownerId))) return
          const affectedKeys = affected.map((slot) => animationCelKey(slot.ownerId, slot.frameId))
          const before = affectedKeys.flatMap((key) => {
            const target = parseAnimationCelKey(key)
            const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
            return snapshot ? [snapshot] : []
          })
          for (const slot of affected) {
            const resolved = resolveAnimationMask(timeline, slot.mask)
            if (!resolved) continue
            const ownerKind = animationMaskOwnerKind(session.document, slot.ownerId)
            if (!ownerKind) continue
            const independent = cloneAnimationMaskForOwner(resolved, ownerKind, slot.mask.ownerId, { id: slot.mask.id, preserveLink: false })
            setAnimationMaskSlot(session.document, slot.ownerId, slot.frameId, independent)
          }
          const after = affectedKeys.flatMap((key) => {
            const target = parseAnimationCelKey(key)
            const snapshot = target ? animationMaskSlotSnapshot(session.document, target.layerId, target.frameId) : null
            return snapshot ? [snapshot] : []
          })
          const afterSelection = captureAnimationSelectionHistory(session)
          session.history.push({
            label: tr('workspace.history.animationMaskUnlink'),
            bytes: [...before, ...after].reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
            undo: () => {
              restoreAnimationMaskSlots(session.document, before)
              restoreAnimationSelectionHistory(session, beforeSelection)
            },
            redo: () => {
              restoreAnimationMaskSlots(session.document, after)
              restoreAnimationSelectionHistory(session, afterSelection)
            },
            invalidation: { kind: 'full' }
          })
        },
        true,
        true
      )
    }
  }
}
