import { animationMaskAt } from '@/core/document-model'
import {
  activateAnimationFrame,
  animationCelContentSelection,
  animationCelKey,
  ensureAnimationDocument,
  parseAnimationCelKey,
  resolveAnimationCel,
  stepAnimationFrameId
} from '@/core/animation'
import { animationLoopSectionAtFrame, stepAnimationLoopSectionFrameId } from '@/core/animation-loop-sections'
import { combineSelection } from '@/core/selection'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { loadEditorPreferences } from '@/core/file-preferences'
import { cloneSelectionMask, enterLayerMaskEditing, exitLayerMaskEditing } from './workspace-session'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import {
  setTimelineActiveContext,
  animationLayerPanelSelectionRows,
  AnimationLayerPanelSelectionRow,
  clearAnimationItemSelection
} from './workspace-animation-selection'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { clearFreeTileInstanceSelection } from './workspace-free-tile-selection'
import { requestTilesetPanelForLayer } from './workspace-tileset-panel'
import { setTimelineActiveFrame, retargetAnimationLoopPlaybackAtFrame } from './workspace-animation-commands-helpers'



export function createAnimationSelectionCommands({ get, set }: WorkspaceCommandContext<'commitFloatingPaste' | 'commitSelectionChange' | 'mutateActive' | 'selectAnimationCell' | 'selectAnimationFrame' | 'selectLayer' | 'setActiveAnimationFrame'>): Pick<WorkspaceAnimationCommands, 'setActiveAnimationFrame' | 'stepAnimationFrame' | 'stepLayerSelection' | 'selectAnimationFrame' | 'selectAnimationCell' | 'selectAnimationMaskCell' | 'selectAnimationMaskRow' | 'selectAnimationCelContent' | 'clearAnimationSelection'> {
  return {
    setActiveAnimationFrame(frameId) {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        // Frame focus is a session/UI interaction. Do not normalize a sparse
        // timeline or materialize blank cels merely because the user clicked a
        // frame; editing commands explicitly use the materializing path.
        if (!activateAnimationFrame(session.document, frameId, false)) return
        // When tag playback is already running, changing the active frame from
        // a cel/group-cel interaction must retarget playback to the tag that
        // owns that frame, just like clicking a frame header does. Keep this in
        // the shared active-frame boundary so every timeline cell surface gets
        // the same behavior without coupling the panel's transient group state
        // to playback.
        retargetAnimationLoopPlaybackAtFrame(session, frameId)
        const preserveMaskContext = (session.selectedAnimationMaskRowKeys?.length ?? 0) > 0 || (session.selectedAnimationMaskCellKeys?.length ?? 0) > 0 || session.activeLayerMaskId !== null
        if (!preserveMaskContext) {
          session.activeLayerMaskId = null
          session.layerMaskIsolatedView = false
        }
        session.lastPencilPoint = null
        session.lastEraserPoint = null
        if (!session.animationPlaying) setTimelineActiveFrame(session, frameId)
        session.revision += 1
      }, false)
    },
    stepAnimationFrame(delta) {
      // Frame stepping has the same transaction boundary as clicking a frame:
      // finish the floating transform on its originating frame first, while
      // retaining the resulting selection mask for the destination frame.
      get().commitFloatingPaste()
      const session = activeSession(get())
      if (!session) return
      const timeline = ensureAnimationDocument(session.document)
      if (timeline.frames.length < 2 || Math.sign(delta) === 0) return
      const current = timeline.frames.findIndex((frame) => frame.id === timeline.activeFrameId)
      const direction = Math.sign(delta)
      const skipDisabledFrames = loadEditorPreferences().skipDisabledFrames
      const activeLoopSection = animationLoopSectionAtFrame(timeline, timeline.activeFrameId)
      const loopSectionFrameId = activeLoopSection ? stepAnimationLoopSectionFrameId(timeline, activeLoopSection, timeline.activeFrameId, direction > 0 ? 1 : -1, skipDisabledFrames) : null
      const frameId = skipDisabledFrames ? (activeLoopSection ? loopSectionFrameId : stepAnimationFrameId(timeline, current < 0 ? '' : timeline.activeFrameId, direction > 0 ? 1 : -1)) : null
      const frame = skipDisabledFrames
        ? frameId
          ? timeline.frames.find((candidate) => candidate.id === frameId)
          : null
        : activeLoopSection
          ? timeline.frames.find((candidate) => candidate.id === (loopSectionFrameId ?? ''))
          : timeline.frames[current < 0 ? (direction > 0 ? 0 : timeline.frames.length - 1) : (current + direction + timeline.frames.length) % timeline.frames.length]
      if (!frame || frame.id === timeline.activeFrameId) return
      // Keyboard frame stepping is active-only navigation. Any explicit
      // timeline item selection belongs to the frame that was just left and
      // must not be carried over to the destination frame.
      clearAnimationItemSelection(session)
      // Keep implicit timeline navigation free of selection normalization. The
      // generic setActiveAnimationFrame command intentionally repairs layer
      // selection, but arrow-key active-only navigation must not synthesize
      // selected layer/group/cel state as a side effect.
      const state = get()
      const currentSession = activeSession(state)
      const preserveMaskContext = Boolean(currentSession && ((currentSession.selectedAnimationMaskRowKeys?.length ?? 0) > 0 || (currentSession.selectedAnimationMaskCellKeys?.length ?? 0) > 0 || currentSession.activeLayerMaskId !== null))
      if (!currentSession || !activateAnimationFrame(currentSession.document, frame.id)) return
      if (!preserveMaskContext) {
        currentSession.activeLayerMaskId = null
        currentSession.layerMaskIsolatedView = false
      }
      currentSession.lastPencilPoint = null
      currentSession.lastEraserPoint = null
      setTimelineActiveFrame(currentSession, frame.id)
      currentSession.revision += 1
      set({ sessions: [...state.sessions] })
    },
    stepLayerSelection(delta) {
      const session = activeSession(get())
      const direction = Math.sign(delta)
      if (!session || direction === 0) return
      const nodes = buildLayerPanelTree({
        layers: session.document.layers,
        groups: session.document.groups,
        collapsedGroupIds: session.collapsedGroupIds
      })
      if (nodes.length === 0) return
      const focusId = session.layerSelectionAnchorId ?? session.selectedGroupId ?? session.document.activeLayerId
      let index = nodes.findIndex((node) => node.id === focusId)
      if (index < 0) index = nodes.findIndex((node) => node.kind === 'layer' && node.id === session.document.activeLayerId)
      if (index < 0) index = direction > 0 ? -1 : nodes.length
      for (let next = index + direction; next >= 0 && next < nodes.length; next += direction) {
        const node = nodes[next]
        if (node.kind !== 'layer') continue
        const hasExplicitLayerSelection = session.layerSelectionExplicit === true || session.selectedGroupId !== null || session.selectedGroupIds.length > 0
        if (hasExplicitLayerSelection) get().selectLayer(node.id)
        else {
          // Active-only navigation is intentionally kept outside mutateActive:
          // its normalization boundary would repopulate selectedLayerIds from
          // the active layer and turn implicit focus into an explicit selection.
          const state = get()
          const current = activeSession(state)
          if (!current) return
          current.document.activeLayerId = node.id
          current.selectedLayerIds = []
          current.selectedGroupIds = []
          current.selectedGroupId = null
          current.layerSelectionAnchorId = node.id
          current.activeLayerMaskId = null
          current.layerMaskIsolatedView = false
          set({ sessions: [...state.sessions] })
        }
        return
      }
    },
    selectAnimationFrame(frameId, mode = 'replace') {
      const playbackSession = activeSession(get())
      const preservePlaybackFrame = playbackSession?.animationPlaying === true
      const retargetLoopPlayback = preservePlaybackFrame && playbackSession?.animationPlaybackMode === 'tag'
      get().mutateActive((session) => {
        const timeline = session.document.animation
        if (!timeline) return
        if (!timeline.frames.some((frame) => frame.id === frameId)) return
        // During playback the timeline playhead is independent from the frame
        // being selected for an action such as disabling or copying. Changing
        // activeFrameId here would make the playhead jump to the context-menu
        // target and can drop the highlight from the frame actually playing.
        const selectedMaskCellOwnerKeys = [
          ...new Set(
            session.selectedAnimationMaskCellKeys.flatMap((key) => {
              const target = parseAnimationCelKey(key)
              if (!target) return []
              if (session.document.layers.some((layer) => layer.id === target.layerId)) return [`layer:${target.layerId}`]
              if (session.document.groups.some((group) => group.id === target.layerId)) return [`group:${target.layerId}`]
              return []
            })
          )
        ]
        const preserveMaskContext = session.selectedAnimationMaskRowKeys.length > 0 || selectedMaskCellOwnerKeys.length > 0 || session.activeLayerMaskId !== null
        if (preserveMaskContext && !preservePlaybackFrame) activateAnimationFrame(session.document, frameId, false)
        session.selectedAnimationCellKeys = []
        session.animationCellSelectionAnchorKey = null
        session.animationCellSelectionExplicit = false
        session.selectedAnimationMaskCellKeys = []
        const preservedMaskRowKeys = preserveMaskContext ? [...new Set([...session.selectedAnimationMaskRowKeys, ...selectedMaskCellOwnerKeys])] : []
        const preservedActiveMaskId = preserveMaskContext ? session.activeLayerMaskId : null
        session.selectedAnimationMaskRowKeys = preservedMaskRowKeys
        session.animationMaskCellSelectionAnchorKey = null
        session.activeLayerMaskId = preservedActiveMaskId
        if (!preserveMaskContext) session.layerMaskIsolatedView = false
        const preserveExplicitLayerContext = session.layerSelectionExplicit === true && session.selectedLayerIds.length > 0 && session.selectedGroupIds.length === 0 && session.selectedGroupId === null
        // Animation frame selection is mutually exclusive with layer/group
        // selection. Keep layerSelectionAnchorId as a non-selecting context
        // hint so the timeline can retain the previous group as active context
        // without leaving descendant layers formally selected.
        if (preserveMaskContext) session.selectedLayerIds = []
        session.selectedGroupIds = []
        session.selectedGroupId = null
        session.layerSelectionExplicit = preserveMaskContext ? false : preserveExplicitLayerContext
        const current = new Set(session.selectedAnimationFrameIds)
        if (mode === 'range' && session.animationFrameSelectionAnchorId) {
          const start = timeline.frames.findIndex((frame) => frame.id === session.animationFrameSelectionAnchorId)
          const end = timeline.frames.findIndex((frame) => frame.id === frameId)
          if (start >= 0 && end >= 0) {
            const [from, to] = start <= end ? [start, end] : [end, start]
            session.selectedAnimationFrameIds = timeline.frames.slice(from, to + 1).map((frame) => frame.id)
          }
        } else if (mode === 'toggle') {
          if (current.has(frameId)) current.delete(frameId)
          else current.add(frameId)
          session.selectedAnimationFrameIds = timeline.frames.map((frame) => frame.id).filter((id) => current.has(id))
        } else {
          session.selectedAnimationFrameIds = [frameId]
        }
        if (mode !== 'toggle' || session.animationFrameSelectionAnchorId === null) session.animationFrameSelectionAnchorId = frameId
        if (!preservePlaybackFrame || retargetLoopPlayback) setTimelineActiveFrame(session, frameId)
      }, false)
      if (!preservePlaybackFrame || retargetLoopPlayback) get().setActiveAnimationFrame(frameId)
    },
    selectAnimationCell(key, mode = 'replace') {
      get().mutateActive(
        (session) => {
          const target = parseAnimationCelKey(key)
          const timeline = session.document.animation
          const targetLayer = target ? session.document.layers.find((layer) => layer.id === target.layerId) : null
          if (!target || !timeline || !targetLayer || !timeline.frames.some((frame) => frame.id === target.frameId)) return
          if (targetLayer.kind === 'free-tile') {
            session.freeTileInstanceLayerId = null
            clearFreeTileInstanceSelection(session)
          }
          const implicitAnchorKey = mode !== 'replace' && session.selectedAnimationCellKeys.length === 0 ? animationCelKey(session.document.activeLayerId, timeline.activeFrameId) : null
          session.selectedAnimationFrameIds = []
          session.animationFrameSelectionAnchorId = null
          session.selectedAnimationMaskCellKeys = []
          session.selectedAnimationMaskRowKeys = []
          session.animationMaskCellSelectionAnchorKey = null
          session.document.activeLayerId = target.layerId
          session.activeLayerMaskId = null
          session.layerMaskIsolatedView = false
          setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: target.layerId }, target.frameId, null)
          // A plain cel click replaces the previous layer selection. Otherwise
          // the old selected layer ids remain visible after switching to one cel.
          if (mode === 'replace') {
            session.selectedLayerIds = []
            session.selectedGroupIds = []
            session.selectedGroupId = null
            session.layerSelectionExplicit = false
          }
          const current = new Set(session.selectedAnimationCellKeys)
          if (implicitAnchorKey) current.add(implicitAnchorKey)
          if (mode === 'toggle') {
            if (current.has(key)) current.delete(key)
            else current.add(key)
          } else if (mode === 'range') {
            const anchor = session.animationCellSelectionAnchorKey ?? session.selectedAnimationCellKeys.at(-1) ?? implicitAnchorKey
            const parsedAnchor = anchor ? parseAnimationCelKey(anchor) : null
            if (parsedAnchor) {
              const frames = timeline.frames
              const layers = session.document.layers
              const startFrame = frames.findIndex((frame) => frame.id === parsedAnchor.frameId)
              const endFrame = frames.findIndex((frame) => frame.id === target.frameId)
              const startLayer = layers.findIndex((layer) => layer.id === parsedAnchor.layerId)
              const endLayer = layers.findIndex((layer) => layer.id === target.layerId)
              if (startFrame >= 0 && endFrame >= 0 && startLayer >= 0 && endLayer >= 0) {
                const [fromFrame, toFrame] = startFrame <= endFrame ? [startFrame, endFrame] : [endFrame, startFrame]
                const [fromLayer, toLayer] = startLayer <= endLayer ? [startLayer, endLayer] : [endLayer, startLayer]
                for (const layer of layers.slice(fromLayer, toLayer + 1)) for (const frame of frames.slice(fromFrame, toFrame + 1)) current.add(animationCelKey(layer.id, frame.id))
              } else current.add(key)
            } else current.add(key)
          } else {
            current.clear()
            current.add(key)
          }
          session.selectedAnimationCellKeys = [...current]
          session.animationCellSelectionExplicit = current.size > 0
          const focusKey = current.has(key) ? key : session.selectedAnimationCellKeys.at(-1)
          const focus = focusKey ? parseAnimationCelKey(focusKey) : null
          if (focus) session.document.activeLayerId = focus.layerId
          if (session.selectedLayerIds.length === 0 && session.selectedGroupIds.length === 0 && session.selectedGroupId === null) {
            session.selectedLayerIds = [target.layerId]
          }
          session.animationCellSelectionAnchorKey = current.has(key) ? key : (session.selectedAnimationCellKeys.at(-1) ?? null)
        },
        false,
        false
      )
      const parsed = parseAnimationCelKey(key)
      const current = activeSession(get())
      if (parsed && current) requestTilesetPanelForLayer(current.document, parsed.layerId)
      if (parsed) get().setActiveAnimationFrame(parsed.frameId)
    },
    selectAnimationMaskCell(key, mode = 'replace') {
      // Mask cells activate their frame directly instead of going through
      // setActiveAnimationFrame(), so they must close a floating transform here
      // before switching the document surface.
      get().commitFloatingPaste()
      const current = activeSession(get())
      const parsed = parseAnimationCelKey(key)
      const timeline = current ? ensureAnimationDocument(current.document) : null
      const mask = timeline && parsed ? animationMaskAt(timeline, parsed.layerId, parsed.frameId) : null
      const ownerKind = current?.document.layers.some((layer) => layer.id === parsed?.layerId) ? 'layer' : current?.document.groups.some((group) => group.id === parsed?.layerId) ? 'group' : null
      const ownerHasMask = ownerKind === 'layer' ? timeline?.layerMasks?.some((entry) => entry.layerId === parsed?.layerId) : ownerKind === 'group' ? timeline?.groupMasks?.some((entry) => entry.groupId === parsed?.layerId) : false
      if (!current || !parsed || !timeline?.frames.some((frame) => frame.id === parsed.frameId) || !ownerKind || !ownerHasMask) return
      get().mutateActive(
        (session) => {
          const target = parseAnimationCelKey(key)
          const timeline = ensureAnimationDocument(session.document)
          const cel = target ? timeline.cels.find((candidate) => candidate.layerId === target.layerId && candidate.frameId === target.frameId) : null
          const ownerKind = session.document.layers.some((layer) => layer.id === target?.layerId) ? 'layer' : session.document.groups.some((group) => group.id === target?.layerId) ? 'group' : null
          if (!target || !ownerKind || !timeline.frames.some((frame) => frame.id === target.frameId)) return
          const mask = animationMaskAt(timeline, target.layerId, target.frameId)
          session.selectedAnimationFrameIds = []
          session.animationFrameSelectionAnchorId = null
          session.selectedAnimationCellKeys = []
          session.animationCellSelectionAnchorKey = null
          session.animationCellSelectionExplicit = false
          // Mask-cell selection is its own visual mode; do not mirror the owner
          // layer/group into row selection state.
          session.selectedLayerIds = []
          session.selectedGroupIds = []
          session.selectedGroupId = null
          session.selectedLayerIds = []
          session.layerSelectionExplicit = false
          session.selectedAnimationMaskRowKeys = []
          const current = new Set(session.selectedAnimationMaskCellKeys)
          if (mode === 'toggle') {
            if (current.has(key)) current.delete(key)
            else current.add(key)
          } else if (mode === 'range') {
            const anchor = session.animationMaskCellSelectionAnchorKey ?? session.selectedAnimationMaskCellKeys.at(-1)
            const parsedAnchor = anchor ? parseAnimationCelKey(anchor) : null
            if (parsedAnchor) {
              const frames = timeline.frames
              const owners = ownerKind === 'layer' ? session.document.layers : session.document.groups
              const startFrame = frames.findIndex((frame) => frame.id === parsedAnchor.frameId)
              const endFrame = frames.findIndex((frame) => frame.id === target.frameId)
              const startLayer = owners.findIndex((owner) => owner.id === parsedAnchor.layerId)
              const endLayer = owners.findIndex((owner) => owner.id === target.layerId)
              if (startFrame >= 0 && endFrame >= 0 && startLayer >= 0 && endLayer >= 0) {
                const [fromFrame, toFrame] = startFrame <= endFrame ? [startFrame, endFrame] : [endFrame, startFrame]
                const [fromLayer, toLayer] = startLayer <= endLayer ? [startLayer, endLayer] : [endLayer, startLayer]
                const selectableOwnerIds = new Set(ownerKind === 'layer' ? (timeline.layerMasks ?? []).map((entry) => entry.layerId) : (timeline.groupMasks ?? []).map((entry) => entry.groupId))
                for (const owner of owners.slice(fromLayer, toLayer + 1))
                  for (const frame of frames.slice(fromFrame, toFrame + 1)) {
                    const candidateKey = animationCelKey(owner.id, frame.id)
                    if (selectableOwnerIds.has(owner.id)) current.add(candidateKey)
                  }
              } else current.add(key)
            } else current.add(key)
          } else {
            current.clear()
            current.add(key)
          }
          session.selectedAnimationMaskCellKeys = [...current]
          session.animationMaskCellSelectionAnchorKey = key
          // The pointer target is the active cursor. Multi-selection membership
          // must not move activity back to the first selected frame.
          activateAnimationFrame(session.document, target.frameId)
          retargetAnimationLoopPlaybackAtFrame(session, target.frameId)
          session.activeLayerMaskId = current.has(key) && mask ? mask.id : null
          if (current.has(key) && mask) enterLayerMaskEditing(session)
          else exitLayerMaskEditing(session)
          session.layerMaskIsolatedView = false
          setTimelineActiveContext(session, { kind: 'mask', ownerKind, ownerId: target.layerId }, target.frameId, session.activeLayerMaskId)
        },
        false,
        true
      )
    },
    selectAnimationMaskRow(ownerKind, ownerId, mode = 'replace') {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          const hasMask = (timeline.layerMasks ?? []).some((entry) => entry.layerId === ownerId) || (timeline.groupMasks ?? []).some((entry) => entry.groupId === ownerId)
          if (!hasMask || (ownerKind === 'layer' ? !session.document.layers.some((layer) => layer.id === ownerId) : !session.document.groups.some((group) => group.id === ownerId))) return
          const selectionMode = mode
          const maskRowKey = `${ownerKind}:${ownerId}`
          if (selectionMode === 'range') {
            const rows = animationLayerPanelSelectionRows(session)
            const targetIndex = rows.findIndex((row) => row.kind === 'mask' && row.ownerKind === ownerKind && row.id === ownerId)
            const selectedMaskKey = session.selectedAnimationMaskRowKeys.at(-1)
            const selectedMaskSeparator = selectedMaskKey?.indexOf(':') ?? -1
            const selectedMaskOwnerKind = selectedMaskSeparator > 0 ? selectedMaskKey!.slice(0, selectedMaskSeparator) : null
            const selectedMaskOwnerId = selectedMaskSeparator > 0 ? selectedMaskKey!.slice(selectedMaskSeparator + 1) : null
            const anchorIndex =
              selectedMaskOwnerKind && selectedMaskOwnerId
                ? rows.findIndex((row) => row.kind === 'mask' && row.ownerKind === selectedMaskOwnerKind && row.id === selectedMaskOwnerId)
                : rows.findIndex((row) => (row.kind === 'layer' || row.kind === 'group') && row.id === session.layerSelectionAnchorId)
            const selectedRows = targetIndex >= 0 && anchorIndex >= 0 ? rows.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1) : [{ kind: 'mask' as const, ownerKind, id: ownerId }]
            const selectedLayers = selectedRows.filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'layer' }> => row.kind === 'layer').map((row) => row.id)
            const selectedGroups = selectedRows.filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'group' }> => row.kind === 'group').map((row) => row.id)
            session.selectedAnimationMaskRowKeys = selectedRows.filter((row): row is Extract<AnimationLayerPanelSelectionRow, { kind: 'mask' }> => row.kind === 'mask').map((row) => `${row.ownerKind}:${row.id}`)
            session.selectedLayerIds = [...new Set(selectedLayers)]
            session.selectedGroupIds = [...new Set(selectedGroups)]
            session.selectedGroupId = session.selectedGroupIds.length === 1 && session.selectedLayerIds.length === 0 ? session.selectedGroupIds[0] : null
            session.layerSelectionExplicit = session.selectedLayerIds.length > 0 || session.selectedGroupIds.length > 0
            session.activeLayerMaskId = null
            session.layerMaskIsolatedView = false
            exitLayerMaskEditing(session)
            if (ownerKind === 'layer') session.document.activeLayerId = ownerId
            session.layerSelectionAnchorId = ownerId
            setTimelineActiveContext(session, { kind: 'mask', ownerKind, ownerId }, timeline.activeFrameId, null)
            return
          }
          const preserveLayerSelection = selectionMode === 'toggle' && (session.selectedLayerIds.length > 0 || session.selectedGroupIds.length > 0 || session.selectedGroupId !== null)
          session.selectedAnimationFrameIds = []
          session.animationFrameSelectionAnchorId = null
          session.selectedAnimationCellKeys = []
          session.animationCellSelectionAnchorKey = null
          session.animationCellSelectionExplicit = false
          session.selectedAnimationMaskCellKeys = []
          session.animationMaskCellSelectionAnchorKey = null
          if (selectionMode === 'toggle') {
            const current = new Set(session.selectedAnimationMaskRowKeys)
            if (current.has(maskRowKey)) current.delete(maskRowKey)
            else current.add(maskRowKey)
            session.selectedAnimationMaskRowKeys = [...current]
            if (!preserveLayerSelection) {
              session.selectedLayerIds = []
              session.selectedGroupIds = []
              session.selectedGroupId = null
            }
            session.layerSelectionExplicit = preserveLayerSelection
          } else {
            session.selectedAnimationMaskRowKeys = [maskRowKey]
            session.selectedLayerIds = []
            session.selectedGroupIds = []
            session.selectedGroupId = null
            session.layerSelectionExplicit = false
          }
          session.activeLayerMaskId = null
          session.layerMaskIsolatedView = false
          exitLayerMaskEditing(session)
          if (ownerKind === 'layer') session.document.activeLayerId = ownerId
          session.layerSelectionAnchorId = ownerId
          setTimelineActiveContext(session, { kind: 'mask', ownerKind, ownerId }, timeline.activeFrameId, null)
        },
        false,
        true
      )
    },
    selectAnimationCelContent(key, additive = false) {
      get().commitFloatingPaste()
      const current = activeSession(get())
      const target = parseAnimationCelKey(key)
      if (!current || !target) return
      const timeline = ensureAnimationDocument(current.document)
      if (!timeline.frames.some((frame) => frame.id === target.frameId) || !current.document.layers.some((layer) => layer.id === target.layerId)) return
      const before = cloneSelectionMask(current.selection)
      const cel = resolveAnimationCel(timeline, timeline.cels.find((candidate) => candidate.layerId === target.layerId && candidate.frameId === target.frameId) ?? null)
      const incoming = animationCelContentSelection(cel, current.document.palette, current.document.width, current.document.height)
      const after = combineSelection(before, incoming, additive ? 'add' : 'replace')
      get().selectAnimationCell(key)
      get().mutateActive((session) => {
        session.selection = cloneSelectionMask(before)
      }, false)
      get().commitSelectionChange(before, after, tr('canvas.history.createSelection'))
    },
    clearAnimationSelection(preserveActiveContext = false) {
      get().mutateActive(
        (session) => {
          if (preserveActiveContext) {
            session.selectedAnimationFrameIds = []
            session.animationFrameSelectionAnchorId = null
            session.selectedAnimationCellKeys = []
            session.animationCellSelectionAnchorKey = null
            session.animationCellSelectionExplicit = false
            session.selectedAnimationMaskCellKeys = []
            session.animationMaskCellSelectionAnchorKey = null
            session.selectedAnimationMaskRowKeys = []
            session.selectedGroupId = null
            session.selectedGroupIds = []
            session.layerSelectionExplicit = false
            session.selectedLayerIds = session.timelineActiveContext.row?.kind === 'layer' ? [session.timelineActiveContext.row.ownerId] : []
            return
          }
          clearAnimationItemSelection(session)
          session.activeLayerMaskId = null
          session.layerMaskIsolatedView = false
        },
        false,
        true
      )
    }
  }
}
