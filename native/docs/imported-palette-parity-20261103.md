# 导入色卡与旧版行为对齐（2026-11-03）

范围：FS-002 / DR-009 的 RGBA 导入色卡。不是整个文件或颜色领域的完成声明。

## 旧版依据与实现

- `legacy/src/renderer/src/core/imported-palette.ts` 的 `hasLimitedExactColors` / `applyImportedRgbaPalette`：先检查非透明 RGBA 颜色数，4096 色以内全量扫描，超过阈值使用 262144 像素抽样；默认最多输出 256 色。
- `legacy/src/renderer/src/core/palette.ts` 的 `extractPaletteColorsFromRgbaSurfaces`：跨 surface 连续抽样，权重中位切分；平均色重复时按频数及 packed RGBA 选择未用来源色，必要时继续补足数量。
- 同文件 `splitBucket` 的失败保护：最大通道末色权重过高时切分可能产生空桶，旧版停止切分，再沿原规则生成代表色并补足；原生补齐此保护，避免空桶求平均除零。
- 同文件 `comparePaletteColors(luminance)`：线性亮度、最大通道、灰色／色相／饱和度、alpha 和 packed RGBA 的完整比较顺序。

许可核对：上述模块是本仓库 MoonSprite 源码，适用 `legacy/LICENSE` 的 MoonSprite Source-Available License 1.0；第 2 节允许修改及内部开发编译测试。本次没有把它们标为 MIT，也不涉及分发编译产物。

原生复用现有 `extractImportedPalette` 与所有调用入口，只补齐上述缺失分支。`Document::fromImage` 增加少色判断，保留大图中位于抽样间隔的稀有色；透明像素不进入色卡，半透明像素保留。未改变作品像素、历史或保存初态。共享算法继续服务 GIF、ASE 与 PSD 读器。

`legacy/src/renderer/src/locales/zh-CN.ts` 的 `core.document.colorName` 实际为 `{id}`。静态图、GIF、ASE、PSD 导入统一承接纯编号名称；只修正生成的导入色名称，不修改用户已有工程色卡名称。ASE 入口依据 `legacy/src/renderer/src/core/aseprite.ts` 的 `applyImportedRgbaPalette`。

C++ 使用整数样本上限代替 JS Infinity；本次未改变现有 1024 画布和内存预算限制。未引入新解码器或外部运行依赖。

## 验证

`node native/scripts/generate-imported-palette-fixtures.cjs` 使用 Node 24 内置 TypeScript 类型移除及 VM，直接执行旧版提色和排序函数，生成 58 组确定性期望。仅适配相同 packed RGBA 打包；DOM、合成和编码等未调用依赖不加载。这批对照曾实际触发原生空桶除零；补齐保护后全部通过。覆盖多 surface 抽样、透明度、排序、数量边界、带权量化及邻近 RGBA 色立方体；不是全输入等价证明。

`palette-extraction-tests` 对照这些固定参考值，并检查 1024×1024 大图稀有色、透明图、色卡槽位／ID、原像素及 clean／历史初态。

`gif-open-tests` 增加实际 PNG 编码读取与原生工程保存重开，验证稀有色和半透明像素；保留既有聊天缓存 GIF、时长、来源、序列与失败保护检查。

使用 Visual Studio 自带的 CTest，最终代码已执行以下参数：

```powershell
ctest --test-dir native/build -C Release -R '^(palette-extraction|gif-open|psd-import|aseprite-io|image-save)$' --output-on-failure
```

五项测试全部通过，包含 58 组旧版算法结果、PNG 稀有色往返、静态图／GIF／ASE／PSD 导入编号，以及图片保存回归。来源覆盖检查 576 文件通过。

唯一正式产物 `native/build/Release/moonsprite-native.exe` 已重新构建成功；`--aseprite-save-check` 与 `--aseprite-io-check` 均返回 0，覆盖既有实际打开／拖入、原格式保存／另存、损失确认、失败保护和 PSD／ASE 回归。启动入口仍为 `native/start-native.bat`。需求静态台账检查通过；该检查仅证明入口、证据及链接一致性。

未进行人工截图或外部图像软件验收；全部功能迁移仍未完成。
