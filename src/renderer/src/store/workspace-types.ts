import type { LocalHistorySnapshot } from '@/core/local-history-archive'
import type {
  AnimationCel,
  AnimationCelSurface,
  AnimationGroupMask,
  AnimationLayerMask,
  BrushDitherSettings,
  BrushPaintMode,
  BrushShape,
  BrushTexture,
  FillKind,
  FillConnectivity,
  FillMode,
  FillReference,
  GradientDither,
  GradientStop,
  GradientType,
  ImageBrush,
  InkMode,
  LayerMask,
  LiquifyMode,
  ImageBrushSettings,
  LineKind,
  MoveKind,
  OutlineDirections,
  OutlineKernel,
  OutlinePosition,
  ProceduralBrushId,
  ProceduralBrushSettings,
  RecoveryRecord,
  RgbaColor,
  SelectionKind,
  SelectionMask,
  SelectionMode,
  SelectionQuad,
  SelectionRect,
  ShapeKind,
  ShapeRatio,
  SpriteDocument,
  ToolId,
  TextCelData,
  ViewState
} from '@shared/types'
import type { ContentInvalidationHint, HistoryStack, PixelEdit } from '@/core/history'
import type { SelectionShearTransform } from '@/core/selection'
import type { SelectionTransformLayerState, SelectionTransformSource, SelectionTranslationPreview } from '@/core/tools'
import type { SymmetryAxes, SymmetryCenter, SymmetryMode } from '@/core/symmetry'
import type { BrushTool } from '@/core/tool-preferences'
import type { BrushDynamicsSettings, BrushPressureSettings } from '@/core/pressure'
import type { TilemapDrawingMode } from '@/core/tilemap'
import type { FreeTileDrawingMode } from '@/core/free-tile'
import type { FreeTileSourceEditRaster } from '@/core/free-tile-edit'
import type {
  TimelineCellRef,
  TimelineRowRef,
} from '@/core/animation-timeline-identity'

/** Internal typed timeline selection identities. Legacy persisted arrays remain unchanged. */
export interface TimelineSelectionIdentity {
  rows: ReadonlySet<string>
  cells: ReadonlySet<string>
  masks: ReadonlySet<string>
  rowRefs?: ReadonlySet<TimelineRowRef>
  cellRefs?: ReadonlySet<TimelineCellRef>
}

/** Active timeline context kept separate from explicit selection during migration. */
export interface TimelineActiveContext {
  row: TimelineRowRef | null
  frameId: string | null
  /** Mask row context is independent from the concrete mask being edited. */
  maskEditTargetId: string | null
}

export interface CanvasResizePreview {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

export interface AdjustmentSnapshot {
  layers: Array<{
    layerId: string
    frameId?: string
    width: number
    height: number
    offsetX: number
    offsetY: number
    storageOriginX: number
    storageOriginY: number
    pixels: Uint8ClampedArray | Uint32Array
  }>
  palette: SpriteDocument['palette']
  nextColorId: number
}

export interface OutlinePreview {
  color: RgbaColor
  backgroundColor: RgbaColor
  thickness: number
  position: OutlinePosition
  directions: OutlineDirections
  kernel: OutlineKernel
  smartHue: boolean
  smartHueDarkness: number
  followOpacity: boolean
}

export interface AnimationFrameClipboardItem {
  frameId: string
  duration: number
  disabled?: boolean
  cels: AnimationCel[]
  layerMasks: AnimationLayerMask[]
  groupMasks: AnimationGroupMask[]
}

export interface AnimationMaskClipboardItem {
  key: string
  mask: LayerMask
}

export interface SelectionPivot {
  x: number
  y: number
}

export interface FloatingSelectionBoxHistoryEntry {
  beforeSelection: SelectionMask
  afterSelection: SelectionMask
  beforePivot: SelectionPivot | null
  afterPivot: SelectionPivot | null
}

export interface FloatingPaste {
  layerId: string
  layers?: SelectionTransformLayerState[]
  beforeSelection: SelectionMask | null
  beforeSelectionPivot?: SelectionPivot | null
  source: SelectionTransformSource
  target: SelectionMask
  transformTarget?: SelectionRect
  transformAngle?: number
  transformShear?: SelectionShearTransform
  transformQuad?: SelectionQuad
  previewEdit: PixelEdit | null
  translationPreview: SelectionTranslationPreview | null
  previewDeferred?: boolean
  tilemapEditCellIndex?: number
  sourceFlipHorizontal?: boolean
  sourceFlipVertical?: boolean
  copy: boolean
  label: string
  selectionBoxUndo?: FloatingSelectionBoxHistoryEntry[]
  selectionBoxRedo?: FloatingSelectionBoxHistoryEntry[]
  freeTile?: {
    sourceId: string
    instanceId: string
    edit: FreeTileSourceEditRaster
    selectionSource: SelectionMask
  }
}

export interface TextBoxTransformState {
  layerId: string
  frameId: string
  bounds: SelectionRect
  originalText: TextCelData
  originalSurface: AnimationCelSurface
}

export interface BrushProfile {
  inkMode: InkMode
  brushSize: number
  brushShape: BrushShape
  brushAngle: number
  brushDither: BrushDitherSettings
  brushTexture: BrushTexture
  brushTextureScale: number
  brushPaintMode: BrushPaintMode
  brushImageId: string | null
  brushImage: ImageBrush | null
  brushImageTemporary: boolean
  brushImageSettings: ImageBrushSettings
  proceduralBrushSettings: Record<ProceduralBrushId, ProceduralBrushSettings>
  proceduralAntialias: boolean
  proceduralAntialiasStrength: number
  brushDynamics: BrushDynamicsSettings
  brushPressure: BrushPressureSettings
}

export type DocumentContentInvalidation = ContentInvalidationHint & {
  fromRevision: number
  revision: number
}

export type AnimationPlaybackMode = 'once' | 'all' | 'tag'

export interface DocumentSession {
  document: SpriteDocument
  history: HistoryStack
  /** Local-only serialized undo timeline; never written into .moonsprite files. */
  localHistory: {
    snapshots: LocalHistorySnapshot[]
    labels: string[]
    position: number
  } | null
  tool: ToolId
  extensionToolId: string | null
  extensionToolMode: string
  moveKind: MoveKind
  selectedSliceId: string | null
  selectedSliceIds: string[]
  selectedTilesetId: string | null
  selectedTileId: string | null
  secondaryTileId: string | null
  /** View-only instance selection inside the active Free Tile source page. */
  selectedFreeTileInstanceId: string | null
  /** View-only multi-selection for instance rows in the active Free Tile cel. */
  selectedFreeTileInstanceIds: string[]
  /** Range-selection anchor for Free Tile instance rows. */
  freeTileInstanceSelectionAnchorId: string | null
  /** View-only Free Tile layer whose instances are exposed as layer rows. */
  freeTileInstanceLayerId: string | null
  tilemapMode: TilemapDrawingMode
  freeTileMode: FreeTileDrawingMode
  primaryColor: RgbaColor
  secondaryColor: RgbaColor
  brushSize: number
  brushShape: BrushShape
  brushAngle: number
  brushDither: BrushDitherSettings
  brushTexture: BrushTexture
  brushTextureScale: number
  brushPaintMode: BrushPaintMode
  inkMode: InkMode
  syncInkAcrossTools: boolean
  brushImageId: string | null
  brushImage: ImageBrush | null
  brushImageTemporary: boolean
  brushImageSettings: ImageBrushSettings
  brushProfiles: Record<BrushTool, BrushProfile>
  proceduralBrushSettings: Record<ProceduralBrushId, ProceduralBrushSettings>
  proceduralAntialias: boolean
  proceduralAntialiasStrength: number
  brushDynamics: BrushDynamicsSettings
  brushPressure: BrushPressureSettings
  shapeKind: ShapeKind
  lineKind: LineKind
  curveAnchorCount: number
  shapeRatio: ShapeRatio | null
  shapeRounded: boolean
  shapeCornerRadius: number
  fillMode: FillMode
  fillKind: FillKind
  fillTolerance: number
  fillGapClosing: boolean
  fillGapThreshold: number
  fillReference: FillReference
  fillConnectivity: FillConnectivity
  gradientTolerance: number
  gradientContiguous: boolean
  gradientType: GradientType
  gradientDither: GradientDither
  gradientFreeform?: boolean
  gradientStops?: GradientStop[]
  moveAutoSelect: boolean
  selection: SelectionMask | null
  /** View-only flag set when the user clicks an existing selection to edit its properties. */
  selectionPropertiesActive?: boolean
  /** View-only aspect ratio shared by selection property inputs and canvas transform handles. */
  selectionAspectRatio?: number | null
  /** Rotation displayed and edited by the selection properties bar. */
  selectionAngle?: number
  /** Pixel rotation algorithm used by the current selection transform. */
  selectionRotationAlgorithm: 'fast' | 'rotsprite'
  /** View-only mode that exposes only the four corner transform handles. */
  freeTransformActive?: boolean
  /** Current free-transform frame, kept after a committed corner drag. */
  freeTransformQuad?: SelectionQuad | null
  /** View-only custom transform pivot. Null uses the current transformed selection center. */
  selectionPivot?: SelectionPivot | null
  selectionKind: SelectionKind
  selectionMode: SelectionMode
  selectionRounded: boolean
  selectionCornerRadius: number
  wandTolerance: number
  wandContiguous: boolean
  wandGapClosing: boolean
  wandGapThreshold: number
  perfectPixels: boolean
  symmetryAxes: SymmetryAxes
  symmetryAxesInitialized: Record<SymmetryMode, boolean>
  symmetryCenter: SymmetryCenter
  airbrushParticleRadius: number
  airbrushParticleShape: BrushShape
  airbrushParticleAngle: number
  airbrushScatterRadius: number
  airbrushDensity: number
  airbrushIntervalMs: number
  liquifyMode: LiquifyMode
  liquifyRadius: number
  liquifyStrength: number
  liquifySmoothing: boolean
  liquifySmoothingStrength: number
  smoothStrength: number
  liquifyGestureActive?: boolean
  liquifyResetHistoryPosition: number | null
  liquifyResetHistoryRevision: number | null
  lastPencilPoint: { x: number; y: number } | null
  lastEraserPoint: { x: number; y: number } | null
  canvasResizePreview: CanvasResizePreview | null
  outlinePreview: OutlinePreview | null
  pendingPaste: FloatingPaste | null
  textBoxTransform: TextBoxTransformState | null
  view: ViewState
  viewportSize: { width: number; height: number }
  paletteSelectionId: number | null
  paletteSecondarySelectionId: number | null
  selectedPaletteIds: number[]
  selectedGroupId: string | null
  selectedGroupIds: string[]
  selectedLayerIds: string[]
  /** True when layer/group selection was explicitly made by the user. */
  layerSelectionExplicit: boolean
  activeLayerMaskId: string | null
  layerMaskIsolatedView: boolean
  layerMaskColorMemory?: { primary: RgbaColor; secondary: RgbaColor }
  layerSelectionAnchorId: string | null
  collapsedGroupIds: string[]
  animationPlaying: boolean
  animationPlaybackRate: number
  animationPlaybackMode: AnimationPlaybackMode
  animationPlaybackStartFrameId: string | null
  animationPlaybackLoopSectionId: string | null
  animationPlaybackLoopIteration: number
  animationPlaybackLoopSectionRepeatIndefinitely: boolean
  animationPlaybackLoopStack: Array<{ sectionId: string; iteration: number }>
  /** Finite tag section that anchors the current play-through cycle. */
  animationPlaybackTagCycleSectionId: string | null
  animationReturnToStart: boolean
  /** Canonical active timeline row/cursor. Selection and playback never infer or overwrite this row. */
  timelineActiveContext: TimelineActiveContext
  selectedAnimationFrameIds: string[]
  animationFrameSelectionAnchorId: string | null
  selectedAnimationCellKeys: string[]
  animationCellSelectionAnchorKey: string | null
  /** Distinguishes timeline cel selection from cells derived only for selected-layer highlighting. */
  animationCellSelectionExplicit: boolean
  /** Timeline cells whose attached masks are selected in the panel. */
  selectedAnimationMaskCellKeys: string[]
  selectedAnimationMaskRowKeys: string[]
  animationMaskCellSelectionAnchorKey: string | null
  animationCellClipboard: AnimationCel[]
  animationCellClipboardAnchorKey: string | null
  animationMaskClipboard: AnimationMaskClipboardItem[]
  animationMaskClipboardAnchorKey: string | null
  animationFrameClipboard: AnimationFrameClipboardItem[]
  revision: number
  contentRevision: number
  /** Content revision produced by a selection transform whose guides must remain visible. */
  selectionGuidesPreservedAtContentRevision?: number
  /** Changes that require the layer/timeline panel structure to render again. */
  layersPanelRevision: number
  contentInvalidation: DocumentContentInvalidation | null
  /** Recovery record that opened this session; kept until explicit deletion or a complete save. */
  recoveryOriginId: string | null
  recoverySuppressed: boolean
}

export interface DialogChoice {
  id: string
  label: string
  tone?: 'primary' | 'danger' | 'quiet'
}

export interface AppDialog {
  title: string
  message: string
  detail?: string
  choices: DialogChoice[]
  resolve: (choice: string) => void
}

export interface WorkspaceDataState {
  sessions: DocumentSession[]
  activeId: string | null
  message: string | null
  saveProgress: { title: string; value: number; label: string } | null
  dialog: AppDialog | null
  recoveryRecords: RecoveryRecord[]
}
