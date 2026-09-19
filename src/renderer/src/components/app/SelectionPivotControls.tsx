import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CanvasAnchor, SelectionRect } from '@shared/types-selection'
import selectionPivotPresetsSprite from '@/assets/pixel-icons/selection-pivot-presets.png'
import { CheckboxField } from '@/components/CheckboxField'
import { useI18n } from '@/components/I18nProvider'
import type { TranslationKey } from '@/core/localization'
import { transformedSelectionPivotPreset, type SelectionShearTransform } from '@/core/selection'
import type { SelectionPivot } from '@/store/workspace'

type SelectionPivotTarget = SelectionRect & { mask?: never }

/** Project before the React prop boundary: typing a SelectionMask as a
 * SelectionRect does not remove its runtime mask. React's development timing
 * logs recursively enumerate changed props, including every typed-array entry. */
export const selectionPivotControlTarget = (target: SelectionRect | null): SelectionPivotTarget | null => target ? {
  x: target.x,
  y: target.y,
  width: target.width,
  height: target.height,
  ...(target.flipHorizontal === undefined ? {} : { flipHorizontal: target.flipHorizontal }),
  ...(target.flipVertical === undefined ? {} : { flipVertical: target.flipVertical }),
  ...(target.flipOriginX === undefined ? {} : { flipOriginX: target.flipOriginX }),
  ...(target.flipOriginY === undefined ? {} : { flipOriginY: target.flipOriginY })
} : null

interface SelectionPivotControlsProps {
  drawingAnchor?: boolean
  target: SelectionPivotTarget | null
  angle: number
  shear?: SelectionShearTransform
  pivot: SelectionPivot | null
  visible: boolean
  onPivotChange: (pivot: SelectionPivot) => void
  onVisibleChange: (visible: boolean) => void
}

interface PivotPresetItem {
  id: CanvasAnchor
  column: number
  row: number
  labelKey: TranslationKey
}

const PIVOT_PRESETS: PivotPresetItem[] = [
  { id: 'nw', column: 0, row: 0, labelKey: 'canvasResize.anchor.nw' },
  { id: 'n', column: 1, row: 0, labelKey: 'canvasResize.anchor.n' },
  { id: 'ne', column: 2, row: 0, labelKey: 'canvasResize.anchor.ne' },
  { id: 'w', column: 0, row: 1, labelKey: 'canvasResize.anchor.w' },
  { id: 'center', column: 1, row: 1, labelKey: 'canvasResize.anchor.center' },
  { id: 'e', column: 2, row: 1, labelKey: 'canvasResize.anchor.e' },
  { id: 'sw', column: 0, row: 2, labelKey: 'canvasResize.anchor.sw' },
  { id: 's', column: 1, row: 2, labelKey: 'canvasResize.anchor.s' },
  { id: 'se', column: 2, row: 2, labelKey: 'canvasResize.anchor.se' }
]

const pivotPointsEqual = (left: SelectionPivot, right: SelectionPivot): boolean =>
  Math.abs(left.x - right.x) < 1e-6 && Math.abs(left.y - right.y) < 1e-6

function SelectionPivotPresetIcon({ column, row }: Pick<PivotPresetItem, 'column' | 'row'>) {
  const sourceX = 1 + column * 11
  const sourceY = 1 + row * 11
  return <span
    className="selection-pivot-preset-icon"
    style={{
      WebkitMaskImage: `url("${selectionPivotPresetsSprite}")`,
      maskImage: `url("${selectionPivotPresetsSprite}")`,
      WebkitMaskPosition: `${-sourceX * 2}px ${-sourceY * 2}px`,
      maskPosition: `${-sourceX * 2}px ${-sourceY * 2}px`
    } as CSSProperties}
    aria-hidden="true"
  />
}

export function SelectionPivotControls({ target, angle, shear, pivot, visible, onPivotChange, onVisibleChange, drawingAnchor = false }: SelectionPivotControlsProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const activePreset = useMemo(() => {
    if (!target) return null
    const current = pivot ?? transformedSelectionPivotPreset(target, 'center', angle, shear)
    return PIVOT_PRESETS.find((preset) => pivotPointsEqual(current, transformedSelectionPivotPreset(target, preset.id, angle, shear)))?.id ?? null
  }, [angle, pivot, shear, target])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      if (triggerRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const closeOnKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('keydown', closeOnKey, true)
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('keydown', closeOnKey, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const placePopover = (): void => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const popover = popoverRef.current?.getBoundingClientRect()
      if (!trigger || !popover) return
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - popover.width - 8, trigger.left)),
        top: trigger.bottom + 2
      })
    }
    placePopover()
    window.addEventListener('resize', placePopover)
    window.addEventListener('scroll', placePopover, true)
    return () => {
      window.removeEventListener('resize', placePopover)
      window.removeEventListener('scroll', placePopover, true)
    }
  }, [open])

  const choosePreset = (preset: CanvasAnchor): void => {
    if (!target) return
    onPivotChange(transformedSelectionPivotPreset(target, preset, angle, shear))
  }

  const popover = open ? createPortal(<div
    ref={popoverRef}
    className="selection-pivot-popover"
    role="dialog"
    aria-label={t('toolOptions.selectionPivotPresets')}
    style={position}
  >
    <CheckboxField className="selection-pivot-visibility" checked={visible} label={t(drawingAnchor ? 'toolOptions.showDrawingAnchor' : 'toolOptions.showSelectionPivot')} onChange={onVisibleChange} />
    <div className="selection-pivot-grid" role="group" aria-label={t('toolOptions.selectionPivotPresets')}>
      {PIVOT_PRESETS.map((preset) => {
        const label = t(preset.labelKey)
        return <button
          key={preset.id}
          type="button"
          className={activePreset === preset.id ? 'selected' : ''}
          title={label}
          aria-label={label}
          aria-pressed={activePreset === preset.id}
          disabled={!target}
          onClick={() => choosePreset(preset.id)}
        ><SelectionPivotPresetIcon column={preset.column} row={preset.row} /></button>
      })}
    </div>
  </div>, document.body) : null

  return <div className="selection-pivot-control">
    <button
      ref={triggerRef}
      type="button"
      className={`icon-button selection-pivot-trigger ${open ? 'active' : ''}`}
      title={t(drawingAnchor ? 'toolOptions.adjustDrawingAnchor' : 'toolOptions.adjustSelectionPivot')}
      aria-label={t(drawingAnchor ? 'toolOptions.adjustDrawingAnchor' : 'toolOptions.adjustSelectionPivot')}
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    ><SelectionPivotPresetIcon column={1} row={1} /></button>
    {popover}
  </div>
}
