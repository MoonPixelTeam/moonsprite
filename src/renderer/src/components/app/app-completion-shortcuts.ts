import type { AppShortcutContext } from './app-shortcut-context'
import { animationCelKey } from '@/core/animation'
import { BRUSH_LIBRARY_DELETE_COMMAND_EVENT, hasAnimationDeleteSelection, TILESET_DELETE_COMMAND_EVENT, resolveDeleteCommand, shouldDeleteActiveAnimationCel, shouldHandleGlobalSelectionEnter, shouldTriggerDeleteCommand } from '@/core/command-context'
import { isFunctionKey } from '@/core/shortcuts'
import { useWorkspace } from '@/store/workspace'

export function handleCompletionShortcuts(context: Pick<AppShortcutContext, 'commandSurface' | 'event' | 'key' | 'target' | 'commandKey' | 'workspace' | 'session' | 't' | 'matches' | 'runCommand' | 'adjustBrushSize' | 'outlineOpen' | 'commandScope' | 'selectionOverride'>): boolean {
  const { commandSurface, event, key, commandKey, workspace, session, t, matches, runCommand, adjustBrushSize, outlineOpen, commandScope, selectionOverride } = context
  if (event.key === 'Enter' && session?.selection && shouldHandleGlobalSelectionEnter(outlineOpen, true)) {
    event.preventDefault()
    if (session.pendingPaste) workspace.commitFloatingPaste()
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (active?.selection) workspace.commitSelectionChange(active.selection, null, t('app.selection.completeHistory'))
    return true
  }
  if (event.key === 'Enter' && session?.textBoxTransform) {
    event.preventDefault()
    workspace.cancelTextBoxTransform()
    return true
  }
  if (shouldTriggerDeleteCommand(matches('deleteLayer'), event.key)) {
    event.preventDefault()
    event.stopPropagation()
    if (commandScope() === 'canvas' && session?.tool === 'move' && session.moveKind === 'slice' && (session.selectedSliceIds?.length || session.selectedSliceId)) { workspace.deleteSlices(session.selectedSliceIds?.length ? session.selectedSliceIds : [session.selectedSliceId!]);
      return true }
    const hasAnimationSelection = !selectionOverride() && Boolean(session && hasAnimationDeleteSelection({
      selectedFrameCount: session.selectedAnimationFrameIds.length,
      selectedCellCount: session.selectedAnimationCellKeys.length,
      selectedMaskCellCount: session.selectedAnimationMaskCellKeys.length,
      selectedMaskRowCount: session.selectedAnimationMaskRowKeys.length,
      cellSelectionExplicit: session.animationCellSelectionExplicit
    }))
    if (session && shouldDeleteActiveAnimationCel({
      scope: commandScope(),
      hasCanvasSelection: Boolean(session.selection),
      hasAnimationSelection,
      hasExplicitLayerSelection: session.layerSelectionExplicit === true,
      hasFreeTileInstanceSelection: Boolean(session.selectedFreeTileInstanceId),
      hasAnimation: Boolean(session.document.animation)
    })) {
      const frameId = session.document.animation!.activeFrameId
      workspace.selectAnimationCell(animationCelKey(session.document.activeLayerId, frameId))
      workspace.deleteSelectedAnimationItems()
      return true
    }
    const target = resolveDeleteCommand(commandScope(), Boolean(session?.selection), hasAnimationSelection, Boolean(session?.selectedFreeTileInstanceId))
    if (target === 'free-tile-instance' && session?.selectedFreeTileInstanceId) {
      workspace.deleteFreeTileInstances(session.selectedFreeTileInstanceIds.length > 0 ? session.selectedFreeTileInstanceIds : [session.selectedFreeTileInstanceId])
      return true
    }
    if (target === 'animation') {
      if (session?.selectedAnimationMaskCellKeys.length || session?.selectedAnimationMaskRowKeys.length) workspace.deleteSelectedLayerMasks()
      else workspace.deleteSelectedAnimationItems()
      return true
    }
    if (target === 'layers' && (session?.selectedLayerIds.length || session?.selectedGroupIds.length)) { workspace.deleteSelectedLayers();
      return true }
    if (target === 'tileset') {
      const surface = commandSurface()
      if (surface?.isConnected && surface.dataset.commandScope === 'tileset') surface.dispatchEvent(new Event(TILESET_DELETE_COMMAND_EVENT))
      return true
    }
    if (target === 'brushes') {
      const surface = commandSurface()
      if (surface?.isConnected && surface.dataset.commandScope === 'brushes') surface.dispatchEvent(new Event(BRUSH_LIBRARY_DELETE_COMMAND_EVENT))
      return true
    }
    if (target === 'palette' && session?.selectedPaletteIds.length) workspace.deletePaletteColors(session.selectedPaletteIds)
    else if (target === 'selection' && session?.selection) workspace.deleteSelection()
    return true
  }
  if (runCommand('brushSizeDecrease', () => adjustBrushSize(-1), true))
    return true
  if (runCommand('brushSizeIncrease', () => adjustBrushSize(1), true))
    return true
  const browserShortcut = commandKey && (
  ['p', 'r', 'l', 'u', '0', '+', '=', '-'].includes(key)
  || (event.shiftKey && ['i', 'j', 'c'].includes(key))
  )
  if (browserShortcut || isFunctionKey(key) || (event.altKey && (key === 'arrowleft' || key === 'arrowright'))) {
    event.preventDefault()
    event.stopPropagation()
  }
  return false
}
