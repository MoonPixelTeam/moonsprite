# 瓦片栏目五档缩略图尺寸（2026-10-29）

## 来源与范围

按 `legacy/src/renderer/src/components/panels/TilesetPanel.tsx` 的 `handleTileWheel`、自由瓦片 `handleWheel`、独立存储键及 `core/palette-layout.ts` 迁移普通瓦片与自由瓦片源的五档显示尺寸。尺寸量化参考 `components/usePixelGridMetrics.ts`；偏好语义参考 `core/panel-preferences.ts`。许可沿用 `legacy/LICENSE`。

## 行为

- 鼠标位于瓦片格区时，Ctrl 或 Meta 加滚轮调整缩略图尺寸。五档为 tiny/small/medium/large/huge，对应 22/30/40/52/64；默认 medium。
- 取绝对值较大的滚轮轴，等大时取纵轴；负值增大、正值减小，每次事件只变一档。零值和到达边界不写偏好；普通滚轮继续滚动栏目。
- 普通瓦片与自由瓦片分别记住尺寸，切换图层或工程不会覆盖另一类偏好。读取缺失或无效值回到 medium。
- 显示尺寸改变时取消尚未提交的选取/排序/布局手势，释放捕获；由同一几何计算列数、滚动边界、格子命中、源拖动目标、缩略图缩放和选中轮廓。缩略图继续复用缓存源表面与最近邻绘制。
- 不修改作品像素、图层、帧、瓦片源身份、主副瓦片角色、Edit/Paint 模式或文档历史。复用既有 sheet 选择素材及 `selectionMaterialBounds` / `drawSelectionBorder` / `selectionContains`。

## 原生适配

尺寸为原生逻辑像素，默认整体2倍。格间保留用户已要求的2px，而不恢复 Legacy 的0px间隔。普通与自由源偏好分别存入已有 `LOCALAPPDATA/MoonSprite/Native/tileset-swatch-size.txt` 和 `free-tile-swatch-size.txt`，复用原有原子文件写入，不引入浏览器存储或外部工程目录。失败时保留内存尺寸并显示保存错误，原文件不覆盖。

## 验证

- 唯一正式路径 Release 构建成功，最终程序 `--layer-context-check` exit0。该入口分别建立普通瓦片与自由瓦片样本，真实派发 Ctrl/Meta 滚轮，覆盖五档、主滚轮轴、单档步进、边界/零值不写偏好、普通滚动与独立尺寸回调。
- 两类样本均逐像素比较五档选框渲染 alpha 与实际边框命中；验证显示调整不改变作品像素、历史位置、修订、主副角色和绘制模式。自由源格子2px间隙不命中；保留原源排序及上下文回归。
- 来源覆盖513文件及证据快照、whitespace检查通过。偏好文件加载/原子写入完成源码核对；未进行真实用户偏好文件写入后重启验收，不覆盖用户配置来验证。
- 曾运行范围更大的 `--tileset-management-check`：先在后续填充工具检查报告画布被栏目遮挡，调整测试停靠布局后出现进程栈溢出；仅将部分测试临时文档改为堆分配也未解决。已撤回这些尝试，不改变正式堆栈配置；该组合检查未通过，原因尚未完整定位。本批将两类尺寸验证放入上述已通过的定向入口，不声明完整组合回归通过。

未进行界面截图、真实1倍显示或长期性能验收。源属性等 TI-004 缺口仍未完成，不将显示尺寸迁移计作整个模块完成。
