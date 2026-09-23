import type { Language } from '../content'
import type { FaqContent } from '../content'

/*
 * The Faq page's copy. It lives beside the page rather than in content.ts so the
 * route can be loaded on demand: this text is 42 kB and nobody
 * reads it on arrival.
 */
const faqPage: Record<Language, FaqContent> = {
  zh: {
    title: '常见问题',
    subtitle: '按主题整理的问题与排查清单：左侧切换主题，右侧跳转到具体问题。',
    categories: [
      {
        id: 'faq-start',
        title: '开始使用',
        items: [
          { id: 'faq-download', q: '现在可以下载 MoonSprite 吗？', a: 'MoonSprite 目前处于 Beta 开发阶段，尚未公开分发。Steam 商店页面准备好后，官网会开放愿望单入口，并同步公布发布渠道与授权方式。' },
          { id: 'faq-system', q: '支持哪些系统？', a: '当前产品面向 Windows 10 与 Windows 11，需要 WebView2 Runtime（安装包会自动处理）。其他桌面平台不在首版范围内。' },
          { id: 'faq-portable', q: '有便携版吗？', a: '有。发布后会同时提供 NSIS 安装包与便携版：便携版解压到任意目录即可运行，gallery、exports、brushes、palettes、scripts 等用户目录就在程序旁边，方便整体备份与迁移。' },
          { id: 'faq-languages', q: '界面支持哪些语言？', a: '当前支持简体中文、英语、日语、韩语、西班牙语、法语、德语、巴西葡萄牙语和俄语。菜单与下拉项会随文字扩宽，空间不足时省略并在悬停时显示完整文字。' },
          { id: 'faq-offline', q: '需要联网吗？', a: '不需要。从绘制到导出的完整流程都在本地完成，不依赖网络。' },
          { id: 'faq-price', q: '会收费吗？', a: '源码可见，允许查看、修改与自行构建；通过 Steam 与授权渠道分发的官方二进制按用户席位授权，可用于个人与商业创作。历史上以 MIT 发布的部分保留原授权。' },
        ],
      },
      {
        id: 'faq-interface',
        title: '界面与工作区',
        items: [
          { id: 'faq-ui-dock', q: '栏目布局可以调整吗？', a: '可以。通过“窗口 > 栏目”显示颜色、调色板、图层、历史记录、图案笔刷、瓦片集与预览；右键栏目标题可隐藏、停靠到左右或底部，或设为悬浮。布局修改会自动保存，也可以用工作区管理保存、切换与复位。' },
          { id: 'faq-ui-tabs', q: '能同时打开多个工程吗？', a: '可以。多个工程以标签形式同时打开，Ctrl+W 关闭当前工程。把标签拖到画布的上、下、左、右区域可以建立分屏，右键标签还能把视图浮出为项目窗口。分屏与浮出只改变显示位置，不会复制文件。' },
          { id: 'faq-ui-temp', q: '有没有快速呼出栏目的办法？', a: '有。默认数字键 1–6 分别临时呼出颜色、调色板、图层、预览、瓦片集与图案笔刷，点击外部、按 Esc 或再次触发即可收回，不会打乱已停靠的布局；已经悬浮的栏目不使用这种临时呼出。' },
          { id: 'faq-ui-history', q: '撤销会记下界面操作吗？', a: '不会。缩放、平移、镜像视图与栏目布局都不属于作品修改，不会进入历史记录；历史记录栏目只显示可到达的编辑步骤。' },
          { id: 'faq-ui-themes', q: '界面外观能改吗？', a: '可以。主题设置里可以选择现有主题，或新建、复制自定义主题；编辑基础色调整界面配色，网格、棋盘格、洋葱皮等辅助视觉可单独覆盖，也可恢复“跟随主题”。内置主题只读，编辑时会建立自定义副本，主题配置可导入导出。本官网的昼夜切换就来自软件的 Dark 与 Light 主题色板。' },
          { id: 'faq-ui-keys', q: '快捷键能改吗？', a: '可以。“编辑 > 快捷键设置”按分类查找命令，可录入一个或多个组合，包含键盘、鼠标中键/侧键和滚轮；工具还支持按住临时切换的“快速选择”键。点击完成才提交整个草稿，取消不保存，配置可导入导出 JSON。' },
        ],
      },
      {
        id: 'faq-canvas',
        title: '画布与导航',
        items: [
          { id: 'faq-canvas-view', q: '缩放、旋转、镜像视图会改到作品吗？', a: '不会。滚轮或缩放工具 Z 改变观察大小，抓手 H 与 Space+拖动改变视窗位置，旋转视图 R 与“窗口 > 镜像视图”只改变观察角度。真正改变输出尺寸要用“调整图像尺寸”，真正翻转像素要用“选择 > 变换”里的翻转。' },
          { id: 'faq-canvas-grid', q: '网格与吸附怎么打开？', a: '“窗口 > 显示”控制像素网格、自定义网格、切片边框与相对明暗；“窗口 > 对齐”开启网格对齐、智能对齐与辅助线。网格对齐需要自定义网格可见，智能对齐会参考画布与其他可见图层的边缘与中心，隐藏辅助线不会关闭吸附。' },
          { id: 'faq-canvas-luminance', q: '相对明暗是做什么的？', a: '“查看相对明暗”用灰度显示明暗关系，方便找出颜色不同但亮度过近的区域。它只是查看方式，不会把工程转换成灰度模式。' },
          { id: 'faq-canvas-tile', q: '怎么做无缝平铺检查？', a: '打开“窗口 > 平铺预览”，选择包围平铺、X 轴或 Y 轴，软件分别显示 3×3、3×1 或 1×3 份副本。可以直接在相邻副本上绘画，结果会映射回原画布，用来跨接缝检查线条与图案是否连续；副本只是编辑视图，导出仍按原画布或所选区域进行。' },
        ],
      },
      {
        id: 'faq-drawing',
        title: '绘画工具与笔刷',
        items: [
          { id: 'faq-drawing-tools', q: '提供哪些绘图工具？', a: '铅笔 B、橡皮擦 E、喷枪 J、直线、曲线、形状 U（矩形、椭圆、自由形状、多边形）、油漆桶 G、渐变 Shift+G、吸管 I、平滑笔刷、液化 Y 与文本 T，覆盖从草图到精修的完整路径。' },
          { id: 'faq-drawing-perfect', q: '什么是完美像素？', a: '“完美像素”会清理路径折角处的多余像素，适合单像素线稿；直线阶梯设置用于均衡斜线的像素段，默认 Shift+Ctrl 连接线时约束到允许方向，阶梯数值可在铅笔属性栏或编辑首选项调整。' },
          { id: 'faq-drawing-brushes', q: '能用我自己的图片当笔刷吗？', a: '可以。打开“窗口 > 栏目 > 图案笔刷”，用添加按钮或直接拖入图片导入；也可以先建立选区再按 Ctrl+B 创建工程笔刷，新笔刷会保留原图颜色与透明度。导入与创建的笔刷宽高都不能超过 256 px，按原始尺寸使用。' },
          { id: 'faq-drawing-brush-modes', q: '图片笔刷的三种对齐方式有什么区别？', a: '“油漆笔刷”沿路径盖章，后一个图案覆盖前一个图案的非透明区域；“图案与来源对齐”把图案固定在来源坐标，同一位置始终是相同纹理；“图案与目标对齐”用首次落点决定图案的平铺起点。' },
          { id: 'faq-drawing-pressure', q: '压感怎么设置？', a: '在铅笔或橡皮擦的笔刷动态里，给大小、强度等效果选择压力或速度输入，并设置输入范围、输出范围、曲线与方向。铅笔还能设置从背景色到前景色的动态渐变。使用笔压时请同时确认“首选项 > 平板与触控”的笔压开关——鼠标没有真实笔压，不能用它的默认压力值代替压感笔。' },
          { id: 'faq-drawing-symmetry', q: '对称绘制怎么用？', a: '在工具属性栏启用水平、垂直、斜向或旋转对称，可以组合使用；拖动轴线或中心改变对称位置，在更多设置里调整轴线外观、锁定或复位中心。选区工具也支持其可用的对称轴。' },
          { id: 'faq-drawing-fill', q: '线稿有缺口，填充会漏出去怎么办？', a: '启用油漆桶的“智能闭合”并调整阈值，软件会按虚拟边界限制填充范围，魔棒也可以使用它。范围仍不合适时，先撤销，再减小阈值或补上线稿缺口。' },
        ],
      },
      {
        id: 'faq-colors',
        title: '颜色与调色板',
        items: [
          { id: 'faq-colors-picker', q: '选色器有哪些形式？', a: '颜色栏目可在月环、饱和度/明度方形、色相/饱和度方形、色轮与法线调色盘之间切换；色相吸附限制可选色相段，颜色级数限制饱和度、明度或透明度层级，适合有限色创作。' },
          { id: 'faq-colors-modes', q: '颜色模式有哪些？', a: '工程支持 RGBA、索引与灰度三种模式，通过“图像 > 颜色模式”转换。索引模式让像素引用调色板颜色，适合有限色作品；转换会改变工程的颜色数据。' },
          { id: 'faq-colors-sync', q: '改了调色板颜色，画布上的颜色也变了？', a: '这是“调色板操作 > 同步颜色”开启后的正常行为：修改色板颜色会替换全部未锁定图层与帧中 RGBA 完全相同的像素；索引模式则通过色板直接改变所引用的颜色。需要逐处控制时，可以关闭同步颜色，或锁定不希望被改动的图层。' },
          { id: 'faq-colors-replace', q: '如何批量替换某个颜色？', a: '使用“编辑 > 替换颜色”（Ctrl+Shift+K），选择来源色与替换色，并指定范围：文档、选区、所选图层、帧、cel、调色板或已有循环节。先确认目标范围，再按需开启预览并执行。' },
          { id: 'faq-colors-extract', q: '如何从画面提取颜色？', a: '调色板的“提取颜色”会从当前画面生成色板，可以新建临时色板、替换当前色板或追加颜色，并限制数量。新色板要通过“保存色板”写入本地才能长期复用，也可以保存为 PNG 色卡。' },
          { id: 'faq-colors-alpha', q: '透明像素如何处理？', a: '画布支持透明像素，导出 PNG、WebP 等支持透明的格式时会原样保留，适合图标与精灵图工作流。' },
        ],
      },
      {
        id: 'faq-selection',
        title: '选区与变换',
        items: [
          { id: 'faq-selection-tools', q: '有哪些选区工具？', a: '矩形 M、椭圆 Shift+M、套索 Q、多边形套索 Shift+Q 与魔棒 W；属性栏可选新建、加选、减选与交集，开始前按住 Shift 可临时加选，右键默认减选。' },
          { id: 'faq-selection-ant', q: '按了 Ctrl+H，为什么还是只能画在局部？', a: 'Ctrl+H 只是隐藏“蚂蚁线”边框，选区本身依然限制绘画。要真正取消选区请按 Ctrl+D。' },
          { id: 'faq-selection-move', q: '拖动选区时图像没有跟着动？', a: '可能拖到了选框边缘——拖内部移动内容，拖边缘只移动选框。也可以用移动工具 V 移动图层的当前帧内容，开启“自动选择图层”后能按画布内容命中图层。' },
          { id: 'faq-selection-transform', q: '变换时有哪些约束键？', a: 'Ctrl+T 进入内容变换：缩放时 Shift 保持比例、Ctrl 按整数倍、Alt 围绕轴心两侧变换；旋转时 Shift 按 45° 吸附。回车确认，Esc 取消当前变换。固定文本框不使用 Ctrl+T，文本请用文本工具调整。' },
          { id: 'faq-selection-flip', q: '不建立选区也能批量翻转吗？', a: '可以。先在图层栏或时间轴选择目标，再用 Shift+H / Shift+V 批量镜像：选中单元格只处理这些格子，仅选图层则处理这些图层的全部帧，整批操作只需一次撤销。隐藏、锁定及文本图层不参与这种整格操作。' },
          { id: 'faq-selection-outline', q: '描边和图层样式的描边有什么区别？', a: '“选择 > 描边”（Shift+O）产生实际的像素编辑，可以用画笔继续修改；图层样式的描边是实时效果，随原图变化，转换为普通图层后才会变成像素。' },
        ],
      },
      {
        id: 'faq-layers',
        title: '图层、蒙版与样式',
        items: [
          { id: 'faq-layer-types', q: '支持哪些图层类型？', a: '普通图层、背景图层、图层组、文本图层、瓦片图层与自由瓦片图层；蒙版与图层样式可以作用在图层或组上。' },
          { id: 'faq-layers-mask', q: '蒙版会改掉原图像素吗？', a: '不会。蒙版用黑色隐藏、白色显示、灰色部分显示，彩色笔触会转为灰度；未绘制区域等效于白色。蒙版按帧独立保存，图层组蒙版作用于整个组的合成结果，原图像素始终保留。' },
          { id: 'faq-layers-styles', q: '图层样式有哪些效果？', a: '描边、阴影、内发光、颜色叠加与渐变叠加。描边的“智能色相”会根据邻近原图颜色生成描边；阴影的“智能阴影”根据阴影下方的背景生成深色，背景变化时随之更新。样式配置跨帧共享，但每帧按自己的内容计算效果。' },
          { id: 'faq-layers-linked', q: '关联图层和关联 cel 是一回事吗？', a: '不是。“关联图层”连接不同图层，让它们在各自对应帧共享像素，同时保留各自的位置、显隐与样式；“关联 cel”连接同一图层的不同帧，共享同一份内容。两者都能同步修改，但作用范围完全不同。' },
          { id: 'faq-layers-merge', q: '合并图层组会合并所有帧吗？', a: '当前实现中，“合并图层组”和“合并可见图层”仍按活动帧生成结果。多帧动画需要保留其他帧时，请使用已逐帧处理的“向下合并”或“合并所选图层”。' },
          { id: 'faq-layers-text', q: '文本图层之后还能修改吗？', a: '可以。双击文本图层或文本 cel 即可继续编辑，字体、字号、字间距、行间距与渲染方式都能调整。文本层不直接接受普通画笔和像素粘贴，需要逐像素修改时使用“转换为 > 普通图层”。' },
        ],
      },
      {
        id: 'faq-animation',
        title: '动画与循环节',
        items: [
          { id: 'faq-timing', q: '每帧的时长可以单独调整吗？', a: '可以。双击帧头即可修改时长，空白帧默认 100 ms；多选帧后可批量处理或拖动排序，至少保留一帧。播放倍率只影响预览速度，不会改写每帧保存的时长。' },
          { id: 'faq-animation-newframe', q: '新增的帧为什么不是空白的？', a: '新增帧按钮默认复制当前帧，产生可独立编辑的副本。需要空白帧时，右键帧头选择“新建空白帧”。' },
          { id: 'faq-animation-timeline', q: '动画时间轴不见了？', a: '检查图层设置里的“隐藏时间轴”。隐藏期间播放与相关操作会停用，但帧数据仍然保留，关闭该设置即可恢复。' },
          { id: 'faq-animation-tween', q: '自动补间能生成什么？', a: '按终点水平/垂直位移、旋转角度、缩放比例与相对不透明度生成过渡帧，可选匀速、加速、减速或先加速后减速，并支持终点预览。它生成的是几何与透明度过渡，不会自动重画角色的中间姿态；预览也不包含蒙版、图层样式与混合效果。' },
          { id: 'faq-onion', q: '洋葱皮是什么？', a: '洋葱皮把相邻帧以淡色叠加显示，作为动作衔接的参考；可设置显示范围、透明度、前后帧颜色，以及播放期间是否显示。它仅供观察，不会进入最终图片。' },
          { id: 'faq-animation-loop', q: '循环节有什么用？', a: '选择连续帧后右键帧头即可创建命名循环节，例如“待机”“行走”，双击括号可编辑名称、起止帧、正反方向与重复次数。循环节既能按次数播放，也能作为 GIF、精灵表或补间的来源范围。' },
        ],
      },
      {
        id: 'faq-tiles',
        title: '瓦片工作流',
        items: [
          { id: 'faq-tiles-what', q: '什么是瓦片图层？', a: '瓦片图层使用可共享的瓦片集：同一个瓦片可以在多处引用，修改源瓦片即可同步所有引用。瓦片集记录网格尺寸与布局，瓦片有稳定的资源 ID。' },
          { id: 'faq-tiles-free', q: '自由瓦片图层有什么不同？', a: '自由瓦片把可复用图案作为实例摆放，实例不需要对齐固定网格，可以重叠；修改共享源会同步全部引用。适合树木、石块、角色零件与装饰物这类重复元素。' },
          { id: 'faq-tiles-modes', q: '四种瓦片编辑模式该怎么选？', a: '原位编辑直接修改已有瓦片，所有引用同步更新；变体创建只替换当前格子的引用，适合做局部变化；混合编辑在已有格中改图、空格中绘制新内容；绘制瓦片只修改格子引用，不动瓦片原图。' },
          { id: 'faq-tiles-changed', q: '改一处，其他位置也跟着变了？', a: '请检查关联图层、关联 cel、共享瓦片与自由瓦片源。只想改一个格子时使用“变体创建”模式；自由瓦片则需要在实例列表里选中实例后再改，或新建源瓦片。' },
        ],
      },
      {
        id: 'faq-files',
        title: '保存、导出与恢复',
        items: [
          { id: 'faq-file-project', q: '工程保存为什么格式？', a: '.moonsprite 是完整的可编辑工程容器，保存图层、动画、瓦片与调色板信息，并在资源管理器中提供缩略图预览。' },
          { id: 'faq-files-open', q: '支持打开哪些文件？', a: '.moonsprite、.ase、.aseprite、PNG、JPEG、WebP、BMP 与 GIF。动画 GIF 会导入为多帧工程，保留可读取的帧顺序、时长与循环信息。PSD 目前只支持导出，不支持作为输入工程。' },
          { id: 'faq-files-export', q: '导出有哪些选项？', a: '静态图支持 PNG（自动索引或 RGBA）、JPEG、WebP、BMP、ICO、SVG；动画支持 GIF、逐帧图片序列与精灵表；数字绘画可导出 PSD 以交换当前帧的图层结构。导出可保存预设，工程也会记住成功导出的设置。' },
          { id: 'faq-files-trim', q: '“单独修剪”和“统一修剪”有什么区别？', a: '“单独修剪”分别去掉各目标的透明边缘；“统一修剪”让本批目标使用同一边界，适合保持动画对齐。动画导出通常选统一修剪。' },
          { id: 'faq-files-slice', q: '切片是什么？', a: '切片是在画布上划定的命名导出区域，用于按区域输出图标、按钮或其他素材。用切片工具 Shift+C 创建，规则素材表还能使用“自动切片”。切片不会自动切开原图层，批量输出目前不使用 GIF 动画格式。' },
          { id: 'faq-files-recover', q: '软件异常退出后怎么找回进度？', a: '从首页“恢复”打开草稿，检查内容后正式保存。打开或关闭恢复草稿不会立即删除原恢复记录，完整保存成功或明确删除记录后才移除。“首选项 > 文件与恢复”可设置自动恢复间隔与保留天数（默认 7 天，可设 1–365 天），但自动恢复不能代替主动保存。' },
          { id: 'faq-files-rollback', q: '保存过的工程能回到之前的版本吗？', a: '启用工程备份后，已保存到文件的项目可从“文件 > 项目回档”选择备份。先检查备份时间再确认恢复；回档会替换当前项目内容，并可通过历史撤销/重做。它与首页“恢复”里的异常退出草稿是两套入口。' },
        ],
      },
      {
        id: 'faq-image',
        title: '图像调整与尺寸',
        items: [
          { id: 'faq-image-adjust', q: '有哪些色彩调整？', a: '“编辑 > 调整”提供色彩平衡、亮度/对比度、色相/饱和度（Ctrl+U）与曲线（Ctrl+M）。调整会实时预览，确认后形成一次可撤销修改。' },
          { id: 'faq-image-filter', q: '显示器风格滤镜是什么？', a: '“编辑 > 滤镜”提供 CRT 经典隔行、RGB 荧光栅、交错栅格、VHS 色彩偏移、暗角与荧光绿辉光，预设会生成可管理的效果图层；LCD 屏幕滤镜需要先选择一个图层。它们用于视觉风格处理，不是画布显示缩放选项。' },
          { id: 'faq-image-size', q: '改画布尺寸会丢掉画布外的内容吗？', a: '只有开启“裁掉画布外的内容”才会明确丢弃越界内容，否则内容被保留在画布之外。“调整图像尺寸”（Ctrl+Alt+I）缩放的是整幅内容：保留像素边缘选最近邻，需要平滑选双线性；它还能识别被整数放大的像素图并按倍率缩回。' },
          { id: 'faq-image-trim', q: '修剪用当前帧还是所有帧？', a: '动画需要统一边界时使用“按所有帧修剪”，避免按单帧范围排除其他帧的内容；单张作品用当前帧即可。' },
        ],
      },
      {
        id: 'faq-scripting',
        title: '脚本与扩展',
        items: [
          { id: 'faq-script-lua', q: '可以写脚本吗？', a: '可以。打开“文件 > 脚本 > 打开脚本文件夹”，把 UTF-8 的 .lua 文件放在该目录第一层，再重新打开文件菜单，从脚本列表执行。脚本可以批量绘制、处理资源或提供自定义弹窗。' },
          { id: 'faq-script-ns', q: 'app.* 和 mse.* 有什么区别？', a: 'app.* 是兼容命名空间，用于迁移已有脚本，只实现明确列出的子集；mse.* 是 MoonSprite 专属 API，覆盖文档、图层、动画、调色板、瓦片、笔刷、选区、切片、样式、栏目与文件操作。两者都应通过能力探测确认端点可用，规划中的接口不可视为当前可用。' },
          { id: 'faq-script-aseprite', q: 'Aseprite 的脚本能直接跑吗？', a: '不一定。MoonSprite 支持部分 Aseprite 风格接口，但并非所有 Aseprite 脚本都能直接运行；普通像素目标、图层类型和当前帧等限制都会影响可执行范围，失败时请查看结果提示。' },
          { id: 'faq-script-ext', q: '.msext 扩展是什么？', a: '扩展包是 ZIP 容器，根目录的 manifest.json 声明命令与界面贡献，可插入现有菜单、新增顶层菜单，并提供由 MoonSprite 渲染的浮动栏目。schemaVersion 1 是声明式 Lua 扩展；schemaVersion 2 还能带一台常驻的 sandbox 运行时，跑自包含的 HTML/JavaScript，按清单权限贡献宿主设置或自己的附属窗口。在“首选项 > 扩展”中安装与管理，也支持拖入或双击安装；软件没有固定的顶层“扩展”菜单，入口由扩展贡献决定。' },
          { id: 'faq-script-safe', q: '脚本可以访问我的文件吗？', a: '不能。Lua 不能直接访问文件系统、网络、进程、调试库、DOM、React、原始 Store、历史栈或任意 Tauri 命令；文件选择、保存、导出与资源导入只能经过 API 明确开放的受控入口。扩展也不能注入任意 React、DOM、CSS、JavaScript 或原生代码。' },
          { id: 'faq-script-error', q: '脚本出错了工程会坏吗？', a: '不会。同一事务中的像素修改与 mse 写入只形成一个撤销步骤，任一操作校验失败时整批回滚；脚本还受图像、内存、指令数与执行时间预算保护，预算耗尽会停止而不是卡死。' },
        ],
      },
      {
        id: 'faq-troubleshooting',
        title: '排查清单',
        items: [
          { id: 'faq-trouble-draw', q: '画笔画不出来', a: '依次检查：图层是否被隐藏或锁定、当前是否选中了图层组、是否停在文本层、是否有很小或隐藏的选区、动画是否正在播放。' },
          { id: 'faq-trouble-delete', q: '删除了意料之外的对象', a: '删除、复制和粘贴按当前焦点解释。操作前先点击画布、图层、色板或瓦片集中的目标区域，确认焦点位置。' },
          { id: 'faq-trouble-layers', q: '导出的图没有图层', a: 'PNG、JPEG 等是图片格式，不保留工程结构。需要保留原稿请保存 .moonsprite；需要与 Photoshop 交换当前帧的图层时导出 PSD。' },
          { id: 'faq-trouble-psd', q: 'PSD 打不开', a: '当前支持输出 PSD，不支持把 PSD 作为输入工程。需要继续编辑请保留 .moonsprite 原稿。' },
          { id: 'faq-trouble-font', q: '换电脑后文字外观变了', a: '工程记录字体名称但不内嵌字体，请在新电脑安装或导入工程使用的同名字体。' },
          { id: 'faq-trouble-timelapse', q: '换电脑后缩时记录不可用', a: '安装版录像保存在本机录像库。在原电脑使用“另存为”并勾选“携带缩时录像”，录像才会随工程一起带走；普通保存可能只引用本机录像库。' },
          { id: 'faq-trouble-space', q: '清空缩时记录后磁盘空间没增加', a: '清空只移除工程里的记录清单，不会删除本机录像库的数据，因此不会释放已占用的磁盘空间。' },
          { id: 'faq-trouble-rotate', q: '旋转或镜像后导出仍是原方向', a: '你使用的是视图命令，它们只改变观察方式。要改变输出像素，请使用“选择 > 变换”里的翻转，或“调整图像尺寸”等图像命令。' },
          { id: 'faq-trouble-redo', q: '按 Ctrl+Y 没有重做', a: '默认 Ctrl+Y 是“查看相对明暗”，重做是 Ctrl+Shift+Z。可以在快捷键设置里改成你习惯的组合。' },
        ],
      },
      {
        id: 'faq-support',
        title: '支持与反馈',
        items: [
          { id: 'faq-feedback', q: '如何反馈问题？', a: '在 GitHub Issues 提交问题，附上软件版本、复现步骤与相关提示最有效；功能讨论可以在 GitHub Discussions 进行。' },
          { id: 'faq-changelog-q', q: '在哪里查看更新内容？', a: '“帮助 > 更新日志”说明最近已打包版本的变更；博客会不定期发布开发进展与设计笔记。' },
          { id: 'faq-doc-error', q: '发现文档有误怎么办？', a: '请在 GitHub Issues 上反馈，或发起讨论。源码可见意味着文档与实现可以互相对照检查。' },
          { id: 'faq-contribute', q: '如何参与贡献？', a: '仓库提供贡献指南（CONTRIBUTING.md）。源码可见意味着实现、文档与测试都可以对照检查，提交前请先阅读对应契约。' },
          { id: 'faq-roadmap', q: '接下来会做什么？', a: '开发按阶段推进，重点随版本公布。可以关注 GitHub 仓库与博客获取最新进展。' },
        ],
      },
    ],
  },
  en: {
    title: 'FAQ',
    subtitle: 'Questions and checklists by topic: switch topics on the left, jump to a question on the right.',
    categories: [
      {
        id: 'faq-start',
        title: 'Getting started',
        items: [
          { id: 'faq-download', q: 'Can I download MoonSprite now?', a: 'MoonSprite is in Beta and not publicly distributed yet. When the Steam store page is ready, this site will open its wishlist link and publish the release channels and licensing at the same time.' },
          { id: 'faq-system', q: 'Which platforms are supported?', a: 'The current product targets Windows 10 and Windows 11 and needs the WebView2 Runtime (the installer handles it). Other desktop platforms are not part of the first release.' },
          { id: 'faq-portable', q: 'Is there a portable build?', a: 'Yes. After release there will be both an NSIS installer and a portable build; the portable version runs from any directory, with the user folders (gallery, exports, brushes, palettes, scripts, and more) next to the program, which makes backup and migration simple.' },
          { id: 'faq-languages', q: 'Which interface languages are available?', a: 'Simplified Chinese, English, Japanese, Korean, Spanish, French, German, Brazilian Portuguese, and Russian. Menus and dropdowns widen with the text and ellipsize when space runs out, showing the full label on hover.' },
          { id: 'faq-offline', q: 'Does it need an internet connection?', a: 'No. The entire workflow, from the first stroke to export, runs locally.' },
          { id: 'faq-price', q: 'Will it be paid software?', a: 'The source is available for viewing, modification, and personal builds; official binaries distributed through Steam and authorized channels are licensed per seat for personal and commercial creative work. Parts historically released under MIT keep their original license.' },
        ],
      },
      {
        id: 'faq-interface',
        title: 'Interface and workspace',
        items: [
          { id: 'faq-ui-dock', q: 'Can I rearrange the panels?', a: 'Yes. “Window > Panels” shows color, palette, layers, history, pattern brushes, tile set, and preview; right-click a panel title to hide it, dock it left, right, or bottom, or float it. Layout changes save automatically, and the workspace manager can save, switch, and reset layouts.' },
          { id: 'faq-ui-tabs', q: 'Can several projects be open at once?', a: 'Yes, as tabs, and Ctrl+W closes the current one. Dragging a tab into the top, bottom, left, or right area of the canvas creates a split view, and right-clicking a tab floats the view as a project window. Splitting and floating only change where a view is shown — they never copy files.' },
          { id: 'faq-ui-temp', q: 'Is there a quick way to call up a panel?', a: 'Yes. Number keys 1–6 call up color, palette, layers, preview, tile set, and pattern brushes temporarily; clicking outside, pressing Esc, or triggering again puts them back without disturbing the docked layout. Panels that are already floating do not use this temporary call-up.' },
          { id: 'faq-ui-history', q: 'Does undo record interface actions?', a: 'No. Zoom, pan, mirrored views, and panel layout are not artwork changes and never enter history; the history panel lists reachable editing steps only.' },
          { id: 'faq-ui-themes', q: 'Can I change the interface appearance?', a: 'Yes. Theme settings let you pick an existing theme or create and duplicate your own; editing base colors changes the interface palette, and guides such as the grid, checkerboard, and onion skin can be overridden individually or set back to “follow theme”. Built-in themes are read-only and editing creates a custom copy, and theme configuration can be imported and exported. The dark and light switch on this website comes from the app’s Dark and Light palettes.' },
          { id: 'faq-ui-keys', q: 'Can I change the shortcuts?', a: 'Yes. “Edit > Shortcut settings” finds commands by category and records one or more combinations, including keyboard, middle and side mouse buttons, and the wheel; tools also have a hold-to-switch “quick select” key. The draft is committed only when you click done, cancelling saves nothing, and configuration imports and exports as JSON.' },
        ],
      },
      {
        id: 'faq-canvas',
        title: 'Canvas and navigation',
        items: [
          { id: 'faq-canvas-view', q: 'Do zoom, rotate, and mirror views change the artwork?', a: 'No. The wheel or zoom tool Z changes viewing size, the hand H and Space+drag change the viewport position, and rotate view R plus “Window > Mirror view” only change the viewing angle. Changing the real output size is “Resize image”, and really flipping pixels is the flip commands under “Select > Transform”.' },
          { id: 'faq-canvas-grid', q: 'How do I turn on the grid and snapping?', a: '“Window > Show” controls the pixel grid, the custom grid, slice borders, and relative luminance; “Window > Snap” turns on grid snapping, smart snapping, and guides. Grid snapping needs the custom grid visible, and smart snapping references the canvas and the edges and centers of other visible layers. Hiding guides does not turn snapping off.' },
          { id: 'faq-canvas-luminance', q: 'What is relative luminance for?', a: '“View relative luminance” shows the artwork in grey so you can find areas that differ in color but sit too close in brightness. It is a viewing mode only and never converts the project to grayscale.' },
          { id: 'faq-canvas-tile', q: 'How do I check that a tile is seamless?', a: 'Open “Window > Tiled preview” and choose surrounding, X-axis, or Y-axis tiling to show 3×3, 3×1, or 1×3 copies. You can paint directly on a neighbouring copy and the result maps back to the original canvas, which is how you check lines and patterns across a seam. Copies are an editing view only: export follows the original canvas or the selected region.' },
        ],
      },
      {
        id: 'faq-drawing',
        title: 'Drawing tools and brushes',
        items: [
          { id: 'faq-drawing-tools', q: 'Which drawing tools are included?', a: 'Pencil B, eraser E, airbrush J, line, curve, shape U (rectangle, ellipse, free shape, polygon), paint bucket G, gradient Shift+G, eyedropper I, smoothing brush, liquify Y, and text T — the full path from sketch to polish.' },
          { id: 'faq-drawing-perfect', q: 'What is pixel-perfect?', a: '“Pixel-perfect” cleans up the redundant pixels at the corners of a path, which matters for single-pixel line art; the line step setting balances the pixel runs of a diagonal. By default, Shift+Ctrl line connections are constrained to allowed directions, and the step value is adjustable in the pencil options bar or editing preferences.' },
          { id: 'faq-drawing-brushes', q: 'Can I use my own image as a brush?', a: 'Yes. Open “Window > Panels > Pattern brushes” and import with the add button or by dragging images in; you can also select an area and press Ctrl+B to create a project brush, which keeps the original colors and transparency. Imported and created brushes may not exceed 256 px in width or height and are used at their original size.' },
          { id: 'faq-drawing-brush-modes', q: 'How do the three image-brush alignments differ?', a: 'Paint brush stamps along the path, with each stamp covering the non-transparent areas of the previous one; pattern-aligned-to-source keeps the texture fixed in source coordinates so the same spot always shows the same texture; pattern-aligned-to-target starts tiling from the first drop point.' },
          { id: 'faq-drawing-pressure', q: 'How do I set up pen pressure?', a: 'In the pencil or eraser brush dynamics, choose pressure or speed as the input for size, strength, and other effects, then set input range, output range, curve, and direction. The pencil can also run a dynamic gradient from background to foreground. Check the pressure switch in “Preferences > Tablet and touch” as well — a mouse has no real pressure and its default value cannot stand in for a pen.' },
          { id: 'faq-drawing-symmetry', q: 'How does symmetry work?', a: 'Enable horizontal, vertical, diagonal, or rotational symmetry in the options bar and combine them freely; drag the axis or center to move it, and use the additional settings to change the axis appearance, lock it, or reset the center. Selection tools support the axes available to them.' },
          { id: 'faq-drawing-fill', q: 'My line art has gaps and the fill leaks — what now?', a: 'Enable the paint bucket’s smart close and adjust the threshold so the fill respects a virtual boundary; the magic wand can use it too. If the result is still wrong, undo first, then lower the threshold or close the gap in the line art.' },
        ],
      },
      {
        id: 'faq-colors',
        title: 'Color and palettes',
        items: [
          { id: 'faq-colors-picker', q: 'Which color pickers are available?', a: 'The color panel switches between moon ring, saturation/value square, hue/saturation square, color wheel, and normal palette. Hue snapping limits the selectable hue band and color steps limit saturation, value, or alpha levels — useful for limited-palette work.' },
          { id: 'faq-colors-modes', q: 'Which color modes exist?', a: 'RGBA, indexed, and grayscale, converted through “Image > Color mode”. Indexed mode makes pixels reference palette colors, which suits limited-palette pieces; conversion changes the project color data.' },
          { id: 'faq-colors-sync', q: 'I changed a palette color and the canvas changed too?', a: 'That is “Palette operations > Sync color” working as intended: changing a palette color replaces pixels of exactly the same RGBA across all unlocked layers and frames, and in indexed mode the referenced color changes through the palette directly. Turn sync color off, or lock the layers you do not want touched.' },
          { id: 'faq-colors-replace', q: 'How do I replace one color in bulk?', a: 'Use “Edit > Replace color” (Ctrl+Shift+K), choose the source and replacement color, and set the scope: document, selection, selected layers, frames, cels, palette, or an existing loop. Confirm the scope, enable the preview if you want it, then apply.' },
          { id: 'faq-colors-extract', q: 'How do I extract colors from the artwork?', a: '“Extract colors” in the palette builds a palette from the current image: create a temporary palette, replace the current one, or append colors, with a count limit. A new palette must be written locally with “Save palette” to be reusable, and it can also be saved as a PNG color card.' },
          { id: 'faq-colors-alpha', q: 'How is transparency handled?', a: 'The canvas supports transparent pixels, and exporting PNG, WebP, or other formats that carry alpha keeps them as they are — good for icons and sprite work.' },
        ],
      },
      {
        id: 'faq-selection',
        title: 'Selection and transform',
        items: [
          { id: 'faq-selection-tools', q: 'Which selection tools are there?', a: 'Rectangle M, ellipse Shift+M, lasso Q, polygon lasso Shift+Q, and magic wand W; the options bar offers new, add, subtract, and intersect, holding Shift before starting adds temporarily, and the right button subtracts by default.' },
          { id: 'faq-selection-ant', q: 'I pressed Ctrl+H but I can still only paint in one area?', a: 'Ctrl+H only hides the marching-ants border; the selection still limits painting. Press Ctrl+D to actually deselect.' },
          { id: 'faq-selection-move', q: 'Why does dragging the selection not move the image?', a: 'You probably grabbed the marquee edge — dragging inside moves the content, while dragging the edge moves the marquee alone. You can also use the move tool V to move the current frame of a layer, and “Auto-select layer” hits layers by canvas content.' },
          { id: 'faq-selection-transform', q: 'Which modifier keys work during transform?', a: 'Ctrl+T enters content transform: while scaling, Shift keeps the ratio, Ctrl snaps to integer multiples, and Alt transforms on both sides of the pivot; while rotating, Shift snaps to 45°. Enter confirms and Esc cancels the current transform. Fixed text boxes do not use Ctrl+T — adjust them with the text tool.' },
          { id: 'faq-selection-flip', q: 'Can I flip in bulk without a selection?', a: 'Yes. Select the targets in the layer panel or timeline first, then mirror with Shift+H / Shift+V: selected cells process only those cells, selecting layers alone processes all their frames, and the whole batch takes one undo. Hidden, locked, and text layers do not take part in this cell-level operation.' },
          { id: 'faq-selection-outline', q: 'How does outline differ from a layer style outline?', a: '“Select > Outline” (Shift+O) produces real pixel edits you can keep painting on, while a layer style outline is a live effect that follows the source artwork and only becomes pixels after “Convert to > Normal layer”.' },
        ],
      },
      {
        id: 'faq-layers',
        title: 'Layers, masks, and styles',
        items: [
          { id: 'faq-layer-types', q: 'Which layer types are supported?', a: 'Normal, background, group, text, tile, and free tile layers; masks and layer styles apply to layers or groups.' },
          { id: 'faq-layers-mask', q: 'Does a mask overwrite the original pixels?', a: 'No. Black hides, white shows, grey partially shows, and colored strokes are converted to grey; unpainted areas behave as white. Masks are stored per frame, a group mask applies to the whole group’s composite, and the original pixels always remain.' },
          { id: 'faq-layers-styles', q: 'Which layer style effects are available?', a: 'Outline, shadow, inner glow, color overlay, and gradient overlay. The outline’s “smart hue” derives its color from neighbouring source pixels, and the shadow’s “smart shadow” derives its dark color from the background below it and updates when that background changes. Style settings are shared across frames, but each frame computes the effect from its own content.' },
          { id: 'faq-layers-linked', q: 'Are linked layers and linked cels the same thing?', a: 'No. “Linked layers” connects different layers so they share pixels in their corresponding frames while keeping their own position, visibility, and styles; “linked cels” connects different frames of the same layer and shares one piece of content. Both sync edits, but their scope is completely different.' },
          { id: 'faq-layers-merge', q: 'Does merging a group merge every frame?', a: 'In the current implementation, “Merge group” and “Merge visible” still produce a result for the active frame. For multi-frame animation, use “Merge down” or “Merge selected layers”, which are handled per frame.' },
          { id: 'faq-layers-text', q: 'Can a text layer still be edited later?', a: 'Yes. Double-click the text layer or text cel to keep editing; font, size, letter spacing, line spacing, and rendering all stay adjustable. Text layers do not accept ordinary brush strokes or pixel pastes — use “Convert to > Normal layer” when you need to edit them pixel by pixel.' },
        ],
      },
      {
        id: 'faq-animation',
        title: 'Animation and loops',
        items: [
          { id: 'faq-timing', q: 'Can each frame have its own duration?', a: 'Yes. Double-click a frame header to change its duration, with blank frames defaulting to 100 ms; multi-selected frames can be processed in bulk or dragged into a new order, and at least one frame is always kept. Playback speed affects the preview only and never rewrites the stored durations.' },
          { id: 'faq-animation-newframe', q: 'Why is a new frame not blank?', a: 'The add-frame button duplicates the current frame by default, producing an independently editable copy. Right-click a frame header and choose “New blank frame” when you want an empty one.' },
          { id: 'faq-animation-timeline', q: 'The animation timeline disappeared?', a: 'Check “Hide timeline” in the layer settings. While hidden, playback and related actions are disabled but frame data is kept — turning the setting off brings it back.' },
          { id: 'faq-animation-tween', q: 'What can automatic tweening generate?', a: 'Transition frames from end-point horizontal and vertical offset, rotation, scale, and relative opacity, with constant, ease-in, ease-out, or ease-in-out timing and an end-point preview. It produces geometry and opacity transitions — it does not redraw a character’s in-between poses, and the preview excludes masks, layer styles, and blend effects.' },
          { id: 'faq-onion', q: 'What is onion skin?', a: 'Onion skin overlays neighbouring frames in a tint as reference for motion; you can set the range, opacity, previous and next frame colors, and whether it shows during playback. It is for viewing only and never appears in the final image.' },
          { id: 'faq-animation-loop', q: 'What are loops for?', a: 'Select consecutive frames and right-click a frame header to create a named loop such as “idle” or “walk”; double-click the bracket to edit the name, start and end frames, direction, and repeat count. A loop can play by its repeat count and can serve as the source range for GIF, sprite sheet, or tween exports.' },
        ],
      },
      {
        id: 'faq-tiles',
        title: 'Tile workflow',
        items: [
          { id: 'faq-tiles-what', q: 'What is a tile layer?', a: 'A tile layer uses a shareable tile set: one tile can be referenced in many places, and editing the source updates every reference. The tile set records grid size and layout, and tiles carry stable resource IDs.' },
          { id: 'faq-tiles-free', q: 'How are free tile layers different?', a: 'Free tiles place reusable patterns as instances that do not need to align to a fixed grid and may overlap; editing the shared source updates every reference. They suit repeated elements such as trees, rocks, character parts, and decoration.' },
          { id: 'faq-tiles-modes', q: 'Which of the four tile editing modes should I use?', a: 'In-place edit changes an existing tile and updates every reference; variant create replaces only the current cell’s reference, which is what you want for a local variation; mixed edit edits existing cells and paints new content into empty ones; draw tiles changes only cell references and leaves the tile source alone.' },
          { id: 'faq-tiles-changed', q: 'I changed one spot and others changed too?', a: 'Check linked layers, linked cels, shared tiles, and free tile sources. Use “variant create” when you only want one cell changed; for free tiles, select the instance in the instance list before editing, or add a new source tile.' },
        ],
      },
      {
        id: 'faq-files',
        title: 'Saving, exporting, and recovery',
        items: [
          { id: 'faq-file-project', q: 'What format are projects saved in?', a: '.moonsprite is the complete editable project container: it keeps layers, animation, tiles, and palettes, and shows a thumbnail preview in Explorer.' },
          { id: 'faq-files-open', q: 'Which files can be opened?', a: '.moonsprite, .ase, .aseprite, PNG, JPEG, WebP, BMP, and GIF. Animated GIFs import as multi-frame projects, keeping the readable frame order, durations, and loop information. PSD is currently export-only and cannot be opened as a project.' },
          { id: 'faq-files-export', q: 'What are the export options?', a: 'Stills: PNG (auto-indexed or RGBA), JPEG, WebP, BMP, ICO, and SVG. Animation: GIF, numbered frame sequences, and sprite sheets. Digital painting: PSD to exchange the current frame’s layer structure. Exports can be saved as presets, and a project remembers its last successful export.' },
          { id: 'faq-files-trim', q: 'What is the difference between trimming individually and uniformly?', a: '“Trim individually” removes each target’s transparent edges, while “trim uniformly” gives the batch one shared boundary, which keeps animation aligned. Animation exports usually want uniform trimming.' },
          { id: 'faq-files-slice', q: 'What are slices?', a: 'Slices are named export regions on the canvas, used to output icons, buttons, or other assets by region. Create them with the slice tool Shift+C, and regular asset sheets can use “Auto slice”. Slices never cut the original layers apart, and batch slice output does not currently use the animated GIF format.' },
          { id: 'faq-files-recover', q: 'How do I get my work back after a crash?', a: 'Open the draft from Home > Recovery, check it, then save it properly. Opening or closing a draft does not delete the recovery record immediately — only a successful full save or an explicit delete removes it. “Preferences > Files and recovery” sets the autosave interval and retention days (7 by default, adjustable from 1 to 365), but automatic recovery is not a substitute for saving.' },
          { id: 'faq-files-rollback', q: 'Can a saved project go back to an earlier version?', a: 'With project backup enabled, saved projects can be restored from “File > Project rollback”. Check the backup time before confirming; rollback replaces the current project content and can be undone or redone from history. It is a separate entry from the crash drafts in Home > Recovery.' },
        ],
      },
      {
        id: 'faq-image',
        title: 'Image adjustments and size',
        items: [
          { id: 'faq-image-adjust', q: 'Which color adjustments exist?', a: '“Edit > Adjustments” offers color balance, brightness/contrast, hue/saturation (Ctrl+U), and curves (Ctrl+M). Each previews live and produces a single undoable change once confirmed.' },
          { id: 'faq-image-filter', q: 'What are the display-style filters?', a: '“Edit > Filters” offers classic CRT interlacing, RGB phosphor grid, interlaced grid, VHS color shift, vignette, and green phosphor glow, with presets that produce manageable effect layers; the LCD screen filter needs a selected layer first. They are a visual style treatment, not a canvas display zoom option.' },
          { id: 'faq-image-size', q: 'Does resizing the canvas discard content outside it?', a: 'Only “Crop content outside the canvas” actually discards out-of-bounds content; otherwise it is kept beyond the canvas. “Resize image” (Ctrl+Alt+I) scales the whole artwork — nearest neighbour keeps pixel edges and bilinear smooths — and it can also detect pixel art enlarged by an integer factor and scale it back down.' },
          { id: 'faq-image-trim', q: 'Should trim use the current frame or all frames?', a: 'For animation, use “trim by all frames” so one frame’s bounds do not exclude the others; for a single piece, the current frame is enough.' },
        ],
      },
      {
        id: 'faq-scripting',
        title: 'Scripts and extensions',
        items: [
          { id: 'faq-script-lua', q: 'Can I write scripts?', a: 'Yes. Open “File > Scripts > Open scripts folder”, place UTF-8 .lua files at the top level, then reopen the File menu and run them from the script list. Scripts can batch-draw, process assets, or provide custom dialogs.' },
          { id: 'faq-script-ns', q: 'What is the difference between app.* and mse.*?', a: 'app.* is the compatibility namespace for migrating existing scripts and implements only an explicit subset; mse.* is MoonSprite’s own API, covering documents, layers, animation, palettes, tiles, brushes, selections, slices, styles, panels, and file operations. Both should be probed for capability, and planned interfaces are not current features.' },
          { id: 'faq-script-aseprite', q: 'Do Aseprite scripts run as they are?', a: 'Not necessarily. Some Aseprite-style interfaces are supported, but not every Aseprite script runs unchanged; limits such as normal-pixel targets, layer types, and the current frame affect what a script can do, so read the result message when it fails.' },
          { id: 'faq-script-ext', q: 'What is an .msext extension?', a: 'An extension package is a ZIP container whose root manifest.json declares commands and interface contributions: it can insert into existing menus, add top-level menus, and provide floating panels rendered by MoonSprite. schemaVersion 1 is a declarative Lua extension; schemaVersion 2 can also carry a resident sandbox runtime running self-contained HTML/JavaScript, contributing host settings or its own attached windows under manifest permissions. Install and manage them in “Preferences > Extensions”, or drag one in or double-click it. There is no fixed top-level “Extensions” menu — entries come from what extensions contribute.' },
          { id: 'faq-script-safe', q: 'Can a script reach my files?', a: 'No. Lua cannot directly reach the file system, the network, processes, the debug library, the DOM, React, the raw store, the history stack, or arbitrary Tauri commands; file picking, saving, exporting, and resource import only go through controlled entries the API opens explicitly. Extensions cannot inject arbitrary React, DOM, CSS, JavaScript, or native code either.' },
          { id: 'faq-script-error', q: 'Can a failing script break my project?', a: 'No. Pixel edits and mse writes in one transaction form a single undo step, and if any operation fails validation the whole batch rolls back. Scripts are also protected by image, memory, instruction, and execution-time budgets: running out stops the script instead of freezing the app.' },
        ],
      },
      {
        id: 'faq-troubleshooting',
        title: 'Troubleshooting',
        items: [
          { id: 'faq-trouble-draw', q: 'The brush does not paint', a: 'Check in order: whether the layer is hidden or locked, whether a layer group is selected, whether you are on a text layer, whether a tiny or hidden selection exists, and whether the animation is playing.' },
          { id: 'faq-trouble-delete', q: 'Something unexpected was deleted', a: 'Delete, copy, and paste follow the current focus. Click the target area — canvas, layer panel, palette, or tile set — before acting so the focus is where you expect.' },
          { id: 'faq-trouble-layers', q: 'The exported image has no layers', a: 'PNG, JPEG, and similar formats are images and do not keep project structure. Save .moonsprite to keep the master, and export PSD when you need to exchange the current frame’s layers with Photoshop.' },
          { id: 'faq-trouble-psd', q: 'PSD will not open', a: 'PSD export is supported; PSD import is not. Keep a .moonsprite master if you need to keep editing.' },
          { id: 'faq-trouble-font', q: 'The text looks different on another computer', a: 'A project records font names but does not embed fonts, so install or import the same fonts the project uses.' },
          { id: 'faq-trouble-timelapse', q: 'Timelapse recordings are missing on another computer', a: 'Installed builds keep recordings in the local library. On the original computer, use Save As and tick “Carry timelapse recordings” so they travel with the project; a normal save may only reference the local library.' },
          { id: 'faq-trouble-space', q: 'Clearing timelapse records did not free disk space', a: 'Clearing removes the record list from the project only; it does not delete data from the local recording library, so occupied disk space is unchanged.' },
          { id: 'faq-trouble-rotate', q: 'After rotating or mirroring, the export is still the original orientation', a: 'You used view commands, which only change how you look at the artwork. To change output pixels, use the flips under “Select > Transform”, or image commands such as “Resize image”.' },
          { id: 'faq-trouble-redo', q: 'Ctrl+Y does not redo', a: 'Ctrl+Y is “view relative luminance” by default; redo is Ctrl+Shift+Z. You can rebind either one in shortcut settings.' },
        ],
      },
      {
        id: 'faq-support',
        title: 'Support and feedback',
        items: [
          { id: 'faq-feedback', q: 'How do I report a problem?', a: 'File it on GitHub Issues with the app version, reproduction steps, and any message — that helps most. Feature discussion belongs in GitHub Discussions.' },
          { id: 'faq-changelog-q', q: 'Where can I read what changed?', a: '“Help > Changelog” documents the most recent packaged version, and the blog publishes progress notes and design write-ups from time to time.' },
          { id: 'faq-doc-error', q: 'Found an error in the docs?', a: 'Please file it on GitHub Issues, or start a discussion. Source-available means documentation and implementation can be checked against each other.' },
          { id: 'faq-contribute', q: 'How can I contribute?', a: 'The repository provides a contribution guide (CONTRIBUTING.md). Source-available means implementation, documentation, and tests can all be cross-checked; please read the relevant contract before submitting.' },
          { id: 'faq-roadmap', q: 'What comes next?', a: 'Development proceeds in stages and priorities are announced with each version. Watch the GitHub repository and the blog for the latest progress.' },
        ],
      },
    ],
  },
}
export function faqPageCopy(language: Language) {
  return faqPage[language]
}
