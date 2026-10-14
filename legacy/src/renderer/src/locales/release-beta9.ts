export const beta9Zh = {
  "release.beta9.summary": "新增可配置图案填充与颜色板工作流，改进大工程编辑和画布可靠性。",
  "release.beta9.patterns": "油漆桶支持随机、规则填充与参数预设、多图案均衡分布，独立设置弹窗可保存参数；Esc 只取消图案笔刷。",
  "release.beta9.palettes": "颜色板支持 GPL 导入、重复颜色、复制粘贴和拖动增减槽位，新增 Markd221 颜色板及颜色名称编辑。",
  "release.beta9.animation": "减少多帧、多 cel 与空内容的重复计算，改善时间轴滚动、单元格刷新与播放状态同步。",
  "release.beta9.canvas": "减少大画布绘画和笔刷预览的重复刷新，复用连续选区变换缓存，改善十字光标更新。",
  "release.beta9.editing": "修复移动选区后删除、关联图层转换、索引图层样式、半透明阴影以及图案填充和弹窗问题。",
  "release.beta9.projects": "参考图像随工程保存并恢复；修复旧工程、图层样式和后台恢复后的显示问题。",
  "release.beta9.diagnostics": "新增原生卡顿 trace 与 Runtime 版本记录，保留手动采集额度。长期 WebView2 输入积压仍未根治；本次未运行性能测试。"
} as const

export const beta9En = {
  "release.beta9.summary": "Configurable pattern fills and palette workflows, with improvements to large-project editing and canvas reliability.",
  "release.beta9.patterns": "Random/regular bucket fills, presets and balanced multi-pattern distribution; independent saved settings. Esc exits only the pattern brush.",
  "release.beta9.palettes": "GPL import, duplicate colors, copy/paste and draggable slot resizing, plus the Markd221 palette and editable color names.",
  "release.beta9.animation": "Reduce repeated work across frames, cels and empty content; improve timeline scrolling, visible cells and playback synchronization.",
  "release.beta9.canvas": "Reduce duplicate large-canvas painting and brush-preview refreshes, reuse selection-transform caches and improve crosshair updates.",
  "release.beta9.editing": "Fix moved-selection deletion, linked-layer conversion, indexed styles, translucent shadows, pattern fills and settings dialogs.",
  "release.beta9.projects": "Save and restore project reference images; fix older-project, styled-layer and background-resume rendering.",
  "release.beta9.diagnostics": "Native lag traces, Runtime version records and reserved manual capture capacity. Long-running WebView2 input retention remains unresolved; performance tests were skipped."
} as const
