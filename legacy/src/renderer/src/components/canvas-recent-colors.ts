import type { CanvasDragState } from '@/core/canvas-input'
import { pixelEditHasChanges } from '@/core/history'
import { rememberRecentColors } from '@/core/recent-colors'
const recorded = new WeakSet<CanvasDragState>()
/** Only inspect live paint edits, once they have written pixels. */
export function rememberPaintedDrag(drag: CanvasDragState | null, tool: string): void {
  if (!drag || recorded.has(drag) || !['draw', 'airbrush', 'shape', 'fill', 'gradient'].includes(drag.kind) || tool === 'eraser' || !drag.color || drag.color.a === 0 || !pixelEditHasChanges(drag.edit)) return
  recorded.add(drag)
  rememberRecentColors(drag.gradientEndColor ? [drag.gradientEndColor, drag.color] : [drag.color])
}
