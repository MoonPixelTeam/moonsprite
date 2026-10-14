import { useRef } from 'react'
import { DEFAULT_TWEEN_CURVE, TWEEN_PRESET_CURVES, tweenProgress, type TweenCurve, type TweenEasing } from '@/core/tween-easing'
import { useI18n } from './I18nProvider'
import { FormField } from './FormField'
import { NumberInput } from './NumberInput'
import { Button } from './Button'
import { CurvePlot, curvePlotPoint } from './CurvePlot'
import './tween-easing-editor.css'

export function TweenEasingEditor({ easing, curve: customCurve = DEFAULT_TWEEN_CURVE, frameCount, onChange }: {
  easing: TweenEasing; curve?: TweenCurve; frameCount: number; onChange(curve: TweenCurve): void
}) {
  const { t } = useI18n()
  const drag = useRef<{ id: number; point: 0 | 2; original: TweenCurve } | null>(null)
  const curve = easing === 'custom' ? customCurve : TWEEN_PRESET_CURVES[easing]
  const update = (index: number, value: number) => {
    const next = [...curve] as [number, number, number, number]
    next[index] = Math.max(0, Math.min(1, value))
    onChange(next)
  }
  const plot = Array.from({ length: 101 }, (_, i) => `${i ? 'L' : 'M'}${i} ${100 - tweenProgress(i / 100, easing, curve) * 100}`).join(' ')
  return <div className="tween-easing-editor">
    <p className="modal-note">{t('timeline.tween.curveHint')}</p>
    <CurvePlot label={t('timeline.tween.curve')} xLabel={t('timeline.tween.curveTime')} yLabel={t('timeline.tween.curveProgress')}
      onPointerMove={event => {
        const active = drag.current
        if (!active || active.id !== event.pointerId) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const next = [...curve] as [number, number, number, number]
        const point = curvePlotPoint(event.clientX, event.clientY, rect)
        next[active.point] = point.x
        next[active.point + 1] = point.y
        onChange(next)
      }}
      onPointerUp={event => { if (drag.current?.id === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) } }}
      onPointerCancel={() => { if (drag.current) onChange(drag.current.original); drag.current = null }}
      onLostPointerCapture={() => { drag.current = null }}>
      <path className="tween-easing-line" d={plot} />
      {Array.from({ length: Math.min(frameCount, 40) + 1 }, (_, i) => {
        const time = i / Math.max(1, Math.min(frameCount, 40))
        return <circle className="tween-easing-sample" key={i} cx={time * 100} cy={100 - tweenProgress(time, easing, curve) * 100} r="1" />
      })}
      {<>
        <path className="tween-easing-handle-line" d={`M0 100L${curve[0] * 100} ${100 - curve[1] * 100} M100 0L${curve[2] * 100} ${100 - curve[3] * 100}`} />
        {([0, 2] as const).map((index) => <rect key={index} className="tween-easing-handle" x={curve[index] * 100 - 2.5} y={100 - curve[index + 1] * 100 - 2.5} width="5" height="5"
          onPointerDown={event => {
            if (event.button !== 0) return
            event.preventDefault()
            drag.current = { id: event.pointerId, point: index, original: curve }
            event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
          }} />)}
      </>}
    </CurvePlot>
    {<>
      <div className="tween-easing-values">{(['X1', 'Y1', 'X2', 'Y2'] as const).map((label, index) => <FormField key={label} label={label}><NumberInput aria-label={label} value={curve[index]} min={0} max={1} step={0.01} onValueChange={value => update(index, value)} /></FormField>)}</div>
      <Button onClick={() => onChange(DEFAULT_TWEEN_CURVE)}>{t('timeline.tween.curveReset')}</Button>
    </>}
  </div>
}
