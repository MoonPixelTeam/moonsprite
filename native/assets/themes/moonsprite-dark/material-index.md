# 集中 UI 素材索引

编辑 `sheet.png` 的命名区域；`theme.xml` 定义坐标、九宫格和颜色。完整逐区域坐标、来源及使用点见 `sheet-regions.json`，包含原有皮肤区域、tool/utility 图标、颜色选择标记及 27 张指针图片。原始 128×120 皮肤区域保留。默认主题优先读取 atlas；旧主题缺少新区域时使用原 PNG fallback。

指针热点与 38 个语义 ID 保留在 `../../cursors/cursors.txt`，图片由 `cursor.*` 区域提供；热点以原图像素计，指针不随 2× UI 再放大。自定义指针目录仍独立。图片全部逐像素保留转换后的 RGBA；未迁移工具的图片存在不代表功能完成。

来源：工具 SVG 来自 legacy/src/renderer/src/assets/tool-icons；utility 路径来自 legacy/src/renderer/src/components/PixelUtilityIcon.tsx；指针来自 legacy/src/renderer/src/platform/cursor-theme.ts 的 imports。具体文件见 JSON。颜色选择标记来自用户提供原图，见 ../../color-picker/README.md。皮肤基底、timeline、menu 由已确认用户参考和现有渲染提取，非 legacy 图标新设计。Aseprite 裁图许可见 ATTRIBUTION.md；legacy 素材沿用仓库既有授权，不能据此另行声明第三方开放授权。

明确例外：Fusion Pixel 字库和字体许可保留在字体目录；文字由字体渲染。作品像素、选区/画笔轮廓、棋盘格、用户调色板颜色、实时 SV/色相/透明度渐变属于数据或动态渲染，不固定烘焙进 sheet。颜色角色仍由 theme.xml 控制。尚未接入的隐藏功能不在本次静态 UI 覆盖内；本次不代表全部 legacy UI 已迁移。

修改 atlas 或热点后重新启动 native/start-native.bat。独立 tool/utility/color-picker PNG 是来源与兼容副本，默认主题实际显示优先使用 sheet；仅修改这些副本不会覆盖已存在的 atlas 区域。导入脚本属于一次性操作，不要用于覆盖用户改画的 sheet。
