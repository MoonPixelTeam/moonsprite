# RGBA 八种像素格式生产接入

日期：2026-11-14。范围：功能迁移，无性能优化。整体迁移仍 INCOMPLETE。

## 旧版契约

- `legacy/src/renderer/src/core/pixel-format.ts`：rgba32、rgb24、rgb565、rgb555、rgb332、rgba4444、rgba5551、argb1555 的通道位数及 round/expand 算法。前阶段实际旧版 oracle 共 524,104 条已一致。
- `legacy/src/renderer/src/store/workspace-commands-color.ts:151`：修改偏好转换全部 RGBA 工程，遍历图层与 Cel，按存储去重；包括 alpha=0 的颜色，不新增撤销记录。蒙版和独立瓦片源不在全局转换范围内。
- `legacy/src/renderer/src/core/document-model.ts` 的 `normalizeLayerPackedValue`、`writeLayerColor`、`writeLayerPacked`：packed 写入保留零透明度覆盖，direct color 写入量化全部通道；蒙版优先使用蒙版颜色规则。
- `legacy/src/renderer/src/core/history.ts`：RGBA point/dense region 历史直接恢复 raw；run 历史通过当前格式写入。`lua-script-service.ts` 点写使用 recordPixel，整图替换直接保留 raw。
- `legacy/src/renderer/src/core/tools-selection-transform-apply.ts`：选区翻转/变换使用 recordPixel；整层 flipLayer 仅交换成对像素，奇数中间轴不写入。`tools-selection-transform-commit.ts` 的 packed 快路只适用 rgba32，其它格式回退 packed 归一化。
- `legacy/src/renderer/src/core/tools-selection-transform-translation.ts`：普通 deferred 平移提交有直接 raw 搬运及整体 offset 路径，预览写入经过格式量化；平铺平移走 preview/edit 路径。保留这种旧版差异，不通过全量归一化改变未写像素。
- `project-format-decode.ts`、`project-format-encode.ts`：存储格式元数据；未知、缺失、非字符串及 null 回退 rgba32。`file-preferences.ts` 和 PreferencesDialog 保留既有八选项及默认值。
- `free-tile-edit.ts`：源编辑文档继承原文档格式；独立瓦片资源不因全局格式切换直接转换。

以上复用属于仓库 legacy Source-Available License1.0 范围；未复制或改标 Aseprite 代码许可。

## 原生接入

Document 保存 PixelFormat；packed 与 direct-color 写入共用前阶段算法。现有 Cel 存储共享身份保持，转换不加入 Undo。笔刷及预览、图像/动态笔刷、填充、渐变、形状、调整、GradientMap、卷积、AA、Liquify、描边、Lua 点写和浮动/即时选区变换接入对应写入方式。源编辑、形状与曲线隔离草稿继承格式；蒙版继续使用独立归一化。

工程打开、普通/恢复/历史保存、本地历史格式识别、DocumentSnapshot 和项目回滚承接格式。现有偏好控件开放八种格式；应用变更时更新全部打开工程。显式新建及 workspace document.create 继承偏好，已有工程打开/切换保留其格式。

## 验收

唯一正式 Release 构建及最终增量构建成功。`document-pixel-format` CTest 通过（0.50 秒），八种格式逐一执行：dense/cropped Cel 转换、关联图层与链接帧共享身份、蒙版和独立资源边界、普通/图像/动态笔刷、填充/渐变/形状/调整/卷积/AA、浮动与即时变换、取消/撤销/重做、Lua 点写与整图 raw 替换、快照/回滚、普通/恢复/历史保存重开、非法格式回退及本地历史 comparison/cost 的格式保留与不匹配拒绝。

最终正式程序以 `MOONSPRITE_TILE_REPEAT_CHECK_PHASE=pixel-formats` 实际运行 `--tile-repeat-check`，进程退出 0；八组 trace 完整。检查真实偏好下拉框、所有打开工程、不新增 Undo、鼠标预览/提交/Undo/Redo、新建工程继承偏好。初次夹具没有选择“颜色与图层”页，控件因此尚未启用；修正夹具切页后通过，没有放松生产门禁。

共用算法实际旧版 oracle 524,104 条、document-snapshot、color-adjustment、document-raster-history 均通过。扩展运行的 document-transactions 在第76行“新建帧后撤销不应恢复旧选区/帧选择”断言失败；本批未修改对应帧创建和自动选择历史代码，不据此宣称完整事务回归通过，后续继续对照旧版核对。来源覆盖 934 文件及证据快照通过，Editor 边界 589 源文件、diff 检查通过；`--strict` 仍因已登记迁移缺口退出 1。无新增人工图像或完整桌面验收，不将已有低位格式核心验证扩展成全部工具组合等价声明。

## 未完成范围

灰度与索引色仍未开放；索引稳定 ID 与原生 slot0 的差异尚未处理。八格式接入不代表所有工具/笔刷/特殊图层组合已完成逐项等价验收。普通 deferred 平移保留上述旧版 raw 提交差异。其它已登记迁移缺口及生产 JS/HTML 扩展仍继续保留；来源覆盖通过不代表整体迁移完成。
