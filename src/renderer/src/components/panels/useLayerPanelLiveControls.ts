import { useWorkspace, type DocumentSession } from '@/store/workspace'

/** Pixel history may replace objects without changing any layer row controls. */
export function useLayerPanelLiveControls(session: DocumentSession) {
  useWorkspace((state) => {
    const live = state.sessions.find((item) => item.document.id === session.document.id) ?? session
    const focus = live.timelineActiveContext
    return [focus.row?.kind, focus.row?.ownerId, focus.row?.ownerKind, focus.frameId, focus.maskEditTargetId,
      ...live.document.layers.map(layer => `${layer.id}:${layer.autoLinkAnimationCels === true}`)].join('\0')
  })
  const live = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
  return {
    timelineActiveContext: live.timelineActiveContext,
    liveAutoLinkById: new Map(live.document.layers.map(layer => [layer.id, layer.autoLinkAnimationCels === true]))
  }
}
