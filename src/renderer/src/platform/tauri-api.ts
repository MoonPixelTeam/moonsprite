import { Channel, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { BinaryReadProgress, ClipboardImage, ClipboardImageSize, ProjectPreview } from '@shared/types-files'
import type { ExtensionListing, ExtensionPackagePreview, StoredExtension } from '@shared/types-extensions'
import type { MoonSpriteApi, ScaledPngWriteOptions, ScaledPngWriteResult } from '@shared/types-platform'
import type { RgbaColor } from '@shared/types-color'
import { loadEditorPreferences } from '@/core/file-preferences'
import { createResourceInfoReader } from './resource-info-cache'
import { beginRuntimeDiagnosticOperation, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'

const dialogLanguage = (): string => loadEditorPreferences().language

const readTauriResourceInfo = createResourceInfoReader(async () => {
  const [totalBytes, freeBytes] = await invoke<[number, number]>('get_resource_info')
  return { totalBytes, freeBytes }
})

const invokeBytes = async (command: string, args?: Record<string, unknown>): Promise<Uint8Array> => {
  const bytes = await invoke<ArrayBuffer | Uint8Array | number[]>(command, args)
  if (bytes instanceof Uint8Array) return bytes
  return new Uint8Array(bytes)
}

export const decodeClipboardImagePayload = (payload: Uint8Array): ClipboardImage | null => {
  if (payload.byteLength === 0) return null
  if (payload.byteLength < 8) throw new Error('Invalid clipboard image payload header.')
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const width = view.getUint32(0, true)
  const height = view.getUint32(4, true)
  const expected = width * height * 4
  if (!Number.isSafeInteger(expected) || width < 1 || height < 1 || expected !== payload.byteLength - 8) {
    throw new Error('Invalid clipboard image payload size.')
  }
  return { width, height, data: payload.subarray(8) }
}

const trackedBinaryInvoke = <T>(name: string, data: Uint8Array, task: () => Promise<T>): Promise<T> => {
  const diagnostic = runtimeDiagnosticsActive()
    ? beginRuntimeDiagnosticOperation(name, { bytes: data.byteLength }, 5_000)
    : null
  try {
    return task().then((result) => {
      diagnostic?.finish('ok')
      return result
    }, (error: unknown) => {
      diagnostic?.finish('error', { message: error instanceof Error ? error.message : String(error) })
      throw error
    })
  } catch (error) {
    diagnostic?.finish('error', { message: error instanceof Error ? error.message : String(error) })
    return Promise.reject(error)
  }
}

const writeBinaryAtomic = (filePath: string, data: Uint8Array): Promise<void> => trackedBinaryInvoke(
  'file.write',
  data,
  () => invoke(
    'write_binary_atomic',
    data,
    { headers: {
      'x-moonsprite-file-path': encodeURIComponent(filePath),
      'x-moonsprite-project-backup-versions': String(loadEditorPreferences().projectBackupVersions),
      'x-moonsprite-project-backup-enabled': loadEditorPreferences().projectBackupEnabled ? '1' : '0',
      'x-moonsprite-project-backup-retention-days': String(loadEditorPreferences().projectBackupRetentionDays),
      'x-moonsprite-project-backup-directory': encodeURIComponent(loadEditorPreferences().projectBackupDirectory)
    } }
  )
)

const SCALED_PNG_PROGRESS_EVENT = 'moonsprite:scaled-png-progress'
let scaledPngOperationSequence = 0

const encodeHeaderBytes = (bytes: Uint8Array): string => {
  let value = ''
  for (const byte of bytes) value += byte.toString(16).padStart(2, '0')
  return value
}

const writeScaledPngAtomic = async (filePath: string, source: Uint8Array, options: ScaledPngWriteOptions, onProgress?: (value: number) => void, onCancelReady?: (cancel: () => void) => void): Promise<ScaledPngWriteResult> => {
  const operationId = `scaled-png-${Date.now()}-${scaledPngOperationSequence++}`
  let cancellationRequested = false
  const cancel = (): void => {
    if (cancellationRequested) return
    cancellationRequested = true
    void invoke('cancel_scaled_png_export', { operationId })
  }
  const removeProgressListener = onProgress
    ? await listen<{ operationId: string; value: number }>(SCALED_PNG_PROGRESS_EVENT, (event) => {
        if (event.payload.operationId !== operationId) return
        onProgress(Math.max(0, Math.min(100, event.payload.value)))
      })
    : null
  onCancelReady?.(cancel)
  try {
    return await invoke(
      'write_scaled_png_atomic',
      source,
      { headers: {
        'x-moonsprite-file-path': encodeURIComponent(filePath),
        'x-moonsprite-source-width': String(options.sourceWidth),
        'x-moonsprite-source-height': String(options.sourceHeight),
        'x-moonsprite-output-width': String(options.outputWidth),
        'x-moonsprite-output-height': String(options.outputHeight),
        'x-moonsprite-force-rgba': options.forceRgba ? '1' : '0',
        'x-moonsprite-source-format': options.sourceFormat ?? 'rgba',
        ...(options.sourceFormat === 'indexed' && options.palette
          ? { 'x-moonsprite-source-palette': encodeHeaderBytes(options.palette) }
          : {}),
        'x-moonsprite-operation-id': operationId
      } }
    )
  } finally {
    removeProgressListener?.()
  }
}

const writeProjectIncremental = (filePath: string, sourcePath: string, data: Uint8Array): Promise<void> => trackedBinaryInvoke(
  'project.write-incremental',
  data,
  () => invoke(
    'write_project_incremental',
    data,
    { headers: {
      'x-moonsprite-file-path': encodeURIComponent(filePath),
      'x-moonsprite-source-path': encodeURIComponent(sourcePath),
      'x-moonsprite-project-backup-versions': String(loadEditorPreferences().projectBackupVersions),
      'x-moonsprite-project-backup-retention-days': String(loadEditorPreferences().projectBackupRetentionDays),
      'x-moonsprite-project-backup-directory': encodeURIComponent(loadEditorPreferences().projectBackupDirectory)
    } }
  )
)

const writeRecovery = (id: string, name: string, data: Uint8Array): Promise<void> => trackedBinaryInvoke(
  'recovery.write',
  data,
  () => invoke(
    'write_recovery',
    data,
    { headers: {
      'x-moonsprite-recovery-id': encodeURIComponent(id),
      'x-moonsprite-recovery-name': encodeURIComponent(name)
    } }
  )
)

const writeLocalHistory = (id: string, data: Uint8Array): Promise<void> => trackedBinaryInvoke(
  'local-history.write',
  data,
  () => invoke('write_local_history', data, { headers: { 'x-moonsprite-local-history-id': encodeURIComponent(id) } })
)

export const createTauriApi = (): MoonSpriteApi => ({
  openFiles: () => invoke('open_files', { language: dialogLanguage() }),
  openBrushImages: () => invoke('open_brush_images', { language: dialogLanguage() }),
  takeStartupFiles: () => invoke('take_startup_files'),
  saveProject: (defaultPath, format) => invoke('save_project', { defaultPath, format, language: dialogLanguage() }),
  exportImage: (defaultPath, format) => invoke('export_image', { defaultPath, format, language: dialogLanguage() }),
  savePaletteImage: (defaultPath) => invoke('save_palette_image', { defaultPath, language: dialogLanguage() }),
  saveShortcutFile: (defaultPath) => invoke('save_shortcut_file', { defaultPath, language: dialogLanguage() }),
  saveThemeFile: (defaultPath) => invoke('save_theme_file', { defaultPath, language: dialogLanguage() }),
  saveUsageStatisticsFile: (defaultPath) => invoke('save_usage_statistics_file', { defaultPath, language: dialogLanguage() }),
  getDefaultFileDirectories: () => invoke('default_file_directories'),
  chooseDirectory: (defaultPath) => invoke('choose_directory', { defaultPath }),
  fileExists: (filePath) => invoke('file_exists', { filePath }),
  readBinary: async (filePath, onProgress) => {
    const progress = new Channel<BinaryReadProgress>()
    progress.onmessage = (event) => onProgress?.(event)
    return invokeBytes('read_binary', { filePath, onProgress: progress })
  },
  readProjectPreview: async (filePath) => {
    const result = await invoke<Omit<ProjectPreview, 'preview'> & { preview: number[] }>('read_project_preview', { filePath })
    return { ...result, preview: new Uint8Array(result.preview) }
  },
  cacheProjectPreview: (filePath, preview) => invoke('cache_project_preview', {
    filePath,
    preview: Array.from(preview.preview),
    width: preview.width,
    height: preview.height,
    colorMode: preview.colorMode
  }),
  writeBinaryAtomic,
  openProjectBackupFolder: () => invoke('open_project_backup_folder', { directoryPath: loadEditorPreferences().projectBackupDirectory }),
  listProjectBackups: (projectPath) => invoke('list_project_backups', { projectPath, directoryPath: loadEditorPreferences().projectBackupDirectory }),
  writeScaledPngAtomic,
  writeProjectIncremental,
  writeClipboardImage: (image) => invoke('write_clipboard_image', { width: image.width, height: image.height, data: Array.from(image.data) }),
  readClipboardText: () => invoke<string | null>('read_clipboard_text'),
  readClipboardImage: async (): Promise<ClipboardImage | null> => decodeClipboardImagePayload(await invokeBytes('read_clipboard_image')),
  readClipboardImageSize: () => invoke<ClipboardImageSize | null>('read_clipboard_image_size'),
  sampleWindowColor: (clientX, clientY) => invoke<RgbaColor>('sample_window_color', { clientX, clientY }),
  sampleWindowColorRegion: (clientX, clientY, radius) => invoke<RgbaColor[]>('sample_window_color_region', { clientX, clientY, radius }),
  listPalettes: () => invoke('list_palettes'),
  importPalette: () => invoke('import_palette'),
  savePalette: (id, name, colors, columns, slots) => invoke('save_palette', { id, name, colors, columns, slots }),
  deletePalette: (id) => invoke('delete_palette', { id }),
  openPaletteFolder: () => invoke('open_palette_folder'),
  listWorkspaces: () => invoke('list_workspaces'),
  saveWorkspace: (id, name, layout) => invoke('save_workspace', { id, name, layout }),
  deleteWorkspace: (id) => invoke('delete_workspace', { id }),
  openWorkspaceFolder: () => invoke('open_workspace_folder'),
  listBrushes: () => invoke('list_brushes'),
  saveBrush: (name, data, intrinsicSize = true, sourceX, sourceY, folderId) => invoke('save_brush', { name, data: Array.from(data), intrinsicSize, sourceX, sourceY, folderId }),
  deleteBrush: (id) => invoke('delete_brush', { id }),
  setBrushOrder: (ids) => invoke('set_brush_order', { ids }),
  createBrushFolder: (name, parentFolderId) => invoke('create_brush_folder', { name, parentFolderId }),
  renameBrushFolder: (id, name) => invoke('rename_brush_folder', { id, name }),
  deleteBrushFolder: (id) => invoke('delete_brush_folder', { id }),
  moveBrush: (id, folderId) => invoke('move_brush', { id, folderId }),
  openBrushFolder: () => invoke('open_brush_folder'),
  listFonts: () => invoke('list_fonts'),
  listSystemFonts: () => invoke('list_system_fonts'),
  importFont: () => invoke('import_font'),
  importSystemFont: (id) => invoke('import_system_font', { id }),
  deleteFont: (id) => invoke('delete_font', { id }),
  listBackgroundPresets: () => invoke('list_background_presets'),
  saveBackgroundPreset: (name, data) => invoke('save_background_preset', { name, data: Array.from(data) }),
  openBackgroundPresetFolder: () => invoke('open_background_preset_folder'),
  listRecoveries: (retentionDays) => invoke('list_recoveries', { retentionDays }),
  readRecovery: (id) => invokeBytes('read_recovery', { id }),
  writeRecovery,
  appendTimelapseFrame: (store, data) => invoke('append_timelapse_frame', data, { headers: { 'x-moonsprite-recording': store } }),
  readTimelapseFrame: (reference) => invokeBytes('read_timelapse_frame', { reference }),
  deleteRecovery: (id) => invoke('delete_recovery', { id }),
  readLocalHistory: (id) => invokeBytes('read_local_history', { id }),
  writeLocalHistory,
  deleteLocalHistory: (id) => invoke('delete_local_history', { id }),
  readUsageStatistics: () => invoke<string | null>('read_usage_statistics'),
  writeUsageStatistics: (json) => invoke('write_usage_statistics', { json }),
  usageStatisticsPath: () => invoke<string>('usage_statistics_path'),
  openUsageStatisticsFolder: () => invoke('open_usage_statistics_folder'),
  listGalleryProjects: () => invoke('list_gallery_projects'),
  listFolderProjects: (directoryPath) => invoke('list_folder_projects', { directoryPath }),
  deleteGalleryProject: (fileName) => invoke('delete_gallery_project', { fileName }),
  openGalleryFolder: () => invoke('open_gallery_folder'),
  openDirectory: (directoryPath) => invoke('open_directory', { directoryPath }),
  ensureBuiltinExample: () => invoke('ensure_builtin_example'),
  openProjectInFolder: (filePath) => invoke('open_project_in_folder', { filePath }),
  openExternalUrl: (url) => invoke('open_external_url', { url }),
  listLuaScripts: () => invoke('list_lua_scripts'),
  openLuaScriptFolder: () => invoke('open_lua_script_folder'),
  deleteLuaScript: (scriptId) => invoke('delete_lua_script', { scriptId }),
  runLuaScript: (scriptId, context) => invoke('run_lua_script', { scriptId, context }),
  dispatchLuaScriptDialog: (sessionId, action, context) => invoke('dispatch_lua_script_dialog', { sessionId, action, context }),
  closeLuaScriptSession: (sessionId) => invoke('close_lua_script_session', { sessionId }),
  listExtensions: () => invoke('list_extensions'),
  inspectExtensionPackage: (filePath) => invoke('inspect_extension_package', { packagePath: filePath }),
  installExtension: (filePath) => invoke('install_extension', { packagePath: filePath }),
  chooseExtensionPackage: () => invoke('choose_extension_package', { language: dialogLanguage() }),
  setExtensionEnabled: (id, enabled) => invoke('set_extension_enabled', { id, enabled }),
  uninstallExtension: (id) => invoke('uninstall_extension', { id }),
  openExtensionFolder: () => invoke('open_extension_folder'),
  readExtensionSettingsEntry: (extensionId) => invoke('read_extension_settings_entry', { extensionId }),
  readExtensionRuntimeEntry: (extensionId) => invoke('read_extension_runtime_entry', { extensionId }),
  readExtensionRuntimeResource: (extensionId, resourceId) => invokeBytes('read_extension_runtime_resource', { extensionId, resourceId }),
  showExtensionWindow: (extensionId, windowId, resourceId, options) => invoke('show_extension_window', { extensionId, windowId, resourceId, options }),
  setExtensionWindowVisible: (extensionId, windowId, visible) => invoke('set_extension_window_visible', { extensionId, windowId, visible }),
  closeExtensionWindows: (extensionId, windowId) => invoke('close_extension_windows', { extensionId, windowId }),
  emitExtensionWindowMessage: (extensionId, windowId, message) => invoke('emit_extension_window_message', { extensionId, windowId, message }),
  getResourceInfo: readTauriResourceInfo,
  confirmUnsaved: (name) => invoke('confirm_unsaved', { name }),
  pathForFile: (file) => (file as File & { path?: string }).path ?? '',
  onRequestClose: (callback) => {
    let active = true
    let removeListener: (() => void) | null = null
    void listen('app:request-close', () => { if (active) void callback() }).then((remove) => {
      removeListener = remove
      if (!active) {
        remove()
        return
      }
      // The native close request can happen before this asynchronous event
      // listener is installed. Ask the backend to replay any still-pending
      // request now that the listener is ready.
      void invoke('close_listener_ready').catch(() => {})
    }).catch(() => {})
    return () => { active = false; removeListener?.() }
  },
  cancelClose: () => { void invoke('cancel_close') },
  approveClose: () => { void invoke('approve_close') }
})

export async function installTauriApi(): Promise<void> {
  if (window.moonSprite) return
  if ('__TAURI_INTERNALS__' in window) window.moonSprite = createTauriApi()
  else window.moonSprite = (await import('./browser-api')).createBrowserApi()
}
