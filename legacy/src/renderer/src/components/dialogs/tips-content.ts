import { SHORTCUT_GROUPS } from '@/core/shortcut-contracts'
import type { HelpArticle } from './help-content'
import { featureTips } from './tips-features'

const modifierInstructions: Record<typeof SHORTCUT_GROUPS.modifiers[number], [string, string]> = {
  brushSizeAdjust: ['按住对应修饰键，在画布内左右移动鼠标调整笔刷尺寸，无需按下左键；松开后继续绘制。', 'Hold the modifier and move horizontally over the canvas to resize the brush without pressing the left mouse button. Release to resume drawing.'],
  brushSizeWheelAdjust: ['将指针放在画布上，按住修饰键并滚动滚轮调整笔刷尺寸。不要与普通滚轮的视图操作混淆。', 'Hold the modifier and scroll over the canvas to change brush size. This differs from ordinary wheel navigation.'],
  lineConnectionMode: ['使用支持直线连接的绘画工具时，按住修饰键连接上一落点与新的落点，适合连续折线或像素轮廓。', 'With a drawing tool that supports line connection, hold the modifier to connect the previous point to the new point. Useful for connected segments and outlines.'],
  constrainLineDirections: ['绘制直线时按住方向约束修饰键，让线段沿允许的方向变化，便于画水平、垂直或规则斜线。', 'Hold the direction constraint while drawing a line to restrict it to supported directions for horizontal, vertical or regular diagonal segments.'],
  copySelectionContent: ['已有选区时，在开始移动内容前按住复制修饰键再拖动，保留原位置内容并移动副本。先确认当前工具和图层。', 'With a selection, hold the copy modifier before dragging its content to move a copy while keeping the original. Check the active tool and layer first.'],
  addToSelection: ['使用选区工具时按住加选修饰键，再绘制另一块选区，将范围加入已有选区；需要减选或交集时使用对应选区模式。', 'Hold the add modifier while creating another selection area to add it to the existing selection. Use the relevant modes for subtraction or intersection.'],
  proportionalSelectionTransform: ['拖动选区变换缩放手柄时按住比例约束修饰键，保持宽高比例，避免角色被拉伸。', 'Hold the proportional modifier while dragging a selection scale handle to preserve aspect ratio.'],
  integerSelectionScale: ['缩放选区内容时按住整数缩放修饰键，让缩放使用整数倍率，适合保留像素块的规则尺寸。', 'Hold the integer-scale modifier while scaling selected content to use integer magnification and preserve regular pixel blocks.'],
  snapSelectionRotation: ['旋转选区内容时按住吸附修饰键，让角度按固定步进变化；此操作修改内容，不是旋转视图。', 'Hold the snap modifier while rotating selected content to use angle increments. This changes content rather than the view.'],
  copyLayerOnDrag: ['移动图层内容时，开始拖动前按住复制图层修饰键，以副本进行移动。与只复制选区的操作区分使用。', 'Hold the layer-copy modifier before dragging layer content to move a duplicate. Distinguish this from copying only selected pixels.'],
  constrainAxis: ['移动内容时按住轴向约束修饰键，限制移动方向，适合只改变横向或纵向位置。', 'Hold the axis constraint while moving content to restrict movement, useful for horizontal or vertical positioning.'],
  snapViewRotation: ['旋转画布视图时按住吸附修饰键，让观看角度按固定步进变化，不改变作品像素。', 'Hold the snap modifier while rotating the canvas view to use angle increments without changing artwork pixels.'],
  resetViewRotation: ['使用旋转视图工具时按住重置修饰键，将视图旋转恢复，便于回到正常方向继续绘制。', 'Use the reset modifier with the view rotation tool to restore the viewing angle and continue drawing upright.']
}

type ModifierId = typeof SHORTCUT_GROUPS.modifiers[number]
const modifierGroups: { id: string; title: [string, string]; shortcuts: ModifierId[] }[] = [
  { id: 'modifier-brushSizeAdjust', title: ['不离开画布调整笔刷尺寸', 'Resize brushes without leaving the canvas'], shortcuts: ['brushSizeAdjust', 'brushSizeWheelAdjust'] },
  { id: 'modifier-lines', title: ['连续直线与方向约束', 'Connected lines and direction constraints'], shortcuts: ['lineConnectionMode', 'constrainLineDirections'] },
  { id: 'modifier-copy', title: ['拖动复制与轴向移动', 'Drag copies and constrain movement'], shortcuts: ['copySelectionContent', 'copyLayerOnDrag', 'constrainAxis'] },
  { id: 'modifier-selection', title: ['加选与精确变换', 'Add selections and transform precisely'], shortcuts: ['addToSelection', 'proportionalSelectionTransform', 'integerSelectionScale', 'snapSelectionRotation'] },
  { id: 'modifier-view', title: ['旋转视图吸附与复位', 'Snap and reset view rotation'], shortcuts: ['snapViewRotation', 'resetViewRotation'] }
]
const modifiers: HelpArticle[] = modifierGroups.map(group => ({
  ...group, category: 'start', steps: group.shortcuts.map(id => modifierInstructions[id]), tip: ['', '']
}))
const temporaryTools: HelpArticle = {
  id: 'temporary-tools', category: 'start', title: ['按住临时切换工具，松开继续画', 'Hold to switch tools temporarily'],
  steps: [
    ['绘制途中，按住临时吸管键取色，松开后接着画；不用来回点击工具栏。', 'While drawing, hold the temporary eyedropper key to sample a color, then release to continue without visiting the toolbar.'],
    ['按住临时抓手键并拖动，可以平移画布；临时移动键则用于移动内容，适合快速修正位置。', 'Hold the temporary Hand key and drag to pan. Temporary Move edits content, useful for quick position corrections.']
  ], tip: ['其他工具也可以在快捷键设置中配置临时切换键。', 'Configure temporary bindings for other tools in Shortcut settings.'],
  shortcuts: ['tool.eyedropper.quick', 'tool.hand.quick', 'tool.move.quick']
}
export const tipsArticles: HelpArticle[] = [...modifiers, temporaryTools, ...featureTips]
