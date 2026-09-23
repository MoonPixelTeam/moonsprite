import type { useTimelineContextActions } from './useTimelineContextActions'
import type { deriveLayerPanelVisuals } from './deriveLayerPanelVisuals'
import type { useAnimationGestures } from './useAnimationGestures'
import type { DocumentSession } from '@/store/workspace'

export interface LayerTimelineCellsProps {
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
  readonly selectedLinkedCelMemberKeys: ReadonlySet<string>
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
  readonly animationGestures: Pick<ReturnType<typeof useAnimationGestures>, 'clickSuppressed' | 'hitsSelectionOutline' | 'beginAnimationFrameDrag'>
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
