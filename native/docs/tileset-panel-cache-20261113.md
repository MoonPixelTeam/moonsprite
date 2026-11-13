# 2026-11-13 瓦片面板缓存阶段验收

用户已明确要求完成本批改动，之后回到功能迁移。本批范围仅为现有瓦片面板；不扩大全软件性能审计。

## 来源与实现

- `legacy/src/renderer/src/components/panels/TilesetPanel.tsx` 的 `tileIdsInSlotRange` 与 `moveTilePointer`：矩形只访问相交格，同格拖动及相同预览不重复更新。
- `legacy/src/renderer/src/core/tilemap.ts:679` 的 `tilesetTileIndex`：按稳定字符串 ID 缓存索引。
- `legacy/src/renderer/src/components/TilesetTileThumbnail.tsx`：资源版本、预览像素与瓦片身份决定缩略图更新。
- Aseprite 仅只读核对 MIT `doc/tileset.h` 与 `doc/palette_picks.h` 的索引方式。未复制受 EULA 约束的 app/UI 实现；旧版许可已核对。

原生按文档身份、revision、内容变化序号及活动图层复用资源索引、slots 与自由源列表。缓存保存资源位置，读取当前 state，不保留可能失效的模型指针。缩略图按二元身份键缓存，版本改变后比较实际尺寸与像素，只上传发生变化的图像。缓存限制为 1024 项及 16 MiB 的像素快照与 RGBA surface payload 估算；它不是整个进程或 GPU 的精确内存预算。

选框继续共用原素材与命中 API。选择范围缓存格坐标，滚动只转换坐标；拖动取消、Shift/Ctrl、多选、撤销重做语义保留。revision 变化时仍核对资源内容；选择向量比较仍随选中数增长，不宣称所有操作恒定时间。

## 实际检查

唯一正式产物 `native/build/Release/moonsprite-native.exe` Release 构建成功。最终 SHA-256：`458BAC025ACBA2C193F212316DEEA5478101A9456AAEE11A023184F8281257AA`。

- `tilemap-document`：通过，0.55 秒。
- `--tileset-management-check`：通过，12.31 秒。真实面板 4096 瓦片夹具验证重复 paint/sync 不重建索引、布局或上传；全选与滚动范围；小矩形四格访问；同格手势与取消；元数据和布局修改复用 surface；像素及尺寸变更、Undo/Redo 刷新；1024 项与 16 MiB 淘汰；同 ID 跨文档隔离；自由源 catalog 重排和 Undo。该入口的填充、预览与选区删除原回归也通过。
- `--free-tile-transform-check`：通过，1.48 秒。
- `--layer-context-check`：通过，9.55 秒，包含真实自由源重排、属性与现有交互。
- 来源覆盖 919 文件、证据快照与 `git diff --check` 通过；总体行为对齐继续为 INCOMPLETE。

GUI 检查使用测试专属 LOCALAPPDATA、恢复根及工作目录；没有读取或删除用户工程。最终记录在 `native/build/test-tmp/tileset-panel-gui-20261113-161340/results.json`，上下文入口记录在 `native/build/test-tmp/tileset-panel-context-20261113-161429/`。

## 测试前置条件修正与边界

首轮新增导入夹具缺少必需的来源指针，已补齐非空测试来源。后续填充及自由变换指针检查被默认悬浮预览遮挡，现显式关闭该测试不使用的预览，保留实际输入断言。

原有 `smokeLayerContext` 因同一函数的无关场景预留过多栈空间，出现 0xC00000FD。两个场景体隔离为同步调用，未修改原体及断言；去掉包装和预览前置行后可逐字恢复原函数内容。正式 MAP 与 PE unwind 核对公共入口栈从 853592 字节降到 184 字节，未调整线程栈限制。两个分支均在正式程序实测通过。

本批没有视觉布局改动，没有新增人工截图、1×显示器或全软件 FPS 验收。缓存计数与进程检查不能代表用户机器全部卡顿已经解决；全部迁移仍未完成。后续继续迁移旧版功能。
