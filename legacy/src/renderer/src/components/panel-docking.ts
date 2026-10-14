import type { CSSProperties } from 'react'
import type { WorkspacePanelId } from '@/core/panel-layout'
import type { FixedPanelDock } from './floating-panel'

export const PANEL_DRAG_THRESHOLD = 8
export const PANEL_DOCK_DELAY = 100
export interface PanelDockPlacement { id?: WorkspacePanelId; insertAfter: boolean }
export interface PanelDockZone extends PanelDockPlacement {
  dock: FixedPanelDock
  bounds: DOMRect
  preview: CSSProperties
}
export const panelDockKey = (zone: PanelDockZone): string => `${zone.dock}:${zone.id ?? ''}:${zone.insertAfter}`

// Panel edges have generous landing areas, with a neutral strip in the middle.
// Confirmed targets tolerate pointer jitter; empty docks keep narrow edge bands.
export function panelDockZoneAt(x: number, y: number, movingId?: WorkspacePanelId, current?: PanelDockZone | null): PanelDockZone | null {
  const contains = (r: DOMRect, margin = 0) => x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin
  if (current && contains(current.bounds, 8)) return current
  const candidates: PanelDockZone[] = []
  const stage = document.querySelector<HTMLElement>('.stage-wrap')?.getBoundingClientRect()
  for (const dock of ['left', 'bottom', 'right'] as const) {
    const host = document.querySelector<HTMLElement>(`[data-panel-dock-zone="${dock}"]`)
    const bounds = host?.getBoundingClientRect()
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      const slots = [...host!.querySelectorAll<HTMLElement>('[data-inspector-panel-id]')].filter(slot => slot.dataset.inspectorPanelId !== movingId)
      for (const slot of slots) {
        const r = slot.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) continue
        for (const insertAfter of [false, true]) {
          const horizontal = dock === 'bottom'
          const edge = horizontal ? (insertAfter ? r.right : r.left) : (insertAfter ? r.bottom : r.top)
          const reach = Math.min(160, (horizontal ? r.width : r.height) * .4)
          const start = edge - (insertAfter ? reach : 16)
          const hit = horizontal ? new DOMRect(start, r.top, reach + 16, r.height) : new DOMRect(r.left, start, r.width, reach + 16)
          const preview = horizontal
            ? { position: 'fixed' as const, left: edge - 2, top: r.top, width: 4, height: r.height }
            : { position: 'fixed' as const, left: r.left, top: edge - 2, width: r.width, height: 4 }
          candidates.push({ dock, id: slot.dataset.inspectorPanelId as WorkspacePanelId, insertAfter, bounds: hit, preview })
        }
      }
      // Do not turn the dragged panel's own interior into a new landing area.
      if (slots.length || host!.querySelector('[data-inspector-panel-id]')) continue
    }
    const r = bounds && bounds.width > 0 && bounds.height > 0 ? bounds : stage
    if (!r) continue
    const width = Math.min(24, r.width)
    const height = Math.min(24, r.height)
    const hit = dock === 'bottom' ? new DOMRect(r.left, r.bottom - height, r.width, height)
      : new DOMRect(dock === 'left' ? r.left : r.right - width, r.top, width, r.height)
    candidates.push({ dock, bounds: hit, insertAfter: true, preview: { position: 'fixed', left: hit.left, top: hit.top, width: hit.width, height: hit.height } })
  }
  // Corners choose the nearest visible landing band instead of a fixed side priority.
  return candidates.filter(candidate => contains(candidate.bounds)).sort((a, b) => {
    const distance = (zone: PanelDockZone) => zone.bounds.width < zone.bounds.height
      ? Math.abs(x - (zone.bounds.left + zone.bounds.width / 2)) / Math.max(1, zone.bounds.width)
      : Math.abs(y - (zone.bounds.top + zone.bounds.height / 2)) / Math.max(1, zone.bounds.height)
    return distance(a) - distance(b)
  })[0] ?? null
}

export function createPanelDockIntent(onChange: (zone: PanelDockZone | null) => void) {
  let candidate: PanelDockZone | null = null
  let active: PanelDockZone | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    candidate = null
    active = null
    onChange(null)
  }
  return {
    get active() { return active },
    update(next: PanelDockZone | null) {
      if (candidate && next && panelDockKey(candidate) === panelDockKey(next)) return
      clear()
      if (!next) return
      candidate = next
      timer = setTimeout(() => {
        timer = undefined
        active = candidate
        onChange(active)
      }, PANEL_DOCK_DELAY)
    },
    clear
  }
}
