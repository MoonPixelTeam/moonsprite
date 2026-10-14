# 工具属性迁移第一批

2026-10-12，承接用户两张属性行参考图；DR-001 的部分落地。

## 已接入

菜单下旧新建/撤销/重做/皮肤快捷行改为工具属性行。新建仍在文件菜单；皮肤编辑已移出主程序，后续独立工具另行实现；撤销重做位于该行最右侧。当前画笔和橡皮显示各自属性，抓手隐藏画笔参数。溢出时普通滚轮沿单行移动，不接管 Ctrl/Meta。

形状：圆形、方形、横线，使用 `editor-tools.tsx/pixelMasks` 原始像素图标。尺寸 1–64，不透明度 0–100，默认 1/100/round；输入或滚轮修改，按画笔/橡皮分别记忆并保存到原生独立配置，不写作品撤销。暂未实现旧 NumberInput 的上下箭头按钮和弹出滑杆，输入框与滚轮提供有效参数通道。

`brush.h` 直接移植 `tools-brush-spans.ts/integerEllipseRowSpans` 的整数圆形轮廓，方形/横线使用 `tools-brush.ts/solidBrushPreviewRowSpans`；偶数尺寸锚点 floor(size/2)，沿 legacy strict Bresenham 采样并保持 size/16 的 stampSpacing。连续印章按上一印章行跨度扣除重叠，新覆盖像素进入增量事务。

不透明度使用 `ink.ts/resolveInkStampColor` 的覆盖量取整与 `raster.ts/blendOver`；统一以本笔画前像素合成，同一笔画重叠不重复叠加 alpha，下一笔画再叠加。透明笔刷按 legacy coverage 衰减原 alpha；取消/撤销/重做均使用同一增量像素历史。右键笔画使用次色（含橡皮右键），对照 `canvas-stroke-brush.ts/activeColor`。

工具栏所有图标来自 legacy 原 SVG、utility 主路径+42%半透明路径、形状掩码，无自行画图。新 theme sheet.png 不变，文本/按钮沿用当前皮肤。

## 保留缺口

阶梯、完美像素、抖动、图像笔刷、墨水其他模式、动态、对称和更多项尚未接通，灰显并在指向时说明，不把可改数字伪装成已实现。方形/线形旋转角度、笔刷实时预览、完整偏好迁移、临时工具切换时输入所有权、滚动条/触控平滑横滚、鼠标/压感动态采样、工具全部功能仍待后续。64px大笔刷目前复用相邻印章跨度优化及已有增量事务，未移植legacy专用packed recorder/多层图像路径；不得称整套性能架构已等价。

## 检查

核心断言：5px圆形固定mask、偶数方形锚点与边界裁切、横线stamp、50%不透明度来回笔画不累计、取消、透明橡皮alpha、0%无操作保留redo、与已有20,736定向线段对照及色卡历史测试一起通过。

原生 `--smoke`：属性输入真实更新、参数clamp、画笔/橡皮独立记忆、抓手不显示画笔属性、属性编辑不写文档历史、原有色卡/菜单/主题/画布交互通过。真实窗口截图已目检，非完整手工长期使用验收。

## 属性行 UI 修正

尺寸/不透明度按 legacy NumberInput 的独立 suffix 在输入框内绘制，单位不进入可编辑数字串；所需宽度包含最大值、单位、左右留白和1px光标。输入框17px与图标按钮16px共底，使可见彩边上下对齐，透明留边/阴影不改素材。阶梯1改为禁用输入框（legacy范围1..16，算法仍未迁移）；完美像素保留legacy checkbox图形和标签，去掉外层按钮背景，仍禁用。笔刷/抖动/图像笔刷3项及对称5轴+more6项内部共享1px描边，组间2px；顺序来自 EditorToolOptions/SymmetryControls。


## D4 渐变（2026-10-14）

工具组启用 legacy `tool-gradient-normal`，Shift+G；属性按实际旧版接入线性/径向、容差0–255、连续、当前/可见图层、4/8连接、9种抖动、自由色标、即时/确认应用。连接与采样来源沿用桶/魔棒共享语义，整体属性行可滚动。线性Shift保持距离16方向；径向默认拖框椭圆、Ctrl中心、Shift等比、Alt冻结椭圆旋转，松Alt保留形状建立后续缩放锚点。

自由色标保留已定义交互：轨道点选/点击插入、拖动排序、端点交换、向下拖删（最少2个）；位置百分比/6或8位HEX、最大空隙添加、删除、反转、前背景色重置。右键倒置色标与端点。图标只转换原 `gradient-linear.svg`、`gradient-radial.svg`、`gradient-stop.svg` 像素形状与渐变透明度。

Document保存独立预览缓冲，画布原像素、dirty/content revision、文档history不因预览改变；确认模式释放后可编辑start/end/move，Enter/应用一次提交，Esc/取消丢弃。编辑期间Esc/丢capture回退本次句柄编辑；上下文更改作废预览。确认中的色卡角色/picker/HEX及属性变化重新采样。选区只裁输出，不阻止渐变区域传播；alpha0按旧版source-over保留原RGB，半透明合成，普通双色透明端点RGB归一化，自定义色标不归一化。

16ms合并pointer预览请求，区域行采样和renderer旧/新区并集增量修复，多层与洋葱皮保留当前层替换；线性抖动按legacy residue/span采样。>=512²变更矩形使用dense before/after含孔像素，小变更用差量history。保留缺口：特殊图层/组/蒙版/索引、稀疏越界扩展、grid/symmetry、旧版downscale平均预览专用加速仍未迁移；不宣称整套渐变性能等价。

检查：核心少量线性/径向/9抖动跨度、透明RGB、自由色标、选区clip、独立预览/取消/单history撤销重做断言通过，project-save-tests目录fixture通过。正式exe编译通过。provenance覆盖93文件通过；该覆盖并非行为等价。


实际短运行验收：最新官方 `native/build/Release/moonsprite-native.exe --animation-check` 退出0，新增断言覆盖工具/属性、确认preview无dirty/history、待确认色彩刷新、tool锁、Esc、右键反转、Enter单history、undo。旧内容移动fixture因新增默认轴心命中选区中心，明确设置轴心隐藏以检查原内容提起语义，未改产品命中点。自由色标轨道目前为原生属性行滚动区适配，尚未做长期人工使用/多DPI视觉验收。最终构建保留单节点 `/nodeReuse:false` 完整日志 `native/build/gradient-build-final.log`，退出0；先前瞬时obj/exe权限错误无活动cl/link且独占原文件可写，实际原因未确认，未删缓存、未改ACL、未强杀程序。


## D4 基础形状（2026-10-14）

已接直线与矩形/椭圆描边、填充工具组，沿用原legacy图标。U形状快捷键；legacy直线未分配默认键，不编造L。描边宽度来自共享brushSize1–64向内扩，不是扩大外轮廓；狭窄形状填满且不超形状范围。直线沿默认balanced stair实际路径，复用笔刷round/square/line形状、size/16采样间隔（线形笔刷每点）、像素去重复合成和现canonical层存储。矩形圆角开关/半径0–256默认4、比例开关/两字段0.1–100与交换按旧版。形状不加额外brushOpacity，源RGBA alpha实际合成；透明形状写packed原RGB。

Shift直线step1方向约束、矩形/椭圆等比、Ctrl中心、Alt冻结几何旋转与释放续缩放来自已迁移旋转几何；修饰键无鼠标移动也更新。Document复用独立显示预览缓冲和现renderer区域修复，预览不写作品像素/dirty/content/history，释放一次提交、Esc/丢capture取消，lock/hidden不写；选区只裁输出，正确目标为当前普通RGBA层/帧解析canonical，链接undo恢复发起alias。属性偏好追加兼容尾部。

已知旧版缺陷（保留现状，不作为正确需求）：基本shape beginShape分支没保存右键drag.color，endShape默认回落前景色，所以本批矩形/椭圆右键仍画前景色；直线有captured color，右键背景色正常。没有擅自更改产品语义。

保留缺口：curve/freeform/polygon不在本批；稀疏offcanvas扩展、grid/iso/视图旋转/固定画布轴心、symmetry/repeat、special/group/mask/indexed、高级图像/dither/ink/笔刷旋转、Space创建中移动、旧boundary-only预览性能方案仍未接，不宣称整套形状功能迁移完成。

实际检查：`project-save-tests`退出0（新增legacy10×10内描边width2=64像素、balanced stairs/反向、alpha/选区/offcanvas、独立preview/Esc/single history/undo/redo、canonical alias/隐藏锁层）；正式Release单节点禁nodeReuse构建退出0，日志 `native/build/shape-release-build.log`；最新官方 `--animation-check`退出0，新增U工具/属性、预览/Esc、真实旧shape右键fallback、line右键背景/一次历史、描边宽度输入/工具退出。provenance94覆盖通过，与运行验收独立报告。未做长期人工或全量性能审计。

## 2026-10-14 并行批次统一接入

官方 native 接入基本形状、吸管、RGBA 调色板提取、旧版四种纹理填充和真实静态图像图案导入。吸管 I，Alt 临时采色，左右键前景/背景，合成/当前图层来源；调色板操作菜单提供提取数量与新建/替换/追加。桶工具属性提供纯色/裂纹/木纹/颗粒、1–16缩放，以及 PNG/JPEG/BMP 1–64px 图案导入/停用。图案保留原始RGBA与透明覆盖，不制造预设素材。

最小集成验证：MSVC Release 官方固定产物构建通过，eyedropper-tests、palette-extraction-tests、pattern-fill-tests、pattern-brush-import-tests、project-save-tests 均通过；来源覆盖103文件通过（不代表行为完全等价）。最终固定官方exe的 ProcessStartInfo `--animation-check` 明确退出0，包含吸管、提取与已有选区/桶/形状/渐变检查。新增headless fixture查控件自身HIDDEN，并按既有桶测试模拟HAS_CAPTURE；产品丢捕获逻辑未放宽。

明确缺口：当前图案导入为单张会话内资源；完整图案库、保存与多选、布局参数UI、选区制刷、过程笔刷、GIF逻辑画布/WebP解码未接入。提取新建名称暂存，资源库保存未接入；特殊层/组/蒙版/索引语义仍属缺口。形状既有缺口保持登记。未自动打包/发布/提交生成物。

## 2026-10-14 三领域并行批次

本批唯一正式产物已更新，未建立preview版本。编辑→反色、编辑→调整→亮度/对比度、色相/饱和度（Ctrl+U）已接入，包含明度、着色、实时预览、应用/取消和一次撤销。旧版精确通道/HSL算法、alpha0隐藏RGB保留、8192重复RGB缓存；当前帧、有选区仅活动层，否则目标层API，锁定跳过、隐藏可调整、链接canonical源去重。官方UI仍单层选择。独立Timeline预览不污染canonical/dirty/history，原生多层compositor承接预览。

六个原图标对称控件接入画笔/橡皮/基本形状/桶，矩阵闭包与像素中心取整沿用legacy。轴拖动支持半像素、锁定/Ctrl覆盖、重置、粗细、HEX色；开关全局偏好，中心document.displaySettings.symmetryCenter保存及恢复。图案入口接入native正式exe旁brushes本地库：真实静态PNG/JPEG/BMP多文件导入后无损PNG存储、元数据、顺序、多选、停用、确认删除；不碰legacy资源库。

验证：正式Release构建exit0；ProcessStartInfo --animation-check exit0；color-adjustment-tests、symmetry-model-tests、pattern-brush-library-tests通过；pattern-fill/import接入回归通过；project-save-tests含对称中心工程+恢复往返通过；来源覆盖110文件通过，strict继续按剩余legacy-partial失败。文档覆盖不宣称全功能等价。

明确缺口：颜色调整worker/viewport加速、完整多层选择UI、特殊层/组/蒙版/索引与稀疏存储；对称选区生成与pressed-sector变换、精确离屏轴段检测、旋转视图/稀疏离画布及高级动态图片笔刷；本地库folder/拖动排序UI、工程customBrushes及其历史、GIF/WebP与完整资源面板。未发布/打包/提交用户数据。


## 2026-10-14 图像尺寸与本地图案文件夹

图像尺寸已按 legacy document-model / workspace-commands-document-io 迁移当前原生承认的 RGBA 全画布 Cel：全部拥有表面采样、保留链接 ID、最近邻与 straight RGBA 平滑、透明 RGB、选区缩放、单次尺寸/Cel/选区撤销重做；对话框默认原比例锁定与最近邻，像素/百分比输入、应用/取消。原生可编辑/保存 1–1024 像素上限明确显示，超限失败保持对话框及原数据。legacy 自动检测像素倍数入口、超大/稀疏/索引/蒙版资源处理尚未迁移。

画布尺寸保持未迁移状态：legacy 默认保留独立图层位图及偏移/越界像素，trim 裁切仍保留独立几何；原生现存工具按全画布零偏移索引，须下一底座批次贯通工具、合成、工程导入/保存后接入，不能静默裁切或改变默认。

本地图案库已接实际 legacy 文件夹创建、同级重命名、PNG/meta 成对移动及回滚、递归删除确认、层级/相对路径、重开持久化；native 图案菜单复用既有输入对话框，完整库面板/拖放待迁移。


颜色替换：按 legacy tools-fill / ColorReplacementDialog 接精确打包 RGBA（含 alpha 与透明 RGB），源/目标 HEX，默认预览关闭、记住颜色打开；范围使用实际文档/像素选区/明确单选图层/选中帧/明确帧格/循环段，不把缺失选择替换为全层。规范源去重、锁定跳过、独立 baseline 预览、单步撤销。调色板范围与对话框临时采色保留灰显；完整 ColorValueControl、完整多图层/帧格选择、统计反馈、索引/组/越界稀疏模型未迁。


本批验收：正式 native/build/Release/moonsprite-native.exe Release 构建 exit0；image-resize-tests、color-replacement-tests、pattern-brush-library-tests 和 project-save-tests exit0；实际 --animation-check exit0（含尺寸取消/应用/撤销和替换默认预览关闭/预览/取消/应用/撤销）。来源覆盖113个文件通过；strict exit1符合仍有上述未迁移缺口，不表示全行为等价。


## 2026-10-14 静态 PNG / 替换颜色闭环 / GIF-WebP 图案导入

已接 Ctrl+E / 文件导出为的明确静态 PNG RGBA 当前帧出口：默认100%，1..6400%，legacy导出floor坐标最近邻，canonical可见普通图层opacity/链接合成、透明背景，选区mask和透明裁边（空图保原区域）。独立PNG编码复用项目预览chunk/CRC/zlib，保存对话框取消/失败保持模态，临时文件flush+原子替换，不改工程dirty/历史或清恢复。此入口明确当前帧RGBA；PNG自动索引、legacy多帧默认GIF、其它格式、全部帧/精灵表、切片/分层/批量、保护/预设/路径记忆/worker取消仍未迁，超过64M输出像素先拒绝。

颜色替换调色板范围现已启用：稳定ID/slots语义、完整entries（含无槽entry）、id0跳过、精确RGBA、独立displayPalette预览、取消和单步快照历史，角色-only变化不新增history。源/目标临时采色现闭环，旧吸管图标和canvas routing，modal保持可见、source可选、Esc/完成回模态恢复原工具；完整ColorValueControl/批量多选及统计反馈仍未迁。

本地图案导入现支持GIF/WebP：GIF透明逻辑canvas首patch offset/clip形成首合成帧，WebP既有Skia/libwebp首帧sRGB straight RGBA（static/animated均首帧）；沿用64px限制、资源PNG/meta/库路径与选择，未扩全动画导入或disposal后续验证。已核对并保留Skia/libwebp COPYING/PATENTS许可。

实际验收：唯一正式Release构建exit0；image-export-tests实际PNG IDAT解码/透明/50%采样/隐藏opacity/link/失败保持通过；color-replacement-tests通过；GIF/WebP真实fixture通过；--animation-check实际运行exit0，含PNG取消/defaults/percentage与调色板替换/采色闭环。来源覆盖119个文件通过，strict仍失败为已知未迁移差异。文档来源检查与实际运行分列，不宣称全部legacy等价。


## 2026-10-14 精灵表 / GIF / 选区本地笔刷

精灵表：以legacy sprite-sheet.ts / tests为实际依据，已接原尺寸透明RGBA单元格的horizontal/vertical/rows/columns四排列、none/fixedColumns/fixedWidth/fixedRows/fixedHeight约束（固定像素宽高保留多余透明边），FNV精确重复去重、alpha空帧忽略、canvas/selection、visible/all/当前单选图层、all/selected/loop帧。循环段reverse只倒序，pingpong不额外重复，与legacy sheet区别于GIF。标题明确PNG文件输出子集，rows/none/visible/all及false合并/忽略默认沿用；拆分、新建文档（旧版默认outputFile=false）、preview、自动打开入口灰显，切片/组/完整多选/自动索引输出/路径记忆/worker取消未迁。不额外发明旧版不存在的padding/metadata/倍率，输出100%。导出读取canonical，不切文档当前帧、不改历史/dirty，PNG共用编码及原子写盘。

动画导出：legacy GIF89a exact≤255色与6×6×6 cube量化、LZW、alpha<128透明、延迟厘秒取整、透明disposal2、循环metadata、全部/范围/循环段及正反往返顺序；共享normal compositor和writeExportBytesAtomic。多帧“导出为”默认进入GIF，单帧PNG，模态格式选择保留PNG自动/WebP/其它未接灰显。WebP动画/保护/高级模式/worker取消与路径预设仍有缺口。Agent独立Pillow真实解码已验证帧像素、阈值、时间和量化，正式本批GIF core与UI检查另列。

笔刷资源：实际legacy从选区创建保存的是本地PNG/meta/order资源，本批已接当前层+mask/透明像素、原点、64px限制、成功后选用与清选区，不增加文档内容history。当前原生使用填充图案profile，pencil自定义profile未迁。工程customBrushes非空仍reject，独立gray/rgba契约研究保存在隔离交付且不挂正式无用代码，不声称工程资源读写/恢复完成。

实际验收：唯一native/build/Release/moonsprite-native.exe Release构建exit0；sprite-sheet-tests（layout/全帧颜色/透明约束边/duplicates/empty/当前帧与历史保持）、selection-pattern-brush-tests、gif-export-tests exit0；实际--animation-check exit0含sheet/GIF默认/比例/取消与既有短UI。共用PNG重构已有image-export-tests通过。来源覆盖127文件，strict应保持失败对应明确剩余差异。文档来源覆盖与运行检查分别报告。


## 2026-10-14 图片打开 / 精灵表导入 / 工程笔刷 / 图像笔刷

已接静态PNG/JPEG/BMP/WebP图片打开（普通RGBA，1..1024px；WebP按旧版首帧），原图路径不作为工程保存路径。精灵表导入承接四遍历顺序、原点、间距、边缘补透明、当前可见canonical合成与选区局部蒙版、已有时长与末帧回退，单次结构历史恢复尺寸/时间线/选区；Ctrl+I从文件、当前文档及当前选区入口接入，取消保留内容，脏文档取消打开后不残留导入意图。明确缺口：GIF完整动画打开、索引/灰度编辑模式、导入调色板精确与量化推导（当前保留原生默认调色板）、网格默认/对话框记忆/交互预览。

工程customBrushes已真正接入Document、manifest解码、prepare、archive编码保存和recovery快照/恢复，保留gray/RGBA、alpha、source原点、未知metadata与共享payload；资源独立于timeline，切帧/撤销不会清空。工程与本地ID分域，图案库可选用和删除；删除按legacy直接标dirty且不新增undo。65px既有工程资源不误用64px本地创建上限，无新增工程笔刷创建入口。图像笔刷已接真实pencil绘制、原色/coverage/旋转/间距/擦除/选区/对称/已有历史，同一库可选择工程资源。明确缺口：非intrinsic缩放、压力与动态、其它ink/多笔刷随机/texture/dither/tiled/源目标模式、笔刷预览轮廓、选择偏好持久化及primary/secondary remap。

实际运行：唯一正式Release构建exit0（占用时仅正常CloseMainWindow关闭已授权官方程序）；sprite-sheet-import-tests、project-brush-roundtrip-tests、image-brush-tests均exit0。PNG真实编码/解码含隐藏RGB；切帧四顺序/间距/partial/负原点/选区/失败保持/一次undo-redo；工程资源真实save/read/prepare/recovery/reopen及删除后再次保存打开；图像笔刷核心原色/opacity/擦除/cancel/selection/symmetry/rotation/link undo验证通过。正式--animation-check运行exit0，新增切帧默认/取消/apply/undo和图像笔刷实际stamp/cancel。来源文档检查另列：136文件coverage与来源hash通过，--strict仍exit1，已知迁移差异保持登记，不宣称完整legacy等价。
