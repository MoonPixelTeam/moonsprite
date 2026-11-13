# 蒙版笔刷预览迁移

旧版依据是 `workspace-session.ts::activePaintLayer`、`canvas-render-preview-pixels.ts::previewLayerColorAt/previewColorAt`、`document-model.ts::normalizedMaskColor/layerMaskDisplayColor`、`document-composite-sampling.ts::readMaskCoverage`，以及 `tools-brush.ts`、`tools-pixel-edit.ts`、`history.ts` 的写入归一化顺序。隔离蒙版显示覆盖率灰度，普通视图按活动蒙版身份替换合成；原始 RGBA 先参加墨水混合，结果写入蒙版时才归一化。

原生此前从普通 Cel 读取悬停底色，并把蒙版预览当作图层像素替换；实际落笔还提前归一化前景色，在已有蒙版上混合半透明色时偏离旧版。本阶段保留已有修改，修正上述路径。新增只读活动蒙版访问器，不改变普通 Cel 访问接口。隔离模式预览为不透明灰度，轮廓按隔离背景与旧版 145 阈值取黑白；普通视图把局部蒙版替换传入已有图层、组、剪贴、样式和调整层合成器，替换区域外继续读取原蒙版。现有完整渐变／调整蒙版预览接口保留。

定向核心检查包括图层／组、链接／独立、偏移／原点八种蒙版；每组核对三种墨水、三种颜色、两档不透明度，以及图像笔刷缩放／原尺寸、三种图案模式、旋转和擦除。检查预览与真实落笔、撤销／重做、原图层不变、选区空洞、空闲忽略选区、跨缝平铺及只读存储身份。额外比较样式邻域、剪贴、组累计混合和调整层局部预览与实际完整合成。

唯一正式程序增加 `--tile-repeat-check` 的 `mask-brush-preview` 阶段：四种平铺 × 图层／组蒙版 × 隔离／合成，共十六组。断言实际绘制颜色、半透明灰度、邻接像素、隔离轮廓、链接身份、只读状态，以及真实鼠标落笔后的撤销／重做。此入口是定向验收，不是替代完整桌面测试的新程序。

真实窗口检查还发现原生鼠标笔刷入口仅放行普通 raster，虽显示蒙版笔刷指针却不能落笔。按旧版 `canvas-pointer-down.ts::activePaintLayer/canEditLayer`，普通笔刷入口接入现有 `maskBrushAvailable`，保留锁定／显隐门禁及既有动态、图像笔刷、笔画历史实现。

最终验证：唯一正式 Release 和 attached-masks-tests 构建成功；核心蒙版完整测试退出 0，新增八组共 144 个普通墨水／颜色／不透明度组合、288 个图像笔刷组合及样式／剪贴／调整合成检查均通过。真实正式程序 mask-brush-preview 十六组退出 0；free-source-preview、free-placement-preview、shift-lines 三个相关阶段均退出 0；原有 brush-preview CTest 通过 0.91 秒。旧版 `canvas-render-preview-pixels.test.ts` 和 `canvas-render-brush-path.test.ts` 两文件共 13 项通过（4.89 秒），`document-mask-composite.test.ts` 三项通过（3.98 秒）。人工查看本轮 mask-brush-preview-smoke.bmp，仅确认 Both／组蒙版／隔离灰度画布的九个副本与悬停位置，不扩大为整个桌面验收。

初始回归先后暴露预览颜色、真实落笔颜色及 UI 输入门禁问题，均按旧版修复。新增夹具的偏移蒙版 Undo 会依法替换存储，已改为每次预览前记录身份，严格检查预览前后身份不变；调整层夹具改用其现有批量蒙版创建入口。保留逐像素和历史预期，没有将合法 Undo 的存储身份当作预览副作用。来源覆盖 929 文件及证据快照、Editor 边界 587 源文件和 diff 检查通过。

本阶段只做功能迁移，不作性能或全软件 FPS 声明。全部迁移仍未完成；非 RGBA 颜色格式、分数缩放／旋转轮廓逐像素等价和未登记组合不在本次通过范围内。全部用户数据、构建缓存与既有错误日志保留。
