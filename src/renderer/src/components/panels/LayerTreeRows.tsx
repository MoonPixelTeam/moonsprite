import type { useLayerControlGestures } from './useLayerControlGestures'
import type { useLayerContextActions } from './useLayerContextActions'
import type { useLayerRowDrag } from './useLayerRowDrag'
import { deriveLayerPanelVisuals } from './deriveLayerPanelVisuals'
import type { LayerDisplayRow } from './layer-panel-contracts'
import { type ReactNode } from 'react'
import { Tooltip } from '@/components/Tooltip'
import { getGroupLockingAncestor, getLayerLockingGroup } from '@/core/document-model'
import { getLayerPanelAncestorGroupIds } from '@/core/layer-panel-layout'
import { type DocumentSession } from '@/store/workspace'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { hasConfiguredLayerStyles } from '@/core/layer-styles'
import { PixelAutoLinkIcon } from '@/components/PixelAutoLinkIcon'
import { timelineVisualClasses } from '@/core/animation-timeline-visual-classes'
interface Props {
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
  readonly editLayerRow: ReturnType<typeof useLayerContextActions>['editLayerRow']
  readonly liveAutoLinkById: Map<string, boolean>
  readonly handleLayerAutoLinkPointerDown: ReturnType<typeof useLayerControlGestures>['handleLayerAutoLinkPointerDown']
  readonly continueLayerAutoLinkToggle: ReturnType<typeof useLayerControlGestures>['continueLayerAutoLinkToggle']
  readonly endLayerAutoLinkToggle: ReturnType<typeof useLayerControlGestures>['endLayerAutoLinkToggle']
  readonly finishLayerAutoLinkClick: ReturnType<typeof useLayerControlGestures>['finishLayerAutoLinkClick']
  readonly handleLayerAutoLinkKeyDown: ReturnType<typeof useLayerControlGestures>['handleLayerAutoLinkKeyDown']
  readonly openFreeTileInstanceLayers: (layerId: string) => void
}
export function LayerTreeRows({
  displayRows,
  timelineVisualState,
  renderAnimationMaskRow,
  session,
  dropTarget,
  displayColorStripeSegments,
  effectiveSelectedGroupIds,
  hasNonRowAnimationItemSelection,
  activeMaskOwnerKey,
  layerSelectionActive,
  draggingGroupId,
  layerStyleDrag,
  beginGroupDrag,
  editGroupRow,
  t,
  beginLayerPanelToggle,
  continueLayerPanelToggle,
  endLayerPanelToggle,
  finishLayerPanelToggleClick,
  blendOptions,
  clippingMaskTooltip,
  layerStyleIndicator,
  maskVisualSelectionActive,
  ordinaryCelSelectionVisible,
  draggingIds,
  beginLayerDrag,
  editLayerRow,
  liveAutoLinkById,
  handleLayerAutoLinkPointerDown,
  continueLayerAutoLinkToggle,
  endLayerAutoLinkToggle,
  finishLayerAutoLinkClick,
  handleLayerAutoLinkKeyDown,
  openFreeTileInstanceLayers
}: Props) {
  return (
    <>
      {' '}
      {displayRows.map((displayRow, rowIndex) => {
        const visualRow = timelineVisualState.rows[rowIndex]
        if (displayRow.kind === 'mask') return renderAnimationMaskRow(displayRow, visualRow, displayColorStripeSegments(displayRow.owner, displayRow.ownerKind, displayRow.depth))
        const node = displayRow.node
        if (node.kind === 'group') {
          const collapsed = session.collapsedGroupIds.includes(node.group.id)
          const lockingAncestor = getGroupLockingAncestor(session.document, node.group)
          const groupInsideTarget = dropTarget?.kind === 'group' && dropTarget.id === node.group.id
          const groupIndicator =
            dropTarget?.kind === 'above-group' && dropTarget.id === node.group.id ? (
              <span
                className={`layer-drop-indicator ${dropTarget.insertAfter === false ? 'below' : 'above'}`}
                style={{ left: `${8 + node.depth * 14}px` }}
                aria-hidden="true"
              >
                <i />
                <b />
                <i />
              </span>
            ) : null
          const displayColorSegments = displayColorStripeSegments(node.group, 'group', node.depth)
          const groupHasLayerStyles = hasConfiguredLayerStyles(node.group.layerStyles)
          const groupOwnerKey = `group:${node.group.id}`
          const groupRowSelected =
            timelineVisualState.selectionGuidesVisible && effectiveSelectedGroupIds.length > 0 && !hasNonRowAnimationItemSelection && visualRow?.selected
          const groupRowVisualClasses = {
            ...timelineVisualClasses(visualRow, undefined, timelineVisualState.selectionGuidesVisible),
            active: Boolean(visualRow?.active && activeMaskOwnerKey !== groupOwnerKey),
            selected: Boolean(groupRowSelected || (timelineVisualState.selectionGuidesVisible && layerSelectionActive && visualRow?.selected))
          }
          const inheritedVisibilityHidden = getLayerPanelAncestorGroupIds(session.document.groups, node.group.parentGroupId).some(
            (groupId) => session.document.groups.find((group) => group.id === groupId)?.visible === false
          )
          return (
            <button
              key={node.group.id}
              data-group-id={node.group.id}
              className={`layer-row group-row ${node.group.clippingMask === true ? 'clipping-mask' : ''} ${groupHasLayerStyles ? 'has-layer-style' : ''} ${groupRowVisualClasses.active ? 'active-layer' : ''} ${groupRowVisualClasses.selected ? 'selected' : ''} ${draggingGroupId === node.group.id ? 'dragging' : ''} ${groupInsideTarget ? 'group-drop-target' : ''} ${layerStyleDrag?.target?.kind === 'group' && layerStyleDrag.target.id === node.group.id ? 'layer-style-drop-target' : ''}`}
              style={{ '--layer-depth': node.depth } as React.CSSProperties}
              onPointerDown={(event) => beginGroupDrag(event, node.group.id)}
              onDoubleClick={() => editGroupRow(node.group)}
            >
              {groupIndicator}
              {displayColorSegments.map((segment, index) => (
                <span
                  key={`group-color-stripe-${node.group.id}-${index}`}
                  className="layer-color-stripe"
                  style={{
                    left: `${segment.left}px`,
                    width: `${segment.width}px`,
                    backgroundColor: `rgba(${segment.color.r}, ${segment.color.g}, ${segment.color.b}, ${segment.color.a / 255})`
                  }}
                  aria-hidden="true"
                />
              ))}
              <span
                className={`layer-visibility ${inheritedVisibilityHidden ? 'group-visibility-inherited-hidden' : ''}`}
                role="button"
                tabIndex={-1}
                aria-label={t(node.group.visible ? 'layers.hideGroup' : 'layers.showGroup')}
                aria-pressed={node.group.visible}
                onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'visibility', ownerKind: 'group', id: node.group.id }, node.group.visible)}
                onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'visibility', ownerKind: 'group', id: node.group.id })}
                onPointerUp={endLayerPanelToggle}
                onDoubleClick={(event) => event.stopPropagation()}
                onClick={finishLayerPanelToggleClick}
              >
                {node.group.visible ? <PixelUtilityIcon kind="eye" /> : <PixelUtilityIcon kind="eyeOff" />}
              </span>
              <span
                className={`layer-lock-toggle ${node.group.locked ? 'locked' : ''} ${lockingAncestor ? 'group-lock-inherited' : ''}`}
                role="button"
                tabIndex={-1}
                title={lockingAncestor ? t('layers.lockedByGroup', { name: lockingAncestor.name }) : undefined}
                aria-label={t(node.group.locked ? 'layers.unlockGroup' : 'layers.lockGroup')}
                aria-pressed={node.group.locked}
                onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'lock', ownerKind: 'group', id: node.group.id }, node.group.locked)}
                onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'lock', ownerKind: 'group', id: node.group.id })}
                onPointerUp={endLayerPanelToggle}
                onDoubleClick={(event) => event.stopPropagation()}
                onClick={finishLayerPanelToggleClick}
              >
                {node.group.locked ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}
              </span>
              <span
                className="group-folder"
                role="button"
                tabIndex={-1}
                aria-label={t(collapsed ? 'layers.expandGroup' : 'layers.collapseGroup')}
                title={t(collapsed ? 'layers.expandGroup' : 'layers.collapseGroup')}
                onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'group-expand', ownerKind: 'group', id: node.group.id }, !collapsed)}
                onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'group-expand', ownerKind: 'group', id: node.group.id })}
                onPointerUp={endLayerPanelToggle}
                onDoubleClick={(event) => event.stopPropagation()}
                onClick={finishLayerPanelToggleClick}
              >
                {collapsed ? <PixelUtilityIcon kind="folder" /> : <PixelUtilityIcon kind="folderOpen" />}
              </span>
              <Tooltip className="layer-name" content={node.group.description?.trim()}>
                <span>{node.group.name}</span>
                <small>
                  {blendOptions.find((option) => option.value === node.group.blendMode)?.label} · {Math.round(node.group.opacity * 100)}%
                </small>
              </Tooltip>
              {node.group.clippingMask === true && (
                <Tooltip className="layer-status-icon-tooltip" content={clippingMaskTooltip}>
                  <span className="layer-clipping-mask-indicator" aria-hidden="true">
                    <PixelUtilityIcon kind="clippingMask" />
                  </span>
                </Tooltip>
              )}
              {groupHasLayerStyles && layerStyleIndicator({ kind: 'group', id: node.group.id })}
            </button>
          )
        }
        const lockingGroup = getLayerLockingGroup(session.document, node.layer)
        const inheritedVisibilityHidden = getLayerPanelAncestorGroupIds(session.document.groups, node.layer.groupId).some(
          (groupId) => session.document.groups.find((group) => group.id === groupId)?.visible === false
        )
        const displayColorSegments = displayColorStripeSegments(node.layer, 'layer', node.depth)
        const indicator =
          dropTarget?.kind === 'layer' && dropTarget.id === node.layer.id ? (
            <span
              className={`layer-drop-indicator ${dropTarget.insertAfter ? 'above' : 'below'}`}
              style={{ left: `${8 + node.depth * 14}px` }}
              aria-hidden="true"
            >
              <i />
              <b />
              <i />
            </span>
          ) : null
        const layerOwnerKey = `layer:${node.layer.id}`
        const layerHasLayerStyles = hasConfiguredLayerStyles(node.layer.layerStyles)
        const layerRowVisualClasses = {
          ...timelineVisualClasses(visualRow, undefined, timelineVisualState.selectionGuidesVisible),
          active: Boolean(!maskVisualSelectionActive && visualRow?.active && activeMaskOwnerKey !== layerOwnerKey),
          selected: Boolean(timelineVisualState.selectionGuidesVisible && layerSelectionActive && visualRow?.selected)
        }
        return (
          <button
            key={node.layer.id}
            data-layer-id={node.layer.id}
            className={`layer-row ${node.layer.kind === 'text' ? 'text-layer' : ''} ${node.layer.kind === 'tilemap' ? 'tilemap-layer' : ''} ${node.layer.kind === 'free-tile' ? 'free-tile-layer' : ''} ${node.layer.background ? 'background-layer' : ''} ${node.layer.linkedContentId ? 'linked-layer' : ''} ${node.layer.clippingMask === true ? 'clipping-mask' : ''} ${layerHasLayerStyles ? 'has-layer-style' : ''} ${node.depth > 0 ? 'group-member' : ''} ${layerRowVisualClasses.selected ? 'selected' : ''} ${layerRowVisualClasses.active ? 'active-layer' : ''} ${!maskVisualSelectionActive && ordinaryCelSelectionVisible && visualRow?.selectedByCell ? 'cel-owner-active' : ''} ${draggingIds.includes(node.layer.id) ? 'dragging' : ''} ${layerStyleDrag?.target?.kind === 'layer' && layerStyleDrag.target.id === node.layer.id ? 'layer-style-drop-target' : ''}`}
            style={{ '--layer-depth': node.depth } as React.CSSProperties}
            onPointerDown={(event) => beginLayerDrag(event, node.layer.id)}
            onDoubleClick={() => editLayerRow(node.layer)}
          >
            {indicator}
            {displayColorSegments.map((segment, index) => (
              <span
                key={`layer-color-stripe-${node.layer.id}-${index}`}
                className="layer-color-stripe"
                style={{
                  left: `${segment.left}px`,
                  width: `${segment.width}px`,
                  backgroundColor: `rgba(${segment.color.r}, ${segment.color.g}, ${segment.color.b}, ${segment.color.a / 255})`
                }}
                aria-hidden="true"
              />
            ))}
            <span
              className={`layer-visibility ${inheritedVisibilityHidden ? 'group-visibility-inherited-hidden' : ''}`}
              role="button"
              tabIndex={-1}
              aria-label={t(node.layer.visible ? 'layers.hideLayer' : 'layers.showLayer')}
              aria-pressed={node.layer.visible}
              onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'visibility', ownerKind: 'layer', id: node.layer.id }, node.layer.visible)}
              onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'visibility', ownerKind: 'layer', id: node.layer.id })}
              onPointerUp={endLayerPanelToggle}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={finishLayerPanelToggleClick}
            >
              {node.layer.visible ? <PixelUtilityIcon kind="eye" /> : <PixelUtilityIcon kind="eyeOff" />}
            </span>
            <span
              className={`layer-lock-toggle ${node.layer.locked ? 'locked' : ''} ${lockingGroup ? 'group-lock-inherited' : ''}`}
              role="button"
              tabIndex={-1}
              title={lockingGroup ? t('layers.lockedByGroup', { name: lockingGroup.name }) : undefined}
              aria-label={t(node.layer.locked ? 'layers.unlockLayer' : 'layers.lockLayer')}
              aria-pressed={node.layer.locked}
              onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'lock', ownerKind: 'layer', id: node.layer.id }, node.layer.locked)}
              onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'lock', ownerKind: 'layer', id: node.layer.id })}
              onPointerUp={endLayerPanelToggle}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={finishLayerPanelToggleClick}
            >
              {node.layer.locked ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}
            </span>
            <span
              className={liveAutoLinkById.get(node.layer.id) === true ? 'layer-auto-link-toggle enabled' : 'layer-auto-link-toggle'}
              role="button"
              tabIndex={0}
              title={t(liveAutoLinkById.get(node.layer.id) === true ? 'layers.autoLinkAnimationCelsOff' : 'layers.autoLinkAnimationCelsOn')}
              aria-label={t(liveAutoLinkById.get(node.layer.id) === true ? 'layers.autoLinkAnimationCelsOff' : 'layers.autoLinkAnimationCelsOn')}
              aria-pressed={liveAutoLinkById.get(node.layer.id) === true}
              onPointerDownCapture={(event) => handleLayerAutoLinkPointerDown(event, node.layer.id)}
              onPointerEnter={(event) => continueLayerAutoLinkToggle(event, { control: 'auto-link', ownerKind: 'layer', id: node.layer.id })}
              onPointerUp={endLayerAutoLinkToggle}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={finishLayerAutoLinkClick}
              onKeyDown={(event) => handleLayerAutoLinkKeyDown(event, node.layer.id)}
            >
              <PixelAutoLinkIcon enabled={liveAutoLinkById.get(node.layer.id) === true} />
            </span>
            <Tooltip className="layer-name" content={node.layer.description?.trim()}>
              <span>{node.layer.name}</span>
              <small>
                {blendOptions.find((option) => option.value === node.layer.blendMode)?.label} · {Math.round(node.layer.opacity * 100)}%
              </small>
            </Tooltip>
            {node.layer.kind === 'text' && (
              <Tooltip className="layer-status-icon-tooltip" content={t('layers.textLayerHint')}>
                <span className="layer-text-indicator" aria-hidden="true">
                  <PixelUtilityIcon kind="text" />
                </span>
              </Tooltip>
            )}
            {node.layer.kind === 'tilemap' && (
              <Tooltip className="layer-status-icon-tooltip" content={t('layers.tilemapLayerHint')}>
                <span className="layer-tilemap-indicator" aria-hidden="true">
                  <PixelUtilityIcon kind="tilemap" />
                </span>
              </Tooltip>
            )}
            {node.layer.kind === 'free-tile' && (
              <Tooltip
                className="layer-status-icon-tooltip"
                content={
                  <>
                    <strong>{t('layers.freeTileLayerHint')}</strong>
                    <span>{t('freeTiles.openInstanceLayers')}</span>
                  </>
                }
              >
                <span
                  className="layer-tilemap-indicator"
                  role="button"
                  tabIndex={0}
                  aria-label={t('freeTiles.openInstanceLayers')}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    openFreeTileInstanceLayers(node.layer.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    event.stopPropagation()
                    openFreeTileInstanceLayers(node.layer.id)
                  }}
                >
                  <PixelUtilityIcon kind="freeTile" />
                </span>
              </Tooltip>
            )}
            {node.layer.background && (
              <Tooltip className="layer-status-icon-tooltip" content={t('layers.backgroundDescription')}>
                <span className="layer-background-indicator" aria-hidden="true">
                  <PixelUtilityIcon kind="image" />
                </span>
              </Tooltip>
            )}
            {node.layer.linkedContentId && (
              <Tooltip
                className="layer-status-icon-tooltip"
                content={
                  <>
                    <strong>{t('layers.linkedLayer')}</strong>
                    <span>{t('layers.linkedLayerDescription')}</span>
                  </>
                }
              >
                <span className="layer-linked-indicator" aria-hidden="true">
                  <PixelUtilityIcon kind="linkedLayer" />
                </span>
              </Tooltip>
            )}
            {node.layer.clippingMask === true && (
              <Tooltip className="layer-status-icon-tooltip" content={clippingMaskTooltip}>
                <span className="layer-clipping-mask-indicator" aria-hidden="true">
                  <PixelUtilityIcon kind="clippingMask" />
                </span>
              </Tooltip>
            )}
            {layerHasLayerStyles && layerStyleIndicator({ kind: 'layer', id: node.layer.id })}
          </button>
        )
      })}{' '}
    </>
  )
}
