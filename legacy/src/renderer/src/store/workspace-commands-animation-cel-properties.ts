import { animationLinkSlotKeys } from '@/core/animation-slot-selection'
import type { AnimationCel } from '@shared/types-animation'
import {
  animationCelKey,
  animationCelHasContent,
  cloneAnimationCel,
  connectAnimationCels,
  createAnimationCelLookup,
  deleteAnimationFrame,
  disconnectAnimationCels,
  ensureAnimationDocument,
  normalizeAnimationCelZIndex,
  parseAnimationCelKey,
  refreshActiveAnimationFrame,
  resolveAnimationCel,
  restoreAnimationCels,
  syncActiveAnimationFrame
} from '@/core/animation'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'

export function createAnimationCelPropertiesCommands({ get, set }: WorkspaceCommandContext<'deleteAnimationFrame' | 'deleteSelectedLayerMasks' | 'mutateActive' | 'setActiveAnimationFrame'>): Pick<WorkspaceAnimationCommands, 'setAnimationCelOpacity' | 'setAnimationCelProperties' | 'connectSelectedAnimationCels' | 'disconnectSelectedAnimationCels' | 'deleteSelectedAnimationItems'> {
  return {
    setAnimationCelOpacity(layerId, frameId, opacity) {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
        const source = resolveAnimationCel(timeline, cel ?? null)
        if (!cel || !source) return
        const linked = timeline.cels.filter((candidate) => resolveAnimationCel(timeline, candidate)?.id === source.id)
        const before = source.opacity ?? 1
        const after = Math.max(0, Math.min(1, opacity))
        if (before === after) return
        const apply = (value: number): void => {
          for (const candidate of linked) candidate.opacity = value
          if (timeline.activeFrameId === cel.frameId) {
            const layer = session.document.layers.find((candidate) => candidate.id === cel.layerId)
            if (layer) layer.opacity = value
          }
        }
        apply(after)
        session.history.push({
          label: tr('workspace.history.animationCelOpacity'),
          bytes: 16,
          undo: () => apply(before),
          redo: () => apply(after)
        })
      })
    },
    setAnimationCelProperties(layerId, frameId, properties, targetKeys) {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
        if (!cel) return
        const requested = new Set(targetKeys?.length ? targetKeys : [animationCelKey(layerId, frameId)])
        const sourceById = new Map<string, AnimationCel>()
        for (const candidate of timeline.cels) {
          if (!requested.has(animationCelKey(candidate.layerId, candidate.frameId))) continue
          const source = resolveAnimationCel(timeline, candidate) ?? candidate
          sourceById.set(source.id, source)
        }
        if (sourceById.size === 0) return
        const groups = [...sourceById.values()].map((source) => ({
          source,
          members: timeline.cels.filter((candidate) => (resolveAnimationCel(timeline, candidate) ?? candidate).id === source.id)
        }))
        const before = new Map(
          groups.map(({ source }) => [
            source.id,
            {
              opacity: source.opacity ?? 1,
              zIndex: normalizeAnimationCelZIndex(source.zIndex)
            }
          ])
        )
        const after = {
          opacity: Math.max(0, Math.min(1, properties.opacity)),
          zIndex: normalizeAnimationCelZIndex(properties.zIndex)
        }
        if ([...before.values()].every((value) => value.opacity === after.opacity && value.zIndex === after.zIndex)) return
        const apply = (values: ReadonlyMap<string, typeof after> | typeof after): void => {
          for (const { source, members } of groups) {
            const value = values instanceof Map ? values.get(source.id) : values
            if (!value) continue
            for (const candidate of members) {
              candidate.opacity = value.opacity
              candidate.zIndex = value.zIndex
            }
          }
          for (const activeCel of timeline.cels) {
            if (activeCel.frameId !== timeline.activeFrameId) continue
            const activeSource = resolveAnimationCel(timeline, activeCel) ?? activeCel
            const layer = session.document.layers.find((candidate) => candidate.id === activeCel.layerId)
            if (layer && Number.isFinite(activeSource.opacity)) layer.opacity = Math.max(0, Math.min(1, activeSource.opacity!))
          }
        }
        apply(after)
        session.history.push({
          label: tr('workspace.history.animationCelProperties'),
          bytes: groups.length * 32,
          undo: () => apply(before),
          redo: () => apply(after),
          affectedLayerIds: [...new Set(groups.map(({ source }) => source.layerId))],
          invalidation: { kind: 'full' }
        })
        // Cel properties are an explicit timeline-panel operation. Preserve the
        // user's multi-cel highlight after the resulting content revision.
        session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
      })
    },
    connectSelectedAnimationCels() {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          syncActiveAnimationFrame(session.document)
          const lookup = createAnimationCelLookup(timeline)
          const selected = new Set(animationLinkSlotKeys(session.selectedAnimationCellKeys,
            session.document.layers.map((layer) => layer.id), timeline.frames.map((frame) => frame.id),
            (key) => { const slot = parseAnimationCelKey(key); return Boolean(slot && animationCelHasContent(lookup.resolve(lookup.at(slot.layerId, slot.frameId)), session.document.palette)) }))
          const targets = timeline.cels.filter((cel) => selected.has(animationCelKey(cel.layerId, cel.frameId)))
          const layerCounts = new Map<string, number>()
          for (const cel of targets) layerCounts.set(cel.layerId, (layerCounts.get(cel.layerId) ?? 0) + 1)
          if (![...layerCounts.values()].some((count) => count > 1)) return
          const before = timeline.cels.map(cloneAnimationCel)
          if (
            !connectAnimationCels(
              session.document,
              targets.map((cel) => cel.id)
            )
          )
            return
          const after = ensureAnimationDocument(session.document).cels.map(cloneAnimationCel)
          const restore = (snapshot: AnimationCel[]): void => {
            restoreAnimationCels(session.document, snapshot)
            refreshActiveAnimationFrame(session.document)
          }
          session.history.push({
            label: tr('workspace.history.animationCelLink'),
            bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0) + 24, 0),
            undo: () => restore(before),
            redo: () => restore(after)
          })
        },
        true,
        true
      )
    },
    disconnectSelectedAnimationCels() {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          const selected = new Set(session.selectedAnimationCellKeys)
          const targets = timeline.cels.filter((cel) => selected.has(animationCelKey(cel.layerId, cel.frameId)))
          syncActiveAnimationFrame(session.document)
          const before = timeline.cels.map(cloneAnimationCel)
          if (
            !disconnectAnimationCels(
              session.document,
              targets.map((cel) => cel.id)
            )
          )
            return
          const after = ensureAnimationDocument(session.document).cels.map(cloneAnimationCel)
          const restore = (snapshot: AnimationCel[]): void => {
            restoreAnimationCels(session.document, snapshot)
            refreshActiveAnimationFrame(session.document)
          }
          session.history.push({
            label: tr('workspace.history.animationCelUnlink'),
            bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0) + 24, 0),
            undo: () => restore(before),
            redo: () => restore(after)
          })
        },
        true,
        true
      )
    },
    deleteSelectedAnimationItems() {
      const current = activeSession(get())
      if (!current) return
      if (current.selectedAnimationMaskCellKeys.length > 0 || current.selectedAnimationMaskRowKeys.length > 0) {
        get().deleteSelectedLayerMasks()
        return
      }
      const timeline = ensureAnimationDocument(current.document)
      if (current.selectedAnimationCellKeys.length) {
        get().mutateActive(
          (session) => {
            const timeline = ensureAnimationDocument(session.document)
            const selected = new Set(session.selectedAnimationCellKeys)
            const selectedCels = timeline.cels.filter((cel) => selected.has(animationCelKey(cel.layerId, cel.frameId)))
            const selectedIds = new Set(selectedCels.map((cel) => cel.id))
            const lookup = createAnimationCelLookup(timeline)
            const membersBySource = new Map<string, AnimationCel[]>()
            for (const cel of timeline.cels) {
              const source = lookup.resolve(cel) ?? cel
              const members = membersBySource.get(source.id) ?? []
              members.push(cel)
              membersBySource.set(source.id, members)
            }
            const affectedIds = new Set(selectedIds)
            for (const cel of selectedCels) {
              const source = lookup.resolve(cel) ?? cel
              if (selectedIds.has(source.id)) for (const member of membersBySource.get(source.id) ?? []) affectedIds.add(member.id)
            }
            const affected = timeline.cels.filter((cel) => affectedIds.has(cel.id))
            const before = affected.map(cloneAnimationCel)

            // A deleted source must hand its shared content to one surviving member.
            // Deleting an ordinary member leaves the rest of the link group untouched.
            for (const source of selectedCels.filter((cel) => !cel.linkedCelId)) {
              const remaining = (membersBySource.get(source.id) ?? []).filter((member) => !selectedIds.has(member.id))
              const replacement = remaining[0]
              if (!replacement) continue
              replacement.linkedCelId = null
              for (const member of remaining.slice(1)) {
                member.linkedCelId = replacement.id
                member.zIndex = replacement.zIndex
                member.surface = replacement.surface
                member.opacity = replacement.opacity
                member.text = replacement.text
                member.tilemap = replacement.tilemap
                member.freeTiles = replacement.freeTiles
              }
            }

            for (const cel of selectedCels) {
              cel.surface =
                cel.surface?.format === 'rgba'
                  ? {
                      ...cel.surface,
                      pixels: new Uint8ClampedArray(cel.surface.pixels.length),
                      runtimeRaster: undefined
                    }
                  : cel.surface
                    ? {
                        ...cel.surface,
                        pixels: new Uint32Array(cel.surface.pixels.length),
                        runtimeRaster: undefined
                      }
                    : undefined
              cel.linkedCelId = null
              cel.zIndex = 0
              delete cel.text
              delete cel.tilemap
              delete cel.freeTiles
            }
            refreshActiveAnimationFrame(session.document)
            session.activeLayerMaskId = null
            const after = affected.map((cel) => cloneAnimationCel(timeline.cels.find((candidate) => candidate.id === cel.id) ?? cel))
            session.selectedAnimationCellKeys = []
            session.animationCellSelectionExplicit = false
            if (before.length)
              session.history.push({
                label: tr('workspace.history.deleteAnimationCel'),
                bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0),
                undo: () => restoreAnimationCels(session.document, before),
                redo: () => restoreAnimationCels(session.document, after)
              })
          },
          true,
          true
        )
        return
      }
      const selectedFrames = current.selectedAnimationFrameIds.length ? [...current.selectedAnimationFrameIds] : [timeline.activeFrameId]
      current.history.beginCompound()
      for (const frameId of selectedFrames) {
        if (ensureAnimationDocument(current.document).frames.length <= 1) break
        get().setActiveAnimationFrame(frameId)
        // Defer selection normalization until the compound deletion completes.
        get().deleteAnimationFrame(false, true)
      }
      current.history.endCompound(tr('workspace.history.deleteAnimationFrame'))
      get().mutateActive(
        (session) => {
          session.selectedAnimationFrameIds = []
        },
        false,
        true
      )
    }
  }
}
