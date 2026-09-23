import { layerDensityLabelKeys, layerDensityDescriptionKeys } from './layer-density-labels'
import { forwardRef, useImperativeHandle } from 'react'
import { layerQuickActionMetadata, type LayerSettingsState } from './layer-panel-settings'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ColorValueControl } from '@/components/ColorValueControl'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { SegmentedControl } from '@/components/SegmentedControl'
import { RangeField } from '@/components/RangeField'
import { Tooltip } from '@/components/Tooltip'
import { DEFAULT_ONION_SKIN_PREFERENCES } from '@/core/file-preferences'
import { useI18n } from '@/components/I18nProvider'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { PixelCheckbox } from '@/components/PixelCheckbox'
import { DEFAULT_LAYER_DENSITY as defaultLayerDensity, DEFAULT_LAYER_QUICK_ACTIONS, LAYER_DENSITY_ORDER as layerDensityOrder, LAYER_QUICK_ACTION_LIMIT, type LayerQuickActionId } from '@/core/layer-panel-preferences'

interface LayerQuickActionPointerDrag { id: LayerQuickActionId; pointerId: number; captureTarget: HTMLElement }

export interface LayerSettingsEditorHandle { open(): void; close(): void }
interface Props { value: LayerSettingsState; onChange(next: LayerSettingsState): void }
/** Owns the settings surface, slider popovers and quick-action reorder/capture lifecycle. */
export const LayerSettingsEditor = forwardRef<LayerSettingsEditorHandle, Props>(function LayerSettingsEditor({value: layerSettings, onChange: applyLayerSettings}, ref) {
  const {t} = useI18n()
  const [layerSettingsOpen, setLayerSettingsOpen] = useState(false)

  const [layerQuickActionsOpen, setLayerQuickActionsOpen] = useState(false)

  const [draggedLayerQuickAction, setDraggedLayerQuickAction] = useState<LayerQuickActionId | null>(null)

  const layerQuickActionPointerDragRef = useRef<LayerQuickActionPointerDrag | null>(null)

  const layerQuickActionAutoScrollDirectionRef = useRef<-1 | 0 | 1>(0)

  const layerQuickActionAutoScrollFrameRef = useRef<number | null>(null)

  const [layerSettingsSlider, setLayerSettingsSlider] = useState<'previousOpacity' | 'nextOpacity' | null>(null)

  // Settings updates during a live reorder must not release pointer capture.
  // Only closing or disposing the editor ends that gesture.
  useEffect(() => {
    setDraggedLayerQuickAction(null)
    return () => {
      const drag = layerQuickActionPointerDragRef.current
      if (drag?.captureTarget.hasPointerCapture(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId)
      layerQuickActionPointerDragRef.current = null
      layerQuickActionAutoScrollDirectionRef.current = 0
      if (layerQuickActionAutoScrollFrameRef.current !== null) window.cancelAnimationFrame(layerQuickActionAutoScrollFrameRef.current)
      layerQuickActionAutoScrollFrameRef.current = null
    }
  }, [layerSettingsOpen, layerQuickActionsOpen])

  const resetLayerSettings = (): void => applyLayerSettings({
    density: defaultLayerDensity,
    timelineHidden: false,
    sideDockAutoHide: true,
    skipDisabledFrames: true,
    quickActions: DEFAULT_LAYER_QUICK_ACTIONS.map((action) => ({ ...action })),
    onionSkin: {
      ...DEFAULT_ONION_SKIN_PREFERENCES,
      previousColor: { ...DEFAULT_ONION_SKIN_PREFERENCES.previousColor },
      nextColor: { ...DEFAULT_ONION_SKIN_PREFERENCES.nextColor }
    }
  })

  const updateLayerQuickAction = (id: LayerQuickActionId, enabled: boolean): void => {
    const enabledCount = layerSettings.quickActions.filter((action) => action.enabled).length
    if (enabled && enabledCount >= LAYER_QUICK_ACTION_LIMIT) return
    applyLayerSettings({ ...layerSettings, quickActions: layerSettings.quickActions.map((action) => action.id === id ? { ...action, enabled } : action) })
  }

  const moveLayerQuickAction = (id: LayerQuickActionId, targetId: LayerQuickActionId, insertAfter: boolean): void => {
    const from = layerSettings.quickActions.findIndex((action) => action.id === id)
    if (from < 0 || id === targetId) return
    const quickActions = [...layerSettings.quickActions]
    const [action] = quickActions.splice(from, 1)
    const target = quickActions.findIndex((candidate) => candidate.id === targetId)
    if (target < 0) return
    quickActions.splice(target + (insertAfter ? 1 : 0), 0, action)
    applyLayerSettings({ ...layerSettings, quickActions })
  }

  const beginLayerQuickActionPointerDrag = (event: React.PointerEvent<HTMLElement>, id: LayerQuickActionId): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    layerQuickActionPointerDragRef.current = { id, pointerId: event.pointerId, captureTarget: event.currentTarget }
    setDraggedLayerQuickAction(id)
  }

  useEffect(() => {
    const stopAutoScroll = (): void => {
      layerQuickActionAutoScrollDirectionRef.current = 0
      if (layerQuickActionAutoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(layerQuickActionAutoScrollFrameRef.current)
        layerQuickActionAutoScrollFrameRef.current = null
      }
    }
    const updateAutoScroll = (event: PointerEvent): void => {
      const container = document.querySelector<HTMLElement>('.layer-quick-actions-scroll')
      if (!container) return stopAutoScroll()
      const bounds = container.getBoundingClientRect()
      const edgeSize = Math.min(32, Math.max(16, bounds.height / 4))
      const withinHorizontalBounds = event.clientX >= bounds.left && event.clientX <= bounds.right
      const direction: -1 | 0 | 1 = withinHorizontalBounds && event.clientY <= bounds.top + edgeSize
        ? -1
        : withinHorizontalBounds && event.clientY >= bounds.bottom - edgeSize ? 1 : 0
      layerQuickActionAutoScrollDirectionRef.current = direction
      if (direction === 0 || layerQuickActionAutoScrollFrameRef.current !== null) return
      const scroll = (): void => {
        const scrollingContainer = document.querySelector<HTMLElement>('.layer-quick-actions-scroll')
        const scrollingDirection = layerQuickActionAutoScrollDirectionRef.current
        if (!scrollingContainer || scrollingDirection === 0) {
          layerQuickActionAutoScrollFrameRef.current = null
          return
        }
        scrollingContainer.scrollTop += scrollingDirection * 12
        layerQuickActionAutoScrollFrameRef.current = window.requestAnimationFrame(scroll)
      }
      layerQuickActionAutoScrollFrameRef.current = window.requestAnimationFrame(scroll)
    }
    const move = (event: PointerEvent): void => {
      const drag = layerQuickActionPointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      updateAutoScroll(event)
      const row = (typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(event.clientX, event.clientY) : [])
        .map((element) => element.closest<HTMLElement>('[data-layer-quick-action-id]'))
        .find((element): element is HTMLElement => Boolean(element))
        ?? (event.target instanceof Element ? event.target.closest<HTMLElement>('[data-layer-quick-action-id]') : null)
      const targetId = row?.dataset.layerQuickActionId as LayerQuickActionId | undefined
      if (!row || !targetId || targetId === drag.id) return
      const bounds = row.getBoundingClientRect()
      moveLayerQuickAction(drag.id, targetId, event.clientY >= bounds.top + bounds.height / 2)
      event.preventDefault()
    }
    const end = (event: PointerEvent): void => {
      const drag = layerQuickActionPointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (drag.captureTarget.hasPointerCapture(event.pointerId)) drag.captureTarget.releasePointerCapture(event.pointerId)
      layerQuickActionPointerDragRef.current = null
      stopAutoScroll()
      setDraggedLayerQuickAction(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      stopAutoScroll()
    }
  }, [layerSettings])

  const densityLabel = t(layerDensityLabelKeys[layerSettings.density])

  const densityDescription = t(layerDensityDescriptionKeys[layerSettings.density])
  useImperativeHandle(ref, () => ({open: () => {setLayerSettingsSlider(null); setLayerQuickActionsOpen(false); setLayerSettingsOpen(true)}, close: () => setLayerSettingsOpen(false)}))
  useEffect(() => { if (layerSettings.timelineHidden) setLayerSettingsSlider(null) }, [layerSettings.timelineHidden])
  return <>    {layerSettingsOpen && !layerQuickActionsOpen && createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setLayerSettingsOpen(false) }}>
      <ModalShell as="form" storageKey="layer-settings-layout-v16" defaultWidth={400} defaultHeight={560} fitContent={false} fitContentKey={`${layerSettings.timelineHidden}:${layerSettings.onionSkin.enabled}:${layerQuickActionsOpen}`} minWidth={340} minHeight={326} maxWidth={480} maxHeight={700} className={`layer-modal layer-settings-modal ${layerSettings.timelineHidden ? 'timeline-disabled' : ''}`} onSubmit={(event) => { event.preventDefault(); setLayerSettingsOpen(false) }}>
        <DialogHeader title={t('layers.settings')} closeLabel={t('common.close')} onClose={() => setLayerSettingsOpen(false)} />
        <div className="modal-body component-scrollbar" onPointerDown={(event) => { if (!(event.target as Element).closest('.layer-setting-percent')) setLayerSettingsSlider(null) }}>
          <section className="layer-settings-section">
            <div className="layer-settings-section-heading"><h3>{t('layers.panelDisplay')}</h3></div>
            <div className="layer-settings-section-body">
              <div className="layer-settings-mode">
                <span className="layer-settings-control-label">{t('layers.panelMode')}</span>
              <SegmentedControl label={t('layers.panelMode')} value={layerSettings.timelineHidden ? 'default' : 'animation'}
                options={[{ value: 'animation', label: t('layers.mode.animation') }, { value: 'default', label: t('layers.mode.default') }]}
                onChange={mode => applyLayerSettings({ ...layerSettings, timelineHidden: mode === 'default' })} />
                <p className="layer-settings-hint">{t(layerSettings.timelineHidden ? 'layers.defaultModeHint' : 'layers.animationModeHint')}</p>
              </div>
              {!layerSettings.timelineHidden && <div className="layer-settings-density">
                <span className="layer-settings-control-label">{t('layers.thumbnailSize')}</span>
                <RangeField className="layer-density-range" ariaLabel={t('layers.thumbnailSize')} ariaValueText={densityLabel} min={0} max={layerDensityOrder.length - 1} step={1} value={layerDensityOrder.indexOf(layerSettings.density)} valueLabel={<Tooltip className="layer-density-value-tooltip" content={<><strong>{densityLabel}</strong><span>{densityDescription}</span></>}><span className="layer-density-value-label">{densityLabel}</span></Tooltip>} onChange={(value) => applyLayerSettings({ ...layerSettings, density: layerDensityOrder[value] })} />
              </div>}
              <PreferenceToggle className="layer-settings-toggle" label={t('layers.sideDockAutoHide')} tooltip={t('layers.sideDockAutoHideDescription')} aria-label={t('layers.sideDockAutoHide')} checked={layerSettings.sideDockAutoHide} onChange={(sideDockAutoHide) => applyLayerSettings({ ...layerSettings, sideDockAutoHide })} />
            </div>
          </section>
          {!layerSettings.timelineHidden && <section className="layer-settings-section layer-settings-onion-section">
            <div className="layer-settings-section-heading"><h3>{t('layers.animationSettings')}</h3></div>
              <PreferenceToggle className="layer-settings-toggle" label={t('layers.skipDisabledFrames')} tooltip={t('layers.skipDisabledFramesDescription')} aria-label={t('layers.skipDisabledFrames')} checked={layerSettings.skipDisabledFrames} onChange={(skipDisabledFrames) => applyLayerSettings({ ...layerSettings, skipDisabledFrames })} />
            <h4 className="layer-settings-subheading">{t('layers.onionSkin')}</h4>
            <fieldset className="layer-settings-onion" disabled={layerSettings.timelineHidden} aria-disabled={layerSettings.timelineHidden} aria-label={t('layers.onionSkin')}>
              <PreferenceToggle className="layer-settings-toggle layer-onion-toggle" label={t('layers.onionSkinEnabled')} checked={layerSettings.onionSkin.enabled} onChange={(enabled) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, enabled, showDuringPlayback: enabled ? true : layerSettings.onionSkin.showDuringPlayback } })} />
              {layerSettings.onionSkin.enabled && <PreferenceToggle className="layer-settings-toggle layer-onion-playback-toggle" label={t('layers.onionSkinDuringPlayback')} checked={layerSettings.onionSkin.showDuringPlayback} onChange={(showDuringPlayback) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, showDuringPlayback } })} />}
              {layerSettings.onionSkin.enabled && <div className="layer-onion-scope-field"><span className="layer-settings-control-label">{t('layers.onionSkinScope')}</span><SegmentedControl className="layer-onion-scope" label={t('layers.onionSkinScope')} value={layerSettings.onionSkin.scope} options={[{ value: 'current-layer', label: t('layers.onionSkinCurrentLayer') }, { value: 'all-layers', label: t('layers.onionSkinAllLayers') }]} onChange={(scope) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, scope } })} /></div>}
              {layerSettings.onionSkin.enabled && <div className="layer-settings-pair" role="group" aria-label={t('layers.onionSkin')}>
                <span aria-hidden="true" />
                <span className="layer-settings-pair-heading">{t('layers.previous')}</span>
                <span className="layer-settings-pair-heading">{t('layers.next')}</span>
                <span className="layer-settings-pair-label" title={t('layers.onionSkinRange')}>{t('layers.onionSkinRange')}</span>
                <NumberInput aria-label={t('layers.previousFrames')} min={0} max={8} value={layerSettings.onionSkin.previousFrames} onValueChange={(value) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, previousFrames: value } })} />
                <NumberInput aria-label={t('layers.nextFrames')} min={0} max={8} value={layerSettings.onionSkin.nextFrames} onValueChange={(value) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, nextFrames: value } })} />
                <span className="layer-settings-pair-label" title={t('layers.onionSkinOpacity')}>{t('layers.onionSkinOpacity')}</span>
                <div className="brush-size-control layer-setting-percent previous" onPointerDown={() => setLayerSettingsSlider('previousOpacity')}><NumberInput aria-label={t('layers.previousOpacity')} min={0} max={100} suffix="%" value={layerSettings.onionSkin.previousOpacity} onValueChange={(value) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, previousOpacity: value } })} onFocus={() => setLayerSettingsSlider('previousOpacity')} />{layerSettingsSlider === 'previousOpacity' && <div className="brush-size-popover" role="dialog"><RangeField ariaLabel={t('layers.previousOpacity')} min={0} max={100} suffix="%" value={layerSettings.onionSkin.previousOpacity} onChange={(previousOpacity) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, previousOpacity } })} onBlur={() => setLayerSettingsSlider(null)} /></div>}</div>
                <div className="brush-size-control layer-setting-percent next" onPointerDown={() => setLayerSettingsSlider('nextOpacity')}><NumberInput aria-label={t('layers.nextOpacity')} min={0} max={100} suffix="%" value={layerSettings.onionSkin.nextOpacity} onValueChange={(value) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, nextOpacity: value } })} onFocus={() => setLayerSettingsSlider('nextOpacity')} />{layerSettingsSlider === 'nextOpacity' && <div className="brush-size-popover" role="dialog"><RangeField ariaLabel={t('layers.nextOpacity')} min={0} max={100} suffix="%" value={layerSettings.onionSkin.nextOpacity} onChange={(nextOpacity) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, nextOpacity } })} onBlur={() => setLayerSettingsSlider(null)} /></div>}</div>
                <span className="layer-settings-pair-label" title={t('layers.onionSkinColors')}>{t('layers.onionSkinColors')}</span>
                <ColorValueControl color={layerSettings.onionSkin.previousColor} density="regular" onChange={(color) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, previousColor: color } })} label={t('layers.previousColor')} fillWithColor />
                <ColorValueControl color={layerSettings.onionSkin.nextColor} density="regular" onChange={(color) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, nextColor: color } })} label={t('layers.nextColor')} fillWithColor />
              </div>}
            </fieldset>
          </section>}
          <section className="layer-settings-section layer-quick-actions-settings">
            <button type="button" className="layer-quick-actions-open" aria-haspopup="dialog" onClick={() => { setLayerSettingsSlider(null); setLayerQuickActionsOpen(true) }}>
              <PixelUtilityIcon kind="properties" />
              <span>{t('layers.quickActions')}</span>
              <span className="layer-settings-count">{layerSettings.quickActions.filter(action => action.enabled).length} / {LAYER_QUICK_ACTION_LIMIT}</span>
              <PixelUtilityIcon kind="right" />
            </button>
          </section>
        </div>
        <footer><button type="button" className="quiet-button" onClick={resetLayerSettings}><PixelUtilityIcon kind="restore" />{t('common.reset')}</button><span className="layer-settings-hint layer-settings-live-hint">{t('layers.settingsLiveHint')}</span><button type="submit" className="primary-button">{t('common.close')}</button></footer>
      </ModalShell>
    </div>, document.body)}
    {layerSettingsOpen && layerQuickActionsOpen && createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) setLayerQuickActionsOpen(false) }}>
      <ModalShell storageKey="layer-quick-actions-layout-v1" defaultWidth={460} defaultHeight={600} minWidth={340} minHeight={360} maxWidth={640} maxHeight={760} fitContent={false} className="layer-quick-actions-modal" role="dialog" aria-label={t('layers.quickActions')}>
        <DialogHeader title={t('layers.quickActions')} closeLabel={t('common.close')} onClose={() => setLayerQuickActionsOpen(false)} />
        <div className="layer-quick-actions-summary"><p className="layer-settings-hint">{t('layers.quickActionsDescription')}</p><span className="layer-settings-count">{layerSettings.quickActions.filter(action => action.enabled).length} / {LAYER_QUICK_ACTION_LIMIT}</span></div>
            <div className="modal-body preference-quick-command-list layer-quick-actions-scroll component-scrollbar">
              {layerSettings.quickActions.map((action) => {
                const metadata = layerQuickActionMetadata[action.id]
                const label = t(metadata.label)
                const enabledCount = layerSettings.quickActions.filter((candidate) => candidate.enabled).length
                return <div className={`preference-quick-command-row reorderable-list-row ${draggedLayerQuickAction === action.id ? 'dragging' : ''}`} data-layer-quick-action-id={action.id} key={action.id} title={label}>
                  <button type="button" className="quick-command-drag-handle reorderable-list-handle" aria-label={`${label} ${t('home.reorderHint')}`} title={t('home.reorderHint')} onPointerDown={(event) => beginLayerQuickActionPointerDrag(event, action.id)}><PixelUtilityIcon kind="move" /></button>
                  <span className="preference-quick-command-icon"><PixelUtilityIcon kind={metadata.icon} /></span>
                  <span className="preference-quick-command-name">{label}</span>
                  <PixelCheckbox aria-label={t('preferences.quickCommandEnabledAria', { command: label })} checked={action.enabled} disabled={!action.enabled && enabledCount >= LAYER_QUICK_ACTION_LIMIT} onChange={(event) => updateLayerQuickAction(action.id, event.currentTarget.checked)} />
                </div>
              })}
            </div>
        <footer><span className="layer-settings-hint layer-settings-live-hint">{t('layers.settingsLiveHint')}</span><button type="button" className="primary-button" onClick={() => setLayerQuickActionsOpen(false)}>{t('common.close')}</button></footer>
      </ModalShell>
    </div>, document.body)}
  </>
})
