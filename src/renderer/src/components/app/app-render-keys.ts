import type { DocumentSession } from '@/store/workspace-types'

interface DocumentTabsState {
  activeId: string | null
  sessions: Array<Pick<DocumentSession, 'document'>>
}

interface AppCoordinatorState {
  activeId: string | null
  sessions: DocumentSession[]
  dialog: {
    title: string
    message: string
    detail?: string
    choices: Array<{ id: string; label: string; tone?: string }>
  } | null
  saveProgress: { title: string; value: number; label: string } | null
}

const colorKey = (color: DocumentSession['primaryColor']): string =>
  `${color.r},${color.g},${color.b},${color.a}`

export const documentTabsRenderKey = (state: DocumentTabsState): string => [
  state.activeId ?? '',
  state.sessions.map((session) => `${session.document.id}:${session.document.name}:${session.document.dirty ? 1 : 0}`).join('|')
].join(';')

export const appCoordinatorRenderKey = (state: AppCoordinatorState): string => {
  const session = state.sessions.find((item) => item.document.id === state.activeId)
  const preview = session?.canvasResizePreview
  // The coordinator owns low-frequency surfaces such as persistent script dialogs.
  // Keep their target identity in the key without subscribing to pixel revisions.
  const layerStructure = session?.document.layers
    .map((layer) => `${layer.id}:${layer.kind ?? 'raster'}`)
    .join(',') ?? ''
  return [
    state.activeId ?? '',
    state.sessions.map((item) => item.document.id).join(','),
    session?.document.activeLayerId ?? '',
    session?.document.animation?.activeFrameId ?? '',
    layerStructure,
    session?.document.width ?? 0,
    session?.document.height ?? 0,
    session?.tool ?? '',
    session?.selectionKind ?? '',
    session?.shapeKind ?? '',
    session?.lineKind ?? 'line',
    session?.fillKind ?? 'bucket',
    session?.view.showPixelGrid ? 1 : 0,
    session?.view.showGrid ? 1 : 0,
    session?.view.isoViewEnabled ? 1 : 0,
    session?.view.tileRepeatMode ?? 'off',
    session?.view.grid ? `${session.view.grid.x}:${session.view.grid.y}:${session.view.grid.width}:${session.view.grid.height}` : '',
    session?.view.relativeLuminance ? 1 : 0,
    session?.view.showSelectionOutline === false ? 0 : 1,
    session?.view.showSelectionPivot === false ? 0 : 1,
    preview ? `${preview.width}:${preview.height}:${preview.offsetX}:${preview.offsetY}` : '',
    state.saveProgress ? `${state.saveProgress.title}:${state.saveProgress.value}:${state.saveProgress.label}` : '',
    state.dialog ? `${state.dialog.title}:${state.dialog.message}:${state.dialog.detail ?? ''}:${state.dialog.choices.map((choice) => `${choice.id}:${choice.label}:${choice.tone ?? ''}`).join('|')}` : ''
  ].join(';')
}

export const toolRailRenderKey = (session: DocumentSession | null): string => session
  ? `${session.document.id}:${session.tool}:${session.moveKind}:${session.selectionKind}:${session.shapeKind}:${session.lineKind}:${session.fillKind ?? 'bucket'}:${session.activeLayerMaskId ?? ''}:${session.selectedGroupIds.join(',')}:${session.selectedLayerIds.filter((id) => session.document.layers.some((layer) => layer.id === id && layer.kind)).join(',')}:${session.tilemapMode}`
  : ''

export const appMenuRenderKey = (session: DocumentSession | null): string => session
  ? [
      session.document.id,
      session.document.colorMode,
      session.document.layers.length,
      session.document.filePath ?? '',
      session.document.sourceFilePath ?? '',
      session.history.canUndo ? 1 : 0,
      session.history.canRedo ? 1 : 0,
      session.selection ? 1 : 0,
      session.selectedGroupId ?? '',
      session.selectedGroupIds.join(','),
      session.selectedLayerIds.join(','),
      session.view.showPixelGrid ? 1 : 0,
      session.view.showGrid ? 1 : 0,
      session.view.isoViewEnabled ? 1 : 0,
      session.view.tileRepeatMode ?? 'off',
      session.view.grid ? `${session.view.grid.x}:${session.view.grid.y}:${session.view.grid.width}:${session.view.grid.height}` : '',
      session.view.relativeLuminance ? 1 : 0,
      session.view.showSelectionOutline === false ? 0 : 1,
      session.view.mirrored ? 1 : 0,
      session.view.mirroredVertical ? 1 : 0
    ].join(';')
  : ''

export const toolOptionsRenderKey = (session: DocumentSession | null): string => {
  if (!session) return ''
  const imageSettings = session.brushImageSettings
  const brush = session.brushImage
  const proceduralSettings = brush && brush.id in session.proceduralBrushSettings
    ? session.proceduralBrushSettings[brush.id as keyof typeof session.proceduralBrushSettings]
    : null
  return [
    session.document.id,
    session.tool,
    session.brushSize,
    session.brushShape,
    session.brushDither?.enabled ? 1 : 0,
    session.brushDither?.template ?? 'bayer-4',
    session.brushDither?.stage ?? 8,
    session.brushTexture,
    session.brushTextureScale,
    session.brushPaintMode,
    session.brushImageId ?? '',
    brush ? `${brush.id}:${brush.name}:${brush.width}:${brush.height}:${brush.intrinsicSize ? 1 : 0}` : '',
    session.brushImageTemporary ? 1 : 0,
    `${imageSettings.mode}:${imageSettings.blackPoint}:${imageSettings.whitePoint}:${imageSettings.threshold}:${imageSettings.invert ? 1 : 0}`,
    proceduralSettings ? `${proceduralSettings.scale}:${proceduralSettings.detail}:${proceduralSettings.variation}:${proceduralSettings.angle}:${proceduralSettings.seed}` : '',
    session.proceduralAntialias ? 1 : 0,
    session.proceduralAntialiasStrength,
    session.brushDynamics.version,
    session.brushDynamics.gradientDither,
    ...(['size', 'strength', 'gradient', 'angle'] as const).flatMap((effect) => {
      const mapping = session.brushDynamics.effects[effect]
      return [mapping.sensor ?? '', mapping.outputMin, mapping.outputMax, mapping.inputMin, mapping.inputMax, mapping.curve, mapping.direction]
    }),
    session.brushPressure.enabled ? 1 : 0,
    session.brushPressure.affectsSize ? 1 : 0,
    session.brushPressure.affectsOpacity ? 1 : 0,
    session.brushPressure.minSizePercent,
    session.brushPressure.minOpacityPercent,
    session.brushPressure.curve,
    session.shapeKind,
    session.lineKind,
    session.curveAnchorCount,
    session.shapeRatio?.width ?? '',
    session.shapeRatio?.height ?? '',
    session.shapeRounded ? 1 : 0,
    session.shapeCornerRadius,
    session.fillMode,
    session.fillKind ?? 'bucket',
    session.fillTolerance,
    session.fillGapClosing ? 1 : 0,
    session.fillGapThreshold,
    session.gradientTolerance,
    session.gradientContiguous ? 1 : 0,
    session.gradientType ?? 'linear',
    session.gradientDither ?? 'none',
    session.gradientFreeform ? 1 : 0,
    (session.gradientStops ?? []).map((stop) => `${stop.position}:${stop.color.r},${stop.color.g},${stop.color.b},${stop.color.a}`).join('|'),
    session.moveAutoSelect ? 1 : 0,
    session.moveKind,
    session.selectedSliceId ?? '',
    (session.selectedSliceIds ?? []).join(','),
    (session.document.slices ?? []).map((slice) => `${slice.id}:${slice.name}:${slice.x}:${slice.y}:${slice.width}:${slice.height}`).join('|'),
    session.selectionKind,
    session.selectionMode,
    session.selectionRounded ? 1 : 0,
    session.selectionCornerRadius,
    session.selectionPropertiesActive ? 1 : 0,
    session.selectionAngle ?? 0,
    session.selection ? `${session.selection.x}:${session.selection.y}:${session.selection.width}:${session.selection.height}` : '',
    session.selectionPivot ? `${session.selectionPivot.x}:${session.selectionPivot.y}` : '',
    session.pendingPaste?.transformTarget ? `${session.pendingPaste.transformTarget.x}:${session.pendingPaste.transformTarget.y}:${session.pendingPaste.transformTarget.width}:${session.pendingPaste.transformTarget.height}` : '',
    session.pendingPaste?.transformAngle ?? 0,
    session.pendingPaste?.transformShear ? `${session.pendingPaste.transformShear.axis}:${session.pendingPaste.transformShear.edge}:${session.pendingPaste.transformShear.amount}` : '',
    session.view.showSelectionPivot === false ? 0 : 1,
    session.wandTolerance,
    session.wandContiguous ? 1 : 0,
    session.wandGapClosing ? 1 : 0,
    session.wandGapThreshold,
    session.perfectPixels ? 1 : 0,
    session.airbrushParticleRadius,
    session.airbrushParticleShape,
    session.airbrushScatterRadius,
    session.airbrushDensity,
    session.airbrushIntervalMs,
    session.symmetryAxes?.horizontal ? 1 : 0,
    session.symmetryAxes?.vertical ? 1 : 0,
    session.symmetryAxes?.diagonalUp ? 1 : 0,
    session.symmetryAxes?.diagonalDown ? 1 : 0,
    session.symmetryAxes?.rotational ? 1 : 0,
    session.symmetryCenter?.x ?? '',
    session.symmetryCenter?.y ?? '',
    Math.round(session.view.rotation * 10),
    session.history.canUndo ? 1 : 0,
    session.history.canRedo ? 1 : 0,
    colorKey(session.primaryColor),
    colorKey(session.secondaryColor),
    (session.document.customBrushes ?? []).map((item) => `${item.id}:${item.name}:${item.width}:${item.height}`).join('|')
  ].join(';')
}

export const statusBarRenderKey = (
  session: DocumentSession | null,
  message: string | null
): string => session
  ? [
      session.document.id,
      session.document.colorMode,
      session.document.layers.length,
      Math.round(session.view.zoom * 100),
      session.selection ? `${session.selection.width}:${session.selection.height}` : '',
      message ?? ''
    ].join(';')
  : `home;${message ?? ''}`
