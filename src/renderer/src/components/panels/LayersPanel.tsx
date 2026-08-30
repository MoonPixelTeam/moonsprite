import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
import { animationMaskAt, animationMaskSlotAt, getDescendantGroupIds, getGroupLockingAncestor, getLayerIdsInGroup, getLayerLockingGroup, isGroupEffectivelyLocked, isLayerEffectivelyLocked, resolveAnimationMask } from '@/core/document'
import { COMMAND_SCOPE_EVENT, EDITOR_SHORTCUT_COMMAND_EVENT, type EditorShortcutCommandDetail } from '@/core/command-context'
import { buildLayerPanelTree, layerPanelRevealScrollTop, resolveLayerPanelDropTarget, resolveLayerPanelEdgeDropTarget, type LayerPanelNode } from '@/core/layer-panel-layout'
import { DEFAULT_ONION_SKIN_PREFERENCES, loadEditorPreferences, saveEditorPreferences, type OnionSkinPreferences } from '@/core/file-preferences'
import { animationCelHasContent, animationCelKey, animationGroupMaskAt, createAnimationCelLookup, ensureAnimationDocument, parseAnimationCelKey } from '@/core/animation'
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

type LayerFormTarget = LayerPropertyTarget
type BatchProperty = LayerPropertyField
interface LayerFormState { id: string; kind: 'layer' | 'group'; targets: LayerFormTarget[]; batchChanges: BatchProperty[]; name: string; opacity: number; blendMode: BlendMode; cumulativeBlend: boolean; locked: boolean; displayColor: RgbaColor | null; description: string }
const ALL_LAYER_PROPERTY_FIELDS: readonly LayerPropertyField[] = ['name', 'opacity', 'blendMode', 'cumulativeBlend', 'displayColor', 'description']
interface LayerDragState { ids: string[]; groupIds: string[]; groupId?: string; row: LayerFormTarget; preserveSelection: boolean; selectedLayerIds: string[]; selectedGroupIds: string[]; wholeGroupSelection: boolean; startX: number; startY: number; moved: boolean; copy: boolean }
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
  | { kind: 'cel'; sourceAnchorKey: string; cellKeys: string[]; preserveSelection: boolean; startX: number; startY: number; moved: boolean; canMove: boolean; pendingSelection: boolean; longPressed: boolean; longPressTimer: number | null; lastSelectionTarget: string }
  | { kind: 'mask'; sourceAnchorKey: string; cellKeys: string[]; preserveSelection: boolean; startX: number; startY: number; moved: boolean; canMove: boolean; pendingSelection: boolean; longPressed: boolean; longPressTimer: number | null; lastSelectionTarget: string }
  | { kind: 'loop-section'; sectionId: string; edge: AnimationLoopSectionResizeEdge; startX: number; startY: number; startIndex: number; endIndex: number; previewStartIndex: number; previewEndIndex: number; moved: boolean }
type AnimationGestureSelection = { kind: 'frame'; ids: string[] } | { kind: 'cel' | 'mask'; keys: string[] }
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
function CelThumbnail({ cel, palette, revision, documentWidth, documentHeight, thumbnailSize }: { cel: AnimationCel; palette: readonly PaletteEntry[]; revision: number; documentWidth: number; documentHeight: number; thumbnailSize: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const surface = cel.surface
    if (!canvas || !surface) return
    return scheduleThumbnailRender(() => {
      if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return
      try {
        const context = canvas.getContext('2d')
        if (!context) return
        const key = `${documentWidth}:${documentHeight}:${canvas.width}:${surface.width}:${surface.height}:${surface.offsetX}:${surface.offsetY}:${cel.opacity ?? 1}:${surface.format === 'rgba' ? 'rgba' : paletteRenderKey(palette)}`
        const storage = rasterStorageIdentity(surface)
        const entries = celThumbnailCache.get(storage) ?? new Map<string, { revision: number; pixels: Uint8ClampedArray }>()
        const cached = entries.get(key)
        const pixels = cached && (revision === 0 || cached.revision === revision)
          ? cached.pixels
          : renderAnimationCelThumbnailPixels(documentWidth, documentHeight, canvas.width, surface, palette, cel.opacity ?? 1)
        if (!cached || pixels !== cached.pixels) {
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
  }, [cel, palette, revision, documentWidth, documentHeight, thumbnailSize])
  return <span className="cel-thumbnail" aria-hidden="true"><canvas ref={ref} width={thumbnailSize} height={thumbnailSize} /></span>
}
function LayerMaskThumbnail({ mask, revision, documentWidth, documentHeight, thumbnailSize }: { mask: LayerMask; revision: number; documentWidth: number; documentHeight: number; thumbnailSize: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    return scheduleThumbnailRender(() => {
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
    })
  }, [mask, revision, documentWidth, documentHeight, thumbnailSize])
  return <canvas className="layer-mask-thumbnail" ref={ref} width={thumbnailSize} height={thumbnailSize} aria-hidden="true" />
}
function ActiveLayerMaskThumbnail({ documentId, mask, revision, documentWidth, documentHeight, thumbnailSize }: { documentId: string; mask: LayerMask; revision: number; documentWidth: number; documentHeight: number; thumbnailSize: number }) {
  const liveRevision = useWorkspace((state) => state.sessions.find((item) => item.document.id === documentId)?.contentRevision ?? revision)
  return <LayerMaskThumbnail mask={mask} revision={liveRevision} documentWidth={documentWidth} documentHeight={documentHeight} thumbnailSize={thumbnailSize} />
}
function ActiveCelContent({ documentId, cel, palette, revision, documentWidth, documentHeight, thumbnailSize, showThumbnail }: {
  documentId: string
  cel: AnimationCel
  palette: readonly PaletteEntry[]
  revision: number
  documentWidth: number
  documentHeight: number
  thumbnailSize: number
  showThumbnail: boolean
}) {
  const liveRevision = useWorkspace((state) => state.sessions.find((item) => item.document.id === documentId)?.contentRevision ?? revision)
  const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)
  const livePalette = liveSession?.document.palette ?? palette
  const hasContent = cachedCelHasContent(cel, livePalette, liveRevision)
  if (!hasContent) return null
  return showThumbnail
    ? <CelThumbnail cel={cel} palette={livePalette} revision={liveRevision} documentWidth={liveSession?.document.width ?? documentWidth} documentHeight={liveSession?.document.height ?? documentHeight} thumbnailSize={thumbnailSize} />
    : <span className="cel-content-marker" />
}
function ActiveFrameSync({ documentId, frameIds, containerRef, suppressActiveGuide }: {
  documentId: string
  frameIds: readonly string[]
  containerRef: { current: HTMLDivElement | null }
  suppressActiveGuide: boolean
}) {
  const { t } = useI18n()
  const activeFrameId = useWorkspace((state) => state.sessions.find((item) => item.document.id === documentId)?.document.animation?.activeFrameId ?? frameIds[0] ?? '')
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
  const layerStyleClipboard = useWorkspace((state) => state.layerStyleClipboard)
  const [loopSectionResizePreview, setLoopSectionResizePreview] = useState<AnimationLoopSectionResizePreview | null>(null)
  const timeline = ensureAnimationDocument(session.document)
  const loopSectionLayout = layoutAnimationLoopSections(timelineWithLoopSectionPreview(timeline, loopSectionResizePreview))
  const celLookup = createAnimationCelLookup(timeline)
  const currentCelHasContent = (layerId: string, frameId: string): boolean => {
    const liveSession = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    if (!liveSession) return false
    const liveTimeline = ensureAnimationDocument(liveSession.document)
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
  const finishAnimationPointerDragRef = useRef<() => void>(() => {})
  const [animationGestureSelection, setAnimationGestureSelection] = useState<AnimationGestureSelection | null>(null)
  const [animationCellSelectionOutlineVisible, setAnimationCellSelectionOutlineVisible] = useState(() => session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0)
  const hiddenAnimationCellSelectionSignatureRef = useRef<string | null>(null)
  const suppressAnimationClickRef = useRef(false)
  const suppressMaskRowClickRef = useRef(false)
  const [draggingAnimationFrameIds, setDraggingAnimationFrameIds] = useState<string[]>([])
  const [draggingAnimationCellKeys, setDraggingAnimationCellKeys] = useState<string[]>([])
  const [animationCelDropTargetKey, setAnimationCelDropTargetKey] = useState<string | null>(null)
  const animationCelDropTargetKeyRef = useRef<string | null>(null)
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
  const showCelThumbnails = layerDensityOrder.indexOf(layerDensity) >= layerDensityOrder.indexOf('detailed')
  const celThumbnailSize = layerDensity === 'detailed'
    ? 46
    : layerDensity === 'expanded'
      ? 64
      : layerDensity === 'large'
        ? 88
        : 120
  const animationItemDragging = draggingAnimationFrameIds.length > 0 || draggingAnimationCellKeys.length > 0
  const animationCellSelectionSignature = `${session.selectedAnimationCellKeys.join('\u0000')}|${session.selectedAnimationMaskCellKeys.join('\u0000')}`
  const selectionStateSignature = `${session.document.id}|${session.selectedLayerIds.join('\u0000')}|${session.selectedGroupIds.join('\u0000')}|${session.selectedGroupId ?? ''}|${session.selectedAnimationFrameIds.join('\u0000')}|${animationCellSelectionSignature}`
  // A newly opened project starts with its active layer selected, matching the
  // timeline's default interaction context. Subsequent edits may hide the
  // outline until the user explicitly selects an item again.
  const [selectionOutlineVisible, setSelectionOutlineVisible] = useState(false)
  const previousSelectionStateSignatureRef = useRef(selectionStateSignature)
  const preserveSelectionOnNextContentRevisionRef = useRef(false)
  const previousContentRevisionRef = useRef(session.contentRevision)
  const syncAnimationLoopSectionScroll = (): void => {
    if (!animationLoopSectionTrackRef.current || !layerListRef.current) return
    animationLoopSectionTrackRef.current.style.transform = `translate3d(${-layerListRef.current.scrollLeft}px, 0, 0)`
  }
  const hideAnimationCellSelectionOutline = (): void => {
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    hiddenAnimationCellSelectionSignatureRef.current = active
      ? `${active.selectedAnimationCellKeys.join('\u0000')}|${active.selectedAnimationMaskCellKeys.join('\u0000')}`
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
    if (hiddenAnimationCellSelectionSignatureRef.current === animationCellSelectionSignature) {
      setAnimationCellSelectionOutlineVisible(false)
      return
    }
    hiddenAnimationCellSelectionSignatureRef.current = null
    setAnimationCellSelectionOutlineVisible(session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0)
  }, [animationCellSelectionSignature, session.document.id, session.selectedAnimationCellKeys.length, session.selectedAnimationMaskCellKeys.length])
  useEffect(() => {
    if (previousSelectionStateSignatureRef.current === selectionStateSignature) return
    previousSelectionStateSignatureRef.current = selectionStateSignature
    setSelectionOutlineVisible(true)
  }, [selectionStateSignature])
  useEffect(() => {
    if (previousContentRevisionRef.current === session.contentRevision) return
    previousContentRevisionRef.current = session.contentRevision
    if (preserveSelectionOnNextContentRevisionRef.current) {
      preserveSelectionOnNextContentRevisionRef.current = false
      return
    }
    setSelectionOutlineVisible(false)
  }, [session.contentRevision])
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
      setAnimationCellSelectionOutlineVisible(false)
      setSelectionOutlineVisible(false)
    }
    window.addEventListener(CANVAS_SELECTION_STARTED_EVENT, startCanvasSelection)
    return () => window.removeEventListener(CANVAS_SELECTION_STARTED_EVENT, startCanvasSelection)
  }, [session.document.id, store])
  useLayoutEffect(() => {
    syncAnimationLoopSectionScroll()
  }, [layerLabelWidth, timeline.frames.length, timeline.loopSections, visibleLoopSectionLaneCount])
  useLayoutEffect(() => {
    const list = layerListRef.current
    if (!list) return
    for (const row of list.querySelectorAll<HTMLElement>('[data-layer-id]')) {
      row.classList.toggle('active-layer', row.dataset.layerId === session.document.activeLayerId)
    }
  }, [session.document.activeLayerId, session.document.id, session.layersPanelRevision, session.selectedLayerIds.join('\u0000'), session.selectedAnimationFrameIds.join('\u0000'), session.selectedAnimationCellKeys.join('\u0000'), selectionOutlineVisible])
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
      if (animationMaskAt(timeline, ownerId, frame.id)) keys.push(animationCelKey(ownerId, frame.id))
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
    animationPointerDragRef.current = null
    setLoopSectionResizePreview(null)
    animationFrameDropTargetRef.current = null
    animationCelDropTargetKeyRef.current = null
    setAnimationFrameDropTarget(null)
    setAnimationCelDropTargetKey(null)
    setDraggingAnimationFrameIds([])
    setDraggingAnimationCellKeys([])
    setAnimationGestureSelection(null)
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
      pendingSelection: !canMove && !selected,
      longPressed: false,
      longPressTimer: null,
      lastSelectionTarget: frameId
    }
    setAnimationGestureSelection(null)
    if (!canMove) drag.longPressTimer = window.setTimeout(() => {
      if (drag.pendingSelection) selectAnimationFrame(frameId, 'toggle')
      drag.pendingSelection = false
      drag.longPressed = true
      drag.longPressTimer = null
    }, 360)
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
    if (session.selectedAnimationFrameIds.includes(frameId) && pointerHitsSelectionOutline(event, `[data-animation-frame-selection~="${frameId}"]`)) {
      beginAnimationFrameDrag(event, frameId)
      return
    }
    const selected = session.selectedAnimationCellKeys.includes(key)
    if (selected) {
      showAnimationSelectionOutline()
      showAnimationCellSelectionOutline()
    }
    const preserveSelection = event.shiftKey || event.ctrlKey
    if (preserveSelection) {
      cancelAnimationPointerDrag()
      store.selectAnimationCell(key, event.ctrlKey || selected ? 'toggle' : 'range')
      event.preventDefault()
      return
    }
    const canMove = selected && currentCelHasContent(layerId, frameId) && pointerHitsSelectionOutline(event, '[data-animation-cel-selection]')
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
      pendingSelection: !canMove && !selected,
      longPressed: false,
      longPressTimer: null,
      lastSelectionTarget: key
    }
    setAnimationGestureSelection(null)
    if (!canMove) drag.longPressTimer = window.setTimeout(() => {
      if (drag.pendingSelection) store.selectAnimationCell(key, 'toggle')
      drag.pendingSelection = false
      drag.longPressed = true
      drag.longPressTimer = null
    }, 360)
    animationPointerDragRef.current = drag
    event.preventDefault()
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
    if (!mask) {
      if (event.shiftKey || event.ctrlKey) event.preventDefault()
      return
    }
    if (event.altKey) {
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
    if (preserveSelection) {
      cancelAnimationPointerDrag()
      store.selectAnimationMaskCell(key, event.ctrlKey || selected ? 'toggle' : 'range')
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
      pendingSelection: !canMove && !selected,
      longPressed: false,
      longPressTimer: null,
      lastSelectionTarget: key
    }
    setAnimationGestureSelection(null)
    if (drag.pendingSelection) drag.longPressTimer = window.setTimeout(() => {
      store.selectAnimationMaskCell(key, 'toggle')
      drag.pendingSelection = false
      drag.longPressed = true
      drag.longPressTimer = null
    }, 360)
    animationPointerDragRef.current = drag
    event.preventDefault()
  }
  const pointerTargetElement = (event: PointerEvent): Element | null => {
    const pointed = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(event.clientX, event.clientY) : null
    const animationTarget = pointed?.closest('[data-animation-frame-id], [data-animation-cel-key], [data-animation-mask-cel-key]')
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
  const updateAnimationItemCursor = (event: React.PointerEvent<HTMLElement>, frameId: string, _cellKey?: string): void => {
    const frameMove = session.selectedAnimationFrameIds.includes(frameId) && pointerHitsSelectionOutline(event, `[data-animation-frame-selection~="${frameId}"]`)
    event.currentTarget.style.cursor = frameMove ? 'var(--cursor-move)' : ''
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
          setAnimationGestureSelection({ kind: 'frame', ids: frameRange(drag.sourceFrameId, frameId) })
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
          setAnimationGestureSelection({ kind: drag.kind, keys: drag.kind === 'mask' ? maskCellRange(drag.sourceAnchorKey, key) : cellRange(drag.sourceAnchorKey, key) })
        }
      }
      return
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
    if (!drag.moved) {
      drag.moved = true
      if (drag.kind === 'frame') setDraggingAnimationFrameIds(drag.frameIds)
      else setDraggingAnimationCellKeys(drag.cellKeys)
    }
    const list = layerListRef.current
    if (list) {
      const bounds = list.getBoundingClientRect()
      if (event.clientX > bounds.right - 30) list.scrollLeft += 18
      else if (event.clientX < bounds.left + 30) list.scrollLeft -= 18
    }
    const pointed = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(event.clientX, event.clientY) : null
    const target = pointed?.closest('[data-animation-frame-id], [data-animation-cel-key], [data-animation-mask-cel-key]') ? pointed : pointerTargetElement(event)
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
      animationFrameDropTargetRef.current = next
      setAnimationFrameDropTarget(next)
      return
    }
    const cell = target?.closest<HTMLElement>(drag.kind === 'mask' ? '[data-animation-mask-cel-key]' : '[data-animation-cel-key]')
    const key = drag.kind === 'mask' ? cell?.dataset.animationMaskCelKey ?? null : cell?.dataset.animationCelKey ?? null
    animationCelDropTargetKeyRef.current = key
    setAnimationCelDropTargetKey(key)
  }
  const finishAnimationPointerDrag = (): void => {
    const drag = animationPointerDragRef.current
    if (!drag) return
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
    if (drag.longPressTimer !== null) window.clearTimeout(drag.longPressTimer)
    if (drag.moved) {
      if (drag.kind === 'frame' && animationFrameDropTargetRef.current) {
        store.moveSelectedAnimationFrames(animationFrameDropTargetRef.current.frameId, animationFrameDropTargetRef.current.insertAfter)
      } else if (drag.kind === 'cel' && animationCelDropTargetKeyRef.current) {
        const targetKey = animationCelDropTargetKeyRef.current
        const target = targetKey.lastIndexOf(':')
        if (target > 0) store.moveSelectedAnimationCels(targetKey.slice(0, target), targetKey.slice(target + 1), drag.sourceAnchorKey)
        hideAnimationCellSelectionOutline()
      } else if (drag.kind === 'mask' && animationCelDropTargetKeyRef.current) {
        const targetKey = animationCelDropTargetKeyRef.current
        const target = targetKey.lastIndexOf(':')
        if (target > 0) store.moveSelectedAnimationMasks(targetKey.slice(0, target), targetKey.slice(target + 1), drag.sourceAnchorKey)
        hideAnimationCellSelectionOutline()
      }
      suppressAnimationClickRef.current = true
      window.setTimeout(() => { suppressAnimationClickRef.current = false }, 0)
    } else if (drag.longPressed) {
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
      else if (drag.kind === 'mask') store.selectAnimationMaskCell(drag.sourceAnchorKey)
      else store.selectAnimationCell(drag.sourceAnchorKey)
    }
    animationPointerDragRef.current = null
    animationFrameDropTargetRef.current = null
    animationCelDropTargetKeyRef.current = null
    setAnimationFrameDropTarget(null)
    setAnimationCelDropTargetKey(null)
    setDraggingAnimationFrameIds([])
    setDraggingAnimationCellKeys([])
    setAnimationGestureSelection(null)
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
      if (target?.closest('[data-animation-frame-id], [data-animation-cel-key], [data-animation-mask-cel-key], [data-preserve-animation-selection], .animation-context-menu, .frame-properties-modal, .cel-properties-modal')) return
      if (target?.closest('[data-layer-id], [data-group-id]') && active?.selectedAnimationFrameIds.length) return
      const canvasTarget = target?.closest('.stage-canvas, .stage-surface')
      // Canvas interactions (drawing, panning, zooming, and selection edits)
      // keep the current frame/cel context. Only another timeline item changes
      // the active animation selection.
      if (canvasTarget) return
      if (active && (active.selectedAnimationFrameIds.length > 0 || active.selectedAnimationCellKeys.length > 0 || active.selectedAnimationMaskCellKeys.length > 0)) {
        setAnimationGestureSelection(null)
        store.clearAnimationSelection()
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
  const displayRows: LayerDisplayRow[] = nodes.flatMap((node): LayerDisplayRow[] => {
    const hasMask = node.kind === 'layer'
      ? timeline.frames.some((frame) => animationMaskAt(timeline, node.layer.id, frame.id))
      : (timeline.groupMasks ?? []).some((entry) => entry.groupId === node.group.id)
    if (!hasMask) return [{ kind: 'node', node }]
    const owner = node.kind === 'layer' ? node.layer : node.group
    return [{ kind: 'mask', ownerKind: node.kind, owner, depth: node.depth }, { kind: 'node', node }]
  })
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
  const isolatedMaskCellKey = session.layerMaskIsolatedView && session.activeLayerMaskId
    ? displayRows.flatMap((displayRow) => {
        if (displayRow.kind !== 'mask') return []
        const mask = animationMaskAt(timeline, displayRow.owner.id, timeline.activeFrameId)
        return mask?.id === session.activeLayerMaskId ? [animationCelKey(displayRow.owner.id, timeline.activeFrameId)] : []
      })[0] ?? null
    : null
  const renderedMaskCellKeys = [...new Set([...selectedMaskCellKeys, ...(isolatedMaskCellKey ? [isolatedMaskCellKey] : [])])]
  // Derive activity from selected cel coordinates without changing the
  // explicit selection mode stored in the session.
  const selectedCellTargets = [...renderedCellKeys, ...renderedMaskCellKeys]
    .map((key) => parseAnimationCelKey(key))
    .filter((target): target is { layerId: string; frameId: string } => Boolean(target))
  const selectedCellFrameIds = new Set(selectedCellTargets.map((target) => target.frameId))
  const selectedCellLayerIds = new Set(selectedCellTargets.map((target) => target.layerId))
  const cellSelectionActive = selectionOutlineVisible && !session.animationPlaying && selectedCellTargets.length > 0
  const hasMultipleCellSelection = renderedCellKeys.length + renderedMaskCellKeys.length > 1
  const hasMultipleLayerSelection = session.selectedLayerIds.length > 1
  // Suppress the active-frame guide only while the multi-cel selection is
  // visibly shown. Hidden formal selections must still leave the normal
  // active frame/cel context visible.
  const suppressCellSelectionGuides = selectionOutlineVisible && hasMultipleCellSelection && !hasMultipleLayerSelection
  const layerSelectionActive = selectionOutlineVisible && renderedFrameIds.length === 0 && renderedCellKeys.length === 0 && renderedMaskCellKeys.length === 0
  const showLayerSelectionAcrossTimeline = layerSelectionActive
  const selectedFrameIndexes = timeline.frames
    .map((frame, index) => renderedFrameIds.includes(frame.id) ? index : -1)
    .filter((index) => index >= 0)
  const selectedCellFrameIndexes = timeline.frames
    .map((frame, index) => cellSelectionActive && selectedCellFrameIds.has(frame.id) ? index : -1)
    .filter((index) => index >= 0)
  const selectedCellFrameRanges = selectedCellFrameIndexes.reduce<Array<{ start: number; span: number }>>((ranges, index) => {
    const previous = ranges.at(-1)
    if (previous && index === previous.start + previous.span) previous.span += 1
    else ranges.push({ start: index, span: 1 })
    return ranges
  }, [])
  const selectedCellLayerRows = displayRows.flatMap((displayRow, row) => {
    const ownerId = displayRow.kind === 'mask' ? displayRow.owner.id : displayRow.node.kind === 'layer' ? displayRow.node.layer.id : null
    return cellSelectionActive && ownerId && selectedCellLayerIds.has(ownerId) ? [row] : []
  })
  const timelineActiveFrameIndex = timeline.frames.findIndex((frame) => frame.id === timeline.activeFrameId)
  const showActiveFrameColumn = !session.animationPlaying && timelineActiveFrameIndex >= 0
  const selectedFrameIndexSet = new Set(selectedFrameIndexes)
  const selectedFrameRanges = selectedFrameIndexes.reduce<Array<{ start: number; span: number }>>((ranges, index) => {
    const previous = ranges.at(-1)
    if (previous && index === previous.start + previous.span) previous.span += 1
    else ranges.push({ start: index, span: 1 })
    return ranges
  }, [])
  const selectedCelPositions = displayRows.flatMap((displayRow, row) => {
    if (displayRow.kind === 'mask') {
      return timeline.frames.flatMap((frame, column) => {
        const cel = displayRow.ownerKind === 'layer' ? celLookup.at(displayRow.owner.id, frame.id) : null
        const mask = animationMaskAt(timeline, displayRow.owner.id, frame.id)
        return mask && renderedMaskCellKeys.includes(animationCelKey(displayRow.owner.id, frame.id)) ? [{ row, column }] : []
      })
    }
    if (displayRow.node.kind !== 'layer') return []
    const layerId = displayRow.node.layer.id
    return timeline.frames.flatMap((frame, column) => renderedCellKeys.includes(animationCelKey(layerId, frame.id)) ? [{ row, column }] : [])
  })
  const selectedCelRow = selectedCelPositions.length > 0 ? Math.min(...selectedCelPositions.map((position) => position.row)) : -1
  const selectedCelColumn = selectedCelPositions.length > 0 ? Math.min(...selectedCelPositions.map((position) => position.column)) : -1
  const selectedCelRowSpan = selectedCelPositions.length > 0 ? Math.max(...selectedCelPositions.map((position) => position.row)) - selectedCelRow + 1 : 0
  const selectedCelColumnSpan = selectedCelPositions.length > 0 ? Math.max(...selectedCelPositions.map((position) => position.column)) - selectedCelColumn + 1 : 0
  const implicitLayerCellKeys = new Set(session.selectedLayerIds.map((layerId) => animationCelKey(layerId, timeline.activeFrameId)))
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
      const cel = displayRow.kind === 'node' ? celLookup.at(owner.id, frame.id) : null
      const sourceId = displayRow.kind === 'mask' ? animationMaskAt(timeline, owner.id, frame.id)?.id : celLookup.resolve(cel)?.id
      if (!sourceId) return
      const indexes = bySource.get(sourceId) ?? []
      indexes.push(frameIndex)
      bySource.set(sourceId, indexes)
    })
    return [...bySource.entries()]
      .filter(([, frameIndexes]) => frameIndexes.length > 1)
       .map(([sourceId, frameIndexes]) => ({
         kind: displayRow.kind === 'mask' ? 'mask' as const : 'cel' as const,
         layerId: owner.id,
         row,
         sourceId,
         frameIndexes,
         layerSelected: displayRow.kind === 'mask' ? false : showLayerSelectionAcrossTimeline && session.selectedLayerIds.includes(owner.id) && !session.selectedGroupId
      }))
  })
  const renderedCellKeySet = new Set(renderedCellKeys)
  const renderedMaskCellKeySet = new Set(renderedMaskCellKeys)
  const linkedGroupKey = (group: { kind: 'cel' | 'mask'; layerId: string; sourceId: string }): string => `${group.kind}:${group.layerId}:${group.sourceId}`
  const groupCellKey = (group: { kind: 'cel' | 'mask'; layerId: string }, frameId: string): string => animationCelKey(group.layerId, frameId)
  const selectedLinkedCelGroups = new Set(linkedCelGroups
    .filter((group) => group.frameIndexes.some((frameIndex) => {
      const frameId = timeline.frames[frameIndex].id
      const selectedCells = group.kind === 'mask' ? renderedMaskCellKeySet : renderedCellKeySet
      return renderedFrameIds.includes(frameId) || selectedCells.has(groupCellKey(group, frameId))
    }))
    .map(linkedGroupKey))
  const highlightedLinkedCelGroups = new Set([
    ...selectedLinkedCelGroups,
    ...linkedCelGroups
      .filter((group) => group.layerSelected && group.frameIndexes.includes(activeFrameIndex))
      .map(linkedGroupKey)
  ])
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
  const selectedAnimationLayerRows = displayRows.flatMap((displayRow, row) => {
    if (displayRow.kind !== 'node' || displayRow.node.kind !== 'layer') return []
    return layerSelectionActive && session.selectedLayerIds.includes(displayRow.node.layer.id) && !session.selectedGroupId ? [row] : []
  })
  const activeAnimationLayerRow = displayRows.findIndex((displayRow) => displayRow.kind === 'node' && displayRow.node.kind === 'layer' && displayRow.node.layer.id === session.document.activeLayerId)
  useLayoutEffect(() => {
    const grid = layerListRef.current?.querySelector<HTMLElement>('.layer-animation-grid')
    if (!grid) return
    grid.style.setProperty('--active-layer-row', String(Math.max(0, activeAnimationLayerRow)))
  }, [activeAnimationLayerRow, session.document.id, session.document.activeLayerId, session.layersPanelRevision, displayRows.length])
  useLayoutEffect(() => {
    const list = layerListRef.current
    if (!list) return
    const hasSelection = selectedAnimationLayerRows.length > 0
    list.classList.toggle('has-layer-selection-outline', hasSelection)
    if (!hasSelection) return
    const start = Math.min(...selectedAnimationLayerRows)
    const end = Math.max(...selectedAnimationLayerRows)
    list.style.setProperty('--layer-selection-start', String(start))
    list.style.setProperty('--layer-selection-span', String(end - start + 1))
  }, [selectedAnimationLayerRows.join('\u0000'), session.document.id, session.layersPanelRevision, selectionOutlineVisible])
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
  const editGroupRow = (group: LayerGroup): void => {
    const selectedTargets = selectedRowsForProperties(session)
    if (selectedTargets.length > 1 && selectedTargets.some((target) => target.kind === 'group' && target.id === group.id)) editSelectedRows()
    else editGroup(group)
  }
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
  const beginLayerDrag = (event: React.PointerEvent<HTMLButtonElement>, layerId: string): void => {
    if (event.button !== 0) return
    const wasEditingLayerMask = Boolean(session.activeLayerMaskId)
    if (wasEditingLayerMask) store.selectLayer(layerId)
    else if (event.ctrlKey) store.selectLayer(layerId, 'toggle')
    else if (event.shiftKey) store.selectLayer(layerId, 'range')
    else if (!event.ctrlKey && !event.shiftKey) {
      setAnimationGestureSelection(null)
      if (session.selectedAnimationFrameIds.length > 0 || session.selectedAnimationCellKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0 || session.selectedGroupId || !session.selectedLayerIds.includes(layerId)) store.selectLayer(layerId)
    }
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const rows = active ? selectedRowsForDrag(active) : { ids: [layerId], groupIds: [] }
    const ids = rows.ids.includes(layerId) ? rows.ids : [layerId]
    const groupIds = rows.ids.includes(layerId) ? rows.groupIds : []
    const selectionLocked = ids.some((id) => { const layer = session.document.layers.find((candidate) => candidate.id === id); return Boolean(layer && isLayerEffectivelyLocked(session.document, layer)) })
      || groupIds.some((id) => { const group = session.document.groups.find((candidate) => candidate.id === id); return Boolean(group && isGroupEffectivelyLocked(session.document, group)) })
    if (selectionLocked) {
      if (!event.ctrlKey && !event.shiftKey) store.selectLayer(layerId)
      return
    }
    dragRef.current = { ids, groupIds, groupId: groupIds.length === 1 && ids.length === 0 ? groupIds[0] : undefined, row: { id: layerId, kind: 'layer' }, preserveSelection: event.ctrlKey || event.shiftKey, selectedLayerIds: [...(active?.selectedLayerIds ?? ids)], selectedGroupIds: [...(active?.selectedGroupIds ?? groupIds)], wholeGroupSelection: Boolean(active?.selectedGroupId), startX: event.clientX, startY: event.clientY, moved: false, copy: event.altKey }
    event.preventDefault()
  }
  const beginGroupDrag = (event: React.PointerEvent<HTMLButtonElement>, groupId: string): void => {
    if (event.button !== 0) return
    const wasEditingLayerMask = Boolean(session.activeLayerMaskId)
    if (wasEditingLayerMask) store.selectGroup(groupId)
    else if (event.ctrlKey) store.selectGroup(groupId, 'toggle')
    else if (event.shiftKey) store.selectGroup(groupId, 'range')
    else if (!session.selectedGroupIds.includes(groupId)) store.selectGroup(groupId)
    const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
    const rows = active ? selectedRowsForDrag(active) : { ids: [], groupIds: [groupId] }
    const ids = rows.groupIds.includes(groupId) ? rows.ids : []
    const groupIds = rows.groupIds.includes(groupId) ? rows.groupIds : [groupId]
    const allGroupIds = new Set(groupIds.flatMap((id) => [id, ...getDescendantGroupIds(session.document, id)]))
    const allLayerIds = new Set([...ids, ...groupIds.flatMap((id) => getLayerIdsInGroup(session.document, id))])
    const selectionLocked = session.document.groups.some((group) => allGroupIds.has(group.id) && isGroupEffectivelyLocked(session.document, group))
      || session.document.layers.some((layer) => allLayerIds.has(layer.id) && isLayerEffectivelyLocked(session.document, layer))
    if (selectionLocked) {
      if (!event.ctrlKey && !event.shiftKey) store.selectGroup(groupId)
      return
    }
    dragRef.current = { ids, groupIds, groupId: groupIds.length === 1 && ids.length === 0 ? groupIds[0] : undefined, row: { id: groupId, kind: 'group' }, preserveSelection: event.ctrlKey || event.shiftKey, selectedLayerIds: [...(active?.selectedLayerIds ?? ids)], selectedGroupIds: [...(active?.selectedGroupIds ?? groupIds)], wholeGroupSelection: Boolean(active?.selectedGroupId), startX: event.clientX, startY: event.clientY, moved: false, copy: event.altKey }
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
    if (drag && !drag.moved && !drag.preserveSelection) {
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
    const finish = (event: PointerEvent): void => { finishLayerPanelToggle(); finishLayerDrag(event.clientX, event.clientY); finishAnimationPointerDragRef.current() }
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
    const sourceIds = new Set<string>()
    let hasContent = false
    let canCreate = false
    for (const cel of timeline.cels) {
      if (cel.layerId !== contextMenu.id) continue
      const source = celLookup.resolve(cel) ?? cel
      if (sourceIds.has(source.id) || !animationCelHasContent(source, session.document.palette)) continue
      sourceIds.add(source.id)
      hasContent = true
      if (!source.mask) canCreate = true
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
      ...timeline.cels.flatMap((cel) => cel.mask ? [{ key: animationCelKey(cel.layerId, cel.frameId), mask: cel.mask }] : []),
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
    {selectionOutlineVisible && !session.animationPlaying && selectedFrameRanges.map((range) => <span key={`${range.start}-${range.span}`} data-animation-frame-selection={timeline.frames.slice(range.start, range.start + range.span).map((frame) => frame.id).join(' ')} className="animation-frame-selection-column" style={{ '--animation-frame-index': range.start, '--animation-frame-span': range.span } as CSSProperties} aria-hidden="true" />)}
    {animationFrameDropTarget && timeline.frames.findIndex((frame) => frame.id === animationFrameDropTarget.frameId) >= 0 && <span className="animation-frame-drop-line" style={{ '--animation-frame-drop-index': timeline.frames.findIndex((frame) => frame.id === animationFrameDropTarget.frameId) + (animationFrameDropTarget.insertAfter ? 1 : 0) } as CSSProperties} aria-hidden="true" />}
  </>
  const animationFrameHeaders = timeline.frames.map((frame, index) => {
    const frameActive = frame.id === timeline.activeFrameId
      || (cellSelectionActive && selectedCellFrameIds.has(frame.id))
    const frameSelected = !session.animationPlaying && selectedFrameIndexSet.has(index)
    return <button type="button" data-animation-frame-id={frame.id} data-frame-index={index} key={`header-${frame.id}`} className={`layer-animation-frame-header ${frameActive ? 'active' : ''} ${frameSelected ? 'selected-animation-frame' : ''} ${draggingAnimationFrameIds.includes(frame.id) ? 'dragging' : ''}`} aria-label={t('timeline.frameNumber', { number: index + 1 })} title={`${t('timeline.frameNumber', { number: index + 1 })} · ${frame.duration} ms`} onPointerDown={(event) => beginAnimationFrameDrag(event, frame.id)} onPointerMove={(event) => updateAnimationItemCursor(event, frame.id)} onPointerLeave={(event) => { event.currentTarget.style.cursor = '' }} onClick={(event) => { if (suppressAnimationClickRef.current) { event.preventDefault(); event.stopPropagation(); return } if (event.detail === 0) selectAnimationFrame(frame.id, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace') }} onDoubleClick={() => openFramePropertiesFor(frame.id)} onContextMenu={(event) => openFrameMenu(event, frame.id)}><strong>{index + 1}</strong>{layerDensity !== 'compact' && <small>{frame.duration}</small>}</button>
  })
  const hideSideDockActions = sideDocked && layerSettings.sideDockAutoHide
  const densityLabel = t(layerDensityLabelKeys[layerSettings.density])
  const densityDescription = t(layerDensityDescriptionKeys[layerSettings.density])
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
    {integratedFreeTileInstanceLayer ? <FreeTileInstanceLayers session={session} layer={integratedFreeTileInstanceLayer} listRef={layerListRef} /> : <div ref={layerListRef} className="layer-list layer-animation-list component-scrollbar" style={{ '--layer-frame-count': timeline.frames.length } as CSSProperties} onScroll={syncAnimationLoopSectionScroll} onPointerDown={(event) => { if (event.target === event.currentTarget) { store.clearLayerSelection(); store.clearAnimationSelection() } }} onContextMenu={(event) => { const target = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id], [data-group-id]'); if (target?.dataset.layerId) openLayerContextMenu(event, 'layer', target.dataset.layerId); else if (target?.dataset.groupId) openLayerContextMenu(event, 'group', target.dataset.groupId); else openLayerCreateContextMenu(event) }}><div className="layer-animation-tree"><div className="layer-animation-corner"><ActiveFrameSync documentId={session.document.id} frameIds={timeline.frames.map((frame) => frame.id)} containerRef={layerListRef} suppressActiveGuide={suppressCellSelectionGuides} /></div>{animationColumnResizer}{displayRows.map((displayRow) => {
      if (displayRow.kind === 'mask') {
        const activeCel = displayRow.ownerKind === 'layer' ? celLookup.at(displayRow.owner.id, timeline.activeFrameId) : null
        const activeMask = animationMaskAt(timeline, displayRow.owner.id, timeline.activeFrameId)
        const rowSelected = !suppressCellSelectionGuides && (session.selectedAnimationMaskCellKeys.some((key) => parseAnimationCelKey(key)?.layerId === displayRow.owner.id) || Boolean(activeMask && session.activeLayerMaskId === activeMask.id))
        const cellActiveLayer = cellSelectionActive && selectedCellLayerIds.has(displayRow.owner.id)
        const maskNameKey = displayRow.ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask'
        const maskRowTooltip = <><strong>{t(maskNameKey)}</strong><span>{t('layers.layerMaskDescription')}</span><small>{t('layers.layerMaskUsage')}</small></>
        const maskVisibilityTarget: LayerPanelToggleTarget | null = displayRow.ownerKind === 'layer'
          ? activeCel ? { control: 'visibility', ownerKind: 'layer-mask', id: activeCel.id } : null
          : { control: 'visibility', ownerKind: 'group-mask', id: displayRow.owner.id, frameId: timeline.activeFrameId }
        return <button type="button" key={`mask-row-${displayRow.owner.id}`} data-layer-mask-row-owner={displayRow.owner.id} className={`layer-row layer-mask-row ${rowSelected ? 'selected' : ''} ${activeMask && altCopyReady ? 'mask-edit-ready' : ''}`} style={{ '--layer-depth': displayRow.depth } as React.CSSProperties} onPointerDown={(event) => { if (event.button !== 0) return; if (!event.altKey || !activeMask) { suppressMaskRowClickRef.current = false; return } if (!toggleAnimationMaskIsolatedView(displayRow.owner.id, timeline.activeFrameId, event.shiftKey)) return; suppressMaskRowClickRef.current = true; event.preventDefault(); event.stopPropagation() }} onPointerCancel={() => { suppressMaskRowClickRef.current = false }} onClick={(event) => { if (suppressMaskRowClickRef.current || event.altKey) { suppressMaskRowClickRef.current = false; event.preventDefault(); event.stopPropagation(); return } if (activeMask) { store.selectAnimationMaskCell(animationCelKey(displayRow.owner.id, timeline.activeFrameId)); hideAnimationCellSelectionOutline() } }} onContextMenu={(event) => { event.stopPropagation(); openCelMenu(event, displayRow.owner.id, timeline.activeFrameId, 'mask') }}><span className="layer-visibility layer-mask-row-visibility" role="button" tabIndex={-1} aria-label={t(activeMask?.visible === false ? 'layers.showLayer' : 'layers.hideLayer')} onPointerDown={(event) => { if (activeMask && maskVisibilityTarget) beginLayerPanelToggle(event, maskVisibilityTarget, activeMask.visible); else event.stopPropagation() }} onPointerEnter={(event) => { if (maskVisibilityTarget) continueLayerPanelToggle(event, maskVisibilityTarget) }} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{activeMask?.visible === false ? <PixelUtilityIcon kind="eyeOff" /> : <PixelUtilityIcon kind="eye" />}</span><span className="layer-mask-row-lock-slot" aria-hidden="true" /><span className="layer-name"><span>{t(maskNameKey)}</span><small>{displayRow.owner.name}</small></span><Tooltip className="layer-status-icon-tooltip layer-mask-row-layer-icon" content={maskRowTooltip}><span className="layer-mask-row-icon" aria-hidden="true"><PixelUtilityIcon kind="layerMask" /></span></Tooltip></button>
      }
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
        return <button key={node.group.id} data-group-id={node.group.id} className={`layer-row group-row ${node.group.clippingMask === true ? 'clipping-mask' : ''} ${groupHasLayerStyles ? 'has-layer-style' : ''} ${layerSelectionActive && session.selectedGroupIds.includes(node.group.id) ? 'selected' : ''} ${draggingGroupId === node.group.id ? 'dragging' : ''} ${groupInsideTarget ? 'group-drop-target' : ''} ${layerStyleDrag?.target?.kind === 'group' && layerStyleDrag.target.id === node.group.id ? 'layer-style-drop-target' : ''}`} style={{ '--layer-depth': node.depth } as React.CSSProperties} onPointerDown={(event) => beginGroupDrag(event, node.group.id)} onDoubleClick={() => editGroupRow(node.group)}>{groupIndicator}{displayColorSegments.map((segment, index) => <span key={`group-color-stripe-${node.group.id}-${index}`} className="layer-color-stripe" style={{ left: `${segment.left}px`, width: `${segment.width}px`, backgroundColor: `rgba(${segment.color.r}, ${segment.color.g}, ${segment.color.b}, ${segment.color.a / 255})` }} aria-hidden="true" />)}<span className="layer-visibility" role="button" tabIndex={-1} aria-label={t(node.group.visible ? 'layers.hideGroup' : 'layers.showGroup')} onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'visibility', ownerKind: 'group', id: node.group.id }, node.group.visible)} onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'visibility', ownerKind: 'group', id: node.group.id })} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{node.group.visible ? <PixelUtilityIcon kind="eye" /> : <PixelUtilityIcon kind="eyeOff" />}</span><span className={`layer-lock-toggle ${node.group.locked || lockingAncestor ? 'locked' : ''}`} role="button" tabIndex={-1} title={lockingAncestor ? t('layers.lockedByGroup', { name: lockingAncestor.name }) : undefined} aria-label={lockingAncestor ? t('layers.lockedByGroup', { name: node.group.locked ? 'layers.unlockGroup' : 'layers.lockGroup' }) : t(node.group.locked ? 'layers.unlockGroup' : 'layers.lockGroup')} aria-disabled={Boolean(lockingAncestor)} aria-pressed={node.group.locked || Boolean(lockingAncestor)} onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'lock', ownerKind: 'group', id: node.group.id }, node.group.locked, lockingAncestor?.name)} onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'lock', ownerKind: 'group', id: node.group.id })} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{node.group.locked || lockingAncestor ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}</span><span className="group-folder" role="button" tabIndex={-1} aria-label={t(collapsed ? 'layers.expandGroup' : 'layers.collapseGroup')} title={t(collapsed ? 'layers.expandGroup' : 'layers.collapseGroup')} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); store.toggleGroupCollapsed(node.group.id) }}>{collapsed ? <PixelUtilityIcon kind="folder" /> : <PixelUtilityIcon kind="folderOpen" />}</span><Tooltip className="layer-name" content={node.group.description?.trim()}><span>{node.group.name}</span><small>{blendOptions.find((option) => option.value === node.group.blendMode)?.label} · {Math.round(node.group.opacity * 100)}%</small></Tooltip>{node.group.clippingMask === true && <Tooltip className="layer-status-icon-tooltip" content={clippingMaskTooltip}><span className="layer-clipping-mask-indicator" aria-hidden="true"><PixelUtilityIcon kind="clippingMask" /></span></Tooltip>}{groupHasLayerStyles && layerStyleIndicator({ kind: 'group', id: node.group.id })}</button>
      }
      const activeLayer = node.layer.id === session.document.activeLayerId
      const cellActiveLayer = cellSelectionActive && selectedCellLayerIds.has(node.layer.id)
      const selected = layerSelectionActive && session.selectedLayerIds.includes(node.layer.id) && !session.selectedGroupId
      const rowVisuallySelected = selected
      const lockingGroup = getLayerLockingGroup(session.document, node.layer)
      const displayColorSegments = displayColorStripeSegments(node.layer, 'layer', node.depth)
      const indicator = dropTarget?.kind === 'layer' && dropTarget.id === node.layer.id
        ? <span className={`layer-drop-indicator ${dropTarget.insertAfter ? 'above' : 'below'}`} style={{ left: `${8 + node.depth * 14}px` }} aria-hidden="true"><i /><b /><i /></span>
        : null
      const layerHasLayerStyles = hasConfiguredLayerStyles(node.layer.layerStyles)
      return <button key={node.layer.id} data-layer-id={node.layer.id} className={`layer-row ${node.layer.kind === 'text' ? 'text-layer' : ''} ${node.layer.kind === 'tilemap' ? 'tilemap-layer' : ''} ${node.layer.kind === 'free-tile' ? 'free-tile-layer' : ''} ${node.layer.background ? 'background-layer' : ''} ${node.layer.linkedContentId ? 'linked-layer' : ''} ${node.layer.clippingMask === true ? 'clipping-mask' : ''} ${layerHasLayerStyles ? 'has-layer-style' : ''} ${node.depth > 0 ? 'group-member' : ''} ${rowVisuallySelected ? 'selected' : ''} ${draggingIds.includes(node.layer.id) ? 'dragging' : ''} ${layerStyleDrag?.target?.kind === 'layer' && layerStyleDrag.target.id === node.layer.id ? 'layer-style-drop-target' : ''}`} style={{ '--layer-depth': node.depth } as React.CSSProperties} onPointerDown={(event) => beginLayerDrag(event, node.layer.id)} onDoubleClick={() => editLayerRow(node.layer)}>{indicator}{displayColorSegments.map((segment, index) => <span key={`layer-color-stripe-${node.layer.id}-${index}`} className="layer-color-stripe" style={{ left: `${segment.left}px`, width: `${segment.width}px`, backgroundColor: `rgba(${segment.color.r}, ${segment.color.g}, ${segment.color.b}, ${segment.color.a / 255})` }} aria-hidden="true" />)}<span className="layer-visibility" role="button" tabIndex={-1} aria-label={t(node.layer.visible ? 'layers.hideLayer' : 'layers.showLayer')} onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'visibility', ownerKind: 'layer', id: node.layer.id }, node.layer.visible)} onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'visibility', ownerKind: 'layer', id: node.layer.id })} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{node.layer.visible ? <PixelUtilityIcon kind="eye" /> : <PixelUtilityIcon kind="eyeOff" />}</span><span className={`layer-lock-toggle ${node.layer.locked || lockingGroup ? 'locked' : ''}`} role="button" tabIndex={-1} title={lockingGroup ? t('layers.lockedByGroup', { name: lockingGroup.name }) : undefined} aria-label={lockingGroup ? t('layers.lockedByGroup', { name: lockingGroup.name }) : t(node.layer.locked ? 'layers.unlockLayer' : 'layers.lockLayer')} aria-disabled={Boolean(lockingGroup)} aria-pressed={node.layer.locked || Boolean(lockingGroup)} onPointerDown={(event) => beginLayerPanelToggle(event, { control: 'lock', ownerKind: 'layer', id: node.layer.id }, node.layer.locked, lockingGroup?.name)} onPointerEnter={(event) => continueLayerPanelToggle(event, { control: 'lock', ownerKind: 'layer', id: node.layer.id })} onPointerUp={endLayerPanelToggle} onDoubleClick={(event) => event.stopPropagation()} onClick={finishLayerPanelToggleClick}>{node.layer.locked || lockingGroup ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}</span><Tooltip className="layer-name" content={node.layer.description?.trim()}><span>{node.layer.name}</span><small>{blendOptions.find((option) => option.value === node.layer.blendMode)?.label} · {Math.round(node.layer.opacity * 100)}%</small></Tooltip>{node.layer.kind === 'text' && <Tooltip className="layer-status-icon-tooltip" content={t('layers.textLayerHint')}><span className="layer-text-indicator" aria-hidden="true"><PixelUtilityIcon kind="text" /></span></Tooltip>}{node.layer.kind === 'tilemap' && <Tooltip className="layer-status-icon-tooltip" content={t('layers.tilemapLayerHint')}><span className="layer-tilemap-indicator" aria-hidden="true"><PixelUtilityIcon kind="tilemap" /></span></Tooltip>}{node.layer.kind === 'free-tile' && <Tooltip className="layer-status-icon-tooltip" content={<><strong>{t('layers.freeTileLayerHint')}</strong><span>{t('freeTiles.openInstanceLayers')}</span></>}><span className="layer-tilemap-indicator" role="button" tabIndex={0} aria-label={t('freeTiles.openInstanceLayers')} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openFreeTileInstanceLayers(node.layer.id) }} onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); event.stopPropagation(); openFreeTileInstanceLayers(node.layer.id) }}><PixelUtilityIcon kind="freeTile" /></span></Tooltip>}{node.layer.background && <Tooltip className="layer-status-icon-tooltip" content={t('layers.backgroundDescription')}><span className="layer-background-indicator" aria-hidden="true"><PixelUtilityIcon kind="image" /></span></Tooltip>}{node.layer.linkedContentId && <Tooltip className="layer-status-icon-tooltip" content={<><strong>{t('layers.linkedLayer')}</strong><span>{t('layers.linkedLayerDescription')}</span></>}><span className="layer-linked-indicator" aria-hidden="true"><PixelUtilityIcon kind="linkedLayer" /></span></Tooltip>}{node.layer.clippingMask === true && <Tooltip className="layer-status-icon-tooltip" content={clippingMaskTooltip}><span className="layer-clipping-mask-indicator" aria-hidden="true"><PixelUtilityIcon kind="clippingMask" /></span></Tooltip>}{layerHasLayerStyles && layerStyleIndicator({ kind: 'layer', id: node.layer.id })}</button>
    })}</div><div className="layer-animation-grid" style={{ gridTemplateRows: displayRowGridTemplate }}>{selectedAnimationLayerRows.map((row) => <span key={`selected-layer-row-${row}`} data-animation-selected-layer-row className="animation-selected-layer-row" style={{ '--animation-row-index': row, '--animation-row-top': displayRowTop(row), '--animation-row-height': displayRowSpanHeight(row, 1) } as CSSProperties} aria-hidden="true" />)}{showLinkedCelVisuals && linkedCelBlocks.map((block) => <span key={block.key} data-linked-cel-block data-frame-index={block.start} data-frame-span={block.span} className={`animation-linked-cel-block ${block.selected ? 'selected' : ''} ${block.layerSelected ? 'layer-selected' : ''}`} style={{ '--animation-row-index': block.row, '--animation-row-top': displayRowTop(block.row), '--animation-row-height': displayRowSpanHeight(block.row, 1), '--animation-frame-index': block.start, '--animation-frame-span': block.span } as CSSProperties} aria-hidden="true" />)}{showLinkedCelVisuals && linkedCelConnectors.map((connector) => <span key={connector.key} data-linked-cel-connector data-start-frame-index={connector.start} data-end-frame-index={connector.end} className={`animation-linked-cel-connector ${connector.selected ? 'selected' : ''} ${connector.layerSelected ? 'layer-selected' : ''}`} style={{ '--animation-row-index': connector.row, '--animation-row-top': displayRowTop(connector.row), '--animation-row-height': displayRowSpanHeight(connector.row, 1), '--animation-link-start': connector.start, '--animation-link-end': connector.end } as CSSProperties} aria-hidden="true" />)}{animationFrameGridDecorations}{!session.animationPlaying && shouldShowAnimationCellSelectionOutline && selectedCelPositions.length > 0 && <span data-animation-cel-selection className="animation-cel-selection-box" style={{ '--animation-frame-index': selectedCelColumn, '--animation-frame-span': selectedCelColumnSpan, '--animation-row-index': selectedCelRow, '--animation-row-span': selectedCelRowSpan, '--animation-row-top': displayRowTop(selectedCelRow), '--animation-row-height': displayRowSpanHeight(selectedCelRow, selectedCelRowSpan) } as CSSProperties} aria-hidden="true" />}{animationFrameHeaders}{displayRows.flatMap((displayRow) => timeline.frames.map((frame, index) => {
      const active = frame.id === timeline.activeFrameId
      const frameVisuallySelected = selectionOutlineVisible && !session.animationPlaying && renderedFrameIds.includes(frame.id)
      const activeFrameHighlighted = active
        || (cellSelectionActive && selectedCellFrameIds.has(frame.id))
      if (displayRow.kind === 'mask') {
        const cel = displayRow.ownerKind === 'layer' ? celLookup.at(displayRow.owner.id, frame.id) : null
        const mask = animationMaskAt(timeline, displayRow.owner.id, frame.id)
        const key = animationCelKey(displayRow.owner.id, frame.id)
        const linkedMaskMember = showLinkedCelVisuals && linkedCelMemberKeys.has(`mask|${key}`)
        const linkedMaskBridgeEnd = showLinkedCelVisuals && linkedCelBridgeEndKeys.has(`mask|${key}`)
        const linkedMaskGroup = linkedCelGroups.find((group) => group.kind === 'mask' && group.layerId === displayRow.owner.id && group.frameIndexes.includes(index))
        const linkedMaskWithPrevious = Boolean(linkedMaskGroup && linkedMaskGroup.frameIndexes.includes(index - 1))
        const linkedMaskWithNext = Boolean(linkedMaskGroup && linkedMaskGroup.frameIndexes.includes(index + 1))
        const linkedMaskEnd = linkedMaskWithPrevious && !linkedMaskWithNext && !linkedMaskBridgeEnd
        const maskSelected = selectionOutlineVisible && !session.animationPlaying && renderedMaskCellKeys.includes(key)
        const maskActive = active && Boolean(mask && session.activeLayerMaskId === mask.id)
        const maskVisuallySelected = maskSelected || maskActive
        const maskThumbnail = mask && showCelThumbnails
          ? maskActive
            ? <ActiveLayerMaskThumbnail documentId={session.document.id} mask={mask} revision={session.contentRevision} documentWidth={session.document.width} documentHeight={session.document.height} thumbnailSize={celThumbnailSize} />
            : <LayerMaskThumbnail mask={mask} revision={0} documentWidth={session.document.width} documentHeight={session.document.height} thumbnailSize={celThumbnailSize} />
          : null
        const maskName = t(displayRow.ownerKind === 'group' ? 'core.document.layerGroupMask' : 'core.document.layerMask')
        return <button type="button" key={`mask-${displayRow.owner.id}-${frame.id}`} data-animation-mask-cel-key={key} data-frame-index={index} className={`layer-animation-cel layer-mask-cel ${mask ? 'has-mask' : ''} ${mask && altCopyReady ? 'mask-edit-ready' : ''} ${activeFrameHighlighted ? 'active-frame' : ''} ${frameVisuallySelected ? 'selected-animation-frame' : ''} ${maskActive ? 'active-mask' : ''} ${maskVisuallySelected ? 'selected-cel' : ''} ${linkedMaskMember ? 'linked-cel-member' : ''} ${showLinkedCelVisuals && (linkedMaskWithPrevious || linkedMaskWithNext) ? 'linked-cel' : ''} ${showLinkedCelVisuals && linkedMaskWithPrevious ? 'linked-cel-previous' : ''} ${showLinkedCelVisuals && linkedMaskWithNext ? 'linked-cel-next' : ''} ${linkedMaskEnd ? 'linked-cel-end' : ''} ${linkedMaskBridgeEnd ? 'linked-cel-bridge-end' : ''} ${draggingAnimationCellKeys.includes(key) ? 'dragging' : ''} ${animationCelDropTargetKey === key ? 'drop-target' : ''}`} aria-label={`${maskName} · ${t('timeline.frameNumber', { number: index + 1 })}`} title={`${displayRow.owner.name} · ${maskName} · ${t('timeline.frameNumber', { number: index + 1 })}`} onPointerDown={(event) => beginAnimationMaskDrag(event, displayRow.owner.id, frame.id)} onPointerMove={(event) => updateAnimationItemCursor(event, frame.id, key)} onPointerLeave={(event) => { event.currentTarget.style.cursor = '' }} onClick={(event) => { if (suppressAnimationClickRef.current) { event.preventDefault(); event.stopPropagation(); return } if (event.detail === 0) store.selectAnimationMaskCell(key, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace') }} onContextMenu={(event) => openCelMenu(event, displayRow.owner.id, frame.id, 'mask')}>{mask && <span className="cel-mask-marker" data-layer-mask-id={mask.id} aria-hidden="true">{maskThumbnail}</span>}</button>
      }
      const node = displayRow.node
      if (node.kind === 'group') return <button type="button" key={`${node.id}-${frame.id}`} data-frame-index={index} className={`layer-animation-cel group ${activeFrameHighlighted ? 'active-frame' : ''} ${frameVisuallySelected ? 'selected-animation-frame' : ''}`} title={t('timeline.frameNumber', { number: index + 1 })} onClick={() => selectAnimationFrame(frame.id)} />
      const selected = session.selectedLayerIds.includes(node.layer.id) && !session.selectedGroupId
      const currentFrameCellHighlighted = activeFrameHighlighted
        && (selectionOutlineVisible ? selected : node.layer.id === session.document.activeLayerId)
      const cel = celLookup.at(node.layer.id, frame.id)
      const resolvedCel = celLookup.resolve(cel)
      const contentRevision = active && selected ? session.contentRevision : 0
      const hasContent = cachedCelHasContent(resolvedCel, session.document.palette, contentRevision)
      const key = animationCelKey(node.layer.id, frame.id)
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
      const cellSelected = selectionOutlineVisible && !session.animationPlaying && renderedCellKeys.includes(key)
      // A frame selection is a timeline-column selection. It applies to every
      // layer row, not only the layer that currently owns the canvas focus.
      const frameCellSelected = frameVisuallySelected
      const cellVisuallySelected = cellSelected || frameCellSelected
      const defaultActiveCell = !session.animationPlaying && active && node.layer.id === session.document.activeLayerId
      const currentCell = defaultActiveCell || (!suppressCellSelectionGuides && currentFrameCellHighlighted
        && (!selectionOutlineVisible || renderedCellKeys.length === 0 || cellVisuallySelected))
      // Explicit layer selection highlights every cel in those layers;
      // frame/cel selection modes remain mutually exclusive.
      const layerSelectionModeActive = session.selectedAnimationFrameIds.length === 0
        && session.selectedAnimationCellKeys.length === 0
        && session.selectedAnimationMaskCellKeys.length === 0
      // The active layer is only the interaction context on project startup;
      // show the full-row selection after the user explicitly selects a layer.
      const layerSelectedAcrossTimeline = selectionOutlineVisible && layerSelectionModeActive && selected
      const selectionMarker = (currentCell || layerSelectedAcrossTimeline || cellVisuallySelected)
        ? <span className="cel-content-marker selection-marker" aria-hidden="true" />
        : null
      const normalCelMarker = currentCell
        ? <span className="cel-content-marker selection-marker" aria-hidden="true" />
        : active && selected && resolvedCel
        ? <ActiveCelContent documentId={session.document.id} cel={resolvedCel} palette={session.document.palette} revision={contentRevision} documentWidth={session.document.width} documentHeight={session.document.height} thumbnailSize={celThumbnailSize} showThumbnail={showCelThumbnails} />
        : hasContent
          ? (showCelThumbnails && resolvedCel ? <CelThumbnail cel={resolvedCel} palette={session.document.palette} revision={contentRevision} documentWidth={session.document.width} documentHeight={session.document.height} thumbnailSize={celThumbnailSize} /> : <span className="cel-content-marker" />)
          : selectionMarker
      return <button type="button" data-animation-cel-key={key} data-frame-index={index} key={`${node.id}-${frame.id}`} className={`layer-animation-cel ${node.layer.kind === 'text' ? 'text-cel' : ''} ${node.layer.kind === 'tilemap' ? 'tilemap-cel' : ''} ${node.layer.kind === 'free-tile' ? 'free-tile-cel' : ''} ${cel ? 'has-cel' : ''} ${currentFrameCellHighlighted ? 'active-frame' : ''} ${frameVisuallySelected ? 'selected-animation-frame' : ''} ${layerSelectedAcrossTimeline ? 'selected-layer' : ''} ${currentCell ? 'current-cel' : ''} ${cellVisuallySelected ? 'selected-cel' : ''} ${linkedCelMember ? 'linked-cel-member' : ''} ${showLinkedCelVisuals && (linkedWithPrevious || linkedWithNext) ? 'linked-cel' : ''} ${showLinkedCelVisuals && linkedWithPrevious ? 'linked-cel-previous' : ''} ${showLinkedCelVisuals && linkedWithNext ? 'linked-cel-next' : ''} ${linkedCelEnd ? 'linked-cel-end' : ''} ${linkedCelBridgeEnd ? 'linked-cel-bridge-end' : ''} ${draggingAnimationFrameIds.includes(frame.id) || draggingAnimationCellKeys.includes(key) ? 'dragging' : ''} ${animationCelDropTargetKey === key ? 'drop-target' : ''}`} aria-label={t('timeline.celAtFrame', { number: index + 1 })} title={`${node.layer.name} · ${t('timeline.frameNumber', { number: index + 1 })}`} onPointerDown={(event) => beginAnimationCelDrag(event, node.layer.id, frame.id)} onPointerMove={(event) => updateAnimationItemCursor(event, frame.id, key)} onPointerLeave={(event) => { event.currentTarget.style.cursor = '' }} onClick={(event) => { if (suppressAnimationClickRef.current) { event.preventDefault(); event.stopPropagation(); return } if (event.detail === 0) store.selectAnimationCell(key, event.shiftKey ? 'range' : event.ctrlKey ? 'toggle' : 'replace') }} onDoubleClick={() => {
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
