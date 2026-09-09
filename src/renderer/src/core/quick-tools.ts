import type { FillKind, LineKind, MoveKind, SelectionKind, ShapeKind, ToolId } from '@shared/types'
import {
  deriveShortcutConflicts,
  normalizeShortcut,
  shortcutBindingBlocked,
  shortcutBindingsFor,
  shortcutHeldByKeyParts,
  type ShortcutBindings,
  type ShortcutConflictState
} from './shortcuts'
import { QUICK_TOOL_SHORTCUT_IDS, type QuickToolShortcutId } from './tool-shortcut-ids'

export interface QuickToolTarget {
  tool: ToolId
  moveKind?: MoveKind
  selectionKind?: SelectionKind
  shapeKind?: ShapeKind
  lineKind?: LineKind
  fillKind?: FillKind
}

export interface QuickToolMatch {
  id: QuickToolShortcutId
  binding: string
  target: QuickToolTarget
}

export interface QuickToolSessionState {
  tool: ToolId
  moveKind: MoveKind
  selectionKind: SelectionKind
  shapeKind: ShapeKind
  lineKind: LineKind
  fillKind: FillKind
}

export const QUICK_TOOL_TARGETS: Record<QuickToolShortcutId, QuickToolTarget> = {
  'tool.pencil.quick': { tool: 'pencil' },
  'tool.airbrush.quick': { tool: 'airbrush' },
  'tool.eraser.quick': { tool: 'eraser' },
  'tool.selection.quick': { tool: 'selection', selectionKind: 'rectangle' },
  'tool.selection.ellipse.quick': { tool: 'selection', selectionKind: 'ellipse' },
  'lasso.quick': { tool: 'selection', selectionKind: 'lasso' },
  'polygonLasso.quick': { tool: 'selection', selectionKind: 'polygon-lasso' },
  'magic.quick': { tool: 'selection', selectionKind: 'magic' },
  'tool.move.quick': { tool: 'move', moveKind: 'move' },
  'tool.slice.quick': { tool: 'move', moveKind: 'slice' },
  'tool.shape.quick': { tool: 'shape' },
  'tool.shape.rectangleOutline.quick': { tool: 'shape', shapeKind: 'rectangle-outline' },
  'tool.shape.rectangle.quick': { tool: 'shape', shapeKind: 'rectangle' },
  'tool.shape.ellipseOutline.quick': { tool: 'shape', shapeKind: 'ellipse-outline' },
  'tool.shape.ellipse.quick': { tool: 'shape', shapeKind: 'ellipse' },
  'tool.shape.freeform.quick': { tool: 'shape', shapeKind: 'freeform' },
  'tool.shape.polygon.quick': { tool: 'shape', shapeKind: 'polygon' },
  'tool.line.quick': { tool: 'line', lineKind: 'line' },
  'tool.curve.quick': { tool: 'line', lineKind: 'curve' },
  'tool.text.quick': { tool: 'text' },
  'tool.fill.quick': { tool: 'fill', fillKind: 'bucket' },
  'tool.fill.gradient.quick': { tool: 'fill', fillKind: 'gradient' },
  'tool.eyedropper.quick': { tool: 'eyedropper' },
  'tool.hand.quick': { tool: 'hand' },
  'tool.zoom.quick': { tool: 'zoom' },
  'tool.rotate.quick': { tool: 'rotate' },
  'tool.smooth.quick': { tool: 'smooth' },
  'tool.liquify.quick': { tool: 'liquify' }
}

export function resolveHeldQuickTool(
  shortcuts: ShortcutBindings,
  heldParts: ReadonlySet<string>,
  conflictState: ShortcutConflictState = deriveShortcutConflicts(shortcuts)
): QuickToolMatch | null {
  let best: (QuickToolMatch & { specificity: number }) | null = null
  for (const id of QUICK_TOOL_SHORTCUT_IDS) {
    for (const binding of shortcutBindingsFor(shortcuts, id)) {
      if (shortcutBindingBlocked(conflictState, id, binding) || !shortcutHeldByKeyParts(heldParts, binding)) continue
      const specificity = normalizeShortcut(binding).split('+').filter(Boolean).length
      if (!best || specificity > best.specificity) best = { id, binding, target: QUICK_TOOL_TARGETS[id], specificity }
    }
  }
  return best ? { id: best.id, binding: best.binding, target: best.target } : null
}

export const quickToolNeedsContextualCanvasHandling = (target: QuickToolTarget): boolean =>
  (target.tool === 'move' && target.moveKind === 'move') || target.tool === 'eyedropper' || target.tool === 'hand'

export function applyQuickToolTarget<T extends QuickToolSessionState>(session: T, target: QuickToolTarget | null): T {
  if (!target) return session
  const next = {
    tool: target.tool,
    ...(target.moveKind === undefined ? {} : { moveKind: target.moveKind }),
    ...(target.selectionKind === undefined ? {} : { selectionKind: target.selectionKind }),
    ...(target.shapeKind === undefined ? {} : { shapeKind: target.shapeKind }),
    ...(target.lineKind === undefined ? {} : { lineKind: target.lineKind }),
    ...(target.fillKind === undefined ? {} : { fillKind: target.fillKind })
  }
  const changed = Object.entries(next).some(([key, value]) => session[key as keyof QuickToolSessionState] !== value)
  return changed ? { ...session, ...next } : session
}
