# 索引色笔刷事务迁移

2026-11-14。延续当前迁移，不撤回已有改动；仅功能迁移。整体仍 INCOMPLETE，生产索引色新建、转换、可编辑导入与整体编辑准入保持关闭。

## 来源与实现

直接对照 legacy `tools-brush.ts::paintBrush`、`tools-pixel-edit.ts::paintLayerValue`、`tools-pixel-edit-state.ts::brushOriginalValue/beginBrushTailEdit`、`ink.ts`、`document-model.ts` 和 `history.ts::revertPixelEdit/commitPixelEdit`。索引 ID 先按工具查色规则解析 RGBA，再应用原有墨水、覆盖与底色算法，匹配可见色板 ID，最后沿用 packed 写入归一化。颜色相同的不同 ID、隐藏 ID、未知 ID、空可见色板及透明颜色仍按旧版处理。

普通、固有／缩放图像笔刷、动态印章和笔刷预览接入现有 RasterColorContext；继续使用 Document 当前笔画、pending、共享存储、脏区域和单条历史，不引入另一套事务。继承底色与当前底色分开；Simple、Copy Alpha Color、Lock Alpha、透明擦除与透明渐变的目标选择沿用旧逻辑。无操作返回独立状态，不能误当作写入 ID 0。

缺失 Cel 的临时表面和提交时的存储借用保留 indexed format；取消与无变化提交不创建 Cel，实际绘制提交后创建，撤销保留 Cel 身份并恢复空内容。几何笔刷草稿复制真实色板。颜色替换用解析后的 RGBA 比较笔前颜色，再写回 ID；此分支没有新增专项 indexed oracle，不据此声称颜色替换工具整体完成。

实际对照发现并修复：取消不能直接恢复未知／隐藏原始 ID；透明前景色的彩色图像笔刷需要统一擦除覆盖 key；Lock Alpha 等覆盖按原底色重新应用；完美像素尾部回退及 ISO 路径重算必须承接 `revertPixelEdit` 的 packed 归一化。完美像素尾部只对实际改变的值应用该归一化，避免原本无操作的捕获项被改写。非 indexed 墨水与像素运算保留原路径。

## 自动对照范围

脚本通过 Node TypeScript loader 实际执行旧版模块，只把两个接口导入标为 type，以承接旧构建器的类型擦除；不修改 legacy 文件或可执行算法。原生测试通过已有 friend 构造 indexed 文档，未绕过或开放生产准入。

- 1200 组：4 种色板顺序 × 3 种墨水 × 4 档透明度 × 5 种笔刷 × 5 种源颜色。检查预览不改 revision／历史／存储身份，以及实时绘制、取消、提交、撤销和重做。
- 24 组动态／继承底色：透明／不透明渐变端点，普通／彩色图像刷，三种墨水，有／无真实继承底色；同点覆盖从 30% 到 80%，等覆盖换色并移到相邻点。
- 96 组完美像素尾部：逐步转角修正及交叉回笔，分别验证普通与动态原生路径，检查实时像素及最终事务。
- 48 组 ISO 对齐路径重算：三次路径替换，分别验证普通与动态路径以及取消／提交／撤销重做。
- 12 组链接事务：两个关联图层、两个链接帧的四个引用，在提交及撤销重做后仍共享同一 indexed 存储并与旧版像素一致。
- 108 组稀疏／偏移表面：缺失活动 Cel、裁切表面、负偏移表面，隐藏／未知 ID、两种色板顺序、三种墨水、绘制／擦除及三种笔刷。验证无操作与取消不创建 Cel，实际提交一条历史，扩张保留 storage origin 的世界映射。

上述对照已通过。首次稀疏夹具在设置几何前构造 Timeline，被正确拒绝为尺寸与像素数量不匹配；夹具改为先完整安装合法几何，保留所有预期后通过。

## 交付检查

最终验收跨至 2026-11-15。14 项定向 CTest 全部通过：indexed-brush 及 oracle、indexed-history 及 oracle、indexed-pixel-edit 及 oracle、image-brush、document-raster-history、brush-dynamics、tile-repeat-stroke、document-transactions、document-pixel-format、attached-masks、isometric-stroke；两组分别耗时 14.13 秒和 2.83 秒，受影响测试目标已重新构建。旧版 tools.test.ts 墨水／图像／半透明筛选 14 项通过（81 项跳过，5.71 秒），brush-selected-rotation.test.ts 与 brush-translucent-spans.test.ts 共 11 项通过（15.66 秒）。唯一正式 Release 构建退出 0，native/build/Release/moonsprite-native.exe 已于 2026-11-15 00:31 更新（30,612,480 bytes）。

来源覆盖 950 文件及证据快照、Editor 593 源文件、架构 593 源文件／250 targets、git diff --check 检查通过。strict 已实际运行并因其它迁移缺口退出 1，未把覆盖通过等同于整体迁移完成。

## 剩余范围

本阶段不等于所有索引工具已完成。填充、独立渐变／形状／选区的完整事务、滤镜、瓦片编辑、色板修改期间的索引重映射、模式转换、新建与可编辑导入，以及 sourceArchive 保存准入仍需逐项承接。笔画期间普通色板操作取消当前笔画；没有声明完整分配失败原子性。裁切表面沿用现有原生笔画准备时扩张，验证的是像素、身份及 storage origin 映射，未宣称与旧版逐印章扩张时机／最小几何相同。没有性能优化、UI 改动、人工图像或完整桌面／硬件压感验收。oracle、日志、生成物和用户数据不提交。
