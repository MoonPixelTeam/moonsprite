import type { HelpArticle } from './help-content'

export const featureTips: HelpArticle[] = [
  {
    id: 'feature-tween', category: 'fix', title: ['动画补间与可复用运动路径', 'Animation tweening and reusable motion paths'],
    steps: [
      ['在时间轴准备起止姿态，再打开动画补间设置。先确认参与的图层或组和帧范围，避免让不需要移动的背景参与。', 'Prepare start and end poses in the timeline, then open tween settings. Check layers or groups and frame range so static backgrounds are not included accidentally.'],
      ['根据效果选择运动、形变或淡入淡出，设置中间帧数量并预览；像素画需要特别检查轮廓在中间帧是否合理。', 'Choose motion, deformation or fading as appropriate, set intermediate frames and preview. Inspect pixel outlines in the generated poses.'],
      ['通过缓动曲线控制变化快慢。曲线调整进度分布，不改变每帧时长；实际播放节奏仍需结合帧时长检查。', 'Use easing curves to control progress over time. Easing does not change frame duration, so check both for timing.'],
      ['需要沿弧线或复杂路线移动时打开路径编辑器。路径可保存到路径库，在其他工程中载入复用；载入后检查锚点和画布范围。', 'Open the path editor for curved or complex movement. Save paths to the library for reuse in other projects, then check anchors and canvas bounds after loading.']
    ], tip: ['先预览再生成；锁定层、背景层和部分特殊图层可能不参与补间，以窗口提示的范围为准。', 'Preview before generating. Locked, background and some specialized layers may be excluded; check the scope shown in the dialog.'], shortcuts: []
  },
  {
    id: 'feature-tiles', category: 'fix', title: ['瓦片地图与自由瓦片', 'Tilemaps and free tiles'],
    steps: [
      ['规则地形适合瓦片地图图层：先准备瓦片集，再用瓦片搭建重复地图，减少逐块复制像素的工作。', 'Use tilemap layers for regular terrain. Prepare a tileset and build repeated maps with tiles instead of copying pixels manually.'],
      ['注意编辑、创建、混合和绘制等模式的区别，操作前查看当前模式。修改共享瓦片源可能影响所有使用它的位置。', 'Check whether Edit, Create, Hybrid or Paint mode is active. Changes to a shared tile source can affect all its uses.'],
      ['需要更自由地摆放重复素材时使用自由瓦片，区分瓦片源属性与实例属性：前者管理素材，后者管理摆放的对象。', 'Use free tiles for more flexible placement. Source properties manage the asset; instance properties manage placed objects.'],
      ['可对自由瓦片实例旋转或镜像，快速制作变化。需要直接按像素绘制时，先确认是否应转换为栅格图层，并保留副本。', 'Rotate or mirror free-tile instances for variations. If direct pixel editing is needed, consider raster conversion and retain a copy.']
    ], tip: ['改一个地方却多处一起变化时，先检查是否引用了同一瓦片源。', 'If several locations change together, check whether they share a tile source.'], shortcuts: ['newTilemapLayer', 'newFreeTileLayer', 'tilemapModeEdit', 'tilemapModePaint', 'openFreeTileSourceProperties', 'openFreeTileInstanceProperties']
  },
  {
    id: 'feature-masks', category: 'fix', title: ['蒙版、剪贴与图层样式', 'Masks, clipping and layer styles'],
    steps: [
      ['想暂时隐藏部分内容而保留原图时，使用图层或组蒙版；绘制前确认当前编辑的是图像还是蒙版。', 'Use a layer or group mask to hide parts while retaining the original image. Check whether you are editing the image or mask.'],
      ['需要让上色受到下方内容范围约束时，可尝试剪贴蒙版。先检查图层顺序和下方内容是否存在。', 'Try a clipping mask to constrain color to content below. Check layer order and the presence of underlying content.'],
      ['通过图层样式统一设置效果；对相似图层使用复制、粘贴样式，减少重复调参。', 'Configure effects through layer styles. Copy and paste styles between similar layers to avoid repeated setup.'],
      ['效果不对时先切换样式开关比较，不必立即清除样式或合并图层。', 'Toggle styles to compare results before clearing them or merging layers.']
    ], tip: ['蒙版、剪贴和图层可见性都可能让内容暂时不可见，排查时分别检查。', 'Masks, clipping and layer visibility can all hide content. Check them separately.'], shortcuts: ['toggleLayerMask', 'toggleGroupMask', 'toggleClippingMask', 'openLayerStyles', 'copyLayerStyles', 'pasteLayerStyles']
  },
  {
    id: 'feature-fast-edit', category: 'create', title: ['复制合并、快速描边与内容对齐', 'Merged copy, quick outlines and content alignment'],
    steps: [
      ['需要把多层可见效果作为一张图复制时，使用复制合并，避免为了复制而破坏原来的图层结构。', 'Use Copy Merged to copy the visible composite without merging the original layer structure.'],
      ['粘贴为新图层方便继续合成，粘贴为新工程适合独立处理素材；根据目标选择不同粘贴命令。', 'Paste as New Layer for compositing, or as New Document for independent editing. Choose the command for your destination.'],
      ['给图标或角色加轮廓时使用描边或快速描边，先确认选区、颜色和厚度，检查是否影响透明边缘。', 'Use Outline or Quick Outline for icons and characters. Check selection, color and thickness, especially at transparent edges.'],
      ['用内容居中、翻转和固定角度旋转快速整理素材。内容变换会修改像素布局，与镜像视图不同。', 'Use content centering, flipping and fixed-angle rotation to arrange assets. Content transformations change pixel layout, unlike view mirroring.']
    ], tip: ['多层效果复制前检查可见性，粘贴后检查目标图层和位置。', 'Check visibility before copying a composite and the target layer and position after pasting.'], shortcuts: ['copyMerged', 'pasteAsNewLayer', 'pasteAsNewDocument', 'quickOutline', 'outline', 'centerContentBoth', 'flipHorizontal', 'rotateContentClockwise']
  },
  {
    id: 'feature-timelapse', category: 'fix', title: ['缩时录像记录创作过程', 'Record your process with timelapse'],
    steps: [
      ['从「文件 → 缩时视频」查看录制状态与设置，开始正式绘画前先确认已启用需要的记录功能。', 'Open File → Timelapse to inspect recording status and settings before starting your artwork.'],
      ['按需要决定是否记录撤销步骤：记录全部尝试适合展示探索过程，只保留有效步骤更适合简洁回放。', 'Choose whether to record undo steps. Including attempts shows exploration; keeping effective steps makes a cleaner replay.'],
      ['作品完成后预览录像，再设置导出参数并导出。保存工程和导出录像是不同操作。', 'Preview the recording when finished, then configure and export it. Saving a project and exporting a recording are separate actions.'],
      ['录像保存在本机录像库；另存工程时留意是否携带录像，迁移电脑前单独检查录像是否一起转移。', 'Recordings are kept in the local recording library. Check whether Save As includes recordings, and verify transfer when moving to another computer.']
    ], tip: ['未记录的过去操作无法靠后期开启录像补回。', 'Enabling recording later cannot reconstruct earlier unrecorded actions.'], shortcuts: ['openTimelapse', 'saveAs']
  },
  {
    id: 'feature-layout', category: 'create', title: ['浮窗、工作区布局与快捷面板', 'Floating panels, layouts and popup panels'],
    steps: [
      ['绘画与动画可以使用不同布局：按需要安排调色板、图层、预览和时间轴，再保存工作区布局。', 'Use different layouts for drawing and animation. Arrange Palette, Layers, Preview and timeline, then save the workspace layout.'],
      ['通过工作区管理切换布局；面板不见时先检查窗口菜单中的显示选项，再考虑重置布局。', 'Switch layouts in workspace management. Check panel visibility in Window before resetting a layout.'],
      ['快捷面板适合临时取色或选择笔刷，下方可查看颜色、调色板、图层、预览、瓦片集和笔刷库的当前呼出键。', 'Popup panels are useful for brief color or brush selection. Current bindings for Color, Palette, Layers, Preview, Tileset and Brush Library appear below.'],
      ['窄面板中的部分操作会收进更多菜单；找不到按钮时先展开更多操作，或适当加宽面板。', 'Narrow panels move some actions into their overflow menus. Check More actions or widen the panel if a button is missing.']
    ], tip: ['调整布局只改变工作环境，不应当作修改作品的撤销步骤。', 'Layout changes affect the workspace rather than artwork history.'], shortcuts: ['saveWorkspaceLayout', 'openWorkspaceManager', 'resetWorkspaceLayout', 'popupColorPanel', 'popupPalettePanel', 'popupLayersPanel', 'popupPreviewPanel', 'popupTilesetPanel', 'popupBrushLibraryPanel']
  },
  {
    id: 'feature-tablet', category: 'fix', title: ['数位笔、触控手势与辅助条', 'Pen input, touch gestures and the helper bar'],
    steps: [
      ['使用触控设备时在偏好设置中检查触控布局、辅助条和手势选项，按设备与习惯启用。', 'On touch devices, inspect touch layout, helper bar and gesture options in Preferences and enable those suited to your device.'],
      ['启用对应手势后，可以用双指撤销、三指重做、长按取色；先在空白工程测试，避免系统手势或驱动设置冲突。', 'When enabled, use two-finger undo, three-finger redo and long-press sampling. Test in a blank project for system or driver conflicts.'],
      ['没有物理键盘时可用辅助条修饰键和选区微调。留意按住状态或锁定状态，完成操作后解除不需要的修饰键。', 'Use helper-bar modifiers and selection nudges without a physical keyboard. Watch held or latched states and release them after use.'],
      ['笔压异常时使用笔输入测试，观察压力变化，再调整笔刷动态；同时用鼠标对比以区分工具设置与设备输入问题。', 'Use the pen input test to inspect pressure, then adjust brush dynamics. Compare with a mouse to distinguish tool settings from input issues.']
    ], tip: ['触控手势是否可用取决于启用状态和设备输入支持。', 'Gesture availability depends on settings and device input support.'], shortcuts: ['openPreferences', 'undo', 'redo']
  },
  {
    id: 'feature-import', category: 'fix', title: ['精灵表导入、切片与工程交换', 'Sprite sheet import, slices and project exchange'],
    steps: [
      ['现成精灵表可通过导入精灵表拆成动画帧；设置帧宽高、间距和边缘处理，检查预览是否切到相邻素材。', 'Import a sprite sheet as animation frames. Set frame dimensions, spacing and edge handling, then inspect the slicing preview.'],
      ['图片序列适合将外部动画逐帧导入；导入后核对顺序和时长，尤其留意文件名编号顺序。', 'Image sequences bring external animation frames into the project. Verify order and durations, especially filename numbering.'],
      ['切片用于标记素材区域，可通过切片工具、自动切片和切片属性管理；交付前核对命名和区域。', 'Slices mark asset regions. Manage them through the Slice tool, Auto Slice and Slice Properties; check names and bounds before delivery.'],
      ['与其他软件交换 .ase 或 .aseprite 工程时，阅读保存时的兼容性提示。保留原生工程，避免特色数据在格式转换中丢失。', 'Read compatibility notices when exchanging .ase or .aseprite files. Keep a native project to preserve specialized data during conversion.']
    ], tip: ['导入成功后先检查帧数、尺寸和图层，再覆盖现有工程。', 'Verify frame count, dimensions and layers before overwriting an existing project.'], shortcuts: ['tool.slice', 'openAutoSlice', 'openSliceProperties', 'saveAs']
  }
]
