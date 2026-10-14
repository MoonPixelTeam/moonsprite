import { useEffect, useRef, useState } from 'react'
import type { BlendMode } from '@shared/types-color'
import { DialogHeader } from './DialogHeader'
import { FormField } from './FormField'
import { ModalShell } from './ModalShell'
import { NumberInput } from './NumberInput'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { RangeField } from './RangeField'
import { SegmentedControl } from './SegmentedControl'
import { ThemedSelect, type ThemedSelectGroup } from './ThemedSelect'
import { Tooltip } from './Tooltip'
import { useI18n } from './I18nProvider'
import { MAX_FREE_TILE_COORDINATE } from '@/core/free-tile'
import { useWorkspace } from '@/store/workspace'
import type { FreeTileInstancePropertyChanges } from '@/store/workspace-state'

export function FreeTileInstancePropertiesDialog({
  instanceIds,
  name,
  x,
  y,
  opacity,
  blendMode,
  rotation = 0,
  flipHorizontal = false,
  flipVertical = false,
  locked = false,
  onClose
}: {
  instanceIds: readonly string[]
  name: string
  x: number
  y: number
  opacity: number
  blendMode: BlendMode
  rotation?: 0 | 1 | 2 | 3
  flipHorizontal?: boolean
  flipVertical?: boolean
  locked?: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const multiple = instanceIds.length > 1
  const [form, setForm] = useState({ x, y, opacity: Math.round(opacity * 100), blendMode, rotation: String(rotation) as '0' | '1' | '2' | '3', flipHorizontal, flipVertical })
  const transactionRef = useRef<string | null>(null)
  const changesRef = useRef<FreeTileInstancePropertyChanges>({})
  const blendOptions: Array<{ value: BlendMode; label: string }> = [
    { value: 'normal', label: t('blend.normal') }, { value: 'darken', label: t('blend.darken') }, { value: 'multiply', label: t('blend.multiply') },
    { value: 'color-burn', label: t('blend.colorBurn') }, { value: 'linear-burn', label: t('blend.linearBurn') }, { value: 'lighten', label: t('blend.lighten') },
    { value: 'screen', label: t('blend.screen') }, { value: 'color-dodge', label: t('blend.colorDodge') }, { value: 'linear-dodge', label: t('blend.linearDodge') },
    { value: 'overlay', label: t('blend.overlay') }, { value: 'soft-light', label: t('blend.softLight') }, { value: 'hard-light', label: t('blend.hardLight') },
    { value: 'vivid-light', label: t('blend.vividLight') }, { value: 'linear-light', label: t('blend.linearLight') }, { value: 'pin-light', label: t('blend.pinLight') },
    { value: 'hard-mix', label: t('blend.hardMix') }, { value: 'difference', label: t('blend.difference') }, { value: 'exclusion', label: t('blend.exclusion') },
    { value: 'subtract', label: t('blend.subtract') }, { value: 'divide', label: t('blend.divide') }, { value: 'hue', label: t('blend.hue') },
    { value: 'saturation', label: t('blend.saturation') }, { value: 'color', label: t('blend.color') }, { value: 'luminosity', label: t('blend.luminosity') }
  ]
  const blendGroup = (label: string, values: BlendMode[]): ThemedSelectGroup<BlendMode> => ({ label, options: blendOptions.filter((option) => values.includes(option.value)) })
  const blendGroups: ThemedSelectGroup<BlendMode>[] = [
    blendGroup(t('blend.group.basic'), ['normal']),
    blendGroup(t('blend.group.darken'), ['darken', 'multiply', 'color-burn', 'linear-burn']),
    blendGroup(t('blend.group.lighten'), ['lighten', 'screen', 'color-dodge', 'linear-dodge']),
    blendGroup(t('blend.group.contrast'), ['overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix']),
    blendGroup(t('blend.group.compare'), ['difference', 'exclusion', 'subtract', 'divide']),
    blendGroup(t('blend.group.components'), ['hue', 'saturation', 'color', 'luminosity'])
  ]
  const preview = (next: typeof form, changes: FreeTileInstancePropertyChanges): void => {
    const merged = { ...changesRef.current, ...changes }
    changesRef.current = merged
    setForm(next)
    const transactionId = transactionRef.current
    if (transactionId) useWorkspace.getState().previewFreeTileInstancePropertiesTransaction(transactionId, merged)
  }
  const close = (): void => {
    const transactionId = transactionRef.current
    transactionRef.current = null
    if (transactionId) useWorkspace.getState().commitFreeTileInstancePropertiesTransaction(transactionId, changesRef.current)
    onClose()
  }
  useEffect(() => {
    if (!transactionRef.current) transactionRef.current = useWorkspace.getState().beginFreeTileInstancePropertiesTransaction(instanceIds)
    return () => {
      const transactionId = transactionRef.current
      transactionRef.current = null
      if (transactionId) useWorkspace.getState().cancelFreeTileInstancePropertiesTransaction(transactionId)
    }
  }, [instanceIds])
  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', keyDown, true)
    return () => window.removeEventListener('keydown', keyDown, true)
  })

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <ModalShell as="form" storageKey="free-tile-instance-properties-v4" defaultWidth={410} defaultHeight={350} minWidth={370} minHeight={320} maxWidth={560} maxHeight={520} className="free-tile-instance-properties-dialog" role="dialog" aria-modal="true" aria-labelledby="free-tile-instance-properties-title" onSubmit={(event) => { event.preventDefault(); close() }}>
      <DialogHeader eyebrow="FREE TILE INSTANCE" title={multiple ? t('freeTiles.multipleInstanceProperties') : t('freeTiles.instancePropertiesTitle', { name })} titleId="free-tile-instance-properties-title" closeLabel={t('common.close')} onClose={close} />
      <div className="modal-body free-tile-instance-properties-body">
        <div className="free-tile-instance-position-grid">
          <FormField className="layer-properties-inline-field" layout="inline" label={t('layers.blendMode')}><ThemedSelect label={t('layers.blendMode')} value={form.blendMode} groups={blendGroups} onChange={(value) => preview({ ...form, blendMode: value }, { blendMode: value })} /></FormField>
          <RangeField className="layer-opacity-control" label={t('layers.opacity')} min={0} max={100} suffix="%" value={form.opacity} onChange={(value) => preview({ ...form, opacity: value }, { opacity: value / 100 })} />
          <FormField className="layer-properties-inline-field free-tile-instance-section-start" layout="inline" label={t('freeTiles.instanceRotation')}><SegmentedControl className="free-tile-instance-rotation-control" label={t('freeTiles.instanceRotation')} value={form.rotation} options={(['0', '1', '2', '3'] as const).map((value) => ({ value, label: `${Number(value) * 90}°`, disabled: locked }))} onChange={(value) => preview({ ...form, rotation: value }, { rotation: Number(value) as 0 | 1 | 2 | 3 })} /></FormField>
          <FormField className="layer-properties-inline-field" layout="inline" label={t('freeTiles.instanceMirror')}><div className="free-tile-instance-mirror-control">
            <Tooltip content={t('freeTiles.instanceMirrorHorizontal')}><button type="button" className={form.flipHorizontal ? 'active' : ''} aria-label={t('freeTiles.instanceMirrorHorizontal')} aria-pressed={form.flipHorizontal} disabled={locked} onClick={() => preview({ ...form, flipHorizontal: !form.flipHorizontal }, { flipHorizontal: !form.flipHorizontal })}><PixelUtilityIcon kind="selectionFlipHorizontal" /><span>{t('freeTiles.instanceMirrorHorizontalShort')}</span></button></Tooltip>
            <Tooltip content={t('freeTiles.instanceMirrorVertical')}><button type="button" className={form.flipVertical ? 'active' : ''} aria-label={t('freeTiles.instanceMirrorVertical')} aria-pressed={form.flipVertical} disabled={locked} onClick={() => preview({ ...form, flipVertical: !form.flipVertical }, { flipVertical: !form.flipVertical })}><PixelUtilityIcon kind="selectionFlipVertical" /><span>{t('freeTiles.instanceMirrorVerticalShort')}</span></button></Tooltip>
          </div></FormField>
          <FormField className="layer-properties-inline-field free-tile-instance-section-start" layout="inline" label={t('freeTiles.instanceX')}><NumberInput disabled={locked} min={-MAX_FREE_TILE_COORDINATE} max={MAX_FREE_TILE_COORDINATE} suffix="px" value={form.x} onValueChange={(value) => preview({ ...form, x: value }, { x: value })} /></FormField>
          <FormField className="layer-properties-inline-field" layout="inline" label={t('freeTiles.instanceY')}><NumberInput disabled={locked} min={-MAX_FREE_TILE_COORDINATE} max={MAX_FREE_TILE_COORDINATE} suffix="px" value={form.y} onValueChange={(value) => preview({ ...form, y: value }, { y: value })} /></FormField>
        </div>
      </div>
    </ModalShell>
  </div>
}
