import type { FillKind, GradientType, LineKind, LiquifyMode, MoveKind, SelectionKind, SelectionMode, ShapeKind, ToolId } from '@shared/types'
import type { CSSProperties } from 'react'
import type { ShortcutId } from '@/core/shortcuts'
import { DEFAULT_APP_LOCALE, type AppLocale } from '@/core/localization'
import { editorToolCopyByLocale, fillToolCopyByLocale, lineToolCopyByLocale, moveToolCopyByLocale, selectionModeLabelsByLocale, selectionToolCopyByLocale, shapeToolCopyByLocale } from '@/locales/editor-tools'
import toolSelectionIcon from '@/assets/tool-icons/tool-selection.svg'
import toolPencilIcon from '@/assets/tool-icons/tool-pencil.svg'
import toolAirbrushIcon from '@/assets/tool-icons/tool-airbrush.svg'
import toolEraserIcon from '@/assets/tool-icons/tool-eraser.svg'
import toolLiquifyIcon from '@/assets/tool-icons/tool-liquify.svg'
import toolLiquifyNormalIcon from '@/assets/tool-icons/tool-liquify-normal.svg'
import toolFillIcon from '@/assets/tool-icons/tool-fill.svg'
import toolEyedropperIcon from '@/assets/tool-icons/tool-eyedropper.svg'
import toolHandIcon from '@/assets/tool-icons/tool-hand.svg'
import toolMoveIcon from '@/assets/tool-icons/tool-move.svg'
import toolSliceIcon from '@/assets/tool-icons/tool-slice.svg'
import toolRotateIcon from '@/assets/tool-icons/tool-rotate.svg'
import toolTextIcon from '@/assets/tool-icons/tool-text.svg'
import toolZoomIcon from '@/assets/tool-icons/tool-zoom.svg'
import toolShapeIcon from '@/assets/tool-icons/tool-shape.svg'
import selectionRectangleIcon from '@/assets/tool-icons/selection-rectangle.svg'
import selectionEllipseIcon from '@/assets/tool-icons/selection-ellipse.svg'
import selectionLassoIcon from '@/assets/tool-icons/selection-lasso.svg'
import selectionPolygonLassoIcon from '@/assets/tool-icons/selection-polygon-lasso.svg'
import selectionMagicIcon from '@/assets/tool-icons/selection-magic.svg'
import selectionReplaceIcon from '@/assets/tool-icons/selection-replace.svg'
import selectionAddIcon from '@/assets/tool-icons/selection-add.svg'
import selectionSubtractIcon from '@/assets/tool-icons/selection-subtract.svg'
import selectionIntersectIcon from '@/assets/tool-icons/selection-intersect.svg'
import shapeRectangleFillIcon from '@/assets/tool-icons/shape-rectangle-fill.svg'
import shapeRectangleIcon from '@/assets/tool-icons/shape-rectangle.svg'
import shapeEllipseFillIcon from '@/assets/tool-icons/shape-ellipse-fill.svg'
import shapeEllipseIcon from '@/assets/tool-icons/shape-ellipse.svg'
import shapeFreeformIcon from '@/assets/tool-icons/shape-freeform.svg'
import shapePolygonIcon from '@/assets/tool-icons/shape-polygon.svg'
import shapeLineIcon from '@/assets/tool-icons/shape-line.svg'
import shapeCurveIcon from '@/assets/tool-icons/shape-curve.svg'
import toolGradientIcon from '@/assets/tool-icons/tool-gradient-6-6.svg'
import gradientLinearIcon from '@/assets/tool-icons/gradient-linear.svg'
import gradientRadialIcon from '@/assets/tool-icons/gradient-radial.svg'
import liquifyModePushIcon from '@/assets/tool-icons/liquify-mode-push.svg'
import liquifyModeInflateIcon from '@/assets/tool-icons/liquify-mode-inflate.svg'
import liquifyModeDeflateIcon from '@/assets/tool-icons/liquify-mode-deflate.svg'
import liquifyModeTwistClockwiseIcon from '@/assets/tool-icons/liquify-mode-twist-clockwise.svg'
import liquifyModeTwistCounterClockwiseIcon from '@/assets/tool-icons/liquify-mode-twist-counter-clockwise.svg'
import toolGradientNormalIcon from '@/assets/tool-icons/tool-gradient-normal.svg'
import toolPencilNormalIcon from '@/assets/tool-icons/tool-pencil-normal.svg'
import toolAirbrushNormalIcon from '@/assets/tool-icons/tool-airbrush-normal.svg'
import toolEraserNormalIcon from '@/assets/tool-icons/tool-eraser-normal.svg'
import selectionRectangleNormalIcon from '@/assets/tool-icons/selection-rectangle-normal.svg'
import selectionEllipseNormalIcon from '@/assets/tool-icons/selection-ellipse-normal.svg'
import selectionLassoNormalIcon from '@/assets/tool-icons/selection-lasso-normal.svg'
import selectionPolygonLassoNormalIcon from '@/assets/tool-icons/selection-polygon-lasso-normal.svg'
import selectionMagicNormalIcon from '@/assets/tool-icons/selection-magic-normal.svg'
import toolMoveNormalIcon from '@/assets/tool-icons/tool-move-normal.svg'
import toolSliceNormalIcon from '@/assets/tool-icons/tool-slice-normal.svg'
import shapeRectangleNormalIcon from '@/assets/tool-icons/shape-rectangle-normal.svg'
import shapeRectangleFillNormalIcon from '@/assets/tool-icons/shape-rectangle-fill-normal.svg'
import shapeEllipseNormalIcon from '@/assets/tool-icons/shape-ellipse-normal.svg'
import shapeEllipseFillNormalIcon from '@/assets/tool-icons/shape-ellipse-fill-normal.svg'
import shapeFreeformNormalIcon from '@/assets/tool-icons/shape-freeform-normal.svg'
import shapePolygonNormalIcon from '@/assets/tool-icons/shape-polygon-normal.svg'
import shapeLineNormalIcon from '@/assets/tool-icons/shape-line-normal.svg'
import shapeCurveNormalIcon from '@/assets/tool-icons/shape-curve-normal.svg'
import toolFillNormalIcon from '@/assets/tool-icons/tool-fill-normal.svg'
import toolEyedropperNormalIcon from '@/assets/tool-icons/tool-eyedropper-normal.svg'
import toolHandNormalIcon from '@/assets/tool-icons/tool-hand-normal.svg'
import toolZoomNormalIcon from '@/assets/tool-icons/tool-zoom-normal.svg'
import toolRotateNormalIcon from '@/assets/tool-icons/tool-rotate-normal.svg'
import toolTextNormalIcon from '@/assets/tool-icons/tool-text-normal.svg'

const NORMAL_EDITOR_TOOL_ICON_BY_SOURCE = new Map<string, string>([
  [toolPencilIcon, toolPencilNormalIcon],
  [toolAirbrushIcon, toolAirbrushNormalIcon],
  [toolEraserIcon, toolEraserNormalIcon],
  [toolLiquifyIcon, toolLiquifyNormalIcon],
  [selectionRectangleIcon, selectionRectangleNormalIcon],
  [selectionEllipseIcon, selectionEllipseNormalIcon],
  [selectionLassoIcon, selectionLassoNormalIcon],
  [selectionPolygonLassoIcon, selectionPolygonLassoNormalIcon],
  [selectionMagicIcon, selectionMagicNormalIcon],
  [toolMoveIcon, toolMoveNormalIcon],
  [toolSliceIcon, toolSliceNormalIcon],
  [shapeRectangleIcon, shapeRectangleNormalIcon],
  [shapeRectangleFillIcon, shapeRectangleFillNormalIcon],
  [shapeEllipseIcon, shapeEllipseNormalIcon],
  [shapeEllipseFillIcon, shapeEllipseFillNormalIcon],
  [shapeFreeformIcon, shapeFreeformNormalIcon],
  [shapePolygonIcon, shapePolygonNormalIcon],
  [shapeLineIcon, shapeLineNormalIcon],
  [shapeCurveIcon, shapeCurveNormalIcon],
  [toolFillIcon, toolFillNormalIcon],
  [toolEyedropperIcon, toolEyedropperNormalIcon],
  [toolHandIcon, toolHandNormalIcon],
  [toolZoomIcon, toolZoomNormalIcon],
  [toolRotateIcon, toolRotateNormalIcon],
  [toolTextIcon, toolTextNormalIcon],
  [toolGradientIcon, toolGradientNormalIcon]
])
export const normalEditorToolIconFor = (source: string): string | undefined => NORMAL_EDITOR_TOOL_ICON_BY_SOURCE.get(source)

const TOOL_BASE: Array<{ id: ToolId; icon: string; shortcutId: ShortcutId }> = [
  { id: 'pencil', icon: toolPencilIcon, shortcutId: 'tool.pencil' }, { id: 'airbrush', icon: toolAirbrushIcon, shortcutId: 'tool.airbrush' }, { id: 'eraser', icon: toolEraserIcon, shortcutId: 'tool.eraser' }, { id: 'liquify', icon: toolLiquifyIcon, shortcutId: 'tool.liquify' }, { id: 'selection', icon: toolSelectionIcon, shortcutId: 'tool.selection' }, { id: 'shape', icon: toolShapeIcon, shortcutId: 'tool.shape' }, { id: 'line', icon: shapeLineIcon, shortcutId: 'tool.line' }, { id: 'fill', icon: toolFillIcon, shortcutId: 'tool.fill' }, { id: 'text', icon: toolTextIcon, shortcutId: 'tool.text' }, { id: 'move', icon: toolMoveIcon, shortcutId: 'tool.move' }, { id: 'eyedropper', icon: toolEyedropperIcon, shortcutId: 'tool.eyedropper' }, { id: 'hand', icon: toolHandIcon, shortcutId: 'tool.hand' }, { id: 'zoom', icon: toolZoomIcon, shortcutId: 'tool.zoom' }, { id: 'rotate', icon: toolRotateIcon, shortcutId: 'tool.rotate' }
]

export const toolDefinitions = (locale: AppLocale) => TOOL_BASE.map((item) => ({ ...item, ...editorToolCopyByLocale[locale][item.id] }))
export const TOOL_DEFINITIONS = toolDefinitions(DEFAULT_APP_LOCALE)

export const SELECTION_KIND_ICONS = {
  rectangle: selectionRectangleIcon,
  ellipse: selectionEllipseIcon,
  lasso: selectionLassoIcon,
  'polygon-lasso': selectionPolygonLassoIcon,
  magic: selectionMagicIcon
} as const

const MOVE_KIND_BASE: Array<{ id: MoveKind; shortcutId: ShortcutId; icon: string }> = [
  { id: 'move', shortcutId: 'tool.move', icon: toolMoveIcon },
  { id: 'slice', shortcutId: 'tool.slice', icon: toolSliceIcon }
]
export const moveKindDefinitions = (locale: AppLocale) => MOVE_KIND_BASE.map((item) => ({ ...item, ...moveToolCopyByLocale[locale][item.id] }))

const SELECTION_KIND_BASE: Array<{
  id: SelectionKind
  shortcutId: ShortcutId
}> = [
  { id: 'rectangle', shortcutId: 'tool.selection' }, { id: 'ellipse', shortcutId: 'tool.selection.ellipse' }, { id: 'lasso', shortcutId: 'lasso' }, { id: 'polygon-lasso', shortcutId: 'polygonLasso' }, { id: 'magic', shortcutId: 'magic' }
]
export const selectionKindDefinitions = (locale: AppLocale) => SELECTION_KIND_BASE.map((item) => ({ ...item, ...selectionToolCopyByLocale[locale][item.id] }))
export const SELECTION_KIND_DEFINITIONS = selectionKindDefinitions(DEFAULT_APP_LOCALE)

const SHAPE_KIND_BASE: Array<{
  id: ShapeKind
  shortcutId: ShortcutId
  icon: string
}> = [
  { id: 'rectangle-outline', shortcutId: 'tool.shape.rectangleOutline', icon: shapeRectangleIcon }, { id: 'rectangle', shortcutId: 'tool.shape.rectangle', icon: shapeRectangleFillIcon }, { id: 'ellipse-outline', shortcutId: 'tool.shape.ellipseOutline', icon: shapeEllipseIcon }, { id: 'ellipse', shortcutId: 'tool.shape.ellipse', icon: shapeEllipseFillIcon },
  { id: 'freeform', shortcutId: 'tool.shape.freeform', icon: shapeFreeformIcon }, { id: 'polygon', shortcutId: 'tool.shape.polygon', icon: shapePolygonIcon }
]
export const shapeKindDefinitions = (locale: AppLocale) => SHAPE_KIND_BASE.map((item) => ({ ...item, ...shapeToolCopyByLocale[locale][item.id] }))

const LINE_KIND_BASE: Array<{ id: LineKind; shortcutId: ShortcutId; icon: string }> = [
  { id: 'line', shortcutId: 'tool.line', icon: shapeLineIcon },
  { id: 'curve', shortcutId: 'tool.curve', icon: shapeCurveIcon }
]
export const lineKindDefinitions = (locale: AppLocale) => LINE_KIND_BASE.map((item) => ({ ...item, ...lineToolCopyByLocale[locale][item.id] }))

const FILL_KIND_BASE: Array<{ id: FillKind; shortcutId: ShortcutId; icon: string }> = [
  { id: 'bucket', shortcutId: 'tool.fill', icon: toolFillIcon },
  { id: 'gradient', shortcutId: 'tool.fill.gradient', icon: toolGradientIcon }
]

export const fillKindDefinitions = (locale: AppLocale) => FILL_KIND_BASE.map((item) => ({ ...item, ...fillToolCopyByLocale[locale][item.id] }))
export const FILL_KIND_ICONS = Object.fromEntries(FILL_KIND_BASE.map((item) => [item.id, item.icon])) as Record<FillKind, string>
export const GRADIENT_TYPE_ICONS: Record<GradientType, string> = {
  linear: gradientLinearIcon,
  radial: gradientRadialIcon
}
export const LIQUIFY_MODE_ICONS: Record<LiquifyMode, string> = {
  push: liquifyModePushIcon,
  inflate: liquifyModeInflateIcon,
  deflate: liquifyModeDeflateIcon,
  'twist-clockwise': liquifyModeTwistClockwiseIcon,
  'twist-counter-clockwise': liquifyModeTwistCounterClockwiseIcon
}
export const SHAPE_KIND_DEFINITIONS = shapeKindDefinitions(DEFAULT_APP_LOCALE)

export interface ActiveToolPresentation {
  id: ToolId
  label: string
  description: string
  icon: string
  shortcutId: ShortcutId
}

export const activeToolPresentation = (
  toolId: ToolId,
  selectionKind: SelectionKind,
  shapeKind: ShapeKind,
  locale: AppLocale = DEFAULT_APP_LOCALE,
  fillKind: FillKind = 'bucket',
  lineKind: LineKind = 'line',
  moveKind: MoveKind = 'move'
): ActiveToolPresentation => {
  if (toolId === 'move') {
    const definition = moveKindDefinitions(locale).find((item) => item.id === moveKind)!
    return { ...definition, id: toolId }
  }
  if (toolId === 'selection') {
    const definition = selectionKindDefinitions(locale).find((item) => item.id === selectionKind)!
    return { ...definition, id: toolId, icon: SELECTION_KIND_ICONS[selectionKind] }
  }
  if (toolId === 'shape') {
    const definition = shapeKindDefinitions(locale).find((item) => item.id === shapeKind)!
    return { ...definition, id: toolId }
  }
  if (toolId === 'line') {
    const definition = lineKindDefinitions(locale).find((item) => item.id === lineKind)!
    return { ...definition, id: toolId }
  }
  if (toolId === 'fill') {
    const definition = fillKindDefinitions(locale).find((item) => item.id === fillKind)!
    return { ...definition, id: toolId }
  }
  return toolDefinitions(locale).find((item) => item.id === toolId)!
}

const SELECTION_MODE_BASE = [
  { id: 'replace', icon: selectionReplaceIcon }, { id: 'add', icon: selectionAddIcon }, { id: 'subtract', icon: selectionSubtractIcon }, { id: 'intersect', icon: selectionIntersectIcon }
] as const
export const selectionModes = (locale: AppLocale) => SELECTION_MODE_BASE.map((item) => ({ ...item, label: selectionModeLabelsByLocale[locale][item.id] }))
export const SELECTION_MODES = selectionModes(DEFAULT_APP_LOCALE)

export const temporarySelectionModeForModifiers = (shiftHeld: boolean, secondaryHeld: boolean): SelectionMode | null =>
  secondaryHeld ? 'subtract' : shiftHeld ? 'add' : null

export const ALL_EDITOR_TOOL_ICONS = [...new Set([
  ...TOOL_BASE.map((item) => item.icon),
  ...Object.values(SELECTION_KIND_ICONS),
  ...MOVE_KIND_BASE.map((item) => item.icon),
  ...SELECTION_MODE_BASE.map((item) => item.icon),
  ...SHAPE_KIND_BASE.map((item) => item.icon),
  ...LINE_KIND_BASE.map((item) => item.icon),
  ...FILL_KIND_BASE.map((item) => item.icon),
  ...Object.values(GRADIENT_TYPE_ICONS),
  ...Object.values(LIQUIFY_MODE_ICONS),
  ...NORMAL_EDITOR_TOOL_ICON_BY_SOURCE.values()
])]

const pixelMasks = {
  round: ['01110', '11111', '11111', '11111', '01110'],
  square: ['11111', '11111', '11111', '11111', '11111'],
  line: ['11111'],
  rectangle: ['111111', '111111', '111111', '111111'],
  ellipse: ['011110', '111111', '111111', '011110'],
  'rectangle-outline': ['111111', '100001', '100001', '111111'],
  'ellipse-outline': ['011110', '100001', '100001', '011110']
} as const

export function PixelShapeIcon({ kind }: { kind: keyof typeof pixelMasks }) {
  const mask = pixelMasks[kind]
  return <span className={`pixel-shape-icon ${kind}`} aria-hidden="true">{mask.flatMap((row, y) => [...row].map((cell, x) => <i key={`${x}-${y}`} className={cell === '1' ? 'filled' : ''} />))}</span>
}

export function PixelAssetIcon({ src, className = '' }: { src: string; className?: string }) {
  const normalSource = normalEditorToolIconFor(src)
  return <span className={`pixel-asset-icon ${className}`.trim()} style={{ '--pixel-icon-source': `url("${src}")`, ...(normalSource ? { '--pixel-icon-normal-source': `url("${normalSource}")` } : {}) } as CSSProperties} aria-hidden="true" />
}
