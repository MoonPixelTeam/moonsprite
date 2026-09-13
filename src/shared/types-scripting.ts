import type { ColorMode } from './types-raster'
import type { RasterLayer } from './types-layer'
import type { RgbaColor } from './types-color'

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
