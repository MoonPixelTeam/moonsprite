# 文字输入跨词移动与删除

## 来源与实际证据

`legacy/src/renderer/src/components/TextAreaInput.tsx` 直接转发浏览器textarea；`TextToolDialog.tsx` 的onSelect/onKeyUp/onPointerUp和onChange读取UTF16选区、同步样式。来源快照核对通过。

`node native/scripts/capture-text-word-navigation.cjs` 使用旧版已安装的Playwright和本机Edge 156.0.4314.50，在内存页面创建同类textarea，发送真实键盘消息，记录前后内容与选区。680条记录写入 `tests/fixtures/text_word_navigation_browser.h`。没有修改legacy、用户作品、剪贴板或浏览器用户配置。该版本是本机行为证据，不声称覆盖所有旧WebView2运行版本。

## 迁移范围

- Ctrl+Left/Right从活动端移动，已有选区不再走普通方向键的收起路径。
- Ctrl+Shift+Left/Right保留原锚点，支持正向与反向选区。
- Ctrl+Backspace/Delete无选区时删除到相应词边界，有选区时仅删除选区，支持本地撤销和重做。
- 空格／制表符、换行／空行、连续标点及字母、中文、Emoji按浏览器结果承接；右移及向后删除包含后续水平空白。
- 使用系统目录的Windows ICU分词接口，解决现有799712字节Skia数据在实测中逐字切开中文的问题；通过UTF16到U32映射保留原样式链路。字母间句点／冒号按浏览器结果拆分，连续标点按操作边界成组，小数、千位分隔符、撇号保留其分词规则。
- 系统分词服务缺失／失败时该次跨词操作保持原位置，不降级成破坏内容的近似删除。普通字素操作沿用Skia，不添加浏览器运行依赖。

## 验证

正式Release构建、`--text-tool-check`（退出码0，680条浏览器对照全部一致）、518文件来源／证据快照检查通过。覆盖中英文、空白、制表、首尾／连续换行、普通／连续标点、下划线、网址、字母间句点／冒号、中点、小数／千分位、撇号、Emoji和重音字符；每个文字偏移发送四种Ctrl操作，另有正反选区及Shift组合。内容变化检查本地撤销和重做，纯导航检查不新增文字历史；既有草稿、样式、字素和可见行检查同次运行。

## 限制

Windows系统ICU版本和浏览器字典版本可能不同，未列语言及复杂词法不声称完全等价。系统ICU服务需要Windows 10 1709或更新版本，运行检查仅当前Windows环境；不新增其它平台分词实现。输入法、双向排版、字素鼠标选区和按词换行仍未完成。此次未修改皮肤、布局、作品格式；没有人工截图验收。
