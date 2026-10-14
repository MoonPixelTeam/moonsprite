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
