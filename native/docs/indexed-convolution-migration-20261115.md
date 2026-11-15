# 索引色卷积滤镜迁移（2026-11-15）

本阶段按 DR-010 迁移普通 indexed 栅格的全部40种卷积预设，复用实际 legacy convolution-matrix、workspace-convolution-preview、document-model 和 adjustment snapshot。核对 legacy/LICENSE 的 MoonSprite Source-Available License 1.0，仅做内部功能迁移。

## 算法与事务

沿用原矩阵权重、默认通道、除数、偏置、透明采样的RGB重归一化、alpha原始除数及零除数跳过。源颜色按第一个同ID资源读取；内容范围按全部有alpha资源ID的并集扫描，空色板无可见内容。存储外直接透明，不把越界当有色ID0。结果按可见色板最近色映射到ID，不分配资源；未写入位置保留原始ID。卷积选区沿旧版接受所有非零掩码值，包括2，使用卷积专用判断，普通选区工具不受影响。

索引色不能走把ID当RGBA的dense路径。复用原稀疏规划和扩张，保留format、世界坐标、storage origin及原始画布外像素；1×1的ID0按旧版空占位规则扩张，有色非零ID不能误判空占位。

后台任务沿用独立SurfaceTask、不可变色板、取消和预览代数。发布核对文档身份、版本、活动层与帧、选区、源绑定、色板与模式，所有结果通过后发布。历史复用已有SurfaceChange和色板kind14，撤销重做恢复原始ID、几何、资源、顺序和分配器，保留当前色板布局及角色选择。预览禁用、重复和取消不改正式作品或历史。

## 验证与边界

实际Node oracle执行未修改的convolveLayer，覆盖六种色板、三种可见顺序、七种布局、全部40预设与两种通道／平铺／选区组合，共10080组；其中104组执行真实createConvolutionPreview的预览、重复、取消、应用、撤销与重做。原生另外检查链接owner、三种生产编码器、取消、过期代数／色板、跨文档、多owner及内存准入。

旧版两个真实测试文件8项通过（11.27秒）。原生10080组对照、52组链接变体及三个生产编码器检查通过。七项不同定向CTest全部通过：indexed-convolution-oracle／indexed-convolution共4.74秒，indexed-adjustment-oracle／indexed-adjustment／selection-interactions／document-raster-history／filter-preview-controllers共9.81秒。首次对照发现mask2判断差异，修正后重新生成受影响测试程序，最终结果来自修正版。相关回归同时覆盖原RGBA卷积及预览控制器；没有把旧测试程序结果作为修正版验收。

正式Release构建与受影响测试最终重建均退出0。唯一正式产物native/build/Release/moonsprite-native.exe于2026-11-15 23:59:46更新，30,726,144bytes；selection-interactions在正式程序生成后通过。2026-11-16完成本阶段验收。来源976文件及证据快照、Editor595、架构595源码／262targets与diff检查通过；strict因整体已知迁移缺口退出1。

生产indexed新建、转换和可编辑导入仍关闭，自动抗锯齿及其它索引色缺口继续迁移，整体INCOMPLETE。没有人工图像或完整桌面验收。
