import type { useLayerControlGestures } from './useLayerControlGestures'
import type { useTimelineContextActions } from './useTimelineContextActions'
import type { useAnimationGestures } from './useAnimationGestures'
import type { deriveLayerPanelVisuals } from './deriveLayerPanelVisuals'
import type { LayerPanelToggleTarget, LayerDisplayRow } from './layer-panel-contracts'
import { type ReactNode } from 'react'
import { Tooltip } from '@/components/Tooltip'
import { isGroupEffectivelyLocked, isGroupEffectivelyVisible, isLayerEffectivelyLocked, isLayerEffectivelyVisible, resolveAnimationMask } from '@/core/document-model'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import { type DocumentSession } from '@/store/workspace'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { PixelAutoLinkIcon } from '@/components/PixelAutoLinkIcon'
import { timelineVisualClasses } from '@/core/animation-timeline-visual-classes'
import { isLayerCellShortcut } from './layer-cell-shortcuts'
interface Props {
  readonly timelineVisualState: ReturnType<typeof deriveLayerPanelVisuals>['timelineVisualState']
  readonly activeMaskOwnerKey: ReturnType<typeof deriveLayerPanelVisuals>['activeMaskOwnerKey']
  readonly celLookup: import('@/core/animation').AnimationCelLookup
  readonly visualActiveFrameId: ReturnType<typeof deriveLayerPanelVisuals>['visualActiveFrameId']
  readonly maskVisualByOwnerFrame: ReturnType<typeof deriveLayerPanelVisuals>['maskVisualByOwnerFrame']
  readonly maskOwnerFrameKey: ReturnType<typeof deriveLayerPanelVisuals>['maskOwnerFrameKey']
  readonly timeline: import('@shared/types-animation').AnimationTimeline
  readonly session: DocumentSession
  readonly animationGestureSelection: ReturnType<typeof useAnimationGestures>['animationGestureSelection']
  readonly t: (key: import('../../locales/contracts').TranslationKey, params?: import('../../locales/contracts').TranslationParams) => string
  readonly altCopyReady: boolean
  readonly suppressMaskRowClickRef: import('react').RefObject<boolean>
  readonly toggleAnimationMaskIsolatedView: ReturnType<typeof useAnimationGestures>['toggleAnimationMaskIsolatedView']
  readonly store: Pick<import('@/store/workspace').WorkspaceState, 'selectAnimationMaskRow'>
  readonly openCelMenu: ReturnType<typeof useTimelineContextActions>['openCelMenu']
  readonly beginLayerPanelToggle: ReturnType<typeof useLayerControlGestures>['beginLayerPanelToggle']
  readonly continueLayerPanelToggle: ReturnType<typeof useLayerControlGestures>['continueLayerPanelToggle']
  readonly endLayerPanelToggle: ReturnType<typeof useLayerControlGestures>['endLayerPanelToggle']
  readonly finishLayerPanelToggleClick: ReturnType<typeof useLayerControlGestures>['finishLayerPanelToggleClick']
  readonly handleLayerMaskControlPointerDown: ReturnType<typeof useLayerControlGestures>['handleLayerMaskControlPointerDown']
  readonly toggleLayerMaskLocked: ReturnType<typeof useLayerControlGestures>['toggleLayerMaskLocked']
  readonly handleLayerMaskControlKeyDown: ReturnType<typeof useLayerControlGestures>['handleLayerMaskControlKeyDown']
  readonly toggleLayerMaskAutoLink: ReturnType<typeof useLayerControlGestures>['toggleLayerMaskAutoLink']
}
export function createLayerMaskRowRenderer({
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
  openCelMenu,
  beginLayerPanelToggle,
  continueLayerPanelToggle,
  endLayerPanelToggle,
  finishLayerPanelToggleClick,
  handleLayerMaskControlPointerDown,
  toggleLayerMaskLocked,
  handleLayerMaskControlKeyDown,
  toggleLayerMaskAutoLink
}: Props) {
  return (displayRow: Extract<LayerDisplayRow, { kind: 'mask' }>, visualRow: (typeof timelineVisualState.rows)[number] | undefined, colorSegments: ReturnType<ReturnType<typeof deriveLayerPanelVisuals>['displayColorStripeSegments']>): ReactNode => {
    const inheritedHidden = displayRow.ownerKind === 'group'
      ? !isGroupEffectivelyVisible(session.document, displayRow.owner as LayerGroup)
      : !isLayerEffectivelyVisible(session.document, displayRow.owner as RasterLayer)
    const inheritedLocked = displayRow.ownerKind === 'group'
      ? isGroupEffectivelyLocked(session.document, displayRow.owner as LayerGroup)
      : isLayerEffectivelyLocked(session.document, displayRow.owner as RasterLayer)
    const maskRowActiveRef =
      activeMaskOwnerKey === `${displayRow.ownerKind}:${displayRow.owner.id}`
        ? { kind: 'mask' as const, ownerKind: displayRow.ownerKind, ownerId: displayRow.owner.id }
        : null
    const maskRowFlags = timelineVisualClasses(visualRow, undefined, timelineVisualState.selectionGuidesVisible, maskRowActiveRef)
    const activeCel = displayRow.ownerKind === 'layer' ? celLookup.at(displayRow.owner.id, visualActiveFrameId) : null
    const activeMaskSlot = maskVisualByOwnerFrame.get(maskOwnerFrameKey(displayRow.ownerKind, displayRow.owner.id, visualActiveFrameId)) ?? null
    const activeMask = resolveAnimationMask(timeline, activeMaskSlot) ?? activeMaskSlot
    const maskOwnerKey = `${displayRow.ownerKind}:${displayRow.owner.id}`
    const maskControlsDisabled = displayRow.ownerKind !== 'layer' || !activeCel || !activeMask
    const maskLocked = activeMask?.locked === true
    const maskAutoLink = activeMask?.autoLinkAnimationCels === true
    const maskRowVisualClasses = {
      ...maskRowFlags,
      // A mask occupies its own timeline row. Its position is attached to the
      // owner layer, but its activity/selection is independent of that row.
      active: maskRowFlags.active,
      selected: Boolean(
        session.selectedAnimationFrameIds.length === 0 &&
          animationGestureSelection?.kind !== 'frame' &&
          timelineVisualState.selectionGuidesVisible &&
          session.selectedAnimationMaskRowKeys.includes(maskOwnerKey)
      )
    }
    const maskNameKey = displayRow.ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask'
    const maskRowTooltip = (
      <>
        <strong>{t(maskNameKey)}</strong>
        <span>{t('layers.layerMaskDescription')}</span>
        <small>{t('layers.layerMaskUsage')}</small>
      </>
    )
    const maskVisibilityTarget: LayerPanelToggleTarget | null =
      displayRow.ownerKind === 'layer'
        ? activeCel
          ? { control: 'visibility', ownerKind: 'layer-mask', id: activeCel.id }
          : null
        : { control: 'visibility', ownerKind: 'group-mask', id: displayRow.owner.id, frameId: visualActiveFrameId }
    return (
      <button
        type="button"
        key={`mask-row-${displayRow.owner.id}`}
        data-layer-mask-row-owner={displayRow.owner.id}
        className={`layer-row layer-mask-row ${maskRowVisualClasses.selected ? 'selected' : ''} ${maskRowVisualClasses.active ? 'active-layer' : ''} ${activeMask && altCopyReady ? 'mask-edit-ready' : ''}`}
        style={{ '--layer-depth': displayRow.depth } as React.CSSProperties}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          if (!isLayerCellShortcut(event, 'mask') || !activeMask) {
            suppressMaskRowClickRef.current = false
            return
          }
          if (!toggleAnimationMaskIsolatedView(displayRow.owner.id, visualActiveFrameId, event.shiftKey)) return
          suppressMaskRowClickRef.current = true
          event.preventDefault()
          event.stopPropagation()
        }}
        onPointerCancel={() => {
          suppressMaskRowClickRef.current = false
        }}
        onClick={(event) => {
          if (suppressMaskRowClickRef.current || isLayerCellShortcut(event, 'mask')) {
            suppressMaskRowClickRef.current = false
            event.preventDefault()
            event.stopPropagation()
            return
          }
          store.selectAnimationMaskRow(displayRow.ownerKind, displayRow.owner.id, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace')
        }}
        onContextMenu={(event) => {
          event.stopPropagation()
          openCelMenu(event, displayRow.owner.id, visualActiveFrameId, 'mask')
        }}
      >
        {colorSegments.map((segment, index) => (
          <span key={index} className="layer-color-stripe" aria-hidden="true" style={{
            left: `${segment.left}px`, width: `${segment.width}px`,
            backgroundColor: `rgba(${segment.color.r}, ${segment.color.g}, ${segment.color.b}, ${segment.color.a / 255})`
          }} />
        ))}
        <span
          className={`layer-visibility layer-mask-row-visibility ${inheritedHidden ? 'group-visibility-inherited-hidden' : ''}`}
          role="button"
          tabIndex={-1}
          aria-label={t(activeMask?.visible === false ? 'layers.showLayer' : 'layers.hideLayer')}
          aria-pressed={activeMask?.visible !== false}
          aria-disabled={!activeMask || !maskVisibilityTarget}
          onPointerDown={(event) => {
            if (activeMask && maskVisibilityTarget) beginLayerPanelToggle(event, maskVisibilityTarget, activeMask.visible)
            else event.stopPropagation()
          }}
          onPointerEnter={(event) => {
            if (maskVisibilityTarget) continueLayerPanelToggle(event, maskVisibilityTarget)
          }}
          onPointerUp={endLayerPanelToggle}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={finishLayerPanelToggleClick}
        >
          {activeMask?.visible === false ? <PixelUtilityIcon kind="eyeOff" /> : <PixelUtilityIcon kind="eye" />}
        </span>
        <span
          className={`layer-lock-toggle layer-mask-row-lock-slot ${maskLocked ? 'locked' : ''} ${inheritedLocked ? 'group-lock-inherited' : ''}`}
          role="button"
          tabIndex={maskControlsDisabled ? -1 : 0}
          aria-label={t(maskLocked ? 'layers.unlockLayer' : 'layers.lockLayer')}
          aria-disabled={maskControlsDisabled}
          aria-pressed={maskLocked}
          onPointerDownCapture={(event) =>
            handleLayerMaskControlPointerDown(
              event,
              () => {
                if (activeCel) toggleLayerMaskLocked(activeCel.id, maskLocked)
              },
              maskControlsDisabled
            )
          }
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) =>
            handleLayerMaskControlKeyDown(
              event,
              () => {
                if (activeCel) toggleLayerMaskLocked(activeCel.id, maskLocked)
              },
              maskControlsDisabled
            )
          }
        >
          <PixelUtilityIcon kind={maskLocked ? 'lock' : 'unlock'} />
        </span>
        <span
          className={`layer-auto-link-toggle layer-mask-row-auto-link-slot ${maskAutoLink ? 'enabled' : ''}`}
          role="button"
          tabIndex={maskControlsDisabled ? -1 : 0}
          title={t(maskAutoLink ? 'layers.autoLinkAnimationCelsOff' : 'layers.autoLinkAnimationCelsOn')}
          aria-label={t(maskAutoLink ? 'layers.autoLinkAnimationCelsOff' : 'layers.autoLinkAnimationCelsOn')}
          aria-disabled={maskControlsDisabled}
          aria-pressed={maskAutoLink}
          onPointerDownCapture={(event) =>
            handleLayerMaskControlPointerDown(
              event,
              () => {
                if (activeCel) toggleLayerMaskAutoLink(activeCel.id, maskAutoLink)
              },
              maskControlsDisabled
            )
          }
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) =>
            handleLayerMaskControlKeyDown(
              event,
              () => {
                if (activeCel) toggleLayerMaskAutoLink(activeCel.id, maskAutoLink)
              },
              maskControlsDisabled
            )
          }
        >
          <PixelAutoLinkIcon enabled={maskAutoLink} />
        </span>
        <span className="layer-name">
          <span>{t(maskNameKey)}</span>
          <small>{displayRow.owner.name}</small>
        </span>
        <Tooltip className="layer-status-icon-tooltip layer-mask-row-layer-icon" content={maskRowTooltip}>
          <span className="layer-mask-row-icon" aria-hidden="true">
            <PixelUtilityIcon kind="layerMask" />
          </span>
        </Tooltip>
      </button>
    )
  }
}
