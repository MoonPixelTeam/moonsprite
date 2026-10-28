# 自由瓦片工程承接

本次范围：已有自由瓦片工程的读取、显示、保存重开、恢复快照、转普通图层及撤销。TI-004 整体仍未完成。

## 来源与语义

- `legacy/src/shared/types-tiles.ts`：集合、源属性、实例属性及独立实例顺序。
- `legacy/src/renderer/src/core/free-tile.ts`：`sourceForInstance`、`freeTileInstanceTransformPoint`、`renderFreeTileRgba`，先90度旋转再镜像，源偏移先于实例变换；源与实例的可见性、透明度和混合模式继承，按实例顺序合成。
- `legacy/src/renderer/src/core/free-tile-document.ts`：共享集合身份；每帧独立实例，不能借用另一帧的实例容器。
- `legacy/src/renderer/src/core/project-format-{manifest,decode,encode}.ts`：工程字段、派生像素重建、资源路径。
- `legacy/src/renderer/src/store/workspace-commands-layer-creation.ts::rasterizeLayer`：全帧普通图层转换、样式烘焙、源资源保留/清理、单条历史。

## 原生适配

新增自由瓦片值模型，不套用规则瓦片网格。沿用原生工程 ZIP/JSON、通用 tileset 像素存储、混合器、图层合成器、快照及历史。源像素每次渲染按源解码并缓存，实例不复制源像素数组。保存保留源、实例和实例容器的额外 JSON 字段。转换调用已有普通层样式/蒙版烘焙逻辑，再以一次文档事务安装结果；未被其他自由层、规则瓦片层或格引用持有的源资源才移除。

转换时同时记录蒙版编辑上下文：样式烘焙移除当前蒙版后退出隔离；未被移除的蒙版保持原隔离状态。撤销恢复蒙版身份与隔离，重做恢复转换后的状态，不留下指向已删除蒙版的编辑上下文。

## 明确限制

- 仅既有工程读取器接纳的 schema21、RGBA、画布不超过1024、tileset尺寸不超过256等原有限制；不是任意旧 schema/尺寸的完整导入。
- 本次只准入每帧独立持有实例和栅格的自由瓦片对象。带 linkedCelId 的自由瓦片工程拒绝导入，不能悄悄展开或丢失链接。
- 自由源与规则瓦片共用同一可编辑 tileset 的混合引用暂拒绝导入，防止规则瓦片改源后自由实例缓存失效；不擅自复制或重映射集合。
- 后续新建/共享集合、源缩略图选择及 Paint 放置/擦除承接见 `free-tile-placement-20261028.md`；源笔刷/橡皮擦及 Edit 入口承接见 `free-tile-source-brush-20261028.md`，以各文实际验证记录为准。源/实例属性、实例移动、跨工程剪贴板、尺寸变更与内容变换仍未接通；有自由瓦片的工程保守拒绝部分全局内容操作。普通层基础笔刷和元数据操作仍使用原逻辑。
- 不是完整自由瓦片迁移，也不宣称全部性能策略等价。没有改动 UI 排版、皮肤或图标。

## 验证

新增 `free-tile-project-tests` 覆盖非正方形变换/源偏移、共享源、独立帧、保存/恢复/快照、非法引用/重复实例/链接拒绝、缓存写保护、全帧转换、样式合成、共享资源保留、最后资源删除、单条历史、撤销重做，以及隔离蒙版保留/烘焙删除后的编辑上下文。既有 `--layer-context-check` 加入真实顶栏转换、禁用项、撤销和自由瓦片样式保存重开检查。文档和来源检查不等于运行验收。

已实际通过：Release 正式构建、`free-tile-project-tests`、`tilemap-document-tests`、正式程序 `--layer-context-check`（exit0）；本轮前段还通过了 `document-layer-groups-tests`。正式程序仍为 `native/build/Release/moonsprite-native.exe`，入口不变。

构建/测试修正：瓦片回归套件在同一函数内保留多个完整 Document 样本，测试进程2MiB栈触发溢出，改为8MiB后通过；仅修改该测试目标，不改变软件栈设置。菜单样本使用编码结果中的实际工程ID。文档结构增加后，补编译图片读取等全部相关原生静态库，消除混用旧结构二进制产生的访问冲突；最终菜单检查通过。不进行新增UI的图像验收，也不把这些检查解释为自由瓦片完整迁移验收。
