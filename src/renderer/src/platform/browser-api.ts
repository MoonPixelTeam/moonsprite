import normalWorkspaceLayout from '@shared/workspace-normal.json'
import type { StoredPalette } from '@shared/types-files'
import type { ExtensionListing, ExtensionPackagePreview, StoredExtension } from '@shared/types-extensions'
import type { MoonSpriteApi } from '@shared/types-platform'
import type { RgbaColor } from '@shared/types-color'
import type { StoredBackgroundPreset, StoredBrush, StoredBrushFolder } from '@shared/types-library'
import type { StoredWorkspace, WorkspaceLayout } from '@shared/types-workspace'
import { builtInPalettes } from '@/core/built-in-palettes'
import { brushFolderContains, remapBrushFolderId } from '@/core/brush-folder-tree'
import { loadEditorPreferences } from '@/core/file-preferences'
import { translate, type TranslationKey, type TranslationParams } from '@/core/localization'
import { createBrowserFiles } from './browser-files'

const tr = (key: TranslationKey, params?: TranslationParams): string => translate(loadEditorPreferences().language, key, params)

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
  layout: { panelDocks: { color: 'left', palette: 'left', layers: 'bottom', freeTileInstances: 'bottom', history: 'right', reference: 'left', preview: 'right', tileset: 'right', brushes: 'right' }, panelVisibility: { color: true, palette: true, layers: true, freeTileInstances: false, history: true, reference: true, preview: true, tileset: false, brushes: false }, inspectorWidth: 300, leftDockWidth: 280, bottomDockHeight: 220, inspectorWidthRatio: 0.20833333333333334, leftDockWidthRatio: 0.19444444444444445, bottomDockHeightRatio: 0.275, toolRailSide: 'right', previewOpen: true, timelineHidden: false, inspectorLayout: '{"order":["palette","reference","color","layers","freeTileInstances","history","preview","tileset","brushes"],"squarePanels":["reference","color","preview"],"verticalWeights":{"color":330,"palette":280,"reference":280,"layers":560,"freeTileInstances":180,"history":220,"preview":300,"tileset":280,"brushes":240},"bottomWeights":{"color":280,"palette":280,"reference":280,"layers":720,"freeTileInstances":300,"history":320,"preview":280,"tileset":360,"brushes":320}}', colorSquareDock: null, colorSquareAnchor: null, floatingPanels: { color: null, palette: null, layers: null, freeTileInstances: null, history: null, reference: null, preview: null, tileset: null, brushes: null }, mainWindow: null },
  initialLayout: { panelDocks: { color: 'left', palette: 'left', layers: 'bottom', freeTileInstances: 'bottom', history: 'right', reference: 'left', preview: 'right', tileset: 'right', brushes: 'right' }, panelVisibility: { color: true, palette: true, layers: true, freeTileInstances: false, history: true, reference: true, preview: true, tileset: false, brushes: false }, inspectorWidth: 300, leftDockWidth: 280, bottomDockHeight: 220, inspectorWidthRatio: 0.20833333333333334, leftDockWidthRatio: 0.19444444444444445, bottomDockHeightRatio: 0.275, toolRailSide: 'right', previewOpen: true, timelineHidden: false, inspectorLayout: '{"order":["palette","reference","color","layers","freeTileInstances","history","preview","tileset","brushes"],"squarePanels":["reference","color","preview"],"verticalWeights":{"color":330,"palette":280,"reference":280,"layers":560,"freeTileInstances":180,"history":220,"preview":300,"tileset":280,"brushes":240},"bottomWeights":{"color":280,"palette":280,"reference":280,"layers":720,"freeTileInstances":300,"history":320,"preview":280,"tileset":360,"brushes":320}}', colorSquareDock: null, colorSquareAnchor: null, floatingPanels: { color: null, palette: null, layers: null, freeTileInstances: null, history: null, reference: null, preview: null, tileset: null, brushes: null }, mainWindow: null }
} as StoredWorkspace]])

browserWorkspaces.set('builtin-normal', {
  id: 'builtin-normal', name: tr('app.workspace.normal'), filePath: '', updatedAt: '', builtIn: true,
  layout: structuredClone(normalWorkspaceLayout) as WorkspaceLayout,
  initialLayout: structuredClone(normalWorkspaceLayout) as WorkspaceLayout
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

export const createBrowserApi = (): MoonSpriteApi => {
  const browserFiles = createBrowserFiles()
  return ({
  takeStartupFiles: async () => [],
  getDefaultFileDirectories: async () => ({ saveDirectory: 'gallery', exportDirectory: 'exports' }),
  chooseDirectory: async () => ({ canceled: true }),
  readProjectPreview: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  cacheProjectPreview: async () => {},
  openProjectBackupFolder: async () => {},
  listProjectBackups: async () => [],
  writeProjectIncremental: async () => { throw new Error(tr('platform.browser.writeUnsupported')) },
  writeClipboardImage: async () => {},
  readClipboardText: async () => null,
  readClipboardImage: async () => null,
  readClipboardImageSize: async () => null,
  sampleWindowColor: async () => null,
  sampleWindowColorRegion: async () => null,
  listPalettes: async () => ({ directoryPath: 'palettes', palettes: [...browserPalettes.values()].map(cloneStoredPalette) }),
  importPalette: async () => null,
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
  readUsageStatistics: async () => localStorage.getItem('moonsprite.usage-statistics'),
  writeUsageStatistics: async (json) => { localStorage.setItem('moonsprite.usage-statistics', json) },
  usageStatisticsPath: async () => '浏览器本地存储 (localStorage)',
  openUsageStatisticsFolder: async () => {},
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
  deleteLuaScript: async () => {},
  runLuaScript: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  dispatchLuaScriptDialog: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  closeLuaScriptSession: async () => {},
  listExtensions: async (): Promise<ExtensionListing> => ({ extensions: [] }),
  inspectExtensionPackage: async (): Promise<ExtensionPackagePreview> => { throw new Error(tr('platform.browser.readUnsupported')) },
  installExtension: async (): Promise<StoredExtension> => { throw new Error(tr('platform.browser.readUnsupported')) },
  chooseExtensionPackage: async (): Promise<string | null> => { throw new Error(tr('platform.browser.readUnsupported')) },
  setExtensionEnabled: async (): Promise<StoredExtension> => { throw new Error(tr('platform.browser.readUnsupported')) },
  uninstallExtension: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  openExtensionFolder: async () => {},
  readExtensionSettingsEntry: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  readExtensionRuntimeEntry: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  readExtensionRuntimeResource: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  showExtensionWindow: async () => { throw new Error(tr('platform.browser.readUnsupported')) },
  setExtensionWindowVisible: async () => {},
  closeExtensionWindows: async () => {},
  emitExtensionWindowMessage: async () => {},
  getResourceInfo: async () => ({ totalBytes: 8 * 1024 ** 3, freeBytes: 4 * 1024 ** 3 }),
  onRequestClose: () => () => {},
  cancelClose: () => {},
  approveClose: () => {},
  ...browserFiles,
  readBinary: async (filePath) => {
    const brush = [...browserBrushes.values()].find((item) => item.stored.filePath === filePath)
    if (brush) return brush.data.slice()
    const preset = [...browserBackgroundPresets.values()].find((item) => item.stored.filePath === filePath)
    return preset ? preset.data.slice() : browserFiles.readBinary(filePath)
  }
})
}

