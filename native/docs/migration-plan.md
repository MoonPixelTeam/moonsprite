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


## 2026-10-30 自由瓦片实例菜单变换

当前可编辑主实例接通“编辑 → 变换”（Ctrl+T）和“选择 → 自由变换”。前者仅建立文档裁切后的实例选区；后者确认前次浮动，建立四角几何后复用源变换事务。初始矩形不发布或裁源。核心边界及四角逐像素回归通过；多帧、多目标、无主实例整层及独立翻转／旋转菜单仍留缺口。详见[本批记录](free-tile-transform-menus-20261030.md)。


## 2026-10-30 自由瓦片水平／垂直翻转

按旧版区分主实例选区的共享源像素翻转、已选实例元数据翻转和浮动源翻转。保留透明补边、不规则选区、原位置、浮动确认／取消与历史；不新增界面入口。范围和保留缺口见[本批记录](free-tile-content-flips-20261030.md)。


## 2026-10-30 时间轴批量翻转

承接所选 Cel、帧、图层与组的混合内容翻转，保留实例／像素选区优先级、链接内容去重、一条历史及旧版各类型语义。自由瓦片链接 Cel 和网格／自由源共用仍受现有导入边界限制。固定角度旋转经旧版源码确认拒绝特殊层，不自行开放。验证及边界见[本批记录](timeline-content-flips-20261030.md)。


## 2026-10-30 图层与图层组独立资源复制

接通自由瓦片／网格瓦片的活动层、所选层／组及拖动复制。依旧版为副本新建源集合、源和资源，重映射每帧引用；保留原像素、实例身份和属性，副本编辑不影响原共享源，整次复制一条结构历史。

`free-tile-project-tests`、`document-layer-group-structure-tests`、正式 Release 构建及实际菜单 `--free-tile-transform-check` 通过；菜单样本含多个源，核对副本自身像素、逐源资源增量、撤销与重做。来源覆盖515文件及证据快照验证、diff检查通过；未新增视觉及长期性能验收。整层／Cel／帧剪贴板、链接自由 Cel 和网格／自由源共享导入等缺口继续保留，整体迁移未完成。详见[本批记录](layer-owned-resource-copies-20261030.md)。


## 2026-10-30 自由瓦片图层及组剪贴板

接通整层／图层组的复制、剪切和同工程／跨工程粘贴，包含所有帧实例、源集合及资源。每次粘贴新建身份，保留组内共享；补齐帧数、空Cel及资源名，沿用结构历史完成撤销重做。剪切只移除没有其它owner或格子引用的资源。复制只读系统图片基线，新外部图片优先于内部载荷。

`free-tile-project-tests`、`clipboard-document-tests`、`document-layer-group-structure-tests`、正式 Release 构建及实际菜单 `--free-tile-transform-check` 通过。核心覆盖共享组、单层、两种帧数关系、重复粘贴、保存重开、历史和失败原子性；菜单覆盖复制、剪切、粘贴、新外部图片优先及跨工程。系统图片使用读取注入，没有写入用户系统剪贴板。来源覆盖515文件与证据快照、diff检查通过。没有新增图像或长期性能验收。

自由瓦片整Cel／整帧剪贴板仍未承接；需要自动链接自由Cel的帧扩展明确拒绝，既有模型／资源导入和性能边界继续保留。详见[本批记录](free-tile-layer-clipboard-20261030.md)，整体迁移尚未完成。


## 2026-10-30 自由瓦片整Cel剪贴板（同工程）

接通同工程整Cel复制、剪切与粘贴，保留实例和源引用；支持同源跨层、连续块、补帧、其它行空Cel、保存重开及单条撤销重做。剪切不删除共享资源；源修改后的粘贴缓存按当前权威源刷新。菜单保持实例／像素选区作用域，复制记录系统图片基线，新外部图片优先。

`free-tile-project-tests`、`cel-selection-clipboard-tests`、正式 Release 构建及 `--free-tile-transform-check` 实际菜单检查通过。菜单覆盖复制、剪切、粘贴、历史、外部图片优先及锁定保护；系统图片读取采用注入，不写用户剪贴板。原有Cel选区回归遇到0xC00000FD测试栈溢出，仅将该测试MSVC栈预留由2MiB调到8MiB后通过，正式软件配置与断言未改。来源覆盖515文件与证据快照、diff检查通过；无新增图像或长期性能验收。

跨工程动画Cel载荷没有自由源集合／资源导入协议，明确保持自由Cel跨工程粘贴禁用；可用整层／组剪贴板传递资源。部分选区、目标缺源、类型不匹配、自由自动链接帧扩展和原生模型既有限制仍保留；整帧剪贴板及独立Delete入口未在本批迁移。详见[本批记录](free-tile-cel-clipboard-20261030.md)，整体迁移尚未完成。


## 2026-10-30 自由瓦片整帧剪贴板（同工程）

接通含自由瓦片工程的整帧复制、剪切与粘贴，按时间轴顺序复制所选帧，保留时长／禁用、所有层实例、源共享及图层／组蒙版。插在所选帧之后，单帧选中新Cel、多帧选中新范围；整次一条历史。剪切保留最后一帧和共享资源，修整原循环段；载荷在原帧删除、撤销与重做后仍可粘贴。按当前源刷新缓存，复制不回退过期像素。

`free-tile-project-tests`、`moon-core-tests`、正式 Release 构建及 `--free-tile-transform-check` 实际菜单检查通过。核心覆盖反向选择的复制顺序、蒙版／循环段、最后一帧、来源修改、保存重开和历史；菜单覆盖Copy／Cut／Paste、插入位置、单帧选择及新外部图片优先。修复原生帧作用域门禁误拦截外部图片的问题，调用期间临时绕过UI门禁并恢复，文档帧选择保留。系统图片读取采用注入，不写用户系统剪贴板。来源覆盖515文件和快照、diff检查通过；无新增图像或长期性能验收。

自由帧跨工程源资源传递、自由自动链接插帧和既有模型／性能限制继续保留；独立Delete入口未在本批迁移。详见[本批记录](free-tile-frame-clipboard-20261030.md)，整体迁移尚未完成。


## 2026-10-30：自由瓦片时间轴删除

已接通含自由／网格瓦片工程的现有Cel删除、所选帧删除路由。删除与Cut共用既有特殊图层事务，Delete不复制载荷；保留共享源，删除帧时承接蒙版、循环段与最后一帧保护。普通RGBA分支只移至共同实现文件。来源、适配和剩余限制见[专项记录](free-tile-timeline-delete-20261030.md)。

实际完成：free-tile-project-tests、moon-core-tests通过；唯一正式Release程序构建通过；--free-tile-transform-check退出0，实际编辑菜单Cel／帧Delete、撤销、资源与剪贴板检查通过，既有Copy/Cut/Paste检查通过。来源登记覆盖515文件、快照核对通过；git diff --check通过。本批没有新增视觉素材，未做截图外观或长期性能验收，不代表全部功能迁移完成。


## 2026-10-30：自由／网格瓦片新增帧与空白帧

接通已有新增帧、空白帧以及Alt+N、Alt+B。复用既有帧／Cel增量结构历史：复制当前帧实例／格子并共享原资源，保留时长及停用；空白100ms且保留特殊Cel尺寸、偏移与网格模板。图层／组蒙版、自动层蒙版继承与循环段延伸按旧版承接。需要自由Cel自动链接的工程在变更前明确拒绝。范围与适配见[专项记录](free-tile-frame-creation-20261030.md)。

已执行：free-tile-project-tests、moon-core-tests通过；唯一正式Release程序构建通过；--free-tile-transform-check退出0，实际Alt+N／Alt+B及撤销、资源保留通过，原整层／Cel／帧剪贴板和删除检查通过。来源覆盖515文件及快照核对、git diff --check通过。未新增素材／布局，不报告截图或长期性能验收；整体迁移仍未完成。


## 2026-10-30：自由／网格瓦片帧Alt拖动复制

完成已有帧头Alt拖动复制路径，按旧版duplicateAt将完整所选帧直接插到目标前／后。复用特殊帧粘贴结构事务，保留原帧、所有层内容、资源共享、时长／停用、图层与组蒙版及原循环段端点；单帧也选中新帧范围，撤销恢复原上下文。临时捕获后恢复帧与Cel剪贴板，包括失败路径。普通RGBA拖动逻辑保持原状。范围与适配见[专项记录](free-tile-frame-drag-copy-20261030.md)。

实际完成：free-tile-project-tests、timeline-interaction-tests通过；唯一正式Release构建通过；--free-tile-transform-check退出0，真实Alt帧头按下／移动／抬起复制多帧与撤销检查通过，既有剪贴板、删除、新增帧检查通过。来源登记515文件及快照核对、git diff --check通过。没有新增视觉素材，不报告新增图像或长期性能验收；Cel格子拖动、自由链接Cel和跨工程自由帧资源协议等缺口仍保留。


## 2026-10-30：网格瓦片与文字Cel拖动

补齐已有时间轴Cel移动／Alt复制对tilemap和text权威元数据的处理。按旧版先捕获整块，支持重叠、移动清源、复制保留源、类型匹配，继承既有链接幸存者与Cel增量历史；蒙版留在原槽位，资源不重建。特殊内容候选在发布前验证，编辑器失败收尾通过既有错误入口处理。范围见[专项记录](special-cel-dragging-20261030.md)。

发现legacy的自由Cel拖动函数允许该类型却没有清空／写入freeTiles，与权威实例模型冲突；明确登记待裁定，不照搬错误也不擅自定义替代语义。暂时拒绝涉及自由层的Cel拖动以保护数据；自由整Cel剪贴板和整帧拖动保持可用。

已执行：free-tile-project-tests专项覆盖网格／文字移动复制、重叠、可编辑元数据、蒙版、保存重开、撤销重做、跨类型及自由拒绝；timeline-interaction-tests普通像素／链接与历史回归通过。唯一正式Release构建通过，--free-tile-transform-check退出0。来源登记515文件及快照、git diff --check通过。本批网格／文字拖动未新增真实鼠标或截图验收，不将已有自由专项回归等同该项UI验收；整体迁移仍未完成。


## 2026-10-30：网格瓦片Paint方向键完整格子步长

补齐键盘方向键入口：与legacy一致，将Paint模式下的左右／上下位移分别乘以当前Cel的tileWidth／tileHeight，交给已有格子移动事务，修复大瓦片方向键不动及负方向不一致。其它模式、作用域门禁、自由变换保护和底层历史算法保持原状。范围见[专项记录](tilemap-paint-arrow-input-20261030.md)。

唯一正式Release构建通过，--shortcuts-input-check退出0，实际四方向键检查覆盖2×3格子、移动引用／选区、撤销重做、边缘无操作、自由变换禁用及tileset像素保持；该入口已有自定义键盘／鼠标／滚轮快捷键回归一并通过。来源登记覆盖515文件、快照核对及git diff --check通过。未新增素材或布局，不报告截图／长期性能验收；本批不开放自由瓦片、蒙版及多帧格子方向键移动。

## 2026-10-30 文字工具方向键

承接旧版文字工具方向键优先级及每次1px移动，保留选区、解析链接所有者并同步文字元数据，复用位置／文字历史，不复制字形像素。边界与定向检查见 [文字方向键](text-arrow-input-20261030.md)。同时补齐无选区文字居中：固定文本框按框、无框按字形范围移动，保留文字变换元数据。正式Release构建、`--shortcuts-input-check`及515文件来源检查通过；无布局变化，未做额外图像或长期性能验收。

## 2026-10-30：文字框变换承接

补齐带文本框文字Ctrl+T不创建第二套像素变换，以及调整文本框大小时旧版renderTextAtCurrentSurface的位置校正。文字弹窗与调整大小共用最多两次栅格化的校正流程，保留链接所有者、取消和一次提交历史。唯一正式Release构建、`--text-tool-check`与515文件来源检查通过；实际指针检查覆盖旋转文字的链接帧、重复预览无累积、Escape、确认、撤销／重做。无布局或素材变化，未新增性能／图像验收。详见[文字框变换](boxed-text-transform-20261030.md)；文字拖动对选区／蒙版范围等其余缺口仍保留。

## 2026-10-30：文字框内部拖动范围

按旧版文字框事务补齐内部拖动：复用现有移动预览及历史，显式TextBox范围只平移文字所有者和变换元数据，选区、轴心、附着蒙版保持原位；取消不再清空或移动选区。普通移动工具仍使用原范围。同步单层文字框选择条件。正式Release构建、`text-document-tests`、`--text-tool-check`及515文件来源检查通过；覆盖链接、像素存储复用、重复预览、零位移、取消、一次提交、保存重开、撤销重做与普通移动对照。详见[文字框拖动范围](text-box-move-scope-20261030.md)。未新增图像或长期性能验收，其它文字与特殊内容限制不由本批解除。

## 2026-10-31：文字框边缘操作

按旧版区分文字框内部拖动与边缘手柄：边缘缩放即时预览，不受内部3px拖动阈值影响；边缘松开提交，不再误开编辑弹窗，包含静止手柄点击的旧版历史行为。正式Release构建、`--text-tool-check`及515文件来源检查通过。实际低倍率指针检查覆盖小幅缩放、提交、撤销／重做、静止松开与Escape。详见[文字框边缘操作](text-box-edge-gesture-20261031.md)。无布局变化，未新增图像或长期性能验收。

## 2026-10-31：文字框创建手势

按旧版补齐创建过程的sheet轮廓预览、反向包含端点矩形、整段手势moved状态（拖出后返回仍是固定文本框）、普通点击按下位置与默认尺寸，以及Escape／失焦／捕获丢失清理。复用现有文字手势存储与编辑器草稿，不新增文档写入路径。正式Release构建、`--text-tool-check`及515文件来源检查通过；实际指针检查覆盖预览、反向、返回、取消与松开后的编辑器取消，离屏边框逐像素对照通过。详见[文字框创建](text-creation-gesture-20261031.md)。未做桌面截图或长期性能验收，整体迁移未完成。

## 2026-10-31：文字编辑命中

补齐旧版无框文字半字号点击留白、上层可见像素阻挡和隐藏／锁定跳过，按蒙版后alpha判断阻挡；保留已选框手势优先级。正式Release构建、`--text-tool-check`及515文件来源检查通过。实际指针覆盖透明／不透明叠层、留白和隐藏／锁定，蒙版阻挡及选中框优先级本批为源码核对。详见[文字编辑命中](text-edit-hit-20261031.md)。Alt复制文字等其余缺口保留。

## 2026-10-31：文字工具临时移动

补齐文字处理器对配置的临时移动快捷键让路，复用现有移动手势与历史；关闭自动选层时活动可编辑文字层可作为目标。文字框直接拖动范围保持独立，临时移动沿用普通选区／蒙版联动。正式Release构建、`--text-tool-check`、`--layer-move-check`和515文件来源检查通过；实际Ctrl+指针覆盖取消、提交、撤销重做、工具保留与关联状态。详见[文字临时移动](text-quick-move-20261031.md)。Alt文字复制等其余缺口保留。

## 2026-10-31：文字Alt拖动复制

将旧版Alt文字命中目标接入现有复制图层移动事务，编辑与复制共享文字堆叠命中；命中目标优先于活动层及自动选层设置，临时移动仍优先。复用延迟副本、对齐、链接数据、取消和一次历史，多Cel资格维持原范围。正式Release构建、`--text-tool-check`、`--layer-move-check`及515文件来源检查通过；实际Alt指针覆盖另一活动层、自动选层关闭、链接文字、点击无副本、取消、提交与撤销重做。详见[文字Alt复制](text-alt-copy-20261031.md)。整体迁移仍未完成。

## 2026-10-31：文字框缩放修饰键

文字框比例缩放接入现有快捷键配置及平板约束键，从中心缩放接入平板中心键并保留Alt；整数缩放保持旧版文字路径禁用。正式Release构建、`--text-tool-check`及515文件来源检查通过，覆盖改键、辅助键、取消、单次提交与撤销重做。详见[文字框缩放修饰键](text-resize-modifiers-20261031.md)。持久选区宽高比锁仍缺原生对应会话状态，整体迁移未完成。

## 2026-10-31：文字框拖动预览去重

承接旧版独立的请求预览矩形及sameBoxPreview比较，文字框缩放与内部移动在目标不变时跳过重排、文档发布和刷新；比较请求矩形而非位置校正后的文字元数据，同指针坐标下修饰键改变仍正常更新。正式Release构建、`--text-tool-check`及515文件来源检查通过，检查包含静止边缘、链接旋转文字、缓存地址／修订号、重复内部移动、修饰切换、取消及提交撤销重做。详见[文字框拖动预览去重](text-box-preview-dedup-20261031.md)。变化目标的局部缓存失效等性能差异仍保留，未宣称整个文字模块迁移完成。

## 2026-10-31：文字拖动预览刷新范围

文字框缩放／框内拖动预览复用Canvas刷新范围，跳过整套工作区重排；新建文字框按旧版sameBoxPreview去重后才调度画布绘制，保留整段手势moved标记。完成和取消继续完整同步界面。正式Release构建、`--text-tool-check`、515文件来源及证据快照检查通过；实际输入确认有效预览不增加全布局刷新计数，既有文字手势与历史检查通过。详见[文字预览刷新范围](text-preview-refresh-scope-20261031.md)。文字草稿核心仍发布整幅脏区，精确合成缓存失效等迁移缺口保留。

## 2026-10-31：普通文字草稿局部合成更新

文字草稿按旧版新旧表面范围合并失效，通过现有CanvasRenderer局部合成及上传通道承接；普通无组无样式无调整层堆叠生效，复杂派生堆叠、独立链接层、空越界范围维持完整回退。正式Release构建、`text-document-tests`、`--text-tool-check`及515文件来源快照检查通过，局部修复与整幅合成逐像素核对，并覆盖链接、边界和历史。详见[文字草稿局部合成更新](text-preview-damage-20261031.md)。样式和图层组等精确范围扩展仍未完成。

## 2026-10-31：带样式文字预览影响范围

承接旧版layerStyleAffectedRect及所有图层／祖先分支扩展规则，描边（含内描边）、内发光、偏移模糊阴影和嵌套普通样式组的文字预览使用局部脏区，扩展后再裁剪。组渐变、调整层、独立链接层及空越界范围继续完整回退。正式Release构建、`text-document-tests`、`--text-tool-check`和515文件来源快照检查通过；十类样式／组情形局部修复与整幅合成逐像素一致。详见[带样式文字预览影响范围](text-style-preview-damage-20261031.md)。整体迁移及复杂派生范围仍未完成。

## 2026-10-31：文字工具指针反馈

补齐普通文字、框内移动、边框缩放与捕获持续指针，复用现有legacy素材；缩放方向承接视图旋转／镜像，输入和悬停共享sheet命中与手柄优先级。文字工具不再被栅格绘图不可用判断误标。正式Release构建、`--text-tool-check`、515文件来源及快照检查通过，实际输入覆盖方向、旋转／镜像与画布外捕获反馈。详见[文字工具指针反馈](text-pointer-feedback-20261031.md)。取消变换经核对旧版原本完整清缓存，继续保留；其它迁移缺口仍在。

## 2026-10-31：文字修饰键指针优先级

承接文字Alt复制、配置的临时移动先于取色与文字框悬停的指针优先级，复用文字命中和quickToolMatch，锁定／隐藏目标排除，松开修饰键恢复缩放指针。正式Release构建、`--text-tool-check`、515文件来源及快照检查通过；既有真实复制／移动事务检查同次通过。详见[文字修饰键指针](text-modifier-pointer-20261031.md)。其它工具／焦点组合与整体迁移缺口保留。

## 2026-10-31：文字字体选择与字号偏好

文字弹窗按旧版即时记录字号（含局部文字），字体选择与文件／系统导入共用默认字号逻辑，删除后按现有字体目录顺序回退，确认不再用基础字号覆盖最后输入的局部字号。正式Release构建、`--text-tool-check`、515文件来源及快照检查通过；内部弹窗检查覆盖字号、选择和回退逻辑，系统选择器操作仅源码核对。详见[文字字体选择](text-font-selection-20261031.md)。未修改UI布局或字体素材，整体迁移仍未完成。

## 2026-10-31：新建文字删空草稿生命周期

按旧版TextToolHost与updateTextLayerDraft承接新建文字删空时保留同一临时层／Cel，透明预览不增加历史，撤销恢复继续使用原草稿；未建立的空草稿不建层，已有文字空预览保持恢复语义。正式Release构建、`--text-tool-check`、`--text-rasterization-check`及515文件来源快照检查通过，覆盖实际删空／本地撤销重做、空确认拒绝、身份和历史稳定、取消／确认及转栅格过期回调。详见[空文字草稿生命周期](empty-new-text-draft-20261031.md)。整体迁移仍未完成。

## 2026-10-31：共享文字输入框键盘导航

承接旧版浏览器textarea的选区左右收起、Shift锚点、多行期望列和翻页起止；粘贴CRLF与独立CR归一为LF。PixelTextArea为必要原生输入适配，没有可直接复制的旧版键盘算法。新增实际弹窗键消息检查，验证导航不新增本地文字历史；正式Release构建、`--text-tool-check`（退出码0）和515文件来源／证据快照检查通过。详见[文字输入导航](text-input-navigation-20261031.md)。跨词、组合字符簇和软换行Home／End等价性仍未完成，不宣称整个文字模块迁移完成。

## 2026-10-31：文字输入框可见行定位

文字输入框按显示行处理Home／End，在自动换行的同一文字偏移保留前行末尾／后行起点两种可见位置，鼠标、上下键、滚动显露与光标绘制共用定位；本地撤销恢复视觉位置。输入与绘制代码移至独立编译源，原有组件及正式产物路径不变。正式Release及最后增量构建、`--text-tool-check`（退出码0）、516文件来源及证据快照检查通过。详见[自动换行定位](text-input-wrap-20261031.md)。旧浏览器的按词换行、组合字符、双向文字及输入法等价性仍未完成。

## 2026-10-31：文字输入组合字符移动与删除

使用现有SkUnicode／ICU字素边界适配旧版浏览器textarea提供的Unicode输入能力，UTF16边界映射回U32光标，接入左右／Shift及无选区前后删除，内部光标删除完整组合，保留本地历史和原样式链路。正式Release构建、`--text-tool-check`（退出码0）及516文件来源／证据快照检查通过。详见[组合字符边界](text-input-graphemes-20261031.md)。浏览器逐平台删除规则未做运行等价对照，按词、输入法、双向和按字素布局／鼠标选区仍未完成。

## 2026-10-31：文字输入跨词编辑

按浏览器实际textarea采样承接Ctrl左右、Shift跨词选择和Ctrl前后删除，记录680条内容／选区结果并检查本地撤销重做。Windows系统ICU词典承接中文，解决Skia精简数据缺词典；字母间句点／冒号及换行／空行按采样适配，普通字素路径不变。正式Release构建、`--text-tool-check`（退出码0、680条对照一致）和518文件来源／证据快照检查通过。详见[文字跨词编辑](text-input-words-20261031.md)。字典版本／其它语言、输入法、双向和按词换行等价性仍有缺口。

## 2026-10-31：组合字符鼠标选区与折行

按本机浏览器textarea真实点击证据，共享文字输入框的鼠标／拖选、上下／翻页、Home／End仅使用完整字素边界，自动折行保持组合完整，沿用软换行双视觉位置和原像素字模。geometry实现移入既有cpp，程序化逻辑选区与作品渲染器不变。正式Release构建、`--text-tool-check`（退出码0，含原有680条跨词对照）和518文件来源／证据快照检查通过。详见[组合字符选区](text-input-cluster-selection-20261031.md)。按词换行、字形塑形、双击／三击、输入法和双向仍未完成。

## 2026-10-31：文字双击选择与后续编辑

按124条Windows浏览器实际双击结果承接词／尾随空白、独立标点和字形左右侧命中，释放保留选区，后续删除及本地撤销恢复原范围。使用已有系统ICU的未合并标点边界，Ctrl跨词路径保持原语义。正式Release构建、`--text-tool-check`（退出码0，124条双击与原有680条跨词对照通过）和520文件来源／证据快照检查通过。详见[文字双击选择](text-input-double-click-20261031.md)。双击按词拖选、三击、输入法和双向仍未完成，不将其标为已迁移。

## 2026-10-31：双击按词拖选

根据146条Windows浏览器实际拖选及释放后Shift方向结果，冻结双击原词范围，承接向左／右扩展、反向返回和初始尾随空白差异；释放／失焦／重置／捕获丢失清理手势，保留普通字符拖选。正式Release及最后增量构建、`--text-tool-check`（退出码0，146条拖选、124条双击及680条跨词对照通过）和522文件来源／证据快照检查通过。详见[按词拖选](text-input-word-drag-20261031.md)。三击、定时边缘滚动、输入法和双向等价性仍未完成。

## 2026-10-31：文字输入框滚动边界

按旧版浏览器textarea的实际范围证据限制共享输入框滚动，修复短文本滚空、极大滚轮算术溢出风险和放大输入框后的过期偏移；绘制与点击共用有效范围，保留原布局和步长。正式Release构建、`--text-tool-check`（退出码0）和522文件来源／证据快照检查通过。详见[文字滚动边界](text-input-scroll-bounds-20261031.md)。窗口外静止指针的持续滚动未复现，仍待验证；三击、输入法和双向等价性仍未完成。

## 2026-10-31：文字输入框按词换行

复用既有Unicode行边界承接旧版textarea按词换行，保留超长词按完整字素拆分、行尾空白与手动换行；绘制、行导航和鼠标选区使用同一坐标。441条英文及中文浏览器行边界对照、派生的原生鼠标／上下／Shift选择、现有文字检查及正式Release构建通过；524文件来源／证据快照检查通过。详见[文字输入按词换行](text-input-word-wrap-20261031.md)。作品文字排版不变，输入法、双向、复杂塑形和其它输入等价性仍有缺口。

## 2026-10-31：多行输入框原生输入法接线

复用MIT UI／laf输入服务，补齐共享多行输入框焦点启停及屏幕光标定位；修复底层代理对算术，避免部分生僻字提交变成其它字符。缓存依赖保留原样，正式构建使用只有算术修正的生成副本。正式Release、`--text-tool-check`及524文件来源／证据快照检查通过，实际窗口消息覆盖中文、Emoji、生僻字及本地撤销链路，IMM上下文检查定位。详见[原生输入法接线](text-input-ime-20261031.md)。真实候选交互、预编辑／取消、组合撤销分组、DPI及双向文字仍待验收。

## 2026-10-31：共享输入框文本剪贴板

补上应用缺失的MIT UI剪贴板delegate，复用clip连接共享输入框与系统文本剪贴板。多行框承接六种复制／剪切／粘贴快捷键、空选区、有效空文本替换、Unicode和换行，并在读写失败时保护文字；沿用本地历史及UTF16样式链路。216条浏览器结果、注入后端的实际多行／单行控件消息及既有文字检查、正式Release与527文件来源检查通过。详见[文本剪贴板](text-input-clipboard-20261031.md)。跨应用系统写入、单行剪切失败回滚、右键菜单及完整文字输入等价性仍未验证。

## 2026-10-31：多行文字框右键编辑菜单

复用现有像素菜单接入撤销／重做、剪切／复制／粘贴／删除／全选，按实际状态禁用；右键及键盘菜单入口保持旧版选区语义，Esc只关闭菜单。162条浏览器范围对照、实际菜单动作／禁用／取消检查及既有文字检查、正式Release和529文件来源检查通过。详见[文字右键菜单](text-input-context-menu-20261031.md)。跨软换行右键、单行Entry右键皮肤、真实输入法及整体文字输入等价性仍有缺口。

## 2026-10-31：单行输入框剪贴板快捷键

按旧版 TextInput／NumberInput 的实际浏览器输入承接六种复制／剪切／粘贴快捷键；空选区剪切不删字，只读可复制，剪切写入失败保留文字及选区，多行粘贴按浏览器替换为空格。复用 MIT Entry 删除／粘贴及一次 Change，修复收起选区粘贴后误选新增文字。正式 Release、`--text-tool-check`（退出码0，含432条单行对照）及531文件来源检查通过。详见[单行剪贴板快捷键](single-line-clipboard-20261031.md)。继承 Entry 的右键菜单命令尚未接入本批保护，真实系统剪贴板锁竞争及整体文字模块仍有缺口。

## 2026-10-31：单行输入框右键编辑菜单

将单行右键及菜单键／Shift+F10接入现有像素菜单，剪切／复制／粘贴复用快捷键的失败保护与换行规范化，补齐删除和全选及只读／空值禁用。菜单保持选区方向，临时失焦不提交数值草稿，关闭后恢复焦点；修复空值残留底层选区导致操作错误启用。单行和多行共用原有 Esc 菜单适配，未改素材或布局。正式 Release、`--text-tool-check`（退出码0，含162条单行右键范围／方向对照）及534文件来源检查通过。详见[单行右键菜单](single-line-context-menu-20261031.md)。上批单行右键剪贴板接线缺口关闭；单行本地撤销／重做、真实输入法及整体文字模块仍未完成。

## 2026-10-31：单行输入框本地撤销与重做

按旧版 TextInput／NumberInput 的实际浏览器行为补齐共享单行输入框的 Ctrl+Z、Ctrl+Y、Ctrl+Shift+Z 和右键撤销／重做。每个控件独立管理历史，连续输入／删除按观测合并，剪切／粘贴独立记录；同值替换可恢复选区，数值草稿不提前提交，程序不同值刷新清除旧历史。正式 Release 构建、`--text-tool-check`（退出码0，99条规范历史对照及既有文字检查）和537文件来源检查通过。详见[单行本地历史](single-line-local-history-20261031.md)。此前单行撤销／重做接线缺口关闭；真实输入法组合历史、普通重新聚焦选择、复杂语言及窄视口滚动等价性仍未完成。

## 2026-10-31：单行输入框普通焦点恢复

按旧版 TextInput／NumberInput 的浏览器焦点语义，直接启用 MIT Entry 已有选区保留能力，普通失焦／重新聚焦保留光标及正反向选择，避免默认全选造成后续输入覆盖全文；业务显式焦点回调、数值提交和菜单临时焦点沿用原路径。135条浏览器观测中125条规范结果通过原生控件回放，包含重新聚焦后替换与撤销分组；10条浏览器历史异常继续排除。正式 Release、最终 `--text-tool-check`（退出码0）及537文件来源检查通过。详见[单行焦点承接](single-line-focus-20261031.md)。普通聚焦选区差异关闭；真实输入法、所有表单键盘遍历、操作系统焦点及DPI组合仍未验收。

## 2026-10-31：单行输入框键盘移动与只读选择

按旧版浏览器真实结果承接左右键收起正反向选区、Shift扩选、Home／End、Ctrl+Home／End和Ctrl+A；直接复用MIT输入命令与字形框。只读维持浏览器无可编辑光标语义，允许全选及Shift调整已有非空选区，普通移动不改变选择。数值上下键和其他命令路径保留。正式Release、最终 `--text-tool-check`（退出码0，437条规范对照及既有文字检查）和537文件来源检查通过。详见[单行键盘移动](single-line-navigation-20261031.md)。跨词、组合字形框、双向文字和真实输入法仍有缺口，未把整个文字模块标为完成。

## 2026-11-01：单行输入框跨词移动与删除

直接复用已迁移多行输入框的浏览器词边界服务，承接单行Ctrl+左右、Ctrl+Shift+左右、Ctrl+Backspace／Delete；有选区先删除选区，单次本地撤销恢复内容和原选择，只读保持原有选择及保护语义。实际Edge新增594条观测，英文／中文／标点／空格及正反向选择的完整1031条规范对照与既有文字检查通过；正式Release、最终 `--text-tool-check`（退出码0）和538文件来源检查通过。详见[单行跨词编辑](single-line-words-20261101.md)。复杂字形框与码点不一一对应时保留原路径，映射、其它语言词典、Ctrl+Shift+Delete及真实输入法未完成，未将整个文字模块标为完成。

## 2026-11-01：单行输入框修饰键删除保护

按实际Windows浏览器input行为，Ctrl+Shift+Backspace／Delete与Alt+Delete保持无删除，Alt+Backspace接入既有本地撤销，避免MIT默认命令误删前词或行尾。无操作不新增历史、不打断输入合并、不清除重做；常规Ctrl跨词删除及ShiftDelete剪切保留。新增680条观测，正式Release与最终 `--text-tool-check`（退出码0，1711条规范对照和既有文字检查）及538文件来源检查通过。详见[修饰键删除保护](single-line-modified-delete-20261101.md)。仅关闭本批单行组合键差异；真实输入法、复杂字形坐标及其他系统快捷键仍未完成。

## 2026-11-01：单行输入框鼠标选择与历史分组

按浏览器实际input行为承接Shift点击锚点、普通／Shift拖动终点和替换撤销；复用Entry定位／捕获，只有选择变化才打断输入历史，同位置点击保留连续输入合并。新增132条观测，正式Release、最终 `--text-tool-check`（退出码0，1843条规范对照及既有文字检查）和538文件来源检查通过。详见[单行鼠标选择](single-line-pointer-selection-20261101.md)。本批覆盖简单ASCII无滚动场景；复杂字形、边缘持续拖动、只读及所有焦点组合仍待承接，未宣称整个文字输入模块完成。

## 2026-11-01：单行输入框双击与按词拖选

复用多行输入框已迁移词边界及尾随空白规则承接单行双击选词，原词范围保存于既有Component Property；拖动沿用Entry定位／滚动后按词扩展，释放保留正反向选区，新按下／按键／失焦清理手势。新增200条浏览器观测，正式Release、最终 `--text-tool-check`（退出码0，2043条规范对照与既有文字检查）及538文件来源检查通过。详见[单行双击与词拖选](single-line-word-selection-20261101.md)。系统物理双击计时、复杂字形映射、边缘滚动及所有只读／焦点组合仍未完成，未将整个输入模块标为完成。

## 2026-11-01：单行输入框点击与绘制定位统一

复用既有Fusion字宽与可见滚动计算，统一普通点击／拖选、双击、按词拖选及右键的最近插入定位；保留Entry捕获／边缘滚动与数值拖动路径，视口内且字形框与码点一一对应时修正左键终点。只读普通点击释放后的无内部可编辑光标行为按实际浏览器承接，Shift保留实际选区。新增400条观测，正式Release、最终 `--text-tool-check`（退出码0，2443条规范对照与既有文字检查）及538文件来源检查通过。详见[绘制与鼠标定位](single-line-painted-hit-20261101.md)。复杂字形／双向文字、中点平局、全部水平滚动和操作系统焦点组合仍未完成。

## 2026-11-01：单行输入框拖选中断与恢复

按旧版浏览器实际顺序事件承接拖选失焦时冻结选区／释放捕获，恢复焦点后替换与撤销保留原范围；键盘移动／提交文字后仍按住鼠标的移动使用新折叠端点。右键按下后真实失焦同时清除临时菜单回焦标记，确保一次真实表单blur。新增24条观测，正式Release、最终 `--text-tool-check`（退出码0，2467条规范对照、右键失焦断言及既有文字检查）和538文件来源检查通过。详见[拖选中断](single-line-pointer-interruption-20261101.md)。完整水平滚动、操作系统取消、任意组合手势和复杂字形仍未完成。

- 2026-11-01：普通单行输入框上下键／翻页键按 legacy 浏览器行为承接；数值框专用路径不变。新增456条浏览器观测，累计2923条规范对照。范围与剩余缺口见 [单行纵向导航](single-line-vertical-navigation-20261101.md)。

- 2026-11-01：输入框扩宽到足以显示全部文字时立即修正旧横向滚动，内容、方向和历史保持不变；实际浏览器24组观测及原生带／不带单位48组检查见 [扩宽显示范围](single-line-resize-scroll-20261101.md)。部分宽度逐像素偏移与复杂字形仍待迁移。

- 2026-11-01：修正共享MIT Entry在2×下混用滚动起点／字宽单位的问题，保留原选择与边缘滚动算法；1×／2×命中及生产输入框边缘拖选范围见 [长文本缩放命中](single-line-scaled-mouse-20261101.md)。滚动定时与逐像素轨迹仍待迁移。

- 2026-11-01：承接普通输入框按住鼠标拖选时混用键盘的延续方式，修正Shift扩选、粘贴、全选及有效撤销／重做；新增682条浏览器观测，累计3605条规范回放，见 [拖选中的键盘操作](single-line-held-pointer-keyboard-20261101.md)。任意复合手势和真实IME仍有缺口。

- 2026-11-01：移除通用单行框默认256字符上限，保留业务显式限制；长值继续输入、粘贴／替换及Undo/Redo新增24条浏览器观测，累计3629条规范回放，见 [默认输入长度](single-line-default-length-20261101.md)。显式限制的UTF16语义、复杂字形与完整IME仍待迁移。

- 2026-11-01：动画帧复制／剪切后源Cel已删除时，剪贴板导出沿用已捕获内容，保留自由实例和资源；复用既有粘贴历史及保存路径，见 [源帧生命周期](frame-clipboard-source-lifetime-20261101.md)。跨工程自由帧资源传递继续明确禁用，旧版亦缺少完整资源协议，未自行定义替代语义。

- 2026-11-01：继续补齐动画帧剪贴板源生命周期：删除源帧后保留复制范围内部Cel／蒙版关联，普通RGBA跨工程帧粘贴补齐附带蒙版及ID映射；复用既有帧事务，核心两套检查与正式Release及自由瓦片交互检查通过。具体范围和未验收场景见[源帧生命周期补充](frame-clipboard-source-lifetime-20261101.md)。跨工程自由瓦片未放开，不表示整个动画模块已完成。

- 2026-11-01：补齐普通图层同工程粘贴帧的自动关联，直接复用已有结构帧事务；拖动复制按最终落点计算继承，首帧之前不错误关联，保留一次历史与剪贴板恢复。核心两套检查、正式Release和现有交互检查通过；具体范围见[帧剪贴板自动关联补充](frame-clipboard-source-lifetime-20261101.md)。没有宣称整个动画模块已完成。

- 2026-11-01：AN-003继续承接普通RGBA跨工程帧粘贴：支持不同画布尺寸与偏移稀疏Surface，保留画布外像素、内部Cel／蒙版关联、时长和属性；目标空槽用目标尺寸，复用Cel粘贴的稀疏预算并在写入前校验。核心、Cel剪贴板及工程保存重开检查、正式Release与现有交互检查通过，范围见[不同尺寸帧粘贴](frame-clipboard-source-lifetime-20261101.md)。索引／灰度转换与跨工程自由瓦片协议仍未完成。

- 2026-11-01：AN-003跨工程普通帧新增图层按旧版portable属性创建，排除源组／层样式／共享内容等源专用引用；Cel按目标kind保留或清理文字等编辑元数据，保留栅格内容。新增普通／文字层、现有普通层接收文字像素、缺少目标组、保存重开和Undo／Redo回归通过；三套相关核心检查、正式Release及现有交互检查通过。详见[目标图层承接补充](frame-clipboard-source-lifetime-20261101.md)。索引／灰度目标转换与特殊跨工程资源协议仍未完成。

- 2026-11-01：继续承接GIF导入时间轴：允许不同画布尺寸、偏移稀疏Surface及源Cel透明度／zIndex，保留原有覆盖时间槽、只追加溢出、独立像素Cel和浮动选区先提交语义。大／小画布与四个起点、属性、保存重开和Undo／Redo检查通过，三套相关检查与正式Release构建通过。详见[GIF导入几何与属性](gif-import-geometry-20261101.md)。RGBA以外目标转换及实际OS拖放未在本批验收。

- 2026-11-01：GIF时间轴导入补齐蒙版／组选中上下文切换及历史：导入后新层立即可绘制，Undo恢复原活动蒙版、隔离与组选中，Redo回到导入层，复用现有历史类型。四组蒙版／隔离场景与三套相关检查通过，正式Release构建通过，详见[GIF导入编辑上下文](gif-import-geometry-20261101.md)。没有将整个GIF或动画模块标记为完成。

- 2026-11-01：AN-003普通帧Alt拖动复制统一复用最终落点插入事务，保留帧／Cel剪贴板，不再先粘贴后重排并影响循环段；一次历史，成功退出旧蒙版编辑。六组剪贴板／落点与Undo／Redo检查、三套相关检查和正式Release构建通过，详见[普通帧拖动复制](frame-clipboard-source-lifetime-20261101.md)。物理Alt拖放及异常取消未在本批新增运行验收。

- 2026-11-01：普通RGBA帧单删／批删／剪切补齐图层和组蒙版清理，保留剩余关联像素，成功及Undo／Redo按旧版退出蒙版编辑。六组关联与保存重开回归、三套相关检查和正式Release构建通过，详见[帧删除附带蒙版](frame-clipboard-source-lifetime-20261101.md)。未声明整个动画模块完成。

- 2026-11-01：普通帧删除／批删／剪切补齐多级关联的中间别名删除处理，绕过被删Cel并保留存活根，区分显式关联和运行期共享；六组链式关联、保存重开和历史回归及三套相关检查、正式Release构建通过。详见[中间帧关联删除](frame-clipboard-source-lifetime-20261101.md)。

- 2026-11-01：普通帧删除／批删／剪切源Cel时补齐透明度、zIndex和可编辑文字保留，复用共享内容移交与历史，更新活动层透明度投影。18组普通／文字／透明内容与两种关联、保存重开及Undo／Redo回归、三套相关检查和正式Release构建通过，详见[关联源帧内容属性](frame-clipboard-source-lifetime-20261101.md)。

- 2026-11-01：普通帧删除／批删／剪切成功后按旧版清画布选区，沿用刷新清理旋转中心，不把选区纳入帧历史；Undo／Redo保持后来选区，最后一帧无操作不清选区。九组回归、三套相关检查与正式Release构建通过，详见[帧删除画布选区](frame-clipboard-source-lifetime-20261101.md)。

- 2026-11-01：普通帧单删清理失效帧／Cel选择并修复范围起点，保留有效选择；批删／剪切清空帧范围与起点，空选择回退活动图层。复用旧版选择规范规则和既有复合历史，八组选择与Undo／Redo回归、三套相关检查、来源覆盖及正式Release构建通过，详见[帧删除时间轴选择](frame-clipboard-source-lifetime-20261101.md)。

- 2026-11-01：普通新建链接帧按旧版选中Cel／帧anchor优先取源，复用右列或addFrame追加；补齐文字属性、组蒙版独立复制及选择／蒙版编辑上下文历史。六组回归、三套相关检查与正式Release通过，详见[链接帧来源与上下文](frame-clipboard-source-lifetime-20261101.md)。特殊图层链接、实际Alt+M及缩时捕获未在本批验收。

- 2026-11-01：链接帧缩时通知延后到链接／组蒙版／上下文和历史全部完成，仅记录一次操作；复用现有复合操作开关及录制队列。六组observer及两组实际Session／PNG回归通过，核心、工程和缩时三套检查、正式Release构建通过，详见[链接帧最终录制](frame-clipboard-source-lifetime-20261101.md)。

- 2026-11-01：批量连接／断开动画单元格补齐规范源的可编辑文字与编辑数据，保留像素和原点、透明度／zIndex并同步活动层投影。八组连接／断开、源／副本、普通／文字层与保存重开及Undo／Redo检查、三套相关测试和正式Release通过，详见[关联单元格可编辑内容](frame-clipboard-source-lifetime-20261101.md)。特殊瓦片关联准入保持。

- 2026-11-01：普通单元格删除／剪切清除旧文字编辑数据，规范被删槽几何与透明度，向存活关联成员移交完整文字／像素／属性；复用既有事务历史。十二组源／副本／同时删除与普通／文字、保存重开及Undo／Redo场景、三套相关检查和正式Release通过，详见[单元格删除内容移交](frame-clipboard-source-lifetime-20261101.md)。

- 2026-11-01：整格Cel粘贴覆盖规范源时，补齐剩余关联成员的文字与编辑数据、透明度／zIndex移交，更新目标活动透明度；复用既有candidate和时间轴历史。八组同工程／跨工程snapshot、根／副本、普通／文字与保存重开及Undo／Redo场景、三套相关检查和正式Release通过，详见[粘贴覆盖关联源](frame-clipboard-source-lifetime-20261101.md)。

- 2026-11-01：普通跨工程Cel粘贴按目标kind适配文字编辑数据，保留文字目标可编辑内容，普通目标仅承接像素；沿用关联和历史事务。八组源／目标类型及源删除、保存重开／历史回归、三套相关检查和正式Release通过，详见[跨工程Cel目标类型](frame-clipboard-source-lifetime-20261101.md)。索引／灰度与特殊跨工程资源协议未扩展。


- 2026-11-01：普通RGBA跨工程整格Cel粘贴补齐附带蒙版、新身份及内部关联映射，覆盖目标槽时保护其他帧原蒙版内容；直接复用特殊Cel粘贴的既有实现及完整时间轴事务。四组覆盖／追加、单副本／关联双格和十二组损坏载荷拒绝、保存重开及Undo／Redo检查、三套相关测试和正式Release构建通过，详见[跨工程Cel附带蒙版](frame-clipboard-source-lifetime-20261101.md)。visible／moveWithOwner按旧版格式在重开时恢复默认，未扩大资源准入。


- 2026-11-01：普通同工程整格Cel粘贴按旧版实际内容类型拒绝文字／像素混贴；粘贴追加帧时，未覆盖的自动关联文字层承接规范源编辑数据和原点。八组类型与拒绝保持、四组关联追加／保存重开／Undo／Redo回归、三套相关测试及正式Release构建通过。详见[同工程粘贴类型与继承](frame-clipboard-source-lifetime-20261101.md)。跨工程仍采用目标类型适配，未扩大特殊资源协议或浮动选区范围。


- 2026-11-01：带像素选区的Cel粘贴按旧版只允许普通未锁定像素目标，在追加帧和预览前拒绝文字等特殊类型，避免像素与文字数据不一致。八组同／跨工程、类型／锁定组合及拒绝保持、成功预览／取消／保存重开／历史回归、三套相关检查和正式Release构建通过，详见[选区Cel粘贴目标限制](frame-clipboard-source-lifetime-20261101.md)。关联Cel拆分行为仍需核对，未声明完整浮动粘贴等价。


- 2026-11-01：带选区Cel粘贴恢复旧版共同源编辑，保留原关联拓扑；普通／稀疏预览按owner聚合多个载荷并逐次叠加，活动目标提升时保留原回滚记录，避免漏贴及重复预览累积。八组根／副本、单／多载荷、稀疏原点和快速／高质量缩放、取消／保存重开／Undo／Redo检查；详见[选区粘贴共同源关联](frame-clipboard-source-lifetime-20261101.md)。仅普通RGBA同层显式关联，未扩大特殊共享域。

  本批八组新增场景、三套相关测试、正式Release及来源覆盖检查均通过；未新增实际UI操作验收。


- 2026-11-01：帧剪贴板重新导出不再回读后来修改的源Cel及蒙版关联，保留复制时内容；物化关联副本时承接规范源opacity／zIndex。八组普通／文字、单副本／含根双帧、修改／删除源根及同／跨工程粘贴、保存重开和历史检查、三套相关测试及正式Release构建通过。详见[复制帧内容快照](frame-clipboard-source-lifetime-20261101.md)。图层／组／tileset结构元数据冻结未在本批承接，特殊资源策略保持。


- 2026-11-01：复制帧时保存图层／组顺序、属性和画布规格元数据，重新导出不受源图层重排／删除或移除组影响；临时拖拽复制恢复原结构快照。四组结构变更及临时剪贴板恢复、跨工程内容／蒙版映射、保存重开／Undo／Redo、三套相关测试和542文件来源覆盖通过。详见[帧剪贴板结构索引快照](frame-clipboard-source-lifetime-20261101.md)。特殊共享资源仍沿用原处理，同工程删除owner后的粘贴未在本批承接。

  本批唯一正式Release程序最终构建通过，仍由 `native/start-native.bat` 启动。


- 2026-11-01：普通同工程帧粘贴按当前owner规范载荷：过滤删除的图层／组，为新层补透明槽，再复用原结构事务及前帧自动关联；不改写跨工程结构快照。八组owner变化／新层自动关联及完整槽、蒙版、保存重开和历史检查、三套相关测试、正式Release与来源覆盖通过，详见[同工程帧粘贴当前图层集合](frame-clipboard-source-lifetime-20261101.md)。特殊资源未扩展，实际UI操作未验收。


- 2026-11-01：普通帧粘贴按旧版退出蒙版编辑，防止粘贴后笔画写入旧帧蒙版；同工程Undo／Redo复用既有蒙版上下文历史，跨工程仅补成功路径。八组同／跨工程、图层／组蒙版和隔离组合及真实笔画、原蒙版保持、保存重开和历史检查，三套相关测试和唯一正式Release构建通过。详见[帧粘贴退出蒙版编辑](frame-clipboard-source-lifetime-20261101.md)。特殊资源与实际UI验收未扩展。


- 2026-11-01：同工程帧粘贴成功后按旧版清理蒙版格选择和锚点，避免误用帧标题点击逻辑将旧格提升为整行，Cel结果分支同样清理；普通标题点击与跨工程逻辑保持。八组Editor粘贴／refresh／历史及空载荷保持回归、唯一正式Release构建和 `--attached-masks-check`（退出码0）通过。详见[帧粘贴清理蒙版格选择](frame-clipboard-source-lifetime-20261101.md)。未执行截图视觉验收。

- 2026-11-01：普通跨工程帧粘贴为新增图层的旧帧空格、目标多余图层的新帧空格继承目标图层透明度，避免默认100%改变后续绘制效果。八组新增／已有层、普通／文字及0%／35%场景，覆盖原链接保持、普通笔画、帧激活投影、保存重开和一次历史Undo／Redo；`free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[跨工程帧粘贴空白格透明度](frame-clipboard-source-lifetime-20261101.md)。空槽存储规格差异仍保留，实际UI操作未验收。


- 2026-11-02：普通跨工程帧粘贴的非活动缺失槽按旧版使用1×1透明Surface，预算按实际空白存储计费，移除画布面积乘全部层帧的密集估算拒绝。八组空格场景增加存储尺寸／原点、范围外绘制及Undo空白内容检查，修正原不同画布测试中要求密集空槽的不等价断言；`free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[非活动帧空格稀疏存储](frame-clipboard-source-lifetime-20261101.md)。活动帧新增层源几何与画笔Undo存储收缩差异仍保留，实际UI未验收。


- 2026-11-02：帧复制快照按旧版捕获活动帧各图层尺寸／偏移，普通跨工程新增层在原活动帧的透明格使用该几何，其余非活动格保持1×1；预算按实际尺寸，缺字段内部载荷回退源工程画布。四组活动帧是否包含于复制范围／偏移组合及切帧冻结、不同目标画布、保存重开、一次历史Undo／Redo，12项无效载荷拒绝和既有 `free-tile-project-tests` 通过；唯一正式Release重编译、542文件来源覆盖及diff检查通过。详见[新增层原活动帧几何](frame-clipboard-source-lifetime-20261101.md)。特殊资源路径与实际UI验收未扩展。


- 2026-11-02：普通同／跨工程帧粘贴Undo按旧版清空单元格选择与锚点，保留原播放位置／帧选择恢复，Redo沿用插入结果选择。八组同／跨工程、复制一／两帧及原单／多格选择、重复历史和保存重开场景，以及既有 `free-tile-project-tests` 通过；唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[帧粘贴Undo选择](frame-clipboard-source-lifetime-20261101.md)。特殊资源与实际UI验收未扩展。


- 2026-11-02：帧批量粘贴自动关联按旧版短路已关联前驱，独立原有源复用现有内容缓存，候选新增源保持私有判断，避免重复扫描同一规范源像素。八组透明／可见、已关联／独立、冷／热缓存的24帧批量场景及保存重开／历史、既有 `free-tile-project-tests` 通过；唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[自动关联内容缓存](frame-clipboard-source-lifetime-20261101.md)。未做耗时基准或新增实际UI验收，结构提交后的重置统计不作为扫描次数证据。


- 2026-11-02：普通同工程帧粘贴为复制后新增图层补1×1／零偏移透明槽，临时预算按实际像素计费，承接旧版非活动缺失槽规则；继续复用前帧自动关联与结构历史。八组owner变化／自动关联场景和四组稀疏范围外绘制／其他帧保持／Undo／Redo／保存重开、既有 `free-tile-project-tests` 通过；唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[同工程缺失帧槽稀疏化](frame-clipboard-source-lifetime-20261101.md)。画笔Undo存储收缩与特殊资源范围未扩展，未新增实际UI验收。


- 2026-11-02：普通跨工程帧粘贴Redo复用既有历史编辑目标，按旧版每次退出蒙版编辑与隔离，修复Undo后进入旧蒙版再Redo仍残留旧目标的问题；Undo侧及创建蒙版历史保持。八组图层／组、隔离开关、一／两帧及真实笔画／原蒙版保持／重复历史／保存重开，既有 `free-tile-project-tests` 通过；唯一正式Release构建、542文件来源覆盖与diff检查通过。详见[跨工程Redo蒙版上下文](frame-clipboard-source-lifetime-20261101.md)。未扩大特殊资源或实际UI验收范围。


- 2026-11-02：删除原规范源后，帧复制为运行时共享存活副本复用原内容物化分支，保留Surface／文字／几何／透明度／zIndex，避免清运行时引用后剪贴板缺失像素。四组普通／文字及单共享叶／含新根双帧、实际删除源、同／跨工程粘贴／保存重开／Undo／Redo，以及既有 `free-tile-project-tests` 通过；唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[运行时共享帧复制](frame-clipboard-source-lifetime-20261101.md)。特殊资源与实际UI验收范围未扩大。

- 2026-11-02：带像素选区剪切多个单元格时，按旧版跳过文字等特殊图层的删除目标，仍复制全部选中内容；复用既有普通像素删除、去重和历史。四组活动普通／文字层、普通目标有／无内容，以及剪贴板、选区保持、保存重开和Undo／Redo检查、既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。详见[多单元格剪切目标过滤](frame-clipboard-source-lifetime-20261101.md)。单Cel与整格剪切保持原语义，实际UI操作未验收。

- 2026-11-02：选区剪切单／多Cel按旧版将删除范围裁到画布与Surface交集，避免剪掉未进入剪贴板的画布外像素，并减少无关像素遍历；复用原蒙版判断、关联源去重和一次历史。四组单／多目标、矩形／带孔蒙版及四侧保留、保存重开、Undo／Redo、既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[选区剪切画布边界](frame-clipboard-source-lifetime-20261101.md)。画布外复制协议未扩展，实际UI操作未验收。

- 2026-11-02：选区Cel粘贴追加帧按旧版补1×1／零偏移透明槽并继承所属图层透明度，旁层保持独立空白，不启用整格粘贴的自动关联。八组同／跨工程、普通／文字旁层和0%／35%透明度及预览取消、一次历史、保存重开／Undo／Redo、既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。详见[选区粘贴追加空槽](frame-clipboard-source-lifetime-20261101.md)。密集预算准入和特殊资源范围保持，实际UI操作未验收。

- 2026-11-02：选区Cel粘贴前置预算改按现有实际Surface像素和新增1×1槽计算，修复稀疏多帧工程被密集画布估算误拒绝；保留256MiB／10000帧上限及后续实际浮动预览预算。八组同／跨工程、追加／不追加与512×512的300帧／1024×1024的70帧稀疏场景，覆盖取消、一次历史、无关槽保持、保存重开及Undo／Redo；既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[稀疏多帧选区粘贴预算](frame-clipboard-source-lifetime-20261101.md)。实际UI与耗时基准未验收，未声明取消全部内存限制。

- 2026-11-02：未追加帧的选区Cel粘贴按旧版区分实际像素修改、仅选区变化及完全无变化；后两者不标记作品修改，完全无变化保留旧redo分支。八组同／跨工程、密集／稀疏及选区变／不变场景，覆盖浮动结束、dirty、历史、保存重开和选区Undo／Redo；既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。详见[无内容变化的粘贴历史](frame-clipboard-source-lifetime-20261101.md)。追加帧无像素变化及预览存储回收未变更，实际UI操作未验收。

- 2026-11-02：选区Cel复制按旧版逐规范源截取世界坐标交集，保留画布外像素，以各截取Surface并集建立共同浮动坐标；快照移除文字等特殊编辑数据，源内容保持。四组普通／文字与矩形／带孔蒙版、不同偏移稀疏源、无交集fallback、移入画布后粘贴、保存重开／Undo／Redo，以及更新后的画布外剪切回归通过；既有 `free-tile-project-tests`、`cel-selection-clipboard-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[选区复制实际边界](frame-clipboard-source-lifetime-20261101.md)。画布外原地粘贴限制未扩展，实际UI操作未验收。

- 2026-11-02：大范围Cel复制复用旧版Set筛选，替代每槽遍历全部选中ID；同一集合用于原有关联重定根，输出仍按图层／帧排序。四组整格／选区与独立／关联、480格逆序选择320格的范围／顺序／锚点／像素／关联自包含／只读状态及既有 `free-tile-project-tests` 通过；唯一正式Release构建、542文件来源覆盖和diff检查通过。详见[大范围复制筛选](frame-clipboard-source-lifetime-20261101.md)。另确认旧版浮动写入本身也裁到画布；未扩大写入范围，未做实际UI或耗时基准验收。

- 2026-11-02：Cel复制继续承接旧版实际timeline.cels遍历与选中结果排序，复用现有ID索引，移除图层×帧网格逐槽查询。大范围回归扩展为八组整格／选区、独立／关联、有序／乱序存储，验证480格选中320格时的输出／顺序／锚点／像素／关联根；既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。详见[复制实际存储遍历](frame-clipboard-source-lifetime-20261101.md)。未执行实际UI或耗时基准验收。

- 2026-11-02：整格Cel粘贴追加帧按旧版补1×1／零偏移透明槽，继承图层透明度，并按实际新增像素计入既有working budget；移除密集画布估算误拒绝，同工程未覆盖层自动关联保持。八组同／跨工程、普通／文字旁层及autoLink开关的1024×1024／70帧稀疏工程，验证像素、独立空格／继承、文字、一次历史、保存重开及Undo／Redo；`free-tile-project-tests` 和更新原密集空槽断言后的 `cel-selection-clipboard-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[整格粘贴稀疏追加槽](frame-clipboard-source-lifetime-20261101.md)。特殊资源未扩展，实际UI与耗时基准未验收。

- 2026-11-02：整格同／跨工程Cel粘贴Redo复用现有历史编辑目标，退出Undo后重新进入的旧蒙版及隔离，按旧版恢复粘贴后的文档编辑目标。八组同／跨工程、图层／组蒙版及隔离开关，覆盖重复Undo／Redo、真实笔画写入Cel、原蒙版保持、保存重开及笔画独立Undo；既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。详见[整格Cel粘贴Redo编辑目标](frame-clipboard-source-lifetime-20261101.md)。蒙版中初次粘贴准入未扩展，实际UI操作未验收。

- 2026-11-02：选区Cel粘贴的像素历史与仅选区历史按旧版恢复文档编辑目标，Undo／Redo退出后来进入的蒙版及隔离；复用现有MaskContextHistory，普通／蒙版浮动路径保持。八组像素变化／仅选区变化、图层／组蒙版及隔离开关，覆盖重复历史、选区／像素／dirty分类、后续真实笔画、原蒙版保持和保存重开；既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[选区Cel历史编辑上下文](frame-clipboard-source-lifetime-20261101.md)。未执行实际UI操作验收。

- 2026-11-02：整格Cel粘贴历史改用已有双侧MaskContextHistory，补齐Undo恢复文档编辑目标，保留原Redo修正；同／跨工程、图层／组蒙版及隔离开关的八组回归两侧都进入蒙版，验证重复历史、原像素／粘贴像素、旧蒙版保持、后续真实笔画和保存重开。既有 `free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[整格Cel粘贴Undo编辑目标](frame-clipboard-source-lifetime-20261101.md)。蒙版中初次粘贴准入未扩展，实际UI操作未验收。

- 2026-11-02：整格Cel粘贴按旧版区分帧选择／锚点：同工程保留，跨工程清空；复用既有历史字段恢复两侧状态。八组同／跨工程、原单／多帧选择、追加／不追加，验证初次结果、重复Undo／Redo、后来锚点覆盖、Cel选择及保存重开结构；既有 `free-tile-project-tests`、`cel-selection-clipboard-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[整格Cel粘贴帧选择](frame-clipboard-source-lifetime-20261101.md)。未执行实际UI操作验收。

- 2026-11-02：整格Cel粘贴按旧版保留图层选择与layerAnchor；Cel锚点同工程保留，跨工程定位结果末尾，既有时间轴历史恢复前后状态。八组同／跨工程、单／多帧原选择、追加／不追加扩展验证图层选择及Cel锚点，重复Undo／Redo、帧选择与保存重开结构保持；`free-tile-project-tests`、`cel-selection-clipboard-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[整格粘贴图层选择与锚点](frame-clipboard-source-lifetime-20261101.md)。未执行实际UI操作验收。

- 2026-11-02：整格Cel粘贴的未覆盖自动关联层，对原有规范源复用现有内容缓存，候选新增源保留私有判断，既有显式关联短路保持；依据旧版inheritAnimationFrameCelLinks内容缓存路径。稀疏追加场景扩展16组同／跨工程、普通／文字、autoLink和透明／可见独立源，验证空源不启动关联及原有像素／属性／历史／保存重开。`free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖与diff检查通过。详见[整格粘贴自动关联内容缓存](frame-clipboard-source-lifetime-20261101.md)。未执行实际UI、耗时或扫描计数验收。

- 2026-11-02：整格同工程Cel粘贴按旧版当前源图层／帧ID重算相对位置，复制内容与持有载荷不改；跨工程和选区路径保持冻结偏移，源owner缺失不执行同工程整格粘贴。四组同／跨工程、追加／不追加的实际帧重排回归，验证新旧间隔、目标像素／选择、结构和一次历史／保存重开／UndoRedo；`free-tile-project-tests`、`cel-selection-clipboard-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[整格同工程当前源位置](frame-clipboard-source-lifetime-20261101.md)。图层重排及删除源未新增实际回归，实际UI操作未验收。

- 2026-11-02：整格 Cel 粘贴按旧版在图层／帧落点越界时直接拒绝，不抛出合法载荷映射异常；补齐图层重排后同工程当前偏移、跨工程冻结偏移，以及删除源图层／帧的锚点／非锚点拒绝。八组新增场景检查无副作用拒绝或成功后的像素、一次历史、保存重开和 Undo／Redo；`free-tile-project-tests`、`cel-selection-clipboard-tests` 与唯一正式 Release 构建通过。详见[图层重排边界与删除源拒绝](frame-clipboard-source-lifetime-20261101.md)。未执行实际 UI 操作验收。

- 2026-11-02：整帧复制承接 legacy 的 selectedIds Set 筛选，用同一哈希集合处理帧筛选及复制 Cel／蒙版 ID 收集，减少每个对象反复扫描已选列表；保留时间轴输出顺序及原快照／关联处理。既有 `free-tile-project-tests`、唯一正式 Release 构建、542 文件来源覆盖及 diff 检查通过。详见[整帧复制选择集合](frame-clipboard-source-lifetime-20261101.md)。逐帧载荷扫描未调整，未执行耗时基准或实际 UI 验收。

- 2026-11-02：普通同／跨工程整帧粘贴按 legacy 保留原图层行选择及 layerAnchor，继续复用原事务与历史；单帧／多帧选择规则、同工程蒙版行清理和 Undo 清空 Cel 选择保持。八组扩展场景覆盖单／多图层行、一次历史、Undo／Redo、重复 Undo、原像素及保存重开；`free-tile-project-tests`、唯一正式 Release 构建、542 文件来源覆盖与 diff 检查通过。详见[整帧粘贴保留图层选择](frame-clipboard-source-lifetime-20261101.md)。特殊资源路径未扩展，未做实际 UI 验收。

- 2026-11-02：帧粘贴界面入口按 legacy 直接显示文档事务的帧／Cel选择，不再借用帧标题点击的 markFrameSelection，避免跨工程已有蒙版格被提升为owner行并清空图层选择；普通帧标题点击和同工程蒙版选择清理保持。正式程序 `--cel-clipboard-check` 通过，含四组同／跨工程、一／两帧的空载荷、图层行、蒙版选择、显示标记及Undo／Redo回归；唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[帧粘贴蒙版选择入口](frame-clipboard-source-lifetime-20261101.md)。未做截图外观或手动操作验收。

- 2026-11-02：GIF 导入按 legacy 采用非活动1×1空槽并继承旧层透明度；新图层未覆盖的原活动槽承接源活动图层几何。同步按实际存储计算既有working budget，移除密集全画布估算误拒绝，保留层／帧／内存上限。六组1024×1024／80帧／两层、起点0／79／80及0%／35%透明度场景，验证新旧空槽几何、导入像素与时间、保存重开／UndoRedo及空槽远点绘制；`free-tile-project-tests`、唯一正式Release构建、542文件来源覆盖及diff检查通过。详见[GIF稀疏空槽和预算](gif-import-geometry-20261101.md)。RGBA之外转换和实际OS拖放未扩展。

- 2026-11-02：GIF拖放导入成功后按legacy清理Editor旧蒙版格／锚点及显示缓存，避免新图层仍受旧蒙版选择影响；失败保留原内容、历史和编辑目标。独立 `--timeline-gif-drop-check` 经已注册LAF拖放回调验证GIF-only预览／移出、实际解码导入、原蒙版像素、选择清理、结构UndoRedo、异尺寸导入及缺失文件失败保护，返回0；唯一正式Release构建、来源覆盖及diff检查通过。详见[GIF拖放选择清理](gif-import-geometry-20261101.md)。自动构造拖放事件，不等同人工资源管理器拖放或截图验收。

- 2026-11-02：GIF导入复用既有Edit和蒙版选择serial通知，按legacy捕获蒙版格选择及独立锚点；导入清空、Undo精确恢复、Redo清空，兼容显式null／首格／末格锚点，其他蒙版操作保留原末格规则。六组图层／组蒙版与三种锚点场景及既有 `free-tile-project-tests`、`attached-masks-tests` 通过；唯一正式Release构建、正式程序 `--timeline-gif-drop-check` 的两格首锚点重复历史检查、542文件来源覆盖及diff检查通过。详见[GIF蒙版选择与锚点历史](gif-import-geometry-20261101.md)。自动构造LAF拖放事件，未做人工资源管理器拖放或截图验收。

- 2026-11-02：GIF导入解除对已有tilemap／free-tile图层的整体拒绝，按legacy ensureAnimationDocument补齐各类可编辑空槽，保留原共享资源、网格、实例、几何及元数据；特殊空槽实际Surface、grid存储和tileset像素计入既有工作预算，失败不改内容／历史。六组grid／free活动层与起点0／1／2、保存重开、两轮UndoRedo、继续绘制及稀疏大画布预算保护，连同既有 `free-tile-project-tests` 通过；正式Release构建、正式程序 `--timeline-gif-drop-check` 两组混合图层入口、542文件来源覆盖与diff检查通过。详见[混合图层GIF导入](gif-import-geometry-20261101.md)。仍限RGBA；自动构造LAF事件，未做人工OS拖放或截图验收。

- 2026-11-02：桌面文件拖放按legacy useAppDocumentIO分流，单GIF命中时间轴导入，多个GIF及其他区域文件走既有openPath多工程生命周期；补齐普通文件投递入口，复用PatternBrushDropPaths的引号／空白／file URI规范化、同批去重及1000ms跨路由重复投递抑制。坏文件收集错误后继续其余文件，保留原dirty工程和已开成功文件，扩展包安装明确提示未迁移。正式Release构建、正式程序 `--timeline-gif-drop-check` 的多GIF／URI／重复投递／已开工程复用／部分失败保护及既有导入回归、542文件来源覆盖与diff检查通过。详见[桌面拖放路由](gif-import-geometry-20261101.md)。未人工拖放或截图验收，不扩大解码器和扩展兼容范围。

- 2026-11-02：桌面拖放服务按legacy将规范化和1000ms投递过滤前移至统一输入入口，在分流前排除旧路径；统一时间源，移除各目的地重复过滤及笔刷URI自行拒绝。旧A+新B组合按过滤后数量分流，单GIF时间轴导入可UndoRedo；新file URI PNG笔刷实际解码、持久化并选中，原作品像素及历史保持。正式Release构建、`--timeline-gif-drop-check`、`--brush-library-panel-check`、542文件来源覆盖与diff检查通过。详见[统一拖放服务](gif-import-geometry-20261101.md)。未人工拖放或截图验收，扩展安装和PSD等缺口保持。

- 2026-11-02：文件→打开按legacy平台窗口接通原生已有ASE／PNG／JPEG／WebP／BMP／GIF及MoonSprite备份读器，提供全部可用格式、ASE、工程与备份、图片四组筛选；多选坏文件收集后继续其余项。PSD未实现的读取显式报缺口，不误当归档损坏。正式Release构建与 `--timeline-gif-drop-check` 通过，含实际Win32四组筛选／默认组／取消状态保护、真实备份拖放／像素／源路径及文件字节不变、PSD失败保护和已有回归；542文件来源覆盖和diff检查通过。详见[打开入口格式与备份](gif-import-geometry-20261101.md)。未人工选择多文件，图片序列检测／合并／偏好仍未接入。

- 2026-11-02：图片序列导入接到文件→打开多选和普通文档拖放，按 legacy 连续编号／补零／目录与扩展／路径别名规则分批，提供文件勾选、1—60000ms、分别打开／合并动画／取消、本次重复和长期记忆。后台解码合成全部成功后加入独立 dirty 无路径工程，保留 RGBA 半透明、帧序与时长，复用导入色板。失败不产生半成品，不覆盖原作品；资源栏目和单GIF时间轴优先级不变。核心回归及工程往返、正式Release构建、正式程序 `--timeline-gif-drop-check` 弹窗与既有拖放回归、545文件来源覆盖及diff检查通过。详见[图片序列导入](image-sequence-import-20261102.md)。保留原生尺寸／预算／解码器限制，未做人工作业或截图外观验收。

- 2026-11-02：文件启动与第二实例转交按 legacy lib.rs／useAppDocumentIO 接入：筛选存在的支持文件，保留备份路径，启动多文件复用既有图片序列／多工程入口；第二进程转交后退出，恢复／显示／请求聚焦已有窗口。Win32必要适配使用命名实例、就绪事件、UTF-16消息与UI队列，模态时等待，保护dirty作品；无文件只唤起，自动检查不接触普通实例。start-native.bat转发文件参数并保留调用方工作目录，唯一exe不变。真实子进程测试、正式Release构建、正式程序 `--timeline-gif-drop-check` 文档路由／模态保护／重复标签与既有回归、548文件来源及diff检查通过。详见[文件启动与已有窗口转交](native-document-launch-20261102.md)。未注册Windows默认文件关联，PSD及扩展安装仍为明确缺口，未人工Explorer验收。

- 2026-11-02：GIF共同读取器按legacy gif-import完整承接透明补丁、画布裁切、背景清理／前帧还原、精确循环应用标识及0／缺失时长100ms；WIC继续解码LZW／交错扫描／局部色表，用有界块扫描获得元数据。导入名沿用完整文件名，GUID身份避免不同目录同名GIF合并；原始GIF不再误存为native ZIP归档，可实际另存工程并保留源文件。保留原生尺寸／帧数限制并检查展开像素预算。真实GIF核心样本与工程往返、正式Release构建、正式 `--timeline-gif-drop-check` 同名独立标签／循环／实际保存及既有文件回归、550文件来源和diff检查通过。详见[GIF读取与另存工程](gif-read-save-20261102.md)。普通openPath仍沿用同步调度，未宣称完整后台性能或所有损坏文件容错等价；未人工验收。

- 2026-11-02：普通ASE／GIF／图片／工程／备份打开复用图片序列后台等待组件，文件读入、解码和私有候选构造在工作线程完成，界面继续事件循环；原有重复路径复用、UI候选发布、批次错误、最近文件和dirty作品保护保持。修复Escape提前结束等待导致future阻塞，系统关闭延后交回原有保存流程。正式Release构建、--timeline-gif-drop-check真实GIF工作线程／UI定时器门控及既有文件回归、550文件来源和diff检查通过。详见[普通文件后台读取](background-document-open-20261102.md)。旧版隐藏加载提示后继续编辑尚未迁移；未做人工或耗时验收。

- 2026-11-02：按 legacy OpenProgressOverlay／openProgress.dismiss，普通文件和图片序列支持关闭加载提示后继续编辑，读取仍完成并沿用原入口打开。共享标题按钮复用legacy关闭图标；候选等表单／保存、笔画与鼠标抓取结束后发布，同路径再次核对避免重复标签；退出请求延后至最外层加载结束，再走既有保存／关闭。正式Release构建、--timeline-gif-drop-check成功／失败／再次成功的隐藏后编辑与撤销、发布门控和退出延后，以及既有文件回归均通过；550文件来源和diff检查通过。详见[隐藏加载提示](background-document-open-20261102.md)。保留栈上串行批次，未承诺任意并发完成顺序、短任务延迟显示或人工外观验收。

- 2026-11-02：普通文件与图片序列加载按legacy open-progress.begin的下一帧规则延后显示，已就绪／首个UI周期内完成的成功和失败不闪弹窗，未完成任务继续显示原有可隐藏提示；原生以一次16ms LAF Timer适配requestAnimationFrame。补齐未显示栈上窗口的display注册清理，避免失效窗口残留。正式Release构建与--timeline-gif-drop-check四组Open事件／候选／错误／状态保护及窗口列表回收回归、既有文件回归、550文件来源和diff检查通过。详见[快速打开不闪进度窗口](background-document-open-20261102.md)。未做人工外观验收，不宣称垂直同步或任意并发完成顺序等价。

- 2026-11-03：工程读器按legacy restoreProjectTimelapse跳过缺失／空缩时载荷、无效尺寸及必要元数据，报告丢失数／保留数和去重原因；普通打开、备份及恢复入口显示旧版精确中文提示并记诊断，原作品与源文件保持。保存重建已保留录制PNG，清理丢弃帧旧载荷，重开不重复报告；保留未知字段、坏PNG、原生尺寸与ZIP／CRC／预算硬错误。真实归档重打包和往返、timelapse-restore-tests、既有timelapse-tests、正式Release构建、--timeline-gif-drop-check实际打开／恢复及既有回归、553文件来源和diff检查通过。详见[缩时记录部分恢复](timelapse-partial-restore-20261103.md)。数值字符串宽松转换、本地chunk修复和人工操作未覆盖。

- 2026-11-03：缩时恢复继续按legacy Number／normalizeTimelapseSettings／validTimelapseReference补齐尺寸和时间的JSON转换、严格布尔／枚举／有限数字设置默认与取整、非数组／非对象缺省、数值评分及嵌入数据优先规则；空嵌入路径报缺失，非字符串dataFile可承接有效本地引用。58组Node Number参考值和13组实际归档变体含保存重开、正式Release构建、--timeline-gif-drop-check扩展实际打开与既有回归、554文件来源和diff检查通过。详见[缩时元数据转换](timelapse-partial-restore-20261103.md)。继续保留原生表示／PNG／容器及预算边界，不宣称全部畸形JS对象转换或本地chunk修复等价，未人工外观验收。

- 2026-11-03：缩时直接读取及预览／导出／便携保存回调共用旧版读取契约，统一缺失引用的精确中文提示；内嵌优先、仅缺失块回退旧目录及坏块报错保持。新增缺失／无效引用、截断／CRC损坏不回退、回调生命周期、不可用录像的普通／恢复归档、便携读取中途失败不修改作品／历史／引用或旧库数据回归；timelapse-tests、唯一正式Release构建、554文件来源覆盖及diff检查通过。详见[本地录像读取与失败保护](timelapse-partial-restore-20261103.md)。未做人工预览／导出或截图验收，未增加视频编码或自动修复。

- 2026-11-03：缩时预览按legacy TimelapseDialog的取消语义忽略旧帧读取成功／失败，缓存命中无需等待旧读取；修正错误／拖动恢复、导出／清空的播放图标状态，打开时承接当前棋盘格配色。正式程序--timeline-gif-drop-check增加可控future的真实弹窗状态回归，连同既有文件／恢复回归返回0；唯一正式Release构建、555文件来源覆盖及diff检查通过。详见[缩时预览切换](timelapse-preview-20261103.md)。未人工或截图验收，保留单工作线程和现有视频编码缺口。

- 2026-11-03：缩时预览和图片导出承接legacy直接读取已有快照的行为，移除原生额外的本机库写入前置；后台发布新增帧时更新进度和操作控件。修复中文路径录像库错误被系统代码页编码后触发bad conversion的问题，保留UTF-8路径／错误码。真实写入失败后正式预览显示及导出窗口取消、实际PNG导出和源状态保护回归通过；唯一正式Release、timelapse-tests、--timeline-gif-drop-check、555文件来源覆盖与diff检查通过。详见[预览不强制写入录像库](timelapse-preview-20261103.md)。工程保存持久化要求保留；未人工／截图验收，视频编码缺口保持。

- 2026-11-03：缩时PNG/JPG图片导出接入旧版文件名、所选目录提示及folderOpen选择按钮；切换格式更新后缀，选路径只更新草稿，提交直接解析编号／冲突，不重复选择。修正多重扩展名被重复清理的问题，保留中文名称；既有后台编码／取消／原子输出保持。正式--timeline-gif-drop-check实际表单、注入选择取消／成功、格式切换及中文多重后缀PNG导出对照返回0；正式Release、555文件来源覆盖及diff检查通过。详见[缩时导出文件名与目录](timelapse-export-location-20261103.md)。未新增实际冲突菜单操作或截图验收，视频编码缺口保持。

- 2026-11-03：清空缩时记录补齐legacy确认弹窗与原中文说明；取消／Esc／标题关闭不清空，确认后复用Session清空当前工程引用、取消旧任务发布并标记元数据dirty，不删除录像库或新增绘画历史。点击前暂停并回到首帧承接旧交互，清空按钮容纳完整旧版文案。正式--timeline-gif-drop-check实际取消／Esc／确认及原图、设置、历史、本地录像字节保护返回0；正式Release、555文件来源和diff检查通过。修复重复回归的命名导出样本碰撞，保留已有文件。详见[清空缩时记录确认](timelapse-clear-confirm-20261103.md)。未人工或截图验收。

- 2026-11-03：缩时图片导出按legacy exportTimelapse先等待新捕获完成，再刷新快照与帧数、规划输出；独立捕获等待不强制迁移已有内嵌PNG。失败保留表单、画作、历史与待处理像素，显式重试可恢复；正式表单打开后追加第二帧的PNG像素检查、timelapse-tests、唯一正式Release、--timeline-gif-drop-check、555文件来源覆盖和diff检查通过。详见[缩时导出捕获等待](timelapse-export-capture-barrier-20261103.md)。未人工或截图验收，视频编码缺口保持。

- 2026-11-03：完成 FS-008 的 MP4 视频导出操作链路：默认 MP4、三档画质及尺寸、按时长／倍率、名称／目录、共享覆盖确认、捕获等待、后台编码进度／取消、失败保留草稿重试及成功路径记忆。复用旧帧采样计划，Windows Media Foundation H.264 适配浏览器录像；同目录临时流完成／刷盘后原子替换，取消和失败保护已有文件。修复忙时焦点，摘要只读元数据不复制录像 PNG。实际 MP4 解码尺寸／首尾颜色／帧时间、取消／失败／替换，正式表单模式切换／失败重试／作品与设置隔离及原图片导出检查通过；timelapse-video-tests、timelapse-tests、唯一正式 Release、--timeline-gif-drop-check、558 文件来源和 diff 检查通过。详见[MP4 视频导出](timelapse-video-export-20261103.md)。WebM 仍未迁移并灰置；不宣称 FS-008 全部完成，未人工或全状态视觉验收。


- 2026-11-03：补齐缩时 WebM 完整导出链路，格式可选，复用画质／时长／倍率、草稿、路径与覆盖、捕获等待、后台进度／取消、失败重试及成功路径记忆。固定 libvpx VP9 优先／VP8 初始化备用和原 libwebm 封装，保留旧码率、几何与帧采样；临时流完成／关闭／刷盘后原子替换，失败与取消保留旧文件。仓库内依赖脚本实际重建通过，修复 Windows 长命令、UTF-8／中文／& 路径及 NASM 输入兼容，不修改上游或另建应用目录。实际 MP4／WebM 解码、时间与颜色、读取缓存、取消／失败／替换，正式表单双格式失败重试与源状态保护通过；timelapse-video-tests、timelapse-tests、唯一正式 Release、--timeline-gif-drop-check、560 文件来源覆盖与 diff 检查通过。详见[WebM 导出](timelapse-webm-export-20261103.md)。不宣称 FS-008 全量验收；未人工截图、长时间运行或强制 VP8 备用初始化验收。

- 2026-11-03：完成PSD分层导入操作链路：普通打开／拖入／重复来源聚焦／不同目录同名独立工程、像素及偏移／中文层名／图层属性／嵌套和空组／蒙版、背景混合、色卡、单帧与clean初态、原生另存及重开、损坏拒绝且保护现有作品／源PSD。将旧版MIT ag-psd31.0.2相关解码适配C++，复用zlib和文档核心，补齐cumulativeBlend原生读写及剪贴合成，ASE有损确认后合成保护画面。13个旧依赖参考样本覆盖Raw／RLE／ZIP／预测及8／16／32位；psd-import-tests、layer-group-compositor-tests、layer-group-io-tests、唯一正式Release、--timeline-gif-drop-check、564文件来源及diff检查通过。详见[PSD分层导入](psd-import-20261103.md)。保留PSDv1、1024画布和256MiB原生预算边界；PSD导出及人工Photoshop／截图矩阵仍未完成，不称文件领域或全软件迁移完成。

- 2026-11-03：完成PSD当前帧分层导出及原格式保存操作链路：导出格式／首选项、比例、路径／覆盖、分时快照、后台编码、取消与原子输出；保留层／组顺序、Unicode、偏移、隐藏／锁定、混合／透明度／剪贴、蒙版及五类可编辑效果。原PSD修改后CtrlS、另存PSD、兼容确认取消／继续PSD／完整MoonSprite、保存队列及较新修订保护复用既有生命周期，最近工程与缩略图同步接入。按legacy MIT ag-psd移植writer／descriptor／PackBits并保留许可；独立旧版读器核对层序、五类效果、缩放及半透明通过。psd-export-tests、psd-import-tests、recent-projects-tests、唯一正式Release、--aseprite-io-check真实入口与568文件来源覆盖通过。详见[PSD导出和保存](psd-export-20261103.md)。PSDv1、30000尺寸及256MiB原生预算明确拒绝超限；尚未承接的特殊图层类型拒绝，未做人工Photoshop／截图／长时间验收，不称文件领域或全迁移完成。

- 2026-11-03：完成普通图片原格式保存与另存完整链路：PNG/JPEG/WebP/BMP/GIF来源CtrlS，GIF完整动画及静态格式当前帧；PNG/JPEG/WebP/SVG/ICO默认保存选项，另存七种图片格式，后缀／覆盖保护、损失取消／继续／完整工程、确认后新增损失拒绝、快照／后台队列／savepoint／失败重试复用。抽取既有兼容弹窗及静态准备函数，修正单层直接像素路径绕过蒙版。image-save-tests、唯一正式Release、--aseprite-save-check六来源／七另存／五默认及失败保护、--aseprite-io-check PSD/ASE回归、573文件来源覆盖通过。详见[普通图片保存](image-source-save-20261103.md)。未人工截图或全格式外部软件验收，保留编码器与原生预算边界，不称全软件完成。

- 2026-11-03：承接legacy按签名优先识别聊天缓存GIF，jpg/jpeg/webp/bmp/png/gif后缀均保留完整动画、时长、像素和来源身份，普通打开／文档拖入／重复来源聚焦／序列读取沿既有入口；ASE/PSD/未知后缀亦优先识别，WebP命名缓存缩略图修复。多帧缓存序列按旧版拒绝，单帧允许；损坏不降级静态图，原格式保存取消保护源字节、确认保持会话动画。gif-open-tests六后缀读器／缩略图／原生往返／序列检查、唯一正式Release、--aseprite-save-check实际拖入／保存／错误保护及既有ASE／图片回归、574文件来源覆盖通过。详见[聊天缓存GIF](chat-gif-open-20261103.md)。未人工聊天软件拖放或截图验收，时间轴仅.gif命中及原生预算保持。

- 2026-11-03：工程备份回档按 legacy 成功后关闭选择窗口，失败保留窗口和作品；实际入口补齐成功／失败、身份与路径、单次事务、UndoRedo和不自动覆盖磁盘工程检查。唯一正式Release及 --project-rollback-check 返回0，574文件来源覆盖通过。详见[回档生命周期](project-rollback-lifecycle-20261103.md)。未人工截图验收，不宣称全部恢复功能完成。

- 2026-11-03：导入色卡承接 legacy 少色图全量／高色图抽样、完整亮度排序、量化重复平均色代表与补足；补齐末色权重过大导致空桶时的停止切分保护，实际旧版对照曾触发原生除零并在修复后通过。静态图／GIF／ASE／PSD 导入颜色名按 zh-CN 原值使用纯编号，不改已有工程名称。58 组实际旧版提色／排序参考、PNG 稀有色与半透明像素／工程往返、5 项 CTest、唯一正式 Release、--aseprite-save-check 与 --aseprite-io-check 均通过；576 文件来源覆盖、需求静态台账和 diff 检查通过。详见[导入色卡行为对齐](imported-palette-parity-20261103.md)。未人工截图／全格式外部软件验收，不称文件、颜色领域或全软件迁移完成；FS-006 本地历史差量记录、持久化和重开恢复仍未迁移。

- 2026-11-03：FS-006 本地历史迁移开始，移植 legacy v2/v3/v4 归档、中央目录分块、精确字节去重／opaque／streaming ZIP、惰性并发快照重建、九种 typed array 差量及完整路径／偏移／类型／坐标校验、已准备转移缓存的 v3/v4 写入。复用现有原生 ZIP 读写器，仅增加历史所需逐资源 level6；工程存储／恢复 level1 保持。旧版实际生成6组归档／3组差量／25组拒绝用例，原生重包交旧版反向精确核对通过；4项归档／保存／恢复CTest、自动恢复连续两次、唯一正式Release与--aseprite-save-check通过，581文件来源覆盖通过。修复恢复测试复用残留目录误判，不删除旧样本。详见[本地历史迁移](local-history-migration-20261103.md)。编辑差量捕获、缺缓存编译、历史窗口安装、750ms后台队列与较新作品保护仍待接入，设置不开放，不称本地历史或整体迁移完成。

- 2026-11-03：FS-006 补齐路径身份／步数／恢复窗口、独立二进制存储及元数据指纹／异步代际保护辅助模块；复用原图片导出原子写入器，Windows 系统 ICU 保留旧版按区域 Unicode 小写。13 身份／17 设置／294 窗口／2 指纹参考、原生双图层双帧工程经实际旧版解码指纹对照及旧版归档反向互读通过，修复指纹图层顺序。6 项保存／恢复／历史 CTest、唯一正式 Release 构建与 --aseprite-save-check 通过；590 文件来源覆盖及需求静态台账通过，strict 仍按迁移缺口失败。详见[本地历史迁移](local-history-migration-20261103.md)。辅助模块尚未接入实际编辑、历史安装、目录生命周期和后台队列，功能仍不启用。

- 2026-11-03：FS-006 增加从现有原生叶子 Document::Edit 获取点／连续段／区域的已提交差量适配器及元数据形状判断；保留规范 cel 路径、别名、存储原点和顺序，仅复制补丁字节。原生跨行连续段转换为旧版逐行范围；编辑前票据拒绝结构／预览／跨提交等不适用情况。8 类实际原生提交（含后台帧及普通／原点映射重叠连续段）输出工程和差量，与旧版实际 commitPixelEdit／captureCommittedHistoryDelta 比较规范补丁完全一致；旧版 hydrate 撤销／重做／重复重做通过。回归复现并修复已有原生重叠连续段撤销顺序错误，普通／映射路径改按旧版逆序撤销；原生精确像素恢复、5 项相关 CTest、唯一正式 Release 及 --aseprite-save-check 通过；594 文件来源覆盖／静态台账／diff 检查通过。详见[本地历史迁移](local-history-migration-20261103.md)。尚未接入真实服务事件、结构检查点、历史安装及后台队列，功能继续关闭。

- 2026-11-03：FS-006 增加旧版 LatestTaskQueue 的原生 future 适配、750ms／压力 timer 及 PreparedWriter，将已有归档器和原子存储接后台。实际旧版 queue／schedule／flush 函数参考、23 个计时状态、共享待写完成结果／释放被替换数据／失败继续／文件锁保护／关闭 drain 通过；4 项本地历史 CTest、旧版实际反向读取后台写出的 .history、唯一正式 Release 和 --aseprite-save-check 通过；599 文件来源覆盖及静态台账／diff 检查通过，strict 仍失败。详见[本地历史迁移](local-history-migration-20261103.md)。仅接收已准备转移，真实会话事件、结构检查点、按身份共享队列、旧版 weak 去重、预算重基及重开历史安装仍未接入，功能继续关闭。

- 2026-11-04：FS-006 同拓扑 RGBA 差量接入现有 Document::Edit／UndoRedo，增加不可变部分通道字节载荷、规范 owner／链接别名解析、整批准备与 RestoreTicket 再检查、原生历史位置安装；保留当前检查点身份／录像／视图及安装时 dirty／计数。八类已提交差量安装与重复 UndoRedo、实际 legacy 编译器的偏移1／2单通道转移从三个位置恢复、新编辑截断重做、后置错误／预算／字节冻结／代际保护通过；7项相关 CTest、604文件来源覆盖与静态台账通过。该批像素差量的唯一正式程序重编译成功，--aseprite-save-check 返回0；后续元数据／计数修正需独立验收。详见[本地历史迁移](local-history-migration-20261103.md)。仅接入已准备像素转移，属性／结构／增量检查点物化和真实重开服务仍不完整，功能继续关闭。

- 2026-11-04（实现中，待运行）：同一历史载荷增加 dirty／时间戳／statistics 标量及兼容别名；实际 legacy 混合像素／元数据、纯元数据和别名重叠参考已生成并通过旧版 hydrate。发现并修正原生统计上限饱和与旧版先归一化后累加的差异，新增原生直接补丁／正常导航／8组实际计数参考及普通／蒙版笔画边界检查。上一批正式构建及 --aseprite-save-check 已通过，当前正在构建元数据／计数修正和新增检查，尚未取得新增运行结果；不以此前七项通过代替本批验证。605文件来源覆盖通过，FS-006仍为部分承接。

- 2026-11-04：FS-006 dirty／时间戳／statistics 同栈差量、标量别名及逆序撤销完成本批后端验证；按实际 recordDocumentOperation 修正安全整数上限处先归一化后累加、JS Number 舍入，并将蒙版 drawing 放到成功提交后。八组实际计数参考、直接元数据／正常导航／别名重叠、真实普通／蒙版笔画边界及8项相关 CTest 全部通过；605文件来源覆盖通过，strict仍因已知缺口失败。另执行实际旧版恢复服务主体，登记初次安装保留 authoritative 录像与结构项导航替换历史快照的不同语义，输出结构归档参考；原生结构恢复仍待接入。元数据／计数的新正式程序构建将与结构恢复集中进行，当前正式 exe 已通过的是前一像素差量批次。无 UI 激活／截图验收，整体迁移仍不完整。

- 2026-11-04：FS-006 增加已缓存归档的保留窗口结构项准备、增量链物化及当前检查点安装，复用完整工程导入/原生回档载荷和既有撤销栈；按实际旧版区分初次保留authoritative录像与结构导航恢复历史录像，验证全量/增量快照对独立查看帧的不同规则。所有路径准备后移动检查点缓冲，共享相邻结构项载荷；混合像素目标按结构段解析，manifest标签覆盖缓存标签。实际旧版结构窗口/混合归档/查看帧对照、原生所有位置导航和保护、9项相关CTest及工程备份回档专项均通过；605文件来源覆盖与静态台账通过，strict仍失败。扩展检查修正旧project-import锁定图层拒绝预期，验证现有保留锁定且禁画行为。唯一正式 native/build/Release/moonsprite-native.exe 构建成功，--aseprite-save-check 返回0，真实后台线程归档准备与主线程安装专项通过。结构字节成本仍为原生资源估算，余下属性、无缓存编译、真实会话接线/持久化/重开服务仍待迁移，本地历史不启用。详见[本地历史迁移](local-history-migration-20261103.md)。

- 2026-11-04：FS-006 修正异步准备期间只切帧被票据拒绝的问题。原生把渲染/录像失效代际与恢复保护所需mutation代际分开，仅豁免selectFrame最终视图发布，其提交/取消笔画/浮动/渐变/透明度仍走默认保护。保存指纹按真实legacy对live initialDocument重新判定；实际延迟read Promise证明无指纹允许切帧恢复、有指纹可因当前帧不匹配而拒绝，原生真实std::async对照通过，取消笔画仍令旧票据失效。回档/UndoRedo复用预备链接存储以避免重复同步。9项相关CTest与备份回档专项、605来源覆盖/静态台账/diff通过，strict仍1；另记录真实legacy结构项成本供后续精确迁移，未把原生估算当等价。正式程序仍是前批结构恢复版本，本批后台代码待与会话接线集中正式构建。其余视图规范化、精确成本/属性/无缓存编译及完整会话流程仍未完成，FS-006部分承接且功能不启用。详见[本地历史迁移](local-history-migration-20261103.md)。

- 2026-11-04：FS-006 同栈scalar差量扩展工程名称/循环/网格、图层和组名称/说明/开关、帧时长/禁用。准备时绑定规范序列到稳定ID，预留UTF8/UTF32字段容量后按旧版别名顺序及逆序undo应用；跨名称/说明/时间戳Unicode别名和重叠补丁通过实际legacy hydrate。22项actual compile/hydrate属性参考、原生直接应用/普通导航/增量归档恢复、9项相关CTest和备份回档专项通过；605来源覆盖/静态台账/diff通过，strict仍1。opacity/blend/cel、其余资源属性/对象替换、变化原点、精确结构成本/无缓存编译/会话接线仍待迁移；正式程序保持前批已验证结构恢复版本，本地历史未启用。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006 属性差量补齐 layer/group opacity/blend 和 literal cel opacity/zIndex，仅有 celTarget 时投影当前帧透明度。实际旧版双图层双帧/关联cel参考暴露原适配器按图层×帧重排索引的问题；捕获/形状、恢复与工程编码统一保留实际 animation.cels 数组顺序。新增原生保存重开后应用原差量的检查。9项相关CTest、新样本实际legacy互读/原生hydration、备份回档专项、605来源覆盖/静态台账/diff通过；strict仍1。唯一正式程序重编译成功，--aseprite-save-check返回0，包含此前帧代际保护和基础标量迁移。另新增实际旧版raw zIndex与保存clamp的边界参考及待运行原生检查，单独登记后续验证。详见[本地历史迁移](local-history-migration-20261103.md)最新记录。其余资源/完整替换、独立图层原点、精确结构成本、无缓存编译和真实会话接线仍未完成，本地历史保持关闭。


- 2026-11-04：本地历史新增raw zIndex边界与保存序列化对照，实际legacy保留1000/-1000/INT_MAX/INT_MIN补丁值，而encode/decode工程为±999。原生新增检查先复现保存1000与旧版999差异；修正project_encode复用已有normalizeCelZIndex，仅规范保存字段，现场和历史仍保留raw值。opacity 0/1及group opacity 0、直接/正常导航、增量归档恢复、保存重开及编码不修改现场均通过，9项相关CTest、实际旧版重生成互读/原生hydration与备份回档通过；唯一正式程序增量构建成功，--aseprite-save-check返回0；605来源覆盖/静态台账/diff通过，strict因已知缺口仍1。完整记录见[本地历史迁移](local-history-migration-20261103.md)。功能仍未启用，全量迁移继续。


- 2026-11-04：FS-006新增独立快照链预算/不可变重基后端，沿用旧版256MiB软阈值、增量权重、身份去重与前缀重基，不删除可见步骤。保留JS Map插入顺序和平均常数查找、共享delta、在途旧代际及失败原链；native共享引用以迭代删除避免长链析构递归。实际120编辑/117裁剪及六类边界参考、原生像素物化/身份/失败/30000链释放和10项相关CTest通过；最新旧版参考重生成后budget/hydration专项通过；608来源覆盖/静态台账/diff通过，strict仍1。完整文档精确成本仍为外部依赖（测试使用actual oracle），真实捕获/预算/写后重基/缓存与会话接线未完成，不能宣称FS-006闭环。正式程序保持前批02:37已验版，未为未接线后端重复构建。整数组/几何恢复先需承接legacy图层投影与cel存储分离，不以原地覆盖代替。详见[本地历史迁移](local-history-migration-20261103.md)。

- 2026-11-04：FS-006新增historyDocumentBytes逻辑对象图计数核心，承接UTF16/primitive/container/Map、对象与完整backing-buffer身份去重、递归Number分组；原生使用迭代栈，不复制像素。15组真实legacy transfer图及直接actual成本对照通过，含4000px稀疏计数34154且未物化、共享/独立缓冲、孤立UTF16代理项与显式Map/环/短视图探针；cost/budget/hydration三项CTest、611来源覆盖/静态台账/diff通过，strict仍1。native Document字段/身份适配和正式成本接线仍未完成，不能把图遍历核心当作完整文档成本迁移。未重编译正式exe，本地历史继续关闭。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006将精确成本适配推进到真实原生Document的色卡/工程画笔/参考图/切片字段，直接读取当前值及共享buffer身份，不编码整个工程、不复制像素。承接decode后的画笔undefined字段/源坐标形状与UTF16名称；追加失败回收新增图节点。五组实际旧版资源样本及解码后原地修改对照逐字段/整体通过，包含共享参考图、覆盖/颜色缓冲、非BMP名称及原生计数不改变revision/history/像素地址。Release后端和cost/budget/hydration三项CTest、613来源覆盖/静态台账/diff通过，strict仍1。完整根/栅格/图层动画/录像等对象图和DocumentWeigher/结构成本/服务接线继续待迁移；正式exe不变，本地历史不启用。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006录像对象成本适配承接规范化设置/快照/local引用，并补齐存储PNG共享整个ZIP backing的来源关系：Frame保留只读归档身份/视图长度，压缩PNG独立计数；迁入本地库成功清除、失败保留，portable及后台保存替换字节后清除。真实旧版10组录像图（压缩/未压缩/混合/本地及显式状态变化）、逐字段原生对照、正式DocumentSnapshot、实际Session成功/失败/重试和保存重开检查通过；6项CTest及613来源覆盖/静态台账/diff通过，strict仍1。尚缺完整文档其余字段和跨模块身份、DocumentWeigher/结构成本/会话接线。正式exe本批未重编译，后台保存入口未做正式运行验收，本地历史继续关闭。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006统一资源/录像/栅格构图的object/view/backing身份表，事务失败同时撤销节点和身份；从已验证manifest准备初始raw/sparse解码存储布局，保留raw与录像共享整个ZIP、sparse共享runtime及独立4字节占位规则，不展开原生像素。六组真实legacy混合图、两种字段准备顺序、逐surface/整体成本、身份复用/失败重试及36组参考通过；Release后端、cost/budget/hydration三项CTest、615来源覆盖/静态台账/diff通过，strict仍1。完整根/层组/动画/蒙版/瓦片与live来源生命周期、整体预算、DocumentWeigher/结构成本/真实服务接线仍未完成，不宣称native稀疏性能已迁移。正式exe不变，本地历史关闭。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006成本适配补充规范化帧（enabled省略disabled）、循环区间（保留null repeatCount）、活动帧/loop和瓦片集（ID/名称/尺寸/ID与空槽位表/独立pixel buffer）。四组实际legacy工程含四方向/禁用/非BMP/现场元数据修改/两个瓦片集，对照整体与逐字段成本，验证晚期身份冲突事务回滚与重试；累计40图及cost/budget/hydration三项CTest通过，615来源覆盖/需求静态台账/diff通过，strict仍1。完整根/图层组/cel/蒙版等、live形状与存储来源、DocumentWeigher和真实服务仍缺，FS-006保持partial。正式exe未重编译，无UI运行验收，本地历史仍禁用。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006新增初始解码图层组字段存在性计划，保留parentGroupId缺省/null差别；直接读取当前原生组属性和完整样式成本，拓扑不符/非法枚举事务拒绝。七组真实legacy对照覆盖嵌套/可选字段/默认与9种dither、4种kernel、3种position、256-stop及现场修改探针；累计47图、cost/budget/hydration三项CTest和615来源覆盖/需求静态台账/diff通过，strict仍1。原构建目录补充现有VS准确版本配置恢复工具链，无新工程/产物。完整根/图层/cel/蒙版、任意live形状/alias及DocumentWeigher/历史服务仍待迁移；FS-006partial、本地历史UI禁用，未重建正式exe或运行界面验收。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006初始解码成本补齐普通RGBA图层/cel完整对象图，保持图层投影与cel.surface独立、cel原始顺序及链接无自有surface形状、undefined text和storageOrigin字段；与录像共享raw ZIP/稀疏runtime身份。计划绑定Document/revision/活动帧并拒绝陈旧/外部使用，未冒充live适配。八组实际legacy全对象envelope、两种准备顺序/逐字段成本/后期冲突回滚和55累计图通过，Release构建与cost/budget/hydration三项CTest、615来源覆盖/静态台账/diff通过，strict仍1。完整根/特殊层/cel/蒙版/live来源与DocumentWeigher/真实历史服务仍待迁移；FS-006partial、UI禁用，正式exe未重编译，无运行界面验收。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006初始解码成本补齐图层/组蒙版slot与实际mask字段；每mask独立RGBA backing，灰度/同file/linked均不错误共享ZIP，保留moveWithOwner缺省和调用方decoder语言name。七组真实legacy组合样本覆盖存储/压缩/灰度/共享链接/旧内嵌覆盖/中英及像素归一化，累计62图、Release目标及cost/budget/hydration三项CTest、615来源/静态台账/diff通过，strict仍1。完整根/特殊层/cel/live存储与字段/DocumentWeigher/真实历史服务仍待迁移；FS-006partial、UI禁用，未重建正式exe，无界面验收。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006增加初始根部元数据成本形状（名称/活动层/显示网格及可选对称中心/统计/时间戳/outline/持久化layerPanelState），精确承接有序ID过滤去重和active/group/anchor回退，不拿native当前选区代替独立文档字段。九组真实legacy参考逐节点字符串/kind/顺序/整体成本、失败回滚/陈旧拒绝通过；累计71图、Release及cost/budget/hydration三项CTest、615来源覆盖/静态台账/diff通过，strict仍1。完整根/特殊层/cel/live来源与DocumentWeigher/历史服务仍缺，面板与outline运行状态接线未完成；FS-006partial、UI禁用，正式exe不变，无UI验收。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006以单一shared builder完成显式契约下初始普通RGBA文档完整根图组装，保留真实字段顺序/固定空数组/identity与全缓冲去重，显式传入真实decode session ID及mask语言名称。42份实际legacy完整图中34份正式native导入并通过全图身份双向映射/字符串/顺序/bytes及失败回滚；另外8份pixel布局样本验证现有Unsupported准入，不计native迁移成功。累计113实际图、Release及cost/budget/hydration三项CTest、615来源覆盖/静态台账/diff通过，strict仍1。通用live/new Document、其他布局/特殊层/缺省名称及来源生命周期、DocumentWeigher/结构成本/真实历史服务仍缺，FS-006partial、UI禁用，正式exe不变，无界面运行验收。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006初始完整根成本扩展text图层/cel：保留归档raster cache和链接cel自身文本，覆盖UTF16孤立代理项/字体截断、styleRuns的undefined color、box/origin/transform/shear。新增10份真实legacy完整图，9份native全图一致；小数样式偏移对照发现并修正原生导入round→trunc错误。矩形额外枚举属性因TextRect尚丢失而明确拒绝成本适配，保持缺口登记。累计123图/52完整根，其中43份native比对、8份pixel准入拒绝、1份文本矩形适配拒绝。通用live形状/特殊层/DocumentWeigher/真实历史服务仍缺，FS-006partial，UI关闭，正式exe未重建。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：接续补齐文本变换矩形扩展属性，保留UTF16 JSON属性树并在保存时覆盖实际坐标，原生move/undo/redo/save-reopen均对照真实legacy；初始成本保留Object.values字段顺序（含数值索引键和嵌套/转义/孤立代理项），移除上一批矩形拒绝。修正缺坐标变换/缺amount剪切的错误默认值，以及项目JSON孤立代理项写出替换问题，现转义保留；补计原生历史/恢复元数据内存。累计128真实图、57完整文档中49份native全图一致、8份pixel-layout准入拒绝，四份属性移动保存回读与内存增量检查通过；Release五目标和cost/budget/hydration/text-document/text-raster五项CTest、615来源覆盖/需求静态台账/diff通过，strict仍1。其他文本归一化/字体WTF8与live生命周期、特殊层及通用DocumentWeigher/真实历史服务仍缺，FS-006partial、UI关闭、正式exe不变，无运行界面验收。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：文本数据补齐字体WTF8/UTF16保留路径，修复128单元截断字体名在保存前被替换；所有已有text用例升级为逐字段解码/保存回读对照。复用legacy_json_number处理finiteOr字段，保持origin/box/style可选数值/shear的严格finite语义；无效style/transform容器与项、truthy颜色、array/primitive文本元数据按legacy归一化。新增12份真实完整图，累计140图/69完整文档，61份native全根一致、8份pixel准入拒绝；六项目标/CTest及615来源覆盖/需求静态台账/diff通过，strict仍1。超范围origin、glyph像素等价、live生命周期/特殊层/通用weigher和真实历史服务等仍缺，FS-006partial、UI关闭、正式exe不变，无界面验收。详见[本地历史迁移](local-history-migration-20261103.md)。


- 2026-11-04：FS-006初始完整根成本增加background与gradient-map adjustment，沿用归档raster cache/字段顺序、共享渐变成本装配；40份真实legacy案例覆盖6背景预设/repeat边界、beta样式迁移与truthy/literal-true/nullish参数、无stops渐变/9抖动/256 stops/array颜色、共存属性和混合共享像素资源。修正原生无效背景类型错误拒绝、调整enabled/回退和无stops丢mode/dither/reverse。累计180图/109完整文档中101份native全图一致、8份pixel准入拒绝；40例保存重开与完整background/adjustment/layerStyles值检查通过，七项相关CTest及最终cost复跑、615来源覆盖/需求静态台账/diff通过，strict仍1。tilemap/free-tile初始存储、live别名/投影与通用DocumentWeigher/真实历史服务等仍缺，FS-006partial、UI关闭、正式exe不变，无界面验收。详见[本地历史迁移](local-history-migration-20261103.md)。


2026-11-04 tilemap 导入增量：按实际 legacy 解码规则修复网格尺寸 Number 转换、字面布尔翻转与严格数字旋转归一化；原生边界回归及实际 legacy 归档对照通过，tilemap-project CTest 通过。tilemap/free-tile 历史成本图、通用 DocumentWeigher 与本地历史服务仍未完成，FS-006 保持 partial。详见 local-history-migration-20261103.md 最新记录。


2026-11-04 tilemap 初始历史成本图：接入实际重渲染缓冲身份、图层 tileset ID、网格/null 单元格及旧版字段顺序，保留无缓存链接的首次列表归一化。新增20个真实legacy归档，累计200成本图/129完整文档（121原生完整比对、8像素布局门禁）；tilemap网格与活动像素及原生保存重开值对照、成本图双射、两个对应CTest通过。free-tile、live生命周期、通用DocumentWeigher和本地历史服务未完成，FS-006仍partial，正式exe未更新。详见 local-history-migration-20261103.md。


2026-11-04 modern free-tile 初始成本图：接入显式素材集的共享来源数组身份、实例规范字段和独立重渲染缓冲；修复实例source/tileset/tile别名在Timeline校验前归一化、来源sheet名称及7种可选字段显式null拒绝。新增24真实legacy归档，累计224图/153完整文档（145原生完整根图、8像素布局门禁），来源/实例/像素及保存重开对照和两个CTest通过。旧free-tile所有权迁移、链接free-tile、来源归一化/locale、live及DocumentWeigher/服务未完成；FS-006保持partial，正式exe未更新。详见 local-history-migration-20261103.md。


2026-11-04 free-tile来源解析增量：承接旧版布尔状态、实际有限数字透明度限幅、混合模式默认、非安全整数偏移归零、description类型与完整四通道颜色舍入/限幅。新增16真实legacy归档，累计240成本图/169完整文档（161原生比对、8像素布局门禁），40现代free-tile案例均检查来源/实例/像素及保存重开；两个相关CTest通过。来源名称locale、超范围安全整数坐标、旧所有权、链接free-tile、live/通用weigher/服务仍未完成，FS-006保持partial。


2026-11-04 modern free-tile所有权校验：接入素材集ID的JS trim边界、局部来源/sheet唯一性、跨集合资源占用以及1tile/1×1来源sheet和tilemap owner冲突拒绝；14个真实legacy拒绝归档的原生拒绝回归通过。修正既有现代来源测试夹具误用8列及共用sheet，实际原生创建入口已使用1×1；保留异常归档拒绝检查。240成本图/169完整文档有效回归和两个相关CTest通过，615来源覆盖/diff通过，strict继续失败。旧所有权转换、链接free-tile、live/DocumentWeigher/服务未完成，正式exe未更新。


2026-11-04 modern free-tile实例引用类型：承接严格非空字符串sourceId、任何字符串tileId（含空串）拒绝、非字符串tileId忽略的旧版规则。新增6有效/9拒绝真实legacy归档，累计246成本图/175完整文档（167原生比对、8像素布局门禁），46现代free-tile有效例及23所有权/引用拒绝归档通过；两个相关CTest、615来源覆盖与diff通过。旧所有权、链接free-tile、locale、live/通用weigher/服务仍未完成，FS-006保持partial，正式exe未更新。


2026-11-04 schema21 free-tile素材集字段：读取入口显式要求非空字符串freeTileSetId及非空来源数组，阻止layer ID自动补值/空来源掩盖非法现代工程；保留独立兼容解析接口。新增14真实legacy拒绝归档，累计37拒绝；246成本图/175完整文档及46现代free-tile有效例和两个相关CTest通过。615来源覆盖/diff通过，strict仍失败；旧schema/资源转换、链接free-tile、locale、live/weigher/服务仍未完成。FS-006仍partial，正式exe未更新。


2026-11-04 多来源free-tile：所有权校验复用sheet索引、别名归一化按layer分组cel；新增5个真实legacy归档覆盖3来源、倒序、别名冲突和共享图层。累计251成本图/180完整文档（172原生比对、8门禁），51现代free-tile有效/37拒绝归档。分别以实际legacy首次解码和保存重开预期对照，保留旧版重名别名的再次归一化行为；成本及free-tile测试通过。旧格式/链接/locale/live/weigher/服务仍未完成，FS-006仍partial、正式exe未更新。


2026-11-04 导入关系校验内存适配：准备State移动进入现有Timeline构造/关系检查，通过后rvalue takeState移回，移除原来的全状态/tileset像素临时副本；消费对象清空索引与缓存。原始像素buffer地址保持、消费后空对象和重建回归通过；四相关目标重建和timeline-model/project-import/local-history-cost/free-tile-project四项CTest通过。615来源覆盖/diff通过，strict仍失败。仅该临时副本消除，无整体内存准入或功能迁移完成声明；FS-006仍partial、正式exe未更新。


2026-11-04 导入cel查询：按旧版lookup边界复用结构化slot与ID索引，缓存链接最终owner；保持原cel序列与显式链，取消像素安装和关联比较中的逐格完整扫描。新增3×192倒序cel原生回归与真实legacy192帧倒序链归档，累计252成本图/181完整文档（173原生比对、8门禁）；三个相关CTest通过。整体导入性能、旧格式/free-tile链接、locale、live/通用weigher/服务未完成，FS-006仍partial，正式exe未更新。


2026-11-04 free-tile JSON 归一化：按实际 legacy 导入丢弃未知 source/instance/cel 字段，保存省略默认旋转/翻转和容器扩展。52 有效归档新增实际保存 manifest 的 sources/freeTiles 完整 JSON 对照；累计253成本图/182完整文档（174原生比对、8门禁），37拒绝归档。相关三目标构建及三个定向CTest通过；615来源覆盖/diff通过，strict仍失败。FS-006仍partial，正式exe未更新；旧格式/链接/locale/live weigher/服务/UI未完成。


2026-11-04 free-tile默认名称：按legacy默认zh-CN将缺失/空/非字符串source名称回退为“图层”，保留空白及Unicode原文；九语言切换仍未接入。修正初始成本对源专属tileset名称的过度trim门禁，要求与source一致。新增11实际legacy归档，累计264图/193文档（185原生比对、8门禁），63有效free-tile/37拒绝归档。三相关测试通过，615来源覆盖/diff通过，strict仍失败；FS-006仍partial、正式exe未更新，其他迁移缺口保留。


2026-11-04 本地历史会话状态机：按实际legacy record/trim迁移提交/形状门禁/分支、撤销重做、两侧裁剪、上限、清空及预算重基形状传递。新增42真实legacy事件对照（普通/0预算），检查快照身份/基础/差量/标签/位置/压力/回调次数及失败事务和弱引用释放；local-history-budget构建/CTest通过。617来源覆盖/diff通过，strict仍失败。尚未接原生settled事件、服务配置/异步写入/诊断与一般live weigher；FS-006仍partial、入口禁用、正式exe未更新。


2026-11-04 已完成编辑适配：CommittedCapture.latest读取绑定historyRevision的真实提交条目，JournalSession.recordSettled使用实际Document形状和committed捕获，拒绝active/stale通知；保留原编辑前票据的严格门禁。8类差量两入口JSON/字节一致、legacy独立验证及真实原生笔画/撤销重做/结构/裁剪/取消会话回归通过。两个相关CTest通过，617来源覆盖/diff通过，strict仍失败。统一settled事件分发、配置/后台服务和一般live成本仍未完成；FS-006入口禁用、正式exe未更新。


2026-11-04 原生历史通知源：Document实现push/undo/redo/trim/clear与组合完成监听器，传递标签/两侧裁剪/代际；运行时回调不随Document复制，支持自取消及闭包状态，恢复安装静默。实际legacy40命令/34事件逐步对照和真实通知到JournalSession操作后适配通过，三个相关CTest通过，618来源覆盖/diff通过，strict仍失败。生产统一settled派发/末两笔合并批次、失败暂停、后台服务及一般live成本仍未完成；FS-006入口禁用、正式exe未更新。


2026-11-04 历史不可变代际准备：按legacy实际直接base相邻判定选择增量或完整checkpoint编码，复用archive，区分cached-null/未命中编译；输出已有packPrepared/Writer所需准备数据和编码checkpoint。六序列legacy对照、实际物化编码/打包重读/像素及失败输入不变回归通过，local-history-budget通过；620来源覆盖/diff通过，strict仍失败。一般compiler/encoder缓存/service写后rebase与settled多事件派发尚未完成；FS-006入口禁用、正式exe未更新。


2026-11-04 历史快照编码缓存：按legacy encodeSnapshot复用同一节点并发/成功结果、失败逐出重试、archive直返；弱owner键避免保留文档/base链，限制每次清理量。实际legacy函数验证和原生并发/失败/null重试/弱生命周期回归通过，local-history-budget通过；620来源覆盖/diff通过，strict仍失败。生产worker编排/写后重基/一般compiler及live成本/settled事件仍未完成；FS-006禁用、正式exe未更新。


2026-11-04 相邻快照差量缓存：按legacy cacheDelta使用有方向弱owner对，区分未命中/null/字节，保留覆盖与独立后继；prepareGeneration消费真实缓存不再编译命中项。旧版函数及原生字节隔离/弱生命周期/150短生命周期对回归通过，local-history-budget通过，620来源覆盖/diff通过；strict仍失败。生产回执/重基缓存迁移、一般compiler、settled派发及live成本仍未完成，FS-006禁用、正式exe未更新。


2026-11-04 历史成功写后重基：按legacy条件仅替换仍可见的已编码checkpoint，重接直接base、保持delta身份并转移shape/相邻差量缓存，重映射已确认record，其他in-flight代际不变。五组实际legacy写后代码对照及回执后继续增量/非法输入回归通过，local-history-budget通过；620来源覆盖/diff通过，strict仍失败。生产回执派发/service/通用compiler与成本/settled事件仍未接入，FS-006禁用、正式exe未更新。


2026-11-04 JournalWriter串联不可变代际准备/编码与转移缓存/后台打包/原子写入及owner成功回执，复用既有单运行+待写替换队列和指纹语义。真实文件系统待写替换、线程、缓存重用、锁文件失败/重试回归通过，local-history-persistence通过；620来源覆盖/diff通过，strict仍失败。Editor service/通用compiler与成本/settled事件和增量重复编码性能缺口保留，FS-006禁用、正式exe未更新。


2026-11-04 打包结果复用：核对 legacy core/local-history-archive.ts 的 packLocalHistory 返回 archive+deltas 及 store/local-history-service.ts 写入前 cacheDelta 调用；原生增加 packPreparedResult，旧 packPrepared 保留为包装器。JournalWriter 直接移动打包得到的实际差量到缓存，移除第二次 encodeDelta。归档回归覆盖返回差量与归档 cachedDeltas/增量 payload 字节一致、增量覆盖陈旧缓存、结构 null 和包装器输出一致。local-history-archive（0.17s）与 local-history-persistence（0.21s）通过；620文件来源覆盖和 diff 检查通过，strict 因现存迁移缺口仍返回1。生产 service、通用 compiler/live成本和 settled 事件仍未完成，FS-006保持禁用，正式exe未更新。


2026-11-04 会话写后派发：enqueueSession 在owner捕获不可变state，仅弱引用JournalSession；后台不读取live会话，owner poll在disk success后调用acknowledge，关闭会话不被写入任务保留。回执逐项隔离异常并在其他已完成项派发后抛首个错误。测试覆盖trimmed根checkpoint/缓存迁移（显式合成encoder，仅验证派发）、锁文件失败保留live链、关闭会话释放、空target拒绝及回调异常隔离。最终local-history-persistence单次通过0.65s。两次最多10次的有界重复验证分别在第8/6次暴露非预期Windows5原子替换失败，位置跨PreparedWriter和JournalWriter；未修改通用atomic writer或添加盲重试，存储可靠性缺口待定位。sessionWrites/latestWrites去重及写记录重映射尚未实现；Editor service/通用compiler/live成本/settled事件仍未完成，FS-006禁用，正式exe未更新。


2026-11-04 单identity会话写入去重：按legacy persistLocalHistory/sameHistoryWrite，仅当session record仍为当前identity最新记录且位置/有序label/显式fingerprint/逐快照owner相同时复用回执（运行中或已完成均可）。另一session/raw写入失效旧记录；待写替换清理被替换记录，已完成失败不阻止重试；成功acknowledge后更新record的重基owner。C++记录使用弱session和弱snapshot比较，避免关闭项目被去重元数据保留。直接提取执行旧版persist/helpers+实际LatestTaskQueue，23次操作/10次实际代际写入对应原生回执ID、pending状态与成功写入计数；额外覆盖重基后去重、锁失败后重试、关闭snapshot释放。local-history-persistence通过0.16s，620来源覆盖/diff通过，strict仍返回1。当前仅单writer/identity；全局registry/256条latest弱元数据上限、restore预置记录与Editor接入仍未完成。通用compiler/live成本/settled事件及Windows5偶发原子替换问题保留，FS-006禁用，正式exe未更新。


2026-11-04 Windows原子写入证据与诊断：核对legacy platform_storage.rs，原生与旧版同用MoveFileExW(REPLACE_EXISTING|WRITE_THROUGH)，旧版无替换重试。用rustc直接包含未修改legacy模块，生成独立测试探针native/build/history-legacy-atomic-probe.rs/.exe；在新建保留目录连续写入不同代际，第35次复现拒绝访问/os error5，日志native/build/history-legacy-atomic-probe.log。因此故障可跨旧/原生实现复现，尚未识别外部占用者或根因，不作为已修复。原生共享binary写入错误改为system_error，立即捕获Windows码并附临时及目标UTF8路径，短写使用ERROR_WRITE_FAULT，去除误导PNG文案；无重试/替换算法变更。锁history回归验证类型/码5或32、两路径、旧字节及owned临时清理。本地历史通过0.19s、image-save0.19s、project-save0.60s、project-save-raster-resources0.34s；620来源覆盖/diff通过，strict仍1。未更新正式exe、未进行UI运行验收，整体迁移/FS-006仍未完成。


2026-11-04 恢复后已写记录登记：核对legacy restoreLocalHistory结尾hasCache&&!writeQueues.has(projectKey)分支。rememberRestored接受已验证ReadResult及裁剪前完整snapshot vector，按writer identity核对并预置缓存对、已完成回执及弱session/latest record；有运行/待写或无cache不登记。恢复未变化时enqueueSession返回相同ready回执且不创建写入目录，裁剪后不误用完整record，另一session写入失效旧去重；实际legacy opaque归档回归覆盖cache命中不编译、busy拒绝及非法identity/count/null。local-history-persistence通过0.46s。仅post-install服务接口，未接Editor恢复；全局registry、一般compiler/live成本/settled事件和Windows5占用根因仍缺。FS-006禁用，正式exe未更新。


2026-11-04 录制协调器：新增LocalHistoryRecording复用JournalSession/PersistTimer/JournalWriter，承接legacy configure监听try(record+schedule)/catch(suspend)、suspend取消计时并释放state、pressure/750ms定时及flush先取消再提交。捕获失败保存exception并暂停本地history，不动Document普通undo/disk历史；诊断sink抛错不逃回提交栈。IO/worker失败保留在ack，不暂停捕获。显式resume接收已完成baseline，不绑定raw listener。回归覆盖真实Document commit后settled捕获失败仍可undo/redo、sink失败、IO准备失败继续record、初始pressure立即/后续不推迟deadline、到期捕获live位置、flush取消/disable/resume。本地历史持久化回归通过，622文件来源覆盖与diff通过，strict仍1。基线捕获/偏好maxEntries设置、一般compiler/live成本、全局registry与settled生产派发/Editor接入仍未完成；Windows5根因保留，FS-006禁用，正式exe未更新。


2026-11-04 生产快照物化/编码：PixelHistory.materialize按legacy materializeLocalHistorySnapshot迭代追溯base、archive decode/Document clone、snapshotFrameId后顺序hydrate redo，直接复用prepare/applyLocalHistoryPixels，不安装普通undo、不逐步编码。未知path/layout仍报错，原生maxEntries限链长。encodeJournalSnapshot对archive直接复用Data、Document直接编码、increment仅在需checkpoint时物化；encodeHistoryProject复用工程编码器，无preview/默认level6、timelapse PNG存储，普通save0/recovery1不变；JournalWriter空encoder现在使用真实默认实现。预算测试六组实际legacy generation plan已切换生产codec，补充源像素/revision/history不变、valid缩时PNG字节存储/reopen、unsupported/tiny budget拒绝和默认writer真实写盘。local-history-budget0.61s/hydration0.20s/persistence0.27s、recovery-codec0.05s、project-save0.65s及raster-resources0.38s均通过；622来源覆盖/diff通过，strict仍1。通用compiler/live成本、其他layout/结构hydrate、全局registry/settled生产派发与Editor/UI尚未完成，Windows5根因保留，FS-006禁用、正式exe未更新。


2026-11-04 通用compiler字节视图核心：直接迁移compileLocalHistoryDelta的类型拒绝、不同长度整段替换、对齐32位跳过、最长1024byte补丁/尾部相等裁剪与bytes计数。输入保留typed view offset/length，输出独立copy的before/after，原生bounds/expandedBytes/maxEntries门禁；不伪造全Document编译。复用TS loader执行实际完整legacy compiler，74组空/相同/对齐与非对齐、1024边界、dense/sparse、Uint16/Uint32/DataView、type change/grow/shrink对照，逐patch offset/内容/计数一致并独立重放得到目标bytes；local-history-budget通过0.87s。对象双向别名映射/primitive Object.is与字段顺序、路径/region/affected元数据及完整runtime Document adapter仍未迁移，Writer compiler继续显式依赖。无Editor/UI启用，正式exe未更新。


2026-11-04 通用对象比较core：compareHistoryObjects迁移Object.is/NaN/正负零、String primitive UTF16计费、双向对象映射/循环、仅root忽略identity字段、按before Object.keys顺序、数组长度/键、非Object prototype退回、替换view aliases，复用74组byte core。输出origins/affected顺序/region frame与normalize标记；native显式DFS及node/property/task/patch/bytes预算。执行实际legacy full compiler产生32组runtime图，逐patch path/value/offset/alias、cost、origin/invalidation完全对照，含field reorder、array hole、共享拆分/合并/循环、Float64字节与共享Object.is、layer/runtime门禁。local-history-budget通过0.78s。图输入需真实身份和字段序，不以project JSON代替；原生Document graph adapter、result->Delta bridge及生产compiler串联仍未完成。FS-006禁用，正式exe未更新。


2026-11-04 compiler结果Delta桥接：historyDifferenceDelta/compileHistoryGraphs把比较结果转为既有Delta+buffers，复用encodeDelta归档。匹配legacy encodeHistoryDelta/JSON.stringify：undefined side省略、非有限number为null、signed-zero为JSON0，保留UTF16/string/path/alias、origins/label/bytes/invalidation/affected/normalize；typed view按可见字节和type写外置buffer，保留expanded/manifest门禁。32组runtime图中23个非null结果的原生ZIP资源集、完整JSON结构和每个buffer字节与实际legacy编码一致；原生decode通过，实际legacy decodeHistoryDelta --verify反读全部23原生产物deepEqual通过。local-history-budget通过1.24s。Document真实runtime graph adapter及Writer生产generic compiler串联仍未完成，FS-006禁用，正式exe未更新。


2026-11-04 共享identity写入登记表：JournalWriterRegistry按legacy writeQueues/sessionWrites/latestWrites统一每个应用history store的写入。相同identity的不同会话复用既有JournalWriter单运行/待写替换；owner派发后释放idle queue，弱session records及snapshot/transition缓存跨queue重建保留。latest弱键按实际rememberLatestWrite插入顺序限定256，命中不刷新顺序；淘汰不取消运行/待写，失败清理不覆盖更新记录，restore遇busy不登记。LocalHistoryRecording增加registry+identity接入，不持有可被idle释放的queue引用。原生使用应用持有的单服务实例适配renderer模块全局，Editor实例化及生产调用尚未接入。

直接执行旧版persist、rememberLatestWrite和restore登记代码块及实际LatestTaskQueue，生成527条观测；原生逐项对照ack身份/queue数量/latest键数量及drain后写入次数，覆盖256淘汰运行identity、跨session待写替换、显式save粘滞与idle清除。补充跨idle queue转移缓存复用、ready去重、关闭session/snapshot释放、worker失败/owner回调错误隔离、失败重试和录制协调器跨会话失效。最终local-history-persistence通过0.25s；625文件来源覆盖及证据快照通过，strict因现存缺口仍1，diff检查通过。日志native/build/history-registry-{build,build-final,tests,tests-final,provenance,strict}.log；构建/测试句柄全部结束。Document真实runtime图adapter/通用compiler、live成本、settled生产事件及Editor/UI接入仍未完成；Windows5原子替换根因保留。FS-006继续partial/入口禁用，正式exe未更新，无UI运行验收。


2026-11-04 解码资源真实比较图：appendDecodedHistoryResourceValues直接读取Document画笔/参考图/切片，为既有比较图追加实际字段名、值、数组长度、字段顺序与完整像素字节；画笔colors/sourceX/sourceY保留enumerable undefined，颜色Uint32/参考图Uint8Clamped/coverage Uint8保持typed tag，透明像素RGB不丢失。共享reference pixel owner在单次capture内复用view节点；捕获拥有独立字节，不用可复用native地址伪造跨capture Object.is身份。画笔metadata尺寸/来源默认值与实际brush不一致明确拒绝；节点/字符串/字节预算失败回滚新增节点，不修改已有owner。

实际legacy createDocument/encodeProject/decodeProject新增12组资源工程对，覆盖空/相等、Unicode/坐标/来源undefined变化、coverage/colors/参考图字节变化、colors有无、尺寸增长、增删资源及两个独立解码参考图。原生逐项打开真实工程、直接构图，再对照legacy runtime图的字段序/标量/字节/别名双射；随后compiler结果与实际legacy Delta编码比较。合计74 byte-view及44 object图；31个非null原生Delta由实际legacy decodeHistoryDelta反读deepEqual通过。补充native共享参考图owner、捕获后源更改不影响字节、undefined、三种预算rollback和metadata分歧拒绝。local-history-budget最终通过0.90s；625来源覆盖/证据快照通过，strict因现有缺口仍1，diff通过。日志native/build/history-resource-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log，全部构建/测试句柄结束。

本次仅decoded resource fragment，不是完整live Document compiler；palette原始entry/order、layer/cel/mask与root元数据、live字段生命周期及Editor/settled接入仍未完成，不能将resource图测试解释为全文档等价。FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收，Windows5原子替换根因仍保留。


2026-11-05 解码动画元数据比较图：appendDecodedHistoryTimelineValues直接构建frames/loopSections/activeFrameId/loop/tilesets的真实值图。enabled帧省略disabled，disabled保留true；repeatCount无限和图块layout空槽为enumerable null；RGBA图块sheet保留Uint8ClampedArray tag与透明RGB原始字节。复用既有tilejson validate并补充decoder的完整slot覆盖要求，拒绝不规范frame/loop/range/direction/repeat/name；free-tile source覆盖后的set名称按实际source核对。抽出内部CompareAppend复用资源构图，并计入已存在节点的文本与去重backing bytes，修正跨片段拼接预算重复从零计数问题；失败只回滚新增节点。

实际legacy createDocument/encodeProject/decodeProject新增17组工程对，原生逐字段序/标量/typed bytes/别名图对照后编译并比较legacy Delta。覆盖duration、disabled字段结构变化、activeFrame/loop、repeat null到9999、四种direction、Unicode名称/range、增加frame/删除loop、tileset像素/名称/slot移动/尺寸/增加/空数组。补充已捕获值不随native duration变动、跨append累计byte预算、node/string rollback、缺slot/未trim名称/无效direction拒绝。合计74 byte-view与61 object图；44个非null原生Delta由实际legacy decodeHistoryDelta反读deepEqual通过。local-history-budget最终通过0.79s，625来源覆盖及证据快照通过，strict因现存缺口仍1，diff通过。日志native/build/history-timeline-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log，全部构建/测试句柄结束。

仅decoded timeline片段；完整Document根对象、palette、layer/cel/mask及live身份/字段生命周期、通用live weigher和Editor/settled生产事件仍未接完。FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收；Windows5替换根因仍保留。


2026-11-05 缩时录制比较图与缺省状态：appendDecodedHistoryRecordingValues直接构造实际normalized timelapse设置/快照键序、原始数字/布尔/字符串、enumerable undefined changeScore、PNG Uint8Array可见字节及local引用。PNG作为opaque bytes，不解码、不读library。核对实际restoreProjectTimelapse发现native此前把缺失/非有限changeScore统一成0；Frame新增historyChangeScoreUndefined保留运行时undefined，同时既有compact排序仍使用0，工程encode省略该JSON值，修正roundtrip语义。local解码直接保留原对象：historyLocalKeys保存实际Stringify键序，比较及重新保存沿用，避免固定顺序替代；未知extension字段仍按已有native门禁拒绝。比较拥有可见字节，完整ZIP backing身份/费用继续由已有cost adapter负责，不把比较图当成transfer-cost图。设置/帧/时间/引用与预算校验失败只回滚新增节点。

实际legacy encode/decode新增16组录制工程对，覆盖三种quality/两种mode、设置变动、空/相等、缺失/NaN/有值score、时间、PNG byte/长度变化、external reference JS-safe大offset、local键序改变及原序patch顺序、embedded转local和增加frame。原生直接打开Document构图，与legacy runtime图逐字段序/值/typed bytes/别名对照后再compile；合计74 byte-view与77 object图，58个非null原生Delta由实际legacy decodeHistoryDelta反读deepEqual通过。实际legacy decodeProject还反读32个native重新保存工程，对照完整timelapse及local Object.keys，证明缺省score及原字段序跨保存保留。native补充捕获后源字节更改隔离、设置/非规范时间/无效local shape拒绝以及预算rollback。

local-history-cost5.80s、local-history-budget1.12s、timelapse0.66s、timelapse-restore0.37s全部通过。625来源覆盖/证据快照通过，strict因现存缺口仍1，diff通过。日志native/build/history-recording-values-{legacy,build,build-final,tests,reverse,provenance,strict}.log；全部构建/测试句柄结束。完整Document图（palette/root/layer/cel/mask）、一般live weigher/字段身份生命周期与Editor/settled生产派发仍未完成；FS-006继续partial/入口禁用，正式exe未更新，无UI运行验收，Windows5原子替换根因保留。


2026-11-05 解码调色板比较图：appendDecodedHistoryPaletteValues以保留的ReadManifest提供实际palette entry/color对象键序、缺失/null/空name以及独立paletteOrder，以Document提供经门禁核对的当前值与规范槽位。复用从prepareEditableImport原逻辑抽出的prepareEditablePalette，不复制或重建完整raster；核对source archive身份、project ID、每个entry及columns/slots/nextId，变化后明确拒绝旧decoded捕获。颜色通道读取原JSON数值；未知entry/color扩展字段拒绝，预算失败回滚新增节点。Windows GetObject宏与WinRT方法冲突已通过局部undef修正。独立paletteOrder与槽位遍历序不一致的既有导入限制仍保留并测试，不能视为该缺口已完成；未实现一般live palette字段生命周期。

实际legacy createDocument/encodeProject/decodeProject及compiler新增13组调色板工程对：相等/空、Unicode与透明RGB、名称缺失/null/空、entry及color键序变化、带转义字段样文本的名称、顺序变更、列数/槽位间隙/nextId、增加/删除颜色。原生打开实际工程并构图，逐字段序、标量、数组长度及别名双射对照，再比完整Delta JSON及外部资源。补充不修改revision、跨append节点/字符串预算回滚、foreign archive身份、已编辑颜色、未知color字段和独立order/slot门禁回归。

local-history-budget通过1.36s，project-import通过0.03s；合计74 byte-view及90 object图，实际legacy decodeHistoryDelta反读66个原生Delta、decodeProject反读32个native重存录制工程均通过。625文件来源覆盖/证据快照通过；strict仍因已登记迁移缺口退出1，diff检查通过。日志native/build/history-palette-values-{build,build-final,tests,reverse,provenance,strict}.log；全部构建/测试句柄结束。仅验证decoded palette片段，完整Document root/layer/cel/mask、一般live比较/成本/身份生命周期及Editor settled生产派发仍未完成；FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收，Windows5原子替换根因保留。


2026-11-05 解码根元数据真实比较图：appendDecodedHistoryMetadataValues追加decoder顺序的schemaVersion、调用方提供的runtime document ID、name/width/height/colorMode/pixelFormat/activeLayerId、已接入空canvasReferences、可选outlineSettings、displaySettings/grid/可选symmetryCenter、statistics、filePath null/dirty false、createdAt/updatedAt和layerPanelState。outline直接迁移legacy normalizeOutlineSettings各字段/颜色/方向默认值及取整钳位；panel直接迁移实际normalizeProjectLayerPanelState的ID过滤、去重、active/group/anchor回退与collapsed数组，独立于native当前UI选择。预算失败回滚新增节点；source身份及native元数据必须一致。缺失时间戳依赖同一decode时钟上下文、空名称依赖实际decoder本地化上下文，当前显式拒绝，未近似推断。完整root字段合成、layer/group/cel/mask和live生命周期仍未接完。

核对实逻辑发现原生工程导入曾误用拖动setter，把对称中心钳位到画布并量化为半像素；legacy normalizeProjectDisplaySettings保留任意有限坐标。新增setImportedSymmetryCenter只校验有限值，createEditableDocument改用该入口；互动setSymmetryCenter维持旧有半像素/画布钳位。比较捕获核对中心（包含源缺省中心）及grid原点的signed-zero语义，变化后拒绝旧捕获。

实际legacy encode/decode/compiler新增19组工程对，覆盖相等/Unicode名称/尺寸、pixelFormat缺省、统计JS安全大整数与非法值归零、dates、grid取整/flags/缺省、任意小数与画布外对称中心/可选字段结构、outline有无/颜色/厚度/方向/所有kernel与position分支（本轮覆盖round/square/horizontal/vertical、inside/outside/both）、非法字段归默认、array对象形态及panel过滤/分组/anchor/collapse。原生逐字段序/标量/数组长度/别名双射对照后再compile和比较完整Delta JSON/resources。补充捕获不改revision、source/metadata/预算rollback、缺失时间戳拒绝、缺省中心变化拒绝、导入坐标保真与工具仍钳位，以及非有限导入中心拒绝。

local-history-budget最终1.19s、project-import0.03s通过；合计74 byte-view及109 object图。实际legacy decodeHistoryDelta反读81个原生Delta；decodeProject反读5个原生重存元数据工程，核对displaySettings/statistics/name/dimensions/format/dates，证明fractional/outside中心跨保存保留；已有32个录制重存工程反读继续通过。625文件来源覆盖/证据快照通过，strict因现有迁移缺口仍退出1，diff检查通过。日志native/build/history-metadata-values-{build,build-final,tests,tests-final,reverse,provenance,strict}.log；全部构建/测试句柄结束。FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收；一般live weigher/身份字段生命周期及Editor settled生产派发、Windows5原子替换根因仍未完成。


2026-11-05 分组/样式及蒙版解码比较片段：appendDecodedHistoryGroupValues逐项构造实际groups键序、可选panelOrder/displayColor/description/parentGroupId/clippingMask/layerStyles/cumulativeBlend及普通标量。共享compareColor/compareGradientMap/compareLayerStyles构建完整规范化样式值（gradient-map、stroke、shadow、innerGlow、colorOverlay、gradientOverlay），为后续layer/cel图合成复用；gradient stop强制opaque RGB、scope为layer、方向按kernel规范，shadow Number转换产生的负零从保留源字段恢复到比较图。源archive身份、组顺序/值/样式signature及父字段presence变化明确拒绝旧decoded捕获；预算失败回滚新增节点。

实际发现并修正两项既有迁移偏差：readColorOverlay原先只接受number且对部分flag严格拒绝，现直接按legacy normalizeLayerStyles的record/Number()/严格true/not-false规则解码，复用legacyjson::number支持数字字符串、null、布尔、数组及NaN fallback，gradient-map颜色仍遵从其独立strict-number规则；JSON array样式解码为默认值，重存不再错误地当成JsonObject解析。父组缺失字段原先被保存为null：ManifestGroup与timeline::Group新增parentGroupIdPresent（原生新建默认存在，解码按HasKey设置），import/snapshot/encode保留该状态，不再从旧archive推断live父字段。显式tree位置写入、复制/粘贴/解组更新presence；moveLayerPanelRows的before回放按旧版applyLayerPanelTree/undo写入null语义处理。直接执行实际legacy moveLayerPanelRows与返回undo/redo产生四组父字段观测，原生逐组核对id/presence/parent；属性可见性撤销保留原缺失字段。其他层级命令的完整字段生命周期/撤销等价性尚未全面审计。

appendDecodedHistoryMaskValues复用validateMasks和normalizedMaskPixel门禁，构造layerMasks/groupMasks数组、slot/owner字段、实际locale名称、正常字段序、可选linkedMaskId/autolink与独立Uint8ClampedArray。每个mask捕获拥有新RGBA字节，即使链接或源资源共享也不伪造JS像素view别名；拒绝未规范化颜色/可见性/moveWithOwner/geometry/name，预算失败回滚。捕获不改document revision，后续源像素变化不改已捕获数据。名字由调用方传入实际decoder locale，不用native UI文本近似。

实际legacy encode/decode/compiler新增17组groups/style与7组mask工程对，合计74 byte-view及133 object图。覆盖空/相等、Unicode/可选元数据、parent缺失/null/重挂/增删组、全部样式设置/Number强制转换/array/null/负零shadow、四种kernel/gradient排序与透明RGB，以及layer/group masks空/相等/尺寸/偏移/flags/灰度bytes/链接和独立链接view。每个工程先对照graph字段序/标量/数组长度/别名双射，再比较完整Delta JSON及资源。首次发现分组测试调用方在追加节点后使用失效vector引用，已改为先完成append、再取得根owner；保留有文件/节点/键序上下文的失败诊断。

最终8项通过：local-history-cost6.37s、local-history-budget2.15s、project-import0.13s、project-save0.92s、project-save-raster-resources0.40s、project-manifest0.32s、document-layer-groups0.06s、document-layer-group-structure0.04s。实际legacy decodeHistoryDelta反读96个原生Delta；decodeProject按legacy canonical encode/decode反读48个native分组/蒙版重存工程（包含array样式与父字段presence）；已有5个metadata和32个录制重存反读继续通过。625文件来源覆盖与证据快照通过，strict因现有迁移缺口仍退出1，diff检查通过。日志native/build/history-group-mask-values-{legacy,build,build-final,build-presence,build-verified,tests-verified,reverse,provenance,strict}.log；全部构建/测试句柄结束。

仍只是decoded片段：空字符串parent在legacy是string而native拓扑折叠为无父，新增实际legacy工程证据并在比较入口显式拒绝；缺省本地化组名仍需真实decoder上下文。完整layer/cel/raster图、一般live身份/字段/成本生命周期及Editor settled生产派发仍未完成，FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收。Windows5原子替换根因仍保留，未用重试掩盖。


2026-11-05 解码栅格存储比较值：扩展既有DecodedHistoryRasterStorage的resource/geometry缓存，新增显式retainComparisonBytes准备模式及appendComparison。默认cost-only模式仍不保留raw像素/payload/offset字节，延续原有成本路径；comparison模式为捕获独立拥有所需数据，不走dense展开。复用既有sparse header/table/entry range/duplicate slot验证，生成实际Int32Array little-endian tileOffsets、Uint8Array payload、tile rectangle visibleBounds或null及runtime字段序。raw按decodePixels(dataFile/encoding/dimensions)键共享Uint8ClampedArray view；sparse按相同键共享runtime对象，而每个surface按historyDocumentTransferView新建独立4byte Uint8Clamped占位view。单次调用组装全部surface保证别名一致，独立调用不伪造跨capture identity；成本图的完整ZIP backing身份仍由既有cost adapter独立处理。节点/字符串/累计bytes失败只回滚新增节点，未知资源/空指针/未准备比较bytes显式拒绝。

实际legacy encodeProject/decodeProject/historyDocumentTransferView/compiler新增12组工程对，合计74 byte-view及145 object图。覆盖raw相等/字节变更/共享cel视图、稀疏空/非空/边缘2x6小块/多tile/变更/空到内容/raw-sparse结构，以及ZIP stored、deflated raw与deflated sparse。原生直接按真实manifest准备storage，对照实际transfer graph键序/标量/typed bytes/array与alias双射后再比较完整Delta JSON及资源。原生安全检查覆盖raw共享视图、sparse独立placeholder但共享runtime、多次捕获新节点、缺少准备/未知resource/null、跨append byte/node/string rollback。当前仅storage片段，不把测试根layers=[]当成实际图层可增量编译证据：真实compiler对未物化runtimeRaster图层仍须返回null，该既有门禁未移除。完整layer/cel字段图、特殊图层rendered storage与实时栅格生命周期尚未接入。

最终local-history-cost通过9.02s，local-history-budget通过2.06s；实际legacy decodeHistoryDelta反读106个原生Delta，48组分组/蒙版、5个metadata与32个录制native重存反读继续通过。625文件来源覆盖及证据快照通过，strict因现存迁移缺口仍退出1，diff检查通过。日志native/build/history-raster-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log；全部构建/测试句柄结束。FS-006保持partial/入口禁用，正式exe未更新，无UI运行验收；一般live比较/成本/字段身份生命周期与Editor settled派发仍待完成，Windows5原子替换根因保留。


2026-11-05 图层/Cel 解码比较片段：新增 appendDecodedHistoryRasterValues，以实际 project-format-decode、normalizeCels、applyFrameSurfaces 与 historyDocumentTransferView 为依据，构造 decoder 顺序的 layer/cel 对象。layer 按活动帧解析链接根后投影 geometry/opacity，保持与 cel.surface 不同的 owner；Cel 保留自身 linkedCelId、非零 zIndex、可选 opacity、显式 text:undefined 和独立 surface 字段序/storageOrigin。复用先前 compareLayerStyles/compareGradientMap 和 DecodedHistoryRasterStorage，一次组装全部 layer/own-cel 存储，保留 raw view 共享、sparse runtime 共享及每个 surface 的独立 placeholder。同时提供 compiler 所需 layer 顺序、width/offset、零 storage origin、runtime 标记及 activeFrameId；只在全部节点构造成功后发布这些元数据。

捕获先核对原生反向 layer 顺序、元数据、Cel 顺序/链接/独立参数/解析后像素、source archive 身份及活动帧；拒绝已改变值、已有 layer 比较元数据及未适配的 text/tilemap/free-tile/linked-layer 情况。支持普通 layer 的样式、背景 canvas/preset 和 adjustment gradient-map。当前只承接 schema21 且原生已有完整 slot 的解码状态；空字符串 groupId、缺失 slot、旧版本 compact-storage、特殊图层渲染与一般 live 生命周期尚未适配，不由此宣称完整 layer 能力。预算失败回滚新增节点并保留已有 owner 与比较元数据；捕获拥有独立字节，跨捕获不复用 identity。

实际 legacy encodeProject/decodeProject/historyDocumentTransferView/compiler 新增21组 layer 工程对，累计74 byte-view及166 object图。覆盖相等/Unicode/可选属性、活动Cel opacity（含缺失和零）、像素/geometry/zIndex/group/style、canvas与preset背景、adjustment、非活动Cel、活动帧切换、链接Cel及其活动投影、多个layer及稀疏空/非空/变化。测试先逐项核对 graph 键序/标量/typed bytes/alias 双射、layer invalidation geometry/activeFrameId，再比较完整非null Delta JSON与外部资源。真实 layers 含 runtimeRaster 时仍按旧版返回null，未以 layers=[] 的存储片段替代该验收。

原生安全检查新增 stale source/名称/描述/flags/style/Cel opacity/zIndex/offset/pixel/活动帧拒绝、capture不改revision、layer与surface独立owner但共享raw view、显式undefined、跨capture独立bytes，以及storage完成后owner预算失败的事务回滚。local-history-budget最终通过2.10s；实际legacy反读115个原生Delta，已有48个group/mask、5个metadata、32个recording原生重存工程反读继续通过。625文件来源覆盖/证据快照通过；strict因既有迁移缺口仍退出1；diff检查通过。日志 native/build/history-layer-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log；所有构建/测试句柄均结束。本轮只构建测试目标，正式exe未更新，无UI运行验收。

后续仍需完整Document root合成、特殊/rendered layer和linked-layer共享同步、一般实时对象身份/可选字段生命周期/成本及Editor settled生产派发。FS-006维持partial且入口禁用；Windows5原子替换问题根因仍未解决。整体“完成软件所有功能迁移”目标保持进行中。


2026-11-05 初始解码完整根对象比较：新增 decodedHistoryComparison，复用此前 metadata/raster/group/palette/resources/timeline/masks/recording 全部比较片段，沿用 InitialHistoryDocumentCost 的 HistoryDecodeContext（真实运行时document ID与decoder locale蒙版名）。按实际 project-format-decode 的根字段顺序合成：schema/id/name/dimensions/mode/format、layers/groups/active、palette/layout/resources、canvasReferences/tilesets、animation（frames/cels/layerMasks/groupMasks/loopSections/activeFrameId/loop）、可选outline、display/statistics/recording/slices、filePath/dirty/dates，最后追加layerPanelState。返回独立拥有的graph，不改变Document；保留raster提供的layer invalidation metadata及资源view/runtime别名。metadata临时owner不在返回root可达路径内，但累计node/string/byte预算仍包含该分配；没有把比较所需的紧凑bytes当作JS完整backing内存成本。

实际legacy工程新增21组完整文档对，累计74 byte-view和187 object图。覆盖相等、name、pixels、layer/opacity、brush/reference/slices、palette/layout、grid/outline/symmetry、statistics/dates、groups/style/panel、frame duration/active/linked cel、recording、tilesets、layer/group masks/linked mask、adjustment、background，以及sparse gate和多领域同时变更。每份原生graph先对照真实decodeProject/historyDocumentTransferView的全部字段序/标量/typed bytes/对象alias双射及layer geometry/activeFrame；再比较actual compiler完整非null Delta JSON/resources。另从相同真实decoded document读取historyDocumentBytes，42份before/after均与同一decode context下既有InitialHistoryDocumentCost一致，包含栅格和recording共享ZIP backing场景。

新增安全检查：不同runtime ID的独立捕获仍受root-only id exclusion且编译为空Delta；不同capture字节独立拥有；整图累计byte/string及最终root node预算超限拒绝；缺少ID/实际mask名称、source archive不符拒绝；捕获不改revision/history；原生资源之后变化或后续捕获失败不改已返回graph。local-history-budget最终通过1.91s。actual legacy decodeHistoryDelta反读122个原生Delta；既有48个group/mask、5个metadata及32个recording原生重存反读继续通过。625文件来源覆盖/证据快照通过，strict因已登记迁移缺口仍退出1，diff检查通过。日志 native/build/history-document-values-{legacy,build,build-final,tests,tests-final,reverse,provenance,strict}.log；全部构建/测试句柄结束。本轮只构建测试目标，正式exe未更新，无UI运行验收。

本阶段完成的是已有门禁内的初始decoded根对象组装。仍未支持rendered text/tilemap/free-tile和linked-layer同步比较、缺失timeline slot、任意live对象identity/可选字段生命周期、解码本地化/时钟fallback上下文，以及一般live成本与Editor settled生产派发。后续须以此为起点补齐这些能力；不得把初始graph直接绑定生产实时编辑。FS-006保持partial/入口禁用，整体功能迁移目标进行中；Windows5原子替换根因仍未解决。


2026-11-05 文字解码比较片段：compareTextCel接入完整decoded根对象，保留UTF16内容、字体128码元截断、样式区间显式color:undefined、变换矩形扩展字段与JS键序、取整/截断负零，复用既有textjson键序解析。15组实际legacy工程对覆盖文字/字体/代理码元/布局/重叠样式/矩形扩展/链接帧/稀疏及原JSON数值强制转换。完整graph字段序、标量、typed bytes、alias及同上下文historyDocumentBytes逐项对照。发现并修复历史增量编译及归档Stringify的孤立代理码元UTF8替换：javascriptJsonUtf8按JSON.stringify转义孤立代理码元、保留合法配对；实际legacy反读129个原生Delta。另修正无效transforms过滤为空后再次normalize省略字段的成本与比较语义。新增stale text/font/color/origin/transform拒绝、预算回滚及捕获隔离检查。
local-history-cost6.63s、local-history-budget2.09s、local-history-archive0.07s通过。625来源覆盖通过，strict仍因现存迁移缺口退出1。日志history-text-values-{legacy,build-final,build-verified,tests,ctest,reverse,provenance,strict}。只构建测试目标，正式exe未更新，无UI验收。特殊tilemap/free-tile/linked-layer、任意live身份生命周期及Editor settled生产派发仍待完成，FS-006保持partial/入口禁用。


2026-11-05 tilemap解码比较：appendDecodedHistoryRasterValues接入tiles::render，依据source manifest图块集渲染并核对原生resolved surface与grid，拒绝原生图块集值变化。每个实际有surface的Cel独立拥有新RGBA view，活动layer共享所属Cel view；不复用存档raw/sparse缓存替代渲染结果。rendered surface不含storageOrigin/runtimeRaster；layer tilemapTilesetId及Cel tilemap/text顺序、cells空槽/flag/rotation沿用真实decoder。无数据链接Cel保留首次normalize的dense字段序/manifest cell序及sparse省略语义；原生额外渲染surface不改变返回旧版字段形态。复用现有原生tiles::render，无新渲染算法。避免surfaceFor复制普通栅格，按引用读取源/渲染存储。
实际legacy新增15组完整工程对，累计74 byte-view与217 object图，覆盖空/非空/尺寸/4种旋转与翻转/图块像素/链接、链接元数据none/sparse/dense/surface及乱序dense。完整graph逐字段序/标量/typed bytes/alias/geometry与同上下文transfer cost核对后再compile；132个原生Delta由actual legacy decodeHistoryDelta反读通过。新增stale cell/rotation/tileset pixel拒绝、layer-Cel view共享、rendered无storageOrigin及预算失败回滚。4项回归通过：local-history-cost6.07s、local-history-budget1.86s、local-history-archive0.06s、tilemap-project0.56s。625来源覆盖通过；strict因已登记缺口仍退出1。日志history-tilemap-values-{legacy,build-final,tests-final,ctest,reverse,provenance,strict}。仅测试构建，正式exe未更新，无UI运行验收。
仍需free-tile与linked-layer比较、一般live身份/字段生命周期与成本、Editor settled生产事件和完整持久化恢复服务，缺省locale/clock及缺失timeline slot等门禁仍保留。FS-006维持partial/入口禁用，Windows5原子替换根因仍待处理；不代表整体功能迁移完成。


2026-11-05 现代free-tile解码比较：完整decoded根对象接入自由图块来源和实例值图。仅free-tile存在时复用prepareEditableImport完成已迁移的ownership/名称/alias规范化，复用free_tiles::render生成真实像素；普通raster/tilemap不额外prepare。核对原生实例、来源及规范化图块集内容，拒绝过期捕获。来源数组按setId共享，layer/Cel渲染视图沿用所属Cel身份；source描述/颜色可选，instance opacity/blend与非零变换字段按实际decoder顺序构造，rendered surface省略storageOrigin/runtimeRaster。历史legacy source与链接free-tile Cel仍受原导入门禁，未冒充已完成。
实际legacy新增18组完整工程对，累计74 byte-view与235 object图，覆盖空/相等、位置、source metadata/name/hidden、instance metadata、4种变换、来源别名、共享layer、像素、半透明叠加、多source及顺序、未知字段规范化。完整字段序/值/typed bytes/alias/geometry及同上下文historyDocumentBytes对照后再compile；139个原生Delta被actual legacy decodeHistoryDelta反读通过。新增stale实例位置/透明度、source名称/offset、tileset pixels拒绝及字节/节点预算回滚，layer与Cel view共享检查。
4项回归通过：local-history-cost5.53s、local-history-budget2.13s、local-history-archive0.06s、free-tile-project10.75s。625来源覆盖/证据快照通过，strict仍因已登记缺口退出1，diff通过。日志history-free-values-{legacy,build-final,tests-final,ctest,reverse,provenance,strict}；全部构建/测试句柄结束。仅测试目标构建，正式exe未更新，无UI运行验收。
整体所有功能迁移仍未完成。下一步仍需linked-layer比较同步、链接free-tile与历史ownership导入、一般live对象身份/字段生命周期/成本及Editor settled生产事件与恢复服务。缺失timeline slot、locale/clock等门禁和Windows5原子替换根因继续保留；FS-006为partial且入口禁用。


2026-11-05 linked-layer初始比较：允许普通链接栅格layer，linkedContentId位于name之后，复用既有DecodedHistoryRasterStorage保留shared view/runtime及各自owner与偏移。真实decodeProject只校验链接storage identity，refreshActiveAnimationFrame不会调用normalizeLinkedLayerMetadata；因此初始decoded各层displayColor的原值/presence必须保留，后续ensureAnimationDocument才同步。原生现有导入已同步颜色：捕获核对同步后的第一有效颜色，却以源字段构建比较图；InitialHistoryRasterObjects成本同样改用原decoded字段presence。未改变原生导入时序，也不将此差异宣称完全迁移。
实际legacy新增11组完整工程对，累计74 byte-view与246 object图。覆盖相等/metadata/pixels/color/独立offset、singleton/unlink、sparse、原JSON冲突颜色/缺失首层颜色、多帧。逐字段序/值/typed bytes/alias/geometry与同上下文historyDocumentBytes对照后compile；143个原生Delta由actual legacy反读通过。新增stale linked ID/description/color/offset拒绝、共享view/独立owner及节点预算回滚检查；图值错误增加source/node上下文诊断。
local-history-cost6.21s、local-history-budget2.58s、linked-layers0.39s通过。625来源覆盖/证据快照通过，strict仍因已登记迁移缺口退出1，diff通过。日志history-linked-values-{legacy,build-final,tests-final,ctest,reverse,provenance,strict}。全部构建/测试句柄结束；只构建测试目标，正式exe未更新，无UI验收。
尚未迁移任意实时对象identity/字段生命周期及成本、Editor settled生产派发/完整持久化重开服务、linked free-tile/历史ownership、缺失timeline slot/locale/clock等门禁；Windows5原子替换根因保留。FS-006继续partial且入口禁用，整体所有功能迁移目标保持进行中。


2026-11-05 链接颜色导入/保存时序纠正：本轮追查linked free-tile发现门禁贯穿Timeline::validateFreeTileState、实例放置要求own surface、连接/断开/拖拽入口及复制帧扩展，不能只解除prepareEditableImport拒绝；仍明确未迁移。沿上轮真实legacy证据修正已定位偏差：decodeProject保留每层displayColor，后续ensureAnimationDocument才同步。移除原生prepareEditableImport过早linkedColors同步，比较适配改回直接核对源颜色，无需source/live两套值。新增三组直接prepare/Document检查，覆盖第一/第二层缺颜色和冲突颜色。
实际legacy encodeProject会ensureAnimationDocument，因此保存输出按decoder bottom-to-top顺序取链接组第一有效颜色。project_encode只规范化输出、不修改Document；对11组完整linked before/after工程生成22份原生重存，actual legacy decode反读与canonical legacy encode/decode逐层比较颜色/presence；编码前后原生revision及各层颜色保持。此前初始graph/transfer cost仍对照原decoded状态，143个原生Delta反读继续通过。
4项最终回归通过：local-history-budget2.50s、project-import0.03s、project-save0.57s、linked-layers0.04s。625来源覆盖/证据快照通过，strict因现有缺口仍退出1，diff通过。日志linked-color-decode-{build-final,build-verified,tests,reverse,ctest,provenance,strict}。全部构建/测试句柄结束；正式exe未更新，无UI验收。
整体功能迁移未完成。linked free-tile仍需完整数据/交互/撤销生命周期迁移，原生live身份/成本/settled事件及完整恢复服务尚未接入，FS-006继续partial/入口禁用；Windows5原子替换根因仍保留。


2026-11-05 显式空groupId解码形状：核对legacy project-format-decode.ts:376和458，空字符串保留，只有truthy且未知组才归null。原生timeline用optional absence表示无组；初始decoded比较与transfer cost从原始manifest保留空字符串形状，移除该比较门禁，不改变timeline组归属。新增5组真实legacy完整工程对：empty/null/missing、empty equal、empty-to-null；累计74 byte-view及251 object graph。完整graph字段序/值/alias与transfer cost验证通过；actual legacy反读148个原生Delta通过。非字符串及未知groupId仍有原生导入差异，未解除其契约或宣称迁移完成。
Windows原子替换旧版同样复现error5的证据已重新核对，根因仍未知，未改写算法或增加重试。本轮只构建本地历史测试目标，正式exe未更新，无UI验收；FS-006仍partial/入口禁用，整体所有功能迁移目标进行中。


2026-11-05 图层groupId导入规范化：以legacy project-format-decode.ts:376、454-458为依据，非字符串组ID解码为null，truthy未知组ID清除。原生manifest解析按该规则规范化，prepareEditableImport对内存manifest独立核对组归属；不放松其他字段契约。直接测试未知组导入为无组且源manifest未变。实际legacy新增number/boolean/array/object/unknown string五组完整工程对，完整graph字段序/值/alias与transfer cost通过；10份原生重存由actual legacy解码并核对组归属。累计74 byte-view、256 object graph，actual legacy反读153个原生Delta通过。
local-history-budget2.53s、project-import0.03s、project-save0.52s、project-save-raster-resources0.31s、project-manifest0.19s全部通过；625来源覆盖/证据快照通过，strict因其他已登记迁移缺口仍退出1，diff检查通过。日志native/build/group-normalization-{build,ctest,reverse,provenance,strict}.log。未更新正式exe、无UI运行验收。任意live对象身份/成本/settled事件及完整恢复服务、linked free-tile/历史ownership、缺失timeline slot/locale/clock等仍未完成，FS-006维持partial/入口禁用，Windows5原子替换根因保留，整体所有功能迁移目标保持进行中。


2026-11-05 解码时间fallback：核对legacy project-format-decode.ts:630/634，createdAt/updatedAt缺省分别按字段顺序调用new Date；有效非空字符串不调用fallback。原生此前复用ReadManifest默认fresh时间，本轮将缺省时间改为字段解码时按顺序读取，增加readProjectManifestWithClock供真实legacy/native差分共享时钟。历史比较复用manifest和Document已解析时间，禁止捕获时再次读钟；保留truthy非字符串createdAt门禁（旧版保留其类型，原生尚未表达），支持false/0等falsy值fallback。
7组actual legacy完整工程对共享递增Date/clock，覆盖missing/null/empty/false/zero、updated object、created-only；逐字段图/键序/alias及transfer cost通过，原生检查实际fallback调用次数。累计74 byte-view、263 object graph，actual legacy反读160个原生Delta通过。6项回归全部通过：local-history-cost6.02s、local-history-budget2.64s、project-import0.03s、project-save0.56s、project-save-raster-resources0.34s、project-manifest0.20s。625文件来源覆盖/证据快照通过，strict因既有缺口仍1，diff通过。日志native/build/history-decode-clock-{build,ctest,reverse,provenance,strict}.log；无运行中构建句柄。
本轮仅构建测试目标，正式exe未更新，无UI运行验收。一般live身份/可选字段生命周期/成本、Editor settled生产派发与完整恢复服务、linked free-tile/legacy ownership、缺失timeline slot及locale等仍未迁移；FS-006保持partial/入口禁用，Windows5原子替换根因保留，整体功能迁移目标继续进行。


2026-11-05 图块集名称解码：实际legacy decodeManifestTilesets按string或空值读取name，再trim或默认Tileset。原生复用javascriptTrim。8组真实旧版样例覆盖Unicode首尾空白、全空白、空串、缺失、null、数字、对象及内部零宽字符；完整原生graph/cost检查通过。5项CTest通过：local-history-budget2.86s、tilemap-project0.62s、free-tile-project10.61s、project-save0.53s、project-manifest0.17s。625来源覆盖通过，strict仍1。
旧版反读未完成：Node首次因semi-space内存提交失败退出，独立重跑遭系统资源不足及PowerShell运行时异常。停止重试，保留tileset-decode-name-reverse.log和reverse-final.log；不宣称本轮新增Delta或保存工程已通过旧版反读。正式exe未更新，无UI验收。缺失timeline slot仍受Document::cel/activeSurface完整槽假设限制，不能提前补Cel替代旧版稀疏语义。FS-006及整体功能迁移继续未完成。


2026-11-05 图块名称反读闭环与验证器字节边界：定位前轮OOM到Node Buffer传入actual legacy decodeManifestTilesets，bytes.slice().buffer期待浏览器Uint8Array复制语义；Buffer.slice保留池/整块backing，解压图块资源因此扩大。验证器所有文件工程输入复制为普通Uint8Array，实际legacy源码不改。新增可选case前缀、空scope拒绝、阶段/样例和产物计数。限定8组先通过，再全量271 object验证通过：168个原生Delta、16份tileset-name重存、48组/蒙版重存、5 metadata和32 recording重存；既有linked/group normalization断言仍执行。前轮“反读未完成”由此证据更新为已完成，日志tileset-decode-name-reverse-typed.log与reverse-all.log。正式exe未更新，无UI验收；整体迁移/FS-006仍未完成。


2026-11-05 循环段导入规范化：依据legacy animation-loop-sections.ts normalizeAnimationLoopSections与project-format-manifest.ts normalizeManifestAnimation，移植非array为空、无效条目/引用过滤、首个有效ID优先、端点帧排序、名称trim/64 UTF16单位截断/Loop N默认、方向forward默认、repeat Number/trunc/clamp或null。实际readManifest与decodeProject会先后两次规范化，名称第一次截断后须再次trim；初次差分发现该时序并修正，历史严格名称校验未放松。10组actual legacy完整工程对覆盖名称/方向/repeat/无效重复条目/default编号/非array；完整graph/cost及20份原生重存循环段由actual legacy反读对照通过。累计281 object graph，176个原生Delta反读通过。
local-history-budget2.93s、project-save0.53s、project-manifest0.17s通过，625来源覆盖/证据快照通过，strict仍因其他缺口退出1，diff通过。日志loop-decode-normalize-{build-verified,ctest-final,reverse,provenance,strict}.log。UTF16截断形成孤立代理码元的通用名称存储路径仍需专门适配，不以本轮普通/完整代理对样例宣称已解决。正式exe未更新，无UI验收。live历史对象生命周期与成本、生产settled事件/恢复服务、稀疏缺失slot和linked free-tile等仍待迁移，FS-006保持partial/入口禁用，整体目标进行中。


2026-11-05 帧duration/disabled导入规范化：依据legacy animation.ts normalizeFrame，有限number时长trunc并clamp1..60000，非number/缺失使用100；disabled仅literal true。原生manifest解析替代此前严格整数/范围/boolean拒绝。12组actual legacy完整工程对覆盖fraction/negative/zero/large/string/null/missing/object与disabled true/string/number/null，完整graph键序/值/alias和transfer cost通过，24份原生重存由actual legacy核对frames。累计293 object graph、187个原生Delta反读通过。local-history-budget4.19s、project-save0.69s、project-manifest0.22s通过，625来源覆盖/证据快照通过，strict因既有缺口仍1，diff通过。日志frame-decode-normalize-{build,ctest,reverse,provenance,strict}.log。正式exe未更新，无UI验收；帧ID默认/去重、稀疏slot生命周期、live对象/成本/settled生产事件和完整历史恢复等仍未完成，FS-006保持partial/入口禁用，整体迁移目标进行中。


2026-11-05 Cel zIndex/opacity解码及保存默认值：依据legacy animation.ts normalizeAnimationCelZIndex/normalizeCels及project-format-manifest.ts normalizeManifestAnimation，zIndex按JS Number转换后对有限值trunc并clamp到-999..999，否则0；opacity仅接受有限number并clamp0..1，其余保持缺失。实际legacy encodeProject先调用ensureAnimationDocument，保存时为缺失Cel opacity补入图层opacity；原生project_encode仅在输出补齐，不改变Document中的可选字段、颜色或revision。本轮覆盖未链接初始标量，不代表linked值同步及实时生命周期已完成。
14组actual legacy完整工程对覆盖zIndex fraction/越界/string/array/boolean/null/object和opacity越界/string/null/boolean/object；累计74 byte-view、307 object graph。初始graph/cost逐项对照，28份Cel原生重存与canonical legacy encode/decode比较，actual legacy反读191个原生Delta通过。local-history-budget3.37s、project-save0.55s、project-manifest0.18s全部通过；625来源覆盖/证据快照通过，strict因已登记缺口仍退出1，diff检查通过。日志native/build/cel-decode-normalize-{build-verified,ctest-final,reverse-final,provenance,strict}.log。仅测试目标构建，正式exe未更新，无UI运行验收。
整体功能迁移仍进行中；任意live对象身份/可选字段生命周期/成本、Editor settled生产事件及完整历史恢复服务、linked free-tile/legacy ownership、缺失timeline slot、帧ID规范化和通用名称孤立代理码元等仍待完成。FS-006保持partial/入口禁用，Windows原子替换error5根因仍未解决。


2026-11-05 链接帧Cel保存标量：actual legacy ensureAnimationDocument调用normalizeAnimationCelLinks，将同层链接帧的opacity/zIndex同步为最终来源值后编码；此前原生slot优先会把冲突成员值重新存出。新增差分先复现opacity .8/-3与旧版.25/7不符，再修正project_encode按resolved owner输出opacity及zIndex；不改变Document中原始字段、链接或revision。跨图层linkedContentId只共享像素，各层opacity/zIndex保持独立，未增加错误的跨层标量同步。
新增6组同层链接工程对覆盖源/成员缺失opacity、冲突标量及两种活动帧，另3组跨层链接覆盖独立值与缺失字段。完整初始decoded graph/cost保持对照，新增12份及既有2份同层链接原生重存、全部28份跨层链接重存与actual legacy canonical encode/decode标量比较通过。累计74 byte-view、316 object graph；191个原生Delta反读继续通过（本轮新增样例经初始链接规范化后无新Delta，不虚增计数）。编码前后检查opacity/zIndex/linkedCelId及revision不变。
local-history-budget4.56s、project-save0.63s通过；625文件来源覆盖/证据快照通过，strict因其他已登记缺口仍退出1，diff通过。日志native/build/linked-cel-scalars-{fixtures,build-final,tests-final,reverse-final,ctest,provenance,strict}.log；首次差分失败日志保留。仅测试目标构建，正式exe未更新，无UI运行验收。live历史身份/成本/settled事件及完整恢复服务、linked free-tile、稀疏slot等仍未完成；FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 帧ID及活动帧/loop规范化：依据legacy animation.ts normalizeFrame/normalizeAnimationTimeline，跳过非object，array按空对象候选处理；缺失/非字符串/JS空白ID按原数组下标生成frame-N，非空白ID原样保留，重复只保留首项。活动帧无效回退首帧，loop仅literal false关闭。空/nonarray帧列表的默认时间线及稀疏Cel联动仍未适配，不解除门禁。保存器移除raw frames[0]必须是对象的假设，直接由规范化状态重建输出帧。
16组actual legacy工程对覆盖ID默认、原下标、默认ID冲突、带空白有效ID、重复首项、无效条目、活动帧回退及loop类型；累计74 byte-view、332 object graph，207个原生Delta反读通过。新增32份及既有24份帧规范化重存按actual legacy检查frames/activeFrameId/loop。既有project-manifest测试仍期待拒绝重复帧，与旧版证据冲突，改为核对首帧ID/时长/活动引用；其他拒绝断言保留。
local-history-budget4.95s、project-save0.63s通过；修正旧断言后project-manifest0.18s通过。625来源覆盖/证据快照通过，strict因已登记其他缺口仍1，diff通过。日志native/build/frame-identity-{fixtures-final,build-verified,tests-final,reverse-final,ctest,manifest-ctest-final,provenance-final,strict}.log；首轮编译错误及旧断言失败日志保留。仅测试构建，正式exe未更新，无UI验收。整体迁移仍进行中，FS-006保持partial/入口禁用；live历史/恢复服务、稀疏slot及linked free-tile等缺口继续保留。


2026-11-05 Cel候选过滤：依据legacy animation.ts normalizeCels与project-format-decode.ts，忽略非object、无效/空ID、重复已接受ID、无效帧引用和重复layerId:frameId槽，校验后才登记ID/槽，再丢弃未知图层。原生按顺序适配，保留后续完整槽导入门禁；broken-reference旧测试从解析报错改为确认Cel过滤，未放松编辑导入。原始Cel遍历增加类型/ID检查，保存器不再要求raw cels[0]对象。
10组实际legacy工程对覆盖重复ID/槽、未知帧/层、null/number、缺失/数字ID、空层ID及无效同ID在前。最后一组完整graph差分发现normalizeManifestAnimation从首个raw ID取有限opacity覆盖accepted值；原生建立firstRawCels索引保留此两阶段语义，保留accepted opacity作为无有限覆盖时的值。完整初始graph/cost及20份新重存与旧版canonical标量对照通过；累计74 byte-view、342 object graph、217个原生Delta反读通过。
local-history-budget4.52s、project-save0.56s、project-manifest0.18s通过；625来源覆盖/证据快照通过，strict因其他已登记缺口仍1，diff通过。日志native/build/cel-filter-{fixtures-final,build-verified,tests-verified,reverse-verified,ctest,provenance,strict}.log。首次graph差异及先前日志保留。只构建测试，正式exe未更新，无UI验收。
本轮只完成上述候选及opacity范围：无效同ID前项的raw资源dataFile/text/tilemap等恢复规则、被丢弃项独有资源的存档登记、inline mask过滤仍须专门差分核对，不能宣称完整异常输入兼容。稀疏slot、live历史身份/成本/settled派发及完整恢复服务等仍未完成；FS-006保持partial/入口禁用，整体迁移目标继续进行。


2026-11-05 同ID原始栅格恢复：依据project-format-manifest.ts normalizeManifestAnimation，规范化后的有效Cel资源元数据来自首个raw ID匹配，槽/linkedCelId/zIndex来自有效候选。原生raster改读已有firstRawCels索引。3组actual legacy完整工程对将同ID无效帧项放前，覆盖非活动帧offsetX/offsetY与相同字节数的宽高变化；完整decoded graph/alias/cost通过，6份原生重存由actual legacy与canonical结果核对Cel栅格尺寸/位置/像素及标量通过。
累计74 byte-view、345 object graph，220个原生Delta全量反读通过；追加栅格保存断言后限定3组再次通过。local-history-budget4.38s、project-save0.53s、project-manifest0.17s通过，625来源覆盖/证据快照通过，strict因其他缺口仍1，diff通过。日志native/build/cel-resource-{fixtures-verified,build,tests,reverse,raster-reverse,ctest,provenance,strict}.log。首次错误payload尺寸及缺失shadow文件样例被actual legacy拒绝，保留诊断日志，不计入通过样例。
本轮未完成通用数值元数据规范化、同ID text/tilemap/freeTiles/mask恢复及被丢弃项独有资源登记；不把读取raw元数据等同于完整异常输入兼容。只构建测试目标，正式exe未更新，无UI验收；FS-006仍partial/入口禁用，live历史/恢复服务及稀疏slot等继续未完成，整体功能迁移目标保持进行中。


2026-11-05 同ID原始文字恢复：依据legacy project-format-manifest.ts normalizeManifestAnimation，先保留有效候选规范化文字，仅首个raw同ID的非null object（含array）覆盖，随后decodeProject再次规范化。原生先解码有效候选text，再按raw object/array覆盖；缺失/null/number保留有效文字，空object/array重置默认。沿用decodeTextCel，不创建新文字规范化算法。
6组actual legacy完整工程对覆盖content/font、missing/null/number、empty object和array，逐项decoded graph/transfer cost对照及12份原生重存文字与canonical legacy encode/decode比较通过。累计74 byte-view、351 object graph，226个原生Delta反读通过。local-history-budget4.52s、project-save0.55s、project-manifest0.17s通过，625来源覆盖/证据快照通过，strict因已登记缺口仍1，diff通过。日志native/build/text-raw-{fixtures-final,build-final,tests,reverse,ctest,provenance,strict}.log；仅测试构建，正式exe未更新，无UI验收。
同ID tilemap/freeTiles/mask恢复、丢弃资源登记、稀疏slot及live历史身份/成本/settled派发与完整恢复服务仍未完成；FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 同ID图块数据恢复：依据legacy normalizeManifestAnimation移除normalized tilemap/freeTiles后从首个raw ID object恢复、decodeProject校验/渲染；原生两类数据改读firstRawCels。初始history比较不再用过滤后Cel下标索引raw数组，改按ID首项；成本tileShapes仅保留首项，防止后续重复项覆盖来源形状。
8组actual legacy完整工程对覆盖tilemap empty/flip/rotation/dense和现代free-tile empty/position/opacity/rotation。完整graph/键序/alias/cost通过，16份原生重存与canonical actual legacy对比tilemap/freeTiles及渲染栅格尺寸/位置/像素通过。累计74 byte-view、359 object graph，227个原生Delta全量反读通过；追加渲染断言后41组Cel规范化限定反读通过。初次试验误用90旋转单位被旧版free-tile拒绝，改用既有0..3语义，失败日志保留。
local-history-budget4.50s、project-save0.66s、project-manifest0.20s通过；625来源覆盖/证据快照通过，strict因其他迁移缺口仍1，diff通过。日志native/build/tile-raw-{fixtures-final,build,tests,reverse,raster-reverse,ctest,provenance,strict}.log。仅测试构建，正式exe未更新，无UI验收。nonobject/null图块字段、inline mask恢复、丢弃资源登记、稀疏slot和linked free-tile/live历史完整生命周期仍未完成；FS-006保持partial/入口禁用，整体迁移目标继续进行。


2026-11-05 inline mask候选恢复：依据legacy normalizeManifestAnimation仅从首个raw同ID truthy mask恢复到通过normalizeCels的候选，decodeProject再按显式layerMasks优先处理inline并校验owner/frame。原生在候选规范化阶段收集inline（早于未知图层过滤），不再直接解码原始全部Cel的mask；补inline引用校验。原始mask资源引用仍独立登记，以兼容被过滤候选留下的存档资源，不创建相应蒙版；保存沿用既有maskDataFiles清理输出资源语义。
5组actual legacy完整工程对覆盖无效同ID前项mask、重复槽mask忽略、无效帧mask忽略、首项null移除有效项mask及显式槽优先于缺失shadow资源。完整graph/alias/cost及10份原生重存layerMasks与canonical legacy对照通过。首次原生误报unmapped被过滤mask资源，经分开资源登记与语义解码修正，失败日志保留。累计74 byte-view、364 object graph，229个原生Delta全量反读通过。
local-history-budget4.89s、project-save0.53s、project-manifest0.19s通过；625来源覆盖/证据快照通过，strict因其他迁移缺口仍1，diff通过。日志native/build/mask-raw-{fixtures,build-final,tests-final,reverse,ctest,provenance,strict}.log。仅测试构建，正式exe未更新，无UI验收。无效scalar mask完整规范化、通用异常字段/孤立代理码元、稀疏slot、linked free-tile和live历史身份/成本/settled派发及完整恢复服务仍未完成；FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 蒙版Number转换与链接边界：依据legacy project-format-decode.ts decodeMask，尺寸/偏移先Number转换，正整数尺寸、有限偏移后trunc，flags仅literal true；nonnull显式空linkedMaskId应拒绝。原生复用legacyjson::number，保留原生坐标及解码预算上限，增加空链接Corrupt检查。8组actual legacy完整工程对覆盖string/array尺寸、string/null/boolean/array偏移、非boolean flags及null链接；逐项graph/alias/cost及16份原生重存layerMasks与canonical旧版一致。另新增actual legacy拒绝空链接fixture并由原生project-manifest回归确认。
累计74 byte-view、372 object graph，237个原生Delta全量反读通过。local-history-budget5.31s、project-save0.54s、project-manifest0.17s通过；625来源覆盖/证据快照通过，strict因其他已登记缺口仍1，diff通过。日志native/build/mask-numeric-{fixtures,build-final,tests,reverse,ctest,provenance,strict}.log。仅测试构建，正式exe未更新，无UI验收。
尚未完成全部无效mask/scalar规范化、通用资源字段、稀疏slot、linked free-tile及live历史身份/成本/settled派发与完整恢复服务；FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 显式蒙版槽候选过滤：依据legacy project-format-manifest.ts normalizeManifestAnimation，layerMasks/groupMasks非array为空，忽略非object、空/非string owner、无效frame及falsy mask，之后decodeProject再核对owner存在和重复语义。原生maskArray/maskCandidate按此顺序过滤，保留原始object资源登记、图层重复首项优先及组重复拒绝。16组actual legacy完整工程对覆盖两类槽的null/numeric条目、invalid frame、empty owner、null/false/zero mask及nonarray；完整graph/alias/cost和32份原生重存layerMasks/groupMasks与canonical旧版对照通过。
累计74 byte-view、388 object graph，253个原生Delta全量反读通过。local-history-budget6.28s、project-save0.67s、project-manifest0.20s通过，625来源覆盖/证据快照通过，strict因其他迁移缺口仍1，diff通过。日志native/build/mask-slot-filter-{fixtures-final,build,tests-final,reverse-final,ctest,provenance,strict}.log。
首次nonarray替换整个含资源列表后暴露unmapped payload门禁：本轮nonarray样例明确从该列表无载荷状态构造，仅证明字段规范化；整列表消失但保留未引用文件的兼容仍待实际旧版资源策略迁移，未一并放行未知资源。首次失败日志保留。只构建测试，正式exe未更新，无UI验收；稀疏slot、linked free-tile、live历史身份/成本/settled派发与完整恢复服务仍未完成，FS-006保持partial/入口禁用，整体迁移目标继续进行。


2026-11-05 Cel栅格偏移规范化：依据legacy normalizeManifestAnimation仅保留finite number offset并trunc，decodeProject缺省0。原生复制首个raw ID资源元数据，规范化offsetX/Y后交既有raster解码，不修改原始JSON；非number/missing默认0，超原生坐标保持Limit。8组actual legacy完整工程对覆盖正负fraction、string/null/boolean/array/object/missing非活动Cel偏移；完整graph/alias/cost与16份原生重存栅格geometry/pixels按canonical旧版核对通过。
累计74 byte-view、396 object graph，261个原生Delta全量反读通过。local-history-budget5.95s、project-save0.59s、project-manifest0.19s通过；625来源覆盖/证据快照通过，strict因其他迁移缺口仍1，diff通过。日志native/build/cel-offset-{fixtures,build,tests,reverse,ctest,provenance,strict}.log。负零、超原生坐标及通用其他栅格字段仍有边界，未声称全部元数据等价。仅测试构建，正式exe未更新，无UI验收；稀疏slot、linked free-tile、live历史身份/成本/settled派发及完整恢复服务仍未完成，FS-006保持partial/入口禁用，整体功能迁移目标继续进行。


2026-11-05 缺失槽只读路径：核对legacy animation.ts applyFrameSurfaces/clearLayerSurface，缺失Cel清空显示且不创建Cel。原生核心新增activeSurfaceIfPresent；canvasPixels遇缺失槽返回透明画布快照，selectionContentBounds返回无内容，不改timeline。沿用已有RasterHistoryFixture构造缺失活动槽，重复查询验证Cel数组/存储、revision/contentRevision/history/dirty保持，现有稀疏owner及撤销测试继续执行。document-raster-history0.05s通过；625来源覆盖/证据快照通过，strict因既有缺口仍1，diff通过。日志native/build/absent-slot-read-{build,ctest,provenance,strict}.log。构建句柄已结束，只构建测试目标，正式exe未更新，无UI验收。
本轮是稀疏生命周期的读取适配：fromImported/prepareEditableImport完整槽门禁仍保留，cel()/activeSurface()/绘图/复制粘贴/保存仍有完整槽假设，尚未实现按旧版时序创建Cel及撤销恢复缺失槽，不能宣称稀疏工程导入完成。下一步需在编辑事务中迁移materialization，而非全局补空Cel。FS-006/live历史完整服务和整体功能迁移继续未完成。


2026-11-05 稀疏选择安全与实际提交生命周期：修正timeline_interaction selectTimelineCel对缺失活动槽cel()解引用、空range anchor selected.back及范围中缺失slot解引用；只选择存在Cel，不创建缺失槽。既有RasterHistoryFixture构造三帧中间缺槽，验证跨槽范围、缺失活动槽toggle/range fallback、Cel数/history/dirty保持；document-raster-history通过。测试发现selectFrame的原生contentRevision用于显示失效会递增，与legacy workspace-selection-mode.test会话contentRevision保持不同，已登记，不以移除断言宣称等价。空槽显式key选择仍无原生表达。
追查legacy workspace-commands-history：commitPixelEdit入栈后才syncActiveAnimationLayer；后者只创建缺失活动Cel，pixel undo不删除。生成器新增实际legacy可执行oracle：refresh后/recordPixel后/commitPixelEdit后均0 Cel，同步后1，undo/redo并同步保持该ID。已通过，明确纠正前轮“下一步撤销恢复缺失槽”的未经证实假设；原生笔画materialization尚未接入，不按错误假设实现。fixture重新生成后原生完整graph/cost及261份旧版Delta反读通过，396 object/74 byte-view保持。
625来源覆盖/证据快照通过，strict因其他缺口仍1，diff通过。日志native/build/sparse-selection-{build-final,tests-final,provenance,strict}.log及sparse-commit-{oracle,fixture-refresh,reverse}.log。只构建测试，正式exe未更新，无UI验收；完整槽导入门禁、笔画预览/取消/失败的独立display storage、稀疏结构及live历史服务仍待迁移，FS-006保持partial/入口禁用，整体功能迁移目标进行中。


### 2026-11-05 缺失槽普通栅格笔画生命周期

依据 legacy core/history.ts 的 recordPixelKnownCurrent/commitPixelEdit、workspace-commands-history.ts 先 push 后 sync，以及 animation.ts 的 createActiveLayerCel：普通栅格缺失槽以独立临时 Surface 预览，取消或无变化提交不创建 Cel；有效提交仅创建活动槽，继承 layer.opacity，像素撤销/重做保留 Cel ID。临时存储沿用原生绘图直达像素缓冲，使用全画布缓冲，尚未等同旧版稀疏 runtime raster 性能。缺失槽关联图层明确阻止，特殊图层和整体稀疏导入门槛继续保留。新增核心回归检查预览、连续绘制、取消、透明无变化、提交和撤销重做；构建与测试结果见后续记录，不代表 UI 实际验收或完整稀疏迁移。

验证：正式 build 目录仅构建 document-raster-history-tests，最终构建成功；执行结果 `Document raster history and sparse fill passed`（exit 0，native/build/sparse-stroke-tests.log）。来源覆盖 625 文件通过，--strict exit 1（已知迁移缺口），git diff --check exit 0。未构建或替换 moonsprite-native.exe，未执行 UI 运行验收。


### 2026-11-05 缺失槽笔画画布显示接通

发现 canvas_renderer 仍通过 doc.cel() 解引用空槽，合成器也在缺少 Cel 时直接跳过活动层。现改为可空槽解析；独立显示表面传入既有 preview 通道，合成器以 preview 的尺寸与偏移提供显示几何，不创建时间线 Cel。复用既有图层透明度、样式、组、蒙版和洋葱皮合成管线。来源：legacy animation.ts clearLayerSurface/applyFrameSurfaces、history.ts recordPixelKnownCurrent，及 workspace-commands-history.ts 提交后同步。

验证：canvas-performance-tests 构建并执行通过（exit 0，native/build/sparse-render-tests.log），新增 Skia 离屏像素回归覆盖 1/2 图层、洋葱皮开/关、空槽初始显示、笔画、取消、提交、撤销/重做，确认显示不创建 Cel；原有像素上传、脏矩形、大时间线检查通过。来源覆盖 625 文件通过；git diff --check exit 0。未运行交互式程序验收，未构建或替换正式 moonsprite-native.exe。整体稀疏导入及特殊图层等迁移缺口保留。


### 2026-11-05 真实多帧洋葱皮与空槽效果验证

纠正上一批测试证据：洋葱皮 enabled 但仅一帧会退回普通合成，不能证明真实洋葱皮路径。现回归使用两帧，发现并修复 compositeOnionRegion 的活动缺失槽提前 return；只允许活动非 ghost 层读取显式预览，其他帧继续使用实际存储。依据 legacy onion-skin.ts、animation.ts 的显示层生命周期。

新增离屏全图比较：图层 opacity=.63，组 opacity=.71，图层 mask 覆盖128，颜色 overlay，逐项累计组合，并分别关闭/开启真实多帧洋葱皮；临时预览与提交后全新 CanvasRenderer 输出一致，撤销恢复原图。组空间样式（渐变/描边/阴影等）依赖内容几何，尚未由此验证。canvas-performance-tests 最终构建、执行 exit 0（native/build/sparse-effects-tests.log）；原有像素上传、脏矩形、大时间线测试通过。未更新正式 exe，未进行交互 UI 验收。


### 2026-11-05 空槽组空间样式与缓存失效

新增组渐变、组描边+阴影的多像素笔画回归，普通/真实多帧洋葱皮两条路径。旧代码先复现 preview/commit 像素差异（sparse-spatial-before-tests.log）：groupStyleGeometry 只读 Cel，遗漏独立显示表面。现把既有 preview 像素、尺寸和偏移递归传入组内容 alpha 边界扫描，复用 legacy document-composite-sampling.ts 的可见子内容几何语义。

随后复现撤销残影（sparse-spatial-tests.log）：原始像素脏矩形未覆盖效果 halo 或组渐变几何变化。启用图层空间效果或组空间/渐变效果时保守全画布刷新；普通笔画及逐点颜色效果仍保留脏矩形路径。精确 legacy 效果缓存失效/性能方案仍待迁移，不能将此保守适配视为性能等价。最终 Skia 离屏回归比较临时预览与提交后的全新 renderer，全图一致且撤销恢复；未更新正式 exe，未执行交互式 UI 验收。


### 2026-11-05 图层空间效果局部刷新

直接承接 legacy core/layer-styles.ts:231-240 layerStyleAffectedRect：原始变化与 stroke/innerGlow 扩展、平移 shadow 后 blur 扩展取并集。原生上传区域采用 int64 坐标后裁剪画布，图层效果不再一律全画布刷新。组空间/渐变效果仍保守全量刷新；多个 owner 仍保守合并所有 layer 效果足迹，旧版 owner 队列、64px block 缓存尚未全部迁移。

新增实际 Skia 回归在 32x32 图像检查 shadow 的四个偏移方向、blur=1，精确上传区域面积（单点、offset 3/2 时 5x4=20 像素），对比完整重绘及取消后的全图像素。测试初版预期面积误算为 6x5，已按原始矩形与偏移扩展并集修正。未更新正式 exe，未进行交互 UI 验收。

验证结果：canvas-performance-tests 最终构建及运行 exit 0（native/build/style-dirty-tests-final.log）；原有普通/空槽/组/洋葱皮/脏矩形/大时间线回归通过，来源覆盖 625 文件通过，git diff --check exit 0。


### 2026-11-05 嵌套组效果局部刷新

直接承接 legacy document-composite-cache.ts invalidateStyleSources:132-155 的 owner→parent 传播：每一级 layerStyleAffectedRect 的输出作为父级输入。原生以 int64 计算各 owner 链并合并，组蒙版变化也以组链为起点；由于 Document 尚未提供精确改变 owner ID，仍保守遍历潜在 owner。组 gradient 内容边界变化仍全量刷新。旧版按 owner 的脏区域队列及64px style block 缓存尚未全部迁移。

实际 Skia 回归增加双层阴影组（每层 offset 3/2、blur1）：单点笔画准确上传9x7=63像素；局部结果与全量重绘逐像素一致，取消无残影。canvas-performance-tests 构建执行 exit0（native/build/group-dirty-tests.log），既有空槽、洋葱皮、空间样式、大时间线回归通过。未更新正式 exe 或运行交互式 UI 验收。


### 2026-11-05 浮动预览最终脏区域与空间效果衔接

将效果 ancestor 扩展放在 floatingOverlayChange/tilemap 最终原始区域计算之后，避免浮动预览覆盖已扩展的阴影/描边范围。依据 legacy document-composite-cache.ts invalidateStyleSources 对最终 source dirty 应用效果传播；canvas-composite-cache-selection.ts 对 styled selection 使用 fallback，原生延迟样式路径尚有技术差异，不能视为性能等价。

新增实际延迟剪贴板场景：320x320画布、257x257剪贴板（小剪贴板不会触发 deferred，已明确断言），两角不透明像素。分别图层阴影和双层组阴影，移动、取消、提交、撤销重做均将缓存全图与全新 renderer 逐像素对比。未更新正式 exe，未进行交互 UI 验收。


### 2026-11-05 样式图层的浮动预览准入

对照 legacy canvas-composite-cache-selection.ts：启用的目标图层样式必须退出优化浮动预览；原生 supportsDeferredFloating 在 clipboard 尺寸判断之前检查能力、活动目标槽和目标 layerStyles.enabled/configured，避免样式目标误走 deferred fast path。全局禁用样式保留优化资格。

新增 admission matrix 覆盖 capability 开关、配置样式开关、样式 enabled 开关以及取消历史稳定性；大剪贴板空间效果移动/取消/提交/撤销/重做继续与全量 renderer 逐像素一致。canvas-performance-tests exit0（native/build/preview-admission-tests.log），来源覆盖通过，diff check通过。旧版剪贴板优化还包括顶层图层、opacity/blend、内容为空等条件，后续继续核对。


### 2026-11-05 剪贴板专用与通用预览分支核对

核对 legacy canvas-composite-cache.ts:367/391：先尝试 drawClipboardPreview，失败后仍尝试 drawSelectionPreview。因此 canvas-composite-cache-selection.ts:78-86 的顶层、RGBA、不透明、Normal、空内容条件仅限制专用剪贴板优化，不能照搬为全部 deferred 预览的必要条件。此前“剩余条件待核对”现已澄清为两条路径的区别，未擅自缩小通用预览范围。

新增实际 Skia 差分：320x320已有内容的两层文档，257x257剪贴板以混合alpha角像素覆盖；opacity=.57、Multiply混合、活动图层位于底层三种情况，对照 deferred 与能力关闭 fallback 的不同路径，移动、取消、提交、撤销重做逐像素一致。canvas-performance-tests 构建执行 exit0（native/build/clipboard-stack-tests.log）。此项证明测试场景行为，不代表旧版全部 cache/performance 算法迁移完成。未更新正式exe或执行交互UI验收。


### 2026-11-05 缺失槽普通与纹理填充生命周期

以 legacy tools-fill.ts floodFill/floodFillSymmetric → history recordPixelKnownCurrent → workspace history push后sync 的实际路径为依据：缺失普通栅格槽先以独立画布存储调用已有 fillCanvasAt/fillPatternCanvasAt，保留 symmetry seed 子编辑次序和 selection，只有有效像素编辑才创建活动槽，继承 layer.opacity；撤销重做修改像素并保留 Cel ID。无变化、越界不创建槽，不改history/dirty。关联缺失槽明确阻止，特殊图层/稀疏导入门槛保持。全画布 staging 是原生必要适配，尚未承接旧版稀疏 runtime 性能。

验证：document-raster-history-tests 构建运行exit0（native/build/absent-fill-tests.log），新增实色/Grain纹理、无效seed、透明无变化、commit/undo/redo像素与Cel身份回归；来源覆盖625文件通过，diff check通过。未更新正式exe，未执行交互UI验收。


### 2026-11-05 空槽可见层对称填充顺序修复

新增有选区与两层背景的差分矩阵：实色/Grain × visibleLayers开关 × contiguous开关 × symmetry开关，比较已有空白Cel与缺失Cel路径，检查提交像素、单次历史、撤销重做及Cel身份。复现 Grain+visible+非连续+symmetry 差异（native/build/absent-fill-parity-tests.log）：后续对称seed采样未见先前临时写入。依据 legacy tools-fill.ts floodFillSymmetric 顺序编辑显示layer，现通过既有compositor preview参数传入活动空槽的当前staging像素，保持提交前无Cel。

最终 document-raster-history-tests 构建运行exit0（native/build/absent-fill-parity-tests-final.log），来源覆盖通过，diff check通过。未更新正式exe，未进行交互UI验收；整体稀疏导入与特殊层迁移仍未完成。


### 2026-11-05 空槽魔棒读取与选区历史验证

核对 native editor_input.cpp 魔棒快照使用 canvasPixels()/compositeNormalRegion，普通栅格空槽没有新增Cel解引用。沿用 legacy magic-wand-operation.ts 的选区操作及 workspace-selection-mode.test.ts 空槽不改变作品内容语义，新增精确 source→magicWandSelection→commitSelection 核心链回归：visibleLayers开关、contiguous开关、tolerance0/64，验证透明空槽/背景隔断的选择范围，undo/redo选择，同时Cel缺失/count、contentRevision、dirty不变。

构建执行 document-raster-history-tests exit0（native/build/absent-wand-tests.log）。此项为核心链验证，不代表异步Editor手势或交互UI验收；未更新正式exe。


### 2026-11-05 缺失槽魔术橡皮擦无变化路径

依据 legacy store/workspace-magic-eraser.ts eraseWorkspaceMatchingColor → tools-fill.ts clearSelection：只有实际像素变化才提交。原生提前检测普通栅格活动槽缺失并安全return false，不解引用cel、不创建Cel；蒙版路径独立解析，不再强制依赖栅格Cel。新增选区+已有背景层的 visible/contiguous/preview组合、有效/越界seed，检查Cel缺失/count、revision/contentRevision/history/dirty及背景合成不变。

验证：document-raster-history-tests 构建执行exit0（native/build/absent-eraser-tests.log）；来源覆盖和diff检查通过。补跑 moon-core-tests 构建成功但执行exit -1073741571（0xC00000FD，Windows栈溢出），日志为空；CMake已有测试专用2MiB栈设置，本轮未调整或将该综合测试记为通过，蒙版综合回归未获得运行证据。未更新正式exe或进行交互UI验收。


### 2026-11-05 恢复综合核心测试并纠正过时预期

通过MSVC反汇编定位 moon-core-tests main 栈帧0x1f98f0，原测试PE stack reserve为2MiB。仅提高测试目标reserve至4MiB；生产目标未变。随后测试到达旧断言：复制 Cel 后删除其源帧，旧版 animation.ts mapAnimationCelBlock 源锚点不存在则返回空；据实际legacy契约将测试修正为不粘贴且作品/历史/clipboard不变，而非改生产代码。保留CHECK源码行诊断。

最终 moon-core-tests exit0（native/build/core-legacy-anchor-tests.log），document-raster-history-tests exit0（native/build/absent-eraser-tests-final.log）；来源覆盖通过，diff check通过。综合测试现覆盖蒙版魔术橡皮擦等既有编辑路径。未更新正式exe或做交互UI验收。


### 2026-11-05 空槽渐变预览与提交生命周期

依据 legacy core/gradient.ts 通过recordPixel编辑显示像素、无变化恢复空扩展，及 workspace history push后sync 的Cel生命周期。普通栅格缺失槽新增独立透明baseline，沿用magicWandSelection和GradientSampler；取消/透明无变化不创建Cel，有效提交仅创建活动槽并继承layer.opacity，撤销重做保留Cel身份。关联图层缺失槽继续阻止，整体稀疏导入仍未放开。当前空槽全画布baseline与逐点history尚待承接旧版稀疏/dense性能方案，不标记完整等价。

回归覆盖selection及visibleLayers开关，与已有空白Cel渐变预览逐像素比较，取消时Cel/count/history/contentRevision/dirty稳定，提交/undo/redo像素与Cel ID一致，透明no-op不创建槽。document-raster-history-tests构建执行exit0（native/build/absent-gradient-tests.log），来源覆盖与diff检查通过。此轮未进行离屏renderer或交互UI验收，未更新正式exe。


### 2026-11-05 空槽渐变离屏渲染验收

新增Skia实际全图像素回归，普通栅格缺失活动槽，选区、半透明渐变、多图层、layer/group opacity、layer mask、overlay、组gradient/stroke/shadow，分别关闭/开启真实两帧onion。临时预览不创建Cel，取消恢复原图，提交后新建renderer完整重绘与预览一致，undo恢复初始图，redo恢复预览图。依据legacy gradient-preview.ts/gradient.ts与animation.ts显示/提交生命周期，补齐上一批核心检查之外的renderer证据。

canvas-performance-tests构建运行exit0（native/build/absent-gradient-render-tests.log）；既有画布回归通过。未进行交互式Editor/UI验收，未更新正式exe。全画布staging/逐点history性能、特殊关联层和整体稀疏导入仍待迁移。


### 2026-11-05 空槽大面积渐变密集历史

承接 legacy gradient.ts DENSE_GRADIENT_MIN_PIXELS=512*512/applyDenseGradient 的packed before/after策略，空槽提交复用原生已有DensePixels；先扫描dirty再选择dense/point，避免先分配大批逐点记录。当前原生以dirty矩形选阈值，而legacy以paint范围，并有changed mask/cost差异，完整history等价仍未完成。

新增511/512边界回归，检查payload分支、512历史存储小于9bytes/pixel，commit/undo/redo像素与Cel身份。新增测试先因大函数栈占用溢出，已抽为独立函数避免累加栈占用；最终document-raster-history-tests构建运行exit0（native/build/absent-gradient-dense-tests-final.log），来源覆盖与diff检查通过。未更新正式exe或运行交互UI验收。


### 2026-11-05 空槽渐变dense绘制范围语义

对照legacy gradient.ts:242-266，dense阈值以canvas、selection包围矩形、paintRegion交集面积判断，mask位仅限制写入。空槽提交现按此paint bounds选dense并存储对应packed矩形，实际dirty仍只含变化像素。新增512x512选区仅一位允许写入的回归：仍必须dense，其他像素透明，undo/redo一致；保留511/512阈值测试。document-raster-history-tests构建执行exit0（native/build/gradient-paint-bounds-tests.log），来源覆盖与diff检查通过。旧版changed mask/cost及既有非空槽分支仍待对齐，未更新正式exe或做交互UI验收。


### 2026-11-05 已有普通Cel渐变dense准入

继续对齐legacy gradient.ts applyGradient：已有full-canvas Cel渐变同样以canvas/selection/paintRegion交集选择dense，独立于dirty bounds；shared shape提交保留其既有策略。512x512选区仅一位可写回归现在同时覆盖已有Cel/缺失Cel，两者都必须dense，像素及undo/redo正确。document-raster-history-tests构建运行exit0（native/build/gradient-existing-dense-tests.log），来源覆盖与diff检查通过。sparse surface渐变、changed mask/cost仍待对齐，未更新正式exe或进行交互UI验收。


### 2026-11-05 稀疏表面渐变dense准入

对照legacy/src/renderer/src/core/gradient.ts applyGradient/applyDenseGradient，带偏移的稀疏表面提交改用canvas、selection包围矩形及paintRegion交集面积选择dense，并按该范围存储before/after；实际dirty仍按变化像素发布，保留分配预算及存储坐标映射。新增512x512选区仅一位可写、2x1透明表面带偏移及非零storageOrigin的回归，检查扩展、dense分支、像素、Cel身份与undo/redo。document-raster-history-tests构建运行exit0（native/build/gradient-sparse-dense-tests.log）。changed mask/history cost等价仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽选区复制与dense历史复核

已核对legacy history.ts:649-703：commitPixelEdit将dense转换为完整regionPatch，正式undo/redo均回放完整before/after矩形；changed掩码用于revertPixelEdit提交前回退（734-740），不能将其直接套到正式undo。原生正式dense整矩形回放在此点无需修改，changed mask缺口应限定为临时编辑回退语义，整体history成本等价仍未完成。

继续迁移空槽读取：legacy animation.ts clearLayerSurface/applyFrameSurfaces为空槽提供透明显示，workspace-commands-clipboard.ts copySelection:730-761跳过透明像素，空结果在清除动画剪贴板之前返回。原生copyPixels改用nullable active surface，避免空槽访问cel()；保留floating分支及空结果不改动画剪贴板的行为。新增矩形/掩码选区、有无不透明背景层的组合回归，验证空结果、不生成Cel、保留帧剪贴板、选区、revision/contentRevision/history/dirty及合成像素。document-raster-history-tests构建运行exit0（native/build/absent-copy-tests.log）。系统剪贴板及完整稀疏帧复制生命周期仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽删除、剪切与居中内容

核对legacy tools-fill.ts clearSelection、workspace-commands-selection-effects.ts deleteSelection、workspace-commands-clipboard.ts cutSelection及workspace-commands-selection-move.ts centerActiveContent。空透明内容删除无编辑且保留选区；剪切无论复制是否为空均结束选区；居中仅在pixel entry成功后移动选区。原生deleteSelectedPixels已跳过缺失Cel，cutPixels可复用上轮空槽copyPixels修正；本轮修复centerActiveContent直接解引用缺失activeSurface的问题。

新增独立回归函数，覆盖矩形/掩码选区、其他不透明图层、水平/垂直/双轴居中与无选区，检查删除保留选区、剪切清除选区、帧剪贴板保留、Cel数/history/revision/contentRevision/dirty与合成像素均不变。document-raster-history-tests构建运行exit0（native/build/absent-selection-commands-tests.log）。旧版临时显示存储的扩展、特殊图层及完整稀疏导入/保存生命周期仍未完成；本轮未更新正式exe或进行交互UI验收。


### 2026-11-05 单目标空槽填充选区／画布

核对legacy workspace-commands-selection-effects.ts fillForeground、workspace-selection-effects-support.ts selectionEffectUsesMultipleTargets/selectedEffectTargets、tools-fill.ts fillSelectionOrCanvas及animation.ts animationLayerAtFrame/createActiveLayerCel/syncActiveAnimationLayer。单目标直接编辑activePaintLayer的透明显示栅格，成功后同步创建活动Cel；多目标使用帧代理，缺失Cel返回null并跳过。原生补齐单目标空槽分支，不改变多目标跳过缺失槽位的语义。

空槽提交先检查选区、锁定/可见性和实际非零写入，按512*512及selectedCount*3>=area判断dense；按packed值覆盖，保留半透明及隐藏RGB，预算检查后安装候选Timeline并提交历史。撤销清空像素但保留Cel身份。缺失linked-layer生命周期仍明确拒绝。回归对照已有空白Cel，覆盖画布/矩形/掩码、背景层、不透明度、半透明/隐藏RGB、零色/空mask/越界/锁定/隐藏、dense与稀疏掩码、undo/redo。首次组合测试因多个Document栈对象溢出，改为堆分配后document-raster-history-tests构建运行exit0（native/build/absent-selection-fill-tests.log）。稀疏显示存储/几何、linked及导入保存全生命周期仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽形状预览与提交

承接legacy tools-shapes.ts paintShape/paintShapePixelPoints、直线笔刷及history.ts recordPixel/commitPixelEdit与animation.ts createActiveLayerCel/syncActiveAnimationLayer的绘制/同步边界。原生beginShapePreview在普通栅格缺失Cel时建立独立透明baseline，分配前检查256MiB预览预算，update继续复用既有形状栅格器、选区/对称/ink语义；共用absentRaster提交仅在有变化时创建活动Cel，撤销重做保持身份。形状dense按dirty bounds选择，渐变保持paint bounds，避免共用提交引入阈值偏差。缺失linked-layer形状生命周期仍明确拒绝。

document-raster-history-tests构建运行exit0（native/build/absent-shape-tests.log），新增对照已有空白Cel的直线/矩形/矩形轮廓/椭圆/旋转椭圆轮廓/多边形/自由形状测试，覆盖掩码、对称、半透明/隐藏RGB、重复更新、取消、零变化、提交/undo/redo及Cel身份。稀疏运行时存储/几何、linked和特殊图层缺失槽位仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽透明选区浮动变换

核对legacy tools-selection-transform-source.ts captureSelectionTransform、workspace-commands-selection-move.ts及workspace-commands-selection-floating.ts:403-500。透明选区仍有source/geometry，浮动确认没有pixel entry时仅提交选区历史。原生beginSelectionContentMove允许普通栅格缺失活动Cel且没有其他解析目标时保留透明source，不创建Cel；变换复用floatingSelectionMask，避免空targets访问owner，翻转使用透明source的mask；commit/cancel复用既有选区历史与恢复。

新增对照已有透明Cel的矩形/掩码、越界选区、复制/移动、初始平移、取消、翻转/旋转、确认及undo/redo回归，验证选区一致、contentRevision/dirty不变、始终没有Cel。document-raster-history-tests构建运行exit0（native/build/absent-selection-move-tests.log）。本轮没有扩展多目标缺失代理、linked/特殊图层或运行时稀疏几何；全软件迁移仍未完成，未更新正式exe或进行交互UI验收。


### 2026-11-05 透明选区直接翻转历史边界

对照legacy workspace-commands-selection-flip.ts：单活动图层在操作前检查lock，透明mask翻转有变化时保留selection-only history；animation selection先捕获states，无states直接返回，有states则更新mask但只有pixel entries才增加历史。原生flipContent补齐缺失Cel时的单目标lock检查、空animation targets返回，以及已有透明animation target不生成多余选区历史。workspace-edit-actions.ts rotateWorkspaceContent没有pixel entry则返回，原生透明直接旋转行为验证保留。

新增缺失/已有透明Cel、矩形边界内外mask、水平/垂直、普通/帧选择、锁定、90/-90/180旋转回归。新增函数初次运行触发Release内联后测试栈溢出；verifyEmptyImmediateTransforms及verifySparseMigration明确noinline隔离测试栈帧后整套document-raster-history-tests运行exit0（native/build/empty-immediate-transform-tests.log），未提高正式程序栈或改变程序发布配置。全软件迁移仍未完成；未更新正式exe或进行交互UI验收。


### 2026-11-05 带存储原点的稀疏表面吸管

对照legacy eyedropper-source.ts sampleEyedropperColor及document-model.ts readLayerColorAt，当前图层取色在画布范围内读取图层偏移下的原始颜色，不受history storage origin、可见性或锁定状态影响。原生sampleEyedropper移除storageOrigin存在即拒绝的旧迁移限制，复用raster::validate/readWorld，避免int坐标减法在极端偏移下溢出。

新增正/负偏移、非零storage origins、链接Cel、隐藏/锁定、半透明/隐藏RGB、画布和owner边界、缺失Cel当前层透明与合成背景、INT_MIN偏移回归，并确认取色不改像素和Cel数。eyedropper-tests构建运行exit0（native/build/sparse-eyedropper-tests.log）。本轮不代表完整稀疏导入/编辑器预览/持久化生命周期完成，未更新正式exe或进行交互UI验收。


### 2026-11-05 空槽选区笔刷读取入口

核对legacy brushes.ts createSelectionBrush：先裁剪并校验笔刷尺寸，读取active layer原始颜色，仅有不透明像素才返回笔刷，选中透明RGB保留。原生selection_pattern_brush增加nullable Surface重载，缺失来源通过原采样器返回透明，不分配整画布；editor_tools的临时捕获、铅笔库保存及填充库保存三个入口改用activeSurfaceIfPresent，避免空Cel解引用。保持原空结果提示及尺寸/掩码校验。

回归覆盖空活动槽位加不透明背景、矩形/掩码/越界选区、超尺寸和损坏mask拒绝、Cel/history/revision/content/dirty不变，以及带偏移/非零存储原点的隐藏RGB与alpha。新回归暴露测试Release内联叠加栈帧问题，独立verify函数统一noinline，不修改正式程序配置。编辑器三个入口已源码核对，未更新正式exe或进行交互UI验收；完整稀疏生命周期仍未完成。

补充实际验证：noinline及独立调用仍未消除0xC00000FD，不能归因仅为内联。仅document-raster-history-tests的MSVC测试栈由2MiB增至4MiB后，整套构建运行exit0（native/build/absent-selection-brush-tests.log）；正式程序配置未改。新增选区笔刷回归通过。


### 2026-11-05 编辑器空槽笔刷悬停来源

核心brushPreview已经支持缺失Cel，但editor_canvas的普通笔刷预览合成底图、喷枪轮廓与粒子预览仍直接读取activeSurface。对照legacy canvas-brush-composite-preview.ts原始活动图层读取以及animation.ts透明显示语义，普通预览改用nullable source并保留零初始化region，喷枪两个读取以透明值回退；既有偏移、合成和边界算法不变。

新增核心对照：缺失槽位brushPreview加显式composite preview，比较已有透明Cel实际落笔提交后的合成，覆盖不透明/半透明及有无背景；Cel数/history/contentRevision/dirty不变。document-raster-history-tests构建运行exit0（native/build/absent-hover-tests.log）。编辑器绘制入口仅源码核对，未编译更新正式exe、未做交互预览图像验收；完整软件迁移仍未完成。


### 2026-11-05 正式编辑器集成构建与启动检查

累积编辑器、核心和项目读写改动已构建进入唯一正式产物 native/build/Release/moonsprite-native.exe；构建 exit0，记录 native/build/editor-integration-build.log。补齐此前 editor_canvas/editor_tools 仅源码核对的编译证据，不代表全部行为等价。

实际运行发现 start-native.bat 把主题参数放在用户参数前，而 main.cpp 检查入口判断 argv[1]，导致检查参数被静默忽略、打开普通工作区。正常关闭本轮启动的窗口后，将用户参数置于默认主题/指针参数之前；保留同一入口、工作目录与正式程序。通过该入口运行 --brush-preview-check、--preview-luminance-check，两个进程均 exit0。现有检查覆盖笔刷预览模式/抑制/缓存不变及亮度契约，尚不覆盖缺失Cel的实际编辑器悬停、喷枪和三个选区笔刷入口，也未进行人工交互图像验收。

光栅历史、吸管现有测试均 exit0，日志 editor-integration-raster-tests.log、editor-integration-eyedropper-tests.log；625文件来源覆盖通过，完整迁移仍 INCOMPLETE。空帧粘贴已核对 legacy workspace-commands-clipboard.ts pasteSelection 与 workspace-commands-selection-floating.ts commitFloatingPaste：预览保留完整源，成功像素历史才 syncActiveAnimationLayer；原生 beginFloatingPaste 仍直接 cel().id，后续浮动目标生命周期尚待迁移，未解除稀疏导入门禁。


### 2026-11-05 空槽剪贴板浮动粘贴生命周期

对照 legacy workspace-commands-clipboard.ts pasteSelection、workspace-commands-selection-floating.ts commitFloatingPaste 及 animation.ts syncActiveAnimationLayer，原生 beginFloatingPaste 不再直接读取缺失 cel().id。缺失普通栅格目标保留独立透明基线，复用既有 floatingOverlayRegion、采样/变换/预算和合成管线；预览与取消不创建Cel、不改内容历史。成功像素提交才安装活动Cel并记录像素历史，撤销保留新Cel身份；完全越界/透明源只有必要选区历史。取消选择后的恢复快照在成功提交后绑定新Cel，避免恢复时读取不存在owner。缺失链接图层生命周期继续明确拦截。

按 tools-selection-transform-translation.ts changedCount > area/4 和 tools-selection-transform-commit.ts packed transform 采用密集矩形历史；其他平移保留稀疏点历史。回归包括掩码、隐藏RGB/半透明、有无背景、图层透明度、取消、翻转/缩放/普通旋转/RotSprite、越界、300x300大剪贴板、稀疏mask、取消选择/撤销/重做。document-raster-history-tests exit0（absent-paste-tests.log）。canvas-performance-tests离屏回归比较预览、提交、新renderer、撤销重做，覆盖组/蒙版/图层样式/组渐变/描边阴影/洋葱皮；记录 absent-paste-render-tests.log。上述为核心与Skia离屏证据，非人工交互验收；本批源码尚未重新链接进入正式exe，完整稀疏导入门禁仍保留，全部功能迁移未完成。


### 2026-11-05 粘贴恢复后的继续编辑与组锁定集成

追加空槽/已有透明Cel对照：取消选择→撤销恢复浮动→翻转/移动/旋转/RotSprite→提交或取消，以及再次撤销重做，结果一致。未为此更改既有恢复算法。核对legacy workspace-restored-clipboard.ts restoredClipboardSnapshot、workspace-floating-preview-command.ts恢复编辑入口。

另按legacy workspace-commands-clipboard.ts pasteSelection的isLayerEffectivelyLocked修复普通栅格粘贴入口只检查layer.locked的迁移差异；改为共享layerEffectivelyLocked。新增自身锁定和嵌套祖先组锁定、有无Cel的拒绝回归，选区/history/content/Cel数/dirty保持不变。

document-raster-history-tests构建运行exit0，日志 absent-paste-integration-tests.log。唯一正式exe已重新链接，构建日志 absent-paste-integration-build.log；通过native/start-native.bat运行--deselect-check与--playback-floating-check，两个进程exit0。此处覆盖实际编辑器既有取消选择和播放提交路径，不等同于缺失Cel人工交互验收；本节更新上一批尚未进入正式产物的状态。完整软件迁移仍未完成，稀疏工程导入门禁继续保留。


### 2026-11-05 空槽浮动内容居中顺序

对照legacy workspace-commands-selection-move.ts centerActiveContent先处理pendingPaste+selection，再读取活动图层内容；其移动入口采用allowOutsideCanvas=true并核对effective lock。原生此前在浮动分支之前要求activeSurfaceIfPresent，导致空槽剪贴板及透明选区浮动无法居中。现将既有浮动变换分支前置，沿用Math.round等价取整、flip origins/quad平移和transformFloatingPaste，不改变非浮动空槽无操作语义。

新增对照已有透明Cel的水平/垂直/双轴居中，普通剪贴板、旋转、缩放与透明选区浮动，居中再次调用无操作及取消恢复；验证预览像素/选区一致且不创建Cel、不改history/content/dirty。document-raster-history-tests构建运行exit0，日志native/build/absent-floating-center-tests.log。此次核心修改尚未重新链接正式exe，未做人工交互验收；全部功能迁移与完整稀疏生命周期仍未完成。


### 2026-11-05 空槽平滑笔刷

核对legacy core/smooth-brush.ts applySmoothBrush：readSource将alpha为0的颜色归零，全透明源没有可生成的变化；animation.ts空活动槽位显示透明。原生applySmoothBrush先校验visited范围，再对缺失活动Cel返回false，避免cel().id解引用，不分配整画布，不改变已有表面算法。新增与已有透明Cel对照，覆盖强度0/1/50/100、无选区/矩形/掩码、有无不透明背景，确认Cel/history/revision/content/dirty/合成不变及损坏覆盖拒绝。document-raster-history-tests构建运行exit0（absent-smooth-tests.log）。本批核心源码未重新链接正式exe，无人工UI验收。

资源路径检查另确认beginStroke缺失Cel的透明画布resize发生在现有扩展预算门禁之外；这一分配前预算缺口尚未修复，不将当前空槽绘图称为完整资源边界验收，也不放开稀疏导入门禁。全部功能迁移仍未完成。

### 2026-11-05 空槽笔刷分配前预算与正式集成

beginStroke 的缺失普通栅格 Cel 分支现在先复用 adjustmentStorageBudget(timeline_,1) 和既有 256MiB 像素存储上限，再分配透明预览画布。该上限是必要原生资源适配，不是 legacy 的产品要求；legacy animation.ts 的显示编辑后才物化 Cel 生命周期及笔刷算法保持原有迁移语义，缺失链接图层仍拦截，总笔划与历史工作内存核算仍不完整。

回归以非活动帧 8192×8192 owner 占满预算，确认缺失活动槽落笔在预览分配前拒绝，Cel/history/revision/contentRevision/dirty 以及既有存储身份、数据地址和版本不变；释放一行存储后允许开始并取消，仍不创建 Cel。document-raster-history-tests 构建与运行通过，日志 native/build/absent-stroke-budget-build.log、absent-stroke-budget-tests.log。

唯一正式产物 native/build/Release/moonsprite-native.exe 已构建成功（absent-stroke-budget-app-build.log），同时纳入前两节浮动内容居中和平滑笔刷修复，更新此前尚未重新链接的状态。通过 native/start-native.bat 运行 --brush-preview-check 与 --deselect-check 均 exit0；这些是既有编辑器自动检查，未完成缺失 Cel 人工交互图像验收。完整功能迁移仍 INCOMPLETE，稀疏导入门禁保留。
### 2026-11-05 空槽断开 Cel 连接

核对 legacy core/animation.ts disconnectAnimationCels 只遍历已有 Cel，空目标返回 false，以及 workspace-commands-animation-cel-properties.ts 将选择槽位映射为已有 Cel。原生 canDisconnectSelectedCels、disconnectSelectedCels 的活动目标回退与 disconnectCel 直接入口改用 nullable Cel，空槽无操作；活动槽缺失时仍保留显式源/别名选择的既有断开算法。

document-raster-history-tests 构建运行 exit0（native/build/absent-disconnect-build.log、absent-disconnect-tests.log）。新增回归覆盖空槽无选择不改变 Cel/history/revision/content/dirty，以及空活动帧中选择已有源或别名断开，像素与 Cel 数不变、撤销重做恢复链接。此次源码尚未重新链接正式 exe，未做人工 UI 验收。

帧复制进一步核对：legacy clearLayerSurface 保留显示 layer.width/height/offset，applyFrameSurfaces 在有 Cel 时更新，跨工程 frame clipboard 从显示 layer 取几何。原生目前缺少对应显示几何状态，copySelectedFrames 的缺失活动槽异常仍待迁移；不能以画布尺寸回退假定等价。稀疏导入门禁及完整迁移 INCOMPLETE 状态保留。
### 2026-11-05 空槽帧复制的显示几何承接

依据 legacy core/animation.ts clearLayerSurface/applyFrameSurfaces 与 workspace-commands-animation-frame-clipboard.ts copySelectedAnimationFrames，新增按图层保存的运行时显示几何：从已有解析表面投影宽高和偏移，切入缺失槽位保留；正常变更发布和帧/历史投影更新已有表面。copySelectedFrames 缺失活动 Cel 时读取该状态，不创建 Cel，不以画布尺寸猜测源几何。

回归覆盖 3×2 表面、负偏移、两个不同几何帧先后进入同一空槽，空载荷不改变 Cel/history/revision/content/dirty；跨工程新增图层使用保留几何并可撤销重做。document-raster-history-tests 构建运行 exit0，日志 native/build/absent-frame-geometry-build.log、absent-frame-geometry-tests.log。625 文件来源登记覆盖、diff --check 通过；行为等价仍 INCOMPLETE。

本批尚未重新链接正式 exe、未做人工 UI 验收。工程初始缺失槽位的持久化显示几何尚未迁移，仍保留 full-slot 导入门禁；缺失链接层、文字/瓦片槽位及整体稀疏生命周期仍待继续迁移。
### 2026-11-05 空槽显示几何的工程回档事务

核对 legacy workspace-commands-document-io.ts cloneProjectRollbackSnapshot 使用 structuredClone(document)，restoreProjectRollbackSnapshot 经 sessionFromDocument 替换整份文档，因此图层显示宽高和偏移也属于 before/after 快照。原生 RollbackPayload 现保留 displayedLayerGeometry，capture 复制、take 移动、apply 在候选状态准备后安装，避免空活动槽回档沿用当前或缺失的几何。

新增回归在同一空活动槽中，将 3×2、偏移(-7,9)的备份与经另一帧显示的8×6几何互换，检查回档、撤销、重做后的帧剪贴板几何、一次历史和不创建 Cel。document-raster-history-tests 构建运行 exit0（native/build/absent-geometry-rollback-build.log、absent-geometry-rollback-tests.log）；来源登记覆盖与差异格式检查通过。take 路径已编译，未单独增加运行用例。

此次源码未重新链接正式 exe，无人工 UI 验收。工程初始空槽的持久化几何尚未接通，项目导入/编码的 full-slot 门禁继续保留；完整功能迁移仍 INCOMPLETE。
### 2026-11-05 跨缺失槽位连接 Cel

核对 legacy animation-slot-selection.ts animationLinkSlotKeys 扩展中间空槽 key 后，workspace-commands-animation-cel-properties.ts connectSelectedAnimationCels 只从 timeline.cels 过滤实际存在目标。原生 connectSelectedCels 在扫描首尾之间时跳过不存在 Cel，消除对空指针的 id/content 读取，不创建中间 Cel；已有空白 Cel 的范围扩展算法不变。

新增可见/全透明端点对照，覆盖缺失中间槽、连接/撤销/重做、源像素及 Cel 数量。document-raster-history-tests 构建运行 exit0，日志 native/build/sparse-connect-build.log、sparse-connect-tests.log。工程 manifest 已有 layer.surface 几何，但初始缺失槽位接入仍需承接加载与完整生命周期；full-slot 门禁不变。
正式集成补记：native/build/Release/moonsprite-native.exe 构建 exit0（native/build/sparse-connect-app-build.log），纳入空槽断开连接、显示几何帧复制、几何回档事务及跨空槽连接修复。通过唯一入口 native/start-native.bat 运行 --cel-clipboard-check、--deselect-check，两个进程 exit0；前者覆盖实际编辑器 Cel/帧剪贴板菜单及上下文路径，后者覆盖既有取消选择路径，不作为缺失 Cel 人工交互验收。更新前几节未链接正式程序的状态；全部功能迁移仍 INCOMPLETE。
### 2026-11-05 从缺失活动槽新建动画帧

对照 legacy core/animation.ts blankSurfaceFromLayer（1×1透明、零偏移）、duplicateAnimationFrame 的 nullable source 回退和 inheritAnimationFrameCelLinks 的缺失源跳过，原生 addFrame 的复制分支不再解引用缺失源；普通空槽新建/复制产生1×1透明 Cel，自动关联跳过缺失源。addLinkedFrame 的源扫描同样跳过缺失槽。

新增普通空白/复制/末尾插入关联帧与 autoLink 开关共6种回归，验证一次历史、新帧透明几何、原槽不创建 Cel、Undo/Redo。document-raster-history-tests 构建运行 exit0（native/build/absent-frame-create-build.log、absent-frame-create-tests.log）。特殊图层缺失源仍拦截；非插入关联帧的缺失目标、已有源新建空白帧仍用原生画布几何的差异尚待继续迁移，不宣称整个新建帧生命周期等价。

本批尚未重新链接正式 exe，未做人工交互验收。完整功能迁移仍 INCOMPLETE，稀疏工程导入门禁保留。
### 2026-11-05 普通空白帧统一紧凑透明几何

按 legacy core/animation.ts blankSurfaceFromLayer 的固定1×1透明零偏移，以及 addBlankAnimationFrame 先生成空白再 inheritAnimationFrameCelLinks，原生 addFrame 普通栅格空白表面不再根据源存在与否分配整画布。可见源且开启autoLink时仍继承既有源身份/几何；tilemap/free与复制已有源的分支不变。

回归覆盖3×2负偏移源、可见/透明、autoLink开关、帧Undo/Redo及1×1之外落笔后的像素Undo/Redo。首轮失败定位为测试越界读取旧整画布存储假设，以及新增测试误要求笔划Undo收缩几何；改用canvasPixels检查可观察像素，未修改既有笔划历史算法。document-raster-history-tests与moon-core-tests均exit0，日志native/build/blank-frame-geometry-*.log。

本批尚未重新链接正式exe、无人工UI验收。新建帧的保守整画布容量门禁、非插入关联帧缺失目标以及特殊图层缺失源仍待继续迁移；完整功能迁移INCOMPLETE，稀疏导入门禁保留。
### 2026-11-05 关联帧复用缺失目标槽位

核对 legacy core/animation.ts linkAnimationFrameCels 对 !target 跳过；store/workspace-animation-linked-cel.ts linkCelsInRightFrame 在下一帧存在时复用该帧、保存已有目标Cel快照、切帧并清理选择，即使没有链接改变也记录一次帧/选择历史。原生 addLinkedFrame 目标查找增加 end 检查，不再解引用缺失槽，不创建替代Cel或插入新帧。

回归覆盖可见/空白源与Cel/帧头选择，确认下一空槽保持缺失、帧/Cel数量不变、一次历史、选择清理，Undo恢复原帧及选择、Redo回到空槽。document-raster-history-tests构建运行exit0（native/build/linked-absent-target-build.log、linked-absent-target-tests.log）。本批未重新链接正式exe、未做人工UI验收；特殊图层缺失源、工程初始空槽持久化及完整迁移仍未完成，稀疏导入门禁保留。
### 2026-11-05 紧凑空白帧的原生资源准入

此前 addFrame 以画布面积×图层×全部帧数估算，和 legacy animation.ts 的紧凑1×1空白表面相冲突。普通栅格路径现复用 adjustmentStorageBudget 的已有链接存储去重，累加新表面与detached历史副本，并为蒙版及其快照预留空间，在帧身份和表面分配前拒绝越限；保留10000帧及原生256MiB限制，特殊tile/free路径仍采用原门禁。该限制是原生适配，非legacy产品要求；总历史/元数据/文字工作内存仍未完整核算。

新增1024×1024画布连续70个紧凑空白帧、帧Undo/Redo和原始大表面不变回归；另以非活动8192×8192表面占满存储，确认新建帧拒绝且frame/history/revision/dirty不变。document-raster-history-tests与moon-core-tests构建运行均exit0，日志native/build/compact-frame-budget-*.log。本批未链接正式exe、未做人工UI验收；完整功能迁移仍INCOMPLETE，稀疏导入门禁保留。
### 2026-11-05 整 Cel 粘贴缺失目标的取消语义

对照 legacy core/animation.ts mapAnimationCelBlock 仅返回已有目标，workspace-commands-animation-cel-clipboard.ts 同工程 placements 与跨工程 resolvedDestinations 必须覆盖全部源条目，否则取消。原生 pasteCopiedCels 活动目标改为 nullable 查找，并在预算/候选分配前拒绝既有帧中的任意缺失块目标，避免活动 cel() 异常或后续 slot->id 空指针读取；不自行物化缺失槽。

同/跨工程与缺失首目标/后续目标共4种回归，验证无像素、frame/Cel/history/revision/content/dirty/选择变更，旧剪贴板保留。document-raster-history-tests 构建运行 exit0（native/build/cel-paste-missing-build.log、cel-paste-missing-tests.log）。新增帧目标沿用已有创建行为；selection-only Cel 浮动路径未由本批验收。

本批尚未链接正式exe、无人工UI验收。完整功能迁移仍 INCOMPLETE，稀疏工程导入门禁保留。
### 2026-11-05 Cel选区载荷跳过非活动缺失目标

核对legacy workspace-paste-cel-selection.ts创建目标状态后，selection-transform-targets.ts selectionTransformLayerForState对非活动帧经animationLayerAtFrame解析，缺失槽返回null并跳过预览。原生beginCelSelectionPaste收集目标时改为nullable，不再对缺失目标读取id；浮动目标仅保留实际存在Cel，不创建替代槽，既有预览/提交/取消算法不变。

回归覆盖已有活动目标+下一帧缺失目标，取消、提交、像素Undo/Redo及空槽/Cel数保持，document-raster-history-tests构建运行exit0（native/build/selection-paste-missing-build.log、selection-paste-missing-tests.log）。活动槽缺失的anchor仍未迁移，全部目标跳过时不建立浮动状态；不将此近似边界称为完整旧版浮动生命周期等价。

本批未链接正式exe、无人工UI验收。完整迁移仍INCOMPLETE，稀疏工程导入门禁保留。
### 2026-11-05 整 Cel 活动目标修复更正

复查发现前述 celPasteMissingDestination 的首次字符串替换实际落在 beginCelSelectionPaste，pasteCopiedCels 仍为 &cel()；优化测试返回false不能证明该空指针解引用安全。现明确修复整Cel入口，使用 findCel(activeLayerId_,activeFrameId_)，源码检查不再保留该目标回退表达式。新增直接调用 pasteCopiedCels 与 beginCelSelectionPaste 的缺失anchor回归，确认无浮动/Cel/history/revision/content/dirty变更、剪贴板保留。

另核对legacy workspace-commands-animation-cel-clipboard.ts selectionOnly 分支确实先commitFloatingPaste，再进入pasteCelSelection，因此本批不改变该顺序。document-raster-history-tests构建运行exit0（native/build/cel-anchor-direct-build.log、cel-anchor-direct-tests.log）。活动空槽的选区载荷生命周期仍未迁移，不以返回false宣称等价完成。本批未更新正式exe、无人工UI验收，完整迁移仍INCOMPLETE。
### 2026-11-05 紧凑帧与Cel粘贴正式集成

唯一正式exe重新构建exit0（native/build/compact-frames-integration-build.log），纳入紧凑空白帧、缺失源/目标关联帧、实际存储准入和Cel粘贴目标修复。通过native/start-native.bat运行--cel-clipboard-check、--playback-floating-check均exit0。

--animation-check未通过：进程数分钟未退出，本轮正常关闭测试窗口后exit1，native-animation-error.txt更新为Cross frame dimension refusal atomic。定位editor_smoke.cpp smokeCrossProjectFrameClipboard仍要求2×1目标拒绝1×1源帧；当前pasteFrameClipboard已支持保留源表面的跨尺寸粘贴。此为下一轮须按legacy核对修正的验收差异，不能将总检查记绿；正常关闭行为可能涉及待处理错误提示，未进行强制终止或删除恢复数据。完整迁移仍INCOMPLETE，无人工交互验收。
### 2026-11-05 跨尺寸帧粘贴编辑器验收修正

核对legacy workspace-commands-animation-frame-clipboard.ts pasteCrossDocumentAnimationFrames 与 workspace-animation-cel-target.ts animationCelForTarget：额外图层采用源几何，RGBA表面直接克隆，不以目标画布尺寸拒绝。editor_smoke.cpp旧Cross frame dimension refusal atomic断言已替换为成功跨尺寸粘贴，检查2×1目标画布不变、1×1源表面不缩放、原点像素与其余透明、一次结构变更及Undo/Redo。main.cpp既有--cel-clipboard-check纳入smokeCrossProjectFrameClipboard，便于专项验证；未更改生产粘贴算法。

正式exe构建exit0（native/build/cross-frame-acceptance-build.log）；通过唯一入口运行--cel-clipboard-check exit0，已覆盖本次跨工程用例，来源登记和diff检查通过。上轮动画总检查的此项失败已由专项验收关闭，但未重新运行整个--animation-check，不宣称总检查通过。完整功能迁移仍INCOMPLETE，无人工UI验收。
### 2026-11-05 动画总检查后续失败定位

重跑--animation-check，正常关闭本轮测试窗口后exit1，更新native-animation-error.txt为Selected Cel cut menu transaction。为避免复合断言掩盖原因，将smokeMigratedTimelineActions纳入既有--cel-clipboard-check，拆分命令/像素/选区/剪贴板/修订号断言。正式构建exit0（native/build/cel-cut-acceptance-build.log），专项检查exit1明确为Selected Cel cut clipboard lost selection payload：像素与选择清理已通过，Cel载荷路由未通过。

源码定位editor_canvas.cpp copyEditorClipboard在document.selection()时优先copySelectionPixels，早于celClipboardContext；legacy app-document-shortcuts.ts在selectedAnimationCellKeys且!selectionOverride()时优先Cel，useAppCommandScope.ts通过pointer/focus和COMMAND_SCOPE_EVENT维护selectionCommandOverrideRef，显式preferSelection事件才覆盖。原生尚缺对应作用域状态，不能仅换条件顺序而破坏画布选区剪切。此次只增强验收定位，生产路由未改变；下一步迁移该作用域/选择覆盖契约。完整迁移INCOMPLETE，正式程序当前专项检查如上失败，非通过。
### 2026-11-05 Cel剪贴板选择覆盖路由专项验证

按legacy useAppCommandScope.ts、app-document-shortcuts.ts、app-selection-shortcuts.ts与layer-cell-shortcuts.ts迁移显式选择覆盖状态：编辑器鼠标按下清除覆盖，全选像素及时间轴Alt内容选择设置覆盖；未覆盖时所选Cel先进入Cel剪贴板路径，显式覆盖保留像素选区复制。专项验收同时检查选择载荷Cel剪切与全选像素复制覆盖。

唯一正式exe构建exit0（native/build/cel-selection-scope-build.log），通过native/start-native.bat运行--cel-clipboard-check exit0。此前Selected Cel cut clipboard lost selection payload专项失败已关闭。子窗口焦点与蒙版作用域仍未完整迁移，未重新运行动画总检查、无人工UI验收；完整迁移仍INCOMPLETE。

### 2026-11-05 Enter粘贴撤销与紧凑Cel验收

动画总检查正常关闭测试窗口后exit1，native-animation-error.txt更新为Enter paste undo。smokeSelectionEnter在撤销粘贴恢复1×1空白Cel后仍读pixels()[1]，越过表面存储边界；legacy core/animation.ts blankSurfaceFromLayer明确创建1×1空白表面。该验收三处改读canvasPixels()[1]，验证画布坐标语义。legacy app-completion-shortcuts.ts Enter先commitFloatingPaste再commitSelectionChange，仍要求两步Undo，未修改生产行为。

既有--playback-floating-check纳入smokeSelectionEnter；正式exe构建exit0（native/build/selection-enter-compact-build.log），通过唯一启动入口运行专项exit0，覆盖粘贴提交、选区完成、两步撤销及Enter播放守卫。未重跑修正后的动画总检查，无人工UI验收。另已核对legacy app-document-shortcuts.ts未覆盖时所选蒙版Cel应先于像素选区，原生路由尚待补齐。完整迁移仍INCOMPLETE。

### 2026-11-05 蒙版Cel剪贴板作用域优先级

核对legacy app-document-shortcuts.ts所选蒙版优先于Cel和像素选区（除非selectionOverride），workspace-cut.ts蒙版剪切先复制后删除所选动画项。copyEditorClipboard新增相同未覆盖蒙版路由，保留显式全选像素覆盖。专项增加蒙版/像素选区并存的复制、剪切、Undo与全选像素覆盖检查，验证原图像素和选区不被蒙版剪切替代修改。

正式exe构建exit0（native/build/mask-clipboard-scope-build.log），通过唯一入口运行--cel-clipboard-check exit0。来源覆盖与diff检查通过。子窗口焦点作用域仍部分未迁移；未运行动画总检查和人工UI验收。完整功能迁移仍INCOMPLETE。

### 2026-11-05 动画验收窗口与鼠标捕获环境

动画总检查正常关闭后报告Loop edge captures mouse（drag=1、capture=0）。检查main.cpp发现--animation-check在desktop.addChild/openWindow之前运行，无法取得窗口鼠标捕获；未据此修改生产循环状态机。验收入口补齐桌面挂载和打开；既有播放专项纳入smokeLoopTrack，检查边缘捕获、释放最终指针提交、Undo、Escape/失焦/捕获丢失取消及边缘自动滚动。

正式exe构建exit0（native/build/animation-capture-harness-build.log）；唯一入口--playback-floating-check exit0。重跑--animation-check后正常关闭exit1，更新错误为Delete implicit active Cel，循环拖拽已越过，删除路由为下一项待核对。来源覆盖与diff检查通过，无人工UI验收。完整迁移仍INCOMPLETE。

### 2026-11-05 Delete快捷键作用域迁移

专项复现Delete implicit active Cel：唯一图层、像素未变、history未变，排除切片/蒙版/焦点残留。runShortcutCommand将默认deleteLayer快捷键映射图层菜单并受canDeleteLayers限制，唯一图层时提前返回；legacy app-completion-shortcuts.ts与core/command-context.ts要求无其他选择时删除活动Cel。新增deleteLayer快捷键专用键盘作用域路由，保留所选切片优先级，使用既有deleteWorkspaceContent(true)，不修改图层菜单含义。

正式构建exit0（native/build/keyboard-delete-scope-build.log）；既有--playback-floating-check纳入smokeDeleteRouting并exit0，覆盖隐式/显式Cel、Backspace、帧、图层、像素选区、Undo与Entry守卫。来源与diff检查通过，未重新运行动画总检查，无人工UI验收。完整迁移仍INCOMPLETE。

### 2026-11-05 多边形重做快捷键验收修正

Delete修正后动画总检查继续推进到Polygon step redo失败。核对legacy core/shortcut-contracts.ts：redo默认Ctrl+Shift+Z，Ctrl+Y为relativeLuminance；native shortcut_catalog.h已采用相同默认。smokeSelectionTools旧输入仍发Ctrl+Y，现改发Ctrl+Shift+Z，保留右键局部撤销及重做顶点断言；未修改生产快捷键或多边形状态机。

正式构建exit0（native/build/polygon-redo-binding-build.log）；唯一入口重跑--animation-check，正常关闭测试窗口后exit1，更新错误Brush property shortcuts UI shape=0 size=1 angleVisible=0，已越过多边形重做。笔刷属性快捷键为下一项待核对，总检查未通过。来源与diff检查通过，无人工UI验收，完整迁移仍INCOMPLETE。

### 2026-11-05 笔刷属性可配置快捷键作用域

动画检查Brush property shortcuts UI失败，原生runShortcutCommand的brushShape/brushSize入口限制ordinaryBrushTool，提前拦截editor_input已有选区画笔/形状分支。核对legacy app-tools-shortcuts.ts形状快捷键无普通画笔限制；useAppShortcutRouter.ts尺寸处理特殊工具后setBrushSize，workspace-commands-tool.ts保留固定尺寸图像笔刷限制但shape/smooth例外。原生移除多余普通画笔限制，保留特殊工具及图像尺寸门槛（shape例外）。

正式构建exit0（native/build/brush-property-scope-build.log）；唯一入口--animation-check已越过选区画笔Ctrl+3、]及角度显示断言，后续自行退出1：Quick selection must precede transform hit。总检查仍失败，快速选择/变换优先级待核对。来源与diff检查通过，无人工UI验收，完整迁移仍INCOMPLETE。

### 2026-11-05 快速选择验收捕获状态修正

核对legacy canvas-input-selection-begin.ts快速第二次按下先于选区/变换命中，原生顺序已一致。诊断显示失败时未进入选择创建（无press、preview或drag）。smokeSelectionTools键盘辅助函数直接disableFlags(HAS_CAPTURE)，留下Manager捕获者与Widget标志不一致，canvasOwnsPointer拒绝后续事件。改用releaseMouse同步释放，不修改生产快速选择算法，并保留详细失败诊断。

正式构建exit0（native/build/quick-selection-capture-build.log）；唯一入口--animation-check正常关闭测试窗口后exit1，后续错误为Gradient pending tool lock，已越过Quick selection must precede transform hit与Quick cell commit。来源及diff检查通过，无人工UI验收，动画总检查和完整迁移仍INCOMPLETE。

### 2026-11-05 待确认渐变工具切换守卫

legacy workspace-commands-tool.ts setTool在pendingGradientFor存在时拒绝不同工具，setFillKind拒绝离开gradient。原生可配置工具快捷键直接修改工具标志，绕过已有入口限制。runShortcutCommand在临时工具恢复和工具分发之前消费待确认期间的工具快捷键，保留Enter应用、Escape取消。

正式构建exit0（native/build/pending-gradient-tool-scope-build.log）；唯一启动入口--gradient-shape-check exit0，覆盖待提交工具锁定、取消、反向渐变应用及Undo。--animation-check本轮等待时正常CloseMainWindow后exit0，不能称无人干预完成；native-animation-error.txt仍为旧文件，不能作为本轮错误。来源与diff检查通过，无人工UI验收。动画覆盖仅限已有smoke断言，工程稀疏槽/完整历史持久化等已登记缺口仍在，完整迁移INCOMPLETE。

### 2026-11-05 缺失Cel填充暂存预算

核查稀疏工程准入时确认prepareEditableImport与Document::fromImported仍要求全槽；缺失活动槽的图层显示几何尚无导入交接，部分编辑路径仍有限制，因此本批保留IO门槛，不以删除门槛声称迁移完成。另定位fillSparse缺失槽分支直接分配画布，绕过现有槽sparseFillCanvas的文档+暂存256MiB准入。现复用该已有准入/暂存路径，以1×1透明空源生成画布，不改变填充算法、Cel延迟创建或历史语义。

新增回归用256MiB非活动owner分别触发普通/图案填充，确认分配前拒绝且Cel数、历史、revision/contentRevision、dirty及存储身份不变。document-raster-history-tests构建/运行exit0（native/build/absent-fill-budget-build.log、absent-fill-budget-tests.log）。来源及diff检查通过；本批正式编辑器尚未重链接、无人工UI验收。稀疏导入/保存及整体迁移仍INCOMPLETE。

### 2026-11-05 缺失Cel填充正式集成与共享预算核对

上一批缺失Cel填充暂存预算已重链接唯一正式exe，构建exit0（native/build/absent-fill-integration-build.log）；通过唯一启动入口--gradient-shape-check exit0。

继续核对legacy animation.ts clearLayerSurface保留显示几何且不分配Cel，与原生稀疏导入缺少显示几何交接的缺口一致，IO门槛仍保留。探索共享存储预算去重，回归证明输入可共享，但当前缺失Cel填充构造candidate timeline深复制存储；单独去重会低估事务内存，故撤回本轮去重及探索性测试，保留保守预算，不声称共享事务迁移完成。完整迁移仍INCOMPLETE，无人工UI验收。

### 2026-11-05 导入图层显示几何交接

legacy animation.ts clearLayerSurface清空显示像素时保留图层几何；applyFrameSurfaces只在存在Cel时从其表面更新几何。PreparedImport现保留ManifestLayer表面几何，createEditableDocument选好活动帧后交给Document的已校验几何接口，活动现存Cel仍优先投影。接口先校验全部身份/正尺寸/坐标边界再安装，不创建Cel或历史。

project-import-tests与document-raster-history-tests构建/运行均exit0（native/build/import-display-geometry-*），新增检查prepared几何与缺失槽帧剪贴板几何、无Cel/历史/revision变更、无效身份拒绝后缓存保留。来源及diff检查通过。全槽IO门槛仍保留，缺失槽完整编辑/保存/重开未验收；本批正式编辑器尚未重链接、无人工UI验收，完整迁移INCOMPLETE。

### 2026-11-05：缺失 Cel 的编码与图层显示回退

- 依据 `legacy/src/renderer/src/core/animation.ts` 的 `clearLayerSurface/applyFrameSurfaces`、`project-format-encode.ts` 的 layer/animation.cels 编码及 `project-format-raster.ts::encodeRuntimeRasterData`，编码器遍历帧时跳过缺失槽，不生成空 Cel。
- 活动槽缺失时保留 Document 缓存的图层尺寸和偏移，输出独立 `layers/<id>.rgba.tiles` 透明显示资源（64px tile、24字节空头，小图也使用 runtime sparse 格式）；计入展开像素预算，原资源清理同时保留图层显示资源。预览使用可选活动 Surface，并由现有合成器生成透明空帧。
- 回归覆盖有/无源归档、所有槽/仅活动槽缺失、小/大显示几何、普通/恢复/历史三种编码、旧 Cel 资源清理、精确空头字节、空帧预览和无文档副作用。验证：`cmake --build native/build --config Release --target project-save-tests --parallel 4` 退出0；`native/build/Release/project-save-tests.exe native/build/project-manifest-fixtures` 退出0（完整工程保存回归，含上述新增用例）。日志 `native/build/absent-slot-encode-build.log`、`native/build/absent-slot-encode-test.log`。
- 边界：此批为编码与预览实现。`prepareEditableImport`、`Document::fromImported` 及正式保存重开校验仍保留稀疏槽准入限制；尚不能声称稀疏工程可完整打开、编辑和保存。未改动正式程序产物。

### 2026-11-05：无关关联组不再阻止普通图层空槽绘图

核对 `legacy/src/renderer/src/core/animation.ts::syncActiveAnimationLayer` 与 `synchronizeLinkedLayerGroupContentsForTimeline`：单图层提交只对该图层所属关联组同步。原生六处缺失槽保护此前检查整个时间轴的 `hasLinkedLayers()`，导致文档中其他图层的关联关系也阻止普通空槽编辑。改为检查当前图层的 `linkedContentId`，覆盖画笔、选区填充、浮动粘贴、普通/图案填充、渐变、形状入口。

新增七组自动回归，确认取消不创建槽或历史，提交生成一个 Cel 和一个历史项，撤销/重做恢复像素，其他关联组的像素和共享存储身份持续一致。`document-raster-history-tests` 构建和完整测试退出0；日志 `native/build/unrelated-links-absent-build.log`、`native/build/unrelated-links-absent-test.log`。当前活动图层本身属于关联组时的稀疏生命周期仍明确未迁移；正式程序本轮未重新链接，尚未进行桌面验收。

### 2026-11-05：关联图层缺失活动 Cel 的画笔提交

依据 `animation.ts::syncActiveAnimationLayer/synchronizeLinkedLayerGroupContentsForTimeline` 的活动源优先规则，为 Timeline 构造增加可选 preferredOwner，确保首次共享就采用新提交 Cel，避免先构造再指定源时新数据已被覆盖。画笔缺失槽提交接入该参数，取消或无变化不创建槽；仅创建活动槽，同组缺失同伴不自动补槽。已有同伴按旧版连通分量共享新像素及保持独立放置。

新增四种组合回归（同伴有/无槽 × 有/无跨帧 Cel 链接），检查取消、透明空笔画、新槽数、提交内容、共享身份及撤销/重做。构建 `document-raster-history-tests timeline-model-tests` 退出0；两个完整测试均退出0。日志：`native/build/linked-absent-brush-build.log`、`linked-absent-brush-test.log`、`linked-absent-timeline-test.log`。

范围仍有限：关联空槽的其他工具仍保留未迁移保护，稀疏导入与正式保存重开限制未解除；正式应用未重新链接，无桌面验收结论。

### 2026-11-05：关联空 Cel 的填充、渐变、形状和粘贴

沿用画笔已验证的 Timeline preferredOwner 构造能力，将缺失槽的普通/图案填充、选区填充、渐变/形状、浮动粘贴提交均设为新 Cel 优先源，移除对应未迁移保护。依据 `animation.ts::syncActiveAnimationLayer/synchronizeLinkedLayerGroupContentsForTimeline`、`linked-layers.ts::shareLinkedRasterContent`，以及 `workspace-commands-history.ts` 提交像素历史后同步活动图层的顺序。仅活动槽创建 Cel，同组缺失槽保持缺失；关联共享仍使用现有连通分量算法。

新增24种组合测试（同伴槽有/无 × 跨帧链接有/无 × 六类工具），验证预览取消、单槽/单历史提交、共享存储身份及撤销/重做像素。`document-raster-history-tests` 构建和完整运行均退出0；日志 `native/build/linked-absent-tools-build.log`、`native/build/linked-absent-tools-test.log`。

此结果不等于稀疏工程全功能验收：特殊图层空槽生命周期、导入准入和其他 Cel 消费方仍有缺口。正式程序尚未重新链接，也未做本批桌面运行验收。

### 2026-11-05：空槽渐变预算与画笔安装失效通知

- 空槽渐变入口补齐现有原生稀疏渐变的256MiB像素预算：现有Cel存储、两份画布暂存及可见图层取样缓冲在分配前检查。普通取样直接引用空基线，去掉无用整幅复制。此为原生密集暂存的必要防护，仍不代表已达到legacy稀疏分配性能。
- 新增预算耗尽时两种取样模式均原子拒绝的回归，核对未创建Cel/预览/历史、版本及存储身份不变；释放一行后可预览并取消。`document-raster-history-tests` 构建和完整测试退出0，日志 `native/build/absent-gradient-budget-build.log`、`absent-gradient-budget-test.log`。
- 对照 `workspace-commands-history.ts` 的同步后touch顺序，空槽画笔安装新时间轴后补发内容失效通知，避免最终共享安装仅依赖提交前预览版本。关联空槽画笔回归新增提交内容版本递增断言；再次构建及完整测试退出0，日志 `native/build/absent-install-refresh-build.log`、`absent-install-refresh-test.log`。
- 正式程序未重新链接；全量迁移、稀疏工程准入和桌面验收仍未完成。


### 2026-11-07：迁移继续阶段——显式像素作用域下瓦片剪切验收

用户目标更新为完成全部迁移，每个已验收阶段保存推送dev。范围仍为requirements-baseline的全部已登记功能，不以性能小改或来源覆盖替代功能迁移；当前整体仍INCOMPLETE。

核对legacy app-selection-shortcuts.ts的Select All preferSelection事件、useAppCommandScope.ts作用域状态与app-document-shortcuts.ts Cel优先路由；native既有selectAllPixels/selectionCommandOverride_及Alt Cel内容入口已承接。旧Cut fixture同时selectTimelineCel且直接previewSelection，却未触发显式像素命令，导致实际走Cel Cut。现先调用真实selectAllPixels并断言override，再安装原局部mask；保留Cel选择、RGBA/mask、单历史、Undo/Redo、菜单一致性、pending Create/duplicate及Paint权限等原断言。产品剪贴板优先级未修改。

正式tile-cut-scope-build.log Release构建exit0；--workspace-check --named-workspace-only --drawing-anchor-edit-floating-only完整exit0，--selection-check完整exit0。来源625文件/快照和diff通过。此阶段闭合此前特定Cut组合验收失败，不代表所有剪贴板、瓦片及全量迁移完成；稀疏工程准入、特殊图层生命周期、扩展等仍需按领域缺口逐项推进。源码/来源/记录推送dev，用户数据/缓存/生成物保留。


### 2026-11-07：自由瓦片空白自动链接图层新增帧

对照legacy core/animation.ts自动链接继承：独立源没有可见alpha时不启动链接链。原生addFrame此前只要free-tile层autoLinkAnimationCels为true便无条件拒绝，连无需链接的空白源也被阻断。现按旧版源slot/link/渲染alpha判定，仅实际需要链接时继续在commit前拒绝；空白独立源和缺失源沿既有新增/复制逻辑执行。仍使用公共Timeline，未放宽free Cel必须独立实例的模型约束。

新增空白/复制两类测试，核对独立freeTiles与surface、单历史、Undo/Redo、保存重开。初次fixture空归档导致Missing ZIP directory，改用现有编码器真实容器后，完整free-tile-project-tests exit0。free-empty-auto-frame-build.log正式程序/核心测试构建exit0；夹具修正test-build日志exit0；--workspace-check --named-workspace-only --drawing-anchor-edit-floating-only exit0。来源625文件覆盖/快照及diff通过。无人工UI验收。

仅闭合空白源分支；有内容的自由Cel自动链接、链接编辑传播、导入导出兼容仍未迁移，拒绝保护保留，不称该功能或全部迁移完成。源码/测试/来源/记录推送dev，生成物及用户数据不提交。


### 2026-11-07：自由瓦片缺失Cel复制帧核心分支

对照legacy core/animation.ts duplicateAnimationFrame与blankSurfaceFromLayer：缺失来源时复制生成1×1、原点、透明RGBA。原生addFrame此前对free-tile缺失slot一律拒绝duplicate，现允许该分支，生成独立空CelData（原生模型必须字段的适配）和旧版1×1表面。已有来源与blank新增几何不变，tilemap缺失来源保护保留。

新增autoLink开/关两组合验证独立空数据、精确几何/像素、一次历史、Undo恢复缺失源、Redo恢复新帧。初版fromImported夹具暴露导入仍要求完整slot矩阵，未放宽生产准入；测试明确通过const_cast注入Timeline构造器校验的稀疏状态，仅验证核心命令。稀疏工程导入/重开未通过且未宣称完成。

free-missing-duplicate-build.log正式Release和测试构建exit0；夹具调整free-missing-duplicate-fixture-build.log exit0；完整free-tile-project-tests exit0，--workspace-check --named-workspace-only --drawing-anchor-edit-floating-only exit0。来源625文件/快照及diff通过，无人工UI验收。全量迁移、自由Cel链接、稀疏工程准入仍未完成。源码/测试/来源/记录推送dev，用户数据与生成物保留。


### 2026-11-07：无素材自由瓦片空白帧几何

对照 legacy core/animation.ts::addBlankAnimationFrame、blankSurfaceFromLayer：无 freeTileSources 时空白帧使用1×1原点透明表面，有来源的复制帧保留原几何。原生此前无素材空白帧仍继承旧Cel大表面，现修正这一分支。测试覆盖空白/复制两类几何、独立空实例、单历史与Undo/Redo。

首次重开检查失败为 Missing modern free tile collection metadata。核对legacy core/project-format-decode.ts:435亦拒绝现代格式空素材集合，保留准入并明确测试拒绝；不声称该状态保存重开已迁移。free-source-less-frame-build.log正式Release与核心测试构建exit0，完整free-tile-project-tests exit0（free-source-less-frame-test.log），正式程序工作区drawing-anchor-edit-floating组合exit0。来源625文件快照、diff检查通过。

用户确认窄窗口放不下的顶部菜单收进“更多”。核对现有layoutTopMenu实现已采用此行为；本轮正式--palette-mouse-check（MOONSPRITE_PALETTE_EDGE_REFERENCE=1）exit0，覆盖真实菜单对象的宽窄转换、重复布局、打开更多后调整尺寸、顺序及捕获释放。未进行人工截图验收，无额外菜单实现修改。全部迁移仍INCOMPLETE，自由Cel链接和稀疏准入等缺口继续保留。


### 2026-11-07：特殊图层直接删除当前帧入口

依据legacy core/animation.ts::deleteAnimationFrame，删除当前帧对所有图层类型移除帧、Cel和蒙版，保留资源与至少一个帧。原生deleteSelectedFrames已有特殊图层路径，但deleteFrame仍对包含tilemap/free-tile的文档直接返回。移除该入口阻断，复用现有单帧事务、完整Cel载荷历史、蒙版清理和选区规范化，不改变多选帧删除行为。

新增自由瓦片/瓦片网格×首帧/末帧四组合回归，检查单历史、画布/Cel选择清理、剩余实例/网格/像素及资源不变、蒙版删除、保存重开、Undo完整载荷恢复、Redo及最后一帧无操作。首次测试编译暴露tiles结构没有整体相等操作符，改为逐字段核对资源与网格，未改产品模型。正式Release和核心测试构建exit0（direct-special-frame-build.log）；完整free-tile-project-tests exit0（direct-special-frame-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照及diff通过。没有人工UI验收。自由Cel链接、稀疏准入等既有缺口不因入口接通而视为迁移完成，整体仍INCOMPLETE。


### 2026-11-07：瓦片Cel断开连接入口及完整载荷

对照legacy core/animation.ts::disconnectAnimationCels，断开时克隆解析来源的surface、tilemap/freeTiles/text、opacity和zIndex，选中来源则断开其链接组。原生模型/IO已支持瓦片Cel链接，但disconnectSelectedCels和disconnectCel仍按整篇文档含特殊图层直接返回。移除此阻断；单Cel入口补齐来源网格/文字/实例及属性复制、解析校验和活动透明度投影，选中Cel入口沿用已有完整载荷事务。

新增瓦片单Cel、选中别名、选中来源三组合回归，核对独立网格尺寸/单元、像素、透明度/层叠值，未选中别名保持链接，一次历史、Undo恢复无载荷别名、Redo、实际保存重开和重复断开无历史。tile-disconnect-build.log正式Release及free-tile-project-tests/tilemap-project-tests构建exit0；两个完整测试exit0（tile-disconnect-free-test.log、tile-disconnect-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0。来源625文件快照、diff通过，无人工UI验收。

自由瓦片Cel链接仍受模型约束，未新增或宣称其链接支持；整体迁移仍INCOMPLETE。用户数据、缓存和构建生成物不提交。


### 2026-11-07：瓦片Cel选中连接事务

依据legacy animation-slot-selection.ts::animationLinkSlotKeys与animation.ts::connectAnimationCels，按选中端点补齐空槽并跳过未选中可见内容，取首个可见规范来源共享完整载荷。移除connectSelectedCels的全篇特殊图层阻断，瓦片使用已有连接事务；选中自由瓦片组确需链接时在任何编辑前明确拒绝，保留其尚未迁移模型保护。

新增空白/可见间隔两组合测试，验证链接与网格、像素、opacity/zIndex、未选中内容保留、选区保留、单历史、Undo/Redo、实际保存重开、重复连接无历史，及Create模式选区删除传播至来源并可撤销。初版重开断言错误要求别名自带网格，改为通过解析来源检查，符合现有IO链接存储。直接别名画笔检查暴露beginStroke要求cel().tilemap而保存别名不含该字段，尚未解决，明确登记为后续迁移缺口；未宣称画笔传播已通过，保留选区删除的实际通过证据。

tile-connect-build.log正式Release与两核心测试构建exit0；夹具调整tile-connect-fixture-build.log exit0；完整free-tile-project-tests/tilemap-project-tests均exit0（tile-connect-free-test.log、tile-connect-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0。来源625文件及diff通过，无人工UI验收。全量迁移、自由Cel链接、稀疏工程准入与链接别名直接画笔仍未完成。


### 2026-11-07：链接瓦片Cel画笔Create/Edit/Hybrid

针对上一阶段确认的保存重开后payload-free别名无法直接落笔，核对legacy core/tilemap-document.ts::tilemapCelTargetAt解析规范来源，以及canvas-render-brush-path.ts使用解析目标和指针格锚点。原生beginStroke按解析来源检查网格；受既有linkedCreate/Edit/Hybrid可用性约束的笔画读取来源网格锚点，预览写解析表面，取消恢复原像素，提交复用既有链接像素历史，保持别名无私有表面/网格及精确两级链。

新增三模式实际画笔回归，检查begin、cancel无历史、commit单历史、来源与全部别名像素一致、Undo/Redo、实际保存重开。完整free-tile-project-tests和tilemap-project-tests均exit0（linked-tile-brush-free-test.log、linked-tile-brush-grid-test.log）。原有零偏移、完整画布、单目标及引用所有者检查保留；Paint模式、偏移/非标准布局和更广泛多目标仍未完成，不能宣称所有链接绘图迁移结束。


正式构建linked-tile-brush-build.log exit0；最终源码增量确认linked-tile-brush-final-build.log exit0，工作区drawing-anchor-edit-floating组合exit0。来源625文件快照校验与diff通过，无人工UI验收。全量迁移仍INCOMPLETE。


### 2026-11-07：链接瓦片Cel的Paint放置与擦除

依据legacy core/tilemap-document.ts::tilemapCelTargetAt与writeTilemapCell，Paint编辑解析来源网格并重绘该格。原生Paint笔画沿用tilemapCellOwnerSupported的标准零偏移所有者校验，将操作对象设为规范来源；复用现有TilemapPixelHistory的independentCellOwner/linkedCellOwner格子历史能力。预览、取消、提交均更新来源，不向别名添加私有网格或表面，资源像素不变。没有修改共享头文件。

新增放置/擦除两组合回归，包含无私有载荷的两级别名链，检查begin/cancel无历史、单次提交、来源/别名共享像素、资源不变、精确链保留、Undo/Redo及实际保存重开。linked-tile-paint-build.log正式Release及两组测试构建exit0；完整free-tile-project-tests和tilemap-project-tests exit0（linked-tile-paint-free-test.log、linked-tile-paint-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照和diff通过，无人工UI验收。

本批仅推进标准布局的Paint笔画。偏移/非标准布局、多目标、自由瓦片链接和稀疏准入等仍待迁移，整体INCOMPLETE。用户数据、缓存和生成物保留且不提交。


### 2026-11-07：偏移瓦片Paint世界坐标

对照legacy core/tilemap.ts::tilemapCellIndexAtPoint/Bounds，Paint指针先减表面offset再取格；选区按世界坐标检测，镜像格中心亦包含offset。原生Paint笔画应用此转换，将已存在cellOffsetLayout格子历史用于偏移来源，保持规范来源及别名拓扑，避免位置偏移后画错格。

扩大链接Paint回归为12组：横向offset -1/0/+1 × 有无局部选区 × 放置/擦除，核对精确目标格、取消无历史、单历史、源瓦片像素不变、Undo/Redo、实际重开。初次负偏移擦除样本仅有画布外不透明像素，无法断言可见画面变化；补充可见像素后通过，没有为测试更改产品语义。局部缓存与世界画布分别验证，避免把偏移表面像素直接等同canvasPixels。

offset-tile-paint-build.log正式Release/两核心测试构建exit0，夹具构建offset-tile-paint-fixture-build.log exit0；完整free-tile-project-tests与tilemap-project-tests exit0（offset-tile-paint-free-test.log、offset-tile-paint-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0，来源625文件快照及diff通过。无人工UI验收。纵向偏移、对称复杂组合及Create/Edit/Hybrid偏移等尚无本批完整证据，全量迁移仍INCOMPLETE。


### 2026-11-07：瓦片新建链接帧入口

对照legacy store/workspace-commands-animation-frame.ts::addLinkedAnimationFrame、workspace-animation-linked-cel.ts::linkCelsInRightFrame与core/animation.ts::linkAnimationFrameCels：优先选中Cel，再选中帧锚点，再活动帧；复用右侧帧，无右侧才插帧；作用域分别为选中Cel图层、全部图层、活动图层。移除原生addLinkedFrame的tilemap整篇阻断，复用既有链接帧事务；free-tile仍明确在变更前拒绝，未声称其链接模型完成。

新增既有目标/末尾插帧×活动/Cel/帧三作用域六组合回归，混合普通和瓦片图层，核对不移动既有帧列、规范来源网格/像素/opacity/zIndex、未选中行独立、单历史和选择清理、Undo原数据/活动帧、Redo及实际保存重开。linked-tile-frame-build.log正式Release与两组测试构建exit0；完整free-tile-project-tests/tilemap-project-tests exit0（linked-tile-frame-free-test.log、linked-tile-frame-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照及diff通过。无人工UI验收。全部迁移、自由Cel链接、稀疏工程准入等仍INCOMPLETE。


### 2026-11-07：混合自由瓦片文档链接帧作用域

核对legacy workspace-commands-animation-frame.ts的layerIds选择及animation.ts::linkAnimationFrameCels可见来源条件。addLinkedFrame不再因为文档任意free-tile层一律拒绝，只在本次作用域内确需创建可见自由Cel链接时明确拒绝。活动普通层/Cel选择可在混合文档复用下一帧或插帧；空自由来源不创建链接，允许原有导航/历史行为。自由Cel链接模型本身仍未迁移。

新增两种目标位置×三种作用域检查，普通活动/Cel作用域核对无关free数据、链接、Undo/Redo和保存重开；整帧作用域遇可见free来源原子拒绝；额外空free整帧作用域允许且保持独立。首次重开比较将未知JSON字段当作必保留字段，按现有legacy导入规范化规则改为已知实例字段/像素对比，未改格式行为。

mixed-free-linked-frame-build.log正式Release/两核心测试构建exit0；fixture-build日志exit0；完整free-tile-project-tests/tilemap-project-tests exit0（mixed-free-linked-frame-free-test.log、mixed-free-linked-frame-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照和diff通过，无人工UI验收。全量迁移仍INCOMPLETE。


### 2026-11-07：特殊图层活动蒙版填充入口

核对legacy workspace-commands-selection-effects.ts::fillForeground、workspace-session.ts::activePaintLayer（activeLayerMask优先于getActiveLayer）及core/tools-fill.ts。原生fillSelectionOrCanvas此前先按文档含tilemap/free-tile拒绝，导致已有蒙版填充事务无法到达；现先路由活动蒙版，再保留普通像素填充的特殊图层保护。算法继续使用fillAttachedMaskSelection，不另造填充方案。

新增tilemap/free-tile×整幅/局部mask四组合，核对逐像素灰度及选区覆盖、原图层像素/网格/实例不变、单历史、同色no-op、Undo/Redo和实际重开。special-mask-fill-build.log正式Release及两测试构建exit0；完整free-tile-project-tests、tilemap-project-tests exit0（special-mask-fill-free-test.log、special-mask-fill-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件及diff通过，无人工UI验收。此为活动蒙版入口修复，不代表特殊层原图填充、所有蒙版工具及全量迁移完成。


### 2026-11-07：特殊图层活动蒙版翻转旋转

依据legacy workspace-session.ts::activePaintLayer及workspace-commands-selection-transform.ts::transformActiveSelection，选区变换使用活动蒙版栅格。原生flipContent在tilemap Paint及文档特殊类型判断后才处理蒙版，rotateContent也先拒绝特殊文档。调整顺序让活动蒙版优先，沿用transformMaskImmediate与已有浮动蒙版逻辑；原图层变换保护不变。

新增tilemap/free-tile×水平/垂直/180度六组，Paint模式下与普通图层活动蒙版逐像素对照，检查原图层像素/网格/实例保留、单历史、Undo/Redo及保存重开。首次fixture无可见图层内容不能创建蒙版，补齐真实可见像素及非对称灰度后通过，未修改蒙版创建条件。special-mask-transform-build.log正式构建exit0、fixture-build日志exit0，完整free-tile-project-tests及tilemap-project-tests exit0（special-mask-transform-free-test.log、special-mask-transform-grid-test.log），正式工作区drawing-anchor-edit-floating组合exit0；来源625文件与diff通过。无人工UI验收，90度/任意角、其他浮动和剪贴板路径未由本批证明，全量迁移仍INCOMPLETE。


### 2026-11-07：特殊图层蒙版浮动粘贴与移动

核对legacy workspace-commands-clipboard.ts::pasteSelection使用activePaintLayer，workspace-session.ts活动蒙版优先，以及selection-transform的活动栅格路径。原生beginFloatingPaste与beginSelectionContentMove此前在蒙版路由前按文档含free/tilemap拒绝；现活动蒙版优先调用已存在beginMaskFloating/beginMaskSelectionMove，继续保留其单目标、权限与选区约束。

新增tilemap/free-tile×RGB粘贴/选区移动/复制移动六组，与普通图层蒙版逐像素对照，检查取消恢复无历史、单次提交、原Cel像素/网格保留、Undo/Redo和实际保存重开。special-mask-floating-build.log正式Release和两核心测试构建exit0；完整free-tile-project-tests/tilemap-project-tests exit0（special-mask-floating-free-test.log、special-mask-floating-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件和diff通过，无人工UI验收。蒙版剪切及多目标、链接/非标准布局等未由本阶段全面验证，全量迁移仍INCOMPLETE。

### 2026-11-07：特殊图层活动蒙版剪切与删除

对照legacy workspace-commands-selection-effects.ts::deleteSelection与workspace-commands-clipboard.ts::copySelection：删除以背景色清除活动蒙版，静态复制仍读取所属图层。原生deleteSelectedPixels提前路由活动蒙版，cutPixels仅在未编辑蒙版时应用整篇特殊图层保护；复用已有蒙版事务，保留旧版静态剪贴板语义。

新增tilemap/free-tile×剪切/删除四组回归，检查背景色清除、原Cel像素与网格保留、剪贴板所属图层像素、单次历史、选择清理、Undo/Redo和实际保存重开。special-mask-cut-build.log正式Release与free-tile-project-tests、attached-masks-tests构建通过；两个完整测试通过（special-mask-cut-free-test.log、special-mask-cut-attached-test.log）；正式工作区drawing-anchor-edit-floating组合exit0，来源检查625文件通过（special-mask-cut-provenance.log）。无人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：特殊图层活动蒙版方向键微移

核对legacy workspace-commands-selection-move.ts::moveActiveSelectionWithSelectionHistory及moveActiveSelection使用activePaintLayer。原生nudgeSelectionContent此前按整篇free-tile拒绝，tilemap Paint分支亦先于活动蒙版；现只在无活动蒙版时应用这些特殊图层保护，蒙版沿用beginMaskSelectionMove与transformMaskFloating，连续微移共享浮动预览。editor_input已有activeMaskId条件，蒙版方向键保持像素步长。

新增free/tile两组合与普通蒙版逐像素对照，检查零位移及跨帧保护、重复微移、取消恢复选择与像素、单次提交、原Cel像素/网格/自由实例不变、Undo/Redo和实际保存重开。special-mask-nudge-build.log正式Release及两测试构建exit0；完整free-tile-project-tests和attached-masks-tests exit0（special-mask-nudge-free-test.log、special-mask-nudge-attached-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照检查通过（special-mask-nudge-provenance.log）。无人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：活动蒙版内容居中

对照legacy workspace-commands-selection-move.ts::centerActiveContent，待提交选区先按几何居中，静态操作使用activePaintLayer及alpha内容边界。原生此前特殊文档先拒绝，普通蒙版亦落入所属Cel路径；新增活动蒙版分支，复用beginMaskFloating/transformMaskFloating/commitMaskFloating完成捕获、平移、取消及单次历史，无选区时保留无选区状态。锁定及隐藏等可编辑性继续沿用现有maskBrushAvailable约束，本阶段未证明这些约束与legacy所有情况等价。

回归覆盖普通/tile/free蒙版×水平/垂直/双轴×静态选区/待提交选区/整幅不透明蒙版no-op；检查精确标记位置、历史数、选区有无、所属Cel像素/网格保留、Undo/Redo及实际保存重开。黑色不透明蒙版按alpha计入内容边界，不改作透明。special-mask-center-build.log正式Release及两测试构建exit0，完整free-tile-project-tests、attached-masks-tests通过（special-mask-center-free-test.log、special-mask-center-attached-test.log），正式drawing-anchor-edit-floating工作区组合exit0；来源625文件快照检查通过（special-mask-center-provenance.log）。未做人工UI验收；稀疏/越界蒙版边界等未由这些回归完整覆盖，全量迁移仍INCOMPLETE。

### 2026-11-07：活动蒙版键盘微移画布边界

进一步核对legacy workspace-commands-selection-move.ts::moveActiveSelectionWithSelectionHistory开头的requested/next/actual坐标，默认键盘微移使用max(0,min(canvasSize-selectionSize,requested))限制选框；显式居中另传allowOutsideCanvas。补齐活动蒙版nudgeSelectionContent的同一限制，初次与已有浮动预览均先计算实际位移，边缘零位移不创建或更新事务。本批不扩展无蒙版的其他移动分支。

新增普通/tile/free×初次/已有浮动六组回归，检查左上拒绝、超大位移限于右下、连续向外no-op、无表面扩张、单次历史、所属Cel保留、Undo/Redo及保存重开。mask-nudge-bounds-build.log正式Release及两组测试构建exit0；完整free-tile-project-tests与attached-masks-tests exit0（mask-nudge-bounds-free-test.log、mask-nudge-bounds-attached-test.log）；正式工作区drawing-anchor-edit-floating组合exit0，来源625文件快照通过（mask-nudge-bounds-provenance.log）。无人工UI验收。隐藏/锁定语义、越界复杂选区等仍需进一步核对，全量迁移INCOMPLETE。

### 2026-11-07：四角浮动选区方向键平移

核对legacy workspace-commands-selection-move.ts::moveActiveSelectionWithSelectionHistory的nextTransformTarget及translateSelectionQuad，原生共享nudgeSelectionContent只更新x/y而遗漏显式quad，导致内容未跟随。同步平移四角与flipOrigin，沿用已有centerActiveContent的坐标规则及原浮动事务。

新增普通/tile/free活动蒙版三组真实四角浮动回归，检查全部角点、翻转原点、实际源/目标像素、选择位置、单历史、所属Cel像素/网格保留、Undo/Redo与保存重开。初次像素断言误将透明清除写成不透明黑色，按既有normalizedMaskPixel(0)==0修正。quad-nudge-final-build.log正式Release及两测试构建exit0；完整free-tile-project-tests和attached-masks-tests通过（quad-nudge-free-test.log、quad-nudge-mask-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（quad-nudge-provenance.log）。无人工UI验收。

扩大运行cel-selection-clipboard-tests失败于既有GIF导入断言line5190/check4352。临时移除本次唯一产品变更后重建仍在同一处失败（quad-nudge-baseline-build/test.log），故不报告此完整测试通过，该问题留待后续定位。恢复源码因Copy-Item保留时间导致首次未重编，更新时间并最终重建后上述两完整测试通过。全量迁移仍INCOMPLETE；大于画布及已越界复杂选框未由本批完整验证。

### 2026-11-07：GIF导入稀疏空白槽回归预期

定位上一阶段完整cel-selection-clipboard-tests失败check4352：旧断言要求GIF追加帧中原图层的空白Cel为画布大小2×1，实际为1×1。对照legacy core/animation.ts::blankSurfaceFromLayer及ensureAnimationDocument（非活动空槽），workspace-commands-animation-frame.ts::importGifAnimationLayer先归一化完整槽再替换导入槽，确认当前产品的稀疏存储符合旧版，不改产品实现。

将该复合断言拆行，保留原像素不变、导入时长/disabled/选择、Undo/Redo等检查，并明确验证空槽1×1、零偏移、单透明像素。gif-sparse-regression-build.log测试构建exit0，完整cel-selection-clipboard-tests exit0（gif-sparse-regression-test.log），来源625文件快照检查通过（gif-sparse-regression-provenance.log），diff通过。本阶段仅修复过时回归预期，没有重新构建产品或做人工作业验收。原失败已解决；全量迁移仍INCOMPLETE。

### 2026-11-07：特殊图层活动蒙版开始变换入口

对照legacy workspace-commands-selection-transform.ts::beginLayerTransform及workspace-session.ts::selectedTransformLayersForSession（活动蒙版优先），将原生已有蒙版边界分支移到整篇free/tile保护之前。继续使用maskBrushAvailable及逐像素可见画布alpha边界，不改变变换算法与普通特殊层限制。

新增free/tile两组入口回归：明确填入局部灰度蒙版，核对可见边界、无浮动/历史/内容修订、所属Cel像素保留、隐藏/锁定拒绝及恢复后可进入。初始夹具新建蒙版全透明而错误期望全幅选框；拆分断言后补充真实像素，不修改空内容保护。mask-transform-entry-build.log正式Release及两测试构建exit0，fixture-build日志exit0，完整free-tile-project-tests和attached-masks-tests通过（mask-transform-entry-free-test.log、mask-transform-entry-mask-test.log）；正式工作区drawing-anchor-edit-floating组合exit0，来源625文件快照通过（mask-transform-entry-provenance.log），diff通过。未做人工作业或截图验收，全量迁移仍INCOMPLETE。

### 2026-11-07：自由瓦片已有浮动选区键盘微移

依据legacy workspace-commands-selection-move.ts::moveActiveSelectionWithSelectionHistory的pending.freeTile分支：已有自由瓦片浮动事务通过实际限制位移更新源编辑raster及选择。原生nudgeSelectionContent不再用整篇free/tile保护挡住已有freeTile浮动状态，沿用现有键盘坐标限制、四角平移和transformFreeTileSelectionMove。初次键盘创建自由瓦片事务仍保留原保护，待单独核对，不将该缺口标为完成。

新增整实例/局部源×移动/复制四组合，比较连续右/下微移与直接平移的画布、共享源像素及选择，检查预览无历史、取消恢复、单提交、Undo/Redo及实际保存重开。pending-free-nudge-build.log正式Release及free/tile两完整测试构建exit0，两完整测试exit0（pending-free-nudge-free-test.log、pending-free-nudge-grid-test.log），正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（pending-free-nudge-provenance.log），diff通过。无人工UI验收；全量迁移仍INCOMPLETE。

### 2026-11-07：自由瓦片已有浮动选区居中

对照legacy workspace-commands-selection-move.ts::centerActiveContent先处理pendingPaste选框几何，并通过allowOutsideCanvas=true进入已有pending.freeTile平移路径。原生仅放行已有freeTile浮动事务通过整篇特殊类型保护，复用现有pending中心差值、Math.round同向舍入、四角/翻转原点平移及transformFreeTileSelectionMove。非浮动自由瓦片居中不由本批声称迁移。

新增整实例/局部源×移动/复制×水平/垂直/双轴十二组，比较直接平移的画布、源像素及选区，检查预览无历史、重复居中no-op、单提交、Redo与实际保存重开。pending-free-center-build.log正式Release及free/tile完整测试构建exit0；两完整测试exit0（pending-free-center-free-test.log、pending-free-center-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（pending-free-center-provenance.log），diff通过。未做人工作业或截图验收，全量迁移仍INCOMPLETE。

### 2026-11-07：瓦片已有浮动选区居中入口

对照legacy workspace-commands-selection-move.ts::centerActiveContent优先处理pendingPaste的几何中心及已有tilemap编辑裁切，允许原生已有tilemap浮动事务进入共同居中分支，复用冻结模式/目标校验和transformFloatingPaste。非浮动瓦片居中及Paint格子移动未在本批扩展。

新增Create/Edit/Hybrid×移动/复制×三个轴十八组合，分别比较直接平移的预览和提交结果、取消恢复网格与资源、单次历史、Undo/Redo及实际重开。初始回归假设预览与提交总是相等，实际既有瓦片资源写回事务会产生差异；拆分后居中与直接平移在两个阶段均一致。本批仅证明入口与既有路径一致，不证明预览提交差异符合legacy，仍需继续核对该差异，不能作为完整行为等价证据。

pending-tile-center-build.log正式Release及free/tile测试构建exit0，fixture-build日志exit0；完整free-tile-project-tests和tilemap-project-tests通过（pending-tile-center-free-test.log、pending-tile-center-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0，来源625文件快照通过（pending-tile-center-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：核实瓦片居中实际显示预览与提交一致

解决上阶段登记的“预览提交差异”疑点：canvasPixels直接读取timeline存储，而瓦片浮动编辑的可见资源预览由publishTilemapPreview发布到displayTimeline/displayPixels。先前比较了未提交存储与提交结果，不能据此判断用户可见差异。对照editor_canvas的displayTimeline合成消费、legacy workspace-commands-selection-move pending预览及workspace-tilemap.test.ts mirrored floating commit的可见结果保留，补强现有十八组合回归。

现在明确捕获displayPixels及compositeNormalRegion(displayTimeline)，提交后分别与最终图层像素及合成画面逐像素相等；保留直接变换对照、取消、单历史、Undo/Redo和实际重开检查。完整free-tile-project-tests通过（tile-center-display-test.log），测试构建exit0（tile-center-display-build.log），来源625文件快照通过（tile-center-display-provenance.log），diff通过。本阶段仅增强测试与纠正记录，无产品修改、无新产品构建或人工UI验收。上述十八组合的实际显示一致性疑点已消除，不延伸到全部瓦片变换；全量迁移仍INCOMPLETE。

### 2026-11-07：混合瓦片文档普通浮动粘贴居中

依据legacy workspace-commands-selection-move.ts::centerActiveContent对所有pendingPaste几何优先处理，原生将整篇特殊类型保护移到共同floating+selection分支之后。此前虽已放行free/tile自身浮动状态，混合tilemap文档中合法的普通图层剪贴板浮动仍被拒绝。继续保留非浮动特殊文档保护及原浮动锁定/目标校验。

新增水平/垂直/双轴三组普通图层粘贴回归，检查精确中心坐标、预览无历史、单提交、无关瓦片网格/资源不变、Undo/Redo及实际保存重开。mixed-raster-center-build.log正式Release与free/tile测试构建exit0；两完整测试通过（mixed-raster-center-free-test.log、mixed-raster-center-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（mixed-raster-center-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合自由瓦片文档普通图层浮动粘贴

对照legacy workspace-commands-clipboard.ts::pasteSelection使用activePaintLayer类型/锁定校验，普通图层不因无关free-tile内容被拒绝。原生beginFloatingPaste移除整篇free拒绝，将原有混合tilemap目标约束统一用于两种特殊内容；活动蒙版仍优先，free目标继续使用专用粘贴入口，不写派生Cel像素。

新增提交/取消两组，检查移动后的精确RGBA及半透明值、预览无历史、单提交、全部自由Cel实例与像素/源资源保留、锁定及free目标拒绝、Undo/Redo和实际重开。mixed-free-raster-paste-build.log正式Release及两核心测试构建exit0；完整free-tile-project-tests、tilemap-project-tests通过（mixed-free-raster-paste-free-test.log、mixed-free-raster-paste-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（mixed-free-raster-paste-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合自由瓦片文档普通剪贴板浮动键盘移动

对照legacy workspace-commands-selection-move.ts::moveActiveSelectionWithSelectionHistory先限制键盘requested位置，再按pendingLayer锁定校验处理已有浮动，不按文档中无关特殊层拒绝。原生识别合法普通图层clipboard浮动状态，放行整篇free保护，复用共同坐标平移并补齐该状态的画布边界限制。其他初次选区捕获仍按已有路径判断。

新增普通/tile/free×取消/提交六组，检查左上及右下边缘no-op、大位移限制、半透明RGBA精确值、预览无历史/单提交、无关Cel像素/实例/网格及资源不变、Undo/Redo和实际重开。raster-clipboard-nudge-build.log正式Release及两核心测试构建exit0；完整free-tile-project-tests、tilemap-project-tests通过（raster-clipboard-nudge-free-test.log、raster-clipboard-nudge-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（raster-clipboard-nudge-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合特殊图层文档普通浮动粘贴翻转

核对legacy workspace-commands-selection-flip.ts::flipActiveSelection优先处理pendingPaste来源，原生flipContent静态特殊类型保护此前先于共同floating分支，阻断混合文档普通粘贴翻转。将该保护限定为无浮动状态，复用原有逐源翻转、取消恢复和transformFloatingPaste目标校验，专用free/Paint路径仍保留。

新增tile/free×水平/垂直×取消/提交八组合，检查浮动剪贴板精确RGBA/半透明次序、实际提交像素、单历史、无关特殊Cel像素/实例/网格及资源保留、Undo/Redo和实际保存重开。mixed-clipboard-flip-build.log正式Release及两核心测试构建exit0；完整free-tile-project-tests、tilemap-project-tests通过（mixed-clipboard-flip-free-test.log、mixed-clipboard-flip-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（mixed-clipboard-flip-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合文档浮动剪贴板剪切

对照legacy workspace-commands-clipboard.ts::cutSelection，先复制pending结果，再cancelFloatingPaste恢复目标；clipboard来源不删除原像素，最后完成选择。原生cutPixels允许已有clipboard浮动事务通过整篇free/tile剪切保护，复用既有copy/cancel路径，不扩展静态特殊层删除。

新增tile/free两组，使用覆盖既有目标像素且水平翻转的半透明剪贴板，核对复制像素及原点、目标恢复、选择/浮动清理、无新增历史、所有Cel像素/实例/网格和源资源不变。mixed-floating-cut-build.log正式Release及两核心测试构建exit0；完整free-tile-project-tests、tilemap-project-tests通过（mixed-floating-cut-free-test.log、mixed-floating-cut-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（mixed-floating-cut-provenance.log），diff通过。此操作无持久化变更，未新增往返测试；无人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：Delete取消剪贴板浮动优先级

核对legacy workspace-commands-selection-effects.ts::deleteSelection：clipboard来源pending先cancelFloatingPaste并直接返回，保留取消恢复的原选区。原生提前执行这一分支，避免混合free文档提前拒绝，以及蒙版删除路由处理恢复后的原选区。复用原取消事务，不增加删除历史。

新增普通/tile/free×普通图层/蒙版六组，检查翻转后浮动取消、原选区精确保留、无历史、全部Cel像素/实例/网格、蒙版及资源像素恢复。clipboard-delete-build.log正式Release及两核心测试构建exit0；完整free-tile-project-tests、attached-masks-tests通过（clipboard-delete-free-test.log、clipboard-delete-mask-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（clipboard-delete-provenance.log），diff通过。无持久化变更，未新增往返测试；未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：活动蒙版填充先提交浮动事务

核对legacy workspace-commands-selection-effects.ts::fillForeground，存在pendingPaste时先commitFloatingPaste再填充activePaintLayer。原生fillSelectionOrCanvas活动蒙版早返回缺少该步骤，可能把填充混入仍可取消的浮动预览。现在先提交，再沿用fillAttachedMaskSelection；无浮动时行为不变。

新增普通/tile/free蒙版×粘贴/选区提起六组，检查两次历史、实际目标灰度、填充后cancel无效、第一次Undo回已提交浮动像素、第二次Undo回原蒙版/选区、两次Redo、所属Cel像素/实例/网格保留及实际重开。mask-floating-fill-build.log正式Release及两核心测试构建exit0；完整free-tile-project-tests、attached-masks-tests通过（mask-floating-fill-free-test.log、mask-floating-fill-mask-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（mask-floating-fill-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：自由瓦片浮动选区Delete提交顺序

依据legacy workspace-commands-selection-effects.ts::deleteSelection对selection来源pending先commitFloatingPaste，再执行deleteFreeTileSourceSelectionInSession。原生已有freeTile浮动先提交，避免active()保护直接拒绝；继续复用源删除适配器，不删除实例或派生缓存。

新增整实例/局部源×移动/复制四组，对照显式提交再删除，核对两步历史、源/画布像素、第一次Undo回已移动状态、第二次Undo回原始源、两次Redo及实际重开。free-floating-delete-build.log正式Release及两核心测试构建exit0；完整free-tile-project-tests、tilemap-project-tests通过（free-floating-delete-free-test.log、free-floating-delete-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（free-floating-delete-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合文档普通图层开始变换范围

依据legacy workspace-commands-selection-transform.ts::beginLayerTransform及selectedTransformLayersForSession，边界按实际目标计算，不按文档无关特殊层拒绝。原生free入口限定活动free类型；共同静态选框路径按选中普通目标运行，仍保护所选特殊目标。此为开始变换的可见范围选择迁移，后续普通内容移动在混合free文档仍有独立保护，不宣称整个交互链完成。

新增tile/free×隐式/显式普通目标四组，检查精确alpha范围、无浮动/历史/内容修订、全部Cel像素保留、锁定/隐藏拒绝、包含特殊层的多目标拒绝。mixed-transform-entry-build.log正式Release及两核心测试构建exit0；完整free-tile-project-tests、tilemap-project-tests通过（mixed-transform-entry-free-test.log、mixed-transform-entry-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源625文件快照通过（mixed-transform-entry-provenance.log），diff通过。未做人工作业或截图验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合自由瓦片文档普通选区移动与复制

对照legacy workspace-commands-selection-move.ts的普通目标捕获范围，允许混合free文档的普通活动图层进入既有栅格浮动事务；捕获实际目标后逐一拒绝特殊图层，防止整帧范围写入派生缓存。

新增移动/复制×取消/提交四组，核对精确像素、选区恢复、单次提交历史、Undo/Redo、保存重开，以及自由Cel实例/像素和源资源保留。mixed-free-raster-move-build.log正式Release及free/tile测试构建通过；完整free-tile-project-tests、tilemap-project-tests通过；正式工作区drawing-anchor-edit-floating组合通过；来源625文件检查通过（mixed-free-raster-move-provenance.log）。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合自由瓦片文档普通选区键盘移动

对照legacy workspace-commands-selection-move.ts::moveActiveSelectionWithSelectionHistory，先将键盘请求限制在画布内，再处理pending或捕获实际目标。原生放行混合free文档中的普通活动目标及已有普通selection来源浮动，复用既有捕获/变换；实际捕获仍拒绝特殊目标，未扩展自由瓦片首次键盘移动。

新增首次移动/已有复制浮动×取消/提交四组，检查两端边界与no-op、整帧特殊目标拒绝、精确移动/复制像素、单次历史、Undo/Redo、实际重开，以及自由Cel像素/实例与源资源保留。mixed-free-raster-nudge-build.log正式Release及free/tile测试构建exit0；完整free-tile-project-tests、tilemap-project-tests均exit0（mixed-free-raster-nudge-free-test.log、mixed-free-raster-nudge-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查exit0（mixed-free-raster-nudge-provenance.log），diff检查通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合瓦片文档普通图层旋转

依据legacy workspace-edit-actions.ts::rotateWorkspaceContent及workspace-edit-actions.test.ts的90/-90/180方形选区示例，旋转按实际选中图层检查类型，不因文档存在无关特殊层拒绝。原生移除整篇特殊内容保护，并在捕获目标前拒绝所选特殊类型，复用现有共同旋转与历史路径。自由瓦片首次键盘移动仍待核对旧版源编辑语义，未在本阶段放行。

新增free/tile×三个角度六组，检查精确目标像素、单历史、Undo/Redo、实际重开、无关Cel像素/实例/网格及源资源保留、选中特殊目标拒绝。初次回归错误地在多选改变活动层后读取普通层像素，已明确切回普通层再核对。正式Release及free/tile测试构建exit0（mixed-raster-rotation-build.log），修正测试构建exit0（mixed-raster-rotation-fixture-build.log）；完整free及tile测试exit0（mixed-raster-rotation-free-test.log、mixed-raster-rotation-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（mixed-raster-rotation-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合瓦片文档普通图层填充

对照legacy workspace-commands-selection-effects.ts::fillForeground的pending提交、activePaintLayer/selectedEffectTargets范围及多目标特殊类型拒绝，移除原生整篇特殊内容保护，在所有实际目标写入前检查owner类型。普通填充复用现有稀疏/整画布及缺失Cel事务，未扩展特殊源填充。

新增free/tile×静态掩码/浮动剪贴板四组，检查精确半透明RGBA、掩码外保留、浮动先提交的两步历史及Undo/Redo、实际保存重开、无关Cel像素/实例/网格和资源保留、所选特殊目标拒绝。mixed-raster-fill-build.log正式Release及free/tile测试构建exit0；完整free-tile-project-tests、tilemap-project-tests均exit0（mixed-raster-fill-free-test.log、mixed-raster-fill-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查exit0（mixed-raster-fill-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合瓦片文档普通选区删除与剪切

对照legacy workspace-commands-selection-effects.ts::deleteSelection及workspace-commands-clipboard.ts::cutSelection，Delete先提交selection浮动再删除，Cut先复制并取消预览、仅删除非copy原像素，最后清空选择。原生自由源删除按活动类型分流，普通Cut不再受无关特殊层拒绝。回归同时暴露混合tile文档普通内容提起入口仍被拒绝，已按活动类型放行并校验普通捕获的实际目标；瓦片自身保留专用校验。

新增free/tile×Delete/Cut×静态/移动浮动/复制浮动十二组，检查精确原位及目标像素、剪贴板原点、0/1/2步历史、Undo/Redo、实际保存重开及全部特殊Cel像素/实例/网格/源资源保留。中途完整测试发现通用目标校验误拒瓦片专用浮动，已收窄至普通捕获后重跑。最终正式Release及free/tile测试构建exit0（mixed-raster-delete-cut-build.log）；完整free与tile测试exit0（mixed-raster-delete-cut-free-test.log、mixed-raster-delete-cut-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（mixed-raster-delete-cut-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合瓦片文档普通静态选区翻转

依据legacy workspace-commands-selection-flip.ts::flipActiveSelection对selectedTransformLayersForSession的静态选区范围，普通目标不因无关特殊内容被拒绝；特殊多目标仍拒绝。原生放行普通活动层静态选区，并在捕获后检查所有所选owner类型。保留已有whole-Cel时间轴、free源及Paint适配器，本阶段不扩展无时间轴选择的整层翻转。

新增free/tile×水平/垂直×矩形/掩码八组，检查精确半透明RGBA、掩码镜像、单历史、Undo/Redo、实际重开、所选特殊目标拒绝以及无关Cel像素/实例/网格和源资源保留。正式Release及free/tile测试构建exit0（mixed-raster-static-flip-build.log）；完整free/tile测试exit0（mixed-raster-static-flip-free-test.log、mixed-raster-static-flip-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（mixed-raster-static-flip-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合瓦片文档普通静态内容居中

对照legacy workspace-commands-selection-move.ts::centerActiveContent的activePaintLayer静态选区/alpha边界、隐藏层可操作及Math.round偏移，普通活动层不再因无关特殊内容被拒绝。复用现有即时内容移动和选区历史，特殊活动类型保护保持，本阶段不扩展自由源静态居中。

新增free/tile×有/无选区×三个轴十二组，检查半透明精确像素、正向半值取整、隐藏普通层、选区跟随/无选区保持、单历史、重复居中no-op、Undo/Redo、实际保存重开及全部特殊Cel像素/实例/网格和源资源保留。正式Release及free/tile测试构建exit0（mixed-raster-static-center-build.log）；完整free/tile测试exit0（mixed-raster-static-center-free-test.log、mixed-raster-static-center-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（mixed-raster-static-center-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合网格瓦片文档普通选区键盘移动

依据legacy workspace-commands-selection-move.ts::moveActiveSelectionWithSelectionHistory的普通目标捕获和键盘边界限制，将已有mixed-free普通首次/pending移动路径扩展到混合tilemap文档；继续复用目标捕获校验与共同浮动事务，特殊活动类型仍走已有适配器。

原四组扩展为free/tile×首次/复制pending×取消/提交八组，检查两端边界no-op、整帧特殊捕获拒绝、精确移动/复制像素、单历史、Undo/Redo、实际保存重开与特殊Cel像素/实例/网格及资源保留。正式Release及free/tile测试构建exit0（mixed-tile-raster-nudge-build.log）；完整free/tile测试exit0（mixed-tile-raster-nudge-free-test.log、mixed-tile-raster-nudge-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（mixed-tile-raster-nudge-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合瓦片文档普通图层颜色调整

依据legacy workspace-commands-layer-adjustment.ts::applyActiveLayerAdjustment的普通目标范围：有选区使用活动层，无选区按选择层，跳过kind特殊层和锁定层。原生移除整篇特殊内容保护，并在预览捕获时跳过所有特殊类型，避免写入派生缓存；继续复用共同调整预览/提交事务。本阶段不扩展特殊源、蒙版或全量调整类型行为验收。

新增free/tile×取消/提交×有/无选区八组，使用已有color_adjustment_test的legacy亮度20/对比度10精确RGBA预期，检查选区外保留、无预览历史/单提交、Undo/Redo、实际保存重开、仅特殊目标拒绝及全部特殊Cel像素/实例/网格/源资源保留。正式Release及free/tile测试构建exit0（mixed-raster-adjustment-build.log）；完整free/tile测试exit0（mixed-raster-adjustment-free-test.log、mixed-raster-adjustment-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（mixed-raster-adjustment-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合瓦片文档普通Cel颜色替换

对照legacy workspace-commands-color.ts::applyColorReplacementTarget明确目标收集及tools-fill.ts::replaceLayerColor完整packed RGBA匹配/可选选区，普通Cel替换不再受文档无关特殊内容拒绝。继续复用既有预览、精确匹配和历史事务。显式请求特殊Cel的源替换仍未迁移，本阶段保留拒绝，不将其称为旧版等价完成。

新增free/tile×取消/提交×选区/完整目标八组，沿用color_replacement_test的精确颜色，检查选区外保留、单提交历史、Undo/Redo、实际重开及所有特殊Cel像素/实例/网格/资源保留。初次特殊拒绝断言误选fixture首个普通Cel，已改为明确特殊活动Cel并重跑。正式Release及free/tile测试构建exit0（mixed-raster-replacement-build.log），最终fixture构建exit0（mixed-raster-replacement-fixture-build.log）；完整free/tile测试exit0（mixed-raster-replacement-free-test.log、mixed-raster-replacement-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（mixed-raster-replacement-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：特殊文档及蒙版上下文调色板颜色替换

依据legacy workspace-commands-color.ts::applyColorReplacementTarget的palette分支，仅替换非零条目的完整RGBA和前景/背景角色，不依赖活动图层或蒙版类型。原生移除整篇瓦片及活动蒙版限制，复用palette-only预览和历史；不修改源像素。

新增free/tile×所属层/蒙版×取消/提交八组，检查完整alpha匹配、角色颜色、槽位/nextId保留、无预览历史/单提交、Undo/Redo及特殊Cel像素/实例/网格/资源/蒙版保留。网格蒙版夹具初始缺少有效像素，已先建立内容再创建蒙版。正式Release及free/tile测试构建exit0（special-palette-replacement-build.log），fixture构建exit0（special-palette-replacement-fixture-build.log）；完整free/tile测试exit0（special-palette-replacement-free-test.log、special-palette-replacement-grid-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（special-palette-replacement-provenance.log），diff通过。本阶段未新增调色板序列化往返覆盖，未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：特殊文档预设滤镜覆盖层

对照legacy workspace-commands-layer-adjustment.ts::applyFilterPreset生成独立覆盖层及全部帧Cel的逻辑，移除beginFilterPreview/applyFilterPreset整篇特殊类型拒绝，复用现有覆盖层生成、异步generation校验、预览和结构历史。活动蒙版限制仍保留；共享预览入口也供LCD使用，本阶段未宣称特殊源LCD行为验收完成。

新增free/tile×全部六预设十二组，检查显示预览增加覆盖层而存储/历史不变、取消恢复、单提交、Undo/Redo、实际保存重开的像素/混合模式/不透明度及原特殊Cel像素/实例/网格/资源保留。正式Release及free/tile/filter测试构建exit0（special-filter-overlay-build.log）；完整free、tile、filter-presets测试exit0（special-filter-overlay-free-test.log、special-filter-overlay-grid-test.log、special-filter-overlay-presets-test.log），后者覆盖六滤镜像素、快照、恢复及LCD既有事务；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（special-filter-overlay-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：核实特殊源LCD滤镜事务

对照legacy workspace-commands-layer-adjustment.ts::applyLcdScreenFilter读取所选源原始像素与偏移、生成全部帧四通道、隐藏源层及结构Undo，验证上阶段共享入口开放后的特殊源行为。本阶段只新增回归证据，无产品代码改动；像素算法已有filter_presets_test的legacy精确值覆盖。

新增free/tile×源层可见/隐藏四组，检查预览结构/源显隐不落地、取消恢复、四通道像素及原点、所有帧槽位、单group历史、源隐藏、Undo恢复原始显隐/结构、Redo及保存重开。实时特殊Cel/资源数据逐项不变；自由瓦片往返表示与内存fixture有差异，重开保留断言使用同一未应用滤镜工程的往返基线，避免混同序列化与滤镜变更。最终测试构建exit0（special-lcd-filter-build.log），完整free-tile-project-tests通过（special-lcd-filter-test.log），来源检查通过（special-lcd-filter-provenance.log），diff通过。无新产品构建、无人工UI验收，不宣称所有特殊源/链接/非标准布局已覆盖；全量迁移仍INCOMPLETE。

### 2026-11-07：特殊文档调色板替换实际解码往返

补齐specialPaletteReplacement阶段明确未覆盖的持久化证据。现有reopen辅助函数使用d.palette构建Document，不能证明归档调色板正确；本阶段八组特殊文档调色板替换用例新增encodeEditableProject/encodeRecoveryProject→readProjectManifest→prepareEditableImport→createEditableDocument真实解码链。

逐项核对实际解码entry的ID/name/RGBA、slots/columns/nextId及蒙版像素，包含取消/提交与free/tile/活动蒙版组合。前景/背景角色属于会话值，本阶段不声明其归档持久化。测试构建exit0（special-palette-persistence-build.log），完整free-tile-project-tests通过（special-palette-persistence-test.log），来源检查通过（special-palette-persistence-provenance.log），diff通过。无产品代码修改、新产品构建或人工UI验收；活动蒙版下新增预设滤镜仍待核对旧版编辑上下文转换，未在本批放行。全量迁移仍INCOMPLETE。

### 2026-11-07：活动蒙版上下文预设滤镜

核对legacy workspace-commands-layer-adjustment.ts::applyFilterPreset改变活动层但不清除activeLayerMaskId，workspace-mutation.ts仅清除已消失蒙版，workspace-history.ts LayerUiSnapshot也不修改蒙版上下文。原生开放活动蒙版下共享滤镜预览，为预设覆盖层历史保存不变的maskContext，确保Undo/Redo不因原生selectLayer副作用丢失编辑目标。

新增普通/tile/free所属蒙版×六预设十八组，检查预览取消保留上下文、单提交、Undo/Redo活动层及蒙版目标、所属Cel像素/实例/网格和蒙版像素不变。正式Release及free/filter测试构建exit0（mask-filter-overlay-build.log）；完整free/filter-presets测试exit0（mask-filter-overlay-free-test.log、mask-filter-overlay-presets-test.log）；正式工作区drawing-anchor-edit-floating组合exit0；来源检查通过（mask-filter-overlay-provenance.log），diff通过。共享入口的LCD蒙版上下文仍待专门核对，本阶段不声明其完成；未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：核实LCD活动蒙版编辑上下文

对照legacy workspace-commands-layer-adjustment.ts::applyLcdScreenFilter从selectedLayerIds取源、不清除activeLayerMaskId，restore闭包只恢复层组选择及源显隐；workspace-mutation.ts保留仍存在蒙版。原生既有结构历史已保留该上下文，无需产品修改。

新增普通/tile/free×蒙版普通/隔离显示六组，检查选中所属层后LCD预览/取消、单group提交、活动蒙版及隔离状态在Undo/Redo保留、所属Cel像素/实例/网格及蒙版像素不变。测试构建exit0（mask-lcd-context-build.log），完整free-tile-project-tests通过（mask-lcd-context-test.log），来源检查通过（mask-lcd-context-provenance.log），diff通过。此为明确源选择上下文的自动回归，未做新产品构建或人工UI验收，不扩展到所有蒙版行选择组合；全量迁移仍INCOMPLETE。

### 2026-11-07：核实混合文档普通图层卷积预览

对照legacy workspace-convolution-preview.ts::createConvolutionPreview从captureAdjustmentSnapshot跳过kind/锁定目标、全部结果完成后统一发布，原生卷积已复用先前放行的beginColorAdjustment普通目标路径。本阶段补充行为证据，无产品修改。

新增free/tile×取消/提交×选区/完整目标八组，以negative单红通道检查精确packed RGBA、选区外保留、预览不改变存储/历史、单提交、Undo/Redo、实际保存重开及原特殊Cel像素/实例/网格/资源保留。测试构建exit0（mixed-raster-convolution-build.log），完整free-tile-project-tests通过（mixed-raster-convolution-test.log），来源检查通过（mixed-raster-convolution-provenance.log），diff通过。仅证明所测普通目标和通道，未扩展全部卷积核或特殊源/蒙版路径；未做新产品构建或人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：混合文档普通图层抗锯齿入口

对照legacy workspace-selection-effects-support.ts::selectedEffectTargets跳过kind目标、共享像素去重，以及workspace-commands-selection-anti-alias.ts和tools-outline.ts的预览/对角算法。移除原生整文档特殊类型禁用，捕获前跳过实际特殊目标；特殊目标单独选择仍不可用，保留未迁移边界。

新增free/tile×取消/提交×选区/完整八组，混选普通与特殊层验证只捕获一个普通目标、opacity37精确对角像素、预览不改存储/历史、单提交、Undo/Redo、保存重开和特殊Cel/资源保留。初始单透明像素选区没有对角源，修正为包含对角源的2×2选区。正式构建exit0（mixed-raster-aa-build.log），最终测试构建exit0（mixed-raster-aa-test-build.log）、完整free-tile-project-tests通过（mixed-raster-aa-test.log），workspace指定检查exit0，来源检查通过（mixed-raster-aa-provenance.log）。未做人工UI验收，未声明蒙版目标/特殊源抗锯齿或全量迁移完成；全量迁移仍INCOMPLETE。

### 2026-11-07：抗锯齿历史语义

核对legacy workspace-commands-selection-anti-alias.ts及locales/zh-CN.ts，抗锯齿应提交“自动抗锯齿”，原生却复用“卷积矩阵”提交标签，与history_catalog.h的既有分类不符。抽出私有共享surface提交函数，在pushEdit时传入各自标签，确保历史面板及历史变更通知使用实际操作名；不改像素计算或事务内容。混合文档测试同时断言AA及卷积提交标签。蒙版AA捕获/回写仍未迁移，本阶段不声明完成该路径。

验证：正式构建exit0（aa-history-label-build.log），确认新测试程序重链后完整free-tile-project-tests通过（aa-history-label-test.log）；workspace指定检查exit0；来源检查通过（aa-history-label-provenance.log），diff通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：蒙版抗锯齿目标迁移

对照legacy workspace-selection-effects-support.ts::selectedEffectTargets的选中蒙版格优先、活动蒙版次之及共享像素去重，workspace-commands-selection-anti-alias.ts锁定批次拒绝，tools-outline.ts逐目标帧合成采样，以及document-model.ts::normalizeLayerPackedValue蒙版灰度覆盖。原生既有异步AA任务接入蒙版源/回写，模拟写入逐像素归一化，保持链接根与所属层像素；Editor传入实际蒙版格选择，复用现有预览、取消及单次蒙版历史。快照预算计入蒙版字节，发布验证蒙版元数据/像素及活动上下文。maskPreview统一实现读取调整预览，供隔离画布/缩略图使用。

新增ordinary/tile/free×普通/隔离×取消/提交12组，检查精确黑色覆盖、预览不改存储、单历史、上下文Undo/Redo、保存重开及所属Cel/资源不变；额外检查显式双格链接根去重、半透明黑转0xff7f7f7f、不解除链接、切换蒙版后旧任务拒绝及锁定拒绝。首轮构建中变更内联头文件导致隔离预览测试失败，停止该构建，将读取实现统一移至cpp，固定源码后重新构建；新测试程序完整通过（mask-aa-test.log）。

最终验证：固定源码后的正式构建exit0（mask-aa-final-build.log），新测试程序完整free-tile-project-tests通过（mask-aa-test.log），workspace指定检查exit0，来源检查通过（mask-aa-provenance.log），diff通过。未做人工UI验收；多目标独立帧/组选区组合尚未全部验证，全量迁移仍INCOMPLETE。

### 2026-11-07：跨帧独立蒙版抗锯齿验收证据

沿用legacy workspace-selection-effects-support.ts::selectedEffectTargets显式蒙版格顺序/帧绑定及workspace-commands-selection-anti-alias.ts整批锁定拒绝。新增取消/提交×选区/完整四组，以不同帧黑色/灰色所属层验证automatic opacity37经蒙版覆盖归一化分别精确为0xffa1a1a1/0xffd0d0d0；检查双目标顺序、预览不改存储、双蒙版取消/Undo/Redo/保存重开、单历史、活动第二帧隔离上下文及所属Cel像素保留。特意把锁定蒙版放在请求列表后面，验证整批拒绝而不启动预览。既有产品实现通过，无产品代码修改。

测试构建exit0（multi-mask-aa-build.log），完整free-tile-project-tests通过（multi-mask-aa-test.log），来源检查通过（multi-mask-aa-provenance.log），diff通过。未重新构建正式程序，未做人工UI验收；组选区组合与全量迁移仍未完成，整体INCOMPLETE。

### 2026-11-07：组与图层蒙版混合抗锯齿回归

对照legacy document-model.ts::isLayerEffectivelyLocked的组蒙版所属组锁定与子图层继承锁定，workspace-selection-effects-support.ts不因蒙版所属类型改变目标选择。新增取消/提交×普通/隔离四组，同批选择组蒙版和组内图层蒙版，验证半透明黑精确归一化0xff7f7f7f、单历史、取消/Undo/Redo、保存重开、活动蒙版隔离上下文及子Cel像素保留。所属组锁定后两类蒙版入口均拒绝。既有产品实现通过，无产品修改；更深嵌套祖先组合尚未验证。

测试构建exit0（group-mask-aa-build.log），完整free-tile-project-tests通过（group-mask-aa-test.log），来源检查通过（group-mask-aa-provenance.log），diff通过。未重新构建正式程序，未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：颜色替换真实多选帧格目标

核对legacy workspace-commands-color.ts::applyColorReplacementTarget枚举selectedAnimationCellKeys。原生cells范围此前只取右键上下文单个层/帧，忽略实际时间轴多选。改为收集timelineSelection.cels，范围启用也使用实际非空选择，清空选择后不回退陈旧上下文；核心替换、锁定过滤、共享源去重和历史不变。

实际Editor对话框新增普通/链接两组，跨层跨帧选取不连续帧格，检查目标集合、独立预览、取消、单批提交、未选格不变、链接传播及Undo/Redo，空选择不使用旧上下文。正式构建exit0（replace-selected-cells-build.log），--workspace-check --named-workspace-only --replace-cell-selection-only退出0，来源检查通过（replace-selected-cells-provenance.log），diff通过。首次遗漏named-workspace-only参数导致目标测试后继续执行通用预览拖动检查并失败“Preview title/resize press did not acquire capture”；该通用问题未在本阶段修复，不用单项通过声称完整workspace通过。未做人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：工作区预览测试状态隔离

继续定位先前完整workspace失败。实际editor_refresh.cpp在历史面板打开时自动initializeDocking并启用custom；旧独立PreviewPanel测试仍直接给控件发鼠标消息，用户已有历史面板/布局配置使其进入另一事件路径。测试在命名预设检查后明确关闭历史面板、恢复standalone模型及固定预览几何，在精确位移和后续测试前恢复对应布局。增加捕获/精确位移失败的步骤、模式、坐标诊断，不修改产品交互、不删除用户配置或缓存。

最终正式构建exit0（preview-capture-build.log）。--workspace-check已越过先前预览标题捕获、拖动、角缩放、关闭重开、9/10物理像素连续位移断言，后续在“Dialog controls did not reflow”失败，完整workspace仍未通过，后续分阶段增量重绘检查尚未执行。本阶段保留这一具体未解决问题，未做人工UI验收。来源检查通过（preview-capture-provenance.log），diff通过；全量迁移仍INCOMPLETE。

### 2026-11-07：对话框缩放与紧凑尺寸读回

工作区检查的控件排版断言仍使用旧4px左右留白，实际图层属性为6px；改为验证宽度随40物理像素增量及左右6×uiScale留白，同时保留footer位移检查。随后实际发现配置读回缺陷：有效layer-opacity宽132被readWorkspaceSizes统一width>=240拒绝。读取改为接受正数且既有8192上限内的几何，打开时仍由modalBounds/modalMinimumSize按对话框限制；负尺寸仍拒绝。

增加--workspace-modal-layout-only定向入口，运行现有完整对话框/工作区布局断言并跳过命名预设测试；需同时--workspace-check --named-workspace-only退出。正式构建exit0（modal-reflow-final-build.log），该定向运行exit0，验证边缩放、排版、尺寸原样读回、非法尺寸拒绝及小窗口适应。完整--workspace-check本轮先在“Named reset retains initial hidden mode”失败，未宣称完整通过，后续增量重绘未执行。来源检查通过（modal-reflow-check-provenance.log），diff通过；无人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：顶部更多菜单缩放回调合并

用户明确窄窗口放不下的菜单收进“更多”。现有实现已包含这一行为，本轮保留入口、顺序、尺寸测量和菜单对象。核对Aseprite MIT ui/menu.cpp的MenuBox::cancelMenuLoop、Menu::closeAll和MenuItem::closeSubmenu，关闭通过消息队列完成；原生因此需要延迟重排，但此前连续resize每次都追加回调并携带过时宽度。现在同一关闭期间只保留一个CallbackMessage，更新最新目标矩形，关闭完成后一次重排。未改动依赖代码。

扩展真实smokeWindowInput：更多菜单打开后连续提交中间、窄、宽三个尺寸再dispatch，验证最终宽度、原菜单顺序和捕获释放。正式构建exit0（menu-resize-coalesce-build.log），--window-input-check退出0，完整--workspace-check退出0，来源检查通过（menu-resize-coalesce-provenance.log），diff检查通过。此前Named reset retains initial hidden mode本轮修改前后均未复现，未据此宣称已修复该间歇问题，也未修改其产品逻辑。无人工图像验收或性能计时，不能量化总体卡顿改善；全量迁移仍INCOMPLETE。

### 2026-11-07：颜色替换活动帧图层命令范围

核对legacy workspace-commands-color.ts::applyColorReplacementTarget，layer命令值只作用activePaintLayer所在活动帧，且不使用像素选区裁剪。原生replaceTargets此前不识别layer，现补齐普通图层活动帧目标。旧ColorReplacementDialog.tsx未提供layer选项，因此不新增入口；保留既有命令/配置值的语义。选中图层范围菜单启用改用实际timelineSelection.layers，避免陈旧右键上下文。activePaintLayer还可能返回活动蒙版，原生该路径仍被核心拒绝，本阶段未完成蒙版迁移。

扩展真实颜色替换对话框检查：两帧及另一图层，有单像素选区，确认活动帧整个图层独立预览，其他帧/层不变，取消无历史、提交一次历史及Undo/Redo。正式构建exit0（replacement-layer-scope-build.log），--workspace-check --named-workspace-only --replace-cell-selection-only退出0，来源检查通过（replacement-layer-scope-provenance.log），diff检查通过。未运行本阶段全量workspace、未人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：活动蒙版颜色替换

核对legacy workspace-commands-color.ts::applyColorReplacementTarget的layer/selection分支，workspace-session.ts::activePaintLayer优先返回activeLayerMask；tools-fill.ts逐像素精确比较来源色，document-model.ts::normalizeLayerPackedValue写入maskPacked。原生此前一律拒绝活动蒙版，现由这两个范围返回活动mask ID，复用AdjustmentPreview独立蒙版副本、normalizedMaskPixel与现有蒙版历史。选区使用世界坐标；提交检查版本、上下文、锁及原始像素，保存活动蒙版/隔离上下文供Undo/Redo。文档、图层、帧、帧格范围仍不改为蒙版批量目标；特殊图层本体替换仍有迁移缺口。

新增普通/瓦片/自由瓦片所属图层×普通/隔离显示×选区/整体×取消/提交矩阵，验证半透明黑精确归一化ff7f7f7f、独立预览、未选像素、单历史、上下文Undo/Redo、保存重开、所属Cel及资源保持，以及无变化、上下文切换和锁定拒绝。首次测试数据使用空图层无法创建蒙版、默认零值蒙版未匹配白色来源，已按真实前置条件修正并重跑。完整free-tile-project-tests通过（mask-replacement-tests.log，最终测试构建mask-replacement-final-build.log）。正式最终构建exit0（mask-replacement-editor-final-build.log），实际对话框--workspace-check --named-workspace-only --replace-cell-selection-only退出0，包含活动蒙版选区预览/取消/提交/Undo/Redo。来源检查通过（mask-replacement-provenance.log），diff通过。未人工UI验收，未宣称完整迁移完成；全量仍INCOMPLETE。

### 2026-11-07：链接与组蒙版颜色替换回归

继续上一阶段活动蒙版替换，核对legacy workspace-session.ts::activePaintLayer、workspace-commands-animation-mask.ts关联mask写linkedMaskId指向源，以及document-model.ts::isLayerEffectivelyLocked对蒙版所属组/图层锁定的判断。新增链接图层蒙版/链接组蒙版×普通/隔离×取消/提交检查，活动第二帧链接槽进行单像素选区替换，验证两帧解析同一源、半透明黑归一化ff7f7f7f、相邻像素保持、独立预览、单次标记为替换颜色的历史、保存重开、Undo/Redo活动蒙版/帧/隔离上下文及所属Cel像素/链接保留。所属图层或组锁定拒绝入口。已有产品代码通过，无产品行为变更。

测试构建exit0（linked-group-replacement-build.log），完整free-tile-project-tests通过（linked-group-replacement-tests.log），来源检查通过（linked-group-replacement-provenance.log），diff通过。未重建正式程序（产品代码未变），未人工UI验收；仍有特殊图层本体替换等缺口，全量迁移仍INCOMPLETE。

### 2026-11-07：活动蒙版替换保留当前元数据

继续特殊图层替换语义核对时，发现上一阶段蒙版提交从预览快照整份安装mask slots，可能回退不推进contentRevision的元数据变化。legacy tools-fill.ts替换记录像素edit，workspace-commands-color.ts提交pixel edit，不回滚整份蒙版列表。原生改为从当前mask列表构造after，只安装目标mask surface，保留当前属性、链接及其他蒙版。沿用上下文/锁/版本/原始表面检查；Undo/Redo两侧都捕获当前元数据。

document-raster-history-tests新增直接fixture在预览期间变更moveWithOwner和autoLinkAnimationCels，验证提交、Undo、Redo保留元数据且只变化目标像素。正式及测试构建exit0（mask-replacement-metadata-build.log），完整document-raster-history-tests和free-tile-project-tests通过（mask-replacement-metadata-history-tests.log、mask-replacement-metadata-free-tests.log），实际颜色替换对话框定向检查退出0。来源检查通过（mask-replacement-metadata-provenance.log），diff通过。无人工UI验收，特殊图层本体替换语义仍待进一步核对，全量迁移仍INCOMPLETE。

### 2026-11-07：颜色替换选区裁剪画布边界

继续特殊图层替换保存链路调查，核对legacy tools-fill.ts::replaceLayerColor及tools-pixel-edit.ts::clampSelection发现明确边界差异：带选区替换先裁剪画布，原生此前只检查selectionContains，可能替换选区覆盖的画布外存储像素。原生增加画布边界条件，坐标先用int64相加避免有符号溢出；不带选区仍遍历全部所属表面存储，与旧版一致。特殊图层本体替换尚未开放或宣称完成。

新增宽2画布、存储x=-1..2的四像素表面与覆盖全部存储选区，对照选区/整体两种模式的独立预览、单次提交及Undo/Redo。正式/测试构建exit0（replacement-selection-bounds-build.log），完整document-raster-history-tests通过（replacement-selection-bounds-tests.log），实际颜色替换对话框定向检查退出0，来源检查通过（replacement-selection-bounds-provenance.log），diff通过。未人工UI验收，全量迁移仍INCOMPLETE。

### 2026-11-07：蒙版编辑期间的图层颜色替换

legacy workspace-commands-color.ts仅layer/selection分支使用activePaintLayer；document/layers/frames/cells仍收集animationLayerAtFrame，即使当前编辑蒙版也处理图层像素。原生此前因存在活动蒙版拒绝所有Cel目标。现在仅显式活动mask ID进入蒙版替换，其余合法Cel目标沿用原有图层处理；预览记录蒙版上下文，按实际目标ID判断蒙版或Cel，图层提交保留蒙版/隔离上下文历史。特殊图层本体仍受原有保护。

新增普通/隔离×取消/提交矩阵，验证蒙版编辑期间图层独立预览、原始像素保留、蒙版不变、单次历史及Undo/Redo上下文。正式/测试构建exit0（replacement-raster-mask-context-build.log），完整free-tile-project-tests通过（replacement-raster-mask-context-tests.log），既有实际颜色替换对话框定向检查退出0，来源检查通过（replacement-raster-mask-context-provenance.log），diff通过。未人工UI验收，未完成特殊图层本体替换，全量迁移仍INCOMPLETE。

### 2026-11-07：隐藏特殊图层不阻挡可见普通图层合并

调查自由瓦片Cel连接确认timeline_model仍强制独立实例，未通过解除按钮限制冒充迁移。另发现mergeVisibleLayers按整个文档特殊内容直接return，菜单也按整个文档禁用；legacy core/layer-merge.ts只按继承可见性选目标、按继承锁拒绝，隐藏特殊图层应保留。原生核心仅在实际可见目标含tile/free时继续保护；菜单移除整个文档包装，统一使用有效显隐/锁并保留可见特殊目标禁用。现有合成和结构历史复用。

新增tile/free×直接隐藏/组隐藏，合并可见普通图层后检查单历史、外观、特殊Cel身份/实例/网格/像素、资源、保存重开及Undo/Redo。测试首次函数拆分遗漏导致编译失败已修复；自由样本另有第二可见特殊层、重开preservedJson文本规范化造成断言不符，已按真实前置条件隐藏其他特殊层并按实例语义比较，保留像素等断言。最终正式构建exit0（hidden-special-merge-build.log），最终测试构建exit0（hidden-special-merge-final-test-build.log），完整free-tile-project-tests通过（hidden-special-merge-tests.log）；既有颜色替换对话框定向检查退出0，只证明编辑器基础回归，不称为合并菜单验收。来源检查通过（hidden-special-merge-provenance.log），diff通过。无人工UI验收；可见特殊图层合并和自由Cel连接仍未完成，全量迁移仍INCOMPLETE。

### 2026-11-07：可见瓦片与自由瓦片合并为普通图层

legacy core/layer-merge.ts::mergeVisibleLayers复用compositeDocument渲染全部帧；workspace-commands-layer-structure.ts::commitLayerMergeWithOwnedTilesets只对removedFreeTileLayerIds清理不再引用的专属资源，普通瓦片目录保留。原生解除核心与菜单的可见tile/free限制，直接复用现有全帧compositeNormalRegion及结构历史；沿用删除图层的资源归属检查，候选仅自由源，保留隐藏共享所属层/网格引用。合并生成普通图层，每帧独立栅格；隐藏层不变。

新增tile/free×隐藏备用/共享源保留场景，检查全帧合成外观、普通结果、一次历史、资源语义、保存重开、Undo恢复特殊层和资源、Redo。首次构建变量替换误改resource为res已修复；首次测试复制备用层前未选中源导致实际可见目标错误，增加明确选择/复制身份断言后通过。最终正式构建exit0（visible-special-merge-final-build.log），最终测试构建通过（visible-special-merge-test-build.log），完整free-tile-project-tests通过（visible-special-merge-tests.log），既有编辑器颜色替换定向检查退出0，仅基础回归不充当合并菜单验收。来源检查通过（visible-special-merge-provenance.log），diff通过。尚无人工UI验收，蒙版/样式/组组合未在本阶段穷举；自由Cel链接及其他缺口仍在，全量迁移INCOMPLETE。

### 2026-11-07：样式与蒙版特殊图层合并验证

对照legacy core/layer-merge.ts::mergeVisibleLayers使用compositeDocument逐帧烘焙及removeEmptyGroups、installMergedFrames移除原所属蒙版。新增瓦片/自由瓦片×图层蒙版/组蒙版，配合颜色叠加样式，遍历样本已有帧，检查精确合成外观、一次历史、合并后废弃蒙版/空组移除、保存重开、Undo恢复原所属图层/组/蒙版、Redo外观。既有实现通过，无产品修改。

测试构建exit0（masked-special-merge-build.log），完整free-tile-project-tests通过（masked-special-merge-tests.log），来源检查通过（masked-special-merge-provenance.log），diff通过。未重建正式程序（产品代码未变），未人工UI验收；仅覆盖颜色叠加与半覆盖蒙版组合，不代表所有样式/混合模式已穷举。自由Cel链接等仍未迁移，全量INCOMPLETE。


### 2026-11-07：瓦片／自由瓦片图层合并入口与蒙版状态闭环

完整对照 legacy core/layer-merge.ts 的 mergeRasterLayers、mergeLayerDown、mergeLayerGroup、mergeVisibleLayers，以及 workspace-commands-layer-structure.ts::commitLayerMergeWithOwnedTilesets。此前仅可见合并开放特殊目标，所选／向下合并仍按整个文档静默返回、组合并拒绝自由瓦片，菜单另有整文档包装限制。现移除三种合并的旧限制；所选／向下／组临时合成 Timeline 带入实际瓦片资源，逐帧烘焙为普通栅格并保留既有组／顺序／属性语义。四种合并共用资源归属检查，只清理已移除自由层的无引用源，保留普通瓦片目录、隐藏共享所属层及存活网格引用；资源纳入原有结构历史。

另对照 workspace-mutation.ts 和 workspace-commands-history.ts：只在 activeLayerMaskId 已不存在时清空。workspace-history.ts 的 LayerUiSnapshot 不保存蒙版编辑上下文，因此合并移除蒙版后，Undo恢复蒙版本体但不重新进入编辑。原生结构安装补上失效引用清理并退出隔离；存活的隐藏蒙版保持编辑／隔离状态。未改变旧版为“自动恢复蒙版编辑”的新行为。

新增32组核心矩阵：tile/free × 独占/隐藏共享源 × 普通/隔离蒙版编辑 × 所选/向下/组/可见合并，包含样式、多帧、组/图层蒙版、继承锁定拒绝且无历史、精确合成、单次历史、资源归属、隐藏载荷、可编辑工程与恢复工程重开、Undo/Redo。另4组检查存活隐藏蒙版上下文。实际菜单增加tile/free × 四种合并共8组 Click，验证入口可用、像素、历史、蒙版退出和Undo/Redo。

正式程序及两个测试目标构建通过（complete-special-merge-build.log）；最终完整free-tile-project-tests通过（complete-special-merge-tests.log），document-layer-groups-tests通过（complete-special-merge-groups-tests.log），正式程序 --cel-clipboard-check 退出0，包含新增8组真实菜单合并回归及既有剪贴板/时间轴检查。来源覆盖检查通过（complete-special-merge-provenance.log），diff检查通过。未做人工视觉验收，不宣称穷举所有样式／混合模式。自由瓦片Cel链接、其他登记迁移缺口及全量人工验收仍未完成，整体INCOMPLETE。


### 2026-11-07：自由瓦片Cel链接与编辑生命周期迁移

旧版证据：animation.ts::connectAnimationCels按时间顺序找首个有内容的解析源，并让目标共享surface/freeTiles；linkAnimationFrameCels、inheritAnimationFrameCelLinks延续显式／自动链接；disconnectAnimationCels在选中源时断开该源的关联组，解链保留当前实例载荷。workspace-animation-cel-links扩展选区间空槽；project-format-encode仅为非链接Cel写实例数据。原生复用已有Timeline::resolveSurface和Cel／结构历史，无另建共享存储系统。

新增freeTileCel内容访问边界，保留cel()当前槽身份；实例属性／标志／移动／放置／删除／翻转、源画笔与填充／渐变／形状、实例／像素剪贴板、选区变换和实例面板／源面板／画布反馈读取改为解析源。编辑历史保存被修改的源Cel，保持当前播放帧；删除源帧沿用既有存活引用物化。模型允许同层显式／运行时链接，按解析源验证实例；工程导入按源渲染，保存只在非显式链接Cel写解析实例数据。解除连接、新建链接帧、自动新建／复制、同工程帧／Cel／图层剪贴板扩帧的旧保护；既有资源和失败预检继续沿用，跨工程自由帧／Cel源转移限制未在本阶段扩展。

新增生命周期测试覆盖连接首个时间源、解链源／别名、独立修改、移动预览取消、源／别名帧删除、显式新建链接帧、自动新建／复制、同工程帧粘贴、保存与恢复工程重开及Undo/Redo；十二类链接帧编辑覆盖属性、实例放置、删除、实例剪贴板、源画笔、翻转、整实例选区移动、源像素粘贴、显隐标志、源填充／渐变／形状，比较共享像素和实际实例参数。既有拒绝自由链接的测试更新为可观察行为与循环拒绝；混合文档帧范围链接现在检查自由图层实际链接。真实编辑器增加源／别名右键连接／解链及链接帧快捷指令回归。


验证结果：首次全依赖构建通过（linked-free-build.log）；生命周期夹具保留旧Cel选择导致显式链接帧按已选源而非播放帧执行，已清空夹具选择；Paint放置夹具误用普通beginStroke导致无历史，已改用真实beginFreeTilePlacement/commitFreeTilePlacement。最终测试构建通过（linked-free-final-test-build.log），完整free-tile-project-tests通过（linked-free-final-tests.log），十二类操作的实例语义／像素／原生与恢复重开／Undo/Redo均通过。正式全依赖构建通过（linked-free-official-build.log），最终增量确认通过（linked-free-final-official-build.log）；最终正式程序 --cel-clipboard-check 退出0，包含真实右键连接／解链、链接帧指令及上一阶段八组合并菜单和既有剪贴板检查。document-layer-groups-tests通过（linked-free-groups-tests.log）；来源覆盖检查通过（linked-free-provenance.log）、diff通过。未人工视觉验收，未宣称所有组合穷举或其他迁移缺口完成，整体仍INCOMPLETE。


### 2026-11-07：自由瓦片链接源覆盖与删除的存活帧接管

对照 legacy workspace-animation-cel-links.ts::detachAnimationPasteTargets，存活Cel必须接管source.freeTiles；animation.ts在链接时共享实例数据，删除帧后存活槽仍保有该数据。原生保存省略显式别名的实例载荷，重开后别名没有本地副本，因此不能只转移渲染surface。补齐共享detach路径（整Cel粘贴覆盖、删除、剪切）及批量帧删除路径的解析实例接管；沿用现有链接提升、事务和资源历史，不引入另一套资源系统。

新增8组：未保存／保存重开后的链接 × 删除Cel／剪切Cel／其他帧粘贴覆盖源／批量删除源帧。每组两个存活别名，核对同一新源、完整实例元数据、精确缓存像素、原生／恢复工程再开、一次历史、Undo恢复旧源链接、Redo及再次保存。正式程序和完整自由瓦片测试构建通过（free-survivor-build.log）；完整free-tile-project-tests通过（free-survivor-tests.log）；正式程序 --cel-clipboard-check 退出0；来源覆盖检查通过（free-survivor-provenance.log），diff通过。无人工视觉验收。

跨工程剪贴板核对发现：legacy animationCelForTarget仅按目标种类保留实例载荷，跨工程帧／Cel粘贴未转移自由源目录。不能把“自动转移资源”认作现有旧版功能而直接实现；本阶段保留原生明确限制，跨工程自由源策略仍未闭环，全量迁移INCOMPLETE。


### 2026-11-07：兼容目标源的跨工程自由瓦片帧／Cel粘贴

继续核对 legacy workspace-commands-animation-frame-clipboard.ts::pasteCrossDocumentAnimationFrames、workspace-commands-animation-cel-clipboard.ts::pasteCrossDocumentAnimationCels 及 workspace-animation-cel-target.ts::animationCelForTarget：跨工程粘贴按目标种类保留freeTiles，映射复制范围内链接，不导入自由源目录。此前原生一律拒绝跨工程自由载荷过宽；现允许目标已有匹配源标识的完整帧／Cel粘贴，以目标当前源属性重新渲染，复用原有事务、蒙版映射及扩帧逻辑。整帧资源导入限制为普通网格实际引用的资源，避免把未引用自由源纹理复制为孤立目录。缺少自由目标层或无法解析实例源时在事务发布前拒绝；不自行设计源迁移或缺失源降级行为。

新增8组跨工程帧／Cel × 链接／独立 × 目标源显隐差异，覆盖实例保留、链接映射、目标属性重渲染、资源目录不增加、单次结构历史、Undo/Redo、原生／恢复工程重开。原有跨工程拒绝用例改为独立源集合不兼容目标，继续验证原子拒绝。正式程序及完整测试构建通过（compatible-free-clipboard-build.log）；完整free-tile-project-tests通过（compatible-free-clipboard-tests.log）；正式程序 --cel-clipboard-check退出0；来源覆盖检查通过（compatible-free-clipboard-provenance.log），diff通过。未人工视觉验收。任意跨工程缺失源和新增自由所属层仍未闭环；自由Cel拖动旧版未转移实例，需要明确行为后处理。全量迁移仍INCOMPLETE。


### 2026-11-07：颜色替换混合范围的锁定目标准入

legacy workspace-commands-color.ts::applyColorReplacementTarget的collect先跳过isLayerEffectivelyLocked，再replaceLayerColor。原生beginColorReplacement此前先拒绝特殊kind，使文档／所选范围内锁定特殊层也取消可编辑普通层的替换。现按旧版调整准入顺序，先跳过缺失／调整／有效锁定层，再检查未迁移特殊正文；不扩大特殊正文的源编辑行为。继续追踪tools-fill.ts::replaceLayerColor、history.ts::recordPixelKnownCurrent／commitPixelEdit：旧版直接写派生像素，未同步自由源／网格资源，此差异仍需闭环，不能把解禁当作迁移完成。

16组瓦片／自由瓦片×直接／组继承锁×取消／提交×目标顺序回归，包含普通链接源／别名去重、 detached预览、一次历史、原生／恢复重开、Undo/Redo、特殊实例／网格及像素不变和仅锁定范围无操作。正式程序与完整测试构建通过（locked-replacement-build.log）；完整free-tile-project-tests通过（locked-replacement-tests.log）；正式 --cel-clipboard-check退出0。首次误用不存在的--replace-color-check启动空白实例，已结束该测试进程；颜色定向检查经--workspace-check --replace-cell-selection-only运行后，后续通用预览窗口检查因隐藏窗口无捕获失败（native-workspace-error.txt）；使用已有--named-workspace-only提前退出通用工作区阶段，实际smokeColorReplacement退出0。来源覆盖检查通过（locked-replacement-provenance.log），diff通过。未人工视觉验收，全量迁移INCOMPLETE。


### 2026-11-07：用户确认后的自由瓦片Cel完整拖动

用户明确采用“拖动完整移动／复制实例并保留存活链接；跨工程自动复制缺失源、重映射并撤销”的新行为。本阶段完成Cel拖动，复用timeline_interaction.cpp既有重叠暂存、链接幸存者接管和Cel历史；沿用legacy workspace-commands-animation-cel-clipboard.ts::moveSelectedAnimationCels的选区／锚点及目标映射。源内容通过canonical解析实例；移动清空源实例；目标用当前所属自由源验证并渲染；转移块按目标层和原解析源重建内部链接，副本与原组独立，块外链接保有原实例和缓存。跨源集合资源转移后续完成，目前共享源行可拖动，未匹配源仍在发布前拒绝。

16组copy/move × 链接/独立 × 内存/保存重开 × 同行重叠/共享源跨行覆盖实例元数据、内部链接、外部存活链接、源清空、目标选择/锚点、资源不变、一次历史、原生/恢复重开与Undo/Redo。首次发现重开别名没有本地freeTiles，清空必须根据解析源写空CelData，已修复。最终正式与测试构建通过（free-cel-drag-final-build.log），完整free-tile-project-tests通过（free-cel-drag-tests.log），正式--cel-clipboard-check退出0，来源覆盖检查通过（free-cel-drag-provenance.log），diff通过。未人工拖动视觉验收；已授权的缺失源复制尚未完成，全量迁移INCOMPLETE。


### 2026-11-07：已授权的跨工程自由瓦片缺失源转移

落实用户批准的新行为，复用整层剪贴板的源／纹理复制和LayerTilesetHistory，帧／Cel粘贴在发布前补齐实例实际引用的缺失源。纹理、源标识重新生成，按目标集合／来源集合／原源标识重映射，同一目标共享集合的所有层同步目录。已有同标识目标源仍按目标当前属性渲染；重复粘贴已转入源时，属性与纹理完全相同则复用，避免持续增加纹理目录。帧粘贴缺少所属自由层时创建新集合，原有帧空实例；新层、目录、纹理、实例及链接均在同一结构事务中。缺纹理或非法载荷在发布前拒绝。新增资源纳入既有像素预算。

6组帧／Cel、链接／独立、既有／新增所属层场景，验证真实实例源重映射、源属性／自定义元数据、精确纹理、缓存重建、链接映射、一次历史、原生／恢复重开、Undo恢复目录／移除纹理与新层／扩帧、Redo身份稳定，及重复粘贴不重复资源。旧跨工程拒绝测试改为缺纹理拒绝，普通同工程独立集合限制不变。最终正式与测试构建通过（free-resource-final-build.log），完整free-tile-project-tests通过（free-resource-final-tests.log），正式--cel-clipboard-check退出0；来源覆盖检查通过（free-resource-transfer-provenance.log），diff通过。无人工视觉验收。跨集合Cel拖动资源复制尚待统一接入；特殊正文颜色替换和其他领域登记缺口仍在，全量迁移INCOMPLETE。


### 2026-11-07：跨集合自由瓦片Cel拖动资源事务

继续落实用户批准的新行为。将上一阶段portable clipboard的transferFreeCelSources原样提取为公共头，帧／Cel粘贴与拖动共用标识重映射、纹理复制、等价源去重和共享所属层目录同步。拖动预检在独立目录／资源候选上进行，渲染使用转入后的目标源；只有新增资源时才使用完整Timeline＋LayerTilesetHistory原子安装／撤销目录、纹理和实例，普通拖动仍保留既有Cel历史。跨集合移动清空源实例，复制保留原内容，转入块内部链接独立重建，目标既有实例保持原源。

新增4组copy/move × 内存/保存重开的链接块跨独立集合场景，覆盖一次源纹理转入、块内链接、原有目标实例、精确缓存重建、原生／恢复重开、单次历史、Undo资源／目录恢复和Redo身份稳定。首次公共头提取残留DocumentLayer别名导致构建失败，改为timeline::Layer；首次夹具共用不同集合的纹理所有权违反工程约束，修为独立纹理后通过。最终正式与核心测试构建通过（free-drag-transfer-final-build.log），最终夹具测试构建通过（free-drag-transfer-test-build.log），完整free-tile-project-tests通过（free-drag-transfer-tests.log）；正式--cel-clipboard-check退出0，来源覆盖通过（free-drag-transfer-provenance.log），diff通过。无人工拖动视觉验收，全部迁移仍INCOMPLETE。


### 2026-11-07：同工程跨集合Cel粘贴及等价源事务闭环

用户已批准的完整实例／资源迁移统一应用于同工程跨集合Cel剪贴板，不再保留同工程缺失sourceId直接拒绝。复用共享transferFreeCelSources，已有同标识源保持目标属性，等价源复用而不新增纹理，缺失源进入既有Timeline／LayerTilesetHistory事务。检查确认当前源复制分支始终新增纹理、等价分支不改目录，因此拖动按资源数量选择历史模式不会漏掉仅目录变更。

将跨集合矩阵从4组扩至12组：移动／复制／Cel粘贴 × 内存／保存重开 × 等价源复用／新增源。检查实例重映射、内部链接、原有目标实例、纹理数量、缓存、原生／恢复工程重开、单次历史、Undo目录资源恢复、Redo稳定标识；原先同工程独立集合拒绝用例改为成功与持久化验证。正式与测试构建通过（local-free-transfer-build.log），完整free-tile-project-tests通过（local-free-transfer-tests.log），正式--cel-clipboard-check退出0；来源覆盖通过（local-free-transfer-provenance.log），diff通过。无人工视觉验收，整体迁移INCOMPLETE。


### 2026-11-07：历史自由图集剪贴板向现代源的转换

对照free_tile_data历史legacyTilesetId/tileId路径及legacy project-format-decode的旧图集支持，修复帧／Cel剪贴板未捕获legacyTilesetId纹理的问题。共享转移函数将实际引用的旧图集瓦片拆为单瓦片源纹理，再复用已授权的源重映射／目录历史；保留实例坐标、旋转、翻转和覆盖属性。同旧图集目标仍保留原引用；其它旧图集目标明确拒绝，不能只追加现代源而改变原实例解释。

两个内存历史输入的帧／Cel转移案例检查捕获纹理、单源转换、变换、重建像素、现代原生／恢复工程重开和Undo/Redo。初始测试试图保存原始历史模型，发现编码器仍按现代schema声明、读取器要求现代源而拒绝“Missing modern free tile collection metadata”，因此该输入未宣称重开通过，原历史持久化缺口保留后续处理。最终正式／测试构建通过（historical-free-final-build.log），完整free-tile-project-tests通过（historical-free-transfer-tests.log），正式--cel-clipboard-check退出0，来源覆盖通过（historical-free-transfer-provenance.log），diff通过。无人工视觉验收；历史目标整体转换／原历史保存仍待完成，整体INCOMPLETE。


### 2026-11-07：历史自由图集导入升级及保存恢复

追踪legacy free-tile-document.ts::migrateLegacyFreeTileLayer／ensureFreeTileTilesetOwnership，旧版decode/encode均先把历史图集拆为单源纹理并重映射实例。原生补在Document::fromImported候选边界：转换全部图集瓦片（包括当前未引用者），共享集合只转换一次，按旧版图层名＋序号命名，保留所有帧实例变换、自定义载荷及缓存；仅移除无引用旧图集，不产生编辑历史。由此正式文档具备schema21所需现代源元数据，旧式目标进入后续编辑前也会统一升级。

历史帧／Cel剪贴板测试现在先实际保存重开已导入文档，另增双瓦片／共享双层多帧案例检查完整源数量、原像素、旋转／翻转、canonical引用、editable/recovery重开及无历史。多瓦片测试捕获同一表达式移出data后读取setId的缓存键不稳定，改为先固定collectionKey再移动，修复共享集合重复资源。最终正式与测试构建通过（historical-upgrade-verified-build.log），完整free-tile-project-tests通过（historical-upgrade-final-tests.log），正式--cel-clipboard-check退出0；来源覆盖通过（historical-upgrade-provenance.log），diff通过。当前证据为中性历史模型导入后现代保存／恢复，不代表真实各历史schema归档样本全覆盖；原始旧归档版本字段升级仍需针对实际档案检查。无人工视觉验收，全量INCOMPLETE。


### 2026-11-07：自由瓦片历史归档 schema14–20 入口迁移

对照 legacy project-format-manifest.ts、manifest-types.ts、timelapse-migration.ts，原生读取入口从仅21扩至14–21，按来源版本处理旧图集／现代源、18前独立集合、17前图层链接、16前循环区段、21前参考图、20前录像快照local字段；保存所用manifest同步升级root与document为21。prepareEditableImport按旧版decode拒绝缺失、与网格共享、多个旧自由层重复占用的历史图集。1–13仍明确不支持，不宣称全部历史格式兼容。

新增真实ZIP版本14–20矩阵，覆盖打开、源规范化、完整实例、源像素一致、editable/recovery重开、当前版本声明、后续属性编辑Undo/Redo，以及14缺失／重复图集拒绝。测试样本裁剪修正活动层与已移除owner的孤立栅格，保持归档准入严格校验。正式构建通过（historical-archive-build.log），完整free-tile-project-tests通过（historical-archive-tests.log），正式--cel-clipboard-check退出0；来源覆盖通过（historical-archive-provenance.log），diff通过。测试WinRT apartment退出需clear_factory_cache，补齐后全套通过。人工旧工程UI验收尚未进行，整体迁移INCOMPLETE。


### 2026-11-07：schema1–13早期工程迁移及默认动画修复

按legacy migrateProjectManifest补齐1–13读取版本门：4及以前强制raw栅格，11以前移除图层／组样式，12以前移除背景，13以前移除tilesets与Cel.tilemap，14以前移除自由瓦片类型与载荷。schema1构造默认100ms帧及图层对应Cel。真实旧版decode实测schema1在最后refreshActiveAnimationFrame因无Cel清空图层；用户明确批准原生修复为保留像素并创建默认帧／Cel，此处是授权差异，不能称行为等价。schema1原始栅格经保留后仍支持普通编辑与Undo/Redo。

make-project-manifest-fixtures.cjs通过实际legacy encode/decode生成版本1–20归档与oracle，schema1明确核对旧版清空现象，原生测试核对授权保留行为；其余逐版本核对实际旧版像素。另增2–13双帧链接动画样本，核对240ms第二帧、链接根与普通／恢复保存重开。更新旧schema20蒙版测试从拒绝为迁移成功，修正早期样本未引用资源。正式构建通过historical-all-build.log；project-manifest-tests、project-save-tests、完整free-tile-project-tests通过对应historical-all日志，正式--cel-clipboard-check退出0，来源覆盖与diff检查通过。证据覆盖RGBA基础栅格、版本门、历史链接动画及既有自由瓦片路径；不表示各版本全部色彩模式、文字、所有畸形输入及人工打开验收完成，全量迁移INCOMPLETE。


### 2026-11-07：活动Cel覆盖旧图层缓存的工程准入闭环

对照legacy decodeProject最后refreshActiveAnimationFrame／applyFrameSurfaces，以及directActiveCelDataFiles单帧优化，旧图层缓存和活动Cel不同时应投影活动Cel。原生移除该差异即拒绝打开的门禁，保留两个资源本身的尺寸／字节／预算校验与链接Cel fallback一致性门禁。该行为沿用旧版，未引入新的优先级选择。

真实legacy decode生成四组single/multi frame × stale pixels/stale geometry ZIP样本，核对2×2活动Cel像素和偏移、第二帧、输入manifest不变、导入无编辑历史、editable/recovery保存重开、输出层缓存更新、后续笔画Undo/Redo。正式与测试构建active-cache-build.log通过；project-manifest-tests、project-save-tests、完整free-tile-project-tests通过active-cache日志；正式--cel-clipboard-check退出0，来源覆盖与diff通过。开始检查的空动画／缺失Cel槽归一化仍未迁移，不以本阶段缓存修复代替完成声明。人工UI打开验收未做，整体迁移INCOMPLETE。


### 2026-11-07：有效链接Cel的过期fallback缓存兼容

对照legacy createAnimationCelLookup.resolve与refreshActiveAnimationFrame，合法链接节点自身的fallback不覆盖根Cel权威内容。原生移除过期alias像素／几何不等即拒绝的门禁，各显式栅格资源仍先检查字节与预算，关系缺失／环／跨层错误门禁仍保留。根内容安装与活动帧投影沿用既有Timeline路径，无额外编辑历史。

六组真实legacy decode ZIP样本覆盖旧像素、旧尺寸／偏移、无alias栅格 × 直接链接／两级链，并把活动帧定位alias／tail。原生检查所有成员解析同一根、正确画面、普通／恢复输出的alias缓存更新、重开、导入无历史、从alias笔画编辑和所有成员Undo/Redo。正式构建linked-cache-build.log通过，project-manifest-tests及project-save-tests通过对应linked-cache日志，正式--cel-clipboard-check退出0；完整free-tile-project-tests通过linked-cache-free-tests.log，来源覆盖通过linked-cache-provenance.log，diff通过。空动画／缺失Cel槽仍待迁移，人工UI验收未做，整体迁移INCOMPLETE。


### 2026-11-07：空动画默认时间线与普通缺失Cel槽准入

对照legacy normalizeAnimationTimeline、clearLayerSurface、ensureAnimationDocument，缺失／null动画、空／无有效帧回落frame-1、100ms、loop true；普通图层活动槽缺失显示透明但保持图层几何，非活动槽在编辑／保存补为1×1空白。原生读取器保存规范化清单，避免编码时复活旧动画元数据；prepareEditableImport在完整关系准入前补普通空槽，使用唯一标识、图层透明度、受限像素预算，不产生用户历史。原生提前物化空槽是完整Timeline的必要适配，未宣称保留旧版缺失槽身份。特殊图层缺失槽仍明确限制。

六组实际legacy decode ZIP样本覆盖absent/null/empty/invalid animation及active/inactive hole，验证帧结构、透明显示、普通／恢复保存重开和笔画Undo/Redo。最终正式构建sparse-animation-final-build.log、工程测试sparse-animation-manifest-tests.log通过；最终project-save-tests、完整free-tile-project-tests通过sparse-animation-save-tests.log／sparse-animation-free-tests.log，正式--cel-clipboard-check退出0，来源覆盖sparse-animation-provenance.log与diff检查通过。无人工UI验收，特殊空槽及缺失槽身份仍不完整，全量INCOMPLETE。


### 2026-11-07：文字／调整／瓦片特殊缺失Cel槽补齐

按legacy ensureAnimationDocument、blankAnimationTilemap／blankAnimationFreeTiles补齐缺失槽：文字空槽不带旧文字，调整设置留在owner，自由瓦片为空实例，网格瓦片沿用该层第一个现有Cel的网格尺寸并将cells全部置空。使用既有原生空槽适配与单候选准入，保留目录、纹理、原有帧内容；不产生导入历史。没有任何网格模板时仍明确限制，不凭空设计尺寸；原生提前物化与legacy缺失槽身份不等价仍待后续。

八组实际legacy decode+ensureAnimationDocument ZIP oracle覆盖四种kind × 活动／非活动缺失槽；原生验证空权威载荷、资源精确像素、已有Cel按权威格子／实例重渲染像素、无损普通／恢复重开、复制空帧及Undo/Redo。额外检查发现fixture网格缓存不是权威数据，修正预期使用tiles::render而非旧fallback。正式构建special-slots-build.log、工程测试special-slots-manifest-tests.log、保存special-slots-save-tests.log、完整free-tile-project-tests special-slots-free-tests.log通过，正式--cel-clipboard-check退出0，来源覆盖special-slots-provenance.log与diff通过。无人工UI验收，全量迁移INCOMPLETE。


### 2026-11-07：无网格模板层的授权修复及动画数组归一化

实测旧版：网格瓦片层完全没有Cel时decode成功，ensureAnimationDocument生成没有tilemap元数据的Cel，encode后decode拒绝。用户明确批准原生修复为使用owner瓦片集tileWidth/tileHeight与画布创建覆盖画布的空网格，保留资源、帧与透明度，不产生导入历史。此为授权新行为，不称旧版等价。已有网格模板仍按旧版复制网格尺寸并清空，不覆盖原模板。六组ZIP样本覆盖方形／非方形／非整除尺寸 × 单帧／多帧缺失，检查空网格、资源像素、普通／恢复重开、保留瓦片的Paint绘制、Undo/Redo及绘后重开。

同时按normalizeAnimationTimeline／normalizeCels修复迁移前frames/cels不存在或非数组就抛错的问题，写回规范化清单避免编码恢复异常原字段。24组实际legacy decode对照覆盖schema2/13/21 × frames/cels × absent/null/object/number，核对默认帧时长、空显示、导入无历史及普通／恢复保存重开。正式构建grid-fallback-build.log、工程测试grid-fallback-manifest-tests.log、保存grid-fallback-save-tests.log通过，正式--cel-clipboard-check退出0；完整自由瓦片回归grid-fallback-free-tests.log与来源覆盖grid-fallback-provenance.log通过，diff通过。缺失槽身份保留、全色彩模式和人工UI验收仍不完整，全量迁移INCOMPLETE。

### 2026-11-07：工程初始活动帧透明度及预览生命周期闭环

实际legacy decodeProject在refreshActiveAnimationFrame时直接投影保存的活动帧，根Cel透明度缺失／null／非数字时保留原图层透明度。原生fromImported此前先投影第一帧，再selectFrame保存帧，使第一帧透明度污染回落值。六组真实ZIP对照（absent/null/string × 独立／链接活动帧）建立原生失败基线import-opacity-baseline-tests.log；修复为构造时先校验并选择保存的活动帧，随后只投影该帧，未指定活动帧的图像导入API保持原默认行为。恢复入口与最近工程无内嵌预览时复用createEditableDocument，避免重复构造步骤遗漏几何、对称中心等已迁移元数据。

样本包含不透明白色像素、图层0.6、第一帧0.2；原生核对初始活动帧、无导入历史、合法链接、合成Alpha153、普通／恢复保存重开、保存后切换首帧再切回及透明度编辑Undo/Redo。直接调用真实recent::readPreview（无磁盘缓存与内嵌预览）逐像素核对2×2白色与Alpha153。该独立预览调用暴露WinRT factory在自有COM apartment释放后仍被缓存，退出访问异常0xC0000005（import-opacity-preview-baseline.log）；按既有project_manifest.cpp适配方式仅由S_OK apartment所有者在RoUninitialize前清理factory cache，六次预览及后续全部工程读取通过。首次新增预览测试传空取消回调的测试调用错误已修正，不把该次失败归为软件缺陷。

正式完整构建import-opacity-build.log、最终正式／测试目标构建import-opacity-final-build.log及预览修复重建import-opacity-preview-rebuild.log通过；project-manifest-tests、project-save-tests、完整free-tile-project-tests、cel-properties-tests、editor-recovery-tests均通过对应import-opacity日志，正式--cel-clipboard-check退出0，来源覆盖import-opacity-provenance.log与diff检查通过。此处恢复证据为恢复归档往返与恢复模块自动测试，未做恢复对话框／最近工程面板人工UI验收。缺失槽身份、全色彩模式等既有缺口仍在，全量迁移INCOMPLETE。


### 2026-11-07：退化Cel栅格与活动图层回落的工程恢复迁移

对照实际legacy migrateProjectManifest／normalizeManifestAnimation、decodeProject及ensureAnimationDocument：无有效字符串dataFile的独立Cel被丢弃，有路径但缺失／非正／非安全整数尺寸的Cel也被丢弃；之后按既有缺槽适配生成空白。先核对特殊owner载荷，不能用无路径绕过瓦片／自由瓦片必需数据或普通层禁用载荷。失效活动图层（缺失、null、空、非字符串、未知ID）按旧版底到顶顺序回落首个图层，不能选反转后原生栈首项。schema5起在Cel过滤之前拒绝所有未知dataEncoding，含null／非字符串与最终会被丢弃的Cel；schema4及以前保留强制raw版本门。明确格式错误、资源缺失与字节不足仍拒绝，不把损坏像素当成空白。

新增161组真实legacy decode ZIP oracle：130组五种owner×活动／非活动×13种路径／几何退化、7种活动图层选择、6种Cel编码、9组版本／owner编码门禁、4组栅格损坏、5组特殊载荷错误。原生核对空白像素、空结构载荷、既有帧、瓦片资源精确像素、来自被丢弃Cel的蒙版及标志、普通／恢复保存重开、空帧复制Undo/Redo、回落图层笔画Undo/Redo。原生失败基线dropped-cel-baseline-tests.log为missing cel raster。往返测试进一步发现丢弃Cel的旧路径未被保存资源清理器处理，导致新归档unmapped resource；编码器现在仅清理新资源计划未保留的原Cel路径，共享资源按retained集合保留。

完整直接导入契约测试同时暴露重复图层／帧ID在补空槽前导致递归栈溢出（退出0xC00000FD）；补槽前校验非空唯一图层／帧／Cel标识、有效owner和唯一槽，重复输入返回Corrupt。更新三项此前已迁移却仍期望Unsupported的旧测试，实际断言缺槽补齐与活动Cel覆盖过期层缓存，未降低像素／坐标／输入不变校验。dropped-cel-final-build.log正式及工程目标构建、dropped-cel-import-build.log定向重建通过；project-manifest-tests、完整project-import-tests、project-save-tests、完整free-tile-project-tests通过对应dropped-cel日志，正式--cel-clipboard-check退出0，来源覆盖与diff通过。未做人工旧工程UI验收；缺失槽身份、畸形链接回落、全色彩模式及其余迁移领域仍未完成，整体INCOMPLETE。


### 2026-11-08：畸形Cel链接立即修复（特殊自由瓦片策略已获用户确认）

用户批准在打开时提前修复缺失／自指／跨层／循环Cel链接，保留当前画面；这比legacy normalizeAnimationCelLinks在ensureAnimationDocument时才修复更早，属于明确授权差异。原生按实际createAnimationCelLookup回落、normalizeAnimationCelLinks先断直接无效边再按序断环的结果，用反向边队列每个节点传播一次，索引查找为log复杂度，避免重复追踪长链。只在存在畸形组件时改写候选，输入DTO及用户历史不变；当前帧的像素、透明度、Z和结构载荷在归一化后恢复到最终根。缺槽网格模板／瓦片集索引预先构造，避免每个空槽反复扫描和复制再清空已有格子。

540组真实legacy解码ZIP覆盖五种owner、六种缺陷、三个活动帧、alias fallback有／无和normal／reverse／tail-first存储顺序。canonical oracle运行实际legacy ensure/encode/decode，另外恢复当前结构载荷与Z，应用已授权空网格修复和实际source-aware自由瓦片归一化；不是未经修改的legacy输出，不据此声称严格等价。检查所有帧的根身份、精确像素／几何、透明度／Z／文字／格子／实例、普通与恢复保存重开、无导入历史、笔画或复制帧Undo/Redo。笔画撤销按既有稳定存储机制保留透明扩容，检查整个两表面并集的世界像素；导入和重开仍精确检查尺寸／偏移／字节。四组192节点正逆序坏链／环检查迭代归一化与输入不变。

实际对照补正两个相关细节：无栅格alias走legacy normalizeCels运行时网格分支，稀疏清单cells长度不等于columns*rows时不保留该网格；非活动缺失自由瓦片槽按ensureAnimationDocument用画布尺寸空渲染，而非1×1。完整回归发现两项陈旧测试：自由瓦片自指期望拒绝改为断链且保留实例；空白帧测试越界读取1×1稀疏存储的第二像素改为检查整个canvasPixels，不修改应用帧行为。

malformed-links-final-build.log正式程序及工程目标构建、malformed-links-import-build.log和malformed-links-regression-build.log通过；project-manifest-tests、project-import-tests、project-save-tests、完整free-tile-project-tests通过对应malformed-links日志；正式--cel-clipboard-check退出0，来源覆盖626文件与git diff检查通过。尚无人工UI验收，全量迁移INCOMPLETE。

已获用户确认的精确例外：其中36组自由瓦片活动alias没有栅格fallback，但仍有实例。legacy初始像素缓存为空，保留实例并重渲染会显示瓦片；用户明确选择“保留全部实例并恢复显示（推荐，避免丢失实例）”。最终实现保留实例身份、坐标与来源，并在导入最终渲染阶段恢复显示；测试逐组检查实例非空、恢复后像素非空，不能宣称保持这些样本旧版的初始空白缓存。新增完整数组网格样本的三组缓存差异沿用既有“格子为权威数据、导入重渲染”规则，单独记录，不归为自由瓦片用户授权。


#### 同阶段补查：坏链接不能掩盖资源损坏（2026-11-08）

上一目标轮有实质进展（完成修复与回归），本轮从现有差异继续，不另开Agent或工程。新增18组完整cells数组／反序index／重复Cel原始ID对照，558组legacy兼容样本仍一致。另新增24组实际legacy拒绝ZIP（网格／自由瓦片×missing/self/cycle2×fallback有无×无效资源／无效项目），以及八组直接DTO破坏fallback检查；基线link-resource-baseline-tests.log表明原生会在修复覆盖tail载荷后接受损坏输入。读取边界现在按decodeManifestTilemap／decodeManifestFreeTiles在解析链接与丢弃无栅格运行时元数据前校验显式资源引用、重复实例和实例范围，直接DTO修复也在改写前校验。资源／tile索引及source别名表按每次操作构造一次，避免逐格重建索引。自由瓦片初始空白缓存与保留实例的取舍仍等用户，未将该决定推定为批准。


### 2026-11-08：显式Cel资源校验独立阶段

对照实际legacy decodeManifestTilemap／decodeManifestFreeTiles，在解析链接、丢弃无栅格运行时元数据之前校验每个显式载荷。原生读取器此前将网格资源ID、自由瓦片来源及重复实例检查推迟到可编辑导入；坏链接归一化可能覆盖这些载荷并掩盖损坏。现在读取边界直接检查网格tile／tileset引用及尺寸，对临时自由Cel副本按source／tileset／tile别名归一化后校验实例唯一性、引用与范围，原解析DTO不变；资源索引和别名表每次读取建立一次，不逐格重建。

24组真实legacy拒绝ZIP从既有special-hole样本独立生成，覆盖网格／自由瓦片×missing／self／cycle2链接×fallback有无×两种错误；测试直接调用readProjectManifest，独立于待定的坏链接提前修复及自由瓦片显示策略。失败基线link-resource-baseline-tests.log复现Invalid manifest accepted；最终读取器边界检查及全部现有工程样本、直接导入／保存／完整自由瓦片回归通过link-resource对应日志；正式构建link-resource-final-build.log与补充测试构建link-resource-test-build.log通过，正式--cel-clipboard-check退出0。没有人工UI验收；坏链接立即修复的特殊自由瓦片显示决定仍待用户，全量迁移INCOMPLETE。该资源校验作为独立完成阶段提交推送，不夹带未确认的显示策略。

额外独立验证：临时安装待提交读取器／测试／生成器，导入器使用未修改的HEAD版本；在唯一native/build构建并运行独立生成的全部样本，link-resource-independent-build.log及link-resource-independent-tests.log通过。随后逐字节校验并恢复所有待定修改，不依赖未提交修复获得绿灯。


#### 本阶段最终裁定与交付证据（2026-11-08）

资源校验独立阶段已提交46840489并推送origin/dev，HEAD与远端跟踪一致。用户随后明确批准无像素fallback自由瓦片保留全部实例并恢复显示，解除本阶段显示策略待定；原生算法无需删减实例，补充注释与显式回归断言。最终矩阵558组（原540加18完整网格／重复原始ID对照），覆盖全帧根、精确几何／像素／类型载荷、瓦片集身份／tileID／精确纹理、普通／恢复保存重开、编辑Undo/Redo；另24组坏资源拒绝与八组直接DTO坏fallback检查保留。严格区分36组授权自由瓦片缓存变化、三组既有权威网格重渲染缓存变化，以及导入／保存／历史检查，不用oracle适配后的通过声称未经修改legacy完全等价。


最终正式构建malformed-links-approved-build.log、558组工程矩阵与拒绝检查malformed-links-approved-manifest-tests.log、完整project-import-tests／project-save-tests通过malformed-links-approved-import-tests.log／malformed-links-approved-save-tests.log；正式--cel-clipboard-check退出0。来源覆盖通过malformed-links-approved-provenance.log，diff检查通过。完整自由瓦片检查malformed-links-approved-free-tests.log退出0。严格来源门禁--strict退出1，符合全量仍INCOMPLETE的预期，不将覆盖通过等同于完成。没有人工旧工程UI验收，不据此关闭全量迁移目标。


### 2026-11-08：图层公共元数据与几何默认值迁移

直接核对legacy project-format-decode.ts的layer common与几何构造，以及project-format-manifest.ts normalizeBlendMode／normalizeDisplayColor：visible仅字面false关闭；locked／autoLinkAnimationCels／clippingMask仅字面true开启；opacity仅有限数字限幅0..1，其余回落1。未知／非字符串blendMode回落normal；仅四种已知kind存活，其余成为普通栅格层，tilemapTilesetId仅为网格kind读取字符串。description／groupId／displayColor延用旧版已实现的类型与颜色归一化路径，本批用完整对照固定其边界。全局未知字段／归档资源门禁保留，不将已知kind字段的旧版回落推广成任意未来字段丢弃。

明确linkedContentId存在时必须为字符串且ECMAScript trim非空；任何truthy原始kind（包括未知字符串、非零数字、对象与数组）或已归一化background均不能与之共存。不能先忽略未知kind再错误接受特殊共享层；原字符串内外空白在非全空白时保留。图层width／height各自按正safe integer准入，否则独立回落画布尺寸；有限数字offset截断，其余回落0。该图层规则不改变Cel无效尺寸过滤／蒙版Number规则；原生坐标范围和解码字节预算仍保留。

新增270组实际legacy decode→encode canonical ZIP对照（其中六组非法linked身份），另七组kind／background共享层组合拒绝：15字段×15种值、全部24种混合模式与未知值、普通／文字／调整kind、颜色限幅／舍入、中文／Emoji及带空白描述、linked身份。canonical未加原生策略适配，是真实旧版输出。原生逐组比较属性、结构、尺寸／偏移／精确像素和合成，普通／恢复保存重开、无导入历史、属性编辑Undo/Redo；几何样本不带Cel以显露原图层几何，特殊opacity样本移除Cel opacity以防活动帧覆盖掩盖默认值。失败基线layer-metadata-baseline-tests.log为visible:null被原生拒绝；没有把不经过读取路径的model测试算成迁移完成。

layer-metadata-final-build.log正式与四类工程目标Release构建通过；包含新样本及既有558组坏链接等完整project-manifest-tests通过layer-metadata-final-manifest-tests.log；project-import-tests、project-save-tests、完整free-tile-project-tests通过对应layer-metadata日志，正式--cel-clipboard-check退出0。来源覆盖626文件通过layer-metadata-provenance.log，git diff检查通过。未进行人工旧工程UI打开验收；索引色、原生尺寸上限及其它迁移领域仍未完成，全量INCOMPLETE。


### 工程调色盘布局读取归一化（2026-11-08）

本阶段迁移实际 legacy `project-format-decode.ts`／`palette-layout.ts` 的列数与槽位归一化。数字 safe integer 列数限幅到 1–256，其余值回落 8；非数组／缺失顺序回落空数组，顺序中的非 safe integer 项过滤。非数组／缺失槽位回落空布局；仅将可见颜色的有效数字身份放回原槽位，忽略重复、隐藏、失效及非整数引用，再按顺序填补首个空位，保留整行与末尾空行。填洞采用单向游标，避免每次从头扫描已占用前缀；保留原生分配预算。

生成器使用未经策略适配的实际 legacy decode→encode 输出生成 60 组原始／canonical ZIP：15 组列数、22 组槽位、12 组列数×稀疏布局、10 组顺序容器／元素类型与一组隐藏颜色。原生直接比较两份读取结果的列数、顺序与槽位。54 组满足当前文档模型约束的样本验证可编辑导入、原始颜色身份／名称／RGBA 与画面不变、无导入历史、普通／恢复保存重开，以及颜色修改／移除／新增 Undo/Redo。另六组归一化后产生独立 paletteOrder／槽位遍历顺序，原始和 canonical 均验证为明确 Unsupported；它们只通过解码对照，不计为可编辑迁移完成，不静默重排。原有无效 safe-integer 顺序引用、重复顺序、palette entry 身份／颜色及 nextColorId 准入仍有未迁移边界；索引色不在本阶段范围。

失败基线 `native/build/palette-layout-baseline-tests.log` 为旧版可归一化列数被原生拒绝。修复后完整 project-manifest-tests 通过 `palette-layout-tests.log`（含本批60组、既有558组坏链接及图层元数据等）；正式程序和工程／历史目标 Release 构建通过 `palette-layout-final-build.log`；project-import-tests、project-save-tests、完整 free-tile-project-tests、local-history-cost-tests 均通过对应 `palette-layout-*-tests.log`；正式 `--cel-clipboard-check` 退出0。来源覆盖626文件通过 `palette-layout-provenance.log`，严格检查按仍有迁移缺口返回1，git diff检查通过。未进行人工UI验收；整个调色盘领域和全量迁移仍 INCOMPLETE。


### 调色盘独立顺序的模型／事务／存档迁移（2026-11-08）

承接上一阶段六组明确拦截的合法旧工程，本阶段移除“paletteOrder 必须等于槽位遍历顺序”的可编辑限制。按实际 legacy 解码后的两个独立字段承接：原生 PaletteState 仅在序列不同时保存独立 order，普通状态沿用槽位派生，避免重复分配。导入传递 order；普通／恢复存档分别校验和编码 order 与 slots，要求可见身份集合一致。历史解码适配器除原有槽位／颜色校验外，也检查 order 是否与来源一致，失效来源不应因顺序同长度而混过。快照、回档持有完整状态；新增顺序存储计入编辑／回档保留字节。

先核对 `workspace-palette.ts` 的真实事务区别，再适配现有原生事务，不把所有操作强行归一化：改色／重命名／反转保留独立顺序；删除、应用色板、槽位渐变在 Undo 时恢复原 order；添加／粘贴的 recordPaletteEdit 以及拖动／排序的 applyPaletteSlots 在 Undo 时也从槽位重建 order。无变化粘贴可能只归一化 order 而不增加历史，无变化应用色板则不改变 order；两者均按实际旧版回调测试。另核对真实 mutateDocumentSession／completeDocumentChange 发布边界：仅 order 改变的粘贴也须标记 dirty、推进 revision／操作计数并通知录制，不创建虚构撤销条目；新增原生断言。其它已有无变化命令的通用记账差异不据此声称全部对齐。提取颜色的替换／追加沿 PalettePanel 的 applyPalette 语义验证。顺带修复对照发现的已有差异：满行添加按当前列数扩行，向外粘贴补齐整行，排序撤销保留原列数；新增色卡默认名称按真实本地化键 `{id}`，不添加原生自造的“颜色”前缀，已有名称保持原值。边界样本同时固定槽位渐变与提取应用的旧版1–256列范围，移除这两处已有的64列截断；没有更改面板布局规则。

真实旧版命令矩阵为六种独立顺序布局（1／2／3／4／256列、稀疏与满行）×19操作＝114组，每组输出 before／after／undo／redo 四份未经策略适配的实际编码归档。测试会调用真实旧版命令与其实际 Undo/Redo 回调；session 的 history 仅收集回调，不声称验证浏览器 HistoryStack 或 UI。覆盖单项改色／重命名、全部／多选反转、排序、移除、拖动、添加、覆盖／空位／无变化粘贴、RGB／HSV／新增颜色渐变、显式布局／默认／无变化色板应用与提取替换／追加。原生逐阶段核对精确身份、名称、RGBA、next ID、order、slots、columns、画面不变和事务数；每个阶段普通／恢复保存重开；另检查 DocumentSnapshot、实际 encodeJournalSnapshot→PixelHistory::materialize 检查点路径、回档 Undo/Redo。既有60组布局样本全部可编辑，其中六组原拦截样本新增了按真实添加Undo行为归一化的断言。实际旧版 local-history-delta 编译器再增加三组图对象对照：仅独立 order 变化、仅 slots 变化、独立 order 下改色；覆盖图遍历与编译结果，不将其当成所有非像素历史条目已可恢复的证明。

本阶段仍要求既有合法正数唯一颜色身份、有效唯一 order 引用及安全 nextColorId；畸形 palette entry 的旧版默认值、未知／重复 order 身份、索引色、任意 live 可选元数据和非像素历史条目恢复仍有迁移边界。没有将本批通过等同整个调色盘领域或全量软件迁移完成。

最终回归补正两处历史测试前置条件，未改生产历史保护：原 linked 样本对空源新建链接帧，按实际 legacy linkAnimationFrameCels 不会链接，随后笔画将1×1空Cel扩到8×5；样本现先画非空源并显式断言真实链接，形状断言失败时输出样本与两侧令牌。独立legacy验证器中，归档各资源可能是同一ZIP buffer的不同视图，不能当作原生独立dense分配；仅在这八组微型测试准备阶段按buffer范围复制，保留精确alias、分离无关视图，再调用实际projectHistoryAnimationFrame／syncActiveAnimationLayers恢复活动投影与alias surface。生产捕获器的形状、字节视图与稀疏保护不变，精确patch及实际Undo/Redo对照未删减。

正式程序及核心／工程／历史目标Release构建通过palette-independent-final-build.log、palette-independent-final-link-build.log；完整project-manifest-tests通过palette-independent-final-manifest-tests.log（本批114组四阶段矩阵、既有60组布局、558组坏链接等）。核心、快照、工程导入／保存、完整自由瓦片、历史成本检查通过对应palette-independent日志。历史捕获重建与检查通过palette-independent-committed-final-build.log／palette-independent-committed-final-tests.log；实际legacy八组捕获／hydrate及其独立编译样本生成通过palette-independent-committed-legacy-tests.log；原生hydration与budget使用本次新生成compiled-latest重新检查，通过palette-independent-hydration-final-tests.log／palette-independent-budget-final-tests.log。正式程序七项palette检查及--cel-clipboard-check均退出0，见palette-independent-ui-smoke.log；自动检查不等于人工UI验收。本阶段未进行人工旧工程UI验收，全量仍INCOMPLETE。


### 调色盘容器默认值、原始引用与整数分配边界（2026-11-08）

上一目标轮已实质完成独立顺序并提交推送ea24fffe；本轮沿现有调色盘缺口继续，不另开工程或Agent。直接检查实际project-format-decode.ts：palette只在非数组／缺失时成为空数组，旧版没有逐条修复畸形颜色；paletteOrder仅过滤非safe-integer值，其重复／悬空引用保留；normalizePaletteSlots另行使用存在且去重的可见身份。原生读取现按这些规则处理，在原生int范围内保留原始顺序，空槽仍使用现有零哨兵。超过int的原始顺序明确Unsupported；可读的重复／悬空顺序在可编辑导入处单独Unsupported，不能先悄悄重排或将旧版可读输入说成Corrupt。调色盘真实零ID、畸形条目与更宽ID空间仍未迁移。

nextColorId按真实Math.max(1, source.nextColorId ?? 1)，复用已有、经过独立对照的legacyjson::number处理JSON数值转换，包括空值、布尔、字符串、数制前缀、Unicode空白及嵌套单元素数组；负值含负无穷先限幅到1。有限整数且在原生int范围内时准确承接；NaN／正无穷／限幅后小数／过宽数字明确Unsupported，不截断或自行变成max(existing ID)+1。已占用身份之前的cursor仍在可编辑边界Unsupported；旧版会允许随后制造重复身份，未借本阶段擅自改变这项产品语义。直接DTO的同一准入测试从Corrupt改为明确未支持。

非数组原始palette经空色板导入、添加后保存时，编码器也不能强取原始GetNamedArray；现仅索引原始数组条目。每次保存建立一次ID→原始元数据索引，替代逐张色卡反复扫描全部来源条目的二次复杂度；保留原有按身份复用元数据与显式未知字段门禁。4096条含中文／Emoji／两侧空白名称、隐藏颜色、反序及稀疏布局的真实旧版样本参与相同四阶段检查，不以小样本通过代替这一分支。

整数上限属于必要原生表示适配：五类分配入口均检查ID与递增后的cursor同时可表示，允许分配INT_MAX-1并保存cursor INT_MAX，耗尽后明确失败，消除原有nextId++的有符号溢出。渐变／应用／提取已有临时palette，失败不发布；粘贴在修改活色卡前按真实目标预检所需新ID，重复目标只分配一次、纯覆盖不消耗ID，自动槽位沿用65536边界，避免为预检再复制整个PaletteState。新增测试检查晚一步耗尽时整笔失败、混合覆盖／新增不留下被覆盖颜色、最后一次分配保存与Undo/Redo、耗尽后重复目标纯覆盖仍成功。添加、双击、拾色面板、手工槽、取色器、粘贴、扩容与渐变的原生UI入口接住该限制并沿现有status反馈；扩容清理捕获，取色器继续既有收尾。应用／提取沿用已有异常反馈，不重设计UI或素材。

实际旧版decode→encode生成158组：九种空容器×三种列数×空／悬空顺序，44种cursor×空／非空色板，15种原始顺序及一组4096条目。128组可按原生表示读取，其中73组可编辑；另30组表示门禁和55组可读但不可编辑门禁单独断言，不计为可编辑完成。73组中的非上限样本再执行实际workspace-palette命令及其真实Undo/Redo回调，得到345组添加／粘贴／渐变／应用／提取四阶段矩阵；测试session仅收集回调，不声称浏览器HistoryStack／UI验收。原生各阶段核对精确身份、名称、RGBA、cursor、order、slots、columns、整个画布世界像素、单事务及普通／恢复保存重开。失败基线palette-decode-baseline-tests.log复现非数组palette误拒绝；最终整矩阵通过palette-decode-final-tests.log。本批不含人工旧工程UI验收，全量仍INCOMPLETE。

正式与核心／工程／历史目标Release构建通过palette-decode-final-build.log；入口错误反馈与正式自动验收补充构建通过palette-decode-ui-build.log，最终正式目标及边界断言校验构建通过palette-decode-verified-build.log。完整project-manifest-tests（含上述新样本与既有114组独立顺序、60组布局、558组坏链接等）通过palette-decode-final-tests.log；核心、DocumentSnapshot、完整project-import-tests／project-save-tests、完整自由瓦片与历史成本通过对应palette-decode日志。首次直接运行save／cost时遗漏其必需fixture参数，返回用法错误；按CTest定义补齐目录后分别退出0，不属于产品回归。历史捕获palette-decode-committed-tests.log、实际legacy八组捕获及独立编译palette-decode-committed-legacy-tests.log通过，再用本次生成的compiled-latest重跑hydration／budget通过对应日志。正式--palette-growth-check覆盖四项耗尽后的真实Editor路径及释放捕获，其余六项palette检查和--cel-clipboard-check均退出0，见palette-decode-ui-smoke.log；仅为自动界面逻辑检查，未进行人工图像验收。来源覆盖626文件通过，strict仍按全量INCOMPLETE退出1，diff检查通过。


### 调色盘重复粘贴目标与选择状态修正（2026-11-08）

接续调色盘原始引用兼容性核对时，发现上一轮边界测试错误地把重复粘贴目标解释为连续覆盖。直接核对 workspace-palette.ts::pastePaletteColors：先对合法目标索引按首次出现顺序去重，再与颜色逐项配对；例如目标[a,a,b]对应颜色[A,B,C]，结果是a=A、b=B，不是a=B、b=C。原生现以同一去重序列执行整数分配预检与实际写入，避免消耗无用ID或把后续颜色错配到槽位；收集到颜色数量即停止扫描剩余目标，沿用现有65536槽位表示限制。上一阶段INT_MAX边界断言也据真实旧版改为首个颜色，耗尽时纯覆盖、最后一个可分配ID和整笔失败的既有保证继续检查。

同一实际命令还表明selectResult=false必须清空selectedPaletteIds及paletteSelectionId，同时保留前景色。原生此前只跳过新选择，残留旧选择；本次修正并通过实际Undo/Redo检查前景色与选择恢复。空颜色输入仍立即返回，不修改选择、文档或历史。本阶段没有放开重复／悬空原始paletteOrder的可编辑导入：其排序后原始运行时槽位、各命令不同的归一化与Undo边界、UI及保存需一起承接；原来的明确Unsupported门禁继续保留，不能把本批粘贴修正计为该项完成。用户已确认的无像素缓存坏链接自由瓦片保留实例并恢复显示此前已实现，本批未改变该决定。

生成器调用实际旧版命令及真实历史回调，新增192组（四种布局×八种目标序列×三种颜色数量×两种selectResult）。除编码工程外，直接捕获before/after/undo/redo的条目身份／名称／RGBA、原始顺序、槽位、列数、cursor、选择和前景色，避免只对照归档漏检会话状态。覆盖重复占用槽、重复空槽、非单调目标、连续重复、隐藏颜色、独立顺序、1／3／256列、透明色和空操作。原生逐状态核对，并检查普通／恢复保存及未修改画布。测试session仅收集真实回调，不声明浏览器HistoryStack或人工UI验收。

验证：palette-targets-baseline-tests.log先复现残留选择问题；首次新增测试构建因测试名称转换调用不匹配编译失败，修正测试后才取得该失败基线。最终palette-targets-tests.log全部192组及既有158组decode、345组command和其他工程矩阵通过；palette-targets-core-tests.log核心事务通过；palette-targets-save-tests.log及palette-targets-snapshot-tests.log通过。正式Release构建通过palette-targets-formal-build.log，源码／测试构建通过palette-targets-core-build.log。正式--palette-growth-check、--palette-clipboard-check实际运行均退出0；首次PowerShell输出重定向语法失败发生在检查全部完成后，退出码由工具标准输出取得并另行记录在palette-targets-ui-smoke.log，没有把日志捕获失败解释为产品失败。未执行人工图像验收；全量迁移仍INCOMPLETE。


### 调色盘重复／悬空原始顺序的完整编辑链（2026-11-08）

接续ce9d4eec，本阶段撤去可读int范围原始paletteOrder的重复／悬空可编辑门禁，保留原始顺序作为独立数据，槽位按实际core/palette-layout.ts中的现存且去重可见ID处理。仍限制条目为正且唯一的原生int、nextColorId不与已占用ID碰撞；真实条目ID0、索引色模式、畸形条目与更宽JS身份／cursor仍明确未完成，不因原始order中的0作为悬空引用可读而宣称支持透明条目ID0。

新增共享可见顺序／槽位顺序／槽位归一化辅助，哈希成员查找与单调空位cursor保留旧版结果，避免逐个色卡重新扫描槽位前缀。导入不丢原始order；保存／恢复按真实编码器保留原始order而单独归一化runtime槽位。排序允许暂时留下重复runtime槽位，但order由槽位首次身份去重；下一个命令按其真实边界处理。添加／粘贴Undo从归一化before槽位推导order；删除／渐变／应用Undo保留原始before order与归一化before slots。悬空引用删除即使没有实际颜色槽变化也有旧版事务；反向颜色跳过缺失目标／来源，重复目标按捕获顺序写入及重放，不能用map.emplace意外保留首个变化。移动锚点采用真实repositionPaletteSlots的首个重复ID，而非原生此前错误的最后一个。

提取替换／追加复用applyStoredPalette，按实际PalettePanel调用不另给视窗列数布局；追加跳过悬空引用并保留实际重复颜色。库保存按ordered过滤悬空、保留重复颜色／名称，存储槽位先归一化，重复ID映射用旧版Map的最后出现索引。锁定颜色角色查找跳过悬空条目。自动视图保留真实重复项且跳过缺失项；手工视图和栏目尺寸使用归一化槽位。显示缓存以Document身份／revision、视窗列数、手工模式为键，避免鼠标移动与重绘每次重新构建ID集合；缓存只是派生视图，不写工程历史。栏目尺寸两次fit使用同一次归一化存储槽位及其存储列数，避免把视窗补行反向带入下一次缩放。布局、素材未重设计。

实际旧版生成1,440组运行时矩阵：12种原始顺序×1／3／256列×直接或先排序×20种命令，包含327组无历史操作与1,113组单事务；每组直接JSON记录条目／名称／RGBA、raw order/raw slots、列数、cursor、选择和前景色以及实际Undo/Redo回调，另存编码归档用于普通／恢复保存重开。测试session仅收集回调，不声称浏览器或完整HistoryStack验收。原158组解码样本现在128可读、110可编辑；18组可读不可编辑的cursor门禁保留，30组表示门禁保留，真实命令矩阵由345增到530。新记录callback原始slots，避免把空可见色板Undo后的[]与编码补整行后的数组混淆。首次原生检查复现排序后重复ID移动锚点偏移，修复后1,440组通过；随后扩展解码检查暴露旧测试把归档槽位当作内存槽位的错误假设，现以实际回调数据区分。新增测试首次编译误用private选择方法，改用公共选择入口；名称比较改为真实UTF8转换，避免UTF32到wchar_t窄化。

自动Editor补充原始重复／悬空顺序的自动／手工显示、保存颜色、扩容捕获取消、锁定角色查找、排序后手工归一化；进一步核对实际platform_palette.rs::validate_palette_layout：schema2要求每个导出颜色索引恰好出现一次，而原始重复ID经PalettePanel的最后索引Map会留下未放置的颜色，故旧桌面版本拒绝该类库保存。保留这一可观察失败：现有库保存专属测试目录内补重复顺序保存失败时无文件写入、草稿保留，以及仅悬空顺序过滤后实际保存再读回槽位；不借兼容性修复悄悄改变后端契约。最终验证：palette-raw-final-tests.log通过全部1,440组raw矩阵、192组粘贴矩阵、158组解码及530组命令，以及既有工程全部矩阵；palette-raw-verified-build.log和对应palette-layout／palette-extraction／palette-growth专项测试通过。palette-raw-moon-core-final-tests.log、palette-raw-project-import-final-tests.log、palette-raw-document-snapshot-final-tests.log、palette-raw-save-tests.log及palette-raw-cost-tests.log通过。palette-raw-committed-tests.log捕获、palette-raw-committed-legacy-tests.log实际旧版编译／hydrate及新compiled-latest生成通过，随后hydration／budget按本次生成数据重新通过对应日志。正式Release构建通过palette-raw-formal-build.log，最后新增后端失败检查重编通过palette-raw-final-formal-build.log。正式--palette-growth-check、--palette-library-check、--palette-manual-check、--palette-clipboard-check、--palette-gradient-check、--palette-sort-check、--palette-reverse-check、--palette-names-check、--palette-import-check、--cel-clipboard-check全部退出0，见palette-raw-ui-smoke.log。来源覆盖626文件通过，strict仍按全量INCOMPLETE退出1，diff通过。仅自动界面逻辑检查，未进行人工图像验收；全量迁移仍INCOMPLETE。


### 按已选颜色渐变的核心命令与面板回退（2026-11-08）

接续7d3404cf，不重扫仓库。核对workspace-palette.ts::gradientPaletteColors和PalettePanel.tsx::applyPaletteGradient：旧版除矩形槽位渐变外，还有按selectedPaletteIds在原始paletteOrder中出现顺序逐项渐变的命令。少于两个原始选中引用、缺失首／末端点或无颜色差异时不记历史；中间缺失条目跳过但保留其插值位置，重复引用按捕获前颜色生成变化，再顺序写入（最后变化生效）。该命令不新增颜色、不改order／slots／columns／cursor／名称、前景背景或选择；Undo/Redo也不能回滚后来选择。复用现有kind8颜色变化历史与重放，不复制整张色板做布局历史。

RGB／HSV插值与现有槽位渐变共用同一个PaletteGradientSampler，沿用实际palette.ts::paletteGradient、raster.ts::rgbToHsv／hsvToRgb／clampByte的最短色相路径、alpha与取整；端点HSV每次命令只转换一次，RGB路径不做无用HSV转换。面板apply函数在槽位范围少于两格时采用已选颜色回退；菜单／快捷键仍按旧版保留两格范围启用条件，不新增入口或改变启用习惯。正式gradient smoke新增单格box＋多选颜色调用apply函数的RGB／HSV检查、槽位不变、单历史及Undo保留后来选择。

实际旧版新增228组命令及真实Undo/Redo回调对照（总raw矩阵1668，新增72组事务、156组无操作）：19种order中原12种各RGB／HSV、1／3／256列与sort-first组合，另七种order专用于已选渐变，覆盖none／one／multiple、有效三色、反序、重复身份、首末缺失、中间缺失、alpha变化／全透明RGB、色相跨界与灰阶。测试直接录入真实session选择状态，逐阶段核对条目、布局、角色、选择与普通／恢复保存，保留既有其它命令矩阵。不能把核心方法的完成说成ID0／索引色完成：当前零ID仍与空槽哨兵冲突，需要单独迁移表示及所有消费者；既有准入门禁继续保留。全量迁移仍INCOMPLETE。

最终验证：palette-selected-gradient-verified-build.log中正式Release、工程矩阵、核心、保存和快照目标统一构建通过，确认链接最终采样器源码；palette-selected-gradient-verified-tests.log中完整1668组raw、192组粘贴、158组解码（110可编辑）及530组命令、既有工程矩阵、核心事务、工程保存重开和DocumentSnapshot均退出0。palette-selected-gradient-ui-smoke.log中的正式--palette-gradient-check、--palette-growth-check、--palette-clipboard-check、--palette-reverse-check、--palette-sort-check均退出0，覆盖新增回退及共享槽位算法。来源覆盖626文件通过，strict按已有全量迁移缺口退出1，diff检查通过。本批为源码／实际旧版数据对照与自动界面逻辑检查，未进行人工图像验收，亦未测量整体交互性能。


### 调色盘全部排序方式的派生键缓存与旧版对照（2026-11-08）

接续d6ba8c43，对实际core/palette.ts::comparePaletteColors和workspace-palette.ts::sortPaletteColors核对后，保留八种方式、升降序、灰阶8/255边界、alpha／packed RGBA末级比较、稳定重复引用、悬空过滤、原始槽位及现有layout-only历史语义。原生旧比较器在每次比较及色相回退中重复计算HSV／亮度及三次sRGB幂运算，现每个条目每次命令计算一次派生键，比较器只读取键；不改变菜单、快捷键、选择、颜色角色和工程表示。

生成器直接执行实际旧版命令及其Undo/Redo回调，新增128组：八组色板×八种方式×两个方向，覆盖重复颜色、全透明RGB、灰阶／近灰阈值、色相跨界、随机通道、隐藏颜色、重复／悬空原始顺序及4096色；原生逐状态检查order／slots／columns与事务数，并确认颜色条目／名称／cursor／选择／前景背景保持不变。旧版session测试桩只收集真实回调，不代表完整浏览器HistoryStack。首次测试编译漏传归档参数，补齐后首次运行又因空归档指针被导入工厂正确拒绝；测试已复用valid工程建立完整导入上下文，未放宽产品校验。

palette-sort-cache-final-build.log正式Release和核心目标构建通过；修正测试上下文后的palette-sort-cache-test-build.log通过。palette-sort-cache-final-tests.log通过全部128组新排序矩阵及既有1668组raw、192组粘贴、158组解码／530组命令和完整工程矩阵；palette-sort-cache-tests.log中的核心事务退出0（该日志同时保留首次工程测试上下文失败，不当作完整通过日志）。正式--palette-sort-check、--palette-gradient-check、--palette-reverse-check均退出0，见palette-sort-cache-ui.log。来源覆盖626文件通过，strict按已知全量缺口退出1；diff检查通过。

同机Release微基准见palette-sort-cache-benchmark.log：八种排序各重复三次，4096色旧比较器310.018ms、优化后完整Document命令99.946ms；65536色分别7092.76ms和2333.53ms，约3.10／3.04倍。临时基准源码从提交d6ba8c43提取旧比较器，旧侧仅计算顺序，新侧包含槽位归一化与历史，逐次核对两侧输出一致，生成物仅在native/build，不提交、不作为另一应用交付。此范围不代表UI拖动、缩放或整体交互性能，也未进行人工图像验收。全量迁移仍INCOMPLETE。


### 调色盘范围选择、拖排预览与自动列数提交（2026-11-08）

接续b3d4038c，直接核对workspace-palette.ts::selectPaletteColors／reorderPaletteColors、palette-layout.ts::paletteRangeIdsBySlots／repositionPaletteSlots、PalettePanel.tsx::finishPaletteDrag。原生选择过滤／去重改为集合，仍按输入首次顺序、原始order可用身份、指定primary或末项回退；悬空引用可选但不能据缺失条目改变前景色。拖排预览用集合处理移动身份／目标槽，用单调游标保留被挤颜色优先填原槽再填全局空槽的真实顺序，避免逐项重复扫描。负目标按旧版限到0，列数按既有1..256规则。没有新增颜色或改变选择轮廓素材／命中几何。

旧版finishPaletteDrag无论自动／手工模式都向reorderPaletteColors提交drag.columns，原生此前自动模式误用旧存储列数再归一化，造成预览和提交位置不一致；现两种模式均提交实际拖动列数，保留现有手工框选视图历史。syncPaletteButtons在每次刷新建立当前／预览条目及占位／选择索引，替代每色卡反复扫描整张色板；保留首条目查找、角色优先身份、重复／悬空与负预览占位、名称及替换预览规则，索引局限本次调用不保留裸指针。

实际旧版新增240组：八种布局×1／3／8列×五目标（含负数）×单／多选，直接记录移动预览、范围选择、reorder命令及真实Undo/Redo回调，覆盖重复／悬空源槽、缺失anchor、挤占优先源槽／全局空槽、扩容、无操作和视图／存储列数不同；原生逐状态核对order／slots／columns／事务数、选择／前景／cursor以及普通和恢复保存重开。首次工程检查因测试另造projectId与来源归档不一致被正确拒绝，改用真实来源身份；首轮失焦检查按未补行预览比较，现对照旧版提交归一化并新增自动列数断言，不削弱产品校验。失败证据保留palette-movement-tests.log和palette-movement-initial-blur-failure.log。

最终palette-movement-verified-tests.log通过240组新增、128组全部排序、1668组raw、192组粘贴、158组解码／530组命令及完整既有工程矩阵；核心事务在palette-movement-final-tests.log退出0。正式Release通过palette-movement-final-build.log及补充大色板检查后的palette-movement-verified-build.log；最终palette-movement-verified-ui.log中--palette-manual-check、--palette-window-blur-check、--palette-mouse-check、--palette-names-check、--palette-gradient-check、--palette-clipboard-check全部退出0。manual新增4096色真实全选／同步，逐卡验证颜色／名称／active／前后景标记、清除选择、替换预览不改原色及取消后无悬空预览索引；原有素材逐像素alpha／命中检查继续执行。来源覆盖626文件通过，strict因现存缺口退出1，diff检查通过。

同机Release微基准palette-movement-benchmark.log从b3d4038c提取旧移动函数，与本次函数核对相同输出，半数槽移动并挤占目标：4096槽1.7573ms→0.3903ms，16384槽26.327ms→1.6738ms，65536槽440.932ms→7.8432ms。仅为单次算法基准，不能推广为整体UI帧率；临时源码／程序仅在native/build，不提交或另作交付。本批没有人工图像验收。全量迁移仍INCOMPLETE。


### 调色盘复制顺序、矩形映射与批量粘贴路径（2026-11-08）

接续8ec6db36，直接核对PalettePanel.tsx::copySelectedPaletteColors／pastePaletteColorsFromClipboard及渐变范围派生。旧版复制颜色来自ordered（工程原始paletteOrder过滤有效已选条目），手工布局仅映射颜色索引；原生此前按显示槽位取颜色，在独立原始顺序与槽位顺序不同时改变外部剪贴板颜色排列。现按真实旧版顺序复制，保留重复原始引用，索引映射使用JS Map的最后出现位置，跳过缺失条目；V2空槽／空白边缘、V1自动模式、无色不覆盖剪贴板与内部fallback不变。复制、粘贴目标和渐变范围改用集合／索引，消除逐槽遍历选择与全部条目的二次扫描。核心pastePaletteColors复用条目位置索引覆盖已有颜色，追加采用单调最早空槽游标；目标去重、颜色配对、分配预检、选择／角色、Undo/Redo及原始顺序归一化语义保持不变，ID0与碰撞身份门禁未改变。

生成器直接从实际PalettePanel.tsx提取完整copySelectedPaletteColors闭包并去除TS，调用真实encodePaletteClipboard；仅替换浏览器clipboard写入端。96组（八种raw order×自动／手工×三种选择×有／无框选）写入tests/fixtures/palette_panel_copy_legacy.h，由实际Editor复制后解析逐项比对颜色／列数／槽位及空操作剪贴板／历史不变。首次生成时把return交给顶层TS解析器导致失败，改为仅转换闭包正文；首次界面对照因测试把3列下编号直接用于较宽原生视图，把3×2范围误设成6×1，按视图列数映射相同矩形后通过，未改期望数据或放宽断言。失败证据在palette-copy-order-fixtures.log和palette-copy-order-initial-fixture-mismatch.log。

现有4096色manual检查扩展为完整剪贴板颜色／索引／列数验证、渐变4096格范围及相同内容粘贴无历史。palette-copy-order-final-tests.log完整工程矩阵（240移动、128排序、1668 raw、192粘贴、158解码／530命令及既有工程检查）与核心事务退出0。正式最终构建palette-copy-order-verified-build.log通过；palette-copy-order-verified-ui.log中--palette-clipboard-check、--palette-manual-check、--palette-gradient-check、--palette-growth-check、--palette-mouse-check全部退出0，包含96组真实闭包与大色板检查。来源覆盖627文件通过，strict按全量已知缺口退出1，diff通过；本批无人工图像验收或整体UI性能测量。全量迁移仍INCOMPLETE。


### 调色盘库应用的条目复用与名称历史索引（2026-11-08）

接续2861782c，核对workspace-palette.ts::applyPalette及document-model.ts::findOrAddPaletteColor后，保留实际按存储顺序寻找第一个未使用同RGBA条目、一个条目一次复用、超出数量才创建、隐藏条目保留、名称按输入逐项覆盖、layout-only Undo/Redo及重复应用无增长规则。原生使用RGBA→条目位置队列及游标，一次构造ID→位置索引查找前景角色；新条目只追加，故无操作名称比较可使用原有前缀位置。kind11名称Undo/Redo用ID索引代替前后条目的双循环，维持最后同ID名称覆盖语义。该阶段没有放开原生零哨兵／真实ID0、碰撞身份或索引色门禁，不能把新建全透明色进入保留ID0的旧版分支计为完成。

实际旧版新增48组（八种数据×六种操作），覆盖独立顺序、重复／悬空raw order、隐藏颜色复用、倒序及Unicode名称、同RGBA超额创建、部分名称／空名称、空输入、显式空槽布局、新增重复颜色和4096条目。直接捕获首次应用／Undo／Redo／再次应用的全部条目身份／名称／RGBA、raw order、slots、columns、cursor、选择／前景及真实历史回调；原生逐状态核对，并检查普通／恢复保存重开。样本在当前正ID且新颜色非全透明的准入范围内，不覆盖上述ID0缺口。测试session只收集实际回调，不代表浏览器完整HistoryStack验收。

palette-apply-index-build.log正式Release、工程与核心目标构建通过；palette-apply-index-tests.log中48组新增、240移动、128排序、1668 raw、192粘贴、158解码／530命令及完整既有工程矩阵、核心事务均退出0。palette-apply-index-ui.log正式--palette-library-check、--palette-import-check、--palette-manual-check、--palette-clipboard-check均退出0。来源覆盖627文件通过，strict仍因全量已知缺口退出1，diff通过。

同机Release基准palette-apply-index-benchmark.log以2861782c旧代码的复用／改名部分对照本次完整Document命令，反序颜色并改名，逐条核对身份／RGBA／名称相同：4096色12.5188ms→5.8701ms，16384色222.087ms→29.2912ms。旧侧不计布局／历史，新侧包含完整命令，因此不把两侧当等范围全应用耗时，更不外推整体UI帧率；临时基准源码和程序仅在native/build。本批无人工图像验收。全量迁移仍INCOMPLETE。

### 调色盘独立相邻移动与显式重排命令（2026-11-08）

接续f8bb432b，直接核对workspace-palette.ts::movePaletteColor／reorderPaletteColors、workspace-commands-color.ts包装和PalettePanel.tsx::finishPaletteDrag。补齐只交换主选槽位与相邻槽位的独立命令，包含空邻槽、缺失主选和边界无操作；不把多选整体移动。显式重排接收完整预览，再按目标列数归一化；原拖排接口委托同一提交边界，重复移动身份仍按旧版计数，单／多色历史标签使用原有中文。两者只记录布局，Undo/Redo不回滚之后的选择、前后景色或像素；未发现旧版相邻移动的独立界面调用，不新增菜单／快捷键。

实际旧版新增240组（八种布局×1／3／8列×五种主选×两个方向），记录初始／执行／Undo／Redo布局及真实历史回调；原有240组移动预览矩阵改为直接提交显式重排命令，旧拖排适配器仍由raw及界面检查覆盖。核心回归补充非法方向、边界／相同布局无操作的revision／dirty／history、精确历史字节和后续选择／前后景保留。正ID准入范围不变；真实ID0、碰撞身份、索引色及全量迁移缺口仍未完成。

验证：palette-order-commands-fixtures.log生成真实旧版矩阵成功；palette-order-commands-build.log正式Release／工程／核心目标构建通过。palette-order-commands-project-tests.log通过新增240组相邻移动及既有48应用、240重排、128排序、1668 raw、192粘贴、158解码／530命令与完整工程检查；palette-order-commands-core-tests.log核心事务退出0。palette-order-commands-ui.log中正式--palette-manual-check、--palette-window-blur-check、--palette-mouse-check均退出0。来源覆盖627文件通过，strict因全量已知缺口退出1；diff通过。本批未做人工图像验收或新的性能测量，全量迁移仍INCOMPLETE。

### 调色盘删除事务与批量移除（2026-11-08）

接续6b0af176，直接核对workspace-palette.ts::deletePaletteColors及zh-CN.ts历史标题。先将请求与原始paletteOrder求交集，再移除槽位及选择中的有效身份；修正先前把请求中不可见选中身份一起清除的差异。隐藏条目实体、名称、颜色和分配器保留，前后景颜色不变；Undo/Redo恢复对应原始order、归一化slots、columns、selected及primaryId，保留之后的角色颜色。历史按实际前后order／slots／selected长度×4+32字节，单色与多色标题分别沿旧版。使用集合求交及批量过滤，避免槽位／选择逐项扫描请求列表。

新增96组实际旧版删除／Undo／Redo矩阵（八种数据×六种请求×两种主选），覆盖空／单／重复／多色请求、隐藏条目、重复及悬空raw order、不可见选中身份、缺失主选、空槽、空操作和4096条目；逐状态验证布局、选择、身份、保留条目及正常／恢复保存重开。只承接现有正ID RGBA范围，真实ID0、碰撞身份及索引色像素remap仍未完成；全量迁移仍INCOMPLETE。

验证：palette-delete-fixtures.log生成成功；palette-delete-build.log正式Release、工程及核心目标构建通过。palette-delete-project-tests.log通过96组新删除矩阵及240相邻移动、48应用、240重排、128排序、1668 raw、192粘贴、158解码／530命令和完整既有工程检查；palette-delete-core-tests.log退出0。palette-delete-ui.log中--palette-manual-check、--palette-growth-check、--palette-mouse-check全部退出0。来源覆盖627文件通过，strict按全量已知缺口退出1，diff通过。本批无人工图像验收或新的性能基准，不把集合扫描改进外推为整体UI帧率。

### 调色盘新增颜色的目标插入与事务（2026-11-08）

接续0d291152，核对workspace-palette.ts::addPaletteColor／createPaletteColor／recordPaletteEdit、palette-layout.ts::addPaletteIdToSlots／repositionPaletteSlots。原生指定目标此前直接覆盖槽位（无viewSlots时还拒绝非空槽），会把原颜色移出可见顺序；现复用已迁移的真实拖排算法，把新身份先放空槽，再移动到目标，保留被挤颜色。目标视图列数按旧版保存，无目标按存储布局首空槽追加；同RGBA及透明色保持新建独立身份。selectAdded只改选中身份，不改前景色；撤销／重做沿旧版归一化布局、全部条目及分配器，并保留后续背景角色。历史按前后条目数×40、前后槽数×4+64计算。

新增144组真实旧版矩阵（六种数据×三种视图列数×四种目标×两种选择模式），逐状态核对全部条目ID／名称／RGBA、order／slots／columns、选择、主选、cursor、执行／Undo／Redo及普通／恢复保存重开；覆盖独立／重复／悬空顺序、稀疏槽、非空目标、跨末尾插入、同RGBA及透明RGB。另补无viewSlots的非空存储槽插入；编号耗尽及65536位置越界在修改前拒绝，保留活动笔画、像素、色板、cursor、revision与history。原生int／65536槽范围与真实ID0／碰撞／索引色缺口未放开。

验证：palette-add-fixtures.log生成成功；palette-add-build.log正式Release／工程／核心构建通过；palette-add-final-build.log补充测试串行重链接通过。初次补充链接与上一轮测试运行重叠造成LNK1104，占用证据保留palette-add-verified-build.log；等待原测试正常完成后再构建，未结束用户程序。最终palette-add-project-tests.log通过144组新增、96删除、240相邻、48应用、240重排、128排序、1668 raw、192粘贴、158解码／530命令与全部工程矩阵，包含失败保护及存储槽插入检查；palette-add-core-tests.log退出0。palette-add-ui.log正式--palette-manual-check、--palette-growth-check、--palette-mouse-check均退出0。来源覆盖627文件通过，strict因全量缺口退出1，diff通过。本批无人工图像验收或新性能基准；全量迁移仍INCOMPLETE。

### 颜色板同步的稀疏时间线与混合锁定范围（2026-11-08）

接续56952a43，核对workspace-commands-color.ts::updatePaletteColorWithSynchronization／applyColorReplacementTarget、workspace-palette.ts::updatePaletteColor及真实HistoryStack。原生此前只要存在瓦片／自由瓦片层就阻止整个同步；现所有这些层有效锁定时允许同步普通层，含直接锁及组继承锁。同步仍按帧先后、图层底到顶顺序，先共享存储去重再检查锁，隐藏层也同步，忽略像素选区，比较包含透明RGB的完整RGBA并访问画布外存储像素。稀疏时间线只收集实际Cel并排序，密集时间线保留按槽访问；有效锁每层计算一次。共享去重直接用LinkedPixelStorage::identity，对齐旧版Set(layer.pixels)，移除每个目标调用linkedStorageKey扫描全部Cel的二次路径。

64组实际旧版矩阵通过加载器仅导出原始私有同步函数，函数正文及其依赖未修改，使用真实HistoryStack复合／Undo／Redo；包含开启／关闭、透明RGB、直接／组继承锁、隐藏层、同层链接、跨层共享、偏移存储、稀疏缺失槽及32层×64帧稀疏时间线，逐Cel几何／像素、色板、前后景及保存／恢复核对。另16组瓦片／自由瓦片×直接／组锁×同步开关×普通层显隐，验证普通链接源、特殊实例／网格／纹理不变、一次历史及重开／Undo／Redo。

首轮生成器误从raster导入readLayerPacked，按真实tools-fill依赖改从document-model读取，失败证据palette-sync-fixtures.log。界面旧检查直接替换Document却遗漏applyDocumentPreferences，而实际替换／激活入口会调用；补齐测试设置，保留共享owner锁与新建文档偏好断言。特殊范围首轮把保存重建的派生缓存与手造初始缓存直接比较；现先保存重开建立合法缓存基线，再检查同步前后及后续重开保持相同权威数据。相关初始失败保留palette-sync-ui-initial-error.txt和palette-sync-special-tests.log。

未锁定特殊图层的旧版只改派生像素、下次重渲染恢复旧色，与修改真实源资源会影响全部引用的行为不同；已向用户提出明确选择，在决定前保留这部分准入保护，未自行改源资源，未宣称特殊同步或全量迁移完成。

最终验证：palette-sync-identity-build.log正式Release／工程／特殊项目／核心目标构建通过。palette-sync-identity-project-tests.log通过64真实旧版同步及既有144新增、96删除、240相邻、48应用、240重排、128排序、1668 raw、192粘贴、158解码／530命令和完整工程矩阵；palette-sync-identity-special-tests.log完整特殊项目测试退出0，包含16组新增混合锁定范围；palette-sync-identity-core-tests.log退出0。palette-sync-identity-ui.log正式--palette-sync-check、--palette-mouse-check均退出0。来源覆盖627文件通过，strict按已知全量缺口退出1，diff通过。没有人工图像验收或本批性能微基准，不将复杂度改进等同整体UI帧率改善。全量迁移仍INCOMPLETE。

### 颜色板跨命令历史与精确预算（2026-11-08）

接续a165d869，核对workspace-palette.ts的updatePaletteColor／renamePaletteColor／recordPaletteEdit／applyPaletteColors／applyPalette／gradientPaletteSlots及core/history.ts::HistoryStack。颜色板kind3改色按32字节，kind4改名按前后UTF-16单元长度×2+16，kind8反向／选色渐变按变化项数×40，kind1／7新增／粘贴按前后条目×40+前后槽×4+64，kind11应用按前后order／slots／selected总数×4+32；kind10槽渐变去掉旧版未计入的独立order；kind9排序／相邻移动／重排统一只计前后槽×4，去掉排序写入独立order造成的额外计费。继续使用已迁移删除计费。原生快照结构不变，预算权重承接旧版历史裁剪规则，并不宣称这些数值是实际堆内存测量。

新增128组真实HistoryStack序列（八种Unicode／trim名称×普通／独立raw order×八类连续操作），包括emoji补充平面、组合字符、JS会裁掉的空白、JS不裁掉的U+0085／U+180E／U+200B和换行；覆盖改色／改名后再选择及改背景色、连续三步Undo/Redo、新增／粘贴／删除／应用色板与先前条目历史交错、同色／缺失身份／重复改名无操作。每一步核对全部条目ID／名称／RGBA、布局、cursor、选择、前后景、历史位置／字节／所有标题，最终普通／恢复保存重开核对名称及颜色。1668组既有raw矩阵增加真实回调bytes、Undo为0及Redo恢复的断言，覆盖22种命令分支。真实ID0／碰撞身份／索引色等缺口不因历史测试扩展而关闭。

验证：palette-entry-history-fixtures.log生成成功；palette-entry-history-build.log正式Release、工程与核心构建通过。首次新增预算断言发现palette-raw-4排序多计独立order；对照旧版sortPaletteColors／movePaletteColor／reorderPaletteColors确认三者都只计前后slots，修正kind9后重建，最终palette-entry-history-project-tests.log退出0，覆盖128新增序列及1668 raw与全部既有工程矩阵；palette-entry-history-core-tests.log退出0。正式程序--palette-names-check、--palette-sync-check、--palette-gradient-check、--palette-reverse-check均退出0。来源覆盖627文件通过，strict因既有迁移缺口退出1，diff检查通过。本批无人工图像验收或新性能基准，未开放待决定的未锁定特殊图层颜色同步，全量迁移仍INCOMPLETE。

### 历史限制、分支与批量裁剪（2026-11-08）

接续be458455，按实际core/history.ts的normalizeHistoryEntryLimit／setMaxEntries／trimOldestUndoEntries／push／endCompound迁移运行时整数限制：有限值裁剪到1..10000，size_t最大值适配JS Infinity，构造与动态设置一致。旧原生setter未封顶而constructor不接受无限哨兵；现统一。历史预算先裁超额Undo，再处理总条数，保留最近Redo，字节只统计Undo；同限值立即返回，不产生裁剪事件。共享原生批量裁剪实现用于普通push、组合提交和setter，先计算前缀及预算，再一次erase，避免大幅降低限制时逐条头删反复搬移Edit。无文档内容变化、无新撤销条目，通知仍按旧版discardedUndo／discardedRedo报告。

新增60组真实HistoryStack序列（四种预算×五种限制×三种Undo深度），逐步对照改色／改名、超预算、混合Undo/Redo、分支push、重复设置、清空、最近Redo保留、每条历史标题、位置、字节、revision及全部观察者事件。原生回归另覆盖超过10000条的有限／无限构造与动态限制以及一次大量裁剪。尚未据此声明全量历史迁移或颜色板领域完成。

验证：history-trim-fixtures.log实际旧版生成通过；history-trim-build.log正式Release及工程／核心／偏好历史／历史面板／本地历史预算目标构建通过。history-trim-project-tests.log全部工程矩阵及新增60序列退出0；history-trim-preferences-tests.log超过10000条边界与大量裁剪退出0；history-trim-panel-tests.log、history-trim-local-budget-tests.log、history-trim-core-tests.log均退出0。正式--history-panel-check退出0。来源覆盖627文件通过，strict因既有缺口退出1，diff通过。无人工图像验收或定量性能基准，本阶段性能结论限于移除重复vector头部搬移；全量迁移仍INCOMPLETE。

### 历史提交容量与全命令预检（2026-11-08）

接续a1118220，大记录回归进一步定位所有历史预检入口：此前history_.reserve(position_+1/2)按精确下一条容量增长，导致每次提交搬移全部保留Edit。旧版HistoryStack::push使用JS数组追加；原生必须保留分配先于文档变更的失败保护，故统一Document::reserveHistoryEntries以初始8、1.5倍增长预留，检查max_size与加法上溢，已有空间直接返回。全部15个源码中的预检入口共同迁移，包含普通提交、绘制／填充／形状／渐变、图层／组／蒙版、文字、切片、瓦片、变换、回滚和时间线拖动；双条目选区预检保留additional=2。预留不修改history大小／位置／字节、不提前丢Redo、不改变命令语义。

扩展既有真实10002次提交回归，直接检查历史容量变化少于32次，而非按机器耗时定阈值；覆盖Undo后新分支复用容量、不保留旧Redo以及分支Undo/Redo。仍运行实际旧版60组预算／分支／事件及128组颜色板交错历史矩阵。容量是原生存储适配，不声称全量迁移完成。

已验证：history-capacity-preferences-history-tests.log中10002次实际提交仅18次容量增长，分支提交复用已有容量；有限／无限限制及大量裁剪回归通过。history-capacity-project-tests.log完整工程矩阵（含60组真实历史预算与128交错序列）通过；history-capacity-moon-core-tests.log、history-capacity-history-panel-tests.log、history-capacity-timeline-interaction-tests.log、history-capacity-free-tile-project-tests.log及history-capacity-local-budget-tests.log均退出0。来源覆盖627文件通过，strict因既有缺口退出1，diff通过。正式Release构建及界面检查另行记录，不以已通过的核心测试代替正式程序验收。

正式验收：history-capacity-build.log全部指定目标及唯一正式moonsprite-native.exe构建退出0；正式--history-panel-check、--deselect-check均退出0。未进行人工图像验收；18次扩容是本次实际记录，不外推整机UI流畅度或帧率。全量迁移仍INCOMPLETE。

### 色板库文件可选值与Unicode名称兼容（2026-11-08）

接续4892070d，直接对照platform_palette.rs::PaletteDiskFile／stored_palette_from_file／validate_palette_layout／save_palette／palette_slug。serde Option显式null按无值读取，schema1的columns／slots为null允许，schema2仍要求非null布局；names:null不再误当数组。读取保留有效名称原文，按Rust Unicode White_Space拒绝纯空白；保存先trim再生成slug，Unicode空格可形成分隔符，BOM不是Rust空白。槽位索引不再硬限65535，按现有1048576槽总上限允许合法高索引；保存仍限制65536种颜色，读取不凭保存限制拒绝旧版合法大文件。

回归包括schema1／2 null、透明RGB、纯空白及缺失必需字段拒绝、Unicode trim／slug／重名后缀、BOM保留、65537色合法读取／保存拒绝及目录坏文件隔离。首轮palette-import-tests失败于原测试仍认为png／bmp／gif未迁移，实际源码及旧版IMPORTABLE_PALETTE_EXTENSIONS均已支持；同步测试已实现的完整图片扩展清单，未知md／svg／exe仍拒绝。未改变删除策略／长名称slug边界／覆盖身份准入等其它语义，不宣称整个色板库或全量迁移完成。

验证：palette-library-compat-build.log正式Release／色板库／导入目标构建通过，palette-library-compat-final-build.log扩展Unicode矩阵构建通过；palette-library-compat-tests.log及palette-library-compat-import-tests.log均退出0，正式--palette-library-check、--palette-import-check均退出0。补充13种Rust空白的保存trim／空名拒绝和U+180E／U+200B／BOM非空白保留矩阵。来源627文件覆盖通过，strict因既有迁移缺口退出1，diff通过。没有运行旧版Rust完整平台测试或人工文件选择器／图像验收，本批证据为实际Rust源码契约核对与原生执行回归。全量迁移仍INCOMPLETE。

### 色板库规范路径身份与损坏文件操作（2026-11-08）

接续8a588b61，直接按platform_palette.rs::save_palette／delete_palette／list_palettes／is_built_in_palette_id迁移：显式合法非内置ID写入id.palette.json，不要求存在于可解码列表；新建碰撞依据保留内置ID及规范路径是否存在，不以任意文件内嵌ID作为文件名占用；删除优先规范原生路径（即使损坏），没有原生文件才按外部路径稳定hash查找，删除不依赖解码成功。内置身份以assets/palettes资源文件名适配旧版DEFAULT_PALETTES静态表；用户列表排除保留身份。保存／删除不再为找身份解码整个目录的全部色板与图片。

新增规范路径缺失／损坏覆盖、损坏删除、文件名与内嵌ID不符、规范文件优先且不删别名原文件、新建路径碰撞、内置保留与用户冒用过滤、损坏外部文件删除以及非法路径ID拒绝。测试只操作本轮独立创建的owned fixture；用户文件未删除。长slug边界、损坏内置资源报告等仍有差异，本批不宣称色板库或全量迁移完成。

验证：palette-library-identity-build.log唯一正式Release与色板库／导入目标构建退出0；palette-library-identity-tests.log、palette-library-identity-import-tests.log退出0，正式--palette-library-check及--palette-import-check退出0。补充目录同名拒绝检查，std::filesystem::remove不可用于删除目录，承接旧版fs::remove_file语义。来源627文件覆盖通过，strict因既有迁移缺口退出1，diff通过。未运行完整旧版Rust平台测试或人工系统选择器验收；全量迁移仍INCOMPLETE。

### 色板库资源失败与有界读取（2026-11-08）

接续99f33e86，对照platform_palette.rs::read_built_in_palette／list_palettes：内置资源collect<Result>遇坏资源整体返回错误，用户单文件读取失败才隔离跳过。原生此前两者都吞掉，现在内置解析／版本／布局／读取失败报告实际资源路径，用户坏文件继续隔离；assets目录承接旧版嵌入资源，不引入旧版启动清理行为。原生JSON读取原有64MiB限制此前全量分配后才检查，现复用readPaletteImportBytes同句柄大小预检及分块增长限制；直接decode在UTF16转换前检查文本字节，槽位在分配vector前检查既有1048576上限。

回归覆盖有效内置和用户并存、坏JSON／未知版本／坏布局内置报错与用户隔离、坏内置修复后用户保留身份过滤，以及64MiB+1文件的预检拒绝／内置路径错误。大文件由owned fixture resize生成，不读取其全部内容。内存上限是既有原生适配，并非旧版无条件格式等价；全量迁移仍INCOMPLETE。

验证：palette-library-resource-build.log正式Release／色板库／导入构建退出0；palette-library-resource-tests.log与palette-library-resource-import-tests.log退出0，正式--palette-library-check及--palette-import-check退出0。来源627文件覆盖通过，strict因全量缺口退出1，diff通过。未执行完整旧版Rust运行或人工图像验收，错误通道验证范围为库异常及正式现有界面回归；全量迁移仍INCOMPLETE。

### 色板提取模式与活动库身份（2026-11-08）

接续d579c71e，先核对实际components/palette-clipboard.ts与PalettePanel复制／粘贴映射，未发现需要新增格式或名称载荷的差异；继续沿工作区状态定位extractFromImage／openSaveDialog。成功create必须清除activePaletteId及其偏好，设置trim后的临时saveName，即使applyPalette颜色完全相同、没有新增文档历史也如此；replace／append保留原身份与名称。原生此前遗漏清除，并且打开保存时refreshStoredPalettes会按匹配颜色重新绑定临时色板。现create只在应用成功后更新会话状态；保存专用刷新保留显式会话身份，真正打开库／刷新仍保留现有匹配行为。取消／空画面失败保留原身份和名称，Undo/Redo只恢复文档，不回退会话身份。

原正式extraction-names自动检查新增三模式×初始颜色相同／不同六组真实临时库文件对照，覆盖无操作create、Save Current显示、Undo/Redo、失败和取消；复用原生现有弹窗组件，未改布局。没有据此关闭颜色板真实ID0／索引色等缺口，全量迁移仍INCOMPLETE。

验证：extraction-identity-build.log唯一正式Release构建退出0；正式--extraction-names-check（含新增身份矩阵）、--append-extraction-count-check、--palette-library-check、--palette-clipboard-check均退出0。来源627文件覆盖通过，strict因既有迁移缺口退出1，diff通过。未修改核心提取算法，本批未重跑无关全量核心矩阵；没有人工图像／真实剪贴板跨进程验收。全量迁移仍INCOMPLETE。

### 色板库可见色块控件（2026-11-08）

接续1954d633，对照实际PalettePanel.tsx库预览：空槽只在紧凑预览略去，颜色顺序、重复和透明RGB保留，点击应用完整StoredPalette。原生此前为全部库色块创建PixelButton，布局时遍历全部控件隐藏离屏内容；现单独保留完整预览数据，仅为视口行创建并复用控件，完整数据仍决定滚动高度、布局与应用。保存启用检查和匹配身份时也避免反复生成当前色板颜色。既有布局、命中裁剪和右键删除入口不变。

对照Aseprite app/ui/palette_view.cpp的adapter单控件绘制架构，确认无需每个颜色对应子控件；其绘制循环仍遍历条目，不能声称Aseprite已实现本批可见范围算法。本批未复制其代码。正式现有palette-library检查增加4096颜色／8192稀疏槽、两种宽度各四个滚动位置，与完整布局独立比较可见颜色和矩形，检查控件数量受视口约束、完整应用及撤销重做、刷新与关闭。验证：palette-preview-build.log正式Release及色板库／导入目标构建退出0；正式--palette-library-check、--palette-import-check、--extraction-names-check均退出0，palette-preview-library-tests.log与palette-preview-import-tests.log核心测试退出0。4096色／8192槽、两宽度八滚动组合的整个库色块控件峰值1856，可见颜色／矩形与完整布局一致，完整应用及Undo/Redo通过。来源627文件覆盖通过，strict因既有缺口退出1，diff通过。未进行人工图像或交互帧率验收，不将控件数减少等同于全软件卡顿已解决。全量迁移仍INCOMPLETE。

### 色板导入收集准入与长行内存（2026-11-08）

接续60fe3cfa，沿platform_palette.rs::text_imported_colors／json_imported_palette／linear_imported_palette／native_imported_palette核对。65536有效色是已有导入上限，但原生文本与通用JSON在完整vector分配后才拒绝；现收集第65537个有效色前立即拒绝，原生形状JSON也先检查颜色数再转换Pixel。文本一行只需前四个有效u16数值，现不保留多余数值，仍逐token解析并保留无效token过滤、RGBA顺序与默认alpha规则。64MiB输入上限、普通库读取超过65536色的既有允许行为不变。JSON DOM仍由WinRT完整解析，本批不声称解决全部输入内存成本。

完整边界覆盖五种文本扩展和通用／原生JSON的65536成功与65537失败、无效行／条目不计颜色、十万额外数值不影响结果，以及失败文件导入不写库。验证：palette-import-admission-build.log正式Release及导入／库目标构建退出0；palette-import-admission-tests.log和palette-import-admission-library-tests.log退出0，正式--palette-import-check及--palette-library-check退出0。来源627文件覆盖通过，strict因既有迁移缺口退出1，diff通过。没有执行完整旧版Rust平台测试或实际内存峰值／人工文件选择器验收；结论限于提前颜色收集准入和避免无用数值vector增长。全量迁移仍INCOMPLETE。

### 色板保存事务与失败隔离（2026-11-08）

接续f31dfa86，对照platform_palette.rs::save_palette，布局验证应在palette_dir之前。原生此前直到编码才验证布局，已创建目录并扫描资源；现提取共享布局验证，保存先拒绝缺少schema2布局、重复／越界／缺失颜色和非整行槽位，再访问目录。编码和读取仍使用同一验证，未改变色板身份规则或原子写入器。

新增真实Windows文件锁覆盖失败，逐字节核对原文件、无关.tmp及目录文件数；解除锁后保存重开，核对身份／名称／RGBA／槽位／名称数组；目标为目录时拒绝覆盖并保留子文件。夹具均为本次独立owned目录。长名称ID截断与旧版写入后读取失败的差异已询问用户，未以本批覆盖其决定。验证：palette-save-transaction-build.log正式Release和库／导入目标构建退出0；palette-save-transaction-tests.log及palette-save-transaction-import-tests.log退出0，正式--palette-library-check及--palette-import-check退出0。来源627文件覆盖通过，strict因既有迁移缺口退出1，diff通过。实际文件锁与目录目标均为原生测试执行，不等同于磁盘断电或人工系统选择器验收。全量迁移仍INCOMPLETE。

### 图片色板有界条带收集（2026-11-08）

接续11c2d5ac，核对实际platform_palette.rs::ordered_image_colors／png_imported_colors／image_imported_colors。PNG／JPEG／BMP／ICO原生WIC路径此前显式分配width×height RGBA，再全图去重；现按至多16384像素或至少一整行的有界条带转换，立即按行优先收集首现RGBA，保留透明RGB、重复、尺寸及65536种颜色上限。窄高图按多行批次调用WIC，避免每行一次COM调用。GIF仍按完整逻辑画布处理，WebP仍用既有Skia首帧解码；不声称这两条路径或WIC内部缓存也已流式化。

完整格式回归扩展索引PNG1／2／4／8位跨行打包、透明RGB及顺序，65536唯一色成功／65537失败、8192行低色数图；保留既有BMP／JPEG／ICO／GIF／WebP、CRC／灰度／16位PNG及尺寸拒绝。验证：palette-image-bands-build.log唯一正式Release和图片／通用导入目标构建退出0；palette-image-bands-tests.log全部图片格式夹具及新增边界通过，palette-image-bands-import-tests.log退出0，正式--palette-import-check退出0。来源627文件覆盖通过，strict因既有缺口退出1，diff通过。32×8192夹具自身RGBA缓冲从1048576字节降为65536字节（按实际分配表达式核算），未测量WIC内部峰值或人工文件选择器／图像验收。全量迁移仍INCOMPLETE。

### ASE／ACO真实旧版解析回归（2026-11-08）

接续0635a732，本批不凭少量手写预期宣称Adobe格式等价。新增make-palette-adobe-fixtures.py，直接截取platform_palette.rs的read_u16_be至aco_imported_colors原函数，rustc独立编译执行；只增加PaletteColor数据形状和二进制传输驱动，算法未经改写。固定输入生成718组实际Rust成功／拒绝及RGBA结果，保存源码SHA256；原生逐项比较解析器和通用导入入口，成功时也核对未自行恢复旧版跳过的名称。

覆盖256个8位半步浮点取整、越界／NaN／无穷、RGB／GRAY／CMYK、固定种子96组ASE混合分组与96组ACO模型、12色相边界×3饱和度×3明度、UTF16代理对名称跳过、v1/v2／首段选择、未知模型、原版忽略的ASE版本、代表文件每字节截断、长度上溢／条目上限／空文件。本批718组均未发现解析算法差异，因此保留生产实现，新增可再生兼容证据；不以测试通过关闭全域或长期桌面验收。验证：palette-adobe-oracle-build.log定向Adobe目标构建退出0，palette-adobe-oracle-tests.log718组对照与既有夹具退出0，palette-adobe-oracle-import-tests.log通用导入回归退出0。再次生成header哈希完全相同。来源629文件覆盖通过，strict因已知全量缺口退出1，diff通过。本批只新增测试与生成器，未改生产源码，因此未重建无关正式UI目标或重复人工界面验收。全量迁移仍INCOMPLETE。

### 纯文本／ACT色板实际旧版对照（2026-11-08）

接续70ae7fd0，新增独立Rust原函数生成器，直接执行platform_palette.rs::parse_palette_color／text_imported_colors／act_imported_colors，PAL使用原版文本优先、无色再ACT分支。229组固定输入覆盖颜色串正负号与长度／大小写／Unicode、Rust空白／BOM／CRLF／坏UTF8、u16有效token过滤和alpha默认、随机分隔符、ACT截断／0与超范围count／透明索引及PAL回退。原生逐项核对成功／拒绝和RGBA，颜色串也直接核对原生库文件读取。

初次真实对照在case4发现前导+差异：旧版u32::from_str_radix允许正号，但6／8长度判断发生于移除正号之前。原生文本／通用JSON和原生库JSON此前均拒绝；现保留原长度决定alpha，再去掉一个+解析数字，负号／其它非法字符继续拒绝，规范保存仍输出原来的标准HEX。不自行解释为RGB格式扩展，直接承接已有旧版可观察行为。第二轮在case39发现BOM后的首词差异：旧版trim_start_matches BOM之后，split_whitespace继续跳过前导空白；原生此前选到空词。现只在获取首个HEX词时跳过空白，保留更早的注释判断顺序。验证：palette-text-compat-final-build.log正式Release及库／导入目标构建退出0，palette-text-compat-tests.log229真实对照及全部既有边界退出0，palette-text-compat-library-tests.log退出0；正式--palette-import-check及--palette-library-check退出0。再次生成夹具哈希一致，来源631文件覆盖通过，strict因既有全量缺口退出1，diff通过。未进行人工选择器或长期桌面验收，全量迁移仍INCOMPLETE。

### JSON色板格式识别与真实serde对照（2026-11-08）

接续a6dcc763，新增独立Cargo旧版原函数执行器，提取实际类型／JSON／布局／颜色函数，使用与旧版Cargo.lock一致的serde1.0.229及serde_json1.0.151，通过legacy/.cargo/config.toml复用离线registry。初次默认registry离线缺少itoa，修正为旧版现有源配置后成功，未下载依赖。271组对照比较成功／拒绝、name／RGBA／columns／完整可空slots／可选names，覆盖颜色通道数值与缺失／大小写、normalize及alpha回退、数组优先级、原生结构／版本／布局／可空字段、v1不完整末行、重复字段、转义键、有效／孤立代理项及96组固定随机通用矩阵。

首轮case95暴露WinRT把2.0标准化为整数2，而serde原生u32反序列化失败后转通用颜色数组；原生应丢弃原生布局与名称。重复已知字段、浮点槽／超usize也有同类分支差异。现保留原始token整数写法／范围与已知键重复检测，转义键用既有WinRT字符串解码；不替代DOM语法解析。case167又发现孤立UTF16代理项，增加输入UTF8及字符串代理对严格验证，在所有通用／原生分支前执行；合法代理对与转义保持接受。只修改共享导入入口，不据此声明单独原生库解码器的所有词法规则等价。验证：palette-json-formal-build.log正式Release及导入／库目标构建退出0；palette-json-compat-tests.log271组真实JSON、229组文本及既有全部导入边界退出0，palette-json-compat-library-tests.log退出0；正式--palette-import-check和--palette-library-check退出0。重复生成fixture哈希一致；来源633文件覆盖通过，strict因既有缺口退出1，diff通过。未执行完整旧版Tauri运行或人工系统选择器／长期桌面验收，全量迁移仍INCOMPLETE。

### 原生色板文件直接读取的serde闭环（2026-11-08）

接续d2b3fa93，上一阶段只处理导入；本批原函数生成器增加serde_json::from_slice<PaletteDiskFile>→stored_palette_from_file的直接读取结果，同271输入生成另一组实际旧版结果，总542组。原生直接读取不允许通用数组回退，schema1空颜色／无布局保持原状，不套用导入的线性布局。提取现有词法函数为导入模块共享内部接口，直接库解码也在WinRT标准化前校验UTF8／代理对、整数原写法与已知字段重复；保留导入与读取各自的旧版分支。

除542组完整载荷核对，还把271个直接fixture逐个写入独立owned目录，真实调用PaletteLibrary::list：用户坏文件隔离跳过，内置坏资源返回错误，接受项核对名称／RGBA／列数／槽位／可选names。复用已有代码，无新增生产JSON依赖。验证：palette-json-direct-build.log正式Release及导入／库目标构建退出0；palette-json-direct-tests.log542组JSON及既有完整导入退出0，palette-json-direct-library-build.log及palette-json-direct-library-tests.log实际文件矩阵退出0。正式--palette-import-check及--palette-library-check退出0，重复生成header哈希一致，来源633文件覆盖通过，strict因已知缺口退出1，diff通过。未进行完整Tauri运行或人工系统文件选择器／长期桌面验收，全量迁移仍INCOMPLETE。

### 色板JSON单DOM与批量HEX编码（2026-11-08）

接续cfc7375d，对照旧版json_imported_palette把PaletteDiskFile直接传给stored_palette_from_file／native_imported_palette的路径。原生此前解析DOM后Stringify→UTF8→UTF16→再次Parse／词法检查；现提取已有DOM语义解码为内部适配器，导入复用同一DOM，直接读取仍先执行原始字节词法准入；present继续处理null，无需修改DOM删除null。COM由入口管理，完整身份／颜色／布局校验共享，不跳过旧版失败分支。颜色数组按已知长度reserve；保存HEX使用固定9字符宽缓冲，移除每色字符串流与格式化分配，仍输出大写#RRGGBBAA。

保留542真实serde及229文本矩阵，新增65536色／131072槽稀疏完整导入→直接读取→保存→目录重开，核对RGBA／透明RGB／列数／槽位／全部names（含emoji）和标准HEX。优化结论限于消除重复DOM／文本生成及逐色流对象，不外推整体UI帧率。验证：palette-json-single-dom-final-build.log唯一正式Release及库／导入目标构建退出0；palette-json-single-dom-tests.log含大色板全路径与542／229对照退出0，palette-json-single-dom-library-tests.log实际文件矩阵退出0；正式--palette-import-check及--palette-library-check退出0。来源634文件覆盖通过，strict因既有缺口退出1，diff通过。未测量进程内存峰值／整体帧率或人工系统选择器验收，全量迁移仍INCOMPLETE。

### PNG／GIF图片色板真实旧版解码对照（2026-11-08）

接续2e4ec283，新增独立Cargo执行原始ordered_image_colors／png_imported_colors／image_imported_colors，使用旧版png0.18.1及image0.25.10和既有离线源。113组实际结果覆盖PNG颜色类型／位深在严格.png与通用猜测路径的差异、五种滤波、RGB tRNS／索引alpha，GIF首帧偏移／裁剪／局部色表／透明RGB，代表文件截断及IDAT后chunk／CRC边界。保留既有JPEG／ICO／WebP与大图／色数测试。

case19发现通用16位PNG的WIC8位转换与旧image取整差1：对16Gray／48RGB／64RGBA先转64RGBA，再显式执行旧版FromPrimitive<u16>的(c+128)/257。严格.png的16位拒绝保持。新增尾部矩阵发现png::next_frame会读取完整IDAT及CRC与后续8字节chunk头，但不读取后续体／CRC；现strictPng按此边界校验，不要求完整IEND，也不笼统接受任意截断。113对照已通过，不外推所有codec等价或整个领域完成。16位路径同样采用约64KiB（至少一整行）的批次，避免完整RGBA分配及逐行COM调用；另增17×1025的16位跨批次回归，覆盖取整边界／alpha／顺序。验证：palette-image-compat-final-build.log正式Release及图片／导入目标构建退出0；palette-image-compat-band-build.log跨批次测试重建退出0；首次新增用例手写预期将385/257误算为2，修正为1后，palette-image-compat-final-tests.log图片对照及既有格式／大图用例、palette-image-compat-final-import-tests.log完整导入测试均退出0；正式--palette-import-check退出0。fixture重复生成SHA256一致，来源636文件覆盖通过，strict按既有缺口退出1，diff通过。未进行人工界面验收或整体帧率／峰值内存测量，也未宣称所有codec行为等价，全量迁移仍INCOMPLETE。

### 主页画廊完整操作链与视口资源（2026-11-08）

接续3f41cc4a，定位禁用画廊页签；直接承接platform_gallery.rs的list_projects_in_directory／ensure_builtin_example／delete_gallery_project及HomeWorkspace的loadSection／pinProject／deleteGalleryProject。画廊只扫描程序目录gallery的直接子文件，大小写不敏感.moonsprite，修改时间降序及名称并列排序；置顶与最近文件独立，无24条截断。目录打开、单击打开／中键后台打开、三种密度和预览复用现有路径。原始示例工程由CMake精确复制，启动后后台安装并加载；自动检查入口跳过真实目录安装，显式测试只用owned目录；版本3保留已修改示例，deleted标记保留用户删除决定。Native独立设置，不读取或覆盖legacy标记；沿legacy启动ensureBuiltinExample，但后台执行，结果回UI时仅在最近记录缺失时新增并置顶；画廊与最近／恢复各自持有列表，切换栏目不取消启动安装，后台结果不替换其它栏目的数据。

原列表为所有记录创建子控件；画廊无24条上限，现改共享列表为视口行池和可见预览请求，滚动条仍按完整数据计高，控件回调通过池索引映射实际记录。目录扫描为单worker合并请求，刷新／删除递增代际，过期结果不落UI；离开栏目只停止可见预览，保留已发起的目录任务及启动示例安装，结果只更新画廊缓存与独立最近记录；不在主线程解码整目录或等待扫描完成。删除复用公共确认框，补通用标题／详情参数和详情换行；取消／Escape／关闭不删，确认后真实remove_file适配，锁住失败保留文件和元数据；成功才清除最近与画廊置顶，示例删除写deleted。测试只删除自建owned工程。

范围：本阶段承接内置画廊操作链；自定义文件夹栏目管理器、主页格式过滤、banner动态工程查找和全部格式预览等价仍未闭环，不以本批证明完整主页或全量迁移完成。

验证：gallery-lifecycle-final-build.log唯一正式Release构建退出0；gallery-final-ui-tests.log中的--gallery-check、--recent-projects-check、--brush-library-panel-check、--home-announcements-check均退出0。gallery-core-tests.log文件系统／示例版本及删除标记／独立置顶／真实Windows锁定删除失败／扫描代际测试通过，gallery-recent-tests.log既有最近工程测试通过。gallery-legacy-tests.log直接编译执行未改写的旧版Rust目录函数，160个文件的扩展名、即时目录及时间／名称排序与原生逐项一致；无符号链接创建权限，该分支未验收。初次核心测试窄字符main未接收Unicode参数，改为wmain后通过，此为测试入口修正。界面自动检查覆盖预览、打开、文件夹入口、置顶持久化、取消／Escape／确认删除、示例删除后不重装，以及一万条内存记录滚到第5000条时少于128组控件且回调映射正确；不声称创建或解码一万个实际工程。实际gallery-smoke.bmp及删除确认截图已查看，默认2倍下文字、警告换行和素材无重叠；截图检查不等于人工交互验收。来源640文件覆盖通过，strict按已知缺口退出1，diff检查通过；未测整体帧率、进程峰值内存或长期桌面交互。全量迁移INCOMPLETE。

### 主页自定义目录栏目与管理链（2026-11-08）

接续046f0f88，直接对照home-sections.ts、home-file-display.ts、HomeSectionManagerDialog.tsx及HomeWorkspace的addHomeFolderSection／removeHomeFolderSection／selectSection／loadSection，承接目录去重、独立栏目身份、移除后邻近选择、内置栏目保留、拖动排序、六组格式即时筛选、空筛选、栏目及选择持久化。原生独立设置不读写旧版localStorage，目录选择适配Windows系统选择器；移除只修改栏目记录，不删除任何作品。目录只列直接子文件、十类扩展，时间及完整文件名排序，共用独立画廊置顶、既有后台扫描与可见卡片预览。错误与过期代际独立于启动示例安装，目录不能调用画廊删除入口。管理器复用PixelDialog及原图标，目录路径显示在名称下；拖动排序内存立即更新，原生三份设置磁盘写入合并为180ms一次并在关闭时补写，避免每个指针事件同步原子写。主页隐藏时立即停预览并跳过完整列表复制／筛选，避免在绘画刷新中反复处理已隐藏的大目录。溢出栏目收入更多并保持活动栏目可见。

实际旧版纯函数生成495组归一化／排序载荷和15组格式×64种选择掩码；首次对照case330发现İ小写展开差异，最终复用原生已有系统ICU的root小写转换，增加希腊词尾Sigma和补充平面字母，避免手写局部Unicode例外。备份扩展名长度手写错误同样由真实格式对照发现并修正。Rust直接目录枚举对照复用既有脚本增加folder模式。新增系统ICU静态导入曾与Skia内置u_strToLower冲突；最终沿既有pixel_text_area.cpp方式从系统目录加载函数，动态核心构建与495组载荷、960种格式掩码、画廊核心均通过，见home-sections-dynamic-core-build.log／home-sections-core-tests.log／home-sections-gallery-core-tests.log。首次并行测试目标与原构建争用obj，后续改串行，未删除缓存绕过。最终验证：home-sections-formal-build.log正式Release构建通过；隐藏主页提前退出的单文件补充构建home-sections-hidden-home-build.log通过。home-sections-final-ui-tests.log的--home-sections-check、--gallery-check、--recent-projects-check、--home-announcements-check、--brush-library-panel-check均退出0。新界面检查使用独立owned目录，覆盖实际项目及PNG枚举、目录工具回调、空格式／工程过滤、重复目录选择、共享置顶、真实打开、活动栏目可见、管理器选择／拖动回调／格式开关、关闭后顺序持久化、移除入口保留项目与PNG、缺失目录错误；不自动操作人工系统目录选择器。home-folder-legacy-tests.log和home-sections-gallery-legacy-tests.log各160文件实际Rust目录函数对照通过；符号链接创建不可用，未验收。夹具重复生成哈希一致。实际home-sections-dialog.bmp默认2倍截图已查看，名称／路径／拖动柄／锁定和删除／格式与按钮无重叠；未执行人工拖动、系统目录选择器、1倍布局或长期帧率验收，不用自动回调测试证明全部桌面交互完成。来源646文件覆盖通过，strict因已有全量缺口退出1，diff检查通过。banner动态工程查找、全部格式预览等价及其它领域仍未闭环，全量迁移INCOMPLETE。
### 主页横幅作品完整操作链（2026-11-08）

接续f2ef9955，直接承接home-banner.ts及HomeWorkspace：七条原始元数据、会话内复制洗牌、画廊basename/扩展名/Unicode小写匹配、重复名称首条、画廊不可用保留六幅内置图、后台工程预览、作品打开、原始作者URL、8秒轮播与悬停分页。图片通过既有后台加载弹窗生成独立文档，不附源路径或写入最近资源；工程复用正常打开。作者由Windows Shell适配，失败保留提示；测试注入launcher，不自动打开外部网站。使用原始PNG与缺省图片图标，原生独立按钮保留Tab/Enter/Space，laf先命中首个子控件，作者/分页置于作品按钮之前，真实pick验证覆盖层；无配对释放、拖出取消不会打开。标题/作者/分页透明度及悬停渐变承接，CSS过渡缓动未复现，未声称完整CSS等价。

后台扫描复用单worker合并请求，预览复用三worker队列，只使横幅失效，隐藏时停止定时器；相同分页悬停不重复布局重绘。原始大厅1072×160暴露原生1024准入残留，文档构造/fromImage、工程编码及重开准入统一为每边32768且总计64Mi像素/256MiB，保留既有资源预算。其它操作专属1024限制仍是明确迁移缺口，本批不声称大画布全操作闭环。六张原图均不透明，逐像素/原尺寸打开→保存→真实读取重开通过；1072边缘绘画撤销重做及超预算拒绝通过。

验证：直接执行未改写旧版函数生成49组解析和40组洗牌结果，全字段对照通过，重复生成SHA256一致；home-banner-core-tests.log、home-banner-document-tests.log、home-banner-project-tests.log退出0。唯一正式Release构建home-banner-build/final-build/save-build/settled-build/error-build.log通过。首次运行在大厅保存暴露project_encode残留限制，修正后六图保存重开通过；轮播测试需等重挂载扫描落地，增加代际完成等待；缺失图的filesystem_error本地编码导致UTF8转换异常，增加稳定中文提示及Windows错误码回退后通过。home-banner-final-ui-tests.log的--home-banner-check、--home-sections-check、--gallery-check、--recent-projects-check、--home-announcements-check全部退出0。横幅检查覆盖作者精确URL及失败、动态工程预览与打开、独立图片文档/最近记录不变、按钮实际命中与消息、轮播边界、缺失图保持当前作品。默认2倍home-banner-smoke.bmp已查看，作品/标题/作者/分页无重叠；非人工桌面交互、外部浏览器、长期帧率或峰值内存验收。来源652文件覆盖通过，strict因既有缺口退出1。全量迁移仍INCOMPLETE。

### 主页缩略图解码、缓存与后台队列实证（2026-11-08）

接续73f58df5，现有recent-preview-test仅构造模型，不能证明真实解码。新增生成器直接执行未改写legacy raster-image.ts的createRasterImagePreview，在本机Chromium157中运行121组输入，83接受：PNG颜色类型/位深/五种滤波/透明RGB、GIF首帧偏移与越界裁剪、截断/CRC、512边界及1072横幅；核对准入、原尺寸、预览尺寸与完整RGBA哈希，重复生成SHA256一致。对照发现GPU与CPU浏览器drawImage在极窄图选择不同相邻像素，固定--disable-gpu对应原生CPU路径；不宣称GPU像素等价。生成器不下载浏览器，使用已安装Chrome或Edge；缓存及生成数据留owned目录。

原生复用已有BSD许可Skia静态库解码GIF/WebP/JPEG/BMP及16位PNG，8位/索引PNG复用WIC保留Skia旧版本未承接的索引alpha；PNG校验IDAT及其之前CRC，要求下一8字节头，忽略其后载荷并补规范IEND，以实际浏览器截断/尾CRC行为为准。CPU像素路径一次整数预乘、Skia最近邻缩放和readPixels，最近邻边界用朝1的相邻浮点值承接旧软件canvas，1072×160→512×76的边界行由case120验证。SkData引用当前函数存活的字节，移除解码输入完整复制；不引入WebView或新codec依赖。磁盘缓存升级v2，旧算法缓存按需重建，不批量删除；既有后台三worker、串行fallback、24项/32MiB LRU语义保留。

新增真实文件测试：冷/热缓存像素一致、损坏PNG/旧版本重建、源大小与时间失效、缓存目录为文件的写失败不隐藏有效预览、取消拒绝；工程内置preview与缺失preview完整fallback，ASE/ASEPRITE、既有PSD merged fixture、BMP/JPEG/WebP实际入口；队列三worker上限、24项LRU命中、32MiB字节淘汰、取消代际只发布当前结果。首次大fixture静态初始化造成测试栈溢出，测试PE栈调整8MiB；实际产品栈未改。完整格式色彩配置/EXIF方向/所有畸形codec、非RGBA无preview工程以及GPU采样尚未逐项验收，不能标记全部预览格式等价。16Mi像素解码预算仍是原生限制。

验证：recent-preview-oracle.log及-repeat.log生成121组，recent-preview-full-tests.log真实浏览器矩阵和上述文件/队列均退出0；recent-preview-final-build.log唯一正式Release和测试构建退出0。recent-preview-final-ui-tests.log中--recent-projects-check、--gallery-check、--home-sections-check、--home-banner-check均退出0。本批无UI布局改动，不以回调/消息检查声明人工交互或长期帧率/内存峰值验收。来源654文件覆盖通过，strict因已知全量缺口退出1，diff检查通过；全量迁移仍INCOMPLETE。

### 缩略图缓存锁范围、取消与备份分派（2026-11-08）

接续b0e0ab1e，对照platform_files.rs::read_project_preview与document-files.ts::isMoonSpriteProjectPath。磁盘缓存原先持有全局锁进行完整图片解码，使三worker在热缓存路径串行；现锁仅保护元数据及PNG配对读取，解码在锁外进行。缓存读写的可选IO异常处理不再吞掉取消；热命中与最终返回前复核源大小及修改时间，避免读取中源变化仍发布旧图。大小写不敏感.moonsprite.bak复用工程预览及无preview完整读取；目录扫描和最近记录仍承接旧版排除备份的规则，没有扩大列表准入。

新增真实文件回归覆盖备份内置/缺失preview的冷/热路径、缓存读取及写入阶段取消、热命中期间源时间改变。65536组alpha/通道组合反复热读取未观察到像素漂移，故保留已有颜色转换，没有把怀疑记为已证实缺陷。已有121组真实旧版浏览器结果及队列/LRU等继续通过。preview-cache-lifecycle-build.log正式Release构建退出0；补充最后取消用例后的preview-cache-lifecycle-final-build.log及-final-tests.log退出0。preview-cache-lifecycle-ui-tests.log四项--recent-projects-check/--gallery-check/--home-sections-check/--home-banner-check全部退出0。来源654文件覆盖通过，strict仍因已知迁移缺口退出1，diff通过。本批未改变UI布局，未测整体帧率或线程吞吐增幅，不声称全部性能问题解决；全量迁移仍INCOMPLETE。
### 主页恢复卡片、来源会话与丢弃完整操作链（2026-11-08）

接续71094b34，按HomeWorkspace::RecoveryFileRow及workspace-commands-recovery/recovery-service/workspace-close-coordinator承接恢复列表。复用RecentProjectsPane视口行池、三worker预览、24项/32MiB缓存与原始delete素材，固定单列90px显示名称、尺寸/模式或失败说明、保存时间、剩余保留期；不提供置顶、重排或中键打开，恢复预览身份包含完整id/updatedAt，不写磁盘缓存。恢复发现移出UI线程，加载中/失败/空列表独立显示；恢复读取复用已有DocumentLoadingDialog后台任务和关闭保护，完整像素/资源导入沿原有工程路径，不另建近似codec。旧数字时间秒/毫秒/微秒/纳秒阈值使用未改写HomeWorkspace函数生成539组真实结果，含ISO日期/时区及三种保留期，重复生成header哈希一致。任意JS Date.parse日期语法及全部本地化格式未声称等价。

来源ID随RecoverySession保存/切换：恢复产生无来源路径的dirty文档，自动保存复用来源ID，关闭恢复标签保留来源，精确保存成功清理来源。丢弃先抑制关联会话自动恢复，后台等待已发出写入后删除，失败保留记录/文件并可重试，成功清来源但不改当前画面/dirty。多会话连续恢复共用ID的写入与删除沿旧RecoveryService串行边界，在原生文件层互斥，避免同进程临时文件名冲突。原生已有payload先于sidecar且删除失败报错的修复保留（基线FS-006/R03、GAP-014已要求失败不可假移除）；未复刻旧平台吞错。旧版列举自动清过期文件与仓库删除用户恢复数据须先确认的规则冲突，本批不启用自动清理，文案仅说保留期，不承诺自动删除。两文件跨进程原子提交/孤儿扫描仍是明确缺口，恢复全领域仍不完整。

验证：home-recovery-final-build.log唯一正式Release、editor-recovery/recovery-display/recent-preview目标退出0；home-recovery-final-core-tests.log包含八个真实并发写同一ID、来源复用/抑制及既有稀疏资源回归退出0；home-recovery-display-tests.log539组时间/天数退出0，home-recovery-final-preview-tests.log121真实浏览器矩阵及缓存/队列退出0。home-recovery-final-ui-tests.log的--home-recovery-check、--recent-projects-check、--gallery-check、--home-sections-check、--home-banner-check全部退出0；恢复检查覆盖损坏读取、实际预览上传/打开、原ID自动保存、Windows真实锁定删除失败/重试、丢弃保持活文档且不复活、成功保存清理、关闭保留来源、10000条虚拟记录控件池少于128。home-recovery-scroll-build.log补充单文件正式构建退出0，-scroll-ui-tests.log真实滚动条按下/拖动/释放退出0；不是创建/解码一万个工程。额外--panel-scroll-check在调色盘Space pan not captured失败，未到恢复列表，不宣称该检查通过；保留native-panel-scroll-error.txt诊断。首次编译期间继续修改共享头造成ABI布局不一致，首次UI访问异常；稳定源码完整重编译后通过，不能使用首次产物。随后并发测试缺project_encode.h导致测试构建失败，补包含后最终全目标通过。

默认2倍home-recovery-smoke.bmp已查看，四行文字、预览和删除按钮无重叠。无1倍实机/人工长期交互或整体帧率验收；来源659文件覆盖通过，strict按既有全量缺口退出1，diff通过。本批只删除测试自建owned恢复文件，没有清理用户数据。全量迁移仍INCOMPLETE。
### 调色盘与时间轴面板平移闭环（2026-11-08）

接续aeb6a7f6，对照实际useSpaceDragScroll.ts/test.ts及PalettePanel的滚动入口。原生调色盘适配此前固定横向位置/上限为0，并用旧色块公式估算纵向范围，未承接自定义网格的横向溢出。现读取既有PixelScrollBar配置后的内容尺寸和实际视口，两轴位置统一交给已有SpaceDragScroll，保留位置未变立即返回、只更新调色盘布局及内容失效区域。拖动仍沿旧版缓存最大范围，已有onResize在布局后刷新缓存；没有为每个移动事件重新计算全部滚动几何。核对本地Aseprite的MIT许可ui/scroll_bar.h::size、ui/view.cpp::setScrollableSize/onSetViewScroll，沿用既有滚动条/视口范围和无变化早返回，没有复制新模块或新增依赖。

修复此前失败检查的真实前提：--panel-scroll-check原来未挂入桌面，Aseprite Widget::isVisible要求完整可见父级链及manager，因而即便内容高1068而视口仅204，仍报告滚动条不可见。测试现先挂载可见桌面，明确使用内置32色色板、自适应模式与已打开栏目；手动32列网格验证横向溢出。另将停靠测试陈旧的合并后7组断言改为columnCount-1，并为失败断言报告行号；没有改变产品栏目数量。

验证：初次panel-pan-build.log构建退出0，但面板与停靠检查退出1；panel-pan-final-build.log构建退出0，停靠修正通过，面板诊断确认未挂载导致visibility为0。最终panel-pan-mounted-build.log唯一正式Release及panel-docking-tests构建退出0；panel-pan-ui-tests.log的--panel-scroll-check、--palette-manual-check、panel-docking-tests均退出0。实际编辑器消息覆盖时间轴中键双轴像素偏移、调色盘Space左键纵向、松Space继续拖动、自定义网格中键横向/极限钳制、拖动中窗口resize后边界更新、失焦释放保留偏移、无溢出不捕获，以及revision/撤销位置不变；纯状态机1000次move不重复测量的原有回归继续通过。来源659文件覆盖通过，strict因既有全量迁移缺口仍退出1。未改变视觉布局，未做新截图、人工长期拖动或整体FPS/吞吐测量；结论限于面板平移范围和输入生命周期，不声称全部性能问题已解决。用户文件/缓存/恢复数据未清理，全量迁移仍INCOMPLETE。


### 恢复孤儿工程发现、打开与丢弃（2026-11-08）

接续ec7bf972，按FS-006/R05及GAP-015补齐payload已落盘、描述尚未提交后的发现链。实际platform_recovery.rs先atomic_write工程再写JSON，旧list_recoveries仅扫描JSON；原生此前同样漏掉孤儿。现先保留有效同ID描述，再把没有有效描述的直接普通.moonsprite文件加入列表，安全ID作临时显示名、Win32文件修改时间转毫秒；损坏／超预算／ID错配描述均不改写，临时文件、不安全名称及目录不作为工程。缺失payload但描述有效仍保留失败行。扫描不解码全部归档、不创建描述、不删除数据，沿现有后台目录扫描及按需预览／打开预算。

恢复入口在临时显示名等于ID且不存在同ID同名有效描述时，保留归档作品名；有效描述同名仍按旧规则优先。实际打开沿原有DocumentLoadingDialog/prepareEditableImport，无来源路径、dirty及来源ID继续沿既有会话语义；孤儿同样支持放弃，删除不改活文档。未引入新的恢复归档格式、外部目录或自动清理。跨进程两文件原子提交、强杀／断电、未提交tmp恢复及旧描述对应新payload的身份一致性仍是剩余缺口，GAP-015仅部分收敛。

验证：editor-recovery-tests用本次owned目录覆盖缺失／损坏／错配／正常描述、仅描述行、损坏工程、不安全名／tmp／目录过滤，逐字节核对原文件不变，缺失描述不补写；正常解码孤儿并重试写入及丢弃。用目标JSON为目录触发真实第二阶段替换失败，断言已Flush的payload完整且可发现，不冒称真实进程崩溃注入。正式--home-recovery-check新增主页发现→实际打开→原作品名／像素／dirty／无路径／来源ID→丢弃保留活画面。recovery-orphan-build.log正式程序构建成功、测试因read辅助lambda重名编译失败；改名后recovery-orphan-final-build.log全部退出0，核心／UI检查通过；补原名保存后recovery-orphan-name-build.log正式及测试构建退出0，recovery-orphan-final-core-tests.log及-final-ui-tests.log均退出0。来源659覆盖通过，strict仍因已知迁移缺口退出1，diff通过。UI布局未改，本批无新截图或人工验收，不声称全量恢复及全量迁移完成。


### 恢复目录跨进程串行与写入失败重试（2026-11-08）

接续58386d95，对照RecoveryService::enqueue的串行边界，以及platform_recovery::write_recovery与platform_storage::temporary_suffix/atomic_write。原生之前仅有同进程全局mutex，两个进程可在payload与sidecar间交叉提交；PID-only临时名还可能被旧崩溃文件占住。现按目录的Windows卷序列号/文件索引建立Local命名mutex，同Windows会话的新版进程对同目录write/remove/list串行，目录别名使用同一身份，不同目录不互相等待。不创建锁文件；最多等待30秒并明确失败，正常路径由既有后台worker调用。持锁进程退出后的WAIT_ABANDONED按当前磁盘重新处理，沿已完成孤儿发现保留有效payload，不宣称两文件跨崩溃原子性。

临时文件改为PID+tick+原子序号、CREATE_NEW独占，分1MiB块写入并FlushFileBuffers后原子替换；只删除本次创建且失败的私有临时文件。旧PID-only残留保持原字节且不阻塞新写入。元数据读取按已观察且不超过1MiB的尺寸分配，读取失败或长度变化拒绝，避免文件增长时istream迭代器无界收集。删除失败反馈及源会话抑制规则不变；此锁不授权删除数据，不阻止另一进程日后主动发起新的自动保存。

验证：recovery-concurrency-build.log及-final-build.log正式Release/editor-recovery-tests全部构建退出0；recovery-concurrency-core-tests.log与-final-core-tests.log退出0。真实CreateProcess测试逐项持有生产同名锁，独立子进程write/remove/list在./目录别名上等待、释放后成功；独立目录写入无需等待，持锁子进程ExitProcess后正常写入接管；四进程各八次竞争同ID，最终256KiB每个字节与对应metadata.name一致。真实Windows共享占用导致payload替换失败，旧描述/字节保持，释放后重试成功；遗留旧临时文件字节保持，失败私有临时文件无残留。原有八并发线程、孤儿第二阶段失败、稀疏像素/链接、源会话与抑制回归继续通过。recovery-concurrency-ui-tests.log正式--home-recovery-check退出0。来源659文件覆盖通过，strict因已知全量缺口退出1，diff通过。

本批无UI布局改变，无新截图/人工验收；未执行30秒超时注入、跨Windows会话/旧版本程序协作、网络文件系统、硬件断电或两文件中间强杀，不能把32次正常竞争提交称为崩溃原子事务。GAP-015的完整成对提交/临时文件恢复仍未关闭，全量迁移仍INCOMPLETE；用户工程、恢复及缓存未清理。


### 恢复中断提交描述与重复退出重放（2026-11-08）

接续e157725b，按FS-006/R05与GAP-015解决payload已提交而JSON仍旧时的新旧名称/时间错配。旧platform_recovery明确分两次atomic_write，RecoveryService按描述名称恢复；原生用必要的文件事务适配补充<safe-id>.recovery-pending，不修改原.moonsprite/.json格式和入口。描述最多1MiB+20，固定MSREC01版本头、8字节payload长度、4字节CRC32及原RecoveryRecord JSON；先原子写描述、再payload、再正式JSON，成功后删除本次同ID描述。CRC32仅匹配意外损坏，不是身份认证或密码学完整性。发现时在既有目录进程锁内，用64KiB缓冲核对已提交payload长度/CRC，再采用新描述；不匹配或损坏描述保持原样，正常已完成记录不额外哈希归档。只描述无已提交payload不会凭空创建可打开行，旧payload存在时继续可恢复。

连续中断需要额外顺序：开始下一次写入前，先把上一份与payload匹配的待提交描述落入正式JSON，然后才替换待提交描述，否则第二次在新payload前退出会退回更旧名称。恢复入口复用私有recovery_commit.h校验读者，处理名称恰等于safe-id但实际有权威待提交描述的分支；保留既有孤儿原作品名回退。重试会完成事务，显式丢弃按payload→待提交描述→JSON删除，仍反馈失败。未在扫描时补写/删除文件；没有自动清理用户数据或引入WebView/新codec。

验证：测试目标直接编译同一recovery_store.cpp，MOONSPRITE_RECOVERY_COMMIT_TEST只在该目标启用；三处ExitProcess检查点只在测试编译存在，正式程序没有环境或运行期开关。六个真实子进程覆盖descriptor/payload/metadata三提交点×新建/覆盖，另一次连续descriptor退出；父进程检查精确归档字节、描述名称/时间、扫描不改文件、CRC不符拒绝、正常工程解码像素及重试/丢弃。正式主页另用独立位运算CRC构造描述夹具，覆盖旧JSON+权威pending name==ID、实际恢复像素/名称/来源ID、后续自动保存补齐并清描述、丢弃保留活画面。原32次四进程竞争、弃锁、Windows真实文件占用失败/重试及稀疏历史回归继续通过。

recovery-commit-build.log正式程序构建成功、测试因直接编译store缺zlib头失败；显式链接已有zlibstatic后-final-build.log退出0，core-tests.log退出0。增加重复退出重放后recovery-commit-replay-build.log/-core-tests.log退出0；补主页独立描述夹具及复用已编码JSON后recovery-commit-ui-build.log正式/测试全构建退出0，recovery-commit-final-core-tests.log与-final-ui-tests.log退出0。来源660文件覆盖通过，strict因已知迁移缺口退出1，diff通过。无UI布局改动，无新截图或人工验收；硬件断电、提交前完整/半写临时工程恢复、跨会话及旧二进制协作仍未完成，GAP-015保持部分完成，全量迁移仍INCOMPLETE。


### 未提交完整临时工程的发现、预览、恢复与处置（2026-11-08）

接续882b3085，按FS-006/R05/GAP-015延伸原生已登记的待提交描述，不修改legacy归档/JSON格式。此前进程在完整payload临时文件Flush并关闭后、MoveFileEx前退出时，列表仍只能看到旧payload或空目录。本批复用同一只读选择器：优先选择与描述匹配的正式payload，否则仅接受<safe-id>.moonsprite.PID.tick.sequence.tmp形式且长度与完整CRC32匹配的普通文件。描述只解析一次，目录发现一次分组候选，64KiB缓冲校验；半写、CRC不符、其它ID、非数字/旧PID-only命名不采用，不猜测删除。扫描不改名/覆盖/补写。CRC仍仅用于意外损坏匹配，不作为安全认证。

恢复列表/菜单/控件仍持有稳定逻辑<id>.moonsprite路径和既有回调，后台工程预览与恢复加载才解析实际源文件。预览按逻辑扩展名选工程解码，避免实际.tmp被当成普通图片；尺寸/时间变动检查针对实际源，恢复预览仍不写磁盘缓存。重试写入先把已校验临时副本转为正式payload，再提交其描述，随后才开始新事务，确保下一次早退不让唯一副本失去描述。显式丢弃先处理同ID且完整匹配的临时副本，任何占用失败反馈且保留描述/可恢复副本；不匹配与不完整残留保持原字节。不是通用清理缓存或删除用户数据的授权。

新增真实测试构建检查点仅在editor-recovery-tests：写满首个1MiB但未写完，以及payload Flush/关闭后Move前ExitProcess；768×512随机RGBA实际归档超过1MiB，四个退出覆盖两位置×新建/覆盖，另一次重试在descriptor阶段退出。检查源/描述逐字节不变、旧正式工程保留、完整temp真实工程解码/预览RGBA与独立正式文件一致、半写不采用、Windows锁定temp导致写入/删除失败后仍可恢复、重试保住前次temp、显式丢弃保留无关/旧PID-only/其它ID/CRC不符文件。既有七次提交中断、32次四进程竞争及稀疏历史/来源回归继续通过。主页独立描述夹具改为只有完整temp，核对实际上传图像（hasPreview表示已创建RGBA surface）、恢复像素/名称/来源ID、后续自动保存转正并清描述、丢弃后活文档像素不变。

验证：recovery-temp-build.log正式Release/editor-recovery/recent-preview目标构建退出0，recovery-temp-core-tests.log退出0；补主页测试时recovery-temp-ui-build.log因误把smokePreview的bool当对象编译失败，修正后recovery-temp-final-build.log全目标退出0。recovery-temp-final-core-tests.log退出0；预览测试首次以相对owned根调用被拒绝，改绝对路径后recovery-temp-preview-tests.log的121真实浏览器样本、缓存/格式/取消/三worker/LRU全部退出0；recovery-temp-ui-tests.log正式--home-recovery-check退出0。来源660覆盖通过，strict按其余既有缺口退出1，diff通过。无UI布局变更，无新截图/人工验收；未验证硬件断电、无描述的旧临时文件、跨会话/旧程序协作及所有文件系统，GAP-015不因这些进程退出测试标为完全关闭，全量迁移仍INCOMPLETE。

### 原生异步保存代际、元数据与关闭续接（2026-11-08）

接续01b5b7e3，按FS-003及GAP-016核对document-file-service::saveMetadata/savedGenerations、document-save-queue六项原测试和workspace-commands-document-io的fullySaved/恢复清理。原生此前对异步保存期间的新修订直接抛错，即使文件已成功提交，也中断排队保存与关闭续接。本批让成功的旧修订写出接纳磁盘归档/工程ID和目标路径，但保留活文档像素、历史、修订及dirty；仅精确代际可清dirty/合并普通保存/移除来源恢复。SaveAs继续独立排队，关闭前有更新继续排队保存后才关闭。写入失败仍不接纳基线/清理恢复并保留重试。

对称中心提交原先仅设置dirty/统计、不增加revision，恢复调度可能把新元数据当成已写修订。本批推进revision但不产生像素revision/历史；异步保存完成额外核对未提交的对称中心预览。DocumentSnapshot::finish改用已有setImportedSymmetryCenter，保留工程中合法有限小数/画布外坐标，避免按鼠标拖动规则半像素量化/钳制。

新增独立--native-save-check沿正式Editor/snapshot/encoder/原子写出/导入链，测试仅延迟UI确认、不替换worker/编码器/写入器，覆盖旧/新代际、八类元数据和统计、恢复保留/精确清理、分数坐标、预览竞争、排队SaveAs、失败重试及关闭续接。既有保存期间全局输入抑制保持，未把后台直接修改回归称为用户可在保存时交互编辑；FS-003交互并发和全部元数据矩阵仍未完整关闭。旧版元数据最终fullySaved核对不足作为GAP-016保留，不复制潜在假清dirty缺陷。无UI布局改动，不声称整体性能或人工视觉验收通过。

本批核对范围：对称中心、像素网格、自定义网格、动画循环、色卡名称、录像配置、参考图资源和切片均以生产Document修改入口推进revision；统计随原操作捕获，不由保存新增操作/绘画计数。普通内容、图层/帧/蒙版/资源结构继续沿既有历史/修订边界；导入专用setter只用于建立候选/后台副本，不作为用户编辑入口；名称、路径和新会话身份/全部扩展API元数据不是本批并发矩阵覆盖声明。未额外编码整个工程做UI线程相等比较，也没有复制第二份像素快照用于完成判定。

验证：native-save-legacy-queue-tests.log运行未修改旧版生产模块，6项原保存队列测试通过。native-save-generation-build.log首次因RecoverySession{}聚合初始化碰到explicit Scheduler构造失败；仅修改已结束编译的新测试文件为默认构造后move，并补全关闭续接等待，native-save-generation-final-build.log正式Release、document-snapshot/project-save/editor-recovery目标全构建退出0。snapshot-tests.log、project-tests.log退出0，包含旧保存基线/预览/撤销重做/失败校验与原有完整工程往返；ui-tests.log正式--native-save-check退出0，实际result.txt确认全链执行。existing-ui-tests.log的--aseprite-save-check与--home-recovery-check均退出0。核心恢复补对称中心先写后仅改元数据的两次真实归档，保留有限小数/画布外原坐标并确认不会被revision去重漏掉。

第一次恢复检查在32次四进程矩阵的子进程退出码断言失败；原断言未记录实际退出码/子进程错误，首次原因尚未证实，不归因为目录形式、编译或应用修复。保留原测试目录/日志，增加子进程PID/实际退出码及owned目录内最佳努力错误文件后，recovery-diagnostic-build.log退出0；recovery-diagnostic-tests.log新绝对owned根及recovery-original-conditions.log原工作目录/相对参数/TMP条件均退出0，完整跨进程/中断/稀疏恢复及新增元数据回归通过。此未复现故障仍是待观察证据，不把两次通过当成根因闭环。未新增盲目重试、放宽断言或删除失败证据。

来源661文件覆盖通过，strict因其余全量缺口仍退出1；差异检查通过。本批没有UI布局变更、截图或人工长时间交互验收，亦不声称全部文件/恢复或迁移完成。所有上述日志前缀均为native/build/native-save-generation-，旧版队列日志为native/build/native-save-legacy-queue-tests.log；用户工程、恢复、缓存及原有未跟踪诊断保持。


### 2026-11-08 图层面板持久状态读写链路（已接入，稳定性待继续核对）

接续e56456b7，核对legacy/core/layer-panel-state.ts、project-format-decode及workspace-session。此前manifest虽将layerPanelState列为已识别字段，原生并未解析或应用；保存复用归档时还会留下旧值。本批承接activeLayerId、selectedLayerIds、selectedGroupIds、selectedGroupId、layerSelectionAnchorId及collapsedGroupIds六字段，过滤无效/重复ID并保留顺序、显式空组焦点和未选中但有效的锚点。规范化按legacy自底向上图层顺序执行，原生Document捕获时明确反转内部自顶向下顺序。组焦点不从选择数量重新猜测。

数据经过manifest→PreparedImport→Document→后台DocumentSnapshot→工程/恢复/历史归档编码，写出实时规范化状态以替代源归档旧字段。快照及异步保存完成核对包含没有内容revision的面板变化；导航本身不改变dirty、内容修订或撤销历史。原有历史差量/成本适配器继续读取历史归档字段，不用实时UI状态替代历史基线。

本地按filePath优先、sourceFilePath回退；以trim、斜杠统一、en-US Unicode小写匹配路径，替换同路径条目并最多保留100项，打开时优先于归档状态。ICU大小写复用既有本地历史适配方式；native独立layer-panel-state-v1.json不读写legacy浏览器设置。仅状态/路径变化才记录，磁盘写复用既有LatestTaskQueue及原子写出，A/B/A保留最后一次，切项目/关闭处理最终记录。读取/写出错误进入状态栏。未改布局，未新增WebView，未清理用户文件。

新增真实legacy函数执行器及定向回归；具体验证结果待本轮构建/运行后补全。保存提示关闭后继续编辑仍需多文档后台保存路由，未实现；全部迁移目标仍INCOMPLETE，不以本批通过关闭FS-003、GAP-015/016及全局缺口。

验证：layer-panel-state-error-path-build及queue-trace-build正式Release/新增测试构建退出0；最终CTest两个用例通过，160规范化/108写入/6查询包含Unicode扩展小写及trim。document-snapshot/project-save定向套件通过。正式--native-save-check初版通过；加入坏JSON用例后暴露WinRT异常未转std异常，已修正并由同一用例通过。测试入口从窄argv改wmain修复中文绝对路径。第一次链接系统ICU与Skia静态符号冲突，改显式加载系统icu.dll接口后通过。另一次正式检查在A/B/A重载断言失败，保留38036-105674921夹具；加入纯内存状态trace后通过，各步及磁盘重载均为最终A，但单次失败根因未证实，不能称已修复。后续需关注异步本地写入稳定性。来源666覆盖通过、strict仍1。未进行截图/人工交互验收。


### 2026-11-08 用户确认的色板长名称修复（已通过定向验证）

用户明确选择“采用可重开的长名称修复”。legacy/platform_palette.rs的palette_slug不限制长度，save_palette先写出再read_palette，后者因valid_palette_id的96字符上限而拒绝；原生此前固定截86字符也提前改变87..96字符身份。本批显示名称保留既有trim后的完整值，新ID首选完整slug的前96字符，重名时按实际“-数字”长度动态缩短基部，保持最终ID不超96字符。已有ID覆盖不改变身份，保留内置ID/已有路径保护、原子写出及错误报告。用户现有文件不重命名、不删除；不复刻旧版不可重开的缺陷。

定向回归覆盖86/87/95/96/97/256/2048字符名称及各12个重名，跨一/二位后缀；已有畸形文件占位验证-105三位后缀、保留原文件；另验证96字符内置ID保留、1024字符显示名称覆盖和Unicode名称保存重开。具体验证结果待构建完成补全。

验证结果：palette-long-name-build正式程序已构建，测试首次因Windows min宏编译失败；测试显式NOMINMAX后palette-long-name-final-build正式Release和palette-library-tests构建退出0，palette-long-name-tests完整既有色板库套件加上述新样例通过。最终正式程序--native-save-check、--aseprite-save-check及--home-recovery-check均退出0，日志palette-long-name-existing-ui-tests.log。正常来源覆盖666文件通过；strict按全局既有缺口退出1，差异检查通过。未做新UI布局/截图或人工长时间验收，未自动修复/重命名现有旧版不可读色板文件，全量迁移仍INCOMPLETE。上一批A/B/A单次失败继续保留待查，最终trace版本再次通过不构成其根因解释。


### 2026-11-08 本地图层状态缓存重建的写后读顺序

接续85e37d00，继续上一批持久化稳定性。legacy/core/layer-panel-state.ts使用同步localStorage读写；原生适配为异步原子文件后，缓存首次载入需要排在已有不可变写出之后。本批在loadLayerPanelState和saveLayerPanelState的PanelMemory首次读取前，等待既有ViewWrites完成；正常已载入缓存的导航仍走非阻塞去重/最新任务队列。没有通过增加盲重试、强制每次导航同步落盘或清理恢复数据处理。

正式--view-rotation-check的受控worker回归：保留旧磁盘状态，阻塞新状态写出40ms，在写出未完成时重建缓存，验证载入应用新折叠状态；第二个受控写出向存储新增background工程条目，此时新工程触发首次缓存读取及保存，最终三个工程条目全部存在，防止基于旧磁盘覆盖其他工程。沿用实际原子写出、ViewWrites及Editor入口，不替换为内存模拟文件。既有队列重复/A/B/A/双路径40次状态写入/错误报告/失败后后续任务/关闭刷新测试一并执行。

上一批--native-save-check在快速A/B/A之间逐步写trace，可能改变调度；本批移除序列中的诊断磁盘IO，全部切换、flush和reload完成后才记录预期、实际状态、写入/载入状态栏及最终磁盘内容。新发现的缓存重建顺序竞态有受控测试证据，但不能据此解释38036-105674921那次显式flush后的失败，其根因仍未证实、现场保留。

验证：panel-reload-order-build、panel-reload-complete-build及panel-reload-final-build正式Release构建退出0；首次受控载入测试通过，最终panel-reload-final-ui-tests中的--view-rotation-check与--native-save-check均退出0。最终受控夹具panel-reload-owned-ff6c410c10e54b43b5cb46bf6d5dc8bf保留于native/build。无UI布局变更、新截图或人工长时间验收；全部迁移仍INCOMPLETE，保存进度关闭后继续编辑、多文档后台保存路由及其余缺口未因此关闭。


### 2026-11-08 保存提示关闭后的多工程后台保存（本阶段验证中）

依据 legacy SaveProgressOverlay/save-progress 的关闭只隐藏提示、任务继续语义，以及 document-file-service 的按工程串行、同代普通保存合并、SaveAs独立排队和失败后重试；关闭按 workspace-commands-document-io 等待所属工程保存。原生保留现有每tick 2ms分块快照，关闭提示时若快照尚未脱离活文档则先记关闭请求、继续阻止编辑，worker接管不可变副本后才恢复交互。这是可变原生文档的必要技术适配，避免同步复制大工程或捕获期间发生数据竞争。

后台worker的结果按Document稳定identity找到当前或stored工程，分别更新磁盘基线、路径、dirty、恢复清理；精确代际才合并普通请求/清dirty，旧代际保留更新后的像素和历史。不同工程可并行保存，同工程继续排队，非活动工程的录像准备复用poll/flushReady等待，不在UI线程循环等录像worker。保存中的另存目标也保留占用，防止另一工程覆盖或重复打开；失败弹窗带源路径，保留所属恢复与重试，取消关闭续接。异步结果只在无其它模态、预览或捕获手势的边界发布。

关闭工程等待自己的后台任务及队列；干净非活动工程可移除而不切换当前工程，较新未保存修改仍进入原确认。应用关闭等待全部任务/排队保存，保存失败取消退出。新增实际Editor回归使用真实encoder/原子写出，仅以gate延迟结果确认，覆盖关闭提示、编辑/切换、倒序完成、非活动队列/SaveAs、失败/恢复/重试、关闭等待、独立工程不互相阻塞、脏确认、目标占用和分块快照关闭。没有宣称全量迁移或全部文件生命周期已完成；原A/B/A单次失败证据仍保留。

旧版document-save-queue/document-save-tasks共8项通过（background-save-legacy-queue-tasks.log）；此前误以名称过滤document-file-service的执行全部skip，不计通过。正式Release构建与新增原生场景、视觉检查结果待补全。

验证结果：background-save-build与background-save-final-build正式Release构建均退出0；新增--native-save-check退出0（38104-107857281），实际文件证明全部新场景通过，真实worker/编码器/原子文件未替换。background-save-core-tests中raster-snapshot/document-snapshot/project-save/project-save-raster-resources四项通过；background-save-existing-ui-tests中--aseprite-save-check、--home-recovery-check、--window-input-check全部退出0。

首次隐藏窗口保存的nativeSurface截图全黑，不作为视觉通过证据；为此使用可见正式程序重做同一完整--native-save-check，background-save-visible-ui退出0，夹具12664-107920875/save-progress.png已人工查看：标题、正文和共用关闭图标完整、无重叠。检查范围为此保存提示默认窗口截图，未进行所有缩放/分辨率或长时间人工绘制验收。来源覆盖666通过，strict因其它迁移缺口仍1；diff检查通过。全部迁移仍INCOMPLETE，未把既有A/B/A未明单次失败当作本批修复。


### 2026-11-08 待应用渐变的保存／导出／关闭决策（本阶段验证中）

依据 legacy/store/pending-gradient-io、pending-gradient-session、useCanvasGradientConfirmation 和实际文件命令，保存、另存为、导出、工程/应用关闭在干净文档也先显示“继续编辑／放弃渐变并继续／应用”。关闭图标和 Escape 继续编辑，应用先完成同一渐变事务再进入文件边界；无变化应用不伪造撤销条目。原生复用 PixelDialog、公共标题/正文/底部布局和既有关闭图标。菜单/快捷键不再在决策前 cancelStroke；已有 closeDocument 快捷键接入独立命令，不新增菜单项。

原生适配使用 Document identity、预览修订及已有渐变捕获的内容/图层/帧/选区/蒙版上下文验证，避免在文件入口复制大型选区。失效/替换的预览不能授权新目标；嵌套窗口期间阻止重入保存/关闭和后台确认。导出取消不修改下一导出弹窗状态。实际Editor回归覆盖各入口三选择、真实保存/重开及PNG解码、干净/已有脏修改关闭、撤销重做、无变化、替换/选区/锁定和重入；不把受控上下文失效当成真实内存分配失败验收。

旧版 pending-gradient-io.test.ts 共8项通过（pending-gradient-io-legacy.log）。原生正式构建、运行及图像验收待补全。全量迁移仍 INCOMPLETE，既有A/B/A单次失败保留，不在本批宣称修复。


本阶段验证结果：pending-gradient-io-build正式Release及project-save-tests构建退出0；首次实际Editor检查发现确认弹窗焦点转移触发通用cancelStroke，继续编辑时预览丢失，诊断夹具37772-109805031/首轮及后续cancel-state保留。pending-gradient-io-focus-build修复自有确认窗口焦点后，完整场景通过（33876-110098625，61次提示）；再对照legacy useCanvasInteractionCancel只重置活动指针、不删除已注册待确认渐变，保留释放后的待确认预览穿过菜单/窗口焦点变化，显式非IO命令和目标失效仍取消。最终pending-gradient-io-final-build退出0，实际展开文件菜单、菜单返回、默认Ctrl+S/E/W及完整回归全部通过（11280-110242546，65次提示）。三个后台保存场景证明继续编辑不会遗留保存队列、关闭续接或应用退出意图；必要原生适配是在可能等待该预览结束的后台队列之前先询问，避免互相等待。

pending-gradient-io-core-tests的project-save及project-save-raster-resources两项通过；pending-gradient-io-existing-ui-tests中正式--native-save-check、--aseprite-save-check、--gradient-shape-check和--window-input-check均退出0。实际原子保存/工程重开、PNG解码、单步撤销重做、干净/已有脏修改关闭、应用后保存再关闭、所有导出入口取消及继续已覆盖。受控上下文失效/替换不是实际内存分配失败证明；未宣称故障分配器或全部资源类型的失败恢复等价。

可见正式程序最终夹具pending-gradient.png已查看：共享标题/关闭图标、换行说明、旧版顺序的三个按钮完整，无交叠；只验收默认2×窗口截图，未做全缩放/分辨率及长时间人工操作矩阵。未更改用户数据、恢复数据、缓存或版本号。来源覆盖668通过、strict按全局已有缺口仍1，差异检查通过；全量迁移继续INCOMPLETE，原A/B/A单次失败未明现场保留。


### 2026-11-08 备份打开身份与普通保存目标保护（已通过定向验证）

对照 legacy/core/document-save-policy.ts、document-files.ts 和 store/document-file-service.ts：普通保存优先已保存路径，仅无已保存路径才考虑来源；任何 .bak 或不支持的后缀都不是直接写回目标，不因保存身份无效而退回覆盖来源。打开 .moonsprite.bak 时使用文件名去掉最后 .bak，清空已保存／来源路径，保留干净状态与原有空撤销栈；不伪造恢复事务改名。内容实际是 GIF 时仍按签名导入完整动画，再应用同一备份身份。保留 projectId 重复打开复用逻辑，并记录备份最近路径。

原生必要适配为小型共享目标策略、GIF 构造时可选名称和实际 Editor 定向回归。--backup-save-check 沿用现有正式保存生命周期入口，使用真实加载、编码、异步原子写入，只替换已有文件选择器回调。回归逐次核对原备份字节，覆盖干净取消、Ctrl+S／菜单、编辑保存、后续直接保存、另存为、失败重试、关闭前保存取消／成功、默认格式组合、无效保存身份优先级，以及 GIF 签名备份。核心 image-save-tests 增加支持后缀／大小写／空路径／全部 .bak／未知后缀／保存路径优先矩阵。不禁止底层显式备份写出，也不改备份创建机制。

旧版 document-files.test.ts 与 document-save-format.test.ts 本次 38 项通过（backup-save-legacy.log）。正式 Release 构建、实际 Editor 与核心检查待补全；全量迁移仍 INCOMPLETE，既有 A/B/A 单次失败不在本批宣称修复。


本阶段验证结果：backup-save-build.log 正式 Release 与 image-save-tests 构建退出0；核心 image-save CTest 通过（backup-save-core-tests.log），包含新增直接目标后缀／优先级矩阵及既有全部图片编码保存回读。首次 --backup-save-check 在新夹具开始打开备份时以 Windows 栈溢出码退出，现场6328-111635984保留。将新场景封装到独立 std::function 调用帧，避免与原大型通用保存套件累积栈上临时对象；未调整产品栈上限或复制新生产保存流程。backup-save-fixture-build.log 正式程序重建退出0，--backup-save-check 完整通过（11396-111754281，backup-result.txt），真实编码／原子写入／重开及原备份逐字节不变均通过，系统文件选择器通过既有回调注入，未做人工选择器操作验收。

backup-save-existing-ui-tests.log 中正式 --native-save-check、--aseprite-save-check、--pending-gradient-io-check 均退出0。未修改界面布局，未新增截图／全缩放人工验收；图像验收不借用旧截图冒充本批结果。来源覆盖669通过，strict按全局既有迁移缺口仍预期退出1；最终差异检查通过。未修改／删除用户工程、恢复文件、缓存或既有诊断，既有 A/B/A 单次失败现场继续保留，全量迁移仍 INCOMPLETE。


### 2026-11-08 已支持图片格式的大尺寸打开与保存闭环（已通过定向验证）

继承既有 Document／工程准入的每边32768、总64Mi RGBA像素边界，移除PNG/JPEG/WebP/BMP、GIF、ASE/ASEPRITE、PSD打开器残留的1024画布门禁。对照legacy document-model、png、gif-import、aseprite、psd和document-files实际创建／导入流程，不改变像素／调色板／帧／来源语义；GIF多帧展开、ASE解码累计和PSD通道累计预算保持原有256MiB约束，不把画布合法当成全部资源必可加载。按实际legacy aseprite.ts MAX_DIMENSION=16384和ag-psd的PSDv1最大30000进一步约束各自格式，不能把原生32768上限扩张成旧格式的新行为。共享unsigned除法比较避免非法维度乘法溢出。WebP先检查压缩文件长度，并直接读入SkData，避免整个压缩数据vector再MakeWithCopy的双份峰值；保留首帧、透明像素归零和实际GIF签名优先。

新增60组真实格式／尺寸输入（1025×2、3×1031、2048×16、32768×1、1×32768、16384×1、30000×1、16383×1；逐格式保留旧版上限／现有静态WebP编码器边界），覆盖九个扩展名的打开、边缘绘制／Undo／Redo、原生保存重开及源文件字节不变；另覆盖大GIF动画／签名、实际图片文件序列、尺寸和aggregate预算、畸形PNG/ASE/PSD头、空／截断WebP、稀疏超大WebP长度的分配前拒绝。核心测试单独增加测试栈以容纳独立大型Document夹具，不更改正式程序栈。--large-image-io-check以正常产品栈运行实际Editor文件加载／菜单保存／异步worker与原子文件，只注入既有选择器回调，覆盖全部九个扩展名、最大长边和坏文件保留现有作品。实际legacy TypeScript decoder/composite核对32个PNG/GIF/ASE/PSD完整像素hash，JPEG/WebP/BMP的浏览器解码差异不冒充由该Node oracle覆盖。

验证结果：large-image-import-final-build.log 正式 Release 构建退出0；large-image-import-core-final-tests.log 中 image-save、large-image-import、psd-import、gif-import、aseprite-io 五项全部通过。新增核心夹具31064-113224187的60组格式／尺寸全部通过，large-image-import-legacy-oracle.log 证明实际旧版 decodeDocumentFile／compositeDocument 对32个完整像素哈希一致。Node加载器只桥接实际UPNG动态CommonJS导出以匹配Vite具名导入，未改写旧解码算法。旧版png、gif-import、aseprite、psd四个测试文件共63项通过（large-image-import-legacy-tests.log）。

正式 --large-image-io-check 退出0（43616-113045062），以正常产品栈执行九个扩展名及32768边长、真实异步原子保存和失败状态保护；--aseprite-save-check、--backup-save-check 均退出0（large-image-import-existing-ui-tests.log）。初次核心检查暴露的是测试夹具假设错误：核心ASE不设置Editor来源身份、GIF默认显示第一帧、空文件不能使用拒绝空输出的原子写入器；已修正对应断言／夹具。既有GIF测试使用窄字符入口导致中文CTest路径转换失败，改用Windows宽字符入口后通过。保留失败现场，不把这些夹具修正当作产品缺陷修复。

未修改布局，本批没有新增图像／全缩放人工验收。图片以外的操作专属1024限制（新建UI、剪贴板、缩放、补间等）、全量工程颜色模式、全部特殊资源和所有迁移仍INCOMPLETE，不宣称大画布全功能支持。

### 2026-11-08 大尺寸图像／画布调整事务（已通过定向验证）

接续50b3d7b7，对照document-model::resizeDocumentImage／resizeDocumentAt、CanvasResizeDialog及workspace-commands-document-io，移除两个生产Document入口的1024原型门禁，采用已登记每边32768／64Mi RGBA像素准入。现有逐表面、历史、选区和蒙版工作预算保留；保留链接／runtime共享owner、隐藏锁定层、禁用帧、时长、循环段和单步撤销。画布尺寸输入按实际旧版只限制最小值，不再把大数悄悄截成1024；预算外草稿保留编辑并禁用应用。图像大小现有16384直接输入／6400% UI范围沿旧版保留，不因核心可容纳32768就扩张界面语义。瓦片／自由瓦片在这两个入口的既有未迁移拒绝仍明确保留，不将本批称为全部尺寸功能等价。

新增make-large-resize-fixtures.cjs直接执行实际旧版函数生成36组geometry／完整RGBA哈希，涵盖1025与1031两轴、32768长边、局部／负偏移／画布外存储、透明RGB、最近邻、straight RGBA平滑、画布裁切／保留。large-resize-tests经生产Document执行同输入，检查link／runtime shared在编辑中保留、旧归档语义的重开、隐藏锁定／禁用／loop元数据、单次undo／redo，尺寸及工作预算拒绝保持现场、最大面积无全画布表面分配、选区缩放。现有图像／画布测试把旧1025拒绝断言改为真实32769越界；实际Editor套件扩展两种大尺寸对话框、比例／中心、局部历史、非法草稿恢复、取消／应用／文档历史和失败后继续编辑。尚待构建与运行，不以来源覆盖替代行为证明。

旧版document.test.ts、canvas-resize-resources.test.ts、CanvasResizeDialog.test.tsx三个文件22项通过（large-resize-legacy-tests.log）；实际legacy夹具生成器退出0、输出36组（large-resize-legacy-oracle.log）。正式程序及原生测试构建仍在进行，未计作通过。

large-resize-build.log 首次正式Release及四个核心目标构建退出0；large-resize-core-tests.log 中新套件首次保存失败为新夹具把空字节当成原ZIP，Missing ZIP directory现场44388-113825984保留。夹具改为clearSourceArchiveForNewSnapshot，和既有非原生来源文档一致，不更改生产保存器。large-resize-fixture-build.log 退出0，large-resize-core-final-tests.log 的image-resize、canvas-resize、large-resize、mask-resize全部通过；36组真实文件结果4928-113859859，完整几何／像素hash、编辑中链接／共享、元数据、undo／redo及重开通过。runtimeShared是进程内关联，磁盘重开按现有归档语义检查有效像素及显式linkedCelId，不伪称保留内部runtime字段。

首轮正式 --canvas-resize-check 退出0；首次捕获仍显示初始草稿，只有初始界面可作为图像证据，不能当成2049草稿刷新已验收。补充刷新后截图及实际UI合法画布／变换工作内存超预算场景，正在重建正式程序；不改变产品栈上限、布局、采样算法、用户文件或缓存。

large-resize-final-build.log 正式Release退出0，large-resize-final-ui-tests.log 中 --canvas-resize-check、--mask-resize-check、--large-image-io-check 全部退出0。实际UI新增8192×8192合法面积但变换工作内存超预算的失败检查通过，保留像素／尺寸／历史／修订和可编辑弹窗。刷新后的2049×6画布草稿、8192×8193超预算说明均已查看：字段／锚点／四边／错误／底部按钮完整，无交叠。图像尺寸2049×6截图发现旧“1–1024 px”说明残留，改为实际“尺寸受像素及工作内存预算限制”，正在正式重建；待重新捕获核实后才结束本批。

最终large-resize-caption-build.log 正式Release退出0，large-resize-caption-ui-tests.log 的完整 --canvas-resize-check 再次退出0。最终image-resize-large-smoke.bmp已重新查看：2049×6／200%字段、原比例锁／最近邻、预算说明、应用／取消均完整，无旧1024误导说明或交叠。图像验收仅覆盖这次默认2×窗口的画布有效／超预算及图像有效三个状态，不代表全缩放、长时手工拖动或UI性能量化。来源覆盖676文件通过，strict因全局既有迁移缺口仍退出1；diff检查通过。索引／灰度完整编辑、瓦片专属尺寸语义、新建／剪贴板／其它操作的独立门禁仍未在本批完成；全量迁移保持INCOMPLETE。

### 2026-11-08 大尺寸新建／剪贴板新项目／精灵表新文档（已通过定向验证）

接续a8d90801，对照NewDocumentDialog／new-document-presets、workspace-commands-clipboard::pasteAsNewDocument及sprite-sheet::createSpriteSheetDocument，移除三条既有创建链路的1024原型门禁，采用现有每边32768／64Mi像素文档边界。新建预设的写入／重读采用同边界，五位数宽度纳入字段内容下限，超边长／超总像素拒绝留在原弹窗。保留用户既定新建32色卡；粘贴及精灵表仍用旧版两色默认色板、单100ms帧、无来源身份、dirty且空历史，不能沿用fromImage的导入调色板。精灵表超文档边长仍可作为文件光栅输出，不截断为新工程。

系统剪贴板保留实际clipboard-service.ts的16Mi像素读取预算，新增项目侧边长准入不扩大读取总量；普通选区／参考图的8192边长适配未在本批扩张。clip后端元数据分配前及读取后复核共用同一策略，校验24／32位、行长度／读取预算及移位范围；转换器提取成可用独立clip::image缓冲测试的原生产函数，不往系统剪贴板写测试数据。原有系统优先／内部回退及原生超预算拒绝策略保留；新建窗口默认探测剪贴板尺寸、索引／灰度完整编辑、其它工具门禁仍是独立未完迁移。

新增5组尺寸1025×3／3×1031／32768×1／1×32768／2049×7；实际旧版createDocument／writeLayerColor、selectionClipboardFromImage和createSpriteSheetDocument执行器生成23个完整RGBA哈希，涵盖内部蒙版、24位不透明／32位透明及横／纵精灵表。原生测试覆盖边缘编辑undo／redo、三种新项目身份／色板、真实原子保存重开、源工程不变，测试缓冲含逐行填充；实际Editor覆盖新建大尺寸／预设存取／非法参数恢复及粘贴菜单、精灵表新页签、越界失败保护。初轮未加旧版哈希断言的四项核心检查通过（large-creation-initial-core-tests.log）；三个旧版测试文件17项通过（large-creation-legacy-tests.log）。最终含23哈希的核心及正式UI验证尚待运行，不把初轮检查当作最终通过。


最终含旧版哈希的首轮核心测试暴露单层精灵表透明RGB差异（large-creation-core-final-tests.log，失败夹具37536-115316218保留）；独立RGBA转储逐像素证明1528处差异均是alpha=0时RGB被原生合成清零。实际legacy document-composite-region::compositeRegion在单层／全不透明度／无效果／无有效蒙版时按行复制原始RGBA。已把该快速路径的普通normal RGBA、无组／效果／蒙版／预览子集接入共享compositeNormalRegion，保留透明RGB并减少逐像素混合工作；其他资源、混合、裁剪组及预览仍走原路径，不宣称已迁移该旧版快路径的所有分支。新增负偏移／边界补零／链接owner／隐藏／Cel不透明度及多层回退回归；未调整旧版oracle预期哈希来消除失败。

large-creation-single-raster-build.log正式Release与九个相关测试目标构建退出0；large-creation-single-raster-core-tests.log的large-creation、clipboard-document、sheet-new-document、sprite-sheet、layer-compositor、layer-blend、layer-group-compositor、image-save、large-image-import全部通过。五组大尺寸的23个实际旧版完整RGBA哈希全部一致，原子保存／重开／来源保护通过。large-creation-final-ui-tests.log中正式--new-document-check、--paste-new-document-check、--sheet-new-document-check、--large-image-io-check全部退出0，运行前后同一正式exe SHA256一致。

已实际查看默认2×的new-document-large.bmp（1025×3草稿）和new-document-large-invalid.bmp（8192×8193超预算草稿）：尺寸字段、预设、错误文字和底部按钮完整，没有交叠；窗口仍保留自动几何检查后用户拉大的尺寸，未为截图强制收缩。五位数宽度由字段最小宽度检查及32768两个轴的预设存取／创建菜单回归覆盖，不声称已有五位数草稿截图。此批无全缩放、长时手工拖动或UI帧率基准；单层行拷贝优化不等同于整体卡顿已解决。全量迁移仍INCOMPLETE。

最终来源覆盖679文件通过，strict因全局已知迁移缺口退出1；Node脚本语法及git diff --check通过。全部既有未跟踪诊断、用户／恢复数据与缓存保持原状。


### 2026-11-08 新建窗口剪贴板尺寸完整探测链路（已通过定向验证）

对照NewDocumentDialog::useEffect、ClipboardService::latestClipboardSize／layerClipboardSize及platform_clipboard.rs::read_clipboard_image_size。系统读取仅检查DIBV5/DIB前12字节，保持旧版绝对宽高和16Mi像素边界；无图层复制时不读像素。图层复制记录当时活动帧的所有被复制图层栅格范围并求并集，保持系统基线尺寸和图像；新建时先比元数据，仅同尺寸才比完整图像／mask／origin；无系统／访问失败回退图层范围，同尺寸新图片优先。选区／动画复制不作为图层范围，超原生边长的合法剪贴板元数据仅保留草稿，不静默裁切；创建仍沿现有原生准入。

新建窗口异步轮询结果，用户输入任一尺寸、点内置预设、载入用户预设之后不接受迟到结果，关闭后不触碰UI。Windows延迟剪贴板读取使用唯一worker／一个可替换待执行请求，复用native gallery的共享状态生命周期与legacy latest-task合并原则，避免反复开关堆积线程；只捕获不可变数据／共享基线，不捕获Editor，不在打开窗口复制基线大缓冲。图层复制原有同步baseline捕获尚未在本批异步化，不把本批称为全部剪贴板性能完成。

实际ClipboardService执行器生成864组来源／尺寸／图片空、透明、变化／同尺寸／失败及有无图像reader组合，并比较读取次数；核心新套件另覆盖Rust原例320×-180、头长度／INT_MIN／16Mi边界、负坐标／多层并集、源owner销毁后reader有效、慢读取关闭不等待及待执行替换。初次并发测试超时：MSVC packaged_task移动赋值替换后原future未立即完成，显式reset旧pending再emplace新任务后通过，失败日志保留。new-document-clipboard-cancel-core-tests.log三项（新套件／clipboard-document／large-creation）通过；正式UI尚待构建运行，不能把核心通过当作窗口验收。索引／灰度完整编辑仍未迁移，全量目标INCOMPLETE。

初轮正式Release构建new-document-clipboard-app-build.log退出0。复核补齐远距离小图层的并集元数据：宽高使用int64，INT_MIN与INT_MAX坐标的两个1×1图层保留4294967296×1草稿，不回退默认值、不溢出或静默裁切；提交仍由原生创建预算拒绝并保留可编辑状态。new-document-clipboard-wide-build.log正在重新构建最终正式程序及三个相关测试。

Aseprite只读对照：cmd_new_file.cpp::onExecute通过Clipboard::getImageSize填默认宽高；util/clipboard.cpp::getImageSize先读原生bitmap尺寸，再回退内部image宽高，不走getImage完整内容路径。本批同样区分尺寸探测和图片读取，并保留MoonSprite自己的图层基线比较规则；未复制Aseprite业务代码，来源快照记录实际检查版本。

最终wide构建退出0，new-document-clipboard-final-core-tests.log三项全部通过，包含864组实际旧版对照与4294967296×1范围草稿。首轮正式窗口检查在实际层复制用例失败：测试把addFrame(false)生成的1×1空白活动Cel误认为前一帧8×6；对照document.cpp::addFrame和旧版blankSurface语义后仅修正测试，系统基线改为2×3，明确断言复制活动1×1、不采用非活动8×6、切换工程后仍冻结1×1，以及同尺寸外部新图优先2×3。失败日志保留new-document-clipboard-ui-active-cel-failure.log，正式单文件重建验证中。

最终new-document-clipboard-active-cel-build.log正式Release退出0，new-document-clipboard-final-ui-tests.log中--new-document-check、--paste-new-document-check、--sheet-new-document-check全部退出0，运行前后exe SHA256一致（7BA59F4D2DF94D9020243AF3B4CC13613585E2FEE96221121127D99A7589EC27）。实际Editor活动帧复制、切工程冻结、同尺寸外图优先、真实Timer23×17回填、手动宽高／内置与保存预设防迟到覆盖、远坐标宽草稿拒绝均通过。已查看最终new-document-dialog.bmp和new-document-large-invalid.bmp：默认2×的23×17字段、预设、关闭与底部按钮，以及8192×8193超预算提示完整，无交叠。图像验收不代表1×实机、所有倍率或长时交互帧率。

最终核心三项全部通过（new-document-clipboard-final-core-tests.log）；实际旧版clipboard-service九项及864组oracle对照通过。来源覆盖684文件通过，strict因全局已登记缺口仍退出1，Node语法和git diff --check通过。未修改系统剪贴板、未清理用户数据或既有缓存。本批仅完成剪贴板尺寸探测链路；同步复制baseline、索引／灰度编辑及全量迁移仍未完成，整体性能改善未经帧率量化。

### 2026-11-08 大尺寸精灵表导入完整操作链路（已通过定向验证）

接续e8eb33bd，对照sprite-sheet-import::spriteSheetImportPlan/buildImportedSpriteSheet、workspace-sprite-sheet-import及实际Dialog。几何规划承接262144参数范围，移除1024原型门禁和规划阶段混入的分配预算，保留四排列、原点、间距、不完整单元格及10000帧；构建与Document实际提交分别检查现有32768边长／64Mi总像素／256Mi工作集。Document在构建前计实际源与历史快照、selection mask及旧版三份结果加scratch，避免切片完成后才因撤销快照爆内存；计算先转64位再减原点和乘行列，拒绝不可表示的原生坐标。预算失败保留工程／历史／参数，特殊资源原有拒绝不再由UI误报成功。界面移除过期1024说明，没有重新设计布局。

实际legacy执行器生成80组大尺寸切片及40组规划边界，对照五组源尺寸1025×3／3×1031／32768×1／1×32768／2049×7、四排列、partial开关、负原点与间距，2049源含非原点局部蒙版；比较每帧完整RGBA哈希、73/137ms与末帧回退。原生核心加一笔结构undo/redo、身份／源像素／mask恢复、真实保存重开及边长／总像素／工作集失败保护；实际Editor新增普通／选区菜单、输入框与partial按钮、失败后恢复、大尺寸文件打开后导入路由及截图。

索引／灰度、记忆／grid默认、可操作导入预览与selection pivot完整恢复仍为既有未完迁移，本批不称整个精灵表导入功能或全软件迁移完成。验证与正式构建待补全。

旧版sprite-sheet-import及workspace-sprite-sheet-import共15项通过（large-sheet-import-legacy-tests.log）。核心首次编译测试误用了不存在的readProject，修正为readProjectManifest；随后中文argv路径触发编码失败，改为本仓库已有wmain／wide路径入口。首次完整像素对照case0发现254处差异，独立RGBA转储证明全为alpha=0隐藏RGB：legacy实际build使用compositeRegionAsync点采样source-over清零，而同步compositeRegion存在保留RGB的row-copy。仅导入输出按真实异步合成归零，未修改共享compositor或oracle期望。失败日志与原始转储保留。

large-sheet-import-alpha-build.log构建退出0，large-sheet-import-alpha-tests.log套件通过：80实际旧版构建完整像素哈希、40规划边界、一笔Undo/Redo与80个实际文件保存重开、源／mask／身份／73/137ms／loop不变以及边长／总像素／工作集失败保护均通过。正式Release构建与实际Editor验收待完成。

large-sheet-import-app-build.log正式Release及large-sheet-import-ui-tests.log三条检查首次退出0。复核补强UI预算路径：先开启partial确保大单元格至少产生一帧，并断言实际边长／working pixel budget错误，不能用“No complete tiles”误替代内存拒绝。首张直接入口nativeSurface截图全黑，不作为视觉通过证据；改为正常窗口消息循环内的200ms检查入口，截图前invalidate整个manager。文件打开回归保存并恢复原会话容器、active/recovery索引、工程路径和恢复状态，避免污染综合smoke的后续用例。最终单文件重建与可见窗口复验中。

最终large-sheet-import-recovery-final-build.log正式Release构建退出0；large-sheet-import-recovery-final-ui-tests.log中--sheet-import-check、--sheet-new-document-check、--new-document-check全部退出0，运行前后正式exe SHA256一致（4E0F9258C84DA1BD9E765AC614CD758F2B3F9A37D6B703214DDF28CBA60FBCD6）。隔离恢复状态的测试初次以空花括号赋值触发Scheduler显式构造编译错误，改为具名RecoverySession默认实例后通过，未改变恢复数据或生产会话策略。实际有效参数修改会按旧版清除本次导入错误；新增断言与最终可见截图共同验证，不再残留预算错误。

已查看最终large-sheet-import.bmp：默认2×下1025×3草稿、两列一行、不完整单元格、预算说明和导入／取消均完整，无交叠，底部未残留失败状态。图像验收仅覆盖该窗口状态，不代表全缩放、长时交互或整体UI帧率改善。80组完整RGBA哈希及真实保存重开、40组规划边界、旧版15项测试与正式UI三条检查通过；来源覆盖与最终diff检查另行记录。索引／灰度、记忆／grid默认、实时导入预览和selection pivot完整恢复仍未完成，全量迁移保持INCOMPLETE。

最终来源覆盖686文件通过（large-sheet-import-recovery-final-provenance.log），strict因全局已登记迁移缺口仍退出1；生成脚本Node语法与git diff --check通过。全部既有未跟踪诊断、工程／恢复数据与构建缓存保持原状。

### 2026-11-08 精灵表导入参数生命周期（已通过定向验证）

接续39d77cd7，直接核对SpriteSheetImportDialog及测试、spriteSheetFrameSizeFromCount、workspace会话。首次普通导入采用工程网格原点／尺寸，即使网格隐藏；只有成功的普通导入记忆原始参数，取消／失败／选区导入不覆盖。原生按ProjectSession拥有参数并核对Document identity，切换页签和撤销不丢失，同槽替换文档不继承；不写工程／配置，关闭会话自然释放。选区首次草稿忽略普通记忆，采用局部原点0和min(grid,selection)尺寸。本批不声称完成选区snapshot／pivot恢复。

补上实际旧版间距开关：关掉时隐藏间距字段但保留草稿值，规划／实际导入／列行数反算使用有效零间距；普通成功后记住原始值，重开根据非零原始间距重新勾选，保持旧版这个可观察行为。字段和按钮按既有共享模态布局增加条件行，不引入新素材。空／非法规划禁用导入；取消恢复共享确认按钮。列行数反算先以64位乘间距再计算，避免262144×9999溢出。原生网格double超int范围时饱和为仍然非法的边界草稿，由规划拒绝，不回绕成有效参数；可表示的超规划范围仍保留供编辑。

make-sheet-import-dialog-fixtures.cjs通过已安装Vite/Oxc执行实际旧版TSX，不重写其初始化、update、submit或WeakMap；只替换顶层import，适配React hook／元素传输、翻译和workspace异步完成。18组实际组件默认值、180组实际核心反算输出生成原生夹具，并执行成功／失败／取消／间距开关／选区／对象身份回调断言。最初尝试无法解析已安装的TypeScript包入口，改用项目Vite转换；初版未锚定import正则误匹配事件字符串，修正为仅处理行首顶层import后通过。最终转换与适配代码转储在build，完整组件仍有原始async submit与事件逻辑。该夹具不是DOM布局或NumberInput内部交互证明。

旧版组件／核心／workspace三个文件18项通过（sheet-import-parameters-legacy-tests.log）；原生扩展既有导入测试与正式Editor检查覆盖相同默认值／反算、失败不覆盖、有效零间距、实际页签切换、替换文档和UI开关截图。正式构建与原生运行待完成。实时导入预览／拖动、弹窗内重新选择源、索引／灰度完整编辑、选区snapshot／pivot完整恢复仍未迁移，全量迁移保持INCOMPLETE。

sheet-import-parameters-core-tests.log扩展后的sprite-sheet-import套件通过：18组件默认值、180反算结果、参数优先级／局部选区／不可表示网格草稿，以及上一阶段80组完整RGBA哈希、40组规划和80个实际保存重开均通过。正式程序构建仍在进行，核心通过不作为界面验收。

sheet-import-parameters-build.log首次正式Release构建退出0，sheet-import-parameters-initial-ui-tests.log的--sheet-import-check退出0，实际控件／文件导入／页签切换完整链路通过。收尾复核补齐空规划Enter不提交、弹窗关闭后迟到Change不污染共享确认按钮；参数字段Change只更新对应控件及规划，不调用全编辑器refresh，清除既有错误时单独请求重绘。新增panelFullRefreshes计数断言及两个输入生命周期回归。正在增量构建与最终运行，尚未以首轮窗口结果替代最终检查。

首轮间距开／关截图揭示新增按钮未加入modalControl白名单，导致逻辑Click回归虽通过、实际控件却被模态路由屏蔽；该截图不作为最终通过证据。补齐共享模态控件注册，新增可见／可用／modalControl断言及真实MouseDown/MouseUp触发开关，避免只验证直接回调。sheet-import-parameters-final-build.log输入收尾版本构建退出0；正在routing构建后重做全部窗口检查和两种截图。

最终sheet-import-parameters-routing-build.log正式Release构建退出0；sheet-import-parameters-final-ui-tests.log的--sheet-import-check、--sheet-new-document-check、--new-document-check全部退出0，运行前后同一正式exe SHA256一致（5C84AB98C1FE8D4E3213C3A554B56B6B890A14A1A7D38FB5591BAEDF70CAB345）。实际指针触发间距开关、空规划Enter、关闭后回调、panelFullRefreshes不增、取消／失败／选区不覆盖、undo及实际页签切换均通过。已重新查看最终sheet-import-padding-on.bmp及sheet-import-padding-off.bmp：默认2×下间距开关可见、字段随开关显示／隐藏，启用时3/2间距及4列、关闭时有效零间距及5列；局部原点、其余参数、说明和底部按钮无交叠。仅验收这两个状态，不代表全缩放／长时间手工操作或全软件UI帧率。

最终来源覆盖688文件通过，strict因全局已登记缺口仍退出1（sheet-import-parameters-final-provenance*.log）；Node语法及git diff --check通过。保留既有未跟踪诊断、工程／恢复数据和构建缓存。实时导入预览／拖动、弹窗内重新选择源、索引／灰度完整编辑、选区snapshot／pivot完整恢复仍为明确缺口，本阶段仅关闭上述参数生命周期迁移，全量目标保持INCOMPLETE。


### 2026-11-08 精灵表导入选区快照与旋转中心历史（已通过定向验证）

对照实际SpriteSheetImportDialog的打开时cloneSelection与workspace-sprite-sheet-import的提交前selection／selectionPivot捕获，拆分切片范围与撤销恢复范围。原生共享不可变选区只复制一次，规划、行列反算与切片共用；取消／成功关闭释放，失败保留。普通导入也恢复提交前旋转中心，复用既有selectionPivotHistory serial与Editor刷新，无新增历史事务；成功提交清除画笔／橡皮直线锚点。保留工作内存预算，增加快照预算与坐标端点检查，短蒙版缺失字节按旧版视为未选中。

实际旧版TSX回调、构建、workspace命令与history共36组对照已生成，覆盖4种布局、3种弹窗后选区变化、完整／短蒙版／部分画布外矩形；只桥接hook／元素、资源查询与未调用文件选择模块，未重写导入或历史。原生加入同输入完整像素hash、一次undo／redo、36次原子保存重开、失败保护及实际Editor选区／旋转中心同步检查。旧版三个测试文件18项通过（sheet-import-selection-legacy-tests.log），原生正式构建及运行待完成。

此批不改变布局。实时预览／拖动、弹窗内换源、索引／灰度完整编辑及其他全局迁移缺口仍未完成，不宣称全软件卡顿已解决。

原生sheet-import-selection-core-tests.log的sprite-sheet-import套件通过（6.73s），含新增36组选区快照／真实原子保存重开、历史旋转中心和失败状态保护，以及既有18默认值／180反算／80构建／40规划。正式程序仍在构建，核心结果不计作窗口验收。

最终sheet-import-selection-build.log正式Release及sprite-sheet-import-tests构建退出0；sheet-import-selection-ui-tests.log的--sheet-import-check、--sheet-new-document-check、--new-document-check全部退出0，运行前后正式exe SHA256一致（011DF0F8E02AB7A7DFDD1B89DACF2E594C774313DEDE54A00545B709B0BC3707）。实际Editor覆盖三种live选区变化后的冻结切片、基于冻结尺寸的列数反算、提交清除选区／可见旋转中心／两种画笔锚点、undo恢复live选区／旋转中心、redo清除、取消释放快照、超预算失败保留快照／状态以及普通导入旋转中心恢复。

重新查看此次运行生成的sheet-import-padding-on.bmp／off.bmp：默认2×下既有字段、间距开关、说明和底部按钮完整、无交叠；这些截图仅证明既有参数布局，旋转中心生命周期由实际Editor状态断言覆盖，不宣称有旋转中心叠加图像验收、全缩放或全软件UI性能量化。来源覆盖688文件通过，strict因全局既有缺口仍退出1；Node语法与git diff --check通过。保留所有既有未跟踪诊断、工程／恢复数据和缓存，全量迁移保持INCOMPLETE。


### 2026-11-08 精灵表导入实时预览、交互与弹窗换源（已通过定向验证）

继续关闭同一导入链路的已登记缺口。逐项核对实际SpriteSheetImportPreview和父级useAppDocumentDialogs的document-id key：首格移动／绘制、四边、间距、命中优先级、取消／blur、空格或中键平移、鼠标锚定1.2缩放和自动适合窗口；普通模式弹窗内选源，新文档身份重置默认值，取消／失败保留旧来源／草稿／视图，选区模式不提供换源。复用原生openPath读取器和来源身份／页签处理，不另造解码器。

预览独立原生控件保留旧版只在来源内容变化时合成的处理：已有RasterSnapshot以2ms／1MiB批次捕获，后台独立timeline合成分块检查取消；完成后以1MiB批次上传，关闭不等待线程，过期来源／revision／frame结果不发布。参数／视图只更新缓存tile规划与叠加绘制，不复制undo，不全刷新Editor。保留原生256MiB工作预算，先检查快照／输出／表面后分配，失败不阻止继续改草稿。使用现有像素字体、checkerboard和皮肤；增加必要预览区、适合窗口和换源入口。

make-sheet-import-preview-fixtures.cjs运行实际未改写TSX事件处理器生成216组拖动／取消和2组锚定wheel，hook／DOM只是传输桥接；native模型测试及既有sprite-sheet-import核心通过（sheet-import-preview-core-tests.log），旧版四个测试文件21项通过（sheet-import-preview-legacy-tests.log）。首轮正式构建发现Windows near宏与局部变量同名，已停止构建、确认编译进程结束再改为nearEdge；固定版本仍待正式构建与窗口运行。

对照本地Aseprite cmd_import_sprite_sheet.cpp的SelectBoxDelegate只更新字段与独立editor预览处理；该模块头部明确EULA，仅阅读比较，未复制实现。旧版MoonSprite交互仍为权威，未采用Aseprite销毁此前文件或不同span算法。索引／灰度完整编辑、瓦片／自由瓦片专属导入事务及其他全局迁移仍未完成，不以本批宣称整体UI卡顿已解决。

固定版本构建在editor_background.cpp遇到C1060编译器堆空间不足；已主动停止并确认无cl／MSBuild存活后改用较低编译并行度。现场系统约3.6GiB可用物理内存／4.3GiB可提交空间，未删除缓存或用户数据。补齐CSS crosshair到既有03-Slice-3.png游标映射、footer使用缓存帧数及zoom输出局部重绘，再继续正式构建。

低并行正式构建退出0，初轮三条窗口检查也退出0，但实际查看sheet-import-preview.bmp及sheet-import-selection-preview.bmp发现预览为空：panel_content九宫格含不透明中心，最后绘制覆盖了源图和叠加。初轮截图不作为视觉通过证据。已改为先绘既有皮肤底图、内容裁切在内边框，并新增最终窗口framebuffer源RGB断言；增量构建后重做窗口及截图验收。色板库定向测试本轮退出0，确认此前用户批准的96字符长名称/重名后缀/保存重开修复。

最终sheet-import-preview-paint-build.log正式Release增量构建退出0；sheet-import-preview-paint-ui-tests.log的--sheet-import-check、--sheet-new-document-check、--new-document-check均退出0，运行前后同一正式exe SHA256一致（DFEF4908573BAF2FC3244F1970A78AA212C529E407C751D2DC09A710C76C7AF4）。新增最终framebuffer RGB断言通过，重新实际查看普通及冻结选区预览截图，源像素、透明棋盘、切片编号/边框/手柄已可见，字段、提示、适合窗口和底部操作无交叠。视觉仅覆盖默认2×的这两个状态，不代表全缩放、长时手工交互或全软件帧率测量。既有核心两套与旧版21项结果保留；本轮palette-library定向测试通过。来源覆盖694文件通过，strict因全局已知迁移缺口保持退出1；此次未将该结果解释为全量迁移完成。

### 2026-11-08 瓦片与自由瓦片精灵表导入事务（已通过定向验证）

上一阶段bad1ae0f已推送dev。实际legacy buildImportedSpriteSheet不拒绝特殊图层，按当前可见帧合成为普通RGBA Cel并清除输出资源；workspace命令用结构快照恢复原始源／实例／链接。已移除原生特殊工程门禁，复用既有compositor与完整timeline历史，增加资源表／网格单元／源与实例元数据的快照准入以及free源/实例Undo计费；参数和预览继续缓存而不全刷。按legacy mutateDocumentSession正常化失效资源／mask／group／时间轴上下文，原生沿既有结构历史保留撤销前编辑目标。

实际旧版执行器生成96组2资源类型×2链接状态×3隐藏/不透明度状态×2选区范围×4排列的完整像素hash，并调用实际workspace提交/undo/redo验证原资源身份、palette及切片结果。首轮原生96组及原有导入套件通过；后续补齐资源选择历史／128MiB源资源预算拒绝与实际Editor两类预览/提交/撤销/重做，正在最终构建。执行器首轮workspace桥接缺少commitFloatingPaste空事务入口导致测试失败，补齐无浮动对象的传输桩后实际旧版96组通过，未改写产品函数。索引/灰度完整编辑及实际切片提交的异步化/取消仍未完成，不以本批宣称全部导入/全软件迁移完成。

最终resource-sheet-import-final-build.log正式Release与sprite-sheet-import-tests构建退出0；resource-sheet-import-final-core-tests.log导入套件退出0（12.45s），包含新增96组完整RGBA对照、source/output真实重开、source资源/链接/实例/选择历史和128MiB源瓦片表的提前预算拒绝，既有大尺寸/选区快照测试继续通过。resource-sheet-import-ui-tests.log的--sheet-import-check、--sheet-new-document-check、--new-document-check均退出0，运行前后正式exe SHA256一致（8048A75B9686509CFC3227D9CA21E2248A60B05A752B9E81DAF27A6201149F13）。实际Editor两类特殊源的缓存预览、模态提交为6个2×2 Cel、一笔撤销恢复源资源与像素、redo重新合成均通过。已查看本次sheet-import-grid-resource.bmp及sheet-import-free-resource.bmp，默认2×下源像素、棋盘、6帧编号/边框/首格手柄与字段按钮完整无交叠；未声明全缩放/长时性能量化。来源覆盖697文件通过，strict因全局既有缺口仍退出1；Node语法及git diff --check通过。无删除原工程/恢复/缓存或另建产物。本阶段完成后保存推送dev；全量迁移仍INCOMPLETE，实际切片提交异步化与索引/灰度等继续登记未完成。


### 2026-11-08 精灵表导入异步计算与提交保护（已通过定向验证）

接续f496beec，实际核对旧版SpriteSheetImportDialog的busyRef、全部disabled入口与关闭守卫，workspace命令的身份/内容revision/活动帧检查、提交时选区与pivot捕获及异步builder。原生复用RasterSnapshot按2ms期限/1MiB上限协作捕获；独立后台线程持有完整快照，按最多65536像素的行块合成并检查内部取消。16ms原生UI定时器轮询及最终检查后应用原有单笔结构历史；界面不会等待线程join。文档失效/销毁取消内部结果；旧版处理中取消/关闭/参数/换源/预览禁用语义不变。原生已有Timeline::takeState可直接复用，首轮编译发现重复声明后移除新增版本，无另造状态转移方法。

核心新增确定性队列测试覆盖捕获/处理中/结果就绪三个阶段的身份替换、像素修改、切帧，取消、销毁、调度失败、冻结选区与提交时live选区/pivot、仅色板元数据变化和真实分离线程。既有80大尺寸+36选区+96资源旧版对照的实际事务改用后台任务，原同步builder哈希与保存重开仍验证。正式Editor检查新增真实计时器提交/锁定/重复回调、禁用预览wheel、调整预览布局与绘制、过期结果失败后恢复编辑。

本阶段只处理实际导入提交的捕获与切片阻塞；不表示所有UI性能问题、索引/灰度完整编辑或全量迁移完成。正式构建、定向运行和图像验收尚待完成。此前用户批准的长色板名称修复已存在，src/palette_library.cpp按96字符及实际后缀生成ID，保留完整显示名称；tests/palette_library_test.cpp已有86/87/95/96/97/256/2048长度、两位/三位碰撞后缀、内置冲突、覆盖与中文名称重开检查，本阶段不重复修改其行为。

async-sheet-core-build.log修正重复takeState后核心构建退出0。async-sheet-test-build.log新增任务测试及四个既有定向测试目标构建退出0；async-sheet-core-tests.log五项全部通过（21.49s）：sheet-import-task0.33s、raster-snapshot0.05s、sprite-sheet-import14.81s、palette-library6.13s、sheet-import-preview0.11s。212组旧版构建/选区/资源事务使用真实后台任务提交并继续验证完整RGBA、撤销/重做与原工程/输出实际重开；跨65536像素分块边界的透明RGB也符合原有source-over清零语义。全量来源覆盖700文件通过，strict仍因全局已知缺口退出1。正式Release界面目标正在构建，尚未以核心通过替代窗口验收。

正式界面首轮低并行构建在editor_gallery.cpp遇到C1060编译器堆空间不足，已停止该构建并确认cl/MSBuild退出；当前可用物理约1.9GiB、可提交约5.3GiB，未结束无关应用或删除数据。改为单并行且显式PreferredToolArchitecture=x64继续相同Release目标，不降低产物优化等级、不另建产物。补回取消分支原有finishDraft调用，保留既有关闭草稿生命周期。

后续显式HostX64构建在home recovery、逐文件构建在attached masks再次遇到C1060；只停止已确认属于本批的失败构建进程树，未关闭无关Node/Vite应用或清理缓存。最终清除本次CL环境覆盖，使用--parallel 1及PreferredToolArchitecture=x64、CLToolArchitecture=Native64Bit、UseMultiToolTask=true、CL_MPCount=1、EnforceProcessCountAcrossBuilds=true，保持正式Release优化与唯一产物路径；async-sheet-final-build.log记录最终构建退出0。

最终async-sheet-final-core-tests.log五项全部通过（16.05s）：sheet-import-task、raster-snapshot、sprite-sheet-import、palette-library、sheet-import-preview。212组实际旧版大尺寸/选区/资源事务继续核对完整RGBA、单笔撤销/重做及源/输出真实保存重开。长色板完整显示名称、96字符ID边界和碰撞后缀修复再次通过，未重复改动。async-sheet-ui-tests.log的--sheet-import-check、--sheet-new-document-check、--new-document-check全部退出0；运行前后正式exe SHA256一致（D53146B06AEDE87ECC3A94CFF1D2C32307E4BA845BEA753BDC297F03C820FB9D）。真实原生Timer完成、持有后台任务期间的Windows SetWindowPos移动/调整尺寸、禁用控件/重复提交/关闭守卫、过期失败后重试及单笔历史断言通过。

已查看本轮sheet-import-busy.bmp和sheet-import-preview.bmp：默认2×下源像素、棋盘、切片编号/边框/手柄可见，忙碌控件禁用，参数和底部操作完整无交叠。仅验收这两个渲染状态及上述自动窗口路径，不声明全倍率、长时操作或全软件帧率。最终安装仍使用原有同步结构历史应用，未声称提交零延迟；索引/灰度完整编辑等全局迁移缺口保持INCOMPLETE。

最终async-sheet-final-provenance.log来源覆盖700文件并验证证据快照，退出0；strict因全局既有缺口退出1，符合尚未全量迁移的状态。git diff --check退出0。保留既有未跟踪文件、工程/恢复数据与构建缓存；本批只提交明确列出的源码、测试和迁移记录。

### 2026-11-08 瓦片/自由瓦片画布尺寸、裁切与修整（已通过定向验证）

接续c0e25ee2，逐项对照document-model::resizeDocumentAt/cropLayersToCanvas、animation::resizeAnimationCelsAt、tilemap::resizeTilemapCelDataToCanvas、free-tile及workspace画布结构历史。移除特殊工程resizeCanvas/cropCanvasRegion直接拒绝，复用已有background结构事务与PixelDialog，不改变UI布局。网格按负坐标floor/ceil扩展覆盖或裁切单元格；自由瓦片仅移动局部实例、必要时扩大/裁切表面，trim沿旧版源的未旋转宽高判定，部分露出保留、完全越界移除，保留隐藏/锁定/变换及资源身份。链接与runtime共享仅处理canonical owner一次；空资源自由Cel不合成新来源。普通隐藏锁定层、背景重复单元、直接/链接蒙版、live选区/pivot与单笔Undo/Redo共同处理。浮动粘贴仍沿既有独立提交生命周期，不合并旧事务。

预分配阶段计完整资源/实例元数据、原表面/新表面、蒙版、选区及实际背景重复覆盖，保留原生256MiB工作集与32768边长/64Mi画布像素准入；所有源端点/网格起点/实例局部位移先用64位计算，不回绕。背景模运算与source采样中间坐标改为64位，避免极端负原点取反溢出。复用原有tiles/free renderer和结构历史，不另造资源格式；网格/实例结果直接构建，避免先复制整份旧数组再清空。

make-tile-canvas-fixtures.cjs执行实际未改写的旧版两个生产resize函数，生成128组2资源类型×2链接×2活动帧×8尺寸/偏移×2trim，核对两帧完整RGBA哈希、网格cells与实例顺序/坐标；包含非方形源、源偏移、隐藏/锁定实例及部分越界。原生测试通过实际Document事务及256个源/输出文件保存重开，并追加runtime共享、混合普通层/背景/链接蒙版、selection/pivot、crop/trim、预算与坐标拒绝。首轮唯一失败为额外空来源fixture漏填必需setId，修正测试输入后tile-canvas-core-tests.log四项全部通过（7.21s）；未放宽产品准入或期望。旧版tilemap/free-tile/animation三个文件52项通过（tile-canvas-legacy-tests.log）。来源覆盖704文件通过，最终正式构建/窗口验收进行中，未用核心通过代替UI证据。

本地Aseprite cmd_canvas_size.cpp/DocApi::cropSprite仅只读比较事务与图层裁切入口，头部EULA，未复制代码；MoonSprite旧版仍为行为权威，未引入Aseprite切片移动等额外语义。特殊图层图像大小重采样、索引/灰度完整编辑及全局迁移仍INCOMPLETE；当前画布提交/重绘仍同步，不声明全软件卡顿或帧率优化已完成。

收尾补充执行实际documentVisibleContentBounds/documentAnimationVisibleContentBounds，新增16组当前帧/所有帧trim结果，包含禁用帧、链接和无可见像素分支。生成器初次假定所有输入都有可见像素而报错，按实际旧版输出登记empty/no-op分支后通过，未改写产品函数或忽略空画面。tile-canvas-trim-core-tests.log明确输出128 canvas+16 trim全部通过；另有64组runtime共享事务对照。最终tile-canvas-final-core-tests.log五项全部通过（7.96s）：tile-canvas-resize、canvas-resize、large-resize、document-background、mask-resize。

tile-canvas-final-build.log正式Release构建退出0；首轮tile-canvas-ui-tests.log中--canvas-resize-check/--canvas-trim-check退出0。首轮结果截图沿用此前大画布测试的视图和故意触发的错误提示，不能用来验收当前画面；仅修正smoke fixture的fitCanvas与状态隔离，不改变生产视图策略。tile-canvas-ui-framing-build.log最终正式增量构建退出0；tile-canvas-final-ui-tests.log两条正式窗口检查均退出0，运行前后exe SHA256一致（B963DCA8B1D7F9AB08A307F376695F982261F093006B50CFAB7386F6FD827153）。实际PixelDialog取消/提交、两类特殊工程资源身份、单笔Undo/Redo及crop/trim菜单路由通过。

已重新查看最终canvas-resize-grid-result.bmp、canvas-resize-free-result.bmp：默认2×下4×4画布及原像素可见，历史含一笔画布大小，资源层/链接帧保留，底栏无前一失败提示；弹窗截图另核对字段和底部按钮完整无交叠，未据其证明所有overlay刷新或缩放状态。视觉范围限这些窗口状态，不是全部倍率/手工长时操作/全软件FPS验收。来源覆盖704文件通过（tile-canvas-final-provenance.log），strict仍因全局既有缺口退出1；Node语法与diff检查通过。既有未跟踪文件、工程/恢复数据和构建缓存全部保留，本阶段完成后保存推送dev，全量目标继续INCOMPLETE。


### 2026-11-08 瓦片与自由瓦片图像大小（已通过定向验证）

接续158da52a，实际对照document-model::resizeDocumentImage、free-tile-document的捕获/验证/调整和free-tile::resizeFreeTileTileset，复用既有结构历史。自由瓦片逐源按Math.round缩放瓦片宽高及源偏移，实例先缩放世界坐标再减新Cel原点；nearest保留透明RGB，smooth按旧版预乘alpha插值，普通位图/蒙版仍走原来的straight RGBA规则。只处理canonical owner，保留链接及runtime共享、源/实例身份、顺序、隐藏/锁定/变换，混合普通层和直接/链接蒙版、live选区共同单笔撤销/重做。

用户本轮明确批准修复旧版网格只调整缓存而不调整资源/网格的问题：同步重采样每个引用瓦片源和网格tileWidth/tileHeight，保持columns/rows、cells及资源ID/槽位；偏移按世界坐标floor。网格每瓦片按原位图straight RGBA插值，重新渲染缓存以确保保存重开一致。原生256px瓦片边长、16Mi源像素、64Mi表面像素和256Mi工作集准入继续有效，超限不提交；更大源尺寸兼容仍未迁移。直接按瓦片行写目标sheet，避免逐瓦片重建ID索引。

make-tile-image-fixtures.cjs执行未改写旧版生产函数生成48组对照（2插值×2链接×2活动帧×6尺寸），完整源RGBA、两帧表面hash/几何/实例坐标；新增原生grid同步、混合隐藏锁定层/链接蒙版、runtime共享、单笔历史及源/输出真实重开检查。实际Editor新增两类源的PixelDialog取消/提交/Undo/Redo与截图，独立--image-resize-check入口。首轮核心构建发现预算常量跨源码不可见，改为同一256Mi数值；尚待执行验收，不能以fixture生成代替测试通过。

本地Aseprite cmd_sprite_size.cpp为EULA源码，仅只读对照每源一次/uniqueCels、网格原点更新和事务worker取消架构，未复制。原生命令目前仍同步计算/安装，不宣称已消除大图像调整的全部卡顿；异步化及索引/灰度等全量迁移缺口仍INCOMPLETE。此前批准的长色板名称修复与覆盖已有，不重复改动。

核心最终tile-image-core-build-fixed.log构建退出0；tile-image-final-core-tests.log六项全部通过（16.96s）：image-resize、tile-image-resize、palette-library、tile-canvas-resize、large-resize、mask-resize。新套件实际执行48组旧版自由瓦片对照及96个源/输出重开、8组用户批准的网格同步（含16个源/输出重开和混合隐藏锁定普通层/链接蒙版）、24组runtime共享。tile-image-legacy-tests.log实际旧版document/free-tile两文件33项通过。来源707文件及证据覆盖通过，strict按全量缺口退出1。正式Release与窗口验收继续进行，尚未用核心通过代替UI证据。

最终tile-image-formal-build.log唯一正式Release构建退出0；tile-image-ui-tests.log的--image-resize-check退出0，实际两类资源PixelDialog取消/提交、资源身份与尺寸、链接owner、单笔Undo/Redo通过。运行前后正式exe SHA256一致：9667167402471B2222C9FF62D447C08C56E81DF7E1BCB10734844FEF5C56E9BA。已实际查看image-resize-grid-dialog.bmp、image-resize-grid-result.bmp、image-resize-free-result.bmp：默认2×下参数、内存提示和应用/取消按钮完整，无相互覆盖；12×8结果像素可见，原资源层/链接帧保留，历史新增一笔图像大小。视觉范围仅上述三个状态，不代表所有倍率、长时手工操作或整机FPS验收。

本轮保留所有既有未跟踪文件、用户工程/恢复数据与构建缓存，仅保存明确列出的源码、测试和来源/迁移记录。原生256px瓦片边长与同步图像计算等限制已明示，全量迁移继续INCOMPLETE；不会把来源检查覆盖或本批通过解释为所有性能问题已消失。

最终tile-image-final-provenance.log覆盖707文件并核对证据快照，退出0；strict仍因已登记全局缺口退出1。Node生成器语法与git diff --check通过。此阶段达到已声明原生限制内的定向验收状态，保存并推送dev；未操作main、版本号或发布产物。

### 2026-11-08：图像缩放采样性能阶段

延续980f5e84已完成的资源感知图像大小行为，本轮只优化原生重采样内核。实际核对legacy document-model.ts resizeSurfacePixels（已有坐标表）及free-tile.ts resizeFreeTilePixels；复用横轴预计算、逐行取样，普通RGBA保留原除法/加法顺序、straight RGBA及透明RGB，自由瓦片保留乘除顺序和预乘alpha插值，四个采样像素及alpha只读取/转换一次。4096列分段将额外临时表限制为最多64KiB，避免极宽矮表面产生随宽度扩张的大表。所有事务、资源身份、历史及用户批准的网格同步行为沿用上一阶段。

本地Aseprite src/doc/algorithm/resize_image.cpp头部MIT，仅只读对照按行采样及nearest/bilinear规则；其左上采样和边缘插值不同于MoonSprite旧版，不替换行为、不复制源码。冻结980f5e84优化前两个循环作为独立回归oracle，1600随机表面×2插值×3调用方式=9600组完整像素精确比较，包含自定义缩放/负偏移；另16组4095/4096/4097/8193列边界对照。计时只报告不设机器相关阈值。首轮内核、旧版33项和来源覆盖708文件已通过；完整核心/正式程序验收结果见下文，不以当前首轮结果替代整机流畅度验收。图像大小命令仍同步，工作线程取消及更大资源准入、索引/灰度等仍INCOMPLETE。

最终验收：resample-performance-build.log正式Release及四个定向目标构建退出0。resample-performance-core-tests.log四项全通过（image-resize、tile-image-resize、large-resize、mask-resize，5.61s）；包含实际旧版48组自由瓦片oracle、源/输出重开、网格同步、runtime共享和Undo/Redo既有套件。resample-performance-legacy.log旧版document/free-tile两文件33项通过。正式exe新进程PID51684 --image-resize-check退出0，两类资源原生弹窗取消/提交及历史链路通过；本轮未修改UI布局，未新增人工视觉验收，不把自动窗口诊断当成完整交互FPS测试。

构建完成后的resample-performance-kernel-final.log：1024×768→1537×1153每种三次平均，普通nearest9.013→2.934ms（3.07×）、普通smooth44.116→24.472ms（1.80×）、free nearest7.605→2.733ms（2.78×）、free smooth227.532→38.888ms（5.85×）。这些是分配输出及重采样内核实测，不能换算成全应用FPS或消除全部卡顿。精确9600+16组像素对照与既有文档历史检查通过。来源覆盖708文件/证据快照通过；strict退出1符合已知全量迁移缺口；git diff --check通过。保留所有既有未跟踪用户数据/构建文件，仅提交本阶段五个文件并推送dev，不发布生成物。

### 2026-11-08：图像大小后台任务完整链路（验收中）

承接上一轮采样内核优化，实际legacy resizeActiveImage/default参数/快照历史及free-tile source语义不变。复用原生SheetImportTask/RasterSnapshot模式新增ImageResizeTask：快照按2ms/1MiB UI tick采集，选区同样分段复制，worker只持独立timeline、选区与最小Document并运行既有resizeImage；取消按采样行/源瓦片边界检查，销毁不join。身份、revision/content、活动层/帧及选区几何/缓冲区身份变化拒绝提交；选区检查不在UI tick逐像素扫描。源数据256MiB快照准入先于采集；既有完整目标工作集预算在worker事务内执行。完成时转移worker产生的单笔Edit并使用live历史身份及live时间轴上下文。

实际原生应用“应用”启动timer，参数和重复提交冻结，取消/标题关闭保持可用并保留原文档，后台计算不占UI消息循环。旧同步核心入口继续供算法与工程测试复用。新增确定性队列/真实线程测试覆盖普通/网格/自由瓦片/蒙版、选区、取消各阶段、stale/销毁/dispatch失败、超限无变更与Undo/Redo；实际窗口诊断挂起真实提交任务、泵消息、移动/调整窗口并绘制，再取消和执行旧任务验证无污染。正在构建验收，不能称阶段已通过。

边界：快照构造仍复制时间轴、网格/实例等非像素元数据；提交复用同步applyEdit和历史存储，仍有表面复制/校验的耗时。取消不打断单次分配、元数据验证或渲染内部；不承诺所有主线程停顿消失。所有迁移仍INCOMPLETE。没有复制Aseprite EULA命令实现，沿用上一阶段只读架构对照。用户数据和所有既有未跟踪文件保留。

最终验收（2026-11-09）：image-resize-async-build.log唯一正式Release及定向目标构建退出0；测试夹具首次因缺少fromImported必需归档句柄失败，修正为空但非null归档后image-resize-async-core-rebuild.log和image-resize-async-core.log通过。image-resize-async-tests.log三项image-resize-task/image-resize/tile-image-resize全部通过（4.64s）；覆盖新异步生命周期、9600+16组采样对照和既有实际legacy资源/重开套件。正式新进程PID38324 --image-resize-check退出0，image-resize-async-ui.log记录；实际挂起提交worker时泵窗口消息、移动/调整尺寸/重绘、取消后执行被放弃job不改变文档，后续普通/网格/自由瓦片实际提交、资源身份和Undo/Redo通过。

已实际查看正式image-resize-busy.bmp：默认2×弹窗参数/比例/方法冻结，取消和关闭保留，底栏显示正在调整；窗口尺寸改变后弹窗和操作按钮可见无重叠。截图范围仅该忙碌态，不代表所有倍率和大工程最终安装阶段FPS验收。来源711文件及证据快照通过；strict仍按全局已知缺口退出1；git diff --check通过。保留既有未跟踪数据，提交本阶段13个源码/测试/来源及记录文件并推送dev；全量迁移仍INCOMPLETE。

### 2026-11-09：图像大小弹窗像素倍率识别（验收中）

实际定位legacy ImageResizeDialog.tsx detectScale、useAppDocumentDialogs onDetectScale、core/image-scale-detection.ts以及QuickCommandBar detectImageScale入口。旧版算法忽略全透明隐藏RGB，64行分块合成当前可见帧，边界相位统计+游程因数投票（上限512，支持阈值/平分优先大因子）及精确GCD fallback，不简化为只查整块。按仓库MoonSprite Source-Available License的源码修改/内部构建许可迁移，不复制第三方代码。

新增原生检测核心完整移植上述规则；扩展已有ImageResizeTask为检测模式，复用分段快照、独立worker、取消/stale/销毁保护；检测不提交Document，found只改草稿尺寸Math.round(source/scale)、最近邻与提示，notFound保持草稿，Apply调用既有后台图像大小历史。弹窗沿用原组件/2px与6px规范并复用旧版实际extractColors图标，保持比例与方法语义。单独QuickCommandBar UI整体尚未迁移，该独立入口未在本批伪称完成。

make-image-scale-fixtures.cjs执行未改写旧版导出函数，生成180组含alpha/noise/偏移/不同倍率真实oracle。首轮fixture vector大初始化导致Windows栈溢出exit0xC00000FD，改为constexpr只读像素数组后180组RGBA和64行原生合成均通过；不是修改算法掩盖失败。检测-only异步不写历史验证通过。正式Release及实际弹窗检测/Apply/Undo验收仍在进行，来源覆盖和自动通过不代表UI通过。

最终验收：image-scale-final-tests.log四项image-scale-detection/image-resize-task/image-resize/tile-image-resize全部通过（3.80s），180真实旧版oracle在RGBA和64行合成路径一致，异步检测不写历史、取消/stale拒绝覆盖和既有缩放资源/保存重开回归通过。image-scale-build.log正式Release退出0。首轮窗口诊断PID13764退出0后人工截图发现新按钮未登记modalControl导致不可见/不接鼠标，且失焦回调重置found提示；没有把直接Click回调成功当作UI通过。修复为登记原有模态绘制/输入路由，仅实际数值变化重置提示，完成检测刷新共享布局；扩充窗口断言检查按钮visible/bounds/modalControl及found提示。image-scale-ui-repair-build.log/image-scale-routing-build.log修复构建退出0，image-scale-ui-final.log PID13428退出0。

已实际查看修复后image-scale-found.bmp：默认2×按钮使用原extractColors像素图标可见，found“倍率4→6×4”、宽6/高4/25%、最近邻、应用/取消全显示，无相互覆盖。实际识别仅更新草稿、Apply后台提交一笔历史、Undo恢复完整像素、纯色notFound保持尺寸/历史通过；原有后台窗口移动/resize/paint和取消检查继续通过。来源覆盖716文件和证据快照通过，strict按已登记全量缺口退出1；生成器语法和git diff --check通过。此次未测全软件FPS，未迁移快捷指令栏单独入口；其它领域/索引灰度/扩展等仍INCOMPLETE，目标保持进行中。保留所有用户数据/既有未跟踪文件，仅提交明确本阶段文件并推送dev。

### 2026-11-09：快捷指令栏配置与停靠规则核心

定向承接上一阶段，实际读取file-preferences.ts完整快捷指令段、QuickCommandBar.tsx、edit.test.tsx及梯度遮挡hook。原生只有未启用的偏好目录，没有栏体；没有把单独detect入口冒充整栏迁移。新增独立quick_command_preferences核心，迁移38条命令身份与顺序、四组默认值、严格布尔/非法项/重复处理、UTF16名称trim及32单元截断、旧名称和四代默认组升级、ID避冲突及JSON保存往返；使用已有WinRT JSON适配。停靠计算承接最近边严格比较优先级、8边距、12中心吸附、28命令尺寸、同轴抓取偏移与换轴清偏移、空间不足居中。不激活偏好项，不改作品历史。

make-quick-command-fixtures.cjs执行旧文件未改写的独立配置段（仅去export与TypeScript类型），生成112组栏配置和6组命令配置oracle。首次测试捕获重复ID候选先规范化再去重的差异：旧版在索引越界默认名时即使候选重复也会全局回退，已调整顺序保留这一边界。最终Release独立目标构建退出0，CTest quick-command-preferences通过0.39s，配置对照/JSON往返/定制fallback和拖动边界检查通过。生成脚本语法、diff检查通过；来源覆盖721文件及证据快照通过，strict仍因已登记全局缺口退出1。

范围明确：本批是独立核心阶段，未接入运行偏好、实际栏体、38命令执行与状态、右键、焦点/文档路由、透明绘制及梯度遮挡；这些继续INCOMPLETE。没有更改正式exe，没有UI/截图/FPS验收，也不声称本批改善全软件卡顿。下一阶段从此核心接入完整原生栏体和现有命令，不重复扫描仓库。保留全部既有未跟踪用户数据及构建缓存，只提交本阶段源码、fixture、脚本和记录并推送dev。

### 2026-11-09：快捷指令栏原生运行接入（部分迁移）

承接78381727配置核心，新增实际四栏原生Widget及38条legacy metadata/图标映射；缺失图标从对应PixelUtilityIcon路径或quick-command SVG精确转换，来源登记。默认第一栏顶部折叠，其余关闭；展开、四边拖动、指针捕获与保留画布焦点、100ms按压反馈、半透明、隐藏、设置、右键填背景色/网格设置/外观偏好、层级与渐变确认控件重叠隐藏接入。原生15px公共图标按钮/2px关联间距，位置计算沿用上阶段旧版边缘算法，坐标先减物理视口原点再换逻辑空间；变化才更新几何/可见性/状态，不在拖动每步保存。栏体变更保存现有editor-preferences.txt中的独立JSON记录，不改作品历史。偏好接入全局显示/透明、四栏名称/位置、命令启用、默认恢复与偏好列表折叠；最后启用项不可关闭，开关命令按legacy启用项/切换项/关闭项重排。

复用已有菜单命令执行及available校验，缺失底层命令禁用并给出不可用提示，不冒充迁移完成。detectImageScale独立入口后台识别成功直接nearest缩放、不打开尺寸弹窗，仍复用已有分段快照/worker/stale保护与一笔历史；Esc取消，未找到倍率保持作品，直接检查Undo恢复。修复reserved quickCommands.bars.json误进catalog setter导致无法重开风险，并加实际RuntimeSettings往返测试。偏好名称最终提交重新同步JSON，避免失焦时序丢值。

验收：quick-command-ui-build.log首轮Release构建0；其间公共头变更造成首轮对象可能不一致，两次启动早期异常0xC0000409/0xC0000374，未认定通过。冻结头文件后quick-command-ui-final-build.log增量重编受影响对象并链接0。正式最终exe --quick-command-check PID42976=0、正常显示PID46192=0，覆盖鼠标消息展开、四边bounds、配置字段路由、镜像保持像素历史/选区、24x16倍率4直接6x4/单笔历史/Undo、挂起worker后Esc取消及执行废弃job无污染。--image-resize-check PID37568=0。四项quick-command-preferences/editor-preferences/image-scale-detection/image-resize-task全通过0.57s，360偏好目录检查通过。隐藏启动截图全黑已拒作视觉证据；实际查看正常显示Release/quick-command-bar.bmp：顶部展开16控件可见、旧图标/设置/移动无重叠。该截图只覆盖当前尺寸顶部栏，不代表所有屏幕/多栏/FPS验收。

尚未完成：命令排序拖柄、快捷键/完整描述tooltip、部分描边/粘贴/平铺底层命令、全多窗格活动文档与捕获丢失/取消边界完整审计；当前禁用项不算完成。完整快捷栏及全软件迁移仍INCOMPLETE，目标active。本批提交保存已验证运行接入阶段，后续优先补上述缺口，不重新全仓扫描。所有用户数据、恢复与原有未跟踪缓存保留。


### 2026-11-09：快捷指令排序拖柄与释放边界

承接40f22c15，移植PreferencesDialog实际reorderPreferenceItems并执行未改写TypeScript函数生成32组oracle。原生独立move素材拖柄与启用开关分离；只允许同栏、同enabled组排序，保持旧版分组边界；draft顺序统一驱动测量、布局与绘制。复用共享偏好滚动视口，16..32逻辑px边缘、每16ms滚动12逻辑px；这是旧版每栏滚动容器到原生共享视口的技术适配。松开、失焦、捕获丢失检查及Esc结束拖动；取消整个偏好丢弃草稿。关闭停靠时折叠指令列表，选择停靠边时展开。快捷栏mouseup立即清逻辑按下状态，100ms仅保留视觉反馈，避免重复释放再次执行。38条完整description沿用registry和zh-CN文案；shortcut身份已记录，当前用户绑定tooltip仍未接入。

验收：quick-command-order-build.log和quick-command-order-final-build.log正式Release/定向测试构建均退出0；四项quick-command-preferences/editor-preferences/image-scale-detection/image-resize-task通过（0.53s），包括112配置/6指令配置/32排序oracle。正式正常显示新进程PID6804 --quick-command-check退出0，覆盖实际MouseMessage拖动、顺序/行位置、capture释放、边缘滚动、偏好取消不持久化、重复mouseup不重复切换和既有后台识别/撤销/取消检查。实际查看Release/quick-command-preferences.bmp：默认2×拖柄/开关可见，垂直镜像已移动到水平镜像之前，无重叠，底部裁剪遵循共享视口。该图不代表1×、全部窗口尺寸或全软件FPS；自动滚动停顿/焦点切换等手动长时间交互尚未全面验收。来源覆盖726文件和偏好360项检查通过；strict仍须按全量缺口失败。

仍INCOMPLETE：当前用户快捷键tooltip、outline/quickOutline、部分paste/tileRepeat底层命令、多窗格活动文档语义及完整快捷栏交互审计。用户确认的网格瓦片同步缩放决定继续有效，既有image-resize回归记录已含同步网格资源路径；本批不另称完成新缩放功能。保留所有用户数据和原有未跟踪文件，只提交本阶段源码/测试/来源记录并推送dev。


### 2026-11-09：快捷栏完整说明与当前快捷键提示

实际对照QuickCommandBar commands tooltip、useAppShortcutSettings shortcutFor、shortcuts.ts shortcutPrimary/shortcutDisplayText及zh-CN：显示标题、完整说明和当前第一个绑定，空绑定不显示，鼠标/滚轮部分使用旧版中文名称，不擅自显示全部备用绑定。复用现有快捷键模型默认/覆盖/显式清空规则；Widget Property持有绑定查询回调，不复制绑定、不改变Editor布局。展开/折叠提示随状态更新，设置/移动说明使用旧版原文。复用Aseprite UI MIT许可Property/TooltipManager公开接口，未复制EULA业务代码；与既有提示一样仅内容变化时替换，避免每次refresh重建注册。

验收：quick-command-tooltip-build.log与quick-command-tooltip-final-build.log正式唯一Release构建0。quick-command-preferences/editor-preferences/shortcuts三项通过1.10s；正式正常显示进程PID41176 --quick-command-check退出0，实际TooltipManager内容覆盖自定义Ctrl+MouseBack中文显示、首项而非第二F8、显式清空、默认恢复和既有排序/捕获/后台识别撤销取消回归。来源覆盖727文件和证据快照通过。未捕获真实hover弹出窗口截图，不把字符串检查称为字体/布局视觉验收。

本轮定向核对平铺发现它同时影响跨边界绘制、选区提交、瓦片命中和合成缓存；不能只绘制副本就标完整。平铺完整链路、outline/quickOutline、特殊粘贴、多窗格等仍INCOMPLETE，目标保持active。所有原有未跟踪用户数据和缓存保留；本提示链路阶段单独提交推送dev。


### 2026-11-09：特殊粘贴原生事务与入口

实际读取workspace-commands-clipboard.ts pasteSelection/pasteAsNewLayer/pasteClipboard、workspace.test.ts新层置于活动层上方和粘贴后立即变换用例、AppMenuBar/QuickCommandBar入口。新增pastePixelsAsNewLayer复用现有GroupEdit结构事务：原生top-first顺序插在活动层前，继承group，保留剪贴板尺寸/偏移及画布外像素，mask非1像素清零，其他帧使用1px空表面，选中新层与矩形选区并进入选择工具。单笔历史恢复层、帧/组选择、像素选区和枢轴、附加蒙版编辑上下文；256MiB工作集在修改前准入。新层不使用新建层+普通粘贴多笔历史组合。

显式当前单元格命令绕过色板/帧剪贴板路由，复用既有浮动粘贴/自由瓦片像素路径，无像素时回退整层剪贴板。新层命令复用结构剪贴板外部图像baseline优先级，保留内部层/组/资源迁移。菜单、快捷栏和既有Ctrl+Shift+V目录自动接通；默认粘贴目标偏好新增实际consumer与存储启用，普通粘贴按0/1/2分流当前单元格/新层/新项目，色板scope沿用原生既有路由。没有引入新UI或新图标。

验收：首轮special-paste-ui-build.log链接失败LNK2001，原因构建时新枢轴接口与旧核心对象不一致；未运行该产物。冻结接口后special-paste-final-build.log正式Release与核心/偏好目标构建0。document-layer-groups/editor-preferences/quick-command-preferences三项通过0.43s，包含新增组继承/上方插入/画布外像素/mask/其他帧空白/单笔UndoRedo/枢轴/非法payload不变更与偏好存储往返。正式正常显示--quick-command-check PID2996退出0，实际菜单Click验证色板和帧选择状态下特殊粘贴、新层一笔历史、当前格浮动目标、内部整层优先、更新外部像素优先以及默认目标new-layer。既有排序/快捷键提示/后台检测撤销取消诊断一并通过。没有新增布局，未新增截图验收，不把此次运行称为全部剪贴板/全软件FPS验收。

边界：索引/灰度色彩模式全局仍未迁移；默认new-project分支复用现有独立新项目入口，未另测该偏好组合；完整变换后双重Undo、全部自由瓦片/蒙版特殊粘贴组合仍需扩大验收。平铺、描边、多窗格等继续INCOMPLETE，目标active。来源727文件与证据快照通过，strict按已知全量缺口失败。保留所有既有未跟踪文件和用户数据，只提交本阶段文件并推送dev。


### 2026-11-09：特殊粘贴变换、蒙版与新项目路由验收

承接1a39a3be，沿用旧版workspace.test.ts“transforms a newly pasted layer immediately and restores its placement through undo”输入链路补齐原生回归：1px新层粘贴立即变为2×2，连续撤销恢复原层与原选区，再连续重做恢复变换像素。新增隔离附加蒙版编辑态中新层粘贴、退出编辑、撤销恢复原蒙版身份/隔离状态、重做再退出；初始fixture原层没有像素，createAttachedMask按既有规则拒绝，修正为有像素owner后通过，未改变生产语义。

检查发现新层粘贴为保存蒙版编辑上下文额外设置beforeMasks/afterMasks，重复复制整套蒙版；改用已有MaskContextHistory仅保存身份/隔离状态。通用GroupEdit结构快照仍含蒙版，未声称消除所有复制或全应用卡顿。默认粘贴目标new-project实际窗口诊断补齐，检查新增标签、2×1尺寸、全新项目无可撤销历史；复用既有new-document剪贴板reader，不访问用户系统剪贴板。

special-paste-interaction-final-build.log唯一正式Release与定向目标构建0；document-layer-groups/editor-preferences/quick-command-preferences全通过0.42s。正式正常显示--quick-command-check PID48924退出0，包括new-project偏好路由和既有新层/当前格、内外剪贴板优先级、快捷栏排序/提示及后台检测回归。未改UI布局，无新增截图或耗时计量，不宣称全部模式/组合验收完成。来源覆盖与strict结果见本次检查，全量依然INCOMPLETE；保留用户数据及所有既有未跟踪文件，本阶段提交推送dev。


### 2026-11-09：描边采样核心与旧版精确对照（整项未完成）

定向读取tools-outline.ts outlinePixelSamples/outlineSelectionBoundary、outline-settings.ts及selection-effects实际调用。完整移植内容采样的inside/outside/both、round/square/horizontal/vertical、8方向、透明/背景/指定源匹配、选区内候选优先及无空间时外侧回退、距离/扫描rank参考色选择、Map插入顺序；另移植选区自身边界采样、智能颜色暗度与跟随透明度。默认圆核/正交方向承接legacy。原生使用Surface世界坐标读取，保留稀疏偏移存储，不使用不同语义的LayerStyleSampler替代。尚未进入Document提交、批量目标、参数持久化、弹窗或菜单执行，所有描边按钮继续原状态，不能称整项描边迁移完成。

make-outline-sample-fixtures.cjs执行实际未改写旧版函数体，RGBA读取/选区/历史写入以独立适配器提供，生成768内容采样+120边界+120颜色oracle。原生逐项比较像素索引、顺序和参考颜色，并将同一图像移入负偏移稀疏Surface再次比较。首轮测试夹具因using namespace位于include之后编译失败，已修正，无生产行为变更。outline-samples-final-build.log独立Release目标构建0，CTest outline-samples通过0.17s；不涉及正式exe更新、窗口或视觉/FPS验收。该批是有测试证据的算法基础阶段，全功能迁移仍INCOMPLETE；后续必须接通历史与运行入口，不用核心通过代替整项完成。保留既有用户数据及未跟踪缓存，阶段保存推送dev。


### 2026-11-09：描边文档事务与批量目标（整项仍未完成）

在采样核心基础上对照 tools-outline.ts、workspace-commands-selection-effects.ts、workspace-selection-effects-support.ts 和 workspace-session.ts 接入 Document::outlinePixels。选中 Cel 优先，显式层/组按现有层选择展开；只选帧时处理全部可见未锁普通层。显式隐藏层允许处理，非普通层先排除，锁定目标整笔拒绝；共享链接存储只处理一次。候选与表面扩展在提交前构造，保留画布外像素，最终复用 surfaceChanges 一笔历史。增加保守256MiB工作集准入；未计时，不代表交互性能已验收。透明描边直接保留隐藏RGB，其他颜色沿用既有 brushComposite。

首次增量构建因误用C++20 erase_if失败，已改为仓库C++17支持的remove_if/erase。outline-document-final-build.log最终两个Release测试目标构建退出0；outline-document与outline-samples均通过，总0.08s。新增回归覆盖两层一笔UndoRedo、锁定整笔拒绝、显式隐藏层、帧选择所有可编辑层、空操作、部分透明度、透明RGB；原有链接帧与空白选区边界回归继续通过。未构建正式exe，未接UI或进行窗口/视觉/FPS验收。

明确INCOMPLETE：活动蒙版及maskRows当前拒绝以免修改派生像素，蒙版权威适配、缺失活动Cel创建、完整组/蒙版组合、描边设置持久化、弹窗、菜单/快捷指令、索引/灰度模式仍待迁移。该阶段仅完成普通像素事务基础，不宣称描边或全量迁移完成。保留原有未跟踪文件、恢复数据与缓存；本阶段提交推送dev。


### 2026-11-09：描边入口集成与持久化（本阶段已验收）

承接216ca915，继续补齐活动与所选蒙版的权威灰度资源写入、链接根去重、整笔锁定预检、缺失活动Cel的边界描边。missing Cel撤销沿用普通绘制保留空Cel身份的语义。接入工程outlineSettings解码/编码、DocumentSnapshot、回档payload以及软件默认参数，普通像素Undo保留参数。菜单outline/quickOutline、快捷栏及S独立内部边界描边已接入；快捷描边用当前前景色并关闭智能色相，S不覆盖保存的位置。原生PixelDialog复用共享标题与颜色弹窗，旧版6个形状/方向SVG经现有转换脚本保留像素形状及alpha；没有新图标。

预览采用隔离文档和后台任务，40ms合并参数变化、取消标记及文档身份/版本/选择校验，预览不入历史，应用复用一笔原生事务；关闭取消计算并恢复显示。仍有捕获时元数据与surface快照复制成本，未做大作品FPS计量，不能宣称消除全部卡顿。

五项定向测试outline-samples/outline-document/document-snapshot/project-import/attached-masks通过0.26s，涵盖保存重开、snapshot/rollback、蒙版链接、稀疏画布外像素、预览取消/单笔提交/过时结果拒绝。正式Release构建退出0，--outline-check最终退出0。窗口回归覆盖当前前景色快捷描边、预览关闭、取消不改文档、应用一笔历史、Undo/Redo、S边界描边不覆盖保存参数、蒙版不误写图层。验收中先修正测试早于40ms调度的问题，再修复独立S命令被Commands::bind拒绝的实际缺陷。截图已查看，布局无重叠，颜色按钮采用纯色块；共享颜色弹窗交互及大作品耗时尚未全面验收。全软件仍INCOMPLETE，尤其索引/灰度模式等全局缺口。

用户已确认网格瓦片图像大小采用同步缩放修复：同步瓦片源与网格瓦片尺寸，保留单元格、资源ID及撤销；该行为此前已在2026-11-08瓦片图像大小阶段实现并验收（980f5e84及后续阶段）；本描边阶段没有新增该行为。此前交接中“尚未实现”的表述已纠正。


### 2026-11-09：平铺视图与几何迁移（本阶段验证通过，完整编辑仍未完成）

核对旧版tilemap.ts、canvas-render-frame/background/content、workspace-commands-view和QuickCommandBar。固定相邻3/9份，off不改当前缩放，开启按旋转后的整体包围范围fit并居中，快捷栏同项再次点击关闭，菜单直接设置状态；每工程独立且按document identity隔离。所有副本复用一次合成和一次上传的既有CanvasRenderer缓存，棋盘格复用2×2纹理；格线、既有画布overlay按同一副本周期绘制。新增正模坐标映射、选区折叠和fit几何完整port，执行实际旧版函数生成512组坐标/fit及512组矩形/掩码选区oracle，CTest通过。

明确INCOMPLETE：上述输入几何尚未接入全部绘图工具、跨缝笔触、浮动选区及tilemap输入，不将显示副本称作完整无缝编辑。tile-repeat-build/final-build/runtime-build最终均退出0；--tile-repeat-check退出0，覆盖菜单与快捷指令支持、快捷栏再次点击关闭、旋转fit、会话恢复、关闭不改缩放、像素/历史/revision/dirty不变、切换不增加upload，以及九份离屏副本中心像素。最初同步诊断截图黑屏，已改到真实事件循环180ms定时器执行，第二次实际查看tile-repeat-smoke.bmp完整3×3图案，未将首次黑屏记作视觉通过。CTest tile-repeat与quick-command-preferences共2项通过0.44s；来源覆盖741文件通过，strict继续因全局缺口失败。没有进行所有工具跨缝编辑或FPS验收。全量迁移保持INCOMPLETE。


### 2026-11-09：平铺跨边笔刷与框选（本阶段验证通过）

沿用tools-brush.ts/canvas-raster-stroke.ts的连续笔触坐标、中心折回、先对称后正模与选区约束次序。普通/图片/动态笔刷与完美像素tail复用同一pending事务，不在缝处提交新历史；visitBrushLine仅重复模式绕开画布范围剪枝，关闭模式保留原路径。预览同样加入重复模式，框选按局部旋转遮罩生成后折回，限制64Mi像素草稿预算。新回归覆盖跨缝不连中间、单笔UndoRedo、透明度、负坐标、取消、蒙版、图片笔刷及预览一致性；正式--tile-repeat-check退出0，真实鼠标跨右缝绘画仅写入两侧对应像素、单笔历史、Undo空白与Redo通过；跨缝框选折回通过。首轮在编译中变更接口导致链接旧符号，已冻结后定向重编；不得将此首轮记为通过。

未完成：瓦片paint、自由源编辑、套索/选择笔刷、浮动粘贴和其余工具跨缝语义。全软件迁移仍INCOMPLETE。

验收：tile-repeat-input-formal-build.log正式Release构建退出0；tile-repeat/tile-repeat-stroke/brush-dynamics/image-brush/symmetry-model五项定向CTest通过0.15s。测试首轮空层无法创建附加蒙版，修正fixture先写入像素后通过，未改变生产规则。来源覆盖742文件通过；strict仍因已登记全量迁移缺口失败。不将此阶段称作全工具跨缝编辑或大作品FPS验收。保留全部既有用户数据与未跟踪缓存，本阶段单独提交推送dev。


### 2026-11-09：平铺自由套索与选择笔刷（本阶段验证通过）

对照repeated-selection.ts及其测试、smooth-brush.ts collectSmoothBrushArea和canvas-selection-brush-gesture.ts。自由套索逐副本平移路径，在画布范围内栅格化并合并，避免按远距离路径包围框分配遮罩；选择笔刷保持原连续采样与行跨段缓存，逐像素折回，非重复轴裁剪，关闭平铺时原outsidePreview语义保留。套索预览与提交共用折回输入，之后沿用既有对称、模式合并与单笔选区历史；选择笔刷显示与提交使用相同coverage。旧版多边形套索独立逻辑保持不变，没有擅自扩大其平铺行为。

CTest tile-repeat通过，含此前1024旧版几何oracle及直接沿用旧版repeated-selection.test.ts的X/Y/Both远处副本、缝两侧不选中间、整笔刷与非重复轴裁剪、关闭时画布外预览回归。正式程序已增加真实pointer套索/选择笔刷、单笔历史Undo/Redo及取消诊断，tile-repeat-selection-build.log正式Release构建退出0，--tile-repeat-check退出0；真实鼠标套索与选择笔刷跨缝仅选择两侧、单笔历史、Undo/Redo及取消通过。CTest tile-repeat与selection-interactions均通过，共2.59s。来源覆盖742文件及证据快照检查通过。未新增截图或测量FPS，不把窗口断言称为视觉验收；浮动选区移动/提交和其他工具仍INCOMPLETE。


### 2026-11-09：浮动选区平铺平移（本阶段验证通过）

实际核对tools-selection-transform-translation.ts与workspace-commands-selection-floating.ts。仅纯平移折回目标像素，沿用不可变目标baseline与先清源后合成次序；旋转/缩放保持既有路径。普通即时/稀疏/多目标、延迟region overlay和脏区已接入；延迟确认避开整表面offset移动捷径，缺失Cel的跨缝历史禁用仅按未折回矩形记录的dense路径；提交后才折回选区，拖动期间保留控制框。蒙版权威表面平移保留原灰度覆盖语义，重复时禁用整表面offset捷径。视图模式由refresh同步，不保存为工程内容。

核心回归包含X/Y/Both、copy/move、300×300实际deferred分支、取消、Undo/Redo、剪贴板跨缝、双图层和蒙版。首轮蒙版fixture为空导致无像素变化，修正先写入灰度；多层Undo恢复活动层，fixture重新选择目标层后读取，两者没有修改生产规则。最终定向测试程序退出0。tile-repeat-floating-formal-build.log正式Release及runtime重编退出0；--tile-repeat-check最终退出0。首轮真实pointer断言失败，详细输出证明两侧像素正确而历史多一笔；核对既有Enter确认后取消选区行为，修正诊断为两次Undo/Redo分别恢复选区与内容，不改变生产交互。关闭测试fixture智能对齐，确保测量指定3px拖动。tile-repeat/tile-repeat-stroke/selection-interactions三项CTest通过2.59s；新增半透明baseline和缺失Cel预览/创建/UndoRedo测试通过。缺失Cel初始fixture用删除命令仍保留空Cel、fromImported拒绝该结构，最终沿用既有RasterHistoryFixture访问构造实际缺失slot。来源742文件覆盖和证据快照通过，未新增截图或FPS验收。自由瓦片实例、paint格子等重复语义仍未完成，全量目标保持active。


### 2026-11-09：平铺瓦片Paint笔触与真实输入（本阶段验证通过）

核对canvas-input-tile.ts beginTile/moveTile及tilemap.ts tilemapCellLineIndices：局部坐标命中网格后，重复轴采用严格大于半轴长度时的短路径，半轴相等不改方向，遍历单元折回后再走原对称/选区限制及增量资源缓存事务。与普通像素连续路径不同，没有擅自统一两者。保留关闭模式原裁剪路径，移动时非重复轴越界样本不更新上次有效位置。旧版Paint单元移动仍裁剪，不以“未折回”误记该行为为迁移缺口。

新增256组直接执行实际旧版tilemapCellLineIndices生成的oracle，原生使用真实Document Paint擦除事务逐项核对目标格、单笔历史及UndoRedo，涵盖off/X/Y/Both、奇数网格与半轴边界。补充绘制/取消不改资源表回归。首次正式鼠标检查发现Paint入口根本没有开启：editor_input仅接受rasterToolsAvailable，该函数排除了tilemap。已接通ordinaryBrushTool下瓦片层，保留mask/组选中/锁定/可见性检查，Document继续执行各模式准入。正式--tile-repeat-check最终退出0，真实跨缝擦除两侧而不清中间、单笔UndoRedo通过。

扩大运行tilemap-document发现三个早期过时断言：整画布宽度粘贴箭头移动按实际旧版应clamp不移动、混合工程普通raster移动已迁移、用户确认的瓦片图像大小已迁移。更新为现有行为和取消/缩放Undo检查，没有回退生产功能以满足旧断言。tile-repeat-paint-core/formal/input/fixture构建最终退出0；四项tile-repeat/tile-repeat-stroke/selection-interactions/tilemap-document通过2.77s；来源742文件和证据快照通过。未新增截图或FPS计量，全工具平铺、自由瓦片等仍INCOMPLETE。保留全部用户数据与既有未跟踪缓存，本阶段提交推送dev。


### 2026-11-09：平铺副本自由瓦片源笔刷（阶段完成，整体未完成）

对照 canvas-pointer-down、canvas-input-free-tile-edit 和 canvas-input-stroke：源笔刷起点先映射回主画布，再命中实例、选择源和分配临时画布；捕获本笔平铺模式，普通/动态移动逐样本映射。临时源画布、笔刷覆盖范围、喷枪粒子、填充、形状和渐变不套用该指针映射。保留旧版接缝连接两个本地端点、共享源事务、实例身份、取消及单笔UndoRedo。避免副本坐标被误当作源画布外坐标造成额外扩张；没有FPS或内存计量，不宣称整体性能验收。

新增X/Y/Both、普通/动态、像素完美组合对比主画布与副本的像素/资源，检查实例不变、取消、单笔历史及UndoRedo，另检查旧版接缝穿过内部的语义。正式 --tile-repeat-check 新增实际副本鼠标绘画、像素、实例、历史与UndoRedo，退出0。free-source-repeat-core-build.log、free-source-repeat-formal-build.log、free-source-repeat-project-build.log构建均退出0。三项CTest tile-repeat/tile-repeat-stroke/free-tile-project 全通过11.98s。首次项目回归暴露旧roundtrip仍要求已迁移的自由瓦片图像缩放失败；仅更新为成功缩放及精确Undo，保留无实例目标变换拒绝、无选区删除拒绝和派生缓存保护。中途测试误将无实例目标写为允许变换，已按实际目标条件恢复拒绝；无生产变换调整。

来源登记742文件覆盖及快照通过。其他平铺工具、自由实例路径及全量迁移仍INCOMPLETE；未新增视觉/FPS验收。保留既有未跟踪文件、用户工程、恢复和构建缓存。


### 2026-11-09：平铺自由瓦片放置与实例擦除（阶段完成）

对照 canvas-input-free-tile.ts beginFreeTile/moveFreeTileDraw/endFreeTileDraw 和 canvas-pointer-down 本地点：放置是单击事务，不因拖动追加实例；擦除逐事件使用localPointAt(...,true)，插值连接两个本地端点。原生processFreeTileInput起点和擦除移动改用现有repeat::map，保留文档identity检查、非平铺轴越界跳过；仅映射指针，实例位置/尺寸、选区、对称及Document缓存/历史事务保持原路径。无平铺继续保留世界坐标，实例移动仍走已有独立路径。

正式鼠标诊断覆盖X/Y/Both副本单击、拖动不连续盖章、正确本地实例位置与像素、Escape恢复、擦除单笔历史和UndoRedo；额外8实例接缝擦除检查旧版内部连线、Escape及UndoRedo。free-placement-repeat-build.log正式Release构建退出0；Start-Process等待正式exe --tile-repeat-check并读取ExitCode为0。三项CTest tile-repeat/tile-repeat-stroke/free-tile-project通过12.41s。此前PowerShell直接调用GUI程序不能可靠取得退出码，未将该次调用作为验收，改以明确进程句柄等待结果。

未进行新视觉/FPS验收，不宣称实例移动/全部平铺工具或整体迁移完成。保留所有既有未跟踪文件和用户数据；阶段保存并推送dev。


### 2026-11-09：平铺副本自由瓦片实例移动（阶段完成）

定向核对canvas-pointer-down localPoint、canvas-pointer-move allowOutsideCopies及canvas-input-free-tile beginInstanceMove/moveInstance。独立实例移动使用有限相邻副本的本地坐标差，不使用选区内容移动的连续副本坐标。原生副本起点先映射后命中并记录本地moveStart；移动/约束键刷新映射有限副本本地点，复用既有多实例事务和constrainedSelectionDelta。越出副本或非平铺轴时不更新预览，松开仍结算并释放捕获；保留无平铺坐标、源资源及现有锁/隐藏筛选。

运行诊断覆盖X/Y/Both副本命中、跨接缝本地跳变、资源不变、实例/像素UndoRedo、Escape恢复、单击无历史、外层副本越界忽略并释放捕获、Shift轴约束及Undo。首轮诊断错误地从最右副本越到允许范围外却期待移动，实际保持原位正确；更正为相邻副本接缝，并新增越界无操作检查。free-instance-repeat-build.log最终正式Release构建0；Start-Process明确等待 --tile-repeat-check ExitCode0。三项CTest tile-repeat/tile-repeat-stroke/free-tile-project 通过12.20s；随后只扩充运行诊断并再次构建/运行通过。742来源登记快照通过，git diff --check通过。

未新增视觉/FPS测量；选区内容实例移动、其他平铺工具及整体迁移仍需继续，不能以本阶段代替全量完成。保留既有用户数据与缓存，失败诊断文本留在未跟踪文件中，不提交生成物。阶段提交推送dev。


### 2026-11-09：整实例选区拖动的平铺接缝语义（阶段验证完成）

核对canvas-input-selection-begin发现onlySelectedFreeTileInstance分支在登记tileRepeatStart前提前返回。故canvas-input-free-tile moveFreeTileSelection虽支持重复连续起点，整实例分支实际仍使用localPoint差；不能因通用move-content有连续坐标便自行更改旧行为。原生只对freeTileSelectionPlacementMoving的移动端点做repeat::map(...,true)，再复用现有对称、轴约束、对齐及Document整实例事务。普通像素和部分源编辑保持既有路径。选区按画布裁剪，松开自动提交，取消及UndoRedo恢复选区和实例。

运行诊断以主画布选区开始，分别X/Y/Both跨接缝，比较实际本地实例位移、裁剪mask、释放一笔历史、像素/实例/选区UndoRedo与Escape。free-selection-repeat-build.log正式Release构建0；显式等待 --tile-repeat-check进程ExitCode0。三项CTest tile-repeat/tile-repeat-stroke/free-tile-project通过12.37s，742文件来源快照覆盖通过，diff检查通过。未新增视觉/FPS验收。

明确边界：副本起点的选区命中、部分源变换及其他工具尚需继续核对；不能将这条完成的拖动事务称全部平铺或整体迁移完成。保留用户文件及未跟踪数据。阶段保存推送dev。


### 2026-11-09：平铺喷枪输入、粒子覆盖与预览（阶段完成）

对照canvas-input-stroke beginAirbrush/moveAirbrush、canvas-pointer-move、canvas-input-free-tile-edit和useCanvasStrokeClock。普通与源编辑喷枪中心使用有限相邻副本的本地点，移到无效采样处保留上一中心；普通层paintBrush使用repeat mode，粒子覆盖先对称再映射；自由瓦片源只映射中心，临时源画布、粒子和足迹不环绕。原生通过beginStroke传入identity匹配的模式，普通sprayStroke复用strokeSymmetryPoints；源编辑继续复用无平铺临时Document。计时器追赶上限、变化时才发布共享源、单笔历史与取消链路保留。

喷枪预览按canvas-render-airbrush使用本地中心/覆盖映射，并在各可见副本裁剪绘制。已有预览样式和源显示采样方式沿用；没有截图或逐像素预览验收，不宣称完整视觉等价。核心回归增加X/Y/Both方形粒子边缘覆盖及UndoRedo。实际鼠标诊断固定随机种子，比较普通层/自由源主画布与X/Y/Both副本的完整像素，手动执行持续喷绘批次，验证释放单笔历史、UndoRedo、Escape恢复。airbrush-repeat-build.log及airbrush-repeat-preview-build.log正式Release构建0，显式等待 --tile-repeat-check退出0。三项CTest tile-repeat/tile-repeat-stroke/free-tile-project通过12.17s。没有FPS/内存测量。

其余平铺工具、选区副本命中及全量迁移仍INCOMPLETE；本阶段只验收以上喷枪路径。来源登记和快照检查继续执行，保留所有用户文件与未跟踪数据，阶段保存推送dev。


### 2026-11-09：平铺副本桶填充输入（阶段完成）

对照canvas-pointer-down localPoint、canvas-input-fill beginFill和canvas-input-free-tile-edit：桶填充种子先映射到有限相邻副本的本地点，再进行网格吸附；连通区域不添加首尾环绕邻接。原生入口映射种子后直接复用既有fillPatternPixels，保留纯色/纹理原点、连续/非连续、选区、自由源资源提交及按下提交/Escape撤销行为。未修改填充算法或扩展其他工具语义。

实际鼠标诊断逐项比较普通像素层与自由瓦片源、纯色与Cracks纹理、连续/非连续、X/Y/Both副本和本地输入的完整像素；检查选区限制、连续填充不跨分隔区域、单笔历史、UndoRedo及Escape。bucket-repeat-build.log正式Release构建0，显式等待 --tile-repeat-check进程退出0；三项CTest tile-repeat/tile-repeat-stroke/free-tile-project通过12.11s。742文件来源登记快照和diff检查通过。未做新截图/FPS验收。

其余平铺工具、渐变/形状及选区副本命中和全量迁移仍需继续。保留未跟踪文件、工程和缓存；阶段提交推送dev。


### 2026-11-09：平铺渐变副本输入（阶段完成）

对照canvas-pointer-down/move的localPoint和canvas-input-fill moveGradient、自由源渐变入口，渐变起点、拖动及待确认手柄使用本地坐标后网格吸附。原生仅gradientTool路径映射有限副本坐标，避免改变形状等未迁移工具；无效移动不更新几何，外侧释放保留现有终点并结算。现有区域识别、选区限制、自由源事务、线性/径向几何、确认、取消和历史复用。

实际鼠标诊断比较普通层/自由瓦片源、线性/径向、直接应用/Enter确认、X/Y/Both主画布和副本的完整像素，验证待确认无历史、应用一笔、UndoRedo及Escape。gradient-repeat-build.log正式Release构建0，显式等待 --tile-repeat-check ExitCode0；三项CTest tile-repeat/tile-repeat-stroke/free-tile-project通过12.09s。来源登记742文件快照及diff检查通过。手柄坐标复用同一映射，但本轮没有新增手柄拖动或越界释放专门运行回归，也没有新截图/FPS测量。

其余平铺工具与全部迁移仍未完成。保留用户数据及未跟踪文件；阶段提交推送dev。


### 2026-11-09：渐变待确认手柄与越界释放（阶段完成）

补齐上一阶段未实测的手柄链路。发现无效副本释放时以gradientSpec.end充当指针，在线性起点/径向中心拖动中会重新计算错误位移。现在无效释放完全跳过几何更新，只结算拖动、保留最后有效几何并释放捕获，承接legacy localPoint无效采样不更新的行为。

新增X/Y/Both线性起点/径向中心实际鼠标诊断：副本命中、本地位移、越界移动及释放保持起终点、待确认无历史、手柄Escape恢复先前几何、Enter一笔提交和像素UndoRedo。首轮径向测试误用start作为径向中心，已改用resolveGradientGeometry的实际中心，生产几何未调整。gradient-handles-repeat-build.log最终正式构建0，显式等待 --tile-repeat-check退出0。三项CTest tile-repeat/tile-repeat-stroke/free-tile-project通过12.06s，随后只修正运行诊断并重建运行通过。无新截图/FPS验收；整体迁移仍INCOMPLETE。用户数据与未跟踪文件保留，阶段提交推送dev。


### 2026-11-09：平铺形状与线条副本输入（阶段完成）

核对canvas-input-shape begin/move/end、canvas-input-free-tile-edit及pointer-down/move：形状几何使用有限副本本地指针，之后应用网格/约束；不自行添加矩形等足迹环绕。原生shapeTool路径映射本地点，直线使用映射后的未吸附端点进入既有约束与吸附，其他形状继续drawPoint。无效移动忽略，释放沿用上次shapePointer。Document普通/自由源事务、曲线多阶段、多边形路径和历史保留。

实际鼠标诊断覆盖普通层/自由瓦片源、矩形/矩形轮廓/椭圆/椭圆轮廓/直线/自由形状/多边形/曲线、X/Y/Both主画布和副本完整像素相等、单笔提交、UndoRedo及Escape。多边形和曲线最终调用现有finish方法收尾，不能作为独立结束按键验收。shapes-repeat-build.log正式Release构建0，显式等待 --tile-repeat-check退出0；三项CTest tile-repeat/tile-repeat-stroke/free-tile-project通过12.20s。未新增截图/FPS或越界释放专项检查，全部迁移仍INCOMPLETE。保留用户数据、工程及未跟踪文件，阶段保存推送dev。


### 2026-11-09：平铺副本取色与放大镜（阶段完成）

核对canvas-pointer-move、canvas-input-sampling、useCanvasViewportGeometry、useCanvasEyedropperMagnifier和eyedropper-source：采样使用有限相邻副本本地点，越界移动不改变颜色；放大镜以连续本地点为中心，邻域不额外环绕。原生共享sampleEyedropperAt入口完成坐标适配，普通/临时取色、替换色和颜色编辑器采样复用该入口；放大镜同步映射中心及采样色环。未修改取色来源、左右键目标和结束策略。

实际鼠标诊断覆盖X/Y/Both、合成/当前层、前景/背景色、拖动更新、外侧副本忽略、释放捕获、内容及历史不变，并逐像素比较主画布/副本放大镜。首轮自动适配缩放使两次物理鼠标落点有亚像素差异，诊断改用整数像素缩放后通过；生产缩放逻辑未变。eyedropper-repeat-build.log正式Release构建0，显式等待 --tile-repeat-check退出0。三项CTest eyedropper/tile-repeat/tile-repeat-stroke通过0.37s，742文件来源快照检查通过。替换色/颜色编辑器仅核对共享调用链，没有新增其平铺UI专用回归；旧版放大镜逐帧合并性能方案仍未在此阶段迁移，也没有FPS测量。全量迁移仍INCOMPLETE，保留用户及未跟踪数据，阶段提交推送dev。


### 2026-11-09：取色放大镜绘制合并与区域缓存（阶段完成）

承接useCanvasEyedropperMagnifier的pending RAF与source-region cache。原生首个预览立即生成，后续指针事件只覆盖待绘指针/颜色，在paintEyedropperLens消费一次；越界不覆盖有效请求，结束清除待绘，失去手势/表面时不消费旧请求。编辑器所有的Property保存状态，随编辑器销毁，无额外计时器和全局回调。25×25采样区域按工程identity/revision、帧、图层、取色来源及区域起点缓存。原生颜色提交继续同步，保留当前弹窗消费时序；本阶段没有迁移legacy的延迟颜色提交，不宣称所有采样性能路径完成。

X/Y/Both合成/当前层及左右键实际诊断验证100次preview请求不发生同步渲染，绘制时仅渲染一次，同区域复用采样缓存，移动区域重新读取，主画布/副本逐像素一致，结束后不重放待绘。正式Release构建成功；--tile-repeat-check退出0。--sampling-zoom-check最初依赖用户保存的放大镜关闭偏好，check15失败；诊断显式启用放大镜而不持久化偏好后正式重建、诊断退出0。三项CTest eyedropper/tile-repeat/tile-repeat-stroke通过0.14s，742文件来源登记快照及diff检查通过。未测FPS，修订/帧/层等缓存键仅源码核对，没有新增逐一失效运行场景。全量迁移仍INCOMPLETE；用户数据、构建缓存和未跟踪文件保留，阶段提交推送dev。


### 2026-11-09：平铺平滑工具输入、预览与事务（阶段完成）

对照canvas-input-stroke begin/move/endSmooth、pointer-move/up及smooth-brush collect实际调用：平滑入口使用有限相邻副本localPoint，collect未传repeat参数，因此笔刷范围裁剪、跨接缝连接本地端点，不擅自添加环绕足迹/邻域。free-tile专用入口不支持smooth，通用入口拒绝kind图层，原生继续拒绝自由/网格瓦片层。原生映射按下与拖动本地点，忽略越界移动，越界释放按最后本地点结算已有收集；覆盖预览映射本地点并在各副本裁剪绘制。既有选区、动态参数、延迟应用及Document算法保持。

正式Release构建成功，显式等待 --tile-repeat-check退出0。实际鼠标覆盖X/Y/Both、Round/Square/Line35度、选区、收集期像素/历史不变、越界移动与释放、单笔提交、UndoRedo、Escape、跨缝visited顺序符合本地端点路径及自由瓦片层拒绝。三项CTest document-transactions/tile-repeat/tile-repeat-stroke通过0.85s；之后只新增两项运行断言，重新构建诊断通过。742文件来源快照与diff检查通过。预览仅源码核对，没有逐像素截图验收或FPS测量；全量迁移仍INCOMPLETE。保留用户数据和未跟踪文件，阶段提交推送dev。


### 2026-11-09：平铺液化连续坐标与事务（阶段完成）

核对canvas-input-stroke begin/move/endLiquify、useCanvasViewportGeometry localContinuousPointAt和useCanvasBrushOverlay：液化按下与移动必须采用同一连续本地空间，有限相邻副本映射保持小数，越界移动忽略；释放不重新计算端点，提交最后有效预览。原生补齐begin/update映射，继续使用既有液化复合事务、推移路径重采样、持续作用、选区/蒙版限制及提交/取消。液化预览映射本地中心；actual legacy液化overlay只绘制主文档区域，未自行添加副本预览循环。瓦片层继续由rasterToolsAvailable拒绝。

正式Release构建成功，显式等待 --tile-repeat-check退出0。实际鼠标诊断覆盖X/Y/Both×五种模式×平滑开关×主画布/副本，整数显示缩放保留1/4像素坐标；比较完整像素，验证选区、手动持续作用批次、无效副本移动不变、一笔历史、UndoRedo及Escape。三项CTest liquify/tile-repeat/tile-repeat-stroke通过0.47s。742文件来源快照与diff检查通过。新增场景未专门测Shift/右键、重置按钮、跨缝位移或预览截图；这些既有语义未改动，不声称已完成新增平铺运行验收。没有FPS测量，全量迁移仍INCOMPLETE。保留用户数据、缓存与未跟踪文件，阶段提交推送dev。


### 2026-11-09：平铺魔术橡皮种子与完整手势（阶段完成）

对照canvas-input-fill beginMagicEraser、pointer-down/up及workspace-magic-eraser：按下以localPoint作为唯一种子，不做网格吸附；立即预览，拖动不换种子，释放一笔提交。原生映射有限相邻副本种子后复用既有匹配算法、选区交集、蒙版和历史事务，未添加环绕连通邻接。

正式Release构建成功，显式等待 --tile-repeat-check退出0。实际鼠标X/Y/Both×连续/非连续×当前层/可见层选项，比较副本/主画布完整像素，验证分隔区域、选区外不变、按下预览无历史、拖动不重采样、外侧释放一笔提交、UndoRedo、Escape和右键取消。可见层新增场景只有单层；多层采样与蒙版沿用既有document-transactions回归。三项CTest document-transactions/tile-repeat/tile-repeat-stroke通过0.39s；742文件来源快照及diff检查通过。未新增截图/FPS测量，全部迁移仍INCOMPLETE。保留所有用户文件、缓存和未跟踪数据，阶段提交推送dev。


### 2026-11-09：平铺魔棒选区与异步手势（阶段完成）

对照canvas-input-selection-begin magicRequest/Release、canvas-input-selection moveMagic及pointer-move：按下和拖动使用有限相邻副本本地点，改变位置更新异步预览，越界移动保留最后有效请求。原生仅魔棒指针路径在源边界检查/开始/更新前映射，不改其他选区工具、异步工作队列及组合算法。释放沿用既有latest-request完成后提交；取消沿用generation丢弃过期结果。

正式Release构建成功，显式等待 --tile-repeat-check退出0。实际鼠标矩阵覆盖普通层/自由瓦片源、X/Y/Both、替换/相加/相减/相交、连续/非连续；比较主画布与副本选区，验证拖动请求、无效移动忽略、工作线程结算、内容不变、最多一笔历史、UndoRedo及Escape后旧worker完成不回写。三项CTest document-transactions/tile-repeat/tile-repeat-stroke通过0.39s；扩展自由源矩阵后重新正式构建诊断通过。742文件来源快照和diff检查通过。未新增蒙版/网格瓦片/可见多层来源的平铺专门回归，未做预览截图/FPS；全量迁移仍INCOMPLETE。保留用户数据和未跟踪文件，阶段提交推送dev。


### 2026-11-09：平铺多边形套索完整手势（阶段完成）

核对canvas-input-selection begin/extend/move、useCanvasShapeCommit commitPolygonLasso、canvas-input-path和canvas-polygon-interaction测试：多边形顶点使用有限副本本地点，普通polygonSelection闭合；不能套用连续lasso的repeatedLassoSelection。原生把多边形套索纳入局部指针映射，覆盖首次按下、后续顶点及悬停，越界移动/按下忽略；既有路径回退、重做和闭合算法保留。

正式Release构建成功，显式等待 --tile-repeat-check退出0。新增实际鼠标X/Y/Both×四种组合×Enter/双击完成，比较主画布/副本选区，验证待确认无历史、右键回退、默认CtrlShiftZ重做、无效副本移动预览不变、UndoRedo、Escape及像素不变。首次诊断误用CtrlY重做，默认路由拦截；核对shortcut_catalog后改用实际默认CtrlShiftZ，未更改产品快捷键，重新构建诊断通过。三项CTest document-transactions/tile-repeat/tile-repeat-stroke通过0.40s。742文件来源快照及diff检查通过。未新增自由瓦片/网格瓦片多边形套索、跨缝混合副本顶点或预览截图回归；全量迁移仍INCOMPLETE。保留用户数据及未跟踪文件，阶段提交推送dev。


### 2026-11-09：平铺文字框命中与手势坐标（阶段完成）

核对canvas-input-text begin/move/end、pointer-down/move和useCanvasViewportGeometry：初始命中使用有限副本本地点，创建/变换拖动在有效副本内使用本地点，离开副本回退连续文档坐标。原生文字入口统一该映射，选中文字框的Skin selectionMaterialBounds/selectionContains与resize handle使用相应本地显示物理指针，保留既有文字事务与链接源处理。未引入新的边框素材或通用矩形命中替代。

正式Release构建成功，显式等待 --tile-repeat-check退出0。X/Y/Both主画布/副本、链接文字框移动/尺寸调整，比较完整像素及宽度，验证一笔提交、UndoRedo和Escape；新增框验证本地几何与取消。首轮固定缩放2使右副本新建点离开视口，诊断改用整数缩放1后通过，生产缩放不变。三项CTest text-document/tile-repeat/tile-repeat-stroke通过0.56s。742文件来源快照及diff检查通过。文字编辑弹窗新建确认、Alt复制、离开副本连续回退及选中素材逐像素alpha命中一致性尚未新增专门验收，本阶段不宣称完整文字平铺迁移/视觉等价；全量迁移仍INCOMPLETE。保留用户数据及未跟踪文件，阶段保存推送dev。


### 2026-11-09：文字平铺边框alpha/命中与越界回退（阶段完成）

追补上一阶段用户要求的选中素材一致性验收。发现副本已能命中却没有绘制文字框边框；现在paintTextBox对所有相邻副本复用Skin::drawSelectionBorder，创建预览及已选文字框共用路径。逐像素检查进一步发现奇数物理起点经绘制uiLogical取整后与命中起点错1px，已让文字框绘制、输入边框及光标helper统一uiPhysical(uiLogical(border))，仍使用selectionMaterialBounds/selectionContains，不以矩形中心作为边框命中。

正式Release构建成功，--tile-repeat-check显式等待退出0。实际paintTextBox透明表面逐像素alpha比较覆盖X/Y/Both全部相邻副本、透明中心及边框外1px；既有移动/尺寸回归继续通过。新增拖出相邻副本的连续原始坐标回退及Escape恢复断言通过。三项CTest text-document/tile-repeat/tile-repeat-stroke通过0.22s；742文件来源登记快照和diff检查通过。旋转/镜像、分数缩放下素材alpha/hit尚未新增矩阵验证，文字弹窗创建确认及Alt复制仍未在平铺下完成，整体迁移INCOMPLETE。无FPS测量，保留用户数据、缓存和未跟踪文件，阶段保存推送dev。


### 2026-11-09：文字平铺Alt复制与共享图层移动坐标（阶段完成）

对照canvas-pointer-down textCopyTarget与canvas-input-layer-move begin/move：Alt文字命中以本地点识别，复制复用图层移动，位移使用本地端点差；超出有限副本的移动不更新，释放结算最后有效预览。原生processMoveInput共享入口映射命中、开始和更新坐标，文字入口对映射后Alt命中让路，继续复用既有懒复制事务、对齐及取消。共享普通图层移动路径同步采用该坐标适配。

正式Release构建成功，显式等待 --tile-repeat-check退出0。实际Alt鼠标X/Y/Both主画布/副本比较完整像素，验证复制新增一层/一笔历史、UndoRedo、Escape移除预览复制层且恢复像素/层数。三项CTest text-document/tile-repeat/tile-repeat-stroke通过0.21s，742文件来源快照及diff检查通过。新增矩阵不包含普通像素/多层移动、跨缝Alt复制、复制后文字弹窗编辑，也未新增截图/FPS验证；文字创建弹窗确认及旋转/分数缩放素材矩阵仍待继续。全量迁移INCOMPLETE。保留用户数据、缓存与未跟踪文件，阶段保存推送dev。


### 2026-11-09：平铺文字创建弹窗完整验收（阶段完成）

对照canvas-input-text endTextCreation：点击按起点创建自由文字，拖动以previewTarget位置/尺寸创建文字框；实际释放打开文字弹窗。新增仅smoke模式的局部环境选择器，复用editText现有TextToolDialog编辑/确认控件，不改变产品确认逻辑。诊断作用域恢复环境值。

正式Release构建成功，--tile-repeat-check显式等待进程退出0。X/Y/Both×自由/框×确认/取消×主画布/副本共24个真实弹窗场景，验证位置、尺寸、一次新增层/历史、完整像素一致、UndoRedo、取消恢复层数/像素及无草稿/捕获残留。每个弹窗同时执行既有完整文本编辑回归，因此整次运行耗时数分钟，持续产物更新后正常完成；没有因观察超时重启。三项CTest text-document/tile-repeat/tile-repeat-stroke通过0.21s，742文件来源快照与diff检查通过。生产路径未发现新缺陷，不将本次验收称为性能提升。文字旋转/镜像/分数缩放素材矩阵及全量迁移仍INCOMPLETE。保留用户数据、缓存及未跟踪文件，阶段保存推送dev。

### 2026-11-09：平铺文字悬停光标与变换捕获一致性（阶段完成）

对照legacy canvas-pointer-move的localPoint及canvas-input-text的displayedResizeCursorForHandle，修复原生文字悬停仍使用未映射副本文档点/显示点的问题。cursorAt现按有限相邻副本映射本地整数点和本地显示物理点，与processTextInput共用既有textBoxPointerHit和Skin素材命中，不改文字事务。用户确认的网格瓦片同步缩放此前已实现并验收，本阶段未重复修改。

正式Release构建成功；--tile-repeat-check显式等待完整进程退出0，包含新增384组真实鼠标悬停/按下/Escape：X/Y/Both、0/37/90/180度、四种镜像组合、.75/1.25缩放、主画布/负向副本、东边框/内部。断言悬停与捕获光标一致、实际手柄正确、取消后无捕获/草稿/历史残留。原有24个真实创建弹窗等完整诊断继续通过。三项CTest text-document/tile-repeat/tile-repeat-stroke通过0.21s；742文件来源快照及diff检查通过。新增矩阵证明输入/光标一致性，不代替旋转渲染逐像素alpha验收，也无新增FPS测量；全量迁移仍INCOMPLETE。保留原有未跟踪文件、用户数据及缓存，阶段保存推送dev。

### 2026-11-09：旋转文字边框完整alpha命中验收（阶段完成）

新增96组配置的全视口逐像素透明渲染比较：X/Y/Both、0/37/90/180度、四镜像组合、.75/1.25缩放，并继续384组真实悬停/捕获/Escape。发现镜像像素角点与37度九宫格外角取样差异，简单反变换及同矩阵逆变换均不能完全复现Skia lattice边界。最终保留原Skin::drawSelectionBorder渲染，旋转命中缓存实际paintTextBox透明alpha，以Skin::selectionContains校验/定位最近素材像素，再用既有handle优先级。透明像素不命中；主框/副本共用同一helper。非旋转直接素材命中。缓存随视图/框/视口/素材变化更新，固定字段比较避免每次鼠标格式化字符串，保留位图身份。核对本项目MIT Aseprite UI graphics.cpp和LAF Skia默认最近邻绘制路径；未复制其他许可模块。

正式Release最终构建退出0；最终--tile-repeat-check显式等待退出0，全视口alpha比较、384交互及既有24真实文字创建弹窗全部通过。中间版本错误有明确像素证据且已修复，最终重复回归通过。三项CTest text-document/tile-repeat/tile-repeat-stroke通过0.21s，742文件来源快照与diff检查通过。验收范围是所列配置与当前皮肤；无整体FPS、任意角度穷举或长时手工验收。整体迁移仍INCOMPLETE，保留用户数据/未跟踪文件/缓存，阶段保存推送dev。

### 2026-11-09：平铺普通/多图层移动完整交互阶段

对照canvas-input-layer-move begin/move及canvas-pointer-move localPoint，沿用局部端点位移、无效副本点忽略及最后有效预览提交。发现原生无效点分支先于既有kButtonNone取消分支，导致副本外无按钮释放遗留捕获；现统一取消事务，恢复位置/复制层且释放捕获。旧版duplicateOnDrag仅单层且<=1 Cel，多层Alt仍普通移动；首轮诊断误期望复制，核实源码后修正预期，没有改变产品语义。

最终正式Release构建退出0，--layer-move-check显式等待退出0，48组X/Y/Both×单/多层×Alt/普通×跨缝/普通×主/负副本实际鼠标场景通过。含链接帧、显式多层所有Cel目标、主副本完整像素一致、局部跨缝delta、无变化预览不发布revision/history、无效移动保留预览、越界左释放单笔提交、UndoRedo、越界无按钮释放取消。逐目标检查源身份/像素存储地址保留及偏移只加一次；单Cel复制不移动原源。四项CTest alignment/move-click-flash/tile-repeat/tile-repeat-stroke通过0.50s；742来源快照与diff检查通过。无新增旋转移动截图/全软件FPS声明；蒙版/分组/帧选择等完整跨工具矩阵仍需后续核对，整体迁移INCOMPLETE。保留用户数据、缓存及原有未跟踪文件，阶段保存推送dev。

### 2026-11-09：平铺帧选择与绑定蒙版移动验收阶段

核对workspace-layer-move animationMaskOffsetsForLayerMove/setAnimationMaskOffsets和canvas-input-layer-move帧键目标：解析蒙版自身moveWithOwner为准，链接根按ID去重；独立蒙版分别沿用各自开关。新增48组真实鼠标X/Y/Both×当前Cel/两帧显式选择×链接/独立蒙版×第二帧绑定开关×主/负副本，逐帧检查蒙版ID/链接/像素/偏移、Cel像素/偏移，单笔历史、UndoRedo、Escape及无捕获残留。初次误用第二帧开关推断第一帧独立蒙版行为，核对源码后修正预期，产品未更改。

正式Release构建退出0，--layer-move-check显式等待退出0（含前阶段48组共96组）。五项CTest attached-masks/alignment/move-click-flash/tile-repeat/tile-repeat-stroke通过0.24s，742来源快照与diff检查通过。本轮没有生产修复、截图或FPS证据，不称性能提升。发现原生活动蒙版单独移动被画布target筛选排除，虽然底层beginLayerMove具有该能力，但旧版canvas入口使用所属层而非activePaintLayer，尚不能证明应开放；保留为待核对语义，不擅自新增。组蒙版/组选择等仍待进一步验收，全量迁移INCOMPLETE。保留原有用户数据、缓存、未跟踪文件，阶段保存推送dev。

### 2026-11-09：平铺组选择移动及锁定/隐藏过滤阶段

对照canvas-move-selection resolveCanvasMoveLayerIds与canvas-input-layer-move：选中组展开后代层，再按有效visible/locked过滤；显式层目标扩展所有帧，Alt仅单层单Cel可复制。新增36组X/Y/Both×全可编辑/一个锁定/一个隐藏成员×Alt/普通×主/负副本，实际鼠标验证链接帧各目标offset、组Alt不复制、单历史、UndoRedo、Escape；每组再验证整组锁定/隐藏时无移动、捕获或新增历史。既有96组帧/蒙版/普通移动继续执行。

正式Release构建退出0；--layer-move-check显式等待退出0（累计132组及整组拒绝检查）；六项CTest layer-panel-tree/document-layer-groups/document-layer-group-structure/alignment/move-click-flash/attached-masks通过1.10s，742来源快照与diff检查通过。生产逻辑无新增改动，不称性能提升。初始计划中的嵌套组和组蒙版未在本矩阵覆盖：旧版animationMaskOffsetsForLayerMove仅取layer mask，原生已有随选中组移动group mask分支，仍需查证或用户语义决定；活动蒙版单独移动入口同样待核对。未新增截图/FPS证据，全量迁移INCOMPLETE。保留原有用户数据、缓存与未跟踪文件，阶段保存推送dev。

### 2026-11-09：平铺嵌套组移动完整范围验收阶段

对照canvas-move-selection resolveCanvasMoveLayerIds/getLayerIdsInGroup与canvas-input-layer-move有效visible/locked过滤；复用已有document_layer_group_structure_test的导入夹具构建方式。新增36组X/Y/Both×父/子组选择×子组正常/锁定/隐藏×主/负副本，两帧链接Cel及组外层。实际鼠标检查目标数/拒绝、每帧解析owner不变、偏移仅加一次、同级/组外不动、一笔历史、UndoRedo、Escape及无捕获残留。

正式Release构建退出0；--layer-move-check显式等待退出0（累计168组，含既有整组拒绝检查）；六项CTest layer-panel-tree/document-layer-groups/document-layer-group-structure/alignment/move-click-flash/attached-masks通过0.45s；742来源快照与diff检查通过。无生产逻辑修改，无新增截图/FPS测量。组蒙版跟随选中组的行为与旧版layer-mask-only移动不同，已通过异步问题请用户选择；本矩阵无组蒙版，不将通过结果用作该语义批准。活动蒙版单独移动仍待核对，全量迁移INCOMPLETE。保留用户数据、缓存及未跟踪文件，阶段保存推送dev。

### 2026-11-09：平铺切片创建/移动/复制/尺寸手势迁移阶段

核对canvas-input-slice begin/move/end、canvas-pointer-down/move localPoint、useCanvasTextPreview sliceHandleAt和canvas-render-guides：创建/移动以有限副本本地点计算，未映射move忽略；释放提交现存preview，移动阈值可由release client坐标满足；切片轮廓/手柄只在主画布，不增加副本手柄。原生切片输入及悬停映射本地点，拖出副本保留最后预览，释放不再用释放点重新计算几何，保留无按钮取消。保留既有clamp、多选相对偏移、Alt复制和历史事务。

正式Release构建退出0，--slice-check显式等待退出0。新增24组X/Y/Both×主/负副本×创建/单移/多移/Alt复制，精确几何/预览不提交/无效移动忽略/无效释放结算/像素不变/UndoRedo/无按钮取消；另三组主画布东边尺寸手柄验证最后预览结算与UndoRedo/Escape，原有slice回归继续通过。三项CTest document-slices/tile-repeat/tile-repeat-stroke通过0.72s；742来源快照与diff检查通过。未新增副本轮廓或尺寸手柄，未新增旋转全矩阵/截图/FPS测量。组蒙版行为选择仍等待用户答复，未把等待解释为批准；全量迁移INCOMPLETE。保留用户数据、缓存和未跟踪文件，阶段保存推送dev。

### 2026-11-09：切片尺寸及捕获光标完整迁移阶段

对照useCanvasCursor捕获create-slice/move-slice/resize-slice优先级及displayedResizeCursorForHandle、useCanvasTextPreview sliceHandleAt。原生此前尺寸手柄悬停只有move/crosshair，捕获离开视口回default；现选中单切片手柄使用既有旋转/镜像方向计算，捕获期间保持resize/move/copy/crosshair。复用既有图标/方向函数，不改切片手柄几何或主画布显示语义。

正式Release最终构建退出0，--slice-check显式等待退出0。新增128组八手柄×四角度×四镜像，zoom1.25，实际hover/down/越界cursor/Escape及无历史/捕获残留；前阶段24平铺创建/移动/Alt复制场景补捕获越界光标断言，另三尺寸提交与既有回归继续通过。三项CTest document-slices/tile-repeat/tile-repeat-stroke通过0.19s，742来源快照和diff检查通过。无新增全软件FPS/素材alpha/截图验收，组蒙版选择仍等待答复，全量迁移INCOMPLETE。保留原有用户数据/缓存/未跟踪文件，阶段保存推送dev。

### 2026-11-09：切片预览无变化重绘优化迁移阶段

直接沿用canvas-input-slice三个move分支sameBoxPreview与canvas-box-drag.test.ts的metadata-only/no-op语义。原生此前每个拖动事件均invalidate整画布，现各目标rect变化才赋值并标记changed，仅变化时刷新；创建预览从未显示到超过拖动阈值仍刷新，即便clamp几何相同，保留可观察行为。不复制全部预览向量作比较，避免多选额外拷贝。清理释放前已return后的不可达判断。

正式Release最终构建退出0；--slice-check显式等待退出0，四类创建/单移/尺寸/多移分别100重复和100不同坐标夹紧样本，共800无变化事件，测试前明确assert脏区为空，之后仍为空，预览/revision/history不变。既有27切片交互与128方向光标矩阵继续通过。三项CTest document-slices/tile-repeat/tile-repeat-stroke通过0.19s；742来源快照和diff检查通过。证明省去这些事件的重绘请求，不等于全软件FPS或所有输入路径优化完成。组蒙版语义选择仍待答复，全量迁移INCOMPLETE。保留原有用户数据、缓存及未跟踪文件，阶段保存推送dev。

### 2026-11-09：大量切片覆盖层索引查找优化迁移阶段

对照canvas-render-guides selectedSliceIds Set与slicePreviewTargets按ID索引。原生此前对每个切片线性扫描所有选中ID及拖动预览，多选拖动为O(N*(S+P))；现每次paint建立选中集合和预览指针映射，循环预期O(N+S+P)，保持文档绘制顺序、预览覆盖、复制预览与单选手柄。核对paintCanvas外层viewport/column clip仍覆盖paintSliceOverlay，未改裁剪范围。smoke-only局部环境参考分支保留旧线性查找作为像素对照并恢复调用前环境。

正式Release构建退出0；--slice-check显式等待退出0。192全选切片×0/37/90度×静止/移动/复制预览共9组完整表面RGBA逐像素对照完全一致；既有切片交互、128光标矩阵及800无变化样本检查继续通过。三项CTest document-slices/tile-repeat/tile-repeat-stroke通过0.17s；742来源快照与diff检查通过。复杂度下降是代码证据，未新增实测FPS或整软件性能结论。组蒙版行为问题仍待用户答复，全量迁移INCOMPLETE。保留原有用户数据、缓存、未跟踪文件，阶段保存推送dev。

### 2026-11-09：待确认渐变手柄有限副本入口修复阶段

继续核对已有渐变平铺迁移，canvas-pointer-down/move localPoint与canvas-input-fill以有限副本为有效输入。发现原生映射失败时仅active gradient mouseup设置gradientPointerValid=false，pending handle down仍用raw坐标；现映射失败的渐变事件统一标无效，并在pending handle press校验。保持无效move忽略、释放最后有效几何结算与原有确认事务。

正式Release最终构建退出0，--gradient-shape-check显式等待退出0。六组X/Y/Both×线性/径向把待确认端点置于有限副本之外，断言按下不捕获/不提交，再验证有效副本endpoint编辑、release pending和Escape恢复像素/历史；首轮诊断明确暴露上游标记遗漏，最终修复后通过。原有渐变/形状窗口诊断继续通过。四项CTest document-transactions/raster-geometry/tile-repeat/tile-repeat-stroke通过0.55s；742来源快照与diff检查通过。未新增全平铺长诊断/截图/FPS测量，不据窄检查宣称完整渐变迁移完成；组蒙版选择仍等待答复，整体INCOMPLETE。保留原有用户数据、缓存与未跟踪文件，阶段保存推送dev。

### 2026-11-09：渐变指针中断恢复一致性阶段

对照useCanvasGradientConfirmation.ts cancelPendingGradientEdit的editSnapshot恢复和useCanvasInteractionCancel新建手势取消。原生捕获丢失/Escape原已恢复待确认手柄，但失焦与无按钮释放取消整个待确认预览；现共用局部恢复路径，保留确认状态，恢复编辑前几何及预览。新建渐变仍取消，已释放待确认渐变保留。核对Aseprite ui/manager.cpp MouseUp按钮重置，未修改框架输入语义。

正式Release构建退出0，--gradient-shape-check退出0，新增32组线性/径向×主/副色来源×新建/待确认手柄×捕获丢失/无按钮释放/失焦/Escape；验证像素、预览、历史、捕获与恢复后Enter/Undo。测试准备曾因只清控件捕获标志而残留manager capture，最终改为真实release后通过；未把早期失败当验收。四项CTest document-transactions/raster-geometry/tile-repeat/tile-repeat-stroke通过0.39s，742来源快照和diff检查通过。无新增截图/FPS测试，整体迁移仍INCOMPLETE。保留用户文件与缓存，阶段保存推送dev。

### 2026-11-09：渐变无变化输入重算优化阶段

沿用legacy canvas-input-fill/useCanvasGradientConfirmation的几何状态机、调度合并，以及canvas-render-gradient覆盖/合成缓存的无变化复用原则。原生每次move均请求Document整幅渐变重算并invalidate视口；现几何更新前后比较start/end/radial/fromCenter/proportional/angle/显式椭圆存在性及中心/半径，仅变化时追加请求/脏区。不跳过状态机，不复制色标向量，已有参数改变、pending颜色刷新和释放结算继续执行。

正式Release构建及--gradient-shape-check退出0。七种线性创建/起点/终点/整体移动和径向创建/终点/中心各100重复坐标+100等价相邻副本，共1400事件；明确清空并断言初始脏区为空，验证gradientRevision、完整preview像素、history及脏区不变，随后检查真实几何变化、颜色改变、确认单历史与Undo。手柄测试拉开端点避免命中范围重叠，全部明确assert实际handle。前阶段32中断恢复与六有限副本等既有诊断继续通过。四项CTest document-transactions/raster-geometry/tile-repeat/tile-repeat-stroke通过0.41s，742来源检查和diff通过。未测全软件FPS，不据此宣称全部迁移完成；整体INCOMPLETE。保留用户数据/缓存，阶段保存推送dev。

### 2026-11-09：基础形状无变化输入与平铺事务验证阶段

对照canvas-input-shape moveShape/moveLine与canvas-input-view-shape几何状态机。原生五种基础形状每次move均请求整幅像素预览；现保留状态机更新，以start/end及bounds位置/尺寸/角度变化决定新增请求和脏区。绘图锚点bounds在比较前统一归中，避免shapeTick归中后下一相同输入误判；释放仍结算既有请求。未改多边形/自由形状/曲线分支。

正式Release构建、--gradient-shape-check及--grid-snap-quick-check退出0。新增五种基础形状×左右键×X/Y/Both共30场景，每种100相同坐标+100等价副本共6000事件，验证gradientRevision/完整preview/history/空脏区无变化，再验证移动刷新、释放像素等于预览、单事务、Undo/Redo及Escape像素保留；既有渐变和形状窗口诊断继续通过。四项CTest document-transactions/raster-geometry/tile-repeat/tile-repeat-stroke通过0.40s。额外--modifiers-check退出1，在Captured brush resize survives modifier release断言失败，未到相关形状验证；未确定该画笔失败原因，不能把通用修饰键验收称通过，保留该待查项。742来源检查及diff通过。未测全软件FPS，整体迁移INCOMPLETE；保留用户数据和缓存，阶段保存推送dev。

### 2026-11-09：画笔修饰键与快速移动优先级补齐阶段

追查上一阶段--modifiers-check失败，按下检查证明CtrlAlt尺寸拖动未开始。useCanvasToolSession brushSizingHeld明确先于quick tool，且temporaryMoveActive排除brushLineConnectionHasPriority。原生syncShortcutTools已有尺寸优先级，但moveModifierHeld独立解析快速移动，processMoveInput提前抢走CtrlAlt尺寸及CtrlShift已有锚点连线。现快速移动查询对受支持笔刷尺寸绑定和已有笔刷锚点lineConnectionMode绑定分别让出，保留用户改键、blockedBy及其他快速工具匹配。

正式Release构建、--modifiers-check完整退出0（包括尺寸hover/捕获拖动释放修饰键/滚轮/失焦、CtrlShift连线、渐变Shift更新及反选），新增CtrlAlt/CtrlShift自定义尺寸绑定优先级检查。修正诊断普通Message伪造FocusLeave为FocusMessage；反选fixture曾因前场景合成捕获标志残留延后命令，现切文档前显式清理，未改产品延后规则。--gradient-shape-check与--grid-snap-quick-check退出0，四项CTest document-transactions/raster-geometry/tile-repeat/tile-repeat-stroke通过0.71s。742来源及diff检查通过，无截图/FPS验收；整体迁移INCOMPLETE，保留用户文件/缓存，保存推送dev。

### 2026-11-09：画笔尺寸中断收尾补齐阶段

对照canvas-brush-size-update.ts在pointerup/blur/pointercancel清理前flush最新尺寸。原生捕获调尺寸仅left-up结束，遗漏no-button-up和capture loss；现捕获丢失结束尺寸手势，无按钮释放和正常释放共用finish，保留最后尺寸。Escape/失焦路径复用，不改尺寸回退语义或作品历史。

正式Release构建、--modifiers-check完整退出0，新增铅笔/橡皮×正常释放/无按钮释放/捕获丢失/失焦/Escape十场景，最后尺寸15保留，状态/捕获清理、作品像素/历史/dirty不变。独立诊断失焦/Escape在manager已无capture后同步清掉额外合成HAS_CAPTURE标志，未把此fixture残留当产品缺陷。四项CTest document-transactions/raster-geometry/tile-repeat/tile-repeat-stroke通过0.40s，742来源及diff检查通过。无新增截图/FPS验收，整体迁移仍INCOMPLETE，保留用户数据与缓存，阶段保存推送dev。

### 2026-11-09：专用工具尺寸参数无变化优化阶段

对照canvas-pointer-move modifierSizing对airbrushScatterRadius/liquifyRadius/brushSize的选择，以及canvas-brush-size-update queueCanvasBrushSize待保存尺寸相等不调度。原生喷枪/平滑/液化setter每次重复值或夹紧到相同1/64仍保存偏好、layout与invalidate；现统一夹紧后比较各自参数，相同直接返回，变化时保存格式/入口保持。

正式Release构建、--modifiers-check、--gradient-shape-check退出0。新增喷枪/平滑/液化/直线四类捕获调尺寸与无按钮结束，验证各自参数由12到15、值15/下限1/上限64、各100重复共1200 setter事件不产生脏区，作品像素/历史/dirty不变。既有铅笔/橡皮中断和全部修饰键诊断继续通过。四项CTest document-transactions/raster-geometry/tile-repeat/tile-repeat-stroke通过0.42s，742来源与diff检查通过。无全软件FPS或截图验收，整体迁移INCOMPLETE；保留用户数据/缓存，阶段保存推送dev。

### 2026-11-09：Paint瓦片选区对称拖动语义补齐阶段

核对当前显式缺口和legacy canvas-input-tile moveTileSelection：在constrainedTranslation/整格取整前调用symmetrySelectionDragDelta(...,true)。原生Paint移动直接使用指针差，遗漏按所按对称区域映射方向。现开始时保留扩展后的源选区快照，移动时调用既有symmetry_model算法再做轴约束，复用Document完整格引用移动事务；不把像素缓存作为权威，不改Tileset源。

正式Release构建、--modifiers-check完整退出0。新增五种对称轴×移动/复制十场景，实际按下/move/release/Escape对照既有Document映射后cell move参考，验证完整格引用、选区、画面、资源、历史、取消与Undo/Redo。四项CTest tilemap-document/document-transactions/tile-repeat/tile-repeat-stroke通过0.59s；742来源与diff检查通过。Paint自由变换/多目标仍明确缺口，本轮未据此宣称整个瓦片迁移完成；无截图/FPS验收，整体INCOMPLETE。保留用户文件/缓存，阶段保存推送dev。

### 2026-11-09：全套回归审计与编译依赖边界修复阶段

210项CTest完成：195通过、15失败。失败包括theme-atlas、image-sequence-import、preferences-catalog、wheel-performance、layers-render、multi-document、layer-context-menu、workspace-layout、panel-docking-interactions、palette-mouse-startup、home-workspace、menu-catalog、color-picker-normal-map、editor-boundaries、runtime-diagnostics；完整日志在本地build/migration-full-ctest.log。尚未逐项归因，不把全套审计称为全绿。已确认正常贴图尺寸/拾色器枚举的部分旧测试预期与后续代码存在差异，中文路径两项出现编码异常；后续独立阶段处理。

修复明确的编译边界违规：document_slices.cpp由CMake编译独立翻译单元，不再被document.cpp包含；editor_lifecycle.cpp首个头为editor.h；将GradientStopsTrack原实现逐字提取到共享gradient_stops_track.h，保留已有命名空间/前置声明，ColorOverlayDialog直接依赖共享控件及moon::unicodeText，避免反向依赖Editor支持头。没有改变渐变绘制、交互或UI布局。

最终正式Release构建退出0；显式等待--gradient-map-check/--color-overlay-check/--gradient-shape-check/--slice-check全部退出0。document-slices/editor-boundaries/tile-image-resize三项CTest再次通过。743文件来源快照检查与diff检查通过。提取实现与HEAD原类逐字比较一致；无截图或FPS验收，不声称运行时卡顿已解决。其余全套失败待处理，整体迁移INCOMPLETE。保留用户数据、缓存和未跟踪文件，阶段保存推送dev。

### 2026-11-09：中文工程路径回归入口与真实磁盘链路验证阶段

上一轮全套回归的image-sequence-import/runtime-diagnostics两项独立复现：CRT main的ANSI argv被u8path误当UTF-8，含中文仓库路径在进入业务逻辑前失败。按已有gif-open等原生测试适配统一使用wmain及filesystem::path直接保留UTF-16，未改生产实现。对照legacy core/image-sequence.ts与store/image-sequence-import.ts的字符串路径、序号分批与名称提取，以及runtime-diagnostic-writer.ts的写入/回退语义。

序列测试新增中文/重音/空格/非BMP目录和文件，链接已有生产解码库，真实写PNG并调用openRasterImage，验证逆序输入合成顺序、透明像素、中文名称、帧时长、记忆设置再次读取、原生工程往返及原PNG内容/大小不变。诊断全套已有写入、旋转、8文件保留、4MiB上限、队列压力和回退检查均运行在Unicode根，补验中文/Emoji回退事件跨Recorder重开保留及中文导出路径。

两个测试目标Release构建退出0；对应两项CTest通过0.38s。源码/来源检查通过；本阶段仅测试宿主和依赖接线，无正式程序源码变更，无新增GUI/FPS验收。全套原15失败已修边界与本两项，其余12项仍待复核，未重新执行全套，不声称全绿或完整迁移；保留用户数据与缓存，保存推送dev。

### 2026-11-09：偏好、停靠和图层完整UI回归前提校正阶段

继续上一轮12项待复核失败。正式程序重新编译后偏好检查先暴露快捷指令迁移新增拖动柄导致旧铺满行断言失效；断言按真实property保留17逻辑像素并继续校验标签/边界，完整滚轮路由、方向、多步、数字输入、上下边界和导航滚动通过，失败信息增加几何/路由值。停靠检查复现historyPanelOpen默认true使refresh强制custom，旧分隔条fixture明确关闭历史面板后测试旧布局，并保留后半自定义布局分隔条命中/拖动/外侧排除，退出恢复历史可见性。

对照legacy useLayerSelectionGuides的list blank语义及当前时间轴viewport，空白点击改用实时可视区域并断言不覆盖真实Cel，保留其他栏目/眼睛按钮不清选择、三种选择类型清空、右键继续及像素/历史上下文不变。接着暴露旧链接球采样以单元格center推算相差1逻辑像素；按实际整数素材对齐起点采样，仍逐像素校验7行/三链接Cel拉伸中段无接缝与独立Cel不连线。产品绘制/命中/业务逻辑无变化；用户素材约束依据layers-ui-correction.md。

正式Release构建退出0，preferences-catalog/layers-render/panel-docking-interactions三项完整CTest通过7.46s；来源与diff检查通过。无新增截图人工验收或FPS测量，未重新执行全套；原全套失败剩9项待复核，整体迁移INCOMPLETE。保留用户数据、缓存和未跟踪文件，阶段保存推送dev。

### 2026-11-09：菜单目录、图集、法线拾色器与多文档关闭回归阶段

原剩9项串行复查：palette-mouse-startup直接通过，其他8项仍失败。对照实际legacy AppMenuBar.tsx select菜单确认freeTransform前分隔线被原生漏标，恢复separatorBefore=true；保留原分隔线完整字典，菜单测试叶子计数同步现有145条，异常明确报告而非Windows未捕获fast-fail。图集测试对照现有用户输入框素材entry_normal 5×16、上3/下2，修正旧5×14预期，其余像素/替换重载/畸形输入检查不删减。法线拾色器保持完整像素/alpha检查，moon-ring按已迁移MoonRing识别，新增future-normal-map继续检查未知值回退SV。

多文档测试旧等待只看Pending::Saving，生产保存已在完成后排队等待恢复清理才关闭。等待条件加入既有deferredSaveCloses/backgroundSaves/queuedSaves，保留10秒期限；验证恢复后保存、关闭选择剩余页、取消/丢弃、退出逐文档提示完整路径通过，未修改产品保存生命周期。正式Release及三个测试目标构建成功（图集目标名moon-theme-tests，首次命令误写目标名后纠正）；四项CTest通过1.40s。来源与diff检查通过；无新增GUI截图/FPS结论。

用户本轮明确决定：组蒙版随选中组移动并遵守随层移动开关；已登记document_layer_move.cpp来源，后续完成对应开关/嵌套/链接回归审核，不再等待该决定。原失败剩wheel-performance/layer-context-menu/workspace-layout/home-workspace四项待处理；未重跑全套，整体迁移INCOMPLETE。保留用户数据/缓存，阶段保存推送dev。

### 2026-11-09：首页滚动裁剪与普通自由瓦片层菜单回归阶段

承接剩四项失败，核对当前HomeWorkspace已迁移的栏目溢出和资源公告滚动。旧首页resize断言要求全部隐藏/屏外按钮位于窗口内，改为只检查可见按钮按paletteViewport裁剪后的非空范围、可见标签、公告视口和滚到底后的资源裁剪；不改生产布局。对照legacy workspace-commands-clipboard.ts与已迁移普通自由瓦片完整图层资源复制，旧断言仍称Copy/Cut未迁移：现检查Copy实际可用并执行菜单，断言layerClipboardSnapshot生成、实例clipboard清空、实例内容/历史不变，恢复测试内部clipboard后继续完整Paste/UndoRedo/锁定/快捷键流程；Cut仍遵守canDeleteSelectedLayers的显式选择准入。

正式Release构建退出0，home-workspace与layer-context-menu两项完整CTest通过8.23s；来源和diff检查通过。工作区复查仍失败于Preview move/resize phase4全画面像素对照，保留为真实待定位渲染差异；wheel-performance的额外chrome绘制/初始化像素差异也保留，已产生本地repaint trace，不删除断言、不据此声称性能问题解决。原全套失败剩两项，未重跑全套；无新增人工截图/FPS验收，整体迁移INCOMPLETE。保留用户数据/缓存，保存推送dev。

### 2026-11-09：用户确认的组蒙版随组移动回归阶段

落实用户决定：组蒙版随选中组移动，遵守解析后蒙版的moveWithOwner开关。核对legacy workspace-layer-move.ts的绝对基线偏移与链接根去重；组传播属于用户明确批准的原生扩展，现有生产实现无需修改。新增两层嵌套组、两个链接帧、开关开/关、连续绝对预览、取消、提交、Undo/Redo及像素存储身份不变检查。首次用例将默认true的无变化setter误作成功写入，修正为只切换false后，attached-masks正式Release目标构建成功，完整CTest通过0.43s。

预览残留调查沿用既有正式程序构建，Release构建退出0；workspace-layout再次失败，尚未解决。临时位置记录确认预览位于602,166,380,260，重叠顶部控件位于784,150,38,38；没有据此提交猜测性产品修改，临时硬编码记录已从源码移除。此前兄弟遮挡排除方案无改善且已撤回。wheel-performance仍待修复；整体迁移INCOMPLETE，无新增FPS或人工图像验收，保留所有用户数据、缓存与未跟踪文件。

### 2026-11-09：快捷指令栏与预览面板重叠绘制修复阶段

定位workspace-layout phase4的524个差异像素：重叠控件是QuickCommandBar（784,150,38,38），其折叠按钮在全量重绘时覆盖预览标题，而软件搬移结果保留预览。Aseprite Widget::paint的透明背景重绘按广度优先遍历后代，后代绘制顺序不能仅由Editor直属兄弟顺序保证；指令栏及Control此前未接入已有compositeControl的悬浮栏目/模态遮挡裁剪。通过Widget-owned Property向两类绘制复用既有裁剪，保留legacy QuickCommandBar素材、透明度、尺寸、展开/移动和动作；不复制第三方算法，读取ui/property.h/widget.cpp的MIT许可说明。临时位置/类型诊断已移除。

正式Release构建退出0。workspace-layout完整通过41.02s，六组预览移动/缩放的整帧像素对照及后续悬浮栏目检查全部执行；四组软件平移各200指针样本只应用一次几何并复用一次blit，两组尺寸调整各一次几何。panel-docking-interactions通过2.60s，quick-command-preferences通过0.85s，显式等待--quick-command-check退出0。744文件来源覆盖及diff检查通过。wheel-performance仍失败（本轮full 7.95ms/40 chrome，local 4.75ms/20 chrome），没有降低断言或声称全套全绿。原失败剩该一项，未重新执行210项全套；整体迁移INCOMPLETE，无全软件FPS/人工视觉验收。保留所有用户数据和未跟踪文件，阶段保存推送dev。

### 2026-11-09：缩放脏区批处理与局部绘制路径修复阶段

定位wheel-performance额外chrome：setCanvasZoom正确请求画布408,144,638,598与状态栏0,940,1294,26；既有PaintChain合并精确Region后，onPaint按外接矩形0,144,1294,822判断路径，误走完整chrome。保留精确批处理与子控件孔洞，在损伤完全属于画布/状态栏且无首页/模态/高级模式时，将交集分别交给已有onPaint局部路径；其他损伤继续原fallback，透明背景回放不变。核对legacy CanvasStage/useCanvasRenderEngine的view-only scheduleDraw及Aseprite MIT Widget::flushRedraw和Manager::sendMessageToWidget的count/clip边界；无上游实现复制。临时chrome/damage日志已移除。

正式Release构建退出0。wheel-performance完整通过1.86s，普通full7.95599ms/local4.3287ms、对称轴full12.7144ms/local4.95084ms，两个local场景20次缩放chrome均0；完整帧序列、半透明/叠加对称轴像素、content/history/uploads不变均通过，未降低断言。workspace-layout通过43.14s、panel-docking-interactions通过2.68s；modifier-brush-performance/drawing-pan-performance两项通过4.94s。744来源与diff检查通过。原全套210项15失败均已逐项重新通过，但本阶段未重新执行完整210项，不声称当前全套全绿；整体迁移INCOMPLETE，Paint瓦片自由变换/多目标、扩展兼容等显式缺口继续保留。无全软件FPS/人工图像验收；保留用户数据/缓存/未跟踪文件，阶段保存推送dev。

### 2026-11-09：全套回归与画笔库唯一临时文件修复阶段

串行执行Release CTest全部210项，209项通过；第25项pattern-brush-library旧二进制偶发“Cannot replace brush file”，其余209项均通过，记录于build/migration-full-ctest-current.log。单独复测旧用例通过，不能据此断言原因已被唯一确定。对照legacy/src-tauri/src/platform_storage.rs的唯一同目录临时文件、同步写入和原子替换语义，修复native画笔库原固定 .tmp：Windows CREATE_NEW独占预留进程号/时间/序列临时名，写入并FlushFileBuffers后MoveFileExW替换；失败保留GetLastError且只清理由本次创建的临时文件，不触碰原目标或已有 .tmp。测试在写入前创建旧固定 .brush-order.json.tmp，连续保存和重排后检查原内容不变。

正式Release程序及pattern-brush-library-tests构建退出0；修复后专项CTest连续5次通过。744文件来源快照及diff检查通过。没有在修复后二次运行整套210项，因此不能宣称当前全套全绿；没有新增GUI截图或全软件FPS验收。性能与迁移仍有已登记缺口，整体迁移INCOMPLETE；保留用户数据、构建缓存及未跟踪文件。

### 2026-11-09：混合工程普通图层移动完整事务阶段

对照legacy canvas-input-layer-move.ts具体目标解析、workspace-layer-move.ts的resolved Cel偏移/延迟Alt复制，修复原生beginLayerMove因文档包含任意tilemap/free-tile而拒绝普通目标的问题。普通栅格/文字沿现有零像素重采样事务执行；明确包含特殊目标时仍在变更前拒绝，不通过移动派生缓存冒充特殊图层迁移。活动蒙版单独画布移动语义仍待核对，未在此开放。

完整mixed free/grid/raster工程回归覆盖四组复制/移动×提交/取消，连续绝对预览、链接帧共享根、绑定蒙版帧作用域、单历史、Undo/Redo、保存重开、已有资源/实例/网格/缓存不变及锁定/隐藏拒绝。原夹具含legacy规范化会舍弃的自定义扩展字段，先保存重开建立规范化基线再比对；没有修改生产导入规则。蒙版断言先误认为独立蒙版随链接像素跨帧移动，已按旧版目标帧语义校正。

正式Release及free-tile-project-tests/attached-masks-tests构建退出0；实际--layer-move-check退出0，新增混合文档鼠标移动/Alt复制、捕获释放、Escape和Undo/Redo，原168组平铺/组移动继续运行。四项CTest free-tile-project/attached-masks/alignment/move-click-flash通过14.28s；744来源快照与diff检查通过。无新人工截图/FPS验收，未重跑全套；特殊图层本体移动、Paint自由变换/多目标、扩展兼容等仍未完整迁移，整体INCOMPLETE。保留用户文件、缓存和未跟踪数据，阶段保存推送dev。

### 2026-11-09：网格与自由瓦片整层移动事务阶段

对照legacy animation.ts animationCelOffsetsForKeys/setAnimationCelOffsetsForKeys：所有Cel类型均以resolved surface offset作为整层placement，网格和自由实例坐标保持局部；原生tilejson::validateAndRender/free_tiles::render重建缓存时保留offset。因此删除beginLayerMove特殊目标总拒绝，复用已有canonical owner去重/偏移/历史/延迟Alt复制，不栅格化也不改源资源。Editor关闭自动选择时接纳visible/unlocked的tilemap/free-tile整层；已打开实例视图继续原实例移动路径。

复制蒙版进一步核对canvas-input-layer-move.ts duplicate.animationMaskOffsets仅按current frame重置且过滤moveWithOwner。原生首次复制无条件移全部蒙版，后续也移非当前帧；现两处均只移当前帧绑定蒙版，保留其它帧及关闭绑定原点。普通复制回归同步为相同旧版语义。独立活动蒙版画布移动仍未开放。

新增16组grid/free×copy/move×linked/independent×binding矩阵：多次绝对预览、取消、单历史、Undo/Redo、native及recovery重开、精确资源/格引用/实例局部坐标/像素保留、非复制存储身份及锁定/隐藏拒绝；已有混合多目标admission回归同步开放后取消。初始storage断言取深复制快照身份，改为取live storage；蒙版断言改用各帧实际继承的moveWithOwner，不把夹具误差作为产品缺陷。实际鼠标新增8组两类层×Alt/移动×auto-select开关，检查capture/placement/history/UndoRedo/Escape，既有普通/平铺/组诊断保留。

正式Release、free-tile-project-tests、attached-masks-tests构建退出0；最终--layer-move-check退出0，四项CTest free-tile-project/attached-masks/alignment/move-click-flash通过15.61s。744来源快照与diff检查通过；无人工截图或FPS新增测量，未重跑全套。不宣称特殊层所有编辑已完成：Paint选区自由变换/多目标、独立蒙版canvas语义及原生扩展兼容仍有缺口，整体INCOMPLETE。保留用户文件、缓存和未跟踪数据，阶段保存推送dev。

### 2026-11-09：混合图层多选／组／帧移动完整组合验收阶段

对照legacy canvas-move-selection.ts resolveCanvasMoveLayerIds/resolveCanvasMoveAnimationCellKeys和canvas-input-layer-move.ts具体过滤：显式多层/组扩展全帧，帧选择扩展可编辑层，按canonical source去重；Alt仅一个层且一个Cel可复制。核心新增18组普通/网格/自由瓦片混合目标×层/组/帧×linked/independent×网格正常/锁定/隐藏，验证每个实际源位置、零像素复制存储身份、格引用/实例/资源字节不变、用户批准的仅显式组选中才传播组蒙版、像素选区平移、取消、单历史、Undo/Redo、native/recovery重开。

真实窗口新增9组混合选择scope/filter鼠标回归，验证目标数量、Alt不复制多目标、capture释放、精确实际源位置、Undo/Redo画面和Escape。两次初始断言把新增linked frame误当全部旧帧已链接，或把各图层第二帧假定全部共享first；改为在按下时捕获实际resolved owner，并同时保留目标数量与scope检查。未修改生产帧创建/移动语义，未把测试夹具差异当产品缺陷。

正式Release及free-tile-project-tests构建成功；最终--layer-move-check退出0；四项CTest free-tile-project/attached-masks/alignment/move-click-flash通过21.58s。744来源快照及diff检查通过。本阶段为上一阶段特殊层移动迁移的完整组合验收，没有新增生产逻辑修复或性能提升声明；无人工截图/FPS测量，未重跑全套。Paint自由变换/多目标、活动蒙版单独canvas语义及扩展兼容仍有已登记缺口，全量迁移INCOMPLETE。保留所有用户数据/缓存，阶段保存推送dev。


### 2026-11-09：Alt 图层复制逐帧独立性修复阶段

对照 legacy animation.ts cloneAnimationCelsForLayer，原生延迟 Alt 拖动复制现在逐帧解析并深复制 surface/text/tilemap/freeTiles，不继承 Cel 链接、runtime shared 链接和 zIndex；opacity 取直接槽位值并回退图层值，缺失槽位补 1×1 透明内容。关联图层继续通过既有 linkedContentId 同步共享像素。复制前内存预算按每帧解析后的实际尺寸计费，避免链接帧展开后绕过既有 256MiB 限制。蒙版按 cloneAnimationLayerMask 复制直接条目像素并清链接，位移仍仅当前帧且遵守 moveWithOwner。

新增普通层 linked/runtime-shared/blank × linkedContentId 回归，以及既有 grid/free 复制逐帧存储独立、进一步移动单帧不影响其它帧检查，覆盖撤销重做与 native/recovery 重开。初始 opacity 断言忽略导入时已有活动帧投影，改为记录复制前实际槽位值；缺失槽位夹具被 fromImported 的完整矩阵要求拒绝，改用导入补齐后的空白帧，不修改导入规则。未新增文本专用回归或缺失槽位内部状态注入。

正式 Release 与 free-tile-project-tests 构建成功；实际 --layer-move-check 退出0；四项 CTest free-tile-project/attached-masks/alignment/move-click-flash 全部通过21.86s。744文件来源覆盖与证据快照检查通过，整体迁移仍 INCOMPLETE；未重跑全套，无新增 FPS 或人工截图验收。保留用户文件、缓存及未跟踪数据，阶段提交推送 dev。


### 2026-11-09：完整回归与工作区画布覆盖层隔离验收

在3011b400基础运行全部210项CTest（parallel 2），209通过，workspace-layout失败，238.99s；已修复的pattern-brush-library及所有独立性能检查通过。workspace-layout首次phase4差异448像素，范围858,546..905,565；单独复现又在phase35差异352像素，范围840,454..857,501。两组BMP逐像素定位并查看完整图确认均是笔刷预览十字，非预览面板边界。测试用真实OS hover/capture，synthetic panel move与全量刷新期间canvasOwnsPointer改变瞬态笔刷覆盖层，无法据此宣称面板搬移错误。

smokeWorkspace布局交互完成后切至已有移动工具，固定后续画布覆盖层，仍比较全部帧像素，不跳过任何差异区域、不降低move_region/批次计数断言。产品绘制、笔刷和面板移动逻辑未改；笔刷仍由独立brush-preview/brush-preview-performance验收。正式Release构建成功；workspace-layout通过39.01s、panel-docking-interactions通过2.82s、brush-preview通过0.80s、brush-preview-performance通过4.38s。744文件来源与证据快照检查通过；未在调整后重跑全套210，不宣称同一次全套全绿，无新增软件FPS或人工交互验收。

活动蒙版的移动工具语义仍等用户选择（旧版移动图层与绑定蒙版；原生既有核心只移动活动蒙版），未默认替用户决定；其它Paint自由变换/多目标与扩展兼容等缺口继续保留，整体迁移INCOMPLETE。保留用户数据、缓存、未跟踪文件和既有editor_support.h状态，阶段保存推送dev。


### 2026-11-09：网格图层变换入口与目标解析阶段

核对legacy workspace-commands-selection-transform.ts beginLayerTransform及workspace-session.ts selectedTransformLayersForSession：单个显式网格层可选取当前帧非透明内容与画布交集；特殊层混合多选拒绝；纯帧选择只包含可见未锁普通层。原生移除单网格入口总拒绝，并修正纯帧选择把特殊层一并拒绝的问题。入口仅建立选区，不创建像素事务、浮动内容或内容历史；Paint/Create/Edit/Hybrid使用相同边界语义。未开放Paint自由变换后续预览/提交，不把派生像素缓存修改当作瓦片迁移。

核心24组四模式×linked/independent×原点/部分移位/全部画布外场景，附带隐藏、锁定、混合普通层、特殊多层拒绝及纯帧普通层选择，检查历史/revision/画面/links/cell references不变；三项CTest document-transactions/free-tile-project/tilemap-document通过26.95s。正式Release构建成功；四模式实际菜单与Ctrl+T及锁定拒绝通过 --tileset-management-check --grid-transform-entry-only，退出0。完整tileset-management诊断在既有fill fixture的canvasOwnsPointer前置条件失败，尚未跑到新场景；新增专用参数仅隔离入口场景，不宣称完整瓦片GUI诊断通过。未修改填充规则。

744来源覆盖与证据快照检查及diff检查通过，无新增FPS或人工图像验收，未重跑全套。Paint浮动自由变换/多目标、待用户选择的活动蒙版移动语义与扩展兼容仍未完成，整体INCOMPLETE。保留全部用户数据、构建缓存、未跟踪文件及editor_support.h既有状态，阶段保存推送dev。


### 2026-11-09：完整瓦片窗口诊断前置隔离修复

承接上一阶段完整 --tileset-management-check 在填充canvasOwnsPointer前置条件失败。增加命中类型/所属栏目/边界/捕获诊断，实测point702,434命中TilesetPanel::Grid、column11、bounds590,270,420,426、capture0：前一个管理夹具打开的悬浮瓦片集面板覆盖了后续画布原点。曾先推测预览面板，关闭后失败完全相同，已撤回该无效修改；最终仅在填充/形状渐变指针夹具显式关闭瓦片集面板，保留真实命中和所有事务断言，产品填充、窗口命中、默认布局均未改。

正式Release构建成功；完整 --tileset-management-check实际退出0，依次运行瓦片集管理/剪贴板、填充、形状渐变预览、四模式变换菜单及CtrlT、既有链接Create/Edit/Hybrid与选区删除等诊断。关闭上一阶段该项GUI验收缺口；744来源覆盖与证据快照及diff检查通过。未重跑全套CTest，无新增FPS/人工图像验收，不以诊断修复宣称功能迁移完成。Paint浮动自由变换/多目标、活动蒙版移动语义选择及扩展兼容仍有缺口，整体INCOMPLETE。保留用户数据/缓存/未跟踪文件及editor_support.h原状态，阶段保存推送dev。


### 2026-11-09：Paint 浮动变换资源事务修复阶段

用户明确批准修复 legacy Paint 浮动提交只改像素缓存、转换瓦片与像素历史均被排除的缺陷（workspace-commands-selection-floating.ts）；普通拖动继续整格移动。单个标准零原点、画布等大网格的 Paint 自由变换现复用 Create 转换与增量资源历史，保留已有瓦片、显式同层链接及独立帧。键盘移动待提交内容不再错误进入整格移动分支；大图继续使用既有延迟预览。

核心回归扩展小图/大图、移动/复制、重复调整、取消、完全画布外提交及 Undo/Redo；工程/恢复格式新增缩放翻转、旋转倾斜、四角变换的缓存与引用一致性和重开检查。现有链接 Create 界面诊断也扩展到 Paint 自由变换的鼠标、Escape、Ctrl复制与 Enter。

范围仍有明确缺口：偏移/非整画布网格、多目标、runtime shared 别名与混合自由瓦片文档尚未在本事务开放；Paint 待提交 Cut/Delete 也保留既有门控。本阶段不代表完整 Paint 迁移完成，不新增 FPS 改善结论。

本阶段核心验证：正式目标的核心依赖与两项测试构建成功；CTest document-transactions/free-tile-project/tilemap-document 三项通过21.85s。首次瓦片测试停在旧 Paint 拒绝断言，按批准的新行为更新后通过；744文件来源及证据快照检查通过，整体对齐仍 INCOMPLETE。

正式 Release 构建成功，完整 --tileset-management-check 实际退出0。首轮新增 Paint GUI 夹具只设置自由变换标志，被刷新按既有规则清除，未进入真实自由变换事务；修正夹具调用 startFreeSelectionTransform 后通过，未修改刷新规则。未重跑全套210项，无新增FPS或人工截图验收。保留用户数据、缓存、未跟踪文件与 editor_support.h 既有状态，阶段提交推送 dev。


### 2026-11-09：Paint 偏移与补边网格浮动事务阶段

承接用户批准的完整瓦片事务修复，对照 legacy tilemap-document.ts tilemapCellIndexesForEdit 的世界坐标减 surface.offset 和 rgbaCellPixelsFromSurface 完整单元格读取，开放 Paint 单个固定网格的正负偏移及画布非整瓦片补边。复用已有 deferred overlay 路径而不扩展/改写派生缓存几何，预览按固定网格范围裁剪；提交将画布修改映射回局部瓦片，保留画布外 texels、原瓦片资源、显式同层链接和单次历史。普通 Paint 整格拖动保持既有路径；Create/Edit/Hybrid 的现有限制保持原状。

工程/恢复回归扩展为移动与复制 × linked/independent × native/recovery × 缩放翻转/旋转倾斜/四角变换 × 零/正/负偏移，共72组合；使用7×3画布与2×2瓦片同时覆盖补边。核对取消无历史、待提交键盘按像素移动、预览与提交一致、完整网格原点不变、画布外像素不变、保存重开及Undo/Redo。最初新一致性断言失败于未重编裁剪处理的旧对象，显式重编后全部通过；补边/偏移旧拒绝断言按新增支持更新。

正式Release构建成功；CTest document-transactions/free-tile-project/tilemap-document三项全部通过29.27s；完整 --tileset-management-check 实际退出0。来源覆盖与快照及diff检查通过。窗口诊断覆盖既有完整瓦片交互，新增偏移矩阵为核心/持久化验收，未新增偏移专用鼠标或人工截图验收，无新增FPS结论，未重跑全套。多目标、runtime shared别名、混合free文档及Paint待提交Cut/Delete等仍有迁移缺口，整体INCOMPLETE。保留用户数据、缓存、未跟踪文件与editor_support.h既有状态，阶段保存推送dev。


### 2026-11-09：Paint 浮动后续剪切／删除与四角复制阶段

对照 workspace-commands-clipboard.ts cutSelection、workspace-commands-selection-effects.ts deleteSelection 及 workspace-floating-clipboard.test.ts，补齐 Paint pending 的已有路由：Cut复制变换源、取消目标、尝试原位置删除并完成选区；静态Paint像素删除继续按legacy拒绝，因此不误删背景/源。Delete先提交选区来源浮动事务，再按legacy拒绝静态像素删除，保留选区；用户已批准的完整瓦片事务确保这次提交可保存和撤销。模式漂移仍在修改前拒绝。

同时发现共用copyPixels没有平移quad角点到局部目标，导致四角浮动复制为空或错位。按workspace-floating-clipboard.ts的translateSelectionQuad修复，沿用旧版旋转quad的精确输入/像素/mask预期，验证不复制背景、不提交。Paint72组合新增pending Cut/Delete、原资源/目标恢复、历史与native/recovery检查；真实窗口新增CtrlX和Delete结算、Undo/Redo。初始新断言把无采样内容一概当成成功复制，改为核对既有空返回与选区完成行为；GUI失败则由quad复制坐标修复解决。

正式Release构建成功，CTest document-transactions/free-tile-project/tilemap-document全部通过17.22s；完整--tileset-management-check实际退出0；744文件来源覆盖、证据快照和diff检查通过。未重跑全套或新增FPS/人工截图验收。多目标、runtime shared别名、混合free文档等仍未迁移，整体INCOMPLETE。保留用户数据、缓存、未跟踪文件及editor_support.h既有状态，阶段保存推送dev。


### 2026-11-09：混合自由瓦片文档的 Paint 网格变换阶段

对照 legacy workspace-session.ts selectedTransformLayersForSession/selectedTransformLayersAreEditable，单个显式网格目标不因文档含无关自由瓦片层而拒绝。原生仅为已支持的单Paint网格解除文档级free门控，覆盖浮动捕获、待提交像素方向键、Cut及资源提交；保留目标owner、几何、链接和资源前置检查，其它模式/多目标/runtime别名限制未泛化放开。

新增linked/independent × move/copy ×零/负偏移八组混合文档回归，检查变换预览、取消、提交、Undo/Redo、native/recovery重开和pending Cut/Delete；逐项比较未选free层的实例、源元数据、缓存、位置及所有既有瓦片像素。初始重开比较因preservedJson规范化与运行对象不同失败，改为与同一未变换基线经相同保存重开后的对象比较；运行阶段仍保持原对象精确比较，不修改序列化规则。

正式Release构建成功；CTest document-transactions/free-tile-project/tilemap-document全部通过19.27s，完整--tileset-management-check实际退出0；744来源覆盖及证据快照和diff检查通过。新增混合场景为核心/持久化检查，未新增混合场景鼠标专项或人工截图、FPS验收，未重跑全套。普通Paint整格移动在含free文档仍有独立门控，本文不宣称该路径迁移；多目标/runtime shared等缺口继续保留，整体INCOMPLETE。保留用户数据、缓存、未跟踪文件和editor_support.h既有状态，阶段保存推送dev。


### 2026-11-09：混合自由瓦片文档的 Paint 整格操作阶段

对照 legacy tilemap-document.ts captureTilemapSelectionMove/flipTilemapSelection 及 workspace-commands-selection-move/flip，移除 expandedPaintCellSelection 与键盘分发对无关free层的文档级拒绝，复用既有canonical owner整格移动/复制/翻转事务，保留所有目标、链接、锁定、可见性、选区及几何前置检查。

新增linked/independent × move/copy ×零/正/负偏移12组混合核心检查，覆盖预览、取消、一次提交、Undo/Redo、键盘、水平翻转和native/recovery画面重开，核对无关free实例、缓存、位置及全部瓦片源像素不变。扩展现有真实鼠标Paint移动夹具，加入无关free层，覆盖拖动/Escape/方向键/Ctrl复制及无关数据。首轮窗口断言失败因创建free层改变瓦片模式，夹具返回目标层时显式恢复Paint后通过，未修改产品模式切换逻辑。

正式Release构建成功；CTest document-transactions/free-tile-project/tilemap-document全部通过27.79s；完整--tileset-management-check实际退出0；744文件来源和证据快照及diff检查通过。未重跑全套、未新增FPS或人工截图验收。多目标/runtime shared别名等仍有迁移缺口，整体INCOMPLETE。保留用户数据、缓存、未跟踪文件及editor_support.h既有状态，阶段保存推送dev。


### 2026-11-09：Paint 待提交选区翻转阶段

依据 legacy workspace-commands-selection-flip.ts::flipActiveSelection 的 pendingPaste 优先级，修复原生 Paint 浮动选区提前进入静态整格翻转而拒绝操作的问题。浮动继续复用既有源像素/不规则mask翻转，保持几何与待提交状态，不增加预览历史、不修改资源；静态Paint继续整格翻转。菜单门控放行已经捕获的浮动，提交沿用用户批准的Create瓦片事务。

新增两个方向×移动/复制×链接/独立×零/正/负偏移24组检查，覆盖精确像素/mask反射、双翻恢复、取消、一次提交、保留旧资源、Undo/Redo及native/recovery持久化。首轮夹具在部分偏移下没有选到有色像素，补充不同色源像素确保每组有有效内容；核心三项全部通过34.39s。扩展真实菜单水平翻转和ShiftV检查，窗口首轮翻转通过，但提交比较误用只支持deferred的overlay接口，改为按实际预览模式取像素。最终窗口验收结果见下。

正式Release构建成功；完整 --tileset-management-check 实际退出0，744文件来源覆盖与证据快照及diff检查通过。未重跑全套、未新增FPS或人工截图验收。多目标/runtime shared别名等仍有迁移缺口，整体INCOMPLETE。保留用户数据、缓存、未跟踪文件及editor_support.h既有状态，本阶段保存推送dev。


### 2026-11-09：网格运行时共享 Cel 事务阶段

核对 legacy tilemap-document.ts::tilemapCelTargetAt/captureTilemapSelectionMove/flipTilemapSelection/applyTilemapDocumentEdit 与 animation.ts 的源解析，以及原生既有 runtimeSharedCelId 和 project_encode.cpp 的保存展开机制。同层无私有surface的显式/运行时混合链统一解析到规范源；不把runtime关系变为持久新链接。原生特殊图层原本禁止linkedContentId，因此保留该模型约束，不推广普通关联图层语义。

扩展统一owner前置检查与Create/Edit/Hybrid共享探测，复用既有Paint整格/画笔、静态删除及四种模式浮动事务；保留跨层、双重链接、私有缓存、仅物理像素缓冲共享及不支持几何布局的拒绝。新增40组模式×操作×活动root/leaf对照显式链，检查取消、源资源、历史、Undo/Redo、规范缓存和所有帧native/recovery持久化；旧runtime Paint拒绝测试更新为真实移动/翻转验收。窗口Create/Paint既有完整鼠标、Escape、Ctrl-copy、Enter、Cut/Delete及待提交翻转夹具增加runtime混合链。首轮编译因测试调用private探测接口失败，改用公开beginSelectionContentMove入口，未放宽API。

核心free-tile-project通过25.64s，document-transactions与tilemap-document通过0.64s；744来源覆盖与证据快照、diff检查通过。正式构建和窗口最终结果补充如下。整体INCOMPLETE，多目标/非Paint偏移等未宣称迁移，无新增FPS或人工截图验收。

窗口首轮在初始化报Missing tilemap metadata：runtime别名按既有Timeline规则需要保留tilemap元数据，只有显式linkedCelId可省略。调整窗口夹具保留runtime元数据，与核心夹具和现有生命周期一致，不修改生产校验规则。

最终正式Release构建成功，完整 --tileset-management-check 实际退出0（含显式和runtime混合链）。最小相关三项核心检查、来源覆盖及diff检查均通过；保留用户文件、缓存和editor_support.h既有状态，本阶段提交推送dev。


### 2026-11-09：混合文档 Create/Edit/Hybrid 选区事务阶段

依据 legacy workspace-session.ts::selectedTransformLayersForSession/selectedTransformLayersAreEditable 和 tilemap-document.ts 的目标源事务，单网格操作不因无关自由瓦片层拒绝。移除捕获、方向键、Cut/Delete与Create/Edit/Hybrid适配器的文档级free门控，独立owner也复用同一目标检查，仍校验几何、锁定、模式、资源引用、规范链与所选范围。菜单transform/freeTransform及翻转包装器对网格委托既有谓词，free本身保持原规则。

既有runtimeGridTransactions扩展为96组：四模式×六操作（移动、浮动翻转、删除、复制缩放、绘制、剪切）×root/leaf×纯网格/混合free，比较显式链和runtime链、一次事务/取消/UndoRedo、所有帧native/recovery及未选free实例/cache/offset。真实Create/Paint显式/runtime完整鼠标夹具加入无关free层。首轮混合导入夹具因新增帧缺少free Cel不满足现有完整timeline规则，补齐对应槽位而不修改导入校验。

CTest document-transactions/free-tile-project/tilemap-document全部通过33.39s，744文件来源覆盖与证据快照及diff检查通过。渐变/形状preview、资源管理仍有独立门控，本阶段不宣称整个网格域迁移完成；整体INCOMPLETE，多目标和非Paint偏移等保留，无新增FPS及人工截图验收。正式构建和实际窗口最终结果补充如下。

最终正式Release构建成功；完整 --tileset-management-check 实际退出0，包含混合free的Create/Paint显式/runtime链鼠标、菜单、快捷键和结算。保留用户数据、缓存与editor_support.h既有状态，本阶段提交推送dev。


### 2026-11-09：混合及共享网格渐变／形状预览阶段

对照 legacy tilemap-document.ts::tilemapCelTargetAt/applyTilemapTilesetDocumentEdit 与 pending-gradient-session.ts 的冻结目标、选区和revision，原生预览改捕获规范源Cel而非要求活动槽位私有网格；统一同层显式/runtime链及无关free混合文档的owner/reference前置检查。预览仍只更新独立display，提交暂移出pending避免active门控后复用Create/Edit/Hybrid既有规范资源事务，异常恢复pending。补边独立网格保留原fallback；Paint拒绝、offset及多目标限制保留。

既有矩阵扩展为128组，新增渐变与矩形预览的源资源/缓存/历史隔离、取消/重启、一次提交、预览与结果一致、显式/runtime源、root/leaf、混合free、Undo/Redo及所有帧native/recovery。旧补边、同瓦片多帧/多层预览测试继续通过。真实Create鼠标形状release/Escape与渐变Enter/Escape夹具扩展混合free独立/linked帧。CTest三项document-transactions/free-tile-project/tilemap-document全部通过35.41s；744来源覆盖及证据快照与diff检查通过。正式窗口结果补充如下。整体INCOMPLETE，资源管理、多目标和offset等尚未完成，无新增FPS及人工截图验收。

最终正式Release构建成功，完整 --tileset-management-check 实际退出0，包含新增混合free独立/linked渐变及形状真实鼠标交互。保留用户数据、缓存及editor_support.h既有状态，本阶段保存推送dev。


### 2026-11-09：混合文档瓦片资源管理阶段

对照 workspace-commands-tilemap.ts 的 add/reorder/slots/delete/commitTilesetTileEdit 与 workspace-unused-tiles.ts，开放含无关自由瓦片层的独立网格资源管理。提交保留规范 Cel 链、surface 尺寸及世界偏移，仅重绘受影响缓存，避免旧 rebuildTilemapCaches 重置全部网格。自由源继续使用专用管理入口。

新增六项混合管理回归和自由表拒绝检查，覆盖偏移 linked grid、无关 free 数据保持、Undo/Redo 与 native/recovery；真实 panel 管理夹具增加无关 free。正式 Release 构建成功，完整 --tileset-management-check 退出0；free-tile-project 通过33.59s，document-transactions 及 tilemap-document 通过；744 文件来源覆盖及 diff 检查通过。未新增 FPS 或人工截图结论，整体 INCOMPLETE。本阶段已保存推送 dev。

后续契约核对纠正：legacy/src/renderer/src/core/project-format-decode.ts 的现代自由源校验明确要求 tileIds.length===1、columns===1、rows===1，并禁止 tilemapTilesetIds 拥有该表；native/src/project_import.cpp 的 Invalid free tile source sheet 与之对应。因此跨类型共用表不是格式迁移缺口，不放开既有校验。之前十二组 shared/unrelated 验收的说法不成立，实际有效覆盖为六项独立网格操作。补充现代自由源所有权回归，验证合法共享 free catalog 与独立 grid 可导入，以及多瓦片、非1×1布局、grid共用表在 native/recovery 解析后的导入阶段被精确拒绝。

本次契约回归：free-tile-project-tests Release 构建成功；完整 free-tile-project 通过23.51s（CTest总23.56s）；八项拒绝均命中 Invalid free tile source sheet，合法共享自由源目录保持可导入。744来源覆盖及证据快照、git diff --check通过。仅测试与台账变更，无生产代码或正式程序更新，无新增性能结论。


### 2026-11-09：Create 偏移与补边网格选区事务阶段

依据 legacy tilemap-document.ts 的 tilemapCellIndexesForEdit 世界坐标减 surface.offset 与 rgbaCellPixelsFromSurface 完整单元格读取，Create 捕获/提交不再要求零原点且等画布缓存。复用既有 Paint deferred overlay 裁剪与 canonical Create 资源增量历史，固定网格位置、范围及画布外 texels；包括浮动移动/复制、缩放旋转倾斜、四角变换、静态 Cut/Delete、取消、Undo/Redo 与保存。保留画笔原几何前置条件，未泛化开放 Edit/Hybrid 偏移预览或多目标。

新增90组合：移动/复制×独立/显式链接/runtime链接×零/正/负偏移×平移/仿射/四角/Delete/Cut；混合free文档检查无关实例/cache与链接拓扑保持、native/recovery重开。旧Create偏移/补边拒绝断言更新为捕获取消和空区域Cut的旧版完成行为；首次旧测试崩溃源于断言读取已被空Cut清除的optional，修正测试后tilemap-document通过。完整free-tile-project本轮通过31.84s，document-transactions通过0.30s。正式窗口新增三个布局的free-transform入口/Escape/Enter/UndoRedo检查；最终构建与验收结果待补。整体INCOMPLETE，无新增FPS结论。

最终核心复验：正式依赖与测试重编后，CTest document-transactions/free-tile-project/tilemap-document全部通过49.97s，含逐像素画布外texels和全部既有源瓦片不变断言；744来源覆盖及证据快照通过。正式程序首轮完成后核对editor_smoke对象时间，确认新增窗口夹具尚未纳入，因此追加该文件重编，窗口结果以后续为准。

正式Release最终构建成功，完整 --tileset-management-check 实际退出0，包含三个偏移/补边布局的Create自由变换命令、Escape、Enter与完整Undo/Redo。窗口夹具首轮只改rect未改quad，导致实际未变换，修正同步quad；后续按实际内容变化、预览一致和全部历史撤销重做验证，保留既有可选选区完成历史，不修改产品历史逻辑。无人工截图或FPS验收，未重跑全套。保留用户文件、缓存、未跟踪数据与editor_support.h既有状态，本阶段提交推送dev。


### 2026-11-09：偏移网格共享资源与预览事务阶段

对照 legacy tilemap-document.ts::applyTilemapTilesetDocumentEdit、tilemapCellIndexesForEdit、rgbaCellPixelsFromSurface，补齐Edit/Hybrid静态Cut/Delete与Create/Edit/Hybrid渐变/形状的偏移及补边网格。共享预览按世界region减canonical surface offset枚举单元格，在局部sourcePoint映射写源像素；所有引用继续按自身局部格位置修补完整缓存，dirty region使用各自世界偏移。Hybrid空/外部引用单元格raw preview同样区分世界采样与局部存储，保留画布外texels。静态增量历史允许偏移canonical owners，保留拓扑、资源引用和几何；原画笔及活动Edit/Hybrid偏移浮动入口限制仍保留，不把这部分算作迁移完成。

新增72组合：Edit/Hybrid×独立/显式/runtime链接×零/正/负偏移×渐变/矩形/Delete/Cut，混合free隔离、取消重启、preview/commit、UndoRedo、native/recovery一致。更新其他reference owner偏移的旧拒绝断言为操作与取消/Undo检查。free-tile-project通过58.74s，document-transactions/tilemap-document通过1.02s；744来源及证据快照通过。正式窗口夹具扩展三种模式×linked/independent×三个偏移，鼠标形状release/Escape及渐变Enter/Escape；最终构建与窗口结果待补。整体INCOMPLETE，无新增性能结论。

正式Release最终构建成功，完整 --tileset-management-check 实际退出0，覆盖18种模式/链接/偏移组合的真实鼠标形状与渐变提交/取消。首轮正偏移渐变从网格外透明点开始，按既有规则无资源修改，夹具错误要求新增历史；改为所有布局均有内容的(1,1)起点后通过，未改变产品填充规则。未新增人工截图/FPS或全套验收。保留用户数据、缓存及editor_support.h既有状态，本阶段提交推送dev。


### 2026-11-09：Edit 偏移网格浮动变换阶段

依据 legacy tilemap-document.ts 的世界坐标锚点定位、锚定源像素编辑和完整单元格采样，Edit浮动允许偏移/补边canonical网格。prepare冻结规范source Cel与世界anchor region，translation裁剪使用offset，detached preview以canvas baseline读取而非局部缓存，跳过普通sparse变换路由，复用共享源preview和既有incremental提交/history。Hybrid活动偏移浮动仍未迁移。

新增54组合：move/copy×independent/explicit/runtime×零/正/负偏移×translation/affine/quad，验证无关free、refs/geometry、取消、预览等于提交、UndoRedo和native/recovery。负偏移quad可能不改冻结锚点的源像素，保留selection-only历史并验证资源/像素完全不变。窗口linked Edit真实drag/Escape/Ctrl-copy/Enter/UndoRedo扩展三个原点；首轮比较误用局部displayPixels，改为世界canvas composite。最终结果待补，整体INCOMPLETE。

最终正式Release构建成功，完整 --tileset-management-check 实际退出0，三个原点Edit真实鼠标与结算/UndoRedo通过。free-tile-project完整通过61.82s；document-transactions及tilemap-document本轮通过；744来源与快照及diff检查通过。未新增FPS/人工截图或全套验收。保留用户文件、缓存、未跟踪数据与editor_support.h既有状态，本阶段提交推送dev。


### 2026-11-09：Hybrid 偏移网格浮动事务阶段

依据 legacy workspace-commands-selection-floating.ts 的 hybridCellTranslation 与 tilemap.ts::tilemapCellTranslationForSelection，Hybrid整格对齐以surface世界原点为准，完整移动/复制单元格引用；非对齐与非平移变换复用Hybrid资源事务。偏移/补边布局捕获独立shared preview canvas，不走可扩展sparse surface路径；取消不改authority，提交保留canonical topology/geometry及历史。整格preview单独按冻结refs构造detached移动结果，不把平移像素写入共享源。原零原点等画布dense preview保留既有路径。

新增72组合：move/copy×独立/显式/runtime×零/正/负偏移×像素平移/仿射/quad/整格平移；检查mixed free隔离、取消、源/history、UndoRedo及native/recovery。首次新增整格一致性失败揭示shared pixel preview与cell move语义冲突，已修复偏移preview并新增精确cell refs断言；零原点既有dense整格preview不据此宣称等同commit。实际linked Edit夹具扩展Hybrid与三个原点，最终验收待补。整体INCOMPLETE。

核心最终复验三项document-transactions/free-tile-project/tilemap-document全部通过70.66s，free-tile-project68.38s。真实窗口首轮复用Edit冻结authority断言不适用于既有等画布Hybrid即时缓存预览，按原有两种预览所有权区分断言，取消/资源保持仍精确检查。正式窗口重编验收待补。

窗口第二轮发现等画布Hybrid既有共享源提交与dense raw preview并不逐像素相同，此差异不属于本阶段偏移路径；实际窗口新增Hybrid验证收敛到正/负偏移，Edit仍覆盖三个原点。零原点Hybrid继续由核心事务测试验证资源、取消、历史与持久化，不宣称预览等价。窗口最终结果待补。

最终正式Release重编成功，完整 --tileset-management-check 实际退出0，包含Edit三个原点及Hybrid正/负偏移的实际鼠标drag/Escape/Ctrl-copy/Enter/UndoRedo。核心三项通过70.66s，744来源覆盖/证据快照及diff检查通过。保留零原点Hybrid既有preview差异为已知限制；无新增FPS或人工截图验收，整体INCOMPLETE。本阶段提交推送dev，用户文件、缓存及editor_support.h既有状态保留。


### 2026-11-09：偏移网格像素画笔事务阶段

对照legacy core/tilemap-document.ts的rgbaCellPixelsFromSurface、tilemapCellIndexesForEdit及已有指针Edit锚点语义，Create/Edit/Hybrid规范网格画笔入口移除等画布限制，锚点按canonical surface世界原点定位。偏移/补边笔画使用既有临时画布surface与合成器overlay，不扩张规范网格；取消丢弃缓冲，提交复用完整源瓦片/引用/history事务，维持链接几何。共享资源夹具从72组扩展到99组，新增三模式×三链接×三原点的笔画取消/提交/UndoRedo/native/recovery。Create渐变/形状不套用共享源preview断言，其原专用测试保持。验证进行中，整体INCOMPLETE。

最终核心document-transactions/tilemap-document通过0.86s，free-tile-project通过55.40s；正式Release完整重编成功，既有完整 --tileset-management-check 实际退出0。新增27组偏移笔画为核心事务验收，本轮未新增真实指针专用夹具或人工截图/FPS，不将既有窗口检查等同新增场景覆盖。744来源覆盖及证据快照通过，整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-09：Hybrid 即时浮动预览迁移阶段

依据legacy tilemapEditPreviewTilePixels及canvas-render-tile-preview.ts共享资源预览、workspace-commands-selection-floating.ts整格引用事务，将等画布Hybrid接入已迁移的detached资源预览路径。取消保持authority，非整格变换预览共享源，整格预览移动引用，不改变提交资源语义。去除零原点preview豁免及窗口跳过；核心矩阵增加8×4精确等画布布局，与7×3补边布局共144组。此前记录的零原点预览限制待本阶段复验消除，整体INCOMPLETE。

首轮144组free-tile-project通过43.98s，document-transactions通过；tilemap-document发现大画布deferred优化被覆盖，按已有supportsDeferredFloating保留等画布大作品延迟路径，新增shared preview仅替换原即时dense分支。保留性能契约，最终复验待补；不宣称大画布deferred共享源预览已统一。

最终free-tile-project完整通过38.78s（144组合），document-transactions通过0.28s；tilemap-document最终单独复验通过，保留大画布deferred断言并将旧“display资源不变”检查改为authority资源不变及sampled preview=commit。正式Release重编成功，完整 --tileset-management-check 实际退出0，Edit/Hybrid三个原点真实鼠标drag/Escape/Ctrl-copy/Enter/UndoRedo通过，之前零原点即时preview差异已消除。大画布deferred共享源preview仍不宣称统一；无FPS/人工截图结论，整体INCOMPLETE。744来源/证据及diff通过，本阶段保存推送dev。


### 2026-11-09：Hybrid浮动预览旧版差异复核（等待用户语义决定）

精确复核legacy/src/renderer/src/components/canvas-render-tile-preview.ts:140-147发现hybridSelectionVariantPreview明确识别selection来源，并通过!hybridSelectionVariantPreview排除共享源tilemapEditPreviewTilePixels显示。此前即时预览阶段仅记录共享源预览入口，遗漏这个排除条件，因此“等同旧版预览”的来源结论不成立；原生e1a9db49改变了Hybrid选区浮动显示语义，虽保留提交事务，但需要用户决定。已询问采用预览/提交一致并继续大画布优化，或恢复旧版局部像素预览。等待回答前不修改业务路径，不将此项算作完成迁移。上一阶段测试证明原生新预览一致，不能证明旧版行为等价。整体INCOMPLETE。


### 2026-11-10：混合文档与链接网格填充事务阶段

旧版canvas-input-fill.ts beginFill通过floodFillSymmetric提交workspace-commands-history.ts::commitPixelEdit，再转convertTilemapPixelEdit规范源事务；没有文档含free层便拒绝网格填充的规则。原生移除该旧门控和leaf独立tilemap要求，改为canonical固定网格及Edit/Hybrid引用预检，复用偏移采样/填充算法与已有三模式资源history。新增54组：三模式×独立/显式/runtime链接×三原点×连续纯色/不连续图案，检查无关free隔离、缓存几何、单笔历史、UndoRedo及native/recovery。验证待补，整体INCOMPLETE。

用户已明确采用Hybrid“预览与提交一致，保留大画布延迟优化”，此前等待决定解除；e1a9db49即时路径为用户批准的新行为，大画布延迟一致性仍待后续完成。

最终三项CTest document-transactions/free-tile-project/tilemap-document全部通过38.27s，free-tile-project37.72s。正式Release增量构建成功，完整 --tileset-management-check实际退出0。新增54组混合/链接/偏移填充为核心事务验证，未新增这些组合的专用真实鼠标夹具；现有窗口填充检查通过，不能替代新组合窗口验收。744来源覆盖/证据及diff检查通过，整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：大画布Hybrid延迟预览资源一致性阶段

按用户批准的新行为，保持floatingDeferred及既有transform局部采样，按候选source/destination单元格计算共享源texel修改；整格平移直接映射最终引用。请求region按单瓦片临时buffer渲染，不安装timeline副本或在move执行全画布变换。共享引用可能位于任意位置，因此Hybrid延迟预览dirty使用全画布范围，正确性优先，未宣称FPS提升。既有260×260混合外部/空/翻转旋转引用fixture增加整格preview=commit及8组move/copy translation/affine/rotation/quad，局部region与全幅一致、authority冻结、UndoRedo。初次核心通过，最终复验待补。整体INCOMPLETE。

最终三项CTest document-transactions/free-tile-project/tilemap-document全部通过36.60s，free-tile-project36.02s；正式Release构建成功，完整 --tileset-management-check实际退出0。新增大画布延迟一致性为核心事务验收，窗口沿用既有检查，未新增大作品鼠标夹具、FPS或截图。保留floatingDeferred和不写authority契约，但Hybrid共享源变化当前使用全画布dirty并扫描网格候选；仍需性能量测与引用级dirty优化，不能把延迟路径标志等同已证明性能无回退。744来源/证据及diff检查通过，整体INCOMPLETE，本阶段推送dev。


### 2026-11-10：Hybrid延迟预览候选格与输出遍历优化

复用legacy tilemap-document.ts::tilemapCellIndexesForEdit世界边界转单元格范围，源/目标候选格取有序并集，取消每次overlay全网格遍历。输出按请求范围逐瓦片渲染一次并逐行copy span，代替逐像素索引及每行重复cellPixels；仍只保留单格临时像素。8组变换新增负坐标、右下越界、完全画布外及跨格region与整幅逐像素对照。全画布dirty尚保留；不据此声称FPS提升，最终验证待补。整体INCOMPLETE。

最终三项CTest全部通过39.39s，free-tile-project38.83s，tilemap-document0.26s。正式Release构建成功，完整 --tileset-management-check实际退出0；744来源覆盖/证据及diff检查通过。新增regional裁剪为核心验收，无新增大作品真实指针、截图或FPS测量。全画布dirty与每次重建候选资源patch仍为性能后续项，整体INCOMPLETE。本阶段推送dev。


### 2026-11-10：Hybrid延迟预览引用脏区迁移阶段

对照legacy tilemap-document.ts局部rerenderTilemapCells与rerenderTilesetTileReferences，脏区合并旧/新目标及移动源，扩为完整候选格，再包含活动canonical网格所有同源引用。渲染器revision跳跃fallback保持；取消/提交使用既有通知。8组move/copy变换检查初次预览及连续移动全部变化像素落在dirty内，同时局部作品dirty小于画布。仍扫描引用列表，资源patch未缓存；不宣称FPS提升。最终验证待补，整体INCOMPLETE。

最终三项CTest全部通过38.65s，free-tile-project38.09s、tilemap-document0.25s；正式Release构建及完整 --tileset-management-check实际退出0。744来源/证据及diff通过。新增dirty逐像素覆盖为核心验收，窗口仍为既有夹具；未新增FPS/大作品真实指针测量。引用扫描和候选资源patch缓存仍待优化，不把局部dirty声明为整体迁移完成，整体INCOMPLETE。本阶段推送dev。


### 2026-11-10：混合/链接/偏移网格填充实际窗口验收阶段

对照legacy canvas-input-fill.ts按下commit与释放/Escape事务，扩展正式窗口smokeTilemapFill为54组：三模式×独立/显式/runtime链接×三个原点×纯色连续/图案不连续，文档含无关free层并带像素选区。真实tool.fill、mouse down/up和Escape检查单笔提交、取消、UndoRedo、规范源身份、缓存几何、链接与free隔离。未改产品填充算法或交互，补齐b8550232缺失的新组合窗口验收，结果待补；整体INCOMPLETE。

最终正式Release构建成功，完整 --tileset-management-check实际退出0，包含新增54组真实工具/鼠标/Escape/UndoRedo验收。产品源码未改，本轮未重复核心CTest，沿用b8550232核心证据并明确补齐窗口范围；无人工截图或FPS结论。整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：Hybrid延迟平铺变换候选范围阶段

旧版workspace-magic-eraser.ts明确拒绝特殊图层，核对原生门控一致，未擅自开放。复验wheel-performance/workspace-layout均通过40.48s，台账后续已有修复记录。转查延迟Hybrid平铺：raw采样沿用repeatedFloatingTranslation，但candidate只含原始目标，目标离开画布时漏掉wrapped目的地；现复用repeat::wrapSelection加入候选范围。260×260夹具增加X/Y/Both各move/copy，验证资源预览与提交、dirty覆盖、regional裁剪、UndoRedo。最终结果待补，整体INCOMPLETE。

最终三项核心CTest全部通过41.03s，free-tile-project40.37s、tilemap-document0.31s；正式Release构建成功，--tileset-management-check实际退出0。补充--tile-repeat-check实际退出1，错误为Repeated airbrush begins，位于喷枪mouse down入口检查，未通过，不归入成功验收；该入口未调用本轮修改的floatingOverlayRegion，但失败根因尚未确认，登记为后续待查。新增6组平铺为核心事务覆盖，未新增大画布真实指针夹具或FPS量测。整体INCOMPLETE。


### 2026-11-10：完整平铺窗口验收与持久化快捷栏隔离

接续上阶段Repeated airbrush begins失败，诊断确认free=0、Y平铺、copy=1，点击在画布视口内，但frontWidgetAt为QuickCommandBar(228,150,544,38)，canvasOwnsPointer正确拒绝。旧版styles.css快捷栏绝对定位覆盖画布，canvas-input-stroke.ts及canvas-input-free-tile-edit.ts喷枪事务核对不需改变产品。平铺诊断入口关闭内存中的快捷栏显示配置，保留实际输入所有权门控，错误补充free/mode/copy上下文；不写用户偏好。

正式Release构建成功；完整--tile-repeat-check实际退出0，包含全工具平铺指针、UndoRedo/Escape以及旋转/镜像/缩放文字素材alpha与命中逐像素比对；独立--quick-command-check实际退出0。三项CTest tile-repeat/tile-repeat-stroke/tilemap-document通过1.29s。该结果关闭上阶段喷枪入口验收失败，不声称新增大画布Hybrid真实指针覆盖或FPS提升。整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：大画布Hybrid延迟预览实际输入验收

沿用smokeLinkedHybridFloating原16×4夹具，增加260×260共享源、外部资源、空单元格、独立源及两级显式链接；画布原点放入可见区域，隔离持久化快捷栏。新增四组move/copy×aligned/sampled，实际down/move/up确认floatingDeferred、canonical像素/资源/历史冻结，Escape取消后重复手势得到相同预览；Enter结果逐像素等于deferred overlay，dirty小于画布，双Undo/Redo恢复引用、资源、缓存与链接拓扑。该行为依据用户批准“预览与提交一致，保留大画布延迟优化”，不声明与旧Hybrid局部预览等价。

正式Release构建成功，完整--tileset-management-check实际退出0；document-transactions/tilemap-document通过0.62s。新增覆盖为大画布平移实际输入，平铺/affine/quad仍沿用核心验收；没有新增FPS量测。整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：Paint选区捕获候选范围性能迁移

核对legacy workspace-session.ts selectedTransformLayersAreEditable对多个特殊层的拒绝，未擅自开放Paint多目标。复用tilemap-document.ts tilemapCellIndexesForEdit的世界边界减offset、裁剪后转格坐标，expandedPaintCellSelection与beginPaintCellMove改按候选矩形行优先枚举，替代两次全网格扫描。逐像素mask判断、完整格扩展、离散翻转画布外格、空格、偏移与预算准入保持。独立全网格oracle覆盖30组正/负/零offset×矩形/稀疏mask×负/内/边缘/外侧选区，比较准入、扩展选区及取消后的引用与缓存。

正式Release构建成功，完整--tileset-management-check实际退出0；document-transactions/tilemap-project/tilemap-document全部通过1.13s，含已有链接、移动复制、翻转及保存重开回归。744来源/证据及diff检查通过。此处只取消候选全网格扫描，其它资源验证与提交代价保留，未做FPS/耗时量测。整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：Paint引用移动局部失效性能迁移

接续候选范围迁移，对照legacy tilemap-document.ts rerenderTilemapCells。原生reference-only增量历史在活动层/帧不变时合并实际cache patch完整格世界边界并裁到画布；共享资源编辑、活动视图变化维持全幅，publishChange的linked-layer fallback保留。Paint连续move与取消不再覆盖applyEdit脏区为整画布，先清除上次change再发布。六组零/正/负offset×move/copy逐像素检查初次及连续预览、取消、UndoRedo所有变化均被dirty覆盖，局部移动dirty小于画布。

正式Release构建成功，完整--tileset-management-check实际退出0。document-transactions/tilemap-project/free-tile-project/tilemap-document四项通过39.90s，混合free、链接、资源及保存重开回归通过；744来源/证据与diff检查通过。无FPS量测，资源编辑与linked-layer仍可全幅失效，整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：特殊图层ASE栅格导出闭环迁移

对照legacy core/aseprite.ts encodeAseprite/scaledLayerPixels，旧版按动画帧图层的栅格缓存写普通ASE图层，不写MoonSprite瓦片资源/实例编辑语义。原生解除已迁移tilemap/free-tile两类的过时拒绝，保留未知kind拒绝、图层/帧/标签/链接写法、蒙版合成回退与editable损失保存确认；导出提示明确网格/自由瓦片以栅格保存。核心八组grid/free×有无mask×100/200%对照逐帧画面、图层数量、向后链接及导出不改authority。实际窗口增加两类的导出弹窗、worker、原子写入和重开对照。

正式Release构建成功，完整--aseprite-io-check实际退出0，包含已有ASE/PSD保存生命周期及新增特殊层；aseprite-io/aseprite-save-policy通过0.09s。系统文件选择器使用注入路径，未自动点击系统弹窗；不宣称ASE可编辑瓦片payload或实例编辑信息保留。整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：网格与自由瓦片PSD导出闭环迁移

对照legacy core/psd.ts psdChildren/psdRasterLayer/encodePsd，特殊层按当前帧栅格写出，保留分层和蒙版。原生解除tilemap/free-tile过时kind拒绝，沿用resolved surface、缩放、裁切和现有蒙版/组/效果编码，保留未知kind拒绝及editable/resources损失确认；提示明确瓦片栅格化。新增八组grid/free×mask/no-mask×100/200%往返，检查逐像素画面、层/蒙版数、当前帧与原文档authority不变；窗口增加两类PSD实际弹窗/worker/原子写入/重开，沿用注入文件路径。

正式Release构建成功，psd-export CTest通过0.15s，完整--aseprite-io-check实际退出0。旧版实际ag-psd独立读取全部原有文件及八个特殊层文件通过，验证层/蒙版/缩放尺寸和合成像素。最初独立脚本错误假定convertLayerToTilemap会重命名图层，已按实际保留原名称修正验证。未宣称PSD保留动画或瓦片可编辑资源；整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：ASE剪贴与图层样式合成语义迁移

对照legacy core/aseprite.ts encodeAseprite needsComposite及aseprite.test.ts clipping回归，原生旧门控漏掉layer/group clippingMask及启用layerStyles，可能成功导出却丢失画面效果。新增共用asepriteNeedsComposite，统一编码、导出说明、保存effects损失确认，保留蒙版/cumulative规则；禁用样式不触发。八组图层/组×剪贴/样式×启用/禁用验证全部帧合成画面、层数量、effects提示与authority不变。

正式Release构建成功；aseprite-io/aseprite-save-policy通过0.10s；完整既有--aseprite-io-check、--aseprite-save-check实际退出0。新增效果组合为核心覆盖，窗口沿用已有生命周期夹具，未声明新增效果真实控件组合或截图验收。744来源/证据与diff通过；整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：ASE稀疏时间轴读写迁移

核对legacy core/aseprite.ts decodeAseprite的缺失槽跳过与encodeAseprite的非合成缺失Cel跳过。原生此前按图层×帧补透明Cel，现读写两端均保留空槽，减少稀疏动画额外对象与区块；显式透明Cel仍保留，效果合成仍逐帧写出。五帧双层二进制检查覆盖首帧缺槽、整帧空白、前向链接栅格化、后向链接、opacity/z、显式透明Cel、重复保存重开及authority不变；另覆盖全空动画和稀疏效果合成逐像素对照。

正式Release构建与既有完整--aseprite-io-check实际退出0；新增稀疏场景为核心测试，未新增窗口夹具或FPS量测。整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：ASE长链解析与链接属性完整验证

接续稀疏时间轴读写，按legacy core/aseprite.ts resolveCel的缓存解析及逐帧位置/opacity/z覆盖规则，将原生递归root解析改为迭代路径缓存，消除合法长链接链的C++栈深依赖。保留已有循环/缺失目标拒绝与属性不同则复制栅格规则。只读核对Aseprite dio/aseprite_decoder.cpp readCelChunk：位置或透明度不同会MakeCopy、Z单独设置；未复制其源码，也不以其顺序读取限制取代legacy的前向链接支持。原生对畸形链接的严格拒绝仍是已有差异，未宣称完全等价。

前向/后向各12000帧分别验证单一canonical像素源、所有alias、深层循环和缺失目标拒绝；四帧不同offset/opacity/z逐项检查并导出重开逐像素对照。正式Release构建成功；aseprite-io/save-policy通过0.20s，完整--aseprite-io-check实际退出0。744来源覆盖与证据检查通过；新增长链为核心覆盖，无FPS/截图验收。本阶段保存推送dev，整体INCOMPLETE。


### 2026-11-10：ASE空槽编辑到原生保存闭环

在稀疏ASE实际首次编辑/保存回归中发现：首帧无Cel的图层未初始化display geometry，直接或后台转存原生工程会报Missing layer display geometry。按legacy aseprite.ts createLayer(name,1,1)初始化全部层fallback再投影活动Cel；DocumentSnapshot携带全部层显示geometry，在finish恢复，并使同generation下的geometry变动失效快照。沿用animation.ts syncActiveAnimationLayer只创建编辑活动槽的语义；取消不创建，首次提交只增一个Cel，撤销清像素但保留已创建空Cel与dirty（既有行为，未改保存点规则）。

核心覆盖部分/全空时间轴、未编辑worker快照与原生序列化、非默认偏移/尺寸、快照geometry失效、首次绘制取消/提交/UndoRedo和原生保存重开逐帧画面。原生prepareEditableImport现有补齐空槽行为保留，不把原生重开声明为仍然稀疏。窗口新增全空ASE实际导出worker/write及原生Save As/openPath；系统文件选择器注入路径，无截图验收。整体INCOMPLETE，完成验证后保存推送dev。


本阶段实际窗口回归首次暴露时间轴连接线绘制对缺失left/next Cel的空指针访问；按legacy deriveTimelineLinks实际成员分组，空槽跳过，缩略图绑定也改为可选活动Cel解析。修复后正式Release构建成功，完整--aseprite-io-check实际退出0，含新增全空导出与原生另存重开。aseprite-io/document-snapshot通过0.26s；744来源与证据检查通过，diff检查通过。未把首次失败计为通过；未新增截图或FPS量测。最终保存推送dev。


### 2026-11-10：稀疏ASE工作区消费者闭环

接续上一阶段首帧空槽支持，核对legacy useLayerPanelShortcuts.tsx先选中槽后活动槽的属性目标规则及background-preset-images.ts无可见像素返回null。原生单元格属性快捷键不再预先解引用缺失活动Cel，空槽无目标时无动作；时间轴菜单删除内容判断使用可选槽。选区背景预设单层保留透明RGB快速路径允许无Cel并返回空结果，保持原文档不变。

核心回归覆盖空活动槽的完整/越界选区、无新增Cel/dirty/revision、切换有内容帧后实际PNG像素。新增实际窗口场景包含首帧空槽、后两帧有内容且链接，检查缩略图绘制、属性快捷键、Cel菜单、导出弹窗worker/写入/重开及全部帧画面。正式Release构建与完整--aseprite-io-check实际退出0；background-preset/aseprite-io通过0.31s，744来源/证据和diff检查通过。最初背景测试错误选择已删除的首帧作有内容断言，修正夹具为明确复制帧并切换存活帧后通过；不改产品语义。系统选择器注入路径，无截图/FPS量测。整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：ASE索引色调色板逐帧迁移

对照legacy aseprite.ts decodePixelData/readPalette：透明索引保留调色板RGB只清alpha，后帧较小count的局部palette更新不截断既有高索引。原生此前透明索引直接置0，palette.resize(n)截断旧颜色；现修复这两项。RGBA导入路线不变，不声明新增原生索引色编辑模式。新旧palette各四帧夹具覆盖非零透明索引、局部更新/高索引继承、raw与zlib cel、链接保留源帧颜色、ASE转RGBA重开和原生保存像素，含透明RGB。

正式Release构建成功，既有完整--aseprite-io-check实际退出0；新增颜色场景为核心夹具，未新增窗口截图。来源744覆盖/证据与diff检查通过，整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：ASE内嵌瓦片栅格导入与共享源性能闭环

按legacy aseprite.ts resolveCel type3及aseprite.test.ts已有内嵌瓦片夹具，补齐原生八种H/V/diagonal组合、旧0xffffffff与新id0空格、无内嵌资源/越界索引拒绝、编辑与UndoRedo、ASE及原生保存。原生此前每个Cel重复转换整张tileset，并累加已释放临时转换成本；改为每tileset一个RGBA缓存，RGBA/gray直接复用，indexed仅palette实际变化时刷新，替换峰值计入预算，输出栅格与翻转顺序不变。未复制Aseprite代码，不声明editable ASE tile资源迁移。

1000帧共用20000个2x2瓦片验证不再累计重复临时预算，逐Cel像素一致；四帧索引palette变动验证cache刷新。正式Release与既有完整--aseprite-io-check实际退出0；新增瓦片组合为核心覆盖，未新增窗口夹具/截图或FPS量测。744来源/证据及diff检查通过，整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：ASE导入像素所有权与临时内存优化

按legacy sourceSurfaces/createCelSurface的canonical共享与属性不同独立复制语义，保留原生逻辑关系，调整临时所有权。palette提取前把root像素swap入sample数组，沿原root顺序和量化器提取后归还，消除整幅sample复制；统计每个root实际独立Cel使用次数，前面的独立用户仍复制，最后用户接管root缓冲。rasterization后立即释放raw/tileset解压输入及decoded sheet缓存，并回收对应预算，避免把不再存活临时数据计为永久资源。未改变调色板排序/采样规则、链接判定或RGBA编辑模式。

新增前后向属性不同导入的编辑/UndoRedo独立性，以及canonical链接编辑传播/UndoRedo；既有长链、稀疏、索引palette、tile、原生/ASE往返继续通过。正式Release成功，aseprite-io/save-policy通过0.35s；完整--aseprite-io-check实际退出0。744来源/证据与diff检查通过；未量测峰值内存或FPS，不宣称所有导入临时分配消除。整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：ASE逐帧调色板快照与预算优化

对照legacy aseprite.ts readPalette/readOldPalette与framePalettes逐帧语义，将未变化的调色板快照改为不可变共享，保留独立工作缓冲；重复相同区块不再复制，帧内多次修改后恢复原值也复用上一快照。工作缓冲只对增长部分计费，各实际保留快照计费一次；栅格转换结束即释放调色板与对应预算。索引瓦片缓存先比较快照身份，再按需比较颜色。只读核对Aseprite decoder的countDiff/setPalette差异保留方式，未复制代码，未改变旧palette格式转换或native RGBA编辑模式。

两组1000帧/百万条目稀疏调色板夹具分别覆盖省略后续palette区块、每帧重复相同区块，中途改色后逐帧结果正确；原实现两组均会因重复快照或重复工作预算超256MiB而拒绝。正式Release构建成功；aseprite-io/save-policy通过0.46s；完整--aseprite-io-check实际退出0。新增压力场景为核心测试，未新增窗口截图或实测峰值内存/FPS；整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：ASE保存直接压缩与生命周期复核

当前源码证实ASE原格式CtrlS/Save As、兼容损失取消/继续/保留原生、后台快照/队列/savepoint及失败重试早已实现；修正来源清单中过期的当前scope，保留历史日期记录。按legacy aseprite.ts scaledLayerPixels的scale1直接像素视图路径，原生100%输出在little-endian平台直接压缩const像素字节，消除整Cel逐像素重采样副本；其他端序及缩放继续原采样器，压缩级别/几何/链接语义不变。C++17使用运行时字节序探测，未提高项目语言标准。

新增三组正负偏移、33/100/200比例，逐像素核对半透明/透明隐藏RGB和缩放边界，并验证源像素identity/revision、内容与历史不变。正式Release成功，aseprite-io/save-policy通过0.37s，完整--aseprite-io-check及--aseprite-save-check实际退出0（含来源保存/另存/队列/损失确认/取消/原生保留/失败重试）。未新增截图或量测峰值内存/FPS，整体INCOMPLETE；本阶段保存推送dev。


### 2026-11-10：早期ASE无瓦片集索引图层的完整打开链路

legacy aseprite.ts只在name后仍有四字节时读取tilesetIndex，并在构造document层时跳过无该字段的tilemap层；已有aseprite.test.ts明确要求混合文件仍导入Paint。原生此前强制读取索引而拒绝整个文件，现改为独立记录字段存在性，只跳过无字段层及其Cel，回收对应raw预算并重建slot下标，保留文件原layer索引。显式索引值（含越界值）不与缺失混同；内嵌瓦片及外部资源验证保持原路径。

四组二进制夹具覆盖有/无Paint、有/无被忽略Cel；仅剩忽略层时拒绝，无损保留Paint时验证像素、绘制、UndoRedo、ASE重开及原生保存重开。正式Release构建成功，aseprite-io/save-policy通过0.43s，完整--aseprite-io-check实际退出0。新增兼容场景为核心测试，无新增窗口夹具/截图或性能量测；整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：ASE嵌套组与标签组合生命周期验收

对照legacy aseprite.test.ts nested group ownership、named loop ranges/direction/repeat、editable Cel opacity、linked Cel及duration，以及aseprite.ts文件头validity/groupPropertiesValid与orderedAseItems实际规则，补齐四种header flag组合的二进制夹具：两级组/隐藏锁定空组/中文名称、组字段无效时忽略非法blend、层与Cel opacity组合、两帧链接/时长、四种tag方向与空/有限repeat。连续三次ASE保存重开逐项检查关系/名称/标志/链接和每帧画面，再验证导入后编辑/UndoRedo/ASE保存及原生重开元数据。

现有产品逻辑通过组合检查，本阶段只增加回归证据，不宣称新实现功能。aseprite-io/save-policy通过0.36s；无产品源码变动，未重复正式程序构建和既有窗口测试；新增场景尚无窗口夹具或截图验收。来源覆盖/证据与diff检查通过，整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：重复画布选区画笔预览迁移

对照legacy useCanvasBrushOverlay.ts与canvas-brush-coverage-overlay.ts以及canvas-repeated-selection-preview.test.ts：选区画笔canonical覆盖在Off/X/Y/Both的全部可见副本渲染，outsidePreview只在Off显示。原生此前提交已正确折回，但蓝色预览只画中央画布；现抽出生产覆盖绘制函数并按副本偏移绘制，沿用物理像素round和原蓝色alpha。已有采集/对称/合并/提交/取消/UndoRedo事务不变。

正式窗口诊断新增直接调用生产renderer的透明离屏surface逐像素alpha检查，覆盖四种模式和Off独有的画布外预览；既有真实指针跨缝套索/选区画笔提交、取消和UndoRedo继续执行。tile-repeat核心通过0.05s；正式Release构建成功。完整--tile-repeat-check实际退出0，包含新增离屏alpha和既有真实指针/文字旋转命中矩阵；后者运行较慢，未量测或声明交互FPS提升。来源744覆盖/证据与diff检查通过，整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：重复画布套索实际路径预览

按legacy canvas-render-selection-preview.ts repeatedCoordinates与canvas-repeated-selection-preview.test.ts明确的x19不折为x3断言：套索创建预览保留实际跨画布路径，只对取样背景折回以保持黑白对比色；提交仍沿repeatedLassoSelection折回canonical选区。原生此前把预览像素位置也折回，导致指针所处副本看不到路径。

正式窗口夹具调用生产paintSelectionFeedback在Off以外X/Y/Both离屏绘制，检查实际跨界位置有alpha、中央折回位置无误画，然后取消；既有真实指针提交/取消/UndoRedo保留。首次失败因夹具未固定canvasScale，设置2物理像素后越过新增断言；正式Release成功，tile-repeat核心0.05s、来源覆盖与diff通过。完整--tile-repeat-check最终实际退出0，包含新增raw位置alpha与既有提交/取消/UndoRedo及耗时文字命中矩阵。无新增截图或FPS量测，整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：套索与多边形套索对称预览迁移

legacy canvas-render-selection-preview.ts对两种套索的每个栅格路径点调用symmetryPoints(...,false)，再进入普通/重复坐标显示。原生此前只在提交symmetrySelection时对称，路径预览没有镜像；现复用既有symmetryPoints在预览显示前扩展路径，保留上一阶段raw重复坐标与canonical背景取色。balanced线、闭合路径设置和最终选区事务不变。

实际选区创建诊断新增调用生产paintSelectionFeedback的离屏alpha检查，覆盖套索/多边形套索原位置及水平/垂直镜像；沿用五种选区工具的真实指针创建、提交一条视图历史、UndoRedo、Escape及无作品像素修改检查。正式Release成功；tile-repeat/selection-interactions两项通过2.75s；--workspace-check --named-workspace-only --selection-symmetry-hybrid-edit-only实际退出0（含既有Hybrid相关回归）。744来源/证据与diff通过，无新增截图/FPS量测；对角/旋转轴没有新增专门UI像素矩阵，整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：普通矩形/椭圆选区对称边界预览

按legacy canvas-render-selection-preview.ts普通marquee previewTarget分支，在repeat Off、非quick、非tilemap Paint下对边界应用symmetryPoints。原生此前矩形/椭圆提交有对称而边界预览没有；现将既有mask边界映射到对称位置。tilemap Create/Edit仍可使用此普通规则，Paint/quick/repeat各自显示路径保持现状。核对useCanvasBrushOverlay证实选区画笔覆盖预览没有对称扩展；魔棒有独立预览语义，未为统一显示擅改两者。此改动仍使用已有裁剪mask，旧版完整unboundedShapePreview离画布轮廓路径尚未承接，不宣称本组迁移全部完成。

生产paintSelectionFeedback离屏alpha检查扩展到矩形/椭圆，对原边界及水平/垂直镜像采样；同一实际窗口场景继续五工具提交/UndoRedo/Escape及无作品像素改动断言。正式Release成功，tile-repeat/selection-interactions通过2.78s；--workspace-check --named-workspace-only --selection-symmetry-hybrid-edit-only实际退出0。744来源/证据与diff检查通过，无新增截图/FPS量测；整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：普通选框画布外完整轮廓链路

接续对称边界，按legacy shape-preview.ts在旋转extent外扩2px并平移到局部域生成完整轮廓，原生复用既有rotatedMarqueeSelection后提取边界再投回世界坐标；只在普通非重复、非quick、非Paint选框采用。绘制可以超出画布但仍受viewport限制，画布裁剪不再制造矩形封口边；提交仍使用原selectionPreview裁剪mask，不把外部轮廓写入选区/作品。沿用64Mi像素临时域上限；当前仍分配局部完整mask，未承接旧版row-span边界计算的全部性能路径，不宣称大画布性能完成或全tools-shapes逐像素等价。

窗口新增矩形/椭圆、0/35/90度离屏检查，验证负坐标轮廓alpha，矩形x=-4实际左边和x=0无虚假封口，再执行裁剪提交/UndoRedo/clean保存点检查；既有五工具对称创建/取消/历史回归继续通过。正式Release构建成功（首次变量名编译错误修正后重建），tile-repeat/selection-interactions通过3.38s；--workspace-check --named-workspace-only --selection-symmetry-hybrid-edit-only实际退出0。744来源/证据与diff通过，无新增截图/FPS量测；整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：普通选框逐行轮廓预览优化

接续画布外完整轮廓，按legacy tools-shapes.ts的findShapeBoundarySpan/collectShapeBoundaryPoints及shape-preview.ts，普通矩形/椭圆预览改为逐行定位凸形区间，二分左右端点并输出相邻行差集；保留旋转矩形孤立尖端修正、圆角、画布外坐标、对称与原有裁剪提交。每次绘制不再分配整个选框面积的局部蒙版，只保存行区间与轮廓点；种子未命中时仍可能逐点搜索该行，不宣称所有输入时间复杂度均为周长。

20组矩形/椭圆、圆角0/3、角度0/35/90/135/270与原完整栅格蒙版边界逐点一致，并验证负坐标平移；32768×32768选框输出131068个周长点。正式Release构建成功；实际--workspace-check --named-workspace-only --selection-symmetry-hybrid-edit-only退出0，包含生产绘制离屏alpha、真实指针创建/取消/提交/UndoRedo及既有Hybrid回归；tile-repeat/selection-interactions两项通过2.78s。未执行独立JS几何oracle、未新增截图或量测整体FPS/峰值内存；整体迁移仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：Hybrid整格提交局部范围迁移

对照legacy tilemap.ts::tilemapCellIndexesForSelection和tilemap-document.ts::captureTilemapSelectionMove/previewTilemapSelectionMove，原生Hybrid对齐整格提交从两次全网格扫描改为裁剪选区行列范围；先清源再赋目标，仍复制null、外部瓦片集及翻转旋转引用，重叠按不可变原网格读取。临时更新预算按选中格最多两份更新估算，不再按整个网格估算；现有浮动捕获、资源、链接、历史和固定网格裁剪不变。

260×260显式链接夹具新增14组move/copy，覆盖四方向、重叠、右下部分越界、完全越界、原位no-op；逐项验证取消、authority冻结、精确格引用、资源不变、preview=commit及UndoRedo，并沿用共享源和链接缓存核对。tilemap-document通过0.37s；正式Release构建成功，完整--tileset-management-check实际退出0，包含既有大画布真实指针移动/复制/取消/Enter。744来源/证据与diff检查通过。新增14组为核心事务检查，没有新增实际指针夹具、截图或FPS量测；其他Hybrid预览资源patch缓存仍未完成，整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：Hybrid延迟预览资源修改缓存阶段

接续用户批准的preview=commit，保留从legacy tilemap-document.ts局部格修改及共享源引用逻辑适配的有序资源patch；同一浮动状态的多次regional绘制复用不可变源瓦片/局部格修改，不再每次重建候选格采样和资源差异。缓存归属浮动事务，按overlay revision、content revision及repeat模式验证，变换通知释放，取消/提交随事务释放；计入现有floating内存预算，不缓存整幅像素或复制timeline。整格移动仍走直接引用路径。

已有260×260链接Hybrid核心矩阵增加构建计数断言：首个region一次构建，跨格/负坐标/越界regional读取复用，变换后重建，恢复变换逐像素一致，X/Y/Both切换Off及恢复均重建并保持预览一致；保留提交/UndoRedo、资源/链接及dirty逐点检查。tilemap-document通过0.33s；公共头文件触发大范围重编译后正式Release构建成功，完整--tileset-management-check实际退出0，含既有大画布真实鼠标移动/复制/Escape/Enter检查。744来源/证据及diff通过。无新增截图或实际FPS量测；引用脏区扫描等后续性能项及整体迁移仍INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：Hybrid预览预算提前检查与拒绝恢复

沿用legacy tilemap-document.ts::tilemapCellIndexesForEdit候选格范围和原生256MiB浮动预算适配，补齐上一阶段缓存的分配前检查：regional输出先检查再分配；候选索引插入和每个源瓦片/局部格缓存保留前检查输出、候选记账及已有缓存累计量，成功后才发布不可变缓存。缓存命中输出也检查总预算，超限请求不会写入作品或发布半成品缓存。

14组现有move/copy×变换/平铺夹具加入8192×8192输出请求（恰为64Mi像素面积上限），确认抛出length_error、浮动事务及缓存构建次数不变、作品像素冻结，随后正常区域继续复用缓存并逐像素等于原预览。tilemap-document通过0.36s；正式Release构建成功，完整--tileset-management-check实际退出0。744来源/证据和diff通过。候选/源缓存分配前检查为源码核对，未注入候选分配失败或量测峰值内存/FPS；整体迁移仍INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：Hybrid预算统计移出候选循环

复核上一阶段分配前检查发现，每个候选格/缓存条目调用checkFloatingBudget都会遍历工程Cel、蒙版及浮动载荷。提取原有不变的存储记账为floatingStorageBudget，在构建候选patch前取本次同步调用的存储快照；循环只执行溢出安全的整数预算累计。原checkFloatingBudget复用同一记账函数，保持其他浮动路径规则。legacy tilemap-document.ts候选格/资源修改语义不变；补计当前采样格的两份临时像素，保留分配前拒绝和成功后缓存发布。

正式Release构建成功，tilemap-document通过0.33s，含已有14组变换/平铺缓存复用、超限输出拒绝后恢复、preview=commit、资源/链接及UndoRedo检查；完整--tileset-management-check实际退出0。744来源/证据和diff通过。本阶段没有新增镜像实现的单元测试，循环内不再扫描工程由源码核对，未量测FPS/峰值内存或新增截图。整体迁移仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：平铺浮动预览局部反向采样

按legacy tools-selection-transform-translation.ts的不可变目标基线合成、先清源、mask/alpha及wrap规则，原生regional预览在源宽高不超过画布时遍历请求区域并反推源坐标，避免每个候选瓦片都重新扫描整个浮动源。每个wrapped目标至多有一个源贡献；超过画布尺寸的剪贴板继续旧的源顺序遍历，保留重复目标最后写入顺序。提交路径仍沿用原源遍历，作为独立结果对照。

260×260显式链接Hybrid夹具增加12组X/Y/Both×move/copy×正负跨缝位置，12×4多格掩码含半透明源，检查负坐标/越界/跨格区域与全幅一致、preview=commit、链接/资源缓存及UndoRedo。既有14组变换/平铺缓存和超限恢复继续通过；tilemap-document通过0.35s。正式Release构建成功，完整--tileset-management-check实际退出0。744来源/证据与diff通过；未新增截图、FPS量测或超大剪贴板碰撞专门夹具，整体迁移仍INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：平铺剪贴板尺寸边界与碰撞回归

对照legacy tools-selection-transform-translation.ts的forEachOpaqueSource/targetCanvasIndex源顺序及不可变基线合成，补齐上阶段区域反采样的尺寸边界：36组X/Y/Both×等画布/宽超1/高超1/双轴超1×正位置/负位置/负多周期位置；mask和半透明像素使超尺寸输入发生目标碰撞，对照关闭deferred的原源遍历路径。逐像素检查完整/负坐标/越界/局部区域、作品和历史冻结、取消后再次粘贴、提交及UndoRedo，保留非重复轴完全裁剪无变化场景。

首次测试误要求所有场景commit返回true；具体诊断确认X平铺负多周期Y完全画布外，两个路径均无像素变化且预览一致。修正为返回值等于实际像素变化，并增加部分可见负坐标组合，没有改产品行为。最终document-raster-history通过1.42s；744来源/证据与diff通过。本阶段仅新增核心回归，未重复产品构建或已有窗口诊断，没有新增截图/FPS量测；整体迁移仍INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：超尺寸平铺剪贴板区域采样

沿用legacy tools-selection-transform-translation.ts平铺源按row-major写入、始终与不可变目标基线合成的规则，regional预览对每个请求目标逆推所有周期源位置，逆序寻找最后一个mask==1且非透明的贡献。由此超画布剪贴板也只检查区域对应源，保留透明/未选中后续源不覆盖此前有效源的语义；未平铺轴保持裁剪，非regional提交仍走原源遍历，形成独立对照。

原36组边界矩阵扩为45组，新增523×522源对260×260画布的多周期碰撞，加入透明隐藏RGB和mask2，覆盖局部/越界/负位置、取消重开事务、完整预览与源遍历提交一致及UndoRedo。正式Release构建成功；document-raster-history/tilemap-document通过2.19s，完整--tileset-management-check实际退出0。744来源/证据和diff通过。新超尺寸场景为核心回归，没有新增窗口夹具/截图/FPS量测；整体迁移仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：平铺采样按工作量选择遍历方向

接续regional反采样，检查发现小浮动源在大region仍会遍历整个目标。参考legacy tools-selection-transform-translation.ts对repeatCandidateCount与visiblePixels的区分，原生比较源面积和请求区域面积×最大周期贡献数，选择最坏遍历量较小的路径；源遍历在读基线/合成前按region裁剪，完全画布外region直接结束。无额外缓存或分配，mask、透明、不可变基线及碰撞顺序不变。

现有45组剪贴板矩阵覆盖大region源遍历、小region反采样及多周期碰撞；Hybrid核心矩阵含小源全region、跨格region及取消/UndoRedo。正式Release构建成功，document-raster-history/tilemap-document通过2.24s，完整--tileset-management-check实际退出0。744来源/证据和diff通过；未增加镜像实现测试、截图或FPS量测，工作量上界由源码核对，整体迁移仍INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：Hybrid整格预览局部脏区

对照legacy tilemap-document.ts::previewTilemapSelectionMove只rerenderTilemapCells而像素资源修改才rerenderTilesetTileReferences，Hybrid连续整格引用移动不再扫描/扩展所有共享源位置。仅当旧、新变换均为矩形原选区的精确整格移动且无变换后源时启用；整格与采样互转继续包含共享源引用，确保恢复此前远处像素patch。

260×260链接夹具新增(200,200)同源远处引用，move/copy均检查：整格dirty局部、切到采样覆盖远处、切回整格预览精确恢复且逐点dirty覆盖所有变化、再次整格移动回到局部dirty及取消authority不变。既有资源/链接/preview=commit与UndoRedo矩阵继续通过。正式Release成功；tilemap-document通过0.35s，完整--tileset-management-check实际退出0。744来源/证据和diff通过。新远处引用转换为核心验收，未新增窗口夹具/截图或FPS量测；整体迁移仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：Hybrid局部刷新实际渲染器验收

补齐上一阶段局部脏区在CanvasRenderer缓存中的证据：260×260 Hybrid、半透明源及(200,200)翻转同源引用，移动/复制两组调用正式Skia离屏绘制，将持续缓存与每次新建renderer完整结果逐像素比较。覆盖整格→采样→整格、连续整格、跳过中间revision的fallback、Escape对应cancel、commit、UndoRedo，检查整格移动上传像素少于全画布。legacy tilemap-document.ts的引用局部重绘与资源引用刷新仍为语义依据，未改变产品逻辑。

重建canvas-performance-tests成功，实际--tilemap-preview退出0，既有tilemap shape/gradient当前及其他帧oracle与新增Hybrid浮动oracle全部执行通过。744来源/证据和diff通过；本阶段仅渲染核心验收，未重复产品构建/窗口诊断，没有人工截图或输入/显示FPS量测。整体迁移仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：Hybrid仿射和平铺缓存绘制矩阵接入CTest

扩展上一阶段生产CanvasRenderer/Skia缓存与全新renderer逐点对照，新增14组move/copy×采样平移/翻转缩放/RotSprite旋转倾斜/四角/X/Y/Both，检查连续变换、恢复原变换、预览提交、UndoRedo及远处共享源位置。参考legacy工具变换和tilemap资源语义，用户批准preview=commit为差异依据，没有改产品。将既有--tilemap-preview注册为canvas-tilemap-preview，常规CTest可执行shape/gradient及Hybrid整格/仿射/平铺全部oracle。

首轮失败于夹具强制每次commit返回true；改为按raw preview与canonical像素差异判断返回值后，全部像素及历史断言通过，未修改产品以迎合测试。重建测试目标成功，canvas-tilemap-preview通过0.51s；744来源/证据和diff通过。仅新增渲染核心验收与CTest注册，未重复产品构建或窗口检查，没有新增截图/FPS量测；整体迁移仍INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：大画布Hybrid提交历史与归档重开

补齐deferred大画布变换持久化：260×260、远处旋转同源格、两级显式Cel链，14组move/copy×整格/翻转缩放/RotSprite旋转倾斜/四角/X/Y/Both。在commit、Undo、Redo三个状态分别通过生产encodeEditableProject/encodeRecoveryProject与manifest/import重开（共84次归档检查），核对画面、active frame/layer、格引用、瓦片集ID/tile ID/资源像素及完整链接拓扑。沿用legacy tilemap资源事务与原工程schema；用户批准preview=commit为行为依据，未改产品逻辑。

首次夹具强制commit有像素修改而失败，改为按实际preview与原像素差异核对结果，后续全部归档与历史断言通过。重建测试目标成功，完整free-tile-project通过31.23s；744来源/证据和diff通过。新证据为内存生产归档往返，不等于磁盘失败恢复、窗口或截图验收；未重复产品构建/既有窗口诊断，无FPS量测。整体迁移仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：Hybrid分离源目标足迹的资源脏区

按legacy tilemap-document.ts::tilemapCellIndexesForEdit实际范围映射及rerenderTilesetTileReferences共享资源规则，dirty先保留源、旧目标、新目标和wrapped范围各自足迹，分别检查所触及的格/资源，再形成既有单一dirty矩形。消除长距离拖动时扫描源目标之间无关格并扩展其远处引用的额外刷新；只收集Hybrid初始足迹，格扩展及资源引用扩展不再重复入列表。

新增无关资源在(40,40)且其引用在(240,240)，move/copy目标(81,81)，断言dirty不被无关远处引用扩到244，同时逐点覆盖实际像素变化；沿用(200,200)真正共享源和全部变换/缓存/历史检查。正式Release成功；tilemap-document/canvas-tilemap-preview通过0.85s，完整--tileset-management-check实际退出0。744来源/证据与diff通过。无新增截图或FPS量测；整体迁移仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：Hybrid预览输出直接读取资源patch

沿用legacy tilemap-document.ts资源patch及tilemap.ts源坐标语义，原生输出优先直接读不可变local patch、无翻转旋转的modified源；只有变换引用才分配单格scratch并调用既有sourcePoint映射，其他格保留cellPixels。消除先渲染原瓦片再全量覆盖/复制patch的无效操作，不改变资源或事务。

正式Release构建成功，tilemap-document/canvas-tilemap-preview通过0.88s，含区域裁剪、空/外部/翻转旋转引用、共享源、变换/平铺及实际Skia缓存与全新绘制逐点对照；完整--tileset-management-check实际退出0。744来源/证据及diff通过。未新增镜像实现测试、截图或实际分配/FPS量测；整体迁移仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：Hybrid空白格输出跳过

对照legacy core/tilemap.ts的cellPixels空引用返回透明与renderCell清空后跳过规则，原生deferred regional输出利用已初始化透明的结果缓冲，在完成整格移动引用重映射及local patch查询后，跳过没有引用且没有patch的格。减少每个空白格的透明缓冲分配、清零和行复制；原空格上的局部绘画、选中空格覆盖目标与移动源清空仍保留。

正式Release构建成功；tilemap-document/canvas-tilemap-preview通过0.80s，覆盖区域裁剪、空格与局部patch、整格移动/复制、变换/平铺和实际Skia缓存对照；完整--tileset-management-check实际退出0。未新增镜像实现测试、截图或分配/FPS量测；整体迁移仍INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：完整回归验收与特殊图层批量变换契约复核

在e2ffcf0c正式构建及现有测试产物上执行完整 `ctest --test-dir native/build -C Release --output-on-failure -j 2`，211/211通过，总用时237.50s。包括project-manifest（136.50s）、free-tile-project（32.50s）、workspace-layout（38.03s）、工程保存/恢复、动画、导入导出、实际窗口交互与各性能专项。关闭此前“未在连续迁移后重新执行全套”的验收缺口；这些时间为本机单次回归耗时，不是产品交互延迟或FPS，既有测试通过也不证明未接入功能完成。本阶段无生产代码修改、无新构建或人工截图。

纠正此前把“瓦片多目标”笼统登记为迁移缺口的说法：legacy workspace-session.ts::selectedTransformLayersAreEditable要求多个目标图层全部为普通栅格；core/selection-transform-targets.ts::captureAnimationFrameSelectionTransformStates在捕获和应用时均跳过带kind的特殊图层；workspace-commands-selection-move.ts动画分支明确拒绝特殊层，useCanvasSelectionTransform.ts批量指针分支复用相同捕获。现有native/tests/tilemap_document_test.cpp::checkTilemapTransformEntry覆盖混合显式多层拒绝和隐式帧选择只取普通栅格，本轮随完整tilemap-document实际通过。因此不能未经新需求决定开放特殊图层批量变换，也不能以移除单目标门控充当迁移。此结论仅覆盖上述批量分支，不推断所有单目标/菜单组合完全等价。

需求静态门禁通过：57条需求、756入口候选、671原始证据、31来源；来源覆盖744文件和快照通过，--strict仍按已知partial记录退出1。扩展现状核对：native/src/extension_contract_session.h是独立契约模型，不能把三项extension测试通过解释为实际脚本宿主、原生扩展窗口或宠物迁移完成。全量迁移继续INCOMPLETE，后续应按具体入口和真实接线关闭缺口。保留全部用户数据、构建缓存、未跟踪文件及editor_support.h既有状态；本验收阶段保存推送dev。


### 2026-11-10：扩展文件拖放完整路由核心

以legacy core/extension-file-drop.ts及其测试为依据，迁移完整注册与逐文件路由：最多16个点号开头的1–16位ASCII字母数字后缀、先完整验证再替换、大小写归一、首个注册扩展优先、替换保留顺序/删除重建移到末尾、空列表不匹配。待投递token持有注册对象身份，读取期间替换/移除/重建后不向任何备用扩展投递；只交付basename与bytes，12 MiB包含上限，匹配后读取/超限/投递失败报告并消费，不落回工程打开。未匹配路径保留输入顺序。原生将异步await拆成事件线程begin/complete，提供注入读取/投递/报告的顺序adapter，不从worker访问live注册表。

新增边界回归，并执行未经改写逻辑的旧版TypeScript（dispatcher受控stub）对照原生--oracle七组合：成功、等价替换、移除、删除重建、读取失败、超限、runtime不可用；输出中的remaining、owner/name/bytes、错误次数完全一致。扩展三项CTest通过，Release专项构建成功。首次编译因注册查询仅有const iterator失败，增加非const重载后构建通过。新增代码沿用MoonSprite Source-Available License 1.0内部修改依据。

范围是完整路由核心，尚未接入正式exe的OS拖入、真实扩展注册/权限和事件宿主；原有FileDropPolicy/HostLifecycle仍是契约模型，不将本阶段称为可安装或可运行扩展。无正式程序重建、人工窗口/截图/FPS结论。来源与diff检查后阶段保存推送dev；全量目标继续INCOMPLETE，保留全部用户数据、缓存及editor_support.h既有状态。


### 2026-11-10：运行时注册／命令与拖放宿主边界阶段

直接迁移legacy core/extension-runtime.ts的registerExtensionRuntime、dispatchExtensionRuntimeCommand/Event、broadcastExtensionRuntimeEvent、executeExtensionCommand和完整34项method权限表。注册替换保留插入顺序，旧cleanup不移除新实例，cleanup可重复且宿主销毁后安全；广播保留JS Map动态遍历，回调删除未到达接收者后跳过、追加接收者本轮可见，回调异常继续传播并恢复遍历计数。命令严格按disabled拒绝→lua→runtimeEvent→settings优先级，runtime缺失不会退到settings；未知方法拒绝，权限表存在不代表该方法已经接线。

将FileDropRouter实际组合到RuntimeRegistry::filesDropped，按原事件type/files/name/bytes构造有值载荷。回归验证正常投递及读取过程中运行时注销后错误消费、不投递且不回到工程路径；保留注册对象独立于文件后缀注册的旧版行为。native事件线程接口用typed envelope，尚未迁移全部事件payload的JSON类型、安装器/脚本引擎、窗口与OS拖放。原SessionRegistry/HostLifecycle模型未冒充正式宿主。

Release专项构建成功，四项extension CTest全通过0.09s。verify-extension-runtime.cjs执行原TypeScript，34项权限与native输出逐行一致，替换清理/动态广播/命令优先级旧版实测与原生断言一致；verify-extension-file-drop.cjs继续保留上一阶段独立对照。新增文件与CMake来源登记、diff检查后保存推送dev。未更新正式exe、未做窗口/人工截图/FPS或全套重跑；全量迁移INCOMPLETE，保留用户数据、缓存及editor_support.h既有状态。


### 2026-11-10：扩展存储与原生磁盘持久化阶段

迁移legacy core/extension-runtime.ts::extensionStorage的get/set/remove/list：原命名空间前缀、键非空/无U+0000–001F/UTF8最多160字节、编码JSON值最多256KiB、同前缀值合计最多1MiB（覆盖时排除旧值）、缺失/坏JSON读null及UTF16键排序。保留旧版前缀匹配规则，未自行更改扩展ID语义。setEncoded接收未来runtime桥接已执行JSON.stringify的文本，原字节用于额度，避免WinRT重排/数字格式导致额度偏差；当前无脚本value到JSON.stringify的实际桥接，不宣称任意JS值兼容已完成。

浏览器localStorage必要适配为独立原生JSON键值对文件，复用已有atomic_file.h/image_export.cpp的同目录临时文件、Flush及原子替换，成功后才发布内存；失败保留旧磁盘和内存。调用方提供隔离存储路径，同一事件线程单实例持有，尚未接入正式exe默认路径或多进程合并。读取坏外层存储明确报错、不自动清理；坏单值按legacy返回null，后续无关写入保留该值。

Release专项构建通过，五项extension CTest通过；真实磁盘重开、中文/emoji键、UTF16排序、4×256KiB满额/覆盖/删除、锁定文件写入及删除失败保留、坏值fallback均验证。verify-extension-storage.cjs执行原TypeScript并与native磁盘exe输出对照命名空间/额度/拒绝/排序一致。来源及diff检查后本阶段保存推送dev。未重建正式程序、未接入真实扩展安装/请求或UI，不宣称全量扩展迁移完成；用户文件、缓存与editor_support.h既有状态保留。


### 2026-11-10：扩展请求分发与存储／命令接线阶段

以legacy components/extensions/ExtensionRuntimeHost.tsx::onMessage/handleRequest为依据，连接前几阶段的Storage、RuntimeRegistry和FileDropRouter。沿用request/response type、string requestId最多80个UTF16单位、string method及权限先行；错误返回ok:false/error，成功返回ok:true/result。原生传输提供宿主身份，参数不能指定其它扩展存储；非本会话、畸形消息、禁用/停用不响应。存储get/set/remove/list实际落盘，locale返回指定当前语言，后缀注册沿用完整校验，commands.execute只查本扩展命令并调用既有优先级；停止runtime返回false。停用清除该宿主后缀注册。

set接收可信脚本桥已JSON.stringify的独立编码载荷；目前并无实际脚本引擎/传输因此不把此侧通道当成已支持直接JSON网络请求。runtime.getCapabilities以及菜单、窗口、资源、工作区、文档等尚未连接的方法明确返回失败，不能因34项权限表存在而虚报可用。未将HTML/WebView2带回原生。宿主完整activation/locale事件和正式exe入口仍待迁移。

Release专项构建成功，六项extension CTest通过（首次0.57s）；核对真实磁盘重开、两个宿主隔离与参数伪造、权限/参数失败、注册原子性、命令与运行时停止、非所属会话/畸形/ID边界/禁用/停用。首次编译修正WinRT字符串工厂显式hstring构造。新增两文件与CMake来源登记，diff检查后保存推送dev。无正式exe更新、实际传输/窗口/截图/FPS验收；全量目标继续INCOMPLETE，保留用户数据、缓存及editor_support.h既有状态。

本阶段最终复验曾出现一次extension-storage第四次原子替换ERROR_ACCESS_DENIED，失败目标保留，未改变原子写入错误规则、未增加重试。随后存储定向复验0.24s与旧版存储对照通过，再执行完整六项extension全部通过0.34s。未定位首次外部拒绝来源，不能声称已修复偶发Windows替换失败；生产仍明确报错并保留旧状态。


### 2026-11-10：扩展加载前事件与激活生命周期阶段

迁移legacy ExtensionRuntimeHost.tsx::send/sendAuthorized/onLoad及语言变化/失败清理。加载前仅排队command/settings-changed，最多256条；settings事件先去除旧设置再追加，保留旧版容量判断顺序。加载失败清队列并拒绝后续排队；加载成功按locale-changed（runtime权限）、activate、project（workspace.read权限）、原排队事件顺序投递。按旧版十余类事件权限过滤，locale偏好变化去重；停用仅发送一次deactivate并清空队列/阻止后续投递。增加locale/extensionId/apiVersion真实typed字段，注册表命令与生命周期已在核心回归组合运行。

Release相关三个目标重编成功，七项extension CTest全部通过0.37s；verify-extension-events.cjs直接抽取旧send/sendAuthorized执行，预加载合并、初始化顺序、权限及256队列上限与原生断言一致；34项权限与旧注册/命令对照继续通过。本阶段尚未接入实际脚本加载失败回调、正式编辑器locale订阅/clock定时器/窗口释放或OS传输；不将核心生命周期称为可运行扩展。runtime.getCapabilities继续明确未接线，待完整公开子集定义后实现，未擅自改变旧版全权限方法枚举行为。来源/diff通过后阶段保存推送dev；无正式exe更新、截图/FPS/全套验收。整体INCOMPLETE，保留所有用户数据、缓存和editor_support.h既有状态。


### 2026-11-10：扩展会话宿主完整内部流程整合阶段

将既有RuntimeRegistry、EventLifecycle、RequestHost、Storage与FileDropRouter组合为SessionHost，统一open/loadFailed/loaded/request/localeChanged/routeFiles/close及析构。依据旧ExtensionRuntimeHost effect生命周期，替换前先停旧会话，注册表注销、请求停用与后缀清理在新会话发布前完成；generation token隔离原生异步load/request/close回调，旧token不影响新实例。内部token是调用句柄，不是对外身份验证凭据，实际进程/脚本传输仍需验证来源。

集成回归真实执行：双扩展注册、加载前命令队列、locale/activate/project/command顺序、请求写磁盘与跨宿主隔离、文件事件name/bytes、替换后旧callback/close/读取失效、数据保持、locale同步、读取中关闭、加载失败与整体销毁注销。Release专项构建成功；八项extension CTest初次全部通过0.40s，最终含加载失败追加检查复验见实际结果。此前单组件通过不能替代本次组合证据，但本次仍是核心流程，尚无实际包安装、Lua/JS执行、OS拖入、正式界面或窗口。未更新正式exe、不新增FPS/截图结论，全部迁移继续INCOMPLETE。本阶段来源/diff检查通过后保存推送dev，用户数据、缓存及editor_support.h既有状态保留。

最终复验：extension-session-host通过0.26s，其余六项通过；extension-storage再次在第四次替换ERROR_ACCESS_DENIED失败（storage-38760-25015250.json），八项7通过1失败，总0.45s。未重试掩盖，保留失败目标与现有原子写入错误规则。该复现推翻仅偶发且后续已稳定的推断；原因仍未定位，扩展整组验收不能标绿，后续优先诊断读取/替换共享方式及外部持有者。本阶段集成会话最小相关验收通过，不表示存储问题解决。来源760文件与快照、diff通过。


### 2026-11-10：扩展存储快照读取与文件替换修复

检查前次失败文件仍为Archive普通文件、原值存在；无可用句柄诊断工具，未识别外部持有者。原ifstream读取改为CreateFileW显式READ/WRITE/DELETE共享，直接处理路径缺失，避免exists/open竞态。新增受控保持旧snapshot读取句柄同时发布新值的检查；仅改共享后原MoveFileExW在第17次写入仍ERROR_ACCESS_DENIED，明确证明旧替换方式无法通过该受控场景，而非靠再次运行掩盖。

扩展存储复用公共atomic writer写入并Flush唯一staging，再以ReplaceFileW替换已有文件；目标缺失时使用不覆盖MoveFileExW发布，避免缺失判断后覆盖其它写入。失败删除本次staging、内存不发布，不重试、不清理用户文件。共享读取保留旧文件快照，新路径为完整新值；不开放多写者合并，不修改公共导出writer或工程保存行为。此为浏览器localStorage到Windows文件所必需的原生适配，legacy命名空间/JSON额度/键排序不变。

Release三个相关目标构建成功，八项extension CTest全部通过1.18s，storage0.98s包含受控读句柄、32次连续写入重开及原no-delete-sharing锁定写/删拒绝与旧值保持。实际旧版存储对照继续通过。来源与diff通过后保存推送dev。之前两次第4次替换失败的外部持有者仍未知；本阶段只关闭受控snapshot替换缺陷，不能宣称所有ERROR_ACCESS_DENIED根因消除。无正式exe更新或GUI/FPS验收，整体迁移INCOMPLETE，用户数据/缓存/editor_support.h原状态保留。


### 2026-11-10：扩展资源目录与请求读取阶段

对照legacy platform_extensions.rs::valid_extension_id/validate_package_component/validate_package_relative_path、runtime.resources清单校验及read_enabled_runtime_resource，迁移声明目录：最多64资源、ID最多80字节/ASCII字符/大小写去重、路径最多240字节、相对斜线分段、拒绝dot/parent/空段/反斜线/控制字符/Windows保留名、manifest.json及runtime entry保护，读取按大小写精确ID。读取每64KiB检查累计，最多16MiB包含上限，避免旧fs::read先分配超限资源。资源root和映射由可信宿主注入，未接入安装目录/manifest/enabled状态扫描，不虚报完整安装读取链路。

RequestHost resources.read复用权限先行和错误响应，返回实际number[]字节；SessionHost按当前generation安装读取器。回归覆盖声明/缺失/路径/ID/数量/重复/中文文件/0与255字节/16MiB/超限、请求资源读取及无权限/会话关闭。旧版文件读取沿路径跟随链接，本阶段未新增symlink/reparse隔离，不把词法路径校验称作全部文件系统边界保护。

Release三个相关目标构建成功，九项extension CTest全部通过1.32s（资源0.12s、storage0.99s）；来源与diff检查后阶段保存推送dev。无正式exe更新、实际安装包/脚本引擎/窗口/截图/FPS验收；整体迁移继续INCOMPLETE，保留用户数据、缓存及editor_support.h既有状态。


### 2026-11-10：实际安装目录的运行时候选读取阶段

依据legacy platform_extensions.rs::manifest_from_directory/read_state/installed_extension_path及runtime校验分支，新增RuntimeDirectory::inspect。读取普通目录与普通manifest/state（拒绝symlink），清单256KiB上限、请求ID与manifest ID一致、schema2/api1.0.0、HTML/HTM相对入口路径、权限已知/唯一/runtime必需、资源目录复用既有完整校验；状态缺失或未登记默认enabled true，显式false保留，enabled字段所有条目必须布尔。完整JsonObject保留未知域与元数据，不将未解析域丢弃。状态读取沿legacy无额度上限，未擅自改其语义。

明确为候选检查，不能作为完整validated package直接启用：旧版名称/版本/翻译/commands/settings/menus/panels等全清单校验、entry实际读取/引擎、目录枚举、安装/更新、默认路径和正式会话接线仍未迁移。本阶段没有用部分校验打开正式程序入口；开头拟迁移命令与session加载的范围因此仍未完成，保留在后续工作，不宣称完整扩展加载链路完成。

Release专项两个目标构建成功，十项extension CTest全部通过1.35s。新增真实目录fixture验证有效清单/资源、未知字段、缺省/显式停用/错误状态、ID/版本/入口/权限失败与清单超限。来源764文件和diff通过后保存推送dev，无正式exe/实际脚本/窗口/截图/FPS验收。整体迁移INCOMPLETE，保留用户文件、缓存及editor_support.h原状态。


### 2026-11-10：扩展命令清单校验与会话分发阶段

依据 legacy platform_extensions.rs 的 ExtensionCommandManifest、validate_manifest 命令分支、validate_lua_entry_path 和 stored_extension，迁移命令缺省值、Option null、最多64条、ASCII ID/大小写去重、UTF8名称160字节/描述4096字节及控制字符限制。每条只能声明 Lua entry、runtimeEvent 或 opensSettings 一种处理；核对运行时/commands权限、事件ID、设置存在约束。保留名称、描述与Lua路径，并映射既有RuntimeCommand。原生使用宽字符检查Lua后缀，避免中文路径经系统代码页转换失败；空设置字段不再误报hasSettings。

真实目录候选新增命令检查；集成测试把解析后的命令交给SessionHost，验证请求分别分发运行时事件、Lua动作标识和设置动作。此为内部核心接线，没有真实Lua/JS引擎、安装启用流程或正式UI。设置按钮的命令引用约束仍随完整settings校验待迁移，候选仍不能作为完整validated package启用。

Release两个相关目标构建成功，10项extension CTest全部通过1.34s，包含中文.LUA、缺省/null/错误类型、文本/ID/路径边界、处理方式冲突、权限/设置缺失及64/65上限。未重建正式exe、未执行GUI/FPS或全套回归；整体迁移INCOMPLETE。来源登记和diff检查通过后保存并推送dev；用户数据、缓存与editor_support.h既有状态保留。


### 2026-11-10：扩展设置清单完整数据定义阶段

直接迁移 platform_extensions.rs 的 ExtensionSettingsUiManifest/ControlManifest/OptionManifest、validate_settings_entry_path、validate_settings_ui 及设置按钮命令引用校验。保留 checkbox/number/text/select/button 五类控件、所有可选字段和缺省值；校验控件/选项各64上限、大小写重复、UTF8文案、数值范围/步长、文本Unicode标量数量及maxLength、精确选项默认值、visibleWhen对其他checkbox的大小写精确引用、button样式/布局和本扩展runtime命令引用。所有字段先按旧serde类型读取，即使字段未用于当前控件类型也拒绝错误类型。settingsEntry只保留HTML路径元数据，拒绝与settingsUi共存；未引入WebView。

RuntimeDirectory候选现接入完整设置数据检查。抽取上一阶段命令ID/文本/可选字符串助手供设置复用。回归验证五类控件/缺省/emoji长度、23类错误、64/65控件与选项、路径及实际目录组合。Release相关目标和10项extension专项通过；来源与diff检查后保存推送dev。设置窗口渲染、设置值持久化/事件及实际引擎仍待接线，未更新正式exe或执行GUI/全套验收；整体INCOMPLETE，保留用户数据/缓存/editor_support.h既有状态。


### 2026-11-10：扩展元数据／翻译／栏目菜单清单阶段

核对 legacy platform_extensions.rs::ExtensionManifest 的 deny_unknown_fields、元数据/翻译/entry验证和 ExtensionPanelManifest、ExtensionMenuItemManifest、ExtensionTopMenuManifest 的serde默认值与完整校验分支。迁移名称/版本/描述/作者/API文案额度，64语言/512条翻译及文案约束，Lua主入口路径；栏目16、现有菜单贡献32、顶层菜单16与每项最多32命令，精确引用/大小写去重、内置菜单和start/end/before/after位置。栏目允许空命令，菜单必须非空；贡献各域ID独立、可选name/description null及defaultVisible false保留。

修正早期候选读取保留未知顶层字段的暂缺校验：旧serde明确deny_unknown_fields，现按其完整字段集合拒绝。原始JsonObject继续保留已声明数据；目录候选接入本阶段typed metadata。包内容存在性/安装/实际引擎和正式菜单栏目UI仍未接入，不把清单通过称为扩展可运行。

专项Release构建与10项extension CTest通过；新增20类拒绝场景、三类声明默认值与实际目录组合、16/17与32/33及64/65语言、512/513翻译边界检查。来源和diff检查后阶段保存推送dev。无正式exe更新、GUI/FPS/全套验收；整体INCOMPLETE，用户文件/缓存/editor_support.h原状态保留。


### 2026-11-10：扩展目录页面与资源读取接口阶段

以 platform_extensions.rs::read_extension_runtime_entry/read_extension_settings_entry/read_enabled_runtime_resource 为依据，补齐RuntimeDirectory三个读取接口。每次重读清单和enabled状态，资源要求resources权限，settingsEntry必须声明；运行时页面1MiB、设置页512KiB含边界，严格UTF8并保留原始字节（含空页面）。分块限额替代旧fs::read先分配全部文件；页面与资源按旧版跟随链接，未把词法路径校验宣称为真实路径隔离。HTML仅作为包数据，不创建WebView或脚本运行时。

专项测试覆盖中文/emoji、过长/代理区/超Unicode范围/孤立续字节/截断/非法续字节编码、空页面、两类页面精确与超限、缺失入口、未声明设置、停用后拒绝全部读取及资源权限/ID失败。Lua入口另有canonical路径和普通文件约束，尚未迁移，本阶段不宣称完成Lua读取；正式exe和实际引擎仍未接线。Release专项构建、10项extension CTest、来源/diff检查后保存推送dev；无GUI/FPS或全套回归，整体INCOMPLETE，保留用户文件/缓存/editor_support.h原状态。


### 2026-11-10：Lua扩展主入口与命令入口解析阶段

依据 platform_extensions.rs::resolve_enabled_lua_entry_for_manifest_at 完成resolveLua目录接口：重新校验清单及enabled、主entry/命令entry选择、精确命令ID、名称/描述与空描述省略、普通非symlink Lua文件、canonical路径按组件检查目录包含关系，返回原入口路径与basename。补齐schema1/2纯Lua清单检查，默认runtime候选检查仍要求runtime。解析不读取/执行脚本，不宣称Lua引擎或正式菜单已接入；list_enabled_lua_entries枚举/排序仍待迁移。

Release专项构建通过，目录测试验证schema1纯Lua、主入口/嵌套中文命令路径、元数据/空描述、ID大小写、无主入口、缺失文件、目录伪装Lua、非Lua命令、停用。符号链接文件与中间目录越界fixture在本机均因缺少Windows权限不能创建，明确跳过；canonical分支有源码实现但无本机链接行为验收证据，不把测试通过当作链接越界已实测。10项extension复验、来源/diff通过后保存推送dev；无正式exe/GUI/全套回归，整体INCOMPLETE，保留用户数据/缓存/editor_support.h既有状态。


### 2026-11-10：扩展目录枚举与Lua入口列表整合阶段

对照 platform_extensions.rs::list_installed_extensions/list_enabled_lua_entries，组合清单、状态和入口解析：枚举普通有效ID目录，跳过坏清单/ID不匹配/隐藏临时目录/普通文件，保留停用扩展的管理数据，Lua列表仅收集启用且能解析的主入口/命令，单入口失败不影响其他入口。状态读取抽取复用；状态及目录枚举失败明确传播。列表按名称小写后ID排序，Lua按名称小写、可选命令名、扩展ID、可选命令ID排序，主入口在无命令名位置。

原生使用Windows invariant Unicode小写，ASCII大小写与同名排序已验证；Rust完整Unicode小写规则与Windows版本差异尚无等价证据，保留已知验收缺口，不宣称全Unicode排序等价。首次集成回归发现测试把扩展ID排在命令名之前，核对旧版元组顺序后修正预期，保留实现。多目录真实fixture覆盖坏清单/缺失入口/停用/过滤/排序/坏状态和不存在目录。Release专项、10项extension复验、来源/diff通过后保存推送dev。仍无正式扩展管理UI、安装、Lua执行或正式exe更新，整体INCOMPLETE；用户数据/缓存/editor_support.h原状态保留。


### 2026-11-10：扩展启用状态持久化阶段

迁移 platform_extensions.rs::set_extension_enabled_at：校验目录/清单/身份，读取状态，更新单个enabled，复用公共writeBinaryFileAtomic保存，成功后返回更新候选。保留其他enabled条目及seededBuiltin/builtinRevisions；未知状态字段按旧serde忽略。测试覆盖切换/重开、其他条目保持、无效目录/坏清单、坏状态不覆盖、无删除共享锁导致保存失败保留原字节及内置标记保持。未调用实际用户扩展目录，fixture均在构建测试目录。

Release专项构建与10项extension验证通过，来源/diff检查后保存推送dev。仍有明确差异：WinRT JSON数值用double，builtinRevisions的u64文件大小超过2^53时存在精度风险，完整状态格式等价尚未完成，后续需无损整数解析；当前未接正式扩展管理UI/运行中会话切换或安装。无正式exe/GUI/全套回归，整体INCOMPLETE；用户数据/缓存/editor_support.h既有状态保留。


### 2026-11-10：扩展状态无损整数与统一校验阶段

关闭上一阶段builtinRevisions大整数精度缺口。按legacy ExtensionState的BTreeMap/HashSet/(u32,u64)完整类型迁移独立ExtensionState：数字token先保留十进制文本，再from_chars解析，类型形状区分真正数字与字符串；序列化直接输出整数token，避免WinRT double。seededBuiltin去重，缺省字段为空，未知字段忽略。目录读取、枚举、切换统一完整状态检查，删除切换路径重复且有损的JSON转换。

回归u32/u64最大值、2^53+1精确保存和切换重开，拒绝溢出/负数/小数/指数/数字字符串/null/错误元组/前导零与非字符串seed。仍未建立重复顶层字段的serde拒绝规则及JSON递归上限等价证据，保持partial登记；不宣称所有JSON解析边界一致。Release专项与10项extension测试、来源/diff通过后保存推送dev；无正式exe/GUI/全套回归，实际安装/引擎仍待接线，整体INCOMPLETE。保留用户数据/缓存/editor_support.h原状态。


### 2026-11-10：msext压缩包检查阶段

依据legacy inspect_extension_package/inspect_archive，复用project::Archive迁移普通.msext文件50MiB、1至256条、累计256MiB、路径/大小写重复/Unix符号链接、根manifest256KiB、共享完整清单校验和声明入口/资源存在性。ZIP新增读取madeBy/externalAttributes；parseManifest独立于目录状态IO，检查不解压到磁盘。真实stored ZIP fixture覆盖正常预览、空包、缺入口、清单大小写、重复路径、越界、符号链接、清单超限和257条。

仍partial：Archive不支持ZIP64及stored/deflate之外压缩，CP437名称及目录size按零累计的旧版语义尚待迁移。无安装/提取/UI/引擎接线，不能称完整扩展包迁移。相关Release构建与专项测试、来源/diff检查后阶段保存推送dev；无正式exe/GUI/全套验收，整体INCOMPLETE，保留用户数据/缓存/editor_support.h原状态。


### 2026-11-10：msext安装更新事务阶段

承接legacy extract_archive/install_extension_at：独占创建staging、路径校验、CRC/大小验证、CREATE_NEW写入并Flush、重新校验解压清单、读取完整状态、旧目录backup、staging替换、保持原enabled、状态原子保存，失败移除新目录并恢复旧版本，成功清理backup。检查与解压共享同一不可变Archive快照，避免旧版重新打开源文件的变更竞态；所有递归清理先确认路径是指定安装根的直接子项。安装根由调用方提供，尚无默认目录/正式UI接线。

真实测试目录验证首次安装和Lua解析、保留停用状态的更新/移除旧文件、状态锁导致发布失败后旧脚本与状态字节恢复、文件/目录冲突导致解压失败后旧版不变、事务目录清理。Release构建、11项extension/project-reader测试通过1.69s，来源/diff后保存推送dev。清理/恢复失败按旧版best effort尚无故障注入验收；压缩格式兼容缺口仍在，不宣称完整包支持。无用户扩展目录修改、正式exe/GUI/全套验收；整体INCOMPLETE，实际运行时与安装入口仍待完成，保留用户数据/缓存/editor_support.h原状态。


### 2026-11-10：扩展卸载事务与管理核心闭环阶段

直接迁移 platform_extensions.rs::uninstall_extension_at：校验普通目录、清单身份与完整状态；先移除enabled登记并原子保存，再递归删除扩展目录；删除失败尽力写回原状态并保留原删除错误。清理前确认目标绝对路径为指定安装根的直接子目录，拒绝路径越界。保留旧版删除失败可能部分删除文件的行为，未将状态恢复称为完整目录回滚。

测试目录内执行安装→停用→更新→卸载组合。状态文件无删除共享锁验证保存失败前不删文件；目录句柄无删除共享锁验证删除失败后恢复停用状态；成功卸载验证目录与enabled项移除，其他扩展状态、seededBuiltin和u64最大revision完整保持。缺失目标、无效ID、坏清单拒绝且保留坏清单。Release构建与11项extension/project-reader测试通过1.64s，来源/diff检查后保存推送dev。安装/更新/启停/卸载核心已组合验证，但正式管理UI、默认目录、运行中会话及脚本引擎未接入；压缩兼容和先前JSON/Unicode缺口仍在，整体INCOMPLETE。无用户目录修改、正式exe/GUI/全套验收，保留用户数据/缓存/editor_support.h原状态。


### 2026-11-10：内置扩展初始化与内容修订更新阶段

迁移legacy ensure_builtin_extension_at：首次安装后登记seededBuiltin与按文件名排序的CRC/解压大小修订；相同修订保留本地文件，内容变化即使版本号相同也走安装更新并保持enabled；已初始化但目录缺失视为用户卸载，不重装也不读取包。检查包ID与预期身份，复用同一不可变inspection进行修订计算和安装，避免源包变化造成修订记录与安装内容不符。提取installInspectedPackage以复用现有事务，RuntimeDirectory提供完整typed状态读取保存。

测试覆盖首次初始化、相同修订不覆盖本地修改、同版本内容更新与停用保留、卸载后缺包也不重装、错误ID不安装。该阶段为路径包适配，实际pet-companion包嵌入和正式启动调用未接入；内置HTML能力迁移原生仍待完成，不能称内置宠物已可运行。安装成功后seed状态保存失败的旧版重试语义保留，未新增自动循环。Release及11项相关测试、来源/diff检查后保存推送dev；整体INCOMPLETE，无正式exe/GUI/全套验收，保留用户数据/缓存/editor_support.h既有状态。


### 2026-11-10：宿主设置值与事件交互阶段

对照ExtensionSettingsDialog.tsx::HostExtensionSettings及其显示条件测试迁移SettingsValues：加载checkbox类型/number钳制/text UTF16 slice/select精确选项归一化，update合并存储与当前值、commit保留未知键且成功保存后更新状态/发settings-changed、reset默认值保留磁盘未知键、显示条件保留隐藏值、runtime按钮与closeOnRun。复用javascriptJsonUtf8保留孤立代理转义，事件增加key并用payload适配JSON value；原生控件渲染仍未接线，完整JS数字序列化格式等价尚未验证。

四相关Release目标构建成功，extension-session-host含设置组合通过0.08s，其余八项通过；整组10项有1项失败：extension-runtime-directory安装用例在staging-16252-27578453-6→test重命名ERROR_ACCESS_DENIED，现场保留，未定位持有者、未重试掩盖。该结果不能标绿整组，也不能宣称安装已稳定。设置阶段最小相关测试通过，来源/diff检查后保存推送dev，后续优先检查该安装失败。无正式exe/UI/全套验收，整体INCOMPLETE；保留用户数据/缓存/editor_support.h原状态。


### 2026-11-10：安装占用失败与回滚诊断阶段

复查上轮directory-16252-27578218/install-owned现场，旧test目录与状态存在、无遗留staging/backup，未定位当时外部句柄。没有依据宣称ERROR_ACCESS_DENIED根因已修复。新增受控installed目录无delete-sharing句柄，验证更新在重命名旧目录阶段拒绝、错误携带源/目标路径，原脚本和状态字节不变。修正安装catch忽略回滚错误的问题：清理/恢复失败时追加路径与备份保留位置；成功回滚仍抛原始失败，不加重试循环或改为忽略错误。此为原生错误诊断适配，事务成功路径不变。

Release专项构建，11项extension/project-reader检查通过1.80s，含设置会话0.08s和新增锁定场景。此次绿灯不替代原偶发重命名失败根因证据；双故障回滚诊断分支尚未故障注入验证。来源/diff后保存推送dev，无正式exe/UI/全套验收，整体INCOMPLETE；保留原失败现场、用户数据/缓存/editor_support.h既有状态。


### 2026-11-10：扩展显示字段本地化阶段

完整承接core/extension-localization.ts递归访问规则：仅精确locale目录，缺失直接保留原对象，不做语言前缀/英语回退；翻译name/description/label/suffix/placeholder，跳过translations子树，数组递归。新增typed候选显示副本适配，覆盖扩展/命令/栏目/菜单/设置控件/选项文案，ID/路径/默认值/选项值/存储键/命令引用保持；翻译后不再按源字段长度校验，避免合法翻译被错误拒绝。

复用旧测试输入及预期验证原始数据不变、ID/默认值/选项值/存储键不翻译、缺失locale对象身份不变；另验证typed候选实际命令与五类设置显示字段。Release专项构建及11项extension/project-reader通过1.75s，来源/diff后保存推送dev。正式界面调用方尚未接入，不把数据副本称作用户可见本地化完成；整体INCOMPLETE，无正式exe/GUI/全套验收。原安装偶发拒绝访问根因仍未定位，保留现场和用户数据/缓存/editor_support.h既有状态。


### 2026-11-10：运行时动态菜单请求与会话状态阶段

核对extension-command-state.ts::setExtensionMenuItems和ExtensionRuntimeHost::menus.setItems：只允许本扩展声明的topMenus ID，menus与commands权限同时满足，最多64项，ID/event沿旧ASCII正则（允许点开头及双点），重复ID按大小写精确拒绝，名称UTF16最多80/JS trim，checked必填、dividerBefore可选布尔。整组验证后原子发布，相同内容不增长revision，省略name保留旧标题，空items清空选项。RequestHost/SessionHost接入声明设置与状态读取，停用/替换清理，旧token不能读新状态。

Release三个相关目标成功，10项extension通过1.74s。覆盖动态请求、权限、归属、大小写ID/特殊事件、失败保留、无变化更新、空项保留名称、停止清理与会话替换。首轮编译因C++17不支持默认比较运算符失败，已改显式比较。正式菜单渲染/点击事件和旧订阅Set尚未迁移，当前为宿主数据链路，不宣称完整可见动态菜单完成。来源/diff后保存推送dev，无正式exe/GUI/全套验收；整体INCOMPLETE，原安装偶发拒绝访问根因仍未知，保留用户文件/缓存/editor_support.h既有状态。


### 2026-11-10：栏目菜单贡献组装与可见性阶段

直接迁移core/extension-contributions.ts全部函数对应数据流程：脚本/栏目/菜单/顶层菜单key，启用过滤、Map最后命令优先、引用顺序与缺失跳过，内置菜单位置过滤、顶层start/before/after/end插入与首次去重，栏目当前状态优先于存储再取defaultVisible，只识别字符串true，移除不再贡献的栏目键。存储读写沿旧共享storage边界以回调适配，未挪入扩展私有Storage命名空间。

构建及专项测试验证三类贡献、停用、顺序/缺失、key、插入去重和可见性优先级/过期清理/精确字符串。旧同名.test.ts文件不存在，来源为实际实现而非虚构测试；本阶段新增原生回归。正式绘制/点击和共享持久化调用方仍待接入，不能将数据组装视为UI迁移完成。来源/diff后保存推送dev；无正式exe/GUI/全套验收，整体INCOMPLETE，保留用户文件/缓存/editor_support.h原状态及安装失败现场。


本阶段实际验收补充：整组11项10通过1失败，目录安装再次在第6次staging→test重命名拒绝访问（directory-32916-28086484）。调整新用例顺序后另一次目录运行在状态原子替换拒绝访问（directory-13900-28124890），未改动writer/增加重试，保留现场。贡献验证抽出独立无磁盘CTest，避免被无关目录事务提前中断；独立Release构建与extension-contributions通过。整组不能标绿；安装/状态文件偶发占用问题仍未定位。本阶段只以独立贡献检查作为最小相关验收。


### 2026-11-10：扩展状态快照读取与统一替换阶段

复用已验证的extension Storage适配方案，状态保存从公共MoveFileEx覆盖改为：公共writer写入并Flush唯一staging，已有目标ReplaceFileW，缺失目标不覆盖MoveFileEx发布，失败清本次staging，不自动重试。元数据读取明确READ/WRITE/DELETE共享，安装状态读取改复用RuntimeDirectory，启停/卸载/内置标记均走同一saveState，拒绝非普通状态文件。公共工程导出writer不变。

受控旧快照句柄持续打开时32次保存/重开全部通过，u64修订与enabled一致、旧句柄仍读原值；既有无delete-sharing锁定写入失败及旧值保留继续验证。Release两个相关目标成功，12项extension/project-reader全部通过2.16s。此证据只证明本次快照协议，未建立此前状态替换外部持有者根因；staging目录重命名拒绝访问仍独立未定位，原现场保留。来源/diff后保存推送dev；无正式exe/GUI/全套验收，整体INCOMPLETE，保留用户数据/缓存/editor_support.h既有状态。


### 2026-11-10：扩展命令显示状态与会话归属阶段

承接extension-command-state.ts及其测试：未知命令默认未勾选且可见，checked/visible部分更新保留省略字段，false作为有效值，相同值或空补丁不增加修订号；停用统一清空命令与菜单状态。MenuState声明更新保留命令状态并保持revision单调。核对ExtensionWindow::window.setCommandState和ExtensionRuntimeHost的command-state消息，只提供内部已认证会话上报桥，校验命令ID/布尔类型和本扩展声明命令归属；不新增运行时权限方法。SessionHost拒绝关闭/替换后的旧token。

Release三个相关目标构建成功，extension-request-host/session-host/resources三项检查通过0.26s；覆盖默认值、部分false更新、重复与空更新、无效输入原子性、跨宿主归属、声明更新保留、停用清空和旧token拒绝。来源774文件覆盖及diff检查通过。原生窗口消息传输、订阅Set与正式菜单渲染仍未接入，本阶段仅核心状态链路，不宣称扩展可运行或性能收益；无正式exe/GUI/全套验收，整体INCOMPLETE。保留安装失败现场、用户数据/缓存和editor_support.h既有状态。


### 2026-11-10：扩展呈现状态订阅生命周期阶段

迁移extension-command-state.ts::subscribeExtensionCommandState/notify的实时遍历：先发布状态及revision后通知，移除尚未执行的监听器会跳过，通知期间追加的监听器参与本次遍历；取消幂等，销毁后取消安全，监听器异常后遍历计数仍恢复。命令/菜单/声明变化与停用清空复用同一通知路径，无变化不通知，联合清空只通知一次。RequestHost与SessionHost提供订阅桥，旧token订阅为空操作；MenuState读取快照仅复制值，不共享宿主订阅。原生std::function没有JS函数对象身份，每次注册使用独立身份，不宣称同一JS函数Set去重已经接入；未来引擎桥须保持其函数身份。

Release三个相关目标成功，extension-request-host/session-host/resources三项通过0.28s，含实时增删、重复更新抑制、快照隔离、重复/销毁后取消、异常恢复、会话更新与关闭通知。来源覆盖及diff检查后保存推送dev。此阶段完整交付核心订阅生命周期；正式UI消费者、全局聚合状态与引擎窗口仍待接入，无正式exe/GUI/全套验收，整体INCOMPLETE。保留既有用户差异、缓存和安装失败现场。


### 2026-11-10：扩展菜单呈现数据与动作分发阶段

逐段承接AppMenuBar::renderExtensionCommandButton/renderExtensionTopMenusAt/renderExistingMenuContributions/fileLuaScripts。提供绘制无关节点：动态标题覆盖，动态项先于静态且同ID抑制静态，动态checked优先于命令状态，visible过滤，Lua无工程/运行中禁用，缺失扩展禁用，描述或名称tooltip，动态/组间/内置位置分隔线，隐藏项仍保留旧版独立分隔线，命名子菜单即使全隐藏仍保留。已由panel/menu/top贡献放置的Lua命令从文件脚本入口去重，根脚本与停用扩展放置不误过滤。动作复用executeCommand，拒绝分隔线/子菜单/禁用节点，覆盖runtime、Lua和settings。

Release extension-contributions目标及独立测试通过0.05s，验证动态覆盖/顺序/勾选优先、静态恢复、隐藏与空子菜单、Lua工程/运行门控、三种动作实际分发、停止/禁用拒绝、位置分隔线、脚本去重；来源774文件及diff检查通过。此阶段完成菜单数据及动作适配，尚未接入正式原生菜单控件/关闭交互/扩展目录启动链路，不能宣称用户可见菜单或扩展运行完成。无正式exe/GUI/全套验收，整体INCOMPLETE；保留用户差异/缓存与安装失败现场。保存推送dev。


### 2026-11-10：运行时提示、设置与文本剪贴板宿主服务阶段

核对ExtensionRuntimeHost::handleRequest与stringParam后承接ui.notify/notifications.show（分别ui/notifications权限，message必需字符串，500 UTF16单元截断）、ui.openSettings（必须hasSettings，固定当前扩展ID）、clipboard.readText/writeText（clipboard权限，写入text必需字符串，内容不额外截断）。HostServices由实际应用注入通知及剪贴板，设置复用既有CommandHandlers；缺失连接和服务异常显式失败，不虚报成功。SessionHost只允许当前generation设置服务，替换会话不继承旧回调。

Release三个相关目标构建与extension-request-host/session-host/resources三项通过0.28s，覆盖精确Unicode/内嵌NUL往返、通知截断落在代理对中间的JS行为、权限及参数失败无副作用、设置归属/不可用、缺失/抛错服务、旧token不能污染新会话。来源与diff检查后保存推送dev。本阶段是完整请求/会话服务适配，尚无真实系统剪贴板/正式消息区和设置窗口调用方；诊断日志的JS String转换副作用语义仍需单独核对，未加入本阶段，不宣称已支持。无正式exe/GUI/全套验收，整体INCOMPLETE，保留用户差异/缓存及原安装失败现场。


### 2026-11-10：工作区与文档查询／历史请求阶段

迁移ExtensionRuntimeHost::projectSnapshot与workspace.listProjects/getActiveProject/activateProject、document.getSummary/getLayers/getFrames/undo/redo。类型化服务输出旧版9字段工程摘要、5字段图层、按序index帧；无活动工程摘要null，层/帧/历史报错，激活先验证工程存在。各方法沿原权限；缺失服务显式失败，会话generation绑定配置，不继承过期回调。查询不取像素或复制文档，历史动作委托领域事务。

Release三个相关目标构建成功；session/resources通过，实际Document笔画经会话撤销为空、重做恢复，查询保持contentRevision。request检查首次在既有storage.remove失败（此前新增请求断言均已通过），保留运行现场；增加具体error及fixture路径诊断后重建单项通过0.08s。未把该复测称为外部存储占用根因已修复，也不宣称整组一次通过。首轮编译测试变量snapshot重名已修正。来源覆盖与diff检查后保存推送dev。正式编辑器工作区绑定、对应编辑器事件、引擎传输尚未接入，无正式exe/GUI/全套验收，整体INCOMPLETE；保留用户差异/缓存和先前安装失败现场。


### 2026-11-10：Runtime工具与颜色请求阶段

对照ExtensionRuntimeHost TOOL_IDS/colorParam/handleRequest，补齐tools.getActive/setActive、colors.get/setPrimary/setSecondary，沿原tools/document.read/document.write权限。只允许旧版15工具ID，不擅自扩展gradient等ID；颜色四通道必须有限数字，按JS Math.round后clamp到0–255，缺字段/非数字原子拒绝。查询无工程null；设置仍委托工作区，保留旧版共享颜色偏好在无工程时更新的入口。核对workspace-commands-tool/color的手势锁、浮动提交及跨会话色板同步，回调边界保留这些领域职责，不用直接改Document色板替代。

Release三个相关目标构建成功，request/session/resources三项通过0.28s；覆盖15ID逐一往返、大小写/未知ID、缺失类型、半值四舍五入、越界夹取、透明alpha、结果字段、无工程查询/设置、权限和未连接服务。来源/diff检查后保存推送dev。此次仅请求与服务边界完整迁移；正式Editor工具映射和共享色板调用方仍未接入，未声称真实工具切换/色板同步已验收。无正式exe/GUI/全套验收，整体INCOMPLETE，保留既有差异/用户文件/缓存及失败现场。


### 2026-11-10：扩展停用异常与重入清理阶段

核对旧版ExtensionRuntimeHost独立React effects的file-drop/runtime注册释放及postMessage异步停用后，修复原生同步回调适配缺陷：状态订阅抛错会跳过拖放与停用、停用抛错会遗留EventLifecycle活动态。现在先使session/event失效，注销runtime、清拖放/呈现、发送停用均执行，最后重抛首个错误；停用重入和重复关闭幂等，宿主析构继续清理其他会话。保留旧版加载失败重载语义，未自行把loadFailed改为永久关闭。

Release四个相关目标及resources/session/request/event-lifecycle四项通过0.30s；新增析构多会话故障用例后重建session并通过0.12s。覆盖呈现和停用同时抛错仍清注册/拖放/旧token、替换空状态、回调内重入停用、析构一会话抛错不阻断另一会话。来源/diff检查后保存推送dev。此阶段完成已有核心会话的异常清理，不宣称尚未接入的窗口/网络/引擎任务已经被释放，无正式exe/GUI/全套验收，整体INCOMPLETE，用户差异/缓存与安装失败现场保留。


### 2026-11-10：编辑器事件载荷与快照差分阶段

完整承接workspace-extension-events::changedEditorEvents与extension-editor-events::publishEditorEvent：23名称目录、typed name/projectId/detail/timestamp，激活→关闭→逐工程状态事件的固定顺序，新增工程只报created/opened不补状态；revision/tool/layer/增删层/frame/playing/selection/前后景/view差分。快照只保留值，不带像素或路径；selectionIdentity明确是旧JS对象身份而非矩形相等，view由调用方提供旧JSON签名。订阅先更新基线后发送，沿现有EventLifecycle权限、加载前丢弃和停用边界；操作事件复用RuntimeRegistry广播。

Release六个相关目标成功，contributions/resources/session/request/event-lifecycle/runtime六项通过0.33s。覆盖全部差分顺序/详情/时间、创建打开关闭激活、选区对象替换/清除、动画停止、快照独立和重复抑制、加载前丢弃及停止、发布与注销。首轮时钟回调默认参数编译错误已修正。来源覆盖775文件及diff检查后保存推送dev。正式Editor快照捕获、成功操作调用点和JSON引擎传输未接入；未声称撤销/填充等正式程序事件已可用，也未做GUI/正式exe/全套验收。整体INCOMPLETE，保留用户差异/数据/缓存和安装失败现场。


### 2026-11-10：编辑器事件会话订阅与采色桥阶段

承接ExtensionRuntimeHost events权限限定的workspace订阅与CANVAS_COLOR_SAMPLING_COMPLETED_EVENT桥，SessionHost提供generation绑定的subscribeEditor/editorChanged/colorSampled。基线由应用订阅瞬间捕获，不把已打开作品补报为新建；加载前更新基线但不补发事件。每个会话独立订阅，无events权限不创建；替换不继承，旧token不可配置/更新/采色。派发保留订阅对象并弱引用会话，回调内关闭自身不会销毁正在执行的对象，后续同批事件被活动态拦截；stop释放基线。

Release session/resources两个相关目标成功，session/event-lifecycle/runtime三项通过0.14s。覆盖权限、无初始/重复/加载前事件、详情与时间、采色隔离、替换无继承、首事件关闭后同批中断。来源775文件及diff检查后保存推送dev。此阶段完整接通核心会话与事件差分，正式Editor工作区观察器、画布采色信号、引擎传输仍待接入，无正式exe/GUI/全套验收，整体INCOMPLETE，保留用户差异/缓存及失败现场。


### 2026-11-10：Runtime事件JSON出口阶段

对照types-extension-runtime完整13类联合及ExtensionRuntimeHost send包装，新增eventJson/eventEnvelope。仅输出当前事件字段，补kind/windowId/format/homeOpen，project空值与设置/window任意JSON，files无符号字节数组，editor详情四种标量/时间和可选projectId；缺省format省略。JSON不执行代码，畸形payload/未知事件/缺必需projectId/未知interaction明确失败，非有限详情数字按JS JSON转null。保持原生core与WinRT序列化适配分开。

Release六个相关目标成功，contributions/resources/session/request/event-lifecycle/runtime六项通过0.33s，新增覆盖13类型、字段数量/可选省略、嵌套值、孤立代理字符、255字节及详情标量/异常。来源776文件与diff检查后保存推送dev。事件出口尚未挂接真正JS/Lua引擎或正式Editor，不能称为可运行扩展/GUI验收；无正式exe/全套验收，整体INCOMPLETE，用户差异/数据/缓存及失败现场保留。


### 2026-11-10：工程快照与保存事件会话链路阶段

对照ExtensionRuntimeHost工程effect，新增ProjectEventSubscription并接入SessionHost generation生命周期；projectEvent复用查询projectSnapshot，避免两套字段漂移。按id/name/contentRevision/dirty/homeOpen依赖触发，首次通知、无变化去重；先project再document-saved，前者workspace.read后者events权限。保留旧版跨活动工程dirty→clean也向新工程发saved的实际行为，关闭工程只发null，不自行重设计保存判定。基线先更新再同步回调以支持重入，stop释放。

Release session/resources两个相关目标成功，session专项通过0.11s。覆盖加载前丢弃但更新基线、相同值抑制、查询一致摘要、权限独立、尺寸变化仅在revision改变后发布、重命名/首页、dirty跨工程、关闭null、旧token与替换新基线。来源777文件及diff检查后保存推送dev。正式Editor工作区观察器和真实脚本引擎仍待接入，无正式exe/GUI/全套验收，整体INCOMPLETE，保留用户差异/数据/缓存和失败现场。


### 2026-11-10：交互与时钟事件回调阶段

承接ExtensionRuntimeHost events effect：pointerdown/pointermove/wheel共享lastPointer节流500ms，keydown即时发送，clock回调携带当前epoch毫秒，旧周期30000ms明确常量。新增InteractionEvents并接入SessionHost当前generation；仅events权限创建，预加载丢事件但更新pointer基线，关闭释放，替换从新基线开始，旧回调无效。时间倒退按旧差值逻辑保留节流，不新增补发循环或后台线程。

Release session/resources相关目标成功，session/resources/event-lifecycle三项通过0.24s，覆盖500ms边界、键盘不节流、clock时间、时钟倒退、权限、加载前、关闭和替换。来源778文件与diff检查后保存推送dev。本阶段为完整回调语义与会话处理；正式窗口输入监听注册/解除及实际30000ms定时器仍未接入，未宣称正式应用已有交互计时事件，无正式exe/GUI/全套验收。整体INCOMPLETE，保留用户差异/数据/缓存及失败现场。


### 2026-11-10：Lua脚本目录与源码加载阶段

复核platform_scripts.rs及mlua宿主；当前完整Lua文档API仍是Rust实现，未用简单解释器替代。迁移脚本来源闭环：顶层普通Lua文件列表（后缀大小写不敏感）、名称/稳定排序、扩展主入口与命令opaque ID/元数据及合并列表、安全本地标识解析、复用启用扩展入口解析、共用源码加载、1MiB含边界、严格UTF8、普通非symlink限制。删除只允许本地脚本；首次示例/marker走已有原子writer，不覆盖用户副本，marker阻止恢复已删除示例。测试仅删除自己本次fixture内的示例，保留fixture目录，不触碰用户脚本。

Release独立lua-script-directory目标及真实磁盘专项通过0.11s，覆盖旧版列表/路径/示例用例及边界大小、空源码、非法编码、扩展命令/主入口加载、停用拒绝、扩展禁止删除。来源780文件/diff检查后保存推送dev。Windows invariant小写排序沿既有适配，完整Rust Unicode小写一致性未证明；目录由调用方注入，正式应用路径、示例素材嵌入、打开文件夹入口和真正Lua引擎/文档API尚未接入。无正式exe/GUI/全套验收，整体INCOMPLETE，保留用户差异/数据/缓存及失败现场。


### 2026-11-10：Lua脚本来源服务与真实示例嵌入阶段

承接platform_scripts::script_directory/list_lua_scripts/open_lua_script_folder及platform_paths程序目录规则，新增Service统一准备scripts、合并extensions、返回camelCase列表及省略可选字段、加载/删除/打开目录。CMake从原moon-phase.lua逐字节生成构建目录头文件，不复制改写示例，不提交生成物；示例变更触发重新配置。Win32程序路径与ShellExecuteEx适配旧current_exe/Command，提供测试root/opener注入。扩展脚本加载沿旧版无需创建本地scripts，扩展删除在准备目录前拒绝。

Release lua-script-directory目标及专项通过0.12s，验证真实示例嵌入/首次写入/加载与原文件字节一致、列表字段/可选省略、目录启动参数/失败传播、用户删除后不恢复和程序目录解析。来源781文件及diff检查后保存推送dev。实际Explorer启动仅接口实现，未弹窗验收；正式菜单与Lua执行引擎尚未调用Service，无正式exe/GUI/全套验收，整体INCOMPLETE，保留用户差异/数据/缓存与失败现场。


### 2026-11-10：正式脚本目录菜单接入阶段

对照AppMenuBar.tsx的onOpenLuaScriptFolder及platform_scripts.rs目录服务，把正式菜单已有openScriptFolder绑定到Service::openFolder。无工程/首页仍可打开，目录准备与原始示例seed沿已有Service，失败显示状态栏；未增加脚本执行假入口。正式目标加入generated头目录。已有smokeInteraction补注入回调检查无工程可用、派发和错误状态，不弹Explorer。用户再次确认Hybrid预览与提交一致并保留大画布延迟优化，沿此前已实现资源patch/区域输出方案。

正式Release构建成功，唯一exe更新；lua-script-directory/tilemap-document/canvas-tilemap-preview三项通过0.97s。实际--smoke退出1，先在既有Preview hide failed断言失败，尚未到新增脚本菜单断言；未声称新菜单实际运行验收或Explorer打开通过，保留失败现场，未盲目重试。来源覆盖781文件及diff检查通过。Lua执行引擎、正式扩展宿主仍待接入，整体INCOMPLETE。保留用户差异、数据与缓存；本阶段保存推送dev。


### 2026-11-10：正式脚本菜单无工程可用性与回归障碍核验

实际--smoke揭示前阶段Service已绑定但公共菜单available仍要求工程的缺陷。对照AppMenuBar.tsx无session禁用条件的open-folder入口，公共门禁允许openScriptFolder在首页/无工程时使用，保留pending互斥。真实PixelMenuItem validate/Click检查已执行通过，包括无工程enabled、服务派发、错误状态；Explorer仍使用注入回调，未宣称实际Explorer验收或Lua执行完成。

清理同条验收路径三个过期假设：面板可能由已保存工作区恢复为隐藏，改为显式开关往返、勾选核对并恢复完整布局；菜单数量沿现行独立测试为145；RGBA缓存白底oracle不再依赖棋盘格默认尺寸。均保留实质行为断言。每次仅在具体修正后重建复测，无盲目重试。正式Release成功；canvas-performance/canvas-checkerboard/menu-catalog/lua-script-directory四项通过8.90s。最新--smoke通过上述菜单/面板/缓存检查，随后仍在editor_smoke.cpp工具栏旧几何断言失败（当时8347行），需后续按现行UI规范单独核验；不宣称完整冒烟通过。来源覆盖781及diff检查通过。整体INCOMPLETE，保留用户差异、数据、缓存和失败现场，本阶段保存推送dev。


### 2026-11-10：工具栏几何回归与脚本测试现场隔离

核对现行UI规范及placePropertyControl，旧测试的上下偏移改为20px输入框/16px专用图标的高度与中心线关系；阶梯控件沿已迁移EditorToolOptions.tsx 1-16输入契约验证可编辑，工具轨道重叠检查兼容横排/竖排。真实运行发现前阶段脚本菜单fixture临时无工程点击触发refresh，禁用全部子控件却只恢复工程标志；现在保存各子控件自身DISABLED位，恢复后刷新原工程，避免污染后续交互。诊断确认不是产品阶梯恢复缺陷，曾尝试的生产代码修改已撤回，无生产布局改动。

正式Release成功，实际--tool-rail-check退出0；--smoke现通过脚本菜单、面板往返、缓存、属性栏几何和阶梯可编辑检查，随后在橡皮擦指针旧断言失败（当时8414行），后续需单独核验指针语义，未宣称完整smoke通过。来源781及diff检查通过，无新人工图像验收。整体迁移INCOMPLETE，保留用户数据、缓存与原差异，阶段提交推送dev。


### 2026-11-10：完整旧版Lua/MSE执行核心原生库阶段

复核MoonSprite/MLua/Lua许可和依赖边界，直接编译legacy platform_scripts/lua_api.rs及mse_api.rs（不复制改写API），build.rs提取原serde上下文/结果与预算常量，排除Tauri命令及已迁移C++文件服务。Rust staticlib提供线程归属C ABI和JSON start/dispatch/close，保留原会话仅在存在对话框时存活、回调前rebase、执行失败删除、close幂等；结果原样包含事务/创建对象/对话框。错误包及allocator free、错误线程拒绝均明确，仍要求调用方有效指针与串行所有权。没有WebView/Tauri依赖，也没有把脚本结果直接写进Document。

沿用mlua0.10.5 Lua54 vendored与锁定依赖，CMake独立目标/CTest、构建脚本均在native，Rust输出和MSVC TEMP固定native/build；调试记录/系统TEMP占用构建错误分别用无debug构建和专用TEMP适配，保留原缓存。C++实际链接暴露动态/静态CRT不匹配后，统一原生MT编译并成功。原16项Lua/MSE测试全部复用，包括真实月相示例、事务回滚、跨帧Cel、modeless/blocking对话框、指令预算与危险库剔除；新增2项Rust FFI及实际C++链接调用检查。Release CTest lua-runtime/lua-runtime-ffi两项通过11.81s（内部18项），无正式exe更改/GUI验收；cargo fmt格式化新Rust文件。来源门禁增加Rust/Cargo元数据覆盖，788文件通过。正式Editor快照、事务结果应用、异步工作线程调用方、动态脚本菜单及原生对话框仍待接入，不能宣称用户可运行脚本；整体INCOMPLETE。橡皮擦旧冒烟失败仍保留，用户差异/数据/缓存保留，阶段保存推送dev。


### 2026-11-10：Lua源码到后台执行与会话生命周期阶段

沿platform_scripts.rs RuntimeRequest/runtime_loop/send_runtime_request，把既有C++ Service安全源码加载与Rust LuaSession完整引擎接在一个专用线程。start/dispatch/close通过FIFO packaged_task/future传递独立UTF8 JSON，worker拥有COM MTA、VM及会话；调用者不携带WinRT对象跨线程。启动异常回传并join；shutdown/析构停止接收，处理已入队请求，再于owner线程释放会话/COM。脚本/路径/JSON/预算错误由本次future接收，不杀死worker。线程返回原始事务结果，不擅自写入Document。

Release实际C++加载执行测试覆盖本地事务、连续请求错误隔离、路径穿越/坏JSON/指令预算拒绝、真实moon-phase.lua首次seed后执行、扩展主入口/命令/停用后拒绝、modeless对话框同VM连续计数回调与上下文rebase、关闭后失效、显式shutdown及析构drain、关闭幂等/停止后拒绝。首轮暴露既有扩展头依赖Windows声明，新增runtime入口显式包含Windows/NOMINMAX后构建成功。lua-script-directory/runtime-ffi/script-runtime/runtime四项通过12.46s（Rust内部18项）；最后启动清理修正后script-runtime再通过0.19s。来源790文件及diff检查通过。无正式exe更改、GUI/完整冒烟验收，未解决橡皮擦旧断言。正式Editor快照、结果事务应用、动态脚本菜单/原生对话框和future轮询调用方仍待接入；整体INCOMPLETE。保留原差异/用户数据/缓存，本阶段保存推送dev。

### 2026-11-10：Lua真实文档分块快照与完整结果预检阶段

对照lua-script-service.ts buildInvocation/findActiveTargetSession/validateResult及预算测试，新增真实Document快照适配：先完整核对活动层4M/每帧合计12M预算，链接帧按帧计入，再沿现有RasterSnapshot每块16384/每轮262144像素和deadline分块复制。活动层expected与对应Cel共享不可变快照，避免额外活动层副本；RGBA逐字保留透明RGB、局部偏移，不把storageOrigin当显示位置。空Cel只生成透明快照，不创建Cel/历史。完成快照可脱离原Document，startInvocation/dispatchInvocation在Lua worker编码JSON，UI不逐像素分配WinRT对象。实际MSE快照由调用方明确提供，不伪造空资源模型；现有原生Document为RGBA，未声称indexed上下文已迁移。

新增Target检查文档运行identity（防同projectId替换）、活动层/帧、mask/kind/锁、revision及完整原像素；分块中另验owner/storage identity/revision/geometry，避免捕捉变化中的像素。整结果预检包括所有batch顺序前值、重复索引/范围/安全整数、JS unsigned转换、surface互斥/前值、完整MSE操作白名单和每batch 16Mi UTF16 JSON长度、创建层/工程尺寸/格式/ID重复。预算沿已有native local_history_diff的ECMAScript数值长度适配及字符串转义处理。空操作结果不复制baseline，首次像素变化才复制。结果坐标超native int32时明确拒绝，不截断；旧JS安全整数更宽的必要技术差异保留记录。

Release构建成功；lua-script-runtime/lua-script-invocation两项通过0.45s。覆盖真实Lua读取/事务返回、源Document销毁后执行、Unicode/保存路径/选区/颜色角色、链接预算边界和超过预算、deadline/tick、空Cel、活动编辑/锁/切帧/同ID另工程/无Document revision像素变更、连续/非法晚批次、整面替换、创建结构、16Mi参数恰好允许与超限拒绝。编译缺WinRT Collections头已修正；首次fixture误用fromImported空archive门禁已修正，不改变产品导入规则。来源与diff检查后阶段保存推送dev。正式Editor调用方、真实MSE工作区捕获、结果应用/撤销重做、动态菜单及原生对话框仍未接入；无正式exe/GUI/完整冒烟验收，橡皮擦旧smoke失败未处理，整体INCOMPLETE。保留用户原差异、数据和缓存。

### 2026-11-10：Lua栅格结果应用与原生历史阶段

对照lua-script-service.ts commitSurfaceChange/commitPixelEdit/applyResult及history/animation，新增Document::commitScriptRasterBatch与applyRasterResult。完整结果先预检，再核对活动Target；逐批写原生owner-local Delta/SurfaceChange历史，普通像素修改保留storageOrigin，整面替换设为0。前值/重复索引/尺寸/工作内存预算在写入前核对，预分配历史和替换表面；普通已有Cel路径不复制整个工程。空Cel沿commitStroke创建候选并保留撤销后存活Cel语义，预算计入候选复制成本。无变化像素不产历史，整面/仅偏移变化产历史；像素统计和最终活动帧/层选择沿旧版，未把最终切帧当成dialog新目标。所有MSE操作和created对象在第一笔修改前明确拒绝，等待完整工作区执行器，不静默丢弃。

Release构建成功，lua-script-invocation/lua-script-runtime/document-raster-history三项通过2.27s。专项包含真实Lua执行→文档写入→撤销重做、链接Cel与跨图层共享内容、原点恢复、连续批次/无操作、整面替换/仅偏移计数、空槽写入和存活Cel、非法晚批次/未接入操作与创建对象全量预拒绝、原生工作预算失败不改revision/content/history、最终活动帧及过期target。额外验证history observer抛异常后已提交像素/历史保持一致并可撤销；这沿现有原生通知异常语义，不等同旧版compound abort，完整混合MSE批次回滚仍待接入。来源覆盖796及diff检查通过后保存推送dev。正式Editor/future调度、真实MSE工作区快照、MSE混合事务/创建层工程/跨文档回滚、动态菜单/原生对话框仍未完成；无正式exe更新/GUI/完整smoke，橡皮擦旧smoke失败保留，整体INCOMPLETE。保留用户差异、数据、缓存和现场。

### 2026-11-10：Lua创建图层结果与历史阶段

沿lua-script-service.ts commitCreatedLayer/rasterLayerFromScript，把createdLayers接入既有结果执行器和Document::commitScriptCreatedLayer。保留脚本ID、Unicode名称、opacity/visible/locked、parentGroupId、stackIndex钳制/省略追加、frameNumber越界回首帧；每层只创建指定帧Cel，其他帧保持缺失，表面存储原点归零。每次创建前refocus原目标，故独立撤销返回原图层/帧；detachedLayer/detachedCels/order记录复用原生历史，重做保留Cel身份。新层选中并清除组选中，预算在候选时间轴复制前检查；原生结构事务仍复制时间轴，属于已记录性能成本，不声称大工程创建优化完成。

Release构建和lua-script-invocation专项通过0.38s，覆盖真实Lua app.activeSprite:newLayer→像素→原生创建/撤销、单帧稀疏Cel、名字/标志/偏移/alpha统计、插入位置/多次创建/原目标恢复/越界帧回退、组归属/重复ID拒绝及前阶段栅格回归。来源覆盖796和diff检查通过；未更新正式exe，无GUI/完整smoke验收。createdDocuments、新建会话、MSE混合事务和正式Editor/future/原生对话框接入仍待完成，整体INCOMPLETE。保留用户差异、数据、缓存及失败现场，阶段保存推送dev。

### 2026-11-10：Lua RGBA创建工程与工作区交接阶段

对照lua-script-service.ts createScriptDocument/applyResult及document-model createDocument，新增buildCreatedDocument、applyWorkspaceResult。RGBA候选保留默认旧色板、100ms帧、按最大frameNumber建帧、每层仅指定帧Cel、显示几何回退、元数据/像素、首帧/末旧版层活动、fresh identity/projectId、dirty和空历史。工作区通过显式adopter按结果顺序接纳，计文档边界/像素与事务数，跳过跨文档后的源最终选择；候选构建前核对预算，候选全建成后才写源。adopter可能移动源对象，调用后不再访问源引用。正式Editor标签接纳尚未接线；indexed/grayscale缺少原生颜色模式状态，明确拒绝，不冒充支持。

审计既有project_import/project_encode证据确认旧版bottom-to-top/原生top-to-bottom，修正前两阶段Lua stackIndex与新层插入边界，并在创建工程反转层数组。首次测试使用构建中途已编译旧对象而失败，增量重建document_script后lua-script-invocation通过0.45s。覆盖原始moon-phase.lua实际执行→候选→回调接纳、保存清单8帧8层顺序、稀疏首帧/显示几何、身份/dirty/history、alpha与属性、元数据预算、缺adopter/不支持模式拒绝、多文档顺序和源引用销毁后安全。当时仅检查保存清单，未完成重开验收。后续实测更正：prepareEditableImport在全槽门禁前已有缺失槽补齐逻辑，原先推断稀疏重开被拒绝不成立。来源覆盖796/diff检查后阶段推送dev，无正式exe/GUI/完整smoke。MSE混合事务、颜色模式、正式Editor调度/菜单/对话框仍未完成，整体INCOMPLETE；保留用户差异、数据和缓存。


### 2026-11-10：Lua结果接收、客户端会话清理与工程重开验证

对照lua-script-service.ts outcomeFromResult/runLuaScriptForActiveDocument/dispatchLuaScriptDialogForActiveDocument，新增receiveWorkspaceResult：返回文件名/路径、输出、耗时及事务/像素计数；未结束结果保留session/dialog JSON及应用后的target。沿旧版先应用再判断跨工程边界：仍存活的对话框跨工程时保留已创建工程，报target changed并关闭会话。过期、非法和应用错误关闭返回session或dispatch原session；清理异常不覆盖原错误。关闭通过明确enqueue-only回调交给Runtime，不在结果接收路径等待工作线程。返回的dialog JSON仍待原生控件接入，不宣称正式脚本界面已可运行。

实际原始moon-phase.lua生成工程编码后调用prepareEditableImport/createEditableDocument，8帧8层画面逐一比较通过。确认导入器原有缺失Cel补齐发生在全槽门禁之前，更正上一阶段的稀疏重开错误诊断，无需改变生产导入逻辑。真实Lua modeless初始输出、回调像素与计数、更新target、过期结果关闭且后续dispatch失效、跨工程adopter销毁源后的安全清理、完成态月相结果及坏JSON的dispatch清理均纳入专项。

Release相关目标成功，lua-script-invocation通过0.44s。未更新正式exe，无GUI/完整smoke验收；MSE混合事务、原生颜色模式和正式Editor异步调度/动态菜单/对话框仍待完成，整体INCOMPLETE。保留用户原差异、数据、缓存及失败现场；本阶段保存推送dev。

### 2026-11-10：Lua异步调用协调与取消清理阶段

沿lua-script-service.ts run/rebaseTarget/dispatch/outcome，把已有分块快照、worker和结果接收接成PendingInvocation。主线程每轮按deadline/像素额度捕获，零超时检查future，仅ready后取结果；捕获和worker之间不保留Document指针。已有任务时拒绝重复启动；对话框dispatch先核对原工程/层/帧资格，再重新捕获当前revision和像素，承接用户在回调之间的编辑。取消捕获直接释放；已提交任务由Runtime在同一VM线程FIFO读取废弃结果并关闭返回session，dispatch失败时使用原session回退。清理异常不阻断后续任务；Runtime必须比协调器存活更久，析构沿现有drain语义，不宣称关机可立即中断脚本。

真实Lua测试覆盖过期deadline不执行、每轮单像素推进、忙碌拒绝、月相工程接纳、modeless回调与中途用户编辑rebase、捕获/提交后取消、无活动工程及捕获中修改拒绝。额外对已知session验证废弃结果清理与失败fallback清理后dispatch确实失效。Release invocation/runtime目标成功，两项相关测试通过；来源覆盖796与diff检查通过。正式Editor消息泵/动态脚本菜单/对话框尚待接线，真实MSE快照和混合事务未完成；未更新正式exe，无GUI/完整smoke验收，整体INCOMPLETE。本阶段保存推送dev，保留用户原差异、数据与缓存。

### 2026-11-10：Lua后台目录服务及接收重入/错误清理阶段

对照useAppScriptRuntime.tsx refreshLuaScripts及PreferencesDialog.tsx deleteLuaScript，Runtime新增异步list/remove，在既有worker复用完整Service，保持首次seed、扩展主入口/命令元数据、扩展脚本禁止单删、安全本地路径规则。删除及随后刷新共用FIFO，目录扫描和首次写入无需放在UI线程；失败通过独立future返回，不杀死worker，shutdown承接已接受列表请求并拒绝新请求。

核验上一阶段协调器发现两处缺口并修正：action/context JSON可在Rust dispatch之前失败，此时VM没有移除原session，future异常路径须主动排队关闭；adopter可能同步泵出嵌套调用，接收期间保持busy并拒绝嵌套start/tick，避免替换target。真实Lua坏action验证清理后session无法dispatch，成功/抛异常adopter验证重入拒绝及最终busy恢复。后台磁盘测试覆盖seed/扩展列表、删除与后续列表FIFO、扩展及穿越删除拒绝、失败隔离和shutdown排空。Release相关目标及invocation/runtime两项专项通过，来源覆盖796和diff检查通过。正式Editor调用方、真实MSE快照/混合事务、动态菜单与原生对话框仍未完成，无正式exe更新/GUI/完整smoke验收，整体INCOMPLETE。保存推送dev，保留用户差异、数据及缓存。

### 2026-11-10：Lua客户端发现、报告与持久对话框生命周期阶段

直接承接useAppScriptRuntime.tsx，新增Client围绕既有PendingInvocation/Runtime：脚本列表loading/loadFailed与异步刷新；正在运行或有持久session时run不重复启动；真实活动目标观察，切工程/层/帧后移除session并排队关闭；RunSummary输出报告、错误报告及供正式宿主本地化的状态枚举；dispatch失败关闭session，目标已失效则不显示过期错误。Escape先关闭输出/错误报告，再按最后一个dialog及controls dataKey/value构造close action，忙碌时仍消费Escape。析构关闭存活session并沿PendingInvocation清理未完成请求，Runtime必须后析构；调用方仍必须提供真实MSE快照。

真实Lua专项覆盖发现列表、modeless运行与持久会话互斥、输出报告及状态、Escape先报告后dialog完整往返、再次启动、切工程后旧session无法dispatch、缺工程错误与Escape、析构后session失效、坏action错误及恢复、切工程后过期回调错误抑制、停止runtime后的发现失败。Release invocation目标成功，invocation/runtime两项通过0.77s；来源覆盖797文件与diff检查通过。客户端不包含原生窗口/控件，不宣称正式Editor脚本运行已接入；动态菜单、消息泵、报告/对话框控件、真实MSE快照和混合事务仍待完成，无正式exe更新/GUI/完整smoke验收，整体INCOMPLETE。阶段保存推送dev，用户差异、数据与缓存保留。

### 2026-11-10：Lua对话框草稿与控件操作语义阶段

逐项对照LuaScriptDialog.tsx valuesForDialog/valuesRef/ScriptControl，新增DialogState单窗口草稿：dataKey初始化与返回模型重置、完整草稿操作载荷；entry本地修改后Enter/blur发change，number仅blur，slider在pointer-up/blur发release，color/combobox提交change，button/check/radio发click。连续radio范围按原controls列表判断，隐藏/禁用peer也参与互斥更新，separator阻断分组；busy/隐藏/禁用控件无用户操作。close含当前未提交草稿，不把每次键入发送Lua。标签/分隔线没有交互；数值边界与显示fallback仍由未来原生控件承接，不在状态适配层另造钳制。

实际Lua生成多控件dialog并接收原生action，验证未提交文本由按钮回调读到，包含各类commit时机、radio分隔/隐藏peer、颜色/选项、busy/隐藏/禁用拒绝、close载荷与模型reset。首次测试进程崩溃，移出过大的main局部测试栈后通过，未改产品行为或提高产品栈。Release构建、invocation/runtime专项及来源798文件/diff检查通过。仅控件操作状态，不包含原生窗口绘制、正式Editor菜单/消息泵或真实MSE快照/混合事务，无正式exe更新/GUI/完整smoke验收，整体INCOMPLETE。本阶段保存推送dev，保留用户差异、数据与缓存。

### 2026-11-10：Lua多对话框草稿接入客户端阶段

Client统一持有各DialogState，为原生窗口提供edit/click/commit/title-close接口；操作走同一PendingInvocation并在运行期间拒绝重复输入。回调返回后按旧React模型reset重建全部窗口草稿，包括其他未参与本次action的窗口；移除dialog或活动目标失效时释放对应状态。对照源码保留两种关闭区别：LuaScriptDialog窗口标题关闭发送本地草稿，useAppScriptRuntime全局Escape发送最近返回模型值；前阶段含混注释已更正，不擅自改变产品语义。

真实双Lua对话框验证未提交输入隔离、按钮回调收到草稿、modify返回重置、其他窗口草稿同步重置、busy拒绝、标题关闭携带草稿并移除窗口、entry提交后模型更新、Escape模型值和切工程清理。运行崩溃退出码确认0xc00000fd测试栈溢出，显式将该集成目标栈设4MiB，正式程序不变；后续断言揭示fixture onclose应放Dialog构造参数而非show，按原API修正。Release invocation/runtime专项、来源798文件和diff检查通过。原生窗口绘制、正式Editor菜单/消息泵、真实MSE快照和混合事务仍待完成，无正式exe更新/GUI/完整smoke验收，整体INCOMPLETE。阶段保存推送dev，保留用户差异、数据与缓存。


### 2026-11-10：原生Lua结果报告窗口阶段

对照LuaScriptResultDialog.tsx，新增ScriptReportDialog/ScriptReportPane，复用PixelDialog、Fusion字体、PixelScrollBar与旧版close图标。成功报告显示文件名/路径、修改像素/撤销步骤/耗时和按原换行拼接的输出；错误报告显示错误正文。正文可滚动，标题与关闭按钮固定，Escape和外部点击关闭，保持当前中文原生UI文案。内容按宽度变化缓存换行，绘制只遍历可见行，避免长输出逐帧完整排版。原生窄视口必要换行，不丢弃输出。

增加唯一正式exe的--script-report-check，实际打开500行成功报告与错误报告，检查正文/页脚间距、滚动和关闭并捕获BMP；这是报告UI验收入口，不代表脚本正式菜单已接入。来源覆盖799文件。唯一正式Release构建成功，--script-report-check实际运行完成，两种窗口布局/500行滚动/关闭断言通过，BMP转PNG后人工检查无重叠；截图为滚动前帧，未声称截图证明滚动后画面。Fusion字体缺少示例emoji时显示现有缺字框，未新增字体替换。来源799与diff检查通过。Client报告展示调用、动态脚本菜单、脚本控件窗口、真实MSE快照与混合事务仍待完成，整体INCOMPLETE。保留用户差异、数据和缓存。


### 2026-11-10：脚本原生小数输入与范围控件适配阶段

核对LuaScriptDialog/NumberInput/RangeField/useSliderWheel/range-step，现有PixelSlider整数域不能保留Lua小数范围，新增ScriptNumberEntry及ScriptRangeSlider复用原生输入/滑块皮肤。数值域double与绘制归一位置分开；输入框沿既有表达式解析、剪贴板和编辑历史，普通数字实时更新草稿，表达式Enter/blur确认，仅blur触发Lua提交。滑块pointer按min/step量化，键盘/滚轮保留小数，Shift沿number步长至少5，wheel沿旧版10位小数修正；pointer-up/blur才release，键盘及wheel不提前派发。普通控件未改行为。

唯一正式Release构建成功，实际Start-Process等待--script-report-check退出0；新增控件检查通过小数live草稿、表达式延迟/确认、blur计数、范围钳制、无效值保留、小数step、滑块键盘小数与终点且无提前release。报告窗口原验收继续通过，来源800文件与diff检查通过。尚未完成脚本窗口布局/所有控件接线；NumberInput完整步进按钮与浏览器range精确边界仍登记partial，不把本适配当完整窗口迁移。无新增控件截图验收；正式脚本菜单、真实MSE快照/混合事务仍未完成，整体INCOMPLETE。阶段保存推送dev，保留用户差异、数据和缓存。

### 2026-11-10：Lua原生控件窗口与实际显示验证阶段

对照LuaScriptDialog.tsx，新增ScriptDialogWindow，复用PixelDialog、原生输入/小数/滑块/复选框/下拉框/颜色弹窗与旧版关闭素材，承接十种控件行、草稿、操作JSON、忙碌禁用、返回模型重建和滚动裁剪。宿主须排队处理操作，不能在同步回调中销毁窗口。此窗口仍未连接正式Client/Editor脚本运行入口；radio暂用复选框外观、separator横线、NumberInput完整步进以及ColorValueControl精确提交时机仍明确登记partial。

实际截图发现通用Widget默认resize将所有子项铺满；核对Aseprite ui/widget.cpp后使用手动排版视口。再次截图发现窗口挂到Manager前isVisible为false使初始几何未设置，改为始终赋予控件行边界，并增加可见控件高度、宽度、不重叠、视口包含断言。唯一正式Release构建成功，--script-report-check退出0，控件草稿提交和既有报告检查通过；最新BMP转PNG人工检查，各控件已正确显示且无行重叠。两项Lua专项通过0.80s，来源覆盖801文件和diff检查通过。没有运行完整smoke，不把专项验收当作全部脚本入口可用。真实MSE快照/混合事务、正式菜单/消息泵/窗口宿主仍待完成，整体INCOMPLETE。本阶段保存推送dev，保留用户差异、数据、缓存与失败现场。

### 2026-11-10：真实Lua异步会话与非模态窗口宿主阶段

承接useAppScriptRuntime的dialogs/report宿主，新增ScriptWindowHost统一持有实际原生窗口：控件事件仅排队，消息泵校验session/活动目标后派发，所有窗口立即busy；返回结果按revision重建全部草稿，即使模型JSON未变化也重置其他窗口未提交值。idle不重建排版。报告支持关闭/外部点击/报告优先Escape，原生窗口系统关闭先取消并排队Lua title-close，宿主拆除有显式关闭通道；app Escape保留旧版返回模型值，标题关闭保留本地草稿。切换目标、结束会话、宿主析构均关闭实际窗口。快照provider必须显式提供，尚无正式Editor真实MSE provider，不用空模型替代生产快照。

唯一正式exe首次链接既有Rust原始Lua引擎与原生调用库，新增--script-window-host-check真实Lua双窗口流程。首次fixture只Enter输入但输出绑定Apply导致断言失败，改按真实Apply按钮触发后通过退出0。覆盖按钮收到本地草稿、另一窗口相同模型仍重置、回调报告及Escape优先关闭、系统关闭不直接销毁并携带草稿、全局Escape发送返回值、重启以及新Document清理窗口。两项Lua专项通过0.82s；既有--script-report-check重跑通过。无新增宿主截图人工验收，不宣称全软件smoke通过。来源覆盖802文件，diff检查通过。正式菜单/Editor消息泵接线、真实MSE快照及混合事务、部分控件视觉/精确提交时机仍未完成，整体INCOMPLETE。保存推送dev，保留用户差异、数据和缓存。

### 2026-11-10：真实原生工程MSE只读快照阶段

逐字段承接lua-script-operations.ts buildLuaMseSnapshot，新增原生投影：document/activeLayer、按旧版顺序的layers、frames/loops、range、palette、tilesets、自由瓦片源/实例、项目/本地笔刷、slices和workspace panels。图层样式直接共享project_encode已有完整writeColorOverlay；自由瓦片编码沿既有freejson，不经工程压缩/重读，也不复制画布像素。原生Cel ID转为旧版layerId:frameId。沿旧版共享1048576瓦片像素预算，跳过大资源后仍可包含后续小资源；项目笔刷coverage/colors独立阈值，本地笔刷仅元数据。必须由宿主传入实际本地笔刷与面板状态，不自行扫描磁盘或伪造默认工作区。

真实Rust Lua通过mse读取原生图层、色板、动画、样式、瓦片透明RGB、项目笔刷、带偏移本地笔刷、Unicode切片和隐藏面板。检查身份/旧层序、选择回退与Cel key、共享预算跳过/后续恢复、自由瓦片source/instance以及快照不改revision/history。测试fixture的瓦片尺寸和自由瓦片各帧authority先被模型拒绝，补齐合法数据后两项Lua及project-save专项全部通过1.71s。公共头直接引入WinRT导致GetObject宏冲突，已恢复轻量头，仅快照实现声明共享编码函数。来源804文件与diff检查通过。正式Editor provider/菜单接线、非RGBA颜色模式、MSE混合操作事务与资源分块捕获仍未完成；当前同步元数据/限额资源JSON不冒充大工程延迟优化完成。整体INCOMPLETE，保留用户差异、数据、缓存和失败现场。

修复公共头包含冲突后唯一正式Release构建成功，--script-window-host-check实际退出0；本阶段无新增UI视觉变化，无截图验收。阶段保存推送dev。

### 2026-11-10：MSE切片完整写入与像素混合批次阶段

核对lua-script-operations specFor、selectionFromSpec、slices三操作、workspace-commands-slice与applyResult，接入slices.create/update/remove。支持直接表/位置参数、截断数字、缺失字段回退、边界钳制、名称清理、创建选中与删除选择清理、无目标无操作。预先计算所有批次切片候选并拒绝其余未接入路径，任何参数失败均在首次像素写入前发生；RasterBatch carries SliceState，沿Document现有Edit beforeSlices/afterSlices与像素/表面更改同项提交，一次撤销恢复整个batch，重做保留创建ID。纯切片不构造缺失Cel且不复制像素存储。已登记Native observer抛异常仍保留已提交历史的既有差异，不声称完全复刻React外部observer失败回退。

真实Lua app.transaction混合像素及创建/更新/删除，检查一次历史、范围钳制/选中、Undo/Redo、编码后prepareEditableImport/createEditableDocument重开。失败及缺失ID no-op不改像素/切片/history；纯切片缺失Cel额外检查。初次fixture画布高度误判、空sourceArchive占位导致ZIP拒绝，按真实fixture修正而不改生产边界。正式Release构建和--script-window-host-check退出0，两项Lua专项通过；来源804与diff检查通过。本阶段无UI外观修改/新截图，无完整smoke。其他MSE写入域、正式Editor菜单/真实工作区供给、颜色模式和大工程分块仍未完成，整体INCOMPLETE。保存推送dev，保留用户差异、数据和缓存。

### 2026-11-10：MSE选区设置、清除和反选批次阶段

对照lua-script-operations selectionFromSpec/selection.set/clear/invert、workspace-commands-selection-properties commitSelectionChange/invertSelection及core selectionContains/invertSelectionMask，接入三类选区操作。沿原始顺序预计算各批次候选，mask按Uint8规则截断钳制且长度须匹配，保留255等原始字节；反选继续仅把值1视为选中，不把非零统一成选中。空选区反选/清除及相同选区跳过，保留现有时间轴选择。坐标和mask分配沿原生预算校验，未接入selection.transform仍明确拒绝。

原生RasterBatch复用pixelSelectionEdit历史，与像素/切片共享一项原子提交；仅选区documentChanged=false，不改变工程dirty，不创建缺失Cel。准备历史和替换值后再安装，提交前失败恢复选区与其他数据。真实Lua测试覆盖设置/字节钳制、相同值no-op、反选/清除/空选区、timeline context、纯选区dirty及Undo/Redo、像素/选区/切片三者混合一次撤销重做、畸形mask拒绝不改已有批次。测试原先要求混合内容撤销清dirty，与原生现有undo始终标记修改不一致，已改为验证数据恢复，不擅改全局dirty规则。

正式Release构建成功，--script-window-host-check实际退出0，两个Lua专项通过0.84s，来源804及diff检查通过。无UI视觉改动/新截图，无完整smoke。原生Editor选区属性UI重置、selection.transform内容移动、其他MSE操作域、正式菜单/真实宿主供给和大工程分块仍待完成，整体INCOMPLETE。阶段保存推送dev，保留用户差异、数据和缓存。

### 2026-11-10：MSE色板创建、更新和移除批次阶段

对照lua-script-operations specFor/colorValue及palette三操作、workspace-palette、workspace-commands-color和palette-layout。创建保留重复/透明颜色独立ID，填首个空槽，无显式颜色时使用前景色；支持是否选中新颜色的结果API参数。更新承接位置参数颜色、通道截断钳制、原始名称和匹配角色色更新；移除仅隐藏显示槽并清理选择，保留资源。预先计算顺序候选状态，缺失更新ID在任何像素写入前拒绝。PaletteState与像素/切片/选区使用同项历史，Undo/Redo保留身份；纯元数据不创建缺失Cel。修正混合历史遇到切片提前返回造成像素内存漏算，并计入色板元数据。

唯一正式Release构建成功，真实Lua两项专项通过0.86s，--script-window-host-check退出0。覆盖混合一次提交、透明重复颜色、角色色/名称/槽位、无操作、错误ID无部分写入、未锁定创建不选中、Undo/Redo及保存重开。无UI视觉修改/新增截图，无完整smoke。palette.extract与同步像素替换尚未实现且明确拒绝；Client/PendingInvocation仍使用默认选中新色，结果API参数尚待正式Editor偏好接线。全Palette域、正常UI脚本入口与其他迁移仍INCOMPLETE。保留用户差异、数据及缓存。

用户本次明确确认：Hybrid选区浮动采用预览与提交一致，并保留大画布延迟优化。此为后续实现依据，本色板阶段不声称已完成该延迟路径。

### 2026-11-10：MSE色板提取与异步偏好传递阶段

核对lua-script-service applyResult先像素后MSE操作、lua-script-operations palette.extract及workspace-palette applyPalette。候选栅格逐批应用变化/表面替换，提取当前帧合成画面；扫描线顺序去重并忽略全透明，limit截断钳制1..4096，默认256。按分段合成控制输出临时内存且取满即停。append使用全部资源（含隐藏与重复），每次追加保留要求的颜色出现次数；匹配资源按存储顺序各复用一次，不足时创建独立ID。槽位规范化与匹配前景色的选择随像素共享批次历史，后续坏参数在首次写入前拒绝。移除workspace预检中的重复候选计算，保留实际applyRasterResult写入前预检。Client/PendingInvocation可传递创建选择偏好，正式Editor设置接线仍未完成。

Release正式程序构建成功，--script-window-host-check退出0。两项Lua专项通过0.87s，覆盖混合像素取色、扫描线顺序、隐藏与重复资源append、重复append额外出现、Undo/Redo、错误操作无部分写入以及异步Client未锁定创建。初次测试错误假设重复append无操作，按旧版明确数组拼接语义纠正；构建期间源码修改的旧目标曾被复用，更新测试时间戳并完成重新编译后通过。无新增UI视觉变化/截图，无完整smoke。同步像素替换、非RGBA、正式菜单与宿主供给仍INCOMPLETE；分段合成仅控制临时输出，结果预处理仍同步，不声称大画布UI延迟问题已全部解决。保存推送dev，保留用户差异、数据和缓存。

### 2026-11-10：MSE普通RGBA色板同步替换批次阶段

对照workspace-commands-color updatePaletteColorWithSynchronization/applyColorReplacementTarget，按帧优先、旧图层从底到顶遍历，先共享像素去重再锁定过滤，包含隐藏层且不受像素选区裁剪。批次先栅格再MSE，连续改色候选沿前次结果执行；同步后的extract使用候选Timeline。原生RasterBatch携带其他owner前后表面，Document同项Edit surfaceChanges和色板/选区/切片共同提交，准备历史和替换值后再安装，提交前失败回退。新增256MiB候选资源与历史预算检查，涵盖像素、蒙版与瓦片集；仅实际开启同步且含更新时复制候选，不影响普通色板路径。

真实Lua专项覆盖同批次画像素后改色、连续改色、链接帧、隐藏/锁定层、多owner Undo/Redo、随后取色及保存重开。普通RGBA路径已接入，瓦片/自由瓦片资源同步仍明确拒绝，未以缓存修改冒充资源事务。候选Timeline复制和逐像素规划仍同步，属于待优化成本，不宣称全大画布延迟已解决；正式Editor菜单/偏好接线、非RGBA以及全部迁移仍INCOMPLETE。无UI视觉变更/截图，无完整smoke。保留用户差异、数据与缓存，阶段完成验证后保存推送dev。

本阶段最终验证：唯一正式Release构建成功，两项Lua专项通过0.92s，--script-window-host-check实际退出0，来源覆盖804文件与diff检查通过。

### 2026-11-10：同步替换整块安装与空Cel边界阶段

沿workspace-commands-color共享像素替换及lua-script-service先栅格后MSE语义，将候选每个匹配像素调用Timeline.setPixel改为构造完整owner结果并集中安装，避免反复链接解析和图层缓存失效。仅重命名及非颜色对象fallback不再创建完整同步候选。空活动Cel有实际批次像素/表面变化时才创建临时候选Cel，参与同步后排除临时owner辅助安装，交由Document保留正式身份；无像素的色板操作不创建空槽。新增真实Lua空Cel同批次画色/改色及撤销重做回归。

唯一正式Release构建成功；构建中测试运行占用旧exe导致LNK1104，待测试结束后重新链接成功，随后才运行最终两项Lua专项通过0.97s；窗口宿主专项实际退出0。既有链接、隐藏/锁定、多owner、取色和重开继续通过。无UI视觉变化/新截图，无完整smoke或大工程性能计时，不把移除逐像素重复开销宣称实测提速。完整候选复制、同步预处理、瓦片资源和其他迁移仍INCOMPLETE。来源804文件及diff检查通过，保存推送dev，保留用户差异和数据。

### 2026-11-10：MSE帧时长与循环元数据批次阶段

对照lua-script-operations resolveFrameId/loopOptions和四种动画元数据操作、workspace-animation-loop-editing以及animation-loop-sections。帧支持真实ID和截断的1基序号，未匹配字符串沿旧版回退首帧，duration钳制1..60000且相同不提交。循环支持创建/更新/移除、指定ID和生成ID重做稳定、正反范围规范化、名称trim后64个UTF16单元、repeatCount 1..9999/null。脚本更新沿loopOptions重新应用默认值；缺失更新/删除无操作、空ID拒绝。

新增批次动画候选和原生duration历史载荷，复用beforeLoops/afterLoops与现有applyFrameEdit；与像素/切片/选区/色板同项提交。纯动画元数据不创建缺失Cel或复制像素。安装前准备历史/替换数据，提交前失败回退；历史内存计入帧ID/时长，时长Undo/Redo按已记录帧顺序线性恢复。真实Lua测试覆盖混合批次、反向范围、默认重置、名称和参数钳制、No-op、无效帧拒绝无部分修改、Undo/Redo及编码重开。

仅动画元数据，未接入animation.setFrame/setCelSurface/play；修改正在播放循环时正式Editor停止/清理播放状态仍待接线，不宣称完整动画域完成。无UI视觉变更/截图，无完整smoke；全迁移仍INCOMPLETE。验证完成后保存推送dev，保留用户差异、数据与缓存。

公开API补核：mse_api.rs没有公开mse.animation.setFrameDuration，首次fixture因调用该不存在方法失败。已改用旧lua_api.rs ScriptFrame.duration秒属性（引擎换算毫秒后排队同名内部操作），真实两项Lua专项通过0.94s，Aseprite属性0.25秒→250ms和撤销一并通过；未向Lua新增旧版不存在的方法。

本阶段最终：唯一正式Release构建成功，最新--script-window-host-check退出0，真实Lua两项专项通过0.94s，来源804文件与diff检查通过。

### 2026-11-10：脚本多帧解析性能与稀疏时间轴回归

沿lua-script-operations resolveFrameId语义，一次建立帧ID索引，替代每项duration操作从首帧扫描，保留真实ID匹配、数字序号和未匹配字符串回退。新增真实Rust Lua 1024帧同事务时长修改及反向输入循环范围，活动帧和全部时间轴均无Cel，验证一项历史、零像素修改、无Cel创建、全部值/范围、Undo/Redo。唯一正式Release构建成功，两项Lua专项通过0.99s；本机单次结果应用42ms，不含快照和Lua执行，无前后基准对比，不据此宣称整体延迟解决。无UI变化/截图，无完整smoke；其他迁移继续INCOMPLETE。阶段验证后保存推送dev，保留原用户差异、数据和缓存。

最新正式--script-window-host-check实际退出0，来源804文件和diff检查通过。

### 2026-11-10：脚本非活动帧Cel图像与位置批次阶段

对照lua-script-operations animation.setCelSurface和原始Rust lua_api flush_pending/reads_and_writes_non_active_frame_cels，接入Aseprite兼容cel.image/position写入生成的内部操作。候选Timeline先应用批次栅格，再按MSE顺序校验layer/frame/Cel ID及before尺寸、偏移、像素；after沿原生owner表面替换和零storage origin适配，链接帧继续共享owner。复用已接入RasterBatch owner替换事务，与活动帧画像素、帧时长及其他元数据同项提交，后续取色读取候选，活动共享owner修改后更新target基线。非RGBA/非普通栅格继续明确拒绝，不修改瓦片缓存冒充资源事务。

真实Lua覆盖非活动Cel像素/位置、活动像素与duration混合一项历史、Undo/Redo、保存重开、后续坏操作拒绝无部分写入、错误Cel ID前置拒绝及链接帧owner/撤销重做。正式Release构建成功，--script-window-host-check退出0；最终专项结果另附。无UI视觉变化/截图，无全软件smoke；候选Timeline仍同步复制，普通正式Lua菜单/provider、播放与其他域仍待完成，整体INCOMPLETE。保留用户差异、数据与缓存，验证后保存推送dev。

最终两项Lua专项通过1.02s，来源804文件及diff检查通过。

### 2026-11-10：仅其他帧Cel修改的活动帧隔离修复

对照旧setCelSurface只针对指定owner的语义，修复候选结果无条件携带活动表面造成空活动Cel被创建/既有storage origin归零的问题。仅活动owner实际更改才提交活动表面，其他owner使用同项Edit表面历史和提交前回退，保持元数据混合批次。新增真实Lua显式事务回归：空活动槽保持不存在、既有活动稀疏存储坐标保留，其他帧像素/位置提交和Undo/Redo正确。

专项首次发现直接在显式事务外写非活动Cel触发原始legacy Rust lua_api.rs:747 RefCell already mutably borrowed panic，登记为未修复引擎缺口；本回归改为显式事务以独立验证原生owner安装，不宣称该panic已解决。唯一正式Release构建成功，窗口专项退出0；无UI视觉修改/截图，无完整smoke。其他迁移与引擎缺口仍INCOMPLETE，保留用户差异和数据。

最终两项Lua专项通过1.08s，来源804文件与diff检查通过。阶段保存推送dev。

### 2026-11-10：原生Lua事务外Cel位置借用冲突修复

定位原lua_api.rs ScriptCel.position setter持有known Cel可变借用后调用ensure_pending，checkpoint又读取同一RefCell，导致事务外panic。原生build.rs生成带精确单片段守卫的适配源码：先短期只读比较并释放，创建检查点，再可变借用写入；显式/隐式事务及无变化no-op语义不变，legacy源码保留原样。生成源码沿用原mse_api与moon-phase测试资源绝对路径，并补Cargo显式rerun依赖。不是重写引擎。

前阶段登记的原生事务外位置panic在本阶段修复，直接像素/位置回归改回无显式事务并通过，Undo/Redo和活动Cel隔离继续通过。生成目录最初使Rust原测试include_str相对路径失效，调整为原资源绝对路径后Rust引擎测试通过14.80s，两项C++ Lua专项通过1.02s；最终正式产物验证另附。无UI视觉修改/截图，无完整smoke。其他迁移仍INCOMPLETE，保留用户差异、数据与缓存。

最终正式Release重建成功，最新窗口专项退出0，两项C++ Lua专项通过1.09s，来源804文件与diff检查通过。阶段保存推送dev。


### 2026-11-10：脚本色板同步缓冲区与结果转移优化

沿用旧版 lua-script-operations palette.update 的顺序、共享 owner、锁定过滤及事务语义。原生 LinkedPixelStorage 非 const 下标访问每次递增原子修订号，密集替色原路径每个像素重复触发；现在一次取得候选表面的 vector 可变引用后遍历，整次替换只触发一次修订更新。预检完成的 slices/selection/palette/durations/loops 和 owner before/after 表面移动到提交批次，移除额外深拷贝，保持全结果预检后才写入。

对照 Aseprite src/filters/replace_color_filter.cpp 的直接像素缓冲区遍历方式，仅审阅性能方案；该模块为 EULA，不复制代码，继续使用原生既有 vector 接口。新增真实 Lua 128×128、三链接帧、连续两次密集替色回归，检查无关透明像素、全部共享像素、色板元数据、一项历史及 Undo/Redo。两项 Lua 专项通过1.08s，正式 Release 重建成功，最新 --script-window-host-check 退出0，来源804文件和 diff 检查通过。未做前后性能基准，不声称全软件卡顿已解决；同步候选复制、大画布延迟路径及正式 Editor Lua 接线仍有缺口，整体 INCOMPLETE。用户确认的 Hybrid 预览与提交一致及大画布延迟优化继续保留。保留用户差异和数据，本阶段提交推送 dev。


### 2026-11-10：脚本动画切帧与跨帧取色阶段

对照旧 lua-script-operations resolveFrameId/animation.setFrame 和 lua-script-service focusScriptTarget/applyResult，接入 MSE animation.setFrame。全结果预检解析精确帧 ID 或截断的一起始帧序号，非匹配字符串沿旧版回落第一帧，越界先拒绝；切帧不创建历史或 Cel。操作计划保留批次最终选择；每个批次开始恢复脚本原始 layer/frame，栅格仍修改原始目标，后续 palette.extract 使用该批次操作选择的帧，原始暂存像素只对原始帧或同一共享 owner 生效。最终 app.activeFrame 继续覆盖 MSE 选择，创建图层/文档仍沿既有后续顺序。原生只发布批次最终选择，避免同步批次中的无效中间重绘；播放状态接线仍待正式宿主完成。

真实 Lua 验证切帧无历史、app.activeFrame=nil 保留 MSE 选择、显式最终覆盖、两批栅格写入原始目标及其 Undo/Redo、越界预检无部分写入，以及 setFrame{frame=2.9} 后取色不混入原始帧暂存像素并支持重做。两项 Lua 专项通过1.11s，唯一正式 Release 重建成功，--script-window-host-check 退出0，来源804文件及 diff检查通过。本阶段无UI外观调整，无全软件smoke；正式 Editor 菜单/provider/pump、animation.play及其他迁移仍 INCOMPLETE。保留用户差异和数据，阶段提交推送 dev。


### 2026-11-10：脚本动画播放宿主回调通道阶段（正式 Editor 未接入）

对照旧 lua-script-operations animation.play、workspace-commands-animation-playback setAnimationPlaying/playAnimationLoopSection 和 workspace-animation-loop-editing update/delete，新增 PlaybackHost，贯通 applyRasterResult/applyWorkspaceResult/receiveWorkspaceResult、PendingInvocation、Client 和 ScriptWindowHost。播放默认true，playing非boolean回落false，非空字符串ID走循环段播放，missing/全disabled循环也送宿主处理停止清理。无宿主的显式play在全结果预检前置拒绝，不能静默当成功。每批保留播放、循环变更和切帧顺序；循环播放携带操作时的段快照及首个可播放帧，避免后续update/remove使宿主读取错误版本。循环update沿旧map更新所有重复requested ID。仅实际update/remove通知宿主，由宿主判断是否影响当前播放段/tag周期。宿主必须同步、不抛异常、不替换或销毁Document；回调发生在批次内容提交后。

真实Lua专项验证默认/暂停/错误类型、无历史、同批创建播放修改再播删除及missing、调用时段快照、切帧播放交错、缺失宿主无部分像素写入、后续非法操作无播放副作用、Client异步失败恢复与转发。两项Lua专项通过1.19s，正式Release重建成功，最新--script-window-host-check退出0，来源804文件及diff检查通过。窗口检查只证明已有对话宿主不回归，并非真实Editor播放验收。

此阶段仅完成回调边界，正式Editor播放计时器/模式/暂停遍历/循环取消仍未接线；普通play按once/tag模式可能改变播放帧，规划时尚无宿主模式状态，故同批普通play之后extract的模式相关取色仍为迁移缺口。后续应接真实Editor状态并补齐该组合，不能把此阶段称为完整animation.play迁移。原生同步提交后执行宿主回调不提供宿主异常回滚。正式脚本菜单/provider/pump与其他域仍INCOMPLETE。保留用户差异、数据及缓存，阶段保存推送dev。


### 2026-11-10：真实 Editor 脚本播放适配及运行验收阶段

新增 Editor::applyScriptPlayback，把上一阶段 PlaybackRequest 适配到现有 Editor togglePlayback、playing_/playbackDue_、loopPlayback_ 和 playbackTick。普通播放保留原有 once/all/tag 开始、暂停续播行为，脚本请求不受时间轴隐藏限制。循环播放使用操作时 section 快照和首个 enabled 帧初始化已有循环遍历，不新增计时器；missing/全 disabled 清空播放、起点与tag周期。LoopChanged仅在当前循环或tag周期匹配时停止清理；拒绝其他Document和非活动编辑器。没有新菜单布局/素材。

新增正式 --script-playback-check，通过真实Rust Lua结果调用实际Editor适配，检查隐藏时间轴开始且无新增历史、原有timer推进、暂停、reverse循环起点、暂停续播、update停止清理、missing停止和其他Document拒绝。正式Release首次构建因新增include顺序导致Windows GetObject宏与WinRT JSON方法冲突，调整editor_smoke包含顺序后重建成功。新增专项退出0；已有--playback-floating-check（含原有loop/delete路径）、--script-window-host-check均退出0，两项Lua专项通过1.13s，来源804文件和diff检查通过。

适配已在正式exe运行验证，但当前只由专项调用；正式脚本菜单/runtime/provider/pump尚未连接到此适配，不能称用户已能从菜单运行脚本控制播放。普通play的once/tag规划后取色和其他域仍有缺口，整体INCOMPLETE。保留用户差异、数据和缓存，本阶段保存推送dev。


### 2026-11-10：正式文件菜单脚本入口及原生宿主贯通

沿旧 AppMenuBar 文件/脚本、useAppScriptRuntime 生命周期，将 Runtime/Client/ScriptWindowHost 接入普通启动。脚本列表后台发现，保留旧文件夹菜单对象，弹出时读取缓存并刷新后台列表；30ms UI timer 每次以3ms capture预算/非阻塞future轮询运行，空闲不做全工作区refresh。后台读取实际本地笔刷目录，快照提供实际面板可见性/dock和工程资源；新文档走addProject，播放走上一阶段实际Editor适配，Escape走原生host队列。菜单点击先提交浮动选区，再排队，捕获文档/图层/帧身份，后台读取期间切换目标不运行到新槽；非模态会话期间拒绝重复启动。退出先停止timer/窗口/Client再销毁Runtime。

新增 --script-entry-check 从实际动态菜单行触发，真实Lua像素修改+print报告+非模态原生Dialog，按钮回调继续改像素并关闭，验证重复运行排除及Undo/Redo。首次构建因验收访问不存在caption字段失败，改按Widget脚本ID定位，增量正式Release成功。新增菜单专项、原有窗口专项、实际Editor播放专项均退出0，两项Lua专项通过1.12s，来源804文件和diff检查通过。尚未新增截图/人工视觉验收，菜单/对话框视觉完整性不据此升级。

普通启动现在可从文件/脚本运行已接入操作；仍非完整Lua兼容声明。扩展贡献命令的菜单位置/过滤、完整控件时序、普通play模式相关同批extract、非RGBA与其他MSE操作继续有缺口；本地笔刷快照读取失败会阻止请求并报告，首次Runtime初始化仍等待worker初始化，目录扫描异步。菜单打开展示已有缓存，后台发现的新项下次打开更新；当前未自动实时替换已打开列表。整体INCOMPLETE，保留用户差异/数据/缓存，阶段保存推送dev。


### 2026-11-10：正式脚本入口后台加载隔离及失败恢复

修复上一阶段pumpScripts在笔刷future未ready时整体return，导致独立脚本目录发现/报告/会话窗口也不被接收的问题。移除启动时不必要的笔刷扫描，只在运行时请求；未ready时继续Client/Host泵，仅排队执行等候笔刷元数据。runScript不覆盖未完成future，避免std::async future析构在UI线程隐式join。沿旧useAppScriptRuntime独立列表/报告生命周期，不改变脚本操作语义。

扩展正式--script-entry-check：注入未完成promise，证明列表发现仍完成；排队后替换Document再完成promise，验证不执行到新文档；真实Lua抛错显示报告，Escape清除，再运行脚本成功修改像素。正式Release重建成功，入口专项/窗口专项/Editor播放专项均退出0，来源804文件及diff检查通过。未改变UI外观、未做全软件smoke或全软件性能声明。旧扩展菜单贡献、未迁移MSE域、普通播放后取色模式等缺口仍INCOMPLETE，保留用户差异/数据/缓存，阶段保存推送dev。


### 2026-11-10：脚本活动图层刷新与延迟目标保护验收

对照旧 lua-script-service.ts applyResult 最终 activeLayerId 经 workspace.selectLayer 更新界面，修复正式 Editor::pumpScripts 只检测文档身份/content/history/frame 而漏掉 layer 的问题。Document::selectLayer 不增加像素和历史版本，故仅切图层的 Lua 结果也必须按图层身份变化刷新；空闲泵仍不刷新。

正式 --script-entry-check 新增同文档在笔刷延迟期间切图层/帧取消排队、只切活动图层刷新且不增加content/history版本，以及三次菜单重建保留唯一原文件夹命令。测试构造先纠正原生新建层插入前端、Lua快照按旧版底到顶排序两处目标选择错误，并移除对空白1×1 Cel的越界测试读取；均未改变产品层序语义。正式Release重建成功，最终入口专项退出0。两项Lua专项通过1.20s，来源804文件及diff检查通过。没有UI外观调整或截图验收，不代表全软件性能或迁移完成；创建文档的正式入口验收、扩展贡献菜单、其他MSE域和普通播放后取色模式缺口仍待完成。保留用户差异、用户数据及缓存，阶段保存推送dev。


### 2026-11-10：MSE 工作区栏目三个操作完整接入阶段

对照旧 lua-script-operations.ts workspace.setPanel/showPanel/hidePanel、specFor 和 useAppWorkspaceLayout.ts setPanel 监听，迁移十个栏目 ID、位置参数/对象参数、show/hide覆盖visible、仅boolean生效、无效dock忽略及未知ID报错。新增 PanelHost，贯通结果全量预检、PendingInvocation、Client、ScriptWindowHost 和正式 Editor；复用栏目菜单命令、dockColumn 与原有偏好/工作区保存，显隐/停靠不创建文档历史。混合播放和栏目请求统一按操作顺序派发，发生在批次内容提交后、创建工程接管前；宿主不可替换/销毁源Document。原有宿主异常不回滚已提交内容的限制仍适用。

自由瓦片实例栏目沿 WorkspacePanels.tsx 自动显隐约束，集成模式或无实例时不强制展示、不改变用户布局模式。普通Lua输入仍要求可编辑栅格活动目标；此阶段不冒充已支持自由瓦片目标脚本。正式入口新增九个可用普通栏目的hide/show和四种dock实际状态检查，以及无实例栏目的可用性；补充脚本改变栏目后创建新文档时原tab/像素保留、新tab激活及新像素验收。Lua专项覆盖全部ID、参数默认/忽略、混合顺序、缺失宿主、非法后续操作无部分写入和异步Client转发。负例先纠正测试fixture透明像素含RGB时错误地与0比较。唯一正式Release构建成功；--script-entry-check（含栏目/新工程接管）、--script-window-host-check、--script-playback-check均退出0；两项Lua专项通过1.15s，来源804文件与diff检查通过。

没有新绘制素材或布局重设计，未进行截图/人工视觉验收。其他MSE域、扩展贡献菜单、播放模式相关取色、非RGBA及Hybrid大画布延迟路径等仍有缺口，整体迁移INCOMPLETE。保留用户差异、数据、缓存，阶段保存推送dev。


### 2026-11-10：MSE 样式五操作事务与共享剪贴板迁移

对照 lua-script-operations.ts styles.apply/copy/paste/clear/setEnabled、workspace-commands-layer-properties.ts 和 core/layer-styles.ts，复用现有工程readColorOverlay规范化（数字转换、边界、颜色、全部效果），公开共享JSON入口供脚本调用，工程解码原路径不变。脚本规范化样式不保留未规范化的raw字段。按原生结构历史端点保存样式元数据，与同批像素、选择、色板、动画共用一次撤销；全结果预检目标/样式，未知图层及非法样式不部分写入；排除adjustment目标，启停只处理已配置效果。非活动图层按明确ID处理，元数据修改不创建缺失Cel。

新增StyleClipboardHost贯通PendingInvocation/Client/ScriptWindowHost，正式Editor使用已有copiedLayerStyle_/layerStyleClipboard_，复制无样式目标不清空原剪贴板，copy不新增历史；同批复制保留操作时样式，即使后续清除/停用。真实Lua测试混合Undo/Redo、五操作及默认值、位置参数、数值转换、非法预检、缺宿主、保存重开、非活动图层、空Cel和异步剪贴板。组合检查补齐同批样式修改后的palette.extract候选合成，确保取色使用新样式；不含样式的脚本不复制样式元数据或读取剪贴板。正式入口新增脚本copy到原生菜单paste、原生copy到脚本paste及混合撤销验收。首轮构建因specFor自动替换误入palette扫描出现编译失败，已移除误插代码；取色回归断言按既有色板语义改查可见顺序中的颜色，保留隐藏资源，不能以entries总数判断提取结果。唯一正式Release重建成功；最终--script-entry-check退出0（含样式事务及原生/脚本剪贴板互通），--script-window-host-check与--script-playback-check退出0，两项Lua专项通过1.18s，来源804文件与diff检查通过。

仍有其他MSE域、扩展贡献菜单、普通播放模式相关取色、非RGBA和Hybrid大画布延迟等缺口，整体INCOMPLETE。沿用宿主回调发生在批次提交后的既有约束，不承诺宿主异常回滚。没有新UI绘制/素材或截图验收。保留用户差异、数据、缓存，阶段保存推送dev。


### 2026-11-10：密集像素提交与历史回放修订开销优化

对照旧 lua-script-service.ts 像素批次及 core/history.ts 回放语义，将原生脚本像素提交、失败回退和通用像素历史直接/坐标映射路径改为每次取得一次可写 vector，再执行全部像素/行写入，消除 LinkedPixelStorage 每像素下标或每span begin触发的原子修订更新。共享owner存储与缓存失效仍保留，历史顺序、坐标裁切和脏范围不变。复核 Aseprite src/filters/replace_color_filter.cpp 直接缓冲区遍历，模块头声明EULA，仅审阅方案，未复制源码。

新增真实Lua 128×128密集修改、三链接帧、一项历史、提交/Undo/Redo修订增长上限、原始透明RGB恢复、共享帧以及原生保存重开检查。首次保存回归暴露测试fixture持有空source ZIP（非产品回归），明确清除该虚假源后通过。正式Release重建成功，--script-entry-check退出0；两项Lua专项通过1.82s。通用历史专项结果另附。无UI修改或截图验收，无前后耗时基准，不据此宣称整体卡顿解决。脚本图层结构域仍待完整事务适配，Hybrid大画布延迟及其他迁移继续INCOMPLETE；保留用户既有差异、数据和缓存，本阶段提交推送dev。

最终通用 document-raster-history 专项通过2.00s，来源804文件及diff检查通过。


### 2026-11-10：MSE layers.update 完整属性入口迁移阶段

对照 lua-script-operations.ts layers.update/specFor/finiteNumber/stringValue/booleanValue、workspace-commands-layer-properties.ts setLayerPropertiesWithBlend/applyLayerName、workspace-commands-layer-structure.ts moveLayerBy、core/animation.ts syncActiveAnimationLayer、linked-layers.ts 和 lua-script-service.test.ts 混合事务/失败恢复，接入名称、透明度、混合模式、锁定、显隐、标记色、原样说明与位置。名称ECMAScript trim且空名跳过整组属性；own/group锁过滤视觉属性，组锁禁止传入false的整组属性更新，visible与移动继续独立按旧顺序；位置只更新当前操作帧resolved owner及text origin/transform，不移动蒙版/像素选区或独立其他帧。链接层传播标记色，独占网格瓦片集随层改名，共享瓦片集保留名称。

layers.update存在时，沿现有候选Timeline预检后，使用原生完整Timeline历史与显式空槽display geometry端点合并像素/样式/色板/选择/帧时长/循环段，支持多批原目标重聚焦、缺失Cel的内容属性同步、UndoRedo和保存重开；仅元数据/位置不创建缺失Cel。全结果预检仍先于写入，原目标被前批锁定导致后批拒绝。旧版会在前批完成后才报错；原生沿已采用的全结果预检边界提前拒绝，避免部分写入。256MiB保守预算覆盖候选、资源/蒙版和保留计划；不含layers.update的普通脚本保留原增量路径。此处同步完整状态复制仍为性能成本，不冒充大工程延迟路径完成。

真实Lua覆盖位置/对象参数、Unicode名称默认、raw说明、no-op、混合像素、锁定边界、非法色前置拒绝、切帧后属性/时长/色板、多批像素、非活动文本与组锁、链接标记色与独立anchor、独占/共享瓦片集、空Cel geometry、撤销重做和保存重开；新增正式Editor入口属性/像素混合撤销验收。构建首轮UTF16名称转换误用to_hstring导致编译失败，改用hstring构造；测试先修正无变化第二批错误多撤销一次、锁定组传false应拒绝属性的预期。最终正式构建与检查结果后附。无新UI绘制、无截图验收，不宣称其他layers.create/duplicate/remove、笔刷外部宿主和所有迁移完成。用户既有差异/缓存/数据保留，阶段验证后保存推送dev。

最终唯一正式Release构建成功；--script-entry-check（含真实属性/像素混合事务及UndoRedo）、--script-window-host-check、--script-playback-check均退出0。最终两项Lua专项通过2.04s，document-raster-history通过1.79s，来源804文件及diff检查通过。无人工视觉/截图验收，整体仍INCOMPLETE。


### 2026-11-10：MSE 图层创建／复制／删除结构事务阶段

对照旧版 lua-script-operations.ts 三个入口、workspace-commands-layer-creation.ts 插入位置/激活上下文、workspace-commands-layer-structure.ts duplicateLayers/deleteSelectedLayers、workspace-commands-layer-properties.ts renameLayer/setLayerOpacity。以1×1 detached Document壳承载预检候选，直接运行现有 addLayerInGroupContext/duplicateLayerRows/deleteLayerRows，避免复制真实文档历史或分配整张画布。复用跨帧Cel、链接层、蒙版、网格/自由瓦片资源克隆和删除规则；保留创建名称trim、当前帧透明度、全部帧1×1空Cel、选中行插入、删除锁和最后一层无操作。脚本连续操作使用更新后的活动图层，跨批重聚焦原目标；原目标已删时后续批或app创建层在全结果预检拒绝。删除最后瓦片层后按原顺序隐藏tileset面板；普通图层删除不触发此副作用。

完整Timeline历史补上活动图层/帧、组、时间轴选择/锚点及显示geometry端点，混合像素与属性共用一项事务；普通像素脚本仍保留增量路径。候选/资源/蒙版/保留计划受256MiB保守预算限制，但完整状态同步复制仍有开销，不宣称大工程延迟路径已完成。真实Lua新增连续create→update→duplicate、全部帧稀疏空图、原始链接帧复制、失败原子性、原目标删除后批拒绝、资源/蒙版克隆删除UndoRedo、最后一层no-op和保存重开；正式Editor入口新增结构混合事务及UndoRedo检查。初轮失败为测试误将非目标层当原目标，修正测试前提后专项通过。最终构建和检查结果后附。无新UI绘制/截图验收，其他迁移和整体目标仍INCOMPLETE。保留用户差异、数据及缓存。

最终唯一正式Release构建成功；Lua runtime/invocation与document-raster-history三项通过3.90s，正式--script-entry-check退出0（含新增结构事务），--script-window-host-check/--script-playback-check退出0。来源804文件覆盖及diff检查通过；整体对齐仍INCOMPLETE，无人工图像验收。蒙版fixture先按产品空白层限制拒绝，改为已有蒙版导入；瓦片专项后续脚本显式重新选择raster入口，符合当前脚本启动限制。


### 2026-11-10：MSE ui.notify 原生宿主完整链路

对照 lua-script-operations.ts ui.notify/specFor/stringValue 及 platform_scripts/mse_api.rs 实际公开方法，接入对象和位置参数、message/text/value首个非null值、仅字符串（false/空字符串阻止后备且清空状态）、Unicode与原始空白。不引入Toast或模态弹窗，复用原生status；消息宿主在全结果预检时验证，按批排队，不进入文档历史或撤销重做。PendingInvocation→Client→ScriptWindowHost→Editor完整透传，Editor使用弱引用入队，在本轮pump完成结果处理和新工程接管后交付最后一条消息，适配旧版setTimeout(0)，不阻塞事件循环。

真实Lua覆盖多通知顺序/参数、像素混合事务/Undo、无宿主或后续非法操作不写像素不发通知、跨文档接管与异步客户端。正式Editor入口检查Unicode状态和清空。选区transform核对已确认旧版移动保留pending浮动内容而后续翻转复用；当前脚本候选仅稳定状态，不能强行提交冒充迁移，本阶段继续登记未完成。无UI布局修改，无截图验收；整体迁移仍INCOMPLETE。最终构建与检查后附。

最终正式Release构建通过，Lua runtime/invocation两项通过2.19s（含跨工程通知），--script-entry-check、--script-window-host-check、--script-playback-check均退出0；来源804文件与diff检查通过。无截图/人工视觉验收，整体INCOMPLETE。


### 2026-11-10：Hybrid 延迟预览按可见 texel 读取

对照旧版 workspace-commands-selection-move.ts 的previewDeferred阈值、core/tilemap引用变换语义及用户明确采用的“预览与提交一致”。发现原生每次区域输出仍用cellPixels生成完整瓦片，资源补丁遇旋转/翻转也分配整块scratch，即使视口只显示一个像素。改为局部补丁连续行直接copy，共享源补丁和原始/外部资源按既有sourcePoint只读取可见texel，移除这一路径逐格整块分配/转换；原Catalog索引、候选资源补丁、dirty和提交语义不变。Aseprite缓存src/render/render.cpp头声明MIT，核对clip-before-pixel区域策略，仅审阅方案无源码复制。

新增256×256大瓦片/512×256画布、旋转翻转共享源、1像素视口、跨格/画布边界裁切、补丁复用和预览不写权威、commit等于预览、UndoRedo检查。既有Hybrid链接、多源、空引用、重复模式及采样变换专项一并通过0.34s。该阶段改善拖动区域输出，采样提交仍含dense转换，其他迁移也未完；不声称Hybrid全部大画布延迟或整体卡顿已解决，无前后耗时基准/人工视觉验收。正式构建及最终检查后附。

最终唯一正式Release构建通过，tilemap-document与document-raster-history专项通过2.16s；正式--tileset-management-check --grid-transform-entry-only退出0，来源804文件和diff检查通过。整体仍INCOMPLETE，保留用户差异和数据，阶段保存推送dev。


### 2026-11-10：Hybrid 延迟浮动按单元格提交

沿旧版 core/tilemap-document.ts beforeByCell/afterByCell及Hybrid editedTiles按索引顺序更新共享源的处理，把原生applyPixelEdit已有单元格核心提取为applyCellPixelEdits，所有dense入口仍调用同一核心（排序/去重/Edit anchor保持）。Hybrid deferred的非整格采样提交仅捕获源/目标/重复包裹范围涉及的raw cell before/after，画布外像素恢复原值，直接接既有增量TilemapPixelHistory资源快照与所有引用cache patches，消除deferred→dense预览、全画布遍历以及两张全网格渲染缓冲。整格移动继续原精确引用事务，模式与锁/链接前检不放宽；失败保留浮动状态，资源ID守卫沿用，选择与UndoRedo仍在同一事务。

256×256共享源测试补充提交存储revision增长上限，以防回退到逐像素权威修改。现有Hybrid mask/scale/rotation/shear/quad/repeat、foreign/null/ref-only/链接/取消/资源与历史回归继续使用。资源完整快照、grid元数据复制及共享源所有受影响cache patches仍存在，不宣称提交全零分配或整体迁移完成。无人工视觉/截图验收，最终构建与检查后附。

最终正式Release构建通过（公共头变化触发较长全量编译）；tilemap-document及document-raster-history两项通过2.06s，正式--tileset-management-check --grid-transform-entry-only退出0，来源804文件和diff检查通过。整体INCOMPLETE，无截图/人工视觉验收；本阶段保存推送dev。


### 2026-11-10：MSE 网格瓦片事务

依据旧版 lua-script-operations.ts 四个 tiles 操作、workspace-commands-layer-creation.ts、workspace-commands-tilemap.ts 与 core/tilemap-document.ts，接入 createSet/createLayer/place/edit。完整结果先规划 detached Timeline；混合像素、资源和图层创建共用批历史，失败不留下早期写入。独立资源 columns=1、非内容历史；图层创建沿用原生分组插入，设置 Hybrid 与瓦片选择并请求已有面板宿主显示；不可共享的未绑定资源按旧版捕获创建失败。放置解析显式层/帧、foreign引用、翻转旋转、clear前资源校验、链接owner；编辑沿用瓦片采样/写入并更新共享网格及自由瓦片缓存，接受packed/结构色/RGBA字节（Uint8ClampedArray ties-to-even）。保持旧版结果最终app焦点覆盖，测试显式选回瓦片层读取，避免把恢复后的栅格层误当网格。

真实Lua覆盖资源历史/dirty、混合事务、反向引用、RGBA转换、同值无历史、非法后续操作无部分提交、共享资源、UndoRedo稳定身份及保存重开；正式Editor入口增加生产宿主create/place/edit及UndoRedo。候选采用既有全状态历史，受256MiB工作预算限制，不声称增量资源历史完成；调用入口仍限RGBA栅格目标，selection.transform浮动交接、freeTiles及其他MSE领域仍INCOMPLETE。无截图/人工视觉验收；最终构建及检查后附。

最终唯一正式Release构建通过，真实Lua invocation全套通过2.39s（含链接Cel指定帧放置、共享源、RGBA与save/reopen），正式--script-entry-check退出0；来源804文件和diff检查通过。整体迁移仍INCOMPLETE；阶段保存推送dev，保留原有用户差异与未跟踪数据。


### 2026-11-10：MSE 自由瓦片资源与实例事务

直接核对 lua-script-operations.ts freeTiles 四项、layer-creation、workspace-commands-free-tile、free-tile-transaction 与 core/free-tile-document。createLayer/createSource在detached Document复用原生实现，继承已配置的源显示色，源名称沿用属性事务trim和共享资源改名，新增源进入Edit。批历史捕获瓦片选择和自由实例选择UI，取消/UndoRedo恢复。place保持旧版首个拥有者查找（原生逆序）、source/resource别名及共享层放置限制，使用原始x/y和固定opacity1/normal，不套用光标居中或对称绘制；每帧容器独立，缺失slot创建。edit保留资源/首tile ID、同步共享源偏移，刷新相关缓存；同值无历史，RGBA转换沿用网格脚本路径。全结果预检后提交混合像素/资源/实例批次，非法后续操作不留下早期写入。

真实Lua覆盖创建/命名/选择、偏移尺寸编辑、放置默认、共享编辑及首owner拒绝、缺失帧slot和实例隔离、稳定ID UndoRedo、保存重开；正式Editor入口增加生产异步宿主创建源/编辑/放置/UndoRedo。现有原生资源读写及源编辑只支持256×256，旧版free source允许更大，明确作为未完成兼容缺口；本阶段不放宽保存格式/资源验证来冒充完成。坐标/工作预算同样沿用原生边界；整体仍INCOMPLETE，无截图/人工视觉验收。最终检查后附。

最终唯一正式Release构建通过，Lua invocation全套通过3.17s，最新正式--script-entry-check退出0；来源804文件和diff检查通过。无截图/人工视觉验收；整体仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：自由瓦片大尺寸源贯通

旧版free-tile-edit裁切源、applyFreeTileSourceSnapshot和project-format-decode只限制资源总像素，不把网格MAX_TILE_SIZE256用于自由源。原生sheet与grid共用sizeCheck导致此前脚本/变换/粘贴拒绝大源。现sheet按MaxTilesetPixels准入（除法避免乘积溢出），grid仍256；工程manifest尺寸读取同步资源预算，脚本、选区变换发布和选中源图片粘贴同步采用总像素限制，继续原生临时预算。未选中图片粘贴的256分块是旧版既有语义，保持。

300像素宽源覆盖脚本、变换、选中源粘贴、UndoRedo及保存重开，直接资源覆盖画布外末端像素和恢复工程；预算越界与超大int尺寸无分配失败、grid256边界检查。整体迁移仍INCOMPLETE；最终正式构建及检查后附。

最终唯一正式Release构建通过；free-tile-project完整回归58.62s、Lua invocation2.87s、tilemap-project0.77s、tile-image-resize3.10s均通过，正式--script-entry-check退出0。旧256尺寸失败断言同步改为画笔/喷枪取消恢复与形状隔离预览、提交/撤销检查；大源夹具使用有效原始ZIP，覆盖editable/recovery重开。来源804文件及diff检查通过。无截图/人工视觉验收；整体迁移仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：原生 MSE 能力发现真实性

核对 legacy mse_api.rs install/is_supported_path、原始能力测试及原生 planOperations：旧Runtime无条件给所有方法implemented=true，原生尚未接入document.create/open/save、brushes.importImage/createFromSelection/remove、selection.transform、io.export/save/open。按EX-002能力发现真实要求，构建时以有精确片段断言的适配生成原生MSE模块；保留API版本、模块/方法顺序、readOnly和全部可调用入口，仅使isSupported和implemented共同反映宿主实现，含缺口模块标partial。尚未接入的方法仍由原有结果预检拒绝，不删除迁移需求。

真实Lua worker枚举所有模块和方法，覆盖十个已知缺口、已接入方法、mse前缀/空白/未知路径、函数入口保留和只读查询无事务；原版信息测试只适配document模块partial预期。不是笔刷/IO/浮动状态迁移完成；整体INCOMPLETE。最终构建与验证后附。

最终18项Rust原始Lua契约测试全部通过；唯一正式Release重新链接成功；lua-script-runtime全方法发现回归0.29s、lua-script-invocation2.75s通过，正式--script-entry-check退出0，来源804文件及diff检查通过。只证明原生能力发现和已有脚本调用未回退，不能证明未接入操作完成或所有运行条件可用；整体迁移保持INCOMPLETE，无人工视觉验收。阶段保存推送dev。


### 2026-11-10：MSE 笔刷导入与删除宿主接入

核对lua-script-operations.ts brushes.importImage/remove、platform/brush-library-service.ts逐文件导入、workspace-commands-tool.ts非历史工程资源删除。新增BrushHost贯通result/PendingInvocation/Client/ScriptWindowHost/Editor，缺宿主整结果预检拒绝。原生图片选择器复用现有格式与多选，逐文件导入本地根目录、保留成功项且不自动激活；工程ID优先删除，否则走本地库安全ID验证和删除；刷新资源列表，保留非历史语义。能力查询同步两项，createFromSelection仍明确未接入。

外部资源可失败，因此含brush批次建立COW Document checkpoint，保持先提交该批raster再按hostOrder交错调用笔刷/panel/playback；异常恢复文档、历史、revision和Target，保留原生记录/历史observer绑定。旧版非历史资源删除和外部库副作用不撤销，恢复批次dirty/revision基线；createFromSelection仍未迁移，不宣称完整笔刷领域完成。真实Lua覆盖顺序/缺宿主/异步转发/混合失败不提交像素；正式入口覆盖工程brush删除和保存元数据。图片选择器人工交互未验收。最终构建检查后附。

最终唯一正式Release构建通过，18项Rust Lua契约测试通过；lua-script-invocation2.47s与lua-script-runtime0.21s通过，正式--script-entry-check退出0（含工程与本地brush删除、无历史及工程保存资源检查）。来源804文件与diff检查通过。含笔刷批次checkpoint会复制文档历史元数据，像素为COW；外部库操作仍同步，长IO性能及原生选择器人工验收未完成；createFromSelection及其他迁移缺口保留。整体INCOMPLETE，阶段保存推送dev。


### 2026-11-10：Hybrid 局部预览按需索引资源

用户明确确认采用预览与提交一致并保留大画布延迟路径。核对旧版tilemap-document.ts beforeByCell/editedTiles顺序与原生floatingOverlayRegion：原生补丁虽已缓存，每次局部绘制仍构建所有资源的Catalog。现按候选单元格及可见单元格需要，延迟创建既有Catalog中的资源索引；已缓存modified/local补丁不索引无关资源。保留单元格顺序、共享源传播、翻转旋转、空格、foreign引用与提交权威路径。

回归加入8192个瓦片的无关资源和变换foreign/空格，覆盖局部读取与整图预览、提交、撤销重做和补丁复用。仅减少重复索引工作，不宣称FPS改善数值。MSE createFromSelection的操作时选区与保存失败顺序仍需完整事务处理，未以近似语义接入；整体迁移INCOMPLETE。最终检查后附。

Aseprite对照：本地缓存doc/tileset.h::findTileIndex/notifyTileContentChange与tileset.cpp::hashTable采用按需索引和内容变更失效；文件头标MIT。本阶段仅核对索引生命周期思路，原生继续复用已有tiles::Catalog，不复制Aseprite代码，也不把像素匹配哈希与原生稳定ID查找视为同一算法。

最终唯一正式Release构建成功；tilemap-document 0.65s、document-raster-history 4.63s通过，正式--tileset-management-check --grid-transform-entry-only退出0。来源804文件与diff检查通过。无人工截图验收及FPS测量；整体仍INCOMPLETE，保留用户差异与全部未跟踪数据，本阶段保存推送dev。


### 2026-11-10：MSE 选区笔刷完整操作顺序

核对legacy lua-script-operations.ts、workspace-commands-tool.ts createBrushFromSelection/setTemporaryBrush和core/brushes.ts。规划保存操作时活动Cel的COW surface；执行时按顺序应用selection set/clear/invert与笔刷宿主，捕获当时选区。沿用既有64px/裁切/掩码/透明像素采样，缺选区、空像素、过大选区和本地保存失败仅报告消息并继续，失败保留选区。成功保存intrinsic/source origin，启用临时铅笔图像笔刷、保留返回配置、清空选区和填充图案。

含捕获结果沿用Document compound children及brush checkpoint，合并每批撤销并延后历史/录像观察，异常恢复文档/Target而不撤销外部资源。能力发现同步接通createFromSelection；剩余7项方法未迁移。真实Lua覆盖混合像素、mask、成功/失败后反选、图层切换、空选区、过大选区、后续异常回滚；正式入口加入实际库保存及UndoRedo。同步磁盘IO、非RGBA、selection.transform及整体迁移仍INCOMPLETE。最终验证后附。

最终唯一正式Release构建通过；18项Rust契约测试通过，lua-script-invocation全套3.43s、lua-script-runtime0.36s通过；正式--script-entry-check退出0，含实际笔刷PNG/元数据保存、激活/清选区及UndoRedo。来源804文件与diff检查通过。初次新增回归把无选区反选误期望为全选，核对既有invertSelection与旧版路径后修正为保持空选区；未修改该语义。无人工截图验收；本阶段保存推送dev，整体INCOMPLETE。


### 2026-11-10：普通栅格选区键盘边界语义

继续核对MSE selection.transform时发现共用命令缺口：旧版workspace-commands-selection-move.ts moveActiveSelectionWithSelectionHistory默认allowOutsideCanvas=false，普通栅格选区的原生nudge此前遗漏边界限制，仅蒙版/混合工程/free/clipboard已有。现复用同一64位边界计算覆盖普通栅格工程，不改变鼠标自由拖动与独立居中路径。静止/浮动/延迟、掩码与矩形、外部剪贴板、超大选区及int极值覆盖提交/取消/撤销重做；正式入口增加实际方向键连续重复至边界和预览一致性检查。

MSE selection.transform仍有跨批次浮动保留、后续结构/像素操作与活动目标重定位语义未完成；未把立即提交近似行为作为已迁移入口，也未修改能力发现。整体INCOMPLETE，最终检查后附。

最终唯一正式Release构建成功；document-transactions全套0.33s通过（16组及超大选区），正式--playback-floating-check退出0（含新增真实方向键与原有播放/完成选区/删除路由）。来源804文件与diff检查通过。新增测试分别保留粘贴前、粘贴后选区作为撤销/边界断言依据；未改变clipboard选区语义。无人工截图或FPS测量；整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：色板同步更新真实瓦片资源

用户明确采用修复后的行为：色板同步改色更新实际瓦片资源与全部引用，包括共享资源的锁定图层。对照workspace-commands-color.ts127–147与applyColorReplacementTarget，保留普通栅格精确RGBA替换、隐藏层参与、锁定层过滤与owner去重顺序。原生公共适配按未锁定Cel中的grid/free引用选择资源、去重后修改瓦片，保留ID/单元格/实例/链接/缓存几何；已有cellPixels与free_tiles::render重建受影响缓存。普通入口与MSE复用该处理；撤销记录同时包含资源、缓存、普通像素和色板。没有瓦片资源的普通入口保留原压缩像素历史路径。

新增实际Lua与普通Document入口回归覆盖连续改色、混合像素、锁定共享引用、隐藏层、自由瓦片、链接帧、仅锁定资源不修改、撤销重做与保存重开。整体迁移仍INCOMPLETE；最终验证后附。

最终唯一正式Release构建成功，lua-script-invocation全套2.26s通过；正式--script-entry-check退出0。来源805文件检查通过。首次夹具将同一sheet同时声明grid/free来源，按现有项目格式限制改为独立合法自由源后保存重开通过；保留产品校验。无人工UI/FPS验收。整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：普通与脚本色板提取共享区域合成

继续核对selection.transform的浮动操作序列时发现普通色板提取仍创建整张画布临时合成图。抽取公共区域取色路径，普通入口与MSE共用：完全保留palette.ts158–175/247–249的精确RGBA、透明跳过、扫描顺序、先出现去重与上限提前退出；每次输出最多65536像素，超宽画布按行横向拆分，复用既有合成器与脚本preview owner参数。保留新建/替换/追加及撤销语义。新增真实合成比对、透明RGB/半透明、分块边界/顺序/上限/preview，以及百万×百万虚拟输入仅一次读块即可命中上限检查。原生合成器内部特效缓存内存不由此上限覆盖，未宣称全部内存有界或FPS改善。

selection.transform仍须衔接跨批浮动保留、实际操作次序、后续像素与结构命令，未提前开启能力或实现立即提交近似。整体INCOMPLETE，最终验证后附。

最终唯一正式Release构建成功；palette-extraction专项0.05s与lua-script-invocation全套9.40s通过，正式--append-extraction-count-check退出0（真实提取弹窗、重复颜色no-op、隐藏条目复用、撤销重做）。来源806文件与diff检查通过。无人工图像/FPS测量；整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-10：MSE选区变换顺序执行与浮动事务

核对lua-script-service.ts applyResult/focusScriptTarget和lua-script-operations.ts729–736，新增含selection.transform结果的按序执行链：批次栅格先写，操作逐项复用既有适配，水平/垂直翻转后整数移动，跨批次仅在活动目标实际变化时切换。复用ScriptDocumentBuilder compound与COW回滚；浮动暂存让稳定像素操作不隐式提交预览，失败恢复整批像素/历史/选区/Target。旧版commitSelectionChange不结束pendingPaste，故脚本set/clear/invert保留捕获源；没有把普通Document提交选区自动结束浮动的语义直接套给脚本。结果最终目标真正变化时才提交浮动并切换。避免每项序列化复制整份结果。

普通栅格跨批浮动、翻转移动、取消、混合像素/色板、失败回滚、创建图层/撤销已纳入真实Lua回归。selection.transform能力发现仍false：非栅格operation-time目标、非延迟多目标预览、对话框回入尚未完整承接，不将当前路径称作完整迁移。整体INCOMPLETE，最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套2.77s通过，正式--script-entry-check退出0（既有实际脚本宿主检查，新增变换组合由真实Lua核心回归覆盖，未增加GUI变换断言）。来源806文件与diff通过。selection.transform完整迁移仍未完成且能力标记保持false；本阶段交付按序执行/跨批浮动事务基础，不代表功能验收闭环。保留既有用户差异，无人工图像验收；保存推送dev。


### 2026-11-10：延迟浮动选区的脚本对话框回调

沿用legacy lua-script-service.ts buildInvocation/rebaseTarget/focusScriptTarget：模型对话框回调重新捕获同一栅格目标，保留pending source。原生只对回调允许延迟浮动，继续拒绝其他活动编辑和物化多目标浮动；普通新脚本入口维持原有编辑结束要求。浮动存在性、overlay revision和选区快照加入分块捕获及结果过期校验，防止稳定像素未变时覆盖用户后续移动。已有浮动而回调不含transform时也复用按序执行器，让像素/色板操作保持稳定像素先写与浮动源保留。新增真实Client对话框连续移动、混合像素/色板、捕获中/执行后过期拒绝及撤销重做检查。完整selection.transform能力仍false，物化多目标与非栅格operation-time目标仍未完成，整体INCOMPLETE。最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套3.20s通过，正式--script-entry-check退出0（既有宿主检查；新增延迟回调由真实Lua Client回归覆盖）。测试画布257×257实际启用延迟路径；小画布物化预览及多目标回调仍未接通，不能称作全模式回调完成。来源806文件与diff检查通过，无人工图像/FPS验收。整体INCOMPLETE；本阶段保存推送dev。


### 2026-11-10：小画布与多图层物化浮动回调

对照legacy lua-script-service.ts buildInvocation/rebaseTarget/applyResult、workspace-commands-selection-move.ts及workspace-floating-preview.ts：物化预览的脚本捕获读取实际预览像素，操作保留pending源，后续变换按旧预览基线恢复再绘制。接通原生模型对话框的物化浮动捕获与结果执行，复用Document已有preview delta、source和撤销机制。补充contentMutationRevision过期校验，覆盖物化预览未推进历史revision的情况。普通新脚本与其他活动编辑仍维持入口约束。新增真实Client小画布、两图层回调的连续移动、选区外像素/色板写入、提交/取消、撤销重做、捕获过期和失败回滚。完整selection.transform能力仍false；非栅格operation-time目标、几何替换组合与更广正式宿主验收未完成，整体INCOMPLETE。最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套2.82s通过，正式--script-entry-check退出0（既有宿主检查；新增小画布/双图层路径由真实Lua Client回归覆盖）。来源806文件及diff检查通过。无人工图像/FPS验收；完整selection.transform能力仍false，整体INCOMPLETE。本阶段保存推送dev，既有用户差异与未跟踪数据保留。


### 2026-11-10：选区变换后非栅格操作目标

依据legacy lua-script-service.ts559 applyResult按序执行和lua-script-operations的活动目标语义，修复变换后创建网格/自由瓦片层再执行后续MSE命令被栅格入口误拒的问题。顺序执行器新增内部operations-only通道，入口强制无changes/surfaceChange，保留脚本调用/public结果的栅格要求以及锁/蒙版检查；复用既有规划器生成完整结构/色板候选与Document事务，不允许外部脚本像素载荷借此写入瓦片缓存。新增真实Lua变换/创建网格/放置/属性/色板及变换/创建自由层/源/属性/色板组合，检查整批撤销重做、稳定标识、原始像素和失败回滚。完整selection.transform能力仍false；几何替换组合和更广正式宿主验收仍未完成，整体INCOMPLETE。最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套3.02s通过，正式--script-entry-check退出0（既有宿主检查，新增组合由真实Lua核心回归覆盖）。来源806文件与diff检查通过。没有人工图像/FPS验收；几何替换组合尚未完成，selection.transform完整能力仍false，整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：变换后跨批次整图替换基线

核对legacy lua-script-service.ts255验证、475 commitSurfaceChange及559 applyResult：Lua图像序列不反映MSE变换像素，替换撤销与计数按wire before/after，而安装发生在MSE已修改的当前目标上。原生顺序适配器仅为安装校验重建当前before，另保留已验证wire before供历史与计数使用；Document复用surfaceChanges安装及撤销，异常回滚仍使用实际现场，历史预算按真实wire像素大小计算。新增真实Lua跨批水平翻转、Image替换、Cel位置、移动/取消及逐次撤销重做回归。完整selection.transform能力保持false；更广稀疏/多目标替换组合与正式验收仍未完成，整体INCOMPLETE。最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套2.57s通过，正式--script-entry-check退出0（既有宿主检查，新增替换组合由真实Lua回归覆盖）。来源806文件与diff检查通过。未进行人工图像/FPS验收；更广稀疏/多目标替换组合仍需检查，完整selection.transform能力仍false，整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：稀疏/多目标替换矩阵与消除整图JSON重建

沿用legacy lua-script-service.ts255/475/559的wire校验与现场安装分离，内部校验直接使用已解析historyBefore，不再逐像素创建WinRT JsonValue并重新编码当前整张图。保留原始wire整体校验和实际Document目标过期检查。真实Lua图像替换矩阵扩大到普通/稀疏×单目标/双图层，覆盖跨批翻转、更换图像/位置、移动取消、撤销重做、工程保存重开及失败后完整几何/像素/选区/历史回滚。现有结果JSON解析、基线复制和同步执行仍存在；无整机FPS改善声明。完整selection.transform能力仍false，剩余交互/正式宿主验收未完成；整体INCOMPLETE。最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套2.68s通过，正式--script-entry-check退出0。新增替换矩阵/重开/回滚由真实Lua核心回归覆盖，入口检查为既有正式宿主检查。来源806文件及diff通过。无人工图像/FPS验收；整体INCOMPLETE，完整selection.transform能力保持false。本阶段保存推送dev，用户既有差异与未跟踪数据保留。


### 2026-11-10：脚本顺序操作复用未变像素基线

复核legacy lua-script-service.ts applyResult外部操作即时执行、后续失败仅撤销文档事务，保留既有执行顺序，不擅自延迟通知/播放/面板效果。原生refreshScriptTarget原来每项操作复制完整像素；新增目标存储identity/revision及几何校验，捕获时记录原始owner标识，仅真正变更时刷新immutable快照。真实Lua 257×257连续延迟移动/clear断言快照shared_ptr身份不变；同批写像素再变换断言更换基线、结果及撤销正确。仍有既有JSON解析、基线内容比较、事务checkpoint等同步开销，无FPS改善声明。完整selection.transform能力仍false，整体INCOMPLETE。最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套2.86s通过，正式--script-entry-check退出0。来源806文件及diff检查通过；新增快照复用/写入刷新断言由真实Lua回归覆盖。未进行人工图像/FPS测量；整体INCOMPLETE，完整selection.transform能力仍false。本阶段保存推送dev。


### 2026-11-10：正式异步宿主的浮动选区刷新与验收

对照legacy useAppScriptRuntime与workspace-floating-preview的覆盖层版本刷新，修复Editor::pumpScripts只看内容/历史/活动目标而漏掉延迟浮动移动的问题：加入floatingOverlayRevision判断。正式--script-entry-check新增真实脚本队列、原生对话框按钮回调5×5及257×257路径；检查连续移动后刷新、延迟移动不改内容/历史、关闭保留浮动、提交撤销重做、失败回滚/VM会话及窗口清理/错误报告Escape。完整迁移仍INCOMPLETE，无人工图像/FPS声明；最终实际运行结果后附。

最终唯一正式Release构建成功，新增实际--script-entry-check退出0：小画布/延迟浮动的原生按钮回调、刷新、关闭/提交/撤销重做、失败清理均执行通过。来源806文件与diff检查通过；本次只改Editor宿主刷新和正式验收，核心专项沿用前阶段通过结果，未重复全套。无人工图像/FPS测量；完整selection.transform能力仍false，整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：顺序变换保留MSE最终目标

核对legacy lua-script-service.ts609–636：最后批次后保留MSE活动图层/帧，只有后续批次、创建图层和明确最终app选择才重新聚焦。删除顺序执行器没有createdLayers时无条件执行空tail并切回原目标的行为，避免覆盖app.activeLayer=nil/activeFrame=nil语义及额外浮动提交；有创建图层时继续复用原目标tail。新增真实Lua no-op变换/setFrame/nil、变换/创建图层/nil及历史撤销重做回归。整体INCOMPLETE，完整selection.transform能力保持false；最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套5.44s通过，正式--script-entry-check退出0，包含前阶段新增真实浮动回调验收。来源806文件和diff检查通过，无人工图像/FPS测量；整体INCOMPLETE，完整selection.transform能力保持false。本阶段保存推送dev。


### 2026-11-10：停止播放保留脚本浮动选区

对照legacy lua-script-operations.ts528及workspace-commands-animation-playback.ts49：只有playing=true才先提交pending，停止播放保留浮动；指定非空循环调用也先提交。修复顺序执行器对所有animation.play无条件提交的问题，沿用严格布尔参数默认与循环分支。真实Lua小画布/延迟预览覆盖停止、非布尔playing、开始、取消及整批撤销。整体INCOMPLETE，完整selection.transform能力仍false；最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套5.27s通过，正式--script-entry-check退出0（含既有原生浮动回调检查）。来源806文件及diff检查通过。无人工图像/FPS测量；整体INCOMPLETE，完整selection.transform能力仍false。本阶段保存推送dev。


### 2026-11-10：已有浮动选区启动新脚本

核对legacy lua-script-service.ts104 buildInvocation与切帧命令：旧版允许pendingPaste上启动新脚本，原生此前只放行模型对话框回调。PendingInvocation.start显式允许已有浮动，复用现有捕获/过期保护与顺序执行器，继续拒绝active(false)的笔画等其他预览。新增真实异步Client小画布物化及大画布延迟浮动的新脚本继续移动、提交/撤销重做和活动笔画拒绝。完整迁移仍INCOMPLETE，最终验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套5.55s通过，正式--script-entry-check退出0。来源806文件及diff检查通过，未进行人工图像/FPS测量。整体INCOMPLETE，完整selection.transform能力保持false；本阶段保存推送dev。


### 2026-11-10：浮动选区与图层复制、删除

核对legacy lua-script-operations.ts410–420、workspace-commands-layer-structure.ts185及workspace-commands-layer-selection.ts99：复制保留pending，删除先selectLayer并提交pending。原生顺序执行器补齐layers.remove提交；新增真实Lua 5×5物化与257×257延迟预览的复制/取消/撤销、复制后删除/原源提交/撤销重做、后续失败整批恢复。完整selection.transform仍false，整体INCOMPLETE；实际验证结果后附。

复制历史记录保留当时的物化预览：取消浮动再撤销复制，小画布恢复复制前物化像素，大画布延迟路径恢复稳定像素；回归按旧版同步当前帧、保存结构历史的时机区分断言，不将其改为提前提交。

最终唯一正式Release构建成功；lua-script-invocation全套3.86s通过，正式--script-entry-check退出0。来源806文件与diff检查通过。未进行人工图像/FPS测量；完整selection.transform能力仍false，整体INCOMPLETE。本阶段保存推送dev。


### 2026-11-10：脚本原目标删除后的完整批次

对照legacy lua-script-service.ts566、607–611：MSE删除原图层后，同批剩余操作仍作用于当前幸存图层，原捕获基线不重绑定；下一批次或回调才拒绝缺失目标。原生refreshScriptTarget此前在删除后立即读取缺失图层几何并异常，导致合法同批删除整体回滚；现保留原基线与目标身份。真实Lua覆盖小画布/延迟预览、原目标删除后的图层属性与色板、同批撤销重做、后续失败恢复与下一批次拒绝。完整迁移仍INCOMPLETE，实际验证后附。

补齐明确的下一批次与createdLayers尾部缺失原目标检查，避免Document::selectLayer缺失ID静默返回后误用幸存图层。新增真实模型对话框结果接收检查：会话保留原目标身份，后续匹配拒绝；不重绑定幸存者。最终唯一正式Release构建成功，lua-script-invocation全套6.69s通过，正式--script-entry-check退出0；来源806文件和diff检查通过。未进行人工图像/FPS测量，整体INCOMPLETE；本阶段保存推送dev。


### 2026-11-11：脚本顺序执行的未变像素校验

核对document.create实际调用链：legacy在批次中途切换workspace，newDocument捕获创建失败并只报状态，同批后续操作作用于新文档；现有createdDocuments尾部采用接口不足以保持语义。本阶段未伪装接通或开放该能力。继续完成现有脚本迁移链路的性能处理：Target::matches此前每项顺序操作重复全缓冲比较；复用原生存储identity/revision及几何，绑定完成捕获/刷新时的immutable像素快照weak_ptr令牌，未变路径常量时间检查；任一令牌、几何、存储变化回退精确比较，不把外部替换expected误认为可信。新增512×512重复检查耗时诊断及快照替换、几何、存储替换/写入回归。整体INCOMPLETE，实际验证后附。

最终唯一正式Release构建成功；lua-script-invocation全套8.12s通过，512×512未变目标2000次检查466微秒（单次本机诊断，无跨版本FPS结论）。正式--script-entry-check退出0；来源806文件与diff检查通过。document.create工作区切换等迁移仍未完成；本阶段保存推送dev。


### 2026-11-11：选区变换32组真实Lua迁移验收

沿legacy lua-script-operations.ts729、workspace-commands-selection-flip.ts、tools-selection-transform-apply.ts224与workspace-selection-timeline-flip.test.ts核对完整/稀疏Cel、链接/独立帧、有/无选区、水平/垂直翻转、单/双Cel选择的32种组合。真实Lua执行翻转后移动，验证无选区移动不生效、稀疏整层翻转只镜像自身缓冲并保持偏移、链接只修改共享源一次、显式双Cel分别修改；全部检查历史、撤销重做与工程保存重开。基础8组及扩展32组均通过，最终lua-script-invocation全套7.38s通过。仅增加迁移证据与回归，生产行为未改；完整selection.transform发现仍false，非栅格组合仍需闭环，整体INCOMPLETE。来源及正式入口实际结果后附。

正式--script-entry-check退出0，来源806文件与diff检查通过。未新增界面或生产行为，未进行人工图像/FPS测量。本阶段验收证据保存推送dev，整体迁移仍INCOMPLETE。


### 2026-11-11：脚本非栅格整Cel翻转

核对legacy workspace-selection-timeline-flip.ts18：网格镜像单元格位置及取样方向，自由瓦片只切换未锁实例方向而不移动实例。新增真实Lua从栅格调用目标执行资源改色/放置/翻转/无选区移动/当前层属性的四组网格自由×水平垂直回归，检查元数据、非对称资源像素、撤销重做、保存重开及后续失败回滚。1×1瓦片方向等价，改用2×2取样映射检查；自由源默认偏移不为零，样本明确设置offsetX/Y=0避免画布外放置。生产默认及语义未改，完整selection.transform能力保持false，资源选区模式仍待闭环。实际验证结果后附。

自由实例翻转按原点负坐标-1取样，原点在边缘的内容会落出画布；最终样本置于(2,2)并检查相应坐标，不修改旧语义。最终lua-script-invocation全套6.41s通过，包含资源非对称像素及引用保存重开。生产源码未改，使用已构建正式Release执行入口；实际结果后附。

本轮正式--script-entry-check退出1，native/native-script-entry-error.txt记录Cannot replace brush file (Windows error 5)，入口检查未通过；未重试、未删除测试目录。来源806文件与diff检查通过；专项迁移模型证据通过不代替正式入口验收。未进行人工图像/FPS测量，整体INCOMPLETE，本阶段保存推送dev。


### 2026-11-11：笔刷排序并发读取与正式验收隔离

前阶段正式入口在原子替换笔刷文件时报Windows error5；现有错误未包含目标路径，不能仅凭该码断定具体原因。核对legacy platform_brushes.rs排序读取/原子写入与原生后台listing，修复原生排序读取普通ifstream未明确允许删除共享的并发风险：CreateFile开启READ/WRITE/DELETE共享，读取持有原文件时允许原子替换；保留读取失败旧回退及写入错误，不加重试或改只读属性。新增后台list并行100次reorder回归。正式脚本入口复用已有brushLibraryTestDirectory_注入到带marker的script-entry-test-owned/brushes，在initializeScripts前设置，避免验收写入日常笔刷库。实际验证后附，整体迁移INCOMPLETE。

最终并发测试确认共享读取单独不足，ReplaceFile试验也出现1175故未采用；保留MoveFileEx，加入进程内list/readOrder/atomicBytes串行锁。修正临时文件消失后INVALID_FILE_ATTRIBUTES被误判reparse，列表只忽略精确排序临时文件前缀。错误包含目标路径，无重试或用户目录清理。唯一正式Release构建成功，pattern-brush-library全套及新增并行100次排序2.56s通过，正式--script-entry-check退出0。来源及diff检查后保存推送，整体INCOMPLETE。


### 2026-11-11：正式脚本入口保留浮动事务

核对legacy useAppScriptRuntime.tsx runLuaScript及lua-script-service.ts runLuaScriptForActiveDocument：等待笔刷列表后捕获调用，不提前提交浮动选区。移除原生Editor::runScript的提前提交，保留原有cancelStroke手势清理。正式入口新增5/257画布及延迟笔刷列表回归，检查启动无内容/历史/浮动版本变化、等待保留、继续变换、一次撤销恢复原像素、重做、失败回滚及取消/错误报告清理。整体迁移INCOMPLETE；实际验证后附。色板资源同步实际上已于2026-11-10完成，见“色板同步更新真实瓦片资源”及现有普通/真实Lua资源回归；前阶段交接误称尚未实现，现依据源码和记录更正。

最终唯一正式Release构建成功，lua-script-invocation全套5.77s通过，正式--script-entry-check退出0（包含新增异步浮动入口检查）。来源806文件与diff检查通过。未进行人工图像/FPS测量，整体迁移仍INCOMPLETE；本阶段保存推送dev。


### 2026-11-11：真实Lua瓦片四模式选区事务

核对lua-script-operations.ts tiles.place/selection.transform与workspace-commands-selection-flip.ts pendingPaste/paint分支，并沿用既有tilemap_project_test.cpp及用户已批准的Paint/Hybrid资源权威修复。新增四模式×双轴×整格/非整格移动×链接/独立帧32组真实Lua操作链，从独立栅格目标调用放置瓦片、设置选区、移动、翻转及属性，检查预览/提交的资源与单元格、撤销重做、失败回滚和工程重开每个解析缓存。原生命令对照验证脚本接线，不作为独立旧版等价证明；完整selection.transform发现仍false，整体INCOMPLETE。初轮修正测试夹具：保留栅格调用源；MSE place坐标为单元格而非画布像素；确保放置实际改变以验证完整事务上下文。没有更改产品限制。实际验证后附。

最终32组及lua-script-invocation全套5.59s通过，正式--script-entry-check退出0（使用上阶段已构建正式Release，本阶段未改生产源码）。链接样本采用既有linkTileFrame真实linkedCelId夹具；addFrame(true)是复制独立帧，不能冒充链接帧，已修正验收样本。来源806文件及diff通过。本阶段新增脚本集成证据与回归，没有宣称新功能实现、完整瓦片模式旧版等价或FPS提升；保存推送dev，整体INCOMPLETE。


### 2026-11-11：开放selection.transform能力发现

沿legacy lua-script-service.ts buildInvocation的layer.kind限制、lua-script-operations.ts activateLayerFrame及freeTiles.place、workspace-commands-selection-flip.ts free源目标优先级，确认从栅格调用切到free层没有已选实例时像素选区变换应无操作。新增Paint/Edit×双轴×先移动/先翻转8组真实Lua，检查选框、实例元数据、资源像素、历史、保存重开及后续失败回滚，不通过缓存写入伪装源变换。既有32组栅格、32组瓦片四模式、整Cel/free及正式浮动异步路径已验收；本轮移除runtime对selection.transform的过期能力屏蔽，保留document/io六项缺口。runtime发现回归和正式Editor脚本先查询支持再执行，防止只有直接调用成功、查询仍拒绝。整体迁移INCOMPLETE；实际验证后附。

唯一正式Release与runtime构建成功，lua-script-runtime及lua-script-invocation两项通过（0.25s、7.64s），正式--script-entry-check退出0，包含先查询selection支持再继续已有浮动变换。来源806文件和diff检查通过。无人工UI/FPS测量，document/io六项host缺口及非RGBA仍待完成；本阶段保存推送dev，整体INCOMPLETE。


### 2026-11-11：脚本保存接口与正式异步保存链路

核对legacy lua-script-operations.ts document.save/io.save、workspace-commands-document-io.ts saveActive与document-file-service.ts SaveAsOptions。新增SaveHost贯穿结果执行、PendingInvocation、Client及正式窗口host，按原始MSE顺序先提交浮动再调用保存，等待现有有界快照/后台编码发布后继续；不将保存挪到结果尾部。主机缺失在文档写入前拒绝。原生正式保存复用保存策略、格式损失确认、原子写入、保存点和恢复处理，补齐name/format/directory/includeTimelapse/scalePercent及队列选项，图像输出缩放不修改源。等待时锁定活跃工程并延后关闭请求，防止消息泵重入使引用失效。新增真实Lua及正式Editor文件前缀/后续修改/别名/取消继续/资源选项/撤销回滚检查和多图像编码缩放检查。实际结果后附；完整迁移INCOMPLETE。

最终正式Release构建成功。首轮正式入口暴露首次保存生成持久projectId后脚本原ID失效，修复为校验同一原生identity后刷新target.documentId；保留跨文档拒绝。最终正式--script-entry-check与--aseprite-save-check均退出0，覆盖真实异步保存前缀、后续修改、别名、选项缩放及取消继续。image-save、lua-script-runtime、lua-script-invocation三项全通过（0.23s、0.20s、6.61s）。开放document.save/io.save能力发现；其余document.create/open、io.open/export四项仍屏蔽。来源806文件及diff检查通过，无人工UI/FPS测量；本阶段保存推送dev，整体迁移仍INCOMPLETE。


### 2026-11-11：脚本保存后失败的持久元数据

核对legacy lua-script-service.ts520–610：abortCompound及批次基线恢复仅撤回内容/历史/dirty与修订状态，不撤回成功保存的外部效果。原生整Document检查点原先会丢失首次保存ID、源归档及图像名称/源路径，造成已写入文件与内存身份不一致。回滚保留这四项持久元数据，继续恢复批前dirty等状态。新增dirty/clean×native/image模型检查、保存主机抛错无元数据污染、保存前缀与后续新调用，以及正式Editor真实native/PNG保存后失败和再次保存检查。修正既有save-host测试将共享编码缓冲误声明为值Bytes导致的干净重编译错误。整体迁移INCOMPLETE，实际验证后附。

唯一正式Release构建成功，lua-script-invocation全套6.80s通过，正式--script-entry-check退出0，覆盖真实native/PNG文件前缀、失败后的元数据与后续保存。来源806文件及diff检查通过。未进行人工UI/FPS测量；本阶段为保存失败一致性修复，不宣称性能提升或整体完成。保存推送dev。


### 2026-11-11：脚本完整导出目标与后台主机

对照legacy lua-script-operations.ts398、workspace-commands-document-io.ts429及document-file-service.ts461–930接入io.export。执行器在操作原始位置提交浮动后调用完整JSON选项主机，缺失主机在修改前拒绝；取消或导出错误按workspace状态处理，后续MSE继续。原生复用DocumentSnapshot分片捕获、后台编码、已有12格式编码器、图层/切片/帧命名与冲突规划，覆盖整工程、选区遮罩、指定/全部图层、切片、帧范围/方向、WebP帧目标回退、缩放/裁边及工程便携缩时。导出不更新保存点。新增真实Lua前缀/浮动/回滚/撤销重做检查；正式入口新增12格式实际输出与目标/失败/取消链路。UI复用现有模态，不另造导出界面。现有导出记忆格式缺少工程格式和切片目标，暂只记录目录，不能伪装PNG；完整io.export发现保持屏蔽，记忆和扩展完成事件仍需后续闭环。本阶段完整实现主机和目标编码链路，整体迁移INCOMPLETE。实际构建验证后附。

最终唯一正式Release构建成功，lua-script-invocation全套7.63s通过，正式--script-entry-check退出0。实际检查12格式输出，PNG/BMP/JPEG/WebP/GIF/PSD/ASE解码尺寸，ICO结构尺寸，native工程重开与后续色板前缀；选区遮罩/浮动提交/失败回滚，图层缺失回退、切片、反向帧序列/GIF范围、WebP帧回退、裁边缩放、chooser扩展名及执行中取消后继续均通过。初轮测试栈溢出改大型Document夹具为堆分配；ICO使用文件结构检查，不能冒称普通导入器支持ICO；遮罩按legacy selectionContains严格值1修正测试夹具。来源806文件及diff检查通过，无人工UI/FPS测量。完整io.export能力发现继续屏蔽，导出记忆工程格式/切片与扩展完成事件尚待闭环。阶段保存推送dev，整体迁移INCOMPLETE。


### 2026-11-11：导出设置与预设的完整目标记忆

核对legacy document-file-service.ts205与core/export-settings.ts145，扩展原生document-export-settings v5、export-presets v6，保留旧记录读取，新增PSD/ASE/ASEPRITE/MoonSprite格式、切片目标与ID、每工程实际目录。恢复到已有模态组件，工程格式继续复用上阶段后台主机；MoonSprite缩放固定100且禁止不支持的裁剪目标。脚本成功导出全部记录实际设置与presetName，取消/失败沿用不覆盖。新增实际12格式导出后面板恢复、切片/四工程格式记忆、旧版本1–4默认值与新预设读写应用检查。扩展完成事件仍未接入，完整io.export发现保持屏蔽，整体迁移INCOMPLETE。实际验证后附。

最终唯一正式Release构建成功，--export-memory-check与--script-entry-check均退出0：包含真实12格式成功导出后恢复目录/文件名/格式/缩放，切片目标恢复，旧记忆版本1–4读入，新预设工程格式/切片读写与应用、取消/失败不覆盖及100条MRU既有回归。来源806文件及diff检查通过。没有人工截图/FPS验收；扩展完成事件未接入，io.export完整能力仍屏蔽，整体迁移INCOMPLETE。本阶段保存推送dev。

### 2026-11-11：导出后台等待避免空转

核对正式程序调用关系：RuntimeRegistry/SessionHost仍仅存在于扩展模型，未接入Editor生产宿主；不能以空注册表冒充导出完成事件集成，io.export能力继续屏蔽。对照legacy exportActive的await后台任务及document-file-service异步让出，修复原生脚本导出零超时轮询加thread yield持续空转，改为消息处理后最多4ms future等待。Aseprite cmd_export_sprite_sheet.cpp::waitGenTaskAndDelete亦使用10ms休眠，仅作方案核对，没有复制源码。首轮把等待放消息处理前暴露快速任务跳过取消消息，已恢复原先先处理消息的顺序。最终唯一正式Release构建成功，--script-entry-check退出0，涵盖真实12格式、执行中取消及取消后脚本继续。来源806文件及diff检查通过；未测整机CPU/FPS，不宣称解决全部UI卡顿。整体迁移INCOMPLETE。


### 2026-11-11：脚本跨文档工作区执行与正式宿主

对照legacy lua-script-service.ts503–636、lua-script-operations.ts373–389及workspace-commands-session/document-io：新增WorkspaceHost贯穿结果执行、PendingInvocation、Client、原生窗口host和Editor。document.create/open/io.open按原始操作位置切换会话；同批后续命令作用新文档，下一批及createdLayers尾部重新聚焦原目标；出现边界时跳过最终选择，非模态后续会话按旧版报目标变化并清理。复用addProject/openPath/chooseProject及已有解码、恢复、路径去重、图片序列流程；打开失败/取消和创建失败作为workspace状态，后续MSE继续。事务收尾和COW检查点通过native identity重新查找原文档，避免Document被移入后台后引用错误；失败仅恢复原目标批事务，新会话已经完成的独立修改保留。保存/导出宿主缺失预检仍先于写入。

真实Lua七组回归覆盖原wrapper移动后成功/失败/取消、下一批聚焦、open两种别名及边界后非模态清理；正式入口覆盖RGBA创建尺寸名称、原目标撤销重做、后台回滚、新会话效果保留、PNG路径打开、已有文件复用、chooser成功/取消、文件失败继续、未支持色彩模式拒绝继续。正式嵌套chooser暴露1MiB栈压力：拆分大型smoke函数、创建候选/路径缓冲及序列中间候选堆分配，单文件按旧分支直接打开，多文件保留序列流程。未提高正式程序栈或另发preview。

最终唯一正式Release构建成功，--script-entry-check退出0；lua-script-invocation 5.80s和image-sequence-import 0.16s均通过，来源806文件及diff检查通过。旧native-script-entry-error.txt是早前失败记录，未删除用户数据；结论采用本次实际退出码。非RGBA文档模型/创建、全部跨域组合及扩展生产宿主仍未完成，document.create/open/io.open/io.export完整能力发现继续屏蔽。没有人工图像/FPS验收；本阶段完成工作区边界和RGBA/既有打开路径正式链路，不宣称所有迁移完成。保存推送dev。


### 2026-11-11：跨文档脚本文件效果与打开能力闭环

沿legacy lua-script-service.ts503–636源会话compound与外部效果语义，补齐真实Lua跨批变换→整图替换→工作区边界成功/失败，以及新文档保存/导出→后续修改/失败组合。确认替换撤销使用已验证wire before，失败恢复上一批变换结果；新会话上的保存点、独立历史及外部效果不被原目标回滚。正式Editor新增实际MoonSprite保存重开及PNG导出，检查保存前缀、之后色板修改、新文档dirty、失败后文件保留和原目标色板恢复。归档解码独立noinline函数控制嵌套验收栈，未提高正式程序栈。

在前阶段路径/别名/chooser成功取消/坏文件继续与本阶段文件组合验收基础上，开放document.open/io.open能力发现；完整document.create因非RGBA模型缺口、io.export因生产扩展完成事件缺口继续屏蔽。runtime发现精确断言剩余两项缺口。最终唯一正式Release构建成功，--script-entry-check退出0；lua-script-invocation 5.17s及lua-script-runtime 0.25s通过，来源806文件及diff检查通过。旧错误txt保留，采用当次退出码。无人工图像/FPS验收；整体迁移INCOMPLETE。本阶段保存推送dev。


### 2026-11-11：跨文档脚本与已有浮动预览

核对legacy lua-script-service.ts批次回滚与workspace-commands-session.ts setActive提交浮动，新增真实Lua和正式异步Editor各8组：5×5物化/257×257延迟预览，实际打开/取消，成功/后续失败。验证选区外脚本像素写入、成功切换提交内容、取消保留浮动及取消浮动后像素、失败恢复后台原目标浮动/像素/历史，继续保留新会话已完成效果。真实正式打开暴露acceptOpen栈上Document候选与浮动提交嵌套导致栈溢出；候选改堆分配，workspace执行器与验收lambda明确不内联以限制栈帧累积，未提高程序栈或另发preview。

最终唯一正式Release构建成功，--script-entry-check退出0，含上述8组及既有文件/格式检查；lua-script-invocation 5.54s通过。来源806文件与diff检查通过；旧错误txt保留，采用实际当次退出码。无人工图像/FPS验收；非RGBA与扩展生产宿主等仍INCOMPLETE，本阶段保存推送dev。


### 2026-11-11：跨文档图层尾部提交与缺失目标验收

对照legacy lua-script-service.ts389–436、503–509、613–635，完成真实Lua及正式异步Editor各4组边界验收：创建文档后Lua新建图层尾部返回原工程、取消打开仍保留边界语义、原目标图层删除后尾部提交拒绝、原目标删除后下一批拒绝。检查原目标像素、幸存图层属性、新会话保留、nil最终选择抑制、图层创建与源批次各自撤销重做。生产实现通过上述检查，本阶段没有为迁移另改既有语义。

唯一正式Release构建成功，--script-entry-check退出0，lua-script-invocation 5.72s通过；来源806文件与diff检查通过。旧错误txt保留，采用当次退出码；没有人工图像/FPS验收。本阶段为完整组合验收，非RGBA和扩展生产宿主等仍INCOMPLETE，保存推送dev。


### 2026-11-11：色板资源同步逐行替换优化

核对现有2026-11-10资源同步修复与workspace-commands-color精确RGBA语义，保留未锁定引用选择资源、共享锁定引用刷新及既有历史。有效锁状态由每个Cel重复遍历组链改为每层计算一次；目标瓦片直接遍历图集行替换匹配像素，移除逐瓦片readTile分配、整块读回和回写。资源ID、选取范围、透明RGB及缓存重建保持原路径。对照Aseprite filters/replace_color_filter.cpp逐行遍历思路，其文件为EULA，仅阅读方案未复制代码。

唯一正式Release构建通过；lua-script-invocation全套6.63s通过，正式--script-entry-check退出0，包含普通/实际Lua资源同步、锁定共享引用、UndoRedo及保存重开。来源806文件及diff检查通过。未新增镜像实现测试，复用既有行为回归；无CPU/FPS测量，不宣称解决整体UI卡顿，扩展生产宿主等整体迁移仍INCOMPLETE。仅提交本阶段三个文件，保留editor_support.h及用户日志/缓存。


### 2026-11-11：扩展network.fetch实际异步传输与会话生命周期

对照legacy ExtensionRuntimeHost.tsx472–485及stringParam，补齐RequestHost权限/认证之后的network.fetch异步分支。SessionHost按token generation保存任务，事件线程pollResponses交付带原requestId的响应；禁用、关闭、替换和析构取消任务并丢弃旧结果，future销毁不join后台线程。后台WinRT HttpClient执行HTTP(S)，默认GET，字符串body以UTF8 text/plain发送，GET/HEAD body拒绝；禁用cookie及交互认证UI。15秒总deadline贯穿响应头和流读取，返回status/ok/小写headers/bytes，HTTP404属于成功传输但result.ok=false；隐藏Set-Cookie响应头。流式读取在2MiB之外拒绝，避免先收完整超大body。JSON以UTF16跨线程，不跨线程共享WinRT JsonObject。

新增真实loopback HTTP服务器验收GET、POST body、404、头字段、cookie、刚好2MiB/超1字节、参数/协议/权限拒绝、15秒超时、服务器确认接收后关闭不等待、重载不收旧结果、双扩展并发隔离。首轮缺cwctype导致编译失败已修正；最终extension-network/session-host/request-host三个目标构建与CTest全部通过，network23.53秒，来源808文件检查与diff检查通过。正式Editor尚未引用SessionHost，本阶段没有修改/重新构建正式exe，不宣称扩展已可从UI安装运行、旧HTML兼容或io.export事件闭环完成；生产执行引擎和原生窗口仍是后续迁移缺口。没有引入WebView/外部工程/preview。整体INCOMPLETE，阶段保存推送dev。


### 2026-11-11：扩展diagnostics.log与实际日志记录器适配

核对ExtensionRuntimeHost.tsx464–471、stringParam及core/runtime-diagnostics。RequestHost新增diagnostics.log，SessionHost按token注入record/status/console服务；权限与存活检查先于调用，缺宿主显式失败。保留旧版先String(message)记录、严格level=error更新状态、再String(level)规范化控制台等级、最后校验message字符串及UTF16 slice2000的可观察顺序。JSON数组采用显式栈join，保留null/undefined/布尔/数值/普通对象字符串语义及toString遮蔽失败，避免深嵌套C++递归栈。recorderDiagnosticServices把宿主固定扩展身份绑定现有异步Recorder，保留记录模式、写盘和错误处理；状态和控制台由宿主服务连接。

实际日志文件测试覆盖中文错误、调用顺序、非法数值/缺失/嵌套数组消息仍产生旧版前置效果、array等级严格与强制转换差异、全部等级/未知等级、补充平面字符UTF16截断、数字指数边界、对象转换失败、权限拒绝、缺服务与关闭会话。最终extension-diagnostics/session-host/request-host/network构建通过，四项CTest通过，diagnostics0.04s/network23.44s；来源810文件和diff检查通过。能力查询旧版会列举尚未接入的windows方法，因此本阶段未伪报支持，runtime.getCapabilities仍缺口。正式Editor未引用SessionHost，本阶段没有修改或重构建正式exe，扩展执行引擎与原生窗口仍待迁移。整体INCOMPLETE；阶段保存推送dev。


### 2026-11-11：扩展窗口请求路由与会话清理

核对ExtensionRuntimeHost.tsx295–331/410–442、extension-overlay-geometry.ts及platform_extension_windows.rs。WindowRouter承接open/close/setVisible/postMessage：资源白名单、overlay16上限与有限小数边界、单dialog替换/title强制转换/form标志、native ASCII ID/JS round/32..2048尺寸、复用原窗口资源和创建标志、overlay/dialog冲突及路由优先级、close-all和已关闭嵌入窗口晚到消息抑制。呈现服务携带完整类型定义区分同ID不同呈现，不允许缺服务假成功；只有服务open成功才写入状态。RequestHost先权限/认证，再路由；SessionHost token绑定，替换/禁用/析构清理全部窗口，单项close抛错仍继续其他清理，旧token不关闭新会话。

新增回调级窗口测试覆盖默认值、复用、参数边界、冲突、数量、消息payload/undefined、显隐、失效消息、不存在目标、呈现失败不留状态、全部关闭及失败清理。最终五个宿主目标构建成功，extension-windows/session-host/request-host/diagnostics/network五项CTest通过，windows0.04s/network23.32s。来源812文件和diff检查通过。此阶段是窗口路由与生命周期迁移，测试呈现回调不是实际原生窗口；表单节点UI/透明命中/执行引擎/Editor生产接线仍未迁移，不宣称窗口已可从正式程序使用，runtime.getCapabilities继续明确缺口。正式exe无代码接线变化，未重构建或新增preview。整体INCOMPLETE，阶段保存推送dev。


### 2026-11-11：扩展runtime.getCapabilities协议迁移

网络、诊断和窗口路由分支接通后，核对ExtensionRuntimeHost.tsx383–387实际getter、core/extension-runtime.ts方法表、editor-events和shared版本。RequestHost实现五个字段：apiVersion1.0.0、原权限数组、events权限下23事件、windows权限下native/dialog/overlay以及权限先后顺序reduce方法表的34方法；重复权限保留permissions原数组但不重复方法。复用现有editorEventNames，查询不调用业务宿主，权限/认证/会话存活规则不变。这里承接旧版getter的协议权限语义，不表示服务一定已绑定；缺服务方法继续明确失败。

新增测试直接读取legacy真实方法表和事件列表，核对单权限、runtime组合、重复权限、128组固定种子乱序子集、全权限、参数伪造、会话替换权限缩减、失效token/关闭及无storage/drop副作用。三个宿主目标构建通过，extension-capabilities/request-host/session-host三项CTest全部通过0.20秒，来源813文件及diff检查通过。正式Editor的执行引擎、原生窗口/表单实际呈现仍未接线，本阶段不改变正式exe，不把协议查询当成生产扩展迁移完成。整体INCOMPLETE，阶段保存推送dev。


### 2026-11-11：扩展表单状态与文件消息链路

沿ExtensionDialogForm.tsx及真实组件测试、platform/extension-file.ts提取并实现FormState：节点默认/草稿/visibleWhen、depth8与各容器子项上限、busy/disabled门禁、action/extra/values/requestId覆盖顺序、toggle与slot context动作、匹配回执清草稿解锁、普通推送不解锁、不重放文件保存。15秒初始化超时、加载错误、retry清pending但保sequence，原生generation阻止旧执行器消息。文件上传保留槽动作/名字/MIME/bytes、single/16项16MiB限制；只有用户动作匹配结果才验证并交付保存服务，名称120/非法字符/12MiB/整数bytes限制，取消和失败更新status并解锁。

回归覆盖旧版已有初始化/编辑提交/数字零/依赖显示/上传槽/导出取消失败及不重放，额外busy、旧generation、重试sequence、UTF16输入64和16文件边界。最终目标构建成功，extension-form-state实际0.02秒通过；来源815文件及diff检查通过。此阶段仅完成表单状态和文件消息协议，没有控件渲染/图片/选择器或扩展执行器接线，未将其声称为完整原生表单迁移。正式exe无变更，整体INCOMPLETE。阶段保存推送dev。


### 2026-11-11：扩展表单基础原生控件与正式窗口验收

沿ExtensionDialogForm.tsx与原组件测试，FormWindow复用FormState、PixelDialog、PixelEntry、ScriptNumberEntry、PixelDropdown、PixelCheckbox、PixelButton及滚动条，承接基础文本/数字/下拉/开关/按钮/choice/file服务入口，column/sidebar/slot/row/split布局、状态/超时/重试/关闭，图标直接使用legacy导入close素材。动作队列由pump发送，避免回执重建控件发生在控件回调中；文本/数字按键保留控件，idle pump不重复布局重绘。正式唯一exe增加--extension-form-check，创建实际窗口并检查草稿编辑→点击→busy禁用→匹配回执清草稿解锁→宿主关闭。

首轮矩形offset模板参数编译错误已修正，初次失败log保留；随后唯一正式Release构建通过，extension-form-ui0.70秒及extension-form-state0.02秒通过，来源816文件及diff检查通过。实际查看build/Release/extension-form-smoke.bmp，控件/字体可见，截图捕获在busy绘制阶段，不作为解锁后画面的证明，解锁以实际状态断言为证。图片、嵌套dialog、工具提示、context指针入口、原生文件选择器/保存适配及扩展执行器/正式UI入口仍未完成；未知控件明确显示未迁移状态，不声明完整表单领域完成。正式exe已更新，无preview，整体INCOMPLETE，阶段保存推送dev。


### 2026-11-11：扩展表单原生文件选择与原子保存

对照ExtensionDialogForm file分支、platform/extension-file.ts及platform_dialogs.rs347–390，FormFiles绑定默认Windows打开/保存对话框，FormWindow默认使用该服务。取消打开返回optional空值不发送空上传；默认gif/png/webp、多选开关及accept常见MIME/后缀过滤，读取只交付name/MIME/bytes，16文件/16MiB在元数据和流读取期间双重限制，失败显示form status。导出先校验frontend名称120/12MiB，承接平台UTF8名称240、control字符及1..16 ASCII字母数字扩展名约束；每次让用户选择目的地，复用writeBinaryFileAtomic与覆盖确认，匹配回执一次保存规则不变。

首轮缺cwctype编译错误已修正并保留log。最终唯一正式Release、文件/状态目标构建成功，extension-form-ui0.69s、files0.06s、state0.02s全部通过。文件测试注入chooser结果，实际读取中文文件、多选、空取消、超限/缺失拒绝、名称失败先于chooser、原子写入以及FormState匹配回执/重放不二次写盘；没有人工对话框验收。来源818文件与diff检查通过。文件读取/chooser仍同步，图片/嵌套弹窗/tooltip/context及正式扩展执行器接线未完成，不宣称表单全量完成。正式唯一exe更新，无preview，整体INCOMPLETE，阶段保存推送dev。


### 2026-11-11：扩展表单PNG图片实际渲染

对照ExtensionDialogForm image分支和styles.css4561，新增内存PNG data URL解码，显示尺寸默认48/有限数字clamp16..512，contain居中与nearest像素采样。复用已有Skia PNG codec、uploadRgbaRegion和原生SrcOver，不落磁盘或读取外部URL。缓存按source复用，节点移除后释放；失败只设置预览错误，不改变FormState busy/pending。原生显式工作预算32MiB编码及16Mi像素，在解码目标分配前检查。

首轮缺WinRT集合头编译错误已修正，保留失败log。最终唯一正式Release及image测试构建通过；extension-form-ui0.69s/image0.03s/files0.06s/state0.02s四项通过，来源821文件与diff检查通过。生成2x1PNG逐像素验证opaque红/alpha128绿，默认/上下限/小数/非数字尺寸及错误URL/base64/PNG拒绝。实际查看build/Release/extension-form-smoke.bmp，图像显示、最近邻边界及半透明背景叠加可见；busy截图不证明解锁后画面。图片解码与上传仍同步，大图/多图总缓存预算及后台解码尚待完善；嵌套dialog/tooltip/context与正式扩展执行器仍未完成，不声明全量表单或扩展完成。正式唯一exe更新，无preview，整体INCOMPLETE，阶段保存推送dev。


### 2026-11-11：扩展表单槽位右键与提示

按 ExtensionDialogForm 的 slot/onContextMenu、FormCopy 与 labelHint 接入原生鼠标过滤器：仅处理当前窗口可见视口中的右键，子控件事件也能触发所属槽位，嵌套槽位优先内层；FormState 保持忙碌/禁用校验、发送旧草稿快照后清空草稿的既有语义。复用现有 MIT Aseprite ui/tooltips API，按钮、字段及绘制标签提供完整名称和 tooltip，表单重建先销毁提示管理器以取消悬挂目标/计时器，再释放旧控件。无逐鼠标移动重建。

唯一正式 Release 构建通过；extension-form-ui/image/files/state 四项全部通过（0.87秒），实际窗口回归验证子按钮目标右键、草稿清空、busy拒绝以及组合提示文本。来源覆盖821文件、diff检查通过。实际查看 extension-form-smoke.bmp：控件/图片可见，截图仍捕获busy绘制阶段，解锁以状态断言为证；尚未通过真实悬停截图验收提示窗口，也未完成所有1×/2×边界布局。嵌套dialog、槽位描述排版和正式扩展执行器接入仍未完成，整体INCOMPLETE。


### 2026-11-11：扩展嵌套表单原生窗口链路

对照 ExtensionDialogForm dialog/createPortal、共享 values/send、标题取消以及 generic condition dialog 测试，dialog 节点创建独立 PixelDialog，全部层级共享根 FormState 和延迟消息队列，不启动额外扩展会话。子表单输入/选择/提交、文件和槽位动作沿用同一控件实现；compact/default 初始尺寸、滚动、标题、关闭图标复用现有原生组件。模型保留同 ID 窗口位置/尺寸，移除节点时关闭窗口；宿主关闭递归清理子窗口。父表单有 prompt 时禁用其字段与关闭/完成按钮；子窗口关闭发送 dialog.action，不立即删除窗口，匹配返回模型后移除。子窗口 resize 由根 pump 递归处理。

首轮正式 Release 构建与 extension-form-ui/image/files/state 全部通过（1.02秒），实际查看 extension-form-prompt-smoke.bmp，紧凑弹窗标题/字段/确定可见；截图捕获编辑前绘制，不作为草稿文本证明，草稿以消息断言为证。新增递归双层窗口与宿主关闭验证后再次构建检查，结果见后续记录。仍欠几何持久化、完整 backdrop/焦点阻挡、所有表单排版及正式扩展执行器接入，不把本阶段声明为全量扩展迁移完成。

最终唯一正式 Release 构建成功；双层嵌套/递归宿主关闭、输入提交、标题取消、匹配回复移除及原表单场景全部通过；四项 CTest 共1.09秒。来源覆盖821文件且证据快照校验通过，diff检查通过。用户 editor_support.h 差异保持未提交。阶段提交推送dev，整体INCOMPLETE。


### 2026-11-11：扩展嵌套表单输入隔离与焦点恢复

对照 ExtensionDialogForm 的 modal-backdrop、onPointerDown/onFocusCapture 隔离和 ModalShell 控件焦点规则，原生适配在父控件处理前过滤被覆盖表单的鼠标按下/抬起/双击/滚轮与键盘按下/抬起，重定向至当前最内层提示。活动提示顺序采用模型出现顺序而非 map 的字典序；独立原生下拉/编辑菜单仍走现有菜单事件循环。模型重建按字段ID恢复焦点，不持有销毁后的控件指针；移除提示后恢复父表单焦点。仅重建/被阻挡事件调整焦点，不在空闲pump里重复抢焦点。

唯一正式Release构建成功；extension-form-ui/image/files/state 四项通过（1.07秒）。原生窗口检查验证父表单wheel/key被消费、推送模型保留提示及输入焦点、双层提示阻挡外层输入并聚焦内层字段；此前提交/取消/清理回归一并通过。来源821文件证据验证与diff检查通过。本轮未修改绘制几何，未新增手动悬停/拖动截图验收。仍有整个编辑器背景模态、持久化尺寸/位置、完整表单布局和正式扩展执行器接入缺口；整体INCOMPLETE，阶段提交推送dev。用户editor_support.h差异保留。


### 2026-11-11：扩展表单草稿条件即时刷新

核对 ExtensionDialogForm values/defaults/render visibleWhen 后，将文本、数字、下拉草稿更新统一连接实际原生控件。FormState renderedIds 使用实际根200/子100、split2/slot16及depth8上限收集可见结构；编辑前后结构一致不重建，变化时延迟到根pump重建全部关联表单，包含跨主表单/嵌套提示依赖。恢复同文本输入字段的焦点、caret和反向选择，不对每次按键重建控件。异步返回模型仍沿用原有草稿重置规则。

正式Release及状态测试构建成功；四项extension-form-ui/image/files/state全部通过（1.15秒）。真实原生控件回归覆盖嵌套文本条件显示/隐藏、焦点和所选文本保持、普通连续编辑控件身份不变；状态检查覆盖数值条件揭示子树。来源821文件证据和diff检查通过。没有新增性能基准或人工图像验收，不宣称所有表单输入/布局完整。

正式执行器调查确认SessionHost/RuntimeDirectory/WindowRouter未接Editor，旧版使用浏览器JS/HTML。已请求用户决定无浏览器QuickJS与原生界面映射方案，架构决定未回复前不引入新引擎；此选择依据仓库迁移规则，不恢复WebView2。整体迁移INCOMPLETE。当前完成草稿条件链路阶段保存推送dev，用户editor_support.h差异保留。


### 2026-11-11：扩展表单PNG后台解码

沿用 ExtensionDialogForm 的PNG data URL/默认尺寸/contain/透明度语义，保留已验证Skia decoder和单图预算；将Base64转换和PNG解码移到不引用widget/surface的后台线程，独立初始化/释放WinRT MTA。promise-backed future不在析构时join，事件线程pump零等待接收结果后上传surface，每窗口同一时间仅一个解码。删除源或宿主关闭取消发布，结果失效不访问销毁窗口；同源缓存和失败缓存保留，等待图像时不误报解码失败、不解锁表单请求。

唯一正式Release及image测试构建成功，四项extension-form-ui/image/files/state全部通过（1.11秒），异步解码逐像素RGBA一致、错误future传递和取消token验证通过，实际窗口包含原图片/输入/动作/嵌套弹窗全链路回归。来源821文件与diff检查通过。本轮没有大图FPS/关闭延迟基准或新截图验收；像素上传仍在UI线程、多图总缓存预算/全局并发上限待完善，不能称所有图片性能问题关闭。QuickJS架构选择仍待用户回复，整体迁移INCOMPLETE；阶段保存推送dev，保留用户editor_support.h差异。


### 2026-11-11：扩展表单分片上传与取消结果隔离

PNG后台解码完成后保留像素及私有surface，每次pump最多上传262144像素，整图完成后才发布可绘制surface；同一窗口解码/上传串行，源移除立即丢弃待上传像素，关闭宿主清空暂存。模型重建先于图片发布，避免给已移除节点上传。修复源移除后立即重新加入时旧取消任务异常把新缓存标失败的问题：取消结果全部丢弃，后续正常重新解码。

新增实际1024×1024 RGBA PNG正式窗口回归，验证多pump上传完成与已有小图/表单/嵌套链路；最终唯一Release构建成功，extension-form-ui/image/files/state四项通过（1.36秒），来源821文件及diff检查通过。回归证明上传分片与完成状态，不证明帧率上限或最坏分配耗时；surface分配仍同步，多图总缓存及全局任务预算尚未完成，无新增人工截图验收。正式扩展执行器QuickJS架构选择仍待用户回复，整体INCOMPLETE。阶段保存推送dev，保留用户editor_support.h差异。


### 2026-11-11：扩展表单槽位/选项说明与分隔呈现

核对 ExtensionDialogForm 的 slot heading/description、choice label/description/selected、separator 以及 column/sidebar 分支，补齐槽位说明和双行可点击选项按钮、真实分隔线、选择状态和完整提示。ChoiceButton复用PixelButton材质/事件，两行共用同一点击范围，原生28px专用几何在UI规范登记（10px字、2px行间、上下3px）；普通按钮保持20px。column/sidebar不再绘制旧版没有的额外可见标题。绘制标签使用与控件同一布局保存的坐标并逐标签裁切，避免长标签画进相邻控件，说明计入滚动高度。

唯一正式Release构建成功，四项extension-form-ui/image/files/state通过（1.34秒）；实际窗口回归验证槽位文本、选择说明完整提示及selected、分隔节点和既有输入提交。查看extension-form-prompt-smoke.bmp确认双行选项与分隔线可见且未重叠，截图为此前绘制的initial草稿，不作为新草稿证明。来源821文件与diff检查通过。尚缺row align、下拉选项description、持久化几何、全局背景模态及正式执行器，不宣称所有表单排版等价。QuickJS架构选择仍待用户回复，整体INCOMPLETE；阶段保存推送dev，用户editor_support.h差异保留。


### 2026-11-11：扩展下拉说明与选项映射

对照ExtensionDialogForm options.filter/slice100和ThemedSelect tooltip/check/moveSelection，过滤非字符串description，保留合法选项的label/value/description索引一致。共享PixelDropdown新增可选optionTooltips与markSelectedOption，默认不改变其他调用方；菜单使用现有MIT TooltipManager和PixelMenuItem checked，勾选图标绑定现有menuMarks并复用legacy utility-icons/check.png，不新增图标。菜单局部提示管理器先于菜单销毁，完整说明为“label — description”。

共享头变更触发正式全量重编译，持续观察同一活跃进程后成功；补齐勾选素材引用后的最终增量Release构建成功。四项extension-form-ui/image/files/state通过（1.36秒），实际控件检查坏description过滤、完整提示内容、键盘选择与draft/依赖显示值对应，既有表单链路通过。来源821文件及diff检查通过；未人工打开/悬停菜单截图验收，不把提示字符串检查称为完整菜单交互验收。完整row align、几何持久化和正式扩展执行器仍待完成，QuickJS选择仍待用户答复；整体INCOMPLETE，阶段保存推送dev，用户editor_support.h差异保留。


### 2026-11-11：扩展表单嵌套循环生命周期保护

原生PixelDropdown::showOptions与文件选择器使用嵌套事件循环，表单timer可能重入pump并销毁仍在执行的控件。根窗口记录modal调用深度，菜单popupStateChanged/文件chooser调用期间暂缓重建和动作分发，宿主关闭记为待处理，返回安全pump后执行；文件chooser若关闭已请求不再发送上传。根pump加入RAII重入保护，避免send/save回调内再次pump重建。子prompt共享根门禁，原有busy协议保持。

首轮局部root变量遮蔽成员函数编译失败已改this->root；两次尝试实际showOptions的自动回归未进入popup打开回调，分别失败于未执行检查，保留日志。最终回归调用实际popupStateChanged生命周期函数注入推送与pump，验证持有期不销毁控件，释放后再重建并保留键盘映射；这不是实际菜单嵌套循环验收。最终唯一Release构建成功，extension-form-ui/image/files/state四项通过1.34秒，来源821文件及diff检查通过。真实菜单停留/关闭及chooser期间宿主关闭仍需进一步实机验证，不声称相关生命周期全量完成；整体INCOMPLETE。阶段保存推送dev，用户editor_support.h差异保留。


### 2026-11-11：扩展文件选择关闭与回执重入链路

接收模型/匹配导出回执也持有根modal深度，覆盖导出save回调中再次pump/关闭的重入；已请求宿主关闭时不再接纳新模型或chooser上传，chooser错误同步控件使能。根pump回调内宿主关闭延后，子prompt在根正常重建时仍允许安全关闭，避免删除子窗口却未关闭原生窗口。

新增实际FormWindow文件按钮回归，chooser结果注入期间推送空模型、pump、宿主关闭并返回真实结构File，验证控件保留到回调结束、关闭延后、无上传/会话残留。初次临时窗口栈分配回归崩溃，改堆分配并修正上述子窗口关闭条件后最终正式Release构建与四项extension-form-ui/image/files/state通过（1.35秒）；未独立定位崩溃栈，不能把推测栈原因当结论。来源821文件与diff检查通过。chooser是注入返回，未人工操作OS对话框；前阶段真实下拉打开未进入回调原因仍未定位，不宣称已完成该验收。整体INCOMPLETE，阶段保存推送dev，用户editor_support.h差异保留。


### 2026-11-11：真实下拉菜单生命周期验收闭环

追查此前showOptions未进入回调的假象，新增isEnabled断言确认触发器启用，实际原因是外层50ms smoke timer在原生菜单嵌套循环中重入同一phase：第二次showOptions因open_保护返回，第二个局部checkedPopup未执行而误报。测试在真实showOptions期间暂停外层timer，保留独立popup timer关闭菜单；在实际popupStateChanged(open)推送当前模型并pump，断言原下拉实例未销毁，关闭后pump再构建并继续键盘选择/条件显示/提交链路。产品代码未绕过菜单保护，无重复假回调。

最终唯一正式Release构建成功，extension-form-ui/image/files/state四项通过（1.39秒），真实菜单打开/回调/关闭和其余表单链路均执行通过；来源821文件及diff检查通过。本轮补强前阶段缺失证据，不声称人工悬停tooltip截图或OS chooser验收完成。完整软件迁移仍INCOMPLETE，QuickJS架构选择仍待用户回复，阶段保存推送dev；用户editor_support.h差异保留。


### 2026-11-11：扩展表单行与分栏自适应

核对ExtensionDialogForm.tsx的row/split与styles.css4544–4579：align=end是底部对齐，非右对齐。原生按可见子项布局，不为隐藏项分宽；end按钮使用文字测宽，默认行居中，按整项换行；含toggle行以180px最小列宽自适应分行。split正文宽480及以下堆叠，宽窗左列至少140px、其余按1:2分配。相关间距采用原生规范2px，分栏6px。统一移动控件、绘制标签、tooltip目标和slot命中区域。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.40秒。新增正式窗口验证隐藏项不占位、不同高度按钮底部对齐、宽窗分栏比例、窄窗分栏/toggle换行、resize后草稿和按钮动作对应。来源821文件与diff检查通过；未新增人工图像验收或FPS数据，不宣称整体卡顿解决。slot完整布局、sidebar响应布局、正式扩展执行器等仍未完成，QuickJS架构选择仍待回复，整体INCOMPLETE。用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：扩展槽位操作与侧栏响应布局

依据ExtensionDialogForm.tsx slot/sidebar及styles.css4552–4580，槽位增加皮肤panel/border分组、6px内边距、共享标题/右侧说明行（说明35%宽），操作沿已验证row并排和窄窗整项换行；隐藏动作不分配空间，整体context范围覆盖分组并沿既有内层优先。sidebar宽窗纵列和右分隔，窄窗连续choice两列、其他节点整行与底分隔。修复split/sidebar断点取整个表单正文宽，避免宽窗内窄子栏错误触发容器断点。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.41秒；实际控件检查两动作并排、隐藏动作、窄侧栏两列/宽侧栏纵列、resize草稿与slot动作映射，既有右键及嵌套表单链路仍通过。来源821文件及diff检查通过。查看extension-form-smoke.bmp确认槽位标题/说明/按钮分组无重叠；该图仍为busy阶段，不用于证明解锁，未新增侧栏截图或FPS测量。长文本换行、完整输入字段排版、几何持久化、全编辑器模态及正式扩展执行器仍有缺口；QuickJS架构决定待回复，整体INCOMPLETE。用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：扩展字段上下排版与文本编辑限制

对照ExtensionDialogForm input/number/select与FormField默认stacked，将原横排字段改为10px标签、2px关联间距、20px控件，绘制/tooltip/布局共用保存坐标，滚动高度包含标签。输入复用MIT ui::Entry setMaxTextLength64，局部TextEntry在实际onChange按UTF16单元校验，避免补充平面字符跨64边界被拆开；模型初始化setText保留原值。数字/下拉不错误套文本长度限制。

首轮测试键码名称编译错误已修正；随后UI断言失败因focus已有选区而模拟追加实际替换选区，显式deselect修正测试前置。失败断言exit伴随清理segfault未独立定位，保留日志，不冒称产品崩溃根因已解决。最终唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.41秒；实际按键验证UTF16上限、补充平面字符边界、满长拒绝与选区替换，已有显隐/焦点/caret/草稿/resize链路通过。查看extension-form-smoke.bmp确认上下字段及槽位无重叠；截图busy阶段不证明解锁。来源821文件及diff检查通过。未人工验证IME/粘贴全路径与性能；数值标签scrub、长文本换行、几何持久化和正式执行器等仍未完成，整体INCOMPLETE。用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：扩展文案省略与重排恢复

核对ExtensionDialogForm FormCopy、styles.css4623–4635及complete translated label overflow测试，确认旧版文案为单行ellipsis/full tooltip，未擅自改为自动换行。原生标题/文本/字段标签在build缓存适配宽度copy，局部FormButton在resize缓存，ChoiceButton两行各缓存可见文案；绘制复用PixelButton材质与原事件，完整caption和tooltip保持。避免paint重复UTF转换与长文案省略测量，窗口扩大重新计算并恢复全文。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.39秒。实际窗口回归窄窗德文长标题/文本/按钮省略、显示测宽、完整按钮提示、扩大恢复全文，原有动作草稿/图片/菜单/嵌套链路通过；来源821文件及diff检查通过。无新长文案人工截图/悬停或FPS测量，不能宣称全部性能优化完成。下拉/复选框溢出完整核对、数值标签scrub、几何持久化、全编辑器模态与正式扩展执行器仍待完成，整体INCOMPLETE。用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：扩展数字标签拖动调值

依据FormField.tsx begin/update/endScrub与NumberInput.tsx adjustByPixels/normalize，数字字段标签接入左键capture拖动，物理位移转换逻辑像素，step1/Shift10、上下限、disabled/readOnly检查。复用ScriptNumberEntry value/sync/changed和共享FormState草稿，不额外发送动作。标签捕获期间pump暂缓重建，松开后处理模型更新，避免控件在拖动栈上销毁；按ID解析数字字段不保留跨重建裸指针。

首轮合成鼠标事件缺display/recipient导致UI检查segfault，补齐事件上下文后专项通过；去掉临时诊断后的最终唯一Release构建成功，extension-form-ui/image/files/state四项通过1.33秒。实际鼠标回归覆盖普通步进/草稿、Shift加速/clamp上下限、拖动中推送模型控件存活、释放重建、禁用标签不capture。来源821文件及diff检查通过。无绘制几何变更/新增人工截图或FPS测量；悬停拖动指针素材及失捕获更广实机验收仍待核对，正式扩展执行器与其他迁移缺口仍未完成，整体INCOMPLETE。用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：嵌套扩展提示窗口几何持久化

依据ExtensionDialogForm dialog storageKey、ModalShell与panel-preferences load/save/remap，增加根表单configurePromptGeometry原生配置入口，按extension/node/compact键隔离嵌套窗口记录；相对显示区域的逻辑位置/尺寸/旧viewport写入JSON，复用已有panel_docking响应映射和atomic_file写入。resize仅标记，根pump合并写盘；关闭/节点移除保存，读取损坏/超1MiB回默认，写入失败保留诊断且允许关闭。正式扩展执行器未接线，不能将此配置入口称作生产扩展宿主已完成。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.41秒；实际窗口写盘后移除/重读/重新创建恢复相同几何，另一扩展身份不复用同记录，原有嵌套/菜单/文件/输入链路通过。来源821文件及diff检查通过。未新增多显示器实机/缩放变更截图和故障注入，首开fitContent、完整屏幕变更通知与正式执行器仍有缺口，整体INCOMPLETE。用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：扩展提示内容高度与手动尺寸衔接

依据ModalShell initialModalPosition/fitContent/fitContentKey及floating.clearHeight，嵌套提示初次按实际内容适高，保留标题/正文/底部间距及屏幕上限；手动改变高度后固定，compact子节点模型变化重新清除固定高度并适配。自动高度不写显式height，普通提示保留手动持久化高度，compact重新打开按旧版clearHeight处理。修正普通prompt最小240px、compact120px，统一复用最小尺寸计算。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.35秒，新增实际窗口验证空/短内容最小高度、手动尺寸保持、compact内容增长与移除重算；原有普通提示实际写盘重开及全表单链路通过。查看extension-form-prompt-smoke.bmp，字段/分隔/确认按钮可见无重叠，初始草稿截图不证明后续编辑值。来源821文件及diff检查通过。首开宽度compact ratio、完整屏幕变更通知、正式扩展执行器等仍未完成，不宣称全量迁移；整体INCOMPLETE。用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：提示窗口可用区域响应与拖动存储节流

依据ModalShell compactDefaultDimension(.88)、viewport限制与panel-preferences响应映射，首次宽度387px并遵守屏幕留白；prompt pump在display区域变化时复用既有坐标映射、裁剪宽高并限制位置。最小尺寸受可用区域约束，避免极小区域与共享PixelPopupWindow强制尺寸冲突。鼠标capture期间暂缓几何写盘，关闭强制保存最终记录。

首轮UI检查进入启动错误框并超时，读取对话框确认Prompt viewport remap/clamp断言失败；定位共享setBounds强制常规最小尺寸与小viewport冲突后修复，保留低于常规最小尺寸的250×190逻辑像素回归，未放宽断言。最终唯一正式Release构建与extension-form-ui/image/files/state四项通过1.43秒，来源821文件与diff检查通过；检查默认比例宽度、实际布局小viewport可见范围与恢复及原有几何/表单链路。无多显示器实机/FPS测量，不宣称坏记录全部故障注入已完成。正式执行器及其他迁移缺口仍INCOMPLETE。用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：表单拖动捕获关闭与宿主隔离

对照FormField endScrub/pointercancel及独立ExtensionDialogForm生命周期，数字标签失capture后清除drag状态，宿主关闭先取消其自身/嵌套提示捕获。原pump按任意NumberLabel捕获全局阻挡，现限定同根表单目标，其他host可继续接收模型/构建；独立host关闭不释放他者捕获。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.44秒。实际鼠标检查失capture停止调值与重新开始、拖动期间另一host构建关闭、嵌套prompt拖动中host关闭无捕获/会话/提示残留；来源821文件及diff检查通过。本轮无绘制几何变化或新截图/FPS证据，正式扩展执行器及其他迁移缺口仍INCOMPLETE。用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：表单默认值显示转换与禁用一致性

对照ExtensionDialogForm Number.isFinite(Number(value))、Boolean(value)与disabled，数字显示补齐null/bool/字符串/数组转换、空白/radix和非有限回退1；原始defaults不改写，visibleWhen仍严格类型比较。toggle按真值显示，非布尔disabled显示与FormState操作拒绝统一。转换限定显示适配，不将脚本模型默认值擅自规范化。

唯一正式Release与状态目标构建成功，extension-form-ui/image/files/state四项通过1.37秒。状态表格检查undefined/null/bool/空串/科学计数/radix/非法后缀/非有限/数组/对象；实际控件验证字符串数值显示、字符串toggle真值、disabled、raw条件不误显示、编辑后显隐及提交数字草稿。来源821文件与diff检查通过。无绘制几何变化/新截图或FPS测量；完整JavaScript引擎/生产扩展入口仍未完成，不将转换辅助函数视为执行引擎替代。整体INCOMPLETE，用户editor_support.h差异保留，阶段保存推送dev。


### 2026-11-11：表单默认值收集复用与批量字段检查

对照ExtensionDialogForm collect(defaults)/visibleWhen，把原每次effectiveValue/shown/control都收集全树默认值改为接收模型时一次收集，保持原depth8、后值覆盖、nullish草稿回退和严格条件语义。编辑/重试/回执仍读取当前草稿，接收新模型替换默认值。可见性遍历保持原实现，尚未完成可见节点索引优化。

本轮可见节点map索引尝试导致正式UI不稳定访问冲突，分步日志位置不固定；Windows调试事件捕获故障，但符号不足以可靠定位，不能当作已查明根因。撤回该尝试后仅默认值缓存与现有遍历通过完整回归。最终唯一正式Release及状态目标构建成功，extension-form-ui/image/files/state四项通过1.77秒，新增200根×100子节点的20k字段默认值/编辑覆盖/重试恢复检查；来源821文件与diff检查通过。无人工截图/FPS测量，不宣称表单性能全量完成。可见节点索引仍未完成，整体迁移INCOMPLETE。保留用户editor_support.h差异与诊断日志，本阶段已验证部分保存推送dev。

### 2026-11-11：表单布局复用本次可见 ID 集合

对照既有 ExtensionDialogForm 可见性遍历与原生 FormState::renderedIds，FormWindow 每次 build 只收集一次可见 ID，以局部 set 供普通节点、row/split/sidebar 过滤与递归布局复用，移除每个节点重新扫描模型的 shown 调用。集合不跨模型持久化，不缓存 JSON 节点对象，嵌套窗口独立构建；保留节点数量、深度、条件与重复 ID 的既有语义。此前持久节点索引访问冲突未据此定位或宣称修复。

唯一正式 Release 构建成功；extension-form-ui/image/files/state 四项通过1.85秒，新增真实1000按钮窗口检查首末控件、缩窄后末项保留、空模型替换清除旧控件。来源覆盖检查821文件已通过，diff检查通过。没有人工图像验收或CPU/FPS测量，性能结论限于移除布局中的重复可见性遍历。色板同步资源与全部引用的用户确认行为已于2026-11-10实现并在后续资源逐行替换阶段复验，本轮未重复改动。正式扩展执行器及其他迁移缺口仍INCOMPLETE，保留editor_support.h及已有日志/缓存，阶段保存推送dev。

### 2026-11-11：扩展图片总工作预算与窗口注销

依据ExtensionDialogForm image PNG data URL/contain语义，保留原单图32Mi编码/16Mi像素限制；补齐必要原生适配，进程共享512Mi工作预算。后台解码一次预留保守编码副本和CPU/上传像素缓冲，额度不足仅后台等待，每20ms检查取消；不持有部分额度等待另一额度。结果携带RAII预算，上传后缩到实际表面像素，缓存移除/关闭释放；关闭同时取消并释放future结果，像素先销毁再返还额度。预算是保守准入，不等同实际进程RSS，不能限制模型本身的JSON文本和任意数量等待线程；跨窗口同源仍独立缓存，完整扩展生产执行器仍未迁移。

正式UI初测访问冲突；构造指针初始化/布局保护未单独解决，未当作根因。补正式Release main调试符号后调用栈定位Widget::getDrawableRegion，经Aseprite MIT ui/window.cpp setDisplay/destructor、manager关闭与widget区域计算核对：未打开表单手动注册display，但析构没有manager可负责注销，留下悬空窗口。现未挂载窗口析构显式setDisplay(nullptr,false)，已打开窗口仍交manager关闭；新增实际display窗口数加一/析构恢复/随后invalidate回归。未复制Aseprite源码，沿用公开API生命周期。此前持久JSON索引失败不能据此宣称根因相同。

最终唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.92秒；新增预算竞争/等待取消/额度缩减唤醒/缓存释放/超限拒绝及实际解码lease检查，原实际图片分批上传、模型替换、嵌套提示和关闭回归保持通过。来源821文件及diff检查通过。调试符号仅本地生成工程设置，未提交生成物；诊断日志保留，源码临时追踪已清除。没有人工图像验收或CPU/FPS/RSS测量，整体迁移仍INCOMPLETE，保留editor_support.h差异；阶段保存推送dev。

### 2026-11-11：扩展选项长文案与数字标签指针

对照ExtensionDialogForm select/toggle全文值与FormField scrubbable状态、styles.css3054旧版ew-resize，原生表单复用既有复选框/下拉框与旧版指针素材。复选框按文字区宽度缓存省略文案，下拉显示按完整caption和宽度缓存，绘制暂时使用省略副本，原caption/选项值/描述提示不改；窗口扩大恢复全文，键盘选项切换立即刷新显示与草稿。主窗口统一指针路由优先识别FormWindow数字标签，捕获拖动离开标签仍维持ew-resize，disabled/readOnly回普通指针，不引入替代素材。未调整整体字体、布局或表单操作语义。

唯一正式Release构建通过，extension-form-ui/image/files/state四项通过1.91秒，新增Unicode长选项/复选框窄宽切换、全文caption/选项描述保留、键盘变更值与显示，以及数字标签enabled/disabled指针判断；正式--cursor-apply-check实际退出0验证已有素材系统句柄转换。来源821文件与diff检查通过。无新增人工图像验收或FPS测量，菜单弹出内容的超屏幕长文案等未据此宣称全量迁移，生产扩展执行器与整体迁移仍INCOMPLETE。保留editor_support.h差异、用户日志/缓存，阶段保存推送dev。

### 2026-11-11：扩展表单用户退出统一资源清理

核对ExtensionDialogForm onClose及卸载生命周期，原生完成/Esc/title-close原先只关闭FormState/窗口，保留图片future、上传和缓存直至对象销毁；现与host关闭共用closeFromHost清理任务、future、上传、缓存及排队动作。userClosePending在实际关闭后发出一次用户回调，host主动关闭不发用户回调；既有busy/嵌套prompt阻挡、菜单/文件回调延后关闭保持。closing幂等拒绝重复关闭；回调复制到局部后调用，避免回调释放宿主时继续读取成员。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.98秒。实际窗口新增pending PNG解码中Escape/title-close退出，检查回调一次、会话关闭、无父窗口、future/上传/缓存清空、重复host/title关闭不重复通知；既有菜单/chooser延后关闭与捕获清理检查通过。来源821文件及diff检查通过，无人工图像验收/FPS测量。重试中的生产执行器重建、全编辑器modal隔离与整体迁移仍INCOMPLETE。保留editor_support.h及日志/缓存，本阶段保存推送dev。

### 2026-11-11：扩展表单重试代际与回调生命周期

核对ExtensionDialogForm retry：清空loadError/loaded/busy/values/pending，generation递增，保留view/images，ExtensionWindow按key重建。原生保留同样模型/图片/默认值，retrySession清除上一代未dispatch动作，连续等待点击合并，restart回调延至guarded pump执行，避免button事件栈同步重建控件。回调同步receive/pump由已有重入保护约束，host关闭延后处理；std::exception/未知异常转loadFailed允许后续重试。没有将未接入的正式JS执行器称作已完成，不取消仍有效的保留图片缓存。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.92秒；新增实际按钮连续重试只增一次generation、草稿/busy重置、旧排队动作丢弃、同步模型恢复、旧generation拒绝、异常恢复与回调请求关闭回归；既有15秒状态超时与全部表单检查保持通过。来源821文件/diff检查通过，无人工图像验收/FPS测量。生产执行器重启接线、全编辑器modal隔离及整体迁移仍INCOMPLETE。保留editor_support.h及用户日志/缓存，阶段保存推送dev。

### 2026-11-11：扩展消息多行布局

核对ExtensionDialogForm message与styles.css extension-form-message white-space:pre-wrap/overflow-wrap:anywhere/line-height1.6，原生message从普通20px单行省略分支独立出来。按可用宽度缓存消息行，保留显式空行、连续空格、CRLF；普通空格优先断行，无可用断点长字符串逐字折行，Fusion10px字体使用16px行距，消息高度进入原有布局/scroll/fitContent。宽度变化沿既有build重排，不在每次paint重新测量整段文字。tab暂按8空格展开，完整浏览器制表位、组合字符/Unicode断行和双向排版等价仍未验证，不把近似当作完整Unicode迁移。

原计划扩大全编辑器modal隔离，核对发现旧版modal-backdrop pointer-events:none且透明，并非全屏鼠标屏障；已向用户提出完整modal新行为选择，未获答复前未擅自实现。该决定不阻塞本轮独立消息控件补齐。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.97秒，新增真实表单空行/空格/CRLF精确行检查、200字中文窄宽折行完整文本及宽度约束，既有图片/提示/重试/关闭链路通过。来源821文件与diff检查通过。未新增人工图像验收或CPU/FPS测量，生产扩展执行器、modal取舍及其他迁移缺口仍INCOMPLETE。保留editor_support.h与用户日志/缓存，本阶段保存推送dev。

### 2026-11-11：消息制表位与折行宽度一致性

接续message控件迁移，对照旧版styles.css pre-wrap且未覆盖tab-size的默认8空格制表位，去掉固定展开八空格的近似。原始消息行保留Tab，按当前行累计宽度推进至下一制表位；折行测量与实际绘制共用messageAdvance，绘制普通文本run并跳过Tab区域。英文断点搬移尾部后使用while重新判断后续字符是否超宽，避免单次判断遗漏。该适配仍使用指定Fusion字模，不宣称浏览器完整Unicode分段/双向/组合排版已等价。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.90秒；实际窗口增加Tab原文保留、首行字后/连续Tab的度量对齐，并保持空行/空格/CRLF/长中文窄宽重排与完整表单检查通过。来源821文件及diff检查通过，无人工图像验收或性能测量。完整modal产品选择和JS执行器待确认不擅自实施，整体迁移仍INCOMPLETE；保留editor_support.h与用户缓存/日志，本阶段保存推送dev。

### 2026-11-11：扩展下拉值身份、默认转换与菜单勾选

直接核对ExtensionDialogForm String(value??empty)及ThemedSelect options.find/first fallback/moveSelection/value check。原生默认值匹配补齐数字/布尔等现有diagnosticString显示转换，重复值取首标签，未匹配仍显示第一标签但保持原始值，空选项列表显示原始字符串而非空白；显示回退不写草稿。表单专用键盘按实际值的首索引移动，选择重复项后仍显示首标签并发送原字符串值，disabled不更改。表单菜单复用PixelMenu/Tooltip与modal计数，实际值相等的全部重复项显示check，未匹配回退项不勾选；不修改其他业务下拉框的共享行为。

首轮使用不存在的signal.disconnectAll编译失败，改走ButtonBase::onClick虚函数接入表单菜单；最终唯一正式Release构建成功。extension-form-ui/image/files/state四项通过1.94秒；新增真实窗口数字/布尔默认、首重复项、空列表、未匹配值不写草稿、重复值键盘、disabled及菜单勾选谓词检查。既有菜单运行循环与响应延后测试仍通过，但本轮重复值菜单实际像素/点击没有新增人工验收，不将谓词检查扩称完整弹出菜单验收。来源821文件及diff检查通过，无FPS测量。完整Unicode转换边界、超屏菜单、生产执行器及整体迁移仍INCOMPLETE；保留editor_support.h与用户缓存/日志，阶段保存推送dev。

### 2026-11-11：表单专用弹出菜单真实运行链路

核对ButtonBase::onClick/Click与PixelDropdown非虚showOptions，发现旧正式回归直接调用基类showOptions绕过FormDropdown专用值勾选菜单。现回归从专用onClick入口启动，运行真正表单菜单；menuOpen防止popupStateChanged回调递归打开同菜单。保留modal计数、异常释放、焦点恢复及模型推送不在菜单栈销毁控件。共享PixelDropdown程序入口仍提供原菜单，正式表单用户鼠标/空格进入专用onClick；不将基类程序API称作已统一。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过1.90秒。真实popup回调推送模型及pump确认控件存活，并再次打开验证重入拒绝；实际MenuItem被计时器定位，检查checked回调并触发Click后退出菜单，草稿idle写入，随后方向键tool与visibleWhen继续通过。该项使用实际原生菜单循环/控件及Click信号，不等同OS物理鼠标命中或人工像素验收；重复值勾选仍由既有谓词回归覆盖。来源821文件/diff通过，无性能测量。超屏菜单与完整生产扩展执行器等仍INCOMPLETE，保留editor_support.h和用户日志/缓存；阶段保存推送dev。

### 2026-11-11：PNG后台解码固定工作线程

继续核对Lua剩余能力屏蔽后确认document.create受非RGBA模型、io.export受生产扩展宿主完成事件限制，未擅自解除。独立补齐图片执行资源：此前startFormImage每次创建detach线程，总像素预算无法约束大量等待线程。现进程固定两个worker，FIFO任务不含UI/Surface指针，解码前检查取消；保留WinRT MTA、PNG精确RGBA、promise非join future、总内存准入及主线程分批上传。队列对象为进程生命周期，线程启动逐个计数/call_once重试，部分启动失败不释放已被线程引用的对象，也不在重试时重复生成已启动worker。队列源字符串/元数据仍未计入像素预算，不能声称所有内存均有上限。

唯一正式Release及图片测试目标构建成功，extension-form-ui/image/files/state四项通过1.89秒。新增64任务在占满预算时排队、统一取消、全部future失败完成/额度归零、后续真实PNG成功，保持实际表单退出/模型替换/分批上传回归。来源821文件及diff检查通过，无人工图像或CPU/FPS测量。线程创建故障为源码失败路径核对，未注入OS创建失败；生产扩展执行器、非RGBA等整体迁移仍INCOMPLETE。保留editor_support.h及用户缓存/日志，阶段保存推送dev。

### 2026-11-11：取消图片请求即时退出等待队列

接续固定双worker，补齐关闭/模型替换取消的源数据生命周期。FormImageTask::cancel设置token、在共享FIFO锁内移除尚未开始的同token任务，释放捕获源字符串/run闭包；promise异常在锁外完成。与worker已取走任务的竞争由队列锁分界：已取走走原协作取消，未取走只由reject完成promise，不重复发布。取消同时通知图片预算条件变量，使运行中的预算等待立即重新检查token，原20ms周期作为后备。无UI/Surface跨线程访问，future销毁仍不join。

唯一正式Release及图片测试构建成功，extension-form-ui/image/files/state四项通过1.89秒。64请求压力现在要求预算保持满额时全部取消future完成并拒绝，不再先释放预算掩盖取消停滞；随后额度归零与真实PNG恢复成功，既有窗口关闭/替换/上传检查通过。来源821文件及diff检查通过。队列未取消源数据总量仍无独立上限，不宣称解决全部内存压力；无人工图像/CPU/FPS测量。完整生产扩展执行器等整体迁移仍INCOMPLETE。保留editor_support.h及用户数据，阶段保存推送dev。

### 2026-11-11：扩展导出选择器重入与完成所有权

直接核对 ExtensionDialogForm.tsx receive：匹配结果先消费 pending/清草稿，保存完成向 current view 合并 status；普通同代推送不应丢失节点，也不应重复保存。原生同步选择器会泵事件，补齐导出完成所有权 active/generation/sequence：正常同代推送沿用旧版状态合并；重试、关闭或后续请求后，旧成功、取消、std异常、hresult异常均不得写入新状态或释放新请求 busy。保存期间维持 busy；不更改已有结果消费、文件验证、保存内容及窗口模态策略。

状态回归20组转换/结果组合：同代推送、retry带新草稿、retry带新请求、close、同代中断后新请求；每组保存内部重放原结果但只调用一次保存，新请求随后独立完成。首轮测试编译因E_FAIL未声明失败，改用明确winrt::hresult后测试构建通过。唯一正式Release构建成功，extension-form-ui/image/files/state四项通过2.02秒。来源821文件检查及diff检查通过；状态测试注入同步保存回调，不等同人工操作Windows选择器。整体迁移及生产扩展执行器仍INCOMPLETE，未自行落地待确认的JS执行器/完整modal选择。保留editor_support.h和用户数据；阶段提交并推送dev。

### 2026-11-11：扩展文件导入选择器生命周期

直接核对ExtensionDialogForm文件onChange：取消不发送、读取/编码失败写status并解除busy、有效文件经action携带name/mime/bytes。原生选择器同步泵事件，原路径在返回时只检查hostClosePending，重试后可能将旧文件发送到新会话，旧读取异常也可能清除新请求busy；同时未捕获hresult异常。统一FormState::importFiles校验有效file控件，捕获调用前active/generation/sequence，选择返回与std/hresult失败仅作用原会话；普通同代模型推送继续交给现有files校验当前控件。FormWindow维持ModalCall保护与hostClosePending关闭抑制，所有取消/选中/异常路径统一sync，不改变原文件数量、体积、命名、MIME及payload规则。

唯一正式Release及状态测试构建成功。新增20组导入转换/结果组合，覆盖推送、retry、retry后新请求、close、同代新请求与成功/取消/std异常/hresult异常；检查新请求仍可独立完成，并验证缺失/忙碌/关闭控件不打开选择器。extension-form-ui/image/files/state四项通过2.00秒，保留真实窗口选择器内部receive/pump/关闭后无上传的回归与实际磁盘多选读取/保存回归。来源821文件及diff检查通过，无人工物理选择器验收。磁盘读取仍同步，未宣称完成后台导入或整体扩展生产执行器；全体迁移INCOMPLETE。保留editor_support.h与用户数据，阶段提交推送dev。

### 2026-11-11：扩展文件批量准入与选择结果边界

直接核对ExtensionDialogForm文件入口先sum(File.size)再Promise.all(arrayBuffer)及extension-file.ts明确选择目标后原子写入。原生此前逐文件metadata/read交错，合计已超限仍会读取前面的文件；改为整批metadata检查后开流，保留读时增长16MiB上限与64KiB分块。多选最多16项内解析，空首路径/缺少列表终止符拒绝；单选使用Win32单路径协议。保存选择结果查找限定32768缓冲区内的非空终止符，避免畸形adapter结果交给无界path构造。未改变文件格式、MIME、payload或导入数量/体积规格。

唯一正式Release和文件测试构建成功，extension-form-ui/image/files/state四项通过2.05秒。新增实际磁盘空文件/16空文件/17拒绝、恰16MiB双文件/批量超限；CreateFileW持有不共享读取的句柄确认合计超限先报length_error而非开流错误，证明准入顺序。注入空/无终止/缺列表终止的选择结果及空/无终止保存目标均拒绝。来源821文件及diff通过；无人工选择器验收或界面响应耗时测量。后台磁盘读取、生产扩展执行器和整体迁移仍INCOMPLETE。保留editor_support.h及用户数据，本阶段提交推送dev。

### 2026-11-11：扩展文件后台读取与主线程完成

依据ExtensionDialogForm的Promise.all(arrayBuffer)异步读取，拆分原生FormFiles::choosePaths与read：选择器仅返回路径，单个进程生命周期后台reader执行整批metadata准入及64KiB块读取，纯路径/字节数据跨线程，不携带UI/WinRT JSON。promise future销毁不join；任务取消在metadata/文件/块间检查。正式FormWindow默认导入使用该路径，主线程pump取得结果，经ImportTicket校验active/generation/sequence后发送；读取期间busy，重试/关闭/销毁取消。读取错误及线程/入队启动失败恢复原任务状态，后续请求不受旧错误影响。已有注入chooseFiles同步适配及模态回调延迟清理继续保留。

唯一正式Release及文件/状态测试构建成功，extension-form-ui/image/files/state四项通过2.04秒。实际后台读取验证顺序、字节、命名和取消32任务后继续读取空文件；预取消read确定拒绝。状态验证busy禁用、同代推送、一次发送、旧错误不解除已发送请求、失败后新ticket身份、retry/close丢弃。既有窗口选择器内部关闭/延迟清理回归通过；没有新增真实慢磁盘+物理窗口响应测量，不把模块状态测试等同完整系统性能验收。OS阻塞read不能即时中断、取消排队项待worker取走、JSON字节数组编码仍在UI；这些和生产扩展执行器仍未完成。来源821文件/diff通过，整体迁移INCOMPLETE。保留editor_support.h及用户数据，本阶段提交推送dev。

### 2026-11-11：扩展导入JSON分批编码

延续ExtensionDialogForm Array.from(Uint8Array)的精确name/mime/bytes消息协议，补齐后台读完后一次构建全部JSON字节值的主线程长任务。FormState ImportEncoding保留读取ticket，按主线程pump推进，单次最多4096字节并检查2ms时间预算；所有文件编码完成前保持busy且不发布部分消息。FormWindow串联读取/编码/发送，重试关闭取消两阶段，错误只恢复原ticket；最终复查当前控件action/disabled及会话身份，完整结果发送一次。数量/体积/单文件检查沿用既有上限，空文件仍生成空bytes数组。

唯一正式Release及状态测试构建成功，extension-form-ui/image/files/state四项通过1.96秒。新增16385字节逐字节精确回归，17字节首次预算和后续1024预算强制跨多次推进；部分编码不能发送、完整只发送一次、重试隔离和空文件通过。来源821文件及diff通过，无人工慢磁盘/窗口响应测量；COM单次分配、释放大JSON及宿主最终序列化未保证时间上限，不声称全链路恒定帧耗时。整体迁移和生产执行器仍INCOMPLETE。保留editor_support.h与用户数据，阶段提交推送dev。

### 2026-11-11：正式窗口后台导入完整链路验收

补齐此前模块状态回归与正式FormWindow默认后台入口之间的证据缺口。新增choosePaths适配注入，仅替代OS路径选择，子提示窗同步继承；原chooseFiles兼容注入继续保留。正式程序的extension-form-ui从真实按钮Click启动后台reader，读取真实65539字节文件，经正式pump分批构造JSON并通过send回调发送。读取/编码期间receive新模型、resize及dispatchMessages继续运行，至少16次pump且发送一次；逐字节核对文件name/MIME/长度/内容及action，匹配回复解除busy，再启动导入后关闭无后续发送且窗口已注销。未以直接调用finishImport代替窗口链路。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过2.15秒；来源821文件及diff检查通过。测试注入路径并使用控件Click，不等同OS物理鼠标、文件选择器人工验收或慢磁盘响应耗时测量。后台阻塞read取消时延、JSON内存/宿主序列化以及生产扩展执行器仍未完成；整体迁移INCOMPLETE。保留editor_support.h与用户数据，阶段提交推送dev。

### 2026-11-11：文件导入排队任务即时取消

继续完成后台文件导入生命周期：此前cancel只设token，尚未开始任务的future必须等待worker取出；前项OS读取阻塞会让已取消任务滞留。现在队列用token定位未开始任务，锁内移除并释放路径/reader闭包，锁外reject promise；worker取走与取消按同一锁划界，已启动走read前后及原有块间协作取消。重复cancel不重复完成promise。单个共享线程及promise future不join保持不变，纯C++reader可注入确定性测试。

唯一正式Release及文件测试构建成功，extension-form-ui/image/files/state四项通过2.07秒。新增worker由promise gate确认已阻塞，再排队64任务，每项重复cancel且要求零等待future ready/抛取消异常、reader回调执行数为零；worker仍阻塞时完成所有断言，释放gate后后续真实空文件读取恢复。既有正式窗口后台导入回归通过。来源821文件/diff通过；OS已开始的阻塞read仍无法即时中断，无慢盘物理操作性能测量。整体迁移及生产执行器仍INCOMPLETE。保留editor_support.h及用户数据，阶段提交推送dev。

### 2026-11-11：导入字节JSON对象复用与原缓冲释放

在分批编码保留旧版Array.from数字数组消息的前提下，进一步消除每字节一个独立JsonValue的分配。ImportEncoding按任务惰性缓存0..255的不可变数字对象，所有重复字节追加引用；每个文件编码完成后swap释放原始bytes分配，避免完整raw缓冲一直保留到全部文件发送。数组项替换仍独立，不改变数值、顺序、文件身份及状态生命周期。

唯一正式Release及状态测试构建成功，extension-form-ui/image/files/state四项通过2.20秒。回归检查重复字节对象身份复用、不同数字不共身份、SetAt替换不改变其他项、已完成文件raw capacity归零，既有16385字节精确核对和正式65539字节窗口链路通过。本机262144值局部样本fresh=56935us，reuse=10659us，约5.3倍；单次局部测量无阈值，不扩称全软件性能。来源821文件/diff通过。数组引用槽仍随数据量增长，最终序列化/大数组释放、慢磁盘物理响应及生产执行器仍未完成，整体INCOMPLETE。保留editor_support.h及用户数据，阶段提交推送dev。

### 2026-11-11：正式窗口导入编码中断与恢复矩阵

延续已完成的真实文件导入窗口链路，补齐编码期间的生命周期验收。只读encodingImportForCheck观察正式编码阶段，实际按钮/reader/pump推进到该阶段后，分别触发真实retry按钮、模型禁用file、模型移除file和host关闭；各路径连续pump确认不发送旧文件、不遗留busy/编码对象。前三种重新加载原模型确认file按钮恢复enabled，最终关闭确认窗口注销。未直接调用状态finishImport来替代窗口行为。

唯一正式Release构建成功，extension-form-ui/image/files/state四项通过2.18秒；来源821文件及diff检查通过。该阶段是补齐正式窗口集成证据，未新增业务功能，不等同人工物理鼠标/慢盘响应验收。生产扩展JavaScript执行器技术路线已重新列出待用户决定，尚未擅自引入QuickJS；整体迁移INCOMPLETE。保留editor_support.h及用户数据，本阶段提交推送dev。

### 2026-11-11：扩展表单模型结构快照

继续处理导出大响应复制长任务。FormState::copy此前Stringify再Parse，会为bytes数组生成完整UTF16及重新分配数字；改为显式工作栈复制JSON对象/数组容器，复用不可变标量，保留receive、send action和draft快照隔离。显式栈不递归访问扩展提供的JSON深度，不修改节点/文件协议或导出验证逻辑。

唯一正式Release及状态测试构建成功，extension-form-ui/image/files/state四项通过2.81秒。新增外部嵌套模型修改不影响接收快照，262144字节结果与原Stringify/Parse克隆序列化一致；本机局部样本原201249us、结构复制30266us，约6.6倍，无性能断言阈值。来源821文件/diff通过。接收仍同步O(n)，大数组容器释放及文件导出校验/写入尚未分帧；不将局部结果扩称整体无卡顿。生产执行器方案仍待用户答复，整体迁移INCOMPLETE。保留editor_support.h及用户数据，阶段提交推送dev。

### 2026-11-11：导入目标失效提前终止

沿用既有最终control检查会拒绝隐藏/禁用/移除/非file目标的语义，将校验提前至每次读取/编码pump。FormState::continueImport先核对ticket所有权，再按当前模型可见性、type和disabled检查；失效时解除该任务busy。FormWindow取消后台任务或释放部分编码并sync，避免已无有效接收目标的文件仍读完/编码完。新任务不被旧ticket检查解锁；null/非字符串type安全拒绝。没有改变有效文件payload及最终提交范围。

唯一正式Release及状态测试构建成功，extension-form-ui/image/files/state四项通过2.82秒。正式窗口矩阵扩展为retry、禁用、移除、变button、条件隐藏、关闭六路径，每路径first pump即清编码/busy，无旧发送，恢复模型按钮enabled。状态覆盖空类型、隐藏及新旧ticket隔离。来源821文件/diff通过。OS已阻塞read仍需返回后协作取消，无物理慢盘性能测量；整体迁移及待确认生产执行器INCOMPLETE。保留editor_support.h与用户数据，阶段提交推送dev。

### 2026-11-11：文件导入全入口类型校验与恢复

核对ExtensionDialogForm switch(node.type)未知类型不渲染/执行，发现原生部分file入口直接GetString导致null/非字符串可能抛异常。统一fileNode安全判定，覆盖beginImport、importFiles、files、encodeImport、分批finishImport；encode前复用continueImport完成类型/可见/禁用校验。无效模型安全拒绝并恢复所属任务busy，有效模型可再次导入。

唯一正式Release及状态测试构建成功，extension-form-ui/image/files/state四项通过2.77秒。新增七种无效type×编码前/编码完成/直接完成三路径，以及入口不调用chooser，均验证恢复；测试模型独立深拷贝避免共享nodes污染。来源821文件/diff通过。另识别旧版选择时固定multiple/action与原生采用当前模型的语义差异，已向用户提交选择，未擅自更改。生产执行器方案及整体迁移仍INCOMPLETE。保留editor_support.h及用户数据，阶段提交推送dev。

### 2026-11-11：扩展网络响应编码取消与对象复用

对照ExtensionRuntimeHost.tsx network.fetch lines472-485的Array.from(bytes)，补齐原生worker读完后编码阶段的取消检查：worker进入、编码开始、每4096项及完成均检查token，空响应同样拒绝已取消任务。字节数字缓存最多256个不可变JsonValue，避免2MiB响应逐项新建对象；消息、权限、15秒超时、HTTP状态及流式2MiB限制保持不变。

构建extension-network-tests和extension-session-host-tests成功，两项通过23.43秒（包含真实15秒超时）。新增65539字节精确结果、重复字节对象复用、数组SetAt独立性和非空/空预取消检查；实际loopback GET/POST/404/headers/cookie/limits/replace回归通过。来源821文件/diff通过。当前该宿主尚未由正式编辑器生产执行器引用，本阶段未重建正式exe，不将模块构建报告为正式应用接入。最终Stringify/主线程Parse和每请求线程仍未优化，整体迁移INCOMPLETE。保留editor_support.h及用户数据，阶段提交推送dev。

### 2026-11-11：网络后台故障响应与队列恢复

核对ExtensionRuntimeHost请求try/catch返回失败envelope，补齐原生worker自身失败和结果解析失败的宿主恢复。NetworkTask保留requestId；SessionHost poll先移出已完成任务，再get/Parse，避免get异常后无效future滞留并令每次poll再次失败。std/hresult/未知异常、无效future及损坏JSON转原requestId错误响应；同批后续成功与新请求继续正常处理。可注入NetworkStart替代worker用于确定性故障测试，正式权限/dispatch/poll均走实际实现。

宿主与网络测试目标构建成功，两项回归通过22.74秒，含五类故障+同批成功、第二次poll无重放、后续请求恢复及真实HTTP超时/限额/权限/替换。来源821文件/diff通过。该模块尚未由正式编辑器生产执行器引用，本阶段未重建正式exe；不宣称生产JS功能完成。最终序列化/主线程Parse、请求线程数量仍有未完成项，整体迁移INCOMPLETE。保留editor_support.h及用户数据，阶段提交推送dev。

### 2026-11-11：网络响应信封校验

对照ExtensionRuntimeHost respond固定type/requestId与ok/result/error协议，SessionHost在worker结果交付前验证type、原请求ID、布尔ok及成功result/失败字符串error。合法JSON但错配信封转换原请求的一次错误响应，不交付错误身份，不影响后续任务。仅校验信封，未扩称完整HTTP结果schema校验。

两个模块目标构建成功。首次CTest实际HTTP通过22.62秒，会话测试在既有Storage ReplaceFile报Unable to remove the file to be replaced，未进入新增断言；单独复核会话测试通过0.08秒，七类畸形信封和合法失败保留回归通过。存储首次失败未复现、根因未定位，不声称已修复或忽略该事实。来源821文件/diff通过。正式编辑器执行器尚未接入，本轮未重建正式exe，整体迁移INCOMPLETE。保留editor_support.h和用户数据，阶段提交推送dev。

### 2026-11-11：扩展存储故障调查（未完成，尚未提交）

当前工作区将加载重复键检测改为unordered_set，补8192键/重复键拒绝和失败stage清理/解锁同实例恢复检查。直接执行完整storage测试一次通过（8192键加载35286us）；随后CTest storage失败，捕获ReplaceFileW code1175 ERROR_UNABLE_TO_REMOVE_REPLACED，会话测试通过。临时阶段诊断显示失败发生在连续保存/重开阶段，显式锁冲突恢复及stage清理断言此前已通过。未定位占用来源，未加入重试或修改发布语义，不将一次通过作为修复证据。当前阶段未完成，改动保留不提交推送，需继续定位1175并完成相关检查。用户editor_support.h和用户数据保留。

### 2026-11-11：存储加载与失败恢复证据（1175仍未解决）

完成上一轮未提交的独立加载优化与失败恢复检查：加载用unordered_set检测重复并预留容器，保留顺序和UTF16键语义；8192键首尾值及末项重复拒绝。锁冲突set/remove失败后检查stage无泄漏、内存/磁盘旧值一致、缺失key remove无写入，解锁后同实例保存重开成功。诊断增强含路径/Win32码，连续保存失败输出序号/文件属性/stage数并核对内存磁盘。临时MoveFileEx覆盖实验在快照读取场景code5，已完全撤回，最终仍使用原ReplaceFile发布，不改变快照/多写者语义，无重试。

最终两个模块目标构建成功，storage/session两项通过1.28秒；直接storage测试8192键加载36787us。之前1175间歇性故障仍未定位，当前通过不构成已修复证据。此次提交范围为已验证的加载优化、故障恢复与诊断；原子发布可靠性继续列为未解决，不将该领域或整体迁移标完成。正式生产扩展宿主未接入，本轮未重建正式exe。保留editor_support.h和用户数据，来源/diff检查后提交推送dev。

### 2026-11-11：存储无效删除避免整库复制

核对legacy extension-runtime.ts的set/remove语义，原生缺失key remove现在先在原values查找，直接返回，不复制全部JSON字符串；存在项删除按已解析位置移除。set在原容器取得索引后复制并更新，保持发布成功才替换内存。不跳过相同值set：新增第二个Storage实例先修改磁盘、原实例再次写相同本地值的回归，确认实际发布请求值，避免改变现有多实例可观察行为。

两个模块目标构建成功，extension-storage/session-host两项通过1.31秒；来源821文件覆盖及diff检查通过。没有修改生产界面，不重建正式exe，不把局部复制优化解释为全软件速度提升。ReplaceFile1175根因及生产JS执行器仍未解决，整体迁移INCOMPLETE。用户差异和未跟踪数据不纳入提交；阶段提交推送dev。

### 2026-11-11：扩展真实工作区适配（验证中）

对照legacy ExtensionRuntimeHost.tsx projectSnapshot及workspace/document请求分支，将原测试回调适配到正式Editor多工程会话：实时列表/活动摘要、按ID切换、层/帧查询和undo/redo。原生层顺序反向映射为旧版顺序；扩展工程ID使用进程内稳定Document identity，因为projectId在新工程时为空且保存可改变。当前原生仅RGBA，继续明确记录，不假称支持其他模式。服务所有者必须先于Editor销毁，不保存文档或像素副本。

正式exe新增--extension-workspace-check，使用真实Editor/SessionHost请求链验证双工程、尺寸名称/属性/时长、查询无历史更改、切换保留像素与undo/redo栈、无效ID、主页活动工程、替换旧token/只读权限、空工作区。当前正在构建与验收，未提交；生产JavaScript执行器、tools/colors回调及事件接线仍未完成，不将本适配器称为完整扩展运行。

阶段验收完成：首次访问声明插入错误已修正，辅助函数与Widget::text重名已修正。首次失败期间生成了访问修饰符不一致对象，按链接诊断重新编译dialogs/timeline/timelapse/canvas后唯一正式Release构建成功，未改业务实现或绕过正式产物。extension-workspace-ui、multi-document、extension-session-host、extension-request-host四项通过4.75秒，覆盖真实编辑器请求链及既有多工程行为。来源822文件检查通过；无UI布局改动、人工图像/FPS或生产JS扩展实机验收。适配器可供正式宿主接入，生产执行入口仍未完成，不将整个扩展领域或全部迁移标完成。保留editor_support.h和未跟踪用户数据，阶段提交推送dev。

### 2026-11-11：扩展真实工具接口接线

对照ExtensionRuntimeHost.tsx tools.getActive/setActive、workspace-commands-tool.ts setTool及canvas-tool-gesture-lock，扩展工作区服务接入当前Editor工具。查询将原生子类型映射到15个公开Runtime类别；设置复用既有工具操作，保留同类选择/形状子类型，尊重工具可用性、绘制捕获和待提交渐变门禁。Runtime调用不应被快捷键专属色板focus或主页门禁吞掉，作用域临时排除两者后恢复。未修改UI布局或图标。

正式Release构建成功；extension-workspace-ui/multi-document/extension-request-host三项通过1.78秒，实际请求覆盖15类别、内容/历史不变、ellipse保持、live stroke不取消、隐藏层喷枪拒绝、home/focus、非法ID、无权限及空工作区null/no-op。首次测试因选中隐藏图层导致喷枪被正确拒绝，修正可绘制fixture并独立保留该拒绝回归；错误日志路径修正到native/build，旧失败日志保留。来源822文件及diff通过，无人工UI/FPS验收。

发现旧版颜色set会同步所有会话并持久化共享角色，不能用当前文档回调替代，留为独立完整迁移。各工程独立工具状态恢复、生产JavaScript执行器仍未完成，本阶段只声明真实工具API适配通过，整体INCOMPLETE。保留用户editor_support.h及未跟踪数据，阶段提交推送dev。

### 2026-11-11：原生通知、剪贴板与诊断服务适配

依据legacy ExtensionRuntimeHost.tsx notifications/ui.notify、navigator.clipboard与diagnostics.log分支，提供nativeHostServices/nativeDiagnosticServices工厂。通知交给宿主status呈现；clip库UTF8文本读写失败抛出，RequestHost生成原requestId失败响应。诊断复用recorderDiagnosticServices绑定固定扩展身份，错误更新状态，原浏览器console适配OutputDebugStringW，不新建UI。后端可注入用于确定性失败验收；所有者与状态回调须在编辑器生命周期内使用。

唯一正式Release构建成功；extension-workspace-ui/request-host/runtime-diagnostics三项通过1.04秒。真实SessionHost/Editor检查Unicode读写、读写失败不虚假成功、通知500UTF16限制、error状态、诊断身份不可由params冒充、无权限不调用后端；实际系统剪贴板只读核对，不覆盖用户内容。测试诊断mode1保留内存证据，无需写入用户配置。来源823文件/diff通过，无UI几何变化或人工FPS验收。

适配工厂已可供正式宿主使用，目前集成由正式exe检查入口调用，生产JavaScript执行入口尚未接入，不将工厂验收描述为完整扩展已可运行。共享颜色、各工程工具恢复及其他缺口仍未完成；整体INCOMPLETE。旧失败日志保留，用户editor_support.h和未跟踪数据不纳入提交；阶段保存推送dev。

### 2026-11-11：共享颜色角色与持久化迁移（验证中）

核对legacy color-role-preferences.ts、workspace-commands-color.ts、workspace-commands-session.ts与workspace-session.ts。当前实现将扩展colors接口和生产取色器/参考/预览/最近颜色/交换操作汇入共享角色，更新所有已打开文档，复用已有色板锁及同步资源事务。选中前景色同步其他会话；选中背景色按旧版只更新共享默认与当前会话。新建/打开工程继承共享角色，100ms合并写入原生JSON，关闭刷新；读取按通道归一化/损坏默认，失败保留pending供同实例恢复。选区笔刷标记由来源坐标存在性保存，按亮度128和alpha乘法重映射paintColors，普通图像不映射。

已添加真实双工程Runtime颜色请求、锁定历史不变、共享swap、实际写盘重读、通道归一化、损坏恢复、失败pending/恢复、选区笔刷原像素/alpha及未激活文档同步色板事务回归。当前仍在正式构建，新增笔刷结构期间的旧编译单元发生成员不可见错误，需结束后统一重建，尚未完成验收/提交推送。来源824文件检查通过不代表行为等价；整体INCOMPLETE，保留用户差异和数据。

阶段验收完成：统一正式Release构建成功。首次运行4项UI启动崩溃，构建日志核对发现先前编译期间头文件变化留下12个旧Editor对象单元；仅更新时间触发对应源重编译（含main），重新链接后7项全部通过12.60秒：extension-workspace-ui、multi-document、palette-mouse-startup、color-editor-popup、selection-pattern-brush、image-brush、extension-request-host。新增swapPaletteRoles严格保留各会话前景色选择ID为背景关联，并按旧版有序色板匹配新前景；实际检查含新文档继承、背景色色块不传播其他文档、普通图像不重映射。此前失败日志保留，未删用户数据。来源824文件与diff检查通过；无人工UI/FPS测量，整体迁移仍INCOMPLETE。本阶段提交推送dev。

用户补充决定：文件导入保留原生当前模型校验与提前取消。完成时采用最新模型，控件隐藏/禁用/移除/改变类型时提前取消；不改回旧版选择文件时固定action/multiple。该差异已登记到现有文件导入来源项，本次没有新增导入实现改动。

### 2026-11-11：各工程工具配置恢复（验证中）

对照legacy workspace-session.ts DocumentSession/createSession/copyCanvasToolSettings与workspace-commands-session.ts setActive：工程切换仅切活动对象，各自保留工具与配置。原生storeActiveProject保存已迁移工具标志、选区/形状/填充/渐变参数、笔刷及墨水profiles、图像资源引用、动态/喷枪/液化/平滑/移动/取色配置；恢复移入文档后应用，按目标工程解析图像资源，临时笔刷继续沿现有路径还原。配置不包含手势/worker/UI指针，沿用settleProjectGesture。新工程恢复旧版pencil起始类别。真实Editor检查两工程子类型、容差、笔刷尺寸和平滑强度往返独立及历史不变。当前验证中，新工程完整持久化参数重新读取仍有缺口，整体INCOMPLETE。

阶段验收：VS于本机更新至17.14.37906.3，原CMake实例版本失效；同一native/build更新实例配置，未删缓存/新建构建目录。链接报告C++/WinRT 2.0.250303.1/.5混用，按实际LNK2038列表更新旧对象对应源码时间触发重编译，最终唯一正式Release成功。extension-workspace-ui、color-editor-popup、multi-document、image-brush四项通过2.26秒；selection-interactions、canvas-resize（含临时笔刷捕获）两项通过3.30秒。来源824文件与diff检查通过。此次完成既有工程工具配置往返恢复，不宣称新工程全部持久化参数加载、完整工具迁移或UI性能人工验收完成。整体INCOMPLETE，用户editor_support.h及未跟踪文件保留，阶段推送dev。

### 2026-11-11：新工程工具参数初始化（验证中）

对照legacy workspace-session.ts createSession/loadToolSettings与persisted brush profiles，提取原生createToolOptions/createSmoothOptions/createAirbrushOptions已有读盘逻辑为不创建控件的loadSessionToolPreferences。启动复用原读取；addProject先保存旧会话，再重置会话工具配置与临时资源，等待已有笔刷偏好队列写完后加载当前持久化参数。复用现有墨水/动态/液化加载器，测试目录隔离。补齐smoothBrush尺寸形状的工程切换保存。真实Editor新增磁盘profile/平滑/喷枪/墨水/魔棒加载及损坏文件默认回归，验证中，不宣称完整迁移完成。

阶段验收完成：唯一正式Release构建成功。extension-workspace-ui、color-editor-popup、multi-document、selection-interactions、canvas-resize五项通过5.14秒。真实工作区使用独立PID目录写入brush-profiles/smooth/airbrush/ink/magic-eraser文件，通过addProject检验加载；将profile/smooth改为损坏内容后按默认初始化，原工程独立状态恢复仍通过。原生已存在的工具偏好格式与加载器完成新工程接线；尚无对应持久化的旧版资源/工具设置仍属于整体迁移缺口，不称全部工具迁移完成。来源824文件与diff检查通过；无人工性能/FPS测量。用户editor_support.h与所有未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：工程图像笔刷快照与颜色恢复（验证中）

核对legacy DocumentSession.brushImage及workspace-session.ts remapSelectionBrushColors：会话持有已加载像素，非切换时重读资源。原生配置捕获补入pencilImageBrush，恢复后按目标当前颜色重映射选区brush paintColors；共享颜色路径复用同一纯函数，保留原像素/alpha/透明/亮度128规则，普通图像不映射。真实Editor用missing-local-resource标识证明切换保留内存资源，单测验证原像素不变及alpha乘法。旧版lineDirectionStep经file-preferences.ts确认是全局偏好，不改为会话字段。当前构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release及selection-pattern-brush-tests构建成功。selection-pattern-brush、extension-workspace-ui、multi-document、selection-interactions、canvas-resize五项通过4.58秒。真实Editor在不存在资源路径下往返标签仍保留已载入像素和ID，选区paintColors恢复；纯函数检查原像素不变、alpha乘法与普通图像跳过。来源824文件与diff检查通过；不含人工FPS测量，整体INCOMPLETE。保留用户editor_support.h及未跟踪数据，阶段提交推送dev。

### 2026-11-11：图像笔刷资源选择持久化（验证中）

依据legacy workspace-session.ts persistedBrushProfileFromSession/brushProfileFromPersisted/persistToolSettings及core/tool-preferences.ts归一化，普通图像资源ID和角度参与偏好，临时选区笔刷ID不参与。原生扩展现有合并异步写入批次至第七文件image-brush-selection-v1.txt，quoted字符串/有限角度验证，菜单选择/清除/角度与栏目选择接线；新会话加载后复用资源解析，缺失回退普通笔刷。实际笔刷库回归覆盖ID/37.5角度重载、临时排除、缺失回退与恢复，队列失败恢复/销毁检查覆盖第七文件。构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release构建成功。使用Start-Process -Wait确认--brush-library-panel-check实际进程exit0，覆盖磁盘资源/角度重载、临时ID排除、缺失资源回退与恢复；extension-workspace-ui、multi-document、selection-pattern-brush三项通过1.88秒。来源824文件与diff检查通过。仅声明既有原生资源选择与角度持久化链路已接通，队列新增文件失败/销毁断言已更新但未单独调用其专项入口；旧版完整多工具profile体系仍有缺口，整体INCOMPLETE，无人工FPS验收。保留用户editor_support.h及未跟踪文件，阶段提交推送dev。

### 2026-11-11：普通图案退出与资源生命周期（验证中）

依据legacy workspace-commands-tool.ts setBrushImage/exitPatternBrush：普通图案记住返回笔刷配置，Esc清除图像与填充图案、保留当前工具及图像采样模式、保存清除状态。原生补齐普通图案Esc入口和资源加载时返回配置记忆；会话保存返回配置，内部标签切换清理不写偏好。填充选择、资源/文件夹删除后保存当前资源状态。正式笔刷库实际键盘Esc检查桶工具、Source模式及偏好重读。构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release构建成功；--brush-library-panel-check等待进程exit0，实际Esc保留桶/Source并清除资源、重读偏好不恢复。extension-workspace-ui、multi-document、selection-interactions、canvas-resize四项通过4.76秒，临时捕获路径仍通过。来源824文件与diff检查通过，无人工FPS验收。完整多工具返回profile尚需后续对照，本阶段不宣称全部工具迁移完成；整体INCOMPLETE。保留用户editor_support.h及未跟踪数据，提交推送dev。

### 2026-11-11：导入与选区创建资源持久化（验证中）

对照legacy workspace-commands-tool.ts createBrushFromSelection→setTemporaryBrush→setBrushImage→persistToolSettings，保存成功才激活并持久化。原生补齐importBrushLibraryImages/createBrushFromSelection/createFillBrushFromSelection成功路径偏好保存，失败不覆盖。真实隔离库检查PNG导入后重载像素、失败导入保留、空选区无操作，以及成功选区捕获重载/历史不变。多图案集合经旧版确认仅会话状态，不新增全局持久化。构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release构建及最终增量检查成功；--brush-library-panel-check等待进程exit0，包含真实导入PNG、选区捕获、偏好重载及失败保留。extension-workspace-ui、multi-document、canvas-resize三项通过1.94秒。来源824文件与diff通过，无人工FPS测量；旧版完整工具profile与其他领域仍INCOMPLETE。保留用户editor_support.h及未跟踪数据，提交推送dev。

### 2026-11-11：图案选择资源事务与重复读取消除（验证中）

核对legacy BrushLibraryPanel.tsx已加载controller资源→单次setBrushImage，以及workspace-commands-tool.ts提交集合。原生applyFillLibrarySelection按选择顺序暂存所有本地/工程资源，活动图案复用候选，全部成功后一次发布；失败不改绘制集合。删除栏目选择重复resolve以及失败回滚读盘，选区坐标存在性标记一并保留。新增已登记但内容损坏PNG选择回归，保留原选择/像素/图案数/名称。同步加载仍是待迁移性能差异，本阶段不宣称后台库控制器完成。构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release构建成功；实际--brush-library-panel-check等待exit0，损坏资源选择保留完整旧绘制状态，原有导入/删除/持久化路径通过。extension-workspace-ui、multi-document、canvas-resize三项通过1.88秒。来源824文件/diff通过，未测FPS，后台资源控制器仍未迁移；整体INCOMPLETE。保留用户editor_support.h与未跟踪数据，提交推送dev。

### 2026-11-11：笔刷栏目无变化刷新消除（验证中）

对照legacy useBrushLibrary.ts loaded controller/useMemo与资源变化触发refresh：选择不触发资源重载。原生移除applyFillLibrarySelection选择后缩略图重载标记，保留资源变更/导航/手动刷新；syncSelection仅ID或enabled变化才复制选择/更新控件/重绘网格。实际面板smoke100次同值无invalidations，禁用/恢复各一次；真实Editor普通选择后无reload。异步资源控制器仍待迁移，当前构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release成功，实际--brush-library-panel-check等待exit0，100次同值同步无网格invalidations、禁用恢复/拖动与资源生命周期通过，选择后无缩略图reload。extension-workspace-ui、multi-document、canvas-resize三项通过2.40秒。来源824文件/diff通过，无人工FPS或耗时对比；异步库加载仍未完成，整体INCOMPLETE。保留用户editor_support.h及未跟踪数据，提交推送dev。

### 2026-11-11：笔刷库后台扫描与解码（验证中）

对照legacy useBrushLibrary.ts异步list/read/decode，原生工作线程处理目录/文件夹扫描与CPU图像解码，现有WIC decoder自行初始化COM；主线程16ms轮询，仅当前工程/文件夹/目录键且无更新请求的结果可发布。单扫描运行、后续刷新合并，隐藏栏目丢弃结果；promise future不在UI销毁时join线程，worker不捕获Editor/UI指针。真实检查走生产poll分支及延迟结果隐藏拒绝；旧smoke专用同步等待便于已有fixture稳定。选择读盘和UI资源发布仍同步，不宣称全链路性能完成。构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release构建成功，实际--brush-library-panel-check等待exit0。生产poll真实扫描、未完成promise下100次UI轮询不等待、刷新合并后过期键丢弃并启动新代、隐藏结果拒绝均通过；现有资源/拖动/偏好回归通过。extension-workspace-ui、multi-document、canvas-resize三项通过2.12秒。来源824文件/diff通过。无慢磁盘/OS阻塞或FPS实测，单次解码不可中断，线程关闭后自行完成，选择资源仍同步读盘/UI setResources仍同步，整体INCOMPLETE。用户editor_support.h及未跟踪数据保留，提交推送dev。

### 2026-11-11：笔刷栏目选择复用已加载资源（验证中）

对照legacy useBrushLibrary.ts保留已解码controller资源，以及BrushLibraryPanel.tsx selectBrush按显示顺序选择并复用controller.brushes。后台加载全部文件夹资源，UI仅发布当前目录；普通栏目点击不再list目录/import解码。资源快照校验工程、目录和文件夹，刷新期间保留已显示资源；候选选择/像素全部就绪后一次提交，工程资源取当前Document。新增独占锁PNG下Ctrl选择、Shift范围顺序、刷新损坏资源拒绝及本地/工程混选回归。导入/删除等显式资源操作仍沿既有同步路径，UI发布仍有像素复制，不宣称整体卡顿已解决。构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release成功，实际--brush-library-panel-check等待exit0；独占PNG锁下复用内存选择、Ctrl/Shift顺序、刷新损坏资源拒绝、本地/工程混选通过。extension-workspace-ui、multi-document、canvas-resize三项通过2.02秒。来源824文件及diff检查通过。本阶段对照legacy，无新增Aseprite源码核对或人工FPS测量；整体INCOMPLETE。用户editor_support.h及未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：笔刷资源刷新生命周期与查找索引（验证中）

对照legacy BrushLibraryPanel.tsx controller.loaded/valid集合effect：成功刷新后移除失效成员，保留存活图案像素与顺序，优先原活动资源或最后存活资源，最后资源丢失则清空。原生在后台结果发布时事务更新选择/图案/活动像素/名称并保存修正引用，目录整体读取失败不清除选择。发布同时建立ID索引与目录顺序索引，消除每次点击按全库反复查找导致的二次复杂度。真实smoke删除活动资源、删除最后资源与重新选择回归。旧填充/铅笔菜单同步资源入口仍待迁移，不把本阶段当作完整后台控制器完成；整体INCOMPLETE。

阶段验收完成：唯一正式Release成功，实际--brush-library-panel-check等待exit0，包含活动资源丢失、最后资源丢失、有效资源重新选择及此前锁文件/多选/刷新回归。extension-workspace-ui、multi-document、canvas-resize三项通过2.06秒。来源824文件及diff检查通过，无人工FPS测量。同步菜单入口仍有迁移缺口；整体INCOMPLETE。用户editor_support.h与未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：铅笔与填充菜单后台资源接线（验证中）

复用legacy useBrushLibrary.ts后台controller与BrushLibraryPanel.tsx loaded selection：将既有两菜单定义移入资源控制器所在编译单元，保留入口/参数/清除/角度/工程资源，菜单打开不再扫描目录，铅笔选择捕获已载入像素并校验工程/目录，填充选择汇入索引事务。首次加载显示禁用加载提示，后台完成后下次打开可用；栏目隐藏仍允许菜单请求发布。导入成功移除apply后再次resolve解码。新增隐藏栏目菜单扫描请求与锁PNG下填充选择检查。初始化偏好解析及显式资源写入操作仍同步，整体INCOMPLETE。

阶段验收完成：唯一正式Release最终增量构建成功；实际--brush-library-panel-check等待exit0，栏目隐藏菜单请求加载、独占PNG锁下填充选择、既有部分导入/失败/持久化/生命周期通过。extension-workspace-ui、multi-document、canvas-resize三项通过2.16秒。来源824文件及diff检查通过。没有实际弹出菜单点击或截图/FPS验收；首次菜单加载提示需关闭后重开查看完成资源。初始化偏好与显式资源写入仍同步，整体INCOMPLETE。用户editor_support.h与未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：笔刷文件夹缓存导航与变更刷新（验证中）

依据legacy useBrushLibrary.ts加载全部资源、BrushLibraryPanel.tsx按currentFolderId过滤与缺失目录回根：导航不再参与IO key，不触发重复全库扫描解码；切换以已有索引发布当前目录，保留跨目录选择。扫描期间导航结果按最新位置发布。文件夹菜单复用已载入目录，创建/重命名/移动/确认删除补齐显式刷新标记，避免依赖旧folder key偶然刷新。真实smoke独占锁图案后跨目录导航与Ctrl选择、缺失目录回退，原创建/取消/父目录快捷键回归。初始化偏好及显式资源操作仍同步，整体INCOMPLETE。

阶段验收：唯一正式Release最终构建成功；首次笔刷专项在既有partial/drop dedupe断言失败，同一二进制再次运行等待exit0，新锁文件导航/跨目录多选/缺失目录回退及创建快捷键通过。首次失败可能受一秒去重时限影响，但原因未被证明，保留失败记录，不称该不稳定检查已修复。extension-workspace-ui、multi-document、canvas-resize三项通过3.29秒。来源824文件与diff通过，无人工FPS/截图验收；整体INCOMPLETE。用户editor_support.h与未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：隐藏栏目菜单刷新请求生命周期（验证中）

对照legacy useBrushLibrary.ts refresh不因已有缓存或栏目隐藏取消：原生菜单使用旧缓存时仅在没有pending扫描时释放menuRequested，避免隐藏栏目新结果被当作无人请求丢弃。新增实际生产poll隐藏栏目刷新期间导航至另一目录，验证按最新位置发布并释放请求。前一阶段partial/drop dedupe失败加入accepted/hover/前后资源数/status诊断，尚无证据证明旧失败原因，不改去重语义。构建验证中；整体INCOMPLETE。

阶段验收完成：唯一正式Release构建成功；实际--brush-library-panel-check等待exit0，隐藏栏目pending刷新期间切目录按最新位置发布、缓存/生命周期/导入/拖放检查通过。extension-workspace-ui、multi-document、canvas-resize三项通过2.89秒。来源824文件与diff通过。既有partial/drop首次失败未复现且原因未查明，保留诊断，不称已修复；没有实际弹出菜单点击或人工FPS验收。验收记录追加脚本首次JSON候选校验失败且未写盘，现已更正并复验。整体INCOMPLETE，用户editor_support.h和未跟踪数据保留。

### 2026-11-11：导入与选区创建笔刷内存激活事务（验证中）

依据legacy workspace-commands-tool.ts createBrushFromSelection保存后激活生成像素、useBrushLibrary.ts importPaths激活最后成功资源：原生填充选区创建保存/移动成功后暂存完整选择/图案/活动像素/名称并提交，导入保留最后成功解码资源，不再apply重扫和读PNG。普通选区创建补齐返回profile记忆。沿用保存文件stem名称、原像素/alpha与来源映射，失败移动不覆盖旧选择。真实回归多PNG+末项缺失、半透明像素/coverage、目标目录/名称、移动失败保留及已有持久化重载。源解码/保存/移动仍同步，整体INCOMPLETE。

阶段验收完成：唯一正式Release成功，实际--brush-library-panel-check等待exit0，多文件部分成功最后项/半透明像素coverage/目标目录名称/移动失败保留/持久化重载/选区捕获历史检查通过。selection-pattern-brush、extension-workspace-ui、multi-document、canvas-resize四项通过3.86秒。来源824文件及diff通过。源导入解码、保存、移动仍同步，后台缩略图刷新仍会读取资源；无人工FPS实测，整体INCOMPLETE。用户editor_support.h及未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：临时笔刷转持久资源生命周期（验证中）

依据legacy workspace-commands-tool.ts setBrushImage明确brushImageTemporary=false，原生修复成功选择本地/工程资源、栏目/菜单、导入、选区创建后仍残留temporaryBrushActive导致保存排除资源的缺陷。成功提交才清标记，原返回profile保留；失败选择/导入继续保留临时状态。普通资源清除入口同时清理临时标记。真实回归覆盖缺失资源选择保持临时标记、成功选择保留size11返回profile并重载资源、导入/选区创建从临时标记转持久并重载；临时捕获本身保持原语义。构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release成功；实际--brush-library-panel-check等待exit0，失败选择保留临时标记、成功选择保留size11返回profile并清标记/实际偏好重读、导入和选区创建从临时状态持久化通过。selection-pattern-brush、extension-workspace-ui、multi-document、selection-interactions、canvas-resize五项通过5.64秒。来源824文件与diff通过，无实际菜单点击/人工FPS验收；整体INCOMPLETE。用户editor_support.h与未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：笔刷库排序与元数据读取成本（验证中）

对照legacy platform_brushes.rs list_brushes：顺序表首个匹配位置优先、缺失置末，再按名称/ID；原生以一次first-emplace索引替代每次排序比较线性搜索，保留该顺序语义。sourceX/Y解析正则静态编译复用，保留有符号/溢出缺失语义。回归新增重复顺序ID、缺失ID、外部未登记PNG、跨目录排序、重开与元数据边界，保留并发原子顺序替换检查。构建验证中，无性能量化声明；整体INCOMPLETE。

阶段验收：唯一正式Release与pattern-brush-library-tests构建成功，实际笔刷栏目专项等待exit0；extension-workspace-ui、multi-document、canvas-resize通过。底层首次并发读取/替换顺序测试Windows error5失败，同一二进制单独复验通过15.07秒；新增排序与元数据边界通过，首次替换失败原因未证明，不称修复。来源824/diff通过，无量化耗时或FPS声明。整体INCOMPLETE，用户editor_support.h和未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：笔刷库后台扫描与写入事务边界（验证中）

对照legacy platform_brushes.rs保存PNG/metadata/order及失败回滚、移动/删除后controller刷新。原生后台扫描引入并发观察，原锁只覆盖list和单文件写入，会看到半完成资源。扩展既有递归锁覆盖保存/删除/排序/目录创建重命名删除/单项与组移动完整事务，避免迭代器遇到中间目录变化及顺序read-modify-write交错。新增独立fixture扫描与12轮保存坐标元数据/移动往返/删除并发，检查所有观察资源坐标完整、目录有效、最终空库；保留原100轮排序替换。没有增加重试，先前Windows error5原因仍待证明；整体INCOMPLETE。

阶段验收完成：唯一正式Release及底层测试构建成功，实际笔刷栏目专项等待exit0。pattern-brush-library原100轮顺序并发和新增12轮保存/移动/删除事务通过1.23秒；extension-workspace-ui、multi-document、canvas-resize通过，合计4.02秒。来源824/diff通过。原raw路径CHECK宏C4129警告仍存在；先前Windows error5本轮未复现，不称根因已解决。全局锁仍可能使UI资源操作等待扫描，无人工延迟/FPS声明。整体INCOMPLETE，用户editor_support.h和未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：笔刷存储大小写与部分排序语义迁移（验证中）

实际核对legacy platform_brushes.rs collect_entries/safe_brush_id/delete_folder/set_brush_order：PNG扩展名不区分ASCII大小写；排序先验证输入、过滤不存在与重复项，只持久化指定资源，不固定遗漏项。原生统一listing/ID验证/目录删除顺序清理的大小写识别，reorder按旧版只写请求的存在项，非法ID在写入前失败。确认stored_brush始终intrinsic_size=true，不臆改尺寸语义。新增大小写文件列表/移动/删除、精确排序JSON、非法输入保持旧顺序、部分排序重开后遗漏项按名称排列等端到端底层检查。构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release与底层测试构建成功；实际笔刷栏目专项等待exit0。pattern-brush-library大小写PNG、磁盘精确部分排序、非法输入保持、重开遗漏项字母序、移动删除顺序清理及并发测试通过2.05秒；extension-workspace-ui、multi-document、canvas-resize通过，合计4.19秒。来源824/diff通过，原CHECK路径C4129警告仍有，无人工FPS/截图验收。整体INCOMPLETE，用户editor_support.h及未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：笔刷顺序与元数据JSON契约迁移（验证中）

核对legacy platform_brushes.rs serde Vec<String>/BrushMetadata：顺序整文档读取或默认；元数据intrinsicSize必须bool，坐标可空i32，失败整记录默认。替换原生手写顺序解析/坐标正则为仓库已有Windows.Data.Json路线，COM作用域及runtimeobject链接，坐标暂存全部验证后发布。补Unicode转义顺序、错误类型/尾随垃圾/残缺文本、缺必填字段与越界坐标整记录默认测试；修正此前只保留有效坐标的错误预期。重复字段/数字词法的serde精确一致性尚未证明，整体INCOMPLETE。

阶段验收完成：唯一正式Release及底层测试构建成功；pattern-brush-library JSON/并发回归通过2.87秒，实际笔刷栏目专项等待exit0，后台扫描解析/资源生命周期通过。extension-workspace-ui、multi-document、canvas-resize三项通过1.99秒。来源824/diff通过。重复字段及数字词法serde一致性仍未证明，原CHECK路径C4129警告仍有；无人工FPS/截图验收，整体INCOMPLETE。用户editor_support.h及未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：笔刷元数据重复字段与数字词法迁移（验证中）

依据legacy BrushMetadata serde类型及本机serde_json de.rs parse_number证据：小数/指数/-0作为F64，i32字段拒绝；derive已知字段重复报错。沿用仓库palette_import.cpp已有词法适配方式，在DOM之前识别顶层解码字段重复和坐标整数写法，未知/嵌套字段仍忽略，补metadata UTF8校验。回归decimal/exponent/-0、重复布尔/坐标与转义别名、单个转义键、i32两端、空可选和未知嵌套重复。不是穷尽格式等价证明，surrogate/深度边界仍需核对；整体INCOMPLETE。

阶段验收完成：唯一正式Release及底层测试构建成功，实际笔刷栏目专项等待exit0。pattern-brush-library词法/重复字段/转义别名/i32/null/未知字段和已有并发检查通过12.98秒；extension-workspace-ui、multi-document、canvas-resize通过，合计15.60秒。来源824/diff通过。没有surrogate/深度边界穷尽对照或人工FPS声明；原CHECK路径警告仍存在。整体INCOMPLETE，用户editor_support.h和未跟踪数据保留，阶段提交推送dev。

### 2026-11-11：工程笔刷资源变更序号与缓存失效（验证中）

对照legacy useBrushLibrary.ts customBrushes集合身份依赖，原生旧ID/名称key漏掉同身份像素替换。增加独立资源序号，验证导入后替换/成功删除/回档payload安装递增；Lua批次回滚保留非历史资源时保留该序号。栏目key以O(1)资源序号替代每次拼接全部名称，不影响文档脏标记/历史。真实Editor新增同ID/同名称只改像素，自动改变key并重载选择新像素的回归。正式构建进行中，整体INCOMPLETE。

阶段验收完成：唯一正式Release完整重编译成功；新增像素选择fixture初次因双击同一项触发取消而失败，修正为清选择后单击，最终增量构建成功。实际笔刷栏目专项等待exit0，同ID/名称像素替换自动失效与新像素选择通过；project-rollback专项exit0。extension-workspace-ui、multi-document、canvas-resize通过1.99秒。来源824/diff通过。回档/Lua恢复序号路径仅源码核对加既有回档验收，未单独断言序号；无FPS声明，整体INCOMPLETE。用户editor_support.h及未跟踪数据保留，阶段提交推送dev。


### 2026-11-11：工程笔刷发布与本地扫描分离（验证中）

依据legacy useBrushLibrary.ts 42-76行：工程customBrushes的memo与本地异步刷新分开。原生本地扫描key保留工程身份/目录保护，工程资源序号改为单独发布缓存本地资源与最新工程集合，不再因工程资源变化重扫/解码全部本地PNG。共用选择清理事务，保留幸存项像素与顺序；本地扫描等待期间也允许工程更新，完成时合并最新集合。真实Editor回归锁住本地PNG，检查缓存地址/key不变、不启动扫描、同身份改像素选择、工程删除后本地幸存/最终清空，以及延迟结果合并最新工程资源。正式构建验证中，整体INCOMPLETE；未宣称FPS提升。

阶段验收完成：唯一正式Release构建成功；实际笔刷栏目专项等待exit0，锁住本地PNG时工程改像素/删除不启动扫描且缓存地址/key不变，本地幸存项与最后选择清理、延迟扫描合并最新工程资源通过。extension-workspace-ui、multi-document、canvas-resize通过1.90秒；来源824/diff通过。未进行人工FPS/截图验收，整体INCOMPLETE。用户editor_support.h和未跟踪文件保留，阶段提交推送dev。


### 2026-11-11：选中笔刷快照到实际绘画的完整链路（验证中）

依据legacy canvas-stroke-brush.ts createCanvasStrokeBrush直接读取session.brushImage，以及workspace-commands-tool.ts普通/临时资源激活。原生普通笔刷落笔调用resolve会同步重扫/解码，临时ID无文件还会被清掉；移除该落笔解析，保留资源选择/会话恢复的显式加载。真实Editor回归覆盖锁PNG连续绘画及撤销重做、工程资源替换后已选像素保持/重新选择最新像素/删除清理、临时捕获实际绘画和Esc取消笔画。不是单纯缓存命中检查；正式构建验证中，整体INCOMPLETE。

阶段验收完成：唯一正式Release最终构建成功；实际笔刷栏目专项等待exit0，锁PNG连续真实鼠标绘画、工程已选快照保持/重新选择最新像素/删除清理、临时捕获后实际落笔、每笔Undo/Redo和Esc取消通过。新增fixture先后修正栏目隐藏未加载、ABGR预期顺序、旧返回profile不透明度污染三处测试准备/预期问题，保留诊断。selection-pattern-brush、multi-document、image-brush、canvas-resize通过1.41秒；来源824/diff通过。无FPS实测，整体INCOMPLETE。用户editor_support.h及未跟踪数据保留，阶段提交推送dev。


### 2026-11-11：笔刷资源操作与选择恢复链路（验证中）

对照legacy useBrushLibrary.ts createFolder/renameFolder/moveBrushesToFolder及BrushLibraryPanel有效集合effect：目录变更不重新激活已选像素。原生移除创建/重命名/移动后同步apply，避免文件操作成功却因PNG读取失败报错；既有apply移到资源控制器编译单元，删除存活项复用经过工程/目录校验的解码缓存，首次加载前保留显式读取fallback。新增真实Editor锁PNG删除另一资源后保留存活项、创建/重命名成功完成、允许rename但拒绝reader的移动及最终后台刷新验证。整体INCOMPLETE，正式构建验证中。

阶段验收完成：唯一正式Release最终构建与笔刷栏目专项exit0；锁PNG删除存活项、创建/重命名、拒绝reader但允许rename的移动及刷新通过，既有删除取消/部分失败/成功/持久化通过。四项pattern-brush-library、extension-workspace-ui、multi-document、canvas-resize通过3.43秒。fixture修正恢复实际可见性、隐藏请求先完成扫描再建立新选择，避免旧结果清理测试ID；最初异常退出根因未独立证明，后续明确阈值失败定位为隐藏栏目。恢复构建时核对ICU相同hash并更新构建输出时间戳，绕过上游含&路径未引用复制命令，未删缓存。来源824/diff通过，无FPS/图像验收。整体INCOMPLETE，用户editor_support.h及未跟踪文件保留，阶段提交推送dev。


### 2026-11-11：笔刷导入后台任务迁移（进行中，未接入生产入口）

对照legacy platform/brush-library-service.ts顺序导入和useBrushLibrary.ts最后成功资源激活：提取路径/CPU资源工作函数，后台线程独立COM解码/编码/保存/移动，按批次FIFO保留全部请求；非阻塞poll在批次失败后继续处理后续批次。真实fixture已覆盖部分成功和PNG重开，新增held promise连续100次poll不等待、排队两批不替换、失败后继续成功批次。此前正式Release及笔刷专项exit0、四项底层回归通过2.90秒；队列增量构建验证中。生产入口仍同步调用工作函数，后台发布尚未接入；工程切换后激活规则的用户问题仍待答复，不能称后台导入已完成，也尚未阶段提交推送。整体INCOMPLETE。

增量验证：正式Release构建成功，实际笔刷栏目专项等待exit0，后台partial/PNG重开与FIFO/100次非阻塞poll/失败后下一批通过；来源824/diff通过。仍待工程切换激活规则决定，未接入生产入口、未提交推送，阶段未完成。


### 2026-11-11：后台笔刷导入生产入口接入与验收

完成上述未接入阶段：文件选择/拖放共用FIFO后台解码编码保存移动，UI timer非阻塞poll后发布最后成功CPU资源，部分失败保留成功结果。工程隔离新方案未获决定，因此遵守迁移规则沿用legacy useBrushLibrary.ts完成时活动工程激活；不再以可选新行为阻止原逻辑迁移。绘画/模态事务中暂缓发布，关闭等待全部存储任务完成且不回调UI。正式Release最终构建成功，笔刷栏目专项exit0覆盖生产held future100次poll、切工程、活动笔画不换刷/取消后激活，以及队列部分失败/FIFO/后续成功/PNG重开和既有导入拖放持久化。此前四项底层回归2.90秒通过。来源824/diff检查，未作FPS/人工图像验收。整体INCOMPLETE，用户editor_support.h与未跟踪数据保留，完成阶段提交推送dev。
