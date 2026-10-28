# 切片、画布视图旋转、使用帮助：本轮交付记录

唯一正式入口为 `native/start-native.bat`；唯一正式程序为 `native/build/Release/moonsprite-native.exe`。未创建分支、外部工程、preview程序，未打包或提交。原有用户差异及测试数据均保留。

## 已写入

切片：文档元数据、选择及历史、预览后提交的创建/组移动/Alt复制/柄缩放、属性、自动切片与取消预览、轮廓偏好、快捷键、正常工程及恢复读写、静态图片/GIF/WebP/精灵表切片裁切、批量文件名去重及既有冲突流程。原素材图标直接复用旧版。

画布视图旋转：视图顺逆时针90度、双向镜像、旋转工具拖动、22.5度吸附/复位、三种指示位置、原指示PNG/rotate光标、渲染及文档命中逆变换、缩放锚点、屏幕平移与滚动条、会话/文档视图存储、平板视图角度复位。视图操作不写像素历史。

帮助及技巧：旧版24篇帮助/14篇技巧完整双语资源，原生阅读窗口、分类、全文所有词搜索、当前快捷键、独立滚动、清空/无结果、分别保存窗口几何。

## 构建与行为检查

最终正式串行构建退出0，使用 `/m:1 /nodeReuse:false`。日志：`native/build/lcd-new-round-build-fix2.log`；后续仅两项smoke截图时序调整的双源增量构建日志 `native/build/lcd-new-round-build-smoke.log`，退出0。

三个必要模型测试均通过：`document-slices-tests`（算法/历史/快照/工程/恢复/各格式裁切/去重/缺失目标错误）、`help-articles-tests`（24/14双语及13修饰操作）、`canvas-rotation-tests`（旋转镜像逆变换及吸附）。

正式程序实际窗口 `--view-rotation-check`、`--slice-check`、`--help-check` 均退出0；只改截图时序后前两项再次退出0。旋转窗口检查包含物理坐标往返、锚点缩放、鼠标捕获/Escape恢复及历史像素不变；切片窗口检查包含真实鼠标事件创建预览、空点、Escape、Alt复制、多项移动、撤销重做及像素不变。

来源覆盖检查通过393文件；`--strict`退出1，保留已知迁移缺口。来源覆盖不是行为完全等价，详见 `native/docs/legacy-provenance.json` 与 `native/docs/slices-view-rotation-20261020.md`。

## 视觉与限制

帮助/技巧两张实际对话框图已读取，可读、换行和独立滚动正常：`native/build/Release/help-dialog-smoke.bmp`、`tips-dialog-smoke.bmp`。

旋转/切片最初写图读到旧framebuffer，不能作为验收证据；增加flush/dispatch后读取双缓冲交换后的surface得到全黑。当前 `view-rotation-smoke.bmp`、`slice-tool-smoke.bmp` **不可用**。按协调要求停止继续截图或重编，旋转/切片视觉尚未验收，不将行为检查通过表述为视觉通过。

异常JSON切片坐标目前不完全复现legacy Number(value)对null/boolean/string/array的转换；非数字明确抛错阻止打开，避免静默丢切片。正常数字工程已有读写回归。PSD/ASE导出仍禁用。帮助诊断日志入口因原生诊断设施未迁移而禁用；全局语言切换尚未接入，当前中文界面保留完整双语资源。真实触控硬件及视图存储跨进程恢复未在本轮扩展验收。

## 最终程序

- UTC修改时间：`2026-10-20T18:09:33.0289561Z`
- 长度：`16390144` 字节
- SHA256：`E051E19631E8C29691B022B4D0410B6F458C634184666A8DEBCC4564B6B28C6B`

必要行为检查完成后停止；本轮未再次打开长期驻留程序。
