import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import { type AnimationLoopSectionDraft } from '@/components/AnimationLoopSectionDialog'
import { type LayerPanelNode } from '@/core/layer-panel-layout'
import { type LayerPropertyTarget } from '@/store/workspace'
export type LayerFormTarget = LayerPropertyTarget

export type LayerPanelToggleTarget =
  | { control: 'visibility'; ownerKind: 'layer'; id: string }
  | { control: 'visibility'; ownerKind: 'group'; id: string }
  | { control: 'visibility'; ownerKind: 'layer-mask'; id: string }
  | { control: 'visibility'; ownerKind: 'group-mask'; id: string; frameId: string }
  | { control: 'lock'; ownerKind: 'layer'; id: string }
  | { control: 'lock'; ownerKind: 'group'; id: string }
  | { control: 'group-expand'; ownerKind: 'group'; id: string }

export type LayerAutoLinkToggleTarget = { control: 'auto-link'; ownerKind: 'layer'; id: string }

export type LayerDisplayRow =
  | { kind: 'node'; node: LayerTreeNode }
  | { kind: 'mask'; ownerKind: 'layer' | 'group'; owner: RasterLayer | LayerGroup; depth: number }

export interface LayerContextMenu {
  kind: 'layer' | 'group'
  id: string
  x: number
  y: number
  /**
   * The selection is captured when the menu opens.  A portalled menu receives
   * its click after the originating row has had a chance to re-render, so
   * resolving this lazily could degrade a multi-row edit into an edit of the
   * last row that was right-clicked.
   */
  propertyTargets: LayerFormTarget[]
  propertySelectionIncludesUnsupported: boolean
}

export interface LayerCreateContextMenu {
  x: number
  y: number
}

export interface LayerStyleDialogState {
  source: LayerFormTarget
  targets: LayerFormTarget[]
}

export interface LayerStyleDragState {
  source: LayerFormTarget
  target: LayerFormTarget | null
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
}

export type AnimationContextMenu =
  | { kind: 'playback'; x: number; y: number }
  | { kind: 'frame'; frameId: string; x: number; y: number }
  | { kind: 'loop-section'; sectionId: string; x: number; y: number }
  | { kind: 'cel' | 'mask'; layerId: string; frameId: string; x: number; y: number }

export interface AnimationLoopSectionEditorState {
  mode: 'create' | 'edit'
  sectionId?: string
  value: AnimationLoopSectionDraft
}

export type LayerTreeNode = LayerPanelNode & ({ kind: 'layer'; layer: RasterLayer } | { kind: 'group'; group: LayerGroup })
