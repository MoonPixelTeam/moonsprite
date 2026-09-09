export const CYCLING_TOOL_SHORTCUT_IDS = [
  'tool.pencil', 'tool.airbrush', 'tool.eraser', 'tool.selection', 'tool.selection.ellipse',
  'lasso', 'polygonLasso', 'magic', 'tool.move', 'tool.slice', 'tool.shape',
  'tool.shape.rectangleOutline', 'tool.shape.rectangle', 'tool.shape.ellipseOutline',
  'tool.shape.ellipse', 'tool.shape.freeform', 'tool.shape.polygon', 'tool.line',
  'tool.curve', 'tool.text', 'tool.fill', 'tool.fill.gradient', 'tool.eyedropper',
  'tool.hand', 'tool.zoom', 'tool.rotate', 'tool.liquify', 'tool.smooth'
] as const

export type CyclingToolShortcutId = typeof CYCLING_TOOL_SHORTCUT_IDS[number]
export type QuickToolShortcutId = `${CyclingToolShortcutId}.quick`

export const quickToolShortcutId = (id: CyclingToolShortcutId): QuickToolShortcutId => `${id}.quick`

export const QUICK_TOOL_SHORTCUT_IDS = CYCLING_TOOL_SHORTCUT_IDS.map(quickToolShortcutId)
