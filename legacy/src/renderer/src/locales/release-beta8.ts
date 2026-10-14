export const beta8Zh = {
  'release.beta8.summary': '改进动画时间轴、绘画预览与编辑可靠性，并修复渐变吸色、撤销和图层显隐卡顿问题。',
  'release.beta8.animation': '动画时间轴减少布局和挂载开销，播放、反向与帧选择状态保持同步。',
  'release.beta8.canvas': '优化画布光标、笔刷预览和会议场景下的输入路径；启用大小压感时悬停预览默认显示最小尺寸。',
  'release.beta8.reliability': '修复油漆桶错位和无法撤销、选区快捷键、压感大小、吸管取色来源及渐变色标吸色问题。',
  'release.beta8.layers': '图层显隐保留未变化的样式缓存，减少复杂图层重新显示时的等待。',
  'release.beta8.maintenance': '完善诊断记录、更新版本信息和发布检查，统一 Beta8 软件内更新日志。'
} as const

export const beta8En = {
  'release.beta8.summary': 'Improve animation timelines, brush previews, and editing reliability, including gradient sampling, undo, and layer visibility fixes.',
  'release.beta8.animation': 'Reduce animation timeline layout and mount work while keeping playback, reversal, and frame selection synchronized.',
  'release.beta8.canvas': 'Improve canvas cursor, brush preview, and input paths during meeting or streaming use; pressure-sized hover previews now start at the minimum size.',
  'release.beta8.reliability': 'Fix paint-bucket offsets and undo failures, selection shortcuts, pressure size, eyedropper sources, and gradient-stop sampling.',
  'release.beta8.layers': 'Retain unchanged layer-style caches when toggling visibility to reduce delays when complex layers reappear.',
  'release.beta8.maintenance': 'Improve diagnostics, version metadata, release checks, and the in-app Beta8 changelog.'
} as const
