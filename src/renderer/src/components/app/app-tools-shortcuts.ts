import type { AppShortcutContext } from './app-shortcut-context'
import { TOOL_DEFINITIONS } from '@/components/app/editor-tools'
import { CYCLING_TOOL_SHORTCUT_IDS, shortcutText } from '@/core/shortcuts'
import { useWorkspace } from '@/store/workspace'

export function createToolShortcutHandler() {
  let cycle = { signature: '', index: -1 }
  return function handleToolsShortcuts(context: Pick<AppShortcutContext, 'event' | 'heldShortcutParts' | 'workspace' | 'session' | 'matches' | 'runCommand'>): boolean {
    const { event, heldShortcutParts, workspace, session, matches, runCommand } = context
    const matchingToolShortcuts = CYCLING_TOOL_SHORTCUT_IDS.filter((id) => matches(id))
    if (matchingToolShortcuts.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) {
        // Tool shortcuts may arrive while the canvas is in a pointer
        // gesture, before React has rendered the Store update. Use the
        // Store's current session when resolving the cycling position.
        const currentWorkspace = useWorkspace.getState()
        const currentSession = currentWorkspace.sessions.find((item) => item.document.id === currentWorkspace.activeId) ?? session
        const activeToolShortcut: (typeof CYCLING_TOOL_SHORTCUT_IDS)[number] | null = !currentSession ? null
        : currentSession.tool === 'selection'
        ? currentSession.selectionKind === 'ellipse' ? 'tool.selection.ellipse'
        : currentSession.selectionKind === 'lasso' ? 'lasso'
        : currentSession.selectionKind === 'polygon-lasso' ? 'polygonLasso'
        : currentSession.selectionKind === 'magic' ? 'magic'
        : 'tool.selection'
        : currentSession.tool === 'fill'
        ? currentSession.fillKind === 'gradient' ? 'tool.fill.gradient' : 'tool.fill'
        : currentSession.tool === 'shape'
        ? currentSession.shapeKind === 'rectangle-outline' ? 'tool.shape.rectangleOutline'
        : currentSession.shapeKind === 'rectangle' ? 'tool.shape.rectangle'
        : currentSession.shapeKind === 'ellipse-outline' ? 'tool.shape.ellipseOutline'
        : currentSession.shapeKind === 'ellipse' ? 'tool.shape.ellipse'
        : currentSession.shapeKind === 'freeform' ? 'tool.shape.freeform'
        : currentSession.shapeKind === 'polygon' ? 'tool.shape.polygon'
        : 'tool.shape'
        : currentSession.tool === 'line'
        ? currentSession.lineKind === 'curve' ? 'tool.curve' : 'tool.line'
        : currentSession.tool === 'move' && currentSession.moveKind === 'slice'
        ? 'tool.slice'
        : TOOL_DEFINITIONS.find((tool) => tool.id === currentSession.tool)?.shortcutId as (typeof CYCLING_TOOL_SHORTCUT_IDS)[number] | undefined ?? null
        const signature = `${shortcutText(event, heldShortcutParts).toLowerCase()}:${matchingToolShortcuts.join('|')}`
        const previous = cycle
        const activeIndex = activeToolShortcut ? matchingToolShortcuts.indexOf(activeToolShortcut) : -1
        const index = previous.signature === signature && activeIndex === previous.index
        ? (previous.index + 1) % matchingToolShortcuts.length
        : activeIndex >= 0 && matchingToolShortcuts.length > 1
        ? (activeIndex + 1) % matchingToolShortcuts.length
        : 0
        cycle = { signature, index }
        const shortcutId = matchingToolShortcuts[index]
        const changeTool = (): void => {
          const currentWorkspace = useWorkspace.getState()
          if (shortcutId === 'magic') { currentWorkspace.setTool('selection'); currentWorkspace.setSelectionKind('magic') }
          else if (shortcutId === 'lasso') { currentWorkspace.setTool('selection'); currentWorkspace.setSelectionKind('lasso') }
          else if (shortcutId === 'polygonLasso') { currentWorkspace.setTool('selection'); currentWorkspace.setSelectionKind('polygon-lasso') }
          else if (shortcutId === 'tool.selection.ellipse') { currentWorkspace.setTool('selection'); currentWorkspace.setSelectionKind('ellipse') }
          else if (shortcutId === 'tool.selection') { currentWorkspace.setTool('selection'); currentWorkspace.setSelectionKind('rectangle') }
          else if (shortcutId === 'tool.fill.gradient') { currentWorkspace.setTool('fill'); currentWorkspace.setFillKind('gradient') }
          else if (shortcutId === 'tool.fill') { currentWorkspace.setTool('fill'); currentWorkspace.setFillKind('bucket') }
          else if (shortcutId === 'tool.shape.rectangleOutline') { currentWorkspace.setTool('shape'); currentWorkspace.setShapeKind('rectangle-outline') }
          else if (shortcutId === 'tool.shape.rectangle') { currentWorkspace.setTool('shape'); currentWorkspace.setShapeKind('rectangle') }
          else if (shortcutId === 'tool.shape.ellipseOutline') { currentWorkspace.setTool('shape'); currentWorkspace.setShapeKind('ellipse-outline') }
          else if (shortcutId === 'tool.shape.ellipse') { currentWorkspace.setTool('shape'); currentWorkspace.setShapeKind('ellipse') }
          else if (shortcutId === 'tool.shape.freeform') { currentWorkspace.setTool('shape'); currentWorkspace.setShapeKind('freeform') }
          else if (shortcutId === 'tool.shape.polygon') { currentWorkspace.setTool('shape'); currentWorkspace.setShapeKind('polygon') }
          else if (shortcutId === 'tool.curve') { currentWorkspace.setTool('line'); currentWorkspace.setLineKind('curve') }
          else if (shortcutId === 'tool.line') { currentWorkspace.setTool('line'); currentWorkspace.setLineKind('line') }
          else if (shortcutId === 'tool.slice') { currentWorkspace.setTool('move'); currentWorkspace.setMoveKind('slice') }
          else if (shortcutId === 'tool.move') { currentWorkspace.setTool('move'); currentWorkspace.setMoveKind('move') }
          else {
            const tool = TOOL_DEFINITIONS.find((definition) => definition.shortcutId === shortcutId)
            if (tool) currentWorkspace.setTool(tool.id)
          }
        }
        changeTool()
      }
      return true
    }
    const brushShapeShortcut = ([
      ['brushShapeRound', 'round'],
      ['brushShapeSquare', 'square'],
      ['brushShapeLine', 'line']
    ] as const).find(([id]) => matches(id))
    if (brushShapeShortcut) {
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) {
        workspace.setBrushImage(null)
        workspace.setBrushTexture('solid')
        workspace.setBrushShape(brushShapeShortcut[1])
      }
      return true
    }
    if (session && (session.tool === 'pencil' || session.tool === 'eraser' || session.tool === 'line')
    && runCommand('togglePerfectPixels', () => workspace.setPerfectPixels(!session.perfectPixels)))
      return true
    if (session?.tool === 'selection' && session.selectionKind === 'magic'
    && runCommand('toggleContiguous', () => workspace.setWandContiguous(!session.wandContiguous)))
      return true
    if (session?.tool === 'fill' && session.fillKind === 'bucket'
    && runCommand('toggleContiguous', () => workspace.setFillMode(session.fillMode === 'contiguous' ? 'global' : 'contiguous')))
      return true
    if (session?.tool === 'fill' && session.fillKind === 'gradient'
    && runCommand('toggleContiguous', () => workspace.setGradientContiguous(!session.gradientContiguous)))
      return true
    if (session?.tool === 'selection' && session.selectionKind === 'magic' && session.wandContiguous
    && runCommand('toggleSmartClosure', () => workspace.setWandGapClosing(!session.wandGapClosing)))
      return true
    if (session?.tool === 'fill' && session.fillKind === 'bucket' && session.fillMode === 'contiguous'
    && runCommand('toggleSmartClosure', () => workspace.setFillGapClosing(!session.fillGapClosing)))
      return true
    if (session?.tool === 'selection' && session.selectionKind === 'rectangle'
    && runCommand('toggleRoundedCorners', () => workspace.setSelectionRounded(!session.selectionRounded)))
      return true
    if (session?.tool === 'shape' && (session.shapeKind === 'rectangle' || session.shapeKind === 'rectangle-outline')
    && runCommand('toggleRoundedCorners', () => workspace.setShapeRounded(!session.shapeRounded)))
      return true
    if (session?.tool === 'shape'
    && (session.shapeKind === 'rectangle' || session.shapeKind === 'rectangle-outline' || session.shapeKind === 'ellipse' || session.shapeKind === 'ellipse-outline')
    && runCommand('toggleFixedRatio', () => workspace.setShapeRatio(session.shapeRatio === null ? { width: 1, height: 1 } : null)))
      return true
    if (runCommand('toggleMoveAutoSelect', () => {
      if (session) workspace.setMoveAutoSelect(!session.moveAutoSelect)
    }))
      return true
    const symmetryShortcut = ([
      ['toggleSymmetryHorizontal', 'horizontal'],
      ['toggleSymmetryVertical', 'vertical'],
      ['toggleSymmetryDiagonalUp', 'diagonalUp'],
      ['toggleSymmetryDiagonalDown', 'diagonalDown'],
      ['toggleSymmetryRotational', 'rotational']
    ] as const).find(([id]) => matches(id))
    if (symmetryShortcut) {
      event.preventDefault()
      event.stopPropagation()
      if (session && !event.repeat) workspace.setSymmetryAxis(symmetryShortcut[1], !session.symmetryAxes[symmetryShortcut[1]])
      return true
    }
    if (runCommand('resetSymmetryCenter', () => workspace.resetSymmetryCenter()))
      return true
    return false
  }
}
