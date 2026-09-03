import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AnimationCel, AnimationCelSurface, AnimationLoopSection, AnimationTimeline, BlendMode, LayerGroup, LayerMask, PaletteEntry, RasterLayer, RgbaColor, Tileset } from '@shared/types'
import { AnimationLoopSectionDialog, type AnimationLoopSectionDraft } from '@/components/AnimationLoopSectionDialog'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { ColorValueControl } from '@/components/ColorValueControl'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { RangeField } from '@/components/RangeField'
import { TextAreaInput } from '@/components/TextAreaInput'
import { TextInput } from '@/components/TextInput'
import { ThemedSelect, type ThemedSelectGroup } from '@/components/ThemedSelect'
import { Tooltip } from '@/components/Tooltip'
import { openTextToolDialog } from '@/components/text-tool-events'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { animationMaskAt, animationMaskSlotAt, createAnimationMaskLookup, getDescendantGroupIds, getGroupLockingAncestor, getLayerIdsInGroup, getLayerLockingGroup, isGroupEffectivelyLocked, isLayerEffectivelyLocked, resolveAnimationMask } from '@/core/document'
import { COMMAND_SCOPE_EVENT, EDITOR_SHORTCUT_COMMAND_EVENT, type EditorShortcutCommandDetail } from '@/core/command-context'
import { buildLayerPanelTree, layerPanelRevealScrollTop, resolveLayerPanelDropTarget, resolveLayerPanelEdgeDropTarget, type LayerPanelNode } from '@/core/layer-panel-layout'
import { DEFAULT_ONION_SKIN_PREFERENCES, loadEditorPreferences, saveEditorPreferences, type OnionSkinPreferences } from '@/core/file-preferences'
import { animationCelHasContent, animationCelKey, animationGroupMaskAt, createAnimationCelLookup, createDefaultAnimationTimeline, ensureAnimationDocument, parseAnimationCelKey } from '@/core/animation'
import { animationLoopSectionAtFrame, resolveAnimationLoopSectionRange } from '@/core/animation-loop-sections'
import { renderAnimationCelThumbnailPixels, renderLayerMaskThumbnailPixels } from '@/core/animation-thumbnail'
import { formatShortcutBindingsForLocale, loadShortcutBindings, shortcutBindingsFor, type ShortcutId } from '@/core/shortcuts'
import { useWorkspace, type DocumentSession, type LayerPropertyField, type LayerPropertyTarget, type LayerPropertyValues } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { AnimationPlaybackMenu } from '@/components/AnimationPlaybackMenu'
import { PlaybackPixelIcon } from '@/components/PlaybackPixelIcon'
import { PixelUtilityIcon, type PixelUtilityIconKind } from '@/components/PixelUtilityIcon'
import { CheckboxField } from '@/components/CheckboxField'
import { CANVAS_SELECTION_PRESERVE_EVENT, CANVAS_SELECTION_STARTED_EVENT, LAYER_PANEL_REVEAL_EVENT, type CanvasSelectionPreserveDetail, type CanvasSelectionStartedDetail, type LayerPanelRevealDetail } from '@/components/layer-panel-reveal'
import { rasterStorageIdentity } from '@/core/runtime-raster'
import { DEFAULT_LAYER_DENSITY as defaultLayerDensity, LAYER_DENSITY_ORDER as layerDensityOrder, loadFreeTileInstancePanelLayout, loadLayerDensity, loadLayerSideDockAutoHide, saveLayerDensity, saveLayerSideDockAutoHide, type FreeTileInstancePanelLayout, type LayerDisplayDensity } from '@/core/layer-panel-preferences'
import { LayerStyleDialog } from '@/components/LayerStyleDialog'
import { hasConfiguredLayerStyles, hasEnabledLayerStyles } from '@/core/layer-styles'
import { BackgroundLayerDialog } from '@/components/BackgroundLayerDialog'
import { TilemapLayerDialog } from '@/components/TilemapLayerDialog'
import { FreeTileLayerDialog } from '@/components/FreeTileLayerDialog'
import { FreeTileInstanceLayers } from '@/components/panels/FreeTileInstanceLayers'
import { FreeTileInstancePanelSettings } from '@/components/panels/FreeTileInstancePanelSettings'
import { useLayerRowToggleGesture } from '@/components/panels/useLayerRowToggleGesture'
import { PixelAutoLinkIcon } from '@/components/PixelAutoLinkIcon'
import { createAnimationTimelineVisualIndex, deriveAnimationTimelineVisualState, shouldRenderTimelineCelSelectionMarker, type TimelineVisualCell, type TimelineVisualRow } from '@/core/animation-timeline-visual-state'
import { timelineVisualClasses } from '@/core/animation-timeline-visual-classes'
import { resolveTimelineFocusState } from '@/core/animation-timeline-focus'
import { timelineCellSlotKey, timelineRowKey, type TimelineCellRef, type TimelineRowRef } from '@/core/animation-timeline-identity'
import { notifyAnimationCelThumbnailPreview, notifyLayerMaskThumbnailPreview, registerAnimationCelThumbnailPreviewListener, registerLayerMaskThumbnailPreviewListener } from '@/core/canvas-preview-lifecycle'

type LayerFormTarget = LayerPropertyTarget
type BatchProperty = LayerPropertyField
interface LayerFormState { id: string; kind: 'layer' | 'group'; targets: LayerFormTarget[]; batchChanges: BatchProperty[]; name: string; opacity: number; blendMode: BlendMode; cumulativeBlend: boolean; locked: boolean; displayColor: RgbaColor | null; description: string }
const ALL_LAYER_PROPERTY_FIELDS: readonly LayerPropertyField[] = ['name', 'opacity', 'blendMode', 'cumulativeBlend', 'displayColor', 'description']
interface LayerDragState { ids: string[]; groupIds: string[]; groupId?: string; row: LayerFormTarget; preserveSelection: boolean; selectOnClick: boolean; selectedLayerIds: string[]; selectedGroupIds: string[]; wholeGroupSelection: boolean; startX: number; startY: number; moved: boolean; copy: boolean }
type LayerPanelToggleTarget =
  | { control: 'visibility'; ownerKind: 'layer'; id: string }
  | { control: 'visibility'; ownerKind: 'group'; id: string }
  | { control: 'visibility'; ownerKind: 'layer-mask'; id: string }
  | { control: 'visibility'; ownerKind: 'group-mask'; id: string; frameId: string }
  | { control: 'lock'; ownerKind: 'layer'; id: string }
  | { control: 'lock'; ownerKind: 'group'; id: string }
type LayerDisplayRow = { kind: 'node'; node: LayerTreeNode } | { kind: 'mask'; ownerKind: 'layer' | 'group'; owner: RasterLayer | LayerGroup; depth: number }
type DropTarget = { kind: 'layer'; id: string; insertAfter?: boolean; depth: number } | { kind: 'group'; id: string; depth: number } | { kind: 'above-group'; id: string; insertAfter?: boolean; depth: number } | { kind: 'edge'; edge: 'top' | 'bottom'; offset?: number }
interface LayerContextMenu { kind: 'layer' | 'group'; id: string; x: number; y: number }
interface LayerCreateContextMenu { x: number; y: number }
interface LayerStyleDialogState { source: LayerFormTarget; targets: LayerFormTarget[] }
interface LayerStyleDragState { source: LayerFormTarget; target: LayerFormTarget | null; startX: number; startY: number; x: number; y: number; moved: boolean }
function LayerContextMenuItem({ icon, label, shortcut, onClick, danger = false, disabled = false }: { icon: PixelUtilityIconKind; label: ReactNode; shortcut?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return <button role="menuitem" className={danger ? 'danger' : undefined} disabled={disabled} onClick={onClick}><span className="layer-context-icon"><PixelUtilityIcon kind={icon} /></span><span className="layer-context-label">{label}</span>{shortcut}</button>
}
type AnimationContextMenu = { kind: 'playback'; x: number; y: number } | { kind: 'frame'; frameId: string; x: number; y: number } | { kind: 'loop-section'; sectionId: string; x: number; y: number } | { kind: 'cel' | 'mask'; layerId: string; frameId: string; x: number; y: number }
interface AnimationLoopSectionEditorState { mode: 'create' | 'edit'; sectionId?: string; value: AnimationLoopSectionDraft }
interface AnimationLoopSectionLayout { section: AnimationLoopSection; startIndex: number; span: number; lane: number; laneSpan: number }
type AnimationLoopSectionResizeEdge = 'start' | 'end'
interface AnimationLoopSectionResizePreview { sectionId: string; startIndex: number; endIndex: number }
interface LayerDragGhost { y: number; items?: Array<{ id: string; kind: 'layer' | 'group'; name: string }>; name?: string; count: number }
type AnimationPointerDrag =
  | { kind: 'frame'; sourceFrameId: string; frameIds: string[]; preserveSelection: boolean; startX: number; startY: number; moved: boolean; canMove: boolean; pendingSelection: boolean; longPressed: boolean; longPressTimer: number | null; lastSelectionTarget: string }
  | { kind: 'cel'; sourceAnchorKey: string; cellKeys: string[]; preserveSelection: boolean; selectionMode?: 'toggle' | 'range'; startX: number; startY: number; moved: boolean; canMove: boolean; pendingSelection: boolean; longPressed: boolean; longPressTimer: number | null; lastSelectionTarget: string }
  | { kind: 'group-cel'; sourceAnchorKey: string; preserveSelection: boolean; selectionMode?: 'toggle' | 'range'; startX: number; startY: number; moved: boolean; canMove: boolean; lastSelectionTarget: string }
  | { kind: 'mask'; sourceAnchorKey: string; cellKeys: string[]; preserveSelection: boolean; selectionMode?: 'toggle' | 'range'; startX: number; startY: number; moved: boolean; canMove: boolean; pendingSelection: boolean; longPressed: boolean; longPressTimer: number | null; lastSelectionTarget: string }
  | { kind: 'loop-section'; sectionId: string; edge: AnimationLoopSectionResizeEdge; startX: number; startY: number; startIndex: number; endIndex: number; previewStartIndex: number; previewEndIndex: number; moved: boolean }
type AnimationGestureSelection = { kind: 'frame'; ids: string[] } | { kind: 'cel' | 'mask'; keys: string[] }
type AnimationGestureActiveTarget = { kind: 'frame'; frameId: string } | { kind: 'cel' | 'mask'; layerId: string; frameId: string }
type LayerTreeNode = LayerPanelNode & ({ kind: 'layer'; layer: RasterLayer } | { kind: 'group'; group: LayerGroup })
interface LayerSettingsState { density: LayerDisplayDensity; onionSkin: OnionSkinPreferences; timelineHidden: boolean; sideDockAutoHide: boolean }

const layoutAnimationLoopSections = (timeline: AnimationTimeline): { items: AnimationLoopSectionLayout[]; laneCount: number } => {
  const candidates = (timeline.loopSections ?? []).flatMap((section) => {
    const range = resolveAnimationLoopSectionRange(timeline, section)
    return range ? [{ section, startIndex: range.startIndex, endIndex: range.endIndex, span: range.endIndex - range.startIndex + 1, parentIndex: -1, lane: 0 }] : []
  }).sort((left, right) => left.startIndex - right.startIndex || right.span - left.span || left.section.name.localeCompare(right.section.name))
  const contains = (parent: typeof candidates[number], child: typeof candidates[number]): boolean =>
    parent.startIndex <= child.startIndex && parent.endIndex >= child.endIndex && (parent.startIndex < child.startIndex || parent.endIndex > child.endIndex)
  const overlaps = (left: typeof candidates[number], right: typeof candidates[number]): boolean =>
    left.startIndex <= right.endIndex && right.startIndex <= left.endIndex
  const laneItems: Array<Array<typeof candidates[number]>> = []
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    for (let parentIndex = 0; parentIndex < index; parentIndex += 1) {
      const parent = candidates[parentIndex]
      if (!contains(parent, candidate)) continue
      if (candidate.parentIndex < 0 || parent.span < candidates[candidate.parentIndex].span) candidate.parentIndex = parentIndex
    }
    let lane = candidate.parentIndex >= 0 ? candidates[candidate.parentIndex].lane + 1 : 0
    while (laneItems[lane]?.some((item) => overlaps(item, candidate))) lane += 1
    candidate.lane = lane
    if (!laneItems[lane]) laneItems[lane] = []
    laneItems[lane].push(candidate)
  }
  const items = candidates.map(({ section, startIndex, span, lane }) => ({ section, startIndex, span, lane, laneSpan: 1 }))
  for (let index = 0; index < candidates.length; index += 1) {
    let parentIndex = candidates[index].parentIndex
    while (parentIndex >= 0) {
      items[parentIndex].laneSpan = Math.max(items[parentIndex].laneSpan, candidates[index].lane - candidates[parentIndex].lane + 1)
      parentIndex = candidates[parentIndex].parentIndex
    }
  }
  const laneCount = items.reduce((count, item) => Math.max(count, item.lane + 1), 0)
  for (const item of items) item.laneSpan = Math.max(item.laneSpan, laneCount - item.lane)
  return { items, laneCount }
}
const timelineWithLoopSectionPreview = (timeline: AnimationTimeline, preview: AnimationLoopSectionResizePreview | null): AnimationTimeline => {
  if (!preview) return timeline
  const startFrame = timeline.frames[preview.startIndex]
  const endFrame = timeline.frames[preview.endIndex]
  if (!startFrame || !endFrame) return timeline
  return {
    ...timeline,
    loopSections: (timeline.loopSections ?? []).map((section) => section.id === preview.sectionId
      ? { ...section, startFrameId: startFrame.id, endFrameId: endFrame.id }
      : section)
  }
}

const defaultLayerDisplayColor: RgbaColor = { r: 41, g: 121, b: 255, a: 255 }
const layerLabelWidthKey = 'moonsprite.layers.label-width'
const layerLabelWidthLimits = { min: 140, max: 2_000 }
const layerDensityLabelKeys = {
  compact: 'layers.density.compact',
  normal: 'layers.density.normal',
  detailed: 'layers.density.detailed',
  expanded: 'layers.density.expanded',
  large: 'layers.density.large',
  huge: 'layers.density.huge'
} as const
const layerDensityDescriptionKeys = {
  compact: 'layers.density.compactDescription',
  normal: 'layers.density.normalDescription',
  detailed: 'layers.density.detailedDescription',
  expanded: 'layers.density.expandedDescription',
  large: 'layers.density.largeDescription',
  huge: 'layers.density.hugeDescription'
} as const
const clampLayerLabelWidth = (value: number): number => Math.max(layerLabelWidthLimits.min, Math.min(layerLabelWidthLimits.max, Math.round(value)))
const loadLayerLabelWidth = (): number => clampLayerLabelWidth(Number(localStorage.getItem(layerLabelWidthKey)) || 190)
const celContentCache = new WeakMap<object, Map<string, { revision: number; value: boolean }>>()
const celThumbnailCache = new WeakMap<object, Map<string, { revision: number; pixels: Uint8ClampedArray }>>()
const scheduleThumbnailRender = (render: () => void): (() => void) => {
  let timeoutId: number | null = null
  if (typeof window.requestAnimationFrame !== 'function') {
    timeoutId = window.setTimeout(render, 0)
    return () => { if (timeoutId !== null) window.clearTimeout(timeoutId) }
  }
  let frameId: number | null = window.requestAnimationFrame(() => {
    frameId = null
    timeoutId = window.setTimeout(render, 0)
  })
  return () => {
    if (frameId !== null) window.cancelAnimationFrame(frameId)
    if (timeoutId !== null) window.clearTimeout(timeoutId)
  }
}
const paletteVisibilityKey = (palette: readonly PaletteEntry[]): string => palette.map((entry) => `${entry.id}:${entry.color.a}`).join(',')
const paletteRenderKey = (palette: readonly PaletteEntry[]): string => palette.map((entry) => `${entry.id}:${entry.color.r},${entry.color.g},${entry.color.b},${entry.color.a}`).join('|')
const cachedCelHasContent = (cel: AnimationCel | null, palette: readonly PaletteEntry[], revision = 0): boolean => {
  const surface = cel?.surface
  if (!surface) return false
  const key = surface.format === 'rgba' ? 'rgba' : paletteVisibilityKey(palette)
  const storage = rasterStorageIdentity(surface)
  const entries = celContentCache.get(storage) ?? new Map<string, { revision: number; value: boolean }>()
  const cached = entries.get(key)
  if (cached && (revision === 0 || cached.revision === revision)) return cached.value
  const value = animationCelHasContent(cel, palette)
  entries.set(key, { revision, value })
  celContentCache.set(storage, entries)
  return value
}
function CelThumbnail({ documentId, layerId, cel, palette, revision, documentWidth, documentHeight, thumbnailSize }: { documentId: string; layerId: string; cel: AnimationCel; palette: readonly PaletteEntry[]; revision: number; documentWidth: number; documentHeight: number; thumbnailSize: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelScheduledRender: (() => void) | null = null
    const draw = (surface: AnimationCelSurface, livePalette: readonly PaletteEntry[], opacity: number, bypassCache = false): void => {
      cancelScheduledRender?.()
      cancelScheduledRender = scheduleThumbnailRender(() => {
        const canvas = ref.current
        if (!canvas) return
        if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return
        try {
          const context = canvas.getContext('2d')
          if (!context) return
          const key = `${documentWidth}:${documentHeight}:${canvas.width}:${surface.width}:${surface.height}:${surface.offsetX}:${surface.offsetY}:${opacity}:${surface.format === 'rgba' ? 'rgba' : paletteRenderKey(livePalette)}`
          const storage = rasterStorageIdentity(surface)
          const entries = celThumbnailCache.get(storage) ?? new Map<string, { revision: number; pixels: Uint8ClampedArray }>()
          const cached = entries.get(key)
          const pixels = !bypassCache && cached && (revision === 0 || cached.revision === revision)
            ? cached.pixels
            : renderAnimationCelThumbnailPixels(documentWidth, documentHeight, canvas.width, surface, livePalette, opacity)
          if (!bypassCache && (!cached || pixels !== cached.pixels)) {
            entries.set(key, { revision, pixels })
            celThumbnailCache.set(storage, entries)
          }
          const image = context.createImageData(canvas.width, canvas.height)
          image.data.set(pixels)
          context.putImageData(image, 0, 0)
        } catch {
          // Canvas rendering is unavailable in a few test and recovery environments.
        }
      })
    }
    if (cel.surface) draw(cel.surface, palette, cel.opacity ?? 1)
    const unregisterPreview = registerAnimationCelThumbnailPreviewListener(documentId, (activeCelId, activeLayerId) => {
      if (activeLayerId !== layerId || cel.id !== activeCelId) return
      const current = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)
      if (!current) return
      const liveLayer = current.document.layers.find((layer) => layer.id === activeLayerId)
      if (liveLayer) draw(liveLayer, current.document.palette, cel.opacity ?? 1, true)
    })
    return () => {
      unregisterPreview()
      cancelScheduledRender?.()
    }
  }, [cel, documentHeight, documentId, documentWidth, layerId, palette, revision, thumbnailSize])
  return <span className="cel-thumbnail" aria-hidden="true"><canvas ref={ref} width={thumbnailSize} height={thumbnailSize} /></span>
}
const drawLayerMaskThumbnail = (canvas: HTMLCanvasElement, mask: LayerMask, documentWidth: number, documentHeight: number): void => {
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return
  try {
    const context = canvas.getContext('2d')
    if (!context) return
    const pixels = renderLayerMaskThumbnailPixels(documentWidth, documentHeight, canvas.width, canvas.height, mask)
    const image = context.createImageData(canvas.width, canvas.height)
    image.data.set(pixels)
    context.putImageData(image, 0, 0)
  } catch {
    // Canvas rendering is unavailable in a few test and recovery environments.
  }
}
function LayerMaskThumbnail({ mask, revision, documentWidth, documentHeight, thumbnailSize }: { mask: LayerMask; revision: number | string; documentWidth: number; documentHeight: number; thumbnailSize: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    return scheduleThumbnailRender(() => drawLayerMaskThumbnail(canvas, mask, documentWidth, documentHeight))
  }, [mask, revision, documentWidth, documentHeight, thumbnailSize])
  return <canvas className="layer-mask-thumbnail" ref={ref} width={thumbnailSize} height={thumbnailSize} aria-hidden="true" />
}
function ActiveLayerMaskThumbnail({ documentId, ownerId, frameId, mask, revision, documentWidth, documentHeight, thumbnailSize }: { documentId: string; ownerId: string; frameId: string; mask: LayerMask; revision: number; documentWidth: number; documentHeight: number; thumbnailSize: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelScheduledRender: (() => void) | null = null
    const liveSession = () => useWorkspace.getState().sessions.find((item) => item.document.id === documentId)
    const render = (): void => {
      cancelScheduledRender?.()
      cancelScheduledRender = scheduleThumbnailRender(() => {
        const canvas = ref.current
        const current = liveSession()
        const timeline = current?.document.animation
        const liveMask = timeline ? animationMaskAt(timeline, ownerId, frameId) : null
        if (canvas) drawLayerMaskThumbnail(canvas, liveMask ?? mask, documentWidth, documentHeight)
      })
    }
    const belongsToActiveMaskGroup = (): boolean => {
      const current = liveSession()
      const timeline = current?.document.animation
      if (!current?.activeLayerMaskId || !timeline) return false
      return animationMaskAt(timeline, ownerId, frameId)?.id === current.activeLayerMaskId
    }
    render()
    const unregisterPreview = registerLayerMaskThumbnailPreviewListener(documentId, (activeMaskId) => {
      const current = liveSession()
      const timeline = current?.document.animation
      if (!timeline || animationMaskAt(timeline, ownerId, frameId)?.id !== activeMaskId || !belongsToActiveMaskGroup()) return
      render()
    })
    return () => {
      unregisterPreview()
      cancelScheduledRender?.()
    }
  }, [documentHeight, documentId, documentWidth, frameId, mask, ownerId, revision, thumbnailSize])
  return <canvas className="layer-mask-thumbnail" ref={ref} width={thumbnailSize} height={thumbnailSize} aria-hidden="true" />
}
const useTimelineThumbnailContentSync = (documentId: string): void => {
  useEffect(() => {
    let lastContentRevision = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)?.contentRevision
    return useWorkspace.subscribe((state) => {
      const current = state.sessions.find((item) => item.document.id === documentId)
      if (!current || current.contentRevision === lastContentRevision) return
      lastContentRevision = current.contentRevision
      if (current.activeLayerMaskId) {
        notifyLayerMaskThumbnailPreview(documentId, current.activeLayerMaskId)
        return
      }
      const timeline = current.document.animation
      if (!timeline) return
      const activeLayer = current.document.layers.find((layer) => layer.id === current.document.activeLayerId)
      if (!activeLayer) return
      const layerIds = activeLayer.linkedContentId
        ? current.document.layers.filter((layer) => layer.linkedContentId === activeLayer.linkedContentId).map((layer) => layer.id)
        : [activeLayer.id]
      const lookup = createAnimationCelLookup(timeline)
      for (const layerId of new Set(layerIds)) {
        const cel = lookup.resolve(lookup.at(layerId, timeline.activeFrameId))
        if (cel) notifyAnimationCelThumbnailPreview(documentId, cel.id, layerId)
      }
    })
  }, [documentId])
}
function AnimationCelContent({ active, documentId, layerId, cel, palette, revision, documentWidth, documentHeight, thumbnailSize, showThumbnail, selectionMarker }: {
  active: boolean
  documentId: string
  layerId: string
  cel: AnimationCel
  palette: readonly PaletteEntry[]
  revision: number
  documentWidth: number
  documentHeight: number
  thumbnailSize: number
  showThumbnail: boolean
  selectionMarker: boolean
}) {
  const liveRevision = useWorkspace((state) => active ? state.sessions.find((item) => item.document.id === documentId)?.contentRevision ?? revision : revision)
  const liveSession = active ? useWorkspace.getState().sessions.find((item) => item.document.id === documentId) : null
  const livePalette = liveSession?.document.palette ?? palette
  const hasContent = cachedCelHasContent(cel, livePalette, liveRevision)
  if (!hasContent) return null
  return showThumbnail
    ? <CelThumbnail documentId={documentId} layerId={layerId} cel={cel} palette={livePalette} revision={liveRevision} documentWidth={liveSession?.document.width ?? documentWidth} documentHeight={liveSession?.document.height ?? documentHeight} thumbnailSize={thumbnailSize} />
    : <span className={`cel-content-marker ${selectionMarker ? 'selection-marker' : ''}`} />
}
function ActiveFrameSync({ documentId, frameIds, containerRef, suppressActiveGuide, activeFrameIdOverride }: {
  documentId: string
  frameIds: readonly string[]
  containerRef: { current: HTMLDivElement | null }
  suppressActiveGuide: boolean
  activeFrameIdOverride?: string | null
}) {
  const { t } = useI18n()
  const storeActiveFrameId = useWorkspace((state) => state.sessions.find((item) => item.document.id === documentId)?.document.animation?.activeFrameId ?? frameIds[0] ?? '')
  const activeFrameId = activeFrameIdOverride ?? storeActiveFrameId
  const activeFrameIndex = Math.max(0, frameIds.indexOf(activeFrameId))
  void activeFrameId
  void activeFrameIndex
  void containerRef
  void suppressActiveGuide
  return <span>{t('timeline.frameNumber', { number: activeFrameIndex + 1 })}</span>
}

const sameColor = (left: RgbaColor | null, right: RgbaColor | null): boolean => left === null || right === null
  ? left === right
  : left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a
const selectedRowsForDrag = (session: DocumentSession): { ids: string[]; groupIds: string[] } => {
  const selectedGroups = new Set(session.selectedGroupIds.length > 0 ? session.selectedGroupIds : session.selectedGroupId ? [session.selectedGroupId] : [])
  const groupIds = [...selectedGroups].filter((groupId) => !session.document.groups.some((candidate) => selectedGroups.has(candidate.id) && getDescendantGroupIds(session.document, candidate.id).includes(groupId)))
  const coveredGroups = new Set<string>()
  for (const groupId of groupIds) {
    coveredGroups.add(groupId)
    for (const descendantId of getDescendantGroupIds(session.document, groupId)) coveredGroups.add(descendantId)
  }
  const ids = session.selectedLayerIds.filter((layerId) => {
    const layer = session.document.layers.find((candidate) => candidate.id === layerId)
    return Boolean(layer && (!layer.groupId || !coveredGroups.has(layer.groupId)))
  })
  return { ids, groupIds }
}
const selectedRowsForProperties = (session: DocumentSession): LayerFormTarget[] => {
  const selectedGroupIds = session.selectedGroupIds.length > 0
    ? session.selectedGroupIds
    : session.selectedGroupId ? [session.selectedGroupId] : []
  const groupIds = [...new Set(selectedGroupIds)].filter((id) => session.document.groups.some((group) => group.id === id))
  // A single selected group mirrors its descendants into selectedLayerIds for
  // whole-group commands. Those implicit members are not property-edit targets.
  const selectedLayerIds = session.selectedGroupId && groupIds.length === 1 ? [] : session.selectedLayerIds
  const layerIds = [...new Set(selectedLayerIds)].filter((id) => session.document.layers.some((layer) => layer.id === id))
  return [
    ...groupIds.map((id) => ({ id, kind: 'group' as const })),
    ...layerIds.map((id) => ({ id, kind: 'layer' as const }))
  ]
}
export function LayersPanel({ session, docked = false, sideDocked = false, onDockDragStart, onPanelContextMenu, onFloatingDock }: { session: DocumentSession; sideDocked?: boolean } & DockDragProps) {
  const { locale, t } = useI18n()
  useTimelineThumbnailContentSync(session.document.id)
  const blendOptions: Array<{ value: BlendMode; label: string }> = [
    { value: 'normal', label: t('blend.normal') }, { value: 'darken', label: t('blend.darken') }, { value: 'multiply', label: t('blend.multiply') },
    { value: 'color-burn', label: t('blend.colorBurn') }, { value: 'linear-burn', label: t('blend.linearBurn') }, { value: 'lighten', label: t('blend.lighten') },
    { value: 'screen', label: t('blend.screen') }, { value: 'color-dodge', label: t('blend.colorDodge') }, { value: 'linear-dodge', label: t('blend.linearDodge') },
    { value: 'overlay', label: t('blend.overlay') }, { value: 'soft-light', label: t('blend.softLight') }, { value: 'hard-light', label: t('blend.hardLight') },
    { value: 'vivid-light', label: t('blend.vividLight') }, { value: 'linear-light', label: t('blend.linearLight') }, { value: 'pin-light', label: t('blend.pinLight') },
    { value: 'hard-mix', label: t('blend.hardMix') }, { value: 'difference', label: t('blend.difference') }, { value: 'exclusion', label: t('blend.exclusion') },
    { value: 'subtract', label: t('blend.subtract') }, { value: 'divide', label: t('blend.divide') }, { value: 'hue', label: t('blend.hue') },
    { value: 'saturation', label: t('blend.saturation') }, { value: 'color', label: t('blend.color') }, { value: 'luminosity', label: t('blend.luminosity') }
  ]
  const blendOptionGroups: Array<ThemedSelectGroup<BlendMode>> = [
    { label: t('blend.group.basic'), options: blendOptions.filter((option) => option.value === 'normal') },
    { label: t('blend.group.darken'), options: blendOptions.filter((option) => ['darken', 'multiply', 'color-burn', 'linear-burn'].includes(option.value)) },
    { label: t('blend.group.lighten'), options: blendOptions.filter((option) => ['lighten', 'screen', 'color-dodge', 'linear-dodge'].includes(option.value)) },
    { label: t('blend.group.contrast'), options: blendOptions.filter((option) => ['overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix'].includes(option.value)) },
    { label: t('blend.group.compare'), options: blendOptions.filter((option) => ['difference', 'exclusion', 'subtract', 'divide'].includes(option.value)) },
    { label: t('blend.group.components'), options: blendOptions.filter((option) => ['hue', 'saturation', 'color', 'luminosity'].includes(option.value)) }
  ]
  const store = useWorkspace.getState()
  const liveLayers = useWorkspace((state) => state.sessions.find((item) => item.document.id === session.document.id)?.document.layers ?? session.document.layers)
  const liveAutoLinkById = new Map(liveLayers.map((layer) => [layer.id, layer.autoLinkAnimationCels === true]))
  const layerStyleClipboard = useWorkspace((state) => state.layerStyleClipboard)
  const [loopSectionResizePreview, setLoopSectionResizePreview] = useState<AnimationLoopSectionResizePreview | null>(null)
  // Rendering must not normalize sparse imported timelines. In particular,
  // selecting or dragging an empty slot must not create blank AnimationCels.
  const timeline = session.document.animation ?? createDefaultAnimationTimeline()
  const loopSectionLayout = layoutAnimationLoopSections(timelineWithLoopSectionPreview(timeline, loopSectionResizePreview))
  const celLookup = createAnimationCelLookup(timeline)
  const animationMaskLookup = createAnimationMaskLookup(timeline)
  const currentCelHasContent = (layerId: string, frameId: string): boolean => {
    const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!liveSession) return false
    const liveTimeline = liveSession.document.animation ?? createDefaultAnimationTimeline()
    const liveLookup = createAnimationCelLookup(liveTimeline)
    const cel = liveLookup.at(layerId, frameId)
    return cachedCelHasContent(liveLookup.resolve(cel), liveSession.document.palette, frameId === liveTimeline.activeFrameId ? liveSession.contentRevision : 0)
  }
  const activeFrameIndex = Math.max(0, timeline.frames.findIndex((frame) => frame.id === timeline.activeFrameId))
  const floating = useFloatingPanel(null, false, true, 'moonsprite.layers-panel.v1', true, onFloatingDock, docked)
  const [form, setForm] = useState<LayerFormState | null>(null)
  const [layerDisplayColorPresets, setLayerDisplayColorPresets] = useState(() => loadEditorPreferences().layerDisplayColorPresets)
  const [shortcuts, setShortcuts] = useState(() => loadShortcutBindings())
  const shortcutCommandHandlerRef = useRef<(id: ShortcutId) => void>(() => {})
  const shortcutHint = (...ids: ShortcutId[]) => {
    const value = ids.map((id) => formatShortcutBindingsForLocale(shortcutBindingsFor(shortcuts, id), locale)).filter(Boolean).join(' / ')
    return value ? <kbd aria-hidden="true">{value}</kbd> : null
  }
  const propertyTransactionRef = useRef<string | null>(null)
  const pendingPropertyPreviewRef = useRef<LayerFormState | null>(null)
  const propertyPreviewTimerRef = useRef<number | null>(null)
  const dragRef = useRef<LayerDragState | null>(null)
  const layerDragFrameRef = useRef<number | null>(null)
  const pendingLayerDragRef = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null)
  const layerListRef = useRef<HTMLDivElement>(null)
  const animationLoopSectionTrackRef = useRef<HTMLDivElement>(null)
  const revealSequenceRef = useRef(0)
  const [layerRevealRequest, setLayerRevealRequest] = useState<{ layerId: string; sequence: number } | null>(null)
  const [draggingIds, setDraggingIds] = useState<string[]>([])
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null)
  const [draggingCopy, setDraggingCopy] = useState(false)
  const [altCopyReady, setAltCopyReady] = useState(false)
  const altCopyReadyRef = useRef(false)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)
  const [dragGhost, setDragGhost] = useState<LayerDragGhost | null>(null)
  const animationPointerDragRef = useRef<AnimationPointerDrag | null>(null)
  const moveAnimationPointerDragRef = useRef<(event: PointerEvent) => void>(() => {})
  const finishAnimationPointerDragRef = useRef<(cancelled?: boolean) => void>(() => {})
  const [animationGestureSelection, setAnimationGestureSelection] = useState<AnimationGestureSelection | null>(null)
  const [animationGestureActiveTarget, setAnimationGestureActiveTarget] = useState<AnimationGestureActiveTarget | null>(null)
  const [animationCellSelectionOutlineVisible, setAnimationCellSelectionOutlineVisible] = useState(() => session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0)
  // Group rows do not own AnimationCel records. Keep their empty timeline
  // slots as a presentation selection so they can still be hit, boxed and
  // repositioned without selecting or mutating descendant layers.
  const [selectedAnimationGroupCellKeys, setSelectedAnimationGroupCellKeys] = useState<string[]>([])
  const selectedAnimationGroupCellKeySet = new Set(selectedAnimationGroupCellKeys)
  const hiddenAnimationCellSelectionSignatureRef = useRef<string | null>(null)
  const suppressAnimationClickRef = useRef(false)
  const suppressMaskRowClickRef = useRef(false)
  const [draggingAnimationFrameIds, setDraggingAnimationFrameIds] = useState<string[]>([])
  const [draggingAnimationCellKeys, setDraggingAnimationCellKeys] = useState<string[]>([])
  const [draggingAnimationCellKind, setDraggingAnimationCellKind] = useState<'cel' | 'mask' | null>(null)
  const [animationCelDropTargetKey, setAnimationCelDropTargetKey] = useState<string | null>(null)
  const animationCelDropTargetKeyRef = useRef<string | null>(null)
  const clearSelectionFromBlankRef = useRef<() => void>(() => {})
  const [animationCelDragAnchorKey, setAnimationCelDragAnchorKey] = useState<string | null>(null)
  useEffect(() => {
    // Group-slot visuals are transient timeline selection state; clear them
    // whenever another formal animation mode or a non-group row becomes
    // active.
    if (animationPointerDragRef.current?.kind === 'group-cel' && animationGestureSelection?.kind === 'cel') return
    const activeGroupIds = new Set(session.selectedGroupIds.length > 0 ? session.selectedGroupIds : session.selectedGroupId ? [session.selectedGroupId] : [])
    const hasForeignGroupSlot = selectedAnimationGroupCellKeys.some((key) => {
      const parsed = parseAnimationCelKey(key)
      return !parsed || !activeGroupIds.has(parsed.layerId)
    })
    if (hasForeignGroupSlot
      || session.selectedGroupIds.length === 0 && !session.selectedGroupId
      || session.selectedAnimationFrameIds.length > 0
      || session.selectedAnimationCellKeys.length > 0
      || session.selectedAnimationMaskCellKeys.length > 0) {
      setSelectedAnimationGroupCellKeys([])
    }
  }, [selectedAnimationGroupCellKeys.join('\u0000'), animationGestureSelection?.kind, session.document.id, session.selectedGroupId, session.selectedGroupIds.join('\u0000'), session.selectedAnimationFrameIds.length, session.selectedAnimationCellKeys.length, session.selectedAnimationMaskCellKeys.length, session.selectedAnimationMaskRowKeys.length])
  const animationFrameDropTargetRef = useRef<{ frameId: string; insertAfter: boolean } | null>(null)
  const [animationFrameDropTarget, setAnimationFrameDropTarget] = useState<{ frameId: string; insertAfter: boolean } | null>(null)
  const [contextMenu, setContextMenu] = useState<LayerContextMenu | null>(null)
  const [layerCreateMenu, setLayerCreateMenu] = useState<LayerCreateContextMenu | null>(null)
  const [backgroundLayerDialogOpen, setBackgroundLayerDialogOpen] = useState(false)
  const [tilemapLayerDialog, setTilemapLayerDialog] = useState<{ mode: 'create' } | { mode: 'convert'; layerId: string } | null>(null)
  const [freeTileLayerDialogOpen, setFreeTileLayerDialogOpen] = useState(false)
  const [layerStyleDialog, setLayerStyleDialog] = useState<LayerStyleDialogState | null>(null)
  const layerStyleDragRef = useRef<LayerStyleDragState | null>(null)
  const suppressLayerStyleClickRef = useRef(false)
  const [layerStyleDrag, setLayerStyleDrag] = useState<LayerStyleDragState | null>(null)
  const [animationMenu, setAnimationMenu] = useState<AnimationContextMenu | null>(null)
  const animationMenuRef = useRef<HTMLDivElement>(null)
  const [animationMenuPosition, setAnimationMenuPosition] = useState({ left: 8, top: 8 })
  const [frameProperties, setFrameProperties] = useState<{ frameId: string; duration: number } | null>(null)
  const [loopSectionEditor, setLoopSectionEditor] = useState<AnimationLoopSectionEditorState | null>(null)
  const [celProperties, setCelProperties] = useState<{ layerId: string; frameId: string; opacity: number } | null>(null)
  const [layerSettingsOpen, setLayerSettingsOpen] = useState(false)
  const [layerSettings, setLayerSettings] = useState<LayerSettingsState>(() => {
    const preferences = loadEditorPreferences()
    return { density: loadLayerDensity(), onionSkin: preferences.onionSkin, timelineHidden: preferences.timelineHidden, sideDockAutoHide: loadLayerSideDockAutoHide() }
  })
  const [layerSettingsSlider, setLayerSettingsSlider] = useState<'previousOpacity' | 'nextOpacity' | null>(null)
  const [layerLabelWidth, setLayerLabelWidth] = useState(loadLayerLabelWidth)
  const [layerDensity, setLayerDensity] = useState<LayerDisplayDensity>(loadLayerDensity)
  const [freeTileInstancePanelLayout, setFreeTileInstancePanelLayout] = useState<FreeTileInstancePanelLayout>(loadFreeTileInstancePanelLayout)
  const freeTileInstanceLayer = session.freeTileInstanceLayerId
    ? session.document.layers.find((layer) => layer.id === session.freeTileInstanceLayerId && layer.kind === 'free-tile') ?? null
    : null
  const integratedFreeTileInstanceLayer = freeTileInstancePanelLayout === 'integrated' ? freeTileInstanceLayer : null
  const visibleLoopSectionLaneCount = !integratedFreeTileInstanceLayer && !layerSettings.timelineHidden ? loopSectionLayout.laneCount : 0
  const availableTilemapTilesets: Tileset[] = (session.document.tilesets ?? []).filter((tileset) => session.document.layers.some((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId === tileset.id))
  const showLinkedCelVisuals = layerDensityOrder.indexOf(layerDensity) < layerDensityOrder.indexOf('detailed')
  const showLinkedVisuals = showLinkedCelVisuals
  const showCelThumbnails = layerDensityOrder.indexOf(layerDensity) >= layerDensityOrder.indexOf('detailed')
  const celThumbnailSize = layerDensity === 'detailed'
    ? 46
    : layerDensity === 'expanded'
      ? 64
      : layerDensity === 'large'
        ? 88
        : 120
  const animationItemDragging = draggingAnimationFrameIds.length > 0 || draggingAnimationCellKeys.length > 0
  const animationCellSelectionSignature = `${session.selectedAnimationCellKeys.join('\u0000')}|${session.selectedAnimationMaskCellKeys.join('\u0000')}|${session.selectedAnimationMaskRowKeys.join('\u0000')}`
  const selectionStateSignature = `${session.document.id}|${session.selectedLayerIds.join('\u0000')}|${session.selectedGroupIds.join('\u0000')}|${session.selectedGroupId ?? ''}|${session.selectedAnimationFrameIds.join('\u0000')}|${animationCellSelectionSignature}`
  // A newly opened project starts with its active layer selected, matching the
  // timeline's default interaction context. Subsequent edits may hide the
  // outline until the user explicitly selects an item again.
  const [selectionOutlineVisible, setSelectionOutlineVisible] = useState(false)
  const previousSelectionStateSignatureRef = useRef(selectionStateSignature)
  const previousAnimationSelectionActiveRef = useRef(session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0 || session.selectedAnimationMaskRowKeys.length > 0)
  const suppressSelectionOutlineOnNextSignatureRef = useRef(false)
  const preserveSelectionOnNextContentRevisionRef = useRef(false)
  const previousContentRevisionRef = useRef(session.contentRevision)
  const previousHistoryPositionRef = useRef(session.history.position)
  const restoreSelectionGuidesOnUndoRef = useRef(false)
  const syncAnimationLoopSectionScroll = (): void => {
    if (!animationLoopSectionTrackRef.current || !layerListRef.current) return
    animationLoopSectionTrackRef.current.style.transform = `translate3d(${-layerListRef.current.scrollLeft}px, 0, 0)`
  }
  const hideAnimationCellSelectionOutline = (): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    hiddenAnimationCellSelectionSignatureRef.current = active
      ? `${active.selectedAnimationCellKeys.join('\u0000')}|${active.selectedAnimationMaskCellKeys.join('\u0000')}|${active.selectedAnimationMaskRowKeys.join('\u0000')}`
      : animationCellSelectionSignature
    setAnimationCellSelectionOutlineVisible(false)
  }
  const showAnimationCellSelectionOutline = (): void => {
    hiddenAnimationCellSelectionSignatureRef.current = null
    setAnimationCellSelectionOutlineVisible(true)
  }
  const showAnimationSelectionOutline = (): void => {
    hiddenAnimationCellSelectionSignatureRef.current = null
    setSelectionOutlineVisible(true)
  }
  const showLayerSelectionOutline = (): void => {
    setSelectionOutlineVisible(true)
  }
  useEffect(() => {
    if (animationGestureSelection?.kind === 'cel' || animationGestureSelection?.kind === 'mask') {
      setAnimationCellSelectionOutlineVisible(true)
      return
    }
    if (hiddenAnimationCellSelectionSignatureRef.current === animationCellSelectionSignature) {
      setAnimationCellSelectionOutlineVisible(false)
      return
    }
    hiddenAnimationCellSelectionSignatureRef.current = null
    setAnimationCellSelectionOutlineVisible(session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0)
  }, [animationCellSelectionSignature, animationGestureSelection?.kind, session.document.id, session.selectedAnimationCellKeys.length, session.selectedAnimationMaskCellKeys.length, session.selectedAnimationMaskRowKeys.length])
  useEffect(() => {
    if (previousSelectionStateSignatureRef.current === selectionStateSignature) {
      suppressSelectionOutlineOnNextSignatureRef.current = false
      return
    }
    previousSelectionStateSignatureRef.current = selectionStateSignature
    if (suppressSelectionOutlineOnNextSignatureRef.current) {
      suppressSelectionOutlineOnNextSignatureRef.current = false
      previousAnimationSelectionActiveRef.current = session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0 || session.selectedAnimationMaskRowKeys.length > 0
      setSelectionOutlineVisible(false)
      return
    }
    const animationSelectionActive = session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0 || session.selectedAnimationMaskRowKeys.length > 0
    const animationSelectionCleared = previousAnimationSelectionActiveRef.current && !animationSelectionActive
    previousAnimationSelectionActiveRef.current = animationSelectionActive
    if (animationSelectionCleared && !animationGestureSelection) {
      setSelectionOutlineVisible(false)
      return
    }
    setSelectionOutlineVisible(true)
  }, [animationGestureSelection, selectionStateSignature, session.selectedAnimationFrameIds.length, session.selectedAnimationCellKeys.length, session.selectedAnimationMaskCellKeys.length, session.selectedAnimationMaskRowKeys.length])
  useEffect(() => {
    if (previousContentRevisionRef.current === session.contentRevision) return
    const previousHistoryPosition = previousHistoryPositionRef.current
    const historyMovedBack = session.history.position < previousHistoryPosition
    previousHistoryPositionRef.current = session.history.position
    previousContentRevisionRef.current = session.contentRevision
    if (session.selectionGuidesPreservedAtContentRevision === session.contentRevision) {
      setSelectionOutlineVisible(true)
      setAnimationCellSelectionOutlineVisible(session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0)
      return
    }
    if (historyMovedBack && restoreSelectionGuidesOnUndoRef.current) {
      // A preserve event belongs to the edit being undone; do not let it leak
      // into the next content revision and mask the undo transition.
      preserveSelectionOnNextContentRevisionRef.current = false
      setSelectionOutlineVisible(true)
      setAnimationCellSelectionOutlineVisible(session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0)
      return
    }
    // Capture the guide state before handling the preserve flag. Selection
    // transforms can explicitly preserve guides, and undo must restore that
    // same pre-edit state.
    if (!historyMovedBack) restoreSelectionGuidesOnUndoRef.current = selectionOutlineVisible
    if (preserveSelectionOnNextContentRevisionRef.current) {
      preserveSelectionOnNextContentRevisionRef.current = false
      return
    }
    setSelectionOutlineVisible(false)
  }, [session.contentRevision, session.history.position, session.selectedAnimationCellKeys.length, session.selectedAnimationMaskCellKeys.length, selectionOutlineVisible])
  useEffect(() => {
    const preserveSelection = (event: Event): void => {
      const detail = (event as CustomEvent<CanvasSelectionPreserveDetail>).detail
      if (detail.documentId === session.document.id) {
        preserveSelectionOnNextContentRevisionRef.current = true
        setSelectionOutlineVisible(true)
      }
    }
    window.addEventListener(CANVAS_SELECTION_PRESERVE_EVENT, preserveSelection)
    return () => window.removeEventListener(CANVAS_SELECTION_PRESERVE_EVENT, preserveSelection)
  }, [session.document.id])
  useEffect(() => {
    const startCanvasSelection = (event: Event): void => {
      const detail = (event as CustomEvent<CanvasSelectionStartedDetail>).detail
      if (detail.documentId !== session.document.id) return
      setAnimationGestureSelection(null)
      setAnimationGestureActiveTarget(null)
      setAnimationCellSelectionOutlineVisible(false)
      setSelectionOutlineVisible(false)
    }
    window.addEventListener(CANVAS_SELECTION_STARTED_EVENT, startCanvasSelection)
    return () => window.removeEventListener(CANVAS_SELECTION_STARTED_EVENT, startCanvasSelection)
  }, [session.document.id, store])
  useLayoutEffect(() => {
    syncAnimationLoopSectionScroll()
  }, [layerLabelWidth, timeline.frames.length, timeline.loopSections, visibleLoopSectionLaneCount])
  useEffect(() => {
    if (!session.freeTileInstanceLayerId) return
    if (!freeTileInstanceLayer || session.document.activeLayerId !== session.freeTileInstanceLayerId) store.setFreeTileInstanceLayerView(null)
  }, [freeTileInstanceLayer, session.document.activeLayerId, session.document.id, session.freeTileInstanceLayerId, store])
  useEffect(() => {
    const refreshLayout = (): void => setFreeTileInstancePanelLayout(loadFreeTileInstancePanelLayout())
    window.addEventListener('moonsprite:preferences-changed', refreshLayout)
    return () => window.removeEventListener('moonsprite:preferences-changed', refreshLayout)
  }, [])
  useEffect(() => {
    const revealLayer = (event: Event): void => {
      const detail = (event as CustomEvent<LayerPanelRevealDetail>).detail
      if (detail.documentId !== session.document.id) return
      const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === detail.documentId)
      const layer = liveSession?.document.layers.find((candidate) => candidate.id === detail.layerId)
      if (!liveSession || !layer) return
      store.revealLayerInPanel(detail.documentId, detail.layerId)
      revealSequenceRef.current += 1
      setLayerRevealRequest({ layerId: detail.layerId, sequence: revealSequenceRef.current })
    }
    window.addEventListener(LAYER_PANEL_REVEAL_EVENT, revealLayer)
    return () => window.removeEventListener(LAYER_PANEL_REVEAL_EVENT, revealLayer)
  }, [session.document.id, store])

  useLayoutEffect(() => {
    if (!layerRevealRequest) return
    const list = layerListRef.current
    if (!list) return
    const row = Array.from(list.querySelectorAll<HTMLElement>('[data-layer-id]'))
      .find((candidate) => candidate.dataset.layerId === layerRevealRequest.layerId)
    if (!row) return
    const listBounds = list.getBoundingClientRect()
    const rowBounds = row.getBoundingClientRect()
    const stickyHeaderHeight = Number.parseFloat(getComputedStyle(list).getPropertyValue('--animation-header-height')) || 34
    list.scrollTop = layerPanelRevealScrollTop({
      scrollTop: list.scrollTop,
      viewportTop: listBounds.top,
      viewportHeight: list.clientHeight || listBounds.height,
      stickyHeaderHeight,
      rowTop: rowBounds.top,
      rowHeight: rowBounds.height
    })
  }, [layerRevealRequest])

  useLayoutEffect(() => {
    if (!animationMenu || animationMenu.kind === 'playback') return
    const menu = animationMenuRef.current
    if (!menu) return
    const place = (): void => {
      const bounds = menu.getBoundingClientRect()
      setAnimationMenuPosition({
        left: Math.max(8, Math.min(animationMenu.x, window.innerWidth - bounds.width - 8)),
        top: Math.max(8, Math.min(animationMenu.y, window.innerHeight - bounds.height - 8))
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [animationMenu])
  const frameRange = (anchorId: string, targetId: string): string[] => {
    const anchorIndex = timeline.frames.findIndex((frame) => frame.id === anchorId)
    const targetIndex = timeline.frames.findIndex((frame) => frame.id === targetId)
    if (anchorIndex < 0 || targetIndex < 0) return [anchorId]
    const [from, to] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex]
    return timeline.frames.slice(from, to + 1).map((frame) => frame.id)
  }
  const cellRange = (anchorKey: string, targetKey: string): string[] => {
    const anchor = parseAnimationCelKey(anchorKey)
    const target = parseAnimationCelKey(targetKey)
    if (!anchor || !target) return [anchorKey]
    const anchorFrame = timeline.frames.findIndex((frame) => frame.id === anchor.frameId)
    const targetFrame = timeline.frames.findIndex((frame) => frame.id === target.frameId)
    const anchorLayer = session.document.layers.findIndex((layer) => layer.id === anchor.layerId)
    const targetLayer = session.document.layers.findIndex((layer) => layer.id === target.layerId)
    if (anchorFrame < 0 || targetFrame < 0 || anchorLayer < 0 || targetLayer < 0) return [anchorKey]
    const [fromFrame, toFrame] = anchorFrame <= targetFrame ? [anchorFrame, targetFrame] : [targetFrame, anchorFrame]
    const [fromLayer, toLayer] = anchorLayer <= targetLayer ? [anchorLayer, targetLayer] : [targetLayer, anchorLayer]
    const keys: string[] = []
    for (const layer of session.document.layers.slice(fromLayer, toLayer + 1)) for (const frame of timeline.frames.slice(fromFrame, toFrame + 1)) keys.push(animationCelKey(layer.id, frame.id))
    return keys
  }
  const maskCellRange = (anchorKey: string, targetKey: string): string[] => {
    const anchor = parseAnimationCelKey(anchorKey)
    const target = parseAnimationCelKey(targetKey)
    if (!anchor || !target) return [anchorKey]
    const ownerIds = buildLayerPanelTree({ layers: session.document.layers, groups: session.document.groups, collapsedGroupIds: [] }).map((node) => node.id)
    const anchorFrame = timeline.frames.findIndex((frame) => frame.id === anchor.frameId)
    const targetFrame = timeline.frames.findIndex((frame) => frame.id === target.frameId)
    const anchorOwner = ownerIds.indexOf(anchor.layerId)
    const targetOwner = ownerIds.indexOf(target.layerId)
    if (anchorFrame < 0 || targetFrame < 0 || anchorOwner < 0 || targetOwner < 0) return [anchorKey]
    const [fromFrame, toFrame] = anchorFrame <= targetFrame ? [anchorFrame, targetFrame] : [targetFrame, anchorFrame]
    const [fromOwner, toOwner] = anchorOwner <= targetOwner ? [anchorOwner, targetOwner] : [targetOwner, anchorOwner]
    const keys: string[] = []
    for (const ownerId of ownerIds.slice(fromOwner, toOwner + 1)) for (const frame of timeline.frames.slice(fromFrame, toFrame + 1)) {
      const key = animationCelKey(ownerId, frame.id)
      if (animationMaskLookup.get(key)) keys.push(key)
    }
    return keys
  }
  const openLayerSettings = (): void => {
    const preferences = loadEditorPreferences()
    setLayerSettings({ density: layerDensity, onionSkin: preferences.onionSkin, timelineHidden: preferences.timelineHidden, sideDockAutoHide: loadLayerSideDockAutoHide() })
    setLayerSettingsSlider(null)
    setLayerSettingsOpen(true)
  }
  const applyLayerSettings = (next: LayerSettingsState): void => {
    if (layerSettings.timelineHidden && next.timelineHidden && next.onionSkin !== layerSettings.onionSkin) return
    setLayerSettings(next)
    setLayerDensity(next.density)
    saveLayerDensity(next.density)
    saveLayerSideDockAutoHide(next.sideDockAutoHide)
    saveEditorPreferences({ ...loadEditorPreferences(), onionSkin: next.onionSkin, timelineHidden: next.timelineHidden })
    if (next.timelineHidden) {
      setLayerSettingsSlider(null)
      store.setAnimationPlaying(false)
      store.clearAnimationSelection()
      setAnimationMenu(null)
    }
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }
  const saveLayerSettings = (): void => {
    applyLayerSettings(layerSettings)
    setLayerSettingsOpen(false)
  }
  const resetLayerSettings = (): void => applyLayerSettings({
    density: defaultLayerDensity,
    timelineHidden: false,
    sideDockAutoHide: true,
    onionSkin: {
      ...DEFAULT_ONION_SKIN_PREFERENCES,
      previousColor: { ...DEFAULT_ONION_SKIN_PREFERENCES.previousColor },
      nextColor: { ...DEFAULT_ONION_SKIN_PREFERENCES.nextColor }
    }
  })
  const toggleOnionSkin = (): void => {
    const current = loadEditorPreferences().onionSkin
    applyLayerSettings({ density: layerDensity, onionSkin: { ...current, enabled: !current.enabled }, timelineHidden: layerSettings.timelineHidden, sideDockAutoHide: layerSettings.sideDockAutoHide })
  }
  const selectAnimationFrame = (frameId: string, mode: 'replace' | 'toggle' | 'range' = 'replace'): void => {
    store.selectAnimationFrame(frameId, mode)
  }
  const selectAnimationEdge = (edge: 'first' | 'last'): void => {
    const frame = edge === 'first' ? timeline.frames[0] : timeline.frames.at(-1)
    if (frame) selectAnimationFrame(frame.id)
  }
  const selectAnimationStep = (delta: number): void => {
    if (timeline.frames.length === 0 || delta === 0) return
    const lastIndex = timeline.frames.length - 1
    const nextIndex = activeFrameIndex + delta
    const index = delta > 0
      ? ((nextIndex % timeline.frames.length) + timeline.frames.length) % timeline.frames.length
      : Math.max(0, Math.min(lastIndex, nextIndex))
    const frame = timeline.frames[index]
    if (frame) selectAnimationFrame(frame.id)
  }
  const setStoredLayerLabelWidth = (value: number): void => {
    const next = clampLayerLabelWidth(value)
    setLayerLabelWidth(next)
    localStorage.setItem(layerLabelWidthKey, String(next))
  }
  const beginLayerLabelResize = (event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    document.body.classList.add('layer-column-resizing')
    const startX = event.clientX
    const startWidth = layerLabelWidth
    const move = (moveEvent: PointerEvent): void => setStoredLayerLabelWidth(startWidth + moveEvent.clientX - startX)
    const end = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      document.body.classList.remove('layer-column-resizing')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  const changeLayerDensity = (direction: -1 | 1): void => {
    setLayerDensity((current) => {
      const index = layerDensityOrder.indexOf(current)
      const next = layerDensityOrder[Math.max(0, Math.min(layerDensityOrder.length - 1, index + direction))]
      saveLayerDensity(next)
      window.dispatchEvent(new Event('moonsprite:preferences-changed'))
      return next
    })
  }
  const handleLayerPanelWheel = (event: React.WheelEvent<HTMLElement>): void => {
    if (event.altKey && (event.deltaX !== 0 || event.deltaY !== 0)) {
      event.preventDefault()
      event.stopPropagation()
      if (layerListRef.current) layerListRef.current.scrollLeft += event.deltaX || event.deltaY
      return
    }
    if (!event.ctrlKey || event.deltaY === 0) return
    event.preventDefault()
    event.stopPropagation()
    changeLayerDensity(event.deltaY < 0 ? 1 : -1)
  }
  const openAnimationMenu = (event: React.MouseEvent<HTMLElement>, menu: AnimationContextMenu): void => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setLayerCreateMenu(null)
    setAnimationMenuPosition({ left: event.clientX, top: event.clientY })
    setAnimationMenu(menu)
  }
  const openFrameMenu = (event: React.MouseEvent<HTMLElement>, frameId: string): void => {
    if (!session.selectedAnimationFrameIds.includes(frameId)) selectAnimationFrame(frameId)
    openAnimationMenu(event, { kind: 'frame', frameId, x: event.clientX, y: event.clientY })
  }
  const useFrameMenuTarget = (action: () => void): void => {
    if (animationMenu?.kind !== 'frame') return
    if (ensureAnimationDocument(session.document).activeFrameId !== animationMenu.frameId) store.setActiveAnimationFrame(animationMenu.frameId)
    action()
    setAnimationMenu(null)
  }
  const openFrameProperties = (): void => useFrameMenuTarget(() => {
    const frame = ensureAnimationDocument(session.document).frames.find((candidate) => candidate.id === ensureAnimationDocument(session.document).activeFrameId)
    if (frame) setFrameProperties({ frameId: frame.id, duration: frame.duration })
  })
  const openFramePropertiesFor = (frameId: string): void => {
    const frame = ensureAnimationDocument(session.document).frames.find((candidate) => candidate.id === frameId)
    if (!frame) return
    if (ensureAnimationDocument(session.document).activeFrameId !== frameId) store.setActiveAnimationFrame(frameId)
    setFrameProperties({ frameId: frame.id, duration: frame.duration })
    setAnimationMenu(null)
  }
  const saveFrameProperties = (): void => {
    if (!frameProperties) return
    if (ensureAnimationDocument(session.document).activeFrameId !== frameProperties.frameId) store.setActiveAnimationFrame(frameProperties.frameId)
    store.setActiveAnimationFrameDuration(frameProperties.duration)
    setFrameProperties(null)
  }
  const nextLoopSectionName = (): string => {
    const names = new Set((ensureAnimationDocument(session.document).loopSections ?? []).map((section) => section.name))
    let number = 1
    while (names.has(t('timeline.defaultLoopSectionName', { number }))) number += 1
    return t('timeline.defaultLoopSectionName', { number })
  }
  const openLoopSectionCreator = (): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const currentTimeline = ensureAnimationDocument(active.document)
    const selected = new Set(active.selectedAnimationFrameIds.length ? active.selectedAnimationFrameIds : [currentTimeline.activeFrameId])
    const indexes = currentTimeline.frames.flatMap((frame, index) => selected.has(frame.id) ? [index] : [])
    if (indexes.length === 0) return
    setLoopSectionEditor({
      mode: 'create',
      value: {
        name: nextLoopSectionName(),
        startFrame: Math.min(...indexes) + 1,
        endFrame: Math.max(...indexes) + 1,
        direction: 'forward',
        repeatCount: null
      }
    })
    setAnimationMenu(null)
  }
  const openLoopSectionPropertiesFor = (sectionId: string): void => {
    const currentTimeline = ensureAnimationDocument(session.document)
    const section = (currentTimeline.loopSections ?? []).find((candidate) => candidate.id === sectionId)
    const range = section ? resolveAnimationLoopSectionRange(currentTimeline, section) : null
    if (!section || !range) return
    setLoopSectionEditor({
      mode: 'edit',
      sectionId,
      value: {
        name: section.name,
        startFrame: range.startIndex + 1,
        endFrame: range.endIndex + 1,
        direction: section.direction,
        repeatCount: section.repeatCount
      }
    })
    setAnimationMenu(null)
  }
  const saveLoopSection = (draft: AnimationLoopSectionDraft): void => {
    if (!loopSectionEditor) return
    const currentTimeline = ensureAnimationDocument(session.document)
    const startFrame = currentTimeline.frames[draft.startFrame - 1]
    const endFrame = currentTimeline.frames[draft.endFrame - 1]
    if (!startFrame || !endFrame) return
    const options = { name: draft.name, startFrameId: startFrame.id, endFrameId: endFrame.id, direction: draft.direction, repeatCount: draft.repeatCount }
    if (loopSectionEditor.mode === 'edit' && loopSectionEditor.sectionId) store.updateAnimationLoopSection(loopSectionEditor.sectionId, options)
    else store.createAnimationLoopSection(options)
    setLoopSectionEditor(null)
  }
  const selectLoopSection = (section: AnimationLoopSection): void => {
    const range = resolveAnimationLoopSectionRange(ensureAnimationDocument(session.document), section)
    if (!range) return
    store.selectAnimationFrame(range.startFrameId)
    if (range.endFrameId !== range.startFrameId) store.selectAnimationFrame(range.endFrameId, 'range')
  }
  const openLoopSectionMenu = (event: React.MouseEvent<HTMLElement>, sectionId: string): void => {
    openAnimationMenu(event, { kind: 'loop-section', sectionId, x: event.clientX, y: event.clientY })
  }
  const openCelProperties = (layerId: string, frameId: string): void => {
    const cel = celLookup.at(layerId, frameId)
    if (!currentCelHasContent(layerId, frameId)) return
    store.selectAnimationCell(animationCelKey(layerId, frameId))
    setCelProperties({ layerId, frameId, opacity: Math.round((cel?.opacity ?? 1) * 100) })
    setAnimationMenu(null)
  }
  const saveCelProperties = (): void => {
    if (!celProperties) return
    store.setAnimationCelOpacity(celProperties.layerId, celProperties.frameId, celProperties.opacity / 100)
    setCelProperties(null)
  }
  const openCelMenu = (event: React.MouseEvent<HTMLElement>, layerId: string, frameId: string, kind: 'cel' | 'mask' = 'cel'): void => {
    const key = animationCelKey(layerId, frameId)
    if (kind === 'mask') {
      if (!session.selectedAnimationMaskCellKeys.includes(key)) store.selectAnimationMaskCell(key)
    } else if (!session.selectedAnimationCellKeys.includes(key)) store.selectAnimationCell(key)
    openAnimationMenu(event, { kind, layerId, frameId, x: event.clientX, y: event.clientY })
  }
  const pointerHitsSelectionOutline = (event: React.PointerEvent<HTMLElement>, selector: string): boolean => {
    const outline = layerListRef.current?.querySelector<HTMLElement>(selector)
    if (!outline) return false
    const bounds = outline.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return false
    const inset = 6
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
    return inside && (event.clientX - bounds.left <= inset || bounds.right - event.clientX <= inset || event.clientY - bounds.top <= inset || bounds.bottom - event.clientY <= inset)
  }
  const cancelAnimationPointerDrag = (): void => {
    const drag = animationPointerDragRef.current
    if (drag && 'longPressTimer' in drag && drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer)
    if (drag?.kind === 'group-cel') setSelectedAnimationGroupCellKeys([drag.sourceAnchorKey])
    animationPointerDragRef.current = null
    setLoopSectionResizePreview(null)
    animationFrameDropTargetRef.current = null
    animationCelDropTargetKeyRef.current = null
    setAnimationFrameDropTarget(null)
    setAnimationCelDropTargetKey(null)
    setAnimationCelDragAnchorKey(null)
    setDraggingAnimationFrameIds([])
    setDraggingAnimationCellKeys([])
    setDraggingAnimationCellKind(null)
    setAnimationGestureSelection(null)
    setAnimationGestureActiveTarget(null)
  }
  const loopSectionFrameIndexAtPointer = (clientX: number, edge: AnimationLoopSectionResizeEdge): number | null => {
    const firstHeader = layerListRef.current?.querySelector<HTMLElement>('[data-animation-frame-id][data-frame-index="0"]')
    if (!firstHeader) return null
    const bounds = firstHeader.getBoundingClientRect()
    if (bounds.width <= 0) return null
    // The start edge sits on a frame boundary; the end edge sits one boundary after its last frame.
    const boundaryIndex = Math.round((clientX - bounds.left) / bounds.width)
    const rawIndex = edge === 'start' ? boundaryIndex : boundaryIndex - 1
    return Math.max(0, Math.min(timeline.frames.length - 1, rawIndex))
  }
  const beginAnimationLoopSectionResize = (event: React.PointerEvent<HTMLElement>, sectionId: string, edge: AnimationLoopSectionResizeEdge): void => {
    if (event.button !== 0) return
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
    const currentTimeline = ensureAnimationDocument(active.document)
    const section = (currentTimeline.loopSections ?? []).find((candidate) => candidate.id === sectionId)
    const range = section ? resolveAnimationLoopSectionRange(currentTimeline, section) : null
    if (!section || !range) return
    cancelAnimationPointerDrag()
    selectLoopSection(section)
    animationPointerDragRef.current = {
      kind: 'loop-section',
      sectionId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      previewStartIndex: range.startIndex,
      previewEndIndex: range.endIndex,
      moved: false
    }
    setLoopSectionResizePreview({ sectionId, startIndex: range.startIndex, endIndex: range.endIndex })
    event.preventDefault()
    event.stopPropagation()
  }
  const beginAnimationFrameDrag = (event: React.PointerEvent<HTMLElement>, frameId: string): void => {
    if (event.button !== 0) return
    const selected = session.selectedAnimationFrameIds.includes(frameId)
    // Drawing hides selection guides without clearing the formal selection.
    // Clicking an already-selected frame must make that selection visible
    // again; a new selection is revealed after the Store update commits.
    if (selected) showAnimationSelectionOutline()
    const preserveSelection = event.shiftKey || event.ctrlKey
    if (preserveSelection) {
      cancelAnimationPointerDrag()
      selectAnimationFrame(frameId, event.shiftKey ? 'range' : 'toggle')
      event.preventDefault()
      return
    }
    const canMove = selected && pointerHitsSelectionOutline(event, `[data-animation-frame-selection~="${frameId}"]`)
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const drag: AnimationPointerDrag = {
      kind: 'frame',
      sourceFrameId: frameId,
      frameIds: canMove ? [...(active?.selectedAnimationFrameIds ?? [frameId])] : [frameId],
      preserveSelection,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canMove,
      pendingSelection: false,
      longPressed: false,
      longPressTimer: null,
      lastSelectionTarget: frameId
    }
    // Only a new range gesture masks the prior formal selection; moving an
    // existing selected frame keeps its selection visible.
    if (!canMove) showAnimationSelectionOutline()
    setAnimationGestureSelection(canMove ? null : { kind: 'frame', ids: [frameId] })
    setAnimationGestureActiveTarget(canMove ? null : { kind: 'frame', frameId })
    animationPointerDragRef.current = drag
    event.preventDefault()
  }
  const beginAnimationCelDrag = (event: React.PointerEvent<HTMLButtonElement>, layerId: string, frameId: string): void => {
    if (event.button !== 0) return
    const key = animationCelKey(layerId, frameId)
    if (event.altKey) {
      cancelAnimationPointerDrag()
      store.selectAnimationCelContent(key, event.shiftKey)
      window.dispatchEvent(new CustomEvent(COMMAND_SCOPE_EVENT, { detail: { scope: 'canvas', preferSelection: true } }))
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (session.activeLayerMaskId !== null || session.selectedAnimationMaskCellKeys.length > 0 || session.selectedAnimationMaskRowKeys.length > 0) {
      store.clearAnimationSelection()
    }
    const selected = session.selectedAnimationCellKeys.includes(key)
    if (selected) {
      showAnimationSelectionOutline()
      showAnimationCellSelectionOutline()
    }
    const preserveSelection = event.shiftKey || event.ctrlKey
    if (preserveSelection) {
      cancelAnimationPointerDrag()
      animationPointerDragRef.current = {
        kind: 'cel', sourceAnchorKey: key, cellKeys: [...session.selectedAnimationCellKeys, key],
        preserveSelection: false, selectionMode: event.ctrlKey || selected ? 'toggle' : 'range',
        startX: event.clientX, startY: event.clientY, moved: false, canMove: false,
        pendingSelection: true, longPressed: false, longPressTimer: null, lastSelectionTarget: key
      }
      event.preventDefault()
      return
    }
    // Empty cels are real timeline slots (ensureAnimationDocument gives them
    // a blank surface), so they must remain draggable just like populated
    // cels.  Content presence only controls thumbnail rendering.
    const canMove = selected && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')
    if (!canMove) {
      showAnimationSelectionOutline()
      showAnimationCellSelectionOutline()
    }
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const drag: AnimationPointerDrag = {
      kind: 'cel',
      sourceAnchorKey: key,
      cellKeys: canMove ? [...(active?.selectedAnimationCellKeys ?? [key])] : [key],
      preserveSelection,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canMove,
      pendingSelection: false,
      longPressed: false,
      longPressTimer: null,
      lastSelectionTarget: key
    }
    setAnimationGestureSelection(canMove ? null : { kind: 'cel', keys: [key] })
    setAnimationGestureActiveTarget(canMove ? null : { kind: 'cel', layerId, frameId })
    setAnimationCelDragAnchorKey(canMove ? key : null)
    animationPointerDragRef.current = drag
    event.preventDefault()
  }
  const beginAnimationGroupCelDrag = (event: React.PointerEvent<HTMLButtonElement>, groupId: string, frameId: string): void => {
    if (event.button !== 0) return
    const key = animationCelKey(groupId, frameId)
    const selected = selectedAnimationGroupCellKeySet.has(key)
    const preserveSelection = event.shiftKey || event.ctrlKey
    if (preserveSelection) {
      animationPointerDragRef.current = {
        kind: 'group-cel', sourceAnchorKey: key, preserveSelection: false,
        selectionMode: event.ctrlKey || selected ? 'toggle' : 'range',
        startX: event.clientX, startY: event.clientY, moved: false, canMove: false, lastSelectionTarget: key
      }
      setAnimationGestureSelection({ kind: 'cel', keys: [key] })
      setAnimationGestureActiveTarget({ kind: 'cel', layerId: groupId, frameId })
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const canMove = selected && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')
    // Keep group focus/selection transient until pointer-up, matching layer
    // and mask cel gestures.
    setSelectionOutlineVisible(true)
    setAnimationCellSelectionOutlineVisible(true)
    animationPointerDragRef.current = {
      kind: 'group-cel',
      sourceAnchorKey: key,
      preserveSelection,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canMove,
      lastSelectionTarget: key
    }
    setAnimationGestureSelection(canMove ? null : { kind: 'cel', keys: [key] })
    setAnimationGestureActiveTarget(canMove ? null : { kind: 'cel', layerId: groupId, frameId })
    setAnimationCelDragAnchorKey(canMove ? key : null)
    event.preventDefault()
    event.stopPropagation()
  }
  const toggleAnimationMaskIsolatedView = (layerId: string, frameId: string, additive = false): boolean => {
    const key = animationCelKey(layerId, frameId)
    const cel = celLookup.at(layerId, frameId)
    const mask = animationMaskAt(timeline, layerId, frameId)
    if (!mask) return false
    if (!additive && session.layerMaskIsolatedView && session.activeLayerMaskId === mask.id) store.selectAnimationMaskCell(key)
    else if (cel) store.selectLayerMask(cel.id, additive)
    else store.selectGroupMask(layerId, frameId, additive)
    return true
  }
  const beginAnimationMaskDrag = (event: React.PointerEvent<HTMLButtonElement>, layerId: string, frameId: string): void => {
    if (event.button !== 0) return
    const key = animationCelKey(layerId, frameId)
    const mask = animationMaskAt(timeline, layerId, frameId)
    if (event.altKey) {
      if (!mask) return
      cancelAnimationPointerDrag()
      toggleAnimationMaskIsolatedView(layerId, frameId, event.shiftKey)
      suppressAnimationClickRef.current = true
      window.setTimeout(() => { suppressAnimationClickRef.current = false }, 0)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const selected = session.selectedAnimationMaskCellKeys.includes(key)
    if (selected) {
      showAnimationSelectionOutline()
      showAnimationCellSelectionOutline()
    }
    const preserveSelection = event.shiftKey || event.ctrlKey
    if (!preserveSelection && !selected) store.selectAnimationMaskCell(key, 'replace')
    if (preserveSelection) {
      cancelAnimationPointerDrag()
      animationPointerDragRef.current = {
        kind: 'mask', sourceAnchorKey: key, cellKeys: [...session.selectedAnimationMaskCellKeys, key],
        preserveSelection: false, selectionMode: event.ctrlKey || selected ? 'toggle' : 'range',
        startX: event.clientX, startY: event.clientY, moved: false, canMove: false,
        pendingSelection: true, longPressed: false, longPressTimer: null, lastSelectionTarget: key
      }
      event.preventDefault()
      return
    }
    const canMove = selected && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')
    const drag: AnimationPointerDrag = {
      kind: 'mask',
      sourceAnchorKey: key,
      cellKeys: selected ? [...session.selectedAnimationMaskCellKeys] : [key],
      preserveSelection,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canMove,
      pendingSelection: false,
      longPressed: false,
      longPressTimer: null,
      lastSelectionTarget: key
    }
    if (!canMove) {
      setSelectionOutlineVisible(false)
      setAnimationCellSelectionOutlineVisible(false)
      // Mask interaction is a distinct selection mode. Do not select the
      // owner row during pointer-down; that transient write leaks ordinary
      // owner-row/current-cel visuals before pointer-up commits mask state.
      showAnimationSelectionOutline()
      showAnimationCellSelectionOutline()
    }
    setAnimationGestureSelection(canMove ? null : { kind: 'mask', keys: [key] })
    setAnimationGestureActiveTarget(canMove ? null : { kind: 'mask', layerId, frameId })
    setAnimationCelDragAnchorKey(canMove ? key : null)
    animationPointerDragRef.current = drag
    event.preventDefault()
  }
  const pointerTargetElement = (event: PointerEvent): Element | null => {
    const pointed = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(event.clientX, event.clientY) : null
    const animationTarget = pointed?.closest('[data-animation-frame-id], [data-animation-cel-key], [data-animation-mask-cel-key], [data-animation-group-cel-key]')
    if (animationTarget) return animationTarget
    return event.target instanceof Element ? event.target : pointed
  }
  const animationFrameTarget = (target: Element | null): { frameId: string; element: HTMLElement } | null => {
    const header = target?.closest<HTMLElement>('[data-animation-frame-id]')
    if (header?.dataset.animationFrameId) return { frameId: header.dataset.animationFrameId, element: header }
    const cell = target?.closest<HTMLElement>('[data-animation-cel-key]')
    const parsed = cell?.dataset.animationCelKey ? parseAnimationCelKey(cell.dataset.animationCelKey) : null
    const maskCell = target?.closest<HTMLElement>('[data-animation-mask-cel-key]')
    const maskParsed = maskCell?.dataset.animationMaskCelKey ? parseAnimationCelKey(maskCell.dataset.animationMaskCelKey) : null
    return maskCell && maskParsed ? { frameId: maskParsed.frameId, element: maskCell } : cell && parsed ? { frameId: parsed.frameId, element: cell } : null
  }
  const updateAnimationItemCursor = (event: React.PointerEvent<HTMLElement>, frameId: string, cellKey?: string): void => {
    const maskCell = event.currentTarget.matches('[data-animation-mask-cel-key]')
    const frameMove = !maskCell && session.selectedAnimationFrameIds.includes(frameId) && pointerHitsSelectionOutline(event, `[data-animation-frame-selection~="${frameId}"]`)
    const celMove = !maskCell && Boolean(cellKey && session.selectedAnimationCellKeys.includes(cellKey))
      && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')
    const maskMove = maskCell && Boolean(cellKey && session.selectedAnimationMaskCellKeys.includes(cellKey))
      && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')
    event.currentTarget.classList.toggle('mask-selection-move', maskMove)
    event.currentTarget.style.cursor = frameMove || celMove || maskMove ? 'var(--cursor-move)' : ''
  }
  const clampAnimationCelDropTarget = (drag: Extract<AnimationPointerDrag, { kind: 'cel' | 'mask' }>, candidateKey: string): string | null => {
    const anchor = parseAnimationCelKey(drag.sourceAnchorKey)
    const candidate = parseAnimationCelKey(candidateKey)
    if (!anchor || !candidate) return null
    const ownerIds = drag.kind === 'mask'
      ? buildLayerPanelTree({ layers: session.document.layers, groups: session.document.groups, collapsedGroupIds: [] }).map((node) => node.id)
      : session.document.layers.map((layer) => layer.id)
    const frameIds = timeline.frames.map((frame) => frame.id)
    const ownerIndex = new Map(ownerIds.map((id, index) => [id, index]))
    const frameIndex = new Map(frameIds.map((id, index) => [id, index]))
    const anchorOwner = ownerIndex.get(anchor.layerId)
    const anchorFrame = frameIndex.get(anchor.frameId)
    const candidateOwner = ownerIndex.get(candidate.layerId)
    const candidateFrame = frameIndex.get(candidate.frameId)
    if (anchorOwner === undefined || anchorFrame === undefined || candidateOwner === undefined || candidateFrame === undefined) return null
    const sourcePositions = drag.cellKeys.flatMap((key) => {
      const parsed = parseAnimationCelKey(key)
      if (!parsed) return []
      const row = ownerIndex.get(parsed.layerId)
      const column = frameIndex.get(parsed.frameId)
      return row === undefined || column === undefined ? [] : [{ row, column }]
    })
    if (sourcePositions.length === 0) return candidateKey
    const minRow = Math.min(...sourcePositions.map((position) => position.row))
    const maxRow = Math.max(...sourcePositions.map((position) => position.row))
    const minColumn = Math.min(...sourcePositions.map((position) => position.column))
    const maxColumn = Math.max(...sourcePositions.map((position) => position.column))
    const rowDelta = Math.max(-minRow, Math.min(ownerIds.length - 1 - maxRow, candidateOwner - anchorOwner))
    const columnDelta = Math.max(-minColumn, Math.min(frameIds.length - 1 - maxColumn, candidateFrame - anchorFrame))
    const boundedOwnerId = ownerIds[anchorOwner + rowDelta]
    const boundedFrameId = frameIds[anchorFrame + columnDelta]
    return boundedOwnerId && boundedFrameId ? animationCelKey(boundedOwnerId, boundedFrameId) : null
  }
  const animationCelEdgeTarget = (drag: Extract<AnimationPointerDrag, { kind: 'cel' | 'mask' | 'group-cel' }>, clientX: number, clientY: number): string | null => {
    const selector = drag.kind === 'mask' ? '[data-animation-mask-cel-key]' : drag.kind === 'group-cel' ? '[data-animation-group-cel-key]' : '[data-animation-cel-key]'
    const datasetKey = drag.kind === 'mask' ? 'animationMaskCelKey' : drag.kind === 'group-cel' ? 'animationGroupCelKey' : 'animationCelKey'
    const cells = [...(layerListRef.current?.querySelectorAll<HTMLElement>(selector) ?? [])]
      .map((element) => ({ element, bounds: element.getBoundingClientRect(), key: element.dataset[datasetKey] }))
      .filter((entry): entry is { element: HTMLElement; bounds: DOMRect; key: string } => Boolean(entry.key && entry.bounds.width > 0 && entry.bounds.height > 0))
    if (cells.length === 0) return null
    const nearestRowCenter = cells.reduce((nearest, entry) => {
      const center = entry.bounds.top + entry.bounds.height / 2
      return Math.abs(center - clientY) < Math.abs(nearest - clientY) ? center : nearest
    }, cells[0].bounds.top + cells[0].bounds.height / 2)
    const rowCells = cells
      .filter((entry) => Math.abs(entry.bounds.top + entry.bounds.height / 2 - nearestRowCenter) < 1)
      .sort((left, right) => left.bounds.left - right.bounds.left)
    const first = rowCells[0]
    const last = rowCells.at(-1)
    if (!first || !last) return null
    if (clientX < first.bounds.left) return first.key
    if (clientX > last.bounds.right) return last.key
    return null
  }
  const moveAnimationPointerDrag = (event: PointerEvent): void => {
    const drag = animationPointerDragRef.current
    if (!drag) return
    if (drag.kind === 'loop-section') {
      const list = layerListRef.current
      if (list) {
        const bounds = list.getBoundingClientRect()
        if (event.clientX > bounds.right - 30) list.scrollLeft += 18
        else if (event.clientX < bounds.left + 30) list.scrollLeft -= 18
      }
      const nextIndex = loopSectionFrameIndexAtPointer(event.clientX, drag.edge)
      if (nextIndex === null) return
      const nextStartIndex = drag.edge === 'start' ? Math.min(nextIndex, drag.endIndex) : drag.startIndex
      const nextEndIndex = drag.edge === 'end' ? Math.max(nextIndex, drag.startIndex) : drag.endIndex
      if (nextStartIndex === drag.previewStartIndex && nextEndIndex === drag.previewEndIndex) return
      drag.previewStartIndex = nextStartIndex
      drag.previewEndIndex = nextEndIndex
      drag.moved = true
      setLoopSectionResizePreview({ sectionId: drag.sectionId, startIndex: nextStartIndex, endIndex: nextEndIndex })
      return
    }
    if (!drag.canMove) {
      const target = pointerTargetElement(event)
      if (drag.kind === 'frame') {
        const frameId = animationFrameTarget(target)?.frameId
        if (frameId && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4 && frameId !== drag.lastSelectionTarget) {
          if (drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer)
          drag.longPressTimer = null
          drag.longPressed = true
          drag.pendingSelection = false
          drag.lastSelectionTarget = frameId
          showAnimationSelectionOutline()
          setAnimationGestureActiveTarget({ kind: 'frame', frameId })
          setAnimationGestureSelection({ kind: 'frame', ids: frameRange(drag.sourceFrameId, frameId) })
        }
      } else if (drag.kind === 'group-cel') {
        const key = target?.closest<HTMLElement>('[data-animation-group-cel-key]')?.dataset.animationGroupCelKey
        if (key && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4 && key !== drag.lastSelectionTarget) {
          drag.moved = true
          drag.lastSelectionTarget = key
          animationCelDropTargetKeyRef.current = key
          setAnimationCelDropTargetKey(key)
          setSelectedAnimationGroupCellKeys([key])
          const parsedTarget = parseAnimationCelKey(key)
          if (parsedTarget) setAnimationGestureActiveTarget({ kind: 'frame', frameId: parsedTarget.frameId })
        }
      } else {
        const selector = drag.kind === 'mask' ? '[data-animation-mask-cel-key]' : '[data-animation-cel-key]'
        const key = target?.closest<HTMLElement>(selector)?.dataset[drag.kind === 'mask' ? 'animationMaskCelKey' : 'animationCelKey']
        if (key && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4 && key !== drag.lastSelectionTarget) {
          if (drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer)
          drag.longPressTimer = null
          drag.longPressed = true
          drag.pendingSelection = false
          drag.lastSelectionTarget = key
          showAnimationSelectionOutline()
          const parsedTarget = parseAnimationCelKey(key)
          if (parsedTarget) setAnimationGestureActiveTarget({ kind: drag.kind, layerId: parsedTarget.layerId, frameId: parsedTarget.frameId })
          setAnimationGestureSelection({ kind: drag.kind, keys: drag.kind === 'mask' ? maskCellRange(drag.sourceAnchorKey, key) : cellRange(drag.sourceAnchorKey, key) })
        }
      }
      return
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
    if (!drag.moved) {
      drag.moved = true
      if (drag.kind === 'frame') setDraggingAnimationFrameIds(drag.frameIds)
      else if (drag.kind === 'group-cel') setSelectedAnimationGroupCellKeys([drag.sourceAnchorKey])
      else {
        setDraggingAnimationCellKeys(drag.cellKeys)
        setDraggingAnimationCellKind(drag.kind)
      }
    }
    const list = layerListRef.current
    if (list) {
      const bounds = list.getBoundingClientRect()
      if (event.clientX > bounds.right - 30) list.scrollLeft += 18
      else if (event.clientX < bounds.left + 30) list.scrollLeft -= 18
    }
    const pointed = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(event.clientX, event.clientY) : null
    const target = pointed?.closest('[data-animation-frame-id], [data-animation-cel-key], [data-animation-mask-cel-key], [data-animation-group-cel-key]') ? pointed : pointerTargetElement(event)
    if (drag.kind === 'frame') {
      if (target?.closest('.layer-animation-corner')) {
        animationFrameDropTargetRef.current = null
        setAnimationFrameDropTarget(null)
        return
      }
      const frameTarget = animationFrameTarget(target)
      if (!frameTarget) {
        animationFrameDropTargetRef.current = null
        setAnimationFrameDropTarget(null)
        return
      }
      const { frameId, element } = frameTarget
      const bounds = element.getBoundingClientRect()
      const next = { frameId, insertAfter: event.clientX >= bounds.left + bounds.width / 2 }
      const previous = animationFrameDropTargetRef.current
      if (previous?.frameId === next.frameId && previous.insertAfter === next.insertAfter) return
      animationFrameDropTargetRef.current = next
      setAnimationFrameDropTarget(next)
      return
    }
    const cell = target?.closest<HTMLElement>(drag.kind === 'mask' ? '[data-animation-mask-cel-key]' : drag.kind === 'group-cel' ? '[data-animation-group-cel-key]' : '[data-animation-cel-key]')
    const pointedKey = drag.kind === 'mask' ? cell?.dataset.animationMaskCelKey ?? null : drag.kind === 'group-cel' ? cell?.dataset.animationGroupCelKey ?? null : cell?.dataset.animationCelKey ?? null
    const candidateKey = pointedKey ?? animationCelEdgeTarget(drag, event.clientX, event.clientY)
    const key = candidateKey && (drag.kind === 'cel' || drag.kind === 'mask')
      ? clampAnimationCelDropTarget(drag, candidateKey)
      : candidateKey
    animationCelDropTargetKeyRef.current = key
    setAnimationCelDropTargetKey(key)
  }
  const finishAnimationPointerDrag = (cancelled = false): void => {
    const drag = animationPointerDragRef.current
    if (!drag) return
    if (cancelled) {
      cancelAnimationPointerDrag()
      return
    }
    if (drag.kind === 'loop-section') {
      if (drag.moved) {
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id) ?? session
        const currentTimeline = ensureAnimationDocument(active.document)
        const section = (currentTimeline.loopSections ?? []).find((candidate) => candidate.id === drag.sectionId)
        const startFrame = currentTimeline.frames[drag.previewStartIndex]
        const endFrame = currentTimeline.frames[drag.previewEndIndex]
        if (section && startFrame && endFrame) {
          store.updateAnimationLoopSection(drag.sectionId, {
            name: section.name,
            startFrameId: startFrame.id,
            endFrameId: endFrame.id,
            direction: section.direction,
            repeatCount: section.repeatCount
          })
          selectLoopSection({ ...section, startFrameId: startFrame.id, endFrameId: endFrame.id })
        }
        suppressAnimationClickRef.current = true
        window.setTimeout(() => { suppressAnimationClickRef.current = false }, 0)
      }
      cancelAnimationPointerDrag()
      return
    }
    if ('longPressTimer' in drag && drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer)
    if (drag.moved) {
      if (drag.kind === 'frame' && animationFrameDropTargetRef.current) {
        store.moveSelectedAnimationFrames(animationFrameDropTargetRef.current.frameId, animationFrameDropTargetRef.current.insertAfter)
      } else if (drag.kind === 'cel' && animationCelDropTargetKeyRef.current) {
        const targetKey = animationCelDropTargetKeyRef.current
        const target = targetKey.lastIndexOf(':')
        if (target > 0) {
          // Moving cels mutates raster content and increments contentRevision;
          // preserve the destination selection guides through that revision
          // transition so the post-drop bbox does not flash away.
          preserveSelectionOnNextContentRevisionRef.current = true
          store.moveSelectedAnimationCels(targetKey.slice(0, target), targetKey.slice(target + 1), drag.sourceAnchorKey)
          // Keep the formal destination selection visible after the Store
          // replaces the moved keys; this lets the new multi-cel bbox settle
          // instead of hiding the outline on pointerup.
          showAnimationSelectionOutline()
          showAnimationCellSelectionOutline()
        }
      } else if (drag.kind === 'group-cel' && animationCelDropTargetKeyRef.current) {
        const targetKey = animationCelDropTargetKeyRef.current
        setSelectedAnimationGroupCellKeys([targetKey])
        const parsed = parseAnimationCelKey(targetKey)
        if (parsed) {
          store.selectGroup(parsed.layerId)
          store.setActiveAnimationFrame(parsed.frameId)
        }
        setSelectionOutlineVisible(true)
        setAnimationCellSelectionOutlineVisible(true)
      } else if (drag.kind === 'mask' && animationCelDropTargetKeyRef.current) {
        const targetKey = animationCelDropTargetKeyRef.current
        const target = targetKey.lastIndexOf(':')
        if (target > 0) {
          preserveSelectionOnNextContentRevisionRef.current = true
          store.moveSelectedAnimationMasks(targetKey.slice(0, target), targetKey.slice(target + 1), drag.sourceAnchorKey)
        }
        showAnimationSelectionOutline()
        showAnimationCellSelectionOutline()
      }
      suppressAnimationClickRef.current = true
      window.setTimeout(() => { suppressAnimationClickRef.current = false }, 0)
    } else if (drag.kind === 'group-cel') {
      setSelectedAnimationGroupCellKeys((current) => drag.selectionMode === 'toggle'
        ? (current.includes(drag.lastSelectionTarget) ? current.filter((candidate) => candidate !== drag.lastSelectionTarget) : [...current, drag.lastSelectionTarget])
        : drag.selectionMode === 'range' ? [...new Set([...current, drag.lastSelectionTarget])] : [drag.lastSelectionTarget])
      const target = parseAnimationCelKey(drag.lastSelectionTarget)
      if (target) {
        store.selectGroup(target.layerId)
        store.setActiveAnimationFrame(target.frameId)
      }
    } else if ('longPressed' in drag && drag.longPressed) {
      if (drag.kind === 'frame') {
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        if (!active?.selectedAnimationFrameIds.includes(drag.sourceFrameId)) store.selectAnimationFrame(drag.sourceFrameId, 'replace')
        if (drag.lastSelectionTarget !== drag.sourceFrameId) store.selectAnimationFrame(drag.lastSelectionTarget, 'range')
      } else if (drag.kind === 'mask') {
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        if (!active?.selectedAnimationMaskCellKeys.includes(drag.sourceAnchorKey)) store.selectAnimationMaskCell(drag.sourceAnchorKey, 'replace')
        if (drag.lastSelectionTarget !== drag.sourceAnchorKey) store.selectAnimationMaskCell(drag.lastSelectionTarget, 'range')
      } else {
        const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
        if (!active?.selectedAnimationCellKeys.includes(drag.sourceAnchorKey)) store.selectAnimationCell(drag.sourceAnchorKey, 'replace')
        if (drag.lastSelectionTarget !== drag.sourceAnchorKey) store.selectAnimationCell(drag.lastSelectionTarget, 'range')
      }
    } else if (!drag.preserveSelection) {
      if (drag.kind === 'frame') selectAnimationFrame(drag.sourceFrameId)
      else if (drag.kind === 'mask') store.selectAnimationMaskCell(drag.sourceAnchorKey, drag.selectionMode ?? 'replace')
      else if (drag.kind === 'cel') store.selectAnimationCell(drag.sourceAnchorKey, drag.selectionMode ?? 'replace')
    }
    // A selection made during playback is only an interaction aid. Keep it
    // visible while the pointer is held, then return the timeline to the
    // playback-only activity state on release. Existing selections from
    // before playback are left untouched until the user starts a new gesture.
    const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (liveSession?.animationPlaying) {
      // Clear the local presentation in the same pointer-up turn as the
      // Store selection. Waiting for the selection-sync effect leaves the
      // released cell/frame highlight visible for one render.
      setSelectionOutlineVisible(false)
      setAnimationCellSelectionOutlineVisible(false)
      store.clearAnimationSelection()
      setSelectedAnimationGroupCellKeys([])
    }
    animationPointerDragRef.current = null
    animationFrameDropTargetRef.current = null
    animationCelDropTargetKeyRef.current = null
    setAnimationCelDragAnchorKey(null)
    setAnimationFrameDropTarget(null)
    setAnimationCelDropTargetKey(null)
    setDraggingAnimationFrameIds([])
    setDraggingAnimationCellKeys([])
    setDraggingAnimationCellKind(null)
    setAnimationGestureSelection(null)
    setAnimationGestureActiveTarget(null)
  }
  moveAnimationPointerDragRef.current = moveAnimationPointerDrag
  finishAnimationPointerDragRef.current = finishAnimationPointerDrag
  const clearTransientLayerDrag = (): void => {
    if (layerDragFrameRef.current !== null) window.cancelAnimationFrame(layerDragFrameRef.current)
    layerDragFrameRef.current = null
    pendingLayerDragRef.current = null
    dragRef.current = null
    setDraggingIds([])
    setDraggingGroupId(null)
    setDraggingCopy(false)
    dropTargetRef.current = null
    setDropTarget(null)
    setDragGhost(null)
  }
  const layerToggleHistoryLabel = (control: 'visibility' | 'lock'): string => t(control === 'visibility' ? 'workspace.history.showLayer' : 'workspace.history.layerProperties')
  const layerToggleTargetKey = (target: LayerPanelToggleTarget): string => `${target.control}:${target.ownerKind}:${target.id}:${'frameId' in target ? target.frameId : ''}`
  const layerPanelToggleValue = (target: LayerPanelToggleTarget): boolean | null => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return null
    if (target.ownerKind === 'layer') return active.document.layers.find((candidate) => candidate.id === target.id)?.[target.control === 'visibility' ? 'visible' : 'locked'] ?? null
    if (target.ownerKind === 'group') return active.document.groups.find((candidate) => candidate.id === target.id)?.[target.control === 'visibility' ? 'visible' : 'locked'] ?? null
    const timeline = ensureAnimationDocument(active.document)
    if (target.ownerKind === 'layer-mask') {
      const cel = timeline.cels.find((candidate) => candidate.id === target.id)
      return cel ? animationMaskAt(timeline, cel.layerId, cel.frameId)?.visible ?? null : null
    }
    return animationGroupMaskAt(timeline, target.id, target.frameId)?.visible ?? null
  }
  const applyLayerPanelToggle = (target: LayerPanelToggleTarget, value: boolean): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return
    if (target.ownerKind === 'layer') {
      const layer = active.document.layers.find((candidate) => candidate.id === target.id)
      if (!layer) return
      if (target.control === 'visibility') {
        if (layer.visible !== value) store.toggleLayerVisibility(layer.id)
        return
      }
      if (getLayerLockingGroup(active.document, layer) || layer.locked === value) return
      store.setLayerPropertiesWithBlend(layer.id, layer.name, layer.opacity, layer.blendMode, value, layer.displayColor, layer.description)
      return
    }
    if (target.ownerKind === 'group') {
      const group = active.document.groups.find((candidate) => candidate.id === target.id)
      if (!group) return
      if (target.control === 'visibility') {
        if (group.visible !== value) store.toggleGroupVisibility(group.id)
        return
      }
      if (getGroupLockingAncestor(active.document, group) || group.locked === value) return
      store.setGroupProperties(group.id, group.name, group.opacity, group.blendMode, value, group.displayColor, group.description, group.cumulativeBlend)
      return
    }
    const timeline = ensureAnimationDocument(active.document)
    if (target.ownerKind === 'layer-mask') {
      const cel = timeline.cels.find((candidate) => candidate.id === target.id)
      const mask = cel ? animationMaskAt(timeline, cel.layerId, cel.frameId) : null
      if (cel && mask && mask.visible !== value) store.toggleLayerMaskVisibility(cel.id)
      return
    }
    const mask = animationGroupMaskAt(timeline, target.id, target.frameId)
    if (mask && mask.visible !== value) store.toggleGroupMaskVisibility(target.id, target.frameId)
  }
  const sameHierarchyToggleTargets = (target: Extract<LayerPanelToggleTarget, { ownerKind: 'layer' | 'group' }>): LayerPanelToggleTarget[] => {
    const document = session.document
    const parentGroupId = target.ownerKind === 'layer'
      ? document.layers.find((layer) => layer.id === target.id)?.groupId ?? null
      : document.groups.find((group) => group.id === target.id)?.parentGroupId ?? null
    const sameParent = (candidate: string | null | undefined): boolean => (candidate ?? null) === parentGroupId
    return [
      ...document.groups.filter((group) => sameParent(group.parentGroupId)).map((group) => ({ control: target.control, ownerKind: 'group' as const, id: group.id })),
      ...document.layers.filter((layer) => sameParent(layer.groupId)).map((layer) => ({ control: target.control, ownerKind: 'layer' as const, id: layer.id }))
    ] as LayerPanelToggleTarget[]
  }
  const visibleLayerPanelToggleTargets = (control: 'visibility' | 'lock'): LayerPanelToggleTarget[] => displayRows.flatMap((row): LayerPanelToggleTarget[] => {
    if (row.kind === 'node') {
      return row.node.kind === 'layer'
        ? [{ control, ownerKind: 'layer', id: row.node.layer.id } as LayerPanelToggleTarget]
        : [{ control, ownerKind: 'group', id: row.node.group.id } as LayerPanelToggleTarget]
    }
    if (control === 'lock') return []
    if (row.ownerKind === 'layer') {
      const cel = celLookup.at(row.owner.id, timeline.activeFrameId)
      return cel && animationMaskAt(timeline, row.owner.id, timeline.activeFrameId)
        ? [{ control: 'visibility' as const, ownerKind: 'layer-mask' as const, id: cel.id }]
        : []
    }
    return animationGroupMaskAt(timeline, row.owner.id, timeline.activeFrameId)
      ? [{ control: 'visibility' as const, ownerKind: 'group-mask' as const, id: row.owner.id, frameId: timeline.activeFrameId }]
      : []
  })
  const layerToggleGesture = useLayerRowToggleGesture<LayerPanelToggleTarget>({
    targetKey: layerToggleTargetKey,
    readValue: layerPanelToggleValue,
    applyValue: applyLayerPanelToggle,
    visibleTargets: visibleLayerPanelToggleTargets,
    altTargets: (target) => target.ownerKind === 'layer' || target.ownerKind === 'group' ? sameHierarchyToggleTargets(target) : null,
    beginTransaction: () => store.beginLayerPanelTransaction(session.document.id),
    commitTransaction: (control) => store.commitLayerPanelTransaction(session.document.id, layerToggleHistoryLabel(control)),
    blocked: (message) => store.setMessage(message)
  })
  const beginLayerPanelToggle = layerToggleGesture.begin
  const continueLayerPanelToggle = layerToggleGesture.enter
  const endLayerPanelToggle = layerToggleGesture.end
  const finishLayerPanelToggleClick = layerToggleGesture.click
  const finishLayerPanelToggle = layerToggleGesture.finish
  useEffect(() => {
    document.body.classList.toggle('animation-item-dragging', animationItemDragging)
    return () => { document.body.classList.remove('animation-item-dragging') }
  }, [animationItemDragging])
  useEffect(() => () => { document.body.classList.remove('layer-column-resizing') }, [])
  useEffect(() => {
    const clearOutsideSelection = (event: PointerEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      const list = layerListRef.current
      if (!target || !list?.contains(target)) return
      if (target.closest('.layer-animation-toolbar, .layer-animation-edit, .panel-actions, .layer-style-indicator, .layer-status-icon-tooltip, .layer-visibility, .layer-lock-toggle, .group-folder, .layer-tilemap-indicator, .layer-instance-properties')) return
      if (target?.closest('[data-animation-frame-id], [data-animation-cel-key], [data-animation-mask-cel-key], [data-preserve-animation-selection], .animation-context-menu, .frame-properties-modal, .cel-properties-modal')) return
      if (target.closest('[data-layer-id], [data-group-id], [data-layer-mask-row-owner]')) return
      const canvasTarget = target?.closest('.stage-canvas, .stage-surface')
      // Canvas interactions (drawing, panning, zooming, and selection edits)
      // keep the current frame/cel context. Only another timeline item changes
      // the active animation selection.
      if (canvasTarget) return
      if (active && (active.selectedAnimationFrameIds.length > 0 || active.selectedAnimationCellKeys.length > 0 || active.selectedAnimationMaskCellKeys.length > 0 || active.selectedLayerIds.length > 0 || active.selectedGroupIds.length > 0 || active.selectedGroupId !== null)) {
        suppressSelectionOutlineOnNextSignatureRef.current = true
        setAnimationGestureSelection(null)
        setAnimationGestureActiveTarget(null)
        setSelectionOutlineVisible(false)
        setAnimationCellSelectionOutlineVisible(false)
        clearSelectionFromBlankRef.current()
      }
    }
    window.addEventListener('pointerdown', clearOutsideSelection, true)
    return () => window.removeEventListener('pointerdown', clearOutsideSelection, true)
  }, [session.document.id, shortcuts, store])
  useEffect(() => {
    const closeMenus = (): void => { setContextMenu(null); setLayerCreateMenu(null); setAnimationMenu(null); setAnimationFrameDropTarget(null) }
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      closeMenus()
      setFrameProperties(null)
      setCelProperties(null)
    }
    window.addEventListener('pointerdown', closeMenus)
    window.addEventListener('resize', closeMenus)
    window.addEventListener('keydown', keyDown)
    return () => { window.removeEventListener('pointerdown', closeMenus); window.removeEventListener('resize', closeMenus); window.removeEventListener('keydown', keyDown) }
  }, [])
  useEffect(() => {
    const refreshPresets = (): void => setLayerDisplayColorPresets(loadEditorPreferences().layerDisplayColorPresets)
    window.addEventListener('moonsprite:preferences-changed', refreshPresets)
    return () => window.removeEventListener('moonsprite:preferences-changed', refreshPresets)
  }, [])
  useEffect(() => {
    const refreshShortcuts = (): void => setShortcuts(loadShortcutBindings())
    window.addEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
    return () => window.removeEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
  }, [])
  useEffect(() => {
    const handleShortcutCommand = (event: Event): void => {
      const detail = (event as CustomEvent<EditorShortcutCommandDetail>).detail
      if (!detail || detail.documentId !== session.document.id) return
      shortcutCommandHandlerRef.current(detail.id)
    }
    window.addEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
    return () => window.removeEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
  }, [session.document.id])
  useEffect(() => {
    const syncAltCopy = (active: boolean): void => {
      if (altCopyReadyRef.current === active) return
      altCopyReadyRef.current = active
      setAltCopyReady(active)
    }
    const keyDown = (event: KeyboardEvent): void => { if (event.key === 'Alt') syncAltCopy(true) }
    const keyUp = (event: KeyboardEvent): void => { if (event.key === 'Alt') syncAltCopy(false) }
    const pointerMove = (event: PointerEvent): void => { syncAltCopy(event.altKey) }
    const blur = (): void => {
      syncAltCopy(false)
      finishLayerPanelToggle()
      clearTransientLayerDrag()
    }
    altCopyReadyRef.current = false
    setAltCopyReady(false)
    clearTransientLayerDrag()
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('pointermove', pointerMove); window.removeEventListener('blur', blur); finishLayerPanelToggle() }
  }, [])
  useEffect(() => {
    const close = (event: Event): void => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target
      if (!target || target === 'layers') {
        closeProperties()
         setFrameProperties(null)
         setCelProperties(null)
        setLayerSettingsOpen(false)
        setAnimationMenu(null)
        setBackgroundLayerDialogOpen(false)
        setTilemapLayerDialog(null)
        setFreeTileLayerDialogOpen(false)
      }
    }
    window.addEventListener('moonsprite:close-dialog', close)
    return () => window.removeEventListener('moonsprite:close-dialog', close)
  })
  const layerById = new Map(session.document.layers.map((layer) => [layer.id, layer]))
  const groupById = new Map(session.document.groups.map((group) => [group.id, group]))
  const freeTileSetOptions = [...session.document.layers.reduce((sets, layer) => {
    if (layer.kind !== 'free-tile' || !layer.freeTileSetId || sets.has(layer.freeTileSetId)) return sets
    sets.set(layer.freeTileSetId, { id: layer.freeTileSetId, name: layer.name, sourceCount: layer.freeTileSources?.length ?? 0 })
    return sets
  }, new Map<string, { id: string; name: string; sourceCount: number }>()).values()]
  const displayColorStripeSegments = (target: RasterLayer | LayerGroup, kind: 'layer' | 'group', depth: number): Array<{ color: RgbaColor; left: number; width: number }> => {
    let groupId = kind === 'group' ? target.id : (target as RasterLayer).groupId ?? null
    const visited = new Set<string>()
    const ancestry: LayerGroup[] = []
    while (groupId && !visited.has(groupId)) {
      visited.add(groupId)
      const group = groupById.get(groupId)
      if (!group) break
      ancestry.push(group)
      groupId = group.parentGroupId ?? null
    }
    const groups = ancestry.slice().reverse()
    const ownColor = target.displayColor
    const colorsByLevel: Array<RgbaColor | undefined> = []
    if (groups.every((group) => !group.displayColor) && !ownColor) return []
    if (groups.every((group) => !group.displayColor)) {
      colorsByLevel.push(...Array.from({ length: depth + 1 }, () => ownColor))
    } else {
      let currentColor: RgbaColor | undefined
      for (let level = 0; level <= depth; level += 1) {
        const groupColor = groups[level]?.displayColor
        if (groupColor) currentColor = groupColor
        if (level === depth && ownColor) currentColor = ownColor
        colorsByLevel.push(currentColor)
      }
    }
    return colorsByLevel.flatMap((color, level) => color ? [{ color, left: level === 0 ? 0 : 4 + (level - 1) * 14, width: level === 0 ? 4 : 14 }] : [])
  }
  const nodes = buildLayerPanelTree({
    layers: session.document.layers,
    groups: session.document.groups,
    collapsedGroupIds: session.collapsedGroupIds
  }).map((node): LayerTreeNode | null => {
    if (node.kind === 'layer') {
      const layer = layerById.get(node.id)
      return layer ? { ...node, layer } : null
    }
    const group = groupById.get(node.id)
    return group ? { ...node, group } : null
  }).filter((node): node is LayerTreeNode => node !== null)
  const maskOwnerFrameKey = (ownerKind: 'layer' | 'group', ownerId: string, frameId: string): string => `${ownerKind}:${ownerId}:${frameId}`
  const maskSnapshotEntries = [
    ...(timeline.layerMasks ?? []).map((entry) => ({ ownerKind: 'layer' as const, ownerId: entry.layerId, frameId: entry.frameId, mask: entry.mask, linkSourceId: entry.mask.linkedMaskId ?? null })),
    ...(timeline.groupMasks ?? []).map((entry) => ({ ownerKind: 'group' as const, ownerId: entry.groupId, frameId: entry.frameId, mask: entry.mask, linkSourceId: entry.mask.linkedMaskId ?? null }))
  ]
  // A formal layer/group row selection owns the panel focus. Treat any mask
  // data left from the previous render as stale until that selection settles.
  // Mask-row and mask-cell selections clear these row-selection fields, so
  // they continue to own the visual context below.
  const toTimelineCellRef = (key: string, kind: 'cel' | 'mask'): TimelineCellRef | null => {
    const parsed = parseAnimationCelKey(key)
    if (!parsed) return null
    const ownerKind = session.document.layers.some((layer) => layer.id === parsed.layerId) ? 'layer'
      : session.document.groups.some((group) => group.id === parsed.layerId) ? 'group' : null
    return ownerKind ? { kind, ownerKind, ownerId: parsed.layerId, frameId: parsed.frameId } : null
  }
  const toTimelineMaskRowRef = (key: string): TimelineRowRef | null => {
    const separator = key.indexOf(':')
    if (separator <= 0) return null
    const ownerKind = key.slice(0, separator)
    const ownerId = key.slice(separator + 1)
    if (ownerKind === 'layer' && session.document.layers.some((layer) => layer.id === ownerId)) return { kind: 'mask', ownerKind, ownerId }
    if (ownerKind === 'group' && session.document.groups.some((group) => group.id === ownerId)) return { kind: 'mask', ownerKind, ownerId }
    return null
  }
  const focusState = resolveTimelineFocusState({
    activeLayerId: session.document.activeLayerId,
    activeFrameId: timeline.activeFrameId,
    activeMaskId: session.activeLayerMaskId,
    // A transient cel/mask gesture owns timeline focus immediately, even when
    // the previous layer selection is still mirrored in the session.
    layerSelectionExplicit: session.layerSelectionExplicit === true
      && animationGestureSelection?.kind !== 'cel'
      && animationGestureSelection?.kind !== 'mask',
    selectedLayerIds: session.selectedLayerIds,
    selectedGroupIds: session.selectedGroupIds,
    selectedGroupId: session.selectedGroupId,
    selectedFrameIds: session.selectedAnimationFrameIds,
    selectedCellRefs: [
      ...session.selectedAnimationCellKeys,
      ...(animationGestureSelection?.kind === 'cel' ? animationGestureSelection.keys : []),
    ].flatMap((key) => { const ref = toTimelineCellRef(key, 'cel'); return ref ? [ref] : [] }),
    selectedMaskCellRefs: [
      ...session.selectedAnimationMaskCellKeys,
      ...(animationGestureSelection?.kind === 'mask' ? animationGestureSelection.keys : []),
    ].flatMap((key) => { const ref = toTimelineCellRef(key, 'mask'); return ref ? [ref] : [] }),
    selectedMaskRowRefs: session.selectedAnimationMaskRowKeys.flatMap((key) => { const ref = toTimelineMaskRowRef(key); return ref ? [ref] : [] })
  })
  const explicitLayerFocus = focusState.explicitLayerFocus
  const normalLayerSelectionActive = explicitLayerFocus
  const activeMaskCanonicalId = session.activeLayerMaskId
  const activeMaskEntry = activeMaskCanonicalId
    ? (() => {
        const currentFrame = timeline.activeFrameId
        const selectedCurrent = session.selectedAnimationMaskCellKeys
          .map((key) => parseAnimationCelKey(key))
          .find((target) => target?.frameId === currentFrame)
        const matches = (entry: (typeof maskSnapshotEntries)[number]): boolean => entry.mask.id === activeMaskCanonicalId || resolveAnimationMask(timeline, entry.mask)?.id === activeMaskCanonicalId
        return (selectedCurrent
          ? maskSnapshotEntries.find((entry) => entry.ownerId === selectedCurrent.layerId && entry.frameId === selectedCurrent.frameId && matches(entry))
          : undefined)
          ?? maskSnapshotEntries.find(matches)
          ?? null
      })()
    : null
  const selectedMaskCellOwnerKey = session.selectedAnimationMaskCellKeys.at(-1)
    ? (() => {
        const target = parseAnimationCelKey(session.selectedAnimationMaskCellKeys.at(-1)!)
        if (!target) return null
        if (session.document.layers.some((layer) => layer.id === target.layerId)) return `layer:${target.layerId}`
        if (session.document.groups.some((group) => group.id === target.layerId)) return `group:${target.layerId}`
        return null
      })()
    : null
  const selectedMaskRowOwnerKey = session.selectedAnimationMaskRowKeys.at(-1) ?? null
  // Mask activity is an independent editing context. Do not let a stale
  // ordinary-layer selection hide it during frame changes or playback.
  const maskContextActive = focusState.maskFocus
    || activeMaskCanonicalId !== null
    || session.selectedAnimationMaskCellKeys.length > 0
    || session.selectedAnimationMaskRowKeys.length > 0
  const activeMaskOwnerKey = maskContextActive
    ? focusState.owner?.kind === 'mask'
      ? `${focusState.owner.ownerKind}:${focusState.owner.ownerId}`
        : activeMaskEntry
          ? `${activeMaskEntry.ownerKind}:${activeMaskEntry.ownerId}`
        : selectedMaskRowOwnerKey ?? selectedMaskCellOwnerKey
    : null
  const maskVisualByOwnerFrame = new Map(maskSnapshotEntries.map((entry) => [maskOwnerFrameKey(entry.ownerKind, entry.ownerId, entry.frameId), entry.mask]))
  const animationMaskLayerIds = new Set(maskSnapshotEntries.filter((entry) => entry.ownerKind === 'layer').map((entry) => entry.ownerId))
  const animationMaskGroupIds = new Set(maskSnapshotEntries.filter((entry) => entry.ownerKind === 'group').map((entry) => entry.ownerId))
  const displayRows: LayerDisplayRow[] = nodes.flatMap((node): LayerDisplayRow[] => {
    const hasMask = node.kind === 'layer'
      ? animationMaskLayerIds.has(node.layer.id)
      : animationMaskGroupIds.has(node.group.id)
    if (!hasMask) return [{ kind: 'node', node }]
    const owner = node.kind === 'layer' ? node.layer : node.group
    return [{ kind: 'mask', ownerKind: node.kind, owner, depth: node.depth }, { kind: 'node', node }]
  })
  // Keep timeline semantics in the pure core derivation. JSX below only maps
  // the resulting row/frame/cel states to visual classes and data attributes.
  const visualRows: TimelineVisualRow[] = displayRows.map((displayRow) => displayRow.kind === 'mask'
    ? { id: `mask:${displayRow.ownerKind}:${displayRow.owner.id}`, ownerId: displayRow.owner.id, ownerKind: displayRow.ownerKind, kind: 'mask' }
    : displayRow.node.kind === 'group'
      ? { id: displayRow.node.id, ownerId: displayRow.node.id, ownerKind: 'group', kind: 'group' }
      : { id: displayRow.node.id, ownerId: displayRow.node.layer.id, ownerKind: 'layer', kind: 'layer' })
  const maskRows = new Set(displayRows.filter((displayRow): displayRow is Extract<LayerDisplayRow, { kind: 'mask' }> => displayRow.kind === 'mask').map((displayRow) => maskOwnerFrameKey(displayRow.ownerKind, displayRow.owner.id, '')))
  const rawMaskVisualEntries = maskSnapshotEntries.filter((entry) => maskRows.has(maskOwnerFrameKey(entry.ownerKind, entry.ownerId, '')))
  const maskVisualIdByMaskId = new Map<string, string>()
  for (const entry of rawMaskVisualEntries) if (!maskVisualIdByMaskId.has(entry.mask.id)) maskVisualIdByMaskId.set(entry.mask.id, `mask-slot:${entry.ownerKind}:${entry.ownerId}:${entry.frameId}`)
  const visualCells: TimelineVisualCell[] = [
    ...timeline.cels.map((cel) => ({
      id: cel.id,
      key: animationCelKey(cel.layerId, cel.frameId),
      ownerId: cel.layerId,
      ownerKind: 'layer' as const,
      frameId: cel.frameId,
      kind: 'cel' as const,
      linkSourceId: cel.linkedCelId ?? null
    })),
    ...rawMaskVisualEntries.map((entry) => ({
      id: `mask-slot:${entry.ownerKind}:${entry.ownerId}:${entry.frameId}`,
      key: animationCelKey(entry.ownerId, entry.frameId),
      ownerId: entry.ownerId,
      ownerKind: entry.ownerKind,
      frameId: entry.frameId,
      kind: 'mask' as const,
      linkSourceId: entry.linkSourceId ? maskVisualIdByMaskId.get(entry.linkSourceId) ?? null : null
    }))
  ]
  const visualSelectedFrameIds = animationGestureSelection
    ? animationGestureSelection.kind === 'frame' ? animationGestureSelection.ids : []
    : session.selectedAnimationFrameIds
  const visualSelectedFrameIdSet = new Set(visualSelectedFrameIds)
  const visualSelectedCellKeys = animationGestureSelection
    ? animationGestureSelection.kind === 'cel' ? animationGestureSelection.keys : []
    : session.selectedAnimationCellKeys
  const visualSelectedMaskCellKeys = animationGestureSelection
    ? animationGestureSelection.kind === 'mask' ? animationGestureSelection.keys : []
    : session.selectedAnimationMaskCellKeys
  // Store selection keeps descendant layer ids mirrored for whole-group
  // commands.  Those implicit members must not leak into timeline visuals.
  const effectiveSelectedGroupIds = session.selectedGroupIds.length > 0
    ? [...new Set(session.selectedGroupIds)]
    : session.selectedGroupId ? [session.selectedGroupId] : []
  const contextGroupId = session.document.groups.some((group) => group.id === session.layerSelectionAnchorId)
    ? session.layerSelectionAnchorId
    : null
  const visualContextGroupIds = effectiveSelectedGroupIds.length > 0
    ? effectiveSelectedGroupIds
    : contextGroupId ? [contextGroupId] : []
  // A group selection remains the sole layer/timeline owner even while the
  // active frame or frame-column selection changes.  selectedLayerIds mirrors
  // the group's descendants for document commands, but those implicit members
  // must never become visual active/selected cels in the timeline.
  const groupVisualSelectionActive = effectiveSelectedGroupIds.length > 0 || contextGroupId !== null
  const hasNonRowAnimationItemSelection = Boolean(animationGestureSelection)
    || session.selectedAnimationFrameIds.length > 0
    || session.selectedAnimationCellKeys.length > 0
    || session.selectedAnimationMaskCellKeys.length > 0
  // A pending ordinary-cel gesture is already a single-cell interaction,
  // even before pointer-up commits it to the Store. Do not keep painting the
  // previous multi-layer selection underneath the cell being pressed.
  const visualSelectedLayerIds = groupVisualSelectionActive || animationGestureSelection?.kind === 'cel'
    ? []
    : session.selectedLayerIds
  const gestureActiveFrameId = animationGestureActiveTarget?.frameId ?? null
  const gestureActiveLayerId = animationGestureActiveTarget?.kind === 'cel'
    ? animationGestureActiveTarget.layerId
    : animationGestureActiveTarget?.kind === 'mask' && session.document.layers.some((layer) => layer.id === animationGestureActiveTarget.layerId)
      ? animationGestureActiveTarget.layerId
      : null
  const visualActiveFrameId = gestureActiveFrameId ?? timeline.activeFrameId
  // A selected group owns the timeline focus. Its descendant activeLayerId is
  // an internal document cursor only and must not light a child current-cel.
  // A transient ordinary/group gesture owns the preview immediately; stale
  // formal mask context must not suppress its active/current visuals.
  const gestureOverridesMaskContext = animationGestureSelection?.kind === 'cel'
    || (animationGestureActiveTarget?.kind === 'cel' && session.document.groups.some((group) => group.id === animationGestureActiveTarget.layerId))
  const maskVisualSelectionActive = (maskContextActive || animationGestureSelection?.kind === 'mask') && !gestureOverridesMaskContext
  const retainedNormalLayerFrameScope = focusState.frameFocus
    && session.selectedLayerIds.includes(session.document.activeLayerId)
    && session.document.layers.some((layer) => layer.id === session.document.activeLayerId)
  const normalLayerFrameScopeActive = !maskVisualSelectionActive
    && (focusState.explicitLayerFocus || retainedNormalLayerFrameScope)
  // Frame focus suppresses only single-cel current markers; the document's
  // active layer row remains the ambient activity context beneath the column
  // selection.
  const visualActiveLayerId = groupVisualSelectionActive || maskVisualSelectionActive
    ? null
    : gestureActiveLayerId ?? session.document.activeLayerId
  // Playback still paints the current ordinary cel even when a mask row is
  // retained as the user's selection context. This is a playback indicator,
  // not a change to the editing focus.
  const playbackActiveLayerId = session.animationPlaying
    && session.document.layers.some((layer) => layer.id === session.document.activeLayerId)
    ? session.document.activeLayerId
    : visualActiveLayerId
  const visualActiveFrameIndex = timeline.frames.findIndex((frame) => frame.id === visualActiveFrameId)

  // Blank clicks clear an explicit selection, but a mask selection has a
  // separate row/cell context that must survive that gesture. Promote the
  // current mask owner to a single current-frame cell instead of falling
  // back to the implicit document.activeLayerId.
  const preserveMaskContextFromBlank = useCallback((): boolean => {
    if (!maskVisualSelectionActive || !activeMaskOwnerKey) return false
    const separator = activeMaskOwnerKey.indexOf(':')
    if (separator <= 0) return false
    const ownerKind = activeMaskOwnerKey.slice(0, separator)
    const ownerId = activeMaskOwnerKey.slice(separator + 1)
    if (ownerKind !== 'layer' && ownerKind !== 'group' || ownerId.length === 0) return false
    const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const liveTimeline = liveSession?.document.animation ?? timeline
    const currentFrameId = liveTimeline.activeFrameId
    const key = liveSession?.selectedAnimationMaskCellKeys.find((candidate) => {
      const parsed = parseAnimationCelKey(candidate)
      return parsed?.layerId === ownerId && parsed.frameId === currentFrameId
    }) ?? animationCelKey(ownerId, currentFrameId)
    const parsed = parseAnimationCelKey(key)
    if (!parsed || !animationMaskAt(liveTimeline, parsed.layerId, parsed.frameId)) return false
    store.selectAnimationMaskCell(key, 'replace')
    return true
  }, [activeMaskOwnerKey, maskVisualSelectionActive, session.document.id, store, timeline])
  const clearSelectionFromBlank = useCallback((): void => {
    if (preserveMaskContextFromBlank()) return
    store.clearLayerSelection()
    store.clearAnimationSelection()
  }, [preserveMaskContextFromBlank, store])
  clearSelectionFromBlankRef.current = clearSelectionFromBlank
  const updateAnimationFrameDisabled = useCallback((disabled: boolean | 'toggle'): void => {
    if (disabled === 'toggle') store.toggleSelectedAnimationFramesDisabled()
    else store.setSelectedAnimationFramesDisabled(disabled)
    // Match the user's explicit blank-area refresh gesture after changing
    // playback metadata, so stale active/selected cell visuals are cleared in
    // the same state boundary as a normal timeline blank click.
    clearSelectionFromBlank()
  }, [clearSelectionFromBlank, store])
  const canonicalTimelineIndex = createAnimationTimelineVisualIndex(timeline.frames.map((frame) => ({ id: frame.id })), visualCells)
  const derivedTimelineVisualState = deriveAnimationTimelineVisualState({
    rows: visualRows,
    frames: timeline.frames.map((frame) => ({ id: frame.id })),
    cells: visualCells,
    canonicalIndex: canonicalTimelineIndex,
    selection: {
      activeLayerId: visualActiveLayerId,
      activeFrameId: visualActiveFrameId,
      selectedLayerIds: visualSelectedLayerIds,
      selectedGroupIds: visualContextGroupIds,
      selectedFrameIds: visualSelectedFrameIds,
      selectedCellKeys: visualSelectedCellKeys,
      selectedMaskCellKeys: visualSelectedMaskCellKeys,
      animationCellSelectionExplicit: session.animationCellSelectionExplicit
    },
    // Focus is resolved once from the session contract above.  Passing the
    // resolved row lets the pure derivation keep mask rows/cells current even
    // when visualActiveLayerId is intentionally null in mask mode.
    active: {
      row: focusState.owner,
      frameId: visualActiveFrameId,
      maskEditTargetId: session.activeLayerMaskId,
    },
    presentation: { presentationHidden: !selectionOutlineVisible, playing: session.animationPlaying }
  })
  const timelineVisualState = {
    ...derivedTimelineVisualState,
    rows: derivedTimelineVisualState.rows.map((state) => ({
      ...state,
      active: state.row.ownerKind === 'group'
        ? state.selected
        : groupVisualSelectionActive && state.row.ownerKind === 'layer'
          ? false
          : state.active,
      selectedByCell: groupVisualSelectionActive && state.row.ownerKind === 'layer'
        ? false
        : state.selectedByCell
    }))
  }
  const visualRowStateByKey = new Map(timelineVisualState.rows.map((state) => [
    state.row.kind === 'mask'
      ? timelineRowKey({ kind: 'mask', ownerKind: state.row.ownerKind, ownerId: state.row.ownerId })
      : state.row.kind === 'group'
        ? timelineRowKey({ kind: 'group', ownerKind: 'group', ownerId: state.row.ownerId })
        : timelineRowKey({ kind: 'layer', ownerKind: 'layer', ownerId: state.row.ownerId }),
    state
  ]))
  const visualCellStateBySlot = new Map(timelineVisualState.cells.map((state) => [timelineCellSlotKey({ kind: state.kind, ownerKind: state.ownerKind, ownerId: state.ownerId, frameId: state.frameId }), state]))
  const visualFrameStateById = new Map(timelineVisualState.frames.map((state) => [state.frame.id, state]))
  const displayRowGridTemplate = ['var(--animation-header-height)', ...displayRows.map(() => 'var(--layer-row-height)')].join(' ')
  const displayRowTop = (rowIndex: number): string => `calc(var(--animation-header-height) + ${Math.max(0, rowIndex)} * var(--layer-row-height))`
  const displayRowSpanHeight = (_start: number, span: number): string => `calc(${Math.max(0, span)} * var(--layer-row-height))`
  const renderedFrameIds = animationGestureSelection
    ? animationGestureSelection.kind === 'frame' ? animationGestureSelection.ids : []
    : session.selectedAnimationFrameIds
  const renderedCellKeys = animationGestureSelection
    ? animationGestureSelection.kind === 'cel' ? animationGestureSelection.keys : []
    : session.selectedAnimationCellKeys
  const selectedMaskCellKeys = animationGestureSelection
    ? animationGestureSelection.kind === 'mask' ? animationGestureSelection.keys : []
    : session.selectedAnimationMaskCellKeys
  const renderedFrameIdSet = new Set(renderedFrameIds)
  const isolatedMaskCellKey = session.layerMaskIsolatedView && session.activeLayerMaskId
    ? displayRows.flatMap((displayRow) => {
        if (displayRow.kind !== 'mask') return []
        const mask = maskVisualByOwnerFrame.get(maskOwnerFrameKey(displayRow.ownerKind, displayRow.owner.id, visualActiveFrameId)) ?? null
        return mask?.id === session.activeLayerMaskId ? [animationCelKey(displayRow.owner.id, visualActiveFrameId)] : []
      })[0] ?? null
    : null
  // A stale mask focus can survive the first render of a normal-cel gesture.
  // The current gesture owns the visual selection mode, so never render the
  // mask slot together with an ordinary cel selection.
  const maskSelectionIsActive = animationGestureSelection?.kind === 'mask'
    || (!animationGestureSelection
      && renderedCellKeys.length === 0
      && (selectedMaskCellKeys.length > 0 || session.activeLayerMaskId !== null || session.layerMaskIsolatedView))
  const renderedMaskCellKeys = maskSelectionIsActive
    ? [...new Set([...selectedMaskCellKeys, ...(isolatedMaskCellKey ? [isolatedMaskCellKey] : [])])]
    : []
  const renderedCellKeySet = new Set(renderedCellKeys)
  const renderedMaskCellKeySet = new Set(renderedMaskCellKeys)
  const visualSelectedMaskCellKeySet = new Set(visualSelectedMaskCellKeys)
  // Derive activity from selected cel coordinates without changing the
  // explicit selection mode stored in the session.
  const ordinaryCellTargets = [...renderedCellKeys, ...selectedAnimationGroupCellKeys]
    .map((key) => parseAnimationCelKey(key))
    .filter((target): target is { layerId: string; frameId: string } => Boolean(target))
  const maskCellTargets = renderedMaskCellKeys
    .map((key) => parseAnimationCelKey(key))
    .filter((target): target is { layerId: string; frameId: string } => Boolean(target))
  const selectedCellTargets = [...ordinaryCellTargets, ...maskCellTargets]
  // Mask-only selections must not project a column guide onto ordinary layer
  // rows. Keep the aggregate set used by ordinary-cell rendering scoped to
  // ordinary cel targets; mask cells render their own owner-gated activity.
  const selectedCellFrameIds = new Set(ordinaryCellTargets.map((target) => target.frameId))
  const selectedMaskCellFrameIds = new Set(maskCellTargets.map((target) => target.frameId))
  const selectedActivityFrameIds = new Set([...selectedCellFrameIds, ...selectedMaskCellFrameIds])
  const selectedCellLayerIds = new Set(ordinaryCellTargets.map((target) => target.layerId))
  const cellSelectionActive = selectionOutlineVisible && selectedCellTargets.length > 0
  const ordinaryCelSelectionVisible = cellSelectionActive && renderedCellKeys.length > 0
    && (session.animationCellSelectionExplicit || animationGestureSelection?.kind === 'cel')
  const hasMultipleCellSelection = renderedCellKeys.length + renderedMaskCellKeys.length > 1
  const hasMultipleLayerSelection = session.selectedLayerIds.length > 1
  // Suppress the active-frame guide only while the multi-cel selection is
  // visibly shown. Hidden formal selections must still leave the normal
  // active frame/cel context visible.
  const suppressCellSelectionGuides = selectionOutlineVisible && hasMultipleCellSelection && !hasMultipleLayerSelection
  const layerSelectionActive = session.layerSelectionExplicit && selectionOutlineVisible && renderedFrameIds.length === 0 && renderedCellKeys.length === 0 && renderedMaskCellKeys.length === 0
  const showLayerSelectionAcrossTimeline = layerSelectionActive
  const selectedFrameIndexes = timeline.frames
    .map((frame, index) => renderedFrameIdSet.has(frame.id) ? index : -1)
    .filter((index) => index >= 0)
  const selectedCellFrameIndexes = timeline.frames
    .map((frame, index) => cellSelectionActive && selectedActivityFrameIds.has(frame.id) ? index : -1)
    .filter((index) => index >= 0)
  const selectedCellFrameRanges = selectedCellFrameIndexes.reduce<Array<{ start: number; span: number }>>((ranges, index) => {
    const previous = ranges.at(-1)
    if (previous && index === previous.start + previous.span) previous.span += 1
    else ranges.push({ start: index, span: 1 })
    return ranges
  }, [])
  const selectedCellLayerRows = displayRows.flatMap((displayRow, row) => {
    const ownerId = displayRow.kind === 'node' && displayRow.node.kind === 'layer' ? displayRow.node.layer.id : null
    return cellSelectionActive && ownerId && selectedCellLayerIds.has(ownerId) ? [row] : []
  })
  const timelineActiveFrameIndex = visualActiveFrameIndex
  // The playback playhead must follow activeFrameId just like the canvas.
  // Selection guides remain visible while playing.
  // The playhead column is a frame-wide activity guide.  It intentionally
  // spans ordinary and mask rows; owner-specific mask markers are gated below.
  const showActiveFrameColumn = timelineActiveFrameIndex >= 0
  const selectedFrameRanges = selectedFrameIndexes.reduce<Array<{ start: number; span: number }>>((ranges, index) => {
    const previous = ranges.at(-1)
    if (previous && index === previous.start + previous.span) previous.span += 1
    else ranges.push({ start: index, span: 1 })
    return ranges
  }, [])
  const activeCelPreviewKind = animationPointerDragRef.current?.kind === 'mask'
    ? 'mask'
    : animationPointerDragRef.current?.kind === 'cel' || animationPointerDragRef.current?.kind === 'group-cel'
      ? 'cel'
      : animationGestureSelection?.kind === 'mask'
        ? 'mask'
        : animationGestureSelection?.kind === 'cel' ? 'cel' : null
  const selectedCelPositions = displayRows.flatMap((displayRow, row) => {
    if (displayRow.kind === 'mask') {
      if (activeCelPreviewKind === 'cel') return []
      return timeline.frames.flatMap((frame, column) => {
        return renderedMaskCellKeySet.has(animationCelKey(displayRow.owner.id, frame.id)) ? [{ row, column }] : []
      })
    }
    if (activeCelPreviewKind === 'mask') return []
    if (displayRow.kind !== 'node') return []
    if (displayRow.node.kind === 'group') {
      // Group cells are interaction targets only; their selection is shown by
      // the group row/timeline background, not by an independent cel box.
      return []
    }
    const layerNode = displayRow.node as Extract<LayerTreeNode, { kind: 'layer' }>
    const layerId = layerNode.layer.id
    return timeline.frames.flatMap((frame, column) => renderedCellKeySet.has(animationCelKey(layerId, frame.id)) ? [{ row, column }] : [])
  })
  const selectedCelRow = selectedCelPositions.length > 0 ? Math.min(...selectedCelPositions.map((position) => position.row)) : -1
  const selectedCelColumn = selectedCelPositions.length > 0 ? Math.min(...selectedCelPositions.map((position) => position.column)) : -1
  const selectedCelRowSpan = selectedCelPositions.length > 0 ? Math.max(...selectedCelPositions.map((position) => position.row)) - selectedCelRow + 1 : 0
  const selectedCelColumnSpan = selectedCelPositions.length > 0 ? Math.max(...selectedCelPositions.map((position) => position.column)) - selectedCelColumn + 1 : 0
  const animationDisplayRowByLayerId = new Map<string, number>()
  const animationDisplayRowByMaskOwnerId = new Map<string, number>()
  displayRows.forEach((displayRow, row) => {
    if (displayRow.kind === 'node' && displayRow.node.kind === 'layer') animationDisplayRowByLayerId.set(displayRow.node.layer.id, row)
    if (displayRow.kind === 'mask') animationDisplayRowByMaskOwnerId.set(displayRow.owner.id, row)
  })
  const animationFrameIndexById = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
  const animationCelDragPreview = (() => {
    const drag = animationPointerDragRef.current
    const dragKind = drag?.kind
    const dragKeys = drag && (drag.kind === 'cel' || drag.kind === 'mask') ? drag.cellKeys : []
    if ((dragKind !== 'cel' && dragKind !== 'mask') || !animationCelDragAnchorKey || !animationCelDropTargetKey || dragKeys.length === 0) return null
    const anchor = parseAnimationCelKey(animationCelDragAnchorKey)
    const target = parseAnimationCelKey(animationCelDropTargetKey)
    if (!anchor || !target) return null
    const rowForDragKey = (key: { layerId: string }): number | undefined => dragKind === 'mask'
      ? animationDisplayRowByMaskOwnerId.get(key.layerId)
      : animationDisplayRowByLayerId.get(key.layerId)
    const anchorRow = rowForDragKey(anchor)
    const targetRow = rowForDragKey(target)
    const anchorColumn = animationFrameIndexById.get(anchor.frameId)
    const targetColumn = animationFrameIndexById.get(target.frameId)
    if (anchorRow === undefined || targetRow === undefined || anchorColumn === undefined || targetColumn === undefined) return null
    const sourcePositions = dragKeys.flatMap((key) => {
      const parsed = parseAnimationCelKey(key)
      if (!parsed) return []
      const row = rowForDragKey(parsed)
      const column = animationFrameIndexById.get(parsed.frameId)
      return row === undefined || column === undefined ? [] : [{ row, column }]
    })
    if (sourcePositions.length === 0) return null
    const sourceRow = Math.min(...sourcePositions.map((position) => position.row))
    const sourceColumn = Math.min(...sourcePositions.map((position) => position.column))
    return {
      row: sourceRow + targetRow - anchorRow,
      column: sourceColumn + targetColumn - anchorColumn,
      rowSpan: Math.max(...sourcePositions.map((position) => position.row)) - sourceRow + 1,
      columnSpan: Math.max(...sourcePositions.map((position) => position.column)) - sourceColumn + 1
    }
  })()
  const animationCelDragActive = animationCelDragPreview !== null
  const implicitLayerCellKeys = new Set(session.selectedLayerIds.map((layerId) => animationCelKey(layerId, visualActiveFrameId)))
  const onlyImplicitLayerCellSelection = animationGestureSelection === null
    && hasMultipleLayerSelection
    && renderedMaskCellKeys.length === 0
    && renderedCellKeys.length === implicitLayerCellKeys.size
    && renderedCellKeys.every((key) => implicitLayerCellKeys.has(key))
  const shouldShowAnimationCellSelectionOutline = selectionOutlineVisible && !onlyImplicitLayerCellSelection
    && (session.layerMaskIsolatedView || animationCellSelectionOutlineVisible || animationGestureSelection?.kind === 'cel' || animationGestureSelection?.kind === 'mask')
  const linkedCelGroups = displayRows.flatMap((displayRow, row) => {
    const owner = displayRow.kind === 'node' && displayRow.node.kind === 'layer'
      ? displayRow.node.layer
      : displayRow.kind === 'mask' ? displayRow.owner : null
    if (!owner) return []
    const bySource = new Map<string, number[]>()
    timeline.frames.forEach((frame, frameIndex) => {
      const slot = displayRow.kind === 'mask'
        ? canonicalTimelineIndex.maskByOwnerFrame.get(timelineCellSlotKey({ kind: 'mask', ownerKind: displayRow.ownerKind, ownerId: owner.id, frameId: frame.id }))
        : canonicalTimelineIndex.celByOwnerFrame.get(timelineCellSlotKey({ kind: 'cel', ownerKind: 'layer', ownerId: owner.id, frameId: frame.id }))
      const sourceId = slot
        ? (displayRow.kind === 'mask' ? canonicalTimelineIndex.maskRootById.get(slot.id) : canonicalTimelineIndex.celRootById.get(slot.id)) ?? slot.id
        : null
      if (!sourceId) return
      const indexes = bySource.get(sourceId) ?? []
      indexes.push(frameIndex)
      bySource.set(sourceId, indexes)
    })
    return [...bySource.entries()]
      .filter(([, frameIndexes]) => frameIndexes.length > 1)
       .map(([sourceId, frameIndexes]) => ({
         kind: displayRow.kind === 'mask' ? 'mask' as const : 'cel' as const,
         ownerKind: displayRow.kind === 'mask' ? displayRow.ownerKind : 'layer' as const,
         layerId: owner.id,
         row,
         sourceId,
         frameIndexes,
         frameIndexSet: new Set(frameIndexes),
         layerSelected: displayRow.kind === 'mask' ? false : showLayerSelectionAcrossTimeline && session.selectedLayerIds.includes(owner.id) && !session.selectedGroupId
      }))
  })
  const linkedGroupKey = (group: { kind: 'cel' | 'mask'; ownerKind: 'layer' | 'group'; layerId: string; sourceId: string }): string => `${group.kind}:${group.ownerKind}:${group.layerId}:${group.sourceId}`
  const groupCellKey = (group: { kind: 'cel' | 'mask'; layerId: string }, frameId: string): string => animationCelKey(group.layerId, frameId)
  const selectedLinkedCelGroups = new Set<string>()
  for (const group of linkedCelGroups) {
    const selectedCells = group.kind === 'mask' ? renderedMaskCellKeySet : renderedCellKeySet
    let selected = false
    for (const frameIndex of group.frameIndexes) {
      const frameId = timeline.frames[frameIndex].id
      if (renderedFrameIdSet.has(frameId) || selectedCells.has(groupCellKey(group, frameId))) { selected = true; break }
    }
    if (selected) selectedLinkedCelGroups.add(linkedGroupKey(group))
  }
  const highlightedLinkedCelGroups = new Set([
    ...selectedLinkedCelGroups,
    ...linkedCelGroups
      .filter((group) => group.layerSelected && group.frameIndexSet.has(visualActiveFrameIndex))
      .map(linkedGroupKey)
  ])
  const linkedMaskSlotVisuals = new Map<string, { withPrevious: boolean; withNext: boolean }>()
  for (const group of linkedCelGroups) {
    if (group.kind !== 'mask') continue
    for (let index = 0; index < group.frameIndexes.length; index += 1) {
      const frameIndex = group.frameIndexes[index]
       linkedMaskSlotVisuals.set(timelineCellSlotKey({ kind: 'mask', ownerKind: group.ownerKind, ownerId: group.layerId, frameId: timeline.frames[frameIndex].id }), {
        withPrevious: index > 0 && group.frameIndexes[index - 1] === frameIndex - 1,
        withNext: index + 1 < group.frameIndexes.length && group.frameIndexes[index + 1] === frameIndex + 1
      })
    }
  }
  const linkedCelBridgeEndKeys = new Set(linkedCelGroups.flatMap((group) => {
    if (!highlightedLinkedCelGroups.has(linkedGroupKey(group))) return []
    return group.frameIndexes.flatMap((frameIndex, index) => {
      const nextFrameIndex = group.frameIndexes[index + 1]
      return nextFrameIndex > frameIndex + 1
        ? [`${group.kind}|${animationCelKey(group.layerId, timeline.frames[frameIndex].id)}`]
        : []
    })
  }))
  const linkedCelBlocks = linkedCelGroups.flatMap((group) => {
    const blocks: Array<{ key: string; groupKey: string; row: number; start: number; span: number; selected: boolean; layerSelected: boolean }> = []
    const groupKey = linkedGroupKey(group)
    let start = group.frameIndexes[0]
    let previous = start
    for (let index = 1; index <= group.frameIndexes.length; index += 1) {
      const current = group.frameIndexes[index]
      if (current === previous + 1) {
        previous = current
        continue
      }
      const span = previous - start + 1
      blocks.push({ key: `${group.layerId}:${group.sourceId}:${start}`, groupKey, row: group.row, start, span, selected: highlightedLinkedCelGroups.has(groupKey), layerSelected: group.layerSelected })
      start = current
      previous = current
    }
    return blocks
  })
  const linkedCelConnectors = linkedCelGroups.flatMap((group) => {
    const groupKey = linkedGroupKey(group)
    if (!highlightedLinkedCelGroups.has(groupKey)) return []
    return group.frameIndexes.flatMap((frameIndex, index) => {
      const nextFrameIndex = group.frameIndexes[index + 1]
      return nextFrameIndex > frameIndex + 1
        ? [{ key: `${group.layerId}:${group.sourceId}:${frameIndex}-${nextFrameIndex}`, groupKey, row: group.row, start: frameIndex, end: nextFrameIndex, selected: highlightedLinkedCelGroups.has(groupKey), layerSelected: group.layerSelected }]
        : []
    })
  })
  // Membership and adjacency are separate visual states: an isolated cel in a
  // linked group still needs to sit above the bridge layer so its thumbnail is
  // visible at enlarged densities.
  const linkedCelMemberKeys = new Set(linkedCelGroups.flatMap((group) =>
    group.frameIndexes.map((frameIndex) => `${group.kind}|${animationCelKey(group.layerId, timeline.frames[frameIndex].id)}`)
  ))
  const selectedAnimationMaskOwners = new Set(session.selectedAnimationMaskRowKeys)
  const frameSelectionActiveForOutline = focusState.frameFocus || animationGestureSelection?.kind === 'frame'
  const selectedAnimationOutlineRows = displayRows.flatMap((displayRow, row) => {
    if (!timelineVisualState.selectionGuidesVisible) return []
    if (displayRow.kind === 'mask') return !frameSelectionActiveForOutline && selectedAnimationMaskOwners.has(`${displayRow.ownerKind}:${displayRow.owner.id}`) ? [row] : []
    const visualRow = timelineVisualState.rows[row]
    if (!layerSelectionActive || !visualRow?.selected) return []
    if (displayRow.node.kind === 'group') return effectiveSelectedGroupIds.includes(displayRow.node.group.id) ? [row] : []
    return session.selectedGroupId ? [] : [row]
  })
  // In mask mode the owner layer must not become the active row, but the
  // mask's own row still needs the timeline-wide active background. Resolve
  // that row explicitly instead of using an off-grid sentinel.
  const activeMaskAnimationRow = maskVisualSelectionActive && activeMaskOwnerKey
    ? displayRows.findIndex((displayRow) => displayRow.kind === 'mask' && `${displayRow.ownerKind}:${displayRow.owner.id}` === activeMaskOwnerKey)
    : -1
  const activeLayerAnimationRow = maskVisualSelectionActive
    ? activeMaskAnimationRow
    : displayRows.findIndex((displayRow) => displayRow.kind === 'node'
      && displayRow.node.kind === 'layer'
      && displayRow.node.layer.id === visualActiveLayerId)
  const activeAnimationLayerRow = groupVisualSelectionActive
    ? displayRows.findIndex((displayRow) => displayRow.kind === 'node' && displayRow.node.kind === 'group' && effectiveSelectedGroupIds.includes(displayRow.node.id))
    : activeLayerAnimationRow >= 0
      ? activeLayerAnimationRow
      : timelineVisualState.rows.findIndex((visualRow) => visualRow.row.ownerKind === 'group' && visualRow.active)
  const layerSelectionStart = selectedAnimationOutlineRows.length > 0 ? Math.min(...selectedAnimationOutlineRows) : 0
  const layerSelectionSpan = selectedAnimationOutlineRows.length > 0 ? Math.max(...selectedAnimationOutlineRows) - layerSelectionStart + 1 : 1
  const beginProperties = (next: LayerFormState): void => {
    const transactionId = store.beginLayerPropertiesTransaction(next.targets)
    if (!transactionId) return
    propertyTransactionRef.current = transactionId
    setForm(next)
  }
  const editLayer = (layer: RasterLayer): void => beginProperties({ id: layer.id, kind: 'layer', targets: [{ id: layer.id, kind: 'layer' }], batchChanges: [], name: layer.name, opacity: Math.round(layer.opacity * 100), blendMode: layer.blendMode, cumulativeBlend: false, locked: layer.locked, displayColor: layer.displayColor ? { ...layer.displayColor } : null, description: layer.description ?? '' })
  const editGroup = (group: LayerGroup): void => beginProperties({ id: group.id, kind: 'group', targets: [{ id: group.id, kind: 'group' }], batchChanges: [], name: group.name, opacity: Math.round(group.opacity * 100), blendMode: group.blendMode, cumulativeBlend: group.cumulativeBlend === true, locked: group.locked, displayColor: group.displayColor ? { ...group.displayColor } : null, description: group.description ?? '' })
  const editSelectedRows = (): void => {
    const targets = selectedRowsForProperties(session)
    if (targets.length <= 1) return
    const first = targets[0]
    const source = first.kind === 'group' ? session.document.groups.find((group) => group.id === first.id) : session.document.layers.find((layer) => layer.id === first.id)
    if (!source) return
    beginProperties({ id: first.id, kind: first.kind, targets, batchChanges: [], name: source.name, opacity: Math.round(source.opacity * 100), blendMode: source.blendMode, cumulativeBlend: first.kind === 'group' && (source as LayerGroup).cumulativeBlend === true, locked: source.locked, displayColor: source.displayColor ? { ...source.displayColor } : null, description: source.description ?? '' })
  }
  const editLayerRow = (layer: RasterLayer): void => {
    const selectedTargets = selectedRowsForProperties(session)
    if (selectedTargets.length > 1 && selectedTargets.some((target) => target.kind === 'layer' && target.id === layer.id)) {
      editSelectedRows()
      return
    }
    if (layer.kind === 'text') {
      const cel = celLookup.resolve(celLookup.at(layer.id, timeline.activeFrameId))
      openTextToolDialog({ documentId: session.document.id, layerId: layer.id, frameId: timeline.activeFrameId, x: cel?.surface?.offsetX ?? layer.offsetX, y: cel?.surface?.offsetY ?? layer.offsetY })
      return
    }
    editLayer(layer)
  }
  const editGroupRowForGroup = (group: LayerGroup): void => {
    const selectedTargets = selectedRowsForProperties(session)
    if (selectedTargets.length > 1 && selectedTargets.some((target) => target.kind === 'group' && target.id === group.id)) editSelectedRows()
    else editGroup(group)
  }
  const editGroupRow = (group: LayerGroup | Extract<LayerTreeNode, { kind: 'group' }>): void => editGroupRowForGroup('group' in group ? group.group : group)
  const propertyValues = (next: LayerFormState): LayerPropertyValues => ({
    name: next.name,
    opacity: next.opacity / 100,
    blendMode: next.blendMode,
    cumulativeBlend: next.cumulativeBlend,
    locked: next.locked,
    displayColor: next.displayColor ? { ...next.displayColor } : null,
    description: next.description
  })
  const propertyFields = (next: LayerFormState): readonly LayerPropertyField[] => next.targets.length > 1 ? next.batchChanges : ALL_LAYER_PROPERTY_FIELDS
  const applyPropertyPreview = (next: LayerFormState): void => {
    const transactionId = propertyTransactionRef.current
    if (!transactionId) return
    store.previewLayerPropertiesTransaction(transactionId, propertyValues(next), propertyFields(next))
  }
  const flushPropertyPreview = (): LayerFormState | null => {
    if (propertyPreviewTimerRef.current !== null) window.clearTimeout(propertyPreviewTimerRef.current)
    propertyPreviewTimerRef.current = null
    const pending = pendingPropertyPreviewRef.current
    pendingPropertyPreviewRef.current = null
    if (pending) applyPropertyPreview(pending)
    return pending
  }
  const previewProperties = (next: LayerFormState, batchProperty?: BatchProperty): void => {
    if (next.targets.length > 1 && batchProperty && !next.batchChanges.includes(batchProperty)) next = { ...next, batchChanges: [...next.batchChanges, batchProperty] }
    setForm(next)
    if (next.targets.length === 1 || batchProperty === 'displayColor' || batchProperty === 'blendMode') {
      flushPropertyPreview()
      applyPropertyPreview(next)
      return
    }
    pendingPropertyPreviewRef.current = next
    if (propertyPreviewTimerRef.current !== null) window.clearTimeout(propertyPreviewTimerRef.current)
    propertyPreviewTimerRef.current = window.setTimeout(() => { flushPropertyPreview() }, 40)
  }
  const closeProperties = (): void => {
    const closingForm = flushPropertyPreview() ?? form
    if (!closingForm) return
    const transactionId = propertyTransactionRef.current
    if (transactionId) store.commitLayerPropertiesTransaction(transactionId, propertyValues(closingForm), propertyFields(closingForm))
    propertyTransactionRef.current = null
    setForm(null)
  }
  useEffect(() => () => {
    if (propertyPreviewTimerRef.current !== null) window.clearTimeout(propertyPreviewTimerRef.current)
    pendingPropertyPreviewRef.current = null
    const transactionId = propertyTransactionRef.current
    if (transactionId) useWorkspace.getState().cancelLayerPropertiesTransaction(transactionId)
    propertyTransactionRef.current = null
  }, [])
  useEffect(() => {
    if (!form) return
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeProperties()
    }
    window.addEventListener('keydown', keyDown, true)
    return () => window.removeEventListener('keydown', keyDown, true)
  }, [form])
  const isLayerRowControlTarget = (event: React.PointerEvent<HTMLElement>): boolean => {
    const target = event.target instanceof Element ? event.target : null
    return Boolean(target?.closest('.layer-visibility, .layer-lock-toggle, .layer-auto-link-toggle, .group-folder, .layer-status-icon-tooltip, .layer-style-indicator, .layer-instance-properties, .layer-tilemap-indicator'))
  }
  const toggleLayerAutoLink = (layerId: string): void => {
    const liveLayer = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)?.document.layers.find((layer) => layer.id === layerId)
    store.setLayerAutoLinkAnimationCels(layerId, !(liveLayer?.autoLinkAnimationCels === true))
  }
  const handleLayerAutoLinkPointerDown = (event: React.PointerEvent<HTMLElement>, layerId: string): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    toggleLayerAutoLink(layerId)
  }
  const handleLayerAutoLinkKeyDown = (event: React.KeyboardEvent<HTMLElement>, layerId: string): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    toggleLayerAutoLink(layerId)
  }
  const toggleLayerMaskLocked = (celId: string, locked: boolean): void => {
    store.setLayerMaskLocked(celId, !locked)
  }
  const toggleLayerMaskAutoLink = (celId: string, enabled: boolean): void => {
    store.setLayerMaskAutoLinkAnimationCels(celId, !enabled)
  }
  const handleLayerMaskControlPointerDown = (
    event: React.PointerEvent<HTMLElement>,
    action: () => void,
    disabled = false,
  ): void => {
    if (event.button !== 0 || disabled) return
    event.preventDefault()
    event.stopPropagation()
    action()
  }
  const handleLayerMaskControlKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    action: () => void,
    disabled = false,
  ): void => {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    event.stopPropagation()
    action()
  }
  const beginLayerDrag = (event: React.PointerEvent<HTMLButtonElement>, layerId: string): void => {
    if (event.button !== 0) return
    if (isLayerRowControlTarget(event)) return
    const target = event.target instanceof Element ? event.target : null
    const selectOnClick = Boolean(target?.closest('.layer-name'))
    const wasEditingLayerMask = Boolean(session.activeLayerMaskId)
    if (wasEditingLayerMask && selectOnClick) store.selectLayer(layerId)
    else if (event.ctrlKey) store.selectLayer(layerId, 'toggle')
    else if (event.shiftKey) store.selectLayer(layerId, 'range')
    else if (selectOnClick) {
      setAnimationGestureSelection(null)
      setAnimationGestureActiveTarget(null)
      if (session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0 || session.selectedAnimationMaskRowKeys.length > 0 || session.selectedGroupId || !session.selectedLayerIds.includes(layerId)) store.selectLayer(layerId)
    } else {
      setAnimationGestureSelection(null)
      setAnimationGestureActiveTarget(null)
      suppressSelectionOutlineOnNextSignatureRef.current = true
      setSelectionOutlineVisible(false)
      setAnimationCellSelectionOutlineVisible(false)
      clearSelectionFromBlank()
    }
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const rows = active ? selectedRowsForDrag(active) : { ids: [layerId], groupIds: [] }
    const ids = rows.ids.includes(layerId) ? rows.ids : [layerId]
    const groupIds = rows.ids.includes(layerId) ? rows.groupIds : []
    const selectionLocked = ids.some((id) => { const layer = session.document.layers.find((candidate) => candidate.id === id); return Boolean(layer && isLayerEffectivelyLocked(session.document, layer)) })
      || groupIds.some((id) => { const group = session.document.groups.find((candidate) => candidate.id === id); return Boolean(group && isGroupEffectivelyLocked(session.document, group)) })
    if (selectionLocked) {
      if (!event.ctrlKey && !event.shiftKey && selectOnClick) store.selectLayer(layerId)
      return
    }
    dragRef.current = { ids, groupIds, groupId: groupIds.length === 1 && ids.length === 0 ? groupIds[0] : undefined, row: { id: layerId, kind: 'layer' }, preserveSelection: event.ctrlKey || event.shiftKey, selectOnClick: selectOnClick || event.ctrlKey || event.shiftKey, selectedLayerIds: [...(active?.selectedLayerIds ?? ids)], selectedGroupIds: [...(active?.selectedGroupIds ?? groupIds)], wholeGroupSelection: Boolean(active?.selectedGroupId), startX: event.clientX, startY: event.clientY, moved: false, copy: event.altKey }
    event.preventDefault()
  }
  const beginGroupDrag = (event: React.PointerEvent<HTMLButtonElement>, groupId: string): void => {
    if (event.button !== 0) return
    if (isLayerRowControlTarget(event)) return
    const target = event.target instanceof Element ? event.target : null
    const selectOnClick = Boolean(target?.closest('.layer-name'))
    const wasEditingLayerMask = Boolean(session.activeLayerMaskId)
    if (wasEditingLayerMask && selectOnClick) store.selectGroup(groupId)
    else if (event.ctrlKey) store.selectGroup(groupId, 'toggle')
    else if (event.shiftKey) store.selectGroup(groupId, 'range')
    else if (selectOnClick && (!session.selectedGroupIds.includes(groupId)
      || session.selectedAnimationFrameIds.length > 0
      || session.selectedAnimationCellKeys.length > 0
      || session.selectedAnimationMaskCellKeys.length > 0
      || session.selectedAnimationMaskRowKeys.length > 0)) store.selectGroup(groupId)
    else if (!selectOnClick) {
      setAnimationGestureSelection(null)
      setAnimationGestureActiveTarget(null)
      suppressSelectionOutlineOnNextSignatureRef.current = true
      setSelectionOutlineVisible(false)
      setAnimationCellSelectionOutlineVisible(false)
      clearSelectionFromBlank()
    }
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const rows = active ? selectedRowsForDrag(active) : { ids: [], groupIds: [groupId] }
    const ids = rows.groupIds.includes(groupId) ? rows.ids : []
    const groupIds = rows.groupIds.includes(groupId) ? rows.groupIds : [groupId]
    const allGroupIds = new Set(groupIds.flatMap((id) => [id, ...getDescendantGroupIds(session.document, id)]))
    const allLayerIds = new Set([...ids, ...groupIds.flatMap((id) => getLayerIdsInGroup(session.document, id))])
    const selectionLocked = session.document.groups.some((group) => allGroupIds.has(group.id) && isGroupEffectivelyLocked(session.document, group))
      || session.document.layers.some((layer) => allLayerIds.has(layer.id) && isLayerEffectivelyLocked(session.document, layer))
    if (selectionLocked) {
      if (!event.ctrlKey && !event.shiftKey && selectOnClick) store.selectGroup(groupId)
      return
    }
    dragRef.current = { ids, groupIds, groupId: groupIds.length === 1 && ids.length === 0 ? groupIds[0] : undefined, row: { id: groupId, kind: 'group' }, preserveSelection: event.ctrlKey || event.shiftKey, selectOnClick: selectOnClick || event.ctrlKey || event.shiftKey, selectedLayerIds: [...(active?.selectedLayerIds ?? ids)], selectedGroupIds: [...(active?.selectedGroupIds ?? groupIds)], wholeGroupSelection: Boolean(active?.selectedGroupId), startX: event.clientX, startY: event.clientY, moved: false, copy: event.altKey }
    event.preventDefault()
  }
  const resolveDropTarget = (clientX: number, clientY: number, draggedIds: string[], draggedGroupIds: string[], copying = false): DropTarget | null => {
    const list = layerListRef.current
    const listBounds = list?.getBoundingClientRect()
    if (!list || !listBounds) return null
    if (clientX < listBounds.left || clientX > listBounds.right) return null
    const allRows = [...list.querySelectorAll<HTMLElement>('[data-layer-id], [data-group-id]')]
    const measuredRows = allRows.map((row) => ({ row, bounds: row.getBoundingClientRect() })).filter(({ bounds }) => bounds.height > 0).sort((left, right) => left.bounds.top - right.bounds.top)
    const firstVisibleBounds = measuredRows[0]?.bounds
    const lastVisibleBounds = measuredRows.at(-1)?.bounds
    if (firstVisibleBounds && clientY <= firstVisibleBounds.top) return { kind: 'edge', edge: 'top' }
    if (lastVisibleBounds && clientY >= lastVisibleBounds.bottom) return { kind: 'edge', edge: 'bottom' }
    const element = allRows
      .find((row) => {
        const bounds = row.getBoundingClientRect()
        return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom
      })
    const layerId = element?.dataset.layerId
    const groupId = element?.dataset.groupId
    if (element && (layerId || groupId)) {
      const elementBounds = element.getBoundingClientRect()
      if (groupId) {
        const group = session.document.groups.find((candidate) => candidate.id === groupId)
        const nodeIndex = nodes.findIndex((node) => node.kind === 'group' && node.id === groupId)
        const hasFollowingRootNode = nodes.slice(nodeIndex + 1).some((node) => node.depth === 0)
        const draggedFromTarget = draggedIds.some((id) => session.document.layers.find((layer) => layer.id === id)?.groupId === groupId)
          || draggedGroupIds.some((id) => {
            const draggedGroup = session.document.groups.find((candidate) => candidate.id === id)
            return id === groupId || draggedGroup?.parentGroupId === groupId
          })
        const lowerEdge = Math.min(8, (elementBounds.bottom - elementBounds.top) * 0.2)
        if (!group?.parentGroupId && !hasFollowingRootNode && !draggedFromTarget && clientY >= elementBounds.bottom - lowerEdge) return { kind: 'edge', edge: 'bottom' }
      }
      const hit = {
        kind: layerId ? 'layer' as const : 'group' as const,
        id: (layerId ?? groupId)!,
        top: elementBounds.top,
        bottom: elementBounds.bottom,
        pointerY: clientY
      }
      const draggedGroupId = draggedGroupIds.length === 1 && draggedIds.length === 0 ? draggedGroupIds[0] : undefined
      const target = resolveLayerPanelDropTarget({ layers: session.document.layers, groups: session.document.groups, nodes, hit, draggedLayerIds: draggedIds, draggedGroupId, copying })
      if (target) return target
    }
    const edgeTarget = resolveLayerPanelEdgeDropTarget(clientY, listBounds.top, listBounds.bottom)
    if (edgeTarget) return edgeTarget
    const rows = allRows.filter((row) => !draggedIds.includes(row.dataset.layerId ?? '') && !draggedGroupIds.includes(row.dataset.groupId ?? ''))
    if (rows.length === 0) return null
    const first = rows[0].getBoundingClientRect()
    const last = rows.at(-1)!.getBoundingClientRect()
    if (clientY <= first.top) {
      return { kind: 'edge', edge: 'top' }
    }
    if (clientY >= last.bottom) return { kind: 'edge', edge: 'bottom' }
    return null
  }
  const dropTargetBlockedByGroups = (target: DropTarget, groupIds: readonly string[]): boolean => {
    if (groupIds.length === 0 || target.kind === 'edge') return false
    const blockedTargets = new Set(groupIds.flatMap((id) => [id, ...getDescendantGroupIds(session.document, id)]))
    if (target.kind === 'group' || target.kind === 'above-group') return blockedTargets.has(target.id)
    const targetLayer = session.document.layers.find((layer) => layer.id === target.id)
    return Boolean(targetLayer?.groupId && blockedTargets.has(targetLayer.groupId))
  }
  const moveLayerDrag = (clientX: number, clientY: number, altKey: boolean): void => {
    const drag = dragRef.current
    if (!drag) return
    drag.copy = altKey
    if (!drag.moved && Math.hypot(clientX - drag.startX, clientY - drag.startY) < 4) return
    if (!drag.moved) { drag.moved = true; setDraggingIds(drag.ids); setDraggingGroupId(drag.groupId ?? null) }
    setDraggingCopy(drag.copy)
    const draggedLayerIds = new Set(drag.wholeGroupSelection ? [] : drag.selectedLayerIds)
    const draggedGroupIds = new Set(drag.selectedGroupIds)
    const items = nodes.flatMap((node): NonNullable<LayerDragGhost['items']> => {
      if (node.kind === 'group' && draggedGroupIds.has(node.id)) return [{ id: node.id, kind: 'group', name: node.group.name }]
      if (node.kind === 'layer' && draggedLayerIds.has(node.id)) return [{ id: node.id, kind: 'layer', name: node.layer.name }]
      return []
    })
    const listBounds = layerListRef.current?.getBoundingClientRect()
    const selectedCount = drag.wholeGroupSelection
      ? Math.max(1, drag.selectedGroupIds.length)
      : new Set([...drag.selectedLayerIds.map((id) => `layer:${id}`), ...drag.selectedGroupIds.map((id) => `group:${id}`)]).size
    const count = Math.max(items.length, selectedCount)
    const ghostHeight = Math.min(4, Math.max(1, items.length)) * 27 + (count > Math.min(4, items.length) ? 20 : 0)
    const y = listBounds ? Math.max(0, Math.min(listBounds.height - ghostHeight, clientY - listBounds.top - ghostHeight / 2)) : 0
    setDragGhost({ y, items: items.length > 0 ? items : [{ id: drag.row.id, kind: drag.row.kind, name: t('layers.fallbackName') }], count })
    let target = resolveDropTarget(clientX, clientY, drag.ids, drag.groupIds, drag.copy)
    if (target && dropTargetBlockedByGroups(target, drag.groupIds)) target = null
    dropTargetRef.current = target
    if (target?.kind === 'edge' && layerListRef.current) {
      const list = layerListRef.current
      const rows = [...list.querySelectorAll<HTMLElement>('[data-layer-id], [data-group-id]')]
      const measuredRows = rows.map((row) => ({ row, bounds: row.getBoundingClientRect() })).filter(({ bounds }) => bounds.height > 0).sort((left, right) => left.bounds.top - right.bounds.top)
      const measuredAnchor = target.edge === 'top' ? measuredRows[0] : measuredRows.at(-1)
      const listBounds = list.getBoundingClientRect()
      const rowBounds = measuredAnchor?.bounds
      setDropTarget({ ...target, offset: rowBounds ? (target.edge === 'top' ? rowBounds.top : rowBounds.bottom) - listBounds.top + list.scrollTop : 0 })
    } else setDropTarget(target)
  }
  const flushPendingLayerDrag = (): void => {
    const pending = pendingLayerDragRef.current
    pendingLayerDragRef.current = null
    if (pending) moveLayerDrag(pending.clientX, pending.clientY, pending.altKey)
  }
  const finishLayerDrag = (clientX: number, clientY: number): void => {
    if (layerDragFrameRef.current !== null) window.cancelAnimationFrame(layerDragFrameRef.current)
    layerDragFrameRef.current = null
    flushPendingLayerDrag()
    const drag = dragRef.current
    let target = drag ? resolveDropTarget(clientX, clientY, drag.ids, drag.groupIds, drag.copy) : dropTargetRef.current
    if (drag && target && dropTargetBlockedByGroups(target, drag.groupIds)) target = null
    dragRef.current = null
    const compound = Boolean(drag?.moved && target && drag.copy)
    if (compound) store.beginLayerPanelTransaction(session.document.id)
    if (drag?.moved && target) {
      if (drag.copy) {
        const copies = store.duplicateSelectedLayerRows()
        drag.ids = copies.layerIds
        drag.groupIds = copies.groupIds
        drag.groupId = drag.groupIds.length === 1 && drag.ids.length === 0 ? drag.groupIds[0] : undefined
      }
      if (target.kind === 'edge') store.moveLayerRows(drag.ids, drag.groupIds, { kind: 'edge', edge: target.edge })
      else if (target.kind === 'group') store.moveLayerRows(drag.ids, drag.groupIds, { kind: 'group', id: target.id })
      else if (target.kind === 'above-group') store.moveLayerRows(drag.ids, drag.groupIds, { kind: 'row', rowKind: 'group', id: target.id, position: target.insertAfter === false ? 'below' : 'above' })
      else store.moveLayerRows(drag.ids, drag.groupIds, { kind: 'row', rowKind: 'layer', id: target.id, position: target.insertAfter ? 'above' : 'below' })
      if (!drag.copy) {
        if (drag.wholeGroupSelection && drag.selectedGroupIds.length === 1) store.selectGroup(drag.selectedGroupIds[0])
        else store.selectLayerRows(drag.selectedLayerIds, drag.selectedGroupIds)
      }
    }
    if (drag && !drag.moved && !drag.preserveSelection && drag.selectOnClick) {
      // Selecting the already-active row does not change the selection
      // signature, so restore the explicit outline directly as well.
      showLayerSelectionOutline()
      if (drag.row.kind === 'group') store.selectGroup(drag.row.id)
      else store.selectLayer(drag.row.id)
    }
    if (compound) store.commitLayerPanelTransaction(session.document.id, t('layers.copyMoveHistory'))
    setDraggingIds([])
    setDraggingGroupId(null)
    setDraggingCopy(false)
    dropTargetRef.current = null
    setDropTarget(null)
    setDragGhost(null)
  }
  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (dragRef.current) {
        if (!dragRef.current.moved) moveLayerDrag(event.clientX, event.clientY, event.altKey)
        else {
          pendingLayerDragRef.current = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey }
          if (layerDragFrameRef.current === null) layerDragFrameRef.current = window.requestAnimationFrame(() => {
            layerDragFrameRef.current = null
            flushPendingLayerDrag()
          })
        }
      }
      moveAnimationPointerDragRef.current(event)
    }
    const finish = (event: PointerEvent): void => { finishLayerPanelToggle(); finishLayerDrag(event.clientX, event.clientY); finishAnimationPointerDragRef.current(event.type === 'pointercancel') }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      if (layerDragFrameRef.current !== null) window.cancelAnimationFrame(layerDragFrameRef.current)
      layerDragFrameRef.current = null
      pendingLayerDragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  // Layer and group objects are mutated in place, so the document identity is sufficient here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.document.id])
  useEffect(() => {
    const cancel = (): void => finishAnimationPointerDragRef.current(true)
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      cancel()
    }
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('blur', cancel)
    }
  }, [session.document.id])
  useEffect(() => {
    const targetAtPointer = (x: number, y: number): LayerFormTarget | null => {
      if (typeof document.elementFromPoint !== 'function') return null
      const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layer-id], [data-group-id]')
      if (row?.dataset.layerId) return { kind: 'layer', id: row.dataset.layerId }
      if (row?.dataset.groupId) return { kind: 'group', id: row.dataset.groupId }
      return null
    }
    const move = (event: PointerEvent): void => {
      const drag = layerStyleDragRef.current
      if (!drag) return
      const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4
      const hovered = moved ? targetAtPointer(event.clientX, event.clientY) : null
      const target = hovered && (hovered.kind !== drag.source.kind || hovered.id !== drag.source.id) ? hovered : null
      const next = { ...drag, target, x: event.clientX, y: event.clientY, moved }
      layerStyleDragRef.current = next
      setLayerStyleDrag(next)
    }
    const finish = (event: PointerEvent): void => {
      const drag = layerStyleDragRef.current
      if (!drag) return
      layerStyleDragRef.current = null
      setLayerStyleDrag(null)
      if (drag.moved) {
        suppressLayerStyleClickRef.current = true
        window.setTimeout(() => { suppressLayerStyleClickRef.current = false }, 0)
      }
      if (event.type !== 'pointerup' || !drag.moved || !drag.target) return
      const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      const source = drag.source.kind === 'layer'
        ? active?.document.layers.find((layer) => layer.id === drag.source.id)
        : active?.document.groups.find((group) => group.id === drag.source.id)
      if (source?.layerStyles) useWorkspace.getState().setLayerStylesForTargets([drag.target], source.layerStyles, 'paste')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      layerStyleDragRef.current = null
    }
  }, [session.document.id])
  const openLayerContextMenu = (event: React.MouseEvent, kind: 'layer' | 'group', id: string): void => {
    event.preventDefault()
    event.stopPropagation()
    const wasEditingLayerMask = Boolean(session.activeLayerMaskId)
    if (kind === 'layer' && (wasEditingLayerMask || session.selectedGroupId || !session.selectedLayerIds.includes(id))) store.selectLayer(id)
    if (kind === 'group' && (wasEditingLayerMask || !session.selectedGroupIds.includes(id))) store.selectGroup(id)
    setLayerCreateMenu(null)
    setContextMenu({ kind, id, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 540)) })
  }
  const openLayerCreateContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setLayerCreateMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 190))
    })
  }
  const closeContextMenu = (): void => { setContextMenu(null); setLayerCreateMenu(null) }
  const openBackgroundLayerDialog = (): void => {
    setBackgroundLayerDialogOpen(true)
    closeContextMenu()
  }
  const openTilemapLayerDialog = (): void => {
    setTilemapLayerDialog({ mode: 'create' })
    closeContextMenu()
  }
  const openFreeTileLayerDialog = (): void => {
    setFreeTileLayerDialogOpen(true)
    closeContextMenu()
  }
  const layerCreationMenuItems = (): ReactNode => <>
    <LayerContextMenuItem icon="plus" label={t('layers.new')} shortcut={shortcutHint('newLayer')} onClick={() => { void store.addLayer(); closeContextMenu() }} />
    <LayerContextMenuItem icon="newFolder" label={t('layers.newGroup')} shortcut={shortcutHint('createLayerGroup')} onClick={() => { store.createLayerGroup(); closeContextMenu() }} />
    <LayerContextMenuItem icon="tilemap" label={t('layers.newTilemap')} shortcut={shortcutHint('newTilemapLayer')} onClick={openTilemapLayerDialog} />
    <Tooltip className="layer-menu-tooltip" content={<><strong>{t('layers.newFreeTile')}</strong><span>{t('layers.newFreeTileDescription')}</span></>}><LayerContextMenuItem icon="freeTile" label={t('layers.newFreeTile')} shortcut={shortcutHint('newFreeTileLayer')} onClick={openFreeTileLayerDialog} /></Tooltip>
    <LayerContextMenuItem icon="image" label={t('layers.newBackground')} shortcut={shortcutHint('newBackgroundLayer')} onClick={openBackgroundLayerDialog} />
  </>
  const openTilemapConversionDialog = (): void => {
    if (contextMenu?.kind !== 'layer') return
    setTilemapLayerDialog({ mode: 'convert', layerId: contextMenu.id })
    closeContextMenu()
  }
  const duplicateContextSelection = (): void => {
    store.duplicateSelectedLayerRows()
    closeContextMenu()
  }
  const deleteContextSelection = (): void => {
    store.deleteSelectedLayers()
    closeContextMenu()
  }
  const openProperties = (): void => {
    if (!contextMenu) return
    const selectedRows = selectedRowsForProperties(session)
    if (selectedRows.length > 1) {
      editSelectedRows()
      closeContextMenu()
      return
    }
    if (contextMenu.kind === 'group') {
      const group = session.document.groups.find((item) => item.id === contextMenu.id)
      if (group) editGroup(group)
    } else {
      const layer = session.document.layers.find((item) => item.id === contextMenu.id)
      if (layer) editLayer(layer)
    }
    closeContextMenu()
  }
  const openLayerStyles = (): void => {
    if (!contextMenu) return
    const source = { kind: contextMenu.kind, id: contextMenu.id } as LayerFormTarget
    const selectedTargets = selectedRowsForProperties(session)
    const targets = selectedTargets.length > 1 && selectedTargets.some((target) => target.kind === source.kind && target.id === source.id)
      ? selectedTargets
      : [source]
    setLayerStyleDialog({ source, targets })
    closeContextMenu()
  }
  const contextMenuStyleTargets = contextMenu ? (() => {
    const source = { kind: contextMenu.kind, id: contextMenu.id } as LayerFormTarget
    const selectedTargets = selectedRowsForProperties(session)
    return selectedTargets.length > 1 && selectedTargets.some((target) => target.kind === source.kind && target.id === source.id)
      ? selectedTargets
      : [source]
  })() : []
  const copyContextLayerStyles = (): void => {
    if (contextMenu) store.copyLayerStyles(contextMenu.kind, contextMenu.id)
    closeContextMenu()
  }
  const pasteContextLayerStyles = (): void => {
    store.pasteLayerStyles(contextMenuStyleTargets)
    closeContextMenu()
  }
  const clearContextLayerStyles = (): void => {
    store.clearLayerStyles(contextMenuStyleTargets)
    closeContextMenu()
  }
  const contextMenuClippingMaskEnabled = contextMenu?.kind === 'layer'
    ? session.document.layers.find((layer) => layer.id === contextMenu.id)?.clippingMask === true
    : contextMenu?.kind === 'group'
      ? session.document.groups.find((group) => group.id === contextMenu.id)?.clippingMask === true
      : false
  const contextMenuLayer = contextMenu?.kind === 'layer' ? session.document.layers.find((layer) => layer.id === contextMenu.id) ?? null : null
  const contextMenuStyleOwner = contextMenu?.kind === 'layer'
    ? contextMenuLayer
    : contextMenu?.kind === 'group'
      ? session.document.groups.find((group) => group.id === contextMenu.id) ?? null
      : null
  const contextMenuOwnerHasStyles = hasConfiguredLayerStyles(contextMenuStyleOwner?.layerStyles)
  const contextMenuOwnerStylesEnabled = contextMenuOwnerHasStyles && hasEnabledLayerStyles(contextMenuStyleOwner?.layerStyles)
  const contextMenuSelectionHasStyles = contextMenuStyleTargets.some((target) => {
    const owner = target.kind === 'layer'
      ? session.document.layers.find((layer) => layer.id === target.id)
      : session.document.groups.find((group) => group.id === target.id)
    return hasConfiguredLayerStyles(owner?.layerStyles)
  })
  const contextMenuLayerHasStyles = Boolean(contextMenuLayer && hasConfiguredLayerStyles(contextMenuLayer.layerStyles))
  const toggleContextLayerStyles = (): void => {
    store.setLayerStylesEnabled(contextMenuStyleTargets, !contextMenuOwnerStylesEnabled)
    closeContextMenu()
  }
  const contextMenuCanConvertToBackground = Boolean(contextMenuLayer && !contextMenuLayer.kind && !contextMenuLayer.background)
  const contextMenuCanConvertToTilemap = Boolean(contextMenuLayer && !contextMenuLayer.kind && !contextMenuLayerHasStyles)
  const contextMenuCanConvertToRaster = Boolean(contextMenuLayer && (contextMenuLayer.background || contextMenuLayer.kind || contextMenuLayerHasStyles))
  const contextMenuCanCreateLinkedLayer = Boolean(contextMenuLayer && !contextMenuLayer.kind && !contextMenuLayer.background)
  const tilemapConversionLayer = tilemapLayerDialog?.mode === 'convert' ? layerById.get(tilemapLayerDialog.layerId) ?? null : null
  const clippingMaskTooltip = <><strong>{t('layers.clippingMask')}</strong><span>{t('layers.clippingMaskDescription')}</span><small>{t('layers.clippingMaskUsage')}</small></>
  const layerMaskTooltip = <><strong>{t('core.document.layerMask')}</strong><span>{t('layers.layerMaskDescription')}</span><small>{t('layers.layerMaskUsage')}</small></>
  const emptyLayerMaskCelTooltip = <><strong>{t('core.document.layerMask')}</strong><span>{t('layers.layerMaskEmptyCel')}</span></>
  const contextMenuGroupMask = contextMenu?.kind === 'group' ? animationGroupMaskAt(timeline, contextMenu.id, timeline.activeFrameId) : null
  const contextMenuLayerMask = contextMenu?.kind === 'layer' ? animationMaskAt(timeline, contextMenu.id, timeline.activeFrameId) : null
  const contextMenuLayerMaskStatus = (() => {
    if (contextMenu?.kind !== 'layer') return { hasContent: false, canCreate: false }
    let hasContent = false
    let canCreate = false
    for (const cel of timeline.cels) {
      if (cel.layerId !== contextMenu.id) continue
      const source = celLookup.resolve(cel) ?? cel
      if (!animationCelHasContent(source, session.document.palette)) continue
      hasContent = true
      if (!animationMaskSlotAt(timeline, cel.layerId, cel.frameId)) canCreate = true
    }
    return { hasContent, canCreate }
  })()
  const layerStyleOwner = layerStyleDialog?.source.kind === 'layer'
    ? session.document.layers.find((layer) => layer.id === layerStyleDialog.source.id) ?? null
    : layerStyleDialog?.source.kind === 'group'
      ? session.document.groups.find((group) => group.id === layerStyleDialog.source.id) ?? null
      : null
  const layerStyleIndicatorTooltip = <><strong>{t('layers.layerStyle')}</strong><span>{t('layers.layerStyleIndicatorDescription')}</span></>
  const beginLayerStyleDrag = (event: React.PointerEvent<HTMLElement>, target: LayerFormTarget): void => {
    event.preventDefault()
    event.stopPropagation()
    if (event.button !== 0 || !event.altKey) return
    const drag = { source: target, target: null, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false }
    layerStyleDragRef.current = drag
    setLayerStyleDrag(drag)
  }
  const openLayerStyleFromIndicator = (event: React.MouseEvent<HTMLElement>, target: LayerFormTarget): void => {
    event.preventDefault()
    event.stopPropagation()
    if (suppressLayerStyleClickRef.current) {
      suppressLayerStyleClickRef.current = false
      return
    }
    setLayerStyleDialog({ source: target, targets: [target] })
  }
  const layerStyleIndicator = (target: LayerFormTarget): ReactNode => <Tooltip className="layer-status-icon-tooltip" content={layerStyleIndicatorTooltip}><span className="layer-style-indicator" role="button" tabIndex={0} aria-label={t('layers.openLayerStyle')} onPointerDown={(event) => beginLayerStyleDrag(event, target)} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => openLayerStyleFromIndicator(event, target)} onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); event.stopPropagation(); setLayerStyleDialog({ source: target, targets: [target] }) }}><PixelUtilityIcon kind="layerStyle" /></span></Tooltip>
  const openFreeTileInstanceLayers = (layerId: string): void => {
    store.selectLayer(layerId)
    const cel = celLookup.resolve(celLookup.at(layerId, timeline.activeFrameId))
    if (!cel?.freeTiles?.instances.length) {
      store.setMessage(t('freeTiles.noInstancesToOpen'))
      return
    }
    store.clearAnimationSelection()
    store.setFreeTileInstanceLayerView(layerId)
    if (freeTileInstancePanelLayout === 'separate') window.dispatchEvent(new CustomEvent('moonsprite:show-workspace-panel', { detail: { id: 'freeTileInstances' } }))
  }
  const toggleContextClippingMask = (): void => {
    if (!contextMenu) return
    store.setClippingMask(contextMenu.kind, contextMenu.id, !contextMenuClippingMaskEnabled)
    closeContextMenu()
  }
  const singleFormTargetLocked = Boolean(form && form.targets.length === 1 && (form.kind === 'group'
    ? session.document.groups.some((group) => group.id === form.id && isGroupEffectivelyLocked(session.document, group))
    : session.document.layers.some((layer) => layer.id === form.id && isLayerEffectivelyLocked(session.document, layer))))
  const dragGhostItems = dragGhost?.items ?? (dragGhost ? [{ id: 'legacy', kind: 'layer' as const, name: dragGhost.name ?? t('layers.fallbackName') }] : [])
  const hiddenDragGhostCount = dragGhost ? Math.max(0, dragGhost.count - Math.min(4, dragGhostItems.length)) : 0
  const animationMenuLoopSection = animationMenu?.kind === 'loop-section' ? (timeline.loopSections ?? []).find((section) => section.id === animationMenu.sectionId) ?? null : null
  const animationMenuFrameIds = animationMenu?.kind === 'frame'
    ? session.selectedAnimationFrameIds.includes(animationMenu.frameId) && session.selectedAnimationFrameIds.length > 0
      ? session.selectedAnimationFrameIds
      : [animationMenu.frameId]
    : []
  const animationMenuFramesAllDisabled = animationMenuFrameIds.length > 0
    && animationMenuFrameIds.every((frameId) => timeline.frames.find((frame) => frame.id === frameId)?.disabled === true)
  const animationMenuCel = animationMenu?.kind === 'cel' || animationMenu?.kind === 'mask' ? celLookup.at(animationMenu.layerId, animationMenu.frameId) : null
  const animationMenuOwnerKind = animationMenu?.kind === 'cel' || animationMenu?.kind === 'mask'
    ? session.document.layers.some((layer) => layer.id === animationMenu.layerId) ? 'layer' : session.document.groups.some((group) => group.id === animationMenu.layerId) ? 'group' : null
    : null
  const animationMenuGroupMask = animationMenu?.kind === 'mask' && !animationMenuCel ? animationGroupMaskAt(timeline, animationMenu.layerId, animationMenu.frameId) : null
  const animationMenuMask = animationMenu?.kind === 'mask' ? animationMaskAt(timeline, animationMenu.layerId, animationMenu.frameId) : null
  const animationMenuCelMask = animationMenu?.kind === 'cel' ? animationMaskAt(timeline, animationMenu.layerId, animationMenu.frameId) : null
  const animationMenuCelHasContent = cachedCelHasContent(celLookup.resolve(animationMenuCel), session.document.palette, animationMenu?.kind === 'cel' || animationMenu?.kind === 'mask' ? animationMenu.frameId === timeline.activeFrameId ? session.contentRevision : 0 : 0)
  const animationMenuLayerMaskCreationBlocked = animationMenuOwnerKind === 'layer' && !animationMenuMask && !animationMenuCelMask && !animationMenuCelHasContent
  const animationMenuLayerMaskPasteBlocked = animationMenuOwnerKind === 'layer' && !animationMenuCelHasContent
  const selectedAnimationCelsCanLink = animationMenu?.kind === 'cel' && (() => {
    const selected = new Set(session.selectedAnimationCellKeys)
    const targets = timeline.cels.filter((cel) => selected.has(animationCelKey(cel.layerId, cel.frameId)))
    if (targets.length < 2 || !targets.some((cel) => cachedCelHasContent(celLookup.resolve(cel), session.document.palette, cel.frameId === timeline.activeFrameId ? session.contentRevision : 0))) return false
    const counts = new Map<string, number>()
    for (const cel of targets) counts.set(cel.layerId, (counts.get(cel.layerId) ?? 0) + 1)
    return [...counts.values()].some((count) => count > 1)
  })()
  const selectedAnimationCelsCanUnlink = animationMenu?.kind === 'cel' && (() => {
    const selected = new Set(session.selectedAnimationCellKeys)
    return timeline.cels.some((cel) => {
      if (!selected.has(animationCelKey(cel.layerId, cel.frameId))) return false
      const source = celLookup.resolve(cel)
      return Boolean(cel.linkedCelId) || Boolean(source && timeline.cels.some((candidate) => candidate.id !== source.id && celLookup.resolve(candidate)?.id === source.id))
    })
  })()
  const selectedAnimationMasksCanLink = animationMenu?.kind === 'mask' && (() => {
    const counts = new Map<string, number>()
    for (const key of session.selectedAnimationMaskCellKeys) {
      const target = parseAnimationCelKey(key)
      if (!target || !animationMaskSlotAt(timeline, target.layerId, target.frameId)) continue
      counts.set(target.layerId, (counts.get(target.layerId) ?? 0) + 1)
    }
    return [...counts.values()].some((count) => count > 1)
  })()
  const selectedAnimationMasksCanUnlink = animationMenu?.kind === 'mask' && (() => {
    const selected = new Set(session.selectedAnimationMaskCellKeys)
    const masks = [
      ...(timeline.layerMasks ?? []).map((entry) => ({ key: animationCelKey(entry.layerId, entry.frameId), mask: entry.mask })),
      ...(timeline.groupMasks ?? []).map((entry) => ({ key: animationCelKey(entry.groupId, entry.frameId), mask: entry.mask }))
    ]
    const selectedRoots = new Set(masks.flatMap((item) => selected.has(item.key) ? [resolveAnimationMask(timeline, item.mask)?.id ?? item.mask.id] : []))
    return masks.some((item) => Boolean(item.mask.linkedMaskId && (selected.has(item.key) || selectedRoots.has(resolveAnimationMask(timeline, item.mask)?.id ?? ''))))
  })()
  const shortcutLayerTargets = (): LayerFormTarget[] => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return []
    const selected = selectedRowsForProperties(active)
    if (selected.length > 0) return selected
    const activeLayer = active.document.layers.find((layer) => layer.id === active.document.activeLayerId)
    return activeLayer ? [{ kind: 'layer', id: activeLayer.id }] : []
  }
  const shortcutLoopSection = (): AnimationLoopSection | null => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return null
    const activeTimeline = ensureAnimationDocument(active.document)
    const selectedFrameIds = new Set(active.selectedAnimationFrameIds)
    if (selectedFrameIds.size > 0) {
      const exact = (activeTimeline.loopSections ?? []).find((section) => {
        const range = resolveAnimationLoopSectionRange(activeTimeline, section)
        if (!range || range.endIndex - range.startIndex + 1 !== selectedFrameIds.size) return false
        return activeTimeline.frames.slice(range.startIndex, range.endIndex + 1).every((frame) => selectedFrameIds.has(frame.id))
      })
      if (exact) return exact
    }
    return animationLoopSectionAtFrame(activeTimeline, activeTimeline.activeFrameId)
  }
  const toggleShortcutAnimationMask = (): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return
    const activeTimeline = ensureAnimationDocument(active.document)
    const selectedKey = active.selectedAnimationMaskCellKeys[0] ?? active.selectedAnimationCellKeys[0]
    const selectedTarget = selectedKey ? parseAnimationCelKey(selectedKey) : null
    const groupId = selectedTarget
      ? active.document.groups.some((group) => group.id === selectedTarget.layerId) ? selectedTarget.layerId : null
      : active.selectedGroupIds[0] ?? active.selectedGroupId
    const frameId = selectedTarget?.frameId ?? activeTimeline.activeFrameId
    if (groupId) {
      if (animationGroupMaskAt(activeTimeline, groupId, frameId)) store.deleteGroupMask(groupId, frameId)
      else store.createGroupMask(groupId, frameId)
      return
    }
    const layerId = selectedTarget?.layerId ?? active.document.activeLayerId
    const lookup = createAnimationCelLookup(activeTimeline)
    const cel = lookup.at(layerId, frameId)
    const mask = animationMaskAt(activeTimeline, layerId, frameId)
    if (mask && cel) store.deleteLayerMask(cel.id)
    else store.createLayerMask(cel?.id ?? layerId, frameId)
  }
  shortcutCommandHandlerRef.current = (id): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!active) return
    const activeTimeline = ensureAnimationDocument(active.document)
    const activeLayer = active.document.layers.find((layer) => layer.id === active.document.activeLayerId) ?? null
    const activeGroupId = active.selectedGroupIds[0] ?? active.selectedGroupId
    const targets = shortcutLayerTargets()
    const primaryTarget = targets[0] ?? null
    switch (id) {
      case 'newTilemapLayer': openTilemapLayerDialog(); break
      case 'newFreeTileLayer': openFreeTileLayerDialog(); break
      case 'newBackgroundLayer': openBackgroundLayerDialog(); break
      case 'createLinkedLayer': if (activeLayer && !activeLayer.kind && !activeLayer.background) store.createLinkedLayer(activeLayer.id); break
      case 'convertLayerToBackground': if (activeLayer && !activeLayer.kind && !activeLayer.background) store.setLayerBackground(activeLayer.id, true); break
      case 'convertLayerToTilemap': if (activeLayer && !activeLayer.kind && !activeLayer.background && !hasConfiguredLayerStyles(activeLayer.layerStyles)) setTilemapLayerDialog({ mode: 'convert', layerId: activeLayer.id }); break
      case 'convertLayerToRaster': if (activeLayer && (activeLayer.background || activeLayer.kind || hasConfiguredLayerStyles(activeLayer.layerStyles))) store.rasterizeLayer(activeLayer.id); break
      case 'openLayerProperties': {
        if (targets.length > 1) editSelectedRows()
        else if (primaryTarget?.kind === 'group') {
          const group = active.document.groups.find((candidate) => candidate.id === primaryTarget.id)
          if (group) editGroup(group)
        } else if (primaryTarget?.kind === 'layer') {
          const layer = active.document.layers.find((candidate) => candidate.id === primaryTarget.id)
          if (layer) editLayer(layer)
        }
        break
      }
      case 'toggleLayerMask': if (activeLayer) store.createLayerMasksForLayer(activeLayer.id); break
      case 'toggleGroupMask': if (activeGroupId) { if (animationGroupMaskAt(activeTimeline, activeGroupId, activeTimeline.activeFrameId)) store.deleteGroupMask(activeGroupId, activeTimeline.activeFrameId); else store.createGroupMask(activeGroupId, activeTimeline.activeFrameId) } break
      case 'openLayerStyles': if (primaryTarget) setLayerStyleDialog({ source: primaryTarget, targets }); break
      case 'toggleLayerStyles': {
        if (!primaryTarget) break
        const owner = primaryTarget.kind === 'layer'
          ? active.document.layers.find((layer) => layer.id === primaryTarget.id)
          : active.document.groups.find((group) => group.id === primaryTarget.id)
        if (hasConfiguredLayerStyles(owner?.layerStyles)) store.setLayerStylesEnabled(targets, !hasEnabledLayerStyles(owner?.layerStyles))
        break
      }
      case 'copyLayerStyles': if (primaryTarget) store.copyLayerStyles(primaryTarget.kind, primaryTarget.id); break
      case 'pasteLayerStyles': if (targets.length > 0) store.pasteLayerStyles(targets); break
      case 'clearLayerStyles': if (targets.length > 0) store.clearLayerStyles(targets); break
      case 'openLayerSettings': openLayerSettings(); break
      case 'enableAnimationFrames': updateAnimationFrameDisabled(false); break
      case 'disableAnimationFrames': updateAnimationFrameDisabled(true); break
      case 'toggleAnimationFramesDisabled': updateAnimationFrameDisabled('toggle'); break
      case 'copyAnimationFrames': store.copySelectedAnimationFrames(); break
      case 'pasteAnimationFrames': store.pasteAnimationFrames(); break
      case 'pasteAnimationCels': store.pasteAnimationCels(); break
      case 'copyAnimationMasks': store.copySelectedAnimationMasks(); break
      case 'pasteAnimationMasks': store.pasteAnimationMasks(); break
      case 'connectAnimationCels': store.connectSelectedAnimationCels(); break
      case 'disconnectAnimationCels': store.disconnectSelectedAnimationCels(); break
      case 'connectAnimationMasks': store.connectSelectedAnimationMasks(); break
      case 'disconnectAnimationMasks': store.disconnectSelectedAnimationMasks(); break
      case 'toggleAnimationMask': toggleShortcutAnimationMask(); break
      case 'createAnimationLoopSection': openLoopSectionCreator(); break
      case 'openAnimationFrameProperties': openFramePropertiesFor(activeTimeline.activeFrameId); break
      case 'playAnimationLoopSection': {
        const section = shortcutLoopSection()
        if (section) store.playAnimationLoopSection(section.id)
        break
      }
      case 'openAnimationLoopSectionProperties': {
        const section = shortcutLoopSection()
        if (section) openLoopSectionPropertiesFor(section.id)
        break
      }
      case 'deleteAnimationLoopSection': {
        const section = shortcutLoopSection()
        if (section) store.deleteAnimationLoopSection(section.id)
        break
      }
      case 'openAnimationCelProperties': {
        const selectedTarget = parseAnimationCelKey(active.selectedAnimationCellKeys[0] ?? '')
        openCelProperties(selectedTarget?.layerId ?? active.document.activeLayerId, selectedTarget?.frameId ?? activeTimeline.activeFrameId)
        break
      }
    }
  }
  const animationColumnResizer = <span className="layer-animation-column-resizer" role="separator" aria-label={t('timeline.resizeLayerArea')} aria-orientation="vertical" aria-valuemin={layerLabelWidthLimits.min} aria-valuemax={layerLabelWidthLimits.max} aria-valuenow={layerLabelWidth} tabIndex={0} onPointerDown={beginLayerLabelResize} onKeyDown={(event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); setStoredLayerLabelWidth(layerLabelWidth - 12) } else if (event.key === 'ArrowRight') { event.preventDefault(); setStoredLayerLabelWidth(layerLabelWidth + 12) } }} />
  const animationLoopSectionBars = loopSectionLayout.items.map(({ section, startIndex, span, lane, laneSpan }) => {
    const rangeFrameIds = timeline.frames.slice(startIndex, startIndex + span).map((frame) => frame.id)
    const selected = rangeFrameIds.length > 0 && rangeFrameIds.every((frameId) => session.selectedAnimationFrameIds.includes(frameId))
    const playing = session.animationPlaybackLoopSectionId === section.id && session.animationPlaying
    const endIndex = startIndex + span - 1
    return <button type="button" key={section.id} data-animation-loop-section-id={section.id} className={`animation-loop-section ${selected ? 'selected' : ''} ${playing ? 'playing' : ''}`} style={{ gridColumn: `${startIndex + 1} / span ${span}`, gridRow: `${lane + 1} / span ${laneSpan}`, zIndex: lane + 1 }} aria-label={t('timeline.loopSectionRange', { name: section.name, start: startIndex + 1, end: endIndex + 1 })} title={t('timeline.loopSectionSummary', { name: section.name, start: startIndex + 1, end: endIndex + 1, direction: t(section.direction === 'reverse' ? 'timeline.loopSectionReverse' : 'timeline.loopSectionForward'), repeats: section.repeatCount ?? t('timeline.loopSectionInfiniteShort') })} onClick={(event) => { if (suppressAnimationClickRef.current) { event.preventDefault(); event.stopPropagation(); return } event.stopPropagation(); selectLoopSection(section) }} onDoubleClick={(event) => { event.stopPropagation(); openLoopSectionPropertiesFor(section.id) }} onContextMenu={(event) => openLoopSectionMenu(event, section.id)}>
      <span className="animation-loop-section-edge animation-loop-section-edge-start" aria-hidden="true" onPointerDown={(event) => beginAnimationLoopSectionResize(event, section.id, 'start')} />
      <span className="animation-loop-section-label">{section.name}</span>
      <span className="animation-loop-section-edge animation-loop-section-edge-end" aria-hidden="true" onPointerDown={(event) => beginAnimationLoopSectionResize(event, section.id, 'end')} />
    </button>
  })
  const animationLoopSectionHeader = visibleLoopSectionLaneCount > 0
    ? <div className="animation-loop-section-viewport" onPointerDown={(event) => event.stopPropagation()}><div ref={animationLoopSectionTrackRef} className="animation-loop-section-track">{animationLoopSectionBars}</div></div>
    : null
  const animationFrameGridDecorations = <>
    {showActiveFrameColumn && <span className="animation-active-cell-column" style={{ '--animation-frame-index': timelineActiveFrameIndex, '--animation-frame-span': 1 } as CSSProperties} aria-hidden="true" />}
    {selectedCellFrameRanges.map((range) => <span key={`active-cell-frame-${range.start}-${range.span}`} className="animation-active-cell-column" style={{ '--animation-frame-index': range.start, '--animation-frame-span': range.span } as CSSProperties} aria-hidden="true" />)}
    {selectedCellLayerRows.map((row) => <span key={`active-cell-layer-${row}`} className="animation-active-cell-row" style={{ '--animation-row-top': displayRowTop(row), '--animation-row-height': displayRowSpanHeight(row, 1) } as CSSProperties} aria-hidden="true" />)}
    {selectionOutlineVisible && selectedFrameRanges.map((range) => <span key={`${range.start}-${range.span}`} data-animation-frame-selection={timeline.frames.slice(range.start, range.start + range.span).map((frame) => frame.id).join(' ')} className="animation-frame-selection-column" style={{ '--animation-frame-index': range.start, '--animation-frame-span': range.span } as CSSProperties} aria-hidden="true" />)}
    {animationFrameDropTarget && timeline.frames.findIndex((frame) => frame.id === animationFrameDropTarget.frameId) >= 0 && <span className="animation-frame-drop-line" style={{ '--animation-frame-drop-index': timeline.frames.findIndex((frame) => frame.id === animationFrameDropTarget.frameId) + (animationFrameDropTarget.insertAfter ? 1 : 0) } as CSSProperties} aria-hidden="true" />}
  </>
  const animationFrameHeaders = timeline.frames.map((frame, index) => {
    const visualFrame = visualFrameStateById.get(frame.id)
    const frameActive = visualFrame?.active === true
      || (cellSelectionActive && selectedActivityFrameIds.has(frame.id))
    const frameSelected = Boolean(timelineVisualState.selectionGuidesVisible && visualFrame?.selected)
    return <button type="button" data-animation-frame-id={frame.id} data-frame-index={index} key={`header-${frame.id}`} className={`layer-animation-frame-header ${frameActive ? 'active' : ''} ${frameSelected ? 'selected-animation-frame' : ''} ${frame.disabled === true ? 'disabled-frame' : ''} ${draggingAnimationFrameIds.includes(frame.id) ? 'dragging' : ''}`} aria-label={t('timeline.frameNumber', { number: index + 1 })} title={`${t('timeline.frameNumber', { number: index + 1 })} · ${frame.duration} ms`} onPointerDown={(event) => beginAnimationFrameDrag(event, frame.id)} onPointerMove={(event) => updateAnimationItemCursor(event, frame.id)} onPointerLeave={(event) => { event.currentTarget.style.cursor = '' }} onClick={(event) => { if (suppressAnimationClickRef.current) { event.preventDefault(); event.stopPropagation(); return } if (event.detail === 0) selectAnimationFrame(frame.id, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace') }} onDoubleClick={() => openFramePropertiesFor(frame.id)} onContextMenu={(event) => openFrameMenu(event, frame.id)}>{frame.disabled === true && <svg className="layer-animation-frame-disabled-mark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="100" x2="100" y2="0" vectorEffect="non-scaling-stroke" /></svg>}<strong>{index + 1}</strong>{layerDensity !== 'compact' && <small>{frame.duration}</small>}</button>
  })
  const hideSideDockActions = sideDocked && layerSettings.sideDockAutoHide
  const densityLabel = t(layerDensityLabelKeys[layerSettings.density])
  const densityDescription = t(layerDensityDescriptionKeys[layerSettings.density])
  const renderAnimationMaskRow = (
    displayRow: Extract<LayerDisplayRow, { kind: 'mask' }>,
    visualRow: (typeof timelineVisualState.rows)[number] | undefined,
  ): ReactNode => {
    const maskRowActiveRef = activeMaskOwnerKey === `${displayRow.ownerKind}:${displayRow.owner.id}`
      ? { kind: 'mask' as const, ownerKind: displayRow.ownerKind, ownerId: displayRow.owner.id }
      : null
    const maskRowFlags = timelineVisualClasses(visualRow, undefined, timelineVisualState.selectionGuidesVisible, maskRowActiveRef)
    const activeCel = displayRow.ownerKind === 'layer' ? celLookup.at(displayRow.owner.id, visualActiveFrameId) : null
    const activeMaskSlot = maskVisualByOwnerFrame.get(maskOwnerFrameKey(displayRow.ownerKind, displayRow.owner.id, visualActiveFrameId)) ?? null
    const activeMask = resolveAnimationMask(timeline, activeMaskSlot) ?? activeMaskSlot
    const maskOwnerKey = `${displayRow.ownerKind}:${displayRow.owner.id}`
    const maskControlsDisabled = displayRow.ownerKind !== 'layer' || !activeCel || !activeMask
    const maskLocked = activeMask?.locked === true
    const maskAutoLink = activeMask?.autoLinkAnimationCels === true
    const maskRowVisualClasses = {
      ...maskRowFlags,
      // A mask occupies its own timeline row. Its position is attached to the
      // owner layer, but its activity/selection is independent of that row.
      active: !normalLayerFrameScopeActive && maskRowFlags.active,
      selected: Boolean(
        session.selectedAnimationFrameIds.length === 0
          && animationGestureSelection?.kind !== 'frame'
          && timelineVisualState.selectionGuidesVisible
          && session.selectedAnimationMaskRowKeys.includes(maskOwnerKey),
      ),
    }
    const maskNameKey = displayRow.ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask'
    const maskRowTooltip = <><strong>{t(maskNameKey)}</strong><span>{t('layers.layerMaskDescription')}</span><small>{t('layers.layerMaskUsage')}</small></>
    const maskVisibilityTarget: LayerPanelToggleTarget | null = displayRow.ownerKind === 'layer'
      ? activeCel ? { control: 'visibility', ownerKind: 'layer-mask', id: activeCel.id } : null
      : { control: 'visibility', ownerKind: 'group-mask', id: displayRow.owner.id, frameId: visualActiveFrameId }
    return <button type="button" key={`mask-row-${displayRow.owner.id}`} data-layer-mask-row-owner={displayRow.owner.id} className={`layer-row layer-mask-row ${maskRowVisualClasses.selected ? 'selected' : ''} ${maskRowVisualClasses.active ? 'active-layer' : ''} ${activeMask && altCopyReady ? 'mask-edit-ready' : ''}`} style={{ '--layer-depth': displayRow.depth } as React.CSSProperties} onPointerDown={(event) => { if (event.button !== 0) return; if (!event.altKey || !activeMask) { suppressMaskRowClickRef.current = false; return } if (!toggleAnimationMaskIsolatedView(displayRow.owner.id, visualActiveFrameId, event.shiftKey)) return; suppressMaskRowClickRef.current = true; event.preventDefault(); event.stopPropagation() }} onPointerCancel={() => { suppressMaskRowClickRef.current = false }} onClick={(event) => { if (suppressMaskRowClickRef.current || event.altKey) { suppressMaskRowClickRef.current = false; event.preventDefault(); event.stopPropagation(); return } store.selectAnimationMaskRow(displayRow.ownerKind, displayRow.owner.id, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace') }} onContextMenu={(event) => { event.stopPropagation(); openCelMenu(event, displayRow.owner.id, visualActiveFrameId, 'mask') }}>
      <span className="layer-visibility layer-mask-row-visibility" role="button" tabIndex={-1} aria-label={t(activeMask?.visible === false ? 'layers.showLayer' : 'layers.hideLayer')} onPointerDown={(event) => { if (activeMask && maskVisibilityTarget) beginLayerPanelToggle(event, maskVisibilityTarget, activeMask.visible); else event.stopPropagation() }} onPointerEnter={(event) => { if (maskVisibilityTarget) continueLayerPanelToggle(event, maskVisibilityTarget) }} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{activeMask?.visible === false ? <PixelUtilityIcon kind="eyeOff" /> : <PixelUtilityIcon kind="eye" />}</span>
      <span className={`layer-lock-toggle layer-mask-row-lock-slot ${maskLocked ? 'locked' : ''}`} role="button" tabIndex={maskControlsDisabled ? -1 : 0} aria-label={t(maskLocked ? 'layers.unlockLayer' : 'layers.lockLayer')} aria-disabled={maskControlsDisabled} aria-pressed={maskLocked} onPointerDownCapture={(event) => handleLayerMaskControlPointerDown(event, () => { if (activeCel) toggleLayerMaskLocked(activeCel.id, maskLocked) }, maskControlsDisabled)} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleLayerMaskControlKeyDown(event, () => { if (activeCel) toggleLayerMaskLocked(activeCel.id, maskLocked) }, maskControlsDisabled)}><PixelUtilityIcon kind={maskLocked ? 'lock' : 'unlock'} /></span>
      <span className={`layer-auto-link-toggle layer-mask-row-auto-link-slot ${maskAutoLink ? 'enabled' : ''}`} role="button" tabIndex={maskControlsDisabled ? -1 : 0} title={t(maskAutoLink ? 'layers.autoLinkAnimationCelsOff' : 'layers.autoLinkAnimationCelsOn')} aria-label={t(maskAutoLink ? 'layers.autoLinkAnimationCelsOff' : 'layers.autoLinkAnimationCelsOn')} aria-disabled={maskControlsDisabled} aria-pressed={maskAutoLink} onPointerDownCapture={(event) => handleLayerMaskControlPointerDown(event, () => { if (activeCel) toggleLayerMaskAutoLink(activeCel.id, maskAutoLink) }, maskControlsDisabled)} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleLayerMaskControlKeyDown(event, () => { if (activeCel) toggleLayerMaskAutoLink(activeCel.id, maskAutoLink) }, maskControlsDisabled)}><PixelAutoLinkIcon enabled={maskAutoLink} /></span>
      <span className="layer-name"><span>{t(maskNameKey)}</span><small>{displayRow.owner.name}</small></span>
      <Tooltip className="layer-status-icon-tooltip layer-mask-row-layer-icon" content={maskRowTooltip}><span className="layer-mask-row-icon" aria-hidden="true"><PixelUtilityIcon kind="layerMask" /></span></Tooltip>
    </button>
  }
  return <><section ref={floating.ref} className={`panel layers-panel layer-density-${layerDensity} ${layerSettings.timelineHidden ? 'timeline-hidden' : ''} ${visibleLoopSectionLaneCount > 0 ? 'has-animation-loop-sections' : ''} ${loopSectionResizePreview ? 'loop-section-resizing' : ''} ${session.animationPlaying ? 'animation-playing' : ''} ${animationItemDragging ? 'animation-item-dragging' : ''} ${floating.style ? 'floating-panel' : ''} ${draggingCopy ? 'layer-copy-drag' : ''} ${layerStyleDrag ? 'layer-style-copy-drag' : ''}`} data-command-scope="layers" style={{ ...floating.style, '--layer-label-width': `${layerLabelWidth}px`, '--layer-frame-count': timeline.frames.length, '--animation-loop-section-lanes': visibleLoopSectionLaneCount, '--animation-loop-section-track-height': `${visibleLoopSectionLaneCount * 20}px` } as CSSProperties} onPointerDown={floating.bringToFront} onWheel={handleLayerPanelWheel} onContextMenu={onPanelContextMenu}>
    <header onPointerDown={(event) => floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag)}>{integratedFreeTileInstanceLayer ? <><span className="free-tile-instance-header" onPointerDown={(event) => event.stopPropagation()}><button type="button" title={t('freeTiles.backToLayers')} aria-label={t('freeTiles.backToLayers')} onClick={() => store.setFreeTileInstanceLayerView(null)}><PixelUtilityIcon kind="left" /></button><strong className="layer-panel-title">{t('freeTiles.instanceLayersTitle', { name: integratedFreeTileInstanceLayer.name })}</strong></span><span className="panel-actions" onPointerDown={(event) => event.stopPropagation()}><FreeTileInstancePanelSettings /></span></> : <>{layerSettings.timelineHidden && <strong className="layer-panel-title">{t('panel.layers')}</strong>}<div className="layer-animation-toolbar" onPointerDown={(event) => event.stopPropagation()}><span className="layer-animation-playback">
        <button type="button" title={t('timeline.firstFrame')} aria-label={t('timeline.firstFrame')} onClick={() => selectAnimationEdge('first')}><PlaybackPixelIcon kind="first" /></button>
        <button type="button" title={t('timeline.previousFrame')} aria-label={t('timeline.previousFrame')} onClick={() => selectAnimationStep(-1)}><PlaybackPixelIcon kind="previous" /></button>
        <button type="button" className={session.animationPlaying ? 'active' : ''} title={session.animationPlaying ? t('timeline.pause') : t('timeline.play')} aria-label={session.animationPlaying ? t('timeline.pause') : t('timeline.play')} onClick={() => store.setAnimationPlaying(!session.animationPlaying)} onContextMenu={(event) => openAnimationMenu(event, { kind: 'playback', x: event.clientX, y: event.clientY })}><PlaybackPixelIcon kind={session.animationPlaying ? 'pause' : 'play'} /></button>
        <button type="button" title={t('timeline.nextFrame')} aria-label={t('timeline.nextFrame')} onClick={() => selectAnimationStep(1)}><PlaybackPixelIcon kind="next" /></button>
        <button type="button" title={t('timeline.lastFrame')} aria-label={t('timeline.lastFrame')} onClick={() => selectAnimationEdge('last')}><PlaybackPixelIcon kind="last" /></button>
      </span><span className="layer-animation-edit">
        <button type="button" className={layerSettings.onionSkin.enabled ? 'active' : ''} title={t('layers.onionSkinEnabled')} aria-label={t('layers.onionSkinEnabled')} aria-pressed={layerSettings.onionSkin.enabled} onClick={toggleOnionSkin}><PixelUtilityIcon kind="onion" /></button>
        {!hideSideDockActions && <button type="button" className="timeline-frame-edit-button" title={t('timeline.addFrame')} aria-label={t('timeline.addFrame')} onClick={() => store.duplicateAnimationFrame()}><PixelUtilityIcon kind="plus" /></button>}
        {!hideSideDockActions && <button type="button" className="timeline-frame-edit-button" title={t('timeline.deleteFrame')} aria-label={t('timeline.deleteFrame')} disabled={timeline.frames.length <= 1} onClick={() => store.deleteSelectedAnimationItems()}><PixelUtilityIcon kind="delete" /></button>}
      </span></div><span className="panel-actions" onPointerDown={(event) => event.stopPropagation()}>{!hideSideDockActions && <button className="layer-structure-edit-button" title={t('layers.new')} aria-label={t('layers.new')} onClick={() => void store.addLayer()}><PixelUtilityIcon kind="plus" /></button>}{!hideSideDockActions && <button className="layer-structure-edit-button" title={t('layers.newTilemap')} aria-label={t('layers.newTilemap')} onClick={openTilemapLayerDialog}><PixelUtilityIcon kind="tilemap" /></button>}{!hideSideDockActions && <button className="layer-structure-edit-button" title={t('layers.newFreeTile')} aria-label={t('layers.newFreeTile')} onClick={openFreeTileLayerDialog}><PixelUtilityIcon kind="freeTile" /></button>}{!hideSideDockActions && <button className="layer-structure-edit-button" title={t('layers.newGroupShortcut')} aria-label={t('layers.newGroup')} onClick={() => store.createLayerGroup()}><PixelUtilityIcon kind="newFolder" /></button>}{!hideSideDockActions && <button className="layer-structure-edit-button" title={t('layers.deleteSelected')} aria-label={t('layers.deleteSelected')} onClick={() => store.deleteSelectedLayers()}><PixelUtilityIcon kind="delete" /></button>}<button title={t('layers.settings')} aria-label={t('layers.settings')} onClick={openLayerSettings}><PixelUtilityIcon kind="properties" /></button></span></>}{animationLoopSectionHeader}</header>
    {integratedFreeTileInstanceLayer ? <FreeTileInstanceLayers session={session} layer={integratedFreeTileInstanceLayer} listRef={layerListRef} /> : <div ref={layerListRef} className={`layer-list layer-animation-list component-scrollbar ${selectedAnimationOutlineRows.length > 0 ? 'has-layer-selection-outline' : ''}`} style={{ '--layer-frame-count': timeline.frames.length, '--layer-selection-start': layerSelectionStart, '--layer-selection-span': layerSelectionSpan } as CSSProperties} onScroll={syncAnimationLoopSectionScroll} onPointerDown={(event) => { if (event.target === event.currentTarget) clearSelectionFromBlank() }} onContextMenu={(event) => { const target = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id], [data-group-id]'); if (target?.dataset.layerId) openLayerContextMenu(event, 'layer', target.dataset.layerId); else if (target?.dataset.groupId) openLayerContextMenu(event, 'group', target.dataset.groupId); else openLayerCreateContextMenu(event) }}><div className="layer-animation-tree"><div className="layer-animation-corner"><ActiveFrameSync documentId={session.document.id} frameIds={timeline.frames.map((frame) => frame.id)} containerRef={layerListRef} suppressActiveGuide={suppressCellSelectionGuides} activeFrameIdOverride={gestureActiveFrameId} /></div>{animationColumnResizer}{displayRows.map((displayRow, rowIndex) => {
      const visualRow = timelineVisualState.rows[rowIndex]
      if (displayRow.kind === 'mask') return renderAnimationMaskRow(displayRow, visualRow)
      const node = displayRow.node
      if (node.kind === 'group') {
        const collapsed = session.collapsedGroupIds.includes(node.group.id)
        const lockingAncestor = getGroupLockingAncestor(session.document, node.group)
        const groupInsideTarget = dropTarget?.kind === 'group' && dropTarget.id === node.group.id
        const groupIndicator = dropTarget?.kind === 'above-group' && dropTarget.id === node.group.id
            ? <span className={`layer-drop-indicator ${dropTarget.insertAfter === false ? 'below' : 'above'}`} style={{ left: `${8 + node.depth * 14}px` }} aria-hidden="true"><i /><b /><i /></span>
            : null
        const displayColorSegments = displayColorStripeSegments(node.group, 'group', node.depth)
        const groupHasLayerStyles = hasConfiguredLayerStyles(node.group.layerStyles)
        const groupOwnerKey = `group:${node.group.id}`
        const groupRowSelected = timelineVisualState.selectionGuidesVisible && effectiveSelectedGroupIds.length > 0 && !hasNonRowAnimationItemSelection && visualRow?.selected
        const groupRowVisualClasses = {
          ...timelineVisualClasses(visualRow, undefined, timelineVisualState.selectionGuidesVisible),
          active: Boolean(visualRow?.active && activeMaskOwnerKey !== groupOwnerKey),
          selected: Boolean(groupRowSelected || (timelineVisualState.selectionGuidesVisible && layerSelectionActive && visualRow?.selected)),
        }
        return <button key={node.group.id} data-group-id={node.group.id} className={`layer-row group-row ${node.group.clippingMask === true ? 'clipping-mask' : ''} ${groupHasLayerStyles ? 'has-layer-style' : ''} ${groupRowVisualClasses.active ? 'active-layer' : ''} ${groupRowVisualClasses.selected ? 'selected' : ''} ${draggingGroupId === node.group.id ? 'dragging' : ''} ${groupInsideTarget ? 'group-drop-target' : ''} ${layerStyleDrag?.target?.kind === 'group' && layerStyleDrag.target.id === node.group.id ? 'layer-style-drop-target' : ''}`} style={{ '--layer-depth': node.depth } as React.CSSProperties} onPointerDown={(event) => beginGroupDrag(event, node.group.id)} onDoubleClick={() => editGroupRow(node.group)}>{groupIndicator}{displayColorSegments.map((segment, index) => <span key={`group-color-stripe-${node.group.id}-${index}`} className="layer-color-stripe" style={{ left: `${segment.left}px`, width: `${segment.width}px`, backgroundColor: `rgba(${segment.color.r}, ${segment.color.g}, ${segment.color.b}, ${segment.color.a / 255})` }} aria-hidden="true" />)}<span className="layer-visibility" role="button" tabIndex={-1} aria-label={t(node.group.visible ? 'layers.hideGroup' : 'layers.showGroup')} onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'visibility', ownerKind: 'group', id: node.group.id }, node.group.visible)} onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'visibility', ownerKind: 'group', id: node.group.id })} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{node.group.visible ? <PixelUtilityIcon kind="eye" /> : <PixelUtilityIcon kind="eyeOff" />}</span><span className={`layer-lock-toggle ${node.group.locked || lockingAncestor ? 'locked' : ''}`} role="button" tabIndex={-1} title={lockingAncestor ? t('layers.lockedByGroup', { name: lockingAncestor.name }) : undefined} aria-label={lockingAncestor ? t('layers.unlockGroup') : t(node.group.locked ? 'layers.unlockGroup' : 'layers.lockGroup')} aria-disabled={Boolean(lockingAncestor)} aria-pressed={node.group.locked || Boolean(lockingAncestor)} onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'lock', ownerKind: 'group', id: node.group.id }, node.group.locked, lockingAncestor?.name)} onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'lock', ownerKind: 'group', id: node.group.id })} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{node.group.locked || lockingAncestor ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}</span><span className="group-folder" role="button" tabIndex={-1} aria-label={t(collapsed ? 'layers.expandGroup' : 'layers.collapseGroup')} title={t(collapsed ? 'layers.expandGroup' : 'layers.collapseGroup')} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); store.toggleGroupCollapsed(node.group.id) }}>{collapsed ? <PixelUtilityIcon kind="folder" /> : <PixelUtilityIcon kind="folderOpen" />}</span><Tooltip className="layer-name" content={node.group.description?.trim()}><span>{node.group.name}</span><small>{blendOptions.find((option) => option.value === node.group.blendMode)?.label} · {Math.round(node.group.opacity * 100)}%</small></Tooltip>{node.group.clippingMask === true && <Tooltip className="layer-status-icon-tooltip" content={clippingMaskTooltip}><span className="layer-clipping-mask-indicator" aria-hidden="true"><PixelUtilityIcon kind="clippingMask" /></span></Tooltip>}{groupHasLayerStyles && layerStyleIndicator({ kind: 'group', id: node.group.id })}</button>
      }
      const lockingGroup = getLayerLockingGroup(session.document, node.layer)
      const displayColorSegments = displayColorStripeSegments(node.layer, 'layer', node.depth)
      const indicator = dropTarget?.kind === 'layer' && dropTarget.id === node.layer.id
        ? <span className={`layer-drop-indicator ${dropTarget.insertAfter ? 'above' : 'below'}`} style={{ left: `${8 + node.depth * 14}px` }} aria-hidden="true"><i /><b /><i /></span>
        : null
      const layerOwnerKey = `layer:${node.layer.id}`
      const layerHasLayerStyles = hasConfiguredLayerStyles(node.layer.layerStyles)
      const layerRowVisualClasses = {
        ...timelineVisualClasses(visualRow, undefined, timelineVisualState.selectionGuidesVisible),
        active: Boolean(!maskVisualSelectionActive && visualRow?.active && activeMaskOwnerKey !== layerOwnerKey),
        selected: Boolean(timelineVisualState.selectionGuidesVisible && layerSelectionActive && visualRow?.selected),
      }
      return <button key={node.layer.id} data-layer-id={node.layer.id} className={`layer-row ${node.layer.kind === 'text' ? 'text-layer' : ''} ${node.layer.kind === 'tilemap' ? 'tilemap-layer' : ''} ${node.layer.kind === 'free-tile' ? 'free-tile-layer' : ''} ${node.layer.background ? 'background-layer' : ''} ${node.layer.linkedContentId ? 'linked-layer' : ''} ${node.layer.clippingMask === true ? 'clipping-mask' : ''} ${layerHasLayerStyles ? 'has-layer-style' : ''} ${node.depth > 0 ? 'group-member' : ''} ${layerRowVisualClasses.selected ? 'selected' : ''} ${layerRowVisualClasses.active ? 'active-layer' : ''} ${!maskVisualSelectionActive && ordinaryCelSelectionVisible && visualRow?.selectedByCell ? 'cel-owner-active' : ''} ${draggingIds.includes(node.layer.id) ? 'dragging' : ''} ${layerStyleDrag?.target?.kind === 'layer' && layerStyleDrag.target.id === node.layer.id ? 'layer-style-drop-target' : ''}`} style={{ '--layer-depth': node.depth } as React.CSSProperties} onPointerDown={(event) => beginLayerDrag(event, node.layer.id)} onDoubleClick={() => editLayerRow(node.layer)}>{indicator}{displayColorSegments.map((segment, index) => <span key={`layer-color-stripe-${node.layer.id}-${index}`} className="layer-color-stripe" style={{ left: `${segment.left}px`, width: `${segment.width}px`, backgroundColor: `rgba(${segment.color.r}, ${segment.color.g}, ${segment.color.b}, ${segment.color.a / 255})` }} aria-hidden="true" />)}<span className="layer-visibility" role="button" tabIndex={-1} aria-label={t(node.layer.visible ? 'layers.hideLayer' : 'layers.showLayer')} onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'visibility', ownerKind: 'layer', id: node.layer.id }, node.layer.visible)} onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'visibility', ownerKind: 'layer', id: node.layer.id })} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{node.layer.visible ? <PixelUtilityIcon kind="eye" /> : <PixelUtilityIcon kind="eyeOff" />}</span><span className={`layer-lock-toggle ${node.layer.locked || lockingGroup ? 'locked' : ''}`} role="button" tabIndex={-1} title={lockingGroup ? t('layers.lockedByGroup', { name: lockingGroup.name }) : undefined} aria-label={lockingGroup ? t('layers.lockedByGroup', { name: lockingGroup.name }) : t(node.layer.locked ? 'layers.unlockLayer' : 'layers.lockLayer')} aria-disabled={Boolean(lockingGroup)} aria-pressed={node.layer.locked || Boolean(lockingGroup)} onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'lock', ownerKind: 'layer', id: node.layer.id }, node.layer.locked, lockingGroup?.name)} onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'lock', ownerKind: 'layer', id: node.layer.id })} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{node.layer.locked || lockingGroup ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}</span><span className={liveAutoLinkById.get(node.layer.id) === true ? 'layer-auto-link-toggle enabled' : 'layer-auto-link-toggle'} role="button" tabIndex={0} title={t(liveAutoLinkById.get(node.layer.id) === true ? 'layers.autoLinkAnimationCelsOff' : 'layers.autoLinkAnimationCelsOn')} aria-label={t(liveAutoLinkById.get(node.layer.id) === true ? 'layers.autoLinkAnimationCelsOff' : 'layers.autoLinkAnimationCelsOn')} aria-pressed={liveAutoLinkById.get(node.layer.id) === true} onPointerDownCapture={(event) => handleLayerAutoLinkPointerDown(event, node.layer.id)} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => handleLayerAutoLinkKeyDown(event, node.layer.id)}><PixelAutoLinkIcon enabled={liveAutoLinkById.get(node.layer.id) === true} /></span><Tooltip className="layer-name" content={node.layer.description?.trim()}><span>{node.layer.name}</span><small>{blendOptions.find((option) => option.value === node.layer.blendMode)?.label} · {Math.round(node.layer.opacity * 100)}%</small></Tooltip>{node.layer.kind === 'text' && <Tooltip className="layer-status-icon-tooltip" content={t('layers.textLayerHint')}><span className="layer-text-indicator" aria-hidden="true"><PixelUtilityIcon kind="text" /></span></Tooltip>}{node.layer.kind === 'tilemap' && <Tooltip className="layer-status-icon-tooltip" content={t('layers.tilemapLayerHint')}><span className="layer-tilemap-indicator" aria-hidden="true"><PixelUtilityIcon kind="tilemap" /></span></Tooltip>}{node.layer.kind === 'free-tile' && <Tooltip className="layer-status-icon-tooltip" content={<><strong>{t('layers.freeTileLayerHint')}</strong><span>{t('freeTiles.openInstanceLayers')}</span></>}><span className="layer-tilemap-indicator" role="button" tabIndex={0} aria-label={t('freeTiles.openInstanceLayers')} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openFreeTileInstanceLayers(node.layer.id) }} onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); event.stopPropagation(); openFreeTileInstanceLayers(node.layer.id) }}><PixelUtilityIcon kind="freeTile" /></span></Tooltip>}{node.layer.background && <Tooltip className="layer-status-icon-tooltip" content={t('layers.backgroundDescription')}><span className="layer-background-indicator" aria-hidden="true"><PixelUtilityIcon kind="image" /></span></Tooltip>}{node.layer.linkedContentId && <Tooltip className="layer-status-icon-tooltip" content={<><strong>{t('layers.linkedLayer')}</strong><span>{t('layers.linkedLayerDescription')}</span></>}><span className="layer-linked-indicator" aria-hidden="true"><PixelUtilityIcon kind="linkedLayer" /></span></Tooltip>}{node.layer.clippingMask === true && <Tooltip className="layer-status-icon-tooltip" content={clippingMaskTooltip}><span className="layer-clipping-mask-indicator" aria-hidden="true"><PixelUtilityIcon kind="clippingMask" /></span></Tooltip>}{layerHasLayerStyles && layerStyleIndicator({ kind: 'layer', id: node.layer.id })}</button>
})}</div><div className="layer-animation-grid" style={{ gridTemplateRows: displayRowGridTemplate, '--active-layer-row': Math.max(0, activeAnimationLayerRow) } as CSSProperties}>{selectedAnimationOutlineRows.map((row) => <span key={`selected-animation-row-${row}`} data-animation-selected-row className="animation-selected-layer-row" style={{ '--animation-row-index': row, '--animation-row-top': displayRowTop(row), '--animation-row-height': displayRowSpanHeight(row, 1) } as CSSProperties} aria-hidden="true" />)}{showLinkedCelVisuals && linkedCelBlocks.map((block) => <span key={block.key} data-linked-cel-block data-frame-index={block.start} data-frame-span={block.span} className={`animation-linked-cel-block ${block.selected ? 'selected' : ''} ${block.layerSelected ? 'layer-selected' : ''}`} style={{ '--animation-row-index': block.row, '--animation-row-top': displayRowTop(block.row), '--animation-row-height': displayRowSpanHeight(block.row, 1), '--animation-frame-index': block.start, '--animation-frame-span': block.span } as CSSProperties} aria-hidden="true" />)}{showLinkedCelVisuals && linkedCelConnectors.map((connector) => <span key={connector.key} data-linked-cel-connector data-start-frame-index={connector.start} data-end-frame-index={connector.end} className={`animation-linked-cel-connector ${connector.selected ? 'selected' : ''} ${connector.layerSelected ? 'layer-selected' : ''}`} style={{ '--animation-row-index': connector.row, '--animation-row-top': displayRowTop(connector.row), '--animation-row-height': displayRowSpanHeight(connector.row, 1), '--animation-link-start': connector.start, '--animation-link-end': connector.end } as CSSProperties} aria-hidden="true" />)}{animationFrameGridDecorations}{shouldShowAnimationCellSelectionOutline && selectedCelPositions.length > 0 && <span data-animation-cel-selection className={`animation-cel-selection-box ${animationCelDragPreview ? 'animation-cel-drag-preview' : ''}`} style={{ '--animation-frame-index': animationCelDragPreview?.column ?? selectedCelColumn, '--animation-frame-span': animationCelDragPreview?.columnSpan ?? selectedCelColumnSpan, '--animation-row-index': animationCelDragPreview?.row ?? selectedCelRow, '--animation-row-span': animationCelDragPreview?.rowSpan ?? selectedCelRowSpan, '--animation-row-top': displayRowTop(animationCelDragPreview?.row ?? selectedCelRow), '--animation-row-height': displayRowSpanHeight(animationCelDragPreview?.row ?? selectedCelRow, animationCelDragPreview?.rowSpan ?? selectedCelRowSpan) } as CSSProperties} aria-hidden="true" />}{animationFrameHeaders}{displayRows.flatMap((displayRow) => timeline.frames.map((frame, index) => {
      const visualRow = visualRowStateByKey.get(displayRow.kind === 'mask'
        ? timelineRowKey({ kind: 'mask', ownerKind: displayRow.ownerKind, ownerId: displayRow.owner.id })
        : displayRow.node.kind === 'group'
          ? timelineRowKey({ kind: 'group', ownerKind: 'group', ownerId: displayRow.node.id })
          : timelineRowKey({ kind: 'layer', ownerKind: 'layer', ownerId: displayRow.node.layer.id }))
      const visualFrame = visualFrameStateById.get(frame.id)
      const active = visualFrame?.active === true
      const frameVisuallySelected = Boolean(timelineVisualState.selectionGuidesVisible && visualFrame?.selected)
      const activeFrameHighlighted = Boolean(visualFrame?.active || (visualFrame?.selected && timelineVisualState.selectionGuidesVisible))
        || (cellSelectionActive && selectedCellFrameIds.has(frame.id))
      if (displayRow.kind === 'mask') {
        const cel = displayRow.ownerKind === 'layer' ? celLookup.at(displayRow.owner.id, frame.id) : null
        const mask = maskVisualByOwnerFrame.get(maskOwnerFrameKey(displayRow.ownerKind, displayRow.owner.id, frame.id)) ?? null
        const resolvedMask = resolveAnimationMask(timeline, mask)
        const key = animationCelKey(displayRow.owner.id, frame.id)
        const maskVisualCell = visualCellStateBySlot.get(timelineCellSlotKey({ kind: 'mask', ownerKind: displayRow.ownerKind, ownerId: displayRow.owner.id, frameId: frame.id }))
        const linkedMaskMember = showLinkedCelVisuals && linkedCelMemberKeys.has(`mask|${key}`)
        const linkedMaskBridgeEnd = showLinkedCelVisuals && linkedCelBridgeEndKeys.has(`mask|${key}`)
        const linkedMaskSlot = linkedMaskSlotVisuals.get(timelineCellSlotKey({ kind: 'mask', ownerKind: displayRow.ownerKind, ownerId: displayRow.owner.id, frameId: frame.id }))
        const linkedMaskWithPrevious = linkedMaskSlot?.withPrevious === true
        const linkedMaskWithNext = linkedMaskSlot?.withNext === true
        const linkedMaskEnd = linkedMaskWithPrevious && !linkedMaskWithNext && !linkedMaskBridgeEnd
        const maskCellClasses = timelineVisualClasses(maskVisualCell, visualFrame, timelineVisualState.selectionGuidesVisible)
        // Disabling a frame only affects playback. While playback is running,
        // a disabled frame must not inherit the playhead/selection background;
        // while paused it remains a normal selectable current frame.
        const frameVisualEnabled = !session.animationPlaying || frame.disabled !== true
        // Mask cells use the same timeline activity rules as ordinary cells.
        // Only their selection source is separate, because mask pixels are a
        // different editable surface from the owner layer's cel.
        const maskFrameSelected = timelineVisualState.selectionGuidesVisible
          && visualSelectedFrameIdSet.has(frame.id)
        const maskRowSelected = !frameSelectionActiveForOutline
          && timelineVisualState.selectionGuidesVisible
          && session.selectedAnimationMaskRowKeys.includes(`${displayRow.ownerKind}:${displayRow.owner.id}`)
        // Frame selection is column-wide, including the independent mask
        // surface. Keep its slot marker in sync with the selected frame.
        const maskSlotSelected = maskRowSelected || maskFrameSelected || maskCellClasses.selected || visualSelectedMaskCellKeySet.has(key)
        // A frame selection can remain as the formal focus while the mask is
        // the active editing surface. Playback must keep that mask activity;
        // frameFocus only suppresses it when there is no mask context.
        const maskActive = frameVisualEnabled
          && !animationCelDragActive
          && ((session.animationPlaying && maskVisualSelectionActive) || !focusState.frameFocus)
          && maskCellClasses.current
        const maskVisuallySelected = maskCellClasses.selected || maskActive || visualSelectedMaskCellKeySet.has(key)
        const maskThumbnail = resolvedMask && showCelThumbnails
          ? <ActiveLayerMaskThumbnail documentId={session.document.id} ownerId={displayRow.owner.id} frameId={frame.id} mask={resolvedMask} revision={session.contentRevision} documentWidth={session.document.width} documentHeight={session.document.height} thumbnailSize={celThumbnailSize} />
          : null
        const maskName = t(displayRow.ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask')
        const maskFrameVisualSelection = frameVisuallySelected || maskCellClasses.frameSelected || maskFrameSelected
        // Once a canvas selection is active, an ordinary-layer focus must not
        // leak the current frame into the extra mask row. A focused mask is
        // still allowed to display its own activity independently.
        // During playback the playhead is a column-wide activity indicator.
        // It must also paint every mask row, even when frame-copy/paste has
        // cleared the mask editing context. Otherwise the suppression layer
        // hides the current-frame background only on mask rows.
        const maskFrameActivityVisible = session.animationPlaying
          || !session.selection
          || maskVisualSelectionActive
        const maskActiveFrameHighlighted = maskFrameActivityVisible
          && frameVisualEnabled
          && (session.animationPlaying || !normalLayerFrameScopeActive)
          && (maskCellClasses.frameActive || maskCellClasses.selectedByFrame || (cellSelectionActive && selectedMaskCellFrameIds.has(frame.id)))
        // The active/selected frame column is an ordinary-layer guide. Paint
        // over that guide on an unfocused mask row so it cannot look active
        // merely because its owner layer is active or being played.
        const maskFrameActivitySuppressed = !maskVisualSelectionActive
          && !maskRowSelected
          && !maskFrameSelected
          && !maskActive
          && !maskVisuallySelected
          && !maskActiveFrameHighlighted
          && (showActiveFrameColumn || maskFrameVisualSelection)
        return <button type="button" key={`mask-${displayRow.owner.id}-${frame.id}`} data-animation-mask-cel-key={key} data-frame-index={index} className={`layer-animation-cel layer-mask-cel ${mask ? 'has-mask' : ''} ${mask && altCopyReady ? 'mask-edit-ready' : ''} ${maskRowSelected ? 'mask-row-selected selected-layer' : ''} ${maskActiveFrameHighlighted ? 'active-frame' : ''} ${maskFrameVisualSelection ? 'selected-animation-frame' : ''} ${maskFrameActivitySuppressed ? 'mask-frame-activity-suppressed' : ''} ${maskActive ? 'active-mask' : ''} ${maskVisuallySelected ? 'selected-cel' : ''} ${linkedMaskMember ? 'linked-cel-member' : ''} ${showLinkedCelVisuals && (linkedMaskWithPrevious || linkedMaskWithNext) ? 'linked-cel' : ''} ${showLinkedCelVisuals && linkedMaskWithPrevious ? 'linked-cel-previous' : ''} ${showLinkedCelVisuals && linkedMaskWithNext ? 'linked-cel-next' : ''} ${linkedMaskEnd ? 'linked-cel-end' : ''} ${linkedMaskBridgeEnd ? 'linked-cel-bridge-end' : ''} ${draggingAnimationCellKind === 'mask' && draggingAnimationCellKeys.includes(key) ? 'dragging' : ''} ${animationCelDropTargetKey === key && !animationCelDragActive ? 'drop-target' : ''}`} aria-label={`${maskName} · ${t('timeline.frameNumber', { number: index + 1 })}`} title={`${displayRow.owner.name} · ${maskName} · ${t('timeline.frameNumber', { number: index + 1 })}`} onPointerDown={(event) => beginAnimationMaskDrag(event, displayRow.owner.id, frame.id)} onPointerMove={(event) => updateAnimationItemCursor(event, frame.id, key)} onPointerLeave={(event) => { event.currentTarget.style.cursor = ''; event.currentTarget.classList.remove('mask-selection-move') }} onClick={(event) => { if (suppressAnimationClickRef.current) { event.preventDefault(); event.stopPropagation(); return } if (event.detail === 0) store.selectAnimationMaskCell(key, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace') }} onContextMenu={(event) => openCelMenu(event, displayRow.owner.id, frame.id, 'mask')}>{mask ? <span className={`cel-mask-marker ${maskSlotSelected ? 'mask-slot-marker-selected' : ''}`} data-layer-mask-id={mask.id} aria-hidden="true">{maskThumbnail}</span> : null}</button>
      }
      const node = displayRow.node
      const visualCell = node.kind === 'layer' ? visualCellStateBySlot.get(timelineCellSlotKey({ kind: 'cel', ownerKind: 'layer', ownerId: node.layer.id, frameId: frame.id })) : undefined
      if (node.kind === 'group') {
        const groupCellKey = animationCelKey(node.group.id, frame.id)
        const groupCellSelected = selectedAnimationGroupCellKeySet.has(groupCellKey)
        const groupRowClasses = timelineVisualClasses(visualRow, visualFrame, timelineVisualState.selectionGuidesVisible)
        return <button type="button" key={`${node.id}-${frame.id}`} data-frame-index={index} data-animation-group-cel-key={groupCellKey} className={`layer-animation-cel group ${groupRowClasses.active || groupRowClasses.frameActive ? 'active-frame' : ''} ${groupRowClasses.frameSelected ? 'selected-animation-frame' : ''} ${groupRowClasses.selected ? 'selected-layer' : ''} ${animationCelDropTargetKey === groupCellKey ? 'drop-target' : ''}`} title={t('timeline.frameNumber', { number: index + 1 })} onPointerDown={(event) => beginAnimationGroupCelDrag(event, node.group.id, frame.id)} onPointerMove={(event) => { if (groupCellSelected && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')) event.currentTarget.style.cursor = 'var(--cursor-move)' }} onPointerLeave={(event) => { event.currentTarget.style.cursor = '' }} onClick={(event) => { event.preventDefault(); event.stopPropagation() }} />
      }
      const selected = Boolean(visualRow?.selected && timelineVisualState.selectionGuidesVisible)
      const cellClasses = timelineVisualClasses(visualCell, visualFrame, timelineVisualState.selectionGuidesVisible)
      // The current-content marker belongs only to the actual active layer.
      // `visualRow.selected` can retain a former row-selection context after
      // a canvas marquee or frame switch, especially when mask rows are
      // inserted between ordinary rows. The column background still carries
      // frame selection for every row; this marker must not leak to siblings.
      const currentFrameCellHighlighted = Boolean(cellClasses.frameActive || cellClasses.selectedByFrame)
        && node.layer.id === playbackActiveLayerId
      const cel = celLookup.at(node.layer.id, frame.id)
      const resolvedCel = celLookup.resolve(cel)
      const key = animationCelKey(node.layer.id, frame.id)
      // Raster surfaces are mutated in place by drawing.  The active layer's
      // cell and explicitly selected cells therefore need the live revision
      // even when selection guides are hidden after an edit. Multi-cell paste
      // can replace thumbnails on inactive layers while keeping those targets
      // selected, and a fixed revision would leave their old canvas cached.
      const contentRevision = renderedCellKeySet.has(key) || (active && (selected || node.layer.id === visualActiveLayerId)) ? session.contentRevision : 0
      const hasContent = cachedCelHasContent(resolvedCel, session.document.palette, contentRevision)
      const resolvedId = resolvedCel?.id ?? null
      const previousCel = index > 0 ? celLookup.at(node.layer.id, timeline.frames[index - 1].id) : null
      const nextCel = index + 1 < timeline.frames.length ? celLookup.at(node.layer.id, timeline.frames[index + 1].id) : null
      const previousResolvedId = celLookup.resolve(previousCel)?.id ?? null
      const nextResolvedId = celLookup.resolve(nextCel)?.id ?? null
      const linkedWithPrevious = Boolean(resolvedId && previousResolvedId === resolvedId && (cel?.linkedCelId || previousCel?.linkedCelId))
      const linkedWithNext = Boolean(resolvedId && nextResolvedId === resolvedId && (cel?.linkedCelId || nextCel?.linkedCelId))
      const linkedCelMember = showLinkedCelVisuals && linkedCelMemberKeys.has(`cel|${key}`)
      const linkedCelBridgeEnd = showLinkedCelVisuals && linkedCelBridgeEndKeys.has(`cel|${key}`)
      const linkedCelEnd = showLinkedCelVisuals && linkedWithPrevious && !linkedWithNext && !linkedCelBridgeEnd
      // The pure visual index may omit empty cel slots; transient/formal key
      // selection still needs to paint those grid cells as selected.
      const keySelected = ordinaryCelSelectionVisible && renderedCellKeySet.has(key)
      const cellSelected = keySelected || (hasContent && cellClasses.selected)
      // Frame selection is represented by the column background/outline. Do
      // not promote every cel in that column to a solid selected-cel marker.
      // Linked-group emphasis remains owner-aware and independent.
      const frameSelectedForCell = frameVisuallySelected
      const frameColumnMarkerSelected = focusState.frameFocus && frameSelectedForCell
      const cellVisuallySelected = Boolean(cellSelected || (!groupVisualSelectionActive && hasContent && (frameColumnMarkerSelected || visualCell?.link.selectedByFrameVisible)))
      // A mask cell is a separate visual/editing surface. Once mask focus is
      // active, the owner row must keep only its ambient frame background and
      // must not render a second current-cel content marker.
      const defaultActiveCell = Boolean(!focusState.frameFocus && !maskVisualSelectionActive && hasContent && cellClasses.current)
      const currentCell = Boolean(!animationCelDragActive && !focusState.frameFocus && !maskVisualSelectionActive && hasContent && (defaultActiveCell || (!suppressCellSelectionGuides && currentFrameCellHighlighted
        && (!selectionOutlineVisible || renderedCellKeys.length === 0 || cellVisuallySelected))))
      // Explicit layer selection highlights every cel in those layers;
      // frame/cel selection modes remain mutually exclusive.
      const layerSelectionModeActive = !hasNonRowAnimationItemSelection
      // The active layer is only the interaction context on project startup;
      // show the full-row selection after the user explicitly selects a layer.
      const layerSelectedAcrossTimeline = Boolean(timelineVisualState.selectionGuidesVisible && session.layerSelectionExplicit && layerSelectionModeActive && visualCell?.selectedByLayer)
      // A selection marker is an interior cel indicator, not the selection
      // highlight itself. Empty/transparent slots must keep their grid or
      // selection-box state without looking like visible cels.
      const selectionMarker = shouldRenderTimelineCelSelectionMarker(hasContent, Boolean(keySelected || currentCell || layerSelectedAcrossTimeline || cellVisuallySelected))
        ? <span className="cel-content-marker selection-marker" aria-hidden="true" />
        : null
      const liveActiveCell = Boolean(!animationCelDragActive && active && node.layer.id === playbackActiveLayerId && resolvedCel)
      const normalCelMarker = resolvedCel && (hasContent || liveActiveCell)
        ? <AnimationCelContent active={liveActiveCell} documentId={session.document.id} layerId={node.layer.id} cel={resolvedCel} palette={session.document.palette} revision={contentRevision} documentWidth={session.document.width} documentHeight={session.document.height} thumbnailSize={celThumbnailSize} showThumbnail={showCelThumbnails} selectionMarker={currentCell} />
        : selectionMarker
      return <button type="button" data-animation-cel-key={key} data-frame-index={index} key={`${node.id}-${frame.id}`} className={`layer-animation-cel ${node.layer.kind === 'text' ? 'text-cel' : ''} ${node.layer.kind === 'tilemap' ? 'tilemap-cel' : ''} ${node.layer.kind === 'free-tile' ? 'free-tile-cel' : ''} ${cel ? 'has-cel' : ''} ${node.layer.id === visualActiveLayerId ? 'active-layer-cel' : ''} ${currentFrameCellHighlighted ? 'active-frame' : ''} ${frameSelectedForCell ? 'selected-animation-frame' : ''} ${layerSelectedAcrossTimeline ? 'selected-layer' : ''} ${currentCell ? 'current-cel' : ''} ${cellVisuallySelected ? 'selected-cel' : ''} ${linkedCelMember ? 'linked-cel-member' : ''} ${showLinkedCelVisuals && (linkedWithPrevious || linkedWithNext) ? 'linked-cel' : ''} ${showLinkedVisuals && linkedWithPrevious ? 'linked-cel-previous' : ''} ${linkedCelEnd ? 'linked-cel-end' : ''} ${linkedCelBridgeEnd ? 'linked-cel-bridge-end' : ''} ${draggingAnimationFrameIds.includes(frame.id) || (draggingAnimationCellKind === 'cel' && draggingAnimationCellKeys.includes(key)) ? 'dragging' : ''} ${animationCelDropTargetKey === key && !animationCelDragActive && !(animationCelDragAnchorKey && draggingAnimationCellKeys.length > 1) ? 'drop-target' : ''}`} aria-label={t('timeline.celAtFrame', { number: index + 1 })} title={`${node.layer.name} · ${t('timeline.frameNumber', { number: index + 1 })}`} onPointerDown={(event) => beginAnimationCelDrag(event, node.layer.id, frame.id)} onPointerMove={(event) => updateAnimationItemCursor(event, frame.id, key)} onPointerLeave={(event) => { event.currentTarget.style.cursor = '' }} onClick={(event) => { if (suppressAnimationClickRef.current) { event.preventDefault(); event.stopPropagation(); return } if (event.detail === 0) store.selectAnimationCell(key, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace') }} onDoubleClick={() => {
        if (node.layer.kind === 'text') {
          const source = celLookup.resolve(cel)
          openTextToolDialog({ documentId: session.document.id, layerId: node.layer.id, frameId: frame.id, x: source?.surface?.offsetX ?? 0, y: source?.surface?.offsetY ?? 0 })
        } else openCelProperties(node.layer.id, frame.id)
      }} onContextMenu={(event) => openCelMenu(event, node.layer.id, frame.id)}>{normalCelMarker}</button>
    }))}</div>{dropTarget?.kind === 'edge' && <div className={`layer-edge-drop-indicator ${dropTarget.edge}`} style={{ top: dropTarget.offset ?? 0 }} aria-hidden="true"><i /><b /><i /></div>}{dragGhost && <div className="layer-drag-ghost" style={{ top: dragGhost.y }}>{dragGhostItems.slice(0, 4).map((item) => <span key={`${item.kind}-${item.id}`}>{item.kind === 'group' ? <PixelUtilityIcon kind="folder" /> : <PixelUtilityIcon kind="image" />}<b>{item.name}</b></span>)}{hiddenDragGhostCount > 0 && <small>+{hiddenDragGhostCount}</small>}</div>}</div>}
    {layerCreateMenu && createPortal(<div className="layer-context-menu layer-create-context-menu" style={{ left: layerCreateMenu.x, top: layerCreateMenu.y }} role="menu" aria-label={t('layers.create')} onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>{layerCreationMenuItems()}</div>, document.body)}
    {contextMenu && createPortal(<div className="layer-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onPointerDown={(event) => event.stopPropagation()}>
      <div className={`menu-submenu layer-new-submenu ${contextMenu.x + 440 > window.innerWidth - 8 ? 'open-left' : ''}`}>
        <button type="button" className="menu-submenu-trigger" aria-haspopup="menu"><span className="layer-context-icon"><PixelUtilityIcon kind="plus" /></span><span className="menu-submenu-label">{t('layers.create')}</span><span className="menu-submenu-arrow" aria-hidden="true"><PixelUtilityIcon kind="right" /></span></button>
        <div className="context-menu menu-popover menu-submenu-popover" role="menu" aria-label={t('layers.create')}>
          {layerCreationMenuItems()}
        </div>
      </div>
      <LayerContextMenuItem icon="copy" label={t('layers.duplicate')} shortcut={shortcutHint('duplicateLayer')} onClick={duplicateContextSelection} />
      {contextMenu.kind === 'layer' && <Tooltip className="layer-menu-tooltip" content={<><strong>{t('layers.createLinkedLayer')}</strong><span>{t('layers.linkedLayerDescription')}</span></>}><LayerContextMenuItem icon="linkedLayer" label={t('layers.createLinkedLayer')} shortcut={shortcutHint('createLinkedLayer')} disabled={!contextMenuCanCreateLinkedLayer} onClick={() => { store.createLinkedLayer(contextMenu.id); closeContextMenu() }} /></Tooltip>}
      {contextMenu.kind === 'layer' && contextMenuLayer && <div className={`menu-submenu layer-new-submenu ${contextMenu.x + 440 > window.innerWidth - 8 ? 'open-left' : ''}`}>
        <button type="button" className="menu-submenu-trigger" aria-haspopup="menu"><span className="layer-context-icon"><PixelUtilityIcon kind="convertTo" /></span><span className="menu-submenu-label">{t('layers.convertTo')}</span><span className="menu-submenu-arrow" aria-hidden="true"><PixelUtilityIcon kind="right" /></span></button>
        <div className="context-menu menu-popover menu-submenu-popover" role="menu" aria-label={t('layers.convertTo')}>
          <Tooltip className="layer-menu-tooltip" content={<><strong>{t('layers.convertToBackground')}</strong><span>{t('layers.backgroundDescription')}</span></>}><LayerContextMenuItem icon="image" label={t('layers.convertToBackground')} shortcut={shortcutHint('convertLayerToBackground')} disabled={!contextMenuCanConvertToBackground} onClick={() => { store.setLayerBackground(contextMenu.id, true); closeContextMenu() }} /></Tooltip>
          <Tooltip className="layer-menu-tooltip" content={<><strong>{t('layers.convertToTilemap')}</strong><span>{t('layers.convertTilemapDialogDescription')}</span></>}><LayerContextMenuItem icon="tilemap" label={t('layers.convertToTilemap')} shortcut={shortcutHint('convertLayerToTilemap')} disabled={!contextMenuCanConvertToTilemap} onClick={openTilemapConversionDialog} /></Tooltip>
          <Tooltip className="layer-menu-tooltip" content={<><strong>{t('layers.convertToRaster')}</strong><span>{t('layers.rasterizeLayerDescription')}</span></>}><LayerContextMenuItem icon="image" label={t('layers.convertToRaster')} shortcut={shortcutHint('convertLayerToRaster')} disabled={!contextMenuCanConvertToRaster} onClick={() => { store.rasterizeLayer(contextMenu.id); closeContextMenu() }} /></Tooltip>
        </div>
      </div>}
      {contextMenu.kind === 'layer' && <LayerContextMenuItem icon="mergeDown" label={t(session.selectedLayerIds.length > 1 ? 'app.menu.layer.mergeSelected' : 'app.menu.layer.mergeDown')} shortcut={shortcutHint(session.selectedLayerIds.length > 1 ? 'mergeSelectedLayers' : 'mergeLayerDown')} onClick={() => { session.selectedLayerIds.length > 1 ? store.mergeSelectedLayers() : store.mergeActiveLayerDown(); closeContextMenu() }} />}
      {contextMenu.kind === 'group' && <>
        <LayerContextMenuItem icon="folderOpen" label={t('layers.expandCollapseGroup')} onClick={() => { store.toggleGroupCollapsed(contextMenu.id); closeContextMenu() }} />
        <LayerContextMenuItem icon="mergeDown" label={t('app.menu.layer.mergeGroup')} shortcut={shortcutHint('mergeLayerGroup')} onClick={() => { store.mergeSelectedGroup(); closeContextMenu() }} />
        <LayerContextMenuItem icon="ungroupFolder" label={t('app.menu.layer.ungroup')} shortcut={shortcutHint('ungroupLayers')} onClick={() => { store.ungroupSelected(); closeContextMenu() }} />
      </>}
      <LayerContextMenuItem icon="mergeVisible" label={t('app.menu.layer.mergeVisible')} shortcut={shortcutHint('mergeVisibleLayers')} onClick={() => { store.mergeVisibleLayers(); closeContextMenu() }} />
      <span className="context-menu-divider" role="separator" />
      <Tooltip className="layer-menu-tooltip" content={clippingMaskTooltip}><LayerContextMenuItem icon="clippingMask" label={t(contextMenuClippingMaskEnabled ? 'layers.disableClippingMask' : 'layers.enableClippingMask')} shortcut={shortcutHint('toggleClippingMask')} onClick={toggleContextClippingMask} /></Tooltip>
      {contextMenu.kind === 'layer' && <Tooltip className="layer-menu-tooltip" content={contextMenuLayerMaskStatus.hasContent ? layerMaskTooltip : emptyLayerMaskCelTooltip}><LayerContextMenuItem icon="layerMask" label={t('layers.createLayerMask')} shortcut={shortcutHint('toggleLayerMask')} disabled={!contextMenuLayerMaskStatus.canCreate} onClick={() => { store.createLayerMasksForLayer(contextMenu.id); closeContextMenu() }} /></Tooltip>}
      {contextMenu.kind === 'layer' && contextMenuLayerMask && <LayerContextMenuItem icon="link" label={t(contextMenuLayerMask.moveWithOwner === false ? 'layers.enableLayerMaskMoveBinding' : 'layers.disableLayerMaskMoveBinding')} onClick={() => { store.setLayerMaskMoveWithOwner(contextMenu.id, contextMenuLayerMask.moveWithOwner === false); closeContextMenu() }} />}
      {contextMenu.kind === 'group' && <Tooltip className="layer-menu-tooltip" content={layerMaskTooltip}><LayerContextMenuItem icon="layerMask" label={t(contextMenuGroupMask ? 'layers.deleteLayerGroupMask' : 'layers.createLayerGroupMask')} shortcut={shortcutHint('toggleGroupMask')} onClick={() => { if (contextMenuGroupMask) store.deleteGroupMask(contextMenu.id, timeline.activeFrameId); else store.createGroupMask(contextMenu.id, timeline.activeFrameId); closeContextMenu() }} /></Tooltip>}
      {contextMenu.kind === 'group' && contextMenuGroupMask && <LayerContextMenuItem icon="link" label={t(contextMenuGroupMask.moveWithOwner === false ? 'layers.enableLayerMaskMoveBinding' : 'layers.disableLayerMaskMoveBinding')} onClick={() => { store.setGroupMaskMoveWithOwner(contextMenu.id, timeline.activeFrameId, contextMenuGroupMask.moveWithOwner === false); closeContextMenu() }} />}
      <span className="context-menu-divider" role="separator" />
      <LayerContextMenuItem icon="layerStyle" label={t('layers.layerStyle')} shortcut={shortcutHint('openLayerStyles')} onClick={openLayerStyles} />
      {contextMenuOwnerHasStyles && <LayerContextMenuItem icon={contextMenuOwnerStylesEnabled ? 'eyeOff' : 'eye'} label={t(contextMenuOwnerStylesEnabled ? 'layers.disableLayerStyles' : 'layers.enableLayerStyles')} shortcut={shortcutHint('toggleLayerStyles')} onClick={toggleContextLayerStyles} />}
      <LayerContextMenuItem icon="copy" label={t('layers.copyLayerStyle')} shortcut={shortcutHint('copyLayerStyles')} disabled={!contextMenuOwnerHasStyles} onClick={copyContextLayerStyles} />
      <LayerContextMenuItem icon="paste" label={t('layers.pasteLayerStyle')} shortcut={shortcutHint('pasteLayerStyles')} disabled={!layerStyleClipboard} onClick={pasteContextLayerStyles} />
      <LayerContextMenuItem icon="clearRecords" label={t('layers.clearLayerStyle')} shortcut={shortcutHint('clearLayerStyles')} disabled={!contextMenuSelectionHasStyles} onClick={clearContextLayerStyles} />
      <span className="context-menu-divider" role="separator" />
      <LayerContextMenuItem icon="properties" label={t('layers.properties')} shortcut={shortcutHint('openLayerProperties')} onClick={openProperties} />
      <LayerContextMenuItem icon="delete" label={t('common.delete')} shortcut={shortcutHint('deleteLayer')} onClick={deleteContextSelection} danger />
    </div>, document.body)}
    {backgroundLayerDialogOpen && createPortal(<BackgroundLayerDialog onClose={() => setBackgroundLayerDialogOpen(false)} onCreate={(pattern) => store.createBackgroundLayer(pattern)} />, document.body)}
    {tilemapLayerDialog && (tilemapLayerDialog.mode === 'create' || tilemapConversionLayer) && createPortal(<TilemapLayerDialog documentWidth={session.document.width} documentHeight={session.document.height} mode={tilemapLayerDialog.mode} initialName={tilemapConversionLayer?.name} tilesets={availableTilemapTilesets} onClose={() => setTilemapLayerDialog(null)} onConfirm={(options) => tilemapLayerDialog.mode === 'create' ? store.createTilemapLayer(options) : store.convertLayerToTilemap(tilemapLayerDialog.layerId, options)} />, document.body)}
    {freeTileLayerDialogOpen && createPortal(<FreeTileLayerDialog sets={freeTileSetOptions} onClose={() => setFreeTileLayerDialogOpen(false)} onConfirm={store.createFreeTileLayer} />, document.body)}
    {animationMenu?.kind === 'playback' && <AnimationPlaybackMenu session={session} x={animationMenu.x} y={animationMenu.y} onClose={() => setAnimationMenu(null)} />}
    {animationMenu && animationMenu.kind !== 'playback' && createPortal(<div ref={animationMenuRef} className="context-menu animation-context-menu" role="menu" aria-label={t(animationMenu.kind === 'frame' ? 'timeline.frameMenu' : animationMenu.kind === 'loop-section' ? 'timeline.loopSectionMenu' : 'timeline.celMenu')} style={animationMenuPosition} onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
      {animationMenu.kind === 'frame' ? <>
        <button className="context-menu-item" type="button" role="menuitem" onClick={openLoopSectionCreator}><PixelUtilityIcon kind="link" /><span>{t('timeline.createLoopSection')}</span>{shortcutHint('createAnimationLoopSection')}</button>
        <button className="context-menu-item" type="button" role="menuitem" onClick={openFrameProperties}><PixelUtilityIcon kind="info" /><span>{t('timeline.frameProperties')}</span>{shortcutHint('openAnimationFrameProperties')}</button>
        <button className="context-menu-item" type="button" role="menuitem" onClick={() => { updateAnimationFrameDisabled(!animationMenuFramesAllDisabled); setAnimationMenu(null) }}><PixelUtilityIcon kind={animationMenuFramesAllDisabled ? 'eye' : 'eyeOff'} /><span>{t(animationMenuFramesAllDisabled ? 'timeline.enableFrame' : 'timeline.disableFrame')}</span></button>
        <span className="context-menu-divider" />
        <button className="context-menu-item" type="button" role="menuitem" onClick={() => { store.copySelectedAnimationFrames(); setAnimationMenu(null) }}><PixelUtilityIcon kind="copy" /><span>{t('timeline.copyFrame')}</span>{shortcutHint('copyAnimationFrames', 'copy')}</button>
        <button className="context-menu-item" type="button" role="menuitem" disabled={!session.animationFrameClipboard.length} onClick={() => { store.pasteAnimationFrames(); setAnimationMenu(null) }}><PixelUtilityIcon kind="paste" /><span>{t('timeline.pasteFrame')}</span>{shortcutHint('pasteAnimationFrames', 'paste')}</button>
        <span className="context-menu-divider" />
        <button className="context-menu-item" type="button" role="menuitem" onClick={() => useFrameMenuTarget(() => store.duplicateAnimationFrame())}><PixelUtilityIcon kind="copy" /><span>{t('timeline.addFrame')}</span>{shortcutHint('addAnimationFrame')}</button>
        <button className="context-menu-item" type="button" role="menuitem" onClick={() => useFrameMenuTarget(() => store.addAnimationFrame())}><PixelUtilityIcon kind="paste" /><span>{t('timeline.addBlankFrame')}</span>{shortcutHint('addBlankAnimationFrame')}</button>
        <button className="context-menu-item danger" type="button" role="menuitem" disabled={timeline.frames.length <= 1} onClick={() => useFrameMenuTarget(() => store.deleteSelectedAnimationItems())}><PixelUtilityIcon kind="delete" /><span>{t('timeline.deleteFrame')}</span>{shortcutHint('deleteAnimationFrame', 'deleteLayer')}</button>
      </> : animationMenu.kind === 'loop-section' ? <>
        <button className="context-menu-item" type="button" role="menuitem" disabled={!animationMenuLoopSection} onClick={() => { if (animationMenuLoopSection) store.playAnimationLoopSection(animationMenuLoopSection.id); setAnimationMenu(null) }}><PixelUtilityIcon kind="right" /><span>{t('timeline.playLoopSection')}</span>{shortcutHint('playAnimationLoopSection')}</button>
        <button className="context-menu-item" type="button" role="menuitem" disabled={!animationMenuLoopSection} onClick={() => { if (animationMenuLoopSection) openLoopSectionPropertiesFor(animationMenuLoopSection.id) }}><PixelUtilityIcon kind="properties" /><span>{t('timeline.loopSectionProperties')}</span>{shortcutHint('openAnimationLoopSectionProperties')}</button>
        <span className="context-menu-divider" />
        <button className="context-menu-item danger" type="button" role="menuitem" disabled={!animationMenuLoopSection} onClick={() => { if (animationMenuLoopSection) store.deleteAnimationLoopSection(animationMenuLoopSection.id); setAnimationMenu(null) }}><PixelUtilityIcon kind="delete" /><span>{t('timeline.deleteLoopSection')}</span>{shortcutHint('deleteAnimationLoopSection')}</button>
      </> : animationMenu.kind === 'mask' ? <>
        <Tooltip className="layer-menu-tooltip" content={animationMenuLayerMaskCreationBlocked ? emptyLayerMaskCelTooltip : layerMaskTooltip}><button className="context-menu-item" type="button" role="menuitem" disabled={animationMenuLayerMaskCreationBlocked} onClick={() => { if (animationMenuOwnerKind === 'layer') { if (animationMenuMask) store.deleteSelectedLayerMasks(); else store.createLayerMask(animationMenuCel?.id ?? animationMenu.layerId, animationMenu.frameId) } else if (animationMenuOwnerKind === 'group') { if (animationMenuGroupMask) store.deleteGroupMask(animationMenu.layerId, animationMenu.frameId); else store.createGroupMask(animationMenu.layerId, animationMenu.frameId) } setAnimationMenu(null) }}><PixelUtilityIcon kind="layerMask" /><span>{t(animationMenuOwnerKind === 'layer' ? (animationMenuMask ? 'layers.deleteLayerMask' : 'layers.createLayerMask') : (animationMenuGroupMask ? 'layers.deleteLayerGroupMask' : 'layers.createLayerGroupMask'))}</span>{shortcutHint('toggleAnimationMask')}</button></Tooltip>
        {animationMenuMask && <button className="context-menu-item" type="button" role="menuitem" onClick={() => { if (animationMenuOwnerKind === 'layer' && animationMenuCel) store.setLayerMaskMoveWithOwner(animationMenuCel.id, animationMenuMask.moveWithOwner === false); else if (animationMenuOwnerKind === 'group') store.setGroupMaskMoveWithOwner(animationMenu.layerId, animationMenu.frameId, animationMenuMask.moveWithOwner === false); setAnimationMenu(null) }}><PixelUtilityIcon kind="link" /><span>{t(animationMenuMask.moveWithOwner === false ? 'layers.enableLayerMaskMoveBinding' : 'layers.disableLayerMaskMoveBinding')}</span></button>}
        <span className="context-menu-divider" />
        <button className="context-menu-item" type="button" role="menuitem" disabled={!animationMenuMask} onClick={() => { store.copySelectedAnimationMasks(); setAnimationMenu(null) }}><PixelUtilityIcon kind="copy" /><span>{t('timeline.copyMask')}</span>{shortcutHint('copyAnimationMasks')}</button>
        <Tooltip className="layer-menu-tooltip" content={animationMenuLayerMaskPasteBlocked ? emptyLayerMaskCelTooltip : undefined}><button className="context-menu-item" type="button" role="menuitem" disabled={!session.animationMaskClipboard.length || animationMenuLayerMaskPasteBlocked} onClick={() => { store.pasteAnimationMasks(animationMenu.layerId, animationMenu.frameId); setAnimationMenu(null) }}><PixelUtilityIcon kind="paste" /><span>{t('timeline.pasteMask')}</span>{shortcutHint('pasteAnimationMasks')}</button></Tooltip>
        <button className="context-menu-item" type="button" role="menuitem" disabled={!selectedAnimationMasksCanLink} onClick={() => { store.connectSelectedAnimationMasks(); setAnimationMenu(null) }}><PixelUtilityIcon kind="link" /><span>{t('timeline.connectMask')}</span>{shortcutHint('connectAnimationMasks')}</button>
        <button className="context-menu-item" type="button" role="menuitem" disabled={!selectedAnimationMasksCanUnlink} onClick={() => { store.disconnectSelectedAnimationMasks(); setAnimationMenu(null) }}><PixelUtilityIcon kind="link" /><span>{t('timeline.disconnectMask')}</span>{shortcutHint('disconnectAnimationMasks')}</button>
      </> : <>
        <Tooltip className="layer-menu-tooltip" content={animationMenuLayerMaskCreationBlocked ? emptyLayerMaskCelTooltip : layerMaskTooltip}><button className="context-menu-item" type="button" role="menuitem" disabled={animationMenuLayerMaskCreationBlocked} onClick={() => { if (animationMenuOwnerKind !== 'layer') return; if (animationMenuCelMask && animationMenuCel) store.deleteLayerMask(animationMenuCel.id); else store.createLayerMask(animationMenuCel?.id ?? animationMenu.layerId, animationMenu.frameId); setAnimationMenu(null) }}><PixelUtilityIcon kind="layerMask" /><span>{t(animationMenuCelMask ? 'layers.deleteLayerMask' : 'layers.createLayerMask')}</span>{shortcutHint('toggleAnimationMask')}</button></Tooltip>
        <span className="context-menu-divider" />
        <Tooltip className="layer-menu-tooltip" content={animationMenuLayerMaskPasteBlocked ? emptyLayerMaskCelTooltip : undefined}><button className="context-menu-item" type="button" role="menuitem" disabled={!session.animationMaskClipboard.length || animationMenuLayerMaskPasteBlocked} onClick={() => { store.pasteAnimationMasks(animationMenu.layerId, animationMenu.frameId); setAnimationMenu(null) }}><PixelUtilityIcon kind="paste" /><span>{t('timeline.pasteMask')}</span>{shortcutHint('pasteAnimationMasks')}</button></Tooltip>
        <span className="context-menu-divider" />
        <button className="context-menu-item" type="button" role="menuitem" disabled={!animationMenuCelHasContent} onClick={() => openCelProperties(animationMenu.layerId, animationMenu.frameId)}><PixelUtilityIcon kind="info" /><span>{t('timeline.celProperties')}</span>{shortcutHint('openAnimationCelProperties')}</button>
        <span className="context-menu-divider" />
        <button className="context-menu-item" type="button" role="menuitem" disabled={!animationMenuCelHasContent} onClick={() => { store.copySelectedAnimationCels(); setAnimationMenu(null) }}><PixelUtilityIcon kind="copy" /><span>{t('timeline.copyCel')}</span>{shortcutHint('copy', 'copyAnimationCel')}</button>
        <button className="context-menu-item" type="button" role="menuitem" disabled={!session.animationCellClipboard.length} onClick={() => { store.pasteAnimationCels(); setAnimationMenu(null) }}><PixelUtilityIcon kind="paste" /><span>{t('timeline.pasteCel')}</span>{shortcutHint('pasteAnimationCels', 'paste')}</button>
        <button className="context-menu-item" type="button" role="menuitem" disabled={!selectedAnimationCelsCanLink} onClick={() => { store.connectSelectedAnimationCels(); setAnimationMenu(null) }}><PixelUtilityIcon kind="link" /><span>{t('timeline.connectCel')}</span>{shortcutHint('connectAnimationCels')}</button>
        <button className="context-menu-item" type="button" role="menuitem" disabled={!selectedAnimationCelsCanUnlink} onClick={() => { store.disconnectSelectedAnimationCels(); setAnimationMenu(null) }}><PixelUtilityIcon kind="link" /><span>{t('timeline.disconnectCel')}</span>{shortcutHint('disconnectAnimationCels')}</button>
        <button className="context-menu-item danger" type="button" role="menuitem" disabled={!animationMenuCelHasContent} onClick={() => { store.deleteSelectedAnimationItems(); setAnimationMenu(null) }}><PixelUtilityIcon kind="delete" /><span>{t('timeline.deleteCel')}</span>{shortcutHint('deleteAnimationFrame', 'deleteLayer')}</button>
      </>}
    </div>, document.body)}
    {loopSectionEditor && <AnimationLoopSectionDialog mode={loopSectionEditor.mode} frameCount={timeline.frames.length} initialValue={loopSectionEditor.value} onClose={() => setLoopSectionEditor(null)} onConfirm={saveLoopSection} />}
    {frameProperties && createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setFrameProperties(null) }}>
      <ModalShell as="form" storageKey="animation-frame-properties" defaultWidth={340} defaultHeight={224} minWidth={300} minHeight={210} maxWidth={440} maxHeight={300} className="layer-modal frame-properties-modal" onSubmit={(event) => { event.preventDefault(); saveFrameProperties() }}>
        <DialogHeader eyebrow="FRAME PROPERTIES" title={t('timeline.framePropertiesNumbered', { number: timeline.frames.findIndex((frame) => frame.id === frameProperties.frameId) + 1 })} closeLabel={t('common.close')} onClose={() => setFrameProperties(null)} />
        <div className="modal-body"><FormField layout="inline" label={t('timeline.duration')}><NumberInput autoFocus onFocus={(event) => event.currentTarget.select()} aria-label={t('timeline.duration')} value={frameProperties.duration} min={1} max={60_000} step={10} suffix="ms" onValueChange={(duration) => setFrameProperties({ ...frameProperties, duration })} /></FormField></div>
        <footer><button type="button" className="quiet-button" onClick={() => setFrameProperties(null)}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.save')}</button></footer>
      </ModalShell>
    </div>, document.body)}
    {celProperties && createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setCelProperties(null) }}>
      <ModalShell as="form" storageKey="animation-cel-properties" defaultWidth={340} defaultHeight={224} minWidth={300} minHeight={210} maxWidth={440} maxHeight={300} className="layer-modal frame-properties-modal" onSubmit={(event) => { event.preventDefault(); saveCelProperties() }} onKeyDown={(event) => { if (event.defaultPrevented || event.key !== 'Enter' || event.nativeEvent.isComposing) return; event.preventDefault(); event.stopPropagation(); saveCelProperties() }}>
        <DialogHeader eyebrow="CEL PROPERTIES" title={t('timeline.celPropertiesNumbered', { number: timeline.frames.findIndex((frame) => frame.id === celProperties.frameId) + 1 })} closeLabel={t('common.close')} onClose={() => setCelProperties(null)} />
        <div className="modal-body"><RangeField autoFocus className="layer-opacity-control" label={t('layers.opacity')} min={0} max={100} suffix="%" value={celProperties.opacity} onChange={(opacity) => setCelProperties({ ...celProperties, opacity })} /></div>
        <footer><button type="button" className="quiet-button" onClick={() => setCelProperties(null)}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.save')}</button></footer>
      </ModalShell>
    </div>, document.body)}
    {layerSettingsOpen && createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setLayerSettingsOpen(false) }}>
      <ModalShell as="form" storageKey="layer-settings-layout-v15" defaultWidth={360} defaultHeight={526} fitContentKey={layerSettings.onionSkin.enabled ? 'onion-expanded' : 'onion-collapsed'} minWidth={340} minHeight={layerSettings.onionSkin.enabled ? 496 : 326} maxWidth={420} maxHeight={700} className={`layer-modal layer-settings-modal ${layerSettings.timelineHidden ? 'timeline-disabled' : ''}`} onSubmit={(event) => { event.preventDefault(); saveLayerSettings() }}>
        <DialogHeader title={t('layers.settings')} closeLabel={t('common.close')} onClose={() => setLayerSettingsOpen(false)} />
        <div className="modal-body component-scrollbar" onPointerDown={(event) => { if (!(event.target as Element).closest('.layer-setting-percent')) setLayerSettingsSlider(null) }}>
          <section className="layer-settings-section">
            <div className="layer-settings-section-heading"><h3>{t('layers.panelDisplay')}</h3></div>
            <div className="layer-settings-section-body">
              <div className="layer-settings-density">
                <span className="layer-settings-control-label">{t('layers.thumbnailSize')}</span>
                <RangeField className="layer-density-range" ariaLabel={t('layers.thumbnailSize')} ariaValueText={densityLabel} min={0} max={layerDensityOrder.length - 1} step={1} value={layerDensityOrder.indexOf(layerSettings.density)} valueLabel={<Tooltip className="layer-density-value-tooltip" content={<><strong>{densityLabel}</strong><span>{densityDescription}</span></>}><span className="layer-density-value-label">{densityLabel}</span></Tooltip>} onChange={(value) => applyLayerSettings({ ...layerSettings, density: layerDensityOrder[value] })} />
              </div>
              <PreferenceToggle className="layer-settings-toggle" label={t('layers.sideDockAutoHide')} tooltip={t('layers.sideDockAutoHideDescription')} aria-label={t('layers.sideDockAutoHide')} checked={layerSettings.sideDockAutoHide} onChange={(sideDockAutoHide) => applyLayerSettings({ ...layerSettings, sideDockAutoHide })} />
              <PreferenceToggle className="layer-settings-toggle" label={t('layers.hideTimeline')} tooltip={t('layers.hideTimelineDescription')} aria-label={t('layers.hideTimeline')} checked={layerSettings.timelineHidden} onChange={(timelineHidden) => applyLayerSettings({ ...layerSettings, timelineHidden })} />
            </div>
          </section>
          <section className="layer-settings-section layer-settings-onion-section">
            <div className="layer-settings-section-heading"><h3>{t('layers.onionSkin')}</h3></div>
            <fieldset className="layer-settings-onion" disabled={layerSettings.timelineHidden} aria-disabled={layerSettings.timelineHidden} aria-label={t('layers.onionSkin')}>
              <PreferenceToggle className="layer-settings-toggle layer-onion-toggle" label={t('layers.onionSkinEnabled')} checked={layerSettings.onionSkin.enabled} onChange={(enabled) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, enabled } })} />
              {layerSettings.onionSkin.enabled && <div className="layer-settings-pair" role="group" aria-label={t('layers.onionSkin')}>
                <span aria-hidden="true" />
                <span className="layer-settings-pair-heading">{t('layers.previous')}</span>
                <span className="layer-settings-pair-heading">{t('layers.next')}</span>
                <span className="layer-settings-pair-label" title={t('layers.onionSkinRange')}>{t('layers.onionSkinRange')}</span>
                <NumberInput aria-label={t('layers.previousFrames')} min={0} max={8} value={layerSettings.onionSkin.previousFrames} onValueChange={(value) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, previousFrames: value } })} />
                <NumberInput aria-label={t('layers.nextFrames')} min={0} max={8} value={layerSettings.onionSkin.nextFrames} onValueChange={(value) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, nextFrames: value } })} />
                <span className="layer-settings-pair-label" title={t('layers.onionSkinOpacity')}>{t('layers.onionSkinOpacity')}</span>
                <div className="brush-size-control layer-setting-percent previous" onPointerDown={() => setLayerSettingsSlider('previousOpacity')}><NumberInput aria-label={t('layers.previousOpacity')} min={0} max={100} suffix="%" value={layerSettings.onionSkin.previousOpacity} onValueChange={(value) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, previousOpacity: value } })} onFocus={() => setLayerSettingsSlider('previousOpacity')} />{layerSettingsSlider === 'previousOpacity' && <div className="brush-size-popover" role="dialog"><RangeField ariaLabel={t('layers.previousOpacity')} min={0} max={100} suffix="%" value={layerSettings.onionSkin.previousOpacity} onChange={(previousOpacity) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, previousOpacity } })} onBlur={() => setLayerSettingsSlider(null)} /></div>}</div>
                <div className="brush-size-control layer-setting-percent next" onPointerDown={() => setLayerSettingsSlider('nextOpacity')}><NumberInput aria-label={t('layers.nextOpacity')} min={0} max={100} suffix="%" value={layerSettings.onionSkin.nextOpacity} onValueChange={(value) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, nextOpacity: value } })} onFocus={() => setLayerSettingsSlider('nextOpacity')} />{layerSettingsSlider === 'nextOpacity' && <div className="brush-size-popover" role="dialog"><RangeField ariaLabel={t('layers.nextOpacity')} min={0} max={100} suffix="%" value={layerSettings.onionSkin.nextOpacity} onChange={(nextOpacity) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, nextOpacity } })} onBlur={() => setLayerSettingsSlider(null)} /></div>}</div>
                <span className="layer-settings-pair-label" title={t('layers.onionSkinColors')}>{t('layers.onionSkinColors')}</span>
                <ColorValueControl color={layerSettings.onionSkin.previousColor} density="regular" onChange={(color) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, previousColor: color } })} label={t('layers.previousColor')} fillWithColor />
                <ColorValueControl color={layerSettings.onionSkin.nextColor} density="regular" onChange={(color) => applyLayerSettings({ ...layerSettings, onionSkin: { ...layerSettings.onionSkin, nextColor: color } })} label={t('layers.nextColor')} fillWithColor />
              </div>}
            </fieldset>
          </section>
        </div>
        <footer><button type="button" className="quiet-button" onClick={resetLayerSettings}><PixelUtilityIcon kind="restore" />{t('common.reset')}</button><span className="modal-footer-spacer" /><button type="button" className="quiet-button" onClick={() => setLayerSettingsOpen(false)}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.save')}</button></footer>
      </ModalShell>
    </div>, document.body)}
    {form && createPortal(<div className="modal-backdrop dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) closeProperties() }}>
      <ModalShell as="form" storageKey="layer-properties-v2" defaultWidth={380} defaultHeight={470} fitContentKey={`${form.kind}:${form.targets.length}:${form.targets.every((target) => target.kind === 'group')}`} minWidth={340} minHeight={340} maxWidth={520} maxHeight={700} className="layer-modal" onSubmit={(event) => { event.preventDefault(); closeProperties() }} onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== 'Enter' || event.nativeEvent.isComposing || (event.target as HTMLElement).tagName === 'TEXTAREA') return
        event.preventDefault()
        event.stopPropagation()
        closeProperties()
      }}>
        <DialogHeader eyebrow={form.targets.length > 1 ? 'MULTIPLE PROPERTIES' : form.kind === 'group' ? 'GROUP PROPERTIES' : 'LAYER PROPERTIES'} title={t(form.targets.length > 1 ? 'layers.multipleProperties' : form.kind === 'group' ? 'layers.groupProperties' : 'layers.layerProperties')} closeLabel={t('common.close')} onClose={closeProperties} />
        <div className="modal-body layer-properties-body">
          <FormField className="layer-properties-inline-field" layout="inline" label={t('layers.name')}><TextInput autoFocus onFocus={(event) => event.currentTarget.select()} value={form.name} onChange={(event) => previewProperties({ ...form, name: event.target.value }, 'name')} /></FormField>
          <FormField className="layer-properties-inline-field" layout="inline" label={t('layers.blendMode')}><ThemedSelect label={t('layers.blendMode')} value={form.blendMode} groups={blendOptionGroups} disabled={singleFormTargetLocked} onChange={(blendMode) => previewProperties({ ...form, blendMode }, 'blendMode')} /></FormField>
          <RangeField className="layer-opacity-control" disabled={singleFormTargetLocked} label={t('layers.opacity')} min={0} max={100} suffix="%" value={form.opacity} onChange={(opacity) => previewProperties({ ...form, opacity }, 'opacity')} />
          {form.targets.every((target) => target.kind === 'group') && <CheckboxField className="tool-checkbox layer-cumulative-blend" checked={form.cumulativeBlend} disabled={singleFormTargetLocked} label={<><strong>{t('layers.cumulativeBlend')}</strong><small>{t('layers.cumulativeBlendDescription')}</small></>} onChange={(cumulativeBlend) => previewProperties({ ...form, cumulativeBlend }, 'cumulativeBlend')} />}
          <FormField className="layer-display-color-field" label={t('layers.displayColor')}><div className="layer-display-color-options"><button type="button" className={`layer-color-preset no-color ${form.displayColor === null ? 'selected' : ''}`} aria-label={t('layers.noDisplayColor')} aria-pressed={form.displayColor === null} onClick={() => previewProperties({ ...form, displayColor: null }, 'displayColor')}><span /></button>{layerDisplayColorPresets.map((color) => <button key={`${color.r}-${color.g}-${color.b}`} type="button" className={`layer-color-preset ${sameColor(form.displayColor, color) ? 'selected' : ''}`} aria-label={t('layers.displayColorRgb', { r: color.r, g: color.g, b: color.b })} aria-pressed={sameColor(form.displayColor, color)} style={{ '--layer-preset-color': `rgb(${color.r} ${color.g} ${color.b})` } as React.CSSProperties} onClick={() => previewProperties({ ...form, displayColor: { ...color } }, 'displayColor')}><span /></button>)}<ColorValueControl color={form.displayColor ?? defaultLayerDisplayColor} density="compact" onChange={(displayColor) => previewProperties({ ...form, displayColor }, 'displayColor')} label={t('layers.colorControl')} roleLabel={t('layers.custom')} className="layer-custom-color-trigger" fillWithColor /></div></FormField>
          <FormField className="layer-description-field" label={t('layers.description')}><TextAreaInput rows={3} value={form.description} placeholder={t('layers.descriptionPlaceholder')} onChange={(event) => previewProperties({ ...form, description: event.target.value }, 'description')} /></FormField>
        </div>
      </ModalShell>
    </div>, document.body)}
    {layerStyleDialog && layerStyleOwner && <LayerStyleDialog key={`${layerStyleDialog.source.kind}:${layerStyleDialog.source.id}:${layerStyleDialog.targets.map((target) => `${target.kind}:${target.id}`).join('|')}`} ownerKind={layerStyleDialog.source.kind} owner={layerStyleOwner} targets={layerStyleDialog.targets} onClose={() => setLayerStyleDialog(null)} />}
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
  </section>
  {layerStyleDrag?.moved && createPortal(<div className="layer-style-drag-ghost" style={{ left: layerStyleDrag.x + 12, top: layerStyleDrag.y + 12 }} aria-hidden="true"><PixelUtilityIcon kind="layerStyle" /><span>{t('layers.copyLayerStyle')}</span></div>, document.body)}
  <FloatingDockPreview style={floating.dockPreview} />
  </>
}
