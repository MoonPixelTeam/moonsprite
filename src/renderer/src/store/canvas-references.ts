import { create } from 'zustand'
import { useWorkspace } from './workspace'
import { tr } from './workspace-translation'
import type { SpriteDocument, ProjectCanvasReference, ReferencePlacement } from '@shared/types-document'

type Placement = ReferencePlacement
export interface CanvasReference extends ProjectCanvasReference {
  documentId?: string
}
const hydratedReferences = new WeakMap<SpriteDocument, SpriteDocument['canvasReferences']>()
const placement = ({ x, y, width, height, angle, flipX, flipY, opacity }: Placement): Placement => ({ x, y, width, height, angle, flipX, flipY, opacity: opacity ?? 1 })
const same = (a: CanvasReference, b: CanvasReference) => a.src === b.src && a.name === b.name && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.angle === b.angle && a.flipX === b.flipX && a.flipY === b.flipY && (a.opacity ?? 1) === (b.opacity ?? 1) && a.locked === b.locked && a.floating === b.floating

export const useCanvasReferences = create<{
  images: CanvasReference[]
  pending: CanvasReference | null
  add: (image: CanvasReference) => void
  update: (id: string, patch: Partial<Placement & { locked: boolean; floating: boolean; initial: Placement }>) => void
  replace: (id: string, src: string, width: number, height: number) => void
  remove: (id: string) => void
  reset: (id: string) => void
  bringToFront: (id: string) => void
  begin: (id: string) => void
  finish: (cancel?: boolean) => void
}>((set, get) => {
  const restore = (id: string, image: CanvasReference | undefined, index: number) => set((state) => {
    const images = state.images.filter((item) => item.id !== id)
    if (image) images.splice(Math.min(index, images.length), 0, image)
    return { images }
  })
  const persist = (documentId: string) => {
    const document = useWorkspace.getState().sessions.find(session => session.document.id === documentId)?.document
    if (!document) return
    document.canvasReferences = get().images.filter(image => image.documentId === documentId).map(({ documentId: _documentId, ...image }) => ({ ...image, ...(image.initial ? { initial: { ...image.initial } } : {}) }))
    hydratedReferences.set(document, document.canvasReferences)
  }
  const restoreProject = (id: string, image: CanvasReference | undefined, index: number, documentId: string) => {
    restore(id, image, index)
    persist(documentId)
  }
  const record = (before: CanvasReference | undefined, after: CanvasReference | undefined, index: number, label = tr('reference.history.adjust')) => {
    const image = after ?? before
    if (!image?.documentId || (before && after && same(before, after))) return
    const documentId = image.documentId
    persist(documentId)
    useWorkspace.getState().pushHistory({ label, bytes: before && after && before.src === after.src ? 256 : ((before?.src.length ?? 0) + (after?.src.length ?? 0)) * 2 + 256,
      documentChanged: true, contentChanged: false, requiresAnimationSync: false,
      undo: () => restoreProject(image.id, before, index, documentId), redo: () => restoreProject(image.id, after, index, documentId)
    }, image.documentId)
  }
  return {
    images: [], pending: null,
    add: (source) => {
      const documentId = source.documentId ?? useWorkspace.getState().activeId ?? undefined
      if (!documentId || !useWorkspace.getState().sessions.some((session) => session.document.id === documentId)) return
      const image = { ...source, documentId, initial: placement(source) }
      const index = get().images.length
      set({ images: [...get().images, image] })
      record(undefined, image, index, tr('reference.history.add'))
    },
    update: (id, patch) => {
      const index = get().images.findIndex((image) => image.id === id)
      const before = get().images[index]
      if (!before) return
      for (const key of ['x', 'y', 'width', 'height', 'angle'] as const) {
        if (patch[key] !== undefined && (!Number.isFinite(patch[key]) || ((key === 'width' || key === 'height') && patch[key]! <= 0))) return
      }
      if (patch.opacity !== undefined && (!Number.isFinite(patch.opacity) || patch.opacity < 0 || patch.opacity > 1)) return
      const ratio = (before.initial?.width ?? before.width) / (before.initial?.height ?? before.height)
      if (patch.width !== undefined) patch = { ...patch, height: patch.width / ratio }
      else if (patch.height !== undefined) patch = { ...patch, width: patch.height * ratio }
      const after = before.locked ? { ...before, locked: patch.locked ?? true } : { ...before, ...patch }
      if (same(before, after)) return
      restore(id, after, index)
      if (get().pending?.id !== id) record(before, after, index)
    },
    replace: (id, src, width, height) => {
      get().finish()
      const index = get().images.findIndex((image) => image.id === id)
      const before = get().images[index]
      if (!before || before.locked || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
      const nextHeight = before.width * height / width
      const after = { ...before, src, height: nextHeight,
        initial: { ...placement(before), width: before.width, height: nextHeight, angle: 0, flipX: false, flipY: false } }
      restore(id, after, index)
      record(before, after, index, tr('reference.history.replace'))
    },
    remove: (id) => {
      const index = get().images.findIndex((image) => image.id === id)
      const before = get().images[index]
      if (!before || before.locked) return
      restore(id, undefined, index)
      record(before, undefined, index, tr('reference.history.delete'))
    },
    bringToFront: (id) => {
      get().finish()
      const before = get().images
      const index = before.findIndex((image) => image.id === id)
      const image = before[index]
      if (!image?.documentId || !before.slice(index + 1).some((item) => item.documentId === image.documentId && Boolean(item.floating) === Boolean(image.floating))) return
      const top = before.length - 1
      restore(id, image, top)
      const documentId = image.documentId
      persist(documentId)
      useWorkspace.getState().pushHistory({ label: tr('reference.bringToFront'), bytes: 256,
        documentChanged: true, contentChanged: false, requiresAnimationSync: false,
        undo: () => restoreProject(id, image, index, documentId), redo: () => restoreProject(id, image, top, documentId)
      }, image.documentId)
    },
    reset: (id) => {
      const index = get().images.findIndex((image) => image.id === id)
      const before = get().images[index]
      if (!before?.initial || before.locked) return
      const { width, height, angle, flipX, flipY } = before.initial
      const after = { ...before, width, height, angle, flipX, flipY }
      if (same(before, after)) return
      restore(id, after, index)
      record(before, after, index, tr('reference.history.reset'))
    },
    begin: (id) => {
      get().finish()
      const image = get().images.find((item) => item.id === id)
      if (image && !image.locked) set({ pending: image })
    },
    finish: (cancel = false) => {
      const before = get().pending
      if (!before) return
      set({ pending: null })
      const index = get().images.findIndex((image) => image.id === before.id)
      if (cancel) restore(before.id, before, index)
      else record(before, get().images[index], index)
    }
  }
})

// Hydrate persisted references for newly opened/replaced projects; release their
// runtime copies on close, including an unfinished drag that could restore them.
type ReferenceWorkspace = Pick<ReturnType<typeof useWorkspace.getState>, 'sessions'>
const synchronizeOpenedReferences = (state: ReferenceWorkspace, previous: ReferenceWorkspace) => {
  if (state.sessions === previous.sessions) return
  const current = useCanvasReferences.getState()
  const openIds = new Set(state.sessions.map(session => session.document.id))
  let images = current.images.filter(image => image.documentId && openIds.has(image.documentId))
  let pending = current.pending?.documentId && openIds.has(current.pending.documentId) ? current.pending : null
  let changed = images.length !== current.images.length || pending !== current.pending
  for (const session of state.sessions) {
    const document = session.document
    if (hydratedReferences.has(document) && hydratedReferences.get(document) === document.canvasReferences) continue
    hydratedReferences.set(document, document.canvasReferences)
    if (document.canvasReferences === undefined) continue
    images = [...images.filter(image => image.documentId !== document.id), ...document.canvasReferences.map(image => ({ ...image, documentId: document.id }))]
    if (pending?.documentId === document.id) pending = null
    changed = true
  }
  if (changed) useCanvasReferences.setState({ images, pending })
}
const unsubscribeClosedSessions = useWorkspace.subscribe(synchronizeOpenedReferences)
synchronizeOpenedReferences(useWorkspace.getState(), { sessions: [] })
if (import.meta.hot) import.meta.hot.dispose(unsubscribeClosedSessions)
