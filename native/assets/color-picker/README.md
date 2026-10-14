# 调色盘选择标记

用户原图 `codex-clipboard-0f840331-da0b-43ef-94c1-f06cb2bf6cee.png` 原样保存为 `marker-source.png`，尺寸 9×4。

- `marker-light.png`：原图 x=0、y=0、w=4、h=4，白色轮廓，四角 alpha=128。
- `marker-dark.png`：原图 x=5、y=0、w=4、h=4，黑色轮廓，四角 alpha=118。

中间一列透明隔开两个状态。导出为 PNG，逐像素保留原 RGB 和 alpha，没有描摹或重新设计。

可替换这两张 PNG；两张必须同尺寸，最大 32×32。默认显示整体 2×。主程序调用 `loadMarkers` 或重新启动后更新，不需要改共享 sheet。标记在 SV、色相、透明度三块使用同一套素材。
