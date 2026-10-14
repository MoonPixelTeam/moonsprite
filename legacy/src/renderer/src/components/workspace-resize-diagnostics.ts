import type { RuntimeDiagnosticDetail } from '@/core/runtime-diagnostics'

export type ResizeStage = 'layout' | 'main' | 'backing' | 'composite' | 'preview' | 'observer' | 'inputWait' | 'settle' | 'allocation'

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

/** Nested React regions overlap: report the slowest regions, never sum them. */
export function createResizeReactDiagnostics() {
  const regions = new Map<string, { count: number; total: number; max: number }>()
  return {
    record(id: string, duration: number): void {
      if (!Number.isFinite(duration) || duration < 0) return
      if (!regions.has(id) && regions.size >= 24) return
      const value = regions.get(id) ?? { count: 0, total: 0, max: 0 }
      value.count++; value.total += duration; value.max = Math.max(value.max, duration)
      regions.set(id, value)
    },
    snapshot(): RuntimeDiagnosticDetail {
      const detail: RuntimeDiagnosticDetail = { version: 'dock-react-v1', regionCount: regions.size }
      const slowest = [...regions].sort((a, b) => b[1].max - a[1].max).slice(0, 6)
      slowest.forEach(([id, value], index) => {
        detail[`region${index}`] = id
        detail[`count${index}`] = value.count
        detail[`maxMs${index}`] = Math.round(value.max * 10) / 10
        detail[`meanMs${index}`] = Math.round(value.total / value.count * 10) / 10
      })
      return detail
    }
  }
}
