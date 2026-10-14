import type { DocumentSlice } from '@shared/types-document'
import { createId } from '@/core/document-model'
import { clampSliceRect, sanitizeSliceName } from '@/core/slices'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceSliceCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { tr } from './workspace-translation'

const cloneSlices = (slices: readonly DocumentSlice[] | undefined): DocumentSlice[] =>
  (slices ?? []).map((slice) => ({ ...slice }))

const restoreSlices = (session: DocumentSession, slices: readonly DocumentSlice[], selectedSliceId: string | null, selectedSliceIds: readonly string[] = selectedSliceId ? [selectedSliceId] : []): void => {
  session.document.slices = cloneSlices(slices)
  const validIds = selectedSliceIds.filter((id, index) => selectedSliceIds.indexOf(id) === index && slices.some((slice) => slice.id === id))
  session.selectedSliceIds = validIds
  session.selectedSliceId = selectedSliceId && validIds.includes(selectedSliceId) ? selectedSliceId : validIds.at(-1) ?? null
}

const selectedSliceIds = (session: DocumentSession): string[] =>
  session.selectedSliceIds?.length ? [...session.selectedSliceIds] : session.selectedSliceId ? [session.selectedSliceId] : []

const slicesEqual = (first: readonly DocumentSlice[], second: readonly DocumentSlice[]): boolean =>
  first.length === second.length && first.every((slice, index) => {
    const other = second[index]
    return Boolean(other)
      && slice.id === other.id
      && slice.name === other.name
      && slice.x === other.x
      && slice.y === other.y
      && slice.width === other.width
      && slice.height === other.height
  })

export function createWorkspaceSliceCommands({ get }: WorkspaceCommandContext<'deleteSlices' | 'mutateActive'>): WorkspaceSliceCommands {
  return {
    selectSlice(id, additive = false) {
      get().mutateActive((session) => {
        const valid = id && session.document.slices?.some((slice) => slice.id === id) ? id : null
        if (!additive) {
          session.selectedSliceId = valid
          session.selectedSliceIds = valid ? [valid] : []
          return
        }
        if (!valid) return
        const ids = selectedSliceIds(session)
        if (ids.includes(valid)) {
          session.selectedSliceIds = ids.filter((candidate) => candidate !== valid)
          session.selectedSliceId = session.selectedSliceIds.at(-1) ?? null
        } else {
          session.selectedSliceIds = [...ids, valid]
          session.selectedSliceId = valid
        }
      }, false)
    },

    selectAllSlices() {
      get().mutateActive((session) => {
        const ids = (session.document.slices ?? []).map((slice) => slice.id)
        session.selectedSliceIds = ids
        session.selectedSliceId = ids.at(-1) ?? null
      }, false)
    },

    createSlice(bounds) {
      let createdId: string | null = null
      get().mutateActive((session) => {
        const beforeSlices = cloneSlices(session.document.slices)
        const beforeSelectedSliceId = session.selectedSliceId
        const beforeSelectedSliceIds = selectedSliceIds(session)
        const id = createId('slice')
        const slice = { id, name: tr('workspace.slice.defaultName', { index: beforeSlices.length + 1 }), ...clampSliceRect(bounds, session.document.width, session.document.height) }
        const afterSlices = [...beforeSlices, slice]
        restoreSlices(session, afterSlices, id, [id])
        session.history.push({
          label: tr('workspace.history.createSlice'),
          bytes: (beforeSlices.length + afterSlices.length) * 48,
          undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
          redo: () => restoreSlices(session, afterSlices, id, [id]),
          contentChanged: false,
          requiresAnimationSync: false
        })
        createdId = id
      }, 'metadata')
      return createdId
    },

    createSlices(bounds) {
      const createdIds: string[] = []
      get().mutateActive((session) => {
        if (bounds.length === 0) return
        const beforeSlices = cloneSlices(session.document.slices)
        const beforeSelectedSliceId = session.selectedSliceId
        const beforeSelectedSliceIds = selectedSliceIds(session)
        const created = bounds.map((item, index) => {
          const id = createId('slice')
          createdIds.push(id)
          return { id, name: tr('workspace.slice.defaultName', { index: beforeSlices.length + index + 1 }), ...clampSliceRect(item, session.document.width, session.document.height) }
        })
        const afterSlices = [...beforeSlices, ...created]
        const selectedId = createdIds.at(-1) ?? null
        restoreSlices(session, afterSlices, selectedId, createdIds)
        session.history.push({
          label: tr('workspace.history.createSlices'),
          bytes: (beforeSlices.length + afterSlices.length) * 48,
          undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
          redo: () => restoreSlices(session, afterSlices, selectedId, createdIds),
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
      return createdIds
    },

    updateSlice(id, patch) {
      get().mutateActive((session) => {
        const beforeSlices = cloneSlices(session.document.slices)
        const slice = beforeSlices.find((candidate) => candidate.id === id)
        if (!slice) return
        Object.assign(slice, clampSliceRect({ x: patch.x ?? slice.x, y: patch.y ?? slice.y, width: patch.width ?? slice.width, height: patch.height ?? slice.height }, session.document.width, session.document.height))
        if (patch.name !== undefined) slice.name = sanitizeSliceName(patch.name, slice.name)
        const afterSlices = cloneSlices(beforeSlices)
        const currentSlices = cloneSlices(session.document.slices)
        if (slicesEqual(currentSlices, afterSlices)) return
        const selectedSliceId = session.selectedSliceId
        const selectedIds = selectedSliceIds(session)
        restoreSlices(session, afterSlices, selectedSliceId, selectedIds)
        session.history.push({
          label: tr('workspace.history.updateSlice'),
          bytes: (currentSlices.length + afterSlices.length) * 48,
          undo: () => restoreSlices(session, currentSlices, selectedSliceId, selectedIds),
          redo: () => restoreSlices(session, afterSlices, selectedSliceId, selectedIds),
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
    },

    updateSlices(patches) {
      get().mutateActive((session) => {
        const beforeSlices = cloneSlices(session.document.slices)
        const afterSlices = beforeSlices.map((slice) => patches[slice.id] ? { ...slice, ...clampSliceRect(patches[slice.id], session.document.width, session.document.height) } : slice)
        if (slicesEqual(beforeSlices, afterSlices)) return
        const beforeSelectedSliceId = session.selectedSliceId
        const beforeSelectedSliceIds = selectedSliceIds(session)
        restoreSlices(session, afterSlices, beforeSelectedSliceId, beforeSelectedSliceIds)
        session.history.push({
          label: tr('workspace.history.updateSlice'),
          bytes: (beforeSlices.length + afterSlices.length) * 48,
          undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
          redo: () => restoreSlices(session, afterSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
    },

    duplicateSlices(ids, targets) {
      const createdIds: string[] = []
      get().mutateActive((session) => {
        const beforeSlices = cloneSlices(session.document.slices)
        const beforeSelectedSliceId = session.selectedSliceId
        const beforeSelectedSliceIds = selectedSliceIds(session)
        const sources = ids.flatMap((id) => {
          const source = beforeSlices.find((slice) => slice.id === id)
          return source && targets[id] ? [source] : []
        })
        if (sources.length === 0) return
        const copies = sources.map((source) => {
          const id = createId('slice')
          createdIds.push(id)
          return { ...source, id, ...clampSliceRect(targets[source.id], session.document.width, session.document.height) }
        })
        const afterSlices = [...beforeSlices, ...copies]
        restoreSlices(session, afterSlices, createdIds.at(-1) ?? null, createdIds)
        session.history.push({
          label: tr('workspace.history.duplicateSlice'),
          bytes: (beforeSlices.length + afterSlices.length) * 48,
          undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
          redo: () => restoreSlices(session, afterSlices, createdIds.at(-1) ?? null, createdIds),
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
      return createdIds
    },

    deleteSlice(id) { get().deleteSlices([id]) },

    deleteSlices(ids) {
      get().mutateActive((session) => {
        const deleteIds = new Set(ids)
        const beforeSlices = cloneSlices(session.document.slices)
        if (!beforeSlices.some((slice) => deleteIds.has(slice.id))) return
        const beforeSelectedSliceId = session.selectedSliceId
        const beforeSelectedSliceIds = selectedSliceIds(session)
        const afterSlices = beforeSlices.filter((slice) => !deleteIds.has(slice.id))
        const afterSelectedIds = beforeSelectedSliceIds.filter((id) => !deleteIds.has(id))
        const afterSelectedId = deleteIds.has(beforeSelectedSliceId ?? '') ? afterSelectedIds.at(-1) ?? null : beforeSelectedSliceId
        restoreSlices(session, afterSlices, afterSelectedId, afterSelectedIds)
        session.history.push({
          label: tr('workspace.history.deleteSlice'),
          bytes: (beforeSlices.length + afterSlices.length) * 48,
          undo: () => restoreSlices(session, beforeSlices, beforeSelectedSliceId, beforeSelectedSliceIds),
          redo: () => restoreSlices(session, afterSlices, afterSelectedId, afterSelectedIds),
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
    }
  }
}
