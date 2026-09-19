import { useEffect, useMemo, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import type { FloatingPosition, ViewportSize } from '@/core/panel-preferences'
import type { WorkspacePanelId } from '@/core/panel-layout'
import { POPUP_PANEL_STORAGE_KEYS } from '@/core/workspace-layout-preferences'

export interface PopupPanelAnchor {
  x: number
  y: number
}

const POPUP_PANEL_DEFAULT_SIZES: Record<WorkspacePanelId, { width: number; height: number }> = {
  color: { width: 360, height: 520 },
  palette: { width: 360, height: 520 },
  layers: { width: 760, height: 520 },
  freeTileInstances: { width: 360, height: 420 },
  history: { width: 320, height: 420 },
  preview: { width: 360, height: 380 },
  reference: { width: 360, height: 380 },
  tileset: { width: 420, height: 520 },
  brushes: { width: 380, height: 480 }
}

export function popupPanelInitialPosition(id: WorkspacePanelId, anchor: PopupPanelAnchor, viewport: ViewportSize): FloatingPosition {
  const margin = 6
  const defaults = POPUP_PANEL_DEFAULT_SIZES[id]
  const width = Math.max(180, Math.min(defaults.width, viewport.width - margin * 2))
  const height = Math.max(120, Math.min(defaults.height, viewport.height - margin * 2))
  const maximumX = Math.max(margin, viewport.width - width - margin)
  const maximumY = Math.max(margin, viewport.height - height - margin)
  return {
    x: Math.max(margin, Math.min(maximumX, anchor.x - width / 2)),
    y: Math.max(margin, Math.min(maximumY, anchor.y - height / 2)),
    width,
    height
  }
}

export function PopupPanelWindow({ id, anchor, label, onClose, renderPanel }: {
  id: WorkspacePanelId
  anchor: PopupPanelAnchor
  label: string
  onClose: () => void
  renderPanel: (startDrag: (event: ReactPointerEvent<HTMLElement>) => void) => ReactNode
}) {
  const initialPosition = useMemo(
    () => popupPanelInitialPosition(id, anchor, { width: window.innerWidth, height: window.innerHeight }),
    [anchor.x, anchor.y, id]
  )
  const floating = useFloatingPanel(
    initialPosition,
    false,
    false,
    POPUP_PANEL_STORAGE_KEYS[id],
    true,
    undefined,
    false,
    { minWidth: 180, minHeight: 120, restoreSizeOnly: true }
  )

  useEffect(() => {
    window.addEventListener('blur', onClose)
    return () => window.removeEventListener('blur', onClose)
  }, [onClose])

  return <div className="workspace-panel-popup-layer" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section
      ref={floating.ref}
      className="workspace-panel-popup"
      data-popup-panel-id={id}
      role="dialog"
      aria-label={label}
      style={floating.style}
      onPointerDown={floating.bringToFront}
    >
      {renderPanel(floating.startDrag)}
      <PanelResizeHandles onResize={floating.startResize} />
    </section>
  </div>
}
