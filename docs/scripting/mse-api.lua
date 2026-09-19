---@meta

--- MoonSprite MSE API 0.2.0 LuaLS declarations.
--- 查询返回脚本启动时的结构快照；写入会排入当前 app.transaction。

---@alias MseColorMode "rgba" | "grayscale" | "indexed"
---@alias MseLayerKind "raster" | "text" | "tilemap" | "free-tile"
---@alias MseAnimationDirection "forward" | "reverse"
---@alias MseAnimationReadDirection "forward" | "reverse" | "ping-pong" | "ping-pong-reverse"
---@alias MsePanelId "color" | "palette" | "layers" | "freeTileInstances" | "history" | "preview" | "tileset" | "brushes"
---@alias MsePanelDock "left" | "right" | "bottom" | "floating"
---@alias MseBlendMode "normal" | "darken" | "multiply" | "color-burn" | "linear-burn" | "lighten" | "screen" | "color-dodge" | "linear-dodge" | "overlay" | "soft-light" | "hard-light" | "vivid-light" | "linear-light" | "pin-light" | "hard-mix" | "difference" | "exclusion" | "subtract" | "divide" | "hue" | "saturation" | "color" | "luminosity"
---@alias MseGradientDither "none" | "checker" | "diagonal" | "diagonal-reverse" | "horizontal" | "vertical" | "bayer-2" | "bayer-4" | "bayer-8"
---@alias MseOutlinePosition "inside" | "outside" | "both"
---@alias MseOutlineKernel "round" | "square" | "horizontal" | "vertical"
---@alias MseExportFormat "png-auto" | "png-rgba" | "jpeg" | "webp" | "svg" | "gif" | "bmp" | "ico" | "psd" | "ase" | "aseprite"
---@alias MseExportTarget "document" | "slices" | "frames" | "selection" | "layer"

---@class MseColor
---@field r integer
---@field g integer
---@field b integer
---@field a integer

---@class MseBounds
---@field x integer
---@field y integer
---@field width integer
---@field height integer

---@class MseMethodCapability
---@field name string
---@field implemented true
---@field readOnly boolean

---@class MseModuleCapability
---@field status "stable"
---@field readOnly boolean
---@field methods MseMethodCapability[]

---@class MseCapabilities
---@field document MseModuleCapability
---@field layers MseModuleCapability
---@field animation MseModuleCapability
---@field palette MseModuleCapability
---@field tiles MseModuleCapability
---@field freeTiles MseModuleCapability
---@field brushes MseModuleCapability
---@field selection MseModuleCapability
---@field slices MseModuleCapability
---@field styles MseModuleCapability
---@field workspace MseModuleCapability
---@field io MseModuleCapability
---@field ui MseModuleCapability

---@class MseStatus
---@field name "MoonSprite"
---@field namespace "mse"
---@field apiVersion "0.2.0"
---@field runtimeVersion string
---@field stage "experimental"
---@field compatibility string

---@class MseLayerStyleStroke
---@field enabled boolean
---@field color MseColor
---@field size integer
---@field position MseOutlinePosition
---@field kernel MseOutlineKernel
---@field directions table<string, boolean>
---@field smartHue boolean
---@field smartHueDarkness number

---@class MseLayerStyleShadow
---@field enabled boolean
---@field color MseColor
---@field offsetX integer
---@field offsetY integer
---@field blur integer
---@field smartShadow boolean
---@field smartShadowDarkness number

---@class MseLayerStyleInnerGlow
---@field enabled boolean
---@field color MseColor
---@field size integer

---@class MseLayerStyleColorOverlay
---@field enabled boolean
---@field color MseColor

---@class MseLayerStyleGradientOverlay
---@field enabled boolean
---@field from MseColor
---@field to MseColor
---@field angle number
---@field dither MseGradientDither

---@class MseLayerStyles
---@field enabled boolean
---@field stroke MseLayerStyleStroke
---@field shadow MseLayerStyleShadow
---@field innerGlow MseLayerStyleInnerGlow
---@field colorOverlay MseLayerStyleColorOverlay
---@field gradientOverlay MseLayerStyleGradientOverlay

---@class MseLayerInfo
---@field id string
---@field name string
---@field kind MseLayerKind
---@field groupId string|nil
---@field width integer
---@field height integer
---@field x integer
---@field y integer
---@field opacity integer 0-255
---@field visible boolean
---@field locked boolean
---@field format "rgba" | "indexed"
---@field blendMode MseBlendMode
---@field displayColor MseColor|nil
---@field description string
---@field styles MseLayerStyles|nil
---@field tilemapTilesetId string|nil
---@field freeTileSetId string|nil

---@class MseActiveLayerInfo
---@field id string
---@field name string
---@field width integer
---@field height integer
---@field x integer
---@field y integer
---@field opacity integer 0-255
---@field visible boolean
---@field locked boolean
---@field format "rgba" | "indexed"

---@class MseDocumentInfo
---@field id string
---@field name string
---@field filePath string
---@field width integer
---@field height integer
---@field colorMode MseColorMode
---@field frame integer
---@field activeLayer MseActiveLayerInfo

---@class MseDocumentCreateSpec
---@field name? string
---@field width? integer
---@field height? integer
---@field colorMode? MseColorMode

---@class MseSaveAsOptions
---@field includeTimelapse? boolean Include portable timelapse data in a project Save As.
---@field name string
---@field format "moonsprite" | MseExportFormat
---@field scalePercent integer
---@field directory? string

---@class MseDocumentSaveSpec
---@field saveAs? boolean
---@field options? MseSaveAsOptions

---@class MseLayerCreateSpec
---@field name? string
---@field opacity? integer 0-255

---@class MseLayerUpdateSpec
---@field name? string
---@field opacity? integer 0-255
---@field blendMode? MseBlendMode
---@field visible? boolean
---@field locked? boolean
---@field x? integer
---@field y? integer
---@field description? string
---@field displayColor? MseColor|nil

---@class MseAnimationFrame
---@field id string
---@field number integer
---@field duration integer
---@field disabled boolean
---@field active boolean

---@class MseAnimationLoop
---@field id string
---@field name string
---@field startFrameId string
---@field endFrameId string
---@field direction MseAnimationReadDirection
---@field repeatCount integer|nil

---@class MseAnimationLoopSpec
---@field name? string
---@field start? integer|string
---@field startFrameId? string
---@field end? integer|string
---@field endFrameId? string
---@field direction? MseAnimationDirection
---@field repeatCount? integer Omitted/nil is absent in a Lua table and currently defaults to 1, not infinity.

---@class MsePaletteEntry
---@field id integer
---@field name string
---@field color MseColor

---@class MsePaletteCreateSpec
---@field color MseColor

---@class MsePaletteUpdateSpec
---@field color? MseColor
---@field name? string

---@class MsePaletteExtractSpec
---@field limit? integer
---@field mode? "replace" | "append"

---@class MseTilesetInfo
---@field id string
---@field name string
---@field tileWidth integer
---@field tileHeight integer
---@field columns integer
---@field rows integer
---@field tileIds string[]
---@field tileSlots (string|nil)[]|nil
---@field pixels integer[]|nil Packed RGBA values.

---@class MseTilesetCreateSpec
---@field name? string
---@field tileWidth? integer
---@field tileHeight? integer

---@class MseTileLayerCreateSpec
---@field name? string
---@field tileWidth? integer
---@field tileHeight? integer
---@field tilesetId? string

---@class MseTilePlaceSpec
---@field layerId string
---@field frame? integer|string
---@field frameId? string
---@field column integer
---@field row integer
---@field tilesetId? string
---@field tileId? string
---@field rotation? integer 0-3 clockwise quarter turns
---@field flipHorizontal? boolean
---@field flipVertical? boolean
---@field clear? boolean

---@class MseTileEditSpec
---@field tilesetId string
---@field tileId string
---@field pixels (integer|MseColor)[] Packed RGBA values, colors, or width*height*4 channels.

---@class MseFreeTileSourceInfo
---@field id string
---@field name string
---@field tilesetId string
---@field description? string
---@field displayColor MseColor|nil
---@field visible boolean
---@field locked boolean
---@field opacity number
---@field blendMode MseBlendMode
---@field offsetX integer
---@field offsetY integer

---@class MseFreeTileInstanceInfo
---@field id string
---@field sourceId? string
---@field x integer
---@field y integer
---@field visible? boolean
---@field locked? boolean
---@field opacity? number
---@field blendMode? MseBlendMode
---@field rotation? integer
---@field flipHorizontal? boolean
---@field flipVertical? boolean

---@class MseFreeTileLayerCreateSpec
---@field name? string
---@field freeTileSetId? string

---@class MseFreeTileSourceCreateSpec
---@field layerId string
---@field name? string

---@class MseFreeTilePlaceSpec
---@field layerId string
---@field sourceId string
---@field frame? integer|string
---@field frameId? string
---@field x integer
---@field y integer

---@class MseFreeTileEditSpec
---@field sourceId string
---@field width? integer
---@field height? integer
---@field offsetX? integer
---@field offsetY? integer
---@field pixels (integer|MseColor)[] Packed RGBA values, colors, or width*height*4 channels.

---@class MseBrushInfo
---@field id string
---@field name string
---@field source "project" | "local"
---@field width? integer
---@field height? integer
---@field folderId? string|nil
---@field intrinsicSize? boolean
---@field sourceX? integer
---@field sourceY? integer
---@field coverage? integer[]|nil
---@field colors? integer[]|nil Packed RGBA values.

---@class MseSelectionInfo
---@field exists boolean
---@field empty boolean
---@field hasMask boolean
---@field selectedPixels integer
---@field bounds MseBounds

---@class MseSelectionSetSpec: MseBounds
---@field mask? integer[] 0-255 values in row-major order.

---@class MseSelectionTransformSpec
---@field dx? integer
---@field dy? integer
---@field flip? "horizontal" | "vertical"
---@field flipHorizontal? boolean
---@field flipVertical? boolean

---@class MseSliceInfo: MseBounds
---@field id string
---@field name string

---@class MseSliceCreateSpec: MseBounds
--- Name is set with slices.update after creation.

---@class MseSliceUpdateSpec
---@field name? string
---@field x? integer
---@field y? integer
---@field width? integer
---@field height? integer

---@class MseStylesApplySpec
---@field id string
---@field styles MseLayerStyles

---@class MseStylesEnabledSpec
---@field id string
---@field enabled boolean

---@class MsePanelInfo
---@field id MsePanelId
---@field visible boolean
---@field dock MsePanelDock

---@class MsePanelSetSpec
---@field id MsePanelId
---@field visible? boolean
---@field dock? MsePanelDock

---@class MseExportSpec
---@field name string
---@field format MseExportFormat
---@field scalePercent integer
---@field target? MseExportTarget
---@field selection? MseSelectionSetSpec Host-managed; target="selection" replaces this with the active selection.
---@field layerId? string Omit with target="layer" to export all layers.
---@field trim? boolean
---@field trimMode? "individual" | "common"
---@field sliceId? string
---@field directory? string
---@field gifFrameRange? "all" | "range" | "loop-section"
---@field gifFrameStart? integer
---@field gifFrameEnd? integer
---@field gifLoopSectionId? string
---@field gifDirection? "forward" | "reverse" | "forward-ping-pong" | "reverse-ping-pong"
---@field presetName? string

---@class MseDialog
---@field id string
---@field bounds MseBounds Compatibility placeholder, not actual host geometry.
---@field data table<string, any>
---@field button fun(self: MseDialog, options: table): MseDialog
---@field check fun(self: MseDialog, options: table): MseDialog
---@field color fun(self: MseDialog, options: table): MseDialog
---@field combobox fun(self: MseDialog, options: table): MseDialog
---@field entry fun(self: MseDialog, options: table): MseDialog
---@field label fun(self: MseDialog, options: table): MseDialog
---@field number fun(self: MseDialog, options: table): MseDialog
---@field radio fun(self: MseDialog, options: table): MseDialog
---@field separator fun(self: MseDialog, options?: table): MseDialog
---@field slider fun(self: MseDialog, options: table): MseDialog
---@field show fun(self: MseDialog, options?: table): MseDialog
---@field close fun(self: MseDialog): nil
---@field modify fun(self: MseDialog, options: table): MseDialog
---@field newrow fun(self: MseDialog): MseDialog Compatibility no-op.
---@field repaint fun(self: MseDialog): nil Compatibility no-op.

---@class MseDocumentApi
---@field info fun(): MseDocumentInfo
---@field activeLayer fun(): MseLayerInfo|nil
---@field create fun(spec: MseDocumentCreateSpec): boolean
---@field open fun(path?: string): boolean
---@field save fun(spec?: MseDocumentSaveSpec): boolean

---@class MseLayersApi
---@field list fun(): MseLayerInfo[]
---@field get fun(id: string): MseLayerInfo|nil
---@field create fun(spec?: MseLayerCreateSpec): boolean
---@field duplicate fun(id: string): boolean
---@field remove fun(id: string): boolean
---@field update fun(id: string, patch: MseLayerUpdateSpec): boolean

---@class MseAnimationApi
---@field frames fun(): MseAnimationFrame[]
---@field setFrame fun(frame: integer|string): boolean
---@field loops fun(): MseAnimationLoop[]
---@field createLoop fun(spec: MseAnimationLoopSpec): boolean
---@field updateLoop fun(id: string, patch: MseAnimationLoopSpec): boolean
---@field removeLoop fun(id: string): boolean
---@field play fun(loopId?: string): boolean

---@class MsePaletteApi
---@field list fun(): MsePaletteEntry[]
---@field get fun(id: integer): MsePaletteEntry|nil
---@field create fun(spec: MsePaletteCreateSpec|MseColor): boolean
---@field update fun(id: integer, patch: MsePaletteUpdateSpec|MseColor): boolean
---@field remove fun(id: integer): boolean
---@field extract fun(spec?: MsePaletteExtractSpec): boolean

---@class MseTilesApi
---@field listSets fun(): MseTilesetInfo[]
---@field getSet fun(id: string): MseTilesetInfo|nil
---@field createSet fun(spec: MseTilesetCreateSpec): boolean
---@field createLayer fun(spec: MseTileLayerCreateSpec): boolean
---@field place fun(spec: MseTilePlaceSpec): boolean
---@field edit fun(spec: MseTileEditSpec): boolean

---@class MseFreeTilesApi
---@field listSources fun(): MseFreeTileSourceInfo[]
---@field getSource fun(id: string): MseFreeTileSourceInfo|nil
---@field createSource fun(spec: MseFreeTileSourceCreateSpec): boolean
---@field createLayer fun(spec?: MseFreeTileLayerCreateSpec): boolean
---@field place fun(spec: MseFreeTilePlaceSpec): boolean
---@field edit fun(spec: MseFreeTileEditSpec): boolean

---@class MseBrushesApi
---@field list fun(): MseBrushInfo[]
---@field get fun(id: string): MseBrushInfo|nil
---@field importImage fun(): boolean
---@field createFromSelection fun(): boolean
---@field remove fun(id: string): boolean

---@class MseSelectionApi
---@field info fun(): MseSelectionInfo
---@field set fun(spec: MseSelectionSetSpec): boolean
---@field clear fun(): boolean
---@field invert fun(): boolean
---@field transform fun(spec: MseSelectionTransformSpec): boolean

---@class MseSlicesApi
---@field list fun(): MseSliceInfo[]
---@field get fun(id: string): MseSliceInfo|nil
---@field create fun(spec: MseSliceCreateSpec): boolean
---@field update fun(id: string, patch: MseSliceUpdateSpec): boolean
---@field remove fun(id: string): boolean

---@class MseStylesApi
---@field get fun(layerId?: string): MseLayerStyles|nil
---@field apply (fun(layerId: string, styles: MseLayerStyles): boolean)|(fun(spec: MseStylesApplySpec): boolean)
---@field copy fun(layerId: string): boolean
---@field paste fun(layerId: string): boolean
---@field clear fun(layerId: string): boolean
---@field setEnabled fun(spec: MseStylesEnabledSpec): boolean

---@class MseWorkspaceApi
---@field listPanels fun(): MsePanelInfo[]
---@field getPanel fun(id: MsePanelId): MsePanelInfo|nil
---@field setPanel fun(spec: MsePanelSetSpec): boolean
---@field showPanel fun(id: MsePanelId): boolean
---@field hidePanel fun(id: MsePanelId): boolean

---@class MseIoApi
---@field export fun(spec: MseExportSpec): boolean
---@field save fun(spec?: MseDocumentSaveSpec): boolean
---@field open fun(path?: string): boolean

---@class MseUiApi
---@field notify fun(text: string): boolean
---@field alert fun(value: string|table): any
---@field dialog fun(options?: table): MseDialog

---@class MseApi
---@field apiVersion "0.2.0"
---@field status MseStatus
---@field capabilities MseCapabilities
---@field isSupported fun(path: string): boolean
---@field document MseDocumentApi
---@field layers MseLayersApi
---@field animation MseAnimationApi
---@field palette MsePaletteApi
---@field tiles MseTilesApi
---@field freeTiles MseFreeTilesApi
---@field brushes MseBrushesApi
---@field selection MseSelectionApi
---@field slices MseSlicesApi
---@field styles MseStylesApi
---@field workspace MseWorkspaceApi
---@field io MseIoApi
---@field ui MseUiApi

---@type MseApi
mse = {}
