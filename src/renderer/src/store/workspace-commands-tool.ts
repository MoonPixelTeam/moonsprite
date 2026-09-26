import type { BrushDitherSettings, GradientStop, ImageBrush, InkMode, LiquifyMode } from '@shared/types-brush'
import { createId } from '@/core/document-model'
import { isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import { createSelectionBrush, encodeBrushPng } from '@/core/brushes'
import { createProceduralBrush, isProceduralBrushId, normalizeProceduralBrushSettings } from '@/core/brushes'
import { publishBrushLibraryChanged } from '@/core/brush-library-events'
import { brushLibraryLocation } from '@/core/brush-library-location'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { defaultToolSettings } from '@/core/tool-preferences'
import { normalizeGapClosingThreshold } from '@/core/contiguous-region'
import { normalizeBrushDitherSettings } from '@/core/gradient-color'
import { defaultSymmetryCenter, moveSymmetryCenter, symmetryAxisSegment, type SymmetryMode } from '@/core/symmetry'
import { saveDocumentViewState } from '@/core/document-view-state'
import { normalizeProjectDisplaySettings } from '@/core/project-metadata'
import { documentPointFromViewportPointContinuous, viewportPointFromDocumentPointContinuous, viewportSegmentVisible } from '@/core/view-geometry'
import { brushPressureFromDynamics, migrateBrushPressureSettings, normalizeBrushPressureSettings, patchBrushDynamicsGradientDither, patchBrushDynamicsMapping } from '@/core/pressure'
import { encodeSelectionBackgroundPreset } from '@/core/background-preset-images'
import { applyBrushProfile, brushProfileFromSession, clearSelectionBrushPaintColors, copyCanvasToolSettings, isBrushTool, isToolAvailableForSession, persistToolSettings, rememberBrushProfile, touchMetadata } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceToolCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'

const brushDynamicsEnabled = (session: DocumentSession): boolean => Object.values(session.brushDynamics.effects).some((mapping) => mapping.sensor !== null)

const persistSymmetryCenter = (session: DocumentSession): void => {
  session.document.displaySettings = {
    ...normalizeProjectDisplaySettings(session.document.displaySettings),
    symmetryCenter: { ...session.symmetryCenter }
  }
  saveDocumentViewState(session.document, session.view, session.symmetryCenter)
}

const validSymmetryViewport = (session: DocumentSession): boolean =>
  session.viewportSize.width > 0 && session.viewportSize.height > 0

const symmetryCenterAtViewportCenter = (session: DocumentSession): typeof session.symmetryCenter => {
  if (!validSymmetryViewport(session)) return defaultSymmetryCenter(session.document.width, session.document.height)
  const position = loadEditorPreferences().rotationIndicatorPosition
  const point = documentPointFromViewportPointContinuous(
    { x: session.viewportSize.width / 2, y: session.viewportSize.height / 2 },
    session.viewportSize.width,
    session.viewportSize.height,
    session.document.width,
    session.document.height,
    session.view,
    position
  )
  return moveSymmetryCenter(session.symmetryCenter, 'center', point, session.document.width, session.document.height)
}

const symmetryAxisVisibleInViewport = (session: DocumentSession, axis: SymmetryMode): boolean => {
  if (!validSymmetryViewport(session)) return true
  const position = loadEditorPreferences().rotationIndicatorPosition
  const toViewport = (point: typeof session.symmetryCenter) => viewportPointFromDocumentPointContinuous(
    point,
    session.viewportSize.width,
    session.viewportSize.height,
    session.document.width,
    session.document.height,
    session.view,
    position
  )
  if (axis === 'rotational') {
    const center = toViewport(session.symmetryCenter)
    return center.x >= 0 && center.x <= session.viewportSize.width && center.y >= 0 && center.y <= session.viewportSize.height
  }
  const segment = symmetryAxisSegment(axis, session.document.width, session.document.height, session.symmetryCenter)
  return Boolean(segment && viewportSegmentVisible(
    toViewport(segment.start),
    toViewport(segment.end),
    session.viewportSize.width,
    session.viewportSize.height
  ))
}

const enableBrushDynamicsPreview = (): void => {
  const preferences = loadEditorPreferences()
  // If preview is explicitly disabled, full-edge is the least surprising
  // mode that also exposes the live dynamic outline while drawing.
  const nextBrushPreviewMode = preferences.brushPreviewMode === 'none' ? 'full-edge' : preferences.brushPreviewMode
  if (preferences.drawingBrushPreviewEnabled && nextBrushPreviewMode === preferences.brushPreviewMode) return
  saveEditorPreferences({
    ...preferences,
    drawingBrushPreviewEnabled: true,
    brushPreviewMode: nextBrushPreviewMode
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonsprite:preferences-changed'))
}

export function createWorkspaceToolCommands({ get, set }: WorkspaceCommandContext<'cancelTextBoxTransform' | 'commitFloatingPaste' | 'mutateActive' | 'setBrushImage' | 'setHistoryPosition' | 'setTemporaryBrush' | 'setTool'>): WorkspaceToolCommands {
  return {
    syncCanvasToolSettings(documentId) {
      const state = get()
      const source = activeSession(state)
      const target = state.sessions.find((session) => session.document.id === documentId)
      if (!source || !target || source === target) return
      copyCanvasToolSettings(source, target)
      target.uiRevision += 1
      set({ sessions: [...state.sessions] })
    },

    setTool(tool) {
      if (isCanvasToolGestureLocked()) return
      get().commitFloatingPaste()
      const current = activeSession(get())
      if (current && !isToolAvailableForSession(current, tool)) {
        const groupSelected = current.selectedGroupIds.length > 0 || Boolean(current.selectedGroupId)
        set({ message: tr(groupSelected && tool === 'fill' ? 'workspace.group.fillUnavailable' : 'workspace.text.convertToEditPixels') })
        return
      }
      if (current?.textBoxTransform && tool !== 'selection') get().cancelTextBoxTransform()
      get().mutateActive((session) => {
        if (session.tool === tool) return
        if (session.temporaryBrushCapture) {
          Object.assign(session, session.temporaryBrushCapture)
          session.temporaryBrushCapture = undefined
        }
        if (session.tool === 'liquify' && tool !== 'liquify') {
          session.liquifyGestureActive = false
          session.liquifyResetHistoryPosition = null
          session.liquifyResetHistoryRevision = null
        }
        if (isBrushTool(session.tool)) rememberBrushProfile(session)
        session.tool = tool
        if (tool !== 'selection') {
          session.selectionPropertiesActive = false
          session.selectionAspectRatio = null
          session.freeTransformActive = false
          session.freeTransformQuad = null
        }
        if (isBrushTool(tool)) applyBrushProfile(session, session.brushProfiles[tool])
      }, false)
    },

    setMoveKind(kind) { get().mutateActive((session) => { session.moveKind = kind }, false) },

    setBrushSize(size) {
      if (!Number.isFinite(size)) return
      const current = activeSession(get()), next = Math.max(1, Math.min(64, Math.round(size)))
      if (!current || current.brushSize === next || (current.tool !== 'smooth' && current.tool !== 'shape' && current.brushImage?.intrinsicSize)) return
      get().mutateActive((session) => { session.brushSize = next; rememberBrushProfile(session); persistToolSettings(session) }, false)
    },

    setBrushOpacity(opacity) { get().mutateActive((session) => { session.brushOpacity = Math.max(0, Math.min(100, Math.round(opacity))); rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setBrushAngle(angle) { get().mutateActive((session) => { session.brushAngle = Math.max(-180, Math.min(180, Math.round(angle))); rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setAirbrushParticleRadius(radius) { get().mutateActive((session) => { session.airbrushParticleRadius = Math.max(1, Math.min(16, Math.round(radius))); persistToolSettings(session) }, false) },

    setAirbrushParticleAngle(angle) { get().mutateActive((session) => { session.airbrushParticleAngle = Math.max(-180, Math.min(180, Math.round(angle))); persistToolSettings(session) }, false) },

    setAirbrushParticleShape(shape) { get().mutateActive((session) => { session.airbrushParticleShape = shape; persistToolSettings(session) }, false) },

    setAirbrushScatterRadius(radius) {
      if (!Number.isFinite(radius)) return
      const next = Math.max(1, Math.min(64, Math.round(radius)))
      if (activeSession(get())?.airbrushScatterRadius === next) return
      get().mutateActive((session) => { session.airbrushScatterRadius = next; persistToolSettings(session) }, false)
    },

    setAirbrushDensity(density) { get().mutateActive((session) => { session.airbrushDensity = Math.max(1, Math.min(128, Math.round(density))); persistToolSettings(session) }, false) },

    setAirbrushIntervalMs(intervalMs) { get().mutateActive((session) => { session.airbrushIntervalMs = Math.max(16, Math.min(1000, Math.round(intervalMs))); persistToolSettings(session) }, false) },

    setLiquifyMode(mode: LiquifyMode) { get().mutateActive((session) => { session.liquifyMode = mode; persistToolSettings(session) }, false) },

    setLiquifyRadius(radius) {
      if (!Number.isFinite(radius)) return
      const next = Math.max(1, Math.min(64, Math.round(radius)))
      if (activeSession(get())?.liquifyRadius === next) return
      get().mutateActive((session) => { session.liquifyRadius = next; persistToolSettings(session) }, false)
    },

    setLiquifyStrength(strength) { get().mutateActive((session) => { session.liquifyStrength = Math.max(1, Math.min(100, Math.round(strength))); persistToolSettings(session) }, false) },

    setLiquifySmoothing(enabled) { get().mutateActive((session) => { session.liquifySmoothing = enabled; persistToolSettings(session) }, false) },

    setLiquifySmoothingStrength(strength) { if (!Number.isFinite(strength)) return; get().mutateActive((session) => { session.liquifySmoothingStrength = Math.max(0, Math.min(100, Math.round(strength))); persistToolSettings(session) }, false) },

    setSmoothStrength(strength) { if (!Number.isFinite(strength)) return; get().mutateActive((session) => { session.smoothStrength = Math.max(0, Math.min(100, Math.round(strength))); persistToolSettings(session) }, false) },

    setLiquifyGestureActive(active) { get().mutateActive((session) => { session.liquifyGestureActive = active }, false) },

    setLiquifyResetHistoryPosition(position, revision) { get().mutateActive((session) => { session.liquifyResetHistoryPosition = position; session.liquifyResetHistoryRevision = revision }, false) },

    resetLiquify() {
      const session = activeSession(get())
      if (!session || session.tool !== 'liquify' || session.liquifyResetHistoryPosition == null) return false
      const position = session.liquifyResetHistoryPosition
      if (session.history.position <= position) return false
      get().setHistoryPosition(position)
      get().mutateActive((current) => {
        current.liquifyResetHistoryPosition = current.history.position
        current.liquifyResetHistoryRevision = current.history.revision
      }, false)
      return true
    },

    setBrushShape(shape) { get().mutateActive((session) => { session.brushShape = shape; rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setBrushDither(settings: BrushDitherSettings) { get().mutateActive((session) => { session.brushDither = normalizeBrushDitherSettings(settings, session.brushDither ?? defaultToolSettings.brushDither); rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setBrushTexture(texture) { get().mutateActive((session) => { session.brushTexture = texture; rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setBrushTextureScale(scale) { get().mutateActive((session) => { session.brushTextureScale = Math.max(1, Math.min(16, Math.round(scale))); rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setBrushPaintMode(mode) { get().mutateActive((session) => { session.brushPaintMode = mode; rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setInkMode(mode: InkMode) { get().mutateActive((session) => { session.inkMode = mode; if (session.syncInkAcrossTools) for (const tool of Object.keys(session.brushProfiles) as Array<keyof typeof session.brushProfiles>) session.brushProfiles[tool].inkMode = mode; else rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setSyncInkAcrossTools(enabled: boolean) { get().mutateActive((session) => { session.syncInkAcrossTools = enabled; if (enabled) for (const tool of Object.keys(session.brushProfiles) as Array<keyof typeof session.brushProfiles>) session.brushProfiles[tool].inkMode = session.inkMode; persistToolSettings(session) }, false) },

    setBrushDynamicsMapping(effect, patch) {
      let shouldEnableBrushPreview = false
      get().mutateActive((session) => {
        if (session.tool !== 'pencil' && session.tool !== 'eraser') return
        const wasEnabled = brushDynamicsEnabled(session)
        session.brushDynamics = patchBrushDynamicsMapping(session.brushDynamics, effect, patch)
        session.brushPressure = brushPressureFromDynamics(session.brushDynamics)
        shouldEnableBrushPreview = !wasEnabled && brushDynamicsEnabled(session)
        rememberBrushProfile(session)
        persistToolSettings(session)
      }, false)
      if (shouldEnableBrushPreview) enableBrushDynamicsPreview()
    },

    setBrushDynamicsGradientDither(dither) {
      get().mutateActive((session) => {
        if (session.tool !== 'pencil' && session.tool !== 'eraser') return
        session.brushDynamics = patchBrushDynamicsGradientDither(session.brushDynamics, dither)
        rememberBrushProfile(session)
        persistToolSettings(session)
      }, false)
    },

    setBrushPressure(settings) {
      let shouldEnableBrushPreview = false
      get().mutateActive((session) => {
        if (session.tool !== 'pencil' && session.tool !== 'eraser') return
        const wasEnabled = brushDynamicsEnabled(session)
        session.brushPressure = normalizeBrushPressureSettings(settings, session.brushPressure)
        session.brushDynamics = migrateBrushPressureSettings(session.brushPressure)
        shouldEnableBrushPreview = !wasEnabled && brushDynamicsEnabled(session)
        rememberBrushProfile(session)
        persistToolSettings(session)
      }, false)
      if (shouldEnableBrushPreview) enableBrushDynamicsPreview()
    },

    setBrushImage(brush) {
      get().mutateActive((session) => {
        if (brush && !isProceduralBrushId(brush.id) && !session.patternBrushReturnProfile) {
          session.patternBrushReturnProfile = session.tool === 'pencil' ? brushProfileFromSession(session) : { ...session.brushProfiles.pencil }
        }
        session.brushImage = brush && isProceduralBrushId(brush.id)
          ? createProceduralBrush(brush.id, session.proceduralBrushSettings[brush.id])
          : clearSelectionBrushPaintColors(brush)
        session.brushImageId = brush?.id ?? null
        session.brushImageTemporary = false
        rememberBrushProfile(session)
        persistToolSettings(session)
      }, false)
    },

    beginTemporaryBrushCapture() {
      if (isCanvasToolGestureLocked()) return
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        if (session.temporaryBrushCapture || !isToolAvailableForSession(session, 'pencil')) return
        session.patternBrushReturnProfile ??= session.tool === 'pencil' ? brushProfileFromSession(session) : { ...session.brushProfiles.pencil }
        session.temporaryBrushCapture = { selectionKind: session.selectionKind, selectionMode: session.selectionMode, selectionRounded: session.selectionRounded, selectionAspectRatio: session.selectionAspectRatio ?? null }
        session.tool = 'selection'
        session.selectionKind = 'rectangle'
        session.selectionMode = 'replace'
        session.selectionRounded = false
        session.selectionAspectRatio = null
      }, false)
    },

    finishTemporaryBrushCapture(selection) {
      const current = activeSession(get())
      if (!current?.temporaryBrushCapture) return
      try {
        const brush = createSelectionBrush(current.document, selection, `temporary-brush-${createId('brush')}`, tr('brush.defaultName'))
        if (!brush) { set({ message: tr('workspace.brushEmpty') }); return }
        get().mutateActive((session) => {
          Object.assign(session, session.temporaryBrushCapture)
          session.temporaryBrushCapture = undefined
          applyBrushProfile(session, session.patternBrushReturnProfile ?? session.brushProfiles.pencil)
          session.brushImage = brush
          session.brushImageId = brush.id
          session.brushImageTemporary = true
          session.brushPaintMode = 'paint'
          session.tool = 'pencil'
          session.brushProfiles.pencil = brushProfileFromSession(session)
        }, false)
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('brush.saveError') })
      }
    },

    exitPatternBrush() {
      if (isCanvasToolGestureLocked()) return
      get().mutateActive((session) => {
        if (!session.temporaryBrushCapture && !session.brushImage) return
        if (session.temporaryBrushCapture) Object.assign(session, session.temporaryBrushCapture)
        session.temporaryBrushCapture = undefined
        session.tool = 'pencil'
        applyBrushProfile(session, session.patternBrushReturnProfile ?? { ...session.brushProfiles.pencil, brushImage: null, brushImageId: null, brushImageTemporary: false })
        session.patternBrushReturnProfile = undefined
        rememberBrushProfile(session)
        persistToolSettings(session)
      }, false)
    },

    setTemporaryBrush(brush) {
      if (isCanvasToolGestureLocked()) return
      get().mutateActive((session) => {
        session.patternBrushReturnProfile ??= session.tool === 'pencil' ? brushProfileFromSession(session) : { ...session.brushProfiles.pencil }
        session.brushImage = { ...brush, colors: brush.colors?.slice(), paintColors: undefined }
        session.brushImageId = brush.id
        session.brushImageTemporary = true
        session.brushPaintMode = 'paint'
        session.selection = null
        session.selectionPivot = null
        session.tool = 'pencil'
        session.brushProfiles.pencil = brushProfileFromSession(session)
      }, false)
    },

    deleteProjectBrush(id) {
      get().mutateActive((session) => {
        const before = session.document.customBrushes ?? []
        if (!before.some((brush) => brush.id === id)) return
        session.document.customBrushes = before.filter((brush) => brush.id !== id)
        if (session.brushImageId === id) {
          session.brushImageId = null
          session.brushImage = null
        }
        rememberBrushProfile(session)
      })
    },

    async createBrushFromSelection() {
      get().commitFloatingPaste()
      const session = activeSession(get())
      if (!session?.selection) { set({ message: tr('workspace.selectionRequired') }); return }
      const documentId = session.document.id
      let brush: ImageBrush | null
      try {
        brush = createSelectionBrush(session.document, session.selection, `temporary-brush-${createId('brush')}`, tr('brush.defaultName'))
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('brush.saveError') })
        return
      }
      if (!brush) { set({ message: tr('workspace.brushEmpty') }); return }
      try {
        const stored = await window.moonSprite.saveBrush(brush.name, encodeBrushPng(brush), true, brush.sourceX, brush.sourceY, brushLibraryLocation.getSnapshot())
        publishBrushLibraryChanged()
        if (get().activeId === documentId) {
          get().setTemporaryBrush(brush)
          get().setBrushImage({ ...brush, id: stored.id, name: stored.name, intrinsicSize: true })
        }
        set({ message: tr('workspace.brushSaved') })
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('brush.saveError') })
      }
    },

    async createBackgroundPresetFromSelection() {
      get().commitFloatingPaste()
      const session = activeSession(get())
      if (!session?.selection) { set({ message: tr('workspace.selectionRequired') }); return }
      let data: Uint8Array | null
      try {
        data = encodeSelectionBackgroundPreset(session.document, session.selection)
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.backgroundPresetSaveError') })
        return
      }
      if (!data) { set({ message: tr('workspace.backgroundPresetEmpty') }); return }
      try {
        await window.moonSprite.saveBackgroundPreset(tr('backgroundPreset.selectionName'), data)
        set({ message: tr('workspace.backgroundPresetSaved') })
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.backgroundPresetSaveError') })
      }
    },

    setBrushImageSettings(settings) {
      get().mutateActive((session) => {
        const next = { ...session.brushImageSettings, ...settings }
        next.threshold = Math.max(0, Math.min(255, Math.round(next.threshold)))
        next.blackPoint = Math.max(0, Math.min(254, Math.round(next.blackPoint)))
        next.whitePoint = Math.max(next.blackPoint + 1, Math.min(255, Math.round(next.whitePoint)))
        session.brushImageSettings = next
        rememberBrushProfile(session)
        persistToolSettings(session)
      }, false)
    },

    setProceduralBrushSettings(settings) {
      get().mutateActive((session) => {
        const brushId = session.brushImage?.id
        if (!brushId || !isProceduralBrushId(brushId)) return
        const next = normalizeProceduralBrushSettings(brushId, { ...session.proceduralBrushSettings[brushId], ...settings })
        session.proceduralBrushSettings = { ...session.proceduralBrushSettings, [brushId]: next }
        session.brushImage = createProceduralBrush(brushId, next)
        rememberBrushProfile(session)
        persistToolSettings(session)
      }, false)
    },

    setProceduralAntialias(enabled) { get().mutateActive((session) => { session.proceduralAntialias = enabled; rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setProceduralAntialiasStrength(strength) { get().mutateActive((session) => { session.proceduralAntialiasStrength = Math.max(1, Math.min(100, Math.round(strength))); rememberBrushProfile(session); persistToolSettings(session) }, false) },

    setShapeKind(kind) { get().mutateActive((session) => { session.shapeKind = kind; persistToolSettings(session) }, false) },

    setLineKind(kind) { get().mutateActive((session) => { session.lineKind = kind; persistToolSettings(session) }, false) },

    setCurveAnchorCount(count) { get().mutateActive((session) => { session.curveAnchorCount = Math.max(1, Math.min(8, Math.round(count) || 1)); persistToolSettings(session) }, false) },

    setShapeRatio(ratio) {
      get().mutateActive((session) => {
        session.shapeRatio = ratio === null ? null : {
          width: Math.round(Math.max(0.1, Math.min(100, ratio.width)) * 10) / 10,
          height: Math.round(Math.max(0.1, Math.min(100, ratio.height)) * 10) / 10
        }
        persistToolSettings(session)
      }, false)
    },

    setDrawingAnchor(point) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
      get().mutateActive((session) => {
        session.drawingAnchor = { x: Math.round(point.x * 2) / 2 / session.document.width, y: Math.round(point.y * 2) / 2 / session.document.height }
        persistToolSettings(session)
      }, false)
    },
    setDrawingAnchorVisible(visible) { get().mutateActive((session) => { session.drawingAnchorVisible = visible; persistToolSettings(session) }, false) },
    setDrawFromCanvasCenter(enabled) { get().mutateActive((session) => { session.drawFromCanvasCenter = enabled; persistToolSettings(session) }, false) },

    setShapeRounded(enabled) { get().mutateActive((session) => { session.shapeRounded = enabled; persistToolSettings(session) }, false) },

    setShapeCornerRadius(radius) { get().mutateActive((session) => { session.shapeCornerRadius = Math.max(0, Math.min(256, Math.round(radius) || 0)); persistToolSettings(session) }, false) },

    setFillMode(mode) {
      get().mutateActive((session) => {
        session.fillMode = mode === 'contiguous' && session.fillMode === 'contiguous' ? 'global' : mode
        persistToolSettings(session)
      }, false)
    },

    setFillKind(kind) { get().mutateActive((session) => { session.fillKind = kind; persistToolSettings(session) }, false) },

    setFillTolerance(tolerance) { get().mutateActive((session) => { session.fillTolerance = Math.max(0, Math.min(255, Math.round(tolerance) || 0)); persistToolSettings(session) }, false) },

    setFillGapClosing(enabled) { get().mutateActive((session) => { session.fillGapClosing = enabled; persistToolSettings(session) }, false) },

    setFillGapThreshold(threshold) { get().mutateActive((session) => { session.fillGapThreshold = normalizeGapClosingThreshold(threshold); persistToolSettings(session) }, false) },

    setFillReference(reference) { get().mutateActive((session) => { session.fillReference = reference; persistToolSettings(session) }, false) },

    setFillConnectivity(connectivity) { get().mutateActive((session) => { session.fillConnectivity = connectivity; persistToolSettings(session) }, false) },

    setGradientTolerance(tolerance) { get().mutateActive((session) => { session.gradientTolerance = Math.max(0, Math.min(255, Math.round(tolerance) || 0)); persistToolSettings(session) }, false) },

    setGradientContiguous(contiguous) { get().mutateActive((session) => { session.gradientContiguous = contiguous; persistToolSettings(session) }, false) },

    setGradientType(type) { get().mutateActive((session) => { session.gradientType = type; persistToolSettings(session) }, false) },

    setGradientDither(dither) { get().mutateActive((session) => { session.gradientDither = dither; persistToolSettings(session) }, false) },

    setGradientFreeform(enabled) { get().mutateActive((session) => { session.gradientFreeform = enabled; if (session.gradientFreeform) session.gradientStops = [{ position: 0, color: { ...session.primaryColor } }, { position: 1, color: { ...session.secondaryColor } }]; persistToolSettings(session) }, false) },

    setGradientStops(stops: GradientStop[]) { get().mutateActive((session) => { session.gradientStops = stops.map((stop) => ({ position: Math.max(0, Math.min(1, stop.position)), color: { ...stop.color } })); persistToolSettings(session) }, false) },

    setMoveAutoSelect(enabled) { get().mutateActive((session) => { session.moveAutoSelect = enabled; persistToolSettings(session) }, false) },

    setPerfectPixels(enabled) { get().mutateActive((session) => { session.perfectPixels = enabled; persistToolSettings(session) }, false) },

    setSymmetryAxis(axis, enabled) {
      get().mutateActive((session) => {
        const initialized = session.symmetryAxesInitialized ?? {
          horizontal: Boolean(session.symmetryAxes.horizontal),
          vertical: Boolean(session.symmetryAxes.vertical),
          diagonalUp: Boolean(session.symmetryAxes.diagonalUp),
          diagonalDown: Boolean(session.symmetryAxes.diagonalDown),
          rotational: Boolean(session.symmetryAxes.rotational)
        }
        const turningOn = enabled && !session.symmetryAxes[axis]
        const firstUse = !Object.values(initialized).some(Boolean)
        if (turningOn && (firstUse || !symmetryAxisVisibleInViewport(session, axis))) {
          const nextCenter = symmetryCenterAtViewportCenter(session)
          if (nextCenter.x !== session.symmetryCenter.x || nextCenter.y !== session.symmetryCenter.y) {
            session.symmetryCenter = nextCenter
            persistSymmetryCenter(session)
            touchMetadata(session)
          }
        }
        session.symmetryAxesInitialized = { ...initialized, [axis]: initialized[axis] || enabled }
        session.symmetryAxes = { ...session.symmetryAxes, [axis]: enabled }
        persistToolSettings(session)
      }, false)
    },

    // Dragging updates this transient value at pointer-event frequency. Do not
    // touch project metadata until the gesture is committed on pointerup.
    previewSymmetryCenter(center) { get().mutateActive((session) => { session.symmetryCenter = { ...center } }, false) },
    setSymmetryCenter(center) { get().mutateActive((session) => { session.symmetryCenter = { ...center }; persistSymmetryCenter(session) }, 'metadata') },

    resetSymmetryCenter() { get().mutateActive((session) => { session.symmetryCenter = defaultSymmetryCenter(session.document.width, session.document.height); persistSymmetryCenter(session) }, 'metadata') },

    setLastPencilPoint(point) { get().mutateActive((session) => { session.lastPencilPoint = point ? { ...point } : null }, false) },

    setLastEraserPoint(point) { get().mutateActive((session) => { session.lastEraserPoint = point ? { ...point } : null }, false) }
  }
}
