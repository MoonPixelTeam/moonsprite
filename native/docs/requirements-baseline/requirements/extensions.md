# 脚本与扩展语义需求

中文；返回[需求基线](../README.md)。

本页为规范候选，适用公共规则 [CO-001](core.md#co-001) 和[验收协议](../acceptance.md)。证据状态不代表本轮运行测试通过。所有未列出的参数默认值不得由实现者猜测，须进入[参数与冲突台账](../compatibility.md)。

<a id="ex-001"></a>
## EX-001 安装、启停、卸载与贡献

- **目的与前置**：合法扩展包。
- **输入、参数与范围**：包清单、命令、菜单、面板、资源、权限、版本。
- **作用对象**：扩展隔离配置与宿主贡献。
- **成功结果与不变量**：保留 sideload；验证路径/大小/数量/ID；启用只挂载一次、禁用释放；更新失败旧版仍可用。
- **预览、确认、取消与历史**：安装和布局不进入作品历史；扩展文档修改走 CO-001。
- **保存重开**：独立扩展存储；兼容列表标明实际能力。
- **失败与边界**：拒绝穿越、符号链接、未知权限；有权限名不等于实现调用。
- **验收 AC-EX-001**：恶意路径包拒绝；更新失败旧扩展可用；反复启停无重复菜单/事件。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/extensions/README.md](../../../../legacy/docs/extensions/README.md)；[docs/scripting/compatibility-api.md](../../../../legacy/docs/scripting/compatibility-api.md)；[src-tauri/src/platform_scripts/lua_api.rs](../../../../legacy/src-tauri/src/platform_scripts/lua_api.rs)；[src/renderer/src/store/lua-script-service.test.ts](../../../../legacy/src/renderer/src/store/lua-script-service.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ex-002"></a>
## EX-002 Lua 文档事务与 MSE 能力

- **目的与前置**：脚本来源有效，绑定活动文档/层/帧。
- **输入、参数与范围**：Aseprite 风格对象子集、MSE 专属文档/层/帧/调色板/瓦片/切片/样式接口。
- **作用对象**：脚本快照与明确提交目标。
- **成功结果与不变量**：能力发现真实；写入以命令提交；跨文档/过期结果拒绝；当前事务失败回滚，之前已成功事务保留。
- **预览、确认、取消与历史**：一次 app.transaction 一条历史；外部 IO 不伪装可撤销；取消/超时不留半成品。
- **保存重开**：脚本结果正常保存；脚本配置与作品分离。
- **失败与边界**：旧预算 1MiB脚本/64MiB Lua/2秒/2000万指令仅作基线，原生预算需实测；运行错误反馈。
- **验收 AC-EX-002**：事务两步第二步失败恢复第一步；持久回调切文档拒绝；调用只读查询不能偷偷写对象。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/extensions/README.md](../../../../legacy/docs/extensions/README.md)；[docs/scripting/compatibility-api.md](../../../../legacy/docs/scripting/compatibility-api.md)；[src-tauri/src/platform_scripts/lua_api.rs](../../../../legacy/src-tauri/src/platform_scripts/lua_api.rs)；[src/renderer/src/store/lua-script-service.test.ts](../../../../legacy/src/renderer/src/store/lua-script-service.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ex-003"></a>
## EX-003 Lua Dialog 与原生扩展界面

- **目的与前置**：脚本或扩展需要用户输入。
- **输入、参数与范围**：按钮、勾选、颜色、单选、组合框、文字/数字、滑条、修改控件与持久回调。
- **作用对象**：宿主组件和扩展会话。
- **成功结果与不变量**：使用统一像素 UI；回调更新目标快照；界面可见性及动作对应真实结果。
- **预览、确认、取消与历史**：关闭释放回调；作品修改按事务；表单草稿与文档历史分离。
- **保存重开**：设置写扩展隔离存储；布局由软件组件控制。
- **失败与边界**：旧 newrow/repaint/bounds 等限制需明确，不把占位计为已支持；新版不能挂起无反馈。
- **验收 AC-EX-003**：打开对话框、重复修改、取消与关闭；撤销后再次回调取新基线；失效目标不写。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/extensions/README.md](../../../../legacy/docs/extensions/README.md)；[docs/scripting/compatibility-api.md](../../../../legacy/docs/scripting/compatibility-api.md)；[src-tauri/src/platform_scripts/lua_api.rs](../../../../legacy/src-tauri/src/platform_scripts/lua_api.rs)；[src/renderer/src/store/lua-script-service.test.ts](../../../../legacy/src/renderer/src/store/lua-script-service.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ex-004"></a>
## EX-004 Runtime 事件、外部服务与原生迁移

- **目的与前置**：已启用并授权扩展。
- **输入、参数与范围**：命令、动态菜单、工程摘要/帧层查询、撤销重做、颜色、存储、资源、剪贴板、网络、通知、日志、窗口与事件。
- **作用对象**：扩展权限范围和所属窗口。
- **成功结果与不变量**：承接现有实际 Runtime 能力；HTML 设置/常驻/附属窗口改为原生 UI 与受控执行；命令派发不等于业务完成。
- **预览、确认、取消与历史**：退出/禁用取消订阅与任务；文档写入仍统一撤销；外部 IO 不可撤销需明确。
- **保存重开**：存储按扩展 ID 隔离；主题不携带行为代码。
- **失败与边界**：资源/网络/窗口权限分别验证；未知方法显式错误；不为兼容引入隐藏 WebView2。
- **验收 AC-EX-004**：双扩展隔离读写；撤销事件载荷正确；禁用关闭所属窗口；HTML 例子逐个迁移验收。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：文档提取；领域实现和测试入口已定位，逐项分支与参数仍需核验。
- **证据与复核入口**：[docs/extensions/README.md](../../../../legacy/docs/extensions/README.md)；[docs/scripting/compatibility-api.md](../../../../legacy/docs/scripting/compatibility-api.md)；[src-tauri/src/platform_scripts/lua_api.rs](../../../../legacy/src-tauri/src/platform_scripts/lua_api.rs)；[src/renderer/src/store/lua-script-service.test.ts](../../../../legacy/src/renderer/src/store/lua-script-service.test.ts)。领域级定位不等于该测试覆盖本条全部内容。

<a id="ex-005"></a>
## EX-005 兼容子集与占位清理

- **目的与前置**：明确选定脚本/扩展兼容目标。
- **输入、参数与范围**：Aseprite 风格 API、MoonSprite 专属 API、现有包。
- **作用对象**：版本化公开接口和兼容台账。
- **成功结果与不变量**：每项记录参数、返回、读写、事件顺序和错误；当前 Lua refresh/Undo/Redo 无操作不能算真实能力；Runtime document.undo 与其区别记录。
- **预览、确认、取消与历史**：真正可写接口必须事务化；不支持不能返回虚假成功。
- **保存重开**：接口版本独立于应用版本；旧包可迁移但不承诺全部直接运行。
- **失败与边界**：未固定对标版本或未验证的方法不得标兼容。
- **验收 AC-EX-005**：同脚本在旧版/原生版对照结果；支持、有限、拒绝三类有可运行样例。再按验收协议检查适用的取消、失败、撤销、重做和保存重开维度。
- **新版承接**：保留功能语义；命令和原生 UI 入口重新设计；不沿用旧模块作为架构边界。
- **证据状态**：已核对关键源码分支／现有断言；完整场景运行未验证。
- **证据与复核入口**：[docs/extensions/README.md](../../../../legacy/docs/extensions/README.md)；[docs/scripting/compatibility-api.md](../../../../legacy/docs/scripting/compatibility-api.md)；[src-tauri/src/platform_scripts/lua_api.rs](../../../../legacy/src-tauri/src/platform_scripts/lua_api.rs)；[src/renderer/src/store/lua-script-service.test.ts](../../../../legacy/src/renderer/src/store/lua-script-service.test.ts)。领域级定位不等于该测试覆盖本条全部内容。


### EX-004 的源码补充：语言与文件拖放

本节属于 EX-004，不新增同名需求ID。来源：[运行时注册表](../../../../legacy/src/renderer/src/core/extension-runtime.ts)、[拖放规则](../../../../legacy/src/renderer/src/core/extension-file-drop.ts)、[已有断言](../../../../legacy/src/renderer/src/core/extension-file-drop.test.ts)。只读审查核对，未运行。

- runtime.getLocale 返回当前 locale，权限 runtime；locale-changed 在激活前发送当前语言，切语言再发，其他偏好变化不重复发送。
- runtime.setFileDropTypes 接收 extensions，权限 io；最多16个后缀，点号加1–16位ASCII字母/数字，不区分大小写。
- files-dropped 只交付用户拖入的 name/bytes，不授予路径访问权；每文件12MiB。未匹配工程/图片继续正常打开，匹配后读取失败只报错，不再次作为工程打开。
- 读取中禁用或卸载扩展不得继续投递；EX-006 验收补 .mspet 与工程混合拖入、禁用中断和格式错误保留旧宠物。

<a id="ex-006"></a>
## EX-006 宠物伴侣与宠物包

- **目的与前置**：内置或已启用宠物扩展。
- **输入、参数与范围**：mspet 导入导出、自建宠物、名称、缩放镜像、条件动画、逐帧时长、重复播放和提醒。
- **作用对象**：扩展宠物业务与用户素材。
- **成功结果与不变量**：导入建立独立宠物不覆盖已有；条件按状态进入/退出、冷却和优先级执行；退出持续条件停止循环。
- **预览、确认、取消与历史**：配置/导入不进入作品历史；失败不替换旧元数据，释放本次失败素材。
- **保存重开**：素材与配置隔离；更新保留自建宠物、启停、位置和偏好；主动卸载不自动恢复。
- **失败与边界**：现行包12MiB、PNG data URL8MiB、每动画120帧/宠物240帧、1600万总像素；新版能力必须承接并核验。
- **验收 AC-EX-006**：导入同一包两次生成独立宠物；动画帧时长/循环保留；超限包拒绝；旧HTML界面迁为原生后重测所有条件。
- **新版承接**：保留现有功能，原生界面重新设计，不照搬旧布局。
- **证据状态**：已核对文档及关键测试/实现定位；未执行运行验收。
- **证据与复核入口**：[legacy/docs/extensions/pet-companion-package.md](../../../../legacy/docs/extensions/pet-companion-package.md)；[legacy/scripts/export-pet-package.mjs](../../../../legacy/scripts/export-pet-package.mjs)。
