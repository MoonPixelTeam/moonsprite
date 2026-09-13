import type { useTimelineContextActions } from './useTimelineContextActions'
import type { deriveLayerPanelVisuals } from './deriveLayerPanelVisuals'
import { useAnimationGestures } from './useAnimationGestures'
import { pixelSource } from '@/components/pixel-source'
import { openTextToolDialog } from '@/components/text-tool-events'
import { resolveAnimationMask } from '@/core/document-model'
import { animationCelKey } from '@/core/animation'
import { type DocumentSession } from '@/store/workspace'
import { shouldRenderTimelineCelSelectionMarker } from '@/core/animation-timeline-visual-state'
import { timelineVisualClasses } from '@/core/animation-timeline-visual-classes'
import { timelineCellSlotKey, timelineRowKey } from '@/core/animation-timeline-identity'
import { cachedCelHasContent, AnimationCelContent, ActiveLayerMaskThumbnail } from './layer-timeline-thumbnails'
interface Props {
  readonly displayRows: ReturnType<typeof deriveLayerPanelVisuals>['displayRows']
  readonly timeline: import('@shared/types-animation').AnimationTimeline
  readonly visualRowStateByKey: ReturnType<typeof deriveLayerPanelVisuals>['visualRowStateByKey']
  readonly visualFrameStateById: ReturnType<typeof deriveLayerPanelVisuals>['visualFrameStateById']
  readonly timelineVisualState: ReturnType<typeof deriveLayerPanelVisuals>['timelineVisualState']
  readonly cellSelectionActive: ReturnType<typeof deriveLayerPanelVisuals>['cellSelectionActive']
  readonly selectedCellFrameIds: ReturnType<typeof deriveLayerPanelVisuals>['selectedCellFrameIds']
  readonly celLookup: import('@/core/animation').AnimationCelLookup
  readonly maskVisualByOwnerFrame: ReturnType<typeof deriveLayerPanelVisuals>['maskVisualByOwnerFrame']
  readonly maskOwnerFrameKey: ReturnType<typeof deriveLayerPanelVisuals>['maskOwnerFrameKey']
  readonly visualCellStateBySlot: ReturnType<typeof deriveLayerPanelVisuals>['visualCellStateBySlot']
  readonly showLinkedCelVisuals: boolean
  readonly linkedCelMemberKeys: ReturnType<typeof deriveLayerPanelVisuals>['linkedCelMemberKeys']
  readonly linkedCelBridgeEndKeys: ReturnType<typeof deriveLayerPanelVisuals>['linkedCelBridgeEndKeys']
  readonly linkedMaskSlotVisuals: ReturnType<typeof deriveLayerPanelVisuals>['linkedMaskSlotVisuals']
  readonly session: DocumentSession
  readonly visualSelectedFrameIdSet: ReturnType<typeof deriveLayerPanelVisuals>['visualSelectedFrameIdSet']
  readonly frameSelectionActiveForOutline: ReturnType<typeof deriveLayerPanelVisuals>['frameSelectionActiveForOutline']
  readonly animationCelDragActive: ReturnType<typeof deriveLayerPanelVisuals>['animationCelDragActive']
  readonly focusState: ReturnType<typeof deriveLayerPanelVisuals>['focusState']
  readonly visualSelectedMaskCellKeySet: ReturnType<typeof deriveLayerPanelVisuals>['visualSelectedMaskCellKeySet']
  readonly showCelThumbnails: boolean
  readonly celThumbnailSize: number
  readonly t: (key: import('../../locales/contracts').TranslationKey, params?: import('../../locales/contracts').TranslationParams) => string
  readonly maskVisualSelectionActive: ReturnType<typeof deriveLayerPanelVisuals>['maskVisualSelectionActive']
  readonly playbackActiveLayerId: ReturnType<typeof deriveLayerPanelVisuals>['playbackActiveLayerId']
  readonly renderedFrameIds: ReturnType<typeof deriveLayerPanelVisuals>['renderedFrameIds']
  readonly selectedCellTargets: ReturnType<typeof deriveLayerPanelVisuals>['selectedCellTargets']
  readonly selectedMaskActivityLayerIds: ReturnType<typeof deriveLayerPanelVisuals>['selectedMaskActivityLayerIds']
  readonly selectedActivityFrameIds: ReturnType<typeof deriveLayerPanelVisuals>['selectedActivityFrameIds']
  readonly selectedMaskCellFrameIds: ReturnType<typeof deriveLayerPanelVisuals>['selectedMaskCellFrameIds']
  readonly showActiveFrameColumn: ReturnType<typeof deriveLayerPanelVisuals>['showActiveFrameColumn']
  readonly altCopyReady: boolean
  readonly draggingAnimationCellKind: ReturnType<typeof useAnimationGestures>['draggingAnimationCellKind']
  readonly draggingAnimationCellKeys: ReturnType<typeof useAnimationGestures>['draggingAnimationCellKeys']
  readonly animationCelDropTargetKey: ReturnType<typeof useAnimationGestures>['animationCelDropTargetKey']
  readonly beginAnimationMaskDrag: ReturnType<typeof useAnimationGestures>['beginAnimationMaskDrag']
  readonly updateAnimationItemCursor: ReturnType<typeof useAnimationGestures>['updateAnimationItemCursor']
  readonly animationGestures: Pick<ReturnType<typeof useAnimationGestures>, 'clickSuppressed' | 'hitsSelectionOutline'>
  readonly store: Pick<import('@/store/workspace').WorkspaceState, 'selectAnimationMaskCell' | 'selectAnimationCell'>
  readonly openCelMenu: ReturnType<typeof useTimelineContextActions>['openCelMenu']
  readonly selectedAnimationGroupCellKeySet: Set<string>
  readonly beginAnimationGroupCelDrag: ReturnType<typeof useAnimationGestures>['beginAnimationGroupCelDrag']
  readonly selectedCellLayerIds: ReturnType<typeof deriveLayerPanelVisuals>['selectedCellLayerIds']
  readonly renderedCellKeySet: ReturnType<typeof deriveLayerPanelVisuals>['renderedCellKeySet']
  readonly visualActiveLayerId: ReturnType<typeof deriveLayerPanelVisuals>['visualActiveLayerId']
  readonly ordinaryCelSelectionVisible: ReturnType<typeof deriveLayerPanelVisuals>['ordinaryCelSelectionVisible']
  readonly groupVisualSelectionActive: ReturnType<typeof deriveLayerPanelVisuals>['groupVisualSelectionActive']
  readonly selectionOutlineVisible: boolean
  readonly suppressCellSelectionGuides: ReturnType<typeof deriveLayerPanelVisuals>['suppressCellSelectionGuides']
  readonly renderedCellKeys: ReturnType<typeof deriveLayerPanelVisuals>['renderedCellKeys']
  readonly hasNonRowAnimationItemSelection: ReturnType<typeof deriveLayerPanelVisuals>['hasNonRowAnimationItemSelection']
  readonly onlyImplicitLayerCellSelection: ReturnType<typeof deriveLayerPanelVisuals>['onlyImplicitLayerCellSelection']
  readonly explicitMultiLayerSelection: ReturnType<typeof deriveLayerPanelVisuals>['explicitMultiLayerSelection']
  readonly showLinkedVisuals: boolean
  readonly draggingAnimationFrameIds: ReturnType<typeof useAnimationGestures>['draggingAnimationFrameIds']
  readonly animationCelDragAnchorKey: ReturnType<typeof useAnimationGestures>['animationCelDragAnchorKey']
  readonly beginAnimationCelDrag: ReturnType<typeof useAnimationGestures>['beginAnimationCelDrag']
  readonly openCelProperties: ReturnType<typeof useTimelineContextActions>['openCelProperties']
}
export function LayerTimelineCells({
  displayRows,
  timeline,
  visualRowStateByKey,
  visualFrameStateById,
  timelineVisualState,
  cellSelectionActive,
  selectedCellFrameIds,
  celLookup,
  maskVisualByOwnerFrame,
  maskOwnerFrameKey,
  visualCellStateBySlot,
  showLinkedCelVisuals,
  linkedCelMemberKeys,
  linkedCelBridgeEndKeys,
  linkedMaskSlotVisuals,
  session,
  visualSelectedFrameIdSet,
  frameSelectionActiveForOutline,
  animationCelDragActive,
  focusState,
  visualSelectedMaskCellKeySet,
  showCelThumbnails,
  celThumbnailSize,
  t,
  maskVisualSelectionActive,
  playbackActiveLayerId,
  renderedFrameIds,
  selectedCellTargets,
  selectedMaskActivityLayerIds,
  selectedActivityFrameIds,
  selectedMaskCellFrameIds,
  showActiveFrameColumn,
  altCopyReady,
  draggingAnimationCellKind,
  draggingAnimationCellKeys,
  animationCelDropTargetKey,
  beginAnimationMaskDrag,
  updateAnimationItemCursor,
  animationGestures,
  store,
  openCelMenu,
  selectedAnimationGroupCellKeySet,
  beginAnimationGroupCelDrag,
  selectedCellLayerIds,
  renderedCellKeySet,
  visualActiveLayerId,
  ordinaryCelSelectionVisible,
  groupVisualSelectionActive,
  selectionOutlineVisible,
  suppressCellSelectionGuides,
  renderedCellKeys,
  hasNonRowAnimationItemSelection,
  onlyImplicitLayerCellSelection,
  explicitMultiLayerSelection,
  showLinkedVisuals,
  draggingAnimationFrameIds,
  animationCelDragAnchorKey,
  beginAnimationCelDrag,
  openCelProperties
}: Props) {
  return (
    <>
      {' '}
      {displayRows.flatMap((displayRow) =>
        timeline.frames.map((frame, index) => {
          const visualRow = visualRowStateByKey.get(
            displayRow.kind === 'mask'
              ? timelineRowKey({ kind: 'mask', ownerKind: displayRow.ownerKind, ownerId: displayRow.owner.id })
              : displayRow.node.kind === 'group'
                ? timelineRowKey({ kind: 'group', ownerKind: 'group', ownerId: displayRow.node.id })
                : timelineRowKey({ kind: 'layer', ownerKind: 'layer', ownerId: displayRow.node.layer.id })
          )
          const visualFrame = visualFrameStateById.get(frame.id)
          const active = visualFrame?.active === true
          const frameVisuallySelected = Boolean(timelineVisualState.selectionGuidesVisible && visualFrame?.selected)
          if (displayRow.kind === 'mask') {
            const mask = maskVisualByOwnerFrame.get(maskOwnerFrameKey(displayRow.ownerKind, displayRow.owner.id, frame.id)) ?? null
            const resolvedMask = resolveAnimationMask(timeline, mask)
            const key = animationCelKey(displayRow.owner.id, frame.id)
            const maskVisualCell = visualCellStateBySlot.get(
              timelineCellSlotKey({ kind: 'mask', ownerKind: displayRow.ownerKind, ownerId: displayRow.owner.id, frameId: frame.id })
            )
            const linkedMaskMember = showLinkedCelVisuals && linkedCelMemberKeys.has(`mask|${key}`)
            const linkedMaskBridgeEnd = showLinkedCelVisuals && linkedCelBridgeEndKeys.has(`mask|${key}`)
            const linkedMaskSlot = linkedMaskSlotVisuals.get(
              timelineCellSlotKey({ kind: 'mask', ownerKind: displayRow.ownerKind, ownerId: displayRow.owner.id, frameId: frame.id })
            )
            const linkedMaskWithPrevious = linkedMaskSlot?.withPrevious === true
            const linkedMaskWithNext = linkedMaskSlot?.withNext === true
            const linkedMaskEnd = linkedMaskWithPrevious && !linkedMaskWithNext && !linkedMaskBridgeEnd
            const maskCellClasses = timelineVisualClasses(maskVisualCell, visualFrame, timelineVisualState.selectionGuidesVisible)
            // Disabling a frame only affects playback. While playback is running,
            // a disabled frame must not inherit the playhead/selection background;
            // while paused it remains a normal selectable current frame.
            const frameVisualEnabled = !session.animationPlaying || frame.disabled !== true
            // Mask cells use the same timeline activity rules as ordinary cells.
            // Only their selection source is separate, because mask pixels are a
            // different editable surface from the owner layer's cel.
            const maskFrameSelected = timelineVisualState.selectionGuidesVisible && visualSelectedFrameIdSet.has(frame.id)
            const maskRowSelected =
              !frameSelectionActiveForOutline &&
              timelineVisualState.selectionGuidesVisible &&
              session.selectedAnimationMaskRowKeys.includes(`${displayRow.ownerKind}:${displayRow.owner.id}`)
            // Frame selection is column-wide, including the independent mask
            // surface. Keep its slot marker in sync with the selected frame.
            // A frame selection can remain as the formal focus while the mask is
            // the active editing surface. Playback must keep that mask activity;
            // frameFocus only suppresses it when there is no mask context.
            const maskActive = frameVisualEnabled && !animationCelDragActive && !focusState.frameFocus && maskCellClasses.current
            const maskSlotSelected = maskRowSelected || maskFrameSelected || maskActive || maskCellClasses.selected || visualSelectedMaskCellKeySet.has(key)
            const maskVisuallySelected = maskCellClasses.selected || maskActive || visualSelectedMaskCellKeySet.has(key)
            const maskThumbnail =
              resolvedMask && showCelThumbnails ? (
                <ActiveLayerMaskThumbnail
                  documentId={session.document.id}
                  ownerId={displayRow.owner.id}
                  frameId={frame.id}
                  maskSource={pixelSource(resolvedMask)}
                  revision={session.contentRevision}
                  documentWidth={session.document.width}
                  documentHeight={session.document.height}
                  thumbnailSize={celThumbnailSize}
                />
              ) : null
            const maskName = t(displayRow.ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask')
            const maskFrameVisualSelection = frameVisuallySelected || maskCellClasses.frameSelected || maskFrameSelected
            // Ordinary timeline focus is shared by all attached mask rows. Mask
            // editing remains independent; only ordinary-layer/cel/frame focus
            // should project the current or selected frames onto every mask row.
            const ordinaryTimelineContextActive = !maskVisualSelectionActive && session.activeLayerMaskId === null
            const maskOwnerIsActiveLayer =
              ordinaryTimelineContextActive &&
              ((displayRow.ownerKind === 'layer' && displayRow.owner.id === playbackActiveLayerId) ||
                (focusState.implicitCursor && displayRow.ownerKind === 'layer' && displayRow.owner.id === session.document.activeLayerId) ||
                (session.layerSelectionExplicit === true && displayRow.ownerKind === 'layer' && session.selectedLayerIds.includes(displayRow.owner.id)))
            const ordinaryFrameActivityHighlighted =
              ordinaryTimelineContextActive &&
              (maskCellClasses.frameActive || selectedCellFrameIds.has(frame.id) || (renderedFrameIds.length > 0 && visualSelectedFrameIdSet.has(frame.id)))
            const selectedMaskActivityHighlighted =
              selectedCellTargets.length > 0 &&
              displayRow.ownerKind === 'layer' &&
              selectedMaskActivityLayerIds.has(displayRow.owner.id) &&
              selectedActivityFrameIds.has(frame.id)
            const maskFrameActivityVisible =
              session.animationPlaying ||
              maskVisualSelectionActive ||
              maskOwnerIsActiveLayer ||
              ordinaryFrameActivityHighlighted ||
              selectedMaskActivityHighlighted
            const maskActiveFrameHighlighted =
              maskFrameActivityVisible &&
              frameVisualEnabled &&
              ((session.animationPlaying && maskCellClasses.frameActive) ||
                (maskVisualSelectionActive && (maskCellClasses.frameActive || maskCellClasses.selected)) ||
                (maskOwnerIsActiveLayer && maskCellClasses.frameActive) ||
                (focusState.implicitCursor && maskOwnerIsActiveLayer && maskCellClasses.frameActive) ||
                ordinaryFrameActivityHighlighted ||
                selectedMaskActivityHighlighted ||
                maskCellClasses.selectedByFrame ||
                maskFrameSelected ||
                (cellSelectionActive && selectedMaskCellFrameIds.has(frame.id)))
            // The active/selected frame column is an ordinary-layer guide. Paint
            // over that guide on an unfocused mask row so it cannot look active
            // merely because its owner layer is active or being played.
            const maskFrameActivitySuppressed =
              !maskVisualSelectionActive &&
              !maskRowSelected &&
              !maskFrameSelected &&
              !maskActive &&
              !maskVisuallySelected &&
              !maskActiveFrameHighlighted &&
              (showActiveFrameColumn || maskFrameVisualSelection)
            return (
              <button
                type="button"
                key={`mask-${displayRow.owner.id}-${frame.id}`}
                data-animation-mask-cel-key={key}
                data-frame-index={index}
                className={`layer-animation-cel layer-mask-cel ${mask ? 'has-mask' : ''} ${mask && altCopyReady ? 'mask-edit-ready' : ''} ${maskRowSelected ? 'mask-row-selected selected-layer' : ''} ${maskActiveFrameHighlighted ? 'active-frame' : ''} ${maskFrameVisualSelection ? 'selected-animation-frame' : ''} ${maskFrameActivitySuppressed ? 'mask-frame-activity-suppressed' : ''} ${maskActive ? 'active-mask' : ''} ${maskVisuallySelected ? 'selected-cel' : ''} ${linkedMaskMember ? 'linked-cel-member' : ''} ${showLinkedCelVisuals && (linkedMaskWithPrevious || linkedMaskWithNext) ? 'linked-cel' : ''} ${showLinkedCelVisuals && linkedMaskWithPrevious ? 'linked-cel-previous' : ''} ${showLinkedCelVisuals && linkedMaskWithNext ? 'linked-cel-next' : ''} ${linkedMaskEnd ? 'linked-cel-end' : ''} ${linkedMaskBridgeEnd ? 'linked-cel-bridge-end' : ''} ${draggingAnimationCellKind === 'mask' && draggingAnimationCellKeys.includes(key) ? 'dragging' : ''} ${animationCelDropTargetKey === key && !animationCelDragActive ? 'drop-target' : ''}`}
                aria-label={`${maskName} · ${t('timeline.frameNumber', { number: index + 1 })}`}
                title={`${displayRow.owner.name} · ${maskName} · ${t('timeline.frameNumber', { number: index + 1 })}`}
                onPointerDown={(event) => beginAnimationMaskDrag(event, displayRow.owner.id, frame.id)}
                onPointerMove={(event) => updateAnimationItemCursor(event, frame.id, key)}
                onPointerLeave={(event) => {
                  event.currentTarget.style.cursor = ''
                  event.currentTarget.classList.remove('mask-selection-move')
                }}
                onClick={(event) => {
                  if (animationGestures.clickSuppressed()) {
                    event.preventDefault()
                    event.stopPropagation()
                    return
                  }
                  if (event.detail === 0) store.selectAnimationMaskCell(key, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace')
                }}
                onContextMenu={(event) => openCelMenu(event, displayRow.owner.id, frame.id, 'mask')}
              >
                {mask ? (
                  <span className={`cel-mask-marker ${maskSlotSelected ? 'mask-slot-marker-selected' : ''}`} data-layer-mask-id={mask.id} aria-hidden="true">
                    {maskThumbnail}
                  </span>
                ) : null}
              </button>
            )
          }
          const node = displayRow.node
          const visualCell =
            node.kind === 'layer'
              ? visualCellStateBySlot.get(timelineCellSlotKey({ kind: 'cel', ownerKind: 'layer', ownerId: node.layer.id, frameId: frame.id }))
              : undefined
          if (node.kind === 'group') {
            const groupCellKey = animationCelKey(node.group.id, frame.id)
            const groupCellSelected = selectedAnimationGroupCellKeySet.has(groupCellKey)
            const groupRowClasses = timelineVisualClasses(visualRow, visualFrame, timelineVisualState.selectionGuidesVisible)
            return (
              <button
                type="button"
                key={`${node.id}-${frame.id}`}
                data-frame-index={index}
                data-animation-group-cel-key={groupCellKey}
                className={`layer-animation-cel group ${groupRowClasses.active || groupRowClasses.frameActive ? 'active-frame' : ''} ${frameVisuallySelected ? 'selected-animation-frame' : ''} ${groupRowClasses.selected ? 'selected-layer' : ''} ${animationCelDropTargetKey === groupCellKey ? 'drop-target' : ''}`}
                title={t('timeline.frameNumber', { number: index + 1 })}
                onPointerDown={(event) => beginAnimationGroupCelDrag(event, node.group.id, frame.id)}
                onPointerMove={(event) => {
                  if (groupCellSelected && animationGestures.hitsSelectionOutline(event, '[data-animation-cel-selection]'))
                    event.currentTarget.style.cursor = 'var(--cursor-move)'
                }}
                onPointerLeave={(event) => {
                  event.currentTarget.style.cursor = ''
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
              />
            )
          }
          const selected = Boolean(visualRow?.selected && timelineVisualState.selectionGuidesVisible)
          const cellClasses = timelineVisualClasses(visualCell, visualFrame, timelineVisualState.selectionGuidesVisible)
          // The current-content marker belongs only to the actual active layer.
          // `visualRow.selected` can retain a former row-selection context after
          // a canvas marquee or frame switch, especially when mask rows are
          // inserted between ordinary rows. The column background still carries
          // frame selection for every row; this marker must not leak to siblings.
          const selectedCellActivityHighlighted =
            selectedCellTargets.length > 0 && selectedCellLayerIds.has(node.layer.id) && selectedCellFrameIds.has(frame.id)
          const currentFrameCellHighlighted =
            Boolean(cellClasses.frameActive || cellClasses.selectedByFrame || selectedCellActivityHighlighted) &&
            (node.layer.id === playbackActiveLayerId || selectedCellActivityHighlighted)
          const cel = celLookup.at(node.layer.id, frame.id)
          const resolvedCel = celLookup.resolve(cel)
          const key = animationCelKey(node.layer.id, frame.id)
          // Raster surfaces are mutated in place by drawing.  The active layer's
          // cell and explicitly selected cells therefore need the live revision
          // even when selection guides are hidden after an edit. Multi-cell paste
          // can replace thumbnails on inactive layers while keeping those targets
          // selected, and a fixed revision would leave their old canvas cached.
          const contentRevision = renderedCellKeySet.has(key) || (active && (selected || node.layer.id === visualActiveLayerId)) ? session.contentRevision : 0
          const hasContent = cachedCelHasContent(resolvedCel, session.document.palette, contentRevision)
          const resolvedId = resolvedCel?.id ?? null
          const previousCel = index > 0 ? celLookup.at(node.layer.id, timeline.frames[index - 1].id) : null
          const nextCel = index + 1 < timeline.frames.length ? celLookup.at(node.layer.id, timeline.frames[index + 1].id) : null
          const previousResolvedId = celLookup.resolve(previousCel)?.id ?? null
          const nextResolvedId = celLookup.resolve(nextCel)?.id ?? null
          const linkedWithPrevious = Boolean(resolvedId && previousResolvedId === resolvedId && (cel?.linkedCelId || previousCel?.linkedCelId))
          const linkedWithNext = Boolean(resolvedId && nextResolvedId === resolvedId && (cel?.linkedCelId || nextCel?.linkedCelId))
          const linkedCelMember = showLinkedCelVisuals && linkedCelMemberKeys.has(`cel|${key}`)
          const linkedCelBridgeEnd = showLinkedCelVisuals && linkedCelBridgeEndKeys.has(`cel|${key}`)
          const linkedCelEnd = showLinkedCelVisuals && linkedWithPrevious && !linkedWithNext && !linkedCelBridgeEnd
          // The pure visual index may omit empty cel slots; transient/formal key
          // selection still needs to paint those grid cells as selected.
          const keySelected = ordinaryCelSelectionVisible && renderedCellKeySet.has(key)
          // Selection styling is structural and may target an empty cel slot;
          // content presence only controls whether an interior marker is painted.
          const cellSelected = keySelected || cellClasses.selected
          // Frame selection is represented by the column background/outline. Do
          // not promote every cel in that column to a solid selected-cel marker.
          // Linked-group emphasis remains owner-aware and independent.
          const frameSelectedForCell = frameVisuallySelected
          const frameColumnMarkerSelected = focusState.frameFocus && frameSelectedForCell
          const cellVisuallySelected = Boolean(
            cellSelected || (!groupVisualSelectionActive && hasContent && (frameColumnMarkerSelected || visualCell?.link.selectedByFrameVisible))
          )
          // A mask cell is a separate visual/editing surface. Once mask focus is
          // active, the owner row must keep only its ambient frame background and
          // must not render a second current-cel content marker.
          const defaultActiveCell = Boolean(!focusState.frameFocus && !maskVisualSelectionActive && hasContent && cellClasses.current)
          // Drawing hides the selection guides but keeps the active frame/cel
          // context. Once guides are hidden, frame focus must no longer suppress
          // the current cel marker; otherwise the marker disappears while the
          // active frame background remains visible.
          const frameFocusVisualSuppressed = focusState.frameFocus && selectionOutlineVisible
          const currentCell = Boolean(
            !animationCelDragActive &&
              !frameFocusVisualSuppressed &&
              !maskVisualSelectionActive &&
              hasContent &&
              (defaultActiveCell ||
                (!suppressCellSelectionGuides &&
                  currentFrameCellHighlighted &&
                  (!selectionOutlineVisible || renderedCellKeys.length === 0 || cellVisuallySelected)))
          )
          // Explicit layer selection highlights every cel in those layers;
          // frame/cel selection modes remain mutually exclusive.
          const layerSelectionModeActive = !hasNonRowAnimationItemSelection || onlyImplicitLayerCellSelection || explicitMultiLayerSelection
          // The active layer is only the interaction context on project startup;
          // show the full-row selection after the user explicitly selects a layer.
          const layerSelectedAcrossTimeline = Boolean(
            (timelineVisualState.selectionGuidesVisible || explicitMultiLayerSelection) &&
              session.layerSelectionExplicit &&
              layerSelectionModeActive &&
              visualCell?.selectedByLayer
          )
          // A selection marker is an interior cel indicator, not the selection
          // highlight itself. Empty/transparent slots must keep their grid or
          // selection-box state without looking like visible cels.
          const selectionMarkerVisible = shouldRenderTimelineCelSelectionMarker(
            hasContent,
            Boolean(keySelected || currentCell || layerSelectedAcrossTimeline || cellVisuallySelected)
          )
          const liveActiveCell = Boolean(!animationCelDragActive && active && node.layer.id === playbackActiveLayerId && resolvedCel)
          const normalCelMarker =
            resolvedCel && (hasContent || liveActiveCell) ? (
              <AnimationCelContent
                active={liveActiveCell}
                documentId={session.document.id}
                layerId={node.layer.id}
                celSource={pixelSource(resolvedCel)}
                palette={session.document.palette}
                revision={contentRevision}
                documentWidth={session.document.width}
                documentHeight={session.document.height}
                thumbnailSize={celThumbnailSize}
                showThumbnail={showCelThumbnails}
                selectionMarker={selectionMarkerVisible}
              />
            ) : selectionMarkerVisible ? (
              <span className="cel-content-marker selection-marker" aria-hidden="true" />
            ) : null
          return (
            <button
              type="button"
              data-animation-cel-key={key}
              data-frame-index={index}
              key={`${node.id}-${frame.id}`}
              className={`layer-animation-cel ${node.layer.kind === 'text' ? 'text-cel' : ''} ${node.layer.kind === 'tilemap' ? 'tilemap-cel' : ''} ${node.layer.kind === 'free-tile' ? 'free-tile-cel' : ''} ${cel ? 'has-cel' : ''} ${node.layer.id === visualActiveLayerId ? 'active-layer-cel' : ''} ${currentFrameCellHighlighted ? 'active-frame' : ''} ${frameSelectedForCell ? 'selected-animation-frame' : ''} ${layerSelectedAcrossTimeline ? 'selected-layer' : ''} ${currentCell ? 'current-cel' : ''} ${cellVisuallySelected ? 'selected-cel' : ''} ${linkedCelMember ? 'linked-cel-member' : ''} ${showLinkedCelVisuals && (linkedWithPrevious || linkedWithNext) ? 'linked-cel' : ''} ${showLinkedVisuals && linkedWithPrevious ? 'linked-cel-previous' : ''} ${linkedCelEnd ? 'linked-cel-end' : ''} ${linkedCelBridgeEnd ? 'linked-cel-bridge-end' : ''} ${draggingAnimationFrameIds.includes(frame.id) || (draggingAnimationCellKind === 'cel' && draggingAnimationCellKeys.includes(key)) ? 'dragging' : ''} ${animationCelDropTargetKey === key && !animationCelDragActive && !(animationCelDragAnchorKey && draggingAnimationCellKeys.length > 1) ? 'drop-target' : ''}`}
              aria-label={t('timeline.celAtFrame', { number: index + 1 })}
              title={`${node.layer.name} · ${t('timeline.frameNumber', { number: index + 1 })}`}
              onPointerDown={(event) => beginAnimationCelDrag(event, node.layer.id, frame.id)}
              onPointerMove={(event) => updateAnimationItemCursor(event, frame.id, key)}
              onPointerLeave={(event) => {
                event.currentTarget.style.cursor = ''
              }}
              onClick={(event) => {
                if (animationGestures.clickSuppressed()) {
                  event.preventDefault()
                  event.stopPropagation()
                  return
                }
                if (event.detail === 0) store.selectAnimationCell(key, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace')
              }}
              onDoubleClick={() => {
                if (node.layer.kind === 'text') {
                  const source = celLookup.resolve(cel)
                  openTextToolDialog({
                    documentId: session.document.id,
                    layerId: node.layer.id,
                    frameId: frame.id,
                    x: source?.surface?.offsetX ?? 0,
                    y: source?.surface?.offsetY ?? 0
                  })
                } else openCelProperties(node.layer.id, frame.id)
              }}
              onContextMenu={(event) => openCelMenu(event, node.layer.id, frame.id)}
            >
              {normalCelMarker}
            </button>
          )
        })
      )}{' '}
    </>
  )
}
