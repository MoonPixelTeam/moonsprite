# 原生迁移计划与实际进度

本表是总体迁移进度的唯一维护入口；详细证据仍保存在需求基线和各领域迁移文档。状态只描述实际完成范围，不用界面可见代替功能完成，不承诺未经估算的日期。负责人“开发 Agent”为集成开发者；协调 Agent 负责传达与分派。

| 阶段 | 依赖 | 实际范围与状态 | 验收条件 | 负责人 |
|---|---|---|---|---|
| U1 界面收尾 | 当前原型 | 本批完成菜单、工程标签、底栏按字体墨迹留白；色卡／工具属性／调色盘整体仍 INCOMPLETE | 新构建 smoke、截图、边框内留白核对 | 开发 Agent |
| D1 文档基础 | U1 | 本批已接普通多层多帧：稳定身份、选择、Cel 绘制目标、结构与像素历史；完整资源/动画会话仍未迁移 | 关系、取消、撤销／重做、dirty、内容 revision 回归；再扩展 2 层 × 2 帧定向历史用例 | 开发 Agent |
| D2 工程闭环 | D1、文件生命周期需求 | 已接普通 RGBA 多层多帧打开/保存/重开及恢复全 Cel 快照；组/蒙版/特殊模式拒绝；普通同层 Cel 链接已接，不静默丢弃 | 结构、像素、资源身份及元数据正确；未知内容不得静默丢弃；原文件使用副本 | 待分派 |
| D3 图层与合成 | D1、D2 | 本批已接普通图层增删/选择/拖排、隐藏/锁定绘制约束、已有 normal 增量合成；组/链接/遮罩未迁移 | 对照 legacy 可见结果与局部失效测试，保存重开一致 | 待分派 |
| D4 绘图与选区 | D3 | 已接矩形选区/组合/反选、绘制裁切、当前普通RGBA Cel像素剪贴板/浮动粘贴；已接原选区提起/复制/选框/方向键与多目标事务；已接椭圆/套索/多边形套索/魔棒；已接基本选区画笔；已接普通RGBA缩放/旋转/跨边翻转；已接普通RGBA纯色油漆桶与实际填充属性；剪切/自由变换及特殊图层覆盖待迁移 | 参数、越界、取消、历史粒度与性能对照；未接入工具保持标记 | 待分派 |
| D5 动画 | D3、D4 | 已接普通帧选择/空白/复制/删除、时长、播放、同层链接/断开、洋葱显示及引用 IO；已接帧多选拖排、批量时长/删除、循环节编辑/播放/嵌套/IO/洋葱环绕；播放偏好/tag串行循环/完整循环色带等仍待迁移 | 跨帧内容隔离、定向撤销、链接语义及时间轴保存重开 | 待分派 |
| D6 资源与剩余领域 | D2–D5 | 待开发：瓦片、文字效果、共享资源、导入导出、缩时与工作区 | 按功能覆盖表逐项关闭缺口，算法／结构对照 | 待分派 |
| D7 皮肤与扩展 | 原生命令覆盖 | 当前皮肤原型；完整编辑器及 Aseprite 兼容子集待开发 | 可替换素材；布局受软件控制；兼容行为及 HTML 能力去向明确 | 待分派 |
| D8 替换验收 | 必需需求完成 | 未开始 | 工程兼容、语言字体、连续使用、缓存释放、异常保存恢复通过 | 待分派 |

## D1 本批边界

来源：`legacy/src/renderer/src/core/document-model.ts` 的 createLayer/createDocument、`legacy/src/shared/types-layer.ts`、`legacy/src/shared/types-animation.ts`；历史依据 `core/history.ts`。

初始帧沿用 frame-1 与 100ms，初始图层可见、未锁定、不透明度 1，Cel 明确关联图层和帧，位移为 0。RGBA 存储由 Cel 持有，现有 pixels() 是只读兼容入口，没有复制整张画布。绘制仍记录实际触碰像素差量；像素历史登记目标 Cel。

身份目前只保证当前进程内的文档实例隔离和编辑期间稳定，尚未实现文件身份解码／持久化。只实现现有单层单帧的基础，未实现链接 Cel、共享图层、完整资源／会话、多层合成、索引色、存储原点或工程读写；不能据此宣布 D1 或项目兼容完成。现有 1024 边长上限也仍是原型缺口。

下一增量：在补齐旧版 session/history 契约后，加入 2 层 × 2 帧核心测试与定向历史失效，避免每次笔画整时间轴同步。资源必须保留为文档所有，不能先接入会静默丢内容的读取器。

## 验证记录

每批记录源码检查、自动测试与实际运行分别通过了什么。U1 使用 ink-spacing-preview 构建，按 1× 基础像素计算、默认整体 2× 展示。D1 首增量：moonsprite-native 与 moon-core-tests Release 编译通过；核心测试通过，--smoke 退出 0。来源检查 40 个文件通过，整体仍 INCOMPLETE。

截图像素检查（当前 2×；坐标以完整 menu-smoke.bmp 为准，末端为包含）：窗口文字墨迹 x302–337/y8–25，顶部及底部留白各 4 物理像素；工程标题 y92–109，3px 基础顶部素材之外留 4 物理像素。复位视图墨迹 x338–415/y128–145，F 为 x420–427/y130–143，两者之间有 4 物理像素；F 本身较矮，保留共同文字基线，不宣称二者墨迹上下间距相等。底栏墨迹 x4/y944–961，工作区底为 y940，窗口底为 y966：左侧、上方、下方均 4 物理像素。子菜单自身外框还有容器与菜单项两层留白，不将它们笼统合称一个 2px。

并行下一批已分派：图层帧 Agent 在隔离目录编写 timeline_model（稳定身份、同层 Cel 链接解析及诊断、2层2帧测试）；工程 Agent 编写 project_reader 中性读入与严格格式校验，保留完整 manifest 和归档资源。解析成功不代表可编辑、可保存或旧工程兼容完成。


### 本批集成结果

- D1.1：timeline_model 的层／帧／Cel 结构、任意字符串身份、同层链接源与无效链接 fallback，2层2帧、复制隔离和稀疏slot测试通过。Document 已采用同一模型的唯一Cel Surface，现有单层编辑与取消／撤销／dirty测试通过。多层会话、切换、定向历史及合成UI尚未接入。
- D2.0：[容器与RGBA读取底座](project-reader-migration-01.md)已编译，legacy实际编码器生成的stored/deflate/sparse样本全部通过。尚无manifest JSON解释、版本迁移、Document映射、完整打开、保存或恢复。json11固定版本拉取遇连接重置，停止重试，保留依赖缺口。
- 原生整合 smoke 退出0。启动器指向 `build/d1-migration-preview/moonsprite-native.exe`，因为上一预览程序正在运行，未关闭用户窗口或删除旧产物。新增源与测试登记已完成；来源覆盖通过，strict因仍有迁移缺口而失败是预期行为。


本批UI承接：连续色条12px、角色颜色材质/HEX/+入口、最近色22px/2px间距已集成验收；保留stroke局部重绘修复。recent仅已迁移画笔链路，完整调色盘高级方案与其它工具仍未完成。详见[color-picker-joined-ui.md](color-picker-joined-ui.md)。


### D2.1：严格子集原生打开（2026-10-12）

文件→打开 / Ctrl+O 已接入 Windows 原生选择器，只读取 `.moonsprite`。采用 SDK Windows.Data.Json，不需网络依赖。实际 legacy createDocument + encodeProject 生成的 schema21 样本经过 JSON、ZIP/RGBA、关系校验和能力准入后才生成候选 Document。旧文档有修改时确认替换；取消、解析失败保持原文档、历史与dirty。工程标签、画布尺寸显示真实名称及尺寸，缓存以新运行身份刷新。原归档随 Document 持有，不修改输入文件。

当前可编辑子集：1..1024 尺寸、单可见未锁定 normal RGBA层、单帧、单不链接Cel，全画布零偏移、opaque层/cel。保留RGBA透明RGB、稳定身份、帧时长、色卡名称/ID/槽位/nextId及原归档。未知字段/资源、版本未迁移、组/效果/多帧/关联/非RGBA等明确拒绝，不能扁平化。色卡独立order与slot顺序冲突也拒绝。列数等源元数据在原归档保留，当前色卡布局仍按已有尺寸偏好展示。

单文档候选替换是当前原生会话的必要适配，legacy多文档还未接；保存/恢复未实现。现有F适应视图及最小100%逻辑未随本批改变，大画布可用滚轮继续缩小，不声称完整视图迁移。

验证：Release主程序、Document/导入/manifest测试通过；实际legacy生成样本含2×2四像素RGBA和透明RGB。原生smoke实际加载样本，覆盖连续打开、dirty取消、坏路径错误保持、确认替换、清空新会话历史，完整UI与笔画局部重绘smoke退出0。未自动点击系统文件选择器；该路径基于已用原生皮肤选择器适配。来源60文件覆盖通过，整体仍INCOMPLETE。启动器更新为build/project-open-preview；不关闭已有用户窗口，不打包发布。


### D2.2 保存闭环（2026-10-12）

文件菜单保存 Ctrl+S、另存为 Ctrl+Shift+S 已接。原生文件选择器提供覆盖确认；成功持久化才更新路径与基线。新建/关闭/替换的未保存弹窗按legacy增加取消、丢弃、保存三选项。undo/redo按legacy touch均保持dirty，取消预览恢复此前dirty，只有保存成功清除。

现支持D2.1同一schema21单层单帧RGBA子集的新建、另存、保存、重开；原manifest其它元数据和资源保留，像素按legacy sparse/raw规则编码；默认preview.png按legacy最大512中心采样重新生成，不保留过期缩略图。PNG使用透明RGBA，不绘制UI棋盘。保存先同目录唯一临时文件、Flush、重读验证，再MoveFileEx替换。失败保持原文件及dirty，不触碰用户恢复数据。

Release主程序和保存合同通过；真实文件成功保存/重复保存/重开、锁住目标与非法目标失败保持、透明RGB/色卡验证通过。真实legacy decodeProject交叉读取native新建4×3及导入2×2归档通过。原生完整smoke覆盖保存后新建、失败弹窗、重开和dirty，退出0；系统文件选择器未自动点击，路径操作通过实际savePath执行。来源68文件覆盖通过，整体仍INCOMPLETE。

限制：保存仍同步整包内存构建，ZIP stored（legacy压缩等级0语义）；尚未承接增量压缩、进度取消、自动备份/恢复、多文档和其它工程模式。旧工程原始元数据保留并不代表这些功能都已接入。启动器为build/save-preview，不自动关闭既有窗口、不发布。


### D2.3 首增量恢复（2026-10-13）

按legacy 5分钟interval、revision/contentRevision去重，活动笔画跳过；每UI tick最多复制64KiB像素并校验代际，一致快照交后台编码I/O，不复制history、不从worker访问live Document。恢复归档为no preview/ZIP level1，sidecar沿{id,name,updatedAt}。Native独立目录LOCALAPPDATA/MoonSprite/Native/recovery，不扫描清理legacy恢复。

文件→恢复工程弹出已有记录名称列表，选择后复用候选Document/dirty保护；恢复标dirty、名称（恢复）、正式工程路径清空，不覆盖来源。当前进程自己创建的恢复在相应文档正式保存成功后清理；旧进程已有记录保留。启动自动展示、完整主页、retention清理/偏好UI、恢复Origin删除、断电/kill进程矩阵仍未完成，D2.3不可标完整。

已通过调度合同、Release构建、真实temp恢复write→list→dirty取消→恢复RGBA/name/dirty/无路径与完整UI smoke。未把smoke等同真实崩溃验收。启动器recovery-preview，来源记录保持INCOMPLETE。


### D2.4 启动发现与异常退出隔离（2026-10-13）

复用 legacy 启动流程：启动时只读取 Native recovery 目录的合法 sidecar 并更新恢复列表；有记录时状态栏提示“文件 → 恢复工程”入口，不强制弹窗。列表按 updatedAt 降序，坏 sidecar 可观察为缺失但不删除。恢复成功不自动删除记录，显式丢弃或当前进程正式保存才清理当前拥有的记录。

新增受控 `--recovery-crash-fixture <绝对owned目录>` 子进程参数，只允许目录内存在 test-owned.marker 时写入恢复文件并等待；用于隔离验证异常退出后的记录发现，不触碰真实 LOCALAPPDATA，也不关闭已有窗口。恢复偏好沿 legacy：enabled 默认 true，周期 0.5–60 分钟默认 5，保留天数 1–365 默认 7；本批接enabled、周期及保留天数预览的菜单设置与原子持久化，未对既有恢复执行自动保留期删除。

Release构建和catalog合同通过；隔离测试子进程终止后恢复文件仍保留。新进程成功解码退出进程的3×2恢复样本，像素一致；偏好菜单接合及合同通过。恢复全生命周期仍未完成启动页恢复栏目、完整偏好页、自定义数值输入、自动retention清理和真实崩溃矩阵；不把子进程等待或UI smoke称为真实断电验收。


### D3.1 普通图层合成底座（隔离交付，2026-10-13）

实现位置为独立detached worktree，尚未应用到主checkout。D3依赖的多层事务/定向历史和无损多层IO仍未完成，因此本批只承接normal RGBA区域合成，不新增未接通UI入口，不放宽工程导入校验。

按legacy文档图层top-first顺序反序合成，跳过不可见/零opacity图层，剪裁局部surface offset与请求区域，沿用全透明跳过/不透明span复制/半透明source-over取整。调用只返回请求区域，可用于已有脏区缓存；不按每像素重新查Cel。暂拒链接Cel、zIndex、Cel opacity及存储origin等未承接语义。

MSVC Release核心测试通过；2层2帧、可见性/opacity、偏移越界、1×1局部区域、未知Cel语义拒绝通过。实际执行legacy compositeRgbaRowWithOpaqueSpans生成12000组RGBA样本，与native逐值一致。现有Document事务回归通过。完整原生预览为既有功能回归，不代表图层编辑已完成。

隔离构建CMake支持显式DEPS只读路径；源码/资产基线hash位于worktree根migration-baseline.json。没有复制cache/build，没有提交/切换dev，没有覆盖主checkout。因upstream laf ICU自定义命令未正确引号，首次全新构建仅对隔离生成的vcxproj加源/目标路径引号；不改共享依赖源码。

### D3.2 单层显示/不透明度（隔离工作树）

单层 normal RGBA 显示开关、opacity 连续预览、关闭/Escape 一次提交、undo/redo、保存重开和恢复已接入。legacy `LayerPropertyEditor.tsx:125-175` 的关闭/Escape 是提交，非取消；底层取消仅程序中断用途。复用 PixelSlider，重复changed只更新属性/invalidate，合成发生在绘制时且只处理dirty region；正常可见opacity1笔画仍直接上传局部像素。缩略图与画布共用normal合成；raw像素不被透明度/隐藏改写。

定向验收：Release编译通过；moon-core-tests包含80次preview不写history/dirty、取消回滚与commit undo/redo；project-save-tests隐藏+opacity往返与失败原子性通过；原生smoke覆盖连续preview/Escape提交、50%与隐藏渲染失效、保存/恢复属性、现有笔画性能与UI，退出0。D3.1 compositor 12000实际legacy随机oracle已通过。

边界：只开放现有单层图层菜单入口；未完成多层添加删除/重排、完整图层属性表单和图层面板、其他混合模式。旧多层工程继续明确拒绝，不丢弃内容导入。尚不能宣称完整D3完成或所有legacy行为一致。源码与可运行preview只在隔离树交付。

### D3.3 菜单、图层栏目与独立UI编辑器边界

菜单依legacy分类/默认快捷建142叶项目录，当前13绑定(11接线、2部分)加原生恢复，129静态项待底层迁移。窗口4现有栏目真显隐；F适应保留，resetView16倍居中。右侧图层显示真实单层名/选择/eye状态/opacity，header slider释放或失焦提交、Escape回滚。完整多层/组/排序仍未迁。

用户明确撤销软件内UI编辑器：删除SkinStudio源码、构建、菜单和smoke入口；runtime theme.xml/PNG加载及用户素材保留，未来编辑器独立，本批不新建应用。

### 正式目录归位与底部时间轴（本轮最终）

唯一正式目录为本仓库native，start-native.bat直接启动build/Release/moonsprite-native.exe。先验证40文件原基线后合入已验成果，再修底部画布居中及中文smoke路径，通过正式目录Release验证。外部旧工作树/产物未删，也不再作为交付入口。菜单142静态条件并集全展示，未迁灰显；中央画布下方真实单层单帧time grid，右侧不再放图层。

### 窗口自由缩放

开启原生边缘拖动、最大化/还原；Fusion 10px与整体2×不随窗口缩放。视图保留zoom及相对viewport中心的pan，resize不取消已有笔画/不写文档历史；工具行继续已有横向滚动，底部灰控件超边界隐藏。720×600最小客户区源于当前13工具轨、底部82逻辑像素时间轴及右侧色盘正内容空间，属于必要原生布局适配，legacy未设同值。

自动检查：720×600/1024×768/1600×1000 resize正尺寸、像素映射、zoom/pixels/dirty/history不变及还原pan，通过完整UI smoke。另运行正式exe创建的Windows窗口，实际HWND验证WS_THICKFRAME/WS_MAXIMIZEBOX、ShowWindow最大化/还原通过；未人工拖动边框验收。没有关闭用户实例，只正常关闭验证新开的空白窗口。唯一产物与启动入口保持不变。

### 图层参考图排版

按用户615×109参考图实际取样：timelineBackground #292B30、timelineGrid #000000、timelineEdge #424F67、timelineInk #919BA9，均主题token可换且旧主题缺失有回退。顶部左播放/帧操作组，右工具组；表格控制12px、名称48px、帧格12px/行12px，整体2×。文档实际仅单层单帧，不能照参考虚构3层3帧；可见与属性opacity仍真实可操作，锁/自动关联/增删播放灰显。

### 构建验收与色卡空槽修复（2026-10-13）

构建脚本改为构建全部目标再运行CTest，接入既有recovery-codec测试，project-save显式依赖legacy生成的manifest样本。CTest临时文件限定build/test-tmp，Windows project-reader测试改用宽字符入口，支持中文工程路径。主题测试增加文件路径诊断；重新编译后原断言通过，未修改用户皮肤素材。

颜色板按实际slots呈现空槽，滚动按实际按钮数计算；Shift矩形选色以slot坐标计算并支持空槽终点；双击指定空槽在该位置添加，撤销重做保留位置。依据legacy palette-layout.ts、palette-duplicates.test.ts、PalettePanel.tsx和workspace-palette.ts；当前自适应列数及完整手动布局/拖排缺口仍保留。Windows另存扩展名大小写不敏感，避免重复追加。README同步当前读写/恢复/可调整窗口和软件内皮肤编辑器移除的状态。

验证：正式build/Release完整编译，CTest 17/17通过；原生--smoke退出0，覆盖色卡指定空槽及现有UI/交互；来源88文件覆盖通过，--strict因已知迁移缺口返回1，符合预期。未执行系统文件对话框的人工点击验收。

## 普通多层单帧增量（2026-10-13）

直接依据 legacy/workspace-commands-layer-creation.ts、workspace-commands-layer-structure.ts、workspace-animation-selection.ts、core/layer-operations.ts 和 workspace-cross-layer-history.test.ts。新层插入所选行上方；最后一层和锁定层不可删除；删除选择原 legacy 底到顶数组前一层。底部原栏目显示多行，滚轮浏览，拖名称行重排，复用已有 + / 删除按钮和新建/删除菜单与 Shift+N/Delete。锁图标沿用 legacy；隐藏或锁定层不接受绘制。像素撤销定位登记 Cel，属性历史定位 Layer；结构历史保存变化的 layer/cel 和 ID 顺序，不复制整份工程。

既有 native normal compositor 是 top-to-bottom，legacy 工程 document.layers 是 bottom-to-top，import/encode 做双向反转；canvas/preview 对多层走已有 compositeNormalRegion，单层保留直接路径。保存逐层原始 RGBA 与独立 Cel，保留旧 manifest 对应层/cel 元数据、activeLayerId 和现有未知资源；恢复快照按已有每 tick 16384 像素预算覆盖所有 Cel。

范围仅普通 RGBA 多层单帧、全画布 owned raster。组、关联、蒙版、特殊模式、局部 offset 和 cel opacity/z-order、多帧仍明确拒绝。不是动画功能完成。验收结果见最终开发交付，不把来源覆盖检查当行为等价。

本批最小验证：正式 `native/build/Release/moonsprite-native.exe` Release 编译链接成功；`project-save-tests` 通过，覆盖多层像素隔离、记录 Cel 定向撤销、重排撤销重做、锁定/隐藏绘制拒绝、最后层/锁定层删除拒绝、删除恢复、创建后像素 redo、两层保存重开顺序与 activeLayerId；既有单层事务检查通过。保存测试旧用例在隐藏层直接画图已更新为显式显示后绘制，以承接本批隐藏约束。Windows TEMP 创建被拒绝时仅把测试临时目录指向 native/build/test-temp，不改工程路径或用户数据。来源覆盖 88 文件通过，整体 INCOMPLETE。未声称实际 GUI 运行验收完成。

## 普通多帧动画增量（2026-10-13）

直接依据 legacy core/animation.ts、workspace-commands-animation-frame.ts/playback.ts、LayersPanel.tsx、useTimelineContextActions.tsx 与 shortcut-contracts.ts。空帧在活动帧后插入、100ms；复制帧深复制每层 Cel 并继承时长。删除最后帧拒绝，其余删除选择同索引或末帧，不因锁层省略 Cel。帧属性 1..60000ms 实时预览，关闭/Escape 提交一次历史；绘制 undo/redo 激活记录 Cel 的层和帧。层增删历史覆盖所有帧。

底部帧头可选、双击时长；Cel 格选择所属层/帧，超出视口随活动帧滚动。现有素材按钮接首/前/播放暂停/后/末帧、空白/复制/删除帧和新建层。Enter 播放暂停，Alt+N 复制帧、Alt+B 空帧、Alt+C 删除帧。播放循环从当前帧开始；暂停留在当前帧；源工程 loop=false 时从首帧播放一次并回首帧，不写 dirty/历史。暂停图形逐像素转换自 legacy PlaybackPixelIcon.tsx，加入唯一主题 sheet.png/theme.xml。

工程读写保留每个 owned RGBA Cel、活动层/帧、所有时长及 loop；旧 layer 显示 raster 对应活动帧。恢复复用既有分批 Cel 快照并保留活动帧。不接受链接/禁用帧/循环段/蒙版/局部 raster 与特殊模式，明确拒绝，不静默扁平化。帧多选/拖排、链接新建、洋葱皮、播放模式/速率/返回起点偏好仍未迁移；1024尺寸和256MiB像素预算仍是原型限制。

最小验证：project-save-tests 多层多帧隔离、跨帧 undo、结构恢复、时长、锁层帧删除、保存重开及恢复编码通过；moon-core-tests 通过。正式 Release 已链接；独立 --animation-check 退出0，覆盖按时长推进、暂停保留当前帧、dirty/历史不变、时长关闭提交/undo、非循环首帧起播及完成回首帧。来源88文件覆盖通过，--strict因已知缺口返回1。未进行广泛或性能长测，未声称人工 GUI 验收。

### resize绘制优化（2026-10-13）

用户要求对照Aseprite直接借鉴：复用MIT UI/laf的drawSurfaceNine/Skia nearest lattice；纹理皮肤保持平铺语义，缓存源片并通过repeat shader绘制，不再缓存目标尺寸surface。拾色器保持legacy算法，仅批量写Skia raster；Fusion不透明字形缓存，半透明保持旧路径，像素/advance/baseline不变。未复制app商业许可代码、未修改用户素材。另适配其它工作新增512×528图集，主题上限1024，保留8MiB和边界检查。

最终正式Release链接成功；skin-assets/theme-atlas/skin-resize-render三项通过，80皮肤/9拾色器/4字形精确oracle通过，最终完整smoke异常退出0xC0000005，未通过；实际测试实例80次HWND缩放正常完成，非人工流畅度验收。皮肤参考旧路径约10秒/40次×4面板，新路径约12ms，不能换算整个窗口fps。此前全套project-import失败属并发工程迁移待核对，未宣称全套通过。详见resize-rendering-optimization.md。

resize最终完整smoke独立日志复核为Frame properties close did not commit并退出0xC0000005；本轮渲染oracle和真实80次窗口尺寸变化通过，不替代新增帧属性/动画验收。

## 链接帧与洋葱皮增量（2026-10-13）

实际来源：legacy core/animation.ts、workspace-animation-linked-cel.ts、workspace-commands-animation-frame.ts；洋葱依据 core/onion-skin.ts、onion-skin-display.test.ts、onion-skin-composite-cache.ts 和 file-preferences.ts。

Alt+M/Cel右键新建链接帧复用右侧已有帧，末尾才插入100ms空帧；Cel上下文只改当前层，显式帧头选择改所有层。只有具有可见alpha的源才覆盖目标。像素真实由缓存解析后的源Cel持有，别名绘制撤销仍激活记录的层/帧；复制链接帧解析后独立复制，断开复制独立像素。实际legacy执行证明：删除源帧后linkedCelId清空，但当前会话JS surface对象仍共享；native以不序列化runtimeSharedCelId保留这一生命周期，保存按legacy独立编码，undo恢复原链接，不自行推广为持久新链接。

保存/恢复保留普通同层链接ID与匹配fallback，加载校验未知/跨层/循环或冲突fallback拒绝；恢复快照只分批复制owned根并保留引用。已链接Cel不会被静默扁平化。

洋葱默认关闭、当前层、播放时显示、前后各1、35%、前EF5350/后2979FF；普通时间轴边缘不环绕。范围0..8、alpha0..100、前后RGBA色及当前/所有层/播放显示通过现有按钮右键设置和本机偏好文件。ghost依legacy紧贴所属层下方、前远到近/后近到远，亮度0.25+relative luminance×0.75，透明度按distance衰减；仅画布显示合成，不写作品/历史/dirty/保存/缩略图，普通预览显示作品。缓存保留局部失效上传，改显示设置/活动层刷新显示。

最小验证：project-save-tests和moon-core-tests通过，覆盖真实别名共享/undo、右帧复用/空源保护、复制与断开独立、源删除/undo/会话共享、链接重开/恢复，以及洋葱颜色/alpha/距离/边界/保存隔离。正式Release构建链接成功；扩展既有 --animation-check 退出0，真实CanvasRenderer链接/洋葱缓存及dirty/history隔离通过，既有播放推进/暂停/时长用例通过。来源88文件覆盖通过，--strict因已登记迁移缺口返回1，符合预期；未进行人工GUI全面验收或性能长测。

剩余：autoLink图层偏好/链接蒙版与共享图层、组及特殊混合/局部raster、禁用帧、循环段内洋葱wrap、帧Cel多选拖排、完整播放偏好仍未迁移；这些工程语义继续拒绝。当前框架仅普通RGBA子集，来源检查通过不代表整体迁移完成。


### D5：帧多选与循环节增量（2026-10-13）

已接帧头替换/Ctrl切换/Shift范围、选中块拖排及原身份/链接保持，选中范围时长和删除合并为一次撤销。循环节创建/编辑复用当前原生控件，名称、起止帧、四种方向、空次数无限/1–9999，保存/取消；帧右键可播放、编辑、删除现有段。边界随插入、删除、重排沿legacy算法调整。有限/无限、往返返回位置、暂停恢复和嵌套段栈沿legacy播放逻辑适配；段内洋葱前后环绕限制为段长减一。schema21保存重开/恢复保存完整段元数据，原恢复快照包含段。现有顶部显示当前段名称；完整彩色循环条、tag串行模式、播放偏好和其它范围复制/蒙版选区仍未迁移。

实际运行：Release构建通过；project-save-tests通过本批多选/重排/范围撤销、循环编码/重开/恢复、有限往返/嵌套/洋葱环绕断言；现有--animation-check退出0，含循环编辑保存/取消与暂停恢复。无新诊断入口、性能套件或预览产物。来源覆盖检查与行为检查分开，整体仍INCOMPLETE，strict保持失败。唯一产物仍native/build/Release/moonsprite-native.exe、启动入口native/start-native.bat。


### D4：基础矩形选区和像素剪贴板（2026-10-13）

已接矩形工具（legacy原图标）M、画布内外拖入裁切，替换/加/减/交模式、Shift临时加/右键减，全选Ctrl+A/取消Ctrl+D/反选Ctrl+Shift+I，真实掩码边界描边，选区会话历史不置dirty，画笔受掩码裁切。当前普通RGBA层/帧复制Ctrl+C必须选区且仅非透明像素；剪切Ctrl+X删除选中像素并取消选择，删除键亦接像素优先。浮动粘贴Ctrl+V保留完整源尺寸，整数拖动（Shift轴约束）、Enter确认一次定向Cel像素/选区历史、Esc取消恢复底色/选区；共享链接Cel沿canonical源写入，undo激活记录别名Cel。保存先确认浮动内容，不序列化选区会话。

Windows图像剪贴板使用已有MIT clip库替代legacy Tauri桥，当前24/32位图像，最大16M像素且单边8192；序号区分新外部图像与内部携带源位置的payload。色卡/时间轴剪贴板保留上下文阻断提示，未把无选区复制改为全画布。套索/椭圆/魔棒、旋转缩放、多目标Cel/层/帧剪贴板、合并复制和全部跨应用格式仍未迁移。

定向像素与保存测试通过：裁切/透明掩码、反复浮动移动取消、确认一次撤销与选区恢复、选区历史不dirty、保存仅像素、链接Cel目标/undo、隐藏锁层拒绝。实际UI：Release编译/链接通过，现有--animation-check加入矩形真实鼠标手势、菜单反选/取消和非dirty撤销，退出0。来源覆盖90文件通过；整体仍INCOMPLETE，strict继续失败。Windows跨应用位图读写已编译接入，本批未实际覆盖所有外部应用格式。正式产物native/build/Release/moonsprite-native.exe含全部本批功能。

### D4：原选区内容与边界移动（2026-10-13）

按 legacy canvas-input-hit-test / selection-begin / selection-move / transform-source / translation 迁移：真实掩码内部提起，边缘移动遮罩，Ctrl 内部或边缘复制；Shift 初始加选、移动中单轴，方向键固定一像素（Shift不加倍）。稳定完整源保留透明几何和越界像素；原位置仅清除非透明选中像素，重叠按 source-over 合成，反复预览恢复 touched-delta 底色。Enter确认一次像素/选区历史，Esc恢复，不引入整文档快照。原提起后的边界移动先确认内容；剪贴板边界保留浮动像素、只移动遮罩。

复用既有当前层/Cel及选中帧范围；帧头选择覆盖可见未锁普通层，共享canonical源去重，多目标共用一次历史并恢复活动层帧。显式隐藏/锁层拒绝。复杂变换、其他层类型、完整多选层UI仍未迁移。核心/保存定向回归通过；现有animation-check补充内容、边缘手势与Shift方向键一像素/取消。来源覆盖通过仍不等同完整legacy等价，strict继续失败。

本批最终验收：正式 native/build/Release/moonsprite-native.exe 已编译链接；project-save-tests、moon-core-tests 通过；--animation-check 实际进程正常退出0。来源覆盖90文件通过，strict因已登记整体迁移缺口继续失败。文档检查与实际运行结果分别记录；未打包发布或提交生成物。

### D4：椭圆、套索、多边形套索和魔棒（2026-10-13）

复用 legacy selection.ts 活动边扫描线、闭合边界和整数椭圆；自由套索一点为像素、两点为像素线，有限画布裁切。多边形逐次左键添加顶点、右键撤点、Ctrl+Z/Y或Shift+Z局部撤销重做、≥3点双击或Enter闭合、Esc取消；默认均衡台阶边缘来自pixel-line.ts。M/Shift+M/Q/Shift+Q/W和工具组复用原图标，保留已有内部提起/边缘移框优先行为。椭圆拖动承接Shift比例与Ctrl中心，组合沿现有模式。

魔棒默认容差0、连续、4方、当前层；属性行承接容差0–255、4/8连接、当前/可见图层采样、智能闭合默认关闭与阈值2（1–16）。智能闭合直接移植contiguous-region.ts有界骨架/端点配对/射线/闭合像素及小口袋补回，不使用近似膨胀。保留compact行段洪泛与稀疏透明外部优化。异步纯算法任务在独立线程使用本手势不可变采样，latest-request合并，取消或文档/图层/帧/内容版本变化后禁止回写。鼠标释放或Enter确认最新结果；Esc/Ctrl+D取消。建选区不改像素或dirty；隐藏/锁层允许几何选择，内部内容编辑仍遵守现有约束。原生当前普通RGBA层、帧/链接及可见层合成复用已有模型。

现有核心/保存定向测试已通过：legacy凹/越界路径、短路径、椭圆、全局/连续/容差上下限/4与8连接/10×10两像素缺口/稀疏透明外部、组合和非dirty历史。OpenToonz BSD条款从legacy THIRD_PARTY_NOTICES原文保留在算法头部。选区笔刷、复杂变换、对称/平铺及其它特殊层、完整偏好自定义仍待迁移；覆盖通过不代表全部行为等价。

本批运行验收：正式Release编译/链接成功；现有--animation-check实际进程正常退出0，覆盖椭圆、套索、多边形撤点/重做/确认/取消，魔棒latest-request释放确认、Esc取消后旧结果、切换Document后旧结果不回写。核心/保存定向检查此前通过，不重复扩测。来源覆盖91文件通过；整体仍INCOMPLETE，strict按已登记迁移缺口失败。未打包发布或提交生成物。

### D4：基本选区画笔（2026-10-13）

直接承接 `canvas-selection-brush-gesture.ts` / `smooth-brush.ts` / `tools-brush.ts`：圆形、方形、线形，尺寸1–64，方形和线形旋转角度；保留欧氏距离采样、行跨度缓存及旋转线形桥接。访问像素去重，画布外只显示蓝色预览，松手按替换/加/减/交集提交一次选区历史；右键减选、Shift加选、Esc与失焦取消。沿用原工具素材及既有形状/尺寸控件，Ctrl+1/2/3切换形状、方括号调整尺寸，角度随偏好保存。选区创建不修改像素或文档脏状态，原有内容/边界移动命中优先级保留。

文档登记与运行验收分别记录：来源与差异登记在 provenance；定向项目测试和 `--animation-check` 验证算法、提交、右键减选、取消和属性快捷键。对称、平铺、特殊图层和完整偏好定制仍未迁移；选区画笔活动期间在键盘、鼠标捕获和工具入口保持切换锁定；其他未迁覆盖不能视为完整行为等价。

本批实际验收结果：Release 编译和 `project-save-tests` 通过；官方产物 `--animation-check` 退出码0；provenance 覆盖91文件及来源快照通过，整体迁移仍标记 INCOMPLETE。

### D4：普通 RGBA 选区内容缩放与旋转（2026-10-14）

复用原选区提起、链接源去重、多帧/普通图层目标与差量事务。直接移植 legacy 的局部旋转缩放几何、跨对侧边翻转、Shift等比、Ctrl整数倍、Alt中心、旋转Shift45°吸附；八个手柄沿用旧版黑10/白6几何，指针复用现有原素材。数值属性提供X/Y、带符号宽高及0.1°角度。松手保持浮动源，Enter一次确认、Esc完整恢复；活动手势锁定工具切换。

快速旋转保留正向细轮廓和四邻域补洞，不以普通最近邻替代；可选RotSprite直接移植紧内容边界、8×EPX、32块有界源缓存、固定点扫描及最终缩小采样相位。变换始终读取稳定源；移出画布再变回来仍保留源。原纯移动继续用原行跨度差量路径。

文档登记与运行验收分开：provenance记录精确来源；定向像素对照直接调用legacy生成4组预期hash，覆盖两算法、旋转缩放和越界相位，另查撤销、取消、链接目标与鼠标入口。剪切、自由四边形、自定义/预设轴心、比例锁、完整属性条，以及组/蒙版/索引/特殊图层仍未迁移。本批的中心为默认几何中心，不声称覆盖全部选区变换。

本批最终实际验收：官方 Release 编译/链接成功；project-save-tests 和直接调用 legacy 的4组逐像素 hash 对照通过。移除临时定位后，正式 native/build/Release/moonsprite-native.exe 的 --animation-check 正常退出0，覆盖缩放手柄、活动工具切换锁、Esc恢复、Shift45°旋转、负宽翻转、0.1°角度、Enter一次历史及undo恢复。来源覆盖检查与实际运行分开，整体迁移仍 INCOMPLETE；未打包发布。

### D4：普通 RGBA 纯色油漆桶（2026-10-14）

按 tools-fill.ts 与 canvas-input-fill.ts 承接按下同步填充并立即提交一次历史；拖动不重复，松开仅结束交互，Esc/失焦/捕获丢失撤销本次已提交填充。G、工具轨/工具组复用 tool-fill 原素材；容差0（0–255）、连续/全局、智能闭缝默认关/阈值2（1–16）、当前层/可见层及4/8连接通过既有属性行，采样源和连接与魔棒共享，偏好以兼容尾段保存。legacy 油漆桶不套画笔不透明度，直接使用前景/右键背景RGBA，透明色替换并保留RGB，半透明 source-over。

选区是传播屏障，种子在遮罩外不修改；闭缝复用已迁 topology thinning/端点/虚桥/补回算法。仅活动普通层/帧绘制，帧多选不扩展油漆桶目标；链接Cel写canonical源，撤销定位发起别名。大图512²精确4连接复用按最终值标记跨度、统一行run、遮罩及全局span路径；历史保存before/after run，不引入全工程快照或像素hash表。普通源已覆盖画布，原生只作既有有限RGBA Surface适配；无异步请求所以不产生迟到结果。

尚未迁移：图像/纹理/图案填充、对称/平铺、稀疏越界图层扩展，以及组/蒙版/索引/特殊图层；渐变仍独立未迁工具。无自行添加扩展/收缩属性。来源覆盖与实际检查分别记录，整体仍INCOMPLETE。

本批实际验收：填充定向断言及既有 project-save-tests 通过；正式 Release 编译/链接成功，官方 native/build/Release/moonsprite-native.exe 的 --animation-check 本次正常退出0，覆盖G与属性、按下单次历史、Esc恢复、右键背景/松开、全局属性和容差夹取。该旧检查直接调用尚未挂窗的Editor，pointer/key fixture模拟真实HAS_CAPTURE；产品失焦和捕获丢失取消没有跳过隐藏/最小化窗口。来源92文件覆盖与快照通过；整体仍INCOMPLETE。更新期间仅正常关闭准确官方路径实例，没有强制结束、删除恢复或用户作品；未打包发布。


### D4 渐变当前批次（2026-10-14）
按 `gradient.ts/gradient-color.ts`、输入配置/确认/色标编辑器实际逻辑接入普通RGBA层渐变工具、属性、即时/确认预览单历史闭环；默认参数/修饰键/9抖动/透明语义与自定义色标由旧版来源登记。详见 `tool-options-migration-01.md`。源码provenance93覆盖通过；特殊图层/稀疏越界/grid/symmetry及旧版downscale平均预览专用优化仍有明确缺口，不作为整套迁移完成。


### D4 基础形状批次（2026-10-14）
普通RGBA的直线/矩形/椭圆描边与填充、内描边宽度/圆角/比例及真实修饰键已接独立preview→释放单history/Esc取消闭环。legacy原始算法及既有旋转selection几何/brushSpans/cache复用；shape右键前景fallback作为旧缺陷单列。核心/官方Release/短animation退出0、来源94覆盖通过。高级形状/sparse offcanvas/grid/iso/view-angle/固定画布轴心/symmetry/repeat/特殊层及Space创建移动/边界专用性能仍有缺口，详见工具属性迁移文档。

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


## 2026-10-14 帧剪贴板、图层合并与精灵表预览

已完成原生帧快照复制/粘贴：Surface 深拷贝，帧时长保留，内部 linked Cel 在粘贴时重映射，外部链接解析后断开；支持单次历史与撤销。图层向下合并按 compositor top-first 顺序修正，并覆盖 RGBA 合成与 undo 回归。精灵表导出弹窗增加只读 RGBA 预览，关闭不改变文档 history、revision 或 dirty 状态。限制：预览 smoke 需在正式程序单独运行确认；完整 legacy 严格等价仍未完成。
