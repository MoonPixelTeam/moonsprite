import type { RuntimeDiagnosticDetail } from './runtime-diagnostics'

export const GRADIENT_PREVIEW_DIAGNOSTIC_VERSION = 'gradient-preview-v1'
const stages = ['prepare', 'raster', 'upload', 'total', 'inputLag'] as const
export type GradientPreviewTiming = Record<typeof stages[number], number>

/** One small summary after a drag settles; no per-frame persistence or pixel data. */
export const createGradientPreviewDiagnostics = (emit: (detail: RuntimeDiagnosticDetail) => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let frames = 0
  let context: RuntimeDiagnosticDetail = {}
  let sums = stages.map(() => 0)
  let maxima = stages.map(() => 0)
  let lastKey = ''
  const flush = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (!frames) return
    const detail: RuntimeDiagnosticDetail = { version: GRADIENT_PREVIEW_DIAGNOSTIC_VERSION, ...context, frames }
    stages.forEach((stage, index) => {
      detail[`${stage}MeanMs`] = Math.round(sums[index] / frames * 10) / 10
      detail[`${stage}MaxMs`] = Math.round(maxima[index] * 10) / 10
    })
    frames = 0
    sums = stages.map(() => 0)
    maxima = stages.map(() => 0)
    emit(detail)
  }
  return {
    record(key: string, detail: RuntimeDiagnosticDetail, timing: GradientPreviewTiming): void {
      if (frames && key !== lastKey) flush()
      lastKey = key
      context = detail
      frames++
      stages.forEach((stage, index) => {
        const value = Number.isFinite(timing[stage]) ? Math.max(0, timing[stage]) : 0
        sums[index] += value
        maxima[index] = Math.max(maxima[index], value)
      })
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(flush, 1000)
    },
    flush
  }
}
