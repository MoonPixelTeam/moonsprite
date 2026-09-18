import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './components/I18nProvider'
import { PerformanceProfiler } from './components/PerformanceProfiler'
import { loadEditorPreferences, LOCAL_HISTORY_ENABLED_PREFERENCE_KEY, PROJECT_BACKUP_ENABLED_PREFERENCE_KEY, RECOVERY_PREFERENCE_KEY } from './core/file-preferences'
import { readStoredString } from './core/storage'
import { warmDocumentDecodeWorker } from './core/document-files'
import { preloadCanvasStage } from './components/app/EditorCanvasHost'
import { applyThemeToDocument } from './core/theme'
import { translate } from './core/localization'
import { installTauriApi } from './platform/tauri-api'
import { applyCursorPreferences } from './platform/cursor-theme'
import { installCursorSemantics } from './platform/cursor-semantics'
import { applyBodyFontScale, applyToolIconScale, applyUiScale } from './platform/ui-scale'
import { loadTextFontCatalog } from './platform/font-service'
import { showAppWindow } from './platform/app-window'
import { installRuntimeDiagnostics } from './platform/runtime-diagnostics'
import { installExportSuccessSound } from './platform/export-success-sound'
import type { RuntimeDiagnosticDetail } from './core/runtime-diagnostics'
import { documentDiagnosticDetail } from './core/document-diagnostics'
import { runtimeRasterResidentBytes } from './core/runtime-raster'
import { useWorkspace } from './store/workspace'
import { NativeTooltipBridge } from './components/Tooltip'
import { ExtensionWindow } from './components/extensions/ExtensionWindow'

const rootElement = document.getElementById('root')

if (!rootElement) throw new Error('MoonSprite root element is missing.')

const extensionWindow = new URLSearchParams(window.location.search).has('extensionWindow')
if (extensionWindow) {
  for (const element of [document.documentElement, document.body, rootElement]) {
    element.style.setProperty('background', 'transparent', 'important')
  }
}
const startupPreferences = loadEditorPreferences()
const disposeCursorSemantics = installCursorSemantics()
import.meta.hot?.dispose(disposeCursorSemantics)
applyThemeToDocument(startupPreferences.theme)
document.documentElement.dataset.uiMotion = startupPreferences.uiMotionLevel
if (extensionWindow) document.documentElement.dataset.extensionWindow = 'true'
applyToolIconScale(startupPreferences.toolIconScale)
applyBodyFontScale(startupPreferences.bodyFontScale)
void applyCursorPreferences(startupPreferences.useLocalCursors, startupPreferences.cursorScale).catch(() => undefined)

void installTauriApi()
  .then(async () => {
    if (extensionWindow) {
      createRoot(rootElement).render(<ExtensionWindow />)
      return
    }
    await applyUiScale(startupPreferences.uiScale).catch(() => undefined)
    installExportSuccessSound()
    installRuntimeDiagnostics((): RuntimeDiagnosticDetail => {
      const state = useWorkspace.getState()
      const session = state.sessions.find((item) => item.document.id === state.activeId) ?? null
      if (!session) return { activeDocument: false, sessionCount: state.sessions.length }
      const document = session.document
      return {
        ...documentDiagnosticDetail(document),
        activeDocument: true,
        sessionCount: state.sessions.length,
        canvasWidth: document.width,
        canvasHeight: document.height,
        layerCount: document.layers.length,
        groupCount: document.groups.length,
        frameCount: document.animation?.frames.length ?? 1,
        residentRasterBytes: runtimeRasterResidentBytes(document),
        tool: session.tool,
        zoom: session.view.zoom,
        dirty: document.dirty,
        historyBytes: session.history.memoryBytes,
        historyEntries: session.history.length,
        contentRevision: session.contentRevision,
        editingMaskId: session.activeLayerMaskId,
        backgroundWrites: `autosave:${readStoredString(RECOVERY_PREFERENCE_KEY) !== 'false'},history:${readStoredString(LOCAL_HISTORY_ENABLED_PREFERENCE_KEY) === 'true'},backup:${readStoredString(PROJECT_BACKUP_ENABLED_PREFERENCE_KEY) !== 'false'}`
      }
    })
    void loadTextFontCatalog().catch(() => undefined)
    if (__MOONSPRITE_PERFORMANCE_BUILD__ && new URLSearchParams(window.location.search).has('moonsprite-perf')) {
      const { installPerformanceHarness } = await import('./performance/benchmark-harness')
      installPerformanceHarness()
    }
    createRoot(rootElement).render(
      <I18nProvider>
        <PerformanceProfiler id="MoonSprite">
          <App />
          <NativeTooltipBridge />
        </PerformanceProfiler>
      </I18nProvider>
    )
    const warmEditor = (): void => {
      warmDocumentDecodeWorker()
      preloadCanvasStage()
    }
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warmEditor, { timeout: 500 })
    else window.setTimeout(warmEditor, 0)
  })
  .catch((error: unknown) => {
    console.error('MoonSprite failed to initialize.', error)
    rootElement.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:var(--ui-space-5);color:var(--theme-text-primary);background:var(--theme-workspace-background);font:var(--ui-font-regular)/var(--ui-line-regular) sans-serif;text-align:center'
    rootElement.textContent = translate(loadEditorPreferences().language, 'startup.failed')
    void showAppWindow().catch(() => undefined)
  })
