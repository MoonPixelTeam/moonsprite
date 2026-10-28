# 自由瓦片实例进入源编辑（2026-10-29）

本批承接 TI-004 中从实例列表进入源编辑及选中实例的编辑坐标定位，不代表自由瓦片全部工具、属性或性能已经等价。

## 旧版依据

- `legacy/src/renderer/src/components/panels/FreeTileInstanceLayers.tsx`：双击未自身锁定的实例行，调用 `selectSingleInstance(instance, true, false)`，单选并进入 Edit；不额外闪烁，不切换当前工具。眼睛、锁与属性按钮阻止行双击传播。
- `legacy/src/renderer/src/store/workspace-commands-free-tile.ts`：`setSelectedFreeTileInstance` 将实例和源选择同步至所属自由瓦片层；选择及模式变更属于会话状态。
- `legacy/src/renderer/src/components/canvas-pointer-down.ts::prepareFreeTileSourceEdit`：先按命中解析目标层和源，再将当前选中实例作为源编辑的优先实例。
- `legacy/src/renderer/src/core/free-tile.ts::freeTileSourceEditTargetAtPoint`：优先实例只有在属于已解析源时才优先；该实例自身隐藏或锁定时，由调用方拒绝编辑，不改用另一副本。没有匹配优先实例时，沿用指针命中与同源最上方可见实例回退。
- `legacy/src/renderer/src/core/free-tile.test.ts`：现有源方向映射测试与空源锚点测试作为规则证据；本批扩展的组合断言为原生回归测试，不冒充旧版已有相同测试。

已核对 `legacy/LICENSE` 的 Source-Available License 1.0 第2节修改与内部构建权限；沿用仓库许可和归属，不将其声明为 MIT。

## 原生承接

实例行双击复用已有 `Document::selectFreeTileInstance` 的单选、源选择及 Edit 模式逻辑；结束行拖动捕获，不修改当前工具、作品、版本或历史。自身锁定行以及眼睛、锁和属性区域不触发行进入编辑。

源笔刷准备阶段保留已有跨层命中与命中源优先，只在源相同时用主选实例替换编辑锚点。其旋转、镜像和原点继续由已有临时栅格与逆变换处理。绘制仍更新共享源，各引用缓存继续使用既有发布机制；取消、一次提交、撤销重做和工程读写复用既有路径。另一来源位于指针下时，不能被选中实例强行覆盖为当前来源。

本批不新增按钮、图标或素材，不调整布局及字号，不更改256像素源尺寸限制、缓存发布及历史性能方案。整体自由瓦片工具覆盖、源属性、画布外缓存扩展及长期性能缺口保持登记。

## 验证

正式 Release 构建成功，稳定产物仍为 `native/build/Release/moonsprite-native.exe`。

- `free-tile-project-tests` 通过：覆盖16种旋转／镜像组合、选中实例与指针下同源副本不同、另一来源命中、无选择回退、隐藏／锁定保护、取消、单次历史、撤销重做及保存重开。保存重开比较实际像素与规范化后的源元数据。
- 正式程序 `--layer-context-check` exit0：包含真实列表消息路径下的双击单选进入 Edit、控制区隔离、自身锁定保护，以及会话选择不增加内容修订或历史的断言。
- 来源登记覆盖513文件通过；本批 diff whitespace 检查通过。整体来源登记仍有已知迁移缺口，不代表行为全部等价。

本批未进行新增图像或性能验收；未更改界面布局或素材。
