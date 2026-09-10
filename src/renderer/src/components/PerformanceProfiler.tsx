import { Profiler, type ReactNode } from 'react'
import { recordWorkspaceResizeReact } from './workspace-resize'

const enabled = typeof __MOONSPRITE_REACT_PROFILE__ !== 'undefined'
  && __MOONSPRITE_REACT_PROFILE__
  && new URLSearchParams(window.location.search).has('moonsprite-perf')

export function PerformanceProfiler({ id, children }: { id: string; children: ReactNode }) {
  if (!enabled && !import.meta.env.DEV) return children
  return <Profiler id={id} onRender={(region, phase, actualDuration) => {
    if (enabled) window.__moonSpriteCanvasProbe?.recordReactCommit?.(region, actualDuration, phase)
    if (import.meta.env.DEV) recordWorkspaceResizeReact(region, actualDuration)
  }}>{children}</Profiler>
}
