import type { BlendMode, RgbaColor } from '@shared/types-color'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import { cachedLayerContentBounds, getGroupLockingAncestor, getLayerLockingGroup } from '@/core/document-model'
import { expandLayerStyleInvalidationRect } from '@/core/document-composite'
import type { ContentInvalidationHint, HistoryEntry } from '@/core/history'
import { setLinkedLayerGroupDisplayColor } from '@/core/linked-layers'
import { translateCurrent as tr } from '@/core/localization'
import type { DocumentTransactionRegistry } from './document-transactions'
import type { DocumentSession } from './workspace-types'

export type LayerPropertyField = 'name' | 'opacity' | 'blendMode' | 'cumulativeBlend' | 'displayColor' | 'description'

export interface LayerPropertyTarget {
  id: string
  kind: 'layer' | 'group'
}

export interface LayerPropertyValues {
  name: string
  opacity: number
  blendMode: BlendMode
  cumulativeBlend: boolean
  locked: boolean
  displayColor: RgbaColor | null
  description: string
}

interface LayerPropertySnapshot extends LayerPropertyTarget, LayerPropertyValues {}

interface LayerPropertiesTransactionData {
  targets: LayerPropertySnapshot[]
  previewContentChanged: boolean
  previewPanelChanged: boolean
  previewInvalidation?: ContentInvalidationHint
}

export type LayerPropertyCommitKind = 'none' | 'metadata' | 'content'
export interface LayerPropertyCommitResult {
  kind: LayerPropertyCommitKind
  invalidation?: ContentInvalidationHint
}

const TRANSACTION_KIND = 'layer-properties'
const ALL_FIELDS: readonly LayerPropertyField[] = ['name', 'opacity', 'blendMode', 'cumulativeBlend', 'displayColor', 'description']

const sameColor = (left: RgbaColor | null | undefined, right: RgbaColor | null | undefined): boolean =>
  left === right || Boolean(left && right && left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a)

const cloneColor = (color: RgbaColor | null | undefined): RgbaColor | null => color ? { ...color } : null

const targetFor = (session: DocumentSession, target: LayerPropertyTarget): RasterLayer | LayerGroup | null =>
  target.kind === 'layer'
    ? session.document.layers.find((layer) => layer.id === target.id) ?? null
    : session.document.groups.find((group) => group.id === target.id) ?? null

const captureTarget = (session: DocumentSession, target: LayerPropertyTarget): LayerPropertySnapshot | null => {
  const source = targetFor(session, target)
  if (!source) return null
  return {
    ...target,
    name: source.name,
    opacity: source.opacity,
    blendMode: source.blendMode,
    cumulativeBlend: target.kind === 'group' && (source as LayerGroup).cumulativeBlend === true,
    locked: source.locked,
    displayColor: cloneColor(source.displayColor),
    description: source.description ?? ''
  }
}

const applyLayerName = (session: DocumentSession, layer: RasterLayer, name: string): void => {
  layer.name = name
  if (layer.kind !== 'tilemap' || !layer.tilemapTilesetId) return
  const tileset = session.document.tilesets?.find((candidate) => candidate.id === layer.tilemapTilesetId)
  if (tileset) tileset.name = name
}

const applySnapshot = (session: DocumentSession, snapshot: LayerPropertySnapshot): void => {
  const target = targetFor(session, snapshot)
  if (!target) return
  if (snapshot.kind === 'layer') applyLayerName(session, target as RasterLayer, snapshot.name)
  else target.name = snapshot.name
  target.opacity = snapshot.opacity
  target.blendMode = snapshot.blendMode
  target.locked = snapshot.locked
  if (snapshot.kind === 'group') (target as LayerGroup).cumulativeBlend = snapshot.cumulativeBlend
  if (snapshot.displayColor) target.displayColor = { ...snapshot.displayColor }
  else delete target.displayColor
  if (snapshot.kind === 'layer' && (target as RasterLayer).linkedContentId) {
    setLinkedLayerGroupDisplayColor(session.document, (target as RasterLayer).linkedContentId!, snapshot.displayColor)
  }
  target.description = snapshot.description
}

const notifyPreviewChange = (session: DocumentSession, panelChanged: boolean, contentChanged: boolean, invalidation: ContentInvalidationHint = { kind: 'full' }): void => {
  if (panelChanged) session.layersPanelRevision += 1
  if (contentChanged) {
    const fromRevision = session.contentRevision
    session.revision += 1
    session.contentRevision += 1
    session.contentInvalidation = invalidation.kind === 'region'
      ? { ...invalidation, rect: { ...invalidation.rect }, fromRevision, revision: session.contentRevision }
      : { kind: 'full', fromRevision, revision: session.contentRevision }
  }
}

const unionRects = (left: NonNullable<Extract<ContentInvalidationHint, { kind: 'region' }>['rect']>, right: NonNullable<Extract<ContentInvalidationHint, { kind: 'region' }>['rect']>) => {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const toX = Math.max(left.x + left.width, right.x + right.width)
  const toY = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: toX - x, height: toY - y }
}

const combineInvalidations = (left?: ContentInvalidationHint, right?: ContentInvalidationHint): ContentInvalidationHint => {
  if (!left) return right ?? { kind: 'full' }
  if (!right) return left
  if (left.kind !== 'region' || right.kind !== 'region' || left.frameId !== right.frameId) return { kind: 'full' }
  return { kind: 'region', frameId: left.frameId, rect: unionRects(left.rect, right.rect) }
}

const contentInvalidationForTargets = (session: DocumentSession, targets: readonly LayerPropertySnapshot[]): ContentInvalidationHint => {
  if (targets.length !== 1 || targets[0].kind !== 'layer') return { kind: 'full' }
  const layer = session.document.layers.find((candidate) => candidate.id === targets[0].id)
  const bounds = layer ? cachedLayerContentBounds(session.document, layer) : undefined
  return layer && bounds
    ? { kind: 'region', rect: expandLayerStyleInvalidationRect(session.document, bounds, [layer.id]) }
    : { kind: 'full' }
}

const restoreTargets = (session: DocumentSession, data: LayerPropertiesTransactionData, notify = true): void => {
  for (const target of data.targets) applySnapshot(session, target)
  if (notify) notifyPreviewChange(session, data.previewPanelChanged, data.previewContentChanged, data.previewInvalidation)
  data.previewContentChanged = false
  data.previewPanelChanged = false
  data.previewInvalidation = undefined
}

const nextSnapshot = (
  session: DocumentSession,
  before: LayerPropertySnapshot,
  values: LayerPropertyValues,
  fields: ReadonlySet<LayerPropertyField>,
  includeLocked: boolean,
  commit: boolean
): LayerPropertySnapshot => {
  const current = targetFor(session, before)
  if (!current) return before
  const lockingAncestor = before.kind === 'group'
    ? getGroupLockingAncestor(session.document, current as LayerGroup)
    : getLayerLockingGroup(session.document, current as RasterLayer)
  const visualLocked = before.locked || Boolean(lockingAncestor)
  const name = fields.has('name')
    ? commit ? values.name.trim() || before.name : values.name
    : before.name
  return {
    ...before,
    name,
    opacity: fields.has('opacity') && !visualLocked ? Math.max(0, Math.min(1, values.opacity)) : before.opacity,
    blendMode: fields.has('blendMode') && !visualLocked ? values.blendMode : before.blendMode,
    cumulativeBlend: before.kind === 'group' && fields.has('cumulativeBlend') && !visualLocked ? values.cumulativeBlend : before.cumulativeBlend,
    locked: includeLocked ? (lockingAncestor ? before.locked : values.locked) : before.locked,
    displayColor: fields.has('displayColor') ? cloneColor(values.displayColor) : cloneColor(before.displayColor),
    description: fields.has('description') ? (commit ? values.description.trim() : values.description) : before.description
  }
}

const contentDiffers = (before: LayerPropertySnapshot, after: LayerPropertySnapshot): boolean =>
  before.opacity !== after.opacity || before.blendMode !== after.blendMode || before.cumulativeBlend !== after.cumulativeBlend

const metadataDiffers = (before: LayerPropertySnapshot, after: LayerPropertySnapshot): boolean =>
  before.name !== after.name || before.locked !== after.locked || before.description !== after.description || !sameColor(before.displayColor, after.displayColor)

const historyBytes = (before: LayerPropertySnapshot, after: LayerPropertySnapshot): number =>
  64 + before.name.length + after.name.length + before.description.length + after.description.length

const historyEntry = (session: DocumentSession, before: LayerPropertySnapshot, after: LayerPropertySnapshot): HistoryEntry => {
  const contentChanged = contentDiffers(before, after)
  return {
    label: tr(before.kind === 'group' ? 'workspace.history.groupProperties' : 'workspace.history.layerProperties'),
    bytes: historyBytes(before, after),
    undo: () => applySnapshot(session, before),
    redo: () => applySnapshot(session, after),
    contentChanged,
    affectedLayerIds: contentChanged && before.kind === 'layer' ? [before.id] : undefined,
    requiresAnimationSync: contentChanged,
    invalidation: contentChanged ? contentInvalidationForTargets(session, [before]) : undefined
  }
}

export const beginLayerPropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  targets: readonly LayerPropertyTarget[]
): string | null => {
  registry.cancelKind(session.document.id, TRANSACTION_KIND, session)
  const unique = targets.filter((target, index) => targets.findIndex((candidate) => candidate.id === target.id && candidate.kind === target.kind) === index)
  const snapshots = unique.flatMap((target) => {
    const snapshot = captureTarget(session, target)
    return snapshot ? [snapshot] : []
  })
  if (snapshots.length === 0) return null
  const data: LayerPropertiesTransactionData = { targets: snapshots, previewContentChanged: false, previewPanelChanged: false }
  return registry.begin(session.document.id, TRANSACTION_KIND, data, restoreTargets)
}

export const previewLayerPropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  id: string,
  values: LayerPropertyValues,
  changedFields: readonly LayerPropertyField[]
): boolean => {
  const transaction = registry.get<LayerPropertiesTransactionData>(id, session.document.id, TRANSACTION_KIND)
  if (!transaction) return false
  const restoredPanel = transaction.data.previewPanelChanged
  const restoredContent = transaction.data.previewContentChanged
  const restoredInvalidation = transaction.data.previewInvalidation
  restoreTargets(session, transaction.data, false)
  const fields = new Set(transaction.data.targets.length > 1 ? changedFields : ALL_FIELDS)
  const includeLocked = transaction.data.targets.length === 1
  let panelChanged = false
  let contentChanged = false
  const contentTargets: LayerPropertySnapshot[] = []
  for (const before of transaction.data.targets) {
    const after = nextSnapshot(session, before, values, fields, includeLocked, false)
    panelChanged ||= metadataDiffers(before, after) || contentDiffers(before, after)
    if (contentDiffers(before, after)) {
      contentChanged = true
      contentTargets.push(before)
    }
    applySnapshot(session, after)
  }
  transaction.data.previewPanelChanged = panelChanged
  transaction.data.previewContentChanged = contentChanged
  transaction.data.previewInvalidation = contentChanged ? contentInvalidationForTargets(session, contentTargets) : undefined
  notifyPreviewChange(
    session,
    restoredPanel || panelChanged,
    restoredContent || contentChanged,
    combineInvalidations(restoredContent ? restoredInvalidation : undefined, transaction.data.previewInvalidation)
  )
  return panelChanged
}

export const commitLayerPropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  id: string,
  values: LayerPropertyValues,
  changedFields: readonly LayerPropertyField[]
): LayerPropertyCommitResult => {
  const transaction = registry.finish<LayerPropertiesTransactionData>(id, session.document.id, TRANSACTION_KIND)
  if (!transaction) return { kind: 'none' }
  const restoredPanel = transaction.data.previewPanelChanged
  const restoredContent = transaction.data.previewContentChanged
  const restoredInvalidation = transaction.data.previewInvalidation
  restoreTargets(session, transaction.data, false)
  const fields = new Set(transaction.data.targets.length > 1 ? changedFields : ALL_FIELDS)
  const includeLocked = transaction.data.targets.length === 1
  const entries: HistoryEntry[] = []
  let contentChanged = false
  let metadataChanged = false
  for (const before of transaction.data.targets) {
    const after = nextSnapshot(session, before, values, fields, includeLocked, true)
    const targetContentChanged = contentDiffers(before, after)
    const targetMetadataChanged = metadataDiffers(before, after)
    if (!targetContentChanged && !targetMetadataChanged) continue
    applySnapshot(session, after)
    entries.push(historyEntry(session, before, after))
    contentChanged ||= targetContentChanged
    metadataChanged ||= targetMetadataChanged
  }
  if (entries.length === 0) {
    notifyPreviewChange(session, restoredPanel, restoredContent, restoredInvalidation)
    return { kind: 'none' }
  }
  if (entries.length === 1) session.history.push(entries[0])
  else {
    session.history.beginCompound()
    for (const entry of entries) session.history.push(entry)
    session.history.endCompound(tr('layers.multipleProperties'))
  }
  if (!contentChanged && restoredContent) notifyPreviewChange(session, false, true, restoredInvalidation)
  return contentChanged
    ? { kind: 'content', invalidation: session.history.latestUndoEntry?.invalidation }
    : { kind: metadataChanged ? 'metadata' : 'none' }
}

export const cancelLayerPropertiesTransaction = (
  registry: DocumentTransactionRegistry<DocumentSession>,
  session: DocumentSession,
  id: string
): boolean => registry.cancel(id, session)
