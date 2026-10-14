# 窗口缩放绘制优化（2026-10-13）

用户要求：对照Aseprite现有做法直接借鉴优化，保持现有像素皮肤和Fusion10px/2×外观。未修改用户PNG/XML素材，未复制Aseprite app商业许可代码。

## 来源与适配

固定Aseprite提交14fe117e853bd642672e72018166239506060cd4。`src/app/ui/skin/skin_theme.cpp`仅作为定位证据，其drawRect转交`src/ui/theme.cpp:Theme::drawSlices`；真正复用已构建的MIT `src/ui/graphics.cpp:Graphics::drawSurfaceNine`。laf固定500768cccc6447e3b7816bedbfcb378a5c5222e5，`os/skia/skia_surface.cpp:drawSurfaceNine`使用Skia nearest lattice，相关MIT许可随原工程保留。

原生Skin不再分配按目标宽高缓存的整块surface；重复轴颜色恒定的素材直接走库的drawSurfaceNine。非恒定纹理、小尺寸、零边框保留原有固定角、平铺边/中心语义，使用小源片的Skia repeat shader，最多9次绘制。缓存随来源bitmap/边框变更失效，仅缓存来源片段，目标宽高不进入key。

拾色器仍沿用legacy ColorPicker/raster算法与当前坐标/取整；仅在确定的Skia raster后端直接写bitmap，避免逐像素SkPixmap::erase调用；HSV和alpha条生成后仍为immutable surface。9组尺寸/颜色逐像素oracle已通过。

字形优化：BDF原字形缓存为小白色alpha位图，复用MIT Graphics::drawColoredRgbaSurface着色；advance、中文/拉丁宽度、10px字号和原基线保持不变。已新增旧逐像素路径1×/2×、裁剪、缺字及半透明颜色对照。半透明文字因库着色取整差异保留旧逐像素路径，不透明文字走缓存；最终精确对照已通过。

## 验证及实际边界

`build/Release/moonsprite-native.exe --skin-resize-check`在打开桌面窗口前执行渲染oracle，并写build/Release/skin-resize-benchmark.txt。已接入CTest skin-resize-render；80组皮肤像素对照及9组拾色器对照通过。皮肤覆盖现有主题、合成纹理/半透明素材、极小尺寸、1×/2×、平移和裁剪，精确比较全部像素。

皮肤40次不同尺寸×4个面板绘制：旧平铺参考路径约10.07秒，新路径约13.26毫秒。此数字只代表皮肤CPU绘制，不代表整个窗口或最终帧率。新增字形优化前，另用仅本次创建的独立空白HWND做80次SetWindowPos并正常关闭，平均调用约25ms；不是人工拖边框或帧呈现时间，不能声称已完成流畅度验收。

完整构建中，渲染测试通过；其余测试17项中project-import仍失败“Import should reject”，同时文档/工程模块在本轮期间被其它工作修改，保持原样，不据此宣称整套通过。

最终交付：用户关闭正式窗口后，已更新唯一build/Release/moonsprite-native.exe。后续适配了其它工作新增的512×528图集：主题边长上限1024，8MiB文件预算和切片边界校验保留，未改PNG/XML。

最终相关CTest三项skin-assets、theme-atlas、skin-resize-render全部通过；包含80组皮肤、9组拾色器和4组Fusion字形精确对照。较早版本窗口smoke退出0；最终完整smoke退出-1073741819（0xC0000005），未通过，不能用此前结果替代。80次真实HWND尺寸变化调用正常完成并关闭测试实例，平均23.01ms、最大109.46ms；这是跨进程SetWindowPos调用时间，包含Windows消息调度，不是帧率，也未人工拖动边框验收。仍不能宣称稳定60fps。

此前完整测试的project-import仍有“Import should reject”失败，其它工程模块并发迁移结果需由对应工作验收，本轮没有修改该测试或导入逻辑。来源覆盖检查通过，整体迁移仍INCOMPLETE。

最终完整smoke复核：独立owned工作目录build/test-tmp/resize-smoke-log-36284，日志为“Frame properties close did not commit”，退出0xC0000005；故障位于本轮同时新增的帧属性验收，不属于皮肤/字形oracle。当前源码/正式程序持续被其它工作更新，保留这些变化。本轮只交付已验证的渲染优化，完整动画回归仍需对应开发处理。
