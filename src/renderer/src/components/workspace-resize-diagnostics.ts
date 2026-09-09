import type { RuntimeDiagnosticDetail } from '@/core/runtime-diagnostics'

export type ResizeStage = 'layout' | 'main' | 'backing' | 'composite' | 'preview' | 'observer' | 'inputWait' | 'settle'

/** Fixed-size numeric summaries only: no per-frame logs or document traversal. */
export function createResizeDiagnostics() {
  const stages = new Map<ResizeStage, { count: number; total: number; max: number }>()
  let context: RuntimeDiagnosticDetail = {}
  return {
    context(detail: RuntimeDiagnosticDetail): void { context = detail },
    record(stage: ResizeStage, ms: number): void {
      if (!Number.isFinite(ms) || ms < 0) return
      const value = stages.get(stage) ?? { count: 0, total: 0, max: 0 }
      value.count++
      value.total += ms
      value.max = Math.max(value.max, ms)
      stages.set(stage, value)
    },
    snapshot(): RuntimeDiagnosticDetail {
      const detail: RuntimeDiagnosticDetail = { version: 'dock-resize-v1', ...context }
      for (const [stage, value] of stages) {
        detail[`${stage}Count`] = value.count
        detail[`${stage}MeanMs`] = Math.round(value.total / value.count * 10) / 10
        detail[`${stage}MaxMs`] = Math.round(value.max * 10) / 10
      }
      return detail
    }
  }
}
