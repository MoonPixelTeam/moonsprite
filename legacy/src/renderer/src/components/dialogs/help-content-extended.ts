import type { HelpArticle } from './help-content'

export const extendedHelpArticles: HelpArticle[] = [
  {
    id: 'canvas-size', category: 'start', title: ['加大画布，还是放大图像？', 'Canvas size or image size?'],
    steps: [
      ['想在角色周围增加留白：使用「画布尺寸」，增加宽高，并通过锚点决定原内容保留在哪一侧。', 'To add space around a character, use Canvas Size, increase dimensions and choose an anchor to position existing content.'],
      ['例如把 32 × 32 扩展为 64 × 64：居中锚点适合四周留白；左上锚点适合向右、向下扩展。角色本身不会因此变大。', 'For example, expand 32 × 32 to 64 × 64. Center the anchor for space on all sides, or use the top-left anchor to extend right and down. The character itself stays the same size.'],
      ['想把整个角色放大：使用「图像尺寸」。保持宽高比例可以避免角色被拉长或压扁。', 'To enlarge the character itself, use Image Size. Preserve the aspect ratio to avoid stretching or squashing it.'],
      ['像素画放大时优先选择最近邻插值和整数倍率，例如 200% 或 400%，减少模糊与像素宽度不均。', 'For pixel art, prefer nearest-neighbor interpolation and integer scales such as 200% or 400% to avoid blur and uneven pixel widths.'],
      ['缩小画布前检查边界和裁切选项；缩小图像会丢失细节，先另存副本再处理。', 'Check boundaries and trimming options before shrinking the canvas. Reducing image size loses detail, so save a copy first.']
    ],
    tip: ['只想看得更清楚时使用缩放视图，不必修改画布或图像尺寸。', 'To see details more clearly, zoom the view instead of changing canvas or image dimensions.'],
    shortcuts: ['canvasResize', 'imageResize', 'viewZoom100', 'saveAs']
  },
  {
    id: 'layers', category: 'create', title: ['用图层管理线稿、上色和背景', 'Organize outlines, colors and backgrounds'],
    steps: [
      ['把背景放在下方，颜色放中间，线稿放上方。先选图层再画，避免把线稿和底色画到一起。', 'Place the background below colors and outlines above them. Select a layer before drawing to keep these elements separate.'],
      ['为图层起清楚的名字；角色、背景等多层内容可放入图层组，方便整理。', 'Give layers clear names. Use groups to organize multiple layers belonging to a character or background.'],
      ['临时隐藏图层检查遮挡关系；锁定不需要修改的图层，减少误操作。隐藏不等于删除。', 'Temporarily hide layers to inspect overlap. Lock layers you do not need to edit. Hiding a layer does not delete it.'],
      ['尝试大幅修改前复制图层。需要比较效果时切换原层和副本的可见性，避免两份内容同时显示影响判断。', 'Duplicate a layer before major edits. Compare by switching visibility between the original and copy rather than displaying both.'],
      ['合并前确认层顺序、透明度和效果。合并会减少独立编辑的空间，建议在工程副本中进行。', 'Before merging, check layer order, opacity and effects. Merging limits separate editing, so consider working in a project copy.']
    ],
    tip: ['移动工具选中了意外的图层时，检查自动选层选项，或先手动选好目标层。', 'If Move selects an unexpected layer, check auto-select or select the target layer manually.'],
    shortcuts: ['newLayer', 'createLayerGroup', 'duplicateLayer', 'toggleSelectedLayerLock', 'toggleMoveAutoSelect']
  },
  {
    id: 'fill', category: 'create', title: ['油漆桶漏色、填不满怎么调', 'Control bucket fill and color leaks'],
    steps: [
      ['先选择目标图层、颜色和油漆桶，在封闭区域内点击填色。填色前确认没有多余选区限制范围。', 'Select the target layer, color and bucket, then click inside a closed area. Check for selections that may restrict the fill.'],
      ['颜色漏到外面时，放大检查轮廓缺口。可先补上线条；工具支持智能闭合时，也可尝试启用后比较结果。', 'If color leaks out, zoom in and check for gaps in the outline. Close them manually, or try smart closure when available.'],
      ['边缘留下细缝时，检查是否有接近但不相同的颜色。逐步提高容差，每次观察边缘，避免吞掉线稿。', 'If narrow gaps remain, inspect similar but nonidentical colors. Increase tolerance gradually and watch the edges to avoid replacing outlines.'],
      ['连续选项用于限制连通区域；关闭后可能影响其他位置的相似颜色。只想填一个封闭区域时先使用连续模式。', 'Contiguous mode restricts the connected region. Turning it off can affect similar colors elsewhere. Start with contiguous mode for a single enclosed area.'],
      ['在空白颜色层上填色时，检查当前工具的取样范围；只取样空白层时，其他层的线稿可能不会形成边界。', 'When filling on an empty color layer, check the tool’s sampling scope. Sampling only that empty layer may ignore outlines on another layer.']
    ],
    tip: ['填色结果不对，先撤销再调整参数，不要连续点击叠加错误结果。', 'Undo an incorrect fill before changing settings instead of repeatedly filling over it.'],
    shortcuts: ['tool.fill', 'toggleContiguous', 'toggleSmartClosure', 'undo']
  },
  {
    id: 'precise-selection', category: 'create', title: ['精确选区：魔棒、加选与减选', 'Precise selections: wand, add and subtract'],
    steps: [
      ['规则区域用矩形或椭圆，不规则轮廓用套索，沿同色区域选择时用魔棒。', 'Use rectangles or ellipses for regular areas, a lasso for irregular outlines, and the wand for color-based areas.'],
      ['选区没有覆盖完整目标时，切到加选模式继续选择；选多了则切到减选模式移除多余区域。', 'Use Add mode to extend a selection and Subtract mode to remove unwanted areas.'],
      ['魔棒选得太少时逐步提高容差；选到背景时降低容差，并检查取样的是当前层还是可见层。', 'Increase wand tolerance gradually if too little is selected. Lower it if the background is included, and check current-layer versus visible-layer sampling.'],
      ['选中主体后需要处理背景，可以反选。操作前观察选区边界，确认将被修改的是哪一侧。', 'Invert a subject selection to work on the background. Check the outline before editing to confirm which side is selected.'],
      ['选区边框隐藏不代表选区已取消。绘制被限制但看不到边框时，显示选区边框或直接取消选区。', 'Hiding the selection outline does not deselect. If painting is restricted without a visible outline, show it or deselect.']
    ],
    tip: ['选区确定编辑范围，图层和帧决定编辑对象；三者都需要检查。', 'The selection defines the area; layers and frames define the target. Check all three.'],
    shortcuts: ['magic', 'selectionModeAdd', 'selectionModeSubtract', 'invertSelection', 'toggleSelectionOutline', 'deselect']
  },
  {
    id: 'brushes', category: 'create', title: ['调整笔刷并制作重复图案', 'Adjust brushes and make reusable stamps'],
    steps: [
      ['精修像素边缘时先使用小尺寸铅笔；大面积铺色再增大笔刷。检查不透明度，避免误把半透明笔触当成颜色错误。', 'Use a small pencil for pixel edges and a larger brush for broad areas. Check opacity if colors appear unexpectedly faint.'],
      ['需要稳定的笔触形状时，在工具选项中选择圆形、方形等笔刷形状；先在空白图层试画一笔。', 'Choose a brush shape such as round or square in tool options, then test it on an empty layer.'],
      ['把星星、草丛等小图案框选起来，使用「从选区创建笔刷」制成可重复绘制的图像笔刷。', 'Select a small motif such as a star or tuft of grass and use Create Brush from Selection to make a reusable image brush.'],
      ['在笔刷库中选择素材并试画，检查尺寸、间距和当前工具选项是否符合预期，再用于正式图层。', 'Choose a brush in the library and test its size, spacing and tool options before applying it to the artwork.']
    ],
    tip: ['数位笔笔触变化异常时，先用鼠标对比，再检查笔压映射和笔刷动态设置。', 'If pen strokes behave unexpectedly, compare with a mouse, then check pressure mapping and brush dynamics.'],
    shortcuts: ['brushSizeDecrease', 'brushSizeIncrease', 'brushShapeSquare', 'createBrushFromSelection', 'toggleBrushLibraryPanel']
  },
  {
    id: 'palette', category: 'create', title: ['建立统一配色与替换颜色', 'Build a palette and replace colors'],
    steps: [
      ['先确定少量主色、暗部色和高光色，加入调色板；同一材质尽量复用已有颜色。', 'Start with a small set of base, shadow and highlight colors and add them to the palette. Reuse colors for the same material.'],
      ['用吸管从画面拾色，再加入调色板。已有作品也可以使用提取颜色功能整理配色。', 'Pick colors from the canvas and add them to the palette. Extract colors from existing artwork to organize its palette.'],
      ['想统一更换某个颜色时使用颜色替换，先检查目标层、选区和处理范围，再确认结果。', 'Use Color Replacement to change a color consistently. Check the target layers, selection and scope before confirming.'],
      ['整理好的调色板可以保存以便其他作品复用。调整色板顺序前，先确认是否在使用索引色或颜色同步功能。', 'Save palettes for reuse. Before rearranging swatches, check whether indexed color or palette color synchronization is in use.']
    ],
    tip: ['RGBA、索引色和灰度的颜色表达不同，转换色彩模式前先保留原工程。', 'RGBA, indexed color and grayscale represent colors differently. Keep the original project before converting modes.'],
    shortcuts: ['tool.eyedropper', 'addForegroundToPalette', 'replaceColor', 'extractPaletteColors', 'savePalette']
  },
  {
    id: 'linked-frames', category: 'create', title: ['动画多帧一起变了：理解链接帧', 'Why several animation frames change together'],
    steps: [
      ['动画的每一列代表帧，图层与帧相交的位置是单元格。先确认选中的单元格属于哪个图层和帧。', 'Each timeline column is a frame; a layer/frame intersection is a cel. Check which layer and frame your selected cel belongs to.'],
      ['链接单元格共享图像，适合多个帧保持不变的背景。修改共享内容时，其他链接位置也会变化。', 'Linked cels share an image, which is useful for unchanged backgrounds. Editing shared content changes other linked positions too.'],
      ['需要单独修改某一帧时，先选中对应单元格并断开链接，再绘制变化。', 'To edit a frame independently, select its cel and disconnect the link before drawing.'],
      ['需要完全空白的下一帧时添加空白帧；需要复用内容时，根据是否应同步修改选择普通帧或链接帧。', 'Add a blank frame for an empty next pose. When reusing content, choose ordinary or linked frames according to whether edits should stay synchronized.'],
      ['发现整段动画意外变化时先撤销，再检查链接关系，避免逐帧重复修补共享图像。', 'Undo unexpected changes across an animation and inspect links before trying to repair shared content frame by frame.']
    ],
    tip: ['“选中多个帧”和“帧之间有链接”是两件事，排查时都要检查。', 'Selecting multiple frames and linking cels are different. Check both when troubleshooting.'],
    shortcuts: ['addBlankAnimationFrame', 'addLinkedAnimationFrame', 'disconnectAnimationCels', 'openAnimationCelProperties']
  },
  {
    id: 'animation-timing', category: 'create', title: ['动画太快、太慢或循环不顺', 'Fix animation timing and rough loops'],
    steps: [
      ['先把预览播放速度设为 100%，再判断动画本身的节奏，避免把临时预览倍率当成帧时长。', 'Set preview speed to 100% before judging timing so a temporary speed multiplier does not mislead you.'],
      ['在帧属性中调整时长：时长越大，该帧停留越久。停顿姿态可以更长，快速过渡可以更短。', 'Adjust duration in Frame Properties. Longer durations hold a pose longer; shorter ones create quicker transitions.'],
      ['使用洋葱皮比较相邻帧的位置，减少角色无意的抖动，尤其留意脚底或其他固定接触点。', 'Compare neighboring frames with onion skin to reduce unintended jitter, especially at feet or other fixed contact points.'],
      ['循环动画要比较末帧到首帧的衔接。首尾两帧完全相同可能产生额外停顿，按实际效果决定是否保留。', 'Check the last-to-first transition. Identical first and last poses can add a pause; keep them only if that timing is intended.'],
      ['导出后再播放一遍，确认帧范围和速度；不要只根据编辑器中一次预览判断最终文件。', 'Play the exported result to verify its frame range and timing rather than relying only on an editor preview.']
    ],
    tip: ['调整预览播放倍率方便检查动作，但应通过帧时长设计作品的实际节奏。', 'Preview speed helps inspect motion; frame durations define the intended timing.'],
    shortcuts: ['openAnimationFrameProperties', 'animationPlaybackSpeed100', 'toggleOnionSkin', 'toggleAnimationPlayback']
  },
  {
    id: 'sprite-sheet', category: 'create', title: ['把动画导出为游戏用精灵表', 'Export animation as a game sprite sheet'],
    steps: [
      ['先确认动画各帧的画布尺寸一致，以及角色在帧中的基准位置稳定，避免引擎播放时跳动。', 'Check consistent canvas dimensions and a stable character origin across frames to avoid jitter in the engine.'],
      ['从「文件 → 导出」选择精灵表，检查输出帧范围、排列方式以及每行或每列的设置。', 'Choose sprite sheet export from File → Export and check the frame range, layout and row or column settings.'],
      ['根据引擎导入要求设置边距和间距；在引擎中切片时使用相同参数，否则会出现偏移或切到相邻帧。', 'Set margins and spacing to match the engine’s import requirements. Use the same values when slicing in the engine.'],
      ['像素素材通常按原始尺寸输出，让引擎控制显示倍率。需要透明背景时选择支持透明通道的格式。', 'Usually export pixel assets at their original size and let the engine control display scale. Choose an alpha-capable format for transparency.'],
      ['导入引擎后检查纹理过滤和缩放方式。图片本身清晰而游戏里模糊时，也要检查引擎设置。', 'Check texture filtering and scaling after importing. If a sharp image looks blurry in-game, inspect engine settings too.']
    ],
    tip: ['精灵表保存帧图像；播放顺序、帧时长等信息还需要按引擎的导入流程配置。', 'A sprite sheet stores frame images; configure playback order and timing through your engine’s import workflow.'],
    shortcuts: ['exportSpriteSheet', 'exportAllFrames']
  },
  {
    id: 'reference', category: 'create', title: ['使用参考图而不改动画面', 'Use reference images alongside your artwork'],
    steps: [
      ['使用「添加参考图」或「粘贴为参考图」放入素材；参考图用于辅助观察，不等同于普通绘画图层。', 'Use Add Reference Image or Paste as Reference Image. A reference assists observation and is not an ordinary painting layer.'],
      ['调整参考图位置、缩放和透明度，让它不遮住正在绘制的区域。', 'Adjust reference position, scale and opacity so it does not obstruct your working area.'],
      ['摆好后锁定参考图，减少误拖动；需要调整时再解锁。', 'Lock a reference after positioning it to avoid accidental drags; unlock it when adjustments are needed.'],
      ['希望参考图固定在屏幕上时使用独立浮动，或者打开参考图浮窗；需要和画布一起移动时关闭独立浮动。', 'Use independent floating or a reference window to keep it separate from canvas movement. Disable independent floating when it should follow the canvas.']
    ],
    tip: ['如果目的是让图片成为作品中的像素内容，应导入到绘画内容中，而不是只添加为参考图。', 'If an image should become artwork pixels, import it into the artwork rather than adding only a reference.'],
    shortcuts: []
  },
  {
    id: 'seamless', category: 'create', title: ['检查无缝纹理和对称图案', 'Check seamless textures and symmetry'],
    steps: [
      ['绘制地面、水面等重复纹理时，在「窗口 → 平铺预览」选择横向、纵向或包围平铺。', 'For repeating ground or water textures, choose horizontal, vertical or surrounding tiling in Window → Tile Repeat.'],
      ['观察相邻副本交界处是否有断线、明暗突变或重复感明显的孤立图案，再回到边缘修改。', 'Inspect joins between copies for broken lines, abrupt tone changes or conspicuous motifs, then adjust the edges.'],
      ['使用对称功能绘制对称角色或装饰前，先确认对称轴和中心位置，在空白层试画。', 'Before drawing symmetrical characters or ornaments, check the symmetry axes and center, then test on an empty layer.'],
      ['完成对称部分后关闭不再需要的对称模式，避免后续补细节时在另一侧产生额外笔触。', 'Turn off symmetry modes when finished so detail work does not create unwanted strokes elsewhere.']
    ],
    tip: ['平铺预览用于检查接缝，不会自动把导出图片扩展成多份纹理。', 'Tile preview helps inspect seams; it does not automatically export multiple copies of the texture.'],
    shortcuts: ['tileRepeatBoth', 'tileRepeatOff', 'toggleSymmetryHorizontal', 'toggleSymmetryVertical', 'resetSymmetryCenter']
  },
  {
    id: 'performance', category: 'fix', title: ['复杂画布操作卡顿怎么排查', 'Troubleshoot slow operations on complex canvases'],
    steps: [
      ['先保存工程，观察卡顿出现在绘制、移动选区、播放动画还是滤镜预览，尽量找到可以重复触发的一步。', 'Save first and identify whether the slowdown occurs while drawing, moving a selection, playing animation or previewing a filter. Find a repeatable step.'],
      ['滤镜调参时关闭实时预览再比较；动画卡顿时先停播，检查是否只有播放状态下才慢。', 'Try disabling live preview while adjusting filters. Stop animation playback to see whether the slowdown is limited to playback.'],
      ['移动选区前检查是否同时选中了很多帧或图层。只需移动一处时，把编辑范围缩小到目标层和帧。', 'Check whether many layers or frames are selected before moving content. Restrict editing to the intended layer and frame when possible.'],
      ['临时关闭不需要的洋葱皮、平铺预览或额外预览面板，比较操作是否改善，再逐项恢复。', 'Temporarily turn off unneeded onion skin, tile repeat or extra preview panels, compare responsiveness, then restore them one at a time.'],
      ['反馈时记录画布尺寸、图层数、帧数、操作范围和持续时间，并附上对应诊断记录；有条件时提供能复现的工程副本。', 'Report canvas dimensions, layer and frame counts, edit scope and delay duration, with diagnostic records and a reproducible project copy if possible.']
    ],
    tip: ['不要为了测试速度直接删除原作品的图层或动画帧；需要简化工程时使用副本。', 'Do not delete original layers or frames just to test performance. Simplify a copy instead.'],
    shortcuts: ['save', 'toggleOnionSkin', 'tileRepeatOff', 'toggleAnimationPlayback']
  },
  {
    id: 'shortcut-trouble', category: 'fix', title: ['快捷键无效或执行了别的操作', 'Shortcuts do nothing or trigger another action'],
    steps: [
      ['先检查输入焦点：正在编辑名称、数值或文字时，按键可能由输入框处理。结束输入后再回到目标面板。', 'Check focus first. A name, number or text field may handle keys while editing. Finish input and return to the intended panel.'],
      ['关闭不再使用的弹窗或菜单。某些操作在弹窗打开、拖动或绘制尚未结束时会被阻止。', 'Close unused dialogs or menus. Some commands are blocked during dialogs, drags or unfinished strokes.'],
      ['打开下方快捷键设置，按命令名称查找实际绑定，检查是否被修改、清空或与其他命令冲突。', 'Open Shortcut settings below, find the command and inspect its binding for changes, missing keys or conflicts.'],
      ['同一按键在画布和时间轴中可能有不同用途。例如取消选区与复制动画单元格需要结合当前操作区域判断。', 'A key may have different uses on the canvas and timeline. Deselecting and copying animation cels depend on the current operation context.'],
      ['尝试通过菜单执行同一命令：菜单有效而快捷键无效时，优先检查焦点与绑定；菜单也无效时，检查文档和选择状态。', 'Try the equivalent menu command. If it works, check focus and bindings. If it also fails, check document and selection state.']
    ],
    tip: ['本帮助中的按键来自当前设置；“未设置”的命令可在快捷键设置中自行绑定。', 'Keys in this guide come from your settings. Assign commands marked Not assigned in Shortcut settings.'],
    shortcuts: ['openShortcutSettings', 'deselect', 'copyAnimationCel']
  },
  {
    id: 'export-trouble', category: 'fix', title: ['导出模糊、背景不透明或帧不完整', 'Fix blurry exports, opaque backgrounds or missing frames'],
    steps: [
      ['先确认导出的是当前静态帧、动画还是帧序列；只导出静态图片不会包含整段动画。', 'Check whether you are exporting a still frame, animation or frame sequence. A still image does not contain the whole animation.'],
      ['检查图层可见性与帧范围，确认需要输出的内容已包含在导出范围中。', 'Check layer visibility and frame range to ensure all intended content is included.'],
      ['透明背景需要支持透明度的格式，并且画面中不能有覆盖全画布的不透明背景层。', 'Transparency requires a format with transparency support and no opaque background layer covering the canvas.'],
      ['像素边缘模糊时对比原尺寸导出，检查是否使用了非整数倍率或平滑插值。也要确认查看器没有额外平滑缩放。', 'Compare a native-size export if edges look blurry. Check for fractional scaling or smooth interpolation, including scaling applied by the viewer.'],
      ['导出报错时记录错误信息，尝试另一个有写入权限的目录，并检查目标文件是否被其他程序占用。保留可编辑工程后再排查。', 'If export fails, record the error, try another writable folder and check whether another program holds the destination file. Keep an editable project saved while troubleshooting.']
    ],
    tip: ['先用少量帧和原尺寸验证设置，再导出整段动画，可以更快发现范围和格式问题。', 'Verify settings with a few frames at native size before exporting the full animation.'],
    shortcuts: ['exportDocument', 'exportAllFrames', 'save']
  }
]
