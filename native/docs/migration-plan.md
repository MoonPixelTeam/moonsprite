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


## 2026-10-14 合并可见图层普通 RGBA 子集

承接 legacy core/layer-merge.ts 的 mergeVisibleLayers/renderMergedFrames/installMergedFrames：合并前逐帧合成全部可见层，隐藏层及其 Cel/ID 原样保留；可见锁定层拒绝。结果普通可见、未锁、opacity=1 图层位于 native top-first 顶端并成为活动层，每帧为独立 Cel，单次结构历史支持 undo/redo。复用 normal compositor 的链接解析和偏移处理；非默认 Cel opacity、zIndex、storage origin 等当前不支持语义明确拒绝，不近似扁平化。两帧半透明/opacity/隐藏保留/锁定拒绝/undo-redo 与编码回读测试 exit0；来源覆盖检查通过。


帧剪切已承接 legacy copy-first/deleteFrame 规则：剪切全选仍保留最后一帧且保留剪贴板，锁定层不阻止时间轴帧剪切，菜单与 Ctrl+X 接显式帧选择，单次删除历史可 undo/redo；粘贴历史修为完整结构快照，撤销实际删除新增帧/Cel。官方 core 回归 exit0。当前剪贴板仍是同一文档内，跨文档未迁移。

精灵表拆分承接 layer×有效循环段目标顺序，每目标独立去空/去重/布局后竖向堆为单 PNG，透明补齐不同宽度；PNG 编码与只读预览共用像素 builder。现有图层菜单启用拆分图层/循环段，原生组/多选组、新建文档与导出后打开仍未迁移。

本批正式验证：native/build Release 单节点 /nodeReuse:false build exit0；moon-core-tests、layer-merge-tests、project-save-tests、sprite-sheet-tests 均实际 exit0。最新正式 --animation-check 通过 System.Diagnostics.Process PID6396 WaitForExit 返回 exit0，含帧剪切菜单/粘贴撤销、合并可见菜单/撤销、拆分预览源 dirty/history/revision 前后不变。来源检查当前 exit1 的唯一覆盖问题是本批之外新增未登记 src/timeline_interaction.cpp；本批修改已补充实际 legacy 来源，不将整体 coverage 宣称通过。


## 2026-10-14 图层多选命令上下文

保留外部已接入 timeline_interaction.cpp 的 replace/Ctrl toggle/Shift range/多层拖动及既有素材外轮廓，不重新设计选择状态。补替换颜色与精灵表选中层目标为全部显式普通层，保留活动与选择分离；多层删除承接 legacy 原子锁定/至少一层守卫，隐藏层可删除，单次结构历史恢复层/Cel与显式选择。组/蒙版和多层复制等结构命令尚未完整迁移；现色调调整仍保留原普通RGBA子集范围，未假称全部多选命令完成。timeline_interaction.cpp依据读取的实际代码和legacy选择/移动入口登记partial，coverage不代表等价。

播放偏好已接六档0.25/0.5/1/1.5/2/3速度(default1)、自然完成返回起点(defaultfalse)，播放按钮右键与本地持久化；速率修改重置当前帧deadline，不改帧时长/history。once/all交互需真实animation-loop历史事务、标签串行cycle状态尚未迁移，模式入口灰显准确保留。

Cel复制粘贴已接时间轴显式Cel集合的编辑/右键/Ctrl+C/V入口，完整普通RGBA稀疏块按相对行列映射，快照源改/删仍可粘，内部链接重映射/外链解析，覆盖canonical root提升survivor，末端追加100ms帧并支持单次undo。锁目标原子拒绝、隐藏层允许。Document本地剪贴板不跨工程重用ID；Cel剪切、像素选区内容/mask/text/tilemap/free-tile/跨文档转换仍未迁移。

本批实际验证：native/build正式Release /m:1 /nodeReuse:false构建exit0，moon-core-tests exit0；最新System.Diagnostics.Process --animation-check PID25072 WaitForExit返回exit0，覆盖Cel菜单copy/paste/undo/新Document无剪贴板，图层Ctrl/Shift范围、替换目标像素、多选删除undo和sheet集合，播放偏好reload/rate/delay/pause/completion/source invariants。多层删除测试使用revision一次变化与实际undo恢复判定，避免已有redo分支historySize截断误判。


## 2026-10-14 完整普通 RGBA Cel 剪切

复用既有同文档 Cel 快照复制，剪切先原子检查全部所选层锁定，再以一次事务清空槽位；保留位置、尺寸、透明度，清零像素/zIndex并解除链接。删除共享源时首个未选成员承接内容，其余成员重链；仅删除别名保留其余组。空 Cel 同样产生历史，显式 Cel 选择清空且撤销不恢复选择（legacy restoreAnimationCels 仅恢复数据）。编辑菜单/Ctrl+X 已接，旧版没有右键 Cel 剪切项，已有删除入口复用同一清空逻辑。像素选区剪切、特殊 Cel/蒙版、跨文档仍未迁移。

本批实际验证：最终 native/build Release 单节点 /nodeReuse:false build exit0，moon-core-tests exit0，--cel-clipboard-check PID36996 WaitForExit exit0（菜单复制/粘贴/剪切/undo/redo/剪贴板再粘贴，新Document隔离及帧剪切菜单闭环）。140文件来源coverage exit0，仍标记INCOMPLETE。完整 --animation-check PID37420 exit1，失败为既有 Floating selection outside cursor，未修改光标或放宽断言，不宣称全套通过。正式exe更新时间2026-10-14 15:31:46。


## 2026-10-14 浮动选区光标与一次播放命令

待确认浮动选区也令Document::active为true，新capture优先分支曾将其误判为绘制事务而在画布外返回画笔光标。只在该绘制分支排除floating，真正floatingDragging仍走更早的选区捕获分支；原坐标和严格default断言保留，未变更素材边框命中。

播放按钮右键的播放一次入口采用legacy setAnimationPlaybackMode(once)->setAnimationLoop(false)真实文档历史，loop变更dirty、单次undo/redo、相同值无历史；清除循环段遍历而不跳帧、不停止正在播放。用户Ctrl+Z可恢复先前loop，既有循环段播放入口仍可使用。仅此文档命令子集已实现，循环全部/tag入口与跨会话模式偏好仍未迁移。

最终验证：关闭确认曾阻止旧进程退出，后续新正式PID38128正常关闭并WaitForExit=True，未强杀或丢弃数据。正式Release单节点nodeReuse:false build exit0，moon-core-tests exit0（沿用native现有undo仍dirty契约），完整--animation-check PID36344 WaitForExit exit0，覆盖原浮动外侧严格断言、已有选区拖动/变换和一次播放事务/撤销/无操作/运行段退出。来源140文件coverage exit0，alignment仍INCOMPLETE。


## 2026-10-14 循环全部入口

播放按钮右键循环全部已接通，once/all共用setPlaybackLoopMode和既有Document::setAnimationLoop事务；默认loop=true与旧版菜单all回退一致。勾选状态反映loop与当前段状态。切换all清段遍历、保留当前帧/播放状态/deadline；loop变化记录单次历史并更新播放revision token，同值不改历史/revision。新增回归覆盖undo/redo、重复选择、从当前末帧开始并回首帧继续播放、播放中清段和时序保持。tag与跨会话模式偏好仍未迁移，未额外接入口或快捷键。

精确来源：legacy/src/renderer/src/components/AnimationPlaybackMenu.tsx；legacy/src/renderer/src/store/workspace-commands-animation-playback.ts::setAnimationPlaybackMode；workspace-commands-animation-frame.ts::setAnimationLoop及其undo/redo；workspace-animation-loop-sections.test.ts与既有history-playback证据。最终native/build正式Release /m:1 /nodeReuse:false build exit0，moon-core-tests exit0，完整--animation-check PID38864 WaitForExit exit0；正式exe 2026-10-14 15:46:13。无提交推送、新preview或外部工程。


## 2026-10-14 标签播放模式

播放按钮右键循环当前段已接入tag会话状态，不改document.loop/dirty/history；once/all清tag，文档切换重置模式。当前帧选最内层段、按正反向/ping-pong方向起点开始；运行中切tag无段停止，停止态无段启动按全部可播放帧fallback。暂停保持有效段方向/iteration/position，重新选择无限tag不重启，有限tag重选重新定位当前段起点。时间轴播放头人工切换按旧版retarget helper重选段而不跳帧。

有限tag保留首段cycle锚点，重复完成后串行后续有限段及普通帧（后续无限段当普通帧经过），环回原锚点；完全照workspace-animation-loop-sections.test.ts六帧Finite/Later finite/Later infinite序列。复用现有advanceLoopPlayback嵌套栈；修正入子段/返回父段时repeatIndefinitely标记按目标段次数重置，避免无限父段下有限子段只播一次。严格子段范围、方向、边界仍使用既有legacy算法。

精确来源：AnimationPlaybackMenu.tsx；workspace-commands-animation-playback.ts::setAnimationPlaybackMode/setAnimationPlaying/advanceAnimationFrame/playAnimationLoopSection；workspace-animation-commands-helpers.ts::setAnimationLoopPlaybackSection/retargetAnimationLoopPlaybackAtFrame；core/animation-loop-sections.ts::animationLoopSectionAtFrame/animationLoopSectionStartFrameId；workspace-animation-loop-sections.test.ts有限串行/最内层/暂停/retarget证据。跨会话偏好及原生未支持的mask/special上下文仍登记缺口，不接入此批。

最终验证：native/build Release /m:1 /nodeReuse:false build exit0；moon-core-tests exit0；timeline-model-tests exit0（新增无限父段下有限reverse子段两次播放）；完整--animation-check PID38208 WaitForExit exit0（有限tag六帧序列、模式不改文档、暂停恢复、无段fallback/运行切换、最内层反向、无限重选、retarget、once/all回归）。140文件来源coverage exit0，整体alignment仍INCOMPLETE。正式exe时间见最终回报。正式PID36424及后续新PID35052均正常CloseMainWindow且WaitForExit=True，未强杀/丢弃。


## 2026-10-14 播放模式跨会话偏好（集成批次）

legacy file-preferences.parseAnimationPlaybackMode仅once/all/tag有效，default null；workspace-animation-commands-helpers.persistAnimationPlaybackPreferences合并保存；workspace-session创建会话时使用偏好，否则回退工程timeline.loop。原生已有animation-playback.txt尾部追加模式（空偏好-），兼容旧rate/back两字段与非法模式回退。会话模式与文档loop分开，恢复once/all/tag不改工程loop/dirty/history；明确选择模式仍沿用loop事务并保存全局偏好，undo/redo只恢复当前模式而不改已存偏好。

独立验证：正式Release build exit0；完整animation-check PID8488 exit0，覆盖序列化roundtrip、旧文件/无效值fallback、once/all覆盖相反工程loop、tag、新工程恢复、loop撤销不改全局偏好。两路Cel增量等待统一集成与最终验证。


本批三路集成状态：播放偏好持久化、跨工程完整RGBA Cel、selectionOnly浮动Cel复制已合入。带选区snapshot在pasteAnimationCels最先early return，因此跨工程同样浮动；支持非矩形mask/alpha、原坐标、多目标链接detach、追加帧取消、一次commit undo/redo。普通whole跨工程尺寸/offset不同仍明确拒绝。真实Editor菜单copy/paste与Escape/Enter/undo/redo交叉检查加入animation-check。

构建与运行证据：三项集成正式Release build exit0；moon-core-tests exit0；cel-selection-clipboard-tests exit0；完整animation-check PID38696 WaitForExit exit0，exe 2026-10-14 16:07:16。最后发现清空app Cel snapshot后回退Document旧clipboard会复活，源码已修为Editor snapshot唯一authoritative并补frame-copy互斥UI断言。该最后修复尚未链接：外部同步panel改动导致main.cpp tickPanelGesture/processPanelGesture调用无定义、toggleLayersPanel columnShown(2)赋值非左值，最新build exit1；未覆盖/退回外部变化或已知修复。core与selection独立仍exit0；provenance exit1唯一批外src/panel_docking.h未登记，本批新增test已登记。正式exe是前一个三项集成版本，不能宣称包含最后剪贴板互斥修复。


## 2026-10-14 正式集成交付及Cel后续小闭环

上批Editor authoritative Cel snapshot修复已真正进入正式exe，帧复制后不复活旧Document Cel的animation-check PID36248 exit0，首个交付exe 16:11:58。panel原编译缺失已有真实定义落盘，之后private调用问题亦由外部源码增加public dispatchPanelGesture解决；本批未stub或删除panel行为。

本批两个隔离小patch已集成：空显式Cel复制清本地Cel/Frame及app snapshot，异常复制保留原payload，空复制后paste不产生历史；来源copySelectedAnimationCels空分支及clipboard-service.clearAnimation。多Cel浮动变换的selection几何按clipboard矩形source处理，各target alpha/mask像素逻辑不变，primary空Cel也保留另一个Cel完整外框；来源workspace-floating-preview.floatingSelectionGeometrySource及workspace-paste-cel-selection矩形bounds、selection-flip/floating统一target。新增检查flip/scale/90 RotSprite、preview不dirty、cancel、一次commit undo/redo。

最终Release /m:1 /nodeReuse:false build exit0，moon-core-tests exit0，cel-selection-clipboard-tests exit0，完整animation-check PID37352 WaitForExit exit0（含上批互斥与空复制app回归）。不同尺寸/offset完整RGBA Cel仍显式拒绝，跨工程selectionOnly仍优先floating；未扩大兼容存储语义。来源coverage结果与正式exe时间见最终回报；外部panel未登记不凭空补证据。


## 2026-10-14 帧反转、多选Cel断链及选区Cel剪切

帧菜单“反转帧顺序”已接既有swap素材，按workspace-commands-animation-reverse.ts reverseSelectedAnimationFrames反转已选槽位（含不连续选择），保留帧身份/时长/Cel与链接；循环节起止保持原时间轴位置。复用原生frame-order历史一次撤销/重做，恢复帧选择、活动帧与循环范围，少于两帧不写历史。回归沿用workspace-animation-reverse.test.ts全选和0/2/4选择。

隔离补丁集成：disconnectAnimationCels与workspace-commands-animation-cel-properties.ts的多选断链，选alias仅自身、选root断整组，clone resolved surface/opacity/zIndex一次历史；选区Cel剪切来自workspace-cut.ts、workspace-commands-selection-effects.ts及workspace-selection-effects-support.ts，exact selected Cel按canonical source去重，清掩码像素、保留槽和链接，一次compound history；有像素改变才清选区，空剪切更新clipboard无历史，锁定preflight保留旧clipboard。仍限既有原生RGBA零offset存储兼容范围。

最终正式Release build exit0（/m:1 /nodeReuse:false），moon-core-tests exit0，cel-selection-clipboard-tests exit0，完整--animation-check PID36372 WaitForExit exit0，含真实菜单root断链、帧反转、选区Cel剪切与undo/redo。正式exe 2026-10-14 16:33:49。新增UI测试以revision验证一次事务，正确兼容undo后redo分支截断。来源coverage143 exit0，整体Legacy alignment仍INCOMPLETE。此前外部MAIN.OBJ编译占用及多次程序重启占用仅等待状态变化/正常关闭解决，未强杀/删除数据、缓存或新preview。


## 2026-10-14 向下合并实际差异、连接Cel及多Cel选区变换

向下合并基础顶栏/API已有，本批修补真实差异并接通原灰显右键mergeDown素材：原近似代码只读cel.surface丢linked内容，现按legacy core/layer-merge.ts mergeLayerDown/mergeRasterLayers仅合相邻两层，全部帧先渲染后替换，复用既有正式layer_compositor resolved链接与不支持语义拒绝。结果名为top.name加zh-CN“ 合并”，normal/opacity1/可见非锁定，其他层不参与；捕获结构与选择history，合并后仅选新层，undo/redo恢复活动帧/层及选择。隐藏、锁定和底层拒绝无事务。来自workspace-commands-layer-structure.ts、workspace-history.ts commitLayerMerge及workspace-layer-merge.test.ts。仍限定原生normal RGBA既有兼容范围，不扩group/blend/indexed等语义。

Cel连接patch来自animation.ts connectAnimationCels及animation-slot-selection.ts：每层帧序首个有alpha内容的canonical root，补空gap，不改未选非空gap；源opacity/zIndex、一次history、保持选择/播放头，复用现link菜单。多Cel选区变换来自workspace-commands-selection-move.ts与selection-transform-targets.ts：beginSelectionContentMove精确已选pair，active frame/layer优先，canonical去重，全目标锁定/隐藏preflight，沿用FloatingPaste支持move/copy/drag/nudge/free transform，取消及一次history；保留旧frame-only fallback。

最终正式Release build exit0，moon-core-tests/layer-merge-tests/cel-selection-clipboard-tests各exit0。最终实际exe完整--animation-check PID35988 exit0（含真实右键连接Cel/向下合并undo redo及已有功能），--layer-context-check PID37204 exit0（legacy图标/状态与新增合并enabled计数）。exe 2026-10-14 16:44:41，10636288bytes。来源coverage143 exit0；strict exit1符合整体alignment INCOMPLETE。构建前无CL/MSBuild占用，唯一正式PID39708正常关闭，未强杀/删作品或新preview，无提交推送。


## 2026-10-14 帧右键剪贴板、Cel反转及隐藏蚂蚁线

帧复制/粘贴基础Ctrl接口已有，本批接通灰显右键copy/paste及顶栏frame context，同一Editor helper保持Cel app snapshot互斥。修正本地pasteCopiedFrames按selected最后槽插入、首帧active，单帧选active layer新Cel，多帧选headers与末anchor；捕获选择/anchor undo redo。沿用workspace-commands-animation-frame-clipboard.ts及useTimelineContextActions.tsx；duplicateAt适配参数保留原drag-copy目标与header选择，timeline-interaction-tests真实通过。全局跨工程Frame clipboard和mask/special存储仍未迁移，此批为既有普通RGBA本地路径闭环。

隔离Cel反转patch复用workspace-commands-animation-reverse.ts reverseSelectedAnimationCels与animation-slot-selection.ts：每layer时间序已选slot（含blank）反转，ID/link随内容，未选slot不变，选区/anchor仍原slot，任一moved层锁定整批拒绝，单history undo redo，frame/loop不变，接swap素材。

隐藏/显示蚂蚁线Ctrl+H来源workspace-commands-selection-properties.ts toggleSelectionOutline、AppMenuBar/App shortcut router与useCanvasSelectionOverlay：仅identity范围view状态，默认显示；菜单动态caption/checked与无selection禁用，repeat不切换；只gate paintSelectionAnts和timer，handles/pivot在该调用之后单独绘制且无此gate（源码检查），floating保留不提交。真实--ants-check验证隐藏alpha全透明、selection/pixels/history/dirty/revision不变、快捷键及repeat、floating当前像素和新doc默认。

本批core/timeline-interaction正式build与测试各exit0，layer-merge既有frame snapshot回归exit0。正式exe build命令exit0；实际--animation-check PID38656、--ants-check PID35112、--layer-context-check PID33060均exit0，包含本批新增菜单断言。验证时exe 2026-10-14 16:57:38，10669056bytes。来源coverage143 exit0，strict exit1/整体INCOMPLETE。构建前读进程出现外部38124/23236，命令成功无文件占用失败；验证后又有外部32876/35940编译正式target，本批停止构建，未杀进程/删除缓存/新preview/提交推送。


## 2026-10-14 合并所选图层、启停帧和多Cel像素Delete

合并所选图层已接右键与现顶栏catalog。legacy workspace-commands-layer-structure.ts mergeSelectedLayers → core/layer-merge.ts mergeRasterLayers要求>=2连续同级可见非锁层；本native平级normal RGBA范围逐帧仅渲染选中层（resolved链接），保留非目标层，top.name+“ 合并”、默认normal/opacity1，结构及UI一次history undo redo。复用上一批mergeDown内部合成helper，既有down回归保留；不扩group/indexed/blend/special语义。

启用/停用帧来源workspace-animation-commands-helpers.ts updateSelectedAnimationFramesDisabled、workspace-commands-animation-frame.ts与animation.ts firstPlayableAnimationFrameId/nextAnimationFrameId。selected或活动frame fallback bool batch history，重复无事务；kind2 eye/eyeOff菜单及legacy disabled SVG斜线直接转换，once/all跳disabled/all禁用拒播/live最后可播停，tag嵌套保留既有helper语义。工程Manifest/import/encode/fromImported原拒disabled已改读写保留，保存true/省false；按旧animationLoopFrameIdsForExport仍输出禁用帧，不擅改导出。

Delete像素选区来自workspace-commands-selection-effects.ts与workspace-selection-effects-support.ts：精确Cel优先，否则显式layer×frames或隐式frame选取visible unlocked；canonical shared源去重，锁目标跳过，显式hidden允许清，清掩码像素保槽/link，非空child edits一次compound history，真实变化才清选区，undo恢复mask/activity/selection，clipboard floating Delete仍取消。

正式统一build最终exit0，core/layer-merge/cel-selection三test各0，GIF export test0（disabled仍全部输出），project-save实际读回/reenable test0。project-save首次系统TEMP无写权限失败，仅该进程TEMP/TMP改现native/build，测试唯一timestamp目录保留且环境finally恢复。实际最后exe --animation-check PID38784和--layer-context-check PID34312 exit0（包括selected merge上下菜单、disabled播放/UI、新enabled期望），最终已验exe2026-10-14 17:17:45，10704896bytes。源码17:17:15/obj17:17:44确认最后测试修改已编入。来源coverage143 exit0，strict exit1/INCOMPLETE。

构建前空闲，随后外部同target启动导致project_encode.obj Permission denied；未盲试/杀进程/删缓存，等空闲/独占obj后一次构建成功。外部后续正式增量完成最终exe，真实新增检查已运行通过。PID31936正常Close/Wait=True；无新preview/分支/worktree/提交推送。


## 2026-10-14 复制所选对象、填充F和自动链接列手势

kind1复制所选对象和已有duplicateLayer顶栏接duplicateSelectedLayers，来源useLayerContextActions.tsx duplicateContextSelection → workspace-commands-layer-structure.ts duplicateSelectedLayerRows/selectedRowInsertionTarget。普通平级RGBA选层依视觉顺序复制为块到最上选中行上方，topmost copy active/anchor、全选副本，name副本并保visible/locked/opacity/autoLink。按animation.ts cloneAnimationCelsForLayer逐帧解析并clone独立surface、原slot opacity、解除Cel链接及默认zIndex，不复制跨layer链接的旧近似实现。一次结构UIhistory恢复activity/selection，空selection不做；既有256层和内存限制适配，groups/masks/indexed/linkedContent等未迁移不近似替代。

填充/F来源workspace-commands-selection-effects.ts fillSelectionOrCanvas、workspace-selection-effects-support.ts、tools-fill.ts及shortcut-contracts：packed RGBA直接replace非混合，选区或全canvas，精确Cel或selected layers×frames/shared source去重，任一hidden/locked阻止，dense选择阈值512²及mask覆盖>=1/3保留；pending先commit，选区保留，一次history。F由错误fitCanvas改真实fill入口，重复/文本输入不抢，pan测试保留fit行为直接调用fitCanvas而不再错误把F当fit。

自动链接列手势来源useLayerRowToggleGesture.ts begin/updateRange/finish与useLayerControlGestures.tsx：拖扫连续row、回拖恢复原值，Ctrl formal多选否则显示rows，Alt solo同目标恢复/换目标先恢复再建立solo，释放/捕获丢失/blur提交。Document预览仅metadata最终delta一次history，无pixel/timeline复制，保持选择和activity；existing auto-link素材复用。

三路统一正式Release build exit0（单node、构建前无外部CL/MSBuild、无正在运行正式进程），moon-core-tests/layer-merge-tests/cel-selection-clipboard-tests各实际exit0。最终exe --animation-check PID36144 exit0包含真实duplicate上下菜单、fill菜单/F及auto-link手势（move/up Ctrl/Alt blur/capture-loss），--layer-context-check PID40692 exit0。exe2026-10-14 17:30:58，10735104bytes。来源coverage143 exit0，strict exit1/整体INCOMPLETE。无新preview/worktree/分支/提交推送，无删数据或缓存。


## 2026-10-14 帧属性目标、复制合并、眼睛列手势（待正式UI验收）

帧属性target已修：legacy useTimelineContextActions.tsx openFrameProperties/For与workspace-commands-animation-frame.ts setActiveAnimationFrameDuration仅在active属于selected时批量，否则active单帧。native beginFrameDuration先捕获此target规则，保持既有preview/close合并transaction，不改变dirty/history实时框架。saveFrameProperties/effect cleanup确认旧版关闭commit，native Escape/X继续保留修改一次undo。新增core范围外/多选/clamp/no-op测试与实际modal烟测（待运行）。

copyMerged来源workspace-commands-clipboard.ts copySelection(true)，复用正式compositeNormalRegion/PixelClipboard采当前帧可见层，先commit pending，selection mask/origin或全canvas，alpha有效payload，成功清互斥timeline/app clipboards；CtrlShiftC优先普通copy避免按Cel copy。眼睛visibility列来源useLayerControlGestures/useLayerRowToggleGesture/LayerTreeRow：真实pointer capture拖扫/回拖、Ctrl displayRows多选交集、Alt solo同目标/换目标恢复、blur/capture loss commit最终delta，一次metadata history，clicked eye不激活row、保持选择；ordinary flat范围包括滚动外displayRows，groups/masks不宣称支持。

本批独立正式moon-core-tests与cel-selection-clipboard-tests构建exit0，实际CORE_EXIT=0/SELECTION_EXIT=0，来源coverage143 exit0。正式exe统一build78847编译完成但LINK LNK1104被PID33500占用exit1；CloseMainWindow=True/WaitForExit=False且进程响应，未强杀/丢弃作品。用户已被告知需要正常保存/处理关闭提示后才可继续最终链接。此次尚未成功链接本批UI，新增frame modal/copyMerged/visibility gestures真实UI smoke未运行，不能当完成迁移验收。无新preview/worktree/分支/提交推送。


本批最终UI验收补记：用户保存处理关闭后确认无官方进程/外部构建且exe独占可读，正式链接成功。首新增smoke多帧关闭断言误以revision+1计单undo，原既有逐帧push/group使revision+N，已仅改测试historySize+1且保留值/选择/undo断言，无产品事务改变。重编时新PID37964占exe，正常Close/Wait=True后链接exit0；最终实际--animation-check PID40060 exit0，含frame target/Escape-close、多选单undo、copyMerged菜单/CtrlShiftC与visibility真实pointer手势。最终exe2026-10-14 17:43:49，10756608bytes。core/selection此前实际0不重复；coverage143 exit0，整体alignment未完成。此次UI已完成，不再处于上文待验收状态。无强杀/丢作品/新preview/分支/提交推送。


## 2026-10-14 多选透明度、锁列手势、内容居中

多选透明度沿 workspace-layer-properties.ts nextSnapshot/transactions 和 useLayerContextActions.tsx propertyTargets：活动来源在所选范围才批量，未选活动来源单层；捕获每层原值，锁定视觉目标跳过，finite/clamp预览不写历史，cancel逐层恢复，X/Escape关闭一次compound历史，undo/redo保持activity和selection。不同原值、锁定active、取消、no-op、NaN/clamp、范围外fallback核心用例和实际菜单模态预览/关闭undo通过。仅平级RGBA透明度，完整属性和group继承不宣称已迁移。

锁列沿 useLayerControlGestures/useLayerRowToggleGesture/LayerTreeRow：目标id不激活row，拖扫及回拖恢复、Ctrl displayedRows与多选交集否则全部显示row、Alt solo同目标恢复及换目标恢复原snapshot，pointerup/blur/capture loss一次历史；旧锁素材与拒画行为复用，groups/masks/inherited unlock仍缺口。

三个centerContent菜单沿 workspace-commands-selection-move.ts centerActiveContent、tools-selection-transform-apply.ts、workspace.test.ts旧8x8 fixture：Math.round正向半值（含负半值）轴向delta，pending只移floating preview不commit；非pending仅active layer，selection或alpha bounds，hidden允许locked阻止，单历史并平移原mask，无selection保持null。正式菜单接入命令时pivot平移。已知差异明确保留：原生Editor pivot仍是UI-only，既有undo/reset清轴心而未纳入Document Edit，不能称legacy轴心undo完整等价；本批不扩历史架构。

统一正式Release build实际exit0，moon-core-tests CORE_EXIT=0、cel-selection-clipboard-tests SELECTION_EXIT=0；唯一正式exe --animation-check PID25380 ANIMATION_EXIT=0，包含新增lock实际pointer gesture、center三菜单及pivot命令时位移、多选opacity模态close/undo。正式进程PID32096正常CloseMainWindow/Wait=True后构建，未强杀或丢作品。最终exe 2026-10-14 18:02:39，10786304bytes。来源coverage143 exit0，strict保持INCOMPLETE/exit1。无新preview/worktree/branch、无提交推送、无删除用户数据或缓存。


## 2026-10-14 图层名称属性、180内容旋转、手动帧导航

属性窗口增加名称输入，沿 LayerPropertyEditor.tsx openTargets/name preview 与 workspace-layer-properties.ts nextSnapshot：先commit浮动，raw名称实时preview，锁层允许metadata，关闭JS Unicode whitespace trim，empty逐目标还原原名，多选只有changed name才批量。name和opacity合并一次compound历史，cancel恢复各目标原值，name-only undo不造成pixel invalidation，name记录UTF32 history byte预算。实际窗口menu预览、trim-close、合并history/undo已跑；核心另含locked/multi/Unicode空白/empty/no-op/cancel/single target。原生现有模态仍阻止underlying layer panel selection，不承接legacy非模态retarget，groups/tilemap name传播及完整property fields未迁，明确不宣称完整属性等价。

仅rotateContent180接旧菜单，来源 workspace-edit-actions.ts rotateWorkspaceContent/workspace-session selectedTransformLayersForSession/tools-selection-transform-apply：先commit pending，以selected owning layers当前frame而非全部Cel pair，共享selection或union alpha bounds，任一明确hidden/locked拒绝，implicit frames沿旧筛选；canonical source去重，180精确映射mask及source clear/destination composite，一次compound pixel history并生成selection，成功清UI pivot。90°仍灰显缺口，既有UI-only pivot undo恢复仍缺口。多层/union/current-frame/不规则mask/hidden/locked/undo用例与真实菜单通过。

手动帧导航严格分旧入口：LayersPanel/useTimelineContextActions工具栏next wrap/previous clamp/raw edge/含disabled，显式frame selection，播放中维持并retarget；workspace-commands-animation-selection/animation.ts/loop sections/shortcut router逗号句号键先pause，非播放先commit源frame浮动、默认skipDisabled=true、tag最内段、movement再清选，随后canonical Cel selection。Entry focus/模态/隐藏layer panel不抢键。skipDisabled设置和自定义快捷键未接，不创造偏好UI。timeline tests含disabled当前global索引与tag candidate索引区别、innermost、无candidate等；真实toolbar/key/input/pause/tag/floating来源提交通过。

统一正式Release build实际exit0；CORE_EXIT=0、SELECTION_EXIT=0、TIMELINE_EXIT=0。首animation-check PID24100 exit1源于新smoke剪贴板缺mask，Document beginFloatingPaste正确拒绝；仅补mask={1}并新增begin成功断言，保留所有源像素/目标/浮动结束/历史断言，无导航产品改变。main正式重构build exit0后--animation-check PID15800 ANIMATION_EXIT=0，含本批真实属性/旋转/导航闭环。最终exe 2026-10-14 18:16:41，10818560bytes。来源coverage143 exit0；strict exit1/整体INCOMPLETE。无新preview/worktree/branch、无提交推送、无强杀/删数据或缓存。


## 2026-10-14 新建图层闭环、90°双向旋转、箭头导航

新建普通图层按 workspace-commands-layer-creation.ts addLayer/activateNewLayerContext → workspace-animation-selection.ts selectedRowInsertionTarget：首个视觉显式所选图层上方，无所选图层时root top，而非既有native active-index；新层active/anchor，保持当前frame，清显式row/frame/Cel selection。新建菜单/右键/工具栏/ShiftN共享createLayer UI标记清理。沿旧creation history先root top再placement语义，undo删除创建层后原top active，已清selection不恢复；redo新层active，单结构history不复制已有surface。原普通层默认值、命名、blank per-frame、256层/内存限制保留；groups/adjustment/tilemap/sparse geometry不宣称支持。核心覆盖active在选区外、最上selected placement、无选层/frame/Cel fallback、defaults/current frame/undo-redo；实际menu/ShiftN通过。

两90°menu沿 workspace-edit-actions.ts rotateWorkspaceContent(90|-90)→tools-selection-transform-apply/commit applyPackedSelectionTransform：canvas尺寸不变，destination pixels clamp画布，transformSelectionMask clip=false保留越界selection geometry；fallback selectionTransformCells同样clamp，因此非新增裁剪近似。native复用fastSelectionTransformCells及transformedSelectionMask，沿既有current-frame owning layers/union bounds/锁hidden拒绝/源去重/单compound，180精确分支不变。测试双向彩色矩形、越界宽selection/像素clip、奇偶mask/半透明alpha0、undo-redo。真实两个菜单通过。此项取代此前90灰显缺口；现有UI-only pivot undo恢复仍缺口。

无pixel selection时箭头Cel导航按useAppShortcutRouter heldNavigationKeys、workspace-animation-cell-navigation row、stepAnimationCell：即时首步、280ms初始delay、40ms采样、水平50ms/垂直120ms、held Map insertion order，OS repeat不额外步进，keyup/blur停timer；上下flat visible rows边界不wrap，左右沿已迁skip/tag；playing首按只pause，Entry/外部menu/模态/active gesture阻止，pixel-selection nudge优先。valid vertical target才commit浮动并选择Cel。group/mask行、设置/custom shortcuts仍缺口。实际smoke验证axes/boundaries/Cel/no-history、280/330/400 deadlines、组合held order、release/blur、pause、Shift/Entry/selection优先级。

统一正式Release单node build实际exit0；CORE_EXIT=0、SELECTION_EXIT=0；正式--animation-check PID16716 ANIMATION_EXIT=0，含本批三路闭环且既有回归通过。构建前无外部cl/MSBuild/正式进程，无强杀。最终exe 2026-10-14 18:30:28，10839040bytes。来源coverage143 exit0，strict实际exit1/整体INCOMPLETE。无新preview/worktree/branch、无提交推送、无删用户数据或缓存。完成本批停止。


## 2026-10-14 图层删除入口、Delete分流、内容镜像

图层删除入口按 LayerMenuCommands.tsx/useLayerContextActions deleteSelectedLayers拆开，显式single selected也删所选、无所选禁用；deleteActiveLayer/deleteLayer保留编辑fallback的<=1 active/>1 selected语义。新增canDeleteSelectedLayers/canDeleteLayers做对应目标locked/minimum-layer原子校验。batch落点沿 workspace-commands-layer-structure bottom-first removed[0].index-1映射native top-first lowestSelected-count+1 clamp，单结构history恢复旧activity/selection。核心gapped landing、single selected outside active、locked/no-selection/undo-redo与真实layer菜单及context enabled通过；groups/masks/special layers未宣称。

Delete/Backspace和编辑删除按 command-context/app-completion-shortcuts/workspace-delete精确分流：pixel/floating优先，其后显式Cel/frame；keyboard显式layer走selected，implicit keyboard选择并清active Cel，Edit菜单implicit fallback删active layer，此默认差异保留。Entry不删doc/palette，keyboard保留palette优先；sole-layer Cel菜单仍可删除内容。Document deleteSelectedFrames沿workspace-commands-animation-cel-properties deleteSelectedAnimationItems全选逐个删除直到保留1，清selection单compound，不copy；核心全选留末帧/undo-redo和实际路由通过。特殊scope/canvas-vs-panel token仍未完整，Cel opacity因旧版当前Cel同步live layer需完整模型调整未启用，不半迁移。

水平/垂直镜像及ShiftH/V沿 workspace-commands-selection-flip/selection-timeline-flip/transform apply：pending翻source/mask后保持transform重新preview不commit，originalSource保存原清除mask/RotSprite sampler reset；ordinary selection精确packed含transparentRGB，animation alpha/composite及shared dedup；whole explicit Cel/layers×frames/implicit frames沿旧target规则并跳hidden/locked，plain active hidden允许locked阻止。single历史/mask undo及pivot不随flip移动。固定RGBA范围适配，groups/masks/special layers未宣称，既有UI pivot undo缺口保持。测试源mask不规则/移后pending取消、whole transparentRGB、allframes/linked dedup、historyundo以及真实menu/ShiftV通过。

外部正式构建在进行时先等待，空闲且无正式app进程后统一Release/core/selection单node build实际exit0。CORE_EXIT=0、SELECTION_EXIT=0，正式--animation-check PID33036 ANIMATION_EXIT=0，--layer-context-check PID5756 CONTEXT_EXIT=0。最终exe2026-10-14 18:43:06，10901504bytes。来源coverage143 exit0，strict实际exit1/整体INCOMPLETE。无新preview/worktree/branch、无提交推送、无强杀/删数据或缓存。完成本批停止。


## 2026-10-14 新建帧状态、多图层变换、帧属性双击（当前批验收中）

新空白/复制帧沿 workspace-commands-animation-frame.ts addAnimationFrame/duplicateAnimationFrame 清像素选区、pivot及animation item selection，激活新帧；clearAnimationItemSelection 保留图层行选择。原生沿已有addFrame插入/克隆/autolink/loop逻辑，仅清pixel/frame/Cel及anchors，history不恢复旧选区。Editor AltN/AltB/context入口共用frameAction，清pivot/freeTransform/显式frame标记。核心复制像素、blank、单history、undo/redo不恢复旧选区和保留layer rows通过；UI创建smoke待正式程序。

CtrlT沿 workspace-commands-selection-transform.ts selectedTransformLayersForSession 先提交pending，对显式layer/Cel owning layers取当前帧alpha union，selected hidden/locked拒绝，选区建立不产生history。beginSelectionContentMove保留既有显式Cel分支，新增explicit selected layers捕获分支，复用shared source dedup与已有FloatingPaste/history；固定RGBA/zero-offset适配，不宣称groups/masks/special layers。核心union、邻层不动、多目标nudge/cancel/singlehistoryundo-redo、非active hidden/locked拒绝、pending先commit均通过；实际menu/CtrlT smoke待正式程序。

帧头双击沿 LayersPanel.tsx/useTimelineContextActions.tsx openFramePropertiesFor 修正已有callback：准确激活双击帧，保留显式多帧选择，复用FrameDuration preview/close compound history。PixelButton left-only flag默认false保持其他用户；Editor capture下第二击定位physical header并结束现gesture/release。整合时移除旧重复callback赋值以免覆盖新action。right-double、target/selection/history、多帧close、capture release smoke待正式程序；loop section lane等仍缺口。

正式Release core/selection目标单node BUILD_EXIT=0；CORE_EXIT=0、SELECTION_EXIT=0。正常CloseMainWindow请求True，但正式PID39464 WaitForExit(10000)=False；未强杀、未丢弃作品，等待用户保存处理后链接唯一正式exe并运行animation-check。来源coverage143 exit0，整体INCOMPLETE；当前记录不代表正式UI验收完成。无新preview/worktree/branch、无提交推送、无删用户数据或缓存。


### 当前批最终运行验收（2026-10-14）

用户确认其他聊天停止并保存关闭后，正式源hash稳定且外部编译空闲，唯一writer继续。此前外部Region编译错误已由其修正，不覆盖其功能。首animation PID41152 exit1的双击断言源于smoke在setBounds之前运行：零宽Editor仅一列，active2自动scroll2，header0实际为frame2。仅修fixture为default dock/显示layer/1280x960，明确scroll0与三headers可见，完整保留目标、selection、history、right-double和capture断言，不改变产品逻辑或削弱断言。

最终唯一正式Release moonsprite-native BUILD_EXIT=0，--animation-check PID34196 ANIMATION_EXIT=0，包含新空白/复制帧AltN/AltB状态、多图层menu/CtrlT union、双击duration selected target及capture释放闭环。前次本批CORE_EXIT=0、SELECTION_EXIT=0保留，未重复无变化测试。最终exe2026-10-14 19:15:56，10900480bytes。来源coverage143 exit0，strict exit1/整体INCOMPLETE仍保留。无新preview/worktree/branch、无提交推送、无强杀/删用户数据或缓存。当前批完成停止，不代表其他未迁功能已完成。


## 2026-10-14 向下合并菜单、CtrlD Cel复制、浮动取消选择

图层主菜单向下合并catalog命令mergeLayerDown而registry误绑mergeDown，导致已有Document功能仅context可达。本批按LayerMenuCommands.tsx81/store mergeActiveLayerDown/core layer-merge.ts119修registry，直接复用现有active layer及下邻层合并算法、RGBA composite、history和素材；真实menu验证active target与所选row分離、合并像素/一次history/undo-redo、sole/bottom/hidden/locked guard。group/special-layer仍不宣称。

Ctrl/Cmd+D沿app-selection-shortcuts.ts先pixel deselect，无pixel selection时显式Cel copyAnimationCel（shortcut-contracts默认CtrlD共享context）；复用copyTimelineCels clipboard，不改数据算法。exact noShift/noAlt、repeat不执行、Entry/palette/modal优先保留。真实shortcut验证Cel copy无history/selection变化、repeat/Shift拒绝、pixel优先、Entry防抢及取消后Cel copy。settings/custom shortcut与完整commandScope token仍缺口。

公共deselectPixels按AppMenuBar.tsx290和app-selection-shortcuts.ts107-117：pending paste只commitFloatingPaste并保留提交后selection，避免额外deselect history；第二次无浮动才清selection。核心验证移动单history/undo-redo、pending no-op及第二次clear；实际menu pending commit/保留selection/undo和随后CtrlD clear通过。普通取消resetTimelineSelection/selectionGuidesPreservedAtContentRevision未迁语义明确保持缺口。

首次统一链接因构建期间外部app11176启动锁exe，LNK1104实际exit1。随后该app及外部build自行退出，确认空闲后一次增量正式BUILD_EXIT=0；SELECTION_EXIT=0，--animation-check PID16812 ANIMATION_EXIT=0，三个入口闭环及既有UI回归通过。最终exe2026-10-14 19:30:20，10913280bytes；来源coverage143 exit0，strict实际exit1/整体INCOMPLETE。未强杀、未删用户数据/缓存、无新preview/worktree/branch、无提交推送。本批完成停止。


## 2026-10-14 图层双击属性、AltC时间轴删除、收缩选区状态

图层行双击沿LayerTreeRow.tsx213/useLayerContextActions.tsx96：clicked属于多选时批量，否则单clicked；LayerPropertyEditor openTargets首target为表单源且不主动改activity/selection。原生beginLayerProperties可传冻结targets，不影响现有默认调用，复用name/opacity预览与compound close/undo。row callback仅left，Editor capture下second click先取消瞬时gesture恢复范围/release，再同action，避免旧select()清多选。真实right ignored、多选批量/单目标、activity/selection/history保持、capture release通过。原生modal、groups/special layers及其他属性fields/nonmodal retarget仍缺口，不宣称完整属性窗口已迁。

AltC沿app-layers-shortcuts deleteSelectedAnimationItems：显式Cel优先删除完整Cel，忽略pixel mask；否则删selected/current frames，成功清pixel selection/pivot。两个Document API新增默认false opt-in仅专用路由传true，通用Delete guard保持。frame context全选仍enabled，现leave-one loop复用。shortcut strict Alt/noextra/repeat/Entry/hidden timeline通过；核心fullCel mask/guard/undo及frame-clear通过，真实全部frame选中删除保留1通过。active pending事务拒绝及groups/masks/special scopes保持未迁缺口。

收缩选区沿workspace-commands-selection-properties.ts210-249：unchanged mask直接返回保留pivot/properties/history，真正收缩不清selectedFrames。现geometry/mask算法复用，UI状态与pure selection history校正；selection-check真实帧选择保持、undo/redo、noop pivot/properties/history通过。稀疏/特殊图层/pivot总体history不宣称。

首次compile测试MouseButton类型错误已局部修；animation PID30796 exit1源于undo后historySize保留redo总长度，截断再写不保证size+1，且helper同判断不可靠。成功判改frames count变化以清pivot，smoke用revision+1并一次undo恢复2帧验证compound，保留所有结果断言。新app12732占用曾导致LNK1104，正常Close请求未退出后等待用户保存；无强杀。最终正式BUILD_EXIT=0，SELECTION_CORE_EXIT=0，selection-check PID37940 SELECTION_UI_EXIT=0，animation-check PID39472 ANIMATION_EXIT=0。exe2026-10-14 20:28:09，10934784bytes。来源coverage143 exit0，strict actualexit1/整体INCOMPLETE。无新preview/worktree/branch、无提交推送/删用户数据缓存。本批完成停止。


## 2026-10-14 属性所选目标、Enter完成选区、全选状态

可见图层属性菜单与工具栏按LayerMenuCommands.tsx111/useLayerPanelShortcuts.tsx170→selectedRowsForProperties，复用已有explicit target事务，首selected目标做表单source，active位于selection外仍只改所选；无selected禁用。真实batch验证多选name/history/undo、activity/selection不变、toolbar单target/no-selection disabled。双击/context已有单clicked/frozen语义保持；用户隐藏表头未恢复，其他property fields/groups/nonmodal retarget仍缺口。

Enter沿app-completion-shortcuts/command-context：普通selection清selection，不play；floating先commit像素再clear选区，分别两history。没有selection时unmodified/no-repeat、多frame、timeline visible、非Entry/Button/exclusive scope才play/pause。已有gesture优先。batch验证普通selection/undo，pending两步undo，repeat/hidden/Entry/single frame和play/pause。custom shortcut/outline/text-box transform模型未完成。

全选沿AppMenuBar.tsx273-278/app-selection-shortcuts64-73/workspace-commands-selection-properties45-55：commit pending再setTool/setSelection(full)，setSelection只改状态无history，清pivot/free/properties，selectionKind保留。core验证nohistory/revision/dirty、timeline帧选择保持、pending单pixel edit/undo-redo；batch menu与CtrlA状态/commit/undo通过。完整command scope/custom/special modes仍缺口。

实际结果：正式Release build0，SELECTION_CORE_EXIT=0；full --selection-check PID41124 exit1 Dock resize regression did not find adjacent column split，保留失败不改无关dock。full --animation-check PID8512 exit1 Selection Cel UI commit：旧smoke期待pending Enter仅1history，与此次legacy commit+clear两history不同；已改精确两edit及两次undo/redo保留pixels/selection语义，full链未重跑。此前运行期间正式exe由外部更新，不以最终文件覆盖先前结果。最终独立--migration-batch-check复用本批三个smokes（selectAll单独提取而全selection仍调用），PID31372 actualexit0，1.16sec；不代表完整两个suite通过。最终build60844 actualexit0，exe2026-10-14 21:57:43 10954752bytes。来源覆盖143 exit0，strict overall仍INCOMPLETE。无新preview/worktree/branch/提交推送、无删数据缓存；正常关闭已保护作品。本批完成停止。


## 2026-10-14 停靠专项、普通复制优先、时间轴删除按钮（未完成最终验收）

更正上批日志归因：此前读native/build/native-smoke-error.txt的Dock resize文字mtime20:29:42，属于陈旧日志，不证明后续selection进程的失败位置。此次selection PID2504 actualexit1，刷新22:56:16的真实错误为Preview content erased merged label pixels；未改无关preview renderer。停靠专项保留原hover cursor、press同hit、visible band外拒绝断言，独立fixture明确idle/no home/no modal/visible panels/1280x960，诊断附真实point/hit/guards。独立batch PID5944已通过dock段，不改变用户布局或产品代码。

普通像素copy按workspace-commands-clipboard730-769成功后才clearAnimationClipboards：copyPixels成功清Document Cel/frame payload，empty/failure保留；Editor snapshot成功后清，保留外部palette route。无新raster算法，floating复制不commit，core普通/空/floating clipboard priority实际0，独立batch copy UI段通过。

时间轴删除工具栏按LayersPanel.tsx902 deleteSelectedAnimationItems，case7改复用已有deleteTimelineItems，Cel优先wholeCel/pixelmask保留、不误删frame，otherwise selected/allframes leave1。新smoke初次undo误期望恢复Cel selection；legacy animation-cel-properties253-261只restore Cels且clear selection在history外，因此精确改undo pixels恢复且selection保持清空，frame/redo/revision断言保留。修正后最终运行尚未完成。

实际正式build85953 exit0，CORE_EXIT=0；batch5944 actualexit1 Timeline toolbar Cel delete undo，dock/copy前两项通过。修fixture后link49048 LNK1104外部占用，随后另轮build与外部MSBuild冲突MSB6003。已知外部34628结束后又出现39932/MSBuild14116/cl28152正式build，停止重试保留差异；非本任务创建的aseprite-preview进程37876未触碰。此批最终可执行链接/toolbar batch仍阻塞，不能宣称交付。最后本任务成功exe23:25:16 10983936bytes仅对应失败batch，非最终验证。无强杀/删数据、无本任务新preview/worktree/branch/提交推送。来源coverage另列，整体仍INCOMPLETE。


### 本批最终运行验收（2026-10-14 23:48）

外部编译空闲后正常关闭唯一正式程序PID28292，CloseMainWindow=True且WaitForExit=True，未强杀。正式Release单node构建session29013实际exit0；--migration-batch-check PID16944实际exit0，完整通过停靠hover/press/band、普通及浮动像素复制剪贴板优先、时间轴工具栏Cel/帧删除与legacy一致的undo选择状态。此前核心测试actual0保留，无变化不重复测试。正式exe2026-10-14 23:48:48，10998272bytes。

以上通过结果取代本节先前的最终链接阻塞记录；完整selection-check真实Preview content erased merged label pixels失败仍未修，专项通过不宣称完整selection/animation套件通过。未改preview renderer，无新preview/worktree/branch、无提交推送或删除用户数据/缓存。本批完成停止，整体迁移仍INCOMPLETE。

来源检查实际exit0：coverage143，evidence snapshots verified；整体Legacy alignment仍INCOMPLETE。此次未重复strict，已有strict失败证据保留。


## 2026-10-15 Cel右键删除、选区转笔刷、预览标签专项收尾

Cel右键沿useTimelineContextActions.tsx263-270保留已选多Cel，未选clicked替换selection；310-314判断clicked resolved内容，741-751空Cel禁用且调用dedicated fullCel删除。复用celHasContent缓存和deleteTimelineItems，像素选区不再阻止完整Cel删除，target identity与actual gesture/fallback入口一致。普通RGBA及linked范围；masks/text/tilemap仍未宣称。

选择菜单createBrushFromSelection沿workspace-commands-tool.ts369-394/339-352/255-277，直接复用现selection_pattern_brush、PNG、本地根库、pencil stamping底座；成功保存后清selection/pivot切pencil，空/失败保留选择与既有笔刷。未接CtrlB无selection捕获，未新增算法。测试使用既有build/pattern-brush-library-fixture，生产仍Release/brushes。已有selection-pattern-brush-tests actual0保留，无重复核心运行。

预览定点从现smokeDocking提取相同像素断言到--preview-labels-check：合并标签、未活动露出区域、笔画未松开时仅preview重绘和标签尾空白全像素。原完整docking断言保留，未改产品绘制。当前独立PID28148实际exit0，旧Preview content erased merged label pixels未在当前源码复现，不声明修复产品。

正式Release单node build session99117实际exit0；本批两功能--migration-batch-check PID26192实际exit0，含Cel多选/fullCel+mask/undo/空clicked禁用/未选替换及选区笔刷菜单/PNG metadata/empty保留。exe2026-10-15 00:11:37，11038720bytes。外部Zoom两在途错误已自行修复，保留其差异；短暂main锁消失后集成，未抢改。

本轮其他真实结果：full selection PID37916实际exit1，刷新native-workspace-error.txt为Selection transform confirmation history UI；docking PID29812实际exit1 Docked palette controls remained at old location；workspace PID22176实际exit1 Floating preview continuous move retained background pixels at phase50。均未解，专项通过不声明完整链通过；陈旧native-smoke-error不作为新结果。无新preview/worktree/分支、无提交推送或删用户数据/缓存。本批完成停止，整体迁移仍INCOMPLETE。

来源检查实际exit0：coverage143，evidence snapshots verified；整体Legacy alignment仍INCOMPLETE，未重复strict。


## 2026-10-15 Enter变换历史断言、剪切选区UI状态

本批是一项产品修正、一项fixture修正。fresh full selection PID26284实际exit1，native-workspace-error刷新00:15:46为Selection transform confirmation history UI。legacy app-completion-shortcuts.ts9-14先提交pending像素，再commitSelectionChange清选区；当前native产品已一致，旧smoke仍期望+1/单undo。改为+2，精确检查提交像素/无选区、undo1恢复变换mask且像素保留、undo2原mask/原像素、redo1/2每步精确状态；原resize/subpixel/rotation/signed-property断言保留，同块提取为独立smokeTransformEnterHistory，未修改产品Enter逻辑。

剪切结束沿workspace-commands-clipboard.ts770-782及selection-properties.ts45-55，Document既有cut/history/floating算法保持；Editor两cut分支共同清properties/pivot/free状态。smoke覆盖ordinary一次pixel history、empty无新history、floating clipboard取消且原内容保留。时间轴复制候选经反证：selectFrameHeader(mode1)已按timeline排序，reverse/move也恢复视觉顺序，未合冗余patch、不宣称修了倒序。第三路现有隔离core实际exit0，仅既有行为证据。

首次正式build52755及72672编译成功但链接actualexit1 LNK1104，期间外部正式程序启动；正常关闭24172及3028各Close=True/Exit=True，未强杀。最后确认空闲后唯一正式Release单node build实际exit0；--migration-batch-check PID6068实际exit0，含完整transform验证及cut state专项。exe2026-10-15 00:22:39，11058688bytes。不重跑完整selection/workspace链，不宣称全链通过；之前docking palette位置、workspace phase50失败仍未解。无新preview/worktree/分支、无提交推送或删用户数据/缓存。本批完成停止，整体迁移仍INCOMPLETE。

来源检查实际exit0：coverage143，evidence snapshots verified，整体Legacy alignment仍INCOMPLETE；未重复strict。


## 2026-10-15 图层右键属性、帧快捷键门禁、色彩平衡

图层右键沿useLayerContextActions.tsx167-190/275-301：点击已选成员保留多选及活动图层，未选目标替换选择，属性冻结菜单打开时targets。原生统一row/eye/lock/actual gesture/fallback入口prepareLayerContext，复用已有属性事务；菜单冻结targets与document identity。实际验证多选/activity/history不变、打开菜单后改变selection仍编辑原targets、一次compound与undo/redo、未选替换。仅普通RGBA，groups/masks/special fields仍未完成。

AltN/M/B沿app-layers-shortcuts112-117、router223/277-283、shortcuts39及contract281-283，补visible timeline/Entry/no repeat/exact Alt门禁，Document算法保持。首batch29672实际exit1揭示旧N fallback把AltShiftN误作ShiftN新图层、AltCtrlN误作CtrlN新项目；局部精确条件排除额外修饰及Entry，保留正常ShiftN/CtrlN，不吞所有Alt。原fixture精确modifiers断言保留。最终逐三键验证repeat/hidden/Entry/extra modifiers不改文档及正常duplicate/linked/blank payload和单undo。

色彩平衡沿adjustments.ts266-284及AdjustmentDialog342/365/656：原RGB luminance三tone权重、9轴、preserveLuminosity、JS round/clamp与alpha0保留；复用现Document preview/target/history。UI复用3input、tone切换分别保参、preserve checkbox，菜单已绑定。原TS六像素Node oracle比对、identity/shadows/highlights/masked cancel/onehistory/undo-redo核心实际exit0。实际UI默认midtones/0/preserve true、三个tone保参、preserve、preview/cancel/apply/history/undo均通过。

正式build43327及core actualexit0；首batch29672失败准确保留。必要guard修正后最终Release单node build2125实际exit0，--migration-batch-check PID23352实际exit0覆盖本批三项；exe2026-10-15 00:50:19，11094016bytes。期间外部正式程序启动导致LNK1104，正常close19700/38920均True/ExitTrue；一次main.obj Permission denied并发结束后增量成功，未删缓存或强杀。外部preferences改动保留，不归本批。未重跑完整链，既有docking palette位置/workspace phase50遗留仍未解。无新preview/worktree/分支、无提交推送或删用户数据。本批完成停止，整体迁移仍INCOMPLETE。

来源检查实际exit0：coverage143，evidence snapshots verified；整体Legacy alignment仍INCOMPLETE，未重复strict。


## Cel属性完整迁移依赖登记（2026-10-15，尚未实现）

当前右键“单元格属性”是无action的禁用入口。legacy useTimelineContextActions.tsx244-260读取resolved Cel的opacity/zIndex并冻结多选keys；workspace-commands-animation-cel-properties.ts51-116按resolved source分组、同步全部linked成员，active frame opacity投影回layer，保留多Cel轮廓及compound transaction。不能按layer opacity乘cel opacity近似：legacy animation.ts671-678/723-747/858/905的layer是active Cel透明度投影。

原生尚缺以下必要依赖：Document active frame/layer切换的Cel opacity投影与编辑写回；Cel属性事务和链接源分组；compositor zIndex排序及opacity、onion ghost和single-layer direct path；导入/保存/恢复/导出/merge对非默认Cel的全链语义。当前layer_compositor.cpp35、Document::fromImported、project_import.cpp51、project_encode.cpp78/104明确拒非默认Cel属性；canvas_renderer.cpp38和project_preview.cpp17的direct判断未覆盖Cel metadata。只解除限制或接属性UI会产生显示/保存不一致，故本批不实施近似版本、不宣称完成。后续应作为完整普通RGBA Cel属性阶段，逐项验证linked多目标、跨帧切换、预览/close/undo-redo、canvas/onion/preview/GIF/sheet/save/reopen/recovery/merge一致性；groups/masks/special layers继续单独缺口。

本批主Agent承担以上依赖登记与唯一集成写入；三Agent并不代表三项新增产品功能。


## 2026-10-15 循环节保存归一化、曲线编辑闭环

循环节沿AnimationLoopSectionDialog.tsx40-60及workspace-animation-loop-editing.ts35-50：有限numeric truncate/clamp后映射frame ID、范围排序、空白名称默认循环节1、repeat空无限/上限9999，同归一字段不产生历史。复用现modal及Document create/update，未迁NumberInput表达式、repeat checkbox或loop lane。实际smoke包含create/edit、取消/未改保存、无限repeat、undo-redo。

曲线沿adjustments.ts191-218/90-153、AdjustmentDialog166-296、CurvePlot坐标与绘制状态：4channel独立points、RGB后channel LUT、alpha0保留，新增/拖动/邻点限制/端点X保护/右键双击Delete删除/XY/reset和baseline histogram；现Document preview/mask/history复用。原TS Node三组全部256LUT、histogram透明过滤/channel均值、mask preview/cancel/onehistory/undo-redo核心通过。Reset/delete使用legacy PixelUtilityIcon.tsx restore/delete原路径，restore6x6及translucent SVG/PNG/disabled转换到native/assets/utility-icons，未自行设计图标。

正式UI现smokeCurves实际覆盖菜单默认、加内点、XY邻夹、channel切换保留、reset、删除内点/端点保护、取消、apply alpha/history/undo。直方图数据有核心证据，但直方图视觉、右键/双击删除及逐channel拖动未分别运行验收，不宣称全部UI行为等价。

首正式build13847 actual1源于外部scrollbar/symmetry在途编译错误，随后已由外部自行修正，未抢改其产品逻辑。正式build42408实际exit0，core实际exit0，--migration-batch-check PID16080实际exit0包含本批两项；exe2026-10-15 01:17:27，11147264bytes。此前正常close17452 True/ExitTrue；后见14996已自行退出，未强杀。既有无关full docking/workspace失败未重跑/未宣称修复。Cel属性仅依赖登记，不作为第三项功能。无新preview/worktree/分支、无提交推送或删用户数据/缓存。本批完成停止，整体迁移仍INCOMPLETE。

来源检查实际exit0：coverage143，evidence snapshots verified；整体Legacy alignment仍INCOMPLETE，未重复strict。


## 2026-10-15 完整循环条带、卷积矩阵（正式验收在途）

循环条带已合入普通RGBA时间轴：layer-timeline-layout.ts lane/laneSpan及嵌套排序，LayersPanel.tsx563-614标签、播放状态、点击/双击属性、右键播放/属性/删除及边缘拖动；useAnimationGestures.ts145/423/534的临时预览、取消、边缘滚动与单次提交。现有Loop/Document/editor/play接口复用；轨道高度统一进入帧头、行、滚动和命中位置。legacy CSS2276-2288括线必要原生适配为四个可替换9slice素材 timeline.loop.track/normal/hover/playing，sheet y640追加3行，原PNG基线SHA核对、旧像素保留，XML及sheet-regions记录来源。名称localeCompare适配Windows当前用户collation，平台排序差异仍明确保留。

卷积矩阵已合入：真实convolution-matrix.ts全部40数学preset，透明tap从RGB divisor扣权重、alpha使用原divisor、zero-divisor不写、clamp/tile、选区mask和各通道；worker只持detached目标快照，generation/cancel token与Document身份/revision/frame/layer/selection/targets校验后发布。沿ConvolutionMatrixDialog/workspace-convolution-preview的40ms debounce、live/tile、滚动preset列表、Apply留窗并刷新baseline、Done不重复Apply、Cancel保留先前Apply；复用Document adjustment transaction。native现fullcanvas RGBA存储适配，bounds仍O(canvas)扫描；不宣称旧稀疏存储/indexed/layer mask及性能完全等价。

原TS全文经Node剥类型执行（dense RGBA storage适配，preset/采样算法不改）生成40×6=240输出样本，native核心全部断言通过；旧convolution-matrix.test.ts实际4tests通过。正式build39194实际exit0，cel-selection-clipboard-tests和timeline-model-tests实际exit0；独立--convolution-check PID9452实际exit0覆盖默认/debounce/detached/live/Apply留窗baseline/Done防双提交/cancel/undo/stale关闭。

loop实际UI首PID16636及诊断PID40068失败于capture：入口在desktop打开前，Manager拒裸Editor capture；已仅移当前batch到desktop.openWindow/finishLaunching后，保留命中/capture断言，后PID29796越过点击/双击/捕获/末指针单history/undo/preview/Esc/blur/captureloss/context后失败auto-scroll。fixture固定帧数不足overflow、新增末帧会延伸outer循环节使end离开视口；已改动态可见列数+10、复位scroll0、明确可见start-edge命中再拖向右边，保留实际滚动增加断言。该最终修正版尚未完成实际运行，不宣称loop UI通过。

构建过程中外部程序37464占用正式exe导致LNK1104，授权正常CloseMainWindow True/WaitExit True后build0。后外部同build并发分别导致main.obj与native_color_picker.obj Permission denied（build76469/41781失败），未删除缓存、用户数据或终止外部编译。已等待用户暂停其他正式构建后再验收，未重复盲编译。无新preview/worktree/分支，无提交推送。来源覆盖144实际exit0，整体INCOMPLETE。

最终正式验收：用户暂停其他构建后确认空闲，正式单node增量构建实际exit0；--migration-batch-check PID13492实际exit0，真实已打开desktop生命周期中loop命中/capture/末指针/单history/undo/preview/Esc/blur/captureloss/context/自动滚动增加及卷积专项全部通过。auto-scroll fixture使用动态可见列数+10、scroll0和实际可见outer起点（addFrame会把outer终点延伸到视口外），未放宽断言或修改产品滚动算法。正式exe2026-10-15 02:16:03，11290624bytes。未进行独立截图/逐像素视觉QA，不把运行断言解释为全视觉验收；旧完整docking/workspace遗留未重跑、不宣称修复。整体迁移仍INCOMPLETE，本批功能集成及最小相关验收完成。


## 2026-10-15 跨工程帧剪贴板、自动抗锯齿

跨工程普通RGBA同画布帧剪贴板沿workspace-commands-animation-frame-clipboard.ts与cel-conversion/target：应用快照独立拥有resolved像素、源关闭/cut后可用，按visual layer index映射、目标不足追加源属性层，duration/disabled及内部linked关系重映射、外部链接断开独立像素；插到最大选中/active后、first active/all inserted header selected，新增layers+frames单undo/redo。异尺寸及不支持surface geometry在修改前明确拒绝；special/mask/indexed/任意裁切geometry仍缺口，不宣称全部clipboard等价。

自动抗锯齿完整移植tools-outline.ts outlinePixelSamples43-136与antiAliasSelection212-455，交点、region面积/顺序、内部边界、nearest relative-luminance/opacity/custom/自动取色先后副作用沿实际旧算法；多target沿workspace-selection-effects-support精确Cel/frame/layer优先、resolved共享去重及locked原子拒绝，detached timeline工作副本无Document/UI线程读写，stale/cancel token保护，现adjustment/history复用。UI defaults/3source/custom NativeColorPicker部分透明/live restore/cancel/apply one undo-redo/close stale专项覆盖；原生fullcanvas普通RGBA适配，background/indexed/masks/special不宣称完整。

真实tools-outline/raster/outline-settings原TS剥类型执行、dense RGBA history+normal composite adapters生成132 oracle（全部source/interior/mask/partial及12多层opacity/hidden/透明top），native全部对照通过；旧tools.test.ts定点9passed。正式build44093实际exit0，cel-selection-clipboard-tests实际exit0；真实已打开desktop --migration-batch-check PID34392实际exit0，仅本批frame+AA，未重复上批或整animation。正式exe2026-10-15 02:41:04，11379712bytes。来源coverage145实际exit0，整体INCOMPLETE。

本批恢复事件必须保留：cross-frame git apply check0后因外部编译document.h占用报unable unlink/write Permission denied，document.cpp/main.cpp/test真实缺失。停止写入/build、保全最新候选和hash；AA baseline+AA delta重构三候选，与AA隔离final字节一致。恢复前main由未知外部writer重新出现并包含frame/AA与7→6scrollbar变更，绝不覆写；doc/test仅缺失时恢复。随后四文件精确副本/hash保全，逐文件加frame header/doc/test接口一致，保留现main。未知外部修改时间窗main02:20:53–02:31/doc02:21:09–02:31/test02:20:41–02:31不能证明无损；成功编译和测试不证明没有丢失未知外部差异。证据位于native/build/recovery-cross-frame-20261015-0231（候选/base/hash/外部maindiff/恢复记录）。未git checkout、未删除用户数据/缓存、未强杀、无新preview/worktree/分支或提交推送。


## 2026-10-15 渐变映射、GIF时间轴拖放

渐变映射沿gradient-map.ts/gradient-color.ts：normalize、periodic256LUT、连续/阶梯/反向、9抖动、stops及色卡；GradientMapControls/gradient-map-presets完整8builtin与用户save/同名replace/delete/hide/错误生命周期，必要原生用户JSON持久化、损坏库写入拒绝保护，现有GradientStopsTrack/NativeColorPicker/adjustment history复用。396原TS设置全周期2624512RGB值以FNV64全表+每case9extras核对，包含负坐标/透明alpha/重复无端点normalize；旧gradient-map及presets两文件9tests通过。正式core还通过preset保存读回/同名replace/delete/hide/corrupt保留/write-error及preview history。测试专root固定native/build/gm-store-test-owned/PID-tick，不写用户preset；原误创空native/gm-store-test-owned保留未删除。

GIF时间轴拖放沿useTimelineFileDrop/workspace importGifAnimationLayer，复用LAF Windows OLE RegisterDragDrop→Window notify→Manager DndMessage→Editor，queued真实注册callback先dispatch、hasDragTarget断言保留。GIF-only preview floor/clamp帧target，新底部layer、既有帧duration/loop保留、overflow追加来源duration/disabled，现Document结构单history、source解码复用；预先校验samecanvas普通fullcanvasRGBA、尺寸/geometry拒绝后无修改，floating先commit后import独立undo。尚不宣称异尺寸/special/indexed/masks完整。

正式首build84920失败为windows TRANSPARENT宏污染UI header，9636/诊断51736暴露GetObject宏污染WinRT声明；仅调整包含顺序（main preset header在UI后，windows/undefGetObject在WinRT JSON前），未改算法。最终build8252实际exit0、core实际exit0、真实opened desktop --migration-batch-check PID34528实际exit0，仅本批GIF platform chain+GradientMap UI。正式exe2026-10-15 03:13:53，11508224bytes；来源coverage147实际exit0，整体INCOMPLETE。

本批每次集成完整byte backup/candidate、唯一context与写前稳定hash检查/写后hash验证，未用删除式多文件git apply；最新外部main/Document差异保留，记录位于native/build/recovery-cross-frame-20261015-0231/next-batch-baseline-20261015-024300、gif-integration-20261015-0254、gm-integration-20261015-0302。上一批恢复未知时间窗继续保留，不能证无损，未删除旧证据/用户数据/缓存。无新preview/worktree/branch、无提交推送；不重复全animation或无关全链。


## 2026-10-15 循环节属性交互、画布修剪

循环节属性沿 AnimationLoopSectionDialog/NumberInput 实现有限次数开关（无限禁用输入、重开重置1）、范围计数/条带/摘要、局部数字表达式提交及无效回退。复用 PixelEntry parser，plain numeric Change 即时更新范围，表达式保持可编辑至 Enter/blur，未修改全局输入。checkboxChecked 从 legacy PixelUtilityIcon 原路径/透明度转换 SVG及PNG；审阅移除无关 SpriteSheet clip hunk。

trimCurrentFrame/trimCanvas 沿 workspace-commands-document-io、documentVisibleContentBounds、documentAnimationVisibleContentBounds、shiftSelection：最终合成alpha范围，所有帧包含disabled，裁切所有owned Cel且保链接、隐藏层像素及透明RGB；选区和枢轴随同单次尺寸history平移并undo/redo恢复。浮动内容先commit独立history，空内容报错、满画布noop。现有普通fullcanvas RGBA适配，独立cel opacity、groups/masks/indexed/sparse等仍不支持，不宣称完整迁移。

定点执行实际83个legacy模块（仅Node剥类型，无算法stub）生成9组bounds/15组shift oracle；native test对照9组bounds/10组实际修剪shift，另5组满画布按legacy noop。正式单node Release build72193实际exit0；canvas-trim-tests实际exit0，已启用工程encode→prepareEditableImport读回并比较linked/allframe/hidden的尺寸、全部Cel像素和链接。真实opened desktop --migration-batch-check PID35600实际exit0，仅本批loop+trim，覆盖finite/expression/plain-live/range/cancel/history及真实修剪菜单/pivot undo-redo/noop。来源coverage155实际exit0；未作独立截图/逐像素视觉QA，不解释为全UI视觉通过。

集成前后完整字节/hash备份位于 build/recovery-cross-frame-20261015-0231：next-batch-baseline-20261015-142218、resume-final-baseline-20261015-150033及loop/trim候选。外部性能/hover/zoom修改持续更新期间只保全不抢写，停稳后双hash核对、唯一context候选、逐文件r+b写入及写后hash核对，无unlink式多文件apply。上批未知恢复时间窗仍无法证明无损，证据继续保留。无新preview/branch/worktree、无提交推送、无删除用户数据或缓存。整体迁移仍INCOMPLETE。


## 2026-10-15 选区裁切、背景预设保存、图层快捷操作配置

cropCanvas沿workspace-commands-document-io185-199及workspace.test2331原样本：先提交floating，按clampSelection矩形裁切全部帧/owned Cel（不按mask非零范围收缩），保留links/hidden/disabled，mask和pivot同一次history平移/undo/redo。提取已有trim共享cropCanvasRegion，trim满画布仍noop，crop满画布沿旧版记录history。无选区/outside报错不产生裁切history。普通fullcanvas RGBA现有1..1024适配，未扩groups/masks/indexed/sparse/特殊Cel属性。

选区背景预设保存沿background-preset-images/tool command/Rust平台存储：最终当前帧合成+mask，保留选中RGB/alpha，未选像素RGBA0，空内容不写。五种内置PNG原bytes嵌入并登记path/hash；exeparent/BackgroundPresets、marker2、新旧种子行为、Unicode80字符名清理、32MiB/4096/16M限制、同名编号和既有atomic writer。9组真实89模块TS encode/decode PNG oracle已逐RGBA比较；测试仅独立owned目录，锁失败保原数据，不写用户库。

图层快捷操作仅迁移旧独立子面：25项完整配置/default前5/normalize保overlimit/拖动排序/edge scroll/limit5/live JSON保存。root确认在quick toolbar右侧新增独立旧properties素材设置入口，现图层属性入口保留；未接动作保配置、禁止新启用、已启用可明确关闭；toolbar仅显示已接动作。窄布局沿旧重叠隐藏机制适配native播放栏边界，旧lock/link隐藏保留。恢复默认仅重置quick子配置；density/autoHide/full LayerSettings仍未迁移，不把此子面称完整settings。

首正式build1192实际exit1为main.obj Permission denied；确认无编译且exclusive object open成功后，一次正式单node build17984实际exit0。canvas-crop-tests（含保存读回）、background-preset-tests、layer-quick-actions-tests实际均exit0；真实opened desktop --migration-batch-check PID12552实际exit0，三项实际menu/pivot undo-redo、背景保存source不变、quick capture/reorder/edge scroll/release/toolbar调用通过。来源coverage164通过；未做独立截图/逐像素视觉QA，不扩无关全量回归。

候选及完整bytes/hash保存在build/recovery-cross-frame-20261015-0231/new-batch-baseline-20261015-150618、crop/bgpreset/quick相关候选目录。写前hash guard曾拦截外部性能源码/来源台账新变化，重base保留后逐文件r+b安全写入，newfiles exclusive创建；没有多文件删除式git apply。之前恢复未知时间窗仍无法证无损，证据保留。无新preview/分支/worktree、无提交推送、无删用户数据/缓存；整体迁移INCOMPLETE。


## 2026-10-15 画布尺寸入口依赖核对（未迁移）

本批定向核对 canvasResize：CanvasResizeDialog 初始 center、锁定比例、不同步四边、trimOutside=true；workspace-commands-document-io.ts168-181 的 API trimOutside 默认 false。document-model.ts214-291 未裁切时只移动独立位图 offset 并保留画布外内容，裁切才改变局部 surface 与 storageOrigin；动画 Cel、选区与 pivot 经 shared commitCanvasResize101-143 的同一次快照历史同步，UI 另有实时预览与局部撤销。现 Document 像素复制/清空仍按 canvas stride 直接索引，跨文档 Cel/Frame paste 与 resizeImage 明确只接 full-canvas surface；仅复用现 crop 并强制 trim 会丢掉旧版未裁切语义。当前入口仍未接通，完整实现须先承接独立 surface 的编辑、渲染和保存链路；本批不以裁切近似版宣称完成。


## 2026-10-15 PNG 帧序列与动画设置正式验收

导出所有帧入口已接 PNG RGBA 帧序列：全部/指定范围/循环段、四种方向、1..6400%最近邻缩放、逐帧裁切、编号及覆盖/重命名/全部/取消冲突预检。全部与范围不展开循环段，循环段按旧逻辑展开嵌套与重复；已删除循环段回退全部帧，空帧裁切保持全画布。DocumentSnapshot 每UI tick bounded advance，完成快照转后台逐帧编码与原子写入；取消/失败保留此前已提交文件并停止后续。15 admitted真实legacy顺序与48组原worker encode/PNG decode像素对照已纳入测试。通用导出预设、每文档记忆、保护选项及其它格式仍未迁移，不称完整导出系统。

动画设置从洋葱皮按钮右键的“动画设置”入口打开，承接skipDisabledFrames及洋葱皮启用/播放期间显示/当前或所有图层/前后帧数/透明度/RGBA颜色。键盘导航使用skip偏好，原工具栏导航保留旧版包含禁用帧行为。四个数值保留double实时状态，帧数在取邻帧时JSround、透明度实时保小数、保存按旧偏好normalize舍入；现有compositor/renderer缓存及性能路径保留。JSON原子保存，旧txt只读fallback，损坏源禁止覆盖。重置仅重置此子面；完整LayerSettings密度/自动隐藏、7颜色模式/全局取色、NumberInput独立重复箭头仍未迁移。

首正式build65402因外部并发官方编译36308/cl37592占用main.obj实际exit1；独占open亦失败，未盲重试。用户继续后git status保留差异，确认无编译、obj独占可开及关键源码哈希稳定，一次正式单node build97122实际exit0。frame-png-export-tests、animation-settings-tests、layer-compositor-tests均实际exit0；finishLaunching后的opened desktop PNG PID38888与animation PID38788检查均exit0。仅本批定向自动运行验收，无独立截图视觉QA，不扩大至全域行为等价。唯一正式产物仍为native/build/Release/moonsprite-native.exe；本批无提交推送、无删用户数据/恢复/缓存，旧恢复时间窗未知改动无损性限制继续保留。


## 2026-10-15 PNG自动格式、相对亮度、列宽与BMP正式验收

PNG自动格式沿真实png-encode.ts首次遇到的RGBA调色板顺序、256色阈值、1/2/4/8bit行填充及PLTE/tRNS；超过256转RGBA。静态与帧序列保留默认RGBA，可明确选择自动格式；不量化、不改变文档模式。18组真实旧编码器完整头/调色板/解压raw/CRC/解码像素对照通过，静态single-layer直拷保透明RGB。

相对亮度沿raster.ts的sRGB/Rec709/round，保alpha与透明RGB，4096真实旧值hash对照通过。画布仅在最终显示上传脏区转换，文档、history、导出不变；Preview独立状态。后续本批精确补WorkspacePanels nullable override：override ?? (canvas view && inPreview)，切文档identity清null，context反转effective值。组件可接继承gate，实际编辑器仍沿旧默认canvas scope传false，未新增app范围偏好或reference体系，不把组件检查称app完整迁移。

图层名称列宽沿LayerTimelineColumnResizer/useLayerPanelPreferences：140..2000默认190，left初始delta/live保存、pointerup/cancel不回滚、键盘12物理像素；2x几何ceil适配保原存值。名称固定，帧格/表头滚动，共用viewport/hit/selection边界；bottom/floating大宽度不夹紧。现有half-page overscroll差异仍明确，density/autoHide未迁移。首desktop40640失败是首cell仅剩5px而separator合法覆盖4px；逐像素增强后PID28688失败slot7，诊断PID32308证明用户浮动Preview column3在1014,684,250,260合法覆盖目标1014,826。fixture仅临时隐藏Preview并RAII恢复、不写偏好；逐像素separator与剩余cell以及Skin rendered alpha/selectionContains断言全部保留，产品层级与命中未更改。

当前帧BMP沿真实bmp.ts的108-byte V4 header、32bpp BI_BITFIELDS/sRGB/alpha masks/2835ppm、bottom-up BGRA含透明RGB。全画布/像素选区/trim/nearest1..6400%沿png.ts和document-export.worker；BMP选区mask外RGBA全0，trim取全帧visiblebounds与选区交集；PNG现有路径保持。静态格式菜单、保存filter/ext/title与既有atomic writer接通。8组98模块真实legacy完整BMP bytes及边界/锁失败保原文件通过；无BMP帧序列/导入/预设/保护功能迁移。

先前正式build50292实际0，png-auto-export/relative-luminance/layer-label-width/frame-png-export四核心实际0；opened PNG PID39592、relative-luminance PID35216实际0。本轮不重复它们。诊断build40811及一次补link因外部反复启动正式程序LNK1104实际1，正常close38908 True/ExitTrue后仍出现23396，停止至用户再次明确暂停竞争。恢复后诊断link0，实际覆盖证据如上。最终正式单node build22036实际0；bmp-export-tests实际0；opened --layer-label-width-check PID39592、--preview-luminance-check PID37632、--bmp-export-check PID40012均实际0。正式exe2026-10-15 17:14:31、11892736bytes，唯一路径仍native/build/Release/moonsprite-native.exe。

来源coverage178实际0、evidence snapshots verified，整体INCOMPLETE；未重跑strict或无关全链、未做独立截图视觉QA。完整候选/byte/hash保全于build/recovery-cross-frame-20261015-0231的label-width/preview-luminance/bmp各stage，最终证据build/pngauto-label-preview-bmp-final-20261015-1717.json。未知外部toolbar/materialviewport/firstpaint源码差异均保留、不归本批。先前恢复未知时间窗仍不能证明无损，旧证据保留。无新preview/worktree/branch、无提交推送、无删除用户数据/恢复/缓存。本批完成停止。

本批收尾hash复核发现外部writer随后更新main SHA469027ca→1969ff3c，正式exe也由本批已验17:14:31/11892736bytes/SHA5e12b98c改为17:16:41/11893248bytes/SHAafdc3188。当前文件不是本批已验二进制；上述三个desktop实际通过绑定最终证据JSON中5e12b98c，不据外部新产物推断通过。协调明确停止、不再build/复测；源码与外部产物保留。


## 2026-10-15 当前帧ICO、数字重复箭头、工程所在文件夹

当前帧ICO沿ico.ts单个PNG-backed RGBA图，最大边256按比例JSround/nearest，目录宽高256记0、planes1/bpp32/offset22。复用已承接静态全画布/选区/trim/1..6400%准备与atomic writer，强制PNG RGBA；7组实际旧ico.ts/png-encode.ts验证目录、CRC/IHDR、解压raw及解码像素FNV64。压缩流不同，不声称完整ICO bytes一致。格式菜单/保存filter/ext/title实际接通，未迁ICO导入或帧序列，不重复前批BMP/PNG。

数字上下箭头为公共PixelEntry opt-in，仅动画设置前后帧数与前后opacity四字段接入明确value/min/max/step回调，其余数字控件保持原有行为。NumberInput.tsx按下立即变化，300ms仅开始安排首次重复，间隔24+156*exp(-elapsed/900)，首次约435.78ms；无catch-up突发，反向进入立即反向并重置，up/leave/blur/captureloss/hidden/disabled/readonly停止，边界停止、分方向click suppression保留。原生timer ceil毫秒与9basepx右列为必要2x适配，表达式/wheel/scrub路径不改。旧PixelUtilityIcon up/down 5x5 shape/normal/disabled原像素转换，统一sheet y656四槽x0/5/10/15，512x656旧像素逐像素完全一致，仅增5px高度至661，XML parts/styles与sheet-regions登记；不是独立图标替代atlas。

“在文件夹中打开”沿useAppDocumentIO107、DocumentTabs360、AppMenuBar284及Rust platform_gallery210：saved filePath优先sourceFilePath、无路径禁用/未保存提示；文件不存在报错且不fallback来源，验证普通文件后打开parent目录，不选中文件。ShellExecuteExW结构化lpFile安全路径替换Rust explorer argv，不拼shell命令。原生Document新增仅session来源元数据，raster/GIF打开赋来源，native工程打开赋自己的来源；dirty-open候选move保留，保存路径独立优先，新文档/恢复无旧来源，不写history或工程。未迁模板/backup其它未接入口，不扩大保存格式策略。专项通过实际Unicode/&图片打开、保存工程/重开、自身来源与保存优先、missing/launcher失败/nohistory；launcher注入核对精确父目录和失败，未作独立Explorer端到端打开验收。

fresh git status保留外部差异，12788收到正常Close=True但10秒Exit=False后等待，未强杀；随后fresh核查已退出，无竞争，唯一正式单node build94832实际exit0。ico-export-tests与number-stepper-tests实际exit0；finishLaunching后opened --project-folder-check PID38592、--ico-export-check PID40272、--animation-settings-check PID13260实际均exit0。AnimationSettings专项含四字段真实箭头click/capture/held reverse/leave/limit与既有dialog最低相关检查；未重跑上批其它领域。正式exe2026-10-15 17:32:28、11925504bytes、SHA2567c5f35e4760b85e11f520bd490f190d07c2cd588224a47642e247fdc174a8391，唯一路径native/build/Release/moonsprite-native.exe。

来源coverage181实际exit0/evidence snapshots verified，整体INCOMPLETE，覆盖不等于行为全等；未重跑strict或无关全链，无独立截图视觉QA。完整原bytes/候选/hash保存在build/recovery-cross-frame-20261015-0231的project-folder/ico/number-stepper/stepper-atlas stages，最终证据build/ico-stepper-folder-final-20261015-1733.json。外部源码/素材差异保留，之前恢复未知时间窗仍无法证明无损，旧证据继续保留。无新preview/worktree/branch、无提交推送、无删除用户数据/恢复/缓存。本批完成停止。

本批最终复核：正式exe仍SHA7c5f35e4与本批验收一致；外部writer随后更新main/native_widgets.h/.cpp/sheet.png/theme.xml，源码和素材已不再等于本批已编译版本。保留外部差异，不重复build/测试、不推断其通过；证据build/ico-stepper-folder-postverify-external-20261015-1735.json。


## 2026-10-15 当前帧SVG、循环段数字箭头、F11原生全屏

当前帧SVG按legacy png.ts119–148逐行合并同RGBA连续像素，跳过alpha0，输出小写hex与六位精度去尾零opacity。14组真实旧模块完整UTF8 bytes oracle涵盖全部256alpha、行边界、透明RGB、选区与125%缩放。复用既有静态全画布/选区/trim和atomic writer。SVG比例允许1..64倍小数与表达式，存round(value*100)，进入SVG重置100%并保留trim/selection，离开至PNG/BMP/ICO保留比例与裁切；未扩展其它格式切换或SVG导入/帧序列。

循环段既有开始/结束/有限次数三字段接入共享PixelEntry数字箭头，范围分别1..当前帧数及1..9999，步长1；小数草稿、取消无history、确认单次undo/redo保持既有逻辑。无限次数禁用并终止箭头捕获/重复，重开刷新帧数上界。未改共享atlas或其它数字输入。

F11和已有窗口菜单接通LAF原生fullscreen；入全屏前恢复最大化窗口，退出或进入抛错后恢复最大化。菜单checked跟随窗口，拒绝repeat、修饰键、输入焦点和pending dialog，主页可用，同步重入guard对应legacy Promise合并。保留窗口位置与大小，不改文档/history。LAF setFullscreen返回void，失败反馈限于后端抛出的异常。

唯一正式单node build session69125实际exit0，目标moonsprite-native与svg-export-tests；SVG核心14组oracle及边界实际通过。finishLaunching后opened --fullscreen-check PID40736、--loop-number-stepper-check PID36848、--svg-export-check PID44888实际均exit0，涵盖真实HWND监视器边界/窗口装饰/普通与最大化恢复/失败注入、三个数字控件真实箭头/禁用/取消/单次history，以及SVG真实对话框/写盘/格式切换/小数表达式/history。来源coverage182 exit0且snapshots verified；整体仍INCOMPLETE，未重跑strict、之前批次或无关全链，无独立截图视觉QA。正式exe SHA256 2b951476aa62e27ffac8b40ee88aa39e45e03f4ce4ad27feb77e8790e6b0de55。证据native/build/svg-loop-fullscreen-final-20261015-1753.json。保留全部外部差异与历史恢复未知时间窗记录，本批完成即停止。


## 2026-10-15 BMP帧序列、帧时长和图像尺寸数字箭头

BMP帧序列复用已有Snapshot分批/后台worker/范围顺序/逐帧trim/atomic writer与静态BMP encoder，仅新增格式切换和BMP扩展名。16组真实旧document-export.worker完整bytes oracle覆盖4帧（含disabled与全透明）×trim开关×50/150%；snapshot读回、Unicode/&路径、冲突取消/renameall、首文件提交后cancel、失败保留前项且不写后项实际通过。PNG默认接口兼容，不新增其它序列格式。

帧时长字段沿useTimelineContextActions799–809接共享PixelEntry stepper，min1/max60000/step10；继续使用冻结选帧批量实时preview、关闭/Esc单次commit与undo/redo。resolve先停capture和timer再清icons/value/changed，避免paletteInput复用到图层opacity泄漏。

图像尺寸既有四字段接共享stepper：像素宽高1..16384，百分比1..6400，默认step1，百分比读取legacy受控round并至少1，changed复用已有比例锁与JS正数舍入联动。草稿不改文档，取消停capture，成功确认一笔undo/redo；既有Document尺寸上限1024不变，超限报错保留可编辑对话框。仅承接箭头子集，不称完整尺寸功能迁移；自动尺度检测等既有缺口保留。像素网格候选核对workspace-commands-view12–31发现必须写document.displaySettings/touch及可配置appearance颜色/渲染阈值，未用固定色或session-only开关近似替代，待对应元数据及设置契约迁移。

正式单node build57976实际exit0。首build67437遇外部18:08:34启动应用42440占用exe/LNK1104，正常Close=True/Exit=True；后link暴露外部旧main.obj时间戳晚于合入源码，旧4参planFramePngPaths符号不匹配。仅刷新当前main mtime触发真实重编译，未删除缓存或变更内容，构建通过。正式bmp-frame-export-tests与opened --image-resize-stepper-check PID44672、--frame-duration-stepper-check PID43204、--bmp-frame-export-check PID40964均actual exit0。来源coverage184/evidence snapshots verified通过，整体INCOMPLETE；未重跑前批/strict或无关全链，无独立截图QA。正式exe 2026-10-15T18:11:58.166858 / 12046336bytes / SHA256 85b4edcd06ffdec941110021bf4800ad174df1d48a46e3bdb646f47060b5195b；源hash对照prebuild changed=[]。证据native/build/resize-duration-bmpseq-final-20261015-1812.json；保留外部差异、所有原bytes/候选与历史恢复未知窗记录，本批完成即停止。


## 2026-10-15 用户确认移除数值箭头；ICO帧序列

用户明确确认其它聊天已要求移除数值箭头。当前PixelEntry stepper API/atlas接线及旧loop/时长/图像尺寸消费者的移除是用户取舍，不记录为未经确认的丢失。保留移除，不从历史已验候选恢复API、素材或入口。此前各批箭头通过记录只代表历史版本。本批“调色板提取数量箭头”“笔刷不透明度箭头”候选暂停且不交付；palette临时局部已guarded精确撤回，brush候选未合，未改选新功能。普通数字输入/滑条按现有源码保留。来源scope同步用户决定，后续不得自动恢复。

ICO帧序列沿旧document-export.worker逐帧trim/scale/每帧最大边256及强制RGBA编码，复用现Snapshot分批、后台worker、路径冲突/cancel与atomic writer。UI仅新增ICO序列format，默认重开仍PNG，BMP/ICO互斥；原planFramePngPaths bool接口委托新格式helper保兼容，不重写架构。16组真实旧worker102模块对照ICO目录、PNG解压raw与decoded像素通过；PNG压缩流不同，不声称完整ICO bytes等价。snapshot、路径/冲突/cancel边界通过。

正式单node build97817实际exit0，目标moonsprite-native和ico-frame-export-tests；首次CL.ComputeOutOfDateSources MSB6003 FileInfo.Delete访问异常后fresh无进程，保存完整log的诊断构建通过，未删缓存或强杀。核心ico-frame-export-tests actual0，opened --ico-frame-export-check PID40272 actual0。来源coverage183/evidence snapshots verified通过，整体INCOMPLETE；无独立截图QA，不重跑前批或无关全链。正式exe 2026-10-15T18:27:38.595175 / 12032000bytes / SHA256 b026c9b6cc6ae60b0d573f512aedf5d9a3b2902ae1051b4e20c11319dda677db。证据native/build/icoseq-final-20261015-1830.json，构建log native/build/icoseq-official-build-20261015-1828.log。保留全部外部差异与历史恢复未知窗，本批仅ICO完成后停止。


## 2026-10-15 调色板反向颜色、SVG帧序列、自动链接键盘

调色板既有“反向颜色”submenu沿workspace-palette330–364接通：选中至少2项时按paletteOrder反转选中颜色，否则反转全部当前RGBA有序项，包含alpha0颜色。仅entry.color变化，ID/name/order/slots/selection及foreground/background不变；原updatePaletteColor会同步role所以不复用该不同语义，使用既有事务中稀疏color-only kind8，map查找保持旧性能，noop不写history。当前仅RGBA，indexed0排除留在未承接颜色模式范围。实际专项验证选中顺序/未选项/全部/一个选中/role/pixels/name/undo/redo/相同色和单项noop。

SVG帧序列沿旧worker逐帧trim/scale/encodeSvg，复用Snapshot后台、范围方向、冲突/cancel/atomic writer；16组真实102模块worker完整UTF8 bytes oracle通过。入SVG重置100%保范围/方向/trim；1..64倍允许小数表达式，存round百分比；离开SVG保scale，重开默认PNG。未迁其它预设/保护功能，未恢复任何数字箭头。

自动链接控件沿LayerTreeRow258–269/useLayerControlGestures253–259 Enter/Space keydown立即toggle（包含repeat/modifiers），keyup消费不重复，只作用实际focus且visible/enabled控件，复用当前pool行Click setter并恢复按钮focus；优先于全局Space手/面板滚动。旧指针拖扫/Ctrl/Alt和atlas不变。首专项34484/34872失败原因为flag在desktop attachment/openWindow/finishLaunching之前，实际visible0/focus1；仅移动检查入口至finishLaunching后，产品门控与断言不放宽。

正式65748 build0与SVG核心16组oracle0；修palette测试按有序ID取色后20902 build0，opened --palette-reverse-check PID42420、--svg-frame-export-check PID41368实际均0。诊断69521 build0；最终opened入口修补61585 build0，--auto-link-keyboard-check PID12684实际0。按协调范围未重跑已过palette/SVG，二者证据绑定20902，不宣称最终61585复验这些项。最终61585包含外部项目tabs/project_encode增量，保留且不推断其它功能通过。来源coverage184/evidence snapshots verified0，整体INCOMPLETE，无独立截图QA，无旧批重跑。最终exe 2026-10-15T18:55:47.313465 / 12087296bytes / SHA256 78720f379d1acc7c045896bce00469e4c05e27c40ecb5370eb3cc9c9b3a59356。证据native/build/palette-svgseq-autolink-final-20261015-1857.json。全部原bytes/候选保全，历史恢复未知窗记录保留，本批完成停止。

## 2026-10-15 多工程标签接入

本节更新此前阶段记录的单文档限制：新建、打开、恢复现在加入独立工程标签，支持切换、排序、多选打开、独立文档历史与视图、后台恢复及保存后关闭。正式入口仍为 start-native.bat，产物仍为 build/Release/moonsprite-native.exe。定向三项检查通过；完整保存套件另有 Grouped duration 断言失败，未将其计为通过。工程分屏、工程浮动窗口及浏览器本地历史服务仍未完成迁移。来源与验收见 [多工程说明](multi-document.md)。


## 2026-10-15 调色板八种排序、导出并打开文件夹、自动链接逻辑范围（运行验收待完成）

调色板既有八项排序接通旧core/palette.ts10–82比较器与workspace-palette309–328：全paletteOrder按颜色稳定排序ID，将slots空位集中尾部，entry颜色/name/roles/选择不变。排序不使用反向颜色的选集或color-only kind8；初提案混用该语义已经实际源码复核撤回。原生slots-only kind9历史仅回放slots，保持后来选择与role，bytes为前后slots×4；RGBA子集，不声明indexed迁移。方向默认ascending，仅存descending时降序，旧localStorage适配native目录文本偏好。真实旧JS生成16种排序预期，新增opened --palette-sort-check覆盖全order/空位/重复稳定/roles/pixels/history/undo-redo/noop；尚未运行。

导出既有static/GIF/frame sequence新增旧ExportDialogHost155–173/footer215的“导出并打开文件夹”，复用folderOpen素材和structured projectFolderLauncher_，成功完成及关闭modal后才打开父目录；取消或写失败不打开，启动失败保留产物并刷新状态。独立sprite-sheet未在本批。原版四组submitExport契约通过；opened --export-folder-check实际写盘/取消/失败检查已加入但尚未运行。

自动链接Ctrl/Alt目标改为全部逻辑普通图层（含视口外），沿useLayerControlGestures191–216 displayRows；多选优先、solo/restoration与原history不变，group/collapsed/special仍未承接。opened --auto-link-logical-scope-check含70层滚动/屏外及选择保留等断言，尚未运行。

正式单node build session26413实际exit1：外部writer同时修改main/document并启动同产物build，core编译后新增strokeBaselinePoints调用导致LNK2019/LNK1120；当前document.cpp有定义，属构建期源码/对象不一致，未擅自改外部实现。链接失败后正式exe当前不存在（链接器行为，非清理/删除），没有运行三个专项，也不声称交付可启动程序。按协调要求停止重试，等待稳定构建窗口。来源coverage184/evidence snapshots通过，整体INCOMPLETE；无截图QA，不重跑旧批。证据native/build/sort-three-blocked-20261015-1918.json。三域源和原bytes/候选保留；数字箭头保持用户确认的移除，未提交/发布。


## 2026-10-15 上批三域正式程序恢复与专项验收

用户继续后fresh核查构建空闲，外部已恢复exe；保留main/document新变更，仅更新时间强制重新编译。首31303编译document/core成功，main.obj C1083 Permission denied实际exit1；fresh无构建进程、对象独占读写检查通过后，一次单node诊断build实际exit0，日志native/build/sort-three-official-build-20261015-1927.log。未删除/清缓存/改名另发，未改外部strokeBaselinePoints实现。

SHA08187784c682907dd8f3d272f7fc024cfd0cac9875d796ad860b23a2b294bb0d正式exe的opened --palette-sort-check PID39088、--export-folder-check PID9568、--auto-link-logical-scope-check PID36596全部实际0。外部随后重建唯一路径为SHA1a44abff47fb4121a8b45632c09d4e919184981f67f397865549174920143770（19:26:01/12155392bytes），因产物实际变化补跑这三个最小专项：PID33876/33056/27300全部0，前后exe SHA相同。第二exe由外部build生成，不归功本次诊断build；之后外部仍在写入/构建，新产物不能自动继承上述通过声明。

实际通过涵盖16个旧JS排序oracle、slots/空位/稳定ties/选集不限制排序/角色与像素保持/单笔slots-only历史及undo-redo/noop；导出static/GIF/序列真实写盘、父目录Unicode&launcher注入、正常导出不打开、取消/写失败/启动失败与async取消；70层自动链接Ctrl/Alt屏外逻辑目标、多选优先、solo/restoration及history。没有实际Explorer启动端到端或独立截图验收声明。原生来源覆盖184项，整体迁移仍INCOMPLETE；数字箭头保持移除。未扩新领域/无提交发布，本批恢复与三域专项收尾。证据native/build/sort-three-final-20261015-1928.json。


## 2026-10-15 调色板颜色名称、精灵表自动PNG、Cel内容选区

调色板既有“显示颜色名称”开关沿PalettePanel82/142/1076/1083/1144及PaletteSwatch50接通：默认关闭，仅存储精确true启用；JS trim非空时显示原name，alpha混白亮度(.299R+.587G+.114B)*a+255*(1-a)>150使用#111，否则白。沿CSS2126居中/单行/1px内距/overflow裁切，读文字不改变点击命中/选框/颜色/role/选集/history。用户原生规格Fusion Pixel10px替换旧CSS8..14px clamp；旧CSS blur text-shadow无已有像素字体等价，记录为必要原生适配，不引入新字体或绘制框架。偏好localStorage适配本机text文件。专项实际渲染diff验证文字仅在色块内部，连同默认/无效偏好/透明字色/空名/geometry/history均过。

精灵表旧document-file-service932–975使用worker png-auto/scale100；现encodeSpriteSheet沿既有encodeImagePng自动路径替换强制RGBA，保存filter准确写PNG自动，不造旧版不存在的新formatselector。layout/preview/selection/source等不变。3组真实旧103模块sheet→encoder的2/16/257色oracle验证IHDR/PLTE/tRNS/inflatedraw/RGBA，复用现编码器。

Cel Alt左击内容选择沿layer-cell-shortcuts/runLayerCellShortcut和workspace-commands-animation-selection429先commit浮动，再resolved Surface alpha非零建立含offset的canvas mask并trim；ShiftAlt按旧combine追加（旧add+null incoming返回null也保留），选中对应Cel后用既有selection-only history。此前误猜selectTimelineCel清空像素选区已撤回，实际修的是全canvas未trim及空mask。保Alt拖动复制、普通flat RGBA支持边界；隐藏/锁定仍按旧快捷入口允许，linked解析复用现timeline。没有重设计缓存，旧LRU仍是未迁移性能缺口。

正式单node build16077 targets moonsprite-native+sheet-png-auto-tests实际0；core3组实际0。唯一正式exe SHA9be7c3fd9d1e7cccf9468e60200102364ec2bb5ea6d0e82178678ae9a83983bc的opened --palette-names-check PID38676、--sheet-png-auto-check PID38604、--cel-content-selection-check PID35264全部实际0，运行前后hash一致。Cel专项包含真实Alt无移动抬起/Shift追加/隐藏锁定linked alpha紧边孔洞/空Cel/undo-redo/先提交浮动再选目标两段history。来源coverage185/evidence snapshots通过，整体INCOMPLETE，无截图QA，不重跑旧批或无关套件。正式入口仍native/start-native.bat，未提交/发布/恢复数值箭头，本批完成停止。证据native/build/names-sheet-cel-final-20261015-2002.json；构建log native/build/names-sheet-cel-official-build-20261015-1958.log。


## 2026-10-15 调色板渐变、精灵表导出后打开、Cel选区LRU

调色板既有渐变/色调渐变按PalettePanel195–213/922矩形slot范围（含空槽）、workspace-palette376–430接通：去重排序indices，缺失首尾色取foreground/background，空槽创建nextColorId与默认名；非目标项/role/选集不变。旧core/palette85–112+raster249–280插值逐通道JSround，HSV最短hue差；8组真实旧JS oracle含alpha/近灰/跨0度。box范围保留并沿旧568–584拖动delta平移，绑定文档identity及选集避免跨工程残留。当前RGBA自适应布局仅取已显示slots；手动布局原入口仍未迁移，不改变其需求或实现近似替代。kind10单笔历史回放entries/slots/nextID，不覆盖后来选集/roles，bytes为前后entries×40+slots×4；旧slot gradient即使同色仍有历史，<2才不执行。

精灵表既有“导出后自动打开”disabled设置沿SpriteSheetExportDialog默认false/outputFile和session export success path接通；默认openPath真实新tab打开生成PNG，原tab/dirty/history/pixels保留。重开导出重置false；取消/原生picker取消/写失败不打开，打开失败保文件与源状态。与上批“打开文件夹”不同入口，复用现structured chooser/openPath，不新增格式或箭头。

Cel内容选区LRU沿animation-cel-content-cache103–193性能规则：全局4MiB/256条目，resolved owner共享tight local alpha结果/null/rectangle，返回独立值拷贝，命中刷新LRU，geometry key；现mutableOwnedSurface/setPixel/buildIndex写屏障失效，Timeline copy不共享selection句柄避免owner跨独立文档污染，move保留，active stroke bypass。Document内容选择委托既有timeline入口，支持offset clipping。定向测试包括linked共享一次build/hit、返回copy、修改/clip/bypass、6×1024²预算、260矩形entry上限、绘制undo/redo及resize undo/redo。限现普通flat RGBA；旧bounds accelerator/indexed/sparse仍有限制，不声明完整性能等价，不跑benchmark。

正式单node build2650 targets moonsprite-native+timeline-model-tests实际0，timeline-model-tests实际0。唯一正式exe SHA37a777f8a467cf5540cf6433aad4561f9fb136ea1aab3306f6f5755616e18af8的opened --palette-gradient-check PID37484及--sheet-open-after-check PID37204全部实际0，运行前后hash一致。渐变专项覆盖真实旧8oracle、空槽回退/新ID、非目标/角色保持、矩形range、history/undo/redo；sheet专项实际写盘/openPath新tab/取消/失败/源保持。来源coverage185/evidence snapshots通过，整体INCOMPLETE，无独立截图QA或旧批回归声明。数字箭头保持移除，无提交/发布/preview，本批完成停止。证据native/build/gradient-sheetopen-lru-final-20261015-2024.json；log native/build/gradient-sheetopen-lru-build-20261015-2020.log。


## 2026-10-15 同步颜色、精灵表新建文档、拖扫释放补迁

同步颜色沿 PalettePanel 默认 false 与本地偏好、workspace-commands-color127–146 接通既有菜单；偏好全局随文档切换传播且不写工程。updatePaletteColor 与现有 setPaletteRole 未锁调色板路径共用精确 packed RGBA 替换，frames 外层、底到顶 layers 内层，owner 去重先于锁过滤，包含隐藏层且不裁选区。复用 kind3 palette delta 和压缩 PixelRuns 组成一次历史，保活动层/帧/帧选集，undo/redo 与同色 noop。现支持普通 flat RGBA 与合法同层跨帧共享；indexed/groups/cross-layer shared owners 仍缺口，混合锁跨层 owner 排序无法在现可编辑结构验收，不声明其已支持。

精灵表沿真实 createSpriteSheetDocument/stack/document-model/session 默认 outputFile=false，默认确认直接创建 dirty 新 tab，使用既有 sheet raster，不经 PNG 编解码。保留源文档，承接旧名称后缀、单图层/100ms 帧、两色八槽调色板、空路径/源 archive/历史。文件输出和导出后自动打开仍可显式选择，重开重置；超过原生每边1024限制明确报错，不截断，文件导出仍可用。真实旧JS oracle与核心输入/metadata逐项比较通过。

可见性/锁/自动链接拖扫沿 useLayerRowToggleGesture event.buttons&1：捕获中收到不含左键的 move，提交当前范围并释放捕获，不修改下一行；held-left 继续扫，right-only 同样结束，沿用既有单笔历史。同步非法fixture同时发现既有 Timeline runtime-only跨层错误分支解引用空 linkedCelId，最小修为返回实际 targetId，保留拒绝跨层语义，回归验证 CrossLayer 与 offendingId；不借此开放跨层结构。

正式单节点 build14891 targets moonsprite-native/sheet-new-document-tests/timeline-model-tests 实际0；两个核心实际0。唯一正式 exe SHA9f5248d4796ac6e7560d0a46b92d3404512a82b3a9badb222d3070471687aa94 opened --palette-sync-check PID14608、--toggle-release-check PID31912、--sheet-new-document-check PID41520、--sheet-open-after-check PID41564 全部实际0，运行前后 hash 一致。来源 coverage186/evidence snapshots通过，strict实际1保持 INCOMPLETE；无独立截图QA。数值箭头保持移除，无提交/发布/preview，本批完成停止。证据 native/build/sync-eye-sheet-final-20261015-2117.json；log native/build/sync-eye-sheet-final-build.log。


## 2026-10-15 调色板剪贴板、导入层名、时间轴键盘补迁

调色板剪贴板替换旧正则抓取V1子串，直接承接 components/palette-clipboard.ts 全JSON验证：V1/V2、RGBA全为finite number、JSround后clamp、字段顺序任意；V2严格验证1..256整数列数、非空整行slot及null/合法颜色索引。保留系统读取4MiB预算、内部fallback、原V1复制输出和既有pastePaletteColors目标/单笔历史。当前auto模式同旧PalettePanel仅使用V2 colors，manual布局仍缺口，不称其已迁移。真实原TS执行23输入oracle覆盖重复稀疏布局、小数/负数/超限、字段乱序、残缺JSON/尾随垃圾、类型错误、越界layout；native全部一致。

精灵表导入层名沿 buildImportedSpriteSheet 与中文spriteSheetImport.layer，纠正“精灵表”为“导入的精灵表”，不改变算法或导出层名。现有核心补result/apply/undo/redo名称断言，原opened fixture仅编译，不为一个名称重跑完整animation。

时间轴帧头/Cel键盘选择沿旧detail0 button click，Shift range优先Ctrl toggle，其余replace，委托现有selection API。真实本机headless Edge DOM oracle确认Enter down含repeat激活、up不激活；Space down含repeat仅arm，up用释放当刻修饰激活，焦点/文档改变或不可用取消，避免启动hand。仅已显示且可用焦点头/Cel，按当前pool/scroll映射；无新增通用快捷键或文档历史。

正式两核心build44691实际0：palette-clipboard-tests真实23oracle及sprite-sheet-import-tests实际0。最终唯一正式app build97661实际0；外部构建曾先读旧main后写较新obj，已由本批fixture真实改动重编解决，不删缓存/obj。两opened采用start-native.bat相同显式theme/cursors路径，--palette-clipboard-check PID15024、--timeline-selection-keyboard-check PID37280均实际0；旧产物镜像theme导致前次启动未入检查，旧Clipboard undo error文件未更新，不计成功。SHA13f627fcb89dea19fd98e37f896e4cb8135146b462278460b379f4ea6d880c1f运行前后相同。来源coverage189通过，strict1保持INCOMPLETE，无截图QA，数值箭头不恢复，无提交/发布/preview，本批完成停止。证据native/build/clipboard-import-keyboard-final-20261015-2341.json；log native/build/clipboard-import-keyboard-app-final-build.log。


## 2026-10-16 重命名Unicode边缘、时间轴tail、指定单层静态导出

调色板重命名承接 workspace-palette177–190 的 name.trim()，复用此前名称可见判断相同ECMAScript whitespace集合，不再仅ASCII space/tab/CR/LF。包含NBSP/FEFF/Unicode Zs/行分隔符，保留内部空白与非空白U+0085/U+180E/U+200B，仍允许空名称；现UTF8 editor→UTF32安全路径、kind4差量历史、未知ID/normalized同名noop/undo-redo不变。原函数提取实际执行31输入oracle；既有moon-core-tests增加结果/历史/像素revision断言，正式build43078/core实际0。

时间轴half-tail沿 useProjectScrollMemory，只在frame grid内容宽度真正超过frame viewport时增加半视口尾部，exact-fit和fit不产生空滚动；保现大label补偿、真实overflow公式、滚动条/offset夹紧。opened专项测exact-fit/±1logical阈值、实际fit/overflowhalf-tail/末端可达、view-only与undo恢复fit时offset归零，非时间轴架构重设计。

静态PNG/BMP/ICO/SVG补指定单图层导出目标：沿layer-export.ts隔离目标但保源visible/opacity，current frame复用compositeNormalRegion目标过滤参数，不复制Document/history/timeline。无效layerID按旧回退document；保trim/scale/透明空内容和现codec输出，文件名沿sourceStem-layerStem与旧非法字符清理。原导出目标/格式切换、取消picker、写盘成功/源history保持按定向opened验证。真实旧PNG解码RGBA的normal/.5opacity/hidden/0opacity及命名oracle通过；linked/invalid fallback/trim/scale/四格式/source核心通过。本批不接all-layers批量、动画层导出或完整导出偏好记忆；旧主入口重开reset仍明确缺口。

正式单节点build47351 targets moonsprite-native/layer-export-tests实际0；layer-export-tests实际0。唯一正式exe SHAe4ac384c29dac426566d767bb55575e5d7d028df2555fc38d5aac5402c6cd772，以start-native.bat相同native/assets显式theme/cursors运行，opened --palette-rename-trim-check PID31788、--timeline-tail-check PID41940、--layer-export-check PID31628全部实际0，运行前后hash同。来源coverage190/evidence snapshots通过，strict1保持INCOMPLETE；无截图QA，数值箭头不恢复，无提交/发布/preview，本批完成停止。证据native/build/rename-tail-layerexport-final-20261016-0000.json；log native/build/rename-tail-layerexport-final-build.log。

## 2026-10-16 HEX严格解析、播放前浮动提交、静态统一裁切

HEX沿实际color-values.ts parseRgbaHex与ColorValueControl：ECMAScript边缘trim，严格可选#加6/8位ASCII hex；6位保当前alpha，8位显式覆盖，拒绝符号和部分解析。共享空白helper承接上批重命名和名称可见判断；保留既有角色/锁/同步/单笔历史路径，非法输入恢复当前HEX。实际旧函数43组oracle与color-picker-tests通过。

播放开始沿旧入口先提交floating paste，再取消stroke并记录播放revision；真实Play与直接loop入口均承接，Pause不提交。opened覆盖立即提交、两次tick仍播放、Pause无额外历史及undo恢复。静态导出新增none/individual/common三态，common先用原文档可见内容范围再与baseCrop相交，沿旧空范围fallback；格式切换保选择。实际旧worker12组oracle、layer-export-tests覆盖可见/隐藏目标、选区和空交集、四格式、源状态。动画/序列裁切与跨重开设置持久化仍未迁移。

正式单节点构建app及layer-export-tests实际0，layer核心实际0。唯一正式exe SHA c3f0404b3ca21270b0e70699cd4b822a384c2ef47ce3b19c887f2e992fd68cb6，以启动器相同显式theme/cursors运行：--role-hex-check PID35084、--playback-floating-check PID22640、--layer-export-check PID45008均实际0，运行前后hash一致。来源coverage191/evidence snapshots通过，strict1保持INCOMPLETE；无截图QA，数值箭头不恢复，无提交/发布/preview。本批完成停止。证据native/build/hex-playback-common-final-20261016-0013.json；构建log native/build/hex-playback-common-final-build.log。

2026-10-16 导出弹窗布局：对照 legacy/src/renderer/src/components/app/ExportDialogHost.tsx 与 styles.css 的 export-primary-fields、gif-export-options、scale-control、footer 重排现有静态/动画导出入口。格式与区域同排，动画范围/起止/方向在比例前，比例旁复用旧版默认100/200/400/1000/2000快捷项，修剪在后，底部取消/导出并打开文件夹/导出。适配用户原生6px边距和2px标签间距；指定帧范围展开自动增加最低高度。文件名和路径仍在原有Win32保存步骤选择；内联路径/名称、命名导出预设、从首选项加载自定义比例列表不在本次布局调整内，保持迁移缺口。

2026-10-16 用户追加：导出选择项现改为真实 PixelDropdown，数值为 PixelEntry，快捷操作为 PixelButton；新建工程预设区抽取 PixelPresetControls，两处直接复用构造与布局。已接入原生导出预设的命名覆盖保存、重载、选择应用、删除及损坏保护。持久化支持已迁移的格式/目标/修剪/比例/动画范围和方向；文件名/路径仍为系统保存窗口，旧localStorage导出预设导入及自定义比例首选项仍未迁移。


## 2026-10-16 导出设置跨重开记忆与动画修剪三态

沿旧 core/export-settings.ts198–273 与 ExportDialogHost48–94、document-file-service205–224，普通导出入口恢复每工程最近成功设置。身份优先保存路径，其次导入来源路径，Windows路径统一分隔符/大小写；无路径文档使用进程限定runtime identity，互不串用。最多100条，成功静态/GIF写盘或帧序列完整完成后原子写入；取消、冲突取消、部分序列取消及失败不覆盖。恢复现已迁格式/比例/静态目标/裁切/动画范围与方向、成功文件名和仍存在且匹配的原生预设名。目录继续按旧openExport的当前首选项确定，不以旧记录覆盖。显式格式入口保指定格式，显式帧序列入口按旧规则将GIF变为PNG自动。无效选区/图层/循环段及缩短帧范围复用已有回退。

动画修剪补不修剪/独立/统一三态；当前原生动画仅画布目标，两种修剪复用已有GIF全时间轴帧内容并集（包含范围外帧）及序列逐帧裁切，不新造矩形算法。既有原生命名预设v1读取兼容，v2追加该状态，不扩预设功能。

未迁格式、切片、动画图层目标、旧localStorage导入、无路径恢复文档稳定身份仍为缺口。定向 --export-memory-check 与GIF/序列核心检查已补；正式首次构建main/core编译成功，链接LNK1104因现有PID11904占用唯一正式exe。CloseMainWindow后仍未退出，未强杀/丢弃未保存作品；等待用户处理后构建运行，不计运行通过。来源覆盖检查与行为运行验收分开。唯一正式产物/入口不变，数值箭头未恢复，无提交/发布。


用户保存退出后，fresh确认旧app及构建均退出，再进行唯一正式单节点构建43896，app/gif-export-tests/frame-png-export-tests实际0；GIF与帧序列核心实际均0。opened --export-memory-check PID41036仅最后损坏回退断言失败：fixture当前2帧，应沿既有默认GIF，误写Static；只修该fixture预期，正式app增量构建81946实际0。最终opened --export-memory-check PID11040实际0（desktop.openWindow+finishLaunching后执行，显式使用启动器native/assets theme/cursors），成功覆盖真实静态/GIF/异步BMP序列写盘、取消/写失败不覆盖、路径大小写+fresh Document重开与范围夹紧、无路径工程隔离、显式入口、动画common状态、100条MRU上限与损坏记录回退。核心验证GIF范围外帧仍参与全帧union，序列对既有真实worker帧样本含空帧验证common/individual PNG字节与像素一致。首链接占用与fixture失败历史保留，不再作为当前阻塞。

最终唯一正式exe SHA256 DAFB483AA3CB716E8E24A481D4E9646175FC6E27B7CF9C432D534A243539987F，2026-10-16T19:05:54.4359606+08:00 / 12652032bytes，运行前后相同；main源码运行前后同SHA AFDB3A13D4BF3728D725EC4539AEB13CE537845CBB5C9FB1D109783E1A17D5C3。来源coverage200/evidence snapshots verified，strict实际1保持INCOMPLETE，无独立截图QA与无关套件回归声明。未删除用户数据/未恢复数值箭头/无提交推送或preview。证据 native/build/export-memory-final-20261016.json；构建日志 native/build/export-memory-final-build.log、native/build/export-memory-check-fix-build.log。本批完成停止。


## 2026-10-16 最近成功导出目录、拖排历史、循环节Unicode空白

最近成功导出目录沿 file-preferences.ts1231–1235 outputDirectoryForOperation 与 document-file-service193–204 rememberExportPath：recent模式用全局最后成功父目录，无记录回configured目录；fixed始终用配置值，但成功也更新last供之后切回recent。原生原子UTF8偏好文件适配localStorage字段，静态/GIF/序列表单共用目录，sheet picker用lpstrInitialDir共享prefill。仅静态/GIF实际写盘、完整未取消序列完成、sheet成功写盘更新；取消/失败/未完成不更新。10条最近导出列表UI不在本批。实际原函数5组JS oracle通过；新opened --recent-export-directory-check待运行。

调色板拖排历史仅repositionPaletteColors改用既有kind9 slots-only快照，对齐workspace-palette293与applyPaletteSlots27，undo/redo保用户后来选集与前后景身份/颜色，bytes仅前后slots×4。kind5仍供原applyExtractedPalette，不改其语义；原movedPaletteSlots与拖排提交路径保留。既有document-test fixture补后来选择/角色保持、精确bytes、pixels/contentRevision及noop，核心待运行；manual columns仍未迁移。

循环节名称沿AnimationLoopSectionDialog49的JS trim和默认“循环节 1”，复用已有javascriptTrim，预览与commit共用loopDisplayName。仅修空白/回退差异；保现64码点限制，旧core trim().slice(0,64)按UTF16、可能切开surrogate的差异明确保留，不能宣称完整名称迁移。新增opened --loop-unicode-name-check待运行，涵盖六组边缘/内部/非空白Unicode、preview/commit、undo/redo/noop/cancel。唯一正式路径/数值箭头约束不变，未提交推送。


正式单node build9421 targets app+moon-core-tests实际0；moon-core-tests实际0，包含拖排后选集/角色身份和RGBA保持、slots/bytes、undo-redo/contentRevision/noop。真实旧workspace-palette reorder/apply及palette-layout normalize原函数oracle实际0：before[1..8]→[3,4,1,2,7,8,5,6]，bytes64；后来selected[4]/primaryId3/secondaryId4与颜色值经undo/redo保持，重复相同target不新增命令。第一opened recent PID36488实际0；loop PID5620仅fixture用historySize误判redo尾被替换，改用revision+1验证单次提交，产品不改。正式app增量build29735实际0，最终launcher相同native/assets显式theme/cursors opened recent PID30804、loop PID15824实际均0，入口在desktop.openWindow+finishLaunching后。

最终唯一正式exe SHA256 36A3B28778C087A6EB71C861C36D746B011D3519C5A300D93594BC0A01DC8062，两个opened前后同hash。来源coverage200/evidence verified、strict1保持INCOMPLETE，文档检查与运行分别记录，无独立截图QA/无关旧批回归。保留64UTF16/无路径恢复identity/manual/最近导出列表等已知缺口，不把本批小修称完整功能迁移。未恢复数值箭头，无提交推送/preview。证据native/build/recent-palette-loop-final-20261016.json；log native/build/recent-palette-loop-build.log、native/build/recent-palette-loop-fixture-build.log。本批完成停止。

循环节原组件sectionName表达式已直接抽取实际执行6组Unicode oracle，exit0，结果与opened断言一致，详见本批证据oracle.loopOriginalExpression6Cases。


## 2026-10-16 默认导出格式、相同粘贴无历史、帧时长提交

默认导出格式沿ExportDialogHost48–94和file-preferences1178：工程记忆优先，其后首选项；多帧默认GIF，显式帧序列沿旧规则把GIF/WebP/PSD/MoonSprite转PNG自动。首选项接入现有draft/apply/cancel及持久化，只启用PNG/SVG/GIF/BMP/ICO；未接格式明确禁用，已有不支持的单帧配置报告未接入。显式格式入口和已记忆的有效格式保原规则。真实旧映射/默认表达式20组oracle通过。

相同调色板粘贴沿workspace-palette113–149及recordPaletteEdit63–67，在更新selected与primary后比较slots和ordered entries；无变化不push历史、不改dirty/revision/bytes、不截断redo。沿旧history test57扩输入有多余颜色的有界粘贴及真实改色undo/redo证据；manual columns仍未迁。

帧时长仅专用输入承接NumberInput默认live=false、commit/normalize、表达式Enter停留/纯数Enter关闭、失焦提交、Esc丢弃未提交草稿但保留已应用值、关闭按钮先提交、滚轮从已应用值±10，夹紧1..60000再沿store trunc。保持既有冻结多选目标事务/单步undo-redo，无上下箭头步进。字符过滤、scrub及其它数值字段不在本批，不能称NumberInput完整迁移。真实旧numeric-expression与NumberInput normalize/commit抽取执行8组oracle通过。

正式单节点app/moon-core-tests/editor-preferences-tests构建实际0，首选项核心0。调色板核心首次1仅新增fixture误认undo后clean；仓库既有规则history navigation仍dirty，fixture改为记录undoDirty并断言相同paste不改。仅核心重构建0，最终moon-core-tests0，产品exe未变。opened --export-format-preference-check PID7020、--frame-duration-input-check PID29448实际均0，在desktop.openWindow+finishLaunching后使用启动器相同显式native/assets theme/cursors。正式exe SHA256 650A1F83B8C046550EDE8EB99D74692F1590C2284C31822C21D9649F1E284C65运行前后一致。来源coverage200/快照通过，strict1保持INCOMPLETE，与运行分别记录。未补独立截图QA；未删除用户数据、恢复数值箭头、提交推送、外部工程或preview。本批完成停止。证据native/build/export-palette-duration-final-20261016.json；构建日志export-palette-duration-build.log及export-palette-duration-core-fixture-build.log。

只读palette分析Agent另报告实际Node24 stripTypeScriptTypes原workspace-palette paste/recordPaletteEdit oracle exit0：相同有界red/blue/red→slots0,1返回IDs1,2、history0、selected1,2、primary2/blue、nextId3；真实交换history1、undo恢复red/blue。此为执行Agent报告，无独立产物路径，主写入者未重复运行。


## 2026-10-16 GIF指定单层、粘贴历史背景色、多层复制活动副本

GIF补有效指定单图层目标，复用静态目标dropdown与现compositeNormalRegion targetLayerId，不复制Document/history/timeline；动画范围/循环/方向/codec不改。沿旧worker73–93：individual使用目标隔离文档的全部帧union，common使用原文档全部帧union，包含所导范围外帧；实际编码每帧始终只过滤指定层，保visibility/opacity，空范围回画布。隐藏/.5/零opacity、链接帧/scale/范围、原源保持沿native核心验证；实际旧worker encode与gif prepare/export加载执行六组oracle通过，结果individual1×1/common5×2、hidden/zero回5×2、目标RGBA一致。

文件沿document-file-service506–595对用户base名称加sanitize后的图层stem，复用原生冲突菜单；成功记忆保base名称（不重复追加layer），取消/失败不写memory。原生memory v2及presetv3末尾追加animation.layerId，旧memoryv1/presetv1/v2继续读且不误把旧image.layerId当GIF层。有效目标存取、命名、真实写盘bytes、cancel/failure/reopen与源状态经opened检查。无效已记忆目标保留明显未接入提示，并在选有效单层或显式画布前拒绝导出：旧版失效ID实际会回退全部图层批量，本批未接，不能称其已一致迁移。all-layers/group等既有缺口不变；不扩帧序列目标。

调色板仅kind7 paste历史回放前后保当前secondary RGBA/ID。实际旧capturePaletteEdit/recordPaletteEdit未记录background；history undo/redo也不normalize。故后选已有颜色、未匹配RGBA/ID0、甚至paste新ID后undo移除该entry时的悬空secondaryId都保留。只读palette Agent实际原函数三类oracle报告exit0，主写入者未重复执行/无独立artifact路径；native核心验证同类及entry/primary/pixels/contentRevision/history。未改其它history kind。

多图层复制沿workspace-commands-layer-structure311–318/redo339将活动层设最后副本；只改afterActive从front到back，保持副本顺序/选集/anchor/linked展开。旧入口context/shortcut证据核对，未执行JS oracle；native非连续源核心和真实context opened验证单笔history、最后副本活动、立即绘制只改最后副本、源/首副本保持、undo/redo及帧保持。

正式单节点app/moon-core-tests/gif-export-tests/layer-merge-tests构建实际0，三个核心均0。opened --gif-layer-target-check PID15524、--duplicate-last-layer-check PID29216均实际0（desktop.openWindow+finishLaunching后，启动器相同显式theme/cursors），唯一正式exe SHA256 40ACE369746C3E6A2EDE4B7250B766CF3D529C5881673AE27999B1271B5EC51F运行前后一致。来源coverage200/snapshots通过，strict1保持INCOMPLETE，与运行分开记录。oracle早期fixture复用旧render cache/尾空格sanitize期望造成失败，fixture改fresh document与原函数实际期望后通过，产品未因此改动。无截图QA/未声明原生压缩GIF字节与旧encoder等价；未删用户数据、恢复数字箭头、创建分支/外部目录/preview或提交推送。证据native/build/gif-layer-secondary-duplicate-final-20261016.json；log native/build/gif-layer-secondary-duplicate-build.log。本批完成停止。

## 2026-10-16 Custom export scales, real palette window blur, duplicate regression correction

Custom scale presets follow the actual legacy file-preferences parser/default and PreferencesDialog/ExportDialogHost behavior: five defaults [100,200,400,1000,2000], finite 1..6400 values rounded and deduplicated in order, 100 preferred otherwise first. Native preferences retain draft/add/delete/edit/apply/cancel and at least one row, persist in the existing native quoted format. Export shortcuts use configured values; horizontal existing-skin scrolling is the necessary native adaptation for overflow. Static/GIF/frame-sequence defaults use preference; SVG remains100 and fractional shortcuts such as150->1.5x work. Numeric arrows were not added. No legacy localStorage JSON import claim. Actual original parser/default expression oracle10+3 cases passed; core preferences and opened dynamic controls/overflow/real150%PNG dimensions passed.

Palette terminal blur follows actual PalettePanel finishBlur/finishPaletteDrag: moving commits the last preview once; selection retains its live selected IDs without finalizing box range. Native WM_ACTIVATE inactive -> WindowLeave -> manager mouseup buttonNone carries current OS position, so this terminal event now finishes without resampling it. Ordinary release, internal FocusLeave and Escape remain unchanged. Real opened test uses SendMessageW(WM_ACTIVATE,WA_INACTIVE), timer and manager loop, checking moving commit/history/roles/capture/undo-redo and selection retention/capture. Palette original function execution exit0 was reported by the read-only analysis agent, with no independent oracle artifact path.

CORRECTION: the previous batch's copies.back active-layer change was a regression. Legacy layer storage is bottom-first while native is visual top-first; actual legacy sourceLayers filter plus layers.at(-1), viewed through descending panel order, selects source A's clone for both visual [A,B,C] selections A,C and A,B. Restore copies.front; keep ordering/selection/anchor/frame/link semantics. Tests now use distinct source colors and immediate paint to prove the corresponding visual source clone is active, with originals and other clone preserved and undo/redo. Previous passing tests mirrored the wrong expectation and were not equivalence evidence. Actual original statements execution exit0 was reported by the read-only animation agent, no independent artifact path. Delete fallback was not changed.

Official single-node app/editor-preferences-tests/layer-merge-tests build0 and both core tests0. Opened --custom-export-scales-check PID27212 and --duplicate-last-layer-check PID41908 passed0 on SHA D450B96A5D011F425C603470D86D62B125E81530697044CEB651A266AE7932FF. Subsequent builds changed only the palette blur fixture. Initial fixture failures were setup defects: background selection overwrites selected IDs; final setup selects secondary2 then primary1 and explicitly asserts selected=={1}, preserving all real window assertions. Final official app build0; real --palette-window-blur-check PID34120 passed0, final SHA E9EFD330B78CC6CA6B898BB5CB8C2E856254D75D48CFDDF7C10BF41946BF3026 before/after identical. Launcher assets/theme/cursors match start-native.bat; checks run after opened window. Failed evidence is retained. No unrelated suite reruns or independent screenshot QA. Coverage200/snapshots pass; strict1 remains INCOMPLETE, reported separately from runtime. No branches/worktrees/external projects/preview/commits/pushes/user-data deletion. Evidence native/build/scales-blur-visual-copy-final-20261016.json. This batch is complete.

## 2026-10-16 Export completion sound and appended extraction count

Export completion sound follows actual platform/export-success-sound.ts and workspace-commands-document-io.ts exportActive / workspace-commands-session.ts exportSpriteSheet. Default enabled, existing preferences toggle now wired to draft/apply/cancel and native persistence. Original legacy WAV is copied byte-for-byte, SHA256 4c92a202984ec78219926833b485520e3dfd38543587ab748be4871989f35a1e; native/build/Release/assets copy matches. License legacy/LICENSE2(b,c), covering original assets, permits this internal modification/compile/test; no public binary distribution performed. WinMM PlaySoundW with SND_FILENAME|SND_ASYNC|SND_NODEFAULT is the necessary native audio adaptation. No gesture/canvas warmup or WebView; false/exception is contained by noexcept feedback and diagnostic is reported once. Audio feedback never changes successful export status or source history.

Static and GIF complete output each request sound once; frame sequence requests once only after noncancel/nonerror terminal result, never per-file/progress. Earlier written files or even last file written do not make a canceled job successful. Actual legacy session source corrected the initial proposal: sheet new-document success also plays; file auto-open failure must not play. Sheet completion is placed after new-document/auto-open completion. Default native sheet opener verifies actual opened source/path because openPath absorbs errors instead of returning legacy boolean; existing error status is preserved. Already admitted static/sequence formats use their existing shared success nodes; no other format or export feature added.

Palette append extraction now supplies the missing added-color count from actual PalettePanel extractFromImage merged.length-orderedColors.length. Native status previously had no quantity; an early analysis claim that it showed colors.size was incorrect and was retracted before implementation. Only append mode uses visible order after-before; create/replace text, merge algorithm, IDs/roles and history behavior are unchanged. Hidden stored colors becoming visible count as new, despite unchanged entries size. Read-only palette agent executed actual colorKey/mergePaletteColors and count expression: duplicate0, mixed1, pre-existing duplicates retained with new1, hidden-entry visible addition1, exit0. No independent oracle artifact path; first extraction script missed newline and was fixed without product changes.

Single-node official app/editor-preferences-tests build0 on first attempt (sound-append-count-build.log), preferences core0. Opened --export-success-sound-check PID39784 and --append-extraction-count-check PID16872 both0, after desktop.openWindow/finishLaunching using launcher-equivalent theme/cursors. Sound fixture uses actual Windows MMIO WAV RIFF/format loading and injected playback requests; UI preference visible/enabled/modal ownership and draft/apply/cancel/persistence, static success/cancel/write failure, GIF success, complete sequence once, real partial-write failure, actual writer cancellation after final file then deterministic existing-worker terminal future, early snapshot cancel, file/new-document sheet, auto-open failure, audio exception/false isolation all pass. Append fixture covers full duplicates as existing noop, one new visible color with one history/undo/redo, hidden ID reuse with unchanged entries and added-visible1. No expanded old suite reruns or device-level listening/fidelity/overlap QA.

Official executable SHA256 7011F2F78D550B025F422BE5012B6FFE35B7DAFB32319E74090196FC12CB9DAF before/after identical. Provenance coverage200/evidence snapshots verified0; strict1 remains INCOMPLETE, separately reported from runtime. No numeric arrows/branches/worktrees/external projects/preview/commits/pushes or user-data deletion. Evidence native/build/sound-append-count-final-20261016.json. This batch is complete.

## 2026-10-16 Export protection and temporary extraction names

Export protection follows the actual 41-line core/export-protection.ts and its tests. Existing settings off/blur/blur-noise default off now use native draft/apply/cancel/persistence. Only image export above100% is processed: crop/mask/nearest scale first, then horizontal+vertical alpha-aware narrow kernels [1,6,1] below400% or [1,6,18,6,1] at400%+, then stable output-index noise. Every pass matches Uint8ClampedArray nearest/ties-to-even; integer quotient/remainder is the necessary C++ adaptation, and uint32 overflow matches Math.imul. Off/<=100 returns the same vector without output allocation. Only prepared export buffers and two necessary per-output scratch buffers are used; no Document copy, snapshot worker redesign, timeline-wide added copies, or codec change. This is the existing image effect and does not guarantee prevention of copying.

Already supported static PNG RGBA/automatic, BMP, existing SVG encoder, ICO and GIF use protection before encoding; automatic PNG indexing and GIF alpha threshold/palette/quantization happen afterwards. ICO's existing256px proportional fit happens after protection. Frame PNG/BMP/SVG/ICO use the existing snapshot/background per-frame path and cancellation/backpressure handling. Global protection is captured when export starts, not stored/restored in document memory or export presets. Regular save defaults remain off; sprite sheet remains100% and unaffected. Missing formats/slices/groups remain missing. An earlier informal description of SVG as rect output was inaccurate; actual existing encoder is untouched.

Actual original protectExportPixels was executed with Node24 stripTypeScriptTypes,12 cases exit0:101/200/399/400/6400, off/100/50 bypass, edge clamping, multiple alpha values and stable noise. New core compares native RGBA FNV64 to those original outputs and verifies all admitted codec integration, ICO320px raster before256px fit, GIF before quantization and unchanged source/history. Oracle native/build/export-protection-legacy-oracle.cjs/json. Core export-protection-tests and editor-preferences-tests first build0 and run0. No old broad suite reruns.

Temporary extraction name follows PalettePanel openExtractDialog/extractFromImage and zh-CN defaultName: document name plus ' 色板', JavaScript trim, empty fallback. Shared javascriptTrim is used with owned input lifetime; internal whitespace and U+0085/U+180E/U+200B are preserved. Input draft remains as entered, because legacy only updated separate saveName; no new library/saveName state/storage was invented. Create feedback uses normalized temporary name; replace/append, algorithms/history and document name stay unchanged. Read-only palette agent executed actual old expression with locale default7 cases exit0, no independent artifact path. Library saving remains unimplemented.

Official single-node app compilation succeeded; first link failed LNK1104 because PID41084 held the sole executable. CloseMainWindow requested normally and it exited without forced termination; only relink was repeated and succeeded0 in9s, no source fixture retry. Logs protection-names-configure.log, protection-names-core-build.log, protection-names-app-build.log, protection-names-app-link-build.log; close evidence protection-names-close-results.json. Opened --export-protection-check PID39960 and --extraction-names-check PID41612 passed0 after desktop.openWindow/finishLaunching using launcher-equivalent theme/cursors. UI verifies visible/enabled/modal controls and draft/apply/cancel/persistence, actual protected PNG/GIF files, real background sequence captured global mode despite later preference change, source clean/history preserved; names cover7 Unicode/default cases plus cancel/empty-image failure.

Final official executable SHA256 5C763720823A6A8C1511865EBA9211A6C437DBBA411E5B34D70D1A83AF932547 before/after identical. Provenance coverage202/snapshots verified0; strict1 remains INCOMPLETE, separate from runtime. No independent screenshot QA or full legacy migration claim. No numeric arrows, branches/worktrees/external projects/preview/commit/push or user-data deletion. Evidence native/build/protection-names-final-20261016.json. This batch is complete.


### 2026-10-16 色板 PNG 与最近导出路径（本批）

- 按旧版 PalettePanel / palette.ts 接入保存名称弹窗、前24色预览与完整数量、全部顺序颜色16px平铺PNG；提取新建名称承接。取消/失败保留弹窗与名称，成功才写目录/最近路径并播放已有成功音效。色板库JSON、手动保存和图库仍未迁移。
- 导出位置按钮接入旧版路径菜单；图库禁用，工程目录和最近文件的父目录不修改文件名。最近记录10条，实际完整成功后记录，帧序列仅记最后文件；取消/失败不记。Windows本地大小写与原生版本化存储属于必要适配，不声明通用JS locale一致或旧localStorage导入。
- 核心检查与正式窗口检查分别记录在 native/build/palette-paths-final-20261016.json；全量迁移未完成，strict应保持失败。

## 2026-10-17 单张 JPEG 导出

按旧core/png.ts encodeScaledPixels、document-files、worker、ExportDialogHost与service接单张JPEG完整现有表单路径：quality0.92、.jpg、现有裁切/选区/图层/缩放/全局保护、原子写盘、首选/预设/每工程记忆及成功音效/目录/最近路径。旧代码白fill后putImageData覆盖，因此透明区最终黑色；实际旧函数Chrome155 oracle五组透明/半透明/opaque结果与Skia quality92/420/sRGB/black alpha原生样本解码RGB全部相同，不把有损codec跨版本byte一致作为承诺。复用已分发Skia BSD编码器及许可，不引入WebView或新编码架构。

仅单张静态子流程；JPEG帧序列明确未接入并禁用，原多帧普通导出默认GIF保持。未扩直接来源格式保存、WebP/PSD/切片/分组。调色板JSON依赖manual/layout完整链，时间轴密度依赖几何/缩略图/缓存完整链，本批只读登记后续依赖，未以未可见底座冒充新功能。

核心/正式程序/打开窗口行为检查分别记录native/build/jpeg-final-20261017.json；来源strict继续保持INCOMPLETE。

正式单节点core构建0，jpeg-export-tests最终0。测试自身selection改变history的初始断言已修，不改编码器；5组原生JPEG经WIC解码RGB与实际旧Chrome155原函数输出均精确相同。首次opened停默认多点名差异，JPEG分支改用既有sanitize再追加.jpg；随后fixture错误用opacity事务改层名，修用真实beginLayerProperties，并移除直接替换Document却遗留旧layer UI状态的尾部fixture。保留所有失败记录，不据此改其它codec或文档切换行为。

最终app单node jpeg-sequence-boundary-app-build.log实际0；opened --jpeg-export-check PID30204实际0，desktop.openWindow+finishLaunching后使用启动器相同native/assets theme/cursors。验证首选draft/apply/persist、真实JPEG选择与.jpg默认多点名、预设保存重载、取消/失败保弹窗与元数据、真实半透明解码与source/history/dirty、成功音效/目录/MRU、跨重开记忆与优先级、图层命名及保护写盘；preferred和remembered JPEG帧序列都明确拒绝，原多帧默认GIF不变。最终唯一正式exe SHA256 F028E1D830B81D5356EFAD2F4CB04A6E8D9720C891530697A800A0932E3224EE运行前后相同。来源coverage205/evidence verified/normal0，strict1继续INCOMPLETE。无独立截图QA/跨版本codec bytes等价/完整迁移声明，无外部工程、preview、数值箭头、提交推送或数据删除。证据native/build/jpeg-final-20261017.json。本批完成停止。


## 2026-10-17 JPEG frame sequences and stored palette columns

JPEG sequences reuse existing range/raster/snapshot/background worker, conflict preplanning and atomic per-file writing. JPEG dropdown/preference/kind2 format5 presets/memory and multi-dot jpg naming are enabled. Only whole success remembers base settings and last actual path once and plays sound once; partial cancel/failure retains earlier files without success metadata. Actual original worker12 off/common/individual scale150 raster cases pass; this captures pre-codec raster only and reuses prior actual Chrome JPEG codec evidence. No cross-codec compressed-byte equivalence claim.

Palette columns default8/validated1..256 now survive actual project open/recovery, current-metadata save and existing snapshots; automatic viewport layout remains independent. Manual layout/library and animation six-density/thumbnails remain deferred. Both focused core tests pass. Initial columns fixture identity mismatch/empty ID fixed to encoded manifest identity, without product identity changes. Official build/opened results recorded below when complete.

Official single-node app build0 (jpeg-frames-columns-app-build.log); opened --jpeg-frames-columns-check PID3976 exit0 after desktop.openWindow/finishLaunching with launcher-equivalent theme/cursors. Real background success, settings/preset/dropdown/naming, source history, metadata/sound success boundaries, early cancel and actual partial core writer plus deterministic UI terminal injection pass; no partial-async timing claim. Actual project open/recovery mapping and re-encode retain columns4 and holes. Exe SHA256 CE196768E581B93939089F590E9EF5D86C8826D9EDD4AED6B5BC5F0D24535BE1 unchanged before/after. Provenance207 normal0/evidence verified; strict1 INCOMPLETE separately from runtime. No screenshot QA/full migration claim, numeric arrows, branches/worktrees/external projects/preview/commit/push/data deletion. Evidence native/build/jpeg-frames-columns-final-20261017.json. This batch complete.


## 2026-10-17 WebP admitted animation/single-frame export

Actual legacy webp-animation.ts always exports ANIM/ANMF even for one frame, lossy quality0.92, exact milliseconds, full replacement flags2, loop infinite0/once1, VP8X0x12, only VP8/VP8L/ALPH image chunks. Native existing GIF preparation is extracted without changing frame/range/trim/scale/protection/layer/loop algorithms, and shared by WebP. Existing pinned Skia/libwebp codec with its distributed BSD licenses replaces OffscreenCanvas per-frame encoding; old RIFF mux is directly adapted, not replaced by Skia animated encoder. Legacy Source-Available terms cover internal development/test, no public binary distribution performed.

WebP format6 kind1 native memory/preset, preferred single-frame WebP and GIF/WebP dropdown switching, .webp naming/picker/atomic write, successful path/settings/sound once are admitted. Unremembered multiframe still defaults GIF regardless preferred WebP, matching old ExportDialogHost; explicit frames converts preferred/remembered GIF/WebP to PNG auto and disables WebP sequence. Existing valid single-layer target supported; existing animated selection/slices/groups/all-layer fallback gaps remain unimplemented. No claim all export targets complete. Color palette manual/library and animation density remain deferred.

Focused core first build/run0, actual SkCodec decode frame count/order/durations/alpha and one-frame no-loop/dimension limits passed. Existing GIF test0 and gif-basic exact output SHA256 0BFCE9B507CA7676CF59ECEAD7A226C90357D47F58C5842817BEB584C2A4D2D4 unchanged before/after shared preparation. Actual original encodeAnimatedWebp JS function remuxes native compressed frame payloads to identical output bytes for animation and single-frame; this proves container semantics only, not cross-codec compressed bytes or image fidelity. Artifacts webp-core-result.json, webp-container-legacy-oracle.cjs/json in native/build. Formal app/opened results follow.

Official single-node app first build0 (webp-app-build.log); opened --webp-export-check PID40596 first run0 after desktop.openWindow/finishLaunching with launcher-equivalent theme/cursors. Actual preference draft/cancel/apply/persist, GIF/WebP dropdown preserving draft, native preset/memory format6 kind1, picker cancel/real failed write/successful bytes and metadata/sound, source history/pixels/dirty, protected existing valid single-layer write and explicit-frame preferred/remembered WebP-to-PNG-auto boundaries pass. Canvas and existing valid single-layer flow only; animated selection/slices/groups/all-layer batch/deleted-layer fallback remain explicit gaps. No screenshot/device fidelity QA or claim all WebP targets complete. Official exe SHA256 7B19B9A9F468B1E9248013AE5EF8C7EFC2ABFBDED1E5FF403ED9BCED4F8AADCD before/after identical. Provenance210 normal0/evidence verified; strict1 remains INCOMPLETE, separate from actual runtime. Evidence native/build/webp-final-20261017.json. No numeric arrows, branches/worktrees/external projects/preview/commit/push/user-data deletion. This batch complete; stopped after minimum checks.


## 2026-10-17 GIF/WebP pixel-selection animation export

Actual service595-667/worker74-100 GIF/WebP selection uses selection rectangle only, intentionally ignores irregular mask. Shared prepare now starts with that base crop, intersects full-animation visible union when trimming (including frames outside requested export range), retains base on empty intersection, then runs old gif normalizeCrop origin/extent clamp. Existing animation ordering/range/direction/loop/protection/codec preserved, no extra Document copy or worker redesign. Actual dropdown enables present selection and excludes layer target; static/GIF/WebP transitions carry selection. Native preset4/memory3 trailing bool preserves older schema semantics and default false; absent remembered/preset selection falls back canvas per actual old dialog. Explicit frames clears animated target.

Actual original worker+prepare executed6 focused raster cases0 (rectangle, irregular mask ignored, specified range with full-animation trim union, empty intersection, negative/beyond canvas, 400% protection); core first build/run0. Existing GIF and WebP regression tests0. Artifacts native/build/animation-selection-legacy-oracle.cjs/json and animation-selection-core-result.json. Slices/groups/all-layer batch/deleted-layer fallback, palette manual/library and animation density remain deferred. Formal build/opened results follow.

Official single-node app first build0 (animation-selection-app-build.log); opened --animation-selection-export-check PID3588 first run0 after desktop.openWindow/finishLaunching using launcher-equivalent theme/cursors. Actual visible/enabled/modal target selection and layer exclusion, static/GIF/WebP carry-over, selected GIF and WebP real output files, preset4/memory3 selection persistence, old preset3/memory2 default false, missing selection canvas fallback, picker cancellation/actual failed write/success metadata and sound, explicit frames target clearing, unchanged source pixels/selection/history/revision/dirty all pass. Official exe SHA256 D3F30F4D4898B310A6FC6A717EA4A356F8F91C73B59A70551DC27EDCD82F8D44 identical before/after. Provenance211 normal0/evidence verified; strict1 remains INCOMPLETE separately from runtime. No screenshot/full target migration claim; remaining slices/groups/all-layer/deleted-layer fallback explicit. Evidence native/build/animation-selection-final-20261017.json. No arrows/branches/worktrees/external projects/preview/commit/push/user-data deletion. Batch complete; stopped.


## 2026-10-17 GIF/WebP all-layer batch and invalid-layer fallback

Actual service492-595 layer target with absent/invalid ID exports all legacy document.layers in bottom-to-top order. Native reverses timeline ordering, sanitizes base/layer stems, case-deduplicates -2 suffixes and uses layer-N empty-stem fallback, preplans all conflicts before encoding. Existing frame conflict algorithm is extracted to shared resolveExportDestinations without changing it. Existing bounded DocumentSnapshot/background task/per-file atomic writer/cancel/terminal success infrastructure is reused for layer tasks; no Document-per-layer copies or worker redesign. Complete success alone remembers base filename/settings, last actual file once, directory and sound once; partial cancel/failure retains earlier files without success metadata.

Actual all-layers dropdown, deleted-layer preset/memory fallback, native memory4/preset5 append allLayers bool with older versions readable. Explicit frame sequence clears target. Only GIF/WebP batch admitted; static batch options disabled explicitly, no silent canvas interpretation. Existing valid single-layer/selection remain. Windows case folding is a necessary native locale adaptation, not full Unicode JS locale equivalence.

Actual original legacy service planning all/invalid/valid-ID three cases0 (animation-layers-legacy-oracle.cjs/json). Focused batch core0 checks exact names/order, hidden/opacity, snapshot, GIF/WebP per-layer bytes, range/common trim/protection, preflight conflict cancel/renameall, real partial cancel/failure/source unchanged; shared JPEG frame sequence conflict regression0. Initial empty-name fixture failed because existing native rename retained old name; use legal .png whose sanitized stem is empty, no product rename change. Formal runtime results follow.

Official single-node app first build0 (animation-layers-app-build.log); opened --animation-layer-batch-check PID12236 first run0 after desktop.openWindow/finishLaunching with launcher-equivalent theme/cursors. Actual all-target/preset persistence/deleted-ID preset fallback, GIF/WebP real snapshot/background sequential files, busy controls, base memory/all-target and last actual MRU/sound once, snapshot cancellation, real background second-file write failure retaining first/skipping third and unchanged success metadata, explicit frames target clearing and unchanged source/history/active IDs passed. Formal exe SHA256 AE05D42522E0D9F8DEF2FF452D03415D7155247B2E3BD7161EEE43BDFB1C3FE0 before/after identical. Provenance214 normal0/evidence verified; strict1 INCOMPLETE separately from runtime. Static batch/slices/groups remain incomplete; no screenshot/full-migration claim. Evidence native/build/animation-layers-final-20261017.json. No numeric arrows/branches/worktrees/external projects/preview/commit/push/user-data deletion. Batch complete; stopped after minimum checks.

## 2026-10-17 six static-format all-layer batch and invalid-layer fallback

PNG RGBA/automatic, BMP, ICO, SVG and JPEG now reuse the existing layer batch planner, bounded snapshot, sequential atomic writer and terminal metadata path. Actual legacy service492-595 retains bottom-to-top ordering, name/conflict planning and absent/deleted ID fallback. Actual worker72-100 uses the current active frame for static output, original-document current-frame bounds for common trim and isolated visible bounds for individual trim; layer-export.ts keeps hidden layers hidden, with empty individual bounds retaining full canvas. Existing admitted encoders and SVG100 entry rule unchanged. Target persists across static/GIF/WebP format changes, native memory4/preset5 carries static allLayers, invalid static layer IDs normalize to all-target.

Focused static-layer-export-tests0 validates all six routes against direct encoder bytes without expanding codec internals, plus active frame, both trim scopes, transparent hidden fallback, snapshot source preservation and real partial cancellation. Existing animation-layer-export-tests0 guards the generalized writer. Formal build/opened results follow. Groups/slices and other formats remain incomplete.

Official single-node app first build0; opened --static-layer-batch-check PID10872 first run0 using launcher-equivalent theme/cursors. Actual static all-target control, cross-static/GIF/WebP target preservation, scale/trim preservation under existing SVG entry rule, static preset roundtrip/deleted-ID fallback, all six background output routes, busy controls, base filename/all-target memory reopen, last actual file MRU and sound once per complete batch passed. Early cancellation writes nothing; real background second-file failure keeps first/skips third with success metadata unchanged. Source pixels/history/revision/dirty/active frame/layer unchanged. Official exe SHA256 28DBB7BFE7E3E73584DCEB869F7C4CDE6C8DBC613B4195096D1B3E919AB8AF92 before/after identical. Provenance215 normal0/evidence verified, strict1 INCOMPLETE separately from runtime. Evidence native/build/static-layers-final-20261017.json. No branches/worktrees/external projects/preview/commit/push/user-data deletion. Batch complete; stopped after minimum checks.

## 2026-10-17 RGBA auto palette growth/shrink handle

Actual PalettePanel buildPaletteGrowthPreview46-70/move555/finish696/handle1087-1104 reused: existing original Ⅱ text control in native skin, existing ew-resize cursor retained under capture, left non-sampling press clears selection and focuses grid. Compact ordered color-ID view is now shared across rendering/hit/selection/reorder/paste/gradient; duplicate and transparent IDs are retained. Preview negative IDs show black without modifying the document, next-cell handle excluded from length, minimum1 and base+4096 cap, columns captured. Release to original document commits one existing paste(selectResult=false, compact source layout) or delete transaction; primary/background colors preserved. Escape/capture loss/Unknown-button window blur cancel without endpoint resampling. Optional viewSlots on existing Document APIs preserves defaults for non-view callers and retains old sparse slots in undo snapshot. Indexed ID0/minimum, manual/library remain incomplete.

Focused palette-growth-tests first build/run0 verifies downward growth/handle exclusion, shrink/minimum1/4096 clamp, compact append with holes, duplicate black unique IDs, transparent duplicate IDs, role preservation and grow/shrink single undo/redo transactions. Formal opened checks follow.

Official single-node app first build0; opened --palette-growth-check PID14356 first run0 includes actual original glyph handle press/capture, non-sampling/left-only guard, immutable black preview, compact holes projection with duplicate/transparent IDs, captured ew-resize outside panel, growth/shrink single transaction, undo/redo, minimum1, role preservation, Escape/Unknown-pointer-button-none/capture-loss cancellation, original-document identity guard and real WM_ACTIVATE inactive cancellation. Existing opened --palette-clipboard-check PID33268 first run0 guards compact paste seam. Formal exe SHA256 ECD731616FE40E5470DFF2336324546A594345D211C5346D54705E2847759C6C before/after identical. Provenance217 normal0/snapshots verified; strict1 INCOMPLETE separately from runtime. Evidence native/build/palette-growth-final-20261017.json. Indexed/manual/library remain incomplete; no screenshot/full migration claim. No branches/worktrees/external projects/preview/commit/push/user-data deletion. Unrelated running app PID22364 untouched. Batch complete; stopped after minimum relevant checks.

## 2026-10-17 RGBA manual palette layout

Manual mode admits the full fitted two-dimensional palette path: exact manual preference, preserve XY/holes/occupied-rightmost lower bound under resize, virtual blank cells and reverse/all-empty box selection without allocating height-only swatches, original skin horizontal/vertical scrolling for overflow, add current color at explicit virtual blank slot, rectangle V2 clipboard with null edge cells and fitted destination expansion, V1 bounded selection paste, drag clamped by full box including blank edges, and single slots+columns transactions with focus/box undo/redo restore. Existing auto compact/growth behavior remains separate by mode. New manual outline uses existing Skin material/draw/hit APIs, physical coordinates and clipped transparent center. Indexed/library/JSON management remains incomplete; no absent library migration claim.

Focused palette-layout-tests first build/run0 checks fitted XY/holes/occupied minimum, reverse and all-empty virtual boxes, slots+columns one transaction, undo/redo view restoration, V2 null rectangle roundtrip and project saved columns. Formal build/opened runtime results follow.

Official first build0; opened manual first run PID43152 failed one test assertion using total historySize after undo/replacement of redo branch. Verified actual Document historySize() returns history_.size(), pushEdit resizes to current position then pushes, so total size need not grow. Test assertion corrected to revision+1; all slots/columns/holes/destination box and subsequent undo/redo checks retained; no product change for this test failure. Necessary rebuild0; opened --palette-manual-check PID32712 passed. Actual reverse/all-empty virtual boxes, blank rectangle per-pixel rendered-alpha/material-hit equality, outward border/transparent center, height no extra buttons/no document mutation, width preserved stored XY/columns, virtual blank add exact XY with undo/redo, rectangle V2 copy/null edges/paste with undo destination geometry, full blank-edge outline drag with one transaction and undo/redo, and auto/manual projection/handle switching passed. Existing opened --palette-growth-check PID16096 passed including real window blur cancellation. Final exe SHA256 4620253639552B49DB4462C9863097B91C0081F75DF2A3A89242B09A032932AA before/after identical. Provenance219 normal0/evidence verified; strict1 INCOMPLETE separately from actual runtime. Final evidence native/build/palette-manual-final-20261017.json. Indexed/library remain out of scope; no screenshot/full migration claim. No branches/worktrees/external projects/preview/commit/push/user-data deletion. Stopped after minimum relevant checks.

## 2026-10-17 本地色板库 schema1/2

已接入内置/用户库列表、紧凑颜色预览、应用、刷新、打开目录、schema1/2 JSON 导入、另存新建/覆盖当前、用户库删除和内置隐藏；保存保留名称、列数及 null 空槽，原 PNG 导出继续使用。内置 JSON 原样复用 legacy/palettes；import/refresh 图标使用 legacy/src/renderer/src/components/PixelUtilityIcon.tsx 对应路径，经现有脚本转换。用户库在 native/palettes；不迁入旧版启动清理用户文件逻辑。

应用沿 workspace-palette.ts 逐个复用相同 RGBA 的不同 ID，保留隐藏条目/旧像素引用；名称/布局/选择一次撤销，重复应用稳定后无新历史。首次载入 row-major 保存的重复色可能按旧 entry 顺序交换 ID 和名称，属于旧算法的单次结构事务。保存失败保留模态及草稿，文件系统错误以原生路径/错误码显示。

验证分开报告：palette-library-tests exit0；正式程序 --palette-library-check PID12076 exit0；来源覆盖224文件 exit0，strict仍exit1 INCOMPLETE。正式 SHA256：4B3FFF2B9253018D078777F715587E4C204AAF41FB1E212376003B084617F6AD。证据 native/build/palette-library-opened-final-20261017.json。未声称截图验收或全部迁移完成；外部 ASE/ACO/GPL/JASC/PNG 等色板导入格式和 indexed remap 未接入，本次仅开放 schema1/2 .palette.json。

## 2026-10-17 外部色板格式与缩略图纯模块

实际接入通用/原生 JSON、GPL/TXT/HEX/CSV、ACT、PAL（先文本后ACT）、Adobe ASE/ACO；同一解析器用于选择文件导入与目录枚举，原子保存新schema2库文件后才应用。保留旧文本#整行跳过、UTF8替换、u16数字筛选、文件顺序与重复色、16列补空、ACT透明索引、ASE模型及ACO首组语义。目录采用稳定FNV外部ID，native副本优先；覆盖当前外部色板写native副本，保留外部原件。原生schema1导入按旧min(N,16)且不补尾，非整行多行v1保存失败也保留，不自行修订旧行为。PNG/JPG/JPEG/WebP/BMP/GIF/ICO图像色板仍未接入，不在picker开放。

两个只读Agent本批交付完整代码，由唯一writer串行实际落盘、接线、构建：ASE/ACO已接实际入口；Cel thumbnail仅新增moon-core纯CPU dense RGBA renderer，7组旧TS像素hash及非方canvas/offset/alpha检查通过。六档密度UI、linked-owner缓存及64任务/8ms队列仍未实现，不将底座当作完整动画功能。

最小验证：palette-import-tests / palette-adobe-import-tests / cel-thumbnail-tests均exit0，正式 --palette-import-check PID4656 exit0（取消、GPL成功、解析失败、ASE成功）；来源覆盖233文件exit0，strict仍exit1 INCOMPLETE。正式SHA256 E10FC88ACECEA8CBF455AD2F8ECA52983CBA5DA557AAD3EAF0AEB150B837D1C0。证据native/build/palette-import-final-20261017.json；未新增截图验收、全量库UI回归或发布产物。


## 2026-10-17 六档时间轴密度与图像色板导入

六档已接实际图层设置0..5即时滑块、偏好保存及整个图层面板Ctrl/Meta滚轮（Alt步长3）；行高、帧宽、表头、虚拟行池、滚动条/像素余量/Space拖动、loop位置与resize、选区轮廓和拖动目标一同联动。保留已验收compact12logical，默认2x的物理尺寸为row/frame/header：24/24/24、42/34/34、54/54/34、72/72/34、96/96/34、128/128/34；compact与旧28px有用户确认的适配差异。详细及以上复用旧CPU缩略图算法，原图标与选框皮肤沿用，不在paint生成缩略图。visible-slot绑定取消与generation检查、owner弱缓存8变体/软128KiB、64任务或8ms让出、native deferred fallback已接入；linked共享owner，mutableOwnedSurface/setPixel递增定向revision，live owner绕缓存；结构重建沿现内容缓存的保守全清边界，不声称所有结构操作性能与旧WeakMap完全相同。

图像色板现在实际开放PNG/JPG/JPEG/WebP/BMP/GIF/ICO，同bounded snapshot与原子新库保存再应用链；顺序去重RGBA、PNG旧8bit输出类型门槛、隐藏透明RGB、GIF首帧索引透明RGB与逻辑画布、ICO按bpp/area择页均有明确适配。复用现WIC/Skia替代Rust png/image；JPEG色度/CMYK数值和损坏文件容错可能不同，PNG完整CRC/IEND尾校验可能比旧next_frame更严格，已登记为已知兼容限制。不是所有损坏输入逐字节等价，也不代表indexed/sparse或全部重构完成。

实际验证：cel-thumbnail-pipeline-tests exit0（弱owner、FIFO/软预算、revision/bypass、64/8ms、取消/销毁/异常、真实linked/像素撤销/深拷贝身份）；palette-image-import-tests exit0（全部已开放图像容器有效样本、PNG边界/alpha、快照与共享导入布局）。正式唯一exe build0；--timeline-density-check PID32640 exit0，六档geometry/loop/drag/scroll/thumbnail及选框逐像素alpha/真实命中、Ctrl/Alt与设置滑块回调通过；--palette-import-check PID35324 exit0，新增实际PNG选择/保存/应用入口验证。生成六档运行渲染图并目检detailed图。正式SHA256 C228893AB2CA866498DBAC9F2B77464C22BF253AF4354D11607C9CBD2FBD26D1，前后相同；证据native/build/density-image-final-20261017.json。

文档检查另报：来源覆盖239文件exit0、snapshot校验通过；strict仍exit1 INCOMPLETE。保留先前失败fixture诊断文件，最终结果以带PID/hash的证据为准。不新建分支/工作树/preview、不提交发布、不删除用户数据；本批无正常用户窗口需关闭或恢复。既定检查通过后停止。


### 2026-10-17 Cel 属性与 HS 方块

已接单元格右键属性入口；打开时冻结选中目标，按实际 resolved source 分组并更新整个链接组。opacity 0–100%、Z -999–999；多次有效预览作为一个 metadata-only compound，回到初值仍保留旧版 compound。Close／Enter／Escape 均提交；内部 abort API 可取消。Escape 来源为 LayersPanel.tsx387–395 -> closeCelProperties -> useTimelineContextActions.tsx79–82/894；未增加默认快捷键。

帧 opacity 覆盖 layer opacity，切帧投影到图层控件，普通图层 opacity 修改／撤销写回当前源及活动 slot。正常合成、onion（active Z 排 layer blocks，neighbor opacity）、单层直传 guard、静态／动画导出、合并和工程／恢复编码共用该语义；Z order 缓存只校验metadata，不复制像素，默认全不透明仍走原行合成快速路径。

HS 沿现有像素布局和 marker，仅开放 SV／HS，标题菜单切换并保存全局偏好；未完成的色轮／法线／复合环／离散色阶仍为缺口。

源码／来源覆盖246文件通过，strict仍以INCOMPLETE失败；这与运行检查分开。正式构建 exit0；cel-properties、color-picker-scheme、layer-compositor三组定向检查 exit0，旧命令／resolver／normalize 实际源码oracle exit0。正式程序 `--cel-picker-check` PID37656 exit0（属性预览、linked单历史、Esc／Enter提交、撤销重做、HS像素oracle／双角色／capture／偏好）。证据 `build/cel-picker-final-20261017.json`，本批没有关闭或重启普通工程窗口，没有截图或长期手工验收。未宣称迁移全部完成。


### 2026-10-17 连续色轮、24 RGBA 混合与恢复正方形

调色盘标题菜单新增连续色轮，沿旧版极坐标输入、圆形命中、拖出圆外投影、HSV/V/alpha与双角色语义，复用现有native缓存和marker。标题恢复图标直接转换自旧paletteCenter；仅点击时改变栏目尺寸，保留停靠侧、顺序与分组。原生布局适配：单组固定主轴尺寸保存panels-v3（兼容读取v1/v2）；显式resize或换dock解除，底栏过矮时先满足native最小宽高。没有启动自动重排。

图层属性新增24种RGBA混合模式，共用名称/opacity现有baseline-final事务，支持预览、取消、撤销重做、锁定批选排除及无变化不入历史。混合公式与实际旧raster.ts的12480个RGBA输入逐字节一致；单层透明backdrop仍保留源色，normal行快速路径保留；合成、onion活动层、merge、静态/动画共用导出合成和工程IO承接模式，ghost仍按旧版normal。

运行检查：四组focused（layer-blend、color-picker-wheel、color-picker-scheme、panel-docking）exit0；blend含24模式双层composite/export/merge及工程往返。正式exe最终build0，`--wheel-blend-square-check` PID40416 exit0，逐像素SV/HS/wheel、角外拒绝、右键role、scheme保存、blend下拉撤销、default及四dock square/幂等/持久化、显式resize解除均过。SHA256 258910432EF47EE21E38509EEBFB8E7A95F8DBAF0761EE55F038243DCA1EF8EC，运行前后相同。链接前正常关闭精确正式exe PID19408（CloseMainWindow成功，无强杀），最终通过唯一start-native.bat恢复普通窗口PID38460；保留作品与恢复文件。没有截图或长期手工验收。

文档覆盖与运行结果分开：来源检查记录在build/wheel-blend-square-final-20261017.json；strict仍须INCOMPLETE失败。法线、复合环、离散色阶及其他已有迁移缺口未宣称完成。


### 2026-10-17 Continuous normal map, layer metadata and pixel grid

Normal-map picker now preserves legacy continuous hemisphere, raw pointer disk/projection, fixed RGB field, alpha/roles, HSV V strip and preference. Moon ring and quantized modes remain gaps. Layer optional RGBA and editable multiline description support preview, JS-trim commit, locked/batch metadata, compound undo, UTF16 budget and project/recovery persistence. User requested Aseprite display-color behavior: independent whole-name-cell source-over, no eye/lock/autolink/cel tint; selection remains last. Read-only Aseprite HEAD14fe117 timeline behavior only, no EULA code/assets copied. Native textarea is independent, using existing MIT clipboard/tooltip; unsupported layer eyedropper disabled. Pixel grid uses actual toggleGrid, per-document save/recovery/snapshot, dirty touch without undo, zoom>=8, clipped physical 1px and legacy RGBA preference. Custom grid remains incomplete.

Three focused tests exit0; actual legacy metadata oracle exit0. Official build0; --metadata-normal-grid-check PID43876 exit0 (multiline Enter, name-only color, tooltip/undo, all four picker pixels, normal input/alpha/preference, menu and zoom7/8 grid). SHA256 41C548FE1BDAA69FF1D45E60BCB491989D53139453B5E6118D5BD2BA8FAB5B3E unchanged across run. No ordinary app was closed/restored, no screenshot/long manual acceptance. Provenance reported separately, strict must remain INCOMPLETE. Evidence build/metadata-normal-grid-final-20261017.json.


### 2026-10-17 Moon ring and adjacent-frame crossfade

Moon ring now has HSV square/HSL triangle centers, original geometry/rotation, captured hue-or-center zone, role alpha, two markers, cached ring/triangle geometry and center preference. Native target-pixel sampling and binary triangle coverage differ from browser512 raster scaling/clip antialias; no browser pixel equivalence claimed. Quantized presets remain gaps.

Explicit adjacent-frame crossfade entry supports current/selected/all unlocked layers, original count/duration/easing/custom cubic, isolated step preview and once playback, generate/cancel, independent unlinked new frames after source, automatic forward infinite loop, selection, one delta undo and save/reopen. Morph is visibly unavailable; frame/loop/path tween remain gaps. Native curve uses four numeric controls. Dense128MiB generation and256MiB/10000frame document bounds fail before live mutation; candidate staging copies the value-model timeline once while history stores generated deltas.

Focused crossfade/moon-ring/scheme all exit0; actual legacy crossfade/easing oracle exit0. First official build found one UI member-name shadow, fixed; final official build55163 exit0. --moon-crossfade-check PID46668 exit0: dialog cancel unchanged, actual generation/one undo/redo, moon dual roles/corner capture/zone/prefs. SHA256 4935BAD644646761BC1C0F1DBD62A1D7D425E776148D6C72CFC3BFAE565994DF unchanged before/after. No ordinary user app closed/restored, no screenshot/long manual acceptance. Provenance separately reported, strict remains INCOMPLETE. Evidence build/moon-crossfade-final-20261017.json.


### 2026-10-17 Picker quantization and adjacent RGBA morph

All legacy hue/color-level presets now reach five picker schemes, both moon centers, value/alpha strips, pointer/wheel/keyboard, markers, cache keys and menu/preferences; changing settings preserves current roles/history. Existing native target-pixel/clip coverage adaptation remains, no browser raster equality claimed. Extracted exact legacy formula fixtures cover rounding/ties/cell boundaries/normal/triangle/outline. Alpha operation order now matches actual legacy percent/100 then *255.

Adjacent morph now uses original bounds/SDF/nearest-seed/color algorithm, interpolated shape/location, empty-endpoint current rejection and all/selected fallback. New dialog default restores morph and offers crossfade; frame/loop/path remain unavailable. One prepared source survives slider/playback/easing changes, scope/mode changes release it before rebuilding. Existing dense canvas/output limits remain explicit; shape budget follows old1Mi padded pixels/64MiB source. Preview/generate reuse existing isolated preview and atomic single-delta history/project chain.

Actual original morph TS oracle exit0; native morph/quantization/crossfade focused all0. Initial build69456 and final official build14674 both0; final includes single-source cache lifetime fix. --quantization-morph-check PID46492 exit0: cancel unchanged, default morph moving shape distinct from fade, one undo/redo, five-scheme quantized actual input/render/alpha/history and preference. SHA256 DC09837EEA959908A4428F585A97A1FEC83390DA3FBC7D3022D5EEDC2018A8EC unchanged across run. No ordinary user process closed/restored, no screenshot/long manual acceptance. Provenance separately reported, strict remains INCOMPLETE. Evidence build/quantization-morph-final-20261017.json.


### 2026-10-18 Custom grid and frame/loop transform foundation

Custom grid display/settings now use actual legacy defaults false/(0,0,16,16), integer truncation with dimensions >=1, logical zoom 4px density skipping and clipped physical 1px independent RGBA source-over axes. Native draft settings commit only on Done/Enter; Cancel/Escape/title/outside close leave source unchanged. Applying does not implicitly show the grid. Display menu and legacy Ctrl+quote toggle are wired; settings, showGrid and colors travel through project/recovery and bounded save snapshot without adding undo history. Existing pixel-grid behavior retained. Grid snapping, quick-command right-click entry and quick cell selection remain explicit gaps; this is the grid display/settings slice, not all grid interactions.

Frame/loop transform pure CPU foundation is implemented by the read-only animation agent and serially applied by the sole writer: playable source pose cycles, disabled filtering, reverse order, unlocked scope pivot, translation/rotation/scale/opacity, independent output Cels, preview/canvas bounds and bounded staging. It is not connected to Document or main UI. Old autoCrop=false retains out-of-canvas sparse Cels, while current editable Document/IO assumes full-canvas dense pixels. Frame/loop/path entries remain unavailable until this storage contract and atomic resize/history/save are migrated; no autoCrop-only approximation is exposed.

Focused pixel-grid (including custom grid metadata/snapshot/project) and animation-transform tests passed. Initial C++17 default-comparison and UI parameter-shadow build errors were corrected before final runtime checks. Final official build/opened/hash/provenance evidence is recorded in build/grid-transform-final-20261018.json. Source coverage is separate from runtime; strict must still fail INCOMPLETE. No screenshot or long manual acceptance, public release, branch/worktree, preview, commit/push or user-data deletion.

Final result: official single-node build session91114 exit0 after one transient LNK1104 retry; no ordinary app process was present to close. Final focused pixel-grid-tests and animation-transform-tests both exit0; opened --custom-grid-check PID17880 exit0 including actual Ctrl+quote. Official SHA256 136FDD35664D74668BE433727F4B1175898BAF2400BAAB1507C08B861D7EAA38 unchanged across run. Provenance276 normal0 / strict1 INCOMPLETE, snapshots verified. Evidence native/build/grid-transform-final-20261018.json. Stopped after minimum checks.


### 2026-10-18 Admitted RGBA grid snapping, quick grid-cell selection, raster addressing foundation

The actual global grid alignment menu/preference now reaches currently admitted native RGBA consumers: pencil/eraser brush-bound origins (including intrinsic image stamp geometry), Shift straight lines with constraint-before-snap, native line/rectangle/ellipse shapes, bucket seed and gradient pointer geometry, angle-zero rectangular/elliptic marquees snapped outward to full cells, selection box/content movement and existing CtrlT layer-floating union movement. Grid visibility remains required; movement captures the alignment flag and uses the old union-top-left Math.round rule without a threshold. Preview brush damage/pixels and modifier-key shape updates share the same snap results. Existing cancel/one-edit undo chains remain. Legacy independent move-layer, iso/tile and other unadmitted tools are not opened; no whole legacy alignment migration claim.

Quick rectangular selection now uses custom-grid origins/dimensions when visible and actual checkerboard size when hidden, clipping each cell independently before union; a clipped edge cell never becomes the grid period. Outside-canvas moves preserve the last valid range. Logical 6px/500ms second-press boundaries and actual Windows LAF kDoubleClickMessage (which replaces second Down) precede transform/pivot capture; native mouse Down synthesis starts the second drag, real Up commits once. Cancel preserves baseline selection; source pixels and dirty state remain unchanged. Native pointer identity0 is a mouse adaptation, not multi-pen/touch equivalence.

Raster addressing/expansion foundation adapts actual document-model.ts expandLayerToRect and history.test.ts dense expansion fixture: separate world/local/stable-storage coordinates, blank1x1 alpha-zero placeholder rule, hidden transparent RGB preservation for other stored regions, detached candidate and preallocation bounds. Production compositor row start uses safe worldIndex and preserves existing contiguous row kernels/admission. This does not migrate sparse editing, storage-aware Document history or project import, and frame/loop/path tween UI remains unavailable. No live owner is expanded by this batch.

Sources and functional checks are reported separately. Focused grid-snap/raster-geometry and existing layer-compositor tests passed; official/opened final results follow in native/build/grid-snap-quick-final-20261018.json. Provenance281 coverage0 with snapshots verified; strict1 remains INCOMPLETE. No screenshot/long manual acceptance, branch/worktree/preview, public release, commit/push or user-data deletion.

Final result: official single-node build session49400 exit0; grid-snap-tests, raster-geometry-tests and layer-compositor-tests each exit0. Opened --grid-snap-quick-check PID38712 exit0, including actual snapped bucket seed and floating-content movement/cancel. Official SHA256 EB19F15EF8346D1B213BF7826962A0D30C769C0497EC276193105B2EE6AB9316 unchanged across run. Evidence native/build/grid-snap-quick-final-20261018.json. Stopped after minimum checks.

### 2026-10-18 Production brush owner expansion and stable pixel history

Existing pencil/eraser entry now ensures its resolved owner covers the canvas before starting a stroke, using detached bounded expansion without cropping outside pixels. Solid/image brush, symmetry/line traversal, preview, cancel and commit retain canvas-index gesture state and map only storage accesses. Dense full-canvas strokes retain direct indexing. Linked Cels keep their original source and link IDs. Successful cancel/no-op commit retains enlarged geometry, matching legacy pixel-history revert; preparation and initial-stamp failure restore pixels and original geometry before propagating the error. Native peak live-plus-candidate pixel allocation remains bounded to 256MiB.

Production pixel edits capture the owner's width, height and stable storage origin. Undo/redo replay point/run/dense captures across later expansions; same-geometry history retains contiguous run fill and row copy kernels. Existing palette synchronization records owner-local addresses before applying its stored-pixel replacement. Rendering uses world offsets independently of stable history origins. Focused Document fixtures inject otherwise unadmitted sparse geometry solely to exercise these real production entries, outside hidden RGB retention, linked owners, cancellation and old dense-history expansion inputs.

This completes the brush/history slice only. General sparse Document editing and import/save admissions remain unchanged; fill, selection, floating, other edit consumers and IO still require their full storage-contract migration. Frame/loop/path tween UI remains unavailable. Source coverage and focused/opened runtime results are reported separately; final evidence will follow in native/build/raster-history-view-final-20261018.json.

The existing advancedMode menu/CtrlF now follows legacy useAppViewMode's three session states: normal, tool options with expanded canvas, canvas only, then normal. All hidden chrome widgets and raw geometry hit paths (including Desktop dispatch) follow the actual canvas viewport; tool attributes move to the top in the first state. Returning restores ordinary panel geometry/visibility preferences; home/no-document resets the mode. The original 1700ms notice uses existing native skin/Fusion text and does not intercept input. This is native layout/visibility adaptation of the old CSS behavior; no new zoom menu/default shortcuts or document/history changes.

Final result: single-node official build38416 exit0; final core build51691 and document-raster-history-tests/moon-core-tests/layer-compositor-tests each exit0. Opened --advanced-mode-check PID10748 exit0, including three real states, repeated shortcut, Desktop hidden chrome gates, coordinate/layout restoration and home reset. Verification corrected a repeat-fixture constructor argument and a real home visibility snapshot ordering bug. Official SHA256 38329E4CF824B52AA2BF067ED96BB59F3B07C96C806054DCC7614E17CA9DAA3A unchanged across run. Provenance283 normal0 / strict1 INCOMPLETE; snapshots verified. Evidence native/build/raster-history-view-final-20261018.json. No screenshot/long manual acceptance or public release. Stopped after minimum checks.


### 2026-10-18 Sparse solid/pattern fill and Paste as New Document

Production solid and pattern fills now stage canvas-addressed pixels while retaining resolved owner geometry, outside-canvas pixels and stable history addresses. Legacy seed-outside expansion (including no-op geometry retention), alpha-zero 1x1 placeholder handling, four-connected escape detection, cropped compact solid smart closure, visible-layer owner limits and symmetry seed sequence drive the geometry decision. Staged visible composites preview every linked instance of the same owner. One detached owner install and one compound history entry preserve undo/redo across sparse expansion; allocation/validation failure does not install candidate geometry. Dense fill keeps its original direct storage/run kernels. The 500x767 cropped owner fixture comes from workspace-fill-history.test.ts. This slice does not admit sparse project import/save, gradients, filters, selection or floating-content consumers; their existing explicit admission gates remain in place.

The existing Paste as New Document menu now validates a candidate before settling the previous session. It uses legacy mask===1, preserves alpha-zero hidden RGB, ignores clipboard origin, creates the default two-color RGBA document with dirty state and empty history, and opens a new project tab. A visible system image takes priority; missing/transparent/read-error image falls back to internal pixels. Native unsupported formats or dimensions above 1024 explicitly reject. The injected-source opened check invokes the actual menu including home and failed reads/malformed input during an active stroke, without changing the real system clipboard. The read-only legacy method-body oracle passed mixed mask, undefined mask and empty clipboard fixtures; native runtime evidence is reported separately below.


Final result: official single-node build98953 exit0; document-raster-history-tests, clipboard-document-tests, pattern-fill-tests, moon-core-tests and layer-compositor-tests each exit0. The new compositor fixture initially used an unsupported cross-layer link and was corrected to a legal same-layer cross-frame owner, then rebuilt and passed without a production-code change. Opened --paste-new-document-check PID41364 exit0 and existing --grid-snap-quick-check PID14436 exit0 (actual bucket pointer included). Official SHA256 76697D8CD6E89DE15AE330B896A95CD0705F5C5BA5A2BBA202626D74D6B799E7 remained unchanged across opened checks. Provenance285 normal0 / strict1 INCOMPLETE; source coverage does not establish general behavior equivalence. Evidence native/build/sparse-fill-clipboard-final-20261018.json. No screenshot/extended manual acceptance or public release. Stopped after focused checks.


### 2026-10-18 Sparse gradient chain and existing About menu

Sparse gradient begin/update use a canvas baseline and preview without changing live owner geometry. Commit follows gradient.ts region intersection with the paint selection bounds, preserves outside owner pixels and linked source identity, installs one detached candidate and stores stable pixel-history addresses. The original dense GradientSampler and shape shared commit branch remain in place. Transparent source uses source-over; the legacy 1x1 alpha-zero placeholder no-op exception restores geometry while clearing packed hidden RGB/resetting origin. A full traversal domain bypasses the native wand's empty-alpha shortcut only for the new sparse consumer when packed hidden RGB forms a barrier; user selection still clips painting only. CanvasRenderer direct upload now requires full-canvas owner geometry or an actual canvas preview, so cancel returns to offset-aware compositing. Native live/preview/reference/row/candidate/dense-history pixel allocations are budgeted before installation. Sparse IO and other consumer admissions remain unchanged.

The existing About command now opens a native PixelDialog using existing Fusion10px/2x skin, identical home logo, real authors/license/URL, and exact converted legacy lucide-react 1.26.0 icon nodes with upstream LICENSE retained. It displays Native - Development separately from the legacy 1.0.0-beta9 baseline, without changing a product version or release metadata. Repository launch occurs only on click and preserves launch failures; Done/header/Escape/outside dismissal follow the old entry. Native about-v2 geometry storage adapts the old ModalShell storage key. The opened smoke injects repository launch results and bypasses user layout storage, including original document/active gesture preservation and home availability.

Source coverage287 normal0 / strict1 INCOMPLETE is separate from runtime verification. Initial official build83982 reached compiled moon-core but failed main.obj C1083 Permission denied because another chat/start-native build concurrently wrote the same official output. No process was terminated and no cache/data was deleted. Sequential rebuild is pending exclusive compiler availability; final runtime results follow below when actually completed.


Final result: current main.cpp and canvas_renderer.cpp were forced to recompile after external compiler contention ended, preserving source content. Focused build38298 exit0; document-raster-history-tests and moon-core-tests each exit0. About focus handling now exempts only the active About popup target (including LAF queued-null/current-focus transition); real OS focus loss with no current focus and other modal cancellation remain unchanged. Final official build28806 exit0; --gradient-shape-check PID26964 exit0 and --about-check PID37248 exit0, including active stroke preservation and injected repository failure without browser launch. Official SHA256 B3CD11E1644AE99C6913AB865B8738F7A05FA7CD0230BEA35B4BBA161860E3D4 unchanged across final checks. Final source hashes/evidence: native/build/gradient-about-final-20261018.json. Provenance287 normal0 / strict1 INCOMPLETE.

Known unresolved check: existing --palette-gradient-check PID37168 exit1 at “Palette gradient box includes empty slots”, before the gradient section. Original check and failure artifact remain; this batch did not change palette behavior or claim a full regression pass. The independent gradient/shape check directly reuses its existing production pointer assertions. App PID7576 was closed normally for linking with no forced termination/discard, then restored once through native/start-native.bat as PID30584. No screenshot/extended manual acceptance or public release. Stopped after scoped checks.


### 2026-10-18 Sparse Cel clipboard, immediate transform and deselect restoration

Matching-canvas RGBA Cel clipboard retains complete sparse owner geometry/stable origins and linked groups, samples masked copy/cut in world coordinates, stages owner handoff/history and restores failed selection-Cel previews. Sparse whole flip uses owner-local storage; selection flip/rotate use actual legacy capture/clamp contracts, and first nudge plans its destination before publishing. Existing dense paths remain. Floating deselect now follows the real two-entry legacy lifecycle; undo retains original clipboard payload, and unchanged restored confirm/cancel/undo never stamp pixels twice. Earlier conflicting native deselect assertions are corrected with exact pixels/history/selection assertions.

Scope and concrete sources: native/docs/clipboard-floating-migration-20261018.md and legacy-provenance.json. Mismatched-canvas clipboard, external sparse IO, deferred overlay/outside destination commit and owner-offset optimization remain INCOMPLETE; prior unrelated project-save duration failure is not repaired here. Final scoped verification follows after completion; no branch/worktree/preview, commit/push or user data deletion.

Final result: official single-node build4805 exit0; document-raster-history-tests and cel-selection-clipboard-tests each exit0. Existing opened --playback-floating-check PID34632 exit0. Official executable SHA256 E8C44A02FB31A5EB151FBF2144E8198F61D101920D129A67594079A33F8CBD14 unchanged across runtime. Provenance311 coverage0 / strict1 INCOMPLETE, evidence snapshots verified. Evidence native/build/sparse-cel-deselect-final-20261018.json. No screenshot/extended UI acceptance; prior unrelated project-save duration failure remains outside this batch. Stopped after scoped checks.


### 2026-10-19 当前补间集成状态

当前帧与循环节参数工作流、稀疏 IO 的既有验收记录见 `clipboard-floating-migration-20261018.md` 末尾及 `build/frame-transform-final-20261019.json`。本批接入独立缓动曲线草稿窗、Editor 临时终点显示和拖动、相邻形变/交叉淡化自动裁切；已补纯候选/单事务/保存重开和实际弹窗回归，正式产物构建、四个相关测试及实际opened验证均通过，详见 `build/tween-closure-final-20261019.json`。路径补间仍未迁移；文档覆盖不代表行为等价。


### 2026-10-19 路径补间当前状态

普通RGBA frame/loop绘制路径已迁移并通过最少定向验收：私有路径编辑/局部history/anchor/view、命名相对路径库、父参数取消/应用与模式记忆、原transform单事务/裁切/undo、生成工程实际保存重开。当前路径配置按legacy只保留于本次弹窗；仅命名库保存设置，不新增schema21字段。正式构建、四相关tests与actual opened均exit0。详见 `clipboard-floating-migration-20261018.md` 末尾及 `build/path-tween-final-20261019.json`。provenance317 coverage通过，strict仍INCOMPLETE，未宣称全部legacy行为等价。


## 2026-10-19 Canvas Resize 与 Ctrl+B 临时捕获闭合

本批承接此前稀疏 IO 阻塞的普通 RGBA CanvasResize。来源为 legacy CanvasResizeDialog.tsx、canvas-input-bounds.ts、canvas-render-guides.ts、core/document-model.ts、animation.ts、canvas-resize-resources.ts 与 workspace-commands-document-io.ts。真实菜单和 C 入口已接原生 PixelDialog：初始 center、锁比例、不同步四边、trimOutside=true；公开 Document API 默认 trimOutside=false。九点锚点、宽高、四边、同步、表达式、局部撤销重做、实时蓝线/checker/遮罩、外部边缘与内部移动手势、取消/确认保留旧语义。复用原始 PixelUtilityIcon 九点素材，无重绘。预览按 legacy 保持已提交合成不变，新扩区域只显示棋盘。

Document::resizeCanvas 复用既有 ownerOffsets/surfaceChanges/dimensions 历史管线，canonical owner 每个只处理一次，retain 不复制像素，trim 才裁局部 storage 并累加 storageOrigin；未裁 hiddenRGB、links/shared、帧/loop IDs、disabled 和图层元数据保留。selection/pivot 与尺寸同一次 undo/redo。cropCanvasRegion 改为真实 resize(trim=true) 薄包装，承接 sparse crop，满画布裁切仍记历史；trim 满画布 noop 保留。沿用 1..1024 和 256MiB admission，不扩特殊层/色彩模式。先提交 floating 是独立动作，其后 resize 失败不回滚已提交 floating，不能宣称整个调用全回滚。

Ctrl+B 无 selection 现在沿 legacy begin/finishTemporaryBrushCapture 和 canvas-input-selection 的 marquee 结束分支捕获内存笔刷，复用实际矩形选择手势，无新增捕获算法，不保存本地库，不写 selection/document history。成功返回 pencil，Esc 恢复既有 pencil profile/selection options；空白和超限失败保留草稿与文档；切工具取消恢复选项。会话切换保留所属项目临时状态。已有 selection 的菜单保存库行为保留。

验证：canvas-resize-tests 与 document-raster-history-tests exit0；前者包含 retain/trim 的真实磁盘保存重开、hiddenRGB、canonical/shared、边界/预算、稀疏 crop、selection/pivot 和撤销重做。正式单序列 Release build exit0；实际 opened --canvas-resize-check PID41524 exit0，覆盖 Ctrl+B 真实键鼠捕获与失败/Esc/切工具、CanvasResize 实际弹窗字段/默认/9anchors/local undo/Cancel/Apply 和文档 undo/redo。查看 canvas-resize-smoke.bmp 默认弹窗未见重叠；本次未新增外部边缘拖动全部物理场景验收。provenance320覆盖通过，strict仍exit1/INCOMPLETE。最终 EXE SHA256 D43CFE3E37648A49B7A4F3021778763D2FED2EF84843B2346B08FCD6BDE2AAD8。完整日志与失败修复记录见 build/canvas-resize-final-20261019.json。本批未关闭普通运行程序，不额外启动新实例。


## 2026-10-19 六种普通 RGBA 滤镜闭合

承接 legacy filter-presets.ts、workspace-commands-layer-adjustment.ts、workspace-filter-preview.ts 和 FilterDialog.tsx 的六项：三种 CRT、VHS 色彩偏移、暗角、荧光绿辉光。真实 filter: 菜单接共用 PixelDialog，默认实时预览、40ms 防抖、每项独立 opacity、说明与取消/应用。六纹理像素、名称、blend、默认 opacity 沿用旧版；全部帧新增同一普通顶层覆盖，原图层锁/像素选区不约束新覆盖。可见覆盖按旧 connectAnimationCels 链接首帧；透明 tiny 覆盖各帧独立完整空 surface，不强连。无 LCD、indexed 或特殊层扩项。

原生必要适配：displayTimeline 独立预览，单可取消 worker 串行处理最新参数，identity/revision/contentRevision/generation 共同校验；取消/关闭丢弃预览，确认才复用 detachedLayer/detachedCels 单 delta 历史。原始稀疏负偏移、hiddenRGB、storageOrigin、冗余 alias、帧/loop 元数据、选区/当前帧保留。快照/恢复拒绝 active 预览，取消后采 committed timeline。保持既有 1..1024/256 layer/256MiB admission，未增加 project 字段。许可复核 legacy/LICENSE Source-Available1.0 §2b/c，仅本地修改构建测试。

自动检查：filter-presets-tests、document-raster-history-tests、editor-recovery-tests exit0；包含六纹理独立像素预期、切换/取消/失效任务、单历史 undo/redo、锁定源/选区保留、真实工程保存重开、透明空覆盖重开及真实 RecoverySession 预览跳过/取消后保存。边界203 sources通过；provenance323覆盖通过，strict exit1，整体迁移仍INCOMPLETE。

正式 Release build exit0，实际 opened --filter-presets-check PID39184 exit0。查看 build/Release/filter-presets-smoke.bmp，默认两列选项、说明、opacity、live/取消/应用未见重叠，画布显示预览而提交时间轴仍原层；取消/确认/undo/redo实际运行通过。未验收所有尺寸/DPI组合。首次 PID40116 exit1 抓到 menu漏 filter: 前缀，已修复后重建通过；原错误文件保留，其mtime早于最终通过。本批未关闭普通程序、不额外启动普通实例。最终 SHA256 F28D620F7DADF5B2BB4418533D1B0C5C07B50014312B1FC0A89AC42A511ACB7F；证据 build/filter-presets-final-20261019.json。


## 2026-10-19 LCD 依赖的普通图层组内部基础（未开放 LCD/组编辑）

核对真实 legacy LCD 后确认它会隐藏单个源层，建立真实组及 Scanlines/Blue/Green/Red 四个子层并选择组；不能用四个平铺层声称迁移完成。该入口实际来自共享 FilterDialog 的 lcd 选择，历史 LcdScreenDialog 不是当前唯一入口。本批调整为内部组基础阶段：LCD 入口继续禁用，完整普通组编辑同样未开放。无新用户界面、无图标重画。

内部 State 追加 Group 与 Layer.groupId，保留 parent/name/visible/locked/opacity/blend/panelOrder/displayColor/description；校验空/重复/层组冲突ID、坏引用、自父/循环和非有限/非法元数据。祖先visible/locked提供纯helper，尚未宣称所有编辑写入路径已支持组锁。合成依据 legacy document-composite-plan/sampling：normal1组传递真实backdrop，其他opacity/blend先隔离整组后仅应用一次，cel Z只在真兄弟内排序；既有稀疏/link/预览/onion叶渲染复用。原生128行tile限制临时隔离buffer；新增tile边界回归属于技术适配，不替代全legacy等价验收。五个单层直出fastpath对非空groups绕回正确合成。

纯 layer_panel_tree 模型承接 legacy 嵌套/空组/持久anchor/折叠及显式layer/group多选/范围选择；State适配反转native top-first输入，group.panelOrder保留legacy坐标。未接Editor面板和创建/删除/移动/属性/history操作，mask rows仍缺，不称为可用组UI。

编解码能够读取并保留普通组DTO，以及验证内部普通工程/恢复编码真实落盘读回；RasterSnapshot保留并比对groups/groupId。外部 prepareEditableImport 对组仍显式拒绝；正式save沿同一preflight门控原子拒绝，测试确认不覆盖旧目标、不改变dirty/history/revision。内部编码验证不等于组工程可编辑，未向RecoverySession加入无可达状态的用户提示/静默删数据。effects/masks/adjustment/cumulativeBlend保持Unsupported，不被静默接受。

验证：layer-panel-tree-tests、layer-group-compositor-tests、layer-group-io-tests及无组layer-compositor/raster-snapshot/document-snapshot/filter-presets四回归均实际exit0；来源覆盖328文件通过，strict exit1仍INCOMPLETE；依赖边界205 sources通过。正式单序列Release build exit0，既有 --filter-presets-check 实际opened PID38384 exit0，并断言lcdScreen仍未绑定。没有新增组/LCD视觉验收或可用性声明。首次两项fixture错误已定点修正：tree花括号重载歧义显式vector；IO构造遵守fromImported非空archive契约，未放宽生产入口。

legacy/LICENSE Source-Available1.0 §2b/c 许可复核仅本地修改构建测试。本批未关闭普通程序、不另开普通实例。最终程序SHA256 9E7E56E75F154024E7C0D66966AC4039575F60251A44B480A6692F90E18B7656，完整证据 build/group-foundation-final-20261019.json。后续须补完整组编辑/历史/面板及LCD事务再开放入口，本条不能视为LCD迁移完成。

### 2026-10-19 普通组内部编辑基础补充

Document 内部组 metadata history、独立组选中/惰性后代解析、创建/取消组、可见/锁定状态已补；原像素 owner/链接与存储不克隆。祖先状态进入光栅工具与部分像素目标，补间临时预览保留组结构。四项最少相关测试均实际通过，来源330覆盖及206 sources边界检查通过，strict仍INCOMPLETE。

组面板 virtual cel/拖动与普通层/组命令整体兼容未闭合，外部组工程编辑/正式保存门禁保持；本批不开放 UI/LCD。后续必须按 legacy targets helper 逐命令落实，不能把惰性 resolver 加入接口视作所有调用者已完成迁移。本批范围及最终构建证据见 clipboard-floating-migration-20261018.md 和 build/group-internal-edit-final-20261019.json。

### 2026-10-19 普通组结构和纯行身份模型

本批内部delete/copy/mixed tree move/add/flag sweep、惰性多目标和必要稀疏填充修正已落并通过focused/no-group六项实际回归。新增TimelineRows仅纯model+fixture，不接Editor；02~13 UI草案不算交付。组merge/clipboard/properties及真实行交互尚未闭合，外部可编辑IO与用户组入口继续关闭，LCD不扩。来源332覆盖及207 sources边界通过，strict仍INCOMPLETE。下一批精确UI纠正见 build/group-ui-deferred-handoff-20261019.md，最终构建记录见 build/group-structure-final-20261019.json。

本批收尾仅核验既有正式产物，未重跑六项测试、未重建或修改实现。原 integrator 的 build session92521 在接手工具域返回 Unknown process id，构建退出码暂记 null，不以产物存在推断 exit0。正式 EXE 更新时间 UTC2026-10-19T13:22:27.2816370Z，SHA256 980245E1DC805708571111C983CD3D98C0F35C4DE33797153F5EDEC2B8882CC1。按 start-native.bat 同一 theme/cursors 参数仅运行一次真实窗口 --filter-presets-check，PID3088 exit0；新截图 UTC13:56:02，历史错误文件 UTC11:01 未改变。该运行仅回归既有六滤镜并断言 LCD 未绑定，不是组 UI 验收；未新增图像审查结论。六项 exit0 来自原 integrator 的实际运行报告，未冒用10月18日旧 LastTest.log。来源覆盖332/exit0、strict exit1/INCOMPLETE 和207 sources/exit0来自本批已有检查，不重跑。完整证据见 build/group-structure-final-20261019.json；组 UI/外部组可编辑 IO/LCD 门禁继续保留。本次未启动普通应用窗口、提交或删除用户数据。

### 2026-10-20 Ordinary group editing and visible timeline rows

普通RGBA组接入真实时间轴行、折叠/嵌套缩进、独立组/图层选择、虚拟帧格及混合真实Cel拖动。显示行以稳定ID/kind查询，虚拟组格不创建Cel/像素或缩略图。真实拖动保持raw layer delta钳制，虚拟装饰单独映射；取消恢复组/真实Cel/帧/anchor/活动上下文。选择继续使用Skin物理像素素材边界/绘制/命中。组区域按用户指定Aseprite视觉配色独立实现，保留Moon背景/10px字体与2x；folder仅由legacy对应路径无损转换，素材在原sheet追加可替换区域。

组属性沿现有层属性窗口预览/取消/trim/单历史事务接入name、opacity、blend、displayColor、description；锁组metadata仍可改，视觉值遵循继承锁。组merge保留外层opacity/blend，子树先独立合成；普通层merge保共同parent与继承锁，merge-visible仅删除实际可见叶并保留隐藏祖先子树。layer clipboard完整独立RGBA帧快照、按帧序补齐、跨工程树粘贴与一次结构undo；Copy/Cut依像素选区→真实Cel→帧→图层/组调度，虚拟组格不会回退活动子层像素。普通组DTO接入外部editable open和正式save；effects/masks/cumulativeBlend、layer linkedContentId及其他特殊类型继续Unsupported，LCD仍未接入。

首正式build与三个focused tests及新opened --group-timeline-check实际exit0；检查覆盖真实菜单创建、virtual-only/mixed cancel、逐alpha选择边框命中、属性、clipboard paste、实际保存重开和组merge undo/redo，并生成build/Release/timeline-group-open.bmp。最终构建追加既有duplicate选中数组top-first修正、clipboard互斥/virtual清理和真实cut+undo检查；最终验证与程序hash见本节后续记录及build/group-ui-final-20261020.json。源码/文档覆盖不代表完整legacy行为等价，strict仍INCOMPLETE。

最终结果：正式单序列 /m:1 /nodeReuse:false build session62589 exit0；layer-merge-tests、document-layer-groups-tests、layer-metadata-tests、layer-group-io-tests、cel-selection-clipboard-tests五项实际exit0（末项在最终编译退出后重跑）。既有duplicateVisualSourceCheck揭示上批副本选择数组重复反转，按legacy bottom-first与native top-first差异定点修为top-first，未改像素与活动副本语义。最终正式exe --group-timeline-check PID39668 exit0，包含新增真实cut/undo；相关无组 --timeline-selection-keyboard-check PID20240 exit0。opened前后SHA256均A47B2DA51924FD09C26F695D7AE5DE42981272A8DFD39A2D9137BC89C2C0FC22。实际截图build/Release/timeline-group-open.png已检查父组名称整格色、嵌套折叠行、原图标与白色外选择轮廓；这不是所有手势/显示器状态的全面人工验收。来源332覆盖/快照验证exit0、strict1/INCOMPLETE、边界207 sources exit0另行记录。完整证据build/group-ui-final-20261020.json。普通组入口/open/save现已接通；特殊层/effects/masks/cumulativeBlend/linkedContent与LCD仍未开放。未关闭或另开普通实例，无分支/工作树/preview/提交推送或删除用户数据；达到本批最少相关验证后停止。


### 2026-10-24 魔术橡皮 / 混合工程像素剪贴板 / 渐变色标颜色编辑器

魔术橡皮按legacy独立continuity与共享wand参数、普通层/蒙版自身采样、按下preview/松开单history及取消迁移。tilemap渲染缓存Copy→混合工程普通RGBA floating Paste接通，保留Cut/瓦片目标/源变换门禁。渐变选中色标接既有五模式ColorEditorPopup，父子生命周期与切色标关闭闭合；nested canvas采样/double-click仍缺。来源与适配详见magic-eraser-pixel-clipboard-gradient-color-20261024.md。

正式串行build60652/final89139 exit0；三core tests与actual UI PID8484 exit0，来源483覆盖通过/strict1 INCOMPLETE，diff check通过。初UI测试点误命中缩放手柄，修fixture内容中心后通过，生产命中不变。唯一BAT重开正式PID36540响应正常。未截图/全DPI人工验收，无分支/工作树/preview/commit/push或用户数据删除；本批最少验收后停止。


### 2026-10-26 工程保存与重开修正

主 Agent 单写入完成。修复导入旧工程后关闭图层自动链接、保存重开却重新开启的问题：`project_encode.cpp` 按 legacy `project-format-encode.ts` 的条件字段规则移除旧 true，已有 Cel 链接保持。可编辑工程与恢复编码、Undo/Redo 的重新编码均有针对性回归。

原保存检查栈溢出源于 Windows 测试 main 的 0xF3F20 字节栈帧，现按独立用例拆成函数，无扩大栈或减少断言；两处历史断言改用当前位置，分组时长先明确选中活动帧，新增帧清空选择后显式重选删除范围。测试临时数据仅使用测试工作目录。

实际结果：正式 Release 同一产物构建 exit0；project-save（含普通工程、多图层、关联帧与失败保护）、raster-resource、project-rollback 三项 exit0；正式 exe `--sparse-project-io-check` exit0，覆盖实际异步保存、打开和恢复。未作截图或全量界面验收，不能视为全部迁移完成。本批未提交、推送或发布。


### 2026-10-27 蒙版绑定移动入口与链接语义

- 按 Legacy `LayerMenuCommands.tsx` 接通顶部图层菜单“开启绑定移动／停用绑定移动”；仅单一图层或组且当前帧存在蒙版时可用，蒙版行及多选不作为属性目标。
- 顶部入口、蒙版右键和折叠时间轴的链接按钮共用操作；链接蒙版修改解析后的共享蒙版属性，保留可撤销的一条历史，不受像素编辑锁误拦截。
- 修正拖动时读取链接槽自身属性导致关闭绑定仍移动的问题；开关、撤销、重做及取消以现有蒙版事务承接。
- 已核对保存限制：Legacy `project-format-encode.ts` 的 `encodeMask` 没有保存 `moveWithOwner`，现有原生格式也未保存；重开默认开启。这与需求中状态承接目标存在差异，登记为待裁定项，本批没有擅自扩展格式或宣称保存状态已完成。
- 检查范围：attached-masks-tests 与正式程序 --attached-masks-check；执行结果以本次交付说明为准。其他蒙版菜单缺口不在此记录中宣称完成。

- 本批实际验证：Release `attached-masks-tests` 通过；正式 `moonsprite-native.exe --attached-masks-check` 退出码 0，覆盖图层及组菜单调用；来源检查 508 文件通过。未做截图验收或全量性能测试。


### 2026-10-27 顶部图层蒙版创建与组蒙版开关

- 按 `workspace-commands-layer-mask.ts/createLayerMasksForLayer` 补齐整层批量创建：遍历所有有内容的帧（解析链接 Cel），跳过已有蒙版与空帧；调整图层针对全部帧。既有蒙版的像素与标识保留，新增蒙版相互独立，一次撤销整个操作。
- 顶部图层菜单和图层行右键共用创建命令。单元格右键仍保留只操作当前帧的既有语义。组蒙版按当前帧显示“创建图层组蒙版／删除图层组蒙版”；多目标、蒙版行和无可创建目标不能误执行。
- 重做新建蒙版时恢复新建蒙版编辑目标；遵循 Legacy 创建后的非隔离编辑模式。锁定图层／组不修改数据。
- 素材和布局未新增；继续使用 Legacy layerMask 图标及现有菜单组件。原生保留既有 256MiB 蒙版内存上限并先完成新增像素分配，避免部分创建。

- 实际验证：Release `attached-masks-tests` 通过（含批量创建、跳过空帧、保留已有蒙版、链接 Cel、调整图层、锁定、单步撤销重做、重开）；正式程序 `--attached-masks-check` 退出码 0，包含顶部图层／组创建删除入口。来源登记 508 文件通过。未做截图验收或全量性能测试。


### 2026-10-27 蒙版删除事务与撤销承接

- 按 Legacy `deleteSelectedLayerMasks` 在删除前核对全部所属图层／组及祖先锁；只锁蒙版本身不会阻止删除。任一所属对象锁定时整批不执行，界面保留选择。
- 去掉原来的逐项删除后再合并历史，改为暂存、校验并一次提交；重复目标去重，缺失槽忽略，无有效目标不写历史。组蒙版单删使用对应历史名称。
- 删除活动蒙版后退出编辑，撤销恢复编辑目标及隔离状态；批量删除的选择通过与像素选区枢轴相同的文档历史序号桥接，供撤销、重做和历史跳转恢复。
- 必要原生适配沿用现有行为：链接目标删除时，幸存引用从删除前解析结果保留像素并解除悬空链接。Legacy 缺失链接会退回槽自身，原生禁止悬空标识；此项不宣称完全行为等价。

- 删除后切换帧再撤销，会恢复删除前的活动帧和图层，避免蒙版编辑目标与当前帧错位。
- 实际验证：Release `attached-masks-tests` 通过（锁定、祖先锁、批量原子删除、链接链保留、跨帧撤销、重做、无操作、保存重开）；正式程序 `--attached-masks-check` 退出码 0，覆盖锁定时保留选择、一次删除、撤销恢复选择及编辑目标、重做清空。来源登记 508 文件通过。未做截图验收或全量性能测试。


### 2026-10-27 蒙版链接与断开语义

- 以 Legacy `connectSelectedAnimationMasks` 与 `animationLinkSlotKeys` 为依据，按所属图层／组分别链接，以帧顺序中首个可解析蒙版为源；补齐选中端点之间缺失的槽，不覆盖未选中的已有中间蒙版。
- 断开按已选蒙版解析后的共享源收集全部链接成员；在源蒙版上右键也可断开相关链接。每个受影响对象先检查图层／组及祖先锁，整批暂存后提交；独立副本保留槽标识并复制解析后像素与属性。
- 一次操作一条历史，重复链接或已独立对象断开不写空历史。复用现有 `MaskContextHistory` 保存编辑源的前后身份，选区历史扩展为前后蒙版选择，供撤销重做恢复。
- 仍有界面缺口：空蒙版单元格的拖动／范围选择尚未完整承接；本批核心接口支持空端点，现有界面可用已有端点链接并自动补齐缺失的中间槽。不将此项登记为整个蒙版时间轴迁移完成。

- 实际验证：Release `attached-masks-tests` 通过；正式程序 `--attached-masks-check` 退出码 0，直接触发真实右键菜单的链接／断开条目并核对撤销选择。来源登记 508 文件通过。未做截图验收或全量性能测试。


### 2026-10-27 空蒙版单元格选择与范围拖动

- 直接按 Legacy `selectAnimationMaskCell` 承接空格选择、Ctrl 切换、Shift 矩形范围追加和最近点击锚点；当前鼠标目标帧保持活动，普通单元格选择不进入蒙版隔离视图。空格不创建蒙版，也不擅自新增绘图门禁。
- 蒙版格接入既有时间轴鼠标捕获、4px 拖动阈值、边缘滚动和 Escape 取消；往回拖动重新从按下时的快照计算范围，取消恢复原选择、活动帧和蒙版编辑目标。选择不写作品历史。
- 空格右键可使用所选范围的链接／断开入口；至少存在一个可解析蒙版才允许链接，全空范围保持禁用。延续上一批单事务链接与撤销逻辑。
- 选中轮廓复用公共 sheet 素材和物理坐标命中管线，每个蒙版行的连续选区共享外轮廓。此项补上上一批登记的空格选择／范围拖动缺口，不将蒙版内容移动／复制手势标为完成。
- 实际验证：Release 正式程序构建成功；`attached-masks-tests` 通过；正式程序 `--attached-masks-check` 退出码 0，覆盖图层／组的真实格子按下回调、鼠标移动／释放、Escape、空格右键链接条目 Click、单步撤销、无历史选择及逐像素选中素材 alpha／物理坐标命中一致性。来源登记 508 文件通过。未做截图审美验收或全量性能测试。


### 2026-10-27 蒙版单元格内容移动与复制粘贴

- 按 Legacy `moveSelectedAnimationMasks` 和 `mapAnimationMaskBlock` 使用完整、未折叠的图层／组顺序计算相对目标；整块越界直接不执行。只有选中轮廓拖动移动内容，内部拖动仍为选择。Alt 不新增复制拖动语义，旧版蒙版分支始终执行移动。
- 源位置留下新标识的白色蒙版，原内容及标识跟随目标；先保存全部源内容，再处理源白色占位及目标覆盖，支持重叠块。锁定检查按旧实现针对目标所属图层／组及祖先。链接成员拒绝整批移动，并从选择中移除链接成员，不写内容历史。
- 复制解析后的独立蒙版快照，以所属对象／帧排序保存在当前文档会话；粘贴按同一映射创建独立新标识，拒绝空普通图层帧和锁定目标。移动按旧版不增加空帧门禁。剪切复用复制和既有批量删除。
- 接入蒙版右键复制／粘贴和现有编辑菜单、Ctrl+C／X／V；切换到普通帧或单元格复制时清除蒙版剪贴板。普通单元格可作为剪掉最后一个蒙版后的粘贴目标。键盘粘贴通过系统剪贴板序号识别新外部图像，优先既有像素粘贴路径。
- 移动预览复用时间轴现有捕获、边缘滚动、Escape 和 sheet 边框；预览不写像素或历史。移动／粘贴各一条历史，撤销重做恢复内容、蒙版选择和活动目标。
- 保留必要原生差异：原生标识不得悬空，覆盖某个链接源时先保留幸存引用的原解析结果并解除悬空链接；这与此前删除适配一致，不将其宣称为 Legacy 悬空引用行为完全相同。
- 实际验证：Release 正式程序构建成功；`attached-masks-tests` 通过，覆盖源白色保留、独立复制快照、空目标拒绝、锁定、链接成员拒绝、整块越界、重叠块、跨图层／组移动、单步撤销重做与工程重开。正式程序 `--attached-masks-check` 退出码 0，覆盖图层／组的真实边框命中、移动预览、Escape、松开提交及编辑菜单复制／剪切／粘贴（含启用条件）；`--mask-selection-clipboard-check` 退出码 0，确认原有蒙版内部像素选区粘贴路线保持可用。来源登记 508 文件通过。未做截图审美验收、全量性能测试或所有外部剪贴板格式验证。


### 2026-10-27 蒙版隔离查看与共享状态控制

- 以 Legacy `layer-cell-shortcuts.ts`、`selectLayerMask`、`selectGroupMask` 为依据：Alt 点击有蒙版的格子／名称切换隔离查看；再次 Alt 点击同一解析后的蒙版返回合成视图。Alt+Shift 保留并追加蒙版格选择，Alt 点击空格不切换帧、不改当前编辑目标。
- 折叠时间轴的蒙版缩略图接入同一 Alt 行为；按 `LayerRowMaskThumbnail/clearAnimationSelection(true)` 保留编辑上下文并清空时间轴选择。普通缩略图点击保持非隔离编辑。
- 显示、锁定和自动链接统一读取／修改解析后的共享源，避免链接格图标显示根状态却修改局部默认值。锁定活动蒙版会退出编辑和隔离查看，撤销／重做通过既有上下文历史恢复。
- 当前帧缺少蒙版时禁用对应控制；按旧版行组件禁用组蒙版的锁定／自动链接入口，显示切换保留。底层原生通用属性接口仍能承接导入的组蒙版属性，不把格式可保存解释为已有 UI 能力。
- 不新增素材，继续复用 Legacy 图标与现有 sheet 控件。本批沿用现有原生蒙版事务及完整失效通知，不宣称已达到 Legacy metadata-only 缓存失效性能一致性。蒙版整行选择、混合行范围选择仍是独立缺口。
- 补充源码证据：Legacy `setLayerMaskAutoLinkAnimationCels` 通过 `animationMaskAt` 修改共享源，而 `animation.ts/inheritAnimationFrameMaskLinks` 判断直接槽位的 `sourceMask.autoLinkAnimationCels`。本批承接该实际组合，不将新建帧判断改为共享源判断；这两处表现存在需另行裁定的规则冲突，不能将“开关图标一致”写成全部帧继承规则已统一。
- 保存限制：Legacy `project-format-encode.ts/encodeMask` 不保存显示开关与移动绑定，原生继续承接此格式，重开恢复默认显示／绑定；锁定和自动链接状态保留。该限制不计为完整状态承接。
- 实际验证：正式 Release 构建成功；`attached-masks-tests` 通过，覆盖共享源属性、无操作历史、锁定退出、跨帧撤销恢复隔离及选择、重做和保存重开。正式程序 `--attached-masks-check`、`--mask-selection-clipboard-check` 均退出码 0，覆盖展开／折叠、图层／组的 Alt 交互及原有蒙版像素粘贴。来源登记 508 文件通过，相关修改 whitespace 检查通过；未做截图审美验收或全量性能测试。


### 2026-10-27 蒙版整行与混合范围选择

- 按 Legacy `selectAnimationMaskRow`、`applyLayerRowRange`、`animationLayerPanelSelectionRows` 和 `workspace.test.ts` 的行选择场景迁移：名称点击只选择整行，不进入蒙版编辑，不启动格子拖动；Ctrl 增减蒙版行并保留普通图层／组，Shift 双向选择混合行范围。
- 行选择与蒙版格选择分开存储，复用原生 `TimelineSelection` 和历史恢复；范围按旧版 mask-before-owner 的语义顺序计算，显示仍沿用当前 owner-before-mask 排列。折叠组的隐藏子项不加入可见范围；普通行目标的组内范围沿用旧版完整子树规则。
- Delete／时间轴删除优先处理选中蒙版：整行收集全部帧槽位，所有 owner 锁定检查通过才执行，一条历史完成，撤销／重做恢复或清空蒙版行选择。混选的普通图层保留，帧和工程像素不被误删。
- 点击帧标题保留已有蒙版行，普通格或普通行替换选择退出蒙版行模式。轮廓复用现有 sheet 行选择素材与公共物理像素 alpha 命中路径，新增单行／混选实际事件及轮廓回归检查。
- 本批不声称完成全部时间轴活动上下文、键盘导航或蒙版行剪贴板行为；既有完整缓存失效与保存格式限制仍保留。
- 实际验证：Release 正式程序构建成功；`attached-masks-tests`、`--attached-masks-check`、`--mask-selection-clipboard-check` 均退出码 0。覆盖图层／组整行选择、Ctrl 混选、双向 Shift 混合范围、整行删除事务、锁定拒绝、撤销／重做行选择与边框命中。来源登记 508 文件通过，修改 whitespace 检查通过；未做截图审美验收或全量性能测试。


### 2026-10-27 蒙版上下文与帧标题切换

- 根据 `workspace-commands-animation-selection.ts/selectAnimationFrame` 和 `workspace.test.ts` 的蒙版行／格切帧测试：点击帧标题保留原活动蒙版标识和隔离状态，即使新帧不存在对应蒙版；普通直接切帧仍走现有退出路径。
- 选中的蒙版格提升为去重的所属行选择，清除格选择及锚点，保留显式帧选择；随后点击普通图层名称清除蒙版上下文。复用现有选择状态与控件，无新增素材。
- 撤回此前中断时尚未交付的整行蒙版复制／剪切扩展：旧版 `copySelectedAnimationMasks` 只消费格选择，不支持自动展开整行，不能自行扩展后称为迁移。
- 实际验证：正式 Release 构建成功；`attached-masks-tests`、正式程序 `--attached-masks-check`、`--mask-selection-clipboard-check` 均退出码 0，覆盖图层／组的帧标题按下与松开、空蒙版帧、格转行、保留编辑与隔离、不新增历史、普通行替换退出。新增测试最后补齐普通行鼠标松开，避免下一组用例继承未结束手势。来源 508 文件通过；未做截图审美验收或全量性能测试。


### 2026-10-27 蒙版时间轴方向键导航

- 按 `workspace-animation-cell-navigation.ts/animationCellNavigationRow`、`stepAnimationCell` 和 `useAppShortcutRouter.ts` 迁移：上下键使用旧版 mask-before-owner 的语义行序，蒙版空槽也可成为焦点，组摘要跳过，折叠组隐藏后代不进入导航。当前原生 owner-before-mask 的显示排列保持。
- 左右键在切帧前保存蒙版 owner，再通过现有帧步进处理循环段、禁用帧与回绕，选中目标帧对应的蒙版格；无蒙版时仍保留空格目标。进入蒙版格使用普通非隔离编辑，离开到普通 Cel 清理蒙版选择和编辑状态。
- 继续复用原有长按重复定时器与稀疏 Cel 查询，不新增导航历史或批量物化空 Cel；不声称全部工作区入口的 TimelineActiveContext 已等价。
- 实际验证：正式 Release 构建成功；正式程序 `--attached-masks-check`、`--timeline-selection-keyboard-check` 均退出码 0，覆盖普通图层／组蒙版空格、左右切帧、离开蒙版、无新增历史及既有普通时间轴键盘回归。来源登记 508 文件通过；未做截图审美验收或全量性能测试。


### 2026-10-27 蒙版右键菜单的可用条件与删除范围

- 对照 `useTimelineContextActions.tsx/openCelMenu` 和 mask 菜单：复制以点击格是否有解析蒙版判断；缺少蒙版且普通 Cel 无可见内容时禁用新建；粘贴要求已有蒙版剪贴板，普通图层目标还须有可见 Cel 内容，组目标不受空 Cel 条件限制。调用后仍由现有事务检查整块边界和 owner／祖先锁。
- 普通图层蒙版右键删除改用当前选集批量删除，一次历史并能撤销恢复内容和选择；组蒙版仍按旧版独立分支只删除点击的 owner/frame，不擅自统一两种行为。
- 折叠时间轴缩略图右键通过 owner/frame 选择目标，不再依赖被隐藏的展开蒙版行。既有原生菜单附加项仍保留，本批不宣称菜单外观、文案和全部入口完全等价。
- 实际验证：正式 Release 构建 exit0；正式程序 `--attached-masks-check` exit0，包含空格菜单灰态、选集批量删除／单历史／撤销恢复，以及组蒙版单格删除。来源登记 508 文件及修改 whitespace 检查通过；未做截图审美验收或全量性能测试。


### 2026-10-27 蒙版专用快捷键完整接线

- 根据 `useLayerPanelShortcuts.tsx/shortcutCommandHandlerRef` 接通现有目录中五个命令：复制蒙版单元格、粘贴蒙版单元格、关联所选蒙版、断开关联、创建或删除当前格蒙版。快捷键设置从不可用变为可绑定，沿旧版保留空默认绑定，不擅加按键。
- 复制／粘贴直接复用蒙版剪贴板，专用粘贴以最后选中的蒙版格为目标；链接／断开复用已有事务。创建／删除按旧版取首个蒙版格、首个普通 Cel、选中组或当前层；删除只影响目标格并过滤对应选择，创建选中目标格。
- 原生虚拟组格使用既有 TimelineSlot 适配，常规 Ctrl+C／V 的调度优先级不变。链接菜单与底层本次核对未发现需改动的条件，不为凑迁移增写近似算法。
- 实际验证：正式 Release 构建成功；正式程序 `--shortcuts-check`、`--attached-masks-check` 均 exit0，前者以临时 F9 绑定经过实际按键路由覆盖全部五命令、图层／组目标与删除撤销。测试绑定仅在 smoke 内存中修改并恢复；未改用户快捷键文件。来源登记与 whitespace 检查通过；未作完整快捷键目录或截图审美验收。

### 2026-10-27 时间轴帧与单元格快捷键接线

- 对照 Legacy `useLayerPanelShortcuts.tsx` 与 `updateSelectedAnimationFramesDisabled`，接通帧复制、帧粘贴、单元格粘贴、单元格关联／断开，以及帧启用、停用、逐项切换状态八个现有快捷键目录项；默认绑定保持为空。
- 复制／粘贴／关联操作复用已有 Editor 与 Document 事务，不新增数据语义。切换停用状态按 Legacy 对每个选中帧独立反转，混合状态仍一次历史，并支持撤销／重做；播放更新继续复用 `updateFramesDisabled`。
- 临时 F9 路由烟测覆盖新增八项及混合状态撤销／重做。未宣称完整快捷键目录或全部时间轴入口等价。

### 2026-10-27 动画循环节与属性快捷键接线

- 按 Legacy `useLayerPanelShortcuts.tsx` 与 `app-layers-shortcuts.ts` 接通新建循环节、帧属性、当前循环节播放／属性／删除、单元格属性六项已有快捷键。
- 循环节命令解析当前帧所在的最内层循环节，复用原生已有循环节编辑器、播放和删除事务；属性命令复用现有帧／单元格属性窗口。默认快捷键保持为空。
- 快捷键设置烟测仅覆盖六项目录可用性，未执行这六项实际按键路由；未宣称全部快捷键目录与全部时间轴入口完全等价。

### 2026-10-27 动画播放设置快捷键接线

- 按 Legacy `app-layers-shortcuts.ts` 接通播放一次、循环全部、循环当前节、播放速度 0.25×／0.5×／1×／1.5×／2×／3×，以及停止后返回起点。
- 直接复用原生播放模式、倍率归一化、播放计时与偏好保存；快捷键设置默认仍为空。`--shortcuts-check` 通过，未宣称完整播放界面或全部快捷键目录等价。


### 2026-10-27 动画播放快捷键重新迁移核对

- 重新逐项核对 `app-layers-shortcuts.ts`、`workspace-commands-animation-playback.ts`：保留十项命令及既有播放函数，移除倍率判断中重复的命令列表和并列数组，改为显式命令／倍率对应表；未重写底层播放状态机或改变默认按键。
- 更正上一轮来源登记：当时 `--shortcuts-check` 仅检查这十项 supported 状态，未调用其实际按键路由，不能作为执行验证。上一轮循环节／属性六项也只有 supported 检查，此处同步纠正文档，不冒称已验证。
- 本次补充实际 F9 按键事件：全部十项执行、一次／全部播放的文档循环事务及无操作历史、当前节模式、六档倍率／帧延迟、返回起点开关、会话设置不改内容历史、长按不重复切换、播放中改倍率保留帧与历史、无工程不执行。测试只改内存，结束恢复快捷键与播放偏好。
- 实际结果：正式 Release 构建成功，包含上述按键执行断言的 `--shortcuts-check` exit0；来源登记 508 文件通过，本次三个修改文件 whitespace 检查通过。未进行截图验收或全量性能测试。


### 2026-10-27 循环节快捷键目标规则与实际执行补齐

- 修正此前循环节快捷键接线遗漏的 Legacy `shortcutLoopSection` 规则：优先查找范围与显式帧选集完全相同的循环节（按存储顺序），无精确匹配才回退到当前帧最内层循环节。播放、属性、删除共用同一解析路径，不影响右键已指定目标。
- 补齐六项真实 F9 路由检查：创建按选集初始化、取消无历史、确认一条历史；嵌套范围精确匹配外层的属性／播放／删除、删除撤销、无精确选集时回退内层；帧属性与实际单元格模态窗口打开后无改动关闭；没有循环节时三项目标命令无操作。
- 实际结果：正式 Release 构建成功，包含新增断言的 `--shortcuts-check` exit0。来源与修改文件 whitespace 检查通过；没有新增 UI 素材或布局，未进行截图审美验收。本批不声明所有属性窗口内容与活动上下文已完全等价。

### 2026-10-27 洋葱皮快捷键与单元格属性选择目标

- 接通 Legacy `useLayerPanelShortcuts` 的 `toggleOnionSkin`，直接调用已有原生开关与偏好保存；承接 `useLayerPanelPreferences/applyLayerSettings` 的时间轴隐藏时不改变洋葱皮规则，默认按键保持为空。
- 实际 F9 事件覆盖切换／恢复、长按抑制、首页无工程及时间轴隐藏无操作；开关不改变文档历史、版本或单元格选集。
- 补齐单元格属性的非活动层目标验证：首个选中格与活动层不同，通过实际属性弹窗将首个选中格不透明度改为42%，其他活动层不变、选集保留、一次历史，撤销恢复。现有目标路由符合这一普通单元格场景，无需另写实现；虚拟组格及全部属性语义未在本批宣称完成。
- 实际结果：正式 Release 构建成功，`--shortcuts-check` exit0，来源登记508文件通过；本次修改文件whitespace检查通过。未改UI素材和布局，未做截图审美或全量性能检查。

### 2026-10-27 图层栏目设置入口与侧边停靠行为

- 根据 `LayerSettingsEditor.tsx`、`useLayerPanelPreferences.tsx`、`LayersPanel.tsx` 补齐普通图层／动画时间轴模式、侧边吸附自动隐藏结构操作（默认开启）、动画／洋葱皮设置入口和完整默认值重置，并接通原有 `openLayerSettings` 快捷键目录项；默认按键为空。
- 复用 `setTimelineHidden` 的停止播放与清除时间轴选择、密度保存、快捷操作模型及动画偏好保存。左右停靠且动画模式下隐藏增帧／删帧与配置的图层结构快捷按钮，保留播放、洋葱皮、设置；关闭自动隐藏后恢复。新偏好以有界文本启动读取、原子写入，不修改工程格式，读取损坏时阻止覆盖。
- 原生适配差异明确保留：当前原生设置窗口内已有快捷操作列表，本批在同一窗口接入显示设置，并复用独立动画设置窗口；旧版则在主设置内展示洋葱皮、快捷操作另开子窗口。不是旧版设置窗口布局完全复刻，未将该差异记作视觉等价。
- 新增实际按键与窗口交互检查涵盖栏目模式、侧边按钮隐藏／恢复、打开动画子窗口后返回、默认值重置及不新增作品历史；测试只更改并恢复内存设置，不写用户偏好。结果待本批正式构建验证。
- 本批实际结果：正式 Release 构建成功；`--shortcuts-check` 与 `--animation-settings-check` 均 exit0，来源登记508文件通过、修改文件whitespace检查通过。已查看正式程序生成的图层设置截图，当前默认窗口无控件重叠／裁切；未作所有分辨率或全量性能验收。


### 2026-10-27 图层快捷操作子页面承接

- 对照 `LayerSettingsEditor.tsx` 与其指针捕获测试，将快捷操作列表从主设置正文移入子页面，主页面只保留入口；子页面关闭按钮、标题关闭和 Esc 均返回主设置，主页面关闭才退出。
- 原生使用同一个 PixelDialog 切页，继续复用既有快捷操作排序、最多五项开关和即时保存模型。切页结束拖拽、计时器与指针捕获，主／子页面分别保留位置和尺寸；旧快捷操作布局文件继续用于子页面，主页面单独保存。
- 新增真实窗口交互断言：主页面列表隐藏、子页面主控件隐藏、拖拽排序及释放、子页调整尺寸后返回与重开、Esc 返回，并沿用栏目模式／侧边隐藏／动画设置／重置检查。
- 本批只解决快捷操作的父子流程差异；动画／洋葱皮仍复用独立设置窗口，不声明主设置与 Legacy 完全一致。正式构建与交互验收结果见后续记录。
- 本批实际结果：正式 Release 构建成功；`--shortcuts-check` exit0，执行新增父子页面、排序及尺寸记忆断言和原有栏目设置检查。已查看本次生成的 `layer-settings-migration-smoke.bmp`，主页面控件无重叠／裁切；未覆盖所有缩放及分辨率。来源登记508文件通过，修改文件whitespace检查通过。


### 2026-10-27 图层设置内联动画与洋葱皮

- 根据 `LayerSettingsEditor.tsx` 的主设置正文恢复跳过停用帧、洋葱皮启用、播放时显示、图层范围、前后帧数、不透明度及颜色控件。普通图层模式隐藏密度和动画正文，快捷操作仍进入原有子页面。
- 提取已有原生动画控件供主设置与独立动画菜单窗口共用，继续复用表达式输入、数值范围、百分比滑块、RGBA颜色选择及偏好保存。开启洋葱皮仍同时启用播放时显示，重置同步共享草稿，不改变工程历史。
- 主页面正文采用裁切滚动容器与共享滚动条，标题和底部操作固定。只承接旧版功能流程；DOM尺寸按原生统一规范适配，不声明逐像素一致。上一轮登记的动画只能另开窗口的差异由本批替代。
- 验证结果待正式构建及实际交互检查。
- 首次正式构建及实际运行：Release 构建 exit0，`--shortcuts-check` 和 `--animation-settings-check` 均 exit0；后者保留独立动画窗口八方向缩放检查。已查看主页面及展开后滚到底部的两张截图，无标题／底部操作覆盖或控件裁切。正在补齐最终共享头文件变更的增量构建，最终结果另记。
- 最终结果：共享头文件依赖增量构建与正式链接成功；最终 exe 重新执行 `--shortcuts-check`、`--animation-settings-check` 均 exit0，来源登记508文件及本批修改文件whitespace检查通过。无全量回归或所有分辨率验收声明。


### 2026-10-27 图层显示模式与密度控件

- 对照 Legacy `LayerSettingsEditor`，将单按钮反转改为明确的动画模式／普通模式分段选择；重复点击当前模式不重复执行切换。两枚按钮复用现有素材并共用1px描边。
- 缩略图与帧信息大小恢复旧版六档标签：紧凑、标准、详细、扩展、大、特大；名称和悬停说明来自 `layer-density-labels.ts` 与中文语言文件。公共 PixelSlider 增加可选分类值文案，未提供时保留原数字／百分比绘制。
- 侧边自动隐藏改用已有 PixelSwitch，对应旧版 PreferenceToggle；状态、保存失败恢复、全局重置和模式隐藏仍走原有模型，不改工程数据语义。
- 交互检查补充六档即时切换、选择当前模式无操作、两项选中态以及普通模式隐藏密度与动画。正式构建与实际检查结果待记录。
- 本批实际结果：正式 Release 构建成功，`--shortcuts-check` 与 `--animation-settings-check` 均 exit0。已查看主设置截图，双选项共边和分类名称正常，正文边缘按滚动视口裁切；未验收悬停提示外观或所有分辨率。来源登记508文件和本批修改文件whitespace检查通过。


### 2026-10-27 洋葱皮设置开关与不透明度浮层生命周期

- 按 Legacy `LayerSettingsEditor` 和 `PreferenceToggle` 复用现有 PixelSwitch，承接“左右切换时跳过停用帧”“播放动画时显示洋葱皮”等完整文案及原说明。范围选项共用1px描边，重复选中当前范围无操作。
- 不透明度浮层按旧版点击外部／焦点离开收起，点击当前数值框或滑块保留；关闭洋葱皮、进入颜色窗口及离开页面结束浮层。原生用限定生命周期的 UI 消息过滤适配 DOM 事件，结束及析构移除过滤器。
- 修正滑块更新后焦点数值框仍保留旧文字、后续失焦可能回写旧值的问题；同步数值文本，继续复用原范围约束、表达式和设置保存。标签列根据完整文案宽度计算，避免“叠加透明度”与输入框重叠。
- 新增相关实际控件消息检查，结果待正式构建与运行记录；不声明整个栏目已全部迁移。
- 首轮正式 Release 构建与两项运行检查均成功；截图检查额外发现正文滚动高度比快捷操作按钮底部少4个逻辑像素，已按实际布局终点修正并补充最大滚动位置断言，正在重建最终程序。此处不将首轮截图记为完整通过。
- 最终结果：修正后正式 Release 链接成功；`--shortcuts-check`、`--animation-settings-check` exit0。截图采集补充 flushRedraw/flip，避免读取上一帧；再次运行快捷键检查exit0并查看最新截图，快捷操作按钮滚到底后完整可见，完整标签与输入框无重叠。来源登记508文件、本批修改文件whitespace检查通过；未宣称全量回归、提示外观或所有分辨率验收。


### 2026-10-27 图层快捷操作入口与取消状态

- 对照 `LayerSettingsEditor.tsx` 与中文语言文件，补齐主设置内“图层快捷操作”入口的已启用数量 / 5，复用旧版 properties/right 图标；子页恢复完整用途说明与标题，说明按窗口宽度换行。原有五项上限、排序、未接通项灰显和即时保存逻辑不变。
- 修正原生列表取消交互：切页、关闭、Esc 清除复选框按下与鼠标捕获，取消后的迟到松键不再改变配置。补充实际窗口检查中的取消、Esc、正常切换及数量刷新断言，保留原有拖动、边缘滚动和返回检查。
- 本批实际结果：正式 Release 构建成功，`--shortcuts-check` exit0，覆盖列表拖动、边缘滚动、取消后的迟到松键、Esc、正常勾选、数量刷新及主子页返回。查看新生成的子页和主设置截图，说明、数量、原图标及入口箭头可见且无重叠。来源登记508文件通过，本批修改文件whitespace检查通过；不声明完整图层模块或所有分辨率视觉等价。


### 2026-10-27 图层右键菜单已实现能力接线

- 对照 `useLayerContextActions.tsx` 与 `workspace-commands-layer-properties.ts`，将新建背景图层、创建关联图层、转换为背景图层及样式编辑／复制／粘贴／清除接入已有原生功能，替换没有回调的灰色占位。关联、背景／普通转换与样式拆分绑定右键目标及工程身份，保持单目标限制。
- 右键上下文单独保存的目标列表将被点击对象置首，不改变文档选集或当前绘制层；样式窗口增加可选初始来源参数，批量预览／提交继续沿用原有文档事务。复制取被点击对象，清除检查选集中任一对象有样式，避免错误取当前绘制层或只看选集第一项。
- 复用已有图标、窗口、共享像素与历史逻辑；不重写底层算法。瓦片转换、合并、蒙版及自由瓦片缺口不在本批完成声明中。对应 LA-001、LA-002、LA-004 的入口承接，不等于这些需求已全部通过替换验收。
- 实际结果：正式 Release 构建成功，`--layer-context-check`、`--color-overlay-check` 均 exit0。覆盖右键目标不同于活动图层时的关联／背景转换与撤销、多选样式复制／清除／粘贴与撤销、跨工程失效菜单保护、真实样式窗口初始来源与取消、真实背景窗口取消，以及原有样式编辑／拆分／栅格化检查；已查看图层右键菜单渲染图。来源登记508文件与本批修改文件whitespace检查通过。首次常规编译发生 C1060 堆内存不足，停止后以同一 build、正式输出路径逐文件单编译器构建成功，未修改项目编译配置或创建新版本目录。未验收所有上下文分支、保存往返或所有分辨率。


### 2026-10-27 图层组合并与折叠操作入口

- 对照 `app-layers-shortcuts.ts`、`useLayerPanelShortcuts.tsx` 和 `useLayerContextActions.tsx` 接通 `合并图层组`、`展开／折叠组` 的顶栏命令，既有快捷键系统同步识别并执行；快捷操作配置中的合并图层组也复用同一绑定。默认按键不变，不新增默认快捷键。
- 顶栏折叠依次切换每个所选组；右键只对被点击的组提供解组和折叠，合并、解组、折叠限制单一上下文目标，普通图层显示向下／所选图层合并。复用原有组状态、合并算法、锁定判断、历史及图标。
- 实际结果：正式 Release 构建成功，`--layer-context-check` 和 `--shortcuts-check` 均 exit0。覆盖真实F9按键、重复按键、多选组折叠、右键单目标限制、全部帧合并画面对照与撤销／重做、锁定／无组选中／首页禁用和旧工程菜单失效；确认折叠不增加作品历史或修订。查看新增图层组菜单渲染图，组专属入口及复用图标正常。来源登记508文件、本批修改文件whitespace检查通过；未验收组保存往返或所有上下文菜单分支。


### 2026-10-28 图层样式批量启用／停用

- 对照 `workspace-commands-layer-properties.ts::setLayerStylesEnabled`、`useLayerPanelShortcuts.tsx` 与 `useLayerContextActions.tsx`，修复原生快捷命令将首项完整样式覆盖给所有目标的问题。逐对象保留各自效果参数和未知样式 JSON，只修改 enabled；配置有效且状态改变的目标去重后，通过既有结构元数据事务一次提交，可撤销／重做，无变化不消耗历史或重做栈。
- 图层样式右键子菜单增加启用／停用项，依据被点击对象确定目标状态，复用旧版 eye/eyeOff 图标；回调绑定原工程身份，重复同一停用操作不反转状态。快捷入口继续使用原有选集主项和命令路由，并限制配置有效且无活动事务时执行。
- 补充多层不同样式、图层组、重复／无效／未配置目标、预览保护、单次历史、无变化、撤销／重做，以及真实右键和快捷键的回归断言。已有 `layerStyleTargets` 对特殊图层类型的过滤比旧版严格，仍列为未完成缺口，本批不宣称完整样式编辑或所有类型兼容。
- 实际结果：既有目录逐文件单编译器 Release 构建成功，稳定产物仍为 `native/build/Release/moonsprite-native.exe`。`document-layer-groups-tests` 通过，正式程序 `--layer-context-check`、`--color-overlay-check` 均 exit0；覆盖不同样式的多选右键启用／停用、同回调重复执行、单次历史及撤销、真实F9主项状态切换、样式编辑取消／拆分既有回归。来源登记508文件与本批源码whitespace检查通过。未进行新增子菜单的图像验收、所有特殊类型兼容或完整工程保存往返验收。


### 2026-10-28 图层样式支持特殊图层目标

- 对照 `workspace-commands-layer-properties.ts::layerStyleOwnerForTarget` 和 `uniqueLayerStyleTargets`，修正 `Document::layerStyleTargets` 错误排除所有 `kind` 非空对象的筛选。现与 Legacy 一致：允许所有已有图层类型及图层组作为样式目标，去重并保持先到顺序，只排除调整层。
- 复用既有样式预览／取消／提交、metadata history、合成渲染、弹窗、右键菜单及快捷键，不替换组件、算法或图标。没有新增 UI 入口或改变默认值。
- 回归覆盖普通图层、独立文本对象、真实瓦片层及自由瓦片样式目标元数据。检查样式取消、应用、启停、撤销、原像素和文本／格子／tileset 结构保留；真实 UI 检查包括样式编辑器、右键复制／清除／粘贴／启停及F9。文字和瓦片工程往返验证样式字段和合成像素一致；调整层仍被排除。
- 实际结果：Release 正式构建成功；`document-layer-groups-tests`、正式程序 `--layer-context-check` 与 `--color-overlay-check` 均 exit0。来源登记508文件、来源快照及本批diff whitespace检查通过。自由瓦片测试仅验证目标准入和已有原生样式操作；其完整资源编辑、导入及导出仍未迁移，不作等价声明。未进行新增UI的图像验收。


### 2026-10-28 自由瓦片工程承接与普通层转换

- 对照 Legacy 自由瓦片模型、渲染与工程编解码，接通已有工程的共享源集合、逐帧独立实例、权威像素重建、显示、保存重开、恢复与快照；保留源/实例额外字段，复用现有资源、合成器及历史。详细范围与来源见 `free-tile-project-20261028.md`。
- 接通原有转换为普通图层命令，全帧保留合成外观，清理不再被持有的源资源，一次历史支持撤销/重做；蒙版被烘焙删除时退出隔离，撤销恢复原上下文。未接通的操作显式禁用，避免编辑派生缓存。
- 实际结果：正式 Release 构建成功，`free-tile-project-tests`、`tilemap-document-tests` 与正式程序 `--layer-context-check` 通过；本轮前段 `document-layer-groups-tests` 通过。来源登记511文件、来源快照验证通过。修正测试样本工程ID及测试专用栈容量；重编译依赖静态库后菜单运行通过，不混用旧文档结构二进制。
- TI-004 仍未整体完成：新建/放置、源与实例编辑、剪贴板、尺寸/变换未接通；链接自由瓦片和规则/自由瓦片混用同一可编辑资源暂明确拒绝，保留既有原生schema/尺寸限制。未进行本批UI图像验收，不宣称完整语义或性能等价。


### 2026-10-28 自由瓦片新建、源选择与 Paint 放置

- 按 Legacy 新建/共享集合、源默认值、逐帧独立实例和默认 Edit 模式，接入原有顶栏及图层右键；复用 PixelDialog、现有瓦片栏目和图标，不新建栏目或替换素材。
- Paint 点击放置一次，拖动笔刷不重复盖章；橡皮擦连续路径命中最上层实例矩形，锁定顶层阻挡，静止重复事件不继续删除。承接源/画布偏移、选区和对称；当前帧预览/取消/提交，一次历史可撤销重做，不改共享源或其他帧。
- 详细边界见 `free-tile-placement-20261028.md`。该批交付时 Edit 入口暂灰显；后续源笔刷/橡皮擦和 Edit 入口承接见 `free-tile-source-brush-20261028.md`。实例移动/属性/剪贴板/变换仍未完成，TI-004 不标为整体完成；增量缓存性能仍有差异。
- 已通过定向 `free-tile-project-tests`，包含新建/共享、独立帧、放置/擦除、取消/撤销重做、保存重开及锁定/选区保护。保存重开按规范化实例字段和实际像素比较，避免把保存时补齐的默认字段误作权威内容改变。正式 Release 构建成功，正式程序 `--layer-context-check` exit0，真实窗口检查含弹窗取消/新建/共享、源缩略图选择、画布一次点击放置/擦除、Esc取消及撤销重做。检查入口补齐真实桌面挂载和画布布局，正常启动路径不变；未完成本批UI图像或性能验收。

### 2026-10-28 自由瓦片 Edit 源笔刷与橡皮擦

- 复用 Legacy 的源编辑临时栅格、实例方向逆映射、compact 起点及增长、透明裁边、空源规范化、共享源写回及单条历史语义；调用已有普通/动态笔刷实现。接通现有 Edit 按钮、笔刷和橡皮擦，取消或失败恢复源与引用缓存；提交后刷新源缩略图。
- Shift 连线按 Legacy 的均匀台阶算法或普通 Bresenham 路径生成像素，在点击目标处准备源快照并独立提交历史。右键橡皮擦仅替换与主色 RGBA 完全相同的源像素，覆盖度插值至副色，重复覆盖取最大值。普通笔刷、动态笔刷及图像笔刷都复用既有原生笔划路径。
- 首次真实画布检查发现共享笔划入口用 `rasterToolsAvailable()` 把自由瓦片层拦在 `Document::beginStroke` 之前；现仅对无蒙版、具有现代源集合且处于 Edit 模式的自由瓦片层开放该入口，源/实例锁定与可见性仍由源编辑准备逻辑检查。该回归由正式程序 `--layer-context-check` 的真实消息路径覆盖。
- 实际结果：正式 Release 构建成功；`free-tile-project-tests`、`tilemap-document-tests`、`brush-dynamics-tests` 与正式程序 `--layer-context-check` 均 exit0。覆盖线段两种算法及反向绘制、源线独立撤销、替色匹配/插值/重叠/撤销，以及 UI 笔划按下捕获、拖动扩源、释放提交和 Escape 回滚。来源覆盖511文件及证据快照、本批 whitespace 检查通过；未做图像或性能验收。
- TI-004 仍未整体完成：其他源工具、源/实例属性、实例选择/移动/多选/剪贴板及变换仍有缺口。保留现有原生源256像素和临时栅格16M预算限制；全 timeline 历史和引用缓存重渲染尚不等于 Legacy 全部增量性能方案。

- 本批最终结果：`tilemap-document-tests` 通过，来源覆盖511文件、证据快照及本批diff whitespace检查通过。正式程序已更新至既有唯一Release路径；未提交或推送。

### 2026-10-28 自由瓦片实例列表选择与移动

- 对照 Legacy 集成实例视图与实例移动分支，在自由瓦片图层右键接入“打开实例图层”；返回按钮恢复普通图层和时间轴。列表倒序、单选、Ctrl 切换及 Shift 范围选择使用旧版语义，复用既有时间轴素材和图标。
- 移动工具在实例视图中拖动所选实例；复用现有放置事务、指针捕获、约束轴及历史。预览从初始位置计算位移，Escape、失焦或捕获丢失取消；一次拖动一条历史，移回原点保留既有重做栈。共享源、实例方向及其他帧不变。
- 最新 `free-tile-project-tests` 已通过；正式 Release 构建成功，最新 `--layer-context-check` exit0，覆盖真实菜单、列表多选、移动工具栏启用及按钮点击、画布拖动/取消/撤销重做、轴约束按键和返回按钮。查看实例列表截图，补齐旧版返回左箭头的现有 sheet 切片，未重画图标；来源覆盖512文件和证据快照检查通过。详细范围见 `free-tile-instance-move-20261028.md`。
- 本批不标记 TI-004 整体完成：实例属性、排序、删除、显隐/锁定操作、剪贴板及完整变换仍有缺口；列表状态图标暂只读。现有派生缓存仍只覆盖画布范围，不能声明与 Legacy 性能方案完全等价。


### 2026-10-29 自由瓦片源新增、删除与排序

- 新增/删除已接通：共享集合源列表、跨层跨帧引用清理、资源增删、主副源角色、撤销恢复、真实按钮/菜单及自定义快捷键；见 `free-tile-source-management-20261029.md`。
- 本批继续承接源排序：已选源右键拖动，按目标原索引插入，同集合成员同步；保持像素、源身份、实例顺序、会话选择和编辑焦点；含取消、捕获/焦点丢失、保存重开；见 `free-tile-source-reorder-20261029.md`。
- 核心 `free-tile-project-tests`、唯一正式产物 Release 构建和最终程序 `--layer-context-check` 均通过。具体检查范围见排序记录；未声明全模块、全界面图像或长期性能验收通过。
- TI-004 仍未整体完成，源属性、密度、未使用源清理等缺口保留；不以本批源排序完成替代完整自由瓦片验收。


### 2026-10-29 自由瓦片闲置源清理

- 对照 Legacy `workspace-unused-tiles.ts` 接通瓦片栏目原有“清空未使用瓦片”菜单，扫描全部图层和帧；共享集合同步移除闲置源，全闲置保留首源并清空，保护外部资源所有者。源身份、选集、模式和当前层帧保持，单次历史支持撤销/重做和保存重开。
- 正式 Release 构建、`free-tile-project-tests`、`tilemap-document-tests` 和正式程序 `--layer-context-check` 均通过；来源覆盖513文件及证据快照、whitespace检查通过。详细范围和适配见 `free-tile-unused-cleanup-20261029.md`，未进行本批UI图像或长期性能验收。
- TI-004 仍未整体完成：源属性、密度及其余登记缺口保留，不将本批清理操作计作整个自由瓦片模块完成。


### 2026-10-29 瓦片栏目五档缩略图尺寸

- 接通普通瓦片与自由瓦片的 Ctrl/Meta 滚轮五档尺寸，独立保存两类偏好，复用缓存图像与 sheet 选框；绘制、点击、排序目标及选中轮廓使用同一尺寸，保留用户要求的2px间距，不修改文档内容或历史。
- 正式 Release 构建、最终程序 `--layer-context-check` 中两类五档尺寸与逐像素选框命中检查通过；来源覆盖513文件及证据快照、whitespace检查通过。完整瓦片组合检查仍遇到布局/栈溢出，未声明通过；范围与未验收项见 `tileset-swatch-sizing-20261029.md`。
- 源属性及其余 TI-004 缺口继续保留，未标记整个自由瓦片模块完成。


## 2026-10-29 自由瓦片源属性

承接 Legacy 自由瓦片源属性弹窗，接通源目录双击、右键属性和可配置快捷命令；名称、显示颜色、显隐和锁定采用基线累积预览，正常关闭合并为一条历史，无修改保留重做。共享源拥有者、资源名称和引用帧缓存同步；撤销不夺取当前层帧焦点。文档命令保留描述和偏移字段，界面按 Legacy 不展示。

复用既有弹窗、颜色编辑器、图层颜色预设、原图标及取色路径；修复所属属性弹窗接收焦点时错误取消预览。详细来源、适配边界及检查结果见 [自由瓦片源属性](free-tile-source-properties-20261029.md)。本项完成不代表 TI-004 整体完成，其余已登记缺口继续保留。


## 2026-10-29 自由瓦片实例专用快捷操作

补齐旧版“仅显示所选实例、旋转90度、水平镜像、垂直镜像、删除所选实例”五个可配置快捷命令，不新增默认键、菜单或图标。变换／仅显示使用主选实例，删除使用选中范围，复用既有属性、显隐和删除事务及锁定保护。

正式 Release 构建与正式程序 `--layer-context-check` 通过，包含真实快捷键路由、变换后的世界坐标角点、目标范围、历史／撤销／重做、重复按键、锁定、隐藏和空选择检查。来源覆盖514文件及证据快照、diff空白检查通过；未做本批图像或长期性能验收。详情见 [实例专用快捷操作](free-tile-instance-shortcuts-20261029.md)，TI-004 其它缺口继续保留。


## 2026-10-29 瓦片模式专用快捷操作

接通旧版普通瓦片原位编辑、变体创建、混合编辑、绘制，以及自由瓦片编辑源、放置实例六个快捷命令，直接复用已有模式按钮的会话设置函数。不增加默认按键、菜单或素材；自由瓦片模式继续按原有规则筛选实例并同步来源。

正式 Release 构建、正式程序 `--layer-context-check` 均通过，含六个真实按键入口、内容／主副瓦片／图层帧焦点／历史和重做保护，以及隐藏目录、错误面板类型和长按重复键检查。来源覆盖514文件及证据快照、diff空白检查通过；未做本批图像或长期性能验收。详见 [瓦片模式专用快捷操作](tileset-mode-shortcuts-20261029.md)，其余瓦片缺口继续保留。


## 2026-10-29 图案笔刷栏目专用快捷操作

接通九个旧版图案笔刷命令：导入、新建／打开笔刷文件夹、刷新、返回上级、小／中／大预览及删除选中笔刷；复用已有导入、文件夹表单、导航、偏好和删除确认流程，尺寸菜单与快捷键共用同一保存逻辑。没有新增默认按键、菜单、图标或布局。

正式 Release 构建、正式程序 `--brush-library-panel-check` 通过，含真实按键路由的尺寸、文件夹创建／取消／导航、刷新、删除取消／确认、重复键和隐藏栏目保护，以及既有拖放和资源删除回归。来源覆盖514文件及证据快照、diff空白检查通过。原生文件选择器及系统文件夹打开仅完成源码接线核对，未自动操作这两个系统窗口；未做本批图像或长期性能验收。详情见 [图案笔刷栏目快捷操作](brush-library-shortcuts-20261029.md)，整体迁移缺口仍保留。


## 2026-10-29 对称轴快捷操作及可见性修正

接通五个对称轴切换与复位中心六个旧版命令，复用已有工具属性设置，不新增默认键。公共开关按旧版有限轴线段判断可见性，修正中心离屏但轴仍可见时被错误重置的问题；中心未变不额外修改元数据。

正式 Release 构建、正式程序 `--symmetry-shortcuts-check` 通过，含实际按键路由、五轴独立切换、长按抑制、复位、可见／离屏轴处理及像素／历史保护。来源覆盖514文件与证据快照、diff检查通过；未新增视觉、旋转镜像操作或长期性能验收。详见 [对称轴快捷操作](symmetry-shortcuts-20261029.md)，整体迁移仍未完成。


## 2026-10-29 工具属性快捷操作

接通旧版完美像素、连续、智能闭合、圆角、固定比例、移动自动选层六类开关。按实际工具上下文分派，复用现有属性按钮及偏好保存；固定比例快捷开启按旧版设为1:1。不增添默认快捷键、菜单、素材或布局，不创建内容历史。

正式 Release 构建与正式程序 `--tool-property-shortcuts-check` 通过，含实际按键路由、全部适用工具和不适用上下文、长按、输入框、无工程、活动手势保护及像素／历史／重做／保存状态检查。来源覆盖514文件及快照、diff检查通过。综合快捷检查计时流程未返回，未计为通过；未做本批视觉或长期性能验收。详见 [工具属性快捷操作](tool-property-shortcuts-20261029.md)，其它迁移缺口仍保留。


## 2026-10-29 选区模式快捷操作

接通旧版替换、添加、减去、相交四个选区模式命令；切至选区工具时保留种类，复用现有模式按钮的持久化与状态刷新，不新增默认键或界面。浮动粘贴按旧版先提交，正在绘制的手势继续排队。

正式 Release 构建与正式程序 `--selection-mode-shortcuts-check` 通过，含实际按键路由、六种选区工具保持、从旋转工具切换、重复键、四种鼠标框选的逐像素结果和撤销／重做、浮动粘贴提交及撤销／重做、无工程与活动笔画保护。模式本身不改像素、保存状态和已有历史／重做。来源覆盖514文件及快照、diff检查通过；未做本批视觉或长期性能验收。详见 [选区模式快捷操作](selection-mode-shortcuts-20261029.md)，总体迁移缺口继续保留。


## 2026-10-29 固定倍率视图快捷操作

接通旧版100%、200%、400%、800%、3200%五个倍率命令。指针位于预览栏目时只调整预览，位于画布时围绕指针缩放，其它位置保留画布中心平移；复用既有主画布变换、约束、保存及局部重绘。预览按钮／滚轮与固定倍率共用同一设置入口，不新增默认键或布局。

正式 Release 构建和 `--view-zoom-shortcuts-check` 通过，含实际按键路由、五档主画布／预览倍率、旋转镜像锚点、无指针中心保持、长按／无工程保护及像素／修订／保存／历史／重做保护。来源覆盖514文件与快照、diff检查通过。预览指针锚定及跟随复用已有模型，本轮仅核对该部分源码；未新增视觉或长期性能验收。详见 [固定倍率视图快捷操作](view-zoom-shortcuts-20261029.md)，总体迁移仍未完成。


## 2026-10-29 颜色板专用快捷操作

接通旧版颜色板24个可配置命令：编辑锁／同步、提取、反转、两种渐变、八种排序及方向、五档色块尺寸、保存、目录和刷新。复用现有栏目操作和文档事务，不增加默认键或界面。目录回调只关闭实际色板库弹窗，检查模式不写锁定／尺寸偏好。

正式 Release 构建和 `--palette-shortcuts-check` 通过：实际快捷路由对照旧版八种排序×两方向固定预期，并验证偏好不改作品、反转／两种渐变及撤销重做、弹窗取消、长按／主页／活动笔画保护。来源覆盖514文件与证据快照、diff检查通过。目录／刷新仅核对复用接线，本批未运行外部目录启动或重复色板文件写入验收；未新增视觉或长期性能测试。详见 [颜色板专用快捷操作](palette-shortcuts-20261029.md)，总体迁移缺口保留。


## 2026-10-29 普通自由瓦片视图实例粘贴

按 Legacy `pasteFreeTileInstances` 的活动自由瓦片Cel目标准入，移除模型、统一入口与菜单对实例视图的额外限定。普通自由瓦片图层视图可以粘贴已有实例载荷，同集合复用源、跨工程导入源资源并补偿偏移，复用现有事务与选择历史；不会强制打开实例视图。复制／剪切及未迁移像素剪贴板范围保持原状。

正式 Release 构建、`free-tile-project-tests` 与正式程序 `--layer-context-check` 均通过，含普通视图实际菜单／按键、同集合／跨工程、锁定目标、像素选区恢复、撤销重做及保存重开。来源覆盖514文件与快照、diff检查通过。详见 [普通视图实例粘贴](free-tile-ordinary-paste-20261029.md)。外部图像优先级及其它自由瓦片缺口继续保留；未做本批视觉或长期性能检查。


## 2026-10-29 实例列表复制／剪切优先级

对照 Legacy 实例剪贴板现有测试与命令范围逻辑，在实例列表拥有上下文时，复制／剪切优先于无关画布像素选区。复用既有全局焦点观察和列表事件记忆有效表面；菜单保留范围，回到画布退出范围，列表焦点清除旧的颜色板操作状态。内容捕获、复制后删除及历史继续复用。

正式 Release 构建和正式程序 `--layer-context-check` 通过，含保留像素选区的实际菜单复制／快捷键复制剪切、内容与选区不变、单条删除历史及撤销、颜色板／列表／画布焦点交接；既有粘贴和实例列表回归继续通过。来源覆盖514文件与快照、diff检查通过。详见 [实例剪贴板上下文](free-tile-clipboard-scope-20261029.md)。菜单焦点保留完成源码核对，未单独进行菜单展开的系统点击验收；未新增图像或长期性能检查，其余自由瓦片缺口保留。


## 2026-10-30 自由瓦片源油漆桶填充

接通 Edit 模式普通与图案油漆桶，直接复用现有填充算法和共享源编辑事务。按 Legacy 使用像素选区或变换后完整源矩形作为范围，不套主文档对称轴；透明源不会填入临时画布留白。共享源逆变换、裁边、引用缓存、提交／取消和历史沿用既有实现。Paint 模式及渐变继续禁用，无布局或素材修改。

正式 Release 构建、`free-tile-project-tests` 和正式程序 `--layer-context-check` 均通过。核心覆盖16种旋转／镜像组合、共享层帧、透明源与选区、图案、无变化、锁定、保存重开和撤销重做；程序检查验证真实鼠标填充、单条历史与捕获释放。初次旋转测试误留未旋转的可命中同源图层，已依既有跨层命中规则修正夹具并重跑通过。来源覆盖514文件及快照、diff检查通过。详见 [自由瓦片源填充](free-tile-source-fill-20261029.md)。未进行新增图像或长期性能验收，其余自由瓦片和整体迁移缺口继续保留。


## 2026-10-30 自由瓦片源渐变

接通 Edit 模式渐变，承接 Legacy 源临时画布的颜色区域、局部起终点／径向中心和选区规则；复用已有采样器、源逆变换、共享引用缓存和提交事务。预览存放于已有时间轴预览，权威资源保持基线；取消、无拖动和全透明无操作不产生历史。渐变允许在透明匹配区域扩展，区别于油漆桶源矩形限制；Paint 模式继续禁用。普通渐变分派移到源事务适配文件以访问既有内部状态，原有栅格／蒙版／瓦片路径保留，不增加公共接口。

正式 Release 构建、`free-tile-project-tests`、正式程序 `--layer-context-check` 均通过。定向核心覆盖线性／径向×16种旋转镜像、预览基线／取消后保存、单条提交、共享引用、保存重开、撤销重做、无拖动、透明无操作、透明范围扩展／选区、锁定与Paint拒绝；正式入口检查实际鼠标按下／拖动／释放、历史与撤销。来源覆盖514文件及快照、diff检查通过。详见 [自由瓦片源渐变](free-tile-source-gradient-20261030.md)。未新增图像或长期性能验收，全引用缓存重建及其它迁移缺口继续保留。


## 2026-10-30 自由瓦片源直线与形状

接通 Edit 模式直线、矩形／矩形轮廓、椭圆／椭圆轮廓、多边形和自由形状。复用 Legacy 源局部边界／路径、选区、逆变换、共享源发布及既有隔离时间轴预览；初始点击位置独立于中心绘制几何起点。直线沿用平衡／完美像素路径、真实笔刷及图像笔刷；形状不套主文档对称，矩形／椭圆按旧版普通覆盖混合，多边形／自由形状先按主画布范围生成填充点。确认只提交一条历史，取消和失败保持原资源。自由瓦片蒙版继续走原蒙版路径。曲线及Paint模式未开放。

正式 Release 构建、`free-tile-project-tests`、正式程序 `--layer-context-check` 均通过。核心覆盖七类几何×16种旋转镜像，与现有栅格几何结果逐像素对照，并检查权威基线／取消、共享引用、保存重开、撤销重做、选区孔洞、临时画布增长、超限回滚、隐式放置、图像笔刷、蒙版隔离及主文档对称不影响源。正式程序验证直线、矩形和椭圆的实心／轮廓实际按下拖动释放、单条历史与撤销，以及Escape取消；多边形／自由形状本批完成核心验证，未单独增加系统鼠标完成路径验收。来源覆盖514文件及快照、diff检查通过。详见 [自由瓦片源直线与形状](free-tile-source-shapes-20261030.md)。未新增图像或长期性能验收，源引用缓存及历史快照性能限制与其它迁移缺口保留。


## 2026-10-30 自由瓦片源曲线

接通 Edit 模式曲线，沿用 Legacy 终点拖动、依次确定控制点和最终源局部笔刷路径。复用现有贝塞尔／完美像素、笔刷、隔离源预览；最终确认刷新并提交同一份预览，保留最初点击的源锚点。普通栅格与蒙版曲线保持原流程，Paint模式仍禁用，无布局／素材变更。

正式 Release 构建、`free-tile-project-tests`、正式程序 `--layer-context-check` 均通过。核心覆盖1／2／8控制点×四种旋转×水平镜像×完美像素开关，逐像素核对世界曲线路径、源逆变换、无主文档对称、权威基线保持、取消、共享引用、保存重开及撤销重做。实际鼠标检查1／2／8控制点终点与中间阶段无历史、最终单条提交、撤销重做和控制点阶段Escape取消。来源覆盖514文件及快照、diff检查通过。详见 [自由瓦片源曲线](free-tile-source-curve-20261030.md)。未新增图像或长期性能验收，其余源工具及整体迁移缺口继续保留。
## 2026-10-30 自由瓦片源喷枪

接通 Edit 模式喷枪，复用旧版按下立即喷绘、后续计时批次和粒子参数，通过已有源临时栅格完成局部喷绘、逆变换和共享引用更新。每批先增长全部粒子足迹，再映射坐标；无像素变化时跳过共享源发布。源喷绘及预览不套用主文档对称，释放只提交一条历史，取消恢复原源。Paint 模式保持禁用，无布局或素材变更。

正式 Release 构建、`free-tile-project-tests`、正式程序 `--layer-context-check` 均通过。核心覆盖四种旋转×水平镜像×三种粒子形状、选区孔洞、画布增长、无变化批次、共享引用、保存重开、撤销重做、取消和超限回滚；正式入口检查鼠标按下／移动／释放、后续喷点入口、计时器生命周期、Escape及右键焦点丢失取消。来源覆盖514文件及证据快照、diff检查通过。详见 [自由瓦片源喷枪](free-tile-source-airbrush-20261030.md)。未新增图像或长期计时性能验收；源全引用缓存重建及历史快照限制与其余迁移缺口继续保留。

## 2026-10-30 自由瓦片图片粘贴

接通普通自由瓦片层及实例视图的图片粘贴。选中实例时按旧版临时源栅格范围直接覆盖像素，再逆变换裁边、更新共享引用；未选实例时按内容边界的256px网格分块生成源和实例，保留世界位置，只选最后新增实例并进入Edit。保持原像素选区和旋转中心，复用原子时间轴历史；相同图片不新增历史，失败不发布部分资源。

实例复制记录只读系统图像基线，统一粘贴按完整像素／掩码比较决定优先级：同尺寸的新图片也能覆盖旧实例载荷；系统图像无变化、缺失或不可读时回退内部实例。移除菜单额外的“必须已有内部实例载荷”限制，保留锁定、活动操作及蒙版目标保护。图层／帧／Cel的全局外部优先级及自由瓦片像素复制／剪切等缺口继续保留。

正式 Release 构建、`free-tile-project-tests`、`clipboard-document-tests`、正式程序 `--layer-context-check` 均通过。核心覆盖16种旋转镜像下的原始alpha覆盖、掩码、共享层帧缓存、保存重开、撤销重做、同图无变化、锁定、透明无操作、分块位置和超限回滚；菜单检查覆盖基线不变、新外部图片优先、无系统图片回退及外部图片独立粘贴／撤销。系统图像读取采用注入，不改写用户系统剪贴板，不宣称真实跨应用或新增视觉验收。来源覆盖514文件与快照、diff检查通过。详见 [自由瓦片图片粘贴](free-tile-image-paste-20261030.md)。保留单源256px、16M图像／临时栅格预算、固定派生缓存和现有时间轴快照历史限制；整体迁移仍未完成。

## 2026-10-30 自由瓦片像素选区复制与剪切

接通自由瓦片已有像素选区的复制／剪切菜单，复用活动图层派生RGBA取样、画布裁切、掩码及世界原点。画布与实例列表按焦点区分像素剪贴板和实例剪贴板，实例列表优先级保留。Edit 模式有主选实例时，剪切／Delete 清除对应共享源像素，复用图片粘贴源适配的逆变换、裁边、引用缓存和原子时间轴事务；隔离候选避免引入粘贴的选源／模式副作用。实例身份、位置及多选保持，整次源删除一条历史；剪切最后完成选区。

正式 Release 构建、`free-tile-project-tests`、正式程序 `--layer-context-check` 均通过。核心覆盖16种旋转镜像、可见像素与选区孔洞、复制不变性、源删除准确位置、共享缓存、保存重开、撤销重做、锁定／空内容／Paint保护；界面检查覆盖菜单可用性、列表与画布焦点、实际Delete及撤销，以及空内容Copy／Cut。UI检查没有写入系统图像；非空系统剪贴板写入继续复用既有后端，本批未做跨应用或新增视觉验收。来源覆盖514文件及证据快照、diff检查通过。

Paint／无主选实例的源像素删除仍未开放，剪切在这些场景只复制并结束选区，避免改坏派生缓存；整层／整Cel／整帧及自由瓦片选区内容变换仍未迁移。选区工具开放范围保持原状，可使用已有选区或全选入口。保留单源／临时栅格预算、固定缓存和现有时间轴历史性能限制。详见 [自由瓦片像素选区剪贴板](free-tile-pixel-clipboard-20261030.md)，整体迁移仍未完成。

### 2026-10-30 自由瓦片选区创建

接入 Edit 模式选区工具栏与既有创建手势；魔棒读取主选源的变换像素，避免误用图层合成缓存。Paint 模式保持禁用，源内容变换继续明确标记未迁移。来源及验证范围见 [本批说明](free-tile-selection-creation-20261030.md)。

### 2026-10-30 自由瓦片选区内容平移

承接整实例位置移动与部分选区／复制的共享源像素移动，复用现有源事务、选区手势和撤销路径；缩放、旋转、斜切仍未迁移。见 [本批说明](free-tile-selection-translation-20261030.md)。


## 2026-10-30 自由瓦片选区变换

接通 Edit 主实例像素选区的缩放、旋转、斜切手柄，以及宽、高、角度和快速／RotSprite 属性；沿用源捕获、逆实例变换、共享缓存发布、浮动确认／取消与单条撤销历史。整实例平移保持原路由。核心逐像素对照、正式 Release 构建及 `--free-tile-transform-check` 通过；多帧和全局整层变换入口仍保留缺口。详见[本批记录](free-tile-selection-transforms-20261030.md)。
