import type { useLayerControlGestures } from './useLayerControlGestures'
import type { useLayerContextActions } from './useLayerContextActions'
import type { useLayerRowDrag } from './useLayerRowDrag'
import type { deriveLayerPanelVisuals } from './deriveLayerPanelVisuals'
import type { LayerDisplayRow } from './layer-panel-contracts'
import type { ReactNode } from 'react'
import type { DocumentSession } from '@/store/workspace'

export interface LayerTreeRowsProps {
  readonly onMaskContextMenu?: (event: React.MouseEvent<HTMLElement>, ownerId: string, frameId: string, kind: 'mask') => void
  readonly thumbnailSize?: number
  readonly displayRows: ReturnType<typeof deriveLayerPanelVisuals>['displayRows']
  readonly timelineVisualState: ReturnType<typeof deriveLayerPanelVisuals>['timelineVisualState']
  readonly renderAnimationMaskRow: (
    displayRow: Extract<LayerDisplayRow, { kind: 'mask' }>,
    visualRow: ReturnType<typeof deriveLayerPanelVisuals>['timelineVisualState']['rows'][number] | undefined,
    colorSegments: ReturnType<ReturnType<typeof deriveLayerPanelVisuals>['displayColorStripeSegments']>
  ) => ReactNode
  readonly session: DocumentSession
  readonly dropTarget: ReturnType<typeof useLayerRowDrag>['dropTarget']
  readonly displayColorStripeSegments: ReturnType<typeof deriveLayerPanelVisuals>['displayColorStripeSegments']
  readonly effectiveSelectedGroupIds: ReturnType<typeof deriveLayerPanelVisuals>['effectiveSelectedGroupIds']
  readonly hasNonRowAnimationItemSelection: ReturnType<typeof deriveLayerPanelVisuals>['hasNonRowAnimationItemSelection']
  readonly activeMaskOwnerKey: ReturnType<typeof deriveLayerPanelVisuals>['activeMaskOwnerKey']
  readonly layerSelectionActive: ReturnType<typeof deriveLayerPanelVisuals>['layerSelectionActive']
  readonly draggingGroupId: ReturnType<typeof useLayerRowDrag>['draggingGroupId']
  readonly layerStyleDrag: ReturnType<typeof useLayerContextActions>['layerStyleDrag']
  readonly beginGroupDrag: (event: React.PointerEvent<HTMLButtonElement>, groupId: string) => void
  readonly editGroupRow: ReturnType<typeof useLayerContextActions>['editGroupRow']
  readonly t: (key: import('../../locales/contracts').TranslationKey, params?: import('../../locales/contracts').TranslationParams) => string
  readonly beginLayerPanelToggle: ReturnType<typeof useLayerControlGestures>['beginLayerPanelToggle']
  readonly continueLayerPanelToggle: ReturnType<typeof useLayerControlGestures>['continueLayerPanelToggle']
  readonly endLayerPanelToggle: ReturnType<typeof useLayerControlGestures>['endLayerPanelToggle']
  readonly finishLayerPanelToggleClick: ReturnType<typeof useLayerControlGestures>['finishLayerPanelToggleClick']
  readonly blendOptions: {
    value: import('@shared/types-color').BlendMode
    label: string
  }[]
  readonly clippingMaskTooltip: import('react').JSX.Element
  readonly layerStyleIndicator: ReturnType<typeof useLayerContextActions>['layerStyleIndicator']
  readonly maskVisualSelectionActive: ReturnType<typeof deriveLayerPanelVisuals>['maskVisualSelectionActive']
  readonly ordinaryCelSelectionVisible: ReturnType<typeof deriveLayerPanelVisuals>['ordinaryCelSelectionVisible']
  readonly draggingIds: ReturnType<typeof useLayerRowDrag>['draggingIds']
  readonly beginLayerDrag: (event: React.PointerEvent<HTMLButtonElement>, layerId: string) => void
  readonly openLayerContent: ReturnType<typeof useLayerContextActions>['openLayerContent']
  readonly editLayerRow: ReturnType<typeof useLayerContextActions>['editLayerRow']
  readonly liveAutoLinkById: Map<string, boolean>
  readonly handleLayerAutoLinkPointerDown: ReturnType<typeof useLayerControlGestures>['handleLayerAutoLinkPointerDown']
  readonly continueLayerAutoLinkToggle: ReturnType<typeof useLayerControlGestures>['continueLayerAutoLinkToggle']
  readonly endLayerAutoLinkToggle: ReturnType<typeof useLayerControlGestures>['endLayerAutoLinkToggle']
  readonly finishLayerAutoLinkClick: ReturnType<typeof useLayerControlGestures>['finishLayerAutoLinkClick']
  readonly handleLayerAutoLinkKeyDown: ReturnType<typeof useLayerControlGestures>['handleLayerAutoLinkKeyDown']
  readonly openFreeTileInstanceLayers: (layerId: string) => void
}
