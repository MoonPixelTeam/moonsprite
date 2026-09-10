import { isAndroidRuntime } from './runtime-platform'
import { createAndroidApi } from './android-api'
import { Channel, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { BinaryReadProgress, ClipboardImage, ClipboardImageSize, ExtensionListing, MoonSpriteApi, ProjectPreview, RgbaColor, SaveDialogFormat, ScaledPngWriteOptions, ScaledPngWriteResult, StoredBackgroundPreset, StoredBrush, StoredBrushFolder, StoredExtension, StoredPalette, StoredWorkspace } from '@shared/types'
import { builtInPalettes } from '@/core/built-in-palettes'
import { brushFolderContains, remapBrushFolderId } from '@/core/brush-folder-tree'
import { loadEditorPreferences } from '@/core/file-preferences'
import { translate, type TranslationKey, type TranslationParams } from '@/core/localization'
import { createResourceInfoReader } from './resource-info-cache'
import { beginRuntimeDiagnosticOperation, runtimeDiagnosticsActive } from '@/core/runtime-diagnostics'

const tr = (key: TranslationKey, params?: TranslationParams): string => translate(loadEditorPreferences().language, key, params)
const dialogLanguage = (): string => loadEditorPreferences().language

const browserRecoveries = new Map<string, { name: string; data: Uint8Array; updatedAt: string }>()
const browserBrushes = new Map<string, { stored: StoredBrush; data: Uint8Array }>()
const browserBackgroundPresets = new Map<string, { stored: StoredBackgroundPreset; data: Uint8Array }>()
let browserBrushOrder: string[] = []
const browserBrushFolders = new Map<string, StoredBrushFolder>()
const browserPalettes = new Map<string, StoredPalette>(builtInPalettes.map((palette) => [palette.id, {
  ...palette,
  filePath: '',
  builtIn: true,
  colors: palette.colors.map((color) => ({ ...color }))
}]))
const browserWorkspaces = new Map<string, StoredWorkspace>([['builtin-default', {
  id: 'builtin-default', name: tr('app.workspace.default'), filePath: '', updatedAt: '', builtIn: true,
  layout: { panelDocks: { color: 'left', palette: 'left', layers: 'bottom', freeTileInstances: 'bottom', history: 'right', preview: 'bottom', tileset: 'right', brushes: 'right' }, panelVisibility: { color: true, palette: true, layers: true, freeTileInstances: false, history: true, preview: true, tileset: false, brushes: true }, inspectorWidth: 300, leftDockWidth: 280, bottomDockHeight: 220, inspectorWidthRatio: 0.20833333333333334, leftDockWidthRatio: 0.19444444444444445, bottomDockHeightRatio: 0.275, toolRailSide: 'right', previewOpen: true, inspectorLayout: '{"order":["palette","color","layers","freeTileInstances","history","brushes","tileset","preview"],"verticalWeights":{"color":330,"palette":620,"layers":560,"freeTileInstances":180,"history":220,"preview":220,"tileset":280,"brushes":240},"bottomWeights":{"color":280,"palette":280,"layers":720,"freeTileInstances":300,"history":320,"preview":280,"tileset":360,"brushes":320}}', colorSquareDock: 'left', colorSquareAnchor: 'end', floatingPanels: { color: null, palette: null, layers: null, freeTileInstances: null, history: null, preview: null, tileset: null, brushes: null }, mainWindow: null },
  initialLayout: { panelDocks: { color: 'left', palette: 'left', layers: 'bottom', freeTileInstances: 'bottom', history: 'right', preview: 'bottom', tileset: 'right', brushes: 'right' }, panelVisibility: { color: true, palette: true, layers: true, freeTileInstances: false, history: true, preview: true, tileset: false, brushes: true }, inspectorWidth: 300, leftDockWidth: 280, bottomDockHeight: 220, inspectorWidthRatio: 0.20833333333333334, leftDockWidthRatio: 0.19444444444444445, bottomDockHeightRatio: 0.275, toolRailSide: 'right', previewOpen: true, inspectorLayout: '{"order":["palette","color","layers","freeTileInstances","history","brushes","tileset","preview"],"verticalWeights":{"color":330,"palette":620,"layers":560,"freeTileInstances":180,"history":220,"preview":220,"tileset":280,"brushes":240},"bottomWeights":{"color":280,"palette":280,"layers":720,"freeTileInstances":300,"history":320,"preview":280,"tileset":360,"brushes":320}}', colorSquareDock: 'left', colorSquareAnchor: 'end', floatingPanels: { color: null, palette: null, layers: null, freeTileInstances: null, history: null, preview: null, tileset: null, brushes: null }, mainWindow: null }
} as StoredWorkspace]])

const readTauriResourceInfo = createResourceInfoReader(async () => {
  const [totalBytes, freeBytes] = await invoke<[number, number]>('get_resource_info')
  return { totalBytes, freeBytes }
})

const browserPaletteId = (name: string): string => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `palette-${Date.now()}`
  let id = base
  let suffix = 2
  while (browserPalettes.has(id)) id = `${base}-${suffix++}`
  return id
}

const browserBackgroundPresetId = (name: string): string => {
  const base = name.trim() || tr('backgroundPreset.selectionName')
  let id = `${base}.png`
  let suffix = 2
  while (browserBackgroundPresets.has(id)) id = `${base} ${suffix++}.png`
  return id
}

const cloneStoredPalette = (palette: StoredPalette): StoredPalette => ({
  ...palette,
  colors: palette.colors.map((color) => ({ ...color })),
  slots: palette.slots ? [...palette.slots] : undefined
})

const createBrowserApi = (): MoonSpriteApi => ({
  openFiles: async () => ({ canceled: true, filePaths: [] }),
  openBrushImages: async () => ({ canceled: true, filePaths: [] }),
  takeStartupFiles: async () => [],
  saveProject: async (_defaultPath?: string, _format?: SaveDialogFormat) => ({ canceled: true }),
  exportImage: async () => ({ canceled: true }),
  savePaletteImage: async () => ({ canceled: true }),
  saveShortcutFile: async () => ({ canceled: true }),
  saveThemeFile: async () => ({ canceled: true }),
  getDefaultFileDirectories: async () => ({ saveDirectory: 'gallery', exportDirectory: 'exports' }),
  chooseDirectory: async () => ({ canceled: true }),
  fileExists: async () => false,
  readBinary: async (filePath) => {
    const brush = [...browserBrushes.values()].find((item) => item.stored.filePath === filePath)
    if (brush) return brush.data.slice()
    const backgroundPreset = [...browserBackgroundPresets.values()].find((item) => item.stored.filePath === filePath)
    if (backgroundPreset) return backgroundPreset.data.slice()
    throw new Error(tr('platform.browser.readUnsupported'))
  },
  readProjectPreview: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  cacheProjectPreview: async () => {},
  writeBinaryAtomic: async () => { throw new Error(tr('platform.browser.writeUnsupported')) },
  writeProjectIncremental: async () => { throw new Error(tr('platform.browser.writeUnsupported')) },
  writeClipboardImage: async () => {},
  readClipboardText: async () => null,
  readClipboardImage: async () => null,
  readClipboardImageSize: async () => null,
  listPalettes: async () => ({ directoryPath: 'palettes', palettes: [...browserPalettes.values()].map(cloneStoredPalette) }),
  savePalette: async (requestedId, name, colors, columns, slots) => {
    const id = requestedId ?? browserPaletteId(name)
    const palette: StoredPalette = { id, name, filePath: `palettes/${id}.palette.json`, builtIn: false, colors: colors.map((color: RgbaColor) => ({ ...color })), columns, slots: [...slots] }
    browserPalettes.set(id, palette)
    return cloneStoredPalette(palette)
  },
  deletePalette: async (id) => {
    if (browserPalettes.get(id)?.builtIn) throw new Error(tr('platform.palette.builtInDelete'))
    browserPalettes.delete(id)
  },
  openPaletteFolder: async () => {},
  listWorkspaces: async () => ({ directoryPath: 'workspaces', workspaces: [...browserWorkspaces.values()].map((workspace) => ({ ...workspace, layout: structuredClone(workspace.layout), initialLayout: structuredClone(workspace.initialLayout) })) }),
  saveWorkspace: async (requestedId, name, layout) => {
    const id = requestedId ?? browserPaletteId(name)
    const existing = browserWorkspaces.get(id)
    const stored: StoredWorkspace = { id, name: name.trim() || tr('app.workspace.default'), filePath: id === 'builtin-default' ? 'workspaces/default.workspace.json' : `workspaces/${id}.workspace.json`, updatedAt: String(Date.now()), builtIn: existing?.builtIn === true || id === 'builtin-default', layout: structuredClone(layout), initialLayout: existing ? structuredClone(existing.initialLayout) : structuredClone(layout) }
    browserWorkspaces.set(id, stored)
    return { ...stored, layout: structuredClone(stored.layout), initialLayout: structuredClone(stored.initialLayout) }
  },
  deleteWorkspace: async (id) => { if (browserWorkspaces.get(id)?.builtIn) throw new Error(tr('app.workspace.builtInDelete')); browserWorkspaces.delete(id) },
  openWorkspaceFolder: async () => {},
  listBrushes: async () => ({ directoryPath: 'brushes', folders: [...browserBrushFolders.values()].map((folder) => ({ ...folder })), brushes: browserBrushOrder.flatMap((id) => {
    const item = browserBrushes.get(id)
    return item ? [{ ...item.stored }] : []
  }) }),
  saveBrush: async (name, data, intrinsicSize = true, sourceX, sourceY, folderId) => {
    const normalizedFolderId = folderId || null
    if (normalizedFolderId && !browserBrushFolders.has(normalizedFolderId)) throw new Error(tr('brush.folderNotFound'))
    const id = `${name.trim() || tr('brush.defaultName')}-${Date.now()}.png`
    const stored = { id, name: name.trim() || tr('brush.defaultName'), filePath: `brushes/${normalizedFolderId ? `${normalizedFolderId}/` : ''}${id}`, intrinsicSize, sourceX, sourceY, folderId: normalizedFolderId }
    browserBrushes.set(id, { stored, data: data.slice() })
    browserBrushOrder = [...browserBrushOrder.filter((item) => item !== id), id]
    return { ...stored }
  },
  deleteBrush: async (id) => { browserBrushes.delete(id); browserBrushOrder = browserBrushOrder.filter((item) => item !== id) },
  setBrushOrder: async (ids) => {
    const requested = ids.filter((id, index) => browserBrushes.has(id) && ids.indexOf(id) === index)
    browserBrushOrder = [...requested, ...browserBrushOrder.filter((id) => browserBrushes.has(id) && !requested.includes(id))]
  },
  createBrushFolder: async (name, parentFolderId) => {
    const cleanName = name.trim()
    if (!cleanName) throw new Error(tr('brush.folderNameRequired'))
    const normalizedParentId = parentFolderId || null
    if (normalizedParentId && !browserBrushFolders.has(normalizedParentId)) throw new Error(tr('brush.folderNotFound'))
    const baseId = cleanName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff_-]+/gu, '-').replace(/^-+|-+$/gu, '') || `folder-${Date.now()}`
    let id = normalizedParentId ? `${normalizedParentId}/${baseId}` : baseId
    let suffix = 2
    while (browserBrushFolders.has(id)) id = normalizedParentId ? `${normalizedParentId}/${baseId}-${suffix++}` : `${baseId}-${suffix++}`
    const folder = { id, name: cleanName, filePath: `brushes/${id}` }
    browserBrushFolders.set(id, folder)
    return { ...folder }
  },
  renameBrushFolder: async (id, name) => {
    const source = browserBrushFolders.get(id)
    if (!source) throw new Error(tr('brush.folderNotFound'))
    const cleanName = name.trim()
    if (!cleanName) throw new Error(tr('brush.folderNameRequired'))
    const separator = id.lastIndexOf('/')
    const parentId = separator >= 0 ? id.slice(0, separator) : null
    const nextLeaf = cleanName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff_-]+/gu, '-').replace(/^-+|-+$/gu, '') || `folder-${Date.now()}`
    const nextId = parentId ? `${parentId}/${nextLeaf}` : nextLeaf
    if (nextId !== id && browserBrushFolders.has(nextId)) throw new Error(tr('brush.folderExists'))
    const replacements = [...browserBrushFolders.values()]
      .filter((folder) => brushFolderContains(id, folder.id))
      .map((folder) => {
        const folderId = remapBrushFolderId(folder.id, id, nextId)
        return { previousId: folder.id, folder: { ...folder, id: folderId, name: folder.id === id ? cleanName : folder.name, filePath: `brushes/${folderId}` } }
      })
    for (const replacement of replacements) browserBrushFolders.delete(replacement.previousId)
    for (const replacement of replacements) browserBrushFolders.set(replacement.folder.id, replacement.folder)
    for (const item of browserBrushes.values()) {
      const folderId = item.stored.folderId
      if (!brushFolderContains(id, folderId)) continue
      const nextFolderId = remapBrushFolderId(folderId!, id, nextId)
      item.stored = { ...item.stored, folderId: nextFolderId, filePath: `brushes/${nextFolderId}/${item.stored.id}` }
    }
    return { ...browserBrushFolders.get(nextId)! }
  },
  deleteBrushFolder: async (id) => {
    if (!browserBrushFolders.has(id)) throw new Error(tr('brush.folderNotFound'))
    for (const folderId of [...browserBrushFolders.keys()]) {
      if (brushFolderContains(id, folderId)) browserBrushFolders.delete(folderId)
    }
    const deletedBrushIds: string[] = []
    for (const [brushId, item] of browserBrushes) {
      const folderId = item.stored.folderId
      if (brushFolderContains(id, folderId)) {
        deletedBrushIds.push(brushId)
        browserBrushes.delete(brushId)
      }
    }
    browserBrushOrder = browserBrushOrder.filter((brushId) => !deletedBrushIds.includes(brushId))
  },
  moveBrush: async (id, folderId) => {
    const item = browserBrushes.get(id)
    if (!item) throw new Error(tr('brush.notFound'))
    const normalizedFolderId = folderId || null
    if (normalizedFolderId && !browserBrushFolders.has(normalizedFolderId)) throw new Error(tr('brush.folderNotFound'))
    item.stored = { ...item.stored, folderId: normalizedFolderId, filePath: `brushes/${normalizedFolderId ? `${normalizedFolderId}/` : ''}${id}` }
    return { ...item.stored }
  },
  openBrushFolder: async () => {},
  listFonts: async () => ({ directoryPath: 'Font', fonts: [] }),
  listSystemFonts: async () => [],
  importFont: async () => null,
  importSystemFont: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  deleteFont: async () => {},
  listBackgroundPresets: async () => ({ directoryPath: 'BackgroundPresets', presets: [...browserBackgroundPresets.values()].map((item) => ({ ...item.stored })) }),
  saveBackgroundPreset: async (name, data) => {
    const id = browserBackgroundPresetId(name)
    const stored: StoredBackgroundPreset = { id, name: name.trim() || tr('backgroundPreset.selectionName'), filePath: `BackgroundPresets/${id}`, builtIn: false }
    browserBackgroundPresets.set(id, { stored, data: data.slice() })
    return { ...stored }
  },
  openBackgroundPresetFolder: async () => {},
  listRecoveries: async (retentionDays) => {
    const cutoff = Date.now() - Math.max(1, Math.min(365, Math.round(retentionDays))) * 86_400_000
    for (const [id, item] of browserRecoveries) {
      const updatedAt = Date.parse(item.updatedAt)
      if (Number.isFinite(updatedAt) && updatedAt < cutoff) browserRecoveries.delete(id)
    }
    return [...browserRecoveries].map(([id, item]) => ({ id, name: item.name, updatedAt: item.updatedAt }))
  },
  readRecovery: async (id) => {
    const recovery = browserRecoveries.get(id)
    if (!recovery) throw new Error(tr('platform.recovery.notFound'))
    return recovery.data.slice()
  },
  writeRecovery: async (id, name, data) => { browserRecoveries.set(id, { name, data: data.slice(), updatedAt: new Date().toISOString() }) },
  deleteRecovery: async (id) => { browserRecoveries.delete(id) },
  listGalleryProjects: async () => ({ directoryPath: 'gallery', projects: [] }),
  listFolderProjects: async (directoryPath) => ({ directoryPath, projects: [] }),
  deleteGalleryProject: async () => {},
  openGalleryFolder: async () => {},
  openDirectory: async () => {},
  ensureBuiltinExample: async () => null,
  openProjectInFolder: async () => {},
  openExternalUrl: async (url) => { window.open(url, '_blank', 'noopener,noreferrer') },
  listLuaScripts: async () => ({ directoryPath: 'scripts', scripts: [] }),
  openLuaScriptFolder: async () => {},
  runLuaScript: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  dispatchLuaScriptDialog: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  closeLuaScriptSession: async () => {},
  listExtensions: async (): Promise<ExtensionListing> => ({ directoryPath: 'extensions', extensions: [] }),
  installExtension: async (): Promise<StoredExtension> => { throw new Error(tr('platform.browser.readUnsupported')) },
  chooseAndInstallExtension: async (): Promise<StoredExtension | null> => { throw new Error(tr('platform.browser.readUnsupported')) },
  setExtensionEnabled: async (): Promise<StoredExtension> => { throw new Error(tr('platform.browser.readUnsupported')) },
  uninstallExtension: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  openExtensionFolder: async () => {},
  getResourceInfo: async () => ({ totalBytes: 8 * 1024 ** 3, freeBytes: 4 * 1024 ** 3 }),
  confirmUnsaved: async () => 'cancel',
  pathForFile: () => '',
  onRequestClose: () => () => {},
  cancelClose: () => {},
  approveClose: () => {}
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
    { headers: { 'x-moonsprite-file-path': encodeURIComponent(filePath) } }
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
      'x-moonsprite-source-path': encodeURIComponent(sourcePath)
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

export const createTauriApi = (): MoonSpriteApi => ({
  openFiles: () => invoke('open_files', { language: dialogLanguage() }),
  openBrushImages: () => invoke('open_brush_images', { language: dialogLanguage() }),
  takeStartupFiles: () => invoke('take_startup_files'),
  saveProject: (defaultPath, format) => invoke('save_project', { defaultPath, format, language: dialogLanguage() }),
  exportImage: (defaultPath, format) => invoke('export_image', { defaultPath, format, language: dialogLanguage() }),
  savePaletteImage: (defaultPath) => invoke('save_palette_image', { defaultPath, language: dialogLanguage() }),
  saveShortcutFile: (defaultPath) => invoke('save_shortcut_file', { defaultPath, language: dialogLanguage() }),
  saveThemeFile: (defaultPath) => invoke('save_theme_file', { defaultPath, language: dialogLanguage() }),
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
  writeScaledPngAtomic,
  writeProjectIncremental,
  writeClipboardImage: (image) => invoke('write_clipboard_image', { width: image.width, height: image.height, data: Array.from(image.data) }),
  readClipboardText: () => invoke<string | null>('read_clipboard_text'),
  readClipboardImage: async (): Promise<ClipboardImage | null> => decodeClipboardImagePayload(await invokeBytes('read_clipboard_image')),
  readClipboardImageSize: () => invoke<ClipboardImageSize | null>('read_clipboard_image_size'),
  listPalettes: () => invoke('list_palettes'),
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
  deleteRecovery: (id) => invoke('delete_recovery', { id }),
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
  runLuaScript: (scriptId, context) => invoke('run_lua_script', { scriptId, context }),
  dispatchLuaScriptDialog: (sessionId, action, context) => invoke('dispatch_lua_script_dialog', { sessionId, action, context }),
  closeLuaScriptSession: (sessionId) => invoke('close_lua_script_session', { sessionId }),
  listExtensions: () => invoke('list_extensions'),
  installExtension: (filePath) => invoke('install_extension', { packagePath: filePath }),
  chooseAndInstallExtension: () => invoke('choose_and_install_extension', { language: dialogLanguage() }),
  setExtensionEnabled: (id, enabled) => invoke('set_extension_enabled', { id, enabled }),
  uninstallExtension: (id) => invoke('uninstall_extension', { id }),
  openExtensionFolder: () => invoke('open_extension_folder'),
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
  if ('__TAURI_INTERNALS__' in window) {
    const api = createTauriApi()
    window.moonSprite = isAndroidRuntime() ? createAndroidApi(api) : api
    if (isAndroidRuntime()) document.documentElement.dataset.platform = 'android'
  }
  else window.moonSprite = createBrowserApi()
}
