# 可编辑色板 ID 0 与空槽迁移

2026-11-14。范围为已开放的 RGBA／grayscale 工程色板；索引色实际存储、编辑、新建和转换仍未开放。延续用户要求，只迁移功能，不进行性能优化。

## 旧版依据与原生适配

- `legacy/src/renderer/src/core/palette-layout.ts`：数字 0 是颜色身份，只有 null 是空槽。承接 normalize、order、fit 和移动规则。
- `legacy/src/renderer/src/store/workspace-palette.ts`：选择、范围、框选、移动、增删、粘贴、渐变、排序、应用色板及提取的状态与历史语义。
- `legacy/src/renderer/src/components/panels/PalettePanel.tsx`：自动／手动色板、角色标记、拖动锚点、双击改名、空槽新增、剪贴板和色板库布局。
- `legacy/src/renderer/src/core/document-model.ts`、`project-format-decode.ts`、`project-format-encode.ts`：真实 ID 0 与 null 槽位的工程表示。
- `legacy/src/renderer/src/store/lua-script-service.ts`、`lua-script-operations.ts`：MSE snapshot 与色板修改事务。

原生 `vector<int>` 采用 `EmptyPaletteSlot = INT_MIN` 表示旧版 null，保留四字节槽位与历史成本；预览 ID -1..-4096 与空槽区分。文件 DTO 继续使用 optional ID，保存及 MSE snapshot 将空槽写为 null，将真实 0 写为数字 0。该哨兵不作为文件格式或公开颜色 ID。

接入 Document 色板操作、角色匹配、历史、工程／恢复读写、本地历史比较图、Lua 操作及实际色板入口。图片、GIF、ASE、PSD、图片序列导入补齐空槽时使用同一表示。色板库和剪贴板中的 optional<size_t> 仍表示颜色数组索引，索引 0 本来有效，不改为颜色哨兵。

角色编辑调用以空槽哨兵表示无颜色身份；真实 ID 0 双击进入颜色改名。没有修改布局或图标素材，也没有开放索引色能力门禁。

## 自动检查

`make-project-manifest-fixtures.cjs` 实际加载未修改的旧版模块，生成 `build/project-manifest-fixtures/palette-zero-oracle.json`：RGBA／grayscale × 三种含 0／null 的布局 × 十八种操作，共 108 组。覆盖 entries、order、slots、columns、nextId、选择、前景角色、历史次数／字节、Undo／Redo，以及 fit 和 move preview。

原生综合测试逐组核对，并在各状态执行普通／恢复保存重开；检查本地历史 graph 的数字 0 和 Null 节点。Lua 测试检查 snapshot、ID 0 更新／改名／移除和事务撤销重做。

九个不同定向 CTest 最终通过：document-transactions、project-import、palette-columns、palette-growth、palette-layout、indexed-project-reader-oracle、indexed-project-reader、lua-script-invocation、project-manifest。首批七项共 1.89 秒；Lua 最终 5.85 秒；完整 project-manifest 最终 130.04 秒。

新增测试首次编译误将 snapshot 字符串当成 JSON 对象，修正为先解析。工程测试夹具起初缺少真实 project ID／源归档，改为从实际编码 seed 取得。Lua 测试按已有调用契约拆开名称与直接颜色字段更新，并包在 transaction 中。综合测试的旧 raw／independent 色板断言残留 `id != 0` 判空，造成对空槽查询后解引用空指针；改用显式空槽检查后重跑完整 project-manifest 通过。108 组新增矩阵在该问题修复前已通过，最终仍随完整测试再次验证。没有修改生产校验或将早先失败的两项执行记录写为一轮全绿。

来源覆盖 936 项及快照通过；Editor 边界 589 源码、架构边界 589 源码／245 targets 和 diff 检查通过。strict 继续因已登记迁移缺口退出 1；来源覆盖不证明整体行为等价。

## 正式程序与剩余范围

唯一正式 Release 构建成功，`palette-zero` 实际入口检查退出 0，覆盖 ID 0 自动／手动显示与选择、前景／背景标记、双击改名、Undo／Redo、复制、空槽新增与撤销。既有 `--palette-manual-check`、`--palette-clipboard-check`、`--palette-library-check` 最终均退出 0。手动色板首次回归仍有一个空槽布尔断言，另核对发现自动布局与色板库预期中的旧空槽值；修正这些测试表示后重新构建正式程序并通过上述三项，未更改生产粘贴行为。未进行人工图像或完整桌面验收。

索引色真实 ID surface、工具读写、合成、历史、保存及实际 UI 继续迁移。本阶段不能视为完整索引色支持或所有功能迁移完成；整体保持 INCOMPLETE。保留用户数据、恢复、缓存和日志，不提交生成物。
