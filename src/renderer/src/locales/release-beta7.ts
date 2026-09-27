export const beta7Zh = {
  'release.beta7.summary': '新增渐变映射、补间缓动与最近颜色；改进首页作品轮换、画布性能、工程保存和编辑稳定性。',
  'release.beta7.gradient': '新增渐变映射调整和调整图层，可编辑色标、使用预设、实时预览并随工程保存。',
  'release.beta7.animation': '补间支持缓动预设与自定义曲线；新增动画反向处理，完善蒙版、时间轴选择和播放状态同步。',
  'release.beta7.colors': '颜色面板新增最近使用颜色，支持快速设置前景色或背景色；偏好设置可控制显示。',
  'release.beta7.home': '首页新增《石狮》和《蔑视》作品，启动时打乱轮换顺序，悬浮到轮换点即可切换。',
  'release.beta7.canvas': '大画布绘画、导航和选区移动减少整画布分配；滚动条与分栏尺寸变化同步更新，笔刷边缘预览更完整。',
  'release.beta7.cache': '画布、图层属性、时间轴缩略图和洋葱皮按可见区域及容量管理缓存，降低长时间使用的内存占用。',
  'release.beta7.layers': '图层样式与合成预览按内容边界更新，图层重排与图层组显隐缩小重绘区域；新建图层和多图层编辑减少不必要的快照与复制。',
  'release.beta7.fixes': '修复动画播放残留选中高亮、文字层栅格化结果被覆盖，以及选区、图层和时间轴的部分预览与撤销问题。',
  'release.beta7.files': '工程保存改用可转移数据的工作线程通道；完善工程解码错误提示及扩展资源、文件拖放处理。',
  'release.beta7.diagnostics': '新增卡顿记录模式；偏好设置增加绘画光标形状、像素对齐和笔刷边缘粗细等选项。',
  'release.beta7.website': '官网首页更新功能介绍和动图；宠物伴侣的内置宠物更新为月猫，保留用户创建的宠物。'
} as const

export const beta7En = {
  'release.beta7.summary': 'Gradient mapping, tween easing, and recent colors, plus improvements to home artwork, canvas performance, saving, and editing reliability.',
  'release.beta7.gradient': 'Add gradient map adjustments and adjustment layers with editable stops, presets, live previews, and project persistence.',
  'release.beta7.animation': 'Add easing presets, a custom tween curve, and animation reversal; improve masks, timeline selection, and playback state.',
  'release.beta7.colors': 'Show recently used colors in the color panel for quick foreground or background selection, with a visibility preference.',
  'release.beta7.home': 'Add Stone Lion and Contempt to the home artwork rotation, shuffle the order on launch, and switch artwork by hovering over an indicator.',
  'release.beta7.canvas': 'Reduce full-canvas work while painting, navigating, and moving selections; update scrollbars with pane size and complete brush outlines at canvas edges.',
  'release.beta7.cache': 'Bound canvas, layer preview, timeline thumbnail, and onion skin caches by visible area and capacity to reduce long-session memory use.',
  'release.beta7.layers': 'Update layer styles and previews within content bounds, reduce redraws for layer reordering and group visibility, and avoid unnecessary snapshots and copies.',
  'release.beta7.fixes': 'Fix stale playback selections, overwritten rasterized text, and preview or undo issues in selections, layers, and the timeline.',
  'release.beta7.files': 'Move project saving to a transferable-data worker path; improve decode errors and extension asset and file-drop handling.',
  'release.beta7.diagnostics': 'Add lag capture mode and preferences for pointer shape, pixel alignment, and brush edge thickness.',
  'release.beta7.website': 'Refresh the website feature showcase and animations; replace the bundled pet with Mooncat while preserving user-created pets.'
} as const
