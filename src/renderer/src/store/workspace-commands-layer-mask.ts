import { type HistoryEntry } from '@/core/history'
import { animationMaskAt, createLayerMask as createAttachedLayerMask, isGroupEffectivelyLocked, isLayerEffectivelyLocked } from '@/core/document-model'
import { activateAnimationFrame, animationCelHasContent, animationCelKey, animationGroupMaskAt, ensureAnimationDocument, parseAnimationCelKey, refreshActiveAnimationFrame, resolveAnimationCel } from '@/core/animation'
import { enterLayerMaskEditing, exitLayerMaskEditing } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceLayerCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { setTimelineActiveContext, applyLayerRowSelection } from './workspace-animation-selection'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection } from './workspace-animation-selection-history'
import { directAnimationMaskAt, ensureAnimationCelSlot, setAnimationMaskSlot, AnimationMaskSlotSnapshot, animationMaskSlotSnapshot, restoreAnimationMaskSlots } from './workspace-animation-mask-slots'


const activateTimelineMask = (
  session: DocumentSession,
  ownerKind: 'layer' | 'group',
  ownerId: string,
  frameId: string,
  maskId: string,
): void => {
  session.activeLayerMaskId = maskId
  enterLayerMaskEditing(session)
  setTimelineActiveContext(session, { kind: 'mask', ownerKind, ownerId }, frameId, maskId)
}

export function createLayerMaskCommands({ get, set }: WorkspaceCommandContext<'commitFloatingPaste' | 'mutateActive' | 'selectAnimationMaskCell' | 'selectGroupMask'>): Pick<WorkspaceLayerCommands, 'selectLayerMask' | 'selectGroupMask' | 'toggleLayerMaskVisibility' | 'setLayerMaskLocked' | 'setLayerMaskAutoLinkAnimationCels' | 'toggleGroupMaskVisibility' | 'setLayerMaskMoveWithOwner' | 'setGroupMaskMoveWithOwner' | 'createLayerMask' | 'createLayerMasksForLayer' | 'createGroupMask' | 'deleteLayerMask' | 'deleteGroupMask' | 'deleteSelectedLayerMasks'> {
  return {
    selectLayerMask(celId, additive = false) {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.id === celId)
        const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
        if (!cel || !mask) return
        activateAnimationFrame(session.document, cel.frameId)
        applyLayerRowSelection(session, [], [], { kind: 'layer', id: cel.layerId })
        activateTimelineMask(session, 'layer', cel.layerId, cel.frameId, mask.id)
        session.layerMaskIsolatedView = true
        const key = animationCelKey(cel.layerId, cel.frameId)
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionAnchorKey = null
        session.animationCellSelectionExplicit = false
        const selected = new Set(additive ? session.selectedAnimationMaskCellKeys : [])
        selected.add(key)
        session.selectedAnimationMaskCellKeys = [...selected]
        session.animationMaskCellSelectionAnchorKey = key
      }, false, true)
    },
    selectGroupMask(groupId, frameId, additive = false) {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const mask = animationMaskAt(timeline, groupId, frameId)
        if (!mask || !session.document.groups.some((group) => group.id === groupId)) return
        activateAnimationFrame(session.document, frameId)
        applyLayerRowSelection(session, [], [groupId], { kind: 'group', id: groupId })
        activateTimelineMask(session, 'group', groupId, frameId, mask.id)
        session.layerMaskIsolatedView = true
        const key = animationCelKey(groupId, frameId)
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionAnchorKey = null
        session.animationCellSelectionExplicit = false
        const selected = new Set(additive ? session.selectedAnimationMaskCellKeys : [])
        selected.add(key)
        session.selectedAnimationMaskCellKeys = [...selected]
        session.animationMaskCellSelectionAnchorKey = key
      }, false, true)
    },
    toggleLayerMaskVisibility(celId) {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.id === celId)
        const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
        if (!mask) return
        const before = mask.visible
        mask.visible = !before
        session.history.push({ label: tr('workspace.history.showLayer'), bytes: 8, undo: () => { mask.visible = before }, redo: () => { mask.visible = !before } })
      })
    },
    setLayerMaskLocked(celId, enabled) {
      get().mutateActive((session) => {
        const beforeSelection = captureAnimationSelectionHistory(session)
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.id === celId)
        const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
        if (!mask || mask.ownerKind !== 'cel') return
        const before = mask.locked === true
        const after = Boolean(enabled)
        if (before === after) return
        const apply = (value: boolean): void => { mask.locked = value }
        apply(after)
        if (after && session.activeLayerMaskId === mask.id) { session.activeLayerMaskId = null; session.layerMaskIsolatedView = false; exitLayerMaskEditing(session) }
        const afterSelection = captureAnimationSelectionHistory(session)
        const entry: HistoryEntry = { label: tr('workspace.history.layerProperties'), bytes: 8, undo: () => apply(before), redo: () => apply(after), contentChanged: false, requiresAnimationSync: false }
        session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection))
      }, 'metadata')
    },
    setLayerMaskAutoLinkAnimationCels(celId, enabled) {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.id === celId)
        const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
        if (!mask || mask.ownerKind !== 'cel') return
        const before = mask.autoLinkAnimationCels === true
        const after = Boolean(enabled)
        if (before === after) return
        const apply = (value: boolean): void => { if (value) mask.autoLinkAnimationCels = true; else delete mask.autoLinkAnimationCels }
        apply(after)
        session.history.push({ label: tr('workspace.history.layerProperties'), bytes: 8, undo: () => apply(before), redo: () => apply(after), contentChanged: false, requiresAnimationSync: false })
      }, 'metadata')
    },
    toggleGroupMaskVisibility(groupId, frameId) {
      get().mutateActive((session) => {
        const mask = animationMaskAt(ensureAnimationDocument(session.document), groupId, frameId)
        if (!mask) return
        const before = mask.visible
        mask.visible = !before
        session.history.push({ label: tr('workspace.history.showLayer'), bytes: 8, undo: () => { mask.visible = before }, redo: () => { mask.visible = !before } })
      })
    },
    setLayerMaskMoveWithOwner(celId, enabled) {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.id === celId)
          ?? timeline.cels.find((candidate) => candidate.layerId === celId && candidate.frameId === timeline.activeFrameId)
        const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
        if (!mask || mask.moveWithOwner === enabled) return
        const before = mask.moveWithOwner !== false
        mask.moveWithOwner = enabled
        session.history.push({ label: tr('workspace.history.layerMaskMoveBinding'), bytes: 8, undo: () => { mask.moveWithOwner = before }, redo: () => { mask.moveWithOwner = enabled } })
      })
    },
    setGroupMaskMoveWithOwner(groupId, frameId, enabled) {
      get().mutateActive((session) => {
        const mask = animationMaskAt(ensureAnimationDocument(session.document), groupId, frameId)
        if (!mask || mask.moveWithOwner === enabled) return
        const before = mask.moveWithOwner !== false
        mask.moveWithOwner = enabled
        session.history.push({ label: tr('workspace.history.layerMaskMoveBinding'), bytes: 8, undo: () => { mask.moveWithOwner = before }, redo: () => { mask.moveWithOwner = enabled } })
      })
    },
    createLayerMask(celId, frameId) {
      const current = activeSession(get())
      if (!current) return
      const currentTimeline = ensureAnimationDocument(current.document)
      const directCel = currentTimeline.cels.find((candidate) => candidate.id === celId)
      const targetLayerId = directCel?.layerId ?? celId
      const targetFrameId = directCel?.frameId ?? frameId ?? currentTimeline.activeFrameId
      const currentCel = directCel ?? currentTimeline.cels.find((candidate) => candidate.layerId === targetLayerId && candidate.frameId === targetFrameId)
      const currentSourceCel = resolveAnimationCel(currentTimeline, currentCel ?? null) ?? currentCel
      const currentLayer = current.document.layers.find((layer) => layer.id === targetLayerId)
      if (!currentLayer || !currentTimeline.frames.some((candidate) => candidate.id === targetFrameId)) return
      if (isLayerEffectivelyLocked(current.document, currentLayer)) { set({ message: tr('workspace.layerMask.locked') }); return }
      const existingMask = directAnimationMaskAt(current.document, targetLayerId, targetFrameId)
      if (existingMask) { get().selectAnimationMaskCell(animationCelKey(targetLayerId, targetFrameId)); return }
      if (currentLayer.kind !== 'adjustment' && !animationCelHasContent(currentSourceCel ?? null, current.document.palette)) { set({ message: tr('workspace.layerMask.emptyCel') }); return }
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const ensured = ensureAnimationCelSlot(session.document, targetLayerId, targetFrameId)
        const cel = directCel ?? ensured?.cel ?? timeline.cels.find((candidate) => candidate.layerId === targetLayerId && candidate.frameId === targetFrameId)
        const sourceCel = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (!cel || !sourceCel) return
        const currentMask = directAnimationMaskAt(session.document, targetLayerId, targetFrameId)
        if (currentMask) { activateTimelineMask(session, 'layer', targetLayerId, targetFrameId, currentMask.id); return }
        if (currentLayer.kind !== 'adjustment' && !animationCelHasContent(sourceCel, session.document.palette)) return
        const mask = createAttachedLayerMask(targetLayerId, session.document.width, session.document.height)
        setAnimationMaskSlot(session.document, targetLayerId, targetFrameId, mask)
        activateAnimationFrame(session.document, targetFrameId)
        refreshActiveAnimationFrame(session.document)
        applyLayerRowSelection(session, [], [], { kind: 'layer', id: targetLayerId })
        activateTimelineMask(session, 'layer', targetLayerId, targetFrameId, mask.id)
        session.layerMaskIsolatedView = false
        const key = animationCelKey(targetLayerId, targetFrameId)
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionAnchorKey = null
        session.animationCellSelectionExplicit = false
        session.selectedAnimationMaskCellKeys = [key]
        session.animationMaskCellSelectionAnchorKey = key
        session.history.push({
          label: tr('workspace.history.createLayerMask'),
          bytes: mask.pixels.byteLength,
          undo: () => { setAnimationMaskSlot(session.document, targetLayerId, targetFrameId, null); if (ensured?.created) timeline.cels = timeline.cels.filter((candidate) => candidate !== cel); if (session.activeLayerMaskId === mask.id) { session.activeLayerMaskId = null; session.layerMaskIsolatedView = false; exitLayerMaskEditing(session) } },
          redo: () => { if (ensured?.created && !timeline.cels.includes(cel)) timeline.cels.push(cel); setAnimationMaskSlot(session.document, targetLayerId, targetFrameId, mask); activateTimelineMask(session, 'layer', targetLayerId, targetFrameId, mask.id); session.layerMaskIsolatedView = false; refreshActiveAnimationFrame(session.document) },
          invalidation: { kind: 'full' }
        })
      }, true, true)
    },
    createLayerMasksForLayer(layerId) {
      const current = activeSession(get())
      if (!current) return
      const layer = current.document.layers.find((candidate) => candidate.id === layerId)
      if (!layer) return
      if (isLayerEffectivelyLocked(current.document, layer)) { set({ message: tr('workspace.layerMask.locked') }); return }
      const currentTimeline = ensureAnimationDocument(current.document)
      const currentTargets = layer.kind === 'adjustment' ? currentTimeline.frames.map(frame => ({ layerId, frameId: frame.id })) : currentTimeline.cels.filter((cel) => cel.layerId === layerId && animationCelHasContent(resolveAnimationCel(currentTimeline, cel) ?? cel, current.document.palette))
      if (currentTargets.length === 0) { set({ message: tr('workspace.layerMask.emptyCel') }); return }
      if (!currentTargets.some((cel) => !directAnimationMaskAt(current.document, layerId, cel.frameId))) return
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const created = currentTargets.flatMap((target) => {
          const cel = timeline.cels.find(candidate => candidate.layerId === target.layerId && candidate.frameId === target.frameId) ?? target
          if (cel.layerId !== layerId || directAnimationMaskAt(session.document, layerId, cel.frameId)) return []
          const sourceCel = timeline.cels.find(candidate => candidate.layerId === cel.layerId && candidate.frameId === cel.frameId)
          if (layer.kind !== 'adjustment' && !animationCelHasContent(sourceCel ? resolveAnimationCel(timeline, sourceCel) ?? sourceCel : null, session.document.palette)) return []
          const mask = createAttachedLayerMask(layerId, session.document.width, session.document.height)
          setAnimationMaskSlot(session.document, layerId, cel.frameId, mask)
          return [{ frameId: cel.frameId, mask }]
        })
        if (created.length === 0) return
        const activeCel = timeline.cels.find((cel) => cel.layerId === layerId && cel.frameId === timeline.activeFrameId)
        const activeMask = (activeCel || layer.kind === 'adjustment') ? directAnimationMaskAt(session.document, layerId, timeline.activeFrameId) : null
        applyLayerRowSelection(session, [layerId], [], { kind: 'layer', id: layerId })
        session.activeLayerMaskId = activeMask?.id ?? null
        if (activeMask) activateTimelineMask(session, 'layer', layerId, timeline.activeFrameId, activeMask.id)
        session.layerMaskIsolatedView = false
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionAnchorKey = null
        session.animationCellSelectionExplicit = false
        session.selectedAnimationMaskCellKeys = activeMask ? [animationCelKey(layerId, timeline.activeFrameId)] : []
        session.animationMaskCellSelectionAnchorKey = session.selectedAnimationMaskCellKeys[0] ?? null
        refreshActiveAnimationFrame(session.document)
        const createdMaskIds = new Set(created.map(({ mask }) => mask.id))
        const remove = (): void => {
          for (const { frameId } of created) setAnimationMaskSlot(session.document, layerId, frameId, null)
          if (session.activeLayerMaskId && createdMaskIds.has(session.activeLayerMaskId)) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) }
          refreshActiveAnimationFrame(session.document)
        }
        const restore = (): void => {
          for (const { frameId, mask } of created) setAnimationMaskSlot(session.document, layerId, frameId, mask)
          session.activeLayerMaskId = activeMask?.id ?? null
          if (activeMask) activateTimelineMask(session, 'layer', layerId, timeline.activeFrameId, activeMask.id)
          session.layerMaskIsolatedView = false
          refreshActiveAnimationFrame(session.document)
        }
        session.history.push({
          label: tr('workspace.history.createLayerMask'),
          bytes: created.reduce((sum, { mask }) => sum + mask.pixels.byteLength, 0),
          undo: remove,
          redo: restore,
          invalidation: { kind: 'full' }
        })
      }, true, true)
    },
    createGroupMask(groupId, frameId) {
      const current = activeSession(get())
      if (!current) return
      const group = current.document.groups.find((candidate) => candidate.id === groupId)
      const targetFrameId = frameId ?? ensureAnimationDocument(current.document).activeFrameId
      if (!group) return
      if (isGroupEffectivelyLocked(current.document, group)) { set({ message: tr('workspace.layerMask.locked') }); return }
      const existing = animationGroupMaskAt(ensureAnimationDocument(current.document), groupId, targetFrameId)
      if (existing) { get().selectGroupMask(groupId, targetFrameId); return }
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const mask = createAttachedLayerMask(groupId, session.document.width, session.document.height, 'group')
        const entry = { groupId, frameId: targetFrameId, mask }
        timeline.groupMasks ??= []
        timeline.groupMasks.push(entry)
        activateAnimationFrame(session.document, targetFrameId)
        applyLayerRowSelection(session, [], [groupId], { kind: 'group', id: groupId })
        activateTimelineMask(session, 'group', groupId, targetFrameId, mask.id)
        session.layerMaskIsolatedView = false
        const key = animationCelKey(groupId, targetFrameId)
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionAnchorKey = null
        session.animationCellSelectionExplicit = false
        session.selectedAnimationMaskCellKeys = [key]
        session.animationMaskCellSelectionAnchorKey = key
        const restore = (): void => { if (!timeline.groupMasks?.some((candidate) => candidate.mask.id === mask.id)) timeline.groupMasks?.push(entry); activateTimelineMask(session, 'group', groupId, targetFrameId, mask.id) }
        const remove = (): void => { timeline.groupMasks = (timeline.groupMasks ?? []).filter((candidate) => candidate.mask.id !== mask.id); if (session.activeLayerMaskId === mask.id) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) } }
        session.history.push({ label: tr('workspace.history.createLayerGroupMask'), bytes: mask.pixels.byteLength, undo: remove, redo: restore, invalidation: { kind: 'full' } })
      }, true, true)
    },
    deleteLayerMask(celId) {
      const current = activeSession(get())
      if (!current) return
      const currentTimeline = ensureAnimationDocument(current.document)
      const currentCel = currentTimeline.cels.find((candidate) => candidate.id === celId)
      const currentLayer = currentCel ? current.document.layers.find((layer) => layer.id === currentCel.layerId) : null
      const currentMask = currentCel ? directAnimationMaskAt(current.document, currentCel.layerId, currentCel.frameId) : null
      if (!currentMask || !currentLayer || !currentCel) return
      if (isLayerEffectivelyLocked(current.document, currentLayer)) { set({ message: tr('workspace.layerMask.locked') }); return }
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.id === celId)
        if (!cel) return
        const mask = directAnimationMaskAt(session.document, cel.layerId, cel.frameId)
        if (!mask) return
        const wasActive = session.activeLayerMaskId === mask.id
        setAnimationMaskSlot(session.document, cel.layerId, cel.frameId, null)
        if (wasActive) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) }
        session.selectedAnimationMaskCellKeys = session.selectedAnimationMaskCellKeys.filter((key) => {
          const target = parseAnimationCelKey(key)
          return !target || target.layerId !== cel.layerId || target.frameId !== cel.frameId
        })
        if (session.selectedAnimationMaskCellKeys.length === 0) session.animationMaskCellSelectionAnchorKey = null
        session.history.push({
          label: tr('workspace.history.deleteLayerMask'),
          bytes: mask.pixels.byteLength,
          undo: () => { setAnimationMaskSlot(session.document, cel.layerId, cel.frameId, mask); if (wasActive) { session.activeLayerMaskId = mask.id; enterLayerMaskEditing(session) } },
          redo: () => { setAnimationMaskSlot(session.document, cel.layerId, cel.frameId, null); if (session.activeLayerMaskId === mask.id) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) } },
          invalidation: { kind: 'full' }
        })
      }, true, true)
    },
    deleteGroupMask(groupId, frameId) {
      const current = activeSession(get())
      if (!current) return
      const group = current.document.groups.find((candidate) => candidate.id === groupId)
      const targetFrameId = frameId ?? ensureAnimationDocument(current.document).activeFrameId
      const mask = animationGroupMaskAt(ensureAnimationDocument(current.document), groupId, targetFrameId)
      if (!group || !mask) return
      if (isGroupEffectivelyLocked(current.document, group)) { set({ message: tr('workspace.layerMask.locked') }); return }
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const entry = timeline.groupMasks?.find((candidate) => candidate.groupId === groupId && candidate.frameId === targetFrameId)
        if (!entry) return
        const wasActive = session.activeLayerMaskId === entry.mask.id
        const remove = (): void => { timeline.groupMasks = (timeline.groupMasks ?? []).filter((candidate) => candidate !== entry); if (session.activeLayerMaskId === entry.mask.id) { session.activeLayerMaskId = null; exitLayerMaskEditing(session) } }
        const restore = (): void => { timeline.groupMasks ??= []; if (!timeline.groupMasks.includes(entry)) timeline.groupMasks.push(entry); if (wasActive) { session.activeLayerMaskId = entry.mask.id; enterLayerMaskEditing(session) } }
        remove()
        const key = animationCelKey(groupId, targetFrameId)
        session.selectedAnimationMaskCellKeys = session.selectedAnimationMaskCellKeys.filter((candidate) => candidate !== key)
        if (session.selectedAnimationMaskCellKeys.length === 0) session.animationMaskCellSelectionAnchorKey = null
        session.history.push({ label: tr('workspace.history.deleteLayerGroupMask'), bytes: entry.mask.pixels.byteLength, undo: restore, redo: remove, invalidation: { kind: 'full' } })
      }, true, true)
    },
    deleteSelectedLayerMasks() {
      const current = activeSession(get())
      if (!current || current.selectedAnimationMaskCellKeys.length === 0 && current.selectedAnimationMaskRowKeys.length === 0) return
      const timeline = ensureAnimationDocument(current.document)
      const snapshotsBySlot = new Map<string, AnimationMaskSlotSnapshot>()
      const addSnapshot = (ownerId: string, frameId: string): void => {
        const snapshot = animationMaskSlotSnapshot(current.document, ownerId, frameId)
        if (snapshot?.mask) snapshotsBySlot.set(`${snapshot.ownerKind}:${ownerId}:${frameId}`, snapshot)
      }
      for (const key of current.selectedAnimationMaskCellKeys) {
        const target = parseAnimationCelKey(key)
        if (target) addSnapshot(target.layerId, target.frameId)
      }
      const selectedRows = new Set(current.selectedAnimationMaskRowKeys)
      for (const entry of timeline.layerMasks ?? []) if (selectedRows.has(`layer:${entry.layerId}`)) addSnapshot(entry.layerId, entry.frameId)
      for (const entry of timeline.groupMasks ?? []) if (selectedRows.has(`group:${entry.groupId}`)) addSnapshot(entry.groupId, entry.frameId)
      const snapshots = [...snapshotsBySlot.values()]
      if (snapshots.length === 0) return
      if (snapshots.some((snapshot) => {
        if (snapshot.ownerKind === 'layer') {
          const layer = current.document.layers.find((candidate) => candidate.id === snapshot.ownerId)
          return layer ? isLayerEffectivelyLocked(current.document, layer) : false
        }
        const group = current.document.groups.find((candidate) => candidate.id === snapshot.ownerId)
        return group ? isGroupEffectivelyLocked(current.document, group) : false
      })) { set({ message: tr('workspace.layerMask.locked') }); return }
      const beforeSelection = captureAnimationSelectionHistory(current)
      get().mutateActive((session) => {
        const activeMaskId = session.activeLayerMaskId
        const removedMaskIds = new Set(snapshots.flatMap((item) => item.mask ? [item.mask.id] : []))
        const restore = (): void => { restoreAnimationMaskSlots(session.document, snapshots) }
        const remove = (): void => { for (const item of snapshots) setAnimationMaskSlot(session.document, item.ownerId, item.frameId, null) }
        remove()
        if (activeMaskId && removedMaskIds.has(activeMaskId)) { session.activeLayerMaskId = null; session.layerMaskIsolatedView = false; exitLayerMaskEditing(session) }
        session.selectedAnimationMaskCellKeys = []
        session.selectedAnimationMaskRowKeys = []
        session.animationMaskCellSelectionAnchorKey = null
        const afterSelection = captureAnimationSelectionHistory(session)
        const entry: HistoryEntry = {
          label: tr('workspace.history.deleteLayerMask'),
          bytes: snapshots.reduce((sum, item) => sum + (item.mask?.pixels.byteLength ?? 0), 0),
          undo: restore,
          redo: remove,
          invalidation: { kind: 'full' }
        }
        session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection))
      }, true, true)
    }
  }
}
