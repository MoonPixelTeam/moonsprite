export type ColorMode = 'rgba' | 'indexed' | 'grayscale'
export type RasterFormat = 'rgba' | 'indexed'
export type ImageResizeInterpolation = 'nearest' | 'smooth'
export type TileRepeatMode = 'off' | 'x' | 'y' | 'both'
export type ToolId = 'pencil' | 'airbrush' | 'eraser' | 'fill' | 'eyedropper' | 'selection' | 'shape' | 'line' | 'text' | 'move' | 'hand' | 'zoom' | 'rotate' | 'liquify'
export type LiquifyMode = 'push' | 'inflate' | 'deflate' | 'twist-clockwise' | 'twist-counter-clockwise'
export type MoveKind = 'move' | 'slice'
export type BrushShape = 'round' | 'square' | 'line'
export type BrushTexture = 'solid' | 'cracks' | 'wood' | 'grain'
export type BrushPaintMode = 'paint' | 'pattern-source' | 'pattern-target'
export type ProceduralBrushId = 'procedural:noise' | 'procedural:clouds' | 'procedural:cells' | 'procedural:fibers'

export interface ProceduralBrushSettings {
  seed: number
  scale: number
  detail: number
  variation: number
  angle: number
}

/** A bitmap brush stamp. Coverage is 0-255; colors preserve source RGBA pixels when present. */
export interface ImageBrush {
  id: string
  name: string
  width: number
  height: number
  coverage: Uint8Array
  /** Optional source colors for imported and selection-created brushes. Packed RGBA, one per pixel. */
  colors?: Uint32Array
  /** Temporary foreground/background remap for selection-created brushes; never serialized. */
  paintColors?: Uint32Array
  proceduralSettings?: ProceduralBrushSettings
  /** Imported and selection-created brushes keep their source dimensions instead of scaling to brushSize. */
  intrinsicSize?: boolean
  /** Canvas-space origin used by source-aligned pattern painting. */
  sourceX?: number
  sourceY?: number
}

/** A selection-created brush embedded in its owning MoonSprite project. */
export interface ProjectBrush {
  id: string
  name: string
  width: number
  height: number
  coverage: Uint8Array
  /** Optional source colors for selection-created brushes. Packed RGBA, one per pixel. */
  colors?: Uint32Array
  sourceX?: number
  sourceY?: number
}

/** Legacy grayscale output settings kept only for persisted tool-setting compatibility. */
export type GrayscaleBrushMode = 'dither' | 'threshold'

export interface ImageBrushSettings {
  mode: GrayscaleBrushMode
  threshold: number
  blackPoint: number
  whitePoint: number
  invert: boolean
}

export interface StoredBrush {
  id: string
  name: string
  filePath: string
  intrinsicSize?: boolean
  sourceX?: number
  sourceY?: number
  folderId?: string | null
}

export interface StoredBrushFolder {
  id: string
  name: string
  filePath: string
}

export interface BrushListing {
  directoryPath: string
  brushes: StoredBrush[]
  folders: StoredBrushFolder[]
}

export interface StoredFont {
  id: string
  family: string
  filePath: string
  imported: boolean
}

export interface FontListing {
  directoryPath: string
  fonts: StoredFont[]
}

export interface StoredBackgroundPreset {
  id: string
  name: string
  filePath: string
  builtIn: boolean
}

export interface BackgroundPresetListing {
  directoryPath: string
  presets: StoredBackgroundPreset[]
}

export interface LuaScriptEntry {
  id: string
  name: string
  filePath: string
  extensionId?: string
  extensionName?: string
  extensionCommandId?: string
  extensionDescription?: string
}

export interface LuaScriptListing {
  directoryPath: string
  scripts: LuaScriptEntry[]
}

export interface StoredExtension {
  id: string
  name: string
  version: string
  description: string
  author: string
  apiVersion?: string
  entry?: string
  commands: StoredExtensionCommand[]
  panels: StoredExtensionPanel[]
  menuItems: StoredExtensionMenuItem[]
  topMenus: StoredExtensionTopMenu[]
  filePath: string
  enabled: boolean
}

export interface StoredExtensionCommand {
  id: string
  name: string
  description: string
  entry: string
}

export interface StoredExtensionPanel {
  id: string
  name: string
  description: string
  defaultVisible: boolean
  commands: string[]
}

export type ExtensionBuiltInMenuId = 'file' | 'edit' | 'select' | 'canvas' | 'layer' | 'window' | 'help'
export type ExtensionMenuItemPosition = 'start' | 'end'
export type ExtensionTopMenuPosition = ExtensionMenuItemPosition | `before:${ExtensionBuiltInMenuId}` | `after:${ExtensionBuiltInMenuId}`

export interface StoredExtensionMenuItem {
  id: string
  menu: ExtensionBuiltInMenuId
  position: ExtensionMenuItemPosition
  commands: string[]
}

export interface StoredExtensionTopMenu {
  id: string
  name: string
  description: string
  position: ExtensionTopMenuPosition
  commands: string[]
}

export interface ExtensionListing {
  directoryPath: string
  extensions: StoredExtension[]
}
export type ShapeKind = 'rectangle' | 'ellipse' | 'rectangle-outline' | 'ellipse-outline' | 'freeform' | 'polygon'
export type LineKind = 'line' | 'curve'
export interface ShapeRatio { width: number; height: number }
export type FillMode = 'contiguous' | 'global'
export type FillKind = 'bucket' | 'gradient'
export type GradientType = 'linear' | 'radial'
export type GradientDither = 'none' | 'checker' | 'diagonal' | 'diagonal-reverse' | 'horizontal' | 'vertical' | 'bayer-2' | 'bayer-4' | 'bayer-8'
export type BrushDitherTemplate = Exclude<GradientDither, 'none'>

export interface GradientStop {
  position: number
  color: RgbaColor
}

export interface BrushDitherSettings {
  enabled: boolean
  template: BrushDitherTemplate
  stage: number
}

export type BlendMode =
  | 'normal'
  | 'darken'
  | 'multiply'
  | 'color-burn'
  | 'linear-burn'
  | 'lighten'
  | 'screen'
  | 'color-dodge'
  | 'linear-dodge'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'vivid-light'
  | 'linear-light'
  | 'pin-light'
  | 'hard-mix'
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export const BLEND_MODES: readonly BlendMode[] = [
  'normal', 'darken', 'multiply', 'color-burn', 'linear-burn', 'lighten', 'screen', 'color-dodge', 'linear-dodge',
  'overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix', 'difference',
  'exclusion', 'subtract', 'divide', 'hue', 'saturation', 'color', 'luminosity'
]
export type ImageExportFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'gif' | 'psd' | 'mp4' | 'webm' | 'aseprite'
export type SaveDialogFormat = 'moonsprite' | 'png' | 'jpeg' | 'webp' | 'psd' | 'ase' | 'aseprite'

export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

export type AntiAliasColorSource = 'automatic' | 'canvas' | 'palette'

export type TextAntialiasMode = 'pixel' | 'smooth'
export type TextSpacingMode = 'font' | 'actual'

export interface TextStyleRun {
  start: number
  end: number
  fontSize?: number
  lineSpacing?: number
  letterSpacing?: number
  color?: RgbaColor
}

export interface TextCelTransform {
  source: SelectionRect
  target: SelectionRect
  angle: number
  shear?: {
    axis: 'x' | 'y'
    edge: 'n' | 'e' | 's' | 'w'
    amount: number
  }
}

export interface TextCelData {
  text: string
  fontFamily: string
  fontSize: number
  lineSpacing: number
  letterSpacing: number
  spacingMode: TextSpacingMode
  antialias: TextAntialiasMode
  color: RgbaColor
  styleRuns?: TextStyleRun[]
  /** Original insertion point used when editable text is rasterized again. */
  originX?: number
  originY?: number
  /** Optional fixed canvas area for wrapped paragraph text. */
  boxWidth?: number
  boxHeight?: number
  /** Ordered transforms keep Ctrl+T edits reproducible after changing the text. */
  transforms?: TextCelTransform[]
}

export interface PaletteEntry {
  id: number
  name: string
  color: RgbaColor
}

export interface RuntimeRasterTiles {
  kind: 'sparse-tiles-v1'
  format: RasterFormat
  width: number
  height: number
  tileSize: number
  data: Uint8Array
  /** One-based payload offset per tile slot; zero means the tile is absent. */
  tileOffsets: Int32Array
  /** Exact visible bounds for immutable RGBA tiles; null means fully transparent. */
  visibleBounds?: { x: number; y: number; width: number; height: number } | null
}

export type TilemapQuarterTurns = 0 | 1 | 2 | 3

export interface TilemapCell {
  tilesetId: string
  tileId: string
  flipHorizontal?: boolean
  flipVertical?: boolean
  /** Clockwise quarter turns applied after flips. */
  rotation?: TilemapQuarterTurns
}

export interface TilemapCelData {
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  cells: Array<TilemapCell | null>
}

/** A reusable source owned by one Free Tile set and shared by every member layer. Source dimensions come from its Tileset. */
export interface FreeTileSourceLayer {
  id: string
  name: string
  /** The one-tile Tileset that stores this source's pixels. */
  tilesetId: string
  description?: string
  displayColor?: RgbaColor
  visible: boolean
  locked: boolean
  /** Legacy source-wide appearance values. New instances override these values. */
  opacity: number
  /** Legacy source-wide appearance values. New instances override these values. */
  blendMode: BlendMode
  /** Source-local layer offset retained for layer-like editing and future group transforms. */
  offsetX: number
  offsetY: number
}

export interface FreeTileInstance {
  /** Stable instance ID; array order is the compositing order from back to front. */
  id: string
  /** Source layer in the owning Free Tile Layer. */
  sourceId?: string
  /** Legacy source tile ID used by schema v14 projects. */
  tileId?: string
  /** Pixel position in the cel surface's local coordinate system. */
  x: number
  y: number
  /** Instance-level visibility; omitted legacy values are visible. */
  visible?: boolean
  /** Instance-level edit lock; omitted legacy values are unlocked. */
  locked?: boolean
  /** Instance opacity. Omitted legacy values inherit the source opacity. */
  opacity?: number
  /** Instance blend mode. Omitted legacy values inherit the source blend mode. */
  blendMode?: BlendMode
  /** Clockwise quarter turns applied only to this instance. */
  rotation?: TilemapQuarterTurns
  /** Instance-only mirrors; source pixels remain unchanged. */
  flipHorizontal?: boolean
  flipVertical?: boolean
}

export interface FreeTileCelData {
  instances: FreeTileInstance[]
}

export interface Tileset {
  id: string
  name: string
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  /** Stable IDs in row-major sheet order. */
  tileIds: string[]
  /** Nullable row-major positions used by the Tileset panel; omitted legacy data is compact. */
  tileSlots?: Array<string | null>
  /** Padded RGBA sheet sized columns * tileWidth by rows * tileHeight. */
  pixels: Uint8ClampedArray
}

export interface LayerStyleStroke {
  enabled: boolean
  color: RgbaColor
  size: number
  position: OutlinePosition
  kernel: OutlineKernel
  directions: OutlineDirections
  smartHue: boolean
  smartHueDarkness: number
}

export interface LayerStyleShadow {
  enabled: boolean
  color: RgbaColor
  offsetX: number
  offsetY: number
  blur: number
  smartShadow: boolean
  smartShadowDarkness: number
}

export interface LayerStyleInnerGlow {
  enabled: boolean
  color: RgbaColor
  size: number
}

export interface LayerStyleColorOverlay {
  enabled: boolean
  color: RgbaColor
}

export interface LayerStyleGradientOverlay {
  enabled: boolean
  from: RgbaColor
  to: RgbaColor
  angle: number
  dither: GradientDither
}

export interface LayerStyles {
  /** Global visibility switch that preserves every configured effect. */
  enabled: boolean
  stroke: LayerStyleStroke
  shadow: LayerStyleShadow
  innerGlow: LayerStyleInnerGlow
  colorOverlay: LayerStyleColorOverlay
  gradientOverlay: LayerStyleGradientOverlay
}

export type BackgroundPatternId = 'solid' | 'grid' | 'stripes' | 'diamond' | 'diamond-nested' | 'circles'

export interface BackgroundLayerSettings {
  mode: 'preset' | 'canvas'
  pattern?: BackgroundPatternId
}

export interface RgbaLayer {
  id: string
  name: string
  /** Stable group whose ordinary raster layers share editable pixel content. */
  linkedContentId?: string
  /** Automatically inherit the previous frame cel's link when creating animation frames. */
  autoLinkAnimationCels?: boolean
  /** Optional visual marker shown in the layer panel. */
  displayColor?: RgbaColor
  /** Optional user-facing note shown when hovering the layer row. */
  description?: string
  /** Editable text layers retain raster surfaces for the existing compositor. */
  kind?: 'text' | 'tilemap' | 'free-tile'
  /** Project Tileset owned by this Tilemap layer. */
  tilemapTilesetId?: string
  /** Legacy v14 Free Tile ownership, retained only while decoding and migrating older projects. */
  freeTileTilesetId?: string
  /** Stable source-library identity shared by compatible Free Tile layers. */
  freeTileSetId?: string
  /** Reusable source layers shared by every Free Tile layer with the same set identity. */
  freeTileSources?: FreeTileSourceLayer[]
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  /** Restricts this layer to the visible alpha of its immediate lower sibling. */
  clippingMask?: boolean
  /** Non-destructive effects evaluated from the active cel surface during compositing. */
  layerStyles?: LayerStyles
  /** Treats this layer as editable canvas wallpaper with resize-time tiling. */
  background?: BackgroundLayerSettings
  groupId?: string | null
  /** Local bitmap dimensions. They may differ from the visible canvas after moving/resizing. */
  width: number
  height: number
  /** Canvas-space location of the layer bitmap's local (0, 0). */
  offsetX: number
  offsetY: number
  format: 'rgba'
  pixels: Uint8ClampedArray
  runtimeRaster?: RuntimeRasterTiles
}

export interface IndexedLayer {
  id: string
  name: string
  /** Stable group whose ordinary raster layers share editable pixel content. */
  linkedContentId?: string
  /** Automatically inherit the previous frame cel's link when creating animation frames. */
  autoLinkAnimationCels?: boolean
  /** Optional visual marker shown in the layer panel. */
  displayColor?: RgbaColor
  /** Optional user-facing note shown when hovering the layer row. */
  description?: string
  /** Editable text layers retain raster surfaces for the existing compositor. */
  kind?: 'text' | 'tilemap' | 'free-tile'
  /** Project Tileset owned by this Tilemap layer. */
  tilemapTilesetId?: string
  /** Legacy v14 Free Tile ownership, retained only while decoding and migrating older projects. */
  freeTileTilesetId?: string
  /** Stable source-library identity shared by compatible Free Tile layers. */
  freeTileSetId?: string
  /** Reusable source layers shared by every Free Tile layer with the same set identity. */
  freeTileSources?: FreeTileSourceLayer[]
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  /** Restricts this layer to the visible alpha of its immediate lower sibling. */
  clippingMask?: boolean
  /** Non-destructive effects evaluated from the active cel surface during compositing. */
  layerStyles?: LayerStyles
  /** Treats this layer as editable canvas wallpaper with resize-time tiling. */
  background?: BackgroundLayerSettings
  groupId?: string | null
  width: number
  height: number
  offsetX: number
  offsetY: number
  format: 'indexed'
  pixels: Uint32Array
  runtimeRaster?: RuntimeRasterTiles
}

export type RasterLayer = RgbaLayer | IndexedLayer

export interface LayerMask extends RgbaLayer {
  ownerKind: 'cel' | 'group'
  ownerId: string
  /** Optional independent link to another mask surface. */
  linkedMaskId?: string | null
  /** Whether this mask keeps its offset synchronized with its owner. */
  moveWithOwner?: boolean
}

export interface AnimationGroupMask {
  groupId: string
  frameId: string
  mask: LayerMask
}

/** Frame-specific layer mask stored independently from the layer's cel content. */
export interface AnimationLayerMask {
  layerId: string
  frameId: string
  mask: LayerMask
}

export interface LayerGroup {
  id: string
  name: string
  /** 空组没有子图层可定位时，保存它在统一图层堆栈中的顺序锚点。 */
  panelOrder?: number
  /** Optional visual marker shown in the layer panel. */
  displayColor?: RgbaColor
  /** Optional user-facing note shown when hovering the group row. */
  description?: string
  parentGroupId?: string | null
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  /** Restricts this group to the visible alpha of its immediate lower sibling. */
  clippingMask?: boolean
  /** Non-destructive effects evaluated from the composited group contents. */
  layerStyles?: LayerStyles
  /** Re-applies the group blend mode after its children have composited against the external backdrop. */
  cumulativeBlend?: boolean
}

/** 动画时间轴中的一帧。持续时间以毫秒保存，便于后续导入 Aseprite 帧时保持原始节奏。 */
export interface AnimationFrame {
  id: string
  duration: number
  /** Disabled frames remain editable in the timeline but are skipped during playback. */
  disabled?: boolean
}

/** cel 与图层、帧的稳定关联。像素存储会在实际动画编辑器落地时加入独立数据文件。 */
export type AnimationCelSurface =
  | {
      format: 'rgba'
      width: number
      height: number
      offsetX: number
      offsetY: number
      storageOriginX?: number
      storageOriginY?: number
      pixels: Uint8ClampedArray
      runtimeRaster?: RuntimeRasterTiles
    }
  | {
      format: 'indexed'
      width: number
      height: number
      offsetX: number
      offsetY: number
      storageOriginX?: number
      storageOriginY?: number
      pixels: Uint32Array
      runtimeRaster?: RuntimeRasterTiles
    }

export interface AnimationCel {
  id: string
  layerId: string
  frameId: string
  linkedCelId?: string | null
  /** Cel visual stacking offset; equal values retain layer order. */
  zIndex?: number
  /** Cel 独立的不透明度，未设置时沿用图层不透明度。 */
  opacity?: number
  surface?: AnimationCelSurface
  /** Editable source data for text cels. The surface remains the rendered cache. */
  text?: TextCelData
  /** Editable tile references for Tilemap cels. The surface remains the rendered cache. */
  tilemap?: TilemapCelData
  /** Arbitrarily positioned reusable tile instances. The surface remains the rendered cache. */
  freeTiles?: FreeTileCelData
  /** @deprecated Legacy project input only. Runtime masks live in AnimationTimeline.layerMasks. */
  mask?: LayerMask
}

export type AnimationLoopDirection = 'forward' | 'reverse'

export interface AnimationLoopSection {
  id: string
  name: string
  startFrameId: string
  endFrameId: string
  direction: AnimationLoopDirection
  /** Total playback passes. Null means repeat indefinitely. */
  repeatCount: number | null
}

export interface AnimationTimeline {
  frames: AnimationFrame[]
  cels: AnimationCel[]
  /** Frame-specific masks for ordinary layers, independent from cel content. */
  layerMasks?: AnimationLayerMask[]
  /** Frame-specific masks attached to layer groups. */
  groupMasks?: AnimationGroupMask[]
  /** Named frame ranges that can be played independently. */
  loopSections?: AnimationLoopSection[]
  activeFrameId: string
  loop: boolean
}

export interface ProjectDisplaySettings {
  showPixelGrid: boolean
  showGrid: boolean
  grid: GridSettings
}

export interface ProjectStatistics {
  strokeCount: number
  operationCount: number
  drawingTimeMs: number
}

export type TimelapseQuality = 'low' | 'medium' | 'high'
/** How newly captured timelapse operations are retained. */
export type TimelapseRecordingMode = 'full' | 'smart'
export type TimelapseVideoFormat = 'mp4' | 'webm'
export type TimelapseImageFormat = 'png' | 'jpeg'
export type TimelapseExportFormat = TimelapseVideoFormat | TimelapseImageFormat

export interface TimelapseSnapshot {
  id: string
  capturedAt: number
  elapsedMs: number
  width: number
  height: number
  data: Uint8Array
}

export interface TimelapseSettings {
  enabled: boolean
  quality: TimelapseQuality
  fps: number
  speed: number
  /** Omitted by legacy projects; normalization treats it as `full`. */
  mode?: TimelapseRecordingMode
  snapshots: TimelapseSnapshot[]
}

export interface ProjectLayerPanelState {
  activeLayerId: string
  selectedLayerIds: string[]
  selectedGroupIds: string[]
  selectedGroupId: string | null
  layerSelectionAnchorId: string | null
  collapsedGroupIds: string[]
}

export interface DocumentSlice {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

export interface SpriteDocument {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19
  id: string
  name: string
  width: number
  height: number
  colorMode: ColorMode
  layers: RasterLayer[]
  groups: LayerGroup[]
  activeLayerId: string
  palette: PaletteEntry[]
  paletteOrder: number[]
  /** Fixed visual palette slots. Empty entries preserve user-defined spacing and placement. */
  paletteSlots?: Array<number | null>
  /** Column count used to decode paletteSlots into stable two-dimensional positions. */
  paletteColumns?: number
  nextColorId: number
  /** Project-owned brushes are stored in the .moonsprite container. */
  customBrushes?: ProjectBrush[]
  /** Project-owned tile sheets referenced by Tilemap cells. */
  tilesets?: Tileset[]
  /** Animation metadata is independent from layer ordering and optional for v1 compatibility. */
  animation?: AnimationTimeline
  /** Project-owned defaults for the selection outline dialog. */
  outlineSettings?: OutlineSettings
  /** Project-owned display toggles. View navigation remains session-only. */
  displaySettings?: ProjectDisplaySettings
  /** Layer panel context restored when the project is reopened. */
  layerPanelState?: ProjectLayerPanelState
  /** Persisted editing statistics used by the project information view. */
  statistics?: ProjectStatistics
  /** Optional complete history of drawing snapshots for timelapse export. */
  timelapse?: TimelapseSettings
  /** Named export regions stored in document pixel coordinates. */
  slices?: DocumentSlice[]
  filePath: string | null
  /** Original path used to open imported images or Aseprite projects. */
  sourceFilePath?: string
  dirty: boolean
  createdAt: string
  updatedAt: string
}

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
  flipHorizontal?: boolean
  flipVertical?: boolean
  /** 在跨越对侧边界时，记录被拖动轴线的连续像素坐标。 */
  flipOriginX?: number
  flipOriginY?: number
}

/** Four-corner transform frame used by the selection free-transform mode. */
export interface SelectionQuad {
  nw: { x: number; y: number }
  ne: { x: number; y: number }
  se: { x: number; y: number }
  sw: { x: number; y: number }
}

export type SelectionMode = 'replace' | 'add' | 'subtract' | 'intersect'
export type SelectionKind = 'rectangle' | 'ellipse' | 'magic' | 'lasso' | 'polygon-lasso'
export type OutlinePosition = 'inside' | 'outside' | 'both'
export type OutlineKernel = 'round' | 'square' | 'horizontal' | 'vertical'
export type OutlineDirection = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'
export type OutlineDirections = Record<OutlineDirection, boolean>
export interface OutlineSettings {
  color: RgbaColor
  backgroundColor: RgbaColor
  thickness: number
  position: OutlinePosition
  kernel: OutlineKernel
  directions: OutlineDirections
  smartHue: boolean
  smartHueDarkness: number
  previewEnabled: boolean
}
export type CanvasAnchor = 'nw' | 'n' | 'ne' | 'w' | 'center' | 'e' | 'sw' | 's' | 'se'

/** A cropped pixel mask. A missing mask retains legacy rectangular selection semantics. */
export interface SelectionMask extends SelectionRect {
  mask?: Uint8Array
}

export interface ViewState {
  zoom: number
  panX: number
  panY: number
  /** View-only clockwise rotation in degrees. Never changes document pixels. */
  rotation: number
  /** View-only horizontal mirror. Never changes document pixels. */
  mirrored: boolean
  /** View-only vertical mirror. Never changes document pixels. */
  mirroredVertical: boolean
  /** View-only one-pixel grid visibility. Optional for hot-reloaded legacy sessions. */
  showPixelGrid?: boolean
  showGrid: boolean
  /** View-only configurable grid origin and cell size. */
  grid?: GridSettings
  /** View-only 2:1 isometric guides and optional straight-line alignment. */
  isoViewEnabled?: boolean
  relativeLuminance: boolean
  /** View-only repeated canvas preview and wrapped painting mode. */
  tileRepeatMode?: TileRepeatMode
  /** View-only selection outline visibility. The selection itself remains active. */
  showSelectionOutline?: boolean
  /** View-only transform pivot visibility. The configured pivot still affects transforms while hidden. */
  showSelectionPivot?: boolean
  /** Quick Command Bar center as a normalized horizontal position in its owning canvas. */
  quickCommandBarPositionX?: number
  /** Whether this project keeps its Quick Command Bar expanded while it owns canvas focus. */
  quickCommandBarExpanded?: boolean
}

export interface GridSettings {
  x: number
  y: number
  width: number
  height: number
}

export interface ResourceInfo {
  totalBytes: number
  freeBytes: number
}

export interface OpenDialogResult {
  canceled: boolean
  filePaths: string[]
}

export interface SaveDialogResult {
  canceled: boolean
  filePath?: string
}

export interface DirectoryDialogResult {
  canceled: boolean
  directoryPath?: string
}

export interface DefaultFileDirectories {
  saveDirectory: string
  exportDirectory: string
}

export interface RecoveryRecord {
  id: string
  name: string
  updatedAt: string
}

export interface GalleryProject {
  filePath: string
  fileName: string
  modifiedAt: number
}

export interface GalleryListing {
  directoryPath: string
  projects: GalleryProject[]
}

export interface StoredPalette {
  id: string
  name: string
  filePath: string
  colors: RgbaColor[]
  builtIn: boolean
  columns?: number
  slots?: Array<number | null>
}

export interface PaletteSlotLayout {
  columns: number
  slots: Array<number | null>
}

export interface PaletteListing {
  directoryPath: string
  palettes: StoredPalette[]
}

export type WorkspacePanelId = 'color' | 'palette' | 'layers' | 'freeTileInstances' | 'history' | 'preview' | 'tileset' | 'brushes'
export type WorkspacePanelDock = 'right' | 'left' | 'bottom' | 'floating'
export type ToolRailSide = 'left' | 'right' | 'top' | 'bottom'

export interface WorkspaceLayout {
  panelDocks: Record<WorkspacePanelId, WorkspacePanelDock>
  /** Optional for backward compatibility with workspaces saved before panel visibility was persisted. */
  panelVisibility?: Partial<Record<WorkspacePanelId, boolean>>
  inspectorWidth: number
  leftDockWidth: number
  bottomDockHeight: number
  /** Side ratios are retained for legacy migration; bottom height continues to use its ratio. */
  inspectorWidthRatio?: number
  leftDockWidthRatio?: number
  bottomDockHeightRatio?: number
  toolRailSide: ToolRailSide
  previewOpen: boolean
  inspectorLayout: string | null
  colorSquareDock: string | null
  colorSquareAnchor: string | null
  floatingPanels: Record<WorkspacePanelId, string | null>
  mainWindow: { x: number; y: number; width: number; height: number; maximized: boolean } | null
}

export interface StoredWorkspace {
  id: string
  name: string
  filePath: string
  updatedAt: string
  builtIn: boolean
  layout: WorkspaceLayout
  initialLayout: WorkspaceLayout
}

export interface WorkspaceListing {
  directoryPath: string
  workspaces: StoredWorkspace[]
}

export interface ClipboardImage {
  width: number
  height: number
  data: Uint8Array
}

export interface ClipboardImageSize {
  width: number
  height: number
}

export interface ProjectPreview {
  preview: Uint8Array
  width: number
  height: number
  colorMode: ColorMode
}

export interface BinaryReadProgress {
  bytesRead: number
  totalBytes: number
}

export interface LuaScriptExecutionContext {
  documentId: string
  documentName: string
  documentWidth: number
  documentHeight: number
  documentFilePath: string
  colorMode: ColorMode
  layerId: string
  layerName: string
  layerWidth: number
  layerHeight: number
  layerOffsetX: number
  layerOffsetY: number
  layerOpacity: number
  layerVisible: boolean
  layerLocked: boolean
  layerFormat: RasterLayer['format']
  /** Aseprite-compatible parent group and bottom-to-top stack position. */
  layerGroupId: string | null
  layerStackIndex: number
  frameNumber: number
  pixels: number[]
  /** Raster cels from the active layer, bounded by the Lua image budget. */
  activeLayerCels: Array<{
    id: string
    frameId: string
    frameNumber: number
    surface: LuaScriptSurfaceSnapshot
  }>
  selection: {
    x: number
    y: number
    width: number
    height: number
    mask: number[] | null
  } | null
  transparentColor: number
  foreground: number
  background: number
  /** Renderer-owned structural snapshot exposed through the sandboxed `mse` namespace. */
  mseSnapshot: Record<string, unknown>
}

export type LuaScriptDialogValue = string | number | boolean | RgbaColor | null
export type LuaScriptDialogEvent = 'change' | 'release' | 'click' | 'close'
export type LuaScriptDialogControlKind = 'button' | 'check' | 'color' | 'combobox' | 'entry' | 'label' | 'number' | 'radio' | 'separator' | 'slider'

export interface LuaScriptDialogControl {
  id: string
  dataKey: string | null
  kind: LuaScriptDialogControlKind
  label: string
  text: string
  value: LuaScriptDialogValue
  min: number | null
  max: number | null
  step: number | null
  decimals: number | null
  options: string[]
  enabled: boolean
  visible: boolean
}

export interface LuaScriptDialog {
  id: string
  title: string
  controls: LuaScriptDialogControl[]
}

export interface LuaScriptDialogAction {
  dialogId: string
  controlId: string | null
  event: LuaScriptDialogEvent
  values: Record<string, LuaScriptDialogValue>
}

export interface LuaScriptPixelChange {
  index: number
  before: number
  after: number
}

export interface LuaScriptBatch {
  label: string
  changes: LuaScriptPixelChange[]
  surfaceChange: {
    before: LuaScriptSurfaceSnapshot
    after: LuaScriptSurfaceSnapshot
  } | null
  operations?: LuaScriptOperation[]
}

export interface LuaScriptOperation {
  path: string
  arguments: unknown
}

export interface LuaScriptSurfaceSnapshot {
  format: RasterLayer['format']
  width: number
  height: number
  offsetX: number
  offsetY: number
  pixels: number[]
}

export interface LuaScriptCreatedLayer {
  id: string
  name: string
  opacity: number
  visible: boolean
  locked: boolean
  frameNumber: number
  parentGroupId?: string | null
  stackIndex?: number
  surface: LuaScriptSurfaceSnapshot
}

export interface LuaScriptCreatedDocument {
  name: string
  width: number
  height: number
  colorMode: ColorMode
  layers: LuaScriptCreatedLayer[]
}

export interface LuaScriptRunResult {
  sessionId: string | null
  filePath: string
  fileName: string
  output: string[]
  batches: LuaScriptBatch[]
  createdLayers: LuaScriptCreatedLayer[]
  createdDocuments: LuaScriptCreatedDocument[]
  dialogs: LuaScriptDialog[]
  activeLayerId?: string | null
  activeFrameNumber?: number | null
  finished: boolean
  elapsedMs: number
}

export interface ScaledPngWriteOptions {
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  forceRgba: boolean
  /** The renderer can pass a compact indexed source for simple indexed documents. */
  sourceFormat?: 'rgba' | 'indexed'
  /** RGBA palette entries packed as [r, g, b, a] when sourceFormat is indexed. */
  palette?: Uint8Array
}

export interface ScaledPngWriteResult {
  indexed: boolean
}

export interface MoonSpriteApi {
  openFiles(): Promise<OpenDialogResult>
  openBrushImages(): Promise<OpenDialogResult>
  takeStartupFiles(): Promise<string[]>
  saveProject(defaultPath?: string, format?: SaveDialogFormat): Promise<SaveDialogResult>
  exportImage(defaultPath: string | undefined, format: ImageExportFormat): Promise<SaveDialogResult>
  savePaletteImage(defaultPath?: string): Promise<SaveDialogResult>
  saveShortcutFile(defaultPath?: string): Promise<SaveDialogResult>
  saveThemeFile(defaultPath?: string): Promise<SaveDialogResult>
  getDefaultFileDirectories(): Promise<DefaultFileDirectories>
  chooseDirectory(defaultPath?: string): Promise<DirectoryDialogResult>
  fileExists(filePath: string): Promise<boolean>
  readBinary(filePath: string, onProgress?: (progress: BinaryReadProgress) => void): Promise<Uint8Array>
  readProjectPreview(filePath: string): Promise<ProjectPreview>
  cacheProjectPreview(filePath: string, preview: ProjectPreview): Promise<void>
  writeBinaryAtomic(filePath: string, data: Uint8Array): Promise<void>
  openProjectBackupFolder(): Promise<void>
  writeScaledPngAtomic?(filePath: string, source: Uint8Array, options: ScaledPngWriteOptions, onProgress?: (value: number) => void, onCancelReady?: (cancel: () => void) => void): Promise<ScaledPngWriteResult>
  writeProjectIncremental(filePath: string, sourcePath: string, data: Uint8Array): Promise<void>
  writeClipboardImage(image: ClipboardImage): Promise<void>
  readClipboardText(): Promise<string | null>
  readClipboardImage(): Promise<ClipboardImage | null>
  readClipboardImageSize(): Promise<ClipboardImageSize | null>
  listPalettes(): Promise<PaletteListing>
  savePalette(id: string | null, name: string, colors: RgbaColor[], columns: number, slots: Array<number | null>): Promise<StoredPalette>
  deletePalette(id: string): Promise<void>
  openPaletteFolder(): Promise<void>
  listWorkspaces(): Promise<WorkspaceListing>
  saveWorkspace(id: string | null, name: string, layout: WorkspaceLayout): Promise<StoredWorkspace>
  deleteWorkspace(id: string): Promise<void>
  openWorkspaceFolder(): Promise<void>
  listBrushes(): Promise<BrushListing>
  saveBrush(name: string, data: Uint8Array, intrinsicSize?: boolean, sourceX?: number, sourceY?: number, folderId?: string | null): Promise<StoredBrush>
  deleteBrush(id: string): Promise<void>
  setBrushOrder(ids: string[]): Promise<void>
  createBrushFolder(name: string, parentFolderId?: string | null): Promise<StoredBrushFolder>
  renameBrushFolder(id: string, name: string): Promise<StoredBrushFolder>
  deleteBrushFolder(id: string): Promise<void>
  moveBrush(id: string, folderId?: string | null): Promise<StoredBrush>
  openBrushFolder(): Promise<void>
  listFonts(): Promise<FontListing>
  listSystemFonts(): Promise<StoredFont[]>
  importFont(): Promise<StoredFont | null>
  importSystemFont(id: string): Promise<StoredFont>
  deleteFont(id: string): Promise<void>
  listBackgroundPresets(): Promise<BackgroundPresetListing>
  saveBackgroundPreset(name: string, data: Uint8Array): Promise<StoredBackgroundPreset>
  openBackgroundPresetFolder(): Promise<void>
  listRecoveries(retentionDays: number): Promise<RecoveryRecord[]>
  readRecovery(id: string): Promise<Uint8Array>
  writeRecovery(id: string, name: string, data: Uint8Array): Promise<void>
  deleteRecovery(id: string): Promise<void>
  listGalleryProjects(): Promise<GalleryListing>
  listFolderProjects(directoryPath: string): Promise<GalleryListing>
  deleteGalleryProject(fileName: string): Promise<void>
  openGalleryFolder(): Promise<void>
  openDirectory(directoryPath: string): Promise<void>
  ensureBuiltinExample(): Promise<string | null>
  openProjectInFolder(filePath: string): Promise<void>
  openExternalUrl(url: string): Promise<void>
  listLuaScripts(): Promise<LuaScriptListing>
  openLuaScriptFolder(): Promise<void>
  runLuaScript(scriptId: string, context: LuaScriptExecutionContext): Promise<LuaScriptRunResult>
  dispatchLuaScriptDialog(sessionId: string, action: LuaScriptDialogAction, context: LuaScriptExecutionContext): Promise<LuaScriptRunResult>
  closeLuaScriptSession(sessionId: string): Promise<void>
  listExtensions(): Promise<ExtensionListing>
  installExtension(filePath: string): Promise<StoredExtension>
  chooseAndInstallExtension(): Promise<StoredExtension | null>
  setExtensionEnabled(id: string, enabled: boolean): Promise<StoredExtension>
  uninstallExtension(id: string): Promise<void>
  openExtensionFolder(): Promise<void>
  getResourceInfo(): Promise<ResourceInfo>
  confirmUnsaved(name: string): Promise<'save' | 'discard' | 'cancel'>
  pathForFile(file: unknown): string
  onRequestClose(callback: () => void | Promise<void>): () => void
  cancelClose(): void
  approveClose(): void
}
