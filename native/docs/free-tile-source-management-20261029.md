# 自由瓦片源新增与删除（2026-10-29）

## 范围与来源

承接 TI-004 的两个完整源管理操作：新增源、删除源；覆盖真实入口、资源、共享引用、历史和工程存储。没有将源属性、排序、密度或未使用源清理标成完成。

来源为 `legacy/src/renderer/src/store/workspace-commands-free-tile.ts` 的 addFreeTileSource/deleteFreeTileSource，`core/free-tile-document.ts` 的 replaceFreeTileSetSources/captureFreeTileSourceReferences/applyFreeTileReferences，`store/workspace-layer-resources.ts` 的默认颜色，`components/panels/TilesetPanel.tsx` 的源操作入口，`store/workspace-tilemap.test.ts` 的共享源增删测试，以及 `locales/zh-CN.ts` 的名称和文案。许可沿用本仓库 `legacy/LICENSE`。

## 行为

- 新增：使用首个未占用的“自由瓦片{序号}”名称，建立独立 1×1 透明源资源；显示色按用户图层颜色预设循环，其他字段沿用旧版默认值。初建集合的首源名称也使用同一规则，不重命名已有用户源。
- 同集合所有成员同步源列表，新增不会自动放置实例。主副瓦片均指向新资源并进入 Edit，清空实例选择；支持一次撤销和重做，复用同一资源身份。
- 删除：至少保留一个源。清理所有引用层、所有帧的直接实例引用并重绘相应缓存，保留其他实例的顺序、变换与元数据；移除资源和集合成员中的源列表项。
- 删除当前源时优先选原索引上的后邻源；删除末项回退到前邻源。删除非当前源保持主副角色。删除本身不改变 Edit／Paint 模式。
- 添加的 undo/redo 均清空实例选择并恢复各自源角色与模式；删除的 redo 清空实例选择，undo 不主动恢复旧实例选择，undo/redo 均不覆盖当前绘制模式。源操作的undo/redo保持当前活动图层和帧，不强制切回执行操作时的位置。用既有 Edit 历史增加两个会话策略标志承接这些差异。
- 活动文档事务期间不执行资源增删；不以源、实例或所在图层锁定作为资源管理禁止条件。普通图层不开放源命令。

## 入口与原生适配

使用现有栏目工具行、PixelButton 和 legacy 加号／删除图标（已在原生 sheet 注册），两个按钮间距2px；补入栏目命中、浮动置顶、绘制区域与操作行布局。现有删除按钮与 Delete/Backspace 命令分派到源删除（包括加号／删除工具按钮持有焦点时，防止误删所属图层）；新增命令接入已有 addFreeTileSource 命令 ID；源新增与删除允许在已有快捷键设置中自定义绑定，不擅自新增默认组合键。

源右键先选择主源，保留当前模式，再打开旧版菜单；已迁移删除项可用，未迁移的源属性项保持灰色，不能假装打开了近似实现。右键拖动排序尚未迁移，不声明对应交互完成。

原生继续使用既有 Timeline/Edit 事务、资源与像素缓存表示，没有另建 Store 或架构。旧版闭包捕获的源、资源和跨帧引用由既有 beforeTimeline/afterTimeline 保存；新增不重绘未变化实例，删除只重绘实际移除引用的直接 cel。原生已有解析器接纳的旧资源ID引用也在删除时清除，撤销保留原引用表示，避免删除后留下失效实例。

## 验证

- 正式 Release 构建通过，仍更新唯一产物 `native/build/Release/moonsprite-native.exe`。
- `free-tile-project-tests` 通过：共享集合、跨层跨帧引用、源角色与模式、撤销重做、保存重开、资源 ID 兼容表示、活动层帧保持与末源保护。
- 正式程序 `--layer-context-check` 通过：真实新增／删除按钮、源右键删除、末源禁用、自定义 F9/F10 命令路由、按钮持有焦点时 Delete 不误删所属图层，以及现有实例交互回归。
- 默认 2× 浮动及停靠操作行检查 15×15 按钮与 2px 逻辑间距；截图核对仅覆盖本批操作行，不代表全界面验收。
- 来源覆盖与 legacy 证据快照检查通过；整个迁移仍有已知缺口，未声明 strict 对齐完成。未进行长期性能测试或真实 1× 人工验收。

后续源排序已单独承接，见 [自由瓦片源排序](free-tile-source-reorder-20261029.md)。本文的“排序尚未迁移”是本批交付时的历史状态；源属性等其他缺口仍保留。
