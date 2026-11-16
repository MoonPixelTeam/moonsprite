# 画布取色注册与路由迁移（2026-11-16）

本阶段按实际 `legacy/src/renderer/src/core/canvas-color-sampling.ts`、对应测试、`useCanvasColorSampling.ts`、`canvas-sampling-start.ts`、`canvas-pointer-move.ts`、`useCanvasDeviceRouter.ts` 迁移画布来源注册与取色路由，只做功能迁移。

## 已迁移的语义

- 注册来源按先后顺序匹配，支持无手势的原始 RGBA 读取。透明 0 是有效颜色；已注册目标返回空样本仍消费路由，避免错误地读取源画布。源画布本身交给现有本地输入路径。
- 捕获手势记录来源、指针和回调，开始新手势先结束旧手势。跨目标移动切换目标指针，结束时清理源与目标指针；不匹配的 pointer id 不结束手势。删除当前目标保留源手势，删除源终止路由，沿用旧版规则。
- 活动工程的实际吸管工具建立持续取色意图，已注册及后来注册的目标同步取色指针。另一画布上的点击在激活目标工程前更新主／次色；中键和左键导航（播放、Ctrl／Cmd、Space、平移／缩放／旋转工具）仍优先。Ctrl＋右键按旧版继续使用次色。
- 原生主 Editor 注册现有吸管读取器，使用实际当前文档、蒙版／合成／当前图层来源、重复画布映射和越界透明。颜色控件全局拖动复用该注册表，优先原始画布数据。
- 普通吸管、替色采样和颜色编辑器捕获接入跨目标移动。沿用手势次色、最后样本和原来的释放／色板追加规则；镜头仍调用源文档读取器，传入目标颜色和屏幕位置，没有改为自行设计的目标镜头。
- 点击意图承接旧版 sampled／completed 事件：更新共享角色，并通知正在取色的颜色编辑器或替色入口完成。普通意图点击不额外启动捕获或执行释放时切铅笔的偏好。
- 松键、丢失捕获、弹窗完成、工程重新绑定和 Editor 销毁清理路由；身份门禁拒绝旧工程回调。销毁前显式注销，Widget property 与弱指针管理原生适配状态。

## 必要适配与范围

原生 Widget property、Manager 的物理屏幕命中与 viewport contains 替代 HTMLCanvasElement／DOM elementsFromPoint。原生捕获由既有 UI 鼠标所有权管理，适配器使用单指针 token 0，共享路由保留旧版 pointer id 规则。未引入 WebView2、新图标或新界面布局。内部复用许可依据 `legacy/LICENSE` 第 2(b,c)；依赖代码复用限于已有 MIT UI／laf。

**当前生产界面只有一个主 Editor 画布和工程页签。多文档分屏／多画布布局、CanvasReferences 覆盖层及其原始图像采样仍未迁移。** ReferenceImagePanel 是资源库／面板，不是画布参考图覆盖层；桌面像素回退和诊断中的注册测试窗口也不能代替这些功能。工程格式对非空 canvasReferences 的准入仍保留原缺口。后续多画布应接入本注册表，不复制一套取色状态机。

## 验证记录

实际完整旧版 router 经 Node stripTypeScriptTypes／VM 执行，84 组操作与累计状态快照逐项匹配，覆盖注册顺序、意图新增来源、来源排除、空／透明样本、被动读取、目标切换、指针结束、重启、清除意图以及源／目标移除；DOM 夹具同时验证 elementsFromPoint 与单点 fallback。原生通过注入命中来源进行同组对照。

旧版 `canvas-color-sampling.test.ts` 3 项测试通过（2.94 秒）。六项定向 CTest 通过（0.44 秒）：canvas-color-sampling／oracle／contract 与 global-color-sampling／oracle／contract。来源覆盖 1025 文件、证据哈希，Editor 611 源码，架构 611 源码／279 targets 和偏好目录 360 行检查通过。

正式 Release 构建退出 0；唯一程序 `native/build/Release/moonsprite-native.exe` 于 2026-11-16 16:05:28 更新（31,003,136 bytes）。正式 `color-editor-popup` 输入诊断通过（2.81 秒），通过实际 Manager 命中与注册窗口验证被动 RGBA、全局拖动、捕获移动、空样本阻止本地回退、透明 0、释放、主次色隔离、Space／Ctrl 左键导航与 Ctrl 右键次色、颜色编辑器采样完成、丢失捕获、工程重新绑定、工具切换和注销；源工程像素与撤销历史未改变。测试窗口使用 RAII 注销／关闭，回调引用的数据存活到注销后。关联八项吸管／镜头／多工程 CTest 通过（9.36 秒），合计 15 项不同定向 CTest 通过；正式 `--sampling-zoom-check` 退出 0。未执行多显示器、完整人工桌面或 1× 图像验收；本阶段没有布局改动，不把源码和状态机验证描述为图像验收。全仓迁移仍为 INCOMPLETE，生产 indexed 新建／转换／可编辑导入保持关闭；strict 必须继续因已知缺口失败。
