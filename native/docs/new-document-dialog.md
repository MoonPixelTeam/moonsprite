# 创建画布弹窗及弹窗间距

2026-10-15 用户布局：标题左侧6px，标题关闭按钮原位；内容左右各6px。新建弹窗标签行10px，标签至组件2px；名称、宽高（含尺寸预设）、颜色模式（含记录开关）、新建预设各部分间6px。整体默认2×，所有数值是1×逻辑像素。

NewDocumentDialog使用原生PopupWindow和现有Entry、Switch、Dropdown。名称默认“未命名作品”，宽高64×64；六个尺寸预设16×16、32×32、64×64、128×128、256×256、320×180。颜色按钮RGBA/索引/灰度与预设按钮相邻重叠一个逻辑像素，共用黑色描边。RGBA初始选中，记录绘画过程初始关闭。四个彩色图标从legacy/assets/pixel-icons对应SVG按原网格无损转换后加入sheet，索引与校验值在sheet-regions.json。

行为证据：legacy/src/renderer/src/components/NewDocumentDialog.tsx（文案、名称验证、尺寸预设、创建/取消、预设覆盖和删除），core/new-document-presets.ts（列表与同名替换），core/file-preferences.ts（默认尺寸列表），locales/zh-CN.ts（简体文案）。未保存作品仍先经过原保存/放弃/取消流程；进入新弹窗后取消不创建或替换作品。创建先构造完整Document，再替换当前作品；尺寸与名称写入实际Document并继承内置色板。

原生适配与缺口：当前Document只支持RGBA和1–1024px，所以索引色、灰度、缩时记录入口明确置灰，尺寸验证使用实际后端上限；没有将近似RGBA保存伪装为其他模式。RGBA默认与关闭记录为用户明确要求。旧版剪贴板尺寸建议尚未接入。预设由浏览器storage改为原生配置目录new-document-presets-v1.txt，带版本、quoted UTF-8名称、RGBA/record字段；通过原子写入保存，文件损坏时保留源文件并禁用保存。该格式与旧浏览器存储不自动互导。

new-document-dialog检查真实窗口、左右padding、共享边框、默认值、尺寸预设、预设保存/重读/删除、非法名称和创建回调，测试存储隔离在new-document-test-owned目录，不写用户配置。截图new-document-dialog.bmp。源码登记于legacy-provenance.json；覆盖检查不表示全部旧版功能已等价迁移。

验收：正式Release构建完成；new-document-dialog、theme-atlas、checkbox-component、switch-component、window-input-hit-testing共5项通过。已查看真实窗口截图核对布局。来源覆盖183文件通过，diff空白检查通过。

## 后续修正：移除输入框上下按钮、收缩临界值及拖动重绘

用户明确撤回所有输入框上下按钮。PixelEntry彻底移除按钮绘制、预留宽度、命中、捕获和长按定时器，动画设置／循环节／帧时长／图像尺寸／新建画布的绑定同步移除；对应旧按钮专属代码与测试移除。保留输入、表达式、键盘方向键、滚轮及原有侧边拖动。

根因：自定义PopupWindow直接Widget::setBounds改变位置，仅布局新区域，没有复用Aseprite Window::moveWindow的旧区域损伤处理；这与之前在编辑器内部绘制的悬浮栏目是不同的窗口路径。新增PixelPopupWindow公共入口，移动前保存drawable region、布局后重绘新窗口，并通知manager重绘旧区域减新区域。来源native/.cache/aseprite/src/ui/window.cpp Window::moveWindow（MIT）；该方法为private，原生自定义布局采用必要小适配，不改缓存依赖。新建、动画设置（含颜色弹窗）、图层快捷操作均使用此入口。后续可移动弹窗必须继承PixelPopupWindow，禁止绕过其几何入口使用Widget::setBounds。

自适应依据旧ModalShell的preferred尺寸和layout minimum分离：新建窗口宽度最小值来自文案、彩色图标、三模式按钮、底部按钮及左右padding；尺寸预设宽度不足自动换行；高度最小值来自当前换行数和错误提示。八边缩放保持相对边锚点；简单编辑弹窗不再统一限制240逻辑像素。底部按钮顺序创建画布、取消；所有尺寸下底部留6px，已有主弹窗和独立设置弹窗的footer也统一6px。

回归：plain-number-entry核对数字／普通输入同素材、原按钮区域点击不改值且方向键仍生效；new-document-dialog通过真实鼠标消息执行连续移动、极限收缩和放大，逐阶段将局部损伤重绘与下一帧完整manager重绘逐像素比较，检查所有子控件、底部padding和临界值。

本轮验收：正式Release构建完成；plain-number-entry、new-document-dialog、skin-resize-render共3项通过。连续6次移动／极限收缩／放大后，逐帧局部与完整重绘像素一致；实际截图已核对无拖影、无输入框上下按钮、创建在左取消在右、footer距底6px。来源覆盖检查通过。
