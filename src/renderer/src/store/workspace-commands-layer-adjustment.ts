import { completeDocumentChange } from './workspace-document-change'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { LayerGroup, RasterLayer } from '@shared/types-layer'
import type { BlendMode, PaletteEntry, RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { checkResourceLimit } from '@/core/resource-policy'
import { commitPixelEdit } from '@/core/history'
import { cacheRasterContentBounds, cachedLayerContentBounds, createId, createLayer, getActiveLayer, isLayerEffectivelyLocked, layerContentBounds, markLayerContentChanged, paletteColorIdForCanvas, readLayerColor } from '@/core/document-model'
import { cloneAnimationCelSurface, connectAnimationCels, ensureAnimationDocument, refreshActiveAnimationFrame, syncActiveAnimationFrame, syncActiveAnimationLayer } from '@/core/animation'
import { applyColorAdjustment, applyColorAdjustmentDirect, isColorAdjustmentIdentity, type ColorAdjustment } from '@/core/adjustments'
import type { AdjustmentPreviewResult } from '@/core/adjustment-preview-protocol'
import { linkedLayerMembers, shareLinkedRasterContent } from '@/core/linked-layers'
import { filterPresetById, lcdChannelColorAtNormalized, lcdChannelOffset, lcdScanlineColorAtNormalized, normalizeLcdScreenFilterOptions, renderFilterPreset, type LcdScreenFilterOptions } from '@/core/filter-presets'
import { captureAdjustmentSnapshot, captureLayerUi, prepareAdjustmentSnapshotTargets, restoreAdjustmentSnapshot, restoreAdjustmentSnapshotRegions, restorePreparedAdjustmentSnapshotLayer } from './workspace-history'
import { captureDocumentStructureSnapshot, documentStructureDeltaBytes, restoreDocumentStructureSnapshot, type DocumentStructureSnapshot } from './workspace-document-history'
import type { AdjustmentSnapshot, DocumentSession } from './workspace-types'
import type { WorkspaceLayerCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { intersectSelectionRects, mergeSelectionRects } from './workspace-selection-geometry'
import { defaultFreeTileSourceDisplayColor } from './workspace-layer-resources'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import { nextAvailableLayerDisplayColor } from './workspace-layer-creation-context'

const distinctLinkedLayerTargets = (document: SpriteDocument, layerIds: readonly string[]): string[] => {
  const seenLinks = new Set<string>()
  return [...new Set(layerIds)].filter((layerId) => {
    const layer = document.layers.find((candidate) => candidate.id === layerId)
    if (!layer?.linkedContentId) return Boolean(layer)
    if (seenLinks.has(layer.linkedContentId)) return false
    seenLinks.add(layer.linkedContentId)
    return true
  })
}

const shareLinkedLayerPreviewContents = (document: SpriteDocument, layerIds: readonly string[]): void => {
  for (const layerId of distinctLinkedLayerTargets(document, layerIds)) {
    const source = document.layers.find((candidate) => candidate.id === layerId)
    if (!source?.linkedContentId) continue
    for (const member of linkedLayerMembers(document, source.linkedContentId)) shareLinkedRasterContent(member, source)
  }
}

const commitLinkedLayerAdjustmentContents = (document: SpriteDocument, layerIds: readonly string[]): void => {
  for (const layerId of distinctLinkedLayerTargets(document, layerIds)) {
    if (document.layers.find((candidate) => candidate.id === layerId)?.linkedContentId) syncActiveAnimationLayer(document, layerId)
  }
}

const selectionRectContains = (container: SelectionRect, target: SelectionRect): boolean => container.x <= target.x
  && container.y <= target.y
  && container.x + container.width >= target.x + target.width
  && container.y + container.height >= target.y + target.height

const markAdjustmentPreviewChanged = (session: DocumentSession, rect: SelectionRect): void => {
  const clipped = intersectSelectionRects(rect, { x: 0, y: 0, width: session.document.width, height: session.document.height })
  if (!clipped) return
  const fromRevision = session.contentRevision
  session.revision += 1
  session.contentRevision += 1
  session.contentInvalidation = {
    kind: 'region',
    frameId: session.document.animation?.activeFrameId,
    rect: clipped,
    fromRevision,
    revision: session.contentRevision
  }
}

const applyAdjustmentPreviewResultLayer = (layer: RasterLayer, result: AdjustmentPreviewResult['layers'][number], palette: readonly PaletteEntry[]): boolean => {
  if (layer.format !== result.format) return false
  const localX = result.x - layer.offsetX
  const localY = result.y - layer.offsetY
  if (localX < 0 || localY < 0 || localX + result.width > layer.width || localY + result.height > layer.height) return false
  const components = layer.format === 'rgba' ? 4 : 1
  for (let row = 0; row < result.height; row += 1) {
    const sourceOffset = row * result.width * components
    const targetOffset = ((localY + row) * layer.width + localX) * components
    if (layer.format === 'rgba' && result.pixels instanceof Uint8ClampedArray) {
      layer.pixels.set(result.pixels.subarray(sourceOffset, sourceOffset + result.width * components), targetOffset)
    } else if (layer.format === 'indexed' && result.pixels instanceof Uint32Array) {
      layer.pixels.set(result.pixels.subarray(sourceOffset, sourceOffset + result.width), targetOffset)
    } else return false
  }
  markLayerContentChanged(layer)
  cacheRasterContentBounds(layer, palette, result.localContentBounds)
  return true
}

const adjustmentPreviewResultCoversTargets = (session: DocumentSession, baseline: AdjustmentSnapshot, result: AdjustmentPreviewResult): boolean => {
  let targetCount = 0
  for (const layerSnapshot of baseline.layers) {
    const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
    if (!layer || layer.kind || isLayerEffectivelyLocked(session.document, layer)) continue
    targetCount += 1
    const contentBounds = cachedLayerContentBounds(session.document, layer) ?? layerContentBounds(session.document, layer)
    if (!contentBounds) continue
    const required = session.selection ? intersectSelectionRects(contentBounds, session.selection) : contentBounds
    if (!required) continue
    const previewLayer = result.layers.find((candidate) => candidate.layerId === layer.id && candidate.format === layer.format)
    if (!previewLayer || !selectionRectContains(previewLayer, required)) return false
  }
  return targetCount > 0
}

const adjustmentLinkedInvalidationRects = (document: SpriteDocument, source: RasterLayer, sourceRect: SelectionRect): SelectionRect[] => {
  const localRect = {
    x: sourceRect.x - source.offsetX,
    y: sourceRect.y - source.offsetY,
    width: sourceRect.width,
    height: sourceRect.height
  }
  const targets = source.linkedContentId ? linkedLayerMembers(document, source.linkedContentId) : [source]
  return targets.flatMap((target) => {
    const rect = intersectSelectionRects({
      x: target.offsetX + localRect.x,
      y: target.offsetY + localRect.y,
      width: localRect.width,
      height: localRect.height
    }, { x: 0, y: 0, width: document.width, height: document.height })
    return rect ? [rect] : []
  })
}

const adjustmentSnapshotInvalidationRect = (session: DocumentSession, baseline: AdjustmentSnapshot): SelectionRect | null => {
  let invalidation: SelectionRect | null = null
  for (const layerSnapshot of baseline.layers) {
    const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
    if (!layer || layer.kind || isLayerEffectivelyLocked(session.document, layer)) continue
    const contentBounds = cachedLayerContentBounds(session.document, layer) ?? layerContentBounds(session.document, layer)
    const sourceRect = contentBounds && session.selection ? intersectSelectionRects(contentBounds, session.selection) : contentBounds
    if (!sourceRect) continue
    for (const rect of adjustmentLinkedInvalidationRects(session.document, layer, sourceRect)) {
      invalidation = invalidation ? mergeSelectionRects(invalidation, rect) : rect
    }
  }
  return invalidation
}

export function createLayerAdjustmentCommands({ get, set, recording }: WorkspaceCommandContext<'commitFloatingPaste' | 'mutateActive'>): Pick<WorkspaceLayerCommands, 'applyFilterPreset' | 'applyLcdScreenFilter' | 'applyActiveLayerAdjustment' | 'captureActiveLayerAdjustmentSnapshot' | 'previewActiveLayerAdjustment' | 'applyActiveLayerAdjustmentPreviewResult' | 'restoreActiveDocumentSnapshot' | 'applyActiveLayerAdjustmentFromSnapshot'> {
  const { recordDocumentOperation } = recording
  return {
    async applyFilterPreset(presetId) {
      get().commitFloatingPaste()
      const current = activeSession(get())
      const preset = filterPresetById(presetId)
      if (!current || !preset) return
      const documentId = current.document.id
      try {
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 1, current.document.colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        get().mutateActive((session) => {
          if (session.document.id !== documentId) return
          const document = session.document
          const before = captureDocumentStructureSnapshot(document)
          const beforeSelection = captureLayerUi(session)
          const rgbaPixels = renderFilterPreset(preset.id, document.width, document.height)
          const layer = createLayer(`滤镜 · ${preset.name}`, document.width, document.height, document.colorMode)
          layer.blendMode = preset.blendMode
          layer.opacity = preset.opacity
          layer.description = preset.description
          if (session.selectedGroupId && document.groups.some((group) => group.id === session.selectedGroupId)) layer.groupId = session.selectedGroupId
          if (layer.format === 'rgba') layer.pixels = rgbaPixels
          else {
            const pixels = new Uint32Array(document.width * document.height)
            for (let index = 0; index < pixels.length; index += 1) {
              const offset = index * 4
              pixels[index] = paletteColorIdForCanvas(document, {
                r: rgbaPixels[offset],
                g: rgbaPixels[offset + 1],
                b: rgbaPixels[offset + 2],
                a: rgbaPixels[offset + 3]
              })
            }
            layer.pixels = pixels
          }
          document.layers.push(layer)
          const timeline = ensureAnimationDocument(document)
          const filterCels = timeline.cels.filter((cel) => cel.layerId === layer.id)
          const sourceSurface: AnimationCelSurface = layer.format === 'rgba'
            ? { format: 'rgba', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: new Uint8ClampedArray(layer.pixels) }
            : { format: 'indexed', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: new Uint32Array(layer.pixels) }
          for (const cel of filterCels) {
            cel.linkedCelId = null
            cel.surface = cloneAnimationCelSurface(sourceSurface)
            delete cel.text
            delete cel.tilemap
            delete cel.freeTiles
          }
          connectAnimationCels(document, filterCels.map((cel) => cel.id))
          document.activeLayerId = layer.id
          session.selectedGroupId = null
          session.selectedGroupIds = []
          session.selectedLayerIds = [layer.id]
          refreshActiveAnimationFrame(document)
          const after = captureDocumentStructureSnapshot(document)
          const afterSelection = captureLayerUi(session)
          const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>): void => {
            restoreDocumentStructureSnapshot(document, snapshot)
            session.selectedLayerIds = [...selection.selectedLayerIds]
            session.selectedGroupId = selection.selectedGroupId
            session.selectedGroupIds = [...selection.selectedGroupIds]
            session.collapsedGroupIds = [...selection.collapsedGroupIds]
          }
          session.history.push({
            label: `滤镜：${preset.name}`,
            bytes: documentStructureDeltaBytes(before, after),
            undo: () => restore(before, beforeSelection),
            redo: () => restore(after, afterSelection),
            invalidation: { kind: 'full' },
            requiresAnimationSync: false
          })
        }, true, true)
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
      }
    },
    async applyLcdScreenFilter(options?: Partial<LcdScreenFilterOptions>) {
      get().commitFloatingPaste()
      const current = activeSession(get())
      const selectedLayerId = current?.selectedLayerIds.length === 1 ? current.selectedLayerIds[0] : null
      if (!current || !selectedLayerId) return
      const documentId = current.document.id
      const lcdOptions = normalizeLcdScreenFilterOptions(options)
      try {
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 4, current.document.colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        get().mutateActive((session) => {
          if (session.document.id !== documentId) return
          const document = session.document
          const source = document.layers.find((layer) => layer.id === selectedLayerId)
          if (!source) return
          syncActiveAnimationFrame(document)
          const before = captureDocumentStructureSnapshot(document)
          const beforeSelection = captureLayerUi(session)
          const sourceVisibleBefore = source.visible
          const groupId = createId('filter-group')
          const group: LayerGroup = {
            id: groupId,
            name: tr('filter.lcdScreen'),
            parentGroupId: source.groupId ?? null,
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'normal',
            panelOrder: document.layers.indexOf(source) + 0.5,
            displayColor: { ...nextAvailableLayerDisplayColor(document), a: 64 }
          }
          let lcdLayerColorIndex = 0
          const sourceColorAt = (x: number, y: number): RgbaColor => x < 0 || y < 0 || x >= source.width || y >= source.height
            ? { r: 0, g: 0, b: 0, a: 0 }
            : readLayerColor(document, source, y * source.width + x)
          const makeLayer = (name: string, mode: BlendMode, colorize: (color: RgbaColor, x: number, y: number) => RgbaColor, offset = { x: 0, y: 0 }): RasterLayer => {
            const layer = createLayer(name, source.width, source.height, document.colorMode)
            layer.groupId = groupId
            layer.blendMode = mode
            layer.displayColor = defaultFreeTileSourceDisplayColor(lcdLayerColorIndex++)
            if (layer.format === 'rgba') {
              const pixels = new Uint8ClampedArray(source.width * source.height * 4)
              for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
                const color = colorize(sourceColorAt(x - offset.x, y - offset.y), x, y)
                const pixelOffset = (y * source.width + x) * 4
                pixels[pixelOffset] = color.r
                pixels[pixelOffset + 1] = color.g
                pixels[pixelOffset + 2] = color.b
                pixels[pixelOffset + 3] = color.a
              }
              layer.pixels = pixels
            } else {
              const pixels = new Uint32Array(source.width * source.height)
              for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
                pixels[y * source.width + x] = paletteColorIdForCanvas(document, colorize(sourceColorAt(x - offset.x, y - offset.y), x, y))
              }
              layer.pixels = pixels
            }
            layer.offsetX = source.offsetX
            layer.offsetY = source.offsetY
            return layer
          }
          const redLayer = makeLayer(tr('filter.red'), 'screen', (color, x, y) => lcdChannelColorAtNormalized(color, 0, x, y, lcdOptions), lcdChannelOffset(0, lcdOptions))
          const greenLayer = makeLayer(tr('filter.green'), 'screen', (color, x, y) => lcdChannelColorAtNormalized(color, 1, x, y, lcdOptions), lcdChannelOffset(1, lcdOptions))
          const blueLayer = makeLayer(tr('filter.blue'), 'screen', (color, x, y) => lcdChannelColorAtNormalized(color, 2, x, y, lcdOptions), lcdChannelOffset(2, lcdOptions))
          const scanlineLayer = makeLayer(tr('filter.scanlines'), 'soft-light', (_color, x, y) => lcdScanlineColorAtNormalized(x, y, lcdOptions))
          redLayer.displayColor = { r: 255, g: 0, b: 0, a: 64 }
          greenLayer.displayColor = { r: 0, g: 255, b: 0, a: 64 }
          blueLayer.displayColor = { r: 0, g: 0, b: 255, a: 64 }
          scanlineLayer.displayColor = { r: 128, g: 128, b: 128, a: 64 }
          document.groups.push(group)
          const sourceIndex = document.layers.indexOf(source)
          const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : document.layers.length
          // Internal layer order is bottom-to-top; reverse the visual child order
          // so the panel reads Scanlines, Blue, Green, Red.
          document.layers.splice(insertAt, 0, redLayer, greenLayer, blueLayer, scanlineLayer)
          source.visible = false
          const timeline = ensureAnimationDocument(document)
          const createdLayers = [redLayer, greenLayer, blueLayer, scanlineLayer]
          for (const layer of createdLayers) {
            const cels = timeline.cels.filter((cel) => cel.layerId === layer.id)
            const surface: AnimationCelSurface = layer.format === 'rgba'
              ? { format: 'rgba', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: new Uint8ClampedArray(layer.pixels) }
              : { format: 'indexed', width: layer.width, height: layer.height, offsetX: layer.offsetX, offsetY: layer.offsetY, pixels: new Uint32Array(layer.pixels) }
            for (const cel of cels) {
              cel.linkedCelId = null
              cel.surface = cloneAnimationCelSurface(surface)
              delete cel.text
              delete cel.tilemap
              delete cel.freeTiles
            }
            connectAnimationCels(document, cels.map((cel) => cel.id))
          }
          document.activeLayerId = redLayer.id
          session.selectedLayerIds = []
          session.selectedGroupId = groupId
          session.selectedGroupIds = [groupId]
          refreshActiveAnimationFrame(document)
          const after = captureDocumentStructureSnapshot(document)
          const afterSelection = captureLayerUi(session)
          const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>, sourceVisible: boolean): void => {
            restoreDocumentStructureSnapshot(document, snapshot)
            const restoredSource = document.layers.find((layer) => layer.id === selectedLayerId)
            if (restoredSource) restoredSource.visible = sourceVisible
            session.selectedLayerIds = [...selection.selectedLayerIds]
            session.selectedGroupId = selection.selectedGroupId
            session.selectedGroupIds = [...selection.selectedGroupIds]
            session.collapsedGroupIds = [...selection.collapsedGroupIds]
          }
          session.history.push({ label: `${tr('filter.lcdScreen')}`, bytes: documentStructureDeltaBytes(before, after), undo: () => restore(before, beforeSelection, sourceVisibleBefore), redo: () => restore(after, afterSelection, false), invalidation: { kind: 'full' }, requiresAnimationSync: false })
        }, true, true)
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
      }
    },
    applyActiveLayerAdjustment(adjustment) {
      get().mutateActive((session) => {
        const labels: Record<ColorAdjustment['kind'], string> = {
          'color-balance': tr('adjustment.title.colorBalance'), 'brightness-contrast': tr('adjustment.title.brightnessContrast'), 'hue-saturation': tr('adjustment.title.hueSaturation'), curves: tr('adjustment.title.curves')
        }
        const targetIds = distinctLinkedLayerTargets(session.document, session.selection
          ? [getActiveLayer(session.document).id]
          : session.selectedLayerIds.length > 0 ? session.selectedLayerIds : [session.document.activeLayerId])
        session.history.beginCompound()
        for (const layerId of targetIds) {
          const layer = session.document.layers.find((candidate) => candidate.id === layerId)
          if (!layer || layer.kind || isLayerEffectivelyLocked(session.document, layer)) continue
          const edit = applyColorAdjustment(session.document, layer, adjustment, session.selection)
          const entry = commitPixelEdit(session.document, edit, labels[adjustment.kind])
          if (entry) session.history.push(entry)
        }
        session.history.endCompound(labels[adjustment.kind])
      })
    },
    captureActiveLayerAdjustmentSnapshot() {
      const session = activeSession(get())
      return session ? captureAdjustmentSnapshot(session) : null
    },
    previewActiveLayerAdjustment(adjustment, baseline, selection, region) {
      get().mutateActive((session) => {
        prepareAdjustmentSnapshotTargets(session, baseline, Boolean(region))
        const targetSelection = selection === undefined ? session.selection : selection
        for (const layerSnapshot of baseline.layers) {
          const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
          if (!layer) continue
          if (!layer.kind && !isLayerEffectivelyLocked(session.document, layer)) applyColorAdjustmentDirect(session.document, layer, adjustment, targetSelection, layerSnapshot.pixels, region)
          else if (!region) restorePreparedAdjustmentSnapshotLayer(session, layerSnapshot)
        }
        shareLinkedLayerPreviewContents(session.document, baseline.layers.map((layer) => layer.layerId))
        if (region) markAdjustmentPreviewChanged(session, region)
        else {
          const fromRevision = session.contentRevision
          session.revision += 1
          session.contentRevision += 1
          session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
        }
      }, false)
    },
    applyActiveLayerAdjustmentPreviewResult(baseline, result) {
      get().mutateActive((session) => {
        prepareAdjustmentSnapshotTargets(session, baseline, true)
        session.document.palette = result.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
        session.document.nextColorId = result.nextColorId
        let invalidation: SelectionRect | null = null
        const appliedLayerIds: string[] = []
        for (const layerResult of result.layers) {
          const layer = session.document.layers.find((candidate) => candidate.id === layerResult.layerId)
          if (!layer || layer.kind || isLayerEffectivelyLocked(session.document, layer)) continue
          if (!applyAdjustmentPreviewResultLayer(layer, layerResult, session.document.palette)) continue
          appliedLayerIds.push(layer.id)
        }
        if (appliedLayerIds.length === 0) return
        shareLinkedLayerPreviewContents(session.document, appliedLayerIds)
        for (const layerResult of result.layers) {
          const layer = session.document.layers.find((candidate) => candidate.id === layerResult.layerId)
          if (!layer || !appliedLayerIds.includes(layer.id)) continue
          const sourceRect = { x: layerResult.x, y: layerResult.y, width: layerResult.width, height: layerResult.height }
          for (const rect of adjustmentLinkedInvalidationRects(session.document, layer, sourceRect)) {
            invalidation = invalidation ? mergeSelectionRects(invalidation, rect) : rect
          }
        }
        if (!invalidation) return
        markAdjustmentPreviewChanged(session, invalidation)
      }, false)
    },
    restoreActiveDocumentSnapshot(snapshot, regions) {
      get().mutateActive((session) => {
        if (regions && regions.length > 0) {
          const restored = restoreAdjustmentSnapshotRegions(session, snapshot, regions)
          shareLinkedLayerPreviewContents(session.document, snapshot.layers.map((layer) => layer.layerId))
          if (restored === null) {
            const fromRevision = session.contentRevision
            session.revision += 1
            session.contentRevision += 1
            session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
            return
          }
          let invalidation: SelectionRect | null = null
          for (const restoredLayer of restored) {
            const layer = session.document.layers.find((candidate) => candidate.id === restoredLayer.layerId)
            if (!layer) continue
            for (const rect of adjustmentLinkedInvalidationRects(session.document, layer, restoredLayer.rect)) {
              invalidation = invalidation ? mergeSelectionRects(invalidation, rect) : rect
            }
          }
          if (invalidation) markAdjustmentPreviewChanged(session, invalidation)
          return
        }
        restoreAdjustmentSnapshot(session, snapshot)
        shareLinkedLayerPreviewContents(session.document, snapshot.layers.map((layer) => layer.layerId))
        const fromRevision = session.contentRevision
        session.revision += 1
        session.contentRevision += 1
        session.contentInvalidation = { kind: 'full', fromRevision, revision: session.contentRevision }
      }, false)
    },
    applyActiveLayerAdjustmentFromSnapshot(adjustment, baseline, previewResult) {
      get().mutateActive((session) => {
        const before = baseline
        const reusePreview = Boolean(previewResult && !isColorAdjustmentIdentity(adjustment) && adjustmentPreviewResultCoversTargets(session, before, previewResult))
        const invalidationRect = adjustmentSnapshotInvalidationRect(session, before)
        if (!reusePreview) {
          prepareAdjustmentSnapshotTargets(session, before)
          for (const layerSnapshot of before.layers) {
            const layer = session.document.layers.find((candidate) => candidate.id === layerSnapshot.layerId)
            if (!layer) continue
            if (!layer.kind && !isLayerEffectivelyLocked(session.document, layer)) applyColorAdjustmentDirect(session.document, layer, adjustment, session.selection, layerSnapshot.pixels)
            else restorePreparedAdjustmentSnapshotLayer(session, layerSnapshot)
          }
        } else if (previewResult) {
          session.document.palette = previewResult.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
          session.document.nextColorId = previewResult.nextColorId
        }
        shareLinkedLayerPreviewContents(session.document, before.layers.map((layer) => layer.layerId))
        const after = captureAdjustmentSnapshot(session, before.layers.map((layer) => layer.layerId))
        const affectedLayerIds = before.layers.map((layer) => layer.layerId)
        commitLinkedLayerAdjustmentContents(session.document, affectedLayerIds)
        const labels: Record<ColorAdjustment['kind'], string> = {
          'color-balance': tr('adjustment.title.colorBalance'), 'brightness-contrast': tr('adjustment.title.brightnessContrast'), 'hue-saturation': tr('adjustment.title.hueSaturation'), curves: tr('adjustment.title.curves')
        }
        session.history.push({
          label: labels[adjustment.kind],
          bytes: before.layers.reduce((bytes, layer) => bytes + layer.pixels.byteLength, 0) + after.layers.reduce((bytes, layer) => bytes + layer.pixels.byteLength, 0) + (before.palette.length + after.palette.length) * 24,
          undo: () => { restoreAdjustmentSnapshot(session, before); commitLinkedLayerAdjustmentContents(session.document, affectedLayerIds) },
          redo: () => { restoreAdjustmentSnapshot(session, after); commitLinkedLayerAdjustmentContents(session.document, affectedLayerIds) },
          invalidation: invalidationRect ? { kind: 'region', frameId: session.document.animation?.activeFrameId, rect: invalidationRect } : { kind: 'full' },
          affectedLayerIds
        })
        for (const layerId of affectedLayerIds) syncActiveAnimationLayer(session.document, layerId)
        if (reusePreview) {
          session.document.dirty = true
          session.document.updatedAt = new Date().toISOString()
          session.recoverySuppressed = false
        } else completeDocumentChange(session, 'content', recordDocumentOperation, invalidationRect ? { kind: 'region', frameId: session.document.animation?.activeFrameId, rect: invalidationRect } : { kind: 'full' })
      }, false)
    }
  }
}
