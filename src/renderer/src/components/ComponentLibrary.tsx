import { editCommandIcons } from './app/edit-command-icons'
import drawWithAnchorIcon from '@/assets/pixel-icons/draw-with-anchor.svg'
import { ANCHOR_PRESETS, PixelAnchorPresetIcon } from './PixelAnchorPresetIcon'
import { pixelSource } from '@/components/pixel-source'
import { useMemo, useState, type ReactElement } from 'react'
import { TabletPressButton } from './tablet/TabletPressButton'
import { PixelAssetIcon } from './app/editor-tools'
import toolZoomNormalIcon from '@/assets/tool-icons/tool-zoom-normal.svg'
import type { GradientDither, ImageBrush, InkMode } from '@shared/types-brush'
import type { OutlineDirections, OutlineKernel, OutlinePosition } from '@shared/types-selection'
import type { RgbaColor } from '@shared/types-color'
import type { Tileset } from '@shared/types-tiles'
import { Button, FileButton } from './Button'
import { BrushThumbnail } from './BrushThumbnail'
import { ColorPicker, type ColorPickerConfig } from './ColorPicker'
import { ColorValueControl } from './ColorValueControl'
import { DeleteIconButton } from './DeleteIconButton'
import { DialogHeader } from './DialogHeader'
import { FormField } from './FormField'
import { GradientDitherSelect } from './GradientDitherSelect'
import { ModalShell } from './ModalShell'
import { NumberInput } from './NumberInput'
import { TextInput } from './TextInput'
import { TextAreaInput } from './TextAreaInput'
import { ThemedSelect, type ThemedSelectGroup } from './ThemedSelect'
import { Tooltip } from './Tooltip'
import { useI18n } from './I18nProvider'
import { PixelCloseIcon as X, PixelDownIcon as ChevronDown, PixelRightIcon as ChevronRight, PixelUtilityIcon, type PixelUtilityIconKind } from './PixelUtilityIcon'
import { CheckboxField } from './CheckboxField'
import { PreferenceToggle } from './PreferenceToggle'
import { RangeField } from './RangeField'
import { Scrollbar } from './Scrollbar'
import { SegmentedControl } from './SegmentedControl'
import { SettingsSection } from './SettingsSection'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import { SettingsNavigation } from './SettingsNavigation'
import { LivePreviewToggle } from './LivePreviewToggle'
import { PixelAutoLinkIcon } from './PixelAutoLinkIcon'
import { PixelInkIcon } from './PixelInkIcon'
import { PixelDrawingTimeIcon } from './PixelDrawingTimeIcon'
import { PixelLayerCountIcon } from './PixelLayerCountIcon'
import { PixelPressureIcon } from './PixelPressureIcon'
import { OutlineStrokeControls } from './OutlineStrokeControls'
import { TilesetTileThumbnail } from './TilesetTileThumbnail'
import { BrushDynamicsSettingsPanel } from './app/EditorToolOptions'
import { FILL_KIND_ICONS, GRADIENT_TYPE_ICONS, LIQUIFY_MODE_ICONS, SELECTION_KIND_ICONS, fillKindDefinitions, lineKindDefinitions, normalEditorToolIconFor, selectionKindDefinitions, shapeKindDefinitions, toolDefinitions } from './app/editor-tools'
import selectionShrinkIcon from '@/assets/pixel-icons/selection-shrink.svg'
import quickAntiAliasIcon from '@/assets/pixel-icons/quick-command-anti-alias.svg'
import { CURSOR_ICON_LIBRARY } from '@/platform/cursor-theme'
import { translate, type AppLocale, type TranslationKey, type TranslationParams } from '@/core/localization'
import { outlineDirectionsForKernel } from '@/core/outline-settings'
import type { BrushDynamicsEffect, BrushDynamicsMapping, BrushDynamicsSettings } from '@/core/pressure'
import { packColor } from '@/core/raster'

type ComponentCategory = 'all' | 'controls' | 'forms' | 'panels' | 'dialogs' | 'editor'

export interface ComponentLibraryEntry {
  id: string
  name: string
  category: Exclude<ComponentCategory, 'all'>
  description: string
  source: string
  tags: string[]
}

const categoryLabels: Record<ComponentCategory, TranslationKey> = {
  all: 'componentLibrary.category.all',
  controls: 'componentLibrary.category.controls',
  forms: 'componentLibrary.category.forms',
  panels: 'componentLibrary.category.panels',
  dialogs: 'componentLibrary.category.dialogs',
  editor: 'componentLibrary.category.editor'
}

const tagKeys: Record<string, TranslationKey> = {
  操作: 'componentLibrary.tag.operation', 状态: 'componentLibrary.tag.state', 图标: 'componentLibrary.tag.icon', 工具栏: 'componentLibrary.tag.toolbar', 删除: 'componentLibrary.tag.delete', 危险: 'componentLibrary.tag.danger', 右键: 'componentLibrary.tag.context', 菜单: 'componentLibrary.tag.menu', 模式: 'componentLibrary.tag.mode', 选中: 'componentLibrary.tag.selected', 数字: 'componentLibrary.tag.number', 步进: 'componentLibrary.tag.stepper', 文本: 'componentLibrary.tag.text', 描述: 'componentLibrary.tag.description', 输入: 'componentLibrary.tag.input', 下拉: 'componentLibrary.tag.select', 分组: 'componentLibrary.tag.group', 数值: 'componentLibrary.tag.value', 实时: 'componentLibrary.tag.live', 设置: 'componentLibrary.tag.settings', 复选: 'componentLibrary.tag.checkbox', 开关: 'componentLibrary.tag.switch', 滚动: 'componentLibrary.tag.scroll', 列表: 'componentLibrary.tag.list', 栏目: 'componentLibrary.tag.panel', 停靠: 'componentLibrary.tag.dock', 图层: 'componentLibrary.tag.layer', 拖动: 'componentLibrary.tag.drag', 颜色: 'componentLibrary.tag.color', 多选: 'componentLibrary.tag.multiple', 弹窗: 'componentLibrary.tag.dialog', 布局: 'componentLibrary.tag.layout', 缩放: 'componentLibrary.tag.resize', 提示: 'componentLibrary.tag.feedback', 悬浮: 'componentLibrary.tag.tooltip', 工具: 'componentLibrary.tag.tool', 属性: 'componentLibrary.tag.property', HEX: 'componentLibrary.tag.hex', 通道: 'componentLibrary.tag.channel'
}

const componentText = (locale: AppLocale, key: TranslationKey, params?: TranslationParams): string => translate(locale, key, params)

/** Short labels used only by the interactive component previews. Keep these
 * outside JSX so every supported locale gets an explicit value instead of a
 * zh/en conditional that silently leaks English into other languages. */
const previewLiterals = {
  'zh-CN': { compact: '紧凑', name: '名称', colorSettings: '颜色设置', restore: '恢复', displaySettings: '显示设置', sharedSurface: '共享表面', showGrid: '显示网格', normal: '（正常）', normalSize: '正常尺寸', largeSize: '大号尺寸', toolIcons: '工具图标库', pointerIcons: '指针图标库', builtIn: '（内置）', linearGradient: '线性渐变', radialGradient: '径向渐变' },
  'en-US': { compact: 'Compact', name: 'Name', colorSettings: 'Color settings', restore: 'Restore', displaySettings: 'Display settings', sharedSurface: 'Shared surface', showGrid: 'Show grid', normal: ' (normal)', normalSize: 'Normal size', largeSize: 'Large size', toolIcons: 'Tool icon library', pointerIcons: 'Pointer icon library', builtIn: ' (built-in)', linearGradient: 'Linear gradient', radialGradient: 'Radial gradient' },
  'ja-JP': { compact: 'コンパクト', name: '名前', colorSettings: 'カラー設定', restore: '復元', displaySettings: '表示設定', sharedSurface: '共有サーフェス', showGrid: 'グリッドを表示', normal: '（標準）', normalSize: '標準サイズ', largeSize: '大サイズ', toolIcons: 'ツールアイコンライブラリ', pointerIcons: 'ポインターアイコンライブラリ', builtIn: '（内蔵）', linearGradient: '線形グラデーション', radialGradient: '放射状グラデーション' },
  'ko-KR': { compact: '컴팩트', name: '이름', colorSettings: '색상 설정', restore: '복원', displaySettings: '표시 설정', sharedSurface: '공유 표면', showGrid: '격자 표시', normal: ' (일반)', normalSize: '일반 크기', largeSize: '큰 크기', toolIcons: '도구 아이콘 라이브러리', pointerIcons: '포인터 아이콘 라이브러리', builtIn: ' (내장)', linearGradient: '선형 그라디언트', radialGradient: '방사형 그라디언트' },
  'es-ES': { compact: 'Compacto', name: 'Nombre', colorSettings: 'Ajustes de color', restore: 'Restaurar', displaySettings: 'Ajustes de visualización', sharedSurface: 'Superficie compartida', showGrid: 'Mostrar cuadrícula', normal: ' (normal)', normalSize: 'Tamaño normal', largeSize: 'Tamaño grande', toolIcons: 'Biblioteca de iconos de herramientas', pointerIcons: 'Biblioteca de iconos de puntero', builtIn: ' (integrado)', linearGradient: 'Degradado lineal', radialGradient: 'Degradado radial' },
  'fr-FR': { compact: 'Compact', name: 'Nom', colorSettings: 'Paramètres de couleur', restore: 'Restaurer', displaySettings: "Paramètres d'affichage", sharedSurface: 'Surface partagée', showGrid: 'Afficher la grille', normal: ' (normal)', normalSize: 'Taille normale', largeSize: 'Grande taille', toolIcons: "Bibliothèque d’icônes d’outils", pointerIcons: 'Bibliothèque d’icônes de pointeur', builtIn: ' (intégré)', linearGradient: 'Dégradé linéaire', radialGradient: 'Dégradé radial' },
  'de-DE': { compact: 'Kompakt', name: 'Name', colorSettings: 'Farbeinstellungen', restore: 'Wiederherstellen', displaySettings: 'Anzeigeeinstellungen', sharedSurface: 'Gemeinsame Oberfläche', showGrid: 'Raster anzeigen', normal: ' (normal)', normalSize: 'Normale Größe', largeSize: 'Große Größe', toolIcons: 'Werkzeugsymbolbibliothek', pointerIcons: 'Zeigersymbolbibliothek', builtIn: ' (integriert)', linearGradient: 'Linearer Verlauf', radialGradient: 'Radialer Verlauf' },
  'pt-BR': { compact: 'Compacto', name: 'Nome', colorSettings: 'Configurações de cor', restore: 'Restaurar', displaySettings: 'Configurações de exibição', sharedSurface: 'Superfície compartilhada', showGrid: 'Mostrar grade', normal: ' (normal)', normalSize: 'Tamanho normal', largeSize: 'Tamanho grande', toolIcons: 'Biblioteca de ícones de ferramentas', pointerIcons: 'Biblioteca de ícones de ponteiro', builtIn: ' (integrado)', linearGradient: 'Gradiente linear', radialGradient: 'Gradiente radial' },
  'ru-RU': { compact: 'Компактный', name: 'Название', colorSettings: 'Параметры цвета', restore: 'Восстановить', displaySettings: 'Параметры отображения', sharedSurface: 'Общая поверхность', showGrid: 'Показать сетку', normal: ' (обычный)', normalSize: 'Обычный размер', largeSize: 'Большой размер', toolIcons: 'Библиотека значков инструментов', pointerIcons: 'Библиотека указателей', builtIn: ' (встроенный)', linearGradient: 'Линейный градиент', radialGradient: 'Радиальный градиент' }
} satisfies Record<AppLocale, Record<string, string>>

const previewText = (locale: AppLocale, key: keyof (typeof previewLiterals)['zh-CN']): string => previewLiterals[locale][key]

const pixelIconNames: Partial<Record<PixelUtilityIconKind, string>> = {
  lock: '关锁', unlock: '开锁', eye: '睁眼', eyeOff: '闭眼', properties: '调整', delete: '删除',
  newFolder: '新建文件夹', ungroupFolder: '解组文件夹', plus: '加', minus: '减', close: '叉', up: '上', down: '下',
  left: '左', right: '右', onion: '洋葱皮', more: '更多', moreLines: '更多（横线）', paletteLocal: '选择本地色板',
  paletteCenter: '居中', restore: '恢复', undo: '撤销', redo: '重做', workspace: '工作区', copy: '复制',
  linkedLayer: '关联图层', mergeDown: '向下合并', mergeVisible: '合并可见图层', clippingMask: '剪贴蒙版', layerMask: '图层蒙版', layerStyle: '图层样式', folder: '文件夹', folderOpen: '展开文件夹', move: '移动', aspectLink: '关联', swap: '切换',
  save: '保存', export: '导出', image: '图像', roadmapPlanned: '未完成', roadmapCompleted: '完成',
  info: '信息', canvasCenter: '居中', canvasAnchorCenter: '画布居中锚点', canvasTop: '上', canvasBottom: '下', canvasLeft: '左', canvasRight: '右',
  canvasTopLeft: '左上', canvasTopRight: '右上', canvasBottomLeft: '左下', canvasBottomRight: '右下',
  checkboxUnchecked: '复选框未选中', checkboxChecked: '复选框选中', pin: '置顶', clearRecords: '清除记录',
  refresh: '刷新', extractColors: '提取颜色', follow: '跟随', check: '选择',
  selectionFlipHorizontal: '水平镜像选中', selectionFlipVertical: '垂直镜像选中',
  canvasMirrorHorizontal: '水平镜像画布', canvasMirrorVertical: '垂直镜像画布',
  invertSelection: '反选', selectAll: '全选', deselect: '取消选择', selectionOutline: '选区边框',
  resetView: '重置视图', deleteSelection: '删除选区内容', rotateClockwise90: '顺时针旋转 90°',
  rotateCounterClockwise90: '逆时针旋转 90°', tileRepeatX: 'X轴平铺', tileRepeatY: 'Y轴平铺', tileRepeatBoth: '包围平铺',
  tilemap: '瓦片', tilePaint: '绘制瓦片', convertTo: '转换为', tileModeEdit: '原位编辑',
  tileModeCreate: '变体创建', tileModeHybrid: '混合编辑', timelapse: '缩时视频', grid: '网格', ink: '墨水'
}

const pixelIconNameOverrides: Partial<Record<PixelUtilityIconKind, string>> = { link: '连接', paste: '粘贴' }
const pixelIconTitle = (kind: PixelUtilityIconKind): string => `名称: ${pixelIconNameOverrides[kind] ?? pixelIconNames[kind] ?? kind} · ID: ${kind}`
const iconLibraryTitle = (name: string, id: string): string => `名称: ${name} · ID: ${id}`
const inkModeIconDefinitions: ReadonlyArray<{ mode: InkMode; label: TranslationKey }> = [
  { mode: 'simple', label: 'toolOptions.inkSimple' },
  { mode: 'copy-alpha-color', label: 'toolOptions.inkCopyAlphaColor' },
  { mode: 'lock-alpha', label: 'toolOptions.inkLockAlpha' }
]

const cursorNames: Record<string, { zh: string; en: string }> = {
  default: { zh: '默认指针', en: 'Default pointer' }, help: { zh: '帮助指针', en: 'Help pointer' }, progress: { zh: '进度指针', en: 'Progress pointer' }, wait: { zh: '等待指针', en: 'Wait pointer' }, project: { zh: '项目指针', en: 'Project pointer' }, crosshair: { zh: '十字指针', en: 'Crosshair pointer' }, text: { zh: '文本指针', en: 'Text pointer' }, pointer: { zh: '指向指针', en: 'Pointer' },
  'pencil-black': { zh: '铅笔指针（深色）', en: 'Pencil pointer (dark)' }, 'pencil-white': { zh: '铅笔指针（浅色）', en: 'Pencil pointer (light)' }, 'selection-black': { zh: '选区指针（深色）', en: 'Selection pointer (dark)' }, 'selection-white': { zh: '选区指针（浅色）', en: 'Selection pointer (light)' }, unavailable: { zh: '不可用指针', en: 'Unavailable pointer' }, grab: { zh: '抓取指针', en: 'Grab pointer' }, grabbing: { zh: '抓取中指针', en: 'Grabbing pointer' }, move: { zh: '移动指针', en: 'Move pointer' }, 'swatch-edge': { zh: '色格边缘指针', en: 'Swatch edge pointer' }, eyedropper: { zh: '吸管指针', en: 'Eyedropper pointer' }, 'selection-move': { zh: '选区移动指针', en: 'Selection move pointer' }, copy: { zh: '复制指针', en: 'Copy pointer' }, zoom: { zh: '缩放指针', en: 'Zoom pointer' }, rotate: { zh: '旋转指针', en: 'Rotate pointer' }, 'ns-resize': { zh: '上下调整指针', en: 'Vertical resize pointer' }, 'n-resize': { zh: '向上调整指针', en: 'North resize pointer' }, 'ew-resize': { zh: '左右调整指针', en: 'Horizontal resize pointer' }, 'nwse-resize': { zh: '左上右下调整指针', en: 'Diagonal resize pointer' }, 'nesw-resize': { zh: '右上左下调整指针', en: 'Diagonal resize pointer' }, 'selection-rotate-n': { zh: '选区上方旋转指针', en: 'Selection rotate north pointer' }, 'selection-rotate-ne': { zh: '选区右上旋转指针', en: 'Selection rotate NE pointer' }, 'selection-rotate-se': { zh: '选区右下旋转指针', en: 'Selection rotate SE pointer' }, 'selection-rotate-s': { zh: '选区下方旋转指针', en: 'Selection rotate south pointer' }, 'selection-rotate-sw': { zh: '选区左下旋转指针', en: 'Selection rotate SW pointer' }, 'selection-rotate-nw': { zh: '选区左上旋转指针', en: 'Selection rotate NW pointer' }, 'selection-shear-horizontal': { zh: '选区水平倾斜指针', en: 'Selection horizontal shear pointer' }, 'selection-shear-vertical': { zh: '选区垂直倾斜指针', en: 'Selection vertical shear pointer' }
}

const cursorLabel = (locale: AppLocale, names: { zh: string; en: string }): string => ({
  'zh-CN': names.zh,
  'en-US': names.en,
  'ja-JP': `${names.en}カーソル`,
  'ko-KR': `${names.en} 커서`,
  'es-ES': `Cursor ${names.en.toLowerCase()}`,
  'fr-FR': `Curseur ${names.en.toLowerCase()}`,
  'de-DE': `${names.en}zeiger`,
  'pt-BR': `Cursor ${names.en.toLowerCase()}`,
  'ru-RU': `Указатель: ${names.en.toLowerCase()}`
})[locale]

const cursorLibraryItems = (locale: AppLocale) => {
  const grouped = new Map<string, { id: string; names: string[]; source: string; builtinSource?: string }>()
  for (const item of CURSOR_ICON_LIBRARY) {
    const key = item.variable.replace('--cursor-', '')
    const names = cursorNames[key] ?? { zh: key, en: key }
    const name = cursorLabel(locale, names)
    const visualKey = `${item.source}\u0000${item.hotspot[0]}\u0000${item.hotspot[1]}`
    const current = grouped.get(visualKey)
    if (current) {
      if (!current.names.includes(name)) current.names.push(name)
      continue
    }
    grouped.set(visualKey, { id: `cursor.${key}`, names: [name], source: item.source })
    if (item.includeBuiltinInLibrary && item.builtinSource && item.builtinSource !== item.source) {
      const builtinKey = `${item.builtinSource}\u0000${item.hotspot[0]}\u0000${item.hotspot[1]}`
      if (!grouped.has(builtinKey)) grouped.set(builtinKey, { id: `cursor.${key}.builtin`, names: [`${name}${previewText(locale, 'builtIn')}`], source: item.builtinSource, builtinSource: item.builtinSource })
    }
  }
  const separator = locale === 'zh-CN' ? '、' : ' / '
  return [...grouped.values()].map(({ names, ...item }) => ({ ...item, name: names.join(separator) }))
}

const toolLibraryItems = (locale: AppLocale) => {
  const primaryTools = toolDefinitions(locale).filter((item) => item.id !== 'selection' && item.id !== 'shape' && item.id !== 'line' && item.id !== 'fill')
  const items = [
    ...primaryTools.map((item) => ({ id: `tool.${item.id}`, name: item.label, largeSource: item.icon })),
    ...selectionKindDefinitions(locale).map((item) => ({ id: `tool.selection.${item.id}`, name: item.label, largeSource: SELECTION_KIND_ICONS[item.id] })),
    ...shapeKindDefinitions(locale).map((item) => ({ id: `tool.shape.${item.id}`, name: item.label, largeSource: item.icon })),
    ...lineKindDefinitions(locale).map((item) => ({ id: `tool.line.${item.id}`, name: item.label, largeSource: item.icon })),
    ...fillKindDefinitions(locale).map((item) => ({ id: `tool.fill.${item.id}`, name: item.label, largeSource: FILL_KIND_ICONS[item.id] }))
  ]
  const toolItems = items.flatMap((item) => {
    const normalSource = ('normalSource' in item ? item.normalSource : undefined) ?? normalEditorToolIconFor(item.largeSource)
    return normalSource ? [{ ...item, normalSource }] : []
  })
  const gradientModeItems = [
    { id: 'tool.gradient.linear', name: previewText(locale, 'linearGradient'), largeSource: GRADIENT_TYPE_ICONS.linear, normalSource: GRADIENT_TYPE_ICONS.linear },
    { id: 'tool.gradient.radial', name: previewText(locale, 'radialGradient'), largeSource: GRADIENT_TYPE_ICONS.radial, normalSource: GRADIENT_TYPE_ICONS.radial }
  ]
  const liquifyModeItems = ([
    ['push', 'toolOptions.liquifyPush'],
    ['inflate', 'toolOptions.liquifyInflate'],
    ['deflate', 'toolOptions.liquifyDeflate'],
    ['twist-clockwise', 'toolOptions.liquifyTwistClockwise'],
    ['twist-counter-clockwise', 'toolOptions.liquifyTwistCounterClockwise']
  ] as const).map(([mode, labelKey]) => ({
    id: `tool.liquify.${mode}`,
    name: componentText(locale, labelKey),
    largeSource: LIQUIFY_MODE_ICONS[mode],
    normalSource: LIQUIFY_MODE_ICONS[mode]
  }))
  return [...toolItems, ...gradientModeItems, ...liquifyModeItems]
}

const localizeEntry = (entry: ComponentLibraryEntry, locale: AppLocale): ComponentLibraryEntry => ({
  ...entry,
  name: componentText(locale, `componentLibrary.entry.${entry.id}.name` as TranslationKey),
  description: componentText(locale, `componentLibrary.entry.${entry.id}.description` as TranslationKey),
  tags: entry.tags.map((tag) => componentText(locale, tagKeys[tag] ?? 'componentLibrary.tag.operation'))
})

export const COMPONENT_LIBRARY_ENTRIES: ComponentLibraryEntry[] = [
  { id: 'touch-controls', name: '触控控件', category: 'controls', description: '共享组件的触控密度与按住交互。', source: 'Button / TabletPressButton / NumberInput / RangeField / SegmentedControl / .touch-controls', tags: ['操作', '状态', '模式'] },
  { id: 'buttons', name: '按钮组', category: 'controls', description: '主要操作、次要操作和危险操作使用同一组尺寸与状态。', source: 'Button / FileButton', tags: ['操作', '状态'] },
  { id: 'icon-button', name: '图标按钮', category: 'controls', description: '工具栏和面板标题中的方形图标操作。', source: '.icon-button', tags: ['图标', '工具栏'] },
  { id: 'pixel-utility-icon', name: '像素状态图标', category: 'controls', description: '统一收录界面状态、动画自动链接、压感操作和墨水模式使用的像素图标，以整数比例显示并保留原稿半透明边缘。', source: 'PixelUtilityIcon / PixelAutoLinkIcon / PixelPressureIcon / PixelInkIcon / assets/pixel-icons/*.svg', tags: ['图标', '状态', '操作'] },
  { id: 'anchor-preset-icons', name: '锚点预设图标', category: 'controls', description: '九宫格锚点预设，使用保留原始像素和透明度的 11×11 SVG。', source: 'PixelAnchorPresetIcon / assets/pixel-icons/anchor-preset-*.svg', tags: ['图标', '操作'] },
  { id: 'tool-icons', name: '工具图标', category: 'editor', description: '工具、选区、形状、填充、渐变和不同尺寸的像素工具图标。', source: 'editor-tools.tsx / PixelAssetIcon', tags: ['图标', '工具', '工具栏'] },
  { id: 'pointer-icons', name: '指针图标', category: 'editor', description: '画布、选区、缩放、旋转和调整操作使用的像素指针。', source: 'platform/cursor-theme.ts', tags: ['图标', '工具'] },
  { id: 'delete-icon-button', name: '删除图标按钮', category: 'controls', description: '用于删除预设或列表项目的统一危险图标按钮，提供紧凑、常规和禁用状态。', source: 'DeleteIconButton', tags: ['删除', '危险', '图标'] },
  { id: 'context-menu', name: '上下文菜单', category: 'controls', description: '通过右键或更多操作打开的紧凑菜单，支持图标、禁用和危险操作状态。', source: '.context-menu / .context-menu-item', tags: ['右键', '菜单', '操作'] },
  { id: 'segmented', name: '分段选择', category: 'controls', description: '用于工具模式、视图模式和互斥选项。', source: 'SegmentedControl', tags: ['模式', '选中'] },
  { id: 'number-input', name: '数值输入', category: 'forms', description: '统一的数字输入、步进按钮和边界限制。', source: 'NumberInput', tags: ['数字', '步进'] },
  { id: 'text-input', name: '文本输入', category: 'forms', description: '用于名称、搜索和短文本内容的统一单行输入。', source: 'TextInput', tags: ['文本', '输入'] },
  { id: 'text-area-input', name: '多行文本输入', category: 'forms', description: '用于描述和备注的固定尺寸多行输入，不允许用户拖动改变大小。', source: 'TextAreaInput', tags: ['文本', '描述', '输入'] },
  { id: 'themed-select', name: '主题下拉', category: 'forms', description: '带分组、选中标记和键盘导航的下拉菜单。', source: 'ThemedSelect', tags: ['下拉', '分组'] },
  { id: 'gradient-dither-select', name: '渐变抖动选择', category: 'forms', description: '渐变工具和图层样式共用的平滑、Bayer 与方向抖动选择器。', source: 'GradientDitherSelect', tags: ['下拉', '模式', '颜色'] },
  { id: 'form-field', name: '表单字段', category: 'forms', description: '统一标签、控件、说明和悬浮描述的字段布局。', source: 'FormField', tags: ['设置', '输入', '描述'] },
  { id: 'settings-navigation', name: '设置导航', category: 'forms', description: '首选项、快捷键等设置窗口共用的分区导航。', source: 'SettingsNavigation', tags: ['设置', '布局', '选中'] },
  { id: 'settings-section', name: '设置分组', category: 'forms', description: '统一设置分组的表面、边框、标题、正文间距和右侧信息。', source: 'SettingsSection / .settings-section', tags: ['设置', '分组', '布局'] },
  { id: 'settings-section-header', name: '设置分组标题', category: 'forms', description: '统一设置分组标题和右侧操作按钮的对齐与间距。', source: 'SettingsSectionHeader', tags: ['设置', '操作', '布局'] },
  { id: 'range', name: '滑块', category: 'forms', description: '适用于尺寸、不透明度、强度等连续数值。', source: 'RangeField', tags: ['数值', '实时'] },
  { id: 'outline-stroke-controls', name: '描边设置', category: 'forms', description: '描边宽度、位置、快捷形状与八方向像素开关的统一设置组件。', source: 'OutlineStrokeControls', tags: ['设置', '数值', '模式'] },
  { id: 'checkbox', name: '复选框', category: 'forms', description: '用于可以同时启用的独立选项。', source: 'CheckboxField / PixelCheckbox', tags: ['设置', '复选'] },
  { id: 'switch', name: '开关', category: 'forms', description: '用于明确的开启与关闭状态。', source: 'PreferenceToggle', tags: ['设置', '开关'] },
  { id: 'live-preview-toggle', name: '实时预览开关', category: 'forms', description: '调整类弹窗用于开启或关闭实时预览的统一开关。', source: 'LivePreviewToggle', tags: ['实时', '开关', '弹窗'] },
  { id: 'scrollbar', name: '滚动条', category: 'forms', description: '可控制方向、位置和滑块长度的直角滚动条组件。', source: 'Scrollbar', tags: ['滚动', '列表'] },
  { id: 'panel-header', name: '栏目标题', category: 'panels', description: '停靠栏目标题、拖动入口和右侧操作。', source: '.panel > header', tags: ['栏目', '停靠'] },
  { id: 'layer-row', name: '图层行', category: 'panels', description: '可见性、锁定、组图标、名称、混合模式和拖动状态。', source: 'LayersPanel', tags: ['图层', '拖动'] },
  { id: 'swatches', name: '颜色格', category: 'panels', description: '调色板中的居中描边、选中外框和多选状态。', source: '.swatch-grid / .swatch', tags: ['颜色', '多选'] },
  { id: 'brush-thumbnail', name: '笔刷缩略图', category: 'panels', description: '笔刷库与工具属性栏共用的 RGBA 像素缩略图。', source: 'BrushThumbnail / .brush-swatch', tags: ['栏目', '选中', '颜色'] },
  { id: 'tileset-tile-thumbnail', name: '瓦片缩略图', category: 'panels', description: '瓦片集中的方形像素缩略图，支持默认、选中、禁用和点击选择状态。', source: 'TilesetTileThumbnail / .tileset-tile-grid', tags: ['栏目', '选中', '状态'] },
  { id: 'modal-shell', name: '弹窗框架', category: 'dialogs', description: '统一标题、内容、底部操作、拖动、八向缩放和尺寸位置记忆。', source: 'ModalShell / .modal-backdrop', tags: ['弹窗', '布局', '缩放'] },
  { id: 'dialog-header', name: '弹窗标题栏', category: 'dialogs', description: '统一弹窗眉题、标题、关闭操作和可选标题栏动作。', source: 'DialogHeader', tags: ['弹窗', '布局', '操作'] },
  { id: 'save-progress', name: '文件操作进度', category: 'dialogs', description: '用于导出和保存过程的进度、完成确认与顶层反馈。', source: '.save-progress-modal', tags: ['弹窗', '状态', '反馈'] },
  { id: 'status', name: '状态提示', category: 'dialogs', description: '用于操作反馈、模式提示和不可用状态。', source: '.statusbar / .advanced-mode-notice', tags: ['提示', '反馈'] },
  { id: 'tooltip', name: '悬浮提示', category: 'dialogs', description: '用于描述等较长内容的自定义悬浮提示，自动避开视口边缘。', source: 'Tooltip', tags: ['提示', '悬浮', '描述'] },
  { id: 'tool-options', name: '工具属性栏', category: 'editor', description: '工具名称、参数、模式和撤销重做操作。', source: '.tool-options', tags: ['工具', '属性'] },
  { id: 'pressure-options', name: '压感工具属性', category: 'editor', description: '铅笔与橡皮的压力/速度映射、渐变效果、实时传感器条和禁用状态。', source: 'BrushDynamicsSettingsPanel / .pressure-popover', tags: ['工具', '设置', '传感器'] },
  { id: 'color-picker', name: '颜色选择器', category: 'editor', description: '色盘、色相、透明度、前景色和背景色。', source: 'ColorPicker', tags: ['颜色', '实时'] },
  { id: 'color-value', name: '颜色值按钮', category: 'editor', description: '颜色预览、HEX 文本和 RGB/HSV/HSL/Gray 多模式编辑。', source: 'ColorValueControl', tags: ['颜色', 'HEX', '通道'] },
  { id: 'panel-dock', name: '停靠栏目', category: 'editor', description: '右侧、左侧和底部停靠区的容器行为。', source: 'InspectorPanels', tags: ['布局', '停靠'] }
]

const initialColor: RgbaColor = { r: 41, g: 121, b: 255, a: 255 }
const selectGroups: Array<{ labelKey: TranslationKey; options: Array<{ value: string; labelKey: TranslationKey }> }> = [
  { labelKey: 'blend.group.basic', options: [{ value: 'normal', labelKey: 'blend.normal' }] },
  { labelKey: 'blend.group.darken', options: [{ value: 'darken', labelKey: 'blend.darken' }, { value: 'multiply', labelKey: 'blend.multiply' }, { value: 'color-burn', labelKey: 'blend.colorBurn' }, { value: 'linear-burn', labelKey: 'blend.linearBurn' }] },
  { labelKey: 'blend.group.lighten', options: [{ value: 'lighten', labelKey: 'blend.lighten' }, { value: 'screen', labelKey: 'blend.screen' }, { value: 'color-dodge', labelKey: 'blend.colorDodge' }, { value: 'linear-dodge', labelKey: 'blend.linearDodge' }] },
  { labelKey: 'blend.group.contrast', options: [{ value: 'overlay', labelKey: 'blend.overlay' }, { value: 'soft-light', labelKey: 'blend.softLight' }, { value: 'hard-light', labelKey: 'blend.hardLight' }, { value: 'vivid-light', labelKey: 'blend.vividLight' }] },
  { labelKey: 'blend.group.compare', options: [{ value: 'difference', labelKey: 'blend.difference' }, { value: 'exclusion', labelKey: 'blend.exclusion' }, { value: 'subtract', labelKey: 'blend.subtract' }, { value: 'divide', labelKey: 'blend.divide' }] }
]

const colorPickerVariants: Array<{ id: string; labelKey: TranslationKey; config: ColorPickerConfig }> = [
  { id: 'moon-square', labelKey: 'componentLibrary.preview.variant.moonSquare', config: { scheme: 'moon-ring', hueSteps: 0, colorSteps: 0, moonField: 'hsv-square' } },
  { id: 'moon-triangle', labelKey: 'componentLibrary.preview.variant.moonTriangle', config: { scheme: 'moon-ring', hueSteps: 0, colorSteps: 0, moonField: 'hsl-triangle' } },
  { id: 'sv-square', labelKey: 'componentLibrary.preview.variant.svSquare', config: { scheme: 'sv-square', hueSteps: 0, colorSteps: 0 } },
  { id: 'hs-square', labelKey: 'componentLibrary.preview.variant.hsSquare', config: { scheme: 'hs-square', hueSteps: 0, colorSteps: 0 } },
  { id: 'wheel', labelKey: 'componentLibrary.preview.variant.wheel', config: { scheme: 'wheel', hueSteps: 0, colorSteps: 0 } }
]

function TouchControlsPreview({ locale }: { locale: AppLocale }) {
  const [value, setValue] = useState(16), [held, setHeld] = useState(false), [mode, setMode] = useState<'hold' | 'latch'>('hold')
  return <div className="component-preview-form touch-controls">
    <SegmentedControl label={componentText(locale, 'tablet.modifiers')} value={mode} onChange={setMode} options={(['hold', 'latch'] as const).map(value => ({ value, label: componentText(locale, `tablet.${value}`) }))} />
    <TabletPressButton label={componentText(locale, 'tablet.sample')} active={held} locked={mode === 'latch'} onActive={setHeld} />
    <FormField label={componentText(locale, 'tablet.size')}><NumberInput density="touch" value={value} min={1} max={128} onValueChange={setValue} /><RangeField ariaLabel={componentText(locale, 'tablet.size')} value={value} min={1} max={128} onChange={setValue} /></FormField>
    <Button disabled>{componentText(locale, 'componentLibrary.preview.disabled')}</Button>
  </div>
}

function ButtonsPreview({ locale }: { locale: AppLocale }) {
  return <div className="component-preview-row"><Button variant="primary" type="button"><PixelUtilityIcon kind="plus" />{componentText(locale, 'componentLibrary.preview.new')}</Button><Button variant="quiet" type="button">{componentText(locale, 'componentLibrary.preview.cancel')}</Button><Button variant="danger" type="button"><PixelUtilityIcon kind="delete" />{componentText(locale, 'componentLibrary.preview.delete')}</Button><Button variant="quiet" type="button" disabled>{componentText(locale, 'componentLibrary.preview.disabled')}</Button><FileButton label={componentText(locale, 'common.chooseFile')} accept="image/*" onFiles={() => {}}>{componentText(locale, 'common.chooseFile')}</FileButton></div>
}

function IconButtonPreview({ locale }: { locale: AppLocale }) {
  return <div className="component-preview-row"><button className="icon-button" type="button" aria-label={componentText(locale, 'componentLibrary.preview.copy')}><PixelUtilityIcon kind="copy" /></button><button className="icon-button active" type="button" aria-label={componentText(locale, 'componentLibrary.preview.settings')}><PixelUtilityIcon kind="properties" /></button><button className="icon-button" type="button" aria-label={componentText(locale, 'componentLibrary.preview.delete')}><PixelUtilityIcon kind="delete" /></button><button className="icon-button" type="button" aria-label={componentText(locale, 'componentLibrary.preview.disabled')} disabled><PixelUtilityIcon kind="lock" /></button></div>
}

function DeleteIconButtonPreview({ locale }: { locale: AppLocale }) {
  return <div className="component-preview-row"><DeleteIconButton aria-label={componentText(locale, 'componentLibrary.preview.deletePreset')} /><DeleteIconButton aria-label={componentText(locale, 'componentLibrary.preview.deleteColor')} size="regular" /><DeleteIconButton aria-label={componentText(locale, 'componentLibrary.preview.deleteDisabled')} disabled /></div>
}

function ContextMenuPreview({ locale }: { locale: AppLocale }) {
  const [open, setOpen] = useState(true)
  return <div className="component-context-menu-preview">
    <button className="icon-button" type="button" aria-label={componentText(locale, 'componentLibrary.preview.openContext')} aria-expanded={open} onClick={() => setOpen((value) => !value)}><PixelUtilityIcon kind="more" /></button>
    {open && <div className="context-menu component-context-menu-demo" role="menu" aria-label={componentText(locale, 'componentLibrary.preview.openContext')}>
      <button className="context-menu-item" type="button" role="menuitem" onClick={() => setOpen(false)}><X size={15} /><span>{componentText(locale, 'componentLibrary.preview.close')}</span></button>
      <button className="context-menu-item" type="button" role="menuitem" onClick={() => setOpen(false)}><PixelUtilityIcon kind="copy" /><span>{componentText(locale, 'componentLibrary.preview.duplicateView')}</span></button>
      <button className="context-menu-item" type="button" role="menuitem" disabled><PixelUtilityIcon kind="folderOpen" /><span>{componentText(locale, 'componentLibrary.preview.openFolder')}</span></button>
    </div>}
  </div>
}

function SegmentedPreview({ locale }: { locale: AppLocale }) {
  const items = [componentText(locale, 'componentLibrary.preview.brush'), componentText(locale, 'componentLibrary.preview.eraser'), componentText(locale, 'componentLibrary.preview.move')]
  const [selected, setSelected] = useState(items[0])
  return <SegmentedControl className="component-segmented-preview" label={componentText(locale, 'componentLibrary.preview.mode')} options={items.map((item, index) => ({ label: item, value: item, disabled: index === 2 }))} value={selected} onChange={setSelected} />
}

function NumberInputPreview({ locale }: { locale: AppLocale }) {
  const [value, setValue] = useState(16)
  const [untitledValue, setUntitledValue] = useState(8)
  const [sliderValue, setSliderValue] = useState(24)
  const [sliderOpen, setSliderOpen] = useState(false)
  return <div className="component-number-input-preview">
    <FormField className="component-number-input-row" layout="inline" label={componentText(locale, 'componentLibrary.preview.size')}><NumberInput value={value} min={1} max={128} suffix="px" onValueChange={setValue} /></FormField>
    <FormField className="component-number-input-row" layout="inline" label={previewText(locale, 'compact')}><NumberInput density="compact" value={value} min={1} max={128} suffix="px" onValueChange={setValue} /></FormField>
    <div className="component-number-input-row component-number-input-no-label"><NumberInput aria-label={componentText(locale, 'componentLibrary.preview.untitledNumber')} value={untitledValue} min={1} max={128} suffix="px" onValueChange={setUntitledValue} /></div>
    <FormField className="component-number-input-row" layout="inline" label={componentText(locale, 'componentLibrary.preview.hintNumber')}><NumberInput className="component-number-input-hint-input" aria-label={componentText(locale, 'componentLibrary.preview.hintNumber')} value="" min={1} max={128} placeholder={componentText(locale, 'componentLibrary.preview.enterNumber')} onValueChange={() => undefined} /></FormField>
    <FormField className="component-number-input-row" layout="inline" label={componentText(locale, 'componentLibrary.preview.size')}><div className="brush-size-control component-number-input-slider" onPointerDown={() => setSliderOpen(true)}><NumberInput aria-label={componentText(locale, 'componentLibrary.preview.sliderNumber')} value={sliderValue} min={1} max={128} suffix="px" onValueChange={setSliderValue} onFocus={() => setSliderOpen(true)} />{sliderOpen && <div className="brush-size-popover" role="dialog" aria-label={componentText(locale, 'componentLibrary.preview.adjustNumber')}><RangeField ariaLabel={componentText(locale, 'componentLibrary.preview.valueSlider')} density="compact" min={1} max={128} suffix="px" value={sliderValue} onChange={setSliderValue} /></div>}</div></FormField>
    <FormField className="component-number-input-row" layout="inline" label={componentText(locale, 'componentLibrary.preview.disabled')}><NumberInput disabled value={32} min={1} max={128} suffix="px" onValueChange={() => undefined} /></FormField>
  </div>
}

function TextAreaInputPreview({ locale }: { locale: AppLocale }) {
  const [value, setValue] = useState(() => componentText(locale, 'componentLibrary.preview.descriptionValue'))
  return <div className="component-preview-form"><FormField label={componentText(locale, 'componentLibrary.preview.description')}><TextAreaInput aria-label={componentText(locale, 'componentLibrary.preview.descriptionInput')} rows={4} value={value} placeholder={componentText(locale, 'componentLibrary.preview.enterDescription')} onChange={(event) => setValue(event.target.value)} /></FormField></div>
}

function TextInputPreview({ locale }: { locale: AppLocale }) {
  const [value, setValue] = useState('MoonSprite')
  return <div className="component-preview-form"><FormField label={previewText(locale, 'name')}><TextInput value={value} onChange={(event) => setValue(event.target.value)} /></FormField><FormField label={previewText(locale, 'compact')}><TextInput density="compact" value={value} onChange={(event) => setValue(event.target.value)} /></FormField><FormField label={componentText(locale, 'componentLibrary.preview.disabled')}><TextInput disabled value={value} readOnly /></FormField></div>
}

function SelectPreview({ locale }: { locale: AppLocale }) {
  const [value, setValue] = useState('normal')
  const groups: Array<ThemedSelectGroup<string>> = selectGroups.map((group) => ({ label: componentText(locale, group.labelKey), options: group.options.map((option) => ({ value: option.value, label: componentText(locale, option.labelKey) })) }))
  return <div className="component-preview-form"><FormField label={componentText(locale, 'componentLibrary.preview.blendMode')}><ThemedSelect value={value} groups={groups} label={componentText(locale, 'componentLibrary.preview.blendMode')} onChange={setValue} /></FormField><FormField label={previewText(locale, 'compact')}><ThemedSelect density="compact" value={value} groups={groups} label={componentText(locale, 'componentLibrary.preview.blendMode')} onChange={setValue} /></FormField><FormField label={componentText(locale, 'componentLibrary.preview.disabled')}><ThemedSelect disabled value={value} groups={groups} label={componentText(locale, 'componentLibrary.preview.blendMode')} onChange={setValue} /></FormField></div>
}

function FormFieldPreview({ locale }: { locale: AppLocale }) {
  const [value, setValue] = useState(16)
  return <div className="component-preview-form"><FormField label={componentText(locale, 'componentLibrary.preview.size')} hint={componentText(locale, 'componentLibrary.preview.hintNumber')}><NumberInput value={value} min={1} max={128} suffix="px" onValueChange={setValue} /></FormField></div>
}

function SettingsSectionHeaderPreview({ locale }: { locale: AppLocale }) {
  return <SettingsSectionHeader title={previewText(locale, 'colorSettings')} actions={<><button type="button" className="quiet-button"><PixelUtilityIcon kind="restore" />{previewText(locale, 'restore')}</button><button type="button" className="quiet-button"><PixelUtilityIcon kind="plus" />{componentText(locale, 'componentLibrary.preview.new')}</button></>} />
}

function SettingsSectionPreview({ locale }: { locale: AppLocale }) {
  const [enabled, setEnabled] = useState(true)
  return <SettingsSection className="component-settings-section-preview" title={previewText(locale, 'displaySettings')} actions={<span className="settings-section-meta">{previewText(locale, 'sharedSurface')}</span>}>
    <div className="settings-section-body">
      <PreferenceToggle label={previewText(locale, 'showGrid')} checked={enabled} onChange={setEnabled} />
      <CheckboxField checked={enabled} label={componentText(locale, 'componentLibrary.preview.perfectPixels')} onChange={setEnabled} />
    </div>
  </SettingsSection>
}

function RangePreview({ locale }: { locale: AppLocale }) {
  const [value, setValue] = useState(64)
  return <div className="component-preview-stack"><RangeField label={componentText(locale, 'componentLibrary.preview.brushSize')} min={1} max={128} suffix="px" value={value} onChange={setValue} /><RangeField density="compact" label={componentText(locale, 'componentLibrary.preview.brushSize')} min={1} max={128} suffix="px" value={value} onChange={setValue} /><RangeField disabled label={componentText(locale, 'componentLibrary.preview.disabled')} min={1} max={128} suffix="px" value={value} onChange={setValue} /></div>
}

function OutlineStrokeControlsPreview() {
  const [thickness, setThickness] = useState(3)
  const [position, setPosition] = useState<OutlinePosition>('outside')
  const [kernel, setKernel] = useState<OutlineKernel>('round')
  const [directions, setDirections] = useState<OutlineDirections>(() => outlineDirectionsForKernel('round'))
  return <div className="component-outline-controls-preview"><OutlineStrokeControls thickness={thickness} position={position} positions={['outside', 'inside', 'both']} kernel={kernel} directions={directions} onThicknessChange={setThickness} onPositionChange={setPosition} onPatternChange={(nextKernel, nextDirections) => { setKernel(nextKernel); setDirections(nextDirections) }} /></div>
}

function GradientDitherSelectPreview() {
  const [value, setValue] = useState<GradientDither>('bayer-4')
  return <div className="component-gradient-dither-preview"><GradientDitherSelect value={value} onChange={setValue} /></div>
}

function CheckboxPreview({ locale }: { locale: AppLocale }) {
  const [checked, setChecked] = useState(true)
  return <div className="component-preview-stack"><CheckboxField className="tool-checkbox component-preview-checkbox" checked={checked} label={componentText(locale, 'componentLibrary.preview.perfectPixels')} onChange={setChecked} /><CheckboxField className="tool-checkbox component-preview-checkbox" checked={false} disabled label={componentText(locale, 'componentLibrary.preview.disabled')} onChange={() => undefined} /></div>
}

function SwitchPreview({ locale }: { locale: AppLocale }) {
  const [checked, setChecked] = useState(true)
  return <div className="component-preview-stack modal-body component-toggle-context-preview"><PreferenceToggle className="component-library-toggle" label={componentText(locale, 'componentLibrary.preview.autoSelect')} tooltip={componentText(locale, 'componentLibrary.preview.autoSelect')} checked={checked} onChange={setChecked} /><PreferenceToggle className="component-library-toggle" label={componentText(locale, 'componentLibrary.preview.disabled')} checked={false} disabled onChange={() => undefined} /></div>
}

function LivePreviewTogglePreview() {
  const [checked, setChecked] = useState(true)
  return <LivePreviewToggle checked={checked} onChange={setChecked} />
}

function ScrollbarPreview({ locale }: { locale: AppLocale }) {
  const [position, setPosition] = useState(0.2)
  return <div className="component-scroll-preview">
    <div className="component-scroll-preview-viewport"><div style={{ transform: `translateY(-${position * 204}px)` }}>{Array.from({ length: 12 }, (_, index) => <div key={index}><span>{String(index + 1).padStart(2, '0')}</span><strong>{componentText(locale, 'componentLibrary.preview.listItem', { index: index + 1 })}</strong></div>)}</div></div>
    <Scrollbar className="component-scroll-preview-bar" orientation="vertical" value={position} thumbRatio={0.46} ariaLabel={componentText(locale, 'componentLibrary.preview.scrollArea')} onChange={setPosition} />
  </div>
}

function PanelHeaderPreview({ locale }: { locale: AppLocale }) {
  return <div className="panel component-panel-preview"><header><strong>{componentText(locale, 'componentLibrary.preview.panel')}</strong><div className="panel-actions"><button className="icon-button" type="button" aria-label={componentText(locale, 'componentLibrary.preview.show')}><PixelUtilityIcon kind="eye" /></button><button className="icon-button" type="button" aria-label={componentText(locale, 'componentLibrary.preview.settings')}><PixelUtilityIcon kind="properties" /></button></div></header><div className="component-panel-content"><PixelUtilityIcon kind="linkedLayer" /><span>{componentText(locale, 'componentLibrary.preview.draggablePanel')}</span></div></div>
}

function PixelUtilityIconPreview({ locale }: { locale: AppLocale }) {
  const [locked, setLocked] = useState(true)
  const [visible, setVisible] = useState(true)
  const kinds = ['properties', 'delete', 'newFolder', 'ungroupFolder', 'plus', 'minus', 'close', 'up', 'down', 'left', 'right', 'onion', 'more', 'moreLines', 'paletteLocal', 'paletteCenter', 'restore', 'undo', 'redo', 'workspace', 'copy', 'link', 'linkedLayer', 'paste', 'mergeDown', 'mergeVisible', 'clippingMask', 'layerMask', 'layerStyle', 'folder', 'folderOpen', 'move', 'aspectLink', 'swap', 'save', 'export', 'image', 'roadmapPlanned', 'roadmapCompleted', 'info', 'canvasCenter', 'canvasAnchorCenter', 'canvasHorizontalCenter', 'canvasVerticalCenter', 'canvasTop', 'canvasBottom', 'canvasLeft', 'canvasRight', 'canvasTopLeft', 'canvasTopRight', 'canvasBottomLeft', 'canvasBottomRight', 'checkboxUnchecked', 'checkboxChecked', 'pin', 'clearRecords', 'refresh', 'extractColors', 'detectImageScale', 'follow', 'check', 'selectionFlipHorizontal', 'selectionFlipVertical', 'canvasMirrorHorizontal', 'canvasMirrorVertical', 'invertSelection', 'selectAll', 'deselect', 'selectionOutline', 'resetView', 'deleteSelection', 'rotateClockwise90', 'rotateCounterClockwise90', 'tileRepeatX', 'tileRepeatY', 'tileRepeatBoth', 'tilemap', 'tilePaint', 'convertTo', 'tileModeEdit', 'tileModeCreate', 'tileModeHybrid', 'timelapse', 'grid'] as const
  return <div className="component-preview-row"><button type="button" title={pixelIconTitle(locked ? 'lock' : 'unlock')} className={locked ? 'icon-button selected' : 'icon-button'} aria-label={pixelIconTitle(locked ? 'lock' : 'unlock')} aria-pressed={locked} onClick={() => setLocked((value) => !value)}><PixelUtilityIcon kind={locked ? 'lock' : 'unlock'} /></button><button type="button" title={pixelIconTitle(visible ? 'eye' : 'eyeOff')} className={visible ? 'icon-button selected' : 'icon-button'} aria-label={pixelIconTitle(visible ? 'eye' : 'eyeOff')} aria-pressed={visible} onClick={() => setVisible((value) => !value)}><PixelUtilityIcon kind={visible ? 'eye' : 'eyeOff'} /></button>{kinds.map((kind) => <button key={kind} type="button" className="icon-button" title={pixelIconTitle(kind)} aria-label={pixelIconTitle(kind)}><PixelUtilityIcon kind={kind} /></button>)}<button type="button" className="icon-button" title={pixelIconTitle('lock')} aria-label={pixelIconTitle('lock')} disabled><PixelUtilityIcon kind="lock" /></button><button type="button" className="icon-button" title={iconLibraryTitle(componentText(locale, 'toolOptions.shrinkSelection'), 'selection-shrink')} aria-label={iconLibraryTitle(componentText(locale, 'toolOptions.shrinkSelection'), 'selection-shrink')}><span className="pixel-asset-icon pixel-utility-asset-icon" style={{ '--pixel-icon-source': `url("${selectionShrinkIcon}")` } as React.CSSProperties} aria-hidden="true" /></button><button type="button" className="icon-button" title={iconLibraryTitle(componentText(locale, 'quickCommands.quickAntiAlias'), 'quick-command-anti-alias')} aria-label={iconLibraryTitle(componentText(locale, 'quickCommands.quickAntiAlias'), 'quick-command-anti-alias')}><span className="pixel-asset-icon pixel-utility-asset-icon" style={{ '--pixel-icon-source': `url("${quickAntiAliasIcon}")` } as React.CSSProperties} aria-hidden="true" /></button>{[{ id: 'cut', label: '剪切', source: editCommandIcons.cut }, { id: 'copyMerged', label: '复制合并', source: editCommandIcons.copyMerged }, { id: 'pasteToCurrentCell', label: '粘贴到当前单元格', source: editCommandIcons.pasteToCurrentCell }, { id: 'pasteAsNewLayer', label: '粘贴为新图层', source: editCommandIcons.pasteAsNewLayer }, { id: 'deleteContent', label: '删除', source: editCommandIcons.deleteContent }, { id: 'quickOutline', label: '快捷描边', source: editCommandIcons.quickOutline }, { id: 'outline', label: '描边', source: editCommandIcons.outline }].map(({ id, label, source }) => <button key={id} type="button" className="icon-button" title={iconLibraryTitle(label, id)} aria-label={iconLibraryTitle(label, id)}><span className="pixel-asset-icon pixel-utility-asset-icon" style={{ '--pixel-icon-source': `url("${source}")` } as React.CSSProperties} aria-hidden="true" /></button>)}{inkModeIconDefinitions.map(({ mode, label }) => <button key={mode} type="button" className="icon-button" title={iconLibraryTitle(translate(locale, label), `ink-${mode}`)} aria-label={iconLibraryTitle(translate(locale, label), `ink-${mode}`)}><PixelInkIcon mode={mode} /></button>)}<button type="button" className="icon-button" title={iconLibraryTitle(componentText(locale, 'toolOptions.canvasCenter'), 'draw-with-anchor')} aria-label={iconLibraryTitle(componentText(locale, 'toolOptions.canvasCenter'), 'draw-with-anchor')}><span className="pixel-asset-icon pixel-utility-asset-icon" style={{ '--pixel-icon-source': `url("${drawWithAnchorIcon}")` } as React.CSSProperties} aria-hidden="true" /></button><button type="button" className="icon-button" title={iconLibraryTitle('有效绘画时长', 'drawing-time')} aria-label={iconLibraryTitle('有效绘画时长', 'drawing-time')}><PixelDrawingTimeIcon /></button><button type="button" className="icon-button" title={iconLibraryTitle('图层数量', 'layer-count')} aria-label={iconLibraryTitle('图层数量', 'layer-count')}><PixelLayerCountIcon /></button><span className="component-auto-link-icon-preview" role="img" aria-label="Auto-link disabled" title="Auto-link disabled"><PixelAutoLinkIcon enabled={false} /></span><span className="component-auto-link-icon-preview" role="img" aria-label="Auto-link enabled" title="Auto-link enabled"><PixelAutoLinkIcon enabled /></span><button type="button" className="icon-button" title={componentText(locale, 'toolOptions.brushDynamics')} aria-label={componentText(locale, 'toolOptions.brushDynamics')}><PixelPressureIcon /></button><button type="button" className="icon-button selected" title={componentText(locale, 'toolOptions.brushDynamics')} aria-label={componentText(locale, 'toolOptions.brushDynamics')} aria-pressed="true"><PixelPressureIcon /></button><button type="button" className="icon-button" title={componentText(locale, 'componentLibrary.preview.disabled')} aria-label={componentText(locale, 'componentLibrary.preview.disabled')} disabled><PixelPressureIcon /></button></div>
}

function AnchorPresetIconsPreview({ locale }: { locale: AppLocale }) {
  const [selected, setSelected] = useState<(typeof ANCHOR_PRESETS)[number]>('center')
  return <div className="selection-pivot-grid" role="group" aria-label={componentText(locale, 'toolOptions.selectionPivotPresets')}>
    {ANCHOR_PRESETS.map(anchor => <button key={anchor} type="button" className={selected === anchor ? 'selected' : ''} aria-pressed={selected === anchor} title={componentText(locale, `canvasResize.anchor.${anchor}`)} aria-label={componentText(locale, `canvasResize.anchor.${anchor}`)} onClick={() => setSelected(anchor)}><PixelAnchorPresetIcon anchor={anchor} /></button>)}
  </div>
}

function ToolIconPreview({ locale }: { locale: AppLocale }) {
  const items = toolLibraryItems(locale)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const renderItems = (group: 'small' | 'large') => <div className={`component-icon-library-grid component-tool-icon-grid component-tool-icon-grid-${group}`}>{items.map((item) => {
    const id = group === 'small' ? `${item.id}.normal` : item.id
    const name = group === 'small' ? `${item.name}${previewText(locale, 'normal')}` : item.name
    const source = group === 'small' ? item.normalSource : item.largeSource
    const title = iconLibraryTitle(name, id)
    return <button key={id} type="button" className={`component-icon-library-button ${selectedId === id ? 'selected' : ''}`} title={title} aria-label={title} aria-pressed={selectedId === id} onClick={() => setSelectedId((current) => current === id ? null : id)}><span className="pixel-asset-icon component-library-asset-icon" style={{ '--pixel-icon-source': `url("${source}")`, '--pixel-icon-normal-source': `url("${source}")` } as React.CSSProperties} aria-hidden="true" /></button>
  })}</div>
  return <div className="component-tool-icon-groups" aria-label={previewText(locale, 'toolIcons')}><section><h4>{previewText(locale, 'normalSize')}</h4>{renderItems('small')}</section><section><h4>{previewText(locale, 'largeSize')}</h4>{renderItems('large')}</section></div>
}

function PointerIconPreview({ locale }: { locale: AppLocale }) {
  const items = cursorLibraryItems(locale)
  return <div className="component-icon-library-grid component-pointer-icon-grid" aria-label={previewText(locale, 'pointerIcons')}>{items.map((item) => {
    const title = iconLibraryTitle(item.name, item.id)
    return <span key={item.id} className="component-pointer-icon" title={title} aria-label={title} role="img"><img src={item.source} alt="" /></span>
  })}</div>
}

function LayerRowPreview({ locale }: { locale: AppLocale }) {
  const [selected, setSelected] = useState(true)
  const [visible, setVisible] = useState(true)
  const [locked, setLocked] = useState(false)
  return <div className="component-layer-list-preview"><button className={`layer-row ${selected ? 'selected' : ''}`} type="button" onClick={() => setSelected((value) => !value)}><span className="layer-color-stripe" style={{ backgroundColor: '#ef5350' }} aria-hidden="true" /><span className="layer-visibility" role="button" tabIndex={-1} aria-label={visible ? componentText(locale, 'componentLibrary.preview.hideLayer') : componentText(locale, 'componentLibrary.preview.showLayer')} aria-pressed={visible} onClick={(event) => { event.stopPropagation(); setVisible((value) => !value) }}>{visible ? <PixelUtilityIcon kind="eye" /> : <PixelUtilityIcon kind="eyeOff" />}</span><span className={`layer-lock-toggle ${locked ? 'locked' : ''}`} role="button" tabIndex={-1} aria-label={locked ? componentText(locale, 'componentLibrary.preview.unlockLayer') : componentText(locale, 'componentLibrary.preview.lockLayer')} aria-pressed={locked} onClick={(event) => { event.stopPropagation(); setLocked((value) => !value) }}>{locked ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}</span><Tooltip className="layer-name" content={componentText(locale, 'componentLibrary.preview.layerDescription')}><span>{componentText(locale, 'componentLibrary.preview.foregroundLayer')}</span><small>{componentText(locale, 'componentLibrary.preview.normalOpacity')}</small></Tooltip></button><button className="layer-row group-row" type="button"><span className="layer-visibility" role="button" tabIndex={-1} aria-pressed={true} aria-label={componentText(locale, 'componentLibrary.preview.showLayer')}><PixelUtilityIcon kind="eye" /></span><span className="layer-lock-toggle" role="button" tabIndex={-1} aria-label={componentText(locale, 'componentLibrary.preview.lockLayer')}><PixelUtilityIcon kind="unlock" /></span><span className="group-folder" role="button" tabIndex={-1} aria-label={componentText(locale, 'componentLibrary.preview.collapseGroup')}><PixelUtilityIcon kind="folderOpen" /></span><span className="layer-name"><span>{componentText(locale, 'componentLibrary.preview.group')}</span><small>{componentText(locale, 'componentLibrary.preview.normalOpacity')}</small></span></button></div>
}

function SwatchesPreview({ locale }: { locale: AppLocale }) {
  const colors = ['#2979ff', '#f1f4f8', null, '#ff6600', '#59c36a', null, '#b43f54', '#8d6cff', 'transparent', null, null, '#1f2330', null, '#ffd166', null, null]
  const [selected, setSelected] = useState<number[]>([0])
  const range = selected.length > 0 ? selected.reduce((current, index) => ({ left: Math.min(current.left, index % 8), top: Math.min(current.top, Math.floor(index / 8)), right: Math.max(current.right, index % 8), bottom: Math.max(current.bottom, Math.floor(index / 8)) }), { left: selected[0] % 8, top: Math.floor(selected[0] / 8), right: selected[0] % 8, bottom: Math.floor(selected[0] / 8) }) : null
  return <div className="swatch-grid component-scrollbar component-swatch-preview" style={{ '--swatch-size': '32px', '--palette-columns': 8 } as React.CSSProperties}>{colors.map((color, index) => <button key={index} className={`swatch palette-slot ${color === null ? 'empty' : 'occupied'} ${selected.includes(index) ? 'selected' : ''} ${index === 0 ? 'primary' : ''} ${color === 'transparent' ? 'transparent' : ''}`} type="button" aria-label={componentText(locale, 'componentLibrary.preview.color', { color: color ?? 'empty' })} aria-pressed={selected.includes(index)} style={color === null ? undefined : { '--swatch-color': color, '--swatch-corner-color': ['#f1f4f8', '#ff6600', '#59c36a'].includes(color) ? '#0f1116' : '#ffffff' } as React.CSSProperties} onClick={(event) => setSelected((current) => event.shiftKey ? current.includes(index) ? current.filter((item) => item !== index) : [...current, index] : [index])} />)}{range && <span data-palette-selection-outline className="palette-selection-box" aria-hidden="true" style={{ '--palette-selection-left': range.left, '--palette-selection-top': range.top, '--palette-selection-width': range.right - range.left + 1, '--palette-selection-height': range.bottom - range.top + 1 } as React.CSSProperties} />}</div>
}

const componentTileset = (() => {
  const tileWidth = 8
  const tileHeight = 8
  const columns = 4
  const pixels = new Uint8ClampedArray(tileWidth * tileHeight * columns * 4)
  const colors: RgbaColor[] = [
    { r: 41, g: 121, b: 255, a: 255 },
    { r: 255, g: 184, b: 77, a: 255 },
    { r: 74, g: 198, b: 132, a: 255 },
    { r: 226, g: 87, b: 105, a: 255 }
  ]
  for (let tile = 0; tile < columns; tile += 1) {
    for (let y = 0; y < tileHeight; y += 1) for (let x = 0; x < tileWidth; x += 1) {
      if ((x + y + tile) % 3 === 0) continue
      const offset = (y * tileWidth * columns + tile * tileWidth + x) * 4
      const color = colors[tile]!
      pixels[offset] = color.r
      pixels[offset + 1] = color.g
      pixels[offset + 2] = color.b
      pixels[offset + 3] = color.a
    }
  }
  return {
    id: 'component-tileset',
    name: 'Component Tileset',
    tileWidth,
    tileHeight,
    columns,
    rows: 1,
    tileIds: Array.from({ length: columns }, (_, index) => `component-tile-${index + 1}`),
    pixels
  } satisfies Tileset
})()

function TilesetTileThumbnailPreview({ locale }: { locale: AppLocale }) {
  const [selected, setSelected] = useState(componentTileset.tileIds[1]!)
  return <div className="component-tileset-preview"><div className="swatch-grid tileset-tile-grid" role="listbox" aria-label={componentText(locale, 'toolOptions.tiles')}>{componentTileset.tileIds.map((tileId, index) => {
    const active = selected === tileId
    return <span key={tileId} className="palette-swatch-wrap tileset-tile-wrap"><button type="button" role="option" aria-label={componentText(locale, 'toolOptions.tileIndex', { index })} aria-selected={active} className={`swatch palette-slot occupied tileset-tile ${active ? 'selected' : ''}`.trim()} disabled={index === componentTileset.tileIds.length - 1} onClick={() => setSelected(tileId)}><TilesetTileThumbnail tileset={componentTileset} tileId={tileId} /></button>{active && <span className="palette-selection-box tileset-tile-selection" aria-hidden="true" />}</span>
  })}</div></div>
}

function ModalShellPreview({ locale }: { locale: AppLocale }) {
  return <div className="component-modal-preview"><div className="modal-preview-frame"><DialogHeader eyebrow="MOONSPRITE" title={componentText(locale, 'componentLibrary.preview.title')} closeLabel={componentText(locale, 'componentLibrary.preview.close')} onClose={() => undefined} /><div className="modal-body component-modal-body"><PixelUtilityIcon kind="info" /><span>{componentText(locale, 'componentLibrary.preview.modalContent')}</span></div><footer><button className="quiet-button" type="button">{componentText(locale, 'componentLibrary.preview.cancel')}</button><button className="primary-button" type="button">{componentText(locale, 'componentLibrary.preview.ok')}</button></footer></div></div>
}

function SettingsNavigationPreview({ locale }: { locale: AppLocale }) {
  const [value, setValue] = useState<'general' | 'theme' | 'files'>('general')
  return <div className="component-settings-navigation-preview"><SettingsNavigation label={componentText(locale, 'componentLibrary.preview.settings')} value={value} items={[{ value: 'general', label: componentText(locale, 'preferences.sections.general') }, { value: 'theme', label: componentText(locale, 'preferences.sections.theme') }, { value: 'files', label: componentText(locale, 'preferences.sections.files') }]} onChange={setValue} /></div>
}

function SaveProgressPreview({ locale }: { locale: AppLocale }) {
  const [complete, setComplete] = useState(false)
  const value = complete ? 100 : 64
  return <div className="component-save-progress-preview"><section className={`save-progress-modal component-save-progress-card ${complete ? 'is-complete' : ''}`}>
    <header><div className="save-progress-heading"><span className="save-progress-icon" aria-hidden="true">{complete ? <PixelUtilityIcon kind="check" /> : <span className="save-progress-animation" />}</span><div><span className="eyebrow">FILE OPERATION</span><h2>{componentText(locale, complete ? 'componentLibrary.preview.exportComplete' : 'componentLibrary.preview.exporting')}</h2></div></div></header>
    <div className="save-progress-body"><strong>{componentText(locale, complete ? 'componentLibrary.preview.videoExported' : 'componentLibrary.preview.encodingVideo')}</strong><div className="save-progress-track"><i style={{ width: `${value}%` }} /></div><div className="save-progress-meta"><span>{componentText(locale, complete ? 'app.progress.complete' : 'app.progress.processing')}</span><small>{value}%</small></div></div>
    <footer><button className={complete ? 'primary-button' : 'quiet-button'} type="button" onClick={() => setComplete((current) => !current)}>{componentText(locale, complete ? 'componentLibrary.preview.ok' : 'componentLibrary.preview.finishExport')}</button></footer>
  </section></div>
}

function StatusPreview({ locale }: { locale: AppLocale }) {
  return <div className="advanced-mode-notice component-library-status-preview" role="status"><strong>{componentText(locale, 'componentLibrary.preview.advancedEnabled')}</strong><small>{componentText(locale, 'componentLibrary.preview.restoreShortcut')}</small></div>
}

function TooltipPreview({ locale }: { locale: AppLocale }) {
  return <div className="component-tooltip-preview"><Tooltip content={componentText(locale, 'componentLibrary.preview.tooltipContent')}><button className="quiet-button" type="button">{componentText(locale, 'componentLibrary.preview.hoverDescription')}</button></Tooltip></div>
}

function ToolOptionsPreview({ locale }: { locale: AppLocale }) {
  return <div className="component-tool-options-preview"><strong>{componentText(locale, 'componentLibrary.preview.brush')}</strong><button className="quiet-button" type="button">{componentText(locale, 'componentLibrary.preview.back')}</button><FormField className="component-tool-options-field" layout="inline" label={componentText(locale, 'componentLibrary.preview.size')}><NumberInput density="compact" value={4} min={1} max={128} onValueChange={() => undefined} /></FormField><span className="component-preview-spacer" /><button className="tool-text-button" type="button">{componentText(locale, 'componentLibrary.preview.undo')}</button><button className="tool-text-button" type="button">{componentText(locale, 'componentLibrary.preview.redo')}</button></div>
}

function PressureOptionsPreview({ locale }: { locale: AppLocale }) {
  const [mode, setMode] = useState<'off' | 'on' | 'intrinsic'>('on')
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil')
  const [perfectPixels, setPerfectPixels] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [settings, setSettings] = useState<BrushDynamicsSettings>({
    version: 5,
    effects: {
      size: { sensor: null, outputMin: 20, outputMax: 100, inputMin: 0, inputMax: 70, curve: 'hard', direction: 'direct' },
      strength: { sensor: null, outputMin: 25, outputMax: 100, inputMin: 50, inputMax: 2400, curve: 'linear', direction: 'inverse' },
      gradient: { sensor: 'pressure', outputMin: 0, outputMax: 100, inputMin: 0, inputMax: 70, curve: 'hard', direction: 'direct' },
      angle: { sensor: null, outputMin: -180, outputMax: 180, inputMin: 0, inputMax: 70, curve: 'hard', direction: 'direct' }
    },
    gradientDither: 'bayer-4'
  })
  const selectMode = (nextMode: 'off' | 'on' | 'intrinsic'): void => {
    setMode(nextMode)
    setPanelOpen(true)
    setSettings((current) => ({
      ...current,
      effects: {
        size: { ...current.effects.size, sensor: nextMode === 'off' ? null : 'pressure', inputMin: 0, inputMax: 70, curve: 'hard' },
        strength: { ...current.effects.strength, sensor: nextMode === 'off' ? null : 'speed', inputMin: 50, inputMax: 2400, curve: 'linear' },
        gradient: { ...current.effects.gradient, sensor: nextMode === 'off' ? null : 'pressure', inputMin: 0, inputMax: 70, curve: 'hard' },
        angle: { ...current.effects.angle, sensor: null }
      }
    }))
  }
  const updateMapping = (effect: BrushDynamicsEffect, patch: Partial<BrushDynamicsMapping>): void => {
    setSettings((current) => ({ ...current, effects: { ...current.effects, [effect]: { ...current.effects[effect], ...patch } } }))
    if (patch.sensor) setMode((current) => current === 'intrinsic' ? current : 'on')
  }
  return <div className="component-pressure-preview">
    <div className="component-pressure-preview-modes">
      <SegmentedControl label={componentText(locale, 'componentLibrary.preview.pressureState')} options={[{ value: 'off', label: componentText(locale, 'componentLibrary.preview.pressureOff') }, { value: 'on', label: componentText(locale, 'componentLibrary.preview.pressureOn') }, { value: 'intrinsic', label: componentText(locale, 'componentLibrary.preview.pressureIntrinsic') }]} value={mode} onChange={selectMode} />
      <SegmentedControl label={componentText(locale, 'componentLibrary.preview.mode')} options={[{ value: 'pencil', label: componentText(locale, 'componentLibrary.preview.brush') }, { value: 'eraser', label: componentText(locale, 'componentLibrary.preview.eraser') }]} value={tool} onChange={setTool} />
    </div>
    <div className="component-pressure-toolbar">
      <strong>{componentText(locale, tool === 'pencil' ? 'componentLibrary.preview.brush' : 'componentLibrary.preview.eraser')}</strong>
      <CheckboxField className="tool-checkbox" checked={perfectPixels} label={componentText(locale, 'componentLibrary.preview.perfectPixels')} onChange={setPerfectPixels} />
      <button className={`pressure-trigger ${settings.effects.size.sensor || settings.effects.strength.sensor || settings.effects.gradient.sensor || settings.effects.angle.sensor ? 'selected' : ''}`} type="button" aria-expanded={panelOpen} onClick={() => setPanelOpen((open) => !open)}>{componentText(locale, 'toolOptions.brushDynamics')}<ChevronDown size={14} /></button>
    </div>
    {panelOpen && <div className="component-pressure-panel"><BrushDynamicsSettingsPanel settings={settings} tool={tool} intrinsicSize={mode === 'intrinsic'} brushSize={16} documentId="component-library-brush-dynamics" primaryColor={{ r: 248, g: 91, b: 74, a: 255 }} secondaryColor={{ r: 38, g: 44, b: 58, a: 255 }} telemetryPreview={{ documentId: 'component-library-brush-dynamics', pressure: 46, speed: 1380, pointerType: 'pen', active: true }} onChange={updateMapping} onGradientDitherChange={(gradientDither) => setSettings((current) => ({ ...current, gradientDither }))} /></div>}
  </div>
}

function ColorPickerPreview({ locale }: { locale: AppLocale }) {
  const [color, setColor] = useState(initialColor)
  const [secondary, setSecondary] = useState<RgbaColor>({ r: 12, g: 14, b: 18, a: 255 })
  return <div className="component-color-picker-preview">{colorPickerVariants.map((variant) => { const label = componentText(locale, variant.labelKey); return <section key={variant.id}><header><strong>{label}</strong><code>{variant.id}</code></header><div><ColorPicker color={color} secondaryColor={secondary} onChange={setColor} onSecondaryChange={setSecondary} compact label={label} config={variant.config} /></div></section> })}</div>
}

function ColorValuePreview({ locale }: { locale: AppLocale }) {
  const [color, setColor] = useState(initialColor)
  const [transparentColor, setTransparentColor] = useState<RgbaColor>({ r: 155, g: 155, b: 159, a: 0 })
  return <div className="component-color-value-preview"><ColorValueControl color={color} density="compact" onChange={setColor} label={componentText(locale, 'componentLibrary.preview.colorValue')} roleLabel={componentText(locale, 'componentLibrary.preview.foreground')} fillWithColor /><ColorValueControl color={color} density="regular" onChange={setColor} label={componentText(locale, 'componentLibrary.preview.colorValue')} roleLabel={componentText(locale, 'componentLibrary.preview.foreground')} fillWithColor /><ColorValueControl color={transparentColor} density="emphasized" onChange={setTransparentColor} label={componentText(locale, 'componentLibrary.preview.colorValue')} roleLabel={componentText(locale, 'componentLibrary.preview.background')} fillWithColor /><ColorValueControl color={color} density="regular" disabled onChange={setColor} label={componentText(locale, 'componentLibrary.preview.disabled')} fillWithColor /></div>
}

const componentBrushes: ImageBrush[] = [
  {
    id: 'component-brush-color',
    name: 'Color brush',
    width: 4,
    height: 4,
    coverage: Uint8Array.from([0, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 0]),
    colors: Uint32Array.from([
      packColor({ r: 0, g: 0, b: 0, a: 0 }), packColor({ r: 41, g: 121, b: 255, a: 255 }), packColor({ r: 89, g: 195, b: 106, a: 255 }), packColor({ r: 0, g: 0, b: 0, a: 0 }),
      packColor({ r: 41, g: 121, b: 255, a: 255 }), packColor({ r: 248, g: 91, b: 74, a: 255 }), packColor({ r: 248, g: 91, b: 74, a: 255 }), packColor({ r: 89, g: 195, b: 106, a: 255 }),
      packColor({ r: 41, g: 121, b: 255, a: 255 }), packColor({ r: 248, g: 91, b: 74, a: 255 }), packColor({ r: 248, g: 91, b: 74, a: 255 }), packColor({ r: 89, g: 195, b: 106, a: 255 }),
      packColor({ r: 0, g: 0, b: 0, a: 0 }), packColor({ r: 41, g: 121, b: 255, a: 255 }), packColor({ r: 89, g: 195, b: 106, a: 255 }), packColor({ r: 0, g: 0, b: 0, a: 0 })
    ]),
    intrinsicSize: true
  },
  {
    id: 'component-brush-alpha',
    name: 'Alpha brush',
    width: 2,
    height: 2,
    coverage: Uint8Array.from([255, 128, 64, 0]),
    colors: Uint32Array.from([
      packColor({ r: 255, g: 255, b: 255, a: 255 }), packColor({ r: 255, g: 255, b: 255, a: 128 }),
      packColor({ r: 255, g: 255, b: 255, a: 64 }), packColor({ r: 0, g: 0, b: 0, a: 0 })
    ]),
    intrinsicSize: true
  }
]

function BrushThumbnailPreview({ locale }: { locale: AppLocale }) {
  const [selected, setSelected] = useState(0)
  return <div className="component-preview-row" style={{ '--brush-swatch-size': '48px' } as React.CSSProperties}>
    {componentBrushes.map((brush, index) => <button key={brush.id} type="button" className={`swatch brush-swatch transparent ${selected === index ? 'selected' : ''}`} aria-label={`${componentText(locale, 'componentLibrary.preview.brush')} ${index + 1}`} aria-pressed={selected === index} onClick={() => setSelected(index)}><span className="brush-swatch-preview" aria-hidden="true"><BrushThumbnail source={pixelSource(brush)} /></span></button>)}
    <button type="button" className="swatch brush-swatch transparent" aria-label={componentText(locale, 'componentLibrary.preview.disabled')} disabled><span className="brush-swatch-preview" aria-hidden="true"><BrushThumbnail source={pixelSource(componentBrushes[0])} /></span></button>
  </div>
}

function DockPreview({ locale }: { locale: AppLocale }) {
  return <div className="component-dock-preview"><div className="component-dock-rail"><span /><span /><span /></div><div className="component-dock-canvas"><div className="component-dock-drop-line" /><span>{componentText(locale, 'componentLibrary.preview.canvas')}</span></div><div className="component-dock-panel"><strong>{componentText(locale, 'componentLibrary.preview.color')}</strong><span /><span /><span /></div></div>
}

const previewRenderers: Record<string, (props: { locale: AppLocale }) => ReactElement> = {
  buttons: ButtonsPreview,
  'touch-controls': TouchControlsPreview,
  'icon-button': IconButtonPreview,
  'pixel-utility-icon': PixelUtilityIconPreview,
  'anchor-preset-icons': AnchorPresetIconsPreview,
  'tool-icons': ToolIconPreview,
  'pointer-icons': PointerIconPreview,
  'delete-icon-button': DeleteIconButtonPreview,
  'context-menu': ContextMenuPreview,
  segmented: SegmentedPreview,
  'number-input': NumberInputPreview,
  'text-input': TextInputPreview,
  'text-area-input': TextAreaInputPreview,
  'themed-select': SelectPreview,
  'gradient-dither-select': GradientDitherSelectPreview,
  'form-field': FormFieldPreview,
  'settings-navigation': SettingsNavigationPreview,
  'settings-section': SettingsSectionPreview,
  'settings-section-header': SettingsSectionHeaderPreview,
  range: RangePreview,
  'outline-stroke-controls': OutlineStrokeControlsPreview,
  checkbox: CheckboxPreview,
  switch: SwitchPreview,
  'live-preview-toggle': LivePreviewTogglePreview,
  scrollbar: ScrollbarPreview,
  'panel-header': PanelHeaderPreview,
  'layer-row': LayerRowPreview,
  swatches: SwatchesPreview,
  'brush-thumbnail': BrushThumbnailPreview,
  'tileset-tile-thumbnail': TilesetTileThumbnailPreview,
  'modal-shell': ModalShellPreview,
  'dialog-header': ModalShellPreview,
  'save-progress': SaveProgressPreview,
  status: StatusPreview,
  tooltip: TooltipPreview,
  'tool-options': ToolOptionsPreview,
  'pressure-options': PressureOptionsPreview,
  'color-picker': ColorPickerPreview,
  'color-value': ColorValuePreview,
  'panel-dock': DockPreview
}

export function ComponentLibrary({ onClose }: { onClose: () => void }) {
  const { locale } = useI18n()
  const [category, setCategory] = useState<ComponentCategory>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('buttons')
  const localizedEntries = useMemo(() => COMPONENT_LIBRARY_ENTRIES.map((entry) => localizeEntry(entry, locale)), [locale])
  const filteredEntries = useMemo(() => COMPONENT_LIBRARY_ENTRIES.filter((entry) => {
    const matchesCategory = category === 'all' || entry.category === category
    const localized = localizeEntry(entry, locale)
    const haystack = `${entry.name} ${entry.description} ${entry.source} ${entry.tags.join(' ')} ${localized.name} ${localized.description} ${localized.tags.join(' ')}`.toLowerCase()
    return matchesCategory && haystack.includes(query.trim().toLowerCase())
  }), [category, locale, query])
  const selectedEntry = localizedEntries.find((entry) => entry.id === selectedId) ?? localizedEntries.find((entry) => filteredEntries.some((candidate) => candidate.id === entry.id)) ?? localizedEntries[0]
  const Preview = previewRenderers[selectedEntry.id]

  return <div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <ModalShell storageKey="component-library" defaultWidth={920} defaultHeight={680} minWidth={700} minHeight={500} maxWidth={1200} maxHeight={900} fitContent={false} resizePortalClassName="component-library-resize-portal" className="component-library" role="dialog" aria-modal="true" aria-labelledby="component-library-title">
      <DialogHeader className="component-library-header" eyebrow="MOONSPRITE UI" title={componentText(locale, 'componentLibrary.title')} titleId="component-library-title" description={componentText(locale, 'componentLibrary.subtitle')} closeLabel={componentText(locale, 'componentLibrary.close')} onClose={onClose} />
      <div className="component-library-layout">
        <aside className="component-library-sidebar">
          <label className="component-library-search"><PixelAssetIcon src={toolZoomNormalIcon} /><TextInput density="compact" value={query} placeholder={componentText(locale, 'componentLibrary.search')} aria-label={componentText(locale, 'componentLibrary.search')} onChange={(event) => setQuery(event.target.value)} /></label>
          <nav aria-label={componentText(locale, 'componentLibrary.categories')}>{(Object.keys(categoryLabels) as ComponentCategory[]).map((item) => <button key={item} type="button" className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}><span>{componentText(locale, categoryLabels[item])}</span><small>{item === 'all' ? COMPONENT_LIBRARY_ENTRIES.length : COMPONENT_LIBRARY_ENTRIES.filter((entry) => entry.category === item).length}</small></button>)}</nav>
          <div className="component-library-entry-list component-scrollbar">{filteredEntries.map((entry) => { const localized = localizedEntries.find((item) => item.id === entry.id) ?? entry; return <button key={entry.id} type="button" className={entry.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(entry.id)}><span><strong>{localized.name}</strong><small>{componentText(locale, categoryLabels[entry.category])}</small></span><ChevronRight size={14} /></button> })}{filteredEntries.length === 0 && <p className="component-library-empty">{componentText(locale, 'componentLibrary.noMatch')}</p>}</div>
        </aside>
        <main className="component-library-main">
          <div className="component-library-main-heading"><div><span className="eyebrow">{componentText(locale, 'componentLibrary.eyebrow')}</span><h3>{selectedEntry.name}</h3></div><span className="component-library-id">{selectedEntry.id}</span></div>
          <div key={selectedEntry.id} className={`component-preview-stage ${selectedEntry.id === 'pointer-icons' ? 'component-preview-stage-pointer' : ''}`}><Preview locale={locale} /></div>
          <div className="component-library-details"><div className="component-detail-block"><span>{componentText(locale, 'componentLibrary.details')}</span><p>{selectedEntry.description}</p></div><div className="component-detail-block"><span>{componentText(locale, 'componentLibrary.source')}</span><code>{selectedEntry.source}</code></div><div className="component-detail-block"><span>{componentText(locale, 'componentLibrary.tags')}</span><div className="component-tag-list">{selectedEntry.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></div>
          <div className="component-library-checklist"><strong><PixelUtilityIcon kind="check" />{componentText(locale, 'componentLibrary.checkStatus')}</strong><span><i />{componentText(locale, 'componentLibrary.interactive')}</span><span><i />{componentText(locale, 'componentLibrary.squareLayout')}</span><span><i />{componentText(locale, 'componentLibrary.blue')}</span></div>
        </main>
      </div>
      <footer className="component-library-footer"><span><PixelUtilityIcon kind="properties" />{componentText(locale, 'componentLibrary.registered', { count: COMPONENT_LIBRARY_ENTRIES.length })}</span><span className="component-library-footer-note"><PixelUtilityIcon kind="paletteCenter" />{componentText(locale, 'componentLibrary.footerHint')}</span><button className="primary-button" type="button" onClick={onClose}>{componentText(locale, 'componentLibrary.done')}</button></footer>
    </ModalShell>
  </div>
}
