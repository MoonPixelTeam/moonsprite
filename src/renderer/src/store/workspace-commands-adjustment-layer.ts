import { cloneLayerAdjustment, layerAdjustmentSignature } from '@/core/layer-adjustment'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import type { WorkspaceCommandContext } from './workspace-command-context'
import type { WorkspaceLayerCommands } from './workspace-state'

export function createAdjustmentLayerCommands({ get }: WorkspaceCommandContext<'mutateActive'>): Pick<WorkspaceLayerCommands, 'previewLayerAdjustment' | 'setLayerAdjustment'> {
  return {
    previewLayerAdjustment(layerId, value) {
      get().mutateActive(session => {
        const layer = session.document.layers.find(layer => layer.id === layerId && layer.kind === 'adjustment')
        if (!layer || layerAdjustmentSignature(layer.adjustment) === layerAdjustmentSignature(value)) return
        layer.adjustment = cloneLayerAdjustment(value)
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.layersPanelRevision += 1
        session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
      }, false)
    },
    setLayerAdjustment(layerId, value) {
      const layer = activeSession(get())?.document.layers.find(layer => layer.id === layerId && layer.kind === 'adjustment')
      if (!layer || layerAdjustmentSignature(layer.adjustment) === layerAdjustmentSignature(value)) return
      get().mutateActive(session => {
        const before = cloneLayerAdjustment(layer.adjustment)
        const after = cloneLayerAdjustment(value)
        layer.adjustment = cloneLayerAdjustment(after)
        session.history.push({
          label: tr('gradientMap.title'), bytes: 128 + ((before?.gradientMap.stops.length ?? 0) + (after?.gradientMap.stops.length ?? 0)) * 24,
          undo: () => { layer.adjustment = cloneLayerAdjustment(before) },
          redo: () => { layer.adjustment = cloneLayerAdjustment(after) },
          contentChanged: true, requiresAnimationSync: false, invalidation: { kind: 'full' }
        })
      }, 'content')
    }
  }
}
