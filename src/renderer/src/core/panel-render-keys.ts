import type { RgbaColor, SpriteDocument } from '@shared/types'
import { getRasterContentRevision } from './document'
import type { TilemapDrawingMode } from './tilemap'
import type { FreeTileDrawingMode } from './free-tile'

interface PanelSessionState {
  document: SpriteDocument
  primaryColor: RgbaColor
  secondaryColor: RgbaColor
  selectedPaletteIds: number[]
  selectedTilesetId?: string | null
  selectedTileId?: string | null
  secondaryTileId?: string | null
  selectedFreeTileInstanceId?: string | null
  selectedFreeTileInstanceIds?: string[]
  freeTileInstanceLayerId?: string | null
  tilemapMode?: TilemapDrawingMode
  freeTileMode?: FreeTileDrawingMode
  selectedLayerIds: string[]
  selectedGroupId: string | null
  selectedGroupIds: string[]
  collapsedGroupIds: string[]
  revision: number
  contentRevision?: number
  layersPanelRevision?: number
  animationPlaying?: boolean
  animationPlaybackRate?: number
  animationPlaybackMode?: string
  animationPlaybackLoopSectionId?: string | null
  animationReturnToStart?: boolean
  selectedAnimationFrameIds?: string[]
  selectedAnimationCellKeys?: string[]
  selectedAnimationMaskCellKeys?: string[]
  selectedAnimationMaskRowKeys?: string[]
  animationCellSelectionExplicit?: boolean
  activeLayerMaskId?: string | null
  layerMaskIsolatedView?: boolean
  view: { relativeLuminance: boolean }
  brushImageId?: string | null
}

const colorKey = (color: RgbaColor): string => `${color.r},${color.g},${color.b},${color.a}`

export const colorPanelRenderKey = (session: PanelSessionState): string => [
  session.document.id,
  session.document.activeLayerId,
  colorKey(session.primaryColor),
  colorKey(session.secondaryColor),
  session.document.paletteOrder.join(','),
  session.document.palette.map((entry) => `${entry.id}:${colorKey(entry.color)}`).join('|'),
  session.selectedTilesetId ?? '',
  session.selectedTileId ?? '',
  session.secondaryTileId ?? '',
  session.tilemapMode ?? '',
  session.freeTileMode ?? '',
  (session.document.tilesets ?? []).map((tileset) => `${tileset.id}:${tileset.tileIds.join(',')}:${getRasterContentRevision(tileset.pixels)}`).join('|')
].join(':')

export const palettePanelRenderKey = (session: PanelSessionState): string => [
  session.document.id,
  session.document.name,
  session.document.paletteOrder.join(','),
  session.document.paletteColumns ?? '',
  session.document.paletteSlots?.map((id) => id ?? '').join(',') ?? '',
  session.document.palette.map((entry) => `${entry.id}:${entry.name}:${colorKey(entry.color)}`).join('|'),
  session.selectedPaletteIds.join(','),
  colorKey(session.primaryColor)
].join(';')

export const layersPanelRenderKey = (session: PanelSessionState): string => [
  session.document.id,
  session.document.activeLayerId,
  // Playback advances activeFrameId in place while keeping the session object
  // stable. Include the live frame in the memo key even during playback so
  // LayersPanel re-renders its playhead/cel visuals on every timer tick.
  session.document.animation?.activeFrameId ?? '',
  session.document.animation?.frames.map((frame) => `${frame.id}:${frame.duration}`).join(',') ?? '',
  session.document.animation?.loopSections?.map((section) => `${section.id}:${section.name}:${section.startFrameId}:${section.endFrameId}:${section.direction}:${section.repeatCount ?? 'infinite'}`).join(',') ?? '',
  session.document.animation?.layerMasks?.map((entry) => `${entry.layerId}:${entry.frameId}:${entry.mask.id}:${entry.mask.visible ? 1 : 0}`).join(',') ?? '',
  session.document.animation?.groupMasks?.map((entry) => `${entry.groupId}:${entry.frameId}:${entry.mask.id}:${entry.mask.visible ? 1 : 0}`).join(',') ?? '',
  session.animationPlaying ? 1 : 0,
  session.animationPlaybackRate ?? 1,
  session.animationPlaybackMode ?? '',
  session.animationPlaybackLoopSectionId ?? '',
  session.animationReturnToStart ? 1 : 0,
  session.selectedAnimationFrameIds?.join(',') ?? '',
  session.selectedAnimationCellKeys?.join(',') ?? '',
  session.selectedAnimationMaskCellKeys?.join(',') ?? '',
  session.selectedAnimationMaskRowKeys?.join(',') ?? '',
  session.animationCellSelectionExplicit === false ? 0 : 1,
  session.activeLayerMaskId ?? '',
  session.layerMaskIsolatedView ? 1 : 0,
  session.freeTileInstanceLayerId ?? '',
  session.selectedFreeTileInstanceId ?? '',
  session.selectedFreeTileInstanceIds?.join(',') ?? '',
  session.layersPanelRevision ?? session.revision,
  session.document.animation?.cels.map((cel) => `${cel.id}:${cel.layerId}:${cel.frameId}:${cel.linkedCelId ?? ''}:${cel.zIndex ?? 0}`).join('|') ?? '',
  session.document.animation?.layerMasks?.map((entry) => `${entry.layerId}:${entry.frameId}:${entry.mask.id}:${entry.mask.linkedMaskId ?? ''}`).join('|') ?? '',
  session.document.animation?.groupMasks?.map((entry) => `${entry.groupId}:${entry.frameId}:${entry.mask.id}:${entry.mask.linkedMaskId ?? ''}`).join('|') ?? '',
  session.document.layers.map((layer) => `${layer.id}:${layer.name}:${layer.groupId ?? ''}:${layer.visible ? 1 : 0}:${layer.locked ? 1 : 0}:${layer.autoLinkAnimationCels ? 1 : 0}:${layer.opacity}:${layer.blendMode}:${layer.freeTileSetId ?? ''}`).join('|'),
  session.document.groups.map((group) => `${group.id}:${group.name}:${group.parentGroupId ?? ''}:${group.visible ? 1 : 0}:${group.locked ? 1 : 0}:${group.opacity}:${group.blendMode}:${group.cumulativeBlend === true ? 1 : 0}`).join('|'),
  session.selectedLayerIds.join(','),
  session.selectedGroupId ?? '',
  session.selectedGroupIds.join(','),
  session.collapsedGroupIds.join(',')
].join(';')

export const previewPanelRenderKey = (session: PanelSessionState): string =>
  `${session.document.id}:${session.contentRevision ?? session.revision}:${session.view.relativeLuminance ? 1 : 0}:${session.animationPlaying ? 1 : 0}:${session.animationPlaybackRate ?? 1}:${session.animationReturnToStart ? 1 : 0}:${session.document.animation?.loop === false ? 0 : 1}:${session.document.animation?.activeFrameId ?? ''}`

export const tilesetPanelRenderKey = (session: PanelSessionState): string => [
  session.document.id,
  session.document.activeLayerId,
  session.selectedTilesetId ?? '',
  session.selectedTileId ?? '',
  session.secondaryTileId ?? '',
  session.selectedFreeTileInstanceId ?? '',
  session.tilemapMode ?? '',
  session.freeTileMode ?? '',
  session.contentRevision ?? session.revision,
  colorKey(session.primaryColor),
  session.document.layers.filter((layer) => layer.kind === 'tilemap' || layer.kind === 'free-tile').map((layer) => `${layer.id}:${layer.name}:${layer.tilemapTilesetId ?? ''}:${layer.freeTileSetId ?? ''}:${layer.freeTileSources?.map((source) => `${source.id}:${source.name}:${source.tilesetId}:${source.visible ? 1 : 0}:${source.locked ? 1 : 0}:${source.opacity}:${source.blendMode}`).join(',') ?? ''}`).join('|'),
  (session.document.tilesets ?? []).map((tileset) => `${tileset.id}:${tileset.name}:${tileset.tileWidth}:${tileset.tileHeight}:${tileset.columns}:${tileset.rows}:${tileset.tileIds.join(',')}:${getRasterContentRevision(tileset.pixels)}`).join('|')
].join(';')

export const brushPanelRenderKey = (session: PanelSessionState): string => [
  session.document.id,
  session.brushImageId ?? '',
  (session.document.customBrushes ?? []).map((brush) => `${brush.id}:${brush.name}:${brush.width}:${brush.height}`).join('|')
].join(';')
