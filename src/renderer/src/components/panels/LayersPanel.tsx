import { TimelineSelectionOutlines } from './TimelineSelectionOutlines'
import { LayerTimelineColumnResizer } from './LayerTimelineColumnResizer'
import { createLayerPanelTooltips } from './layer-panel-tooltips'
import { useProjectScrollMemory } from '@/components/useProjectScrollMemory'
import { isScrollbarPointer } from '../scrollbar-pointer'
import { animationSlotRange } from '@/core/animation-slot-selection'
import { createLayerMaskRowRenderer } from './LayerMaskRow'
import { LayerTreeRows } from './LayerTreeRows'
import { LayerHeaderProperties } from './LayerHeaderProperties'
import { useLayerPanelLiveControls } from './useLayerPanelLiveControls'
import { LayerTimelineCells } from './LayerTimelineCells'
import { useLayerPanelPreferences } from './useLayerPanelPreferences'
import { useLayerSelectionGuides } from './useLayerSelectionGuides'
import { useLayerControlGestures } from './useLayerControlGestures'
import { useLayerContextActions } from './useLayerContextActions'
import { useTimelineContextActions } from './useTimelineContextActions'
import { useLayerPanelVisuals } from './useLayerPanelVisuals'
import { useLayerPanelShortcuts } from './useLayerPanelShortcuts'
import { useTimelineFileDrop } from './useTimelineFileDrop'
import { useAnimationGestures } from './useAnimationGestures'
import { useLayerRowDrag } from './useLayerRowDrag'
import { LayerSettingsEditor } from './LayerSettingsEditor'
import { layerQuickActionMetadata } from './layer-panel-settings'
import { layerBlendOptions } from './layer-blend-options'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { createAnimationMaskLookup } from '@/core/document-model'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { animationCelKey, createAnimationCelLookup, createDefaultAnimationTimeline, parseAnimationCelKey } from '@/core/animation'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { PlaybackPixelIcon } from '@/components/PlaybackPixelIcon'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { LAYER_QUICK_ACTION_LIMIT } from '@/core/layer-panel-preferences'
import { FreeTileInstanceLayers } from '@/components/panels/FreeTileInstanceLayers'
import { FreeTileInstancePanelSettings } from '@/components/panels/FreeTileInstancePanelSettings'
import { useTimelineThumbnailContentSync, ActiveFrameSync } from './layer-timeline-thumbnails'
import { layoutAnimationLoopSections, timelineWithLoopSectionPreview } from './layer-timeline-layout'
import { useSpaceDragScroll } from '@/components/useSpaceDragScroll'
export function LayersPanel({
  session,
  docked = false,
  sideDocked = false,
  onDockDragStart,
  onPanelContextMenu,
  onFloatingDock
}: { session: DocumentSession; sideDocked?: boolean } & DockDragProps) {
  const { t } = useI18n()
  const { clippingMaskTooltip, layerMaskTooltip, emptyLayerMaskCelTooltip } = createLayerPanelTooltips(t)
  useTimelineThumbnailContentSync(session.document.id)
  const blendOptions = layerBlendOptions(t)
  const store = useWorkspace.getState()
  const { timelineActiveContext, liveAutoLinkById } = useLayerPanelLiveControls(session)
  const layerStyleClipboard = useWorkspace((state) => state.layerStyleClipboard)
  const layerListRef = useRef<HTMLDivElement>(null)
  const spaceDragScroll = useSpaceDragScroll(layerListRef)

  const animationGestures = useAnimationGestures({
    session,
    listRef: layerListRef,
    showAnimationSelectionOutline: () => showAnimationSelectionOutline(),
    showAnimationCellSelectionOutline: () => showAnimationCellSelectionOutline(),
    setSelectionOutlineVisible: (visible) => setSelectionOutlineVisible(visible),
    setAnimationCellSelectionOutlineVisible: (visible) => setAnimationCellSelectionOutlineVisible(visible),
    preserveSelectionAfterEdit: () => {
      preserveSelectionOnNextContentRevisionRef.current = true
    },
    cellRange: (a, b) => cellRange(a, b),
    maskCellRange: (a, b) => maskCellRange(a, b)
  })
  const {
    selectedAnimationGroupCellKeys,
    animationGestureSelection,
    animationGestureActiveTarget,
    draggingAnimationFrameIds,
    draggingAnimationCellKeys,
    draggingAnimationCellKind,
    animationCelDropTargetKey,
    animationCelDragAnchorKey,
    animationFrameDropTarget,
    loopSectionResizePreview,
    beginAnimationLoopSectionResize,
    beginAnimationFrameDrag,
    beginAnimationCelDrag,
    beginAnimationGroupCelDrag,
    beginAnimationMaskDrag,
    toggleAnimationMaskIsolatedView,
    updateAnimationItemCursor
  } = animationGestures

  // Rendering must not normalize sparse imported timelines. In particular,
  // selecting or dragging an empty slot must not create blank AnimationCels.
  const timeline = session.document.animation ?? createDefaultAnimationTimeline()
  const loopSectionLayout = layoutAnimationLoopSections(timelineWithLoopSectionPreview(timeline, loopSectionResizePreview))
  const celLookup = useMemo(() => createAnimationCelLookup(timeline), [timeline, timeline.cels, session.contentRevision, session.layersPanelRevision])
  const activeFrameIndex = Math.max(
    0,
    timeline.frames.findIndex((frame) => frame.id === timeline.activeFrameId)
  )
  const floating = useFloatingPanel(null, false, true, 'moonsprite.layers-panel.v1', true, onFloatingDock, docked)
  const rowDrag = useLayerRowDrag({
    documentId: session.document.id,
    listRef: layerListRef,
    readRows: () => nodes,
    onClickSelectedRow: () => showLayerSelectionOutline()
  })
  const { draggingIds, draggingGroupId, copying: draggingCopy, dropTarget, ghost: dragGhost, cancel: clearTransientLayerDrag } = rowDrag

  const layerAnimationToolbarRef = useRef<HTMLDivElement>(null)
  const animationLoopSectionTrackRef = useRef<HTMLDivElement>(null)
  const layerQuickActionsRef = useRef<HTMLSpanElement>(null)
  const [hiddenTimelineQuickActionCount, setHiddenTimelineQuickActionCount] = useState(0)
  const [altCopyReady, setAltCopyReady] = useState(false)
  const altCopyReadyRef = useRef(false)
  const selectedAnimationGroupCellKeySet = new Set(selectedAnimationGroupCellKeys)
  const suppressMaskRowClickRef = useRef(false)
  const clearSelectionFromBlankRef = useRef<() => void>(() => {})
  const animationItemDragging = draggingAnimationFrameIds.length > 0 || draggingAnimationCellKeys.length > 0
  const {
    layerSettingsEditorRef,
    layerDisplayColorPresets,
    shortcuts,
    shortcutHint,
    layerSettings,
    layerLabelWidth,
    layerDensity,
    freeTileInstancePanelLayout,
    integratedFreeTileInstanceLayer,
    visibleLoopSectionLaneCount,
    availableTilemapTilesets,
    showLinkedCelVisuals,
    showLinkedVisuals,
    showCelThumbnails,
    celThumbnailSize,
    syncAnimationLoopSectionScroll,
    openLayerSettings,
    applyLayerSettings,
    toggleOnionSkin,
    setStoredLayerLabelWidth,
    beginLayerLabelResize
  } = useLayerPanelPreferences({
    session,
    loopSectionLayout,
    animationLoopSectionTrackRef,
    layerListRef,
    layerAnimationToolbarRef,
    floating,
    docked,
    timeline,
    setAnimationMenu: (...args) => setAnimationMenu(...args)
  })
  useProjectScrollMemory(layerListRef, session.document.id, 'layers', !layerSettings.timelineHidden)
  const {
    animationCellSelectionOutlineVisible,
    setAnimationCellSelectionOutlineVisible,
    selectionOutlineVisible,
    setSelectionOutlineVisible,
    suppressSelectionOutlineOnNextSignatureRef,
    preserveSelectionOnNextContentRevisionRef,
    showAnimationCellSelectionOutline,
    showAnimationSelectionOutline,
    showLayerSelectionOutline,
    clearSelectionFromBlank
  } = useLayerSelectionGuides({ session, animationGestureSelection, animationGestures, layerListRef, clearSelectionFromBlankRef, shortcuts })
  const {
    layerById,
    freeTileSetOptions,
    displayColorStripeSegments,
    nodes,
    maskOwnerFrameKey,
    focusState,
    activeMaskOwnerKey,
    maskVisualByOwnerFrame,
    displayRows,
    visualSelectedFrameIdSet,
    effectiveSelectedGroupIds,
    groupVisualSelectionActive,
    hasNonRowAnimationItemSelection,
    gestureActiveFrameId,
    visualActiveFrameId,
    maskVisualSelectionActive,
    visualActiveLayerId,
    playbackActiveLayerId,
    timelineVisualState,
    visualRowStateByKey,
    visualCellStateBySlot,
    visualFrameStateById,
    displayRowGridTemplate,
    displayRowTop,
    displayRowSpanHeight,
    renderedFrameIds,
    renderedCellKeys,
    renderedCellKeySet,
    visualSelectedMaskCellKeySet,
    selectedCellTargets,
    selectedCellFrameIds,
    selectedMaskCellFrameIds,
    selectedActivityFrameIds,
    selectedCellLayerIds,
    selectedMaskActivityLayerIds,
    cellSelectionActive,
    ordinaryCelSelectionVisible,
    onlyImplicitLayerCellSelection,
    explicitMultiLayerSelection,
    suppressCellSelectionGuides,
    layerSelectionActive,
    selectedCellFrameRanges,
    selectedCellLayerRows,
    timelineActiveFrameIndex,
    showActiveFrameColumn,
    selectedFrameRanges,
    selectedCelPositions,
    animationCelDragPreview,
    animationCelDragActive,
    shouldShowAnimationCellSelectionOutline,
    linkedMaskSlotVisuals,
    linkedCelBridgeEndKeys,
    linkedCelBlocks,
    linkedCelConnectors,
    linkedCelMemberKeys,
    selectedLinkedCelMemberKeys,
    animationCelSelectionBoxes,
    frameSelectionActiveForOutline,
    selectedAnimationOutlineRows,
    activeAnimationLayerRow,
    layerSelectionStart,
    layerSelectionSpan
  } = useLayerPanelVisuals({
    inlineMasks: layerSettings.timelineHidden,
    session,
    timeline,
    animationGestureActiveTarget,
    timelineActiveContext,
    animationGestureSelection,
    selectionOutlineVisible,
    selectedAnimationGroupCellKeys,
    gesture: animationGestures.readGesture(),
    animationCelDragAnchorKey,
    animationCelDropTargetKey,
    animationCellSelectionOutlineVisible
  })
  const {
    propertyEditorRef,
    setContextMenu,
    setLayerCreateMenu,
    setBackgroundLayerDialogOpen,
    setTilemapLayerDialog,
    setFreeTileLayerDialogOpen,
    setLayerStyleDialog,
    layerStyleDrag,
    editLayer,
    editGroup,
    editSelectedRows,
    editLayerRow,
    openLayerContent,
    editGroupRow,
    openLayerContextMenu,
    openLayerCreateContextMenu,
    openBackgroundLayerDialog,
    openTilemapLayerDialog,
    openFreeTileLayerDialog,
    layerStyleIndicator,
    layerContextSurfaces
  } = useLayerContextActions({
    session,
    celLookup,
    timeline,
    shortcutHint,
    layerById,
    clippingMaskTooltip,
    layerMaskTooltip,
    emptyLayerMaskCelTooltip,
    layerStyleClipboard,
    availableTilemapTilesets,
    freeTileSetOptions,
    layerDisplayColorPresets
  })
  const {
    setAnimationMenu,
    closeFrameProperties,
    closeCelProperties,
    selectAnimationFrame,
    selectAnimationEdge,
    selectAnimationStep,
    openAnimationMenu,
    openFrameMenu,
    openFramePropertiesFor,
    openLoopSectionCreator,
    openLoopSectionPropertiesFor,
    openLoopSectionMenu,
    openCelProperties,
    openCelMenu,
    updateAnimationFrameDisabled,
    timelineContextSurfaces
  } = useTimelineContextActions({
    timeline,
    activeFrameIndex,
    setContextMenu,
    setLayerCreateMenu,
    session,
    celLookup,
    shortcutHint,
    emptyLayerMaskCelTooltip,
    layerMaskTooltip
  })
  const consumeTimelineContextMenu = (event: React.MouseEvent<HTMLElement>): boolean => {
    if (!animationGestures.consumeContextMenu()) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }
  const openFrameMenuFromTimeline = (...args: Parameters<typeof openFrameMenu>): void => {
    const [event, frameId] = args
    if (consumeTimelineContextMenu(event)) return
    openFrameMenu(event, frameId)
  }
  const openCelMenuFromTimeline = (...args: Parameters<typeof openCelMenu>): void => {
    const [event, layerId, frameId, kind] = args
    if (consumeTimelineContextMenu(event)) return
    openCelMenu(event, layerId, frameId, kind)
  }
  const openLoopSectionMenuFromTimeline = (...args: Parameters<typeof openLoopSectionMenu>): void => {
    const [event, sectionId] = args
    if (consumeTimelineContextMenu(event)) return
    openLoopSectionMenu(event, sectionId)
  }
  const {
    beginLayerPanelToggle,
    continueLayerPanelToggle,
    endLayerPanelToggle,
    finishLayerPanelToggleClick,
    finishLayerPanelToggle,
    continueLayerAutoLinkToggle,
    endLayerAutoLinkToggle,
    finishLayerAutoLinkClick,
    isLayerRowControlTarget,
    handleLayerAutoLinkPointerDown,
    handleLayerAutoLinkKeyDown,
    toggleLayerMaskLocked,
    toggleLayerMaskAutoLink,
    handleLayerMaskControlPointerDown,
    handleLayerMaskControlKeyDown
  } = useLayerControlGestures({ session, displayRows, celLookup, timeline })
  const { runLayerQuickAction } = useLayerPanelShortcuts({
    session,
    openTilemapLayerDialog,
    openFreeTileLayerDialog,
    openBackgroundLayerDialog,
    setTilemapLayerDialog,
    editSelectedRows,
    editGroup,
    editLayer,
    setLayerStyleDialog,
    openLayerSettings,
    updateAnimationFrameDisabled,
    toggleOnionSkin,
    openLoopSectionCreator,
    openFramePropertiesFor,
    openLoopSectionPropertiesFor,
    openCelProperties
  })
  const { gifDropTargetIndex } = useTimelineFileDrop({ session, timeline })

  const cellRange = (anchorKey: string, targetKey: string): string[] =>
    animationSlotRange(nodes.map((node) => node.id), timeline.frames.map((frame) => frame.id), anchorKey, targetKey)
  const maskOwnerIds = new Set([...(timeline.layerMasks ?? []).map((entry) => entry.layerId), ...(timeline.groupMasks ?? []).map((entry) => entry.groupId)])
  const maskCellRange = (anchorKey: string, targetKey: string): string[] =>
    animationSlotRange(buildLayerPanelTree({ layers: session.document.layers, groups: session.document.groups, collapsedGroupIds: [] }).map((node) => node.id).filter((id) => maskOwnerIds.has(id)), timeline.frames.map((frame) => frame.id), anchorKey, targetKey)
  useEffect(() => {
    document.body.classList.toggle('animation-item-dragging', animationItemDragging)
    return () => {
      document.body.classList.remove('animation-item-dragging')
    }
  }, [animationItemDragging])
  useEffect(() => {
    const closeMenus = (): void => {
      setContextMenu(null)
      setLayerCreateMenu(null)
      setAnimationMenu(null)
      animationGestures.clearFrameDropTarget()
    }
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      closeMenus()
      closeFrameProperties()
      closeCelProperties()
    }
    window.addEventListener('pointerdown', closeMenus)
    window.addEventListener('resize', closeMenus)
    window.addEventListener('keydown', keyDown)
    return () => {
      window.removeEventListener('pointerdown', closeMenus)
      window.removeEventListener('resize', closeMenus)
      window.removeEventListener('keydown', keyDown)
    }
  }, [])
  useEffect(() => {
    const syncAltCopy = (active: boolean): void => {
      if (altCopyReadyRef.current === active) return
      altCopyReadyRef.current = active
      setAltCopyReady(active)
    }
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') syncAltCopy(true)
    }
    const keyUp = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') syncAltCopy(false)
    }
    const pointerMove = (event: PointerEvent): void => {
      syncAltCopy(event.altKey)
    }
    const blur = (): void => {
      syncAltCopy(false)
      finishLayerPanelToggle()
      clearTransientLayerDrag()
    }
    altCopyReadyRef.current = false
    setAltCopyReady(false)
    clearTransientLayerDrag()
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('blur', blur)
      finishLayerPanelToggle()
    }
  }, [])
  useEffect(() => {
    const close = (event: Event): void => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target
      if (!target || target === 'layers') {
        propertyEditorRef.current?.close()
        closeFrameProperties()
        closeCelProperties()
        layerSettingsEditorRef.current?.close()
        setAnimationMenu(null)
        setBackgroundLayerDialogOpen(false)
        setTilemapLayerDialog(null)
        setFreeTileLayerDialogOpen(false)
      }
    }
    window.addEventListener('moonsprite:close-dialog', close)
    return () => window.removeEventListener('moonsprite:close-dialog', close)
  })
  const beginLayerDrag = (event: React.PointerEvent<HTMLButtonElement>, layerId: string): void => {
    if (event.button !== 0) return
    if (isLayerRowControlTarget(event)) return
    // Every non-control part of a row is a selection target. Previously only
    // the name span established a selection anchor, so clicking row whitespace
    // (especially before a Shift/Ctrl click) lost the group/layer range anchor.
    const selectOnClick = true
    const wasEditingLayerMask = Boolean(session.activeLayerMaskId)
    if (wasEditingLayerMask && selectOnClick) store.selectLayer(layerId)
    else if (event.ctrlKey) store.selectLayer(layerId, 'toggle')
    else if (event.shiftKey) store.selectLayer(layerId, 'range')
    else if (selectOnClick) {
      animationGestures.clearPreviewSelection()
      if (
        session.selectedAnimationFrameIds.length > 0 ||
        session.selectedAnimationCellKeys.length > 0 ||
        session.selectedAnimationMaskCellKeys.length > 0 ||
        session.selectedAnimationMaskRowKeys.length > 0 ||
        session.selectedGroupId ||
        !session.selectedLayerIds.includes(layerId)
      )
        store.selectLayer(layerId)
    } else {
      animationGestures.clearPreviewSelection()
      suppressSelectionOutlineOnNextSignatureRef.current = true
      setSelectionOutlineVisible(false)
      setAnimationCellSelectionOutlineVisible(false)
      clearSelectionFromBlank()
    }
    rowDrag.begin(event, { kind: 'layer', id: layerId })
  }
  const beginGroupDrag = (event: React.PointerEvent<HTMLButtonElement>, groupId: string): void => {
    if (event.button !== 0) return
    if (isLayerRowControlTarget(event)) return
    // Keep the whole non-control row clickable so group-to-layer Shift ranges
    // work regardless of where inside the row the pointer lands.
    const selectOnClick = true
    const wasEditingLayerMask = Boolean(session.activeLayerMaskId)
    if (wasEditingLayerMask && selectOnClick) store.selectGroup(groupId)
    else if (event.ctrlKey) store.selectGroup(groupId, 'toggle')
    else if (event.shiftKey) store.selectGroup(groupId, 'range')
    else if (
      selectOnClick &&
      (!session.selectedGroupIds.includes(groupId) ||
        session.selectedAnimationFrameIds.length > 0 ||
        session.selectedAnimationCellKeys.length > 0 ||
        session.selectedAnimationMaskCellKeys.length > 0 ||
        session.selectedAnimationMaskRowKeys.length > 0)
    )
      store.selectGroup(groupId)
    else if (!selectOnClick) {
      animationGestures.clearPreviewSelection()
      suppressSelectionOutlineOnNextSignatureRef.current = true
      setSelectionOutlineVisible(false)
      setAnimationCellSelectionOutlineVisible(false)
      clearSelectionFromBlank()
    }
    rowDrag.begin(event, { kind: 'group', id: groupId })
  }
  useEffect(() => {
    const move = (event: PointerEvent): void => {
      rowDrag.pointerMove(event)
      animationGestures.move(event)
    }
    const finish = (event: PointerEvent): void => {
      finishLayerPanelToggle()
      rowDrag.finish(event)
      animationGestures.finish(event.type === 'pointercancel')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      rowDrag.cancel()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    // Layer and group objects are mutated in place, so the document identity is sufficient here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.document.id])
  useEffect(() => {
    const cancel = (): void => animationGestures.finish(true)
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      cancel()
    }
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('blur', cancel)
    }
  }, [session.document.id])
  const openFreeTileInstanceLayers = (layerId: string): void => {
    store.selectLayer(layerId)
    const cel = celLookup.resolve(celLookup.at(layerId, timeline.activeFrameId))
    if (!cel?.freeTiles?.instances.length) {
      store.setMessage(t('freeTiles.noInstancesToOpen'))
      return
    }
    store.clearAnimationSelection()
    store.setFreeTileInstanceLayerView(layerId)
    if (freeTileInstancePanelLayout === 'separate')
      window.dispatchEvent(new CustomEvent('moonsprite:show-workspace-panel', { detail: { id: 'freeTileInstances' } }))
  }
  const dragGhostItems = dragGhost?.items ?? (dragGhost ? [{ id: 'legacy', kind: 'layer' as const, name: dragGhost.name ?? t('layers.fallbackName') }] : [])
  const hiddenDragGhostCount = dragGhost ? Math.max(0, dragGhost.count - Math.min(4, dragGhostItems.length)) : 0
  const animationColumnResizer = <LayerTimelineColumnResizer layerLabelWidth={layerLabelWidth} beginLayerLabelResize={beginLayerLabelResize} setStoredLayerLabelWidth={setStoredLayerLabelWidth} />
  const animationLoopSectionBars = loopSectionLayout.items.map(({ section, startIndex, span, lane, laneSpan }) => {
    const playing = session.animationPlaybackLoopSectionId === section.id && session.animationPlaying
    const endIndex = startIndex + span - 1
    return (
      <button
        type="button"
        key={section.id}
        data-animation-loop-section-id={section.id}
        className={`animation-loop-section ${playing ? 'playing' : ''}`}
        style={{ gridColumn: `${startIndex + 1} / span ${span}`, gridRow: `${lane + 1} / span ${laneSpan}`, zIndex: lane + 1 }}
        aria-label={t('timeline.loopSectionRange', { name: section.name, start: startIndex + 1, end: endIndex + 1 })}
        title={t('timeline.loopSectionSummary', {
          name: section.name,
          start: startIndex + 1,
          end: endIndex + 1,
          direction: t(section.direction === 'ping-pong' ? 'timeline.loopSectionPingPong' : section.direction === 'ping-pong-reverse' ? 'timeline.loopSectionPingPongReverse' : section.direction === 'reverse' ? 'timeline.loopSectionReverse' : 'timeline.loopSectionForward'),
          repeats: section.repeatCount ?? t('timeline.loopSectionInfiniteShort')
        })}
        onClick={(event) => {
          if (animationGestures.clickSuppressed()) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          event.stopPropagation()
          openLoopSectionPropertiesFor(section.id)
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          openLoopSectionPropertiesFor(section.id)
        }}
        onContextMenu={(event) => openLoopSectionMenuFromTimeline(event, section.id)}
      >
        <span
          className="animation-loop-section-edge animation-loop-section-edge-start"
          aria-hidden="true"
          onPointerDown={(event) => beginAnimationLoopSectionResize(event, section.id, 'start')}
        />
        <span className="animation-loop-section-label">{section.name}</span>
        <span
          className="animation-loop-section-edge animation-loop-section-edge-end"
          aria-hidden="true"
          onPointerDown={(event) => beginAnimationLoopSectionResize(event, section.id, 'end')}
        />
      </button>
    )
  })
  const animationLoopSectionHeader =
    visibleLoopSectionLaneCount > 0 ? (
      <div className="animation-loop-section-viewport" onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button, input, select')) event.stopPropagation() }}>
        <div ref={animationLoopSectionTrackRef} className="animation-loop-section-track">
          {animationLoopSectionBars}
        </div>
      </div>
    ) : null
  const animationFrameGridDecorations = (
    <>
      {showActiveFrameColumn && (
        <span
          className="animation-active-cell-column"
          style={{ '--animation-frame-index': timelineActiveFrameIndex, '--animation-frame-span': 1 } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {selectedCellFrameRanges.map((range) => (
        <span
          key={`active-cell-frame-${range.start}-${range.span}`}
          className="animation-active-cell-column"
          style={{ '--animation-frame-index': range.start, '--animation-frame-span': range.span } as CSSProperties}
          aria-hidden="true"
        />
      ))}
      {selectedCellLayerRows.map((row) => (
        <span
          key={`active-cell-layer-${row}`}
          className="animation-active-cell-row"
          style={{ '--animation-row-top': displayRowTop(row), '--animation-row-height': displayRowSpanHeight(row, 1) } as CSSProperties}
          aria-hidden="true"
        />
      ))}
      {selectionOutlineVisible &&
        selectedFrameRanges.map((range) => (
          <span
            key={`${range.start}-${range.span}`}
            data-animation-frame-selection={timeline.frames
              .slice(range.start, range.start + range.span)
              .map((frame) => frame.id)
              .join(' ')}
            className="animation-frame-selection-column"
            style={{ '--animation-frame-index': range.start, '--animation-frame-span': range.span } as CSSProperties}
            aria-hidden="true"
          />
        ))}
      {animationFrameDropTarget && timeline.frames.findIndex((frame) => frame.id === animationFrameDropTarget.frameId) >= 0 && (
        <span
          className="animation-frame-drop-line"
          style={
            {
              '--animation-frame-drop-index':
                timeline.frames.findIndex((frame) => frame.id === animationFrameDropTarget.frameId) + (animationFrameDropTarget.insertAfter ? 1 : 0)
            } as CSSProperties
          }
          aria-hidden="true"
        />
      )}
      {gifDropTargetIndex !== null && (
        <span
          className="animation-frame-drop-line animation-gif-drop-line"
          style={{ '--animation-frame-drop-index': gifDropTargetIndex } as CSSProperties}
          aria-hidden="true"
        />
      )}
    </>
  )
  const animationFrameHeaders = timeline.frames.map((frame, index) => {
    const visualFrame = visualFrameStateById.get(frame.id)
    const frameActive = visualFrame?.active === true || (cellSelectionActive && selectedActivityFrameIds.has(frame.id))
    const frameSelected = Boolean(timelineVisualState.selectionGuidesVisible && visualFrame?.selected)
    return (
      <button
        type="button"
        data-animation-frame-id={frame.id}
        data-frame-index={index}
        key={`header-${frame.id}`}
        className={`layer-animation-frame-header ${frameActive ? 'active' : ''} ${frameSelected ? 'selected-animation-frame' : ''} ${frame.disabled === true ? 'disabled-frame' : ''} ${draggingAnimationFrameIds.includes(frame.id) ? 'dragging' : ''}`}
        aria-label={t('timeline.frameNumber', { number: index + 1 })}
        title={`${t('timeline.frameNumber', { number: index + 1 })} · ${frame.duration} ms`}
        onPointerDown={(event) => beginAnimationFrameDrag(event, frame.id)}
        onPointerMove={(event) => updateAnimationItemCursor(event, frame.id)}
        onPointerLeave={(event) => {
          event.currentTarget.style.cursor = ''
        }}
        onClick={(event) => {
          if (animationGestures.clickSuppressed()) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          if (event.detail === 0) selectAnimationFrame(frame.id, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace')
        }}
        onDoubleClick={() => openFramePropertiesFor(frame.id)}
        onContextMenu={(event) => openFrameMenuFromTimeline(event, frame.id)}
      >
        {frame.disabled === true && (
          <svg className="layer-animation-frame-disabled-mark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" y1="100" x2="100" y2="0" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <strong>{index + 1}</strong>
        {layerDensity !== 'compact' && <small>{frame.duration}</small>}
      </button>
    )
  })
  const hideSideDockActions = sideDocked && layerSettings.sideDockAutoHide && !layerSettings.timelineHidden
  const visibleLayerQuickActions = layerSettings.quickActions.filter((action) => action.enabled).slice(0, LAYER_QUICK_ACTION_LIMIT)
  const syncTimelineQuickActionVisibility = useCallback((): void => {
    const track = animationLoopSectionTrackRef.current
    const actions = layerQuickActionsRef.current
    if (layerSettings.timelineHidden && actions) {
      const boundary = actions.getBoundingClientRect()
      if (boundary.width <= 0) return
      const buttons = Array.from(actions.querySelectorAll<HTMLButtonElement>('.layer-structure-edit-button'))
      const next = buttons.filter(button => button.getBoundingClientRect().left < boundary.left - 0.5).length
      setHiddenTimelineQuickActionCount(current => current === next ? current : next)
      return
    }
    const viewport = track?.parentElement
    if (!track || !actions || !viewport || visibleLoopSectionLaneCount === 0 || hideSideDockActions || layerSettings.timelineHidden) {
      setHiddenTimelineQuickActionCount((current) => current === 0 ? current : 0)
      return
    }
    const trackRect = track.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()
    if (trackRect.width <= 0 || viewportRect.width <= 0) return
    const next = Array.from(actions.querySelectorAll<HTMLButtonElement>('[data-timeline-quick-action]'))
      .filter((button) => trackRect.right > button.getBoundingClientRect().left)
      .length
    setHiddenTimelineQuickActionCount((current) => current === next ? current : next)
  }, [hideSideDockActions, layerSettings.timelineHidden, visibleLoopSectionLaneCount, visibleLayerQuickActions.length, timeline.frames.length])
  const layerQuickActionButtons =
    !hideSideDockActions &&
    visibleLayerQuickActions.map((action, index) => {
      const metadata = layerQuickActionMetadata[action.id]
      const label = t(metadata.label)
      return (
        <button
          type="button"
          className="layer-structure-edit-button"
          data-preserve-animation-selection
          data-timeline-quick-action
          key={action.id}
          title={label}
          aria-label={label}
          style={index < hiddenTimelineQuickActionCount ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
          onClick={() => runLayerQuickAction(action.id)}
        >
          <PixelUtilityIcon kind={metadata.icon} />
        </button>
      )
    })
  useLayoutEffect(() => {
    syncTimelineQuickActionVisibility()
    const track = animationLoopSectionTrackRef.current
    const actions = layerQuickActionsRef.current
    const viewport = layerSettings.timelineHidden ? actions?.parentElement : track?.parentElement
    if (!actions || !viewport || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(syncTimelineQuickActionVisibility)
    if (track) observer.observe(track)
    observer.observe(actions)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [syncTimelineQuickActionVisibility, layerSettings.timelineHidden, docked, Boolean(floating.style)])
  const renderAnimationMaskRow = createLayerMaskRowRenderer({
    timelineVisualState,
    activeMaskOwnerKey,
    celLookup,
    visualActiveFrameId,
    maskVisualByOwnerFrame,
    maskOwnerFrameKey,
    timeline,
    session,
    animationGestureSelection,
    t,
    altCopyReady,
    suppressMaskRowClickRef,
    toggleAnimationMaskIsolatedView,
    store,
    openCelMenu: openCelMenuFromTimeline,
    beginLayerPanelToggle,
    continueLayerPanelToggle,
    endLayerPanelToggle,
    finishLayerPanelToggleClick,
    handleLayerMaskControlPointerDown,
    toggleLayerMaskLocked,
    handleLayerMaskControlKeyDown,
    toggleLayerMaskAutoLink
  })

  return (
    <>
      <section
        ref={floating.ref}
        className={`panel layers-panel layer-density-${layerSettings.timelineHidden ? 'default' : layerDensity} ${layerSettings.timelineHidden ? 'timeline-hidden' : ''} ${visibleLoopSectionLaneCount > 0 ? 'has-animation-loop-sections' : ''} ${loopSectionResizePreview ? 'loop-section-resizing' : ''} ${session.animationPlaying ? 'animation-playing' : ''} ${animationItemDragging ? 'animation-item-dragging' : ''} ${floating.style ? 'floating-panel' : ''} ${draggingCopy ? 'layer-copy-drag' : ''} ${layerStyleDrag ? 'layer-style-copy-drag' : ''}`}
        data-command-scope="layers"
        style={
          {
            ...floating.style,
            '--layer-label-width': `${layerLabelWidth}px`,
            '--layer-frame-count': timeline.frames.length,
            '--animation-loop-section-lanes': visibleLoopSectionLaneCount,
            '--animation-loop-section-track-height': `${visibleLoopSectionLaneCount * 20}px`
          } as CSSProperties
        }
        onPointerDown={floating.bringToFront}
        onContextMenu={(event) => {
          if (consumeTimelineContextMenu(event)) return
          onPanelContextMenu?.(event)
        }}
      >
        <header onPointerDown={(event) => (floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag))}>
          {integratedFreeTileInstanceLayer ? (
            <>
              <span className="free-tile-instance-header" onPointerDown={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  title={t('freeTiles.backToLayers')}
                  aria-label={t('freeTiles.backToLayers')}
                  onClick={() => store.setFreeTileInstanceLayerView(null)}
                >
                  <PixelUtilityIcon kind="left" />
                </button>
                <strong className="layer-panel-title">{t('freeTiles.instanceLayersTitle', { name: integratedFreeTileInstanceLayer.name })}</strong>
              </span>
              <span className="panel-actions" onPointerDown={(event) => event.stopPropagation()}>
                <FreeTileInstancePanelSettings />
              </span>
            </>
          ) : (
            <>
              {layerSettings.timelineHidden ? <LayerHeaderProperties documentId={session.document.id} /> : <div ref={layerAnimationToolbarRef} className="layer-animation-toolbar" onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button, input, select')) event.stopPropagation() }}>
                <span className="layer-animation-playback">
                  <button type="button" title={t('timeline.firstFrame')} aria-label={t('timeline.firstFrame')} onClick={() => selectAnimationEdge('first')}>
                    <PlaybackPixelIcon kind="first" />
                  </button>
                  <button type="button" title={t('timeline.previousFrame')} aria-label={t('timeline.previousFrame')} onClick={() => selectAnimationStep(-1)}>
                    <PlaybackPixelIcon kind="previous" />
                  </button>
                  <button
                    type="button"
                    className={session.animationPlaying ? 'active' : ''}
                    title={session.animationPlaying ? t('timeline.pause') : t('timeline.play')}
                    aria-label={session.animationPlaying ? t('timeline.pause') : t('timeline.play')}
                    onClick={() => store.setAnimationPlaying(!session.animationPlaying)}
                    onContextMenu={(event) => openAnimationMenu(event, { kind: 'playback', x: event.clientX, y: event.clientY })}
                  >
                    <PlaybackPixelIcon kind={session.animationPlaying ? 'pause' : 'play'} />
                  </button>
                  <button type="button" title={t('timeline.nextFrame')} aria-label={t('timeline.nextFrame')} onClick={() => selectAnimationStep(1)}>
                    <PlaybackPixelIcon kind="next" />
                  </button>
                  <button type="button" title={t('timeline.lastFrame')} aria-label={t('timeline.lastFrame')} onClick={() => selectAnimationEdge('last')}>
                    <PlaybackPixelIcon kind="last" />
                  </button>
                </span>
                <span className="layer-animation-edit">
                  <button
                    type="button"
                    className={layerSettings.onionSkin.enabled ? 'active' : ''}
                    title={t('layers.onionSkinEnabled')}
                    aria-label={t('layers.onionSkinEnabled')}
                    aria-pressed={layerSettings.onionSkin.enabled}
                    // Keep the canvas shortcut target focused after a pointer
                    // click. Otherwise native button Enter activation toggles
                    // onion skin instead of letting Enter control playback.
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={toggleOnionSkin}
                  >
                    <PixelUtilityIcon kind="onion" />
                  </button>
                  {!hideSideDockActions && (
                    <button
                      type="button"
                      className="timeline-frame-edit-button"
                      title={t('timeline.addFrame')}
                      aria-label={t('timeline.addFrame')}
                      onClick={() => store.duplicateAnimationFrame()}
                    >
                      <PixelUtilityIcon kind="plus" />
                    </button>
                  )}
                  {!hideSideDockActions && (
                    <button
                      type="button"
                      className="timeline-frame-edit-button"
                      title={t('timeline.deleteFrame')}
                      aria-label={t('timeline.deleteFrame')}
                      disabled={timeline.frames.length <= 1}
                      onClick={() => store.deleteSelectedAnimationItems()}
                    >
                      <PixelUtilityIcon kind="delete" />
                    </button>
                  )}
                </span>
              </div>}
              <span
                ref={layerQuickActionsRef}
                className="panel-actions layer-quick-actions"
                role="toolbar"
                aria-label={t('layers.quickActions')}
                onPointerDown={(event) => { if ((event.target as HTMLElement).closest('button, input, select')) event.stopPropagation() }}
              >
                {layerQuickActionButtons}
                <button
                  type="button"
                  data-timeline-quick-action
                  title={t('layers.settings')}
                  aria-label={t('layers.settings')}
                  style={!layerSettings.timelineHidden && visibleLayerQuickActions.length < hiddenTimelineQuickActionCount ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
                  onClick={openLayerSettings}
                >
                  <PixelUtilityIcon kind="properties" />
                </button>
              </span>
            </>
          )}
          {animationLoopSectionHeader}
        </header>
        {integratedFreeTileInstanceLayer ? (
          <FreeTileInstanceLayers session={session} layer={integratedFreeTileInstanceLayer} listRef={layerListRef} />
        ) : (
          <div
            ref={layerListRef}
            className={`layer-list layer-animation-list component-scrollbar ${selectedAnimationOutlineRows.length > 0 ? 'has-layer-selection-outline' : ''}`}
            style={
              {
                '--layer-frame-count': timeline.frames.length,
                '--layer-selection-start': layerSelectionStart,
                '--layer-selection-span': layerSelectionSpan
              } as CSSProperties
            }
            onScroll={() => { syncAnimationLoopSectionScroll(); syncTimelineQuickActionVisibility() }}
            onPointerEnter={spaceDragScroll.enter}
            onPointerDownCapture={(event) => { spaceDragScroll.begin(event) }}
            onPointerMove={(event) => { spaceDragScroll.move(event) }}
            onPointerLeave={() => { spaceDragScroll.leave() }}
            onPointerUp={(event) => { spaceDragScroll.finish(event) }}
            onPointerCancel={(event) => { spaceDragScroll.cancel(event) }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget && !isScrollbarPointer(event)) clearSelectionFromBlank()
            }}
            onContextMenu={(event) => {
              if (consumeTimelineContextMenu(event)) return
              const target = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id], [data-group-id]')
              if (target?.dataset.layerId) openLayerContextMenu(event, 'layer', target.dataset.layerId)
              else if (target?.dataset.groupId) openLayerContextMenu(event, 'group', target.dataset.groupId)
              else openLayerCreateContextMenu(event)
            }}
          >
            <div className="layer-animation-tree">
              {!layerSettings.timelineHidden && <div className="layer-animation-corner">
                <ActiveFrameSync
                  documentId={session.document.id}
                  frameIds={timeline.frames.map((frame) => frame.id)}
                  containerRef={layerListRef}
                  suppressActiveGuide={suppressCellSelectionGuides}
                  activeFrameIdOverride={gestureActiveFrameId}
                />
              </div>}
              {!layerSettings.timelineHidden && animationColumnResizer}
              <LayerTreeRows
                thumbnailSize={layerSettings.timelineHidden ? 30 : undefined} onMaskContextMenu={openCelMenuFromTimeline}
                displayRows={displayRows}
                timelineVisualState={timelineVisualState}
                renderAnimationMaskRow={renderAnimationMaskRow}
                session={session}
                dropTarget={dropTarget}
                displayColorStripeSegments={displayColorStripeSegments}
                effectiveSelectedGroupIds={effectiveSelectedGroupIds}
                hasNonRowAnimationItemSelection={hasNonRowAnimationItemSelection}
                activeMaskOwnerKey={activeMaskOwnerKey}
                layerSelectionActive={layerSelectionActive}
                draggingGroupId={draggingGroupId}
                layerStyleDrag={layerStyleDrag}
                beginGroupDrag={beginGroupDrag}
                editGroupRow={editGroupRow}
                t={t}
                beginLayerPanelToggle={beginLayerPanelToggle}
                continueLayerPanelToggle={continueLayerPanelToggle}
                endLayerPanelToggle={endLayerPanelToggle}
                finishLayerPanelToggleClick={finishLayerPanelToggleClick}
                blendOptions={blendOptions}
                clippingMaskTooltip={clippingMaskTooltip}
                layerStyleIndicator={layerStyleIndicator}
                maskVisualSelectionActive={maskVisualSelectionActive}
                ordinaryCelSelectionVisible={ordinaryCelSelectionVisible}
                draggingIds={draggingIds}
                beginLayerDrag={beginLayerDrag}
                editLayerRow={editLayerRow}
                openLayerContent={openLayerContent}
                liveAutoLinkById={liveAutoLinkById}
                handleLayerAutoLinkPointerDown={handleLayerAutoLinkPointerDown}
                continueLayerAutoLinkToggle={continueLayerAutoLinkToggle}
                endLayerAutoLinkToggle={endLayerAutoLinkToggle}
                finishLayerAutoLinkClick={finishLayerAutoLinkClick}
                handleLayerAutoLinkKeyDown={handleLayerAutoLinkKeyDown}
                openFreeTileInstanceLayers={openFreeTileInstanceLayers}
              />
            </div>
            {!layerSettings.timelineHidden && <div
              className="layer-animation-grid"
              style={{ gridTemplateRows: displayRowGridTemplate, '--active-layer-row': Math.max(0, activeAnimationLayerRow) } as CSSProperties}
            >
              {selectedAnimationOutlineRows.map((row) => (
                <span
                  key={`selected-animation-row-${row}`}
                  data-animation-selected-row
                  className="animation-selected-layer-row"
                  style={
                    {
                      '--animation-row-index': row,
                      '--animation-row-top': displayRowTop(row),
                      '--animation-row-height': displayRowSpanHeight(row, 1)
                    } as CSSProperties
                  }
                  aria-hidden="true"
                />
              ))}
              {showLinkedCelVisuals &&
                linkedCelBlocks.map((block) => (
                  <span
                    key={block.key}
                    data-linked-cel-block
                    data-frame-index={block.start}
                    data-frame-span={block.span}
                    className={`animation-linked-cel-block ${block.selected ? 'selected' : ''} ${block.layerSelected ? 'layer-selected' : ''}`}
                    style={
                      {
                        '--animation-row-index': block.row,
                        '--animation-row-top': displayRowTop(block.row),
                        '--animation-row-height': displayRowSpanHeight(block.row, 1),
                        '--animation-frame-index': block.start,
                        '--animation-frame-span': block.span
                      } as CSSProperties
                    }
                    aria-hidden="true"
                  />
                ))}
              {showLinkedCelVisuals &&
                linkedCelConnectors.map((connector) => (
                  <span
                    key={connector.key}
                    data-linked-cel-connector
                    data-start-frame-index={connector.start}
                    data-end-frame-index={connector.end}
                    className={`animation-linked-cel-connector ${connector.selected ? 'selected' : ''} ${connector.layerSelected ? 'layer-selected' : ''}`}
                    style={
                      {
                        '--animation-row-index': connector.row,
                        '--animation-row-top': displayRowTop(connector.row),
                        '--animation-row-height': displayRowSpanHeight(connector.row, 1),
                        '--animation-link-start': connector.start,
                        '--animation-link-end': connector.end
                      } as CSSProperties
                    }
                    aria-hidden="true"
                  />
                ))}
              {animationFrameGridDecorations}
              {shouldShowAnimationCellSelectionOutline && selectedCelPositions.length > 0 &&
                <TimelineSelectionOutlines boxes={animationCelSelectionBoxes} dragging={animationCelDragPreview !== null} />}
              {animationFrameHeaders}
              <LayerTimelineCells
                displayRows={displayRows}
                timeline={timeline}
                visualRowStateByKey={visualRowStateByKey}
                visualFrameStateById={visualFrameStateById}
                timelineVisualState={timelineVisualState}
                cellSelectionActive={cellSelectionActive}
                selectedCellFrameIds={selectedCellFrameIds}
                celLookup={celLookup}
                maskVisualByOwnerFrame={maskVisualByOwnerFrame}
                maskOwnerFrameKey={maskOwnerFrameKey}
                visualCellStateBySlot={visualCellStateBySlot}
                showLinkedCelVisuals={showLinkedCelVisuals}
                linkedCelMemberKeys={linkedCelMemberKeys}
                selectedLinkedCelMemberKeys={selectedLinkedCelMemberKeys}
                linkedCelBridgeEndKeys={linkedCelBridgeEndKeys}
                linkedMaskSlotVisuals={linkedMaskSlotVisuals}
                session={session}
                visualSelectedFrameIdSet={visualSelectedFrameIdSet}
                frameSelectionActiveForOutline={frameSelectionActiveForOutline}
                animationCelDragActive={animationCelDragActive}
                focusState={focusState}
                visualSelectedMaskCellKeySet={visualSelectedMaskCellKeySet}
                showCelThumbnails={showCelThumbnails}
                celThumbnailSize={celThumbnailSize}
                t={t}
                maskVisualSelectionActive={maskVisualSelectionActive}
                playbackActiveLayerId={playbackActiveLayerId}
                renderedFrameIds={renderedFrameIds}
                selectedCellTargets={selectedCellTargets}
                selectedMaskActivityLayerIds={selectedMaskActivityLayerIds}
                selectedActivityFrameIds={selectedActivityFrameIds}
                selectedMaskCellFrameIds={selectedMaskCellFrameIds}
                showActiveFrameColumn={showActiveFrameColumn}
                altCopyReady={altCopyReady}
                draggingAnimationCellKind={draggingAnimationCellKind}
                draggingAnimationCellKeys={draggingAnimationCellKeys}
                animationCelDropTargetKey={animationCelDropTargetKey}
                beginAnimationMaskDrag={beginAnimationMaskDrag}
                updateAnimationItemCursor={updateAnimationItemCursor}
                animationGestures={animationGestures}
                store={store}
                openCelMenu={openCelMenuFromTimeline}
                selectedAnimationGroupCellKeySet={selectedAnimationGroupCellKeySet}
                beginAnimationGroupCelDrag={beginAnimationGroupCelDrag}
                selectedCellLayerIds={selectedCellLayerIds}
                renderedCellKeySet={renderedCellKeySet}
                visualActiveLayerId={visualActiveLayerId}
                ordinaryCelSelectionVisible={ordinaryCelSelectionVisible}
                groupVisualSelectionActive={groupVisualSelectionActive}
                selectionOutlineVisible={selectionOutlineVisible}
                suppressCellSelectionGuides={suppressCellSelectionGuides}
                renderedCellKeys={renderedCellKeys}
                hasNonRowAnimationItemSelection={hasNonRowAnimationItemSelection}
                onlyImplicitLayerCellSelection={onlyImplicitLayerCellSelection}
                explicitMultiLayerSelection={explicitMultiLayerSelection}
                showLinkedVisuals={showLinkedVisuals}
                draggingAnimationFrameIds={draggingAnimationFrameIds}
                animationCelDragAnchorKey={animationCelDragAnchorKey}
                beginAnimationCelDrag={beginAnimationCelDrag}
                openCelProperties={openCelProperties}
              />
            </div>}
            {dropTarget?.kind === 'edge' && (
              <div className={`layer-edge-drop-indicator ${dropTarget.edge}`} style={{ top: dropTarget.offset ?? 0 }} aria-hidden="true">
                <i />
                <b />
                <i />
              </div>
            )}
            {dragGhost && (
              <div className="layer-drag-ghost" style={{ top: dragGhost.y }}>
                {dragGhostItems.slice(0, 4).map((item) => (
                  <span key={`${item.kind}-${item.id}`}>
                    {item.kind === 'group' ? <PixelUtilityIcon kind="folder" /> : <PixelUtilityIcon kind="image" />}
                    <b>{item.name}</b>
                  </span>
                ))}
                {hiddenDragGhostCount > 0 && <small>+{hiddenDragGhostCount}</small>}
              </div>
            )}
          </div>
        )}

        {layerContextSurfaces}

        {timelineContextSurfaces}

        <LayerSettingsEditor ref={layerSettingsEditorRef} value={layerSettings} onChange={applyLayerSettings} />

        {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
      </section>
      {layerStyleDrag?.moved &&
        createPortal(
          <div className="layer-style-drag-ghost" style={{ left: layerStyleDrag.x + 12, top: layerStyleDrag.y + 12 }} aria-hidden="true">
            <PixelUtilityIcon kind="layerStyle" />
            <span>{t('layers.copyLayerStyle')}</span>
          </div>,
          document.body
        )}
      <FloatingDockPreview style={floating.dockPreview} />
    </>
  )
}
