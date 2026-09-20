import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BlendMode } from '@shared/types-color'
import { NumberInput } from '@/components/NumberInput'
import { RangeField } from '@/components/RangeField'
import { ThemedSelect } from '@/components/ThemedSelect'
import { useI18n } from '@/components/I18nProvider'
import { isGroupEffectivelyLocked, isLayerEffectivelyLocked } from '@/core/document-model'
import { useWorkspace, type LayerPropertyValues } from '@/store/workspace'
import { layerBlendOptions } from './layer-blend-options'
import { hasUnsupportedPropertySelection, selectedRowsForProperties } from './layer-panel-selection'

export function LayerHeaderProperties({ documentId }: { documentId: string }) {
  const { t } = useI18n()
  useWorkspace(state => {
    const session = state.sessions.find(item => item.document.id === documentId)
    return session ? `${session.uiRevision}:${session.history.revision}:${session.layersPanelRevision}` : ''
  })
  const session = useWorkspace.getState().sessions.find(item => item.document.id === documentId)
  const targets = session ? selectedRowsForProperties(session) : []
  const sources = session ? targets.flatMap(target => {
    if (target.kind === 'group') {
      const source = session.document.groups.find(group => group.id === target.id)
      return source ? [{ target, source, locked: isGroupEffectivelyLocked(session.document, source) }] : []
    }
    const source = session.document.layers.find(layer => layer.id === target.id)
    return source ? [{ target, source, locked: isLayerEffectivelyLocked(session.document, source) }] : []
  }) : []
  const source = sources[0]?.source
  const disabled = !source || !session || hasUnsupportedPropertySelection(session) || sources.every(item => item.locked)
  const targetKey = targets.map(target => `${target.kind}:${target.id}`).join('|')
  const transaction = useRef<{ id: string; values: LayerPropertyValues } | null>(null)
  const interacting = useRef(false)
  const [opacityOpen, setOpacityOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const opacityRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!opacityOpen) return
    const place = (): void => {
      const anchor = opacityRef.current?.getBoundingClientRect()
      const popover = popoverRef.current?.getBoundingClientRect()
      if (!anchor || !popover) return
      setPosition({
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - popover.width - 8)),
        top: anchor.bottom + popover.height + 12 <= window.innerHeight ? anchor.bottom + 4 : Math.max(8, anchor.top - popover.height - 4)
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [opacityOpen])

  useEffect(() => {
    if (!opacityOpen) return
    const closeOutside = (event: Event): void => {
      if (event.target instanceof Node && !opacityRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpacityOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('focusin', closeOutside)
    return () => { window.removeEventListener('pointerdown', closeOutside, true); window.removeEventListener('focusin', closeOutside) }
  }, [opacityOpen])

  useEffect(() => { setOpacityOpen(false) }, [documentId, targetKey, disabled])

  const finish = (cancel = false): void => {
    const pending = transaction.current
    transaction.current = null
    interacting.current = false
    if (!pending) return
    const store = useWorkspace.getState()
    if (cancel || store.activeId !== documentId) store.cancelLayerPropertiesTransaction(pending.id)
    else store.commitLayerPropertiesTransaction(pending.id, pending.values, ['opacity'])
  }

  useEffect(() => {
    const commit = (): void => finish()
    const cancel = (): void => finish(true)
    const keyUp = (event: KeyboardEvent): void => { if (event.key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) finish() }
    window.addEventListener('pointerup', commit)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', commit)
    return () => {
      window.removeEventListener('pointerup', commit)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', commit)
      finish(true)
    }
  }, [documentId, targetKey])

  const begin = (): { id: string; values: LayerPropertyValues } | null => {
    if (disabled || !source || useWorkspace.getState().activeId !== documentId) return null
    const id = useWorkspace.getState().beginLayerPropertiesTransaction(targets)
    return id ? { id, values: {
      name: source.name, opacity: source.opacity, blendMode: source.blendMode, locked: source.locked,
      cumulativeBlend: 'cumulativeBlend' in source && source.cumulativeBlend === true,
      displayColor: source.displayColor ?? null, description: source.description ?? ''
    } } : null
  }
  const changeBlend = (blendMode: BlendMode): void => {
    finish()
    const pending = begin()
    if (pending) useWorkspace.getState().commitLayerPropertiesTransaction(pending.id, { ...pending.values, blendMode }, ['blendMode'])
  }
  const changeOpacity = (opacity: number): void => {
    const pending = transaction.current ?? begin()
    if (!pending) return
    pending.values = { ...pending.values, opacity: opacity / 100 }
    transaction.current = pending
    useWorkspace.getState().previewLayerPropertiesTransaction(pending.id, pending.values, ['opacity'])
    if (!interacting.current) finish()
  }

  return <div className="layer-header-properties" data-preserve-animation-selection onPointerDown={event => event.stopPropagation()}>
    <ThemedSelect label={t('layers.blendMode')} value={source?.blendMode ?? 'normal'} density="compact" disabled={disabled}
      groups={[{ label: t('layers.blendMode'), options: layerBlendOptions(t) }]} preserveAnimationSelection onChange={changeBlend} />
    <span ref={opacityRef} className="layer-header-opacity" onPointerDownCapture={() => { interacting.current = true }}
      onPointerDown={() => { if (!disabled) setOpacityOpen(true) }}
      onKeyDownCapture={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(true); setOpacityOpen(false) }
        else if (event.key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) interacting.current = true
      }}>
      <button type="button" className="layer-opacity-label" disabled={disabled} aria-expanded={opacityOpen} aria-haspopup="dialog"
        onClick={() => setOpacityOpen(true)}>{t('layers.opacity')}</button>
      <NumberInput aria-label={t('layers.opacity')} density="compact" disabled={disabled} min={0} max={100} suffix="%"
        value={Math.round((source?.opacity ?? 1) * 100)} onValueChange={changeOpacity}
        onBlur={event => { if (!popoverRef.current?.contains(event.relatedTarget as Node | null)) finish() }}
        onFocus={() => setOpacityOpen(true)} />
      {opacityOpen && !disabled && createPortal(<div ref={popoverRef} className="brush-size-popover layer-opacity-popover"
        role="dialog" aria-label={t('layers.opacity')} data-preserve-animation-selection style={position}>
        <RangeField ariaLabel={t('layers.opacity')} density="compact" min={0} max={100} suffix="%"
          value={Math.round((source?.opacity ?? 1) * 100)} onChange={changeOpacity} onBlur={() => finish()} />
      </div>, document.body)}
    </span>
  </div>
}
