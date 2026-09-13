import { createSparseLayer, paletteColorIdForCanvas } from '@/core/document-model'
import { animationCelKey, cloneAnimationCelSurface, ensureAnimationDocument, refreshActiveAnimationFrame, resolveAnimationCel, syncActiveAnimationLayer } from '@/core/animation'
import { moveLayerPanelRows as moveLayerPanelRowsOperation } from '@/core/layer-operations'
import { cloneTextCelData, convertTextSurface, normalizeTextCelData, rasterizeText } from '@/core/text-raster'
import { captureLayerUi } from './workspace-history'
import { captureDocumentStructureSnapshot, captureLayerContentSnapshot, documentStructureDeltaBytes, layerContentSnapshotBytes, restoreDocumentStructureSnapshot, restoreLayerContentSnapshot, type DocumentStructureSnapshot } from './workspace-document-history'
import type { TextCelPreview, TextLayerDraftTarget } from './workspace-state'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceLayerCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { selectedRowInsertionTarget, insertionTargetParent } from './workspace-animation-selection'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import { renderTextAtCurrentSurface, applyTextSurface } from './workspace-text-surface'


interface TextLayerDraftState {
  documentId: string
  before: DocumentStructureSnapshot
  beforeSelection: ReturnType<typeof captureLayerUi>
  selectedAnimationCellKeys: string[]
  animationCellSelectionAnchorKey: string | null
  animationCellSelectionExplicit: boolean
  selectedAnimationFrameIds: string[]
  animationFrameSelectionAnchorId: string | null
  dirty: boolean
  updatedAt: string
}

const invalidateTextLayerDraft = (session: DocumentSession, panelChanged = false): void => {
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  if (panelChanged) session.layersPanelRevision += 1
  session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
}

export function createLayerTextCommands({ get, set }: WorkspaceCommandContext<'commitFloatingPaste' | 'mutateActive'>): Pick<WorkspaceLayerCommands, 'createTextLayer' | 'beginTextLayerDraft' | 'updateTextLayerDraft' | 'commitTextLayerDraft' | 'cancelTextLayerDraft' | 'setTextCel' | 'previewTextCel' | 'restoreTextCelPreview'> {
  const draftsBySession = new WeakMap<DocumentSession, Map<string, TextLayerDraftState>>()
  const textLayerDrafts = (session: DocumentSession): Map<string, TextLayerDraftState> => {
    let drafts = draftsBySession.get(session)
    if (!drafts) { drafts = new Map(); draftsBySession.set(session, drafts) }
    return drafts
  }
  return {
    createTextLayer(raw, x, y) {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        const document = session.document
        const before = captureDocumentStructureSnapshot(document)
        const beforeSelection = captureLayerUi(session)
        const data = normalizeTextCelData({ ...raw, originX: Math.trunc(x), originY: Math.trunc(y), transforms: raw.transforms ?? [] }, session.primaryColor)
        const rendered = rasterizeText(data, x, y)
        const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
        const layer = createSparseLayer(data.text.split('\n')[0].trim().slice(0, 32) || tr('workspace.layer.textName'), document.colorMode)
        layer.kind = 'text'
        layer.width = surface.width
        layer.height = surface.height
        layer.offsetX = surface.offsetX
        layer.offsetY = surface.offsetY
        layer.pixels = surface.pixels
        const placement = selectedRowInsertionTarget(session)
        const targetGroupId = insertionTargetParent(document, placement)
        if (targetGroupId) layer.groupId = targetGroupId
        document.layers.push(layer)
        const timeline = ensureAnimationDocument(document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
        if (cel) {
          cel.text = cloneTextCelData(rendered.data)
          cel.surface = surface
          cel.opacity = layer.opacity
        }
        document.activeLayerId = layer.id
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [layer.id]
        session.selectedAnimationCellKeys = [animationCelKey(layer.id, timeline.activeFrameId)]
        session.animationCellSelectionExplicit = false
        syncActiveAnimationLayer(document, layer.id)
        moveLayerPanelRowsOperation(session, [layer.id], [], placement)
        const after = captureDocumentStructureSnapshot(document)
        const afterSelection = captureLayerUi(session)
        const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>): void => {
          restoreDocumentStructureSnapshot(document, snapshot)
          session.selectedLayerIds = [...selection.selectedLayerIds]
          session.selectedGroupId = selection.selectedGroupId
          session.selectedGroupIds = [...selection.selectedGroupIds]
          session.collapsedGroupIds = [...selection.collapsedGroupIds]
        }
        session.history.push({ label: tr('workspace.history.createText'), bytes: documentStructureDeltaBytes(before, after), undo: () => restore(before, beforeSelection), redo: () => restore(after, afterSelection), invalidation: { kind: 'full' }, requiresAnimationSync: false })
      }, true, true)
    },
    beginTextLayerDraft(raw, x, y) {
      get().commitFloatingPaste()
      let target: TextLayerDraftTarget | null = null
      get().mutateActive((session) => {
        const document = session.document
        const before = captureDocumentStructureSnapshot(document)
        const beforeSelection = captureLayerUi(session)
        const draftState: TextLayerDraftState = {
          documentId: document.id,
          before,
          beforeSelection,
          selectedAnimationCellKeys: [...session.selectedAnimationCellKeys],
          animationCellSelectionAnchorKey: session.animationCellSelectionAnchorKey,
          animationCellSelectionExplicit: session.animationCellSelectionExplicit,
          selectedAnimationFrameIds: [...session.selectedAnimationFrameIds],
          animationFrameSelectionAnchorId: session.animationFrameSelectionAnchorId,
          dirty: document.dirty,
          updatedAt: document.updatedAt
        }
        const data = normalizeTextCelData({ ...raw, originX: Math.trunc(x), originY: Math.trunc(y), transforms: raw.transforms ?? [] }, session.primaryColor)
        if (!data.text.length) return
        const rendered = rasterizeText(data, x, y)
        const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
        const layer = createSparseLayer(data.text.split('\n')[0].trim().slice(0, 32) || tr('workspace.layer.textName'), document.colorMode)
        layer.kind = 'text'
        layer.width = surface.width
        layer.height = surface.height
        layer.offsetX = surface.offsetX
        layer.offsetY = surface.offsetY
        layer.pixels = surface.pixels
        const placement = selectedRowInsertionTarget(session)
        const targetGroupId = insertionTargetParent(document, placement)
        if (targetGroupId) layer.groupId = targetGroupId
        document.layers.push(layer)
        const timeline = ensureAnimationDocument(document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)
        if (!cel) return
        cel.text = cloneTextCelData(rendered.data)
        cel.surface = surface
        cel.opacity = layer.opacity
        document.activeLayerId = layer.id
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [layer.id]
        session.selectedAnimationCellKeys = [animationCelKey(layer.id, timeline.activeFrameId)]
        session.animationCellSelectionAnchorKey = animationCelKey(layer.id, timeline.activeFrameId)
        session.animationCellSelectionExplicit = false
        syncActiveAnimationLayer(document, layer.id)
        moveLayerPanelRowsOperation(session, [layer.id], [], placement)
        textLayerDrafts(session).set(layer.id, draftState)
        target = { layerId: layer.id, frameId: timeline.activeFrameId }
        invalidateTextLayerDraft(session, true)
      }, false, true)
      return target
    },
    updateTextLayerDraft(layerId, frameId, raw, x, y) {
      const current = activeSession(get())
      const draft = current ? textLayerDrafts(current).get(layerId) : undefined
      if (!draft) return
      get().mutateActive((session) => {
        if (session.document.id !== draft.documentId) return
        const document = session.document
        const layer = document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'text')
        const timeline = ensureAnimationDocument(document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
        const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (!layer || !cel || !source) return
        const normalized = normalizeTextCelData(raw, session.primaryColor)
        const offsetX = Math.trunc(x ?? source.surface?.offsetX ?? normalized.originX ?? layer.offsetX)
        const offsetY = Math.trunc(y ?? source.surface?.offsetY ?? normalized.originY ?? layer.offsetY)
        const rendered = renderTextAtCurrentSurface(document, { ...normalized, originX: normalized.originX ?? offsetX, originY: normalized.originY ?? offsetY }, offsetX, offsetY)
        const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
        applyTextSurface(document, layer, source, cel, rendered.data, surface)
        layer.name = normalized.text.split('\n')[0].trim().slice(0, 32) || tr('workspace.layer.textName')
        if (timeline.activeFrameId === frameId) refreshActiveAnimationFrame(document)
        invalidateTextLayerDraft(session, true)
      }, false)
    },
    commitTextLayerDraft(layerId) {
      const current = activeSession(get())
      const draft = current ? textLayerDrafts(current).get(layerId) : undefined
      if (!draft) return
      get().mutateActive((session) => {
        if (session.document.id !== draft.documentId || !session.document.layers.some((layer) => layer.id === layerId)) return
        const after = captureDocumentStructureSnapshot(session.document)
        const afterSelection = captureLayerUi(session)
        const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>): void => {
          restoreDocumentStructureSnapshot(session.document, snapshot)
          session.selectedLayerIds = [...selection.selectedLayerIds]
          session.selectedGroupId = selection.selectedGroupId
          session.selectedGroupIds = [...selection.selectedGroupIds]
          session.collapsedGroupIds = [...selection.collapsedGroupIds]
        }
        session.history.push({ label: tr('workspace.history.createText'), bytes: documentStructureDeltaBytes(draft.before, after), undo: () => restore(draft.before, draft.beforeSelection), redo: () => restore(after, afterSelection), invalidation: { kind: 'full' }, requiresAnimationSync: false })
        textLayerDrafts(session).delete(layerId)
      }, true, true)
    },
    cancelTextLayerDraft(layerId) {
      const current = activeSession(get())
      const draft = current ? textLayerDrafts(current).get(layerId) : undefined
      if (!draft) return
      get().mutateActive((session) => {
        if (session.document.id !== draft.documentId) return
        restoreDocumentStructureSnapshot(session.document, draft.before)
        session.document.dirty = draft.dirty
        session.document.updatedAt = draft.updatedAt
        session.selectedLayerIds = [...draft.beforeSelection.selectedLayerIds]
        session.selectedGroupId = draft.beforeSelection.selectedGroupId
        session.selectedGroupIds = [...draft.beforeSelection.selectedGroupIds]
        session.collapsedGroupIds = [...draft.beforeSelection.collapsedGroupIds]
        session.selectedAnimationCellKeys = [...draft.selectedAnimationCellKeys]
        session.animationCellSelectionAnchorKey = draft.animationCellSelectionAnchorKey
        session.animationCellSelectionExplicit = draft.animationCellSelectionExplicit
        session.selectedAnimationFrameIds = [...draft.selectedAnimationFrameIds]
        session.animationFrameSelectionAnchorId = draft.animationFrameSelectionAnchorId
        textLayerDrafts(session).delete(layerId)
        invalidateTextLayerDraft(session, true)
      }, false, true)
    },
    setTextCel(layerId, frameId, raw, x, y) {
      get().mutateActive((session) => {
        const document = session.document
        const layer = document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'text')
        const timeline = ensureAnimationDocument(document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
        if (!layer || !cel) return
        const before = captureLayerContentSnapshot(document, layerId)
        const source = resolveAnimationCel(timeline, cel) ?? cel
        const normalized = normalizeTextCelData(raw, session.primaryColor)
        const offsetX = Math.trunc(x ?? source.surface?.offsetX ?? normalized.originX ?? layer.offsetX)
        const offsetY = Math.trunc(y ?? source.surface?.offsetY ?? normalized.originY ?? layer.offsetY)
        const rendered = renderTextAtCurrentSurface(document, { ...normalized, originX: normalized.originX ?? offsetX, originY: normalized.originY ?? offsetY }, offsetX, offsetY)
        const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
        applyTextSurface(document, layer, source, cel, rendered.data, surface)
        if (timeline.activeFrameId === frameId) refreshActiveAnimationFrame(document)
        const after = captureLayerContentSnapshot(document, layerId)
        session.history.push({ label: tr('workspace.history.editText'), bytes: layerContentSnapshotBytes(before) + layerContentSnapshotBytes(after), undo: () => restoreLayerContentSnapshot(document, before), redo: () => restoreLayerContentSnapshot(document, after), invalidation: { kind: 'full' }, affectedLayerIds: [layerId], requiresAnimationSync: false })
      })
    },
    previewTextCel(layerId, frameId, raw, x, y) {
      const current = activeSession(get())
      if (!current) return null
      const layer = current.document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'text')
      const timeline = ensureAnimationDocument(current.document)
      const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
      const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
      if (!layer || !cel || !source?.surface) return null
      const before: TextCelPreview = {
        surface: cloneAnimationCelSurface(source.surface),
        text: source.text ? cloneTextCelData(source.text) : undefined,
        palette: current.document.palette.map((entry) => ({ ...entry, color: { ...entry.color } })),
        paletteOrder: [...current.document.paletteOrder],
        paletteSlots: current.document.paletteSlots ? [...current.document.paletteSlots] : undefined,
        nextColorId: current.document.nextColorId
      }
      get().mutateActive((session) => {
        const document = session.document
        const activeLayer = document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'text')
        const activeTimeline = ensureAnimationDocument(document)
        const activeCel = activeTimeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
        const activeSource = resolveAnimationCel(activeTimeline, activeCel ?? null) ?? activeCel
        if (!activeLayer || !activeCel || !activeSource) return
        const normalized = normalizeTextCelData(raw, session.primaryColor)
        const offsetX = Math.trunc(x ?? activeSource.surface?.offsetX ?? normalized.originX ?? activeLayer.offsetX)
        const offsetY = Math.trunc(y ?? activeSource.surface?.offsetY ?? normalized.originY ?? activeLayer.offsetY)
        const rendered = renderTextAtCurrentSurface(document, { ...normalized, originX: normalized.originX ?? offsetX, originY: normalized.originY ?? offsetY }, offsetX, offsetY)
        const surface = convertTextSurface(rendered.rgba, document.colorMode, document.palette, (color) => paletteColorIdForCanvas(document, color))
        activeSource.text = cloneTextCelData(rendered.data)
        activeSource.surface = surface
        if (activeCel !== activeSource) {
          activeCel.text = activeSource.text
          activeCel.surface = surface
        }
        if (activeTimeline.activeFrameId === frameId) refreshActiveAnimationFrame(document)
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
      }, false)
      return before
    },
    restoreTextCelPreview(layerId, frameId, preview) {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
        const source = resolveAnimationCel(timeline, cel ?? null) ?? cel
        if (!cel || !source) return
        source.text = preview.text ? cloneTextCelData(preview.text) : undefined
        source.surface = cloneAnimationCelSurface(preview.surface)
        if (cel !== source) {
          cel.text = source.text
          cel.surface = source.surface
        }
        session.document.palette = preview.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
        session.document.paletteOrder = [...preview.paletteOrder]
        session.document.paletteSlots = preview.paletteSlots ? [...preview.paletteSlots] : undefined
        session.document.nextColorId = preview.nextColorId
        if (timeline.activeFrameId === frameId) refreshActiveAnimationFrame(session.document)
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
      }, false)
    }
  }
}
