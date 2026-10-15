# 复选框组件

2026-10-15 用户提供 codex-clipboard-d0dcfb08-194e-42e9-9e94-f0995c9c6df9.png：顶行仅提取7×7方框，不包含示例文字；第二行58×16悬浮背景与第三行58×16按住背景分别进入sheet。背景采用1px固定边界九宫格，保留按住时的深色描边。完整效果两行是参考，不重复烘焙文本。

Skin::drawCheckbox为唯一素材绘制入口，逻辑像素布局为左侧4px、方框7px、文字从15px起。未勾选使用用户方框，勾选使用legacy PixelUtilityIcon.tsx的checkboxChecked，经已有PNG格式转换后提取7×7并统一到用户方框颜色。素材位置与原图SHA256记录于sheet-regions.json。

PixelCheckbox提供checked/setChecked与bool回调。正常没有背景，悬浮使用checkbox.hover，按住尚未释放使用checkbox.pressed；选中值不决定按住背景。整行点击在释放时提交，移出释放取消，Space切换，Enter不切换，禁用不切换。setChecked不触发回调。

已有PixelButton受控复选框通过bareIconWithCaption及明确的check/checkboxChecked/checkboxUnchecked状态绑定，进入相同绘制入口，不改变各业务回调。覆盖工具属性、导入导出、调整面板、轴心弹窗、动画设置；图层快捷操作列表也共用该入口，保留排序和数量上限。菜单勾选标记与PixelSwitch保持各自语义。

行为来源：legacy/src/renderer/src/components/PixelCheckbox.tsx、PixelUtilityIcon.tsx及styles.css。原生捕获与键盘适配沿用现有PixelButton（Aseprite MIT Button）。checkbox-component验证素材渲染、六状态、释放确认、移出取消、键盘、禁用与旧绑定识别；输出checkbox-states.bmp。

验收：正式Release构建成功；checkbox-component、switch-component、theme-atlas、animation-settings、layer-quick-actions共5项通过；已查看checkbox-states.bmp核对六状态。来源覆盖181文件通过，仓库已登记的其他迁移缺口仍保留。
