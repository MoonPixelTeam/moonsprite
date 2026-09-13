import type { AppShortcutContext } from './app-shortcut-context'
import { PREVIEW_ZOOM_SHORTCUT_EVENT, type PreviewZoomShortcutDetail } from '@/core/preview-zoom-shortcuts'
import { zoomViewAroundViewportPoint } from '@/core/view-geometry'
import { useWorkspace } from '@/store/workspace'

export function handleSelectionShortcuts(context: Pick<AppShortcutContext, 'pointerPosition' | 'rotationIndicatorPosition' | 'event' | 'target' | 'isTextEntry' | 'keyboardSurfaceBlocked' | 'workspace' | 'session' | 't' | 'matches' | 'runCommand' | 'commandScope' | 'selectionOverride' | 'uiCommands' | 'publishShortcutCommand'>): boolean {
  const { pointerPosition, rotationIndicatorPosition, event, isTextEntry, keyboardSurfaceBlocked, workspace, session, t, matches, runCommand, commandScope, selectionOverride, uiCommands, publishShortcutCommand } = context
  const viewZoomShortcut = ([
    ['viewZoom100', 1],
    ['viewZoom200', 2],
    ['viewZoom400', 4],
    ['viewZoom800', 8],
    ['viewZoom3200', 32]
  ] as const).find(([id]) => matches(id))
  if (viewZoomShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat && session) {
      const pointer = pointerPosition()
      const pointerTarget = pointer
      ? document.elementFromPoint(pointer.x, pointer.y)
      : event.target instanceof Element ? event.target : null
      const previewPanel = pointerTarget?.closest('.preview-panel')
      if (previewPanel) {
        previewPanel.dispatchEvent(new CustomEvent<PreviewZoomShortcutDetail>(PREVIEW_ZOOM_SHORTCUT_EVENT, { bubbles: true, detail: { zoom: viewZoomShortcut[1], pointer: pointer ?? undefined } }))
      } else {
        const stage = pointerTarget?.closest('.stage-surface')
        const stageBounds = stage?.getBoundingClientRect()
        if (stageBounds && pointer && stageBounds.width > 0 && stageBounds.height > 0) {
          const nextView = zoomViewAroundViewportPoint(
          session.view,
          viewZoomShortcut[1],
          { x: pointer.x - stageBounds.left, y: pointer.y - stageBounds.top },
          stageBounds.width,
          stageBounds.height,
          session.document.width,
          session.document.height,
          rotationIndicatorPosition
          )
          workspace.setView({ zoom: nextView.zoom, panX: nextView.panX, panY: nextView.panY })
        } else workspace.setView({ zoom: viewZoomShortcut[1] })
      }
    }
    return true
  }
  if (runCommand('saveAs', () => uiCommands['saveAs']?.()))
    return true
  if (session && (matches('flipVertical') || matches('flipHorizontal'))) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) workspace.flipActiveSelection(matches('flipVertical') ? 'vertical' : 'horizontal')
    return true
  }
  if (matches('outline')) {
    event.preventDefault()
    if (session) uiCommands.outline?.()
    return true
  }
  if (!keyboardSurfaceBlocked && !isTextEntry && runCommand('quickOutline', () => { if (session) workspace.quickOutlineActiveSelection() }))
    return true
  if (!keyboardSurfaceBlocked && !isTextEntry && runCommand('outlineSelectionInside', () => { if (session) workspace.outlineSelectionInside() }))
    return true
  if (runCommand('selectAll', () => {
    const state = useWorkspace.getState()
    const active = state.sessions.find((item) => item.document.id === state.activeId)
    if (!active) return
    state.commitFloatingPaste()
    state.setTool('selection')
    state.setSelection({ x: 0, y: 0, width: active.document.width, height: active.document.height })
  }))
    return true
  if (runCommand('invertSelection', () => workspace.invertSelection()))
    return true
  if (runCommand('deleteSelection', () => {
    if (session?.selection) workspace.deleteSelection()
    else workspace.setMessage(t('app.selection.required'))
  }))
    return true
  const selectionModeShortcut = ([
    ['selectionModeReplace', 'replace'],
    ['selectionModeAdd', 'add'],
    ['selectionModeSubtract', 'subtract'],
    ['selectionModeIntersect', 'intersect']
  ] as const).find(([id]) => matches(id))
  if (selectionModeShortcut) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) {
      workspace.setTool('selection')
      workspace.setSelectionMode(selectionModeShortcut[1])
    }
    return true
  }
  if (runCommand('selectAllSlices', () => workspace.selectAllSlices()))
    return true
  if (runCommand('openAutoSlice', () => publishShortcutCommand('openAutoSlice')))
    return true
  if (runCommand('openSliceProperties', () => publishShortcutCommand('openSliceProperties')))
    return true
  if (!keyboardSurfaceBlocked && !isTextEntry && runCommand('createBrushFromSelection', () => {
    if (session?.selection) workspace.createBrushFromSelection()
    else workspace.setMessage(t('app.brushSelection.required'))
  }))
    return true
  if (session?.selection && runCommand('deselect', () => {
    const label = t('app.selection.cancelHistory')
    if (session.pendingPaste) workspace.commitFloatingPaste(label)
    else workspace.commitSelectionChange(
    { ...session.selection! },
    null,
    label,
    { resetTimelineSelection: session.selectionGuidesPreservedAtContentRevision === session.contentRevision }
    )
  }))
    return true
  const instanceListOwnsCopy = commandScope() === 'layers' && Boolean(session?.freeTileInstanceLayerId && session.selectedFreeTileInstanceId)
  const selectionOwnsCopy = !instanceListOwnsCopy && Boolean(session?.selection) && (commandScope() === 'canvas' || selectionOverride())
  if (selectionOwnsCopy && runCommand('copy', () => workspace.copySelection()))
    return true
  if (session?.selectedAnimationCellKeys.length && !selectionOverride() && runCommand('copyAnimationCel', () => workspace.copySelectedAnimationCels()))
    return true
  return false
}
