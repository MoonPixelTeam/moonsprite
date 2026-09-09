import { recordRuntimeDiagnostic, type RuntimeDiagnosticDetail } from '@/core/runtime-diagnostics'
import { createResizeDiagnostics, type ResizeStage } from './workspace-resize-diagnostics'
let active = false
let diagnostics = createResizeDiagnostics()
const settled = new Set<() => void>()

export const isWorkspaceResizing = (): boolean => active
export const beginWorkspaceResize = (): void => {
  if (!active) diagnostics = createResizeDiagnostics()
  active = true
}
export const recordWorkspaceResizeStage = (stage: ResizeStage, duration: number): void => {
  if (active) diagnostics.record(stage, duration)
}
export const recordWorkspaceResizeContext = (detail: RuntimeDiagnosticDetail): void => {
  if (active) diagnostics.context(detail)
}
export const endWorkspaceResize = (): void => {
  if (!active) return
  active = false
  const started = performance.now()
  for (const listener of settled) listener()
  diagnostics.record('settle', performance.now() - started)
  const detail = diagnostics.snapshot()
  // Persistence runs after the release event, never inside a pointer frame.
  window.setTimeout(() => recordRuntimeDiagnostic('operation-stage', 'workspace.resize', detail), 0)
}
export const onWorkspaceResizeEnd = (listener: () => void): (() => void) => {
  settled.add(listener)
  return () => { settled.delete(listener) }
}

/** Only the latest pointer position can be displayed in a browser frame. */
export function createResizeFrame(apply: (point: { clientX: number; clientY: number }) => void) {
  let frame: number | null = null
  let queuedAt = 0
  let pending: { clientX: number; clientY: number } | null = null
  const flush = (): void => {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
    const point = pending
    pending = null
    if (point) {
      const started = performance.now()
      recordWorkspaceResizeStage('inputWait', started - queuedAt)
      apply(point)
      recordWorkspaceResizeStage('layout', performance.now() - started)
    }
  }
  return {
    push(point: { clientX: number; clientY: number }): void {
      pending = { clientX: point.clientX, clientY: point.clientY }
      if (frame === null) {
        queuedAt = performance.now()
        frame = window.requestAnimationFrame(flush)
      }
    },
    flush,
    cancel(): void {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = null
      pending = null
    }
  }
}
