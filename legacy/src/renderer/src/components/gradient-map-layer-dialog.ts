import { normalizeGradientMap } from '@/core/gradient-map'
import { useWorkspace } from '@/store/workspace'

export const OPEN_GRADIENT_MAP_LAYER = 'moonsprite:open-gradient-map-layer'
export interface GradientMapLayerDialogTarget { documentId: string; layerId: string }

export async function createGradientMapLayerAndEdit(): Promise<void> {
  const documentId = useWorkspace.getState().activeId
  if (!documentId) return
  await useWorkspace.getState().addLayer(normalizeGradientMap(undefined))
  const state = useWorkspace.getState()
  const document = state.sessions.find(session => session.document.id === documentId)?.document
  if (state.activeId !== documentId || !document || document.layers.find(layer => layer.id === document.activeLayerId)?.kind !== 'adjustment') return
  window.dispatchEvent(new CustomEvent<GradientMapLayerDialogTarget>(OPEN_GRADIENT_MAP_LAYER, { detail: { documentId, layerId: document.activeLayerId } }))
}
