import { hasAnimationDeleteSelection } from '@/core/command-context'
import { activeSession } from './workspace-access'
import { useWorkspace } from './workspace'

/** Edit-menu commands follow the current explicit selection, even after focus moves to the menu. */
export function deleteWorkspaceContent(): void {
  const store = useWorkspace.getState()
  const session = activeSession(store)
  if (!session) return
  if (session.selection) {
    store.deleteSelection()
  } else if (hasAnimationDeleteSelection({
    selectedFrameCount: session.selectedAnimationFrameIds.length,
    selectedCellCount: session.selectedAnimationCellKeys.length,
    selectedMaskCellCount: session.selectedAnimationMaskCellKeys.length,
    selectedMaskRowCount: session.selectedAnimationMaskRowKeys.length,
    cellSelectionExplicit: session.animationCellSelectionExplicit
  })) {
    store.deleteSelectedAnimationItems()
  } else {
    store.deleteActiveLayer()
  }
}
