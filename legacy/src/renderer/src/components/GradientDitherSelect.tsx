import { useEffect, useRef, useState } from 'react'
import type { GradientDither } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import { loadEditorPreferences, type CheckerboardPreferences } from '@/core/file-preferences'
import { gradientColorAt } from '@/core/gradient-color'
import type { TranslationKey } from '@/core/localization'
import { ThemedSelect } from './ThemedSelect'
import { useI18n } from './I18nProvider'

function GradientPresetPreview({ preset }: { preset: GradientDither }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [checkerboard, setCheckerboard] = useState<CheckerboardPreferences>(() => loadEditorPreferences().checkerboard)
  useEffect(() => {
    const syncPreferences = (): void => setCheckerboard(loadEditorPreferences().checkerboard)
    window.addEventListener('moonsprite:preferences-changed', syncPreferences)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const width = canvas.width
    const height = canvas.height
    const startColor: RgbaColor = { r: 0, g: 0, b: 0, a: 255 }
    const endColor: RgbaColor = { r: 255, g: 255, b: 255, a: 255 }
    context.clearRect(0, 0, width, height)
    context.fillStyle = `rgb(${checkerboard.darkColor.r} ${checkerboard.darkColor.g} ${checkerboard.darkColor.b})`
    context.fillRect(0, 0, width, height)
    context.fillStyle = `rgb(${checkerboard.lightColor.r} ${checkerboard.lightColor.g} ${checkerboard.lightColor.b})`
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) if (((x / 2) + (y / 2)) % 2 === 1) context.fillRect(x, y, 2, 2)
    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const color = gradientColorAt(startColor, endColor, x, y, { x: 0, y: 0 }, { x: width - 1, y: 0 }, preset)
      const offset = (y * width + x) * 4
      image.data[offset] = color.r
      image.data[offset + 1] = color.g
      image.data[offset + 2] = color.b
      image.data[offset + 3] = color.a
    }
    context.putImageData(image, 0, 0)
  }, [checkerboard, preset])
  return <canvas ref={canvasRef} className="gradient-preset-preview" width={104} height={16} aria-hidden="true" />
}

const gradientDitherGroups = (t: (key: TranslationKey) => string): Array<{ label: string; options: Array<{ value: GradientDither; label: string; description: string }> }> => [
  {
    label: t('toolOptions.gradientGroup.smooth'),
    options: [{ value: 'none', label: t('toolOptions.gradientDither.none'), description: t('toolOptions.gradientDither.noneDescription') }]
  },
  {
    label: t('toolOptions.gradientGroup.dither'),
    options: [
      { value: 'bayer-2', label: t('toolOptions.gradientDither.bayer2'), description: t('toolOptions.gradientDither.ditherDescription') },
      { value: 'bayer-4', label: t('toolOptions.gradientDither.bayer4'), description: t('toolOptions.gradientDither.ditherDescription') },
      { value: 'bayer-8', label: t('toolOptions.gradientDither.bayer8'), description: t('toolOptions.gradientDither.ditherDescription') },
      { value: 'checker', label: t('toolOptions.gradientDither.checker'), description: t('toolOptions.gradientDither.ditherDescription') },
      { value: 'diagonal', label: t('toolOptions.gradientDither.diagonalLeft'), description: t('toolOptions.gradientDither.ditherDescription') },
      { value: 'diagonal-reverse', label: t('toolOptions.gradientDither.diagonalRight'), description: t('toolOptions.gradientDither.ditherDescription') },
      { value: 'horizontal', label: t('toolOptions.gradientDither.horizontal'), description: t('toolOptions.gradientDither.ditherDescription') },
      { value: 'vertical', label: t('toolOptions.gradientDither.vertical'), description: t('toolOptions.gradientDither.ditherDescription') }
    ]
  }
]

export function GradientDitherSelect({ value, onChange, className = '', density = 'regular', label, popoverClassName = '', popoverWidth = 340, preserveAnimationSelection = false }: {
  value: GradientDither
  onChange: (value: GradientDither) => void
  className?: string
  density?: 'compact' | 'regular'
  label?: string
  popoverClassName?: string
  popoverWidth?: number
  preserveAnimationSelection?: boolean
}) {
  const { t } = useI18n()
  const controlLabel = label ?? t('toolOptions.gradientDither')
  return <span className={`gradient-dither-control ${className}`.trim()}><ThemedSelect<GradientDither>
    value={value}
    groups={gradientDitherGroups(t)}
    label={controlLabel}
    density={density}
    onChange={onChange}
    showCheck={false}
    showOptionTooltips={false}
    popoverClassName={`gradient-dither-popover ${popoverClassName}`.trim()}
    popoverWidth={popoverWidth}
    preserveAnimationSelection={preserveAnimationSelection}
    renderOption={(option) => <span className="gradient-option-content"><strong>{option.label}</strong><GradientPresetPreview preset={option.value} /></span>}
  /></span>
}
