import type { Language } from '../content'
import type { BlogContent } from '../content'

/*
 * The Blog page's copy. It lives beside the page rather than in content.ts so the
 * route can be loaded on demand: this text is 8 kB and nobody
 * reads it on arrival.
 */
const blog: Record<Language, BlogContent> = {
  zh: {
    title: '博客',
    subtitle: '开发进展、设计笔记与功能讲解。',
    backToList: '返回博客',
    readMore: '阅读全文',
    posts: [
      {
        id: 'why-moonsprite',
        date: '2026-07-12',
        title: '为什么做 MoonSprite',
        excerpt: '一款新的像素画工作台应该解决什么问题？从自由瓦片、蒙版与可编辑文本三件事谈起。',
        sections: [
          { id: 'why-start', heading: '起点', paragraphs: ['像素画的工具链并不缺选择，但要在 Windows 上获得一个清晰、快速、界面可定制，并且不把简单操作复杂化的工作台，选择会突然变少。MoonSprite 的起点很具体：把我们自己在做游戏素材时反复缺的那几件工具补齐。'] },
          { id: 'why-tools', heading: '先补齐三件事', paragraphs: ['第一是自由瓦片：树木、石块、角色零件这类重复元素不该被网格限制，实例要能重叠摆放，而改一次源图就该全部同步。第二是逐帧蒙版：隐藏内容而不擦除原图，并且每一帧可以有自己的蒙版。第三是可编辑文本：文字内容、字体与排版都该保留下来，而不是一次性烧成像素。'] },
          { id: 'why-principles', heading: '三条底线', paragraphs: ['作品居中：工具围绕画布，而不是相反。状态独立：缩放、旋转视图与栏目布局永远不进入撤销历史，撤销只作用于作品。能力可探测：脚本与扩展通过能力接口确认端点是否实现，而不是靠猜测。'] },
          { id: 'why-next', heading: '接下来', paragraphs: ['项目目前处于 Beta 开发阶段。Steam 页面与发布渠道准备就绪后，这里会同步更多进展；在此之前，使用手册与更新日志是了解功能边界最可靠的两个入口。'] },
        ],
      },
      {
        id: 'beta-progress',
        date: '2026-08-24',
        title: 'Beta 开发进展：动画、图层与交付',
        excerpt: '本阶段的重点是把逐帧动画、图层结构与导出流程连成一条不断的工作流。',
        sections: [
          { id: 'beta-animation', heading: '动画与循环节', paragraphs: ['帧、cel 与图层在同一个栏目里对应排列，双击帧头改时长、右键帧头新建空白帧或复制帧都在原地完成。循环节把“待机”“行走”这样的片段命名并标记起止帧，既能按次数播放，也能直接作为 GIF、精灵表与补间的来源范围。'] },
          { id: 'beta-tween', heading: '自动补间', paragraphs: ['按终点位移、旋转角度、缩放比例与相对不透明度生成过渡帧，支持匀速、加速、减速与先加速后减速，并能用移动工具拖动半透明原图直接定位终点。它解决的是几何与透明度的过渡，角色的中间姿态仍然需要逐帧画——这一点在手册里写得很清楚。'] },
          { id: 'beta-layers', heading: '图层与蒙版', paragraphs: ['图层组、剪贴蒙版、逐帧蒙版与图层样式构成结构化的工程。样式里的描边与阴影可以跟随内容变化：智能色相从邻近像素取色，智能阴影从下方背景取色，背景一变阴影跟着变。'] },
          { id: 'beta-export', heading: '交付', paragraphs: ['导出覆盖静态图、GIF、逐帧序列与精灵表，铺设了独立的精灵表对话框，可以限制行列或总尺寸、合并重复帧、忽略空缺帧。导出预设会记住格式、倍率、范围与路径，工程也记住上一次成功的设置。'] },
        ],
      },
      {
        id: 'walkthrough',
        date: '2026-09-08',
        title: '一个场景的完整流程',
        excerpt: '从新建工程到导出精灵表：走一遍瓦片、图层、动画与交付的实际顺序。',
        sections: [
          { id: 'walk-tiles', heading: '用瓦片起稿', paragraphs: ['新建瓦片图层并选择新增瓦片集，设置瓦片宽高后直接在画布铺设。地砖、地形这类重复结构用“绘制瓦片”整格摆放；某一格需要单独变化时切到“变体创建”，改动只影响当前格子，不会波及其他引用。'] },
          { id: 'walk-free', heading: '用自由瓦片摆放景物', paragraphs: ['树木、石块与装饰物改用自由瓦片图层：实例可以重叠、可以任意位置，改共享源即可让所有同类物体一起更新。实例列表支持多选、排序、显隐与批量属性，摆场景时比逐个重画省事得多。'] },
          { id: 'walk-animation', heading: '给角色加动画', paragraphs: ['角色单独放一层，逐帧改画；需要位移或旋转的部分用自动补间生成过渡帧。洋葱皮把相邻帧淡色叠加以参考动作衔接，循环节把行走循环标记出来，导出时直接按循环节取帧。'] },
          { id: 'walk-export', heading: '交付', paragraphs: ['静态展示图导出 PNG，用整数倍率保持像素锐利；动画导出 GIF 或精灵表，精灵表可限制列数、合并重复帧并按循环节拆分。最后保存 .moonsprite 保留可继续编辑的原稿——图片格式不会保留图层结构。'] },
        ],
      },
    ],
  },
  en: {
    title: 'Blog',
    subtitle: 'Development progress, design notes, and feature walkthroughs.',
    backToList: 'Back to blog',
    readMore: 'Read more',
    posts: [
      {
        id: 'why-moonsprite',
        date: '2026-07-12',
        title: 'Why we are building MoonSprite',
        excerpt: 'What should a new pixel art workstation solve? Start with free tiles, masks, and editable text.',
        sections: [
          { id: 'why-start', heading: 'The starting point', paragraphs: ['Pixel art is not short of tooling choices, but on Windows the list narrows quickly once you want a workstation that is clear, fast, adaptable, and does not over-complicate simple operations. MoonSprite started from something concrete: filling in the few tools we kept missing while making game assets.'] },
          { id: 'why-tools', heading: 'Three things first', paragraphs: ['First, free tiles: repeated elements such as trees, rocks, and character parts should not be chained to a grid — instances must overlap freely, and editing the source once should update every copy. Second, per-frame masks: hide content without erasing it, and let every frame carry its own mask. Third, editable text: the characters, font, and layout should stay editable instead of being burned into pixels.'] },
          { id: 'why-principles', heading: 'Three ground rules', paragraphs: ['The artwork stays central: tools wrap around the canvas, not the reverse. State stays independent: zoom, view rotation, and panel layout never enter undo history, so undo only ever affects the artwork. Capabilities are discoverable: scripts and extensions confirm an endpoint through a capability interface instead of guessing.'] },
          { id: 'why-next', heading: 'What comes next', paragraphs: ['The project is in Beta development. As the Steam page and release channels come together, more progress will be published here; until then, the user guide and the changelog are the most reliable places to learn the exact feature boundaries.'] },
        ],
      },
      {
        id: 'beta-progress',
        date: '2026-08-24',
        title: 'Beta progress: animation, layers, and delivery',
        excerpt: 'This stage focused on connecting frame-by-frame animation, layer structure, and export into one uninterrupted flow.',
        sections: [
          { id: 'beta-animation', heading: 'Animation and loops', paragraphs: ['Frames, cels, and layers line up in one panel: double-click a frame header to change its duration, and right-click to add a blank frame or duplicate in place. Loops name a segment such as “idle” or “walk” and mark its start and end, playing by repeat count and serving directly as the source range for GIF, sprite sheet, and tween exports.'] },
          { id: 'beta-tween', heading: 'Automatic tweening', paragraphs: ['Transition frames come from end-point offset, rotation, scale, and relative opacity, with constant, ease-in, ease-out, and ease-in-out timing — and you can drag the semi-transparent source with the move tool to place the end point directly. It solves geometry and opacity transitions; a character’s in-between poses still need drawing frame by frame, and the manual says so plainly.'] },
          { id: 'beta-layers', heading: 'Layers and masks', paragraphs: ['Groups, clipping masks, per-frame masks, and layer styles make a structured project. Style outlines and shadows follow the content: smart hue takes its color from neighbouring pixels, and smart shadow takes its dark color from the background below, updating when that background changes.'] },
          { id: 'beta-export', heading: 'Delivery', paragraphs: ['Export covers stills, GIF, frame sequences, and sprite sheets, with a dedicated sprite sheet dialog that can limit rows, columns, or total size, merge duplicate frames, and ignore empty slots. Export presets remember format, scale, range, and path, and a project remembers its last successful settings.'] },
        ],
      },
      {
        id: 'walkthrough',
        date: '2026-09-08',
        title: 'One scene, start to finish',
        excerpt: 'From a new project to a sprite sheet export: the real order of tiles, layers, animation, and delivery.',
        sections: [
          { id: 'walk-tiles', heading: 'Blocking in with tiles', paragraphs: ['Create a tile layer with a new tile set, set the tile size, and lay tiles directly on the canvas. Repetitive structure such as floors and terrain goes down whole cells at a time with “draw tiles”; when one cell needs to differ, switch to “variant create” so the change stays in that cell and leaves every other reference alone.'] },
          { id: 'walk-free', heading: 'Placing scenery with free tiles', paragraphs: ['Trees, rocks, and decoration move to a free tile layer: instances overlap, sit anywhere, and editing the shared source updates every copy of the same object at once. The instance list supports multi-selection, reordering, visibility, and bulk properties, which beats redrawing each prop by hand.'] },
          { id: 'walk-animation', heading: 'Animating the character', paragraphs: ['The character gets its own layer and is redrawn frame by frame; the parts that move or rotate use automatic tweening for their transitions. Onion skin tints neighbouring frames as reference for the motion, and a loop marks the walk cycle so export can take exactly those frames.'] },
          { id: 'walk-export', heading: 'Delivery', paragraphs: ['Export stills as PNG with an integer scale to keep pixels sharp; export animation as GIF or a sprite sheet, where the sheet can limit columns, merge duplicate frames, and split by loop. Finally save a .moonsprite to keep something you can keep editing — image formats do not keep layer structure.'] },
        ],
      },
    ],
  },
}
export function blogCopy(language: Language) {
  return blog[language]
}
