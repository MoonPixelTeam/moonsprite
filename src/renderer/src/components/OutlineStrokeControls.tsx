import type { OutlineDirection, OutlineDirections, OutlineKernel, OutlinePosition } from '@shared/types'
import { outlineDirectionsForKernel, outlineDirectionsMatchKernel } from '@/core/outline-settings'
import { RangeField } from './RangeField'
import { SegmentedControl } from './SegmentedControl'
import { useI18n } from './I18nProvider'
import { PixelAssetIcon } from './app/editor-tools'
import outlineKernelRoundIcon from '@/assets/pixel-icons/outline-kernel-round.svg'
import outlineKernelSquareIcon from '@/assets/pixel-icons/outline-kernel-square.svg'
import outlineKernelHorizontalIcon from '@/assets/pixel-icons/outline-kernel-horizontal.svg'
import outlineKernelVerticalIcon from '@/assets/pixel-icons/outline-kernel-vertical.svg'
import outlineDirectionOffIcon from '@/assets/pixel-icons/outline-direction-off.svg'
import outlineDirectionOnIcon from '@/assets/pixel-icons/outline-direction-on.svg'

const directionGrid: Array<OutlineDirection | 'center'> = ['nw', 'n', 'ne', 'w', 'center', 'e', 'sw', 's', 'se']
const quickShapeIds: OutlineKernel[] = ['round', 'square', 'horizontal', 'vertical']

const kernelIcons: Record<OutlineKernel, string> = {
  round: outlineKernelRoundIcon,
  square: outlineKernelSquareIcon,
  horizontal: outlineKernelHorizontalIcon,
  vertical: outlineKernelVerticalIcon
}

function OutlineKernelIcon({ kernel }: { kernel: OutlineKernel }) {
  return <PixelAssetIcon className="outline-kernel-icon" src={kernelIcons[kernel]} />
}

interface OutlineStrokeControlsProps {
  directions: OutlineDirections
  kernel: OutlineKernel
  maxThickness?: number
  onPatternChange: (kernel: OutlineKernel, directions: OutlineDirections) => void
  onPositionChange: (position: OutlinePosition) => void
  onThicknessChange: (thickness: number) => void
  position: OutlinePosition
  positions?: readonly OutlinePosition[]
  thickness: number
  variant?: 'default' | 'dialog'
}

export function OutlineStrokeControls({ directions, kernel, maxThickness = 64, onPatternChange, onPositionChange, onThicknessChange, position, positions = ['outside', 'inside'], thickness, variant = 'default' }: OutlineStrokeControlsProps) {
  const { t } = useI18n()
  const activeQuickShape = outlineDirectionsMatchKernel(kernel, directions) ? kernel : null
  const applyQuickShape = (nextKernel: OutlineKernel): void => onPatternChange(nextKernel, outlineDirectionsForKernel(nextKernel))
  const toggleDirection = (direction: OutlineDirection): void => onPatternChange('square', { ...directions, [direction]: !directions[direction] })
  const quickShapes = quickShapeIds.map((id) => ({ id, label: t(`outline.shape.${id}`) }))

  return <>
    <section className="outline-width-setting"><RangeField className="outline-width-row" label={t('outline.width')} min={1} max={maxThickness} suffix="px" value={thickness} onChange={onThicknessChange} /></section>
    <fieldset className={`outline-settings-fieldset${variant === 'dialog' ? ' outline-settings-fieldset-dialog' : ''}`}><legend>{t('outline.settings')}</legend>
      <div className="outline-setting-group"><span>{t('outline.position')}</span><SegmentedControl className={`outline-position-control positions-${positions.length}`} label={t('outline.position')} options={positions.map((value) => ({ value, label: t(`outline.${value}`) }))} value={position} onChange={onPositionChange} /></div>
      <div className="outline-pattern-layout">
        <div className="outline-setting-group"><span>{t('outline.quickShapes')}</span><div className="outline-quick-shapes">{quickShapes.map((shape) => <button key={shape.id} type="button" className={activeQuickShape === shape.id ? 'selected' : ''} title={shape.label} aria-label={shape.label} onClick={() => applyQuickShape(shape.id)}><OutlineKernelIcon kernel={shape.id} /></button>)}</div></div>
        <div className="outline-setting-group outline-direction-setting"><span>{t('outline.pixelDirections')}</span><div className="outline-direction-grid" aria-label={t('outline.pixelDirectionsAria')}>{directionGrid.map((direction) => {
          if (direction === 'center') return <span key={direction} className="outline-direction-center" aria-hidden="true"><i /></span>
          const selected = directions[direction]
          return <button key={direction} type="button" className={selected ? 'selected' : ''} title={t('outline.allowDirection', { direction })} aria-label={t('outline.allowDirection', { direction })} onClick={() => toggleDirection(direction)}><PixelAssetIcon className="outline-direction-marker" src={selected ? outlineDirectionOnIcon : outlineDirectionOffIcon} /></button>
        })}</div></div>
      </div>
    </fieldset>
  </>
}
