# 索引色 Cel／帧剪贴板与内容居中迁移

2026-11-15。本阶段承接普通栅格索引色的动画剪贴板、选区 Cel 粘贴和内容居中。生产 indexed 新建、转换和可编辑导入继续关闭，整体迁移为 INCOMPLETE。

## 来源与行为

直接依据 legacy 的 workspace-animation-cel-conversion.ts、workspace-animation-cel-target.ts、workspace-commands-animation-cel-clipboard.ts、workspace-commands-animation-frame-clipboard.ts、workspace-paste-cel-selection.ts、workspace-commands-selection-move.ts，以及 core/animation.ts、selection-transform-targets.ts、tools-selection-transform-source.ts、tools-selection-transform-apply.ts、history.ts 和 document-model.ts。许可沿用 legacy/LICENSE 的 MoonSprite Source-Available License 1.0。

本地 whole Cel／frame 剪贴板保留原始 uint32 ID；跨工程快照在复制时冻结 RGBA，复制后改色板、编辑内容或源 Document 销毁不会改变已捕获的快照。导入目标 indexed 时按目标当前色板映射，灰度目标使用旧版相对亮度；RGBA whole Cel 不额外重新量化。重复 ID 在 portable 解析时末项生效，选区粘贴 alpha 则按目标首项查询，保留旧版区别。Cel 类型对应元数据清理与链接重映射复用现有事务。

多 Cel 选区以各自转换后的裁切表面为权威，只将有 alpha 的像素写到共同包围框，范围外补边保持 mask=0；非透明 ID0 也不会让补边参与绘制。复用现有共享 owner 浮动预览、取消和一次提交事务。跨工程 whole Cel 粘贴借用本地剪贴板时，无论成功、拒绝还是异常都恢复原值；同工程 whole Cel 需要已有本地 raw 剪贴板，不以外部 RGBA 伪造本地 ID。

普通层新增空帧槽与结构移交承接 Surface format，mixed／special 结构事务中的普通栅格也按目标格式转换；tilemap／free-tile 继续使用其 RGBA 缓存。帧拖动复制仍使用 raw 快照。内容居中按旧版 palette 内容可见性查 bounds，indexed 复用即时选区变换、画布裁切、稀疏扩张、storage origin 和点／dense 历史；RGBA 的原有位移路径保留。

## 实际对照与回归

Node oracle 执行实际旧版 TypeScript，仅补齐 Node 类型擦除所需的 type import，不修改可执行语句。576 组对照通过：72 组 Cel 颜色转换、144 组选区 Cel 粘贴、360 组索引色居中；另有 52 组链接变体。覆盖 indexed／RGBA 源与 indexed／RGBA／grayscale 目标、空色板／排序、非透明 ID0、重复 ID、负坐标／画布外／稀疏／空内容、矩形与 mask、三个居中方向，以及取消／提交／Undo／Redo、原始 ID、format、几何、storage origin、选择历史与链接存储身份。

另外 12 组直接调用旧版 pasteCelSelection，覆盖三种目标模式、两个不同裁切表面的共同 bounds、独立与共享 owner，以及追加帧与已有帧。原生逐像素核对 preview／commit／Undo／Redo，逐项核对 source values／mask／opacity metadata，检查取消移除追加帧、空闲层的空槽 format 和单次历史。四组 indexed 输入在提交、Undo、Redo 分别调用普通保存／恢复／本地历史三种生产编码器，读取 manifest 并解码全部 Cel 栅格核对 ID 与几何；可编辑 indexed 导入仍拒绝，不声称已可编辑重开。

whole Cel／frame 另检查 copy 后 palette 改动、target local clipboard 隔离、本地 raw 再粘贴、源 Document 销毁后的 portable 粘贴、本地帧粘贴和 drag duplicate。旧版三个实际测试文件共 24 项通过（11.44 秒）：workspace-animation-clipboard.test.ts、workspace-animation-drag-copy.test.ts、workspace-selection-pivot-alignment.test.ts。

对照修复了结构 shareSurface 漏传 format、共同 bounds 补边参与 alpha 判断，以及跨工程粘贴覆盖目标本地剪贴板。初轮多 owner oracle 在链接前没有投影手工设置的表面，导致 connectAnimationCels 同步旧活动层；按真实旧版入口先 refresh 后链接，保留所有预期。栅格历史回归的两个 synthetic 选区夹具只有 SelectionClipboard 像素而 Cel 表面不一致，现提供同样的裁切表面；本地缺失目标夹具也将构造的源块安装到 session clipboard。原有像素、缺失槽、取消、预算原子拒绝和 Undo／Redo 断言全部保留。

九项不同的定向 CTest 最终通过：indexed-animation-oracle、indexed-animation、indexed-selection-oracle、indexed-selection、cel-selection-clipboard、document-raster-history、free-tile-project、selection-interactions、document-layer-group-structure。首批 56.99 秒中八项通过，raster-history 暴露上述夹具问题；修正后的单项 CTest 通过（2.82 秒），其余已通过项没有相关生产源码变化，不重复运行。唯一正式 Release 构建退出 0，native/build/Release/moonsprite-native.exe 于 18:53:10 更新（30,702,592 bytes）。正式 selection-interactions 进程通过，未进行新的人工图像或完整桌面验收。

## 边界与后续

Editor 边界 594 源码、架构 594 源码／257 targets 通过。来源覆盖 965 文件及证据快照检查通过；coverage 通过不能代表行为等价，strict 因现有登记缺口退出 1。日志和生成夹具保留在 native/build/，不提交生成物或用户数据。

完整 indexed 对称组合、其它未登记完成的工具组合与生产模式准入继续迁移；未宣称全部功能已完成。本阶段不进行性能优化、布局改造或额外打包，不改动已获用户确认的半像素形状取整行为。
