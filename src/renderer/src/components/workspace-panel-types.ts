import type { PanelDockPlacement } from './panel-docking'
import type { FixedPanelDock } from '@/components/floating-panel'

export interface DockDragProps {
  docked?: boolean
  onDockDragStart?: (event: React.PointerEvent<HTMLElement>, detach: (clientX: number, clientY: number, continueDrag?: boolean) => void) => void
  onPanelContextMenu?: (event: React.MouseEvent<HTMLElement>) => void
  onFloatingDock?: (dock: FixedPanelDock, placement?: PanelDockPlacement) => void
  onRestoreSquare?: (preferBottom?: boolean) => void
}
