import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './components/I18nProvider'
import { PerformanceProfiler } from './components/PerformanceProfiler'
import { loadEditorPreferences } from './core/file-preferences'
import { warmDocumentDecodeWorker } from './core/document-files'
import { preloadCanvasStage } from './components/app/EditorCanvasHost'
import { applyThemeToDocument } from './core/theme'
import { translate } from './core/localization'
import { installTauriApi } from './platform/tauri-api'
import { applyCursorPreferences } from './platform/cursor-theme'
import { applyToolIconScale, applyUiScale } from './platform/ui-scale'
import { loadTextFontCatalog } from './platform/font-service'
import { showAppWindow } from './platform/app-window'
import { installRuntimeDiagnostics } from './platform/runtime-diagnostics'
import type { RuntimeDiagnosticDetail } from './core/runtime-diagnostics'
import { runtimeRasterResidentBytes } from './core/runtime-raster'
import { useWorkspace } from './store/workspace'

const rootElement = document.getElementById('root')

if (!rootElement) throw new Error('MoonSprite root element is missing.')

const startupPreferences = loadEditorPreferences()
applyThemeToDocument(startupPreferences.theme)
document.documentElement.dataset.uiMotion = startupPreferences.uiMotionLevel
applyToolIconScale(startupPreferences.toolIconScale)
void applyCursorPreferences(startupPreferences.useLocalCursors, startupPreferences.cursorScale).catch(() => undefined)

void installTauriApi()
  .then(async () => {
    await applyUiScale(startupPreferences.uiScale).catch(() => undefined)
    installRuntimeDiagnostics((): RuntimeDiagnosticDetail => {
      const state = useWorkspace.getState()
      const session = state.sessions.find((item) => item.document.id === state.activeId) ?? null
      if (!session) return { activeDocument: false, sessionCount: state.sessions.length }
      const document = session.document
      return {
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
        dirty: document.dirty
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
