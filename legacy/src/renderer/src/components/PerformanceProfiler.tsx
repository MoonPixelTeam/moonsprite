import { Profiler, type ReactNode } from 'react'
import { recordWorkspaceResizeReact } from './workspace-resize'

const enabled = new URLSearchParams(window.location.search).has('moonsprite-perf')
  && (import.meta.env.DEV || (typeof __MOONSPRITE_REACT_PROFILE__ !== 'undefined' && __MOONSPRITE_REACT_PROFILE__))

export function PerformanceProfiler({ id, children }: { id: string; children: ReactNode }) {
  // React 19 also expands changed props throughout a Profiler subtree. Large
  // timelines must not pay that diagnostic cost during ordinary editing.
  if (!enabled) return children
  return <Profiler id={id} onRender={(region, phase, actualDuration) => {
    if (enabled) window.__moonSpriteCanvasProbe?.recordReactCommit?.(region, actualDuration, phase)
    if (import.meta.env.DEV) recordWorkspaceResizeReact(region, actualDuration)
  }}>{children}</Profiler>
}
