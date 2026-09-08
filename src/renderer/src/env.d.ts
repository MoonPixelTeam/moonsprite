import type { FillKind, MoonSpriteApi, ShapeKind, ToolId, ViewState } from '@shared/types'

declare global {
  const __MOONSPRITE_PERFORMANCE_BUILD__: boolean
  const __MOONSPRITE_REACT_PROFILE__: boolean

  interface Window {
    moonSprite: MoonSpriteApi
    __TAURI_INTERNALS__?: unknown
    __moonSpriteCanvasProbe?: {
      recordDraw(duration: number): void
      recordInput?(kind: 'pointer-down' | 'pointer-move' | 'pointer-up', duration: number): void
      recordReactCommit?(region: string, duration: number, phase: 'mount' | 'update' | 'nested-update'): void
      recordOperationStage?(stage: string, duration: number, detail?: Record<string, number | string | boolean>): void
    }
    __moonSpritePerformanceHarness?: {
      createSimpleDocument(size: number): Promise<{ uniquePixelBytes: number; layerCount: number; frameCount: number }>
      createComplexDocument(size: number): Promise<{ uniquePixelBytes: number; layerCount: number; frameCount: number }>
      createLargeDocument(size: number): Promise<{ uniquePixelBytes: number; layerCount: number; frameCount: number }>
      activeView(): ViewState | null
      resetScenario(view: ViewState): void
      prepareTool(tool: ToolId, fillKind?: FillKind | null, shapeKind?: ShapeKind | null): void
      setBrushSize(size: number): void
      prepareMagicWand(): void
      prepareCenteredSelection(size: number): void
      prepareActiveLayerStyle(shadowBlur: number, innerGlowSize: number): void
      previewActiveLayerStyleSize(effect: 'shadow' | 'innerGlow', size: number): void
      toggleActiveLayerVisibility(): void
      toggleActiveLayerGroupVisibility(): void
      previewActiveLayerOpacity(opacity: number): void
      reorderActiveLayer(): void
      setMoveAutoSelect(enabled: boolean): void
      setTimelapseRecording(enabled: boolean): void
      timelapseSnapshotCount(): number
      undoRedo(count: number): Promise<number>
      playAnimation(): Promise<number>
      setAnimationPlaying(playing: boolean): void
    }
  }
}

export {}
