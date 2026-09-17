import type { OpenDialogResult, SaveDialogResult, DefaultFileDirectories, DirectoryDialogResult, BinaryReadProgress, ProjectPreview, ProjectBackupRecord, ClipboardImage, ClipboardImageSize, PaletteListing, StoredPalette, RecoveryRecord, GalleryListing, ResourceInfo } from './types-files'
import type { SaveDialogFormat, ImageExportFormat, RgbaColor } from './types-color'
import type { WorkspaceListing, WorkspaceLayout, StoredWorkspace } from './types-workspace'
import type { BrushListing, StoredBrush, StoredBrushFolder, FontListing, StoredFont, BackgroundPresetListing, StoredBackgroundPreset } from './types-library'
import type { LuaScriptListing, ExtensionListing, ExtensionPackagePreview, StoredExtension } from './types-extensions'
import type { LuaScriptExecutionContext, LuaScriptRunResult, LuaScriptDialogAction } from './types-scripting'

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
  saveUsageStatisticsFile(defaultPath?: string): Promise<SaveDialogResult>
  getDefaultFileDirectories(): Promise<DefaultFileDirectories>
  chooseDirectory(defaultPath?: string): Promise<DirectoryDialogResult>
  fileExists(filePath: string): Promise<boolean>
  readBinary(filePath: string, onProgress?: (progress: BinaryReadProgress) => void): Promise<Uint8Array>
  readProjectPreview(filePath: string): Promise<ProjectPreview>
  cacheProjectPreview(filePath: string, preview: ProjectPreview): Promise<void>
  writeBinaryAtomic(filePath: string, data: Uint8Array): Promise<void>
  openProjectBackupFolder(): Promise<void>
  listProjectBackups(projectPath: string): Promise<ProjectBackupRecord[]>
  writeScaledPngAtomic?(filePath: string, source: Uint8Array, options: ScaledPngWriteOptions, onProgress?: (value: number) => void, onCancelReady?: (cancel: () => void) => void): Promise<ScaledPngWriteResult>
  writeProjectIncremental(filePath: string, sourcePath: string, data: Uint8Array): Promise<void>
  writeClipboardImage(image: ClipboardImage): Promise<void>
  readClipboardText(): Promise<string | null>
  readClipboardImage(): Promise<ClipboardImage | null>
  readClipboardImageSize(): Promise<ClipboardImageSize | null>
  sampleWindowColor(clientX: number, clientY: number): Promise<RgbaColor | null>
  sampleWindowColorRegion(clientX: number, clientY: number, radius: number): Promise<RgbaColor[] | null>
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
  appendTimelapseFrame?(store: string, data: Uint8Array): Promise<import('./types-timelapse').TimelapseFrameReference>
  readTimelapseFrame?(reference: import('./types-timelapse').TimelapseFrameReference): Promise<Uint8Array>
  deleteRecovery(id: string): Promise<void>
  readLocalHistory(id: string): Promise<Uint8Array>
  writeLocalHistory(id: string, data: Uint8Array): Promise<void>
  deleteLocalHistory(id: string): Promise<void>
  readUsageStatistics(): Promise<string | null>
  writeUsageStatistics(json: string): Promise<void>
  usageStatisticsPath(): Promise<string>
  openUsageStatisticsFolder(): Promise<void>
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
  deleteLuaScript(scriptId: string): Promise<void>
  runLuaScript(scriptId: string, context: LuaScriptExecutionContext): Promise<LuaScriptRunResult>
  dispatchLuaScriptDialog(sessionId: string, action: LuaScriptDialogAction, context: LuaScriptExecutionContext): Promise<LuaScriptRunResult>
  closeLuaScriptSession(sessionId: string): Promise<void>
  listExtensions(): Promise<ExtensionListing>
  inspectExtensionPackage(filePath: string): Promise<ExtensionPackagePreview>
  installExtension(filePath: string): Promise<StoredExtension>
  chooseAndInstallExtension(): Promise<StoredExtension | null>
  setExtensionEnabled(id: string, enabled: boolean): Promise<StoredExtension>
  uninstallExtension(id: string): Promise<void>
  openExtensionFolder(): Promise<void>
  readExtensionSettingsEntry(extensionId: string): Promise<string>
  readExtensionRuntimeEntry(extensionId: string): Promise<string>
  readExtensionRuntimeResource(extensionId: string, resourceId: string): Promise<Uint8Array>
  showExtensionWindow(extensionId: string, windowId: string, resourceId: string, options: ExtensionWindowOptions): Promise<void>
  setExtensionWindowVisible(extensionId: string, windowId: string, visible: boolean): Promise<void>
  closeExtensionWindows(extensionId: string, windowId?: string): Promise<void>
  emitExtensionWindowMessage(extensionId: string, windowId: string, message: unknown): Promise<void>
  getResourceInfo(): Promise<ResourceInfo>
  confirmUnsaved(name: string): Promise<'save' | 'discard' | 'cancel'>
  pathForFile(file: unknown): string
  onRequestClose(callback: () => void | Promise<void>): () => void
  cancelClose(): void
  approveClose(): void
}

export interface ExtensionWindowOptions {
  x: number
  y: number
  width: number
  height: number
  transparent?: boolean
  focusable?: boolean
}
