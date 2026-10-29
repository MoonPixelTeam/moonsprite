# 自由瓦片源属性（2026-10-29）

## 来源

`legacy/src/renderer/src/components/FreeTileSourcePropertiesDialog.tsx`、`store/workspace-free-tile-properties.ts` 的 sourceSnapshot/sourceAfterChanges/applySourceSnapshot、`store/workspace-commands-free-tile.ts::setFreeTileSourceProperties`、`core/free-tile-document.ts::applyFreeTileSourceLayerSnapshot`、`components/panels/TilesetPanel.tsx` 的双击/右键/快捷命令、`store/workspace-tilemap.test.ts` 的源属性独立性测试。颜色编辑复用现有 ColorEditorPopup，对应 Legacy ColorValueControl。许可沿用 `legacy/LICENSE`。

## 行为

- 自由瓦片源支持双击、右键“源瓦片属性”和已有可配置快捷命令 `openFreeTileSourceProperties`。不新增默认按键。打开时选择对应源，保留 Paint/Edit 模式。
- 界面只展示名称（96字符输入上限）、“显示瓦片实例”、“锁定瓦片实例”、无颜色、用户图层预设颜色和自定义颜色。保留 Legacy 显隐/锁定说明，不增加尺寸摘要、描述、偏移、混合模式或不透明度字段。
- 修改实时预览，无历史；补丁始终从打开时的基线生成。名称在预览中保留空白，提交时按 ECMAScript 空白规则 trim，空名称回退打开前名称，并同步资源名称。
- 所有具有同一源 ID 的拥有者同步属性，重新合成实际引用的全部帧，不跳过隐藏/锁定图层或禁用帧。源像素、未知元数据、实例身份/位置/旋转/镜像/显隐/锁定及独立外观覆盖不变。
- Enter、Esc、标题关闭按钮和外部点击正常关闭时，保留最终值并产生一条“图层属性”历史；无变化不新增历史、不清除重做。切换层/帧触发现有 cancelStroke 时恢复预览；异常恢复打开前元数据及缓存。
- 撤销/重做只应用源快照，不夺取当前层帧焦点，也不恢复过期的实例选择、主副角色或绘制模式。显式取消颜色表示删除 displayColor，缺省补丁保持原值。
- 颜色编辑复用现有 HSV/RGB/LAB/GRAY/PLT、透明度及画布取色入口。子颜色窗口打开时保持父属性窗口；结束取色恢复原工具。取色开始不取消当前源属性事务。

## 原生适配

复用现有 Document/Edit、共享源模型及引用缓存，不另建 Store 或全量 timeline 历史。本批历史仅持有源元数据和资源名称，重放时复用既有自由瓦片渲染。原生已有最大坐标限制仍保留；内部 description/offset 补丁支持有限值、整数截断，但界面不开放这些字段。原生现有固定缓存尺寸和其它工具缺口仍保留，不能据此声明 Legacy 全部性能方案等价。

界面复用 PixelDialog、PixelEntry、PixelSwitch、颜色按钮、ColorEditorPopup 及现有 sheet 关闭/属性图标。正文6px、字段/颜色按钮间2px、颜色组自动换行，所有坐标为1倍逻辑像素，默认整体2倍。未新增或重画资产。

## 验证

- 正式 Release 程序和 free-tile-project-tests 构建通过；核心测试通过，覆盖共享源元数据、所有引用缓存、描述/偏移命令、颜色清除、保存重开、取消、撤销/重做及焦点保留。
- 正式程序 `--layer-context-check` 退出0。实际创建原生弹窗，验证右键、目录双击、可配置快捷命令、名称/显隐/锁定/颜色修改、子颜色编辑窗口、Esc/Enter/标题关闭各提交一次、无修改关闭不增加历史，以及撤销恢复源元数据。
- 该检查发现并修复所属弹窗接收焦点时取消事务、非菜单命令允许列表缺少属性动作；测试双击坐标改用实际可见源区域，避免栏目被布局压缩后点到外面。
- 来源覆盖检查514文件通过，diff空白检查通过。未做截图逐像素验收、长期性能验证；外部点击关闭复用共享Popup行为，本批未单独模拟。子颜色窗口实际打开并验证颜色回调，未单独模拟源属性场景下的真实画布取色手势。

源属性完成不代表 TI-004 整体完成。
