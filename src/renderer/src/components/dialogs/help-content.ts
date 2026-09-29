import type { ShortcutId } from '@/core/shortcuts'
import { extendedHelpArticles } from './help-content-extended'

type Text = [string, string]
export interface HelpArticle {
  id: string
  category: 'start' | 'create' | 'fix'
  title: Text
  steps: Text[]
  tip: Text
  shortcuts: ShortcutId[]
}

export const helpArticles: HelpArticle[] = [
  {
    id: 'first-art', category: 'start', title: ['完成第一张像素画', 'Create your first pixel artwork'],
    steps: [
      ['在「文件 → 新建」设置画布尺寸。初次练习可以从 32 × 32 像素开始。', 'Choose File → New and set the canvas size. Try 32 × 32 pixels for a first exercise.'],
      ['在工具栏选择铅笔，在调色板选颜色，然后在画布上绘制。用橡皮擦除，用吸管拾取已有颜色。', 'Select the pencil and a palette color, then draw on the canvas. Use the eraser to remove pixels and the eyedropper to pick existing colors.'],
      ['通过图层面板添加图层，把线稿、颜色或背景分开；绘制前确认当前选中的图层。', 'Add layers in the Layers panel to separate outlines, colors and backgrounds. Check the active layer before drawing.'],
      ['用「文件 → 保存」保留可继续编辑的工程，再用「文件 → 导出」生成用于分享的图片。', 'Use File → Save to keep an editable project, then File → Export to create an image for sharing.']
    ],
    tip: ['放大画布只是改变观看比例，不会增加图片像素。', 'Zooming changes the view, not the number of pixels in your image.'],
    shortcuts: ['newDocument', 'tool.pencil', 'tool.eraser', 'tool.eyedropper', 'save']
  },
  {
    id: 'selection', category: 'create', title: ['选中、移动与变换局部内容', 'Select, move and transform part of an image'],
    steps: [
      ['先确认当前图层和帧，再用矩形、椭圆、套索或魔棒选出要编辑的区域。', 'Check the active layer and frame, then select an area using a rectangle, ellipse, lasso or magic wand.'],
      ['选择移动工具拖动选中内容，或用方向键微调位置。注意区分移动像素与调整选区边界。', 'Use the Move tool to drag selected content, or use arrow keys for small adjustments. Moving pixels and changing a selection boundary are different operations.'],
      ['需要缩放或旋转时使用变换，完成后确认变换；继续绘制前，按需要取消选区。', 'Use Transform to scale or rotate, then confirm the transformation. Deselect when you want to draw outside that area.'],
      ['同时编辑多个图层或帧前，检查图层面板和时间轴中的选中范围；不确定时先在单层单帧上操作。', 'Before editing multiple layers or frames, check the selected range in Layers and the timeline. Start with one layer and one frame if unsure.']
    ],
    tip: ['画笔只能作用于有效选区内。看起来“画不出来”时，先检查是否还留着选区。', 'Painting is limited to the active selection. If strokes seem to do nothing, check for a remaining selection.'],
    shortcuts: ['tool.selection', 'lasso', 'magic', 'tool.move', 'transform', 'deselect']
  },
  {
    id: 'animation', category: 'create', title: ['制作逐帧动画', 'Create a frame-by-frame animation'],
    steps: [
      ['在时间轴中选择当前帧，完成第一帧的图像。', 'Select the current frame in the timeline and draw the first pose.'],
      ['添加动画帧，再修改下一帧的姿态。想让两帧内容独立变化时，留意是否使用了链接帧。', 'Add an animation frame and edit the next pose. Check whether cels are linked if you want frames to change independently.'],
      ['打开洋葱皮参考相邻帧；播放动画检查动作，再调整帧时长和画面。', 'Enable onion skin to reference neighboring frames. Play the animation, then adjust frame durations and poses.'],
      ['分享时导出动画 GIF；交给游戏引擎时可导出精灵表或帧序列。', 'Export an animated GIF for sharing, or a sprite sheet or frame sequence for a game engine.']
    ],
    tip: ['链接的单元格共享内容；改动一处可能影响其他链接帧。', 'Linked cels share content. Editing one can affect other linked frames.'],
    shortcuts: ['addAnimationFrame', 'toggleOnionSkin', 'toggleAnimationPlayback']
  },
  {
    id: 'color', category: 'create', title: ['调整颜色与使用滤镜', 'Adjust colors and apply filters'],
    steps: [
      ['先选好图层、帧和需要处理的区域，再从「编辑」菜单选择颜色调整或滤镜。', 'Select the layer, frame and area to process, then choose a color adjustment or filter from Edit.'],
      ['用色相与饱和度调整整体色调，用曲线调整明暗，用渐变映射重新分配颜色。', 'Use Hue/Saturation to shift colors, Curves to adjust tones, and Gradient Map to remap colors.'],
      ['在支持实时预览的窗口中比较效果；满意后确认，不需要则取消。复杂画布上可关闭实时预览再调整参数。', 'Compare the result in dialogs that support live preview. Confirm to keep it or cancel to discard it. On complex canvases, turn off live preview while changing parameters.']
    ],
    tip: ['较大的调整前先保存工程，或复制图层用于比较原图。', 'Save your project or duplicate the layer before a major adjustment.'],
    shortcuts: ['adjustmentHueSaturation', 'adjustmentCurves']
  },
  {
    id: 'export', category: 'start', title: ['保存工程与导出素材', 'Save projects and export assets'],
    steps: [
      ['保存工程用于保留后续编辑需要的信息；导出图片用于分享或在其他软件中使用，两者用途不同。', 'Save a project to preserve editable information. Export images for sharing or use in other software.'],
      ['需要另存一个版本时使用「另存为」，避免覆盖想保留的工程。', 'Use Save As to keep a separate version without overwriting the project you want to retain.'],
      ['静态素材选择图片导出；动画选择 GIF、帧序列或精灵表，并检查输出范围、尺寸与透明背景。', 'For static artwork, export an image. For animation, choose GIF, a frame sequence or a sprite sheet, and check the range, dimensions and transparency.'],
      ['导出后打开结果确认尺寸、颜色和动画播放。PNG 适合需要透明背景的静态素材。', 'Open the exported result to check dimensions, colors and animation playback. PNG works well for static assets with transparency.']
    ],
    tip: ['导出一张 PNG 不等于保存了可编辑的多图层工程。', 'Exporting a PNG does not save an editable multilayer project.'],
    shortcuts: ['save', 'saveAs', 'exportDocument', 'exportSpriteSheet']
  },
  {
    id: 'workspace', category: 'start', title: ['调整视图、面板与快捷键', 'Arrange your view, panels and shortcuts'],
    steps: [
      ['用抓手移动画布视图，用缩放工具改变观看比例。不要用移动工具代替抓手，移动工具会编辑内容。', 'Use the Hand tool to pan and Zoom to change magnification. The Move tool edits content; use Hand when you only want to move the view.'],
      ['面板不见时先检查「窗口」菜单中的显示选项；根据工作习惯调整图层、调色板和时间轴。', 'If a panel is missing, check visibility options in Window. Arrange Layers, Palette and the timeline for your workflow.'],
      ['点击下方「快捷键设置」查看或修改按键。本帮助显示的是当前设置，而不是固定的默认快捷键。', 'Open Shortcut settings below to inspect or change bindings. Shortcuts shown here reflect your current settings, not fixed defaults.']
    ],
    tip: ['旋转或镜像视图用于观察作品；修改实际像素时，应使用内容变换命令。', 'Rotate or mirror the view to inspect your artwork. Use content transformation commands to change the actual pixels.'],
    shortcuts: ['tool.hand', 'tool.zoom', 'openShortcutSettings']
  },
  {
    id: 'cannot-draw', category: 'fix', title: ['画不出来、只画出一部分', 'Strokes are missing or clipped'],
    steps: [
      ['检查当前图层是否可见、是否锁定，以及是否选中了可绘制的图层和正确的动画帧。', 'Check that the active layer is visible, unlocked and paintable, and that the correct animation frame is selected.'],
      ['检查是否有残留选区；不需要限制范围时取消选区。', 'Look for an active selection. Deselect if you do not want to restrict painting.'],
      ['检查画笔大小、不透明度和当前颜色的透明度，再换一个明显的颜色试画。', 'Check brush size, opacity and the selected color’s alpha, then try a clearly visible color.'],
      ['如果变换或预览窗口还未完成，先确认或取消当前操作，再返回画布。', 'If a transformation or preview dialog is still active, confirm or cancel it before returning to the canvas.']
    ],
    tip: ['先检查这些状态，可以避免误以为画布内容丢失而重复绘制。', 'Check these states before repainting content that may only be hidden or clipped.'],
    shortcuts: ['deselect', 'tool.pencil']
  },
  {
    id: 'undo', category: 'fix', title: ['突然无法撤销怎么办', 'Undo suddenly stops working'],
    steps: [
      ['先松开鼠标或数位笔，确认没有正在拖动、绘制或尚未结束的变换操作。', 'Release the mouse or pen and check for an unfinished stroke, drag or transformation.'],
      ['退出文字输入框，再使用「编辑」菜单中的撤销。输入框获得焦点时，按键可能只作用于文字。', 'Leave any text field, then use Undo in the Edit menu. While a text field has focus, keys may affect only its text.'],
      ['检查撤销菜单是否可用。没有可撤销记录时，重复按快捷键不会恢复内容；关闭并重新打开工程也不等于恢复上次会话的撤销历史。', 'Check whether Undo is available. Repeated shortcuts cannot restore content without history; reopening a project does not restore the previous session’s undo history.'],
      ['若刚画的笔触也无法撤销，先另存当前作品，再打开诊断日志。记录使用的工具、上一项操作、是否使用数位板，以及菜单撤销是否也失效。', 'If even a fresh stroke cannot be undone, save a separate copy first and open diagnostic logs. Note the tool, preceding action, pen/tablet use and whether menu Undo also fails.']
    ],
    tip: ['不要为了尝试恢复撤销而直接关闭未保存的工程。', 'Do not close an unsaved project just to try to restore Undo.'],
    shortcuts: ['undo', 'redo', 'saveAs']
  },
  {
    id: 'missing-content', category: 'fix', title: ['移动后内容不见或位置不对', 'Content disappears or moves unexpectedly'],
    steps: [
      ['先查看当前帧、图层可见性和选中范围，确认没有切到另一帧或隐藏图层。', 'Check the current frame, layer visibility and selection range for an accidental frame switch or hidden layer.'],
      ['检查是否把内容移到了画布外，或同时选中了多个图层、帧。停止继续编辑，按需要撤销刚才的移动。', 'Check whether content moved outside the canvas or multiple layers or frames were selected. Stop further edits and undo the move if needed.'],
      ['重新操作时先只选一个图层和帧，区分移动内容与平移视图，观察哪一步开始异常。', 'Retry on one layer and frame. Distinguish moving content from panning the view, and note the first step that behaves incorrectly.'],
      ['问题重复出现时，另存工程副本并记录复现步骤，附上截图和诊断日志。', 'If the issue repeats, save a project copy and record reproduction steps, screenshots and diagnostic logs.']
    ],
    tip: ['检查可见性和帧之前，不要急着合并图层或覆盖原工程。', 'Check visibility and frames before merging layers or overwriting the original project.'],
    shortcuts: ['undo', 'tool.hand', 'tool.move']
  },
  {
    id: 'recovery', category: 'fix', title: ['异常退出、备份与问题反馈', 'Recovery, backups and reporting problems'],
    steps: [
      ['异常退出后重新打开软件，检查首页提供的恢复草稿；恢复后先另存并检查内容。', 'After an unexpected exit, reopen the app and check recovery drafts on the home screen. Save a recovered copy and inspect its contents.'],
      ['如果已启用工程备份，可从「文件」菜单的回档入口查看可用备份；是否能恢复取决于是否已有有效备份。', 'If project backups were enabled, use the rollback entry in File to inspect available backups. Recovery depends on having a valid backup.'],
      ['反馈问题时提供软件版本、操作步骤、预期与实际结果，以及截图或录屏。涉及工程时，优先提供能复现问题的最小副本。', 'When reporting a problem, include the app version, steps, expected and actual results, and a screenshot or recording. Provide a minimal project copy if possible.'],
      ['使用下方「诊断日志」打开日志位置，选取问题发生时的记录；分享前检查文件中是否包含不希望公开的信息。', 'Use Diagnostic logs below to open the log location and find records from the time of the issue. Check for information you do not want to share before sending files.']
    ],
    tip: ['恢复草稿和可选备份不能代替主动保存；恢复前保留现有工程副本。', 'Recovery drafts and optional backups do not replace regular saves. Keep a copy of the current project before restoring.'],
    shortcuts: ['save', 'saveAs']
  },
  ...extendedHelpArticles
]
